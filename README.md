# Final Project Advisor System

React, Node.js ve SQLite ile danışman atama sistemi. Öğrenciler kendi hesaplarını açar, PDF transkriptlerinden GANO/GABNO okunur ve transkriptteki dört bilgi eşleştiğinde otomatik onaylanarak danışman tercihi yapar.

## Yerel kurulum

Node.js 22.16+ veya 24 kullanın. `backend` ve `frontend` klasörlerinde `npm ci` çalıştırın, ardından proje kökünde:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./start-dev.ps1
```

- Uygulama: http://localhost:5173
- API: http://localhost:3000/api
- İlk yerel kurulum, `backend/.env` dosyasına rastgele JWT anahtarı ve yönetici şifresi yazar. Yönetici e-postası `admin@ankara.edu.tr`; şifre bu dosyadaki `ADMIN_PASSWORD` değeridir. Bu dosya Git'e dahil edilmez.
- Tekrar başlatma mevcut hesapları ve şifreleri değiştirmez. Çalışan servislerin PID'leri başlangıç çıktısında gösterilir.

## Gerçek akademik kadro

`backend/db/faculty-roster.js`, 8 Eylül 2026 tarihinde [bölüm sayfasından](https://ai.eng.ankara.edu.tr/kisiler/) doğrulanan 9 öğretim üyesini içerir. Araştırma görevlileri dahil değildir. Bölümden verilen bilgiye göre İbrahim Kök yerine Doç. Dr. Ebubekir Kaya eklenmiştir; Kaya'nın e-postası [enstitü sayfasından](https://fenbilimleri.ankara.edu.tr/yapay-zeka-ve-veri-muhendisligi-2/) doğrulanmıştır. Kaya'nın uzmanlık alanları henüz eklenmemiştir.

Örnek danışmanlar ve öğrenciler oluşturulmaz. Eski veritabanındaki bilinen örnek danışmanlar ile İbrahim Kök pasifleştirilir; geçmiş atamalar silinmez. Kayıt ve yönetici bölüm seçeneklerinde yalnızca Yapay Zeka ve Veri Mühendisliği görünür. Yeni bölüm açma kapalıdır; eski veritabanındaki diğer bölümlerin geçmiş kayıtları silinmez.

Hoca hesapları ortak demo şifresi kullanmaz. İlk erişim için her hocaya ayrı güçlü şifre atayın:

```powershell
$env:ACCOUNT_PASSWORD = 'hocaya-ozel-en-az-12-karakter'
node backend/scripts/set-password.js toktasa@ankara.edu.tr
Remove-Item Env:ACCOUNT_PASSWORD
```

Şifreyi ilgili hocaya güvenli şekilde ilettikten sonra hoca kendi panelinden değiştirebilir. Bu araç mevcut yönetici şifresini değiştirmek için de kullanılabilir.

## Öğrenci kaydı

Giriş ekranındaki **Öğrenci Kaydı** ile ad soyad, e-posta, şifre, giriş yılı ve PDF transkript gönderilir. Tek bölüm Ankara Üniversitesi Yapay Zeka ve Veri Mühendisliği'dir.

Transkriptten dört alan okunur: ad soyad, GANO/GABNO (0–4), üniversite ve bölüm. Ad formdaki adla, üniversite Ankara Üniversitesi ile ve bölüm Yapay Zeka ve Veri Mühendisliği ile eşleşmelidir. Dört kontrol geçerse kullanıcı ve öğrenci kaydı tek işlemle oluşturulur, şifre bcrypt ile hashlenir ve hesap doğrudan `approved` olur. Öğrenci yönetici onayı beklemeden tercih yapabilir. Okunan dört alan ve kontrol zamanı veritabanında tutulur, öğrenci panelinde gösterilir.

Eksik, tutarsız veya farklı bilgi içeren belgeler 422 yanıtıyla reddedilir; hesap oluşturulmaz. PDF'nin metni seçilebilir ve şifresiz olması gerekir; taranmış görseller için OCR yoktur. Açıkça etiketlenmiş alanlar kullanılır; tahmini isim eşleştirmesi yapılmaz. YÖK transkriptindeki Genel Not Ortalaması alanına öncelik verilir; bu alan yoksa belgedeki son kümülatif ortalama alınır. YÖK belgelerinin sütunlu ad/soyad düzeni ve Programı/ABD/ASD alanı desteklenir. Orijinal PDF saklanmaz. Eski onay bekleyen kayıtlar yeni kuralla otomatik onaylanmaz.

Bu işlem PDF metninin tutarlılığını kontrol eder; dijital imza, barkod veya üniversite sistemi üzerinden belge gerçekliği doğrulamaz. E-posta doğrulama ve e-posta ile şifre sıfırlama henüz uygulanmamıştır.

Ana sayfa rehberi GANO puanını `(GANO / 4) × 100`, toplam puanı `GANO puanı × 0,80 + tercih puanı × 0,20` olarak açıklar. İlk tercih 100, son tercih 0, aradaki tercihler eşit aralıklarla puanlanır; tek tercih 100 puandır. Örnek: 3,20 GANO ve ilk tercih için 84 puan. Kontenjan, eşitlik ve boş kontenjana atama kuralları da rehberde açıklanır.

## Canlı ortam

`backend/.env.example` değişkenlerini sunucunun gizli ortam ayarlarında doldurun. `JWT_SECRET` en az 32 karakterli rastgele bir anahtar, ilk kurulumdaki `ADMIN_PASSWORD` en az 12 karakter olmalıdır. Backend `.env` dosyasını otomatik okur. Eski kurulumdan kalan yönetici şifresi otomatik değişmez; taşıma sırasında güncelleyin.

SQLite `DB_PATH` değerini kalıcı disk üzerindeki mutlak dosya yoluna ayarlayın ve yedekleme planlayın. Varsayılan yerel yol `backend/db/danisman_atama.db` olup Git tarafından dışlanır. Frontend için `VITE_API_BASE_URL` değerini HTTPS API adresine ayarlayarak `npm run build` çalıştırın. Alan adı, HTTPS, kalıcı disk ve e-posta akışları canlıya alma sırasında yapılandırılmalıdır.

## Doğrulama

```powershell
node --test backend/tests/transcript.test.js
node docs/assignment_case_runner.cjs --all
cd frontend
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

E2E testleri ayrı geçici SQLite dosyası kullanır; yerel öğrenci kayıtlarını değiştirmez. Test öncesinde 3000 ve 5173 portları boş olmalıdır. Atama senaryoları `docs/assignment_cases/` altında tutulur; test verileri uygulamaya yüklenmez.
