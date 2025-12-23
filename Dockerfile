FROM node:18-alpine

# Çalışma dizinini oluştur
WORKDIR /app

# Paket dosyalarını kopyala
COPY package*.json ./

# Bağımlılıkları yükle
RUN npm install --production

# Üretim ortamında nodemon yerine node kullanacağız ama geliştirme için kalsın
# Tüm kaynak kodunu kopyala
COPY . .

# Dosya yükleme klasörünü oluştur
RUN mkdir -p uploads

# Uygulama portu
EXPOSE 3000

# Başlatma komutu
CMD ["npm", "start"]
