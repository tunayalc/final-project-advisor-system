# Ücretsiz yayın

Canlı ön yüz: https://tunayalc.github.io/final-project-advisor-system/

Sunucu: https://final-project-advisor-system.onrender.com — sağlık: `/api/health`.

Ön yüz değişiklikleri `main` dalına gönderildiğinde GitHub Pages iş akışı otomatik çalışır. Render açık depo bağlantısıyla kurulduğundan backend değişikliklerini yayınlamak için Render panelinden **Manual Deploy → Deploy latest commit** seçilir.

Uygulama Render Free üzerinde, kalıcı veriler Supabase Free PostgreSQL üzerinde çalışır. GitHub Pages kullanılacaksa ön yüz `VITE_HASH_ROUTER=true` ve `VITE_API_BASE_URL=https://SUNUCU.onrender.com/api` ile derlenir.

Render yapılandırması: public Git repository, `main` dalı, Docker, Frankfurt, Free ($0). Disk eklenmez. Sağlık kontrolü `/api/health` olmalıdır.

Yalnızca sunucuda tutulan ortam değişkenleri:

- `DATABASE_URL`: Supabase Connect → Session pooler URI (5432).
- `JWT_SECRET`: rastgele, en az 32 karakter.
- `ADMIN_EMAIL`: ilk yönetici hesabı.
- `ADMIN_PASSWORD`: ilk kurulumda en az 12 karakterli güçlü parola.
- `NODE_ENV=production`.

Uygulama `advisor` şemasını ve gerçek hoca listesini ilk açılışta oluşturur. Supabase Data API kullanılmaz. Tarayıcıya veritabanı parolası veya Supabase yönetici anahtarı verilmez. PostgreSQL TLS bağlantısı Supabase CA sertifikasıyla doğrulanır; sertifikanın resmi kaynağı: https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

`DATABASE_URL` yoksa yerel SQLite kullanılır. Yerel geliştirmede `.env` ve veritabanı Git'e eklenmez. Canlı PostgreSQL ve yerel SQLite birbirinden bağımsızdır; yerel öğrenci belgeleri otomatik taşınmaz.

Ücretsiz plan sınırları: Render boşta kalınca uyuyabilir; ilk API isteği gecikebilir. Supabase düşük kullanımda projeyi duraklatabilir; panelden yeniden başlatmak gerekebilir. Otomatik yedekleme garantisi yoktur. Resmi bilgiler: https://render.com/docs/free ve https://supabase.com/pricing

Yeni öğrenciler yalnızca transkript metnindeki ad, GANO, üniversite ve bölüm eşleşince otomatik onaylanır. Bu eşleşme resmi belge/barcode doğrulaması veya e-posta sahipliği doğrulaması değildir.
