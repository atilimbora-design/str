const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
// Resim dosyalarına erişim için statik klasör
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Dosya Yükleme Ayarları (Multer)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = 'uploads/';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        // Dosya ismini benzersiz yap: tarih-orjinalisim
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Veritabanı Bağlantısı
// Coolify PostgreSQL bağlantı dizesini environment variable olarak verecek
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Test Endpoint
app.get('/', (req, res) => {
    res.json({ status: 'OK', message: 'Satış Raporu API Çalışıyor v1.0' });
});

// Veritabanı Başlatma (Tabloları kontrol et)
app.get('/init-db', async (req, res) => {
    try {
        const schema = fs.readFileSync('./init.sql').toString();
        await pool.query(schema);
        res.json({ message: 'Veritabanı tabloları hazır!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// --- RAPORLAMA API UÇLARI (Taslak) ---

// Rapor Gönder
app.post('/api/reports', upload.array('receipts', 5), async (req, res) => {
    // Mobil'den gelen JSON verisi 'data' field'ı içinde string olarak gelir (Multipart request olduğu için)
    // Veya field field ayrıştırılmış olabilir. Basitlik için field field alalım.

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const {
            user_id, report_date, plate, km_start, km_end,
            cost_fuel, cost_toll, cost_other, cost_description,
            collection_cash, collection_cc, collection_check, collection_eft,
            cash_delivered, notes
        } = req.body;

        // 1. Raporu Kaydet
        const reportQuery = `
            INSERT INTO reports (
                user_id, report_date, plate, km_start, km_end,
                cost_fuel, cost_toll, cost_other, cost_description,
                collection_cash, collection_cc, collection_check, collection_eft,
                cash_delivered, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING id;
        `;

        const reportValues = [
            user_id, report_date, plate, km_start, km_end,
            parseFloat(cost_fuel || 0), parseFloat(cost_toll || 0), parseFloat(cost_other || 0), cost_description,
            parseFloat(collection_cash || 0), parseFloat(collection_cc || 0), parseFloat(collection_check || 0), parseFloat(collection_eft || 0),
            parseFloat(cash_delivered || 0), notes
        ];

        const reportResult = await client.query(reportQuery, reportValues);
        const reportId = reportResult.rows[0].id;

        // 2. Resimleri Kaydet
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                // Burada dosya tipini formdan da alabiliriz ama şimdilik generic kaydedelim
                await client.query(
                    'INSERT INTO receipt_images (report_id, image_path, image_type) VALUES ($1, $2, $3)',
                    [reportId, file.filename, 'general']
                );
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ success: true, reportId: reportId, message: 'Rapor başarıyla kaydedildi.' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ success: false, error: 'Sunucu hatası: ' + err.message });
    } finally {
        client.release();
    }
});

// Veritabanı SIFIRLAMA ve BAŞLATMA (DİKKAT: Veriler Silinir!)
app.get('/reset-db', async (req, res) => {
    try {
        // Önce tabloları sil (Temiz Kurulum)
        await pool.query('DROP TABLE IF EXISTS receipt_images CASCADE'); // Önce receipt_images silinmeli
        await pool.query('DROP TABLE IF EXISTS reports CASCADE');
        await pool.query('DROP TABLE IF EXISTS users CASCADE');

        // Users Tablosu
        await pool.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL,
        full_name VARCHAR(100),
        is_admin BOOLEAN DEFAULT FALSE
      );
    `);

        // Reports Tablosu
        await pool.query(`
      CREATE TABLE reports (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        report_date DATE DEFAULT CURRENT_DATE,
        plate VARCHAR(20),
        km_start INTEGER,
        km_end INTEGER,
        cost_fuel DECIMAL(10,2),
        cost_toll DECIMAL(10,2),
        cost_other DECIMAL(10,2),
        cost_description TEXT,
        collection_cash DECIMAL(10,2),
        collection_cc DECIMAL(10,2),
        collection_check DECIMAL(10,2),
        collection_eft DECIMAL(10,2),
        cash_delivered DECIMAL(10,2),
        notes TEXT
      );
    `);

        // Receipt Images Tablosu
        await pool.query(`
        CREATE TABLE receipt_images (
            id SERIAL PRIMARY KEY,
            report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
            image_path VARCHAR(255) NOT NULL,
            image_type VARCHAR(50),
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

        // 1. Admin Kullanıcısı
        await pool.query("INSERT INTO users (username, password, full_name, is_admin) VALUES ('admin', '123456', 'Sistem Yöneticisi', TRUE)");

        // 2. Özel İstek Kullanıcısı (16 - Hüseyin Akgüneş)
        await pool.query("INSERT INTO users (username, password, full_name, is_admin) VALUES ('16', '123456', 'Hüseyin Akgüneş', FALSE)");

        res.json({ message: "Veritabanı SIFIRLANDI! Admin ve Hüseyin kullanıcısı eklendi." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Giriş Yap
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            // NOT: Gerçek projede şifreler bcrypt ile kontrol edilmeli!
            if (user.password === password) {
                res.json({ success: true, user: { id: user.id, full_name: user.full_name, is_admin: user.is_admin } });
            } else {
                res.status(401).json({ success: false, message: 'Hatalı şifre' });
            }
        } else {
            res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ADMIN API ---

// 1. Tüm Raporları Getir (Admin için)
app.get('/api/reports', async (req, res) => {
    try {
        // Tarihe göre yeni olandan eskiye doğru
        const result = await pool.query('SELECT r.*, u.full_name FROM reports r LEFT JOIN users u ON r.user_id = u.id ORDER BY r.report_date DESC, r.id DESC');
        res.json(result.rows);
    } catch (err) {
        console.error("GET reports error:", err); // Daha detaylı log
        res.status(500).json({ error: 'Veritabanı hatası: ' + err.message });
    }
});

// 2. Tüm Kullanıcıları Getir
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, full_name, is_admin FROM users ORDER BY id');
        res.json(result.rows);
    } catch (err) {
        console.error("GET users error:", err); // Daha detaylı log
        res.status(500).json({ error: 'Veritabanı hatası: ' + err.message });
    }
});

// 3. Yeni Kullanıcı Ekle
app.post('/api/register', async (req, res) => {
    const { username, password, full_name, is_admin } = req.body;

    if (!username || !password || !full_name) {
        return res.status(400).json({ error: 'Eksik bilgi' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO users (username, password, full_name, is_admin) VALUES ($1, $2, $3, $4) RETURNING id, username',
            [username, password, full_name, is_admin || false]
        );
        res.json({ message: 'Kullanıcı oluşturuldu', user: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Kayıt başarısız (Kullanıcı adı alınmış olabilir)' });
    }
});

// Sunucuyu Başlat
const PORT = process.env.PORT || 3005;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sunucu çalışıyor: http://0.0.0.0:${PORT}`);
});
