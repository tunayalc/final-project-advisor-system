# Canlı kurulum

Uygulama tek Node.js servisi olarak çalışır: Express `/api` adresini ve derlenmiş React arayüzünü birlikte sunar. Node.js 24 kullanın.

## Docker ile sunucu

1. Depoyu sunucuya klonlayın.
2. `node backend/scripts/setup-local.js` ile yeni sunucuya özel anahtar ve yönetici şifresi oluşturun. Oluşan `backend/.env` dosyasını Git'e eklemeyin. İlk yönetici bilgileri burada bulunur.
3. `docker compose up -d --build` çalıştırın.
4. Nginx veya Caddy üzerinden HTTPS alan adını `127.0.0.1:3000` adresine yönlendirin. PDF yüklemeleri için proxy istek sınırını en az 6 MB yapın.
5. `/api/health`, giriş ekranı ve öğrenci kaydını doğrulayın.

`advisor-data` isimli Docker volume öğrenci hesaplarını ve tercihleri kalıcı tutar. `docker compose down -v` verileri siler; normal güncellemelerde bu komutu kullanmayın. Düzenli SQLite yedeği alın. Mevcut yerel veritabanı veya öğrenci belgeleri imaja dahil edilmez.

## Docker olmadan Node.js barındırma

- Build: `npm ci --prefix backend && npm ci --prefix frontend && npm run build --prefix frontend`
- Start: `node backend/server.js`
- Ortam: `NODE_ENV=production`, `VITE_API_BASE_URL=/api`, `JWT_SECRET` (rastgele en az 32 karakter), `ADMIN_EMAIL`, `ADMIN_PASSWORD` (en az 12 karakter), `DB_PATH` (kalıcı diskte mutlak dosya yolu).
- Sağlık kontrolü: `/api/health`.
- Tek servis örneği kullanın; SQLite dosyası geçici çalışma dizinine konulmamalıdır.

GitHub Pages yalnızca statik dosya barındırır; bu uygulamanın Node.js API'si ve kalıcı veritabanı için bir sunucu gerekir.

Hoca şifrelerini `backend/scripts/set-password.js` ile ayrı ayrı tanımlayın. Transkript kontrolü PDF metnindeki alanları karşılaştırır; barkod/dijital imza veya e-posta sahipliği doğrulaması yapmaz.
