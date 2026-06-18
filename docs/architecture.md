# Mimari ve Akis Dokumani

## Genel Bakis

Danisman Atama Sistemi, ogrencilerin kendi hesaplarini transkript PDF yukleyerek actigi,
adminin bu basvurulari onayladigi ve danisman atamalarinin puanli merkezi motorla
yapildigi bir web uygulamasidir. Sistem tek bolum mantigiyla calisir:
`Yapay Zeka ve Veri Muhendisligi`.

Atama motoru artik yalnizca GANO sirasi ile ilerlemez. Ogrencinin akademik basarisi ve
tercih sirasi birlikte kullanilir:

- `GANO_puani = (gano / 4) * 100`
- `tercih_puani`: ilk tercih `100`, son tercih `0`, aradaki tercihler dogrusal dagilir
- `toplam_puan = GANO_puani * 0.80 + tercih_puani * 0.20`

Dogrudan danisman teklifi kabul edilirse ogrenci merkezi yerlestirme sirasindan cikar.

## Temel Is Kurallari

- Public kayit endpointi yalnizca ogrenci olusturur; `role` alani kabul edilmez.
- Ogrenci kaydi `multipart/form-data` ile yapilir ve transkript PDF bellekte okunur.
- PDF metninde `GANO` veya `GABNO` etiketi aranir; bulunan deger `0-4` araliginda olmalidir.
- Transkriptte okunabilen ad soyad, formdaki ad soyad ile normalize edilerek karsilastirilir.
  Uyusmazlik varsa kayit reddedilmez; admin onay ekraninda uyari olarak gosterilir.
- Yeni ogrenciler `pending` durumunda baslar.
- Pending ogrenci giris yapabilir fakat danisman listesini goremez, tercih yapamaz, teklif yanitlayamaz
  ve merkezi atamaya dahil edilmez.
- Rejected ogrenci giris yapabilir fakat tercih/teklif/atama akislarina dahil edilmez.
- Approved ogrenci kendi bolumundeki aktif danismanlari gorur ve tercih listesi olusturabilir.
- Atanmis ogrenci tercih listesini degistiremez.
- Admin panelinden ogrenci olusturulmaz; admin yalnizca danisman olusturur ve ogrenci
  basvurularini onaylar, reddeder veya bilgilerini duzenler.
- Danismanlar yalnizca kendi bolumlerindeki onayli ve atanmamis ogrencileri gorebilir.
- Pasif danisman yeni teklif gonderemez ve merkezi atama havuzuna girmez.
- Manuel atama yalnizca onayli ogrencilere ve ayni bolumdeki aktif danismanlara yapilir.
- Merkezi atama, puanli aday kuyrugunu su sirayla siralar:
  toplam puan, GANO, tercih sirasi, ogrenci ID, danisman ID.
- Tercihlerle atanamayan onayli ogrenci varsa sistem ayni bolumde bos kontenjani olan aktif
  danismana fallback atama yapabilir.
- Atama loglarinda puan, GANO katkisi, tercih katkisi ve tercih sirasi saklanir.

## ER Diyagrami

```mermaid
erDiagram
    departments ||--o{ students : "barindirir"
    departments ||--o{ faculty : "barindirir"
    users ||--|| students : "ogrenci profili"
    users ||--|| faculty : "danisman profili"
    students ||--o{ preferences : "tercih verir"
    faculty ||--o{ preferences : "tercih listesinde yer alir"
    students ||--o{ pre_assignments : "teklif alir"
    faculty ||--o{ pre_assignments : "teklif gonderir"
    students ||--o{ assignment_logs : "loglanir"
    faculty ||--o{ assignment_logs : "loglanir"

    users {
        int id PK
        string email
        string password_hash
        string role
        string full_name
        datetime created_at
    }

    students {
        int id PK
        int user_id FK
        float gano
        int department_id FK
        int entry_year
        int is_assigned
        int assigned_faculty_id FK
        string approval_status
        string transcript_full_name
        string transcript_warning
    }

    faculty {
        int id PK
        int user_id FK
        int department_id FK
        string expertise_keywords
        int is_active
        int base_quota
        int current_quota
    }

    preferences {
        int id PK
        int student_id FK
        int faculty_id FK
        int rank
        datetime created_at
    }

    pre_assignments {
        int id PK
        int student_id FK
        int faculty_id FK
        string status
        datetime created_at
    }

    assignment_logs {
        int id PK
        int student_id FK
        int faculty_id FK
        string action
        string details
        datetime timestamp
    }

    departments {
        int id PK
        string name
    }
```

## Sequence Diyagrami: Ogrenci Kaydi

