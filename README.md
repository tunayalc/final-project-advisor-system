# Final Project Advisor System

React, Node.js ve SQLite ile geliştirilmiş çok bölümlü danışman atama sistemi. Öğrenciler bölüm seçerek transkript PDF yükler, admin öğrenci kayıtlarını onaylar ve merkezi atama `%80 GANO + %20 tercih sırası` puanıyla yapılır.

## Özellikler

- Öğrenci self-register akışı: ad soyad, e-posta, şifre, bölüm, giriş yılı ve transkript PDF.
- PDF transkriptten metin tabanlı `GANO`/`GABNO` okuma.
- Admin onayı bekleyen öğrenci durumu.
- Admin panelinde bölüm ekleme, danışman ekleme, öğrenci başvurusu onaylama/reddetme/düzenleme.
- Çok bölüm modeli: `Yapay Zeka ve Veri Mühendisliği` ve `Bilgisayar Mühendisliği`.
- Danışman ve öğrenci listelerinde bölüm izolasyonu; bölüm dışı tercih, teklif ve atama yapılmaz.
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

1. Öğrenci `Öğrenci Kaydı` sekmesinden bölüm seçerek kayıt oluşturur.
2. Sistem PDF metninde `GANO` veya Ankara Üniversitesi transkriptlerinde kullanılan `GABNO` alanını okur.
3. Öğrenci hesabı `admin onayı bekliyor` durumunda açılır.
4. Admin kaydı onaylayana kadar öğrenci hoca listesi göremez ve tercih kaydedemez.
5. Admin onayından sonra öğrenci yalnız kendi bölümündeki aktif danışmanları sıralı tercih listesine ekler.

## Admin Akışı

- Danışman ekler ve danışmanları aktif/pasif yapar.
- Yeni bölüm açar; yeni öğrenciler ve danışmanlar bu bölüm listesi üzerinden bağlanır.
- Öğrenci başvurularında ad soyad, e-posta, GANO ve giriş yılını düzenleyebilir.
- Başvuruyu onaylar veya reddeder.
- Kontenjanları hesaplar ve merkezi yerleştirmeyi çalıştırır.
- Atama loglarında puan detaylarını izler.

## Atama Test Case Datasetleri

Hocanın istediği algoritma senaryoları `docs/assignment_cases/` altında CSV olarak kayıtlıdır. Her case aynı dosya yapısını kullanır: `departments.csv`, `faculty.csv`, `students.csv`, `preferences.csv`, `expected_summary.csv`.

Ana setler:

- `01_popular_two_advisors`: iki hocanın çok yoğun talep gördüğü 22 öğrencilik YZVM senaryosu.
- `02_happy_path_equal`: 40 öğrencinin 4 hocaya eşit dağıldığı happy path.
- `03_yzvm_40_realistic`: YZVM için 40 kontenjanlı dengesiz tercih senaryosu.
- `04_computer_engineering_110`: Bilgisayar Mühendisliği için 110 öğrenci / 10 hoca senaryosu.
- `05_capacity_*`: 100, 500, 1000 ve 5000 öğrenci kapasiteli benchmark setleri.

Ek edge-case setleri pending/rejected öğrenciler, pasif hoca, fallback, tie-break ve çok bölüm izolasyonunu ölçer.

## Veritabanı Notu

SQLite dosyaları repo dışında tutulur. Uygulama ilk açılışta `backend/db/schema.sql` ve `backend/db/seed.sql` üzerinden veritabanını oluşturur.

## Doğrulama

```bash
node --check backend/routes/auth.js backend/routes/admin.js backend/routes/students.js backend/routes/faculty.js backend/engine/assignment.js backend/db/database.js
node --check docs/assignment_case_runner.cjs docs/generate_assignment_cases.cjs
node docs/assignment_case_runner.cjs --all
cd frontend && npm run lint && npm run build
```
