# Final Project Advisor System

React, Node.js ve SQLite ile geliştirilmiş danışman atama sistemi. Öğrenciler transkript PDF yükleyerek kendi hesaplarını oluşturur, admin öğrenci kayıtlarını onaylar ve merkezi atama `%80 GANO + %20 tercih sırası` puanıyla yapılır.

## Özellikler

- Öğrenci self-register akışı: ad soyad, e-posta, şifre, giriş yılı ve transkript PDF.
- PDF transkriptten metin tabanlı `GANO`/`GABNO` okuma.
- Admin onayı bekleyen öğrenci durumu.
- Admin panelinde danışman ekleme, öğrenci başvurusu onaylama/reddetme/düzenleme.
- Tek bölüm modeli: `Yapay Zeka ve Veri Mühendisliği`.
- Danışman ve öğrenci listelerinde bölüm izolasyonu.
- Merkezi atamada açıklanabilir puanlama:
  - `GANO_puanı = (gano / 4) * 100`
  - `tercih_puanı`: ilk tercih `100`, son tercih `0`
  - `toplam_puan = GANO_puanı * 0.80 + tercih_puanı * 0.20`
- Admin işlem günlüğünde puan katkıları ve tercih sırası detayı.

## Teknoloji

- Frontend: React 19, Vite, React Router, Axios, Lucide React
- Backend: Node.js, Express 5, JWT, bcryptjs, multer, pdf-parse
- Veritabanı: SQLite + better-sqlite3

## Kurulum

Backend:

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Frontend:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Uygulama adresleri:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000/api`

## Demo Hesapları

İlk çalıştırmada veritabanı boşsa seed verisi yüklenir.

| Rol | E-posta | Şifre |
| --- | --- | --- |
| Admin | `admin@ankara.edu.tr` | `admin123` |
| Danışman | `ahmet.yilmaz@ankara.edu.tr` | `hoca123` |

Başlangıçta öğrenci yoktur. Öğrenciler giriş ekranındaki `Öğrenci Kaydı` sekmesinden transkript PDF yükleyerek kayıt olur.

## Öğrenci Akışı

1. Öğrenci `Öğrenci Kaydı` sekmesinden kayıt oluşturur.
2. Sistem PDF metninde `GANO` veya Ankara Üniversitesi transkriptlerinde kullanılan `GABNO` alanını okur.
3. Öğrenci hesabı `admin onayı bekliyor` durumunda açılır.
4. Admin kaydı onaylayana kadar öğrenci hoca listesi göremez ve tercih kaydedemez.
5. Admin onayından sonra öğrenci aktif danışmanları sıralı tercih listesine ekler.

## Admin Akışı

- Danışman ekler ve danışmanları aktif/pasif yapar.
- Öğrenci başvurularında ad soyad, e-posta, GANO ve giriş yılını düzenleyebilir.
- Başvuruyu onaylar veya reddeder.
- Kontenjanları hesaplar ve merkezi yerleştirmeyi çalıştırır.
- Atama loglarında puan detaylarını izler.

## Veritabanı Notu

SQLite dosyaları repo dışında tutulur. Uygulama ilk açılışta `backend/db/schema.sql` ve `backend/db/seed.sql` üzerinden veritabanını oluşturur.

## Doğrulama

```bash
node --check backend/routes/auth.js backend/routes/admin.js backend/routes/students.js backend/routes/faculty.js backend/engine/assignment.js backend/db/database.js
cd frontend && npm run lint && npm run build
```