```mermaid
sequenceDiagram
    participant O as Ogrenci
    participant F as Frontend
    participant B as Backend
    participant PDF as PDF Parser
    participant DB as SQLite

    O->>F: Ad soyad, e-posta, sifre, giris yili ve transkript PDF girer
    F->>B: POST /api/auth/register multipart/form-data
    B->>PDF: PDF metninden GANO/GABNO ve ad soyad oku
    PDF-->>B: GANO ve transkript adi
    B->>DB: users ve students kaydi olustur (approval_status=pending)
    B->>DB: STUDENT_REGISTER logu yaz
    B-->>F: JWT + pending ogrenci profili
    F-->>O: Admin onayi bekleniyor ekrani
```

## Sequence Diyagrami: Admin Ogrenci Onayi

```mermaid
sequenceDiagram
    participant A as Admin
    participant F as Frontend
    participant B as Backend
    participant DB as SQLite

    A->>F: Onay bekleyen kaydi inceler
    F->>B: GET /api/admin/student-applications
    B->>DB: pending ogrencileri ve transkript uyarisini getir
    DB-->>B: Basvuru listesi
    B-->>F: Pending kayitlar
    A->>F: Bilgileri duzenler ve onaylar veya reddeder
    F->>B: PATCH /api/admin/students/:studentId/review
    B->>DB: users/students kaydini guncelle
    B->>DB: ADMIN_REVIEW_STUDENT logu yaz
    B-->>F: Guncelleme sonucu
```

## Sequence Diyagrami: Ogrenci Tercih Kaydi

```mermaid
sequenceDiagram
    participant O as Ogrenci
    participant F as Frontend
    participant B as Backend
    participant DB as SQLite

    O->>F: Tercih listesini duzenler
    F->>B: POST /api/students/preferences
    B->>DB: Ogrenci onayli mi ve atanmamis mi kontrol et
    B->>DB: Danismanlar aktif ve ayni bolumde mi kontrol et
    B->>DB: Eski tercihleri sil
    B->>DB: Yeni tercihleri sirali olarak yaz
    B->>DB: UPDATE_PREFERENCES logu yaz
    B-->>F: Basarili yanit
    F-->>O: Tercih listesini guncel goster
```

## Sequence Diyagrami: Puanli Merkezi Atama

```mermaid
sequenceDiagram
    participant A as Admin
    participant B as Backend
    participant E as Atama Motoru
    participant DB as SQLite

    A->>B: POST /api/admin/calculate-quotas
    B->>E: Onayli ve atanmamis ogrenciler icin kontenjan hesapla
    E->>DB: Aktif danismanlarin base_quota degerlerini guncelle
    B-->>A: Kontenjan sonucu
    A->>B: POST /api/admin/run-assignment
    B->>E: Puanli aday kuyrugunu calistir
    E->>DB: Approved ogrenci + ayni bolum aktif danisman + tercih kayitlarini oku
    E->>E: %80 GANO + %20 tercih sirasi puani hesapla
    E->>DB: Uygun kontenjana atama yap
    E->>DB: SCORE_ASSIGN logu yaz
    B-->>A: Atama istatistikleri
```

## Sequence Diyagrami: Danisman Dogrudan Teklif Akisi

```mermaid
sequenceDiagram
    participant D as Danisman
    participant F as Frontend
    participant B as Backend
    participant DB as SQLite
    participant O as Ogrenci

    D->>F: Minimum GANO ile ogrenci arar
    F->>B: GET /api/faculty/students
    B->>DB: Ayni bolumdeki approved ve atanmamis ogrencileri getir
    B-->>F: Uygun ogrenciler
    D->>F: Ogrenci icin teklif gonderir
    F->>B: POST /api/faculty/invite
    B->>DB: Danisman aktif mi, kota uygun mu, ogrenci approved mu kontrol et
    B->>DB: pre_assignments kaydi olustur
    B-->>F: Teklif olusturuldu
    O->>F: Teklifi kabul eder
    F->>B: POST /api/students/invitations/:id/respond
    B->>DB: Ogrenciyi ilgili danismana ata
    B->>DB: current_quota guncelle
    B->>DB: Diger bekleyen teklifleri kapat
    B-->>F: Atama kesinlesti
```

## Operasyonel Notlar

- Veritabani uygulama acilisinda `schema.sql` ve `seed.sql` ile temiz ortamda olusturulabilir.
- Seed verisi admin ve danismanlardan olusur; demo ogrenci hesabi bulunmaz.
- Tek bolum kaydi seed icinde `Yapay Zeka ve Veri Muhendisligi` olarak tutulur.
- Gercek transkript dosyalari sistemde saklanmaz; PDF metni kayit sirasinda bellekte islenir.
- OCR veya fotograf tabanli transkript destegi bu surumun kapsami disindadir.
- Kullanici silme isleminde bagli tercih, teklif, atama ve log verileri kontrollu sekilde temizlenir.
