-- Kullanıcılar Tablosu
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) DEFAULT 'personel', -- 'admin' veya 'personel'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Raporlar Tablosu
CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    report_date DATE NOT NULL,
    
    -- Araç Bilgileri
    plate VARCHAR(20),
    km_start INTEGER,
    km_end INTEGER,
    
    -- Giderler
    cost_fuel DECIMAL(10, 2) DEFAULT 0, -- Mazot UTTS
    cost_toll DECIMAL(10, 2) DEFAULT 0, -- Otoban
    cost_other DECIMAL(10, 2) DEFAULT 0, -- Diğer Bakım/Servis
    cost_description TEXT,              -- Diğer Açıklama
    
    -- Tahsilatlar
    collection_cash DECIMAL(10, 2) DEFAULT 0,
    collection_cc DECIMAL(10, 2) DEFAULT 0,
    collection_check DECIMAL(10, 2) DEFAULT 0,
    collection_eft DECIMAL(10, 2) DEFAULT 0,
    
    -- Kasa
    cash_delivered DECIMAL(10, 2) DEFAULT 0, -- Teslim Edilen Nakit
    notes TEXT, -- Eksik/Fazla Açıklama
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Fiş/Resim Dosyaları Tablosu
CREATE TABLE IF NOT EXISTS receipt_images (
    id SERIAL PRIMARY KEY,
    report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
    image_path VARCHAR(255) NOT NULL,
    image_type VARCHAR(50), -- 'fuel', 'service', 'other' vb.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Varsayılan Admin Kullanıcısı (Şifre: 123456 - Gerçekte hashlenmeli)
-- Bu sadece ilk kurulumda örnek olsun diye.
INSERT INTO users (username, password, full_name, role) 
VALUES ('admin', '123456', 'Sistem Yöneticisi', 'admin')
ON CONFLICT (username) DO NOTHING;
