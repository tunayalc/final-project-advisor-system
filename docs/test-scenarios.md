# Test Senaryolari

Bu dokuman, mevcut urun akisini test odakli hale getirir. Sistem cok bolumlu calisir:
`Yapay Zeka ve Veri Muhendisligi` ve `Bilgisayar Muhendisligi`. Ogrenciler self-register akisiyle bolum secip transkript PDF yukler,
admin onayindan sonra tercih yapar ve merkezi atama `%80 GANO + %20 tercih sirasi` puaniyla ilerler.

## Temel Senaryolar

### 1. Sifre ile giris ve rol bazli yetki

- Admin ve danisman seed hesaplari ile giris yapilir.
- Self-register ile olusan ogrenci hesabi ile giris yapilir.
- Beklenen sonuc:
  - admin `/admin`, danisman `/faculty`, ogrenci `/student` paneline yonlenir
  - token localStorage'a yazilir
  - ogrenci tokeni ile admin endpointleri 403 doner
  - admin tokeni olmadan onay ve atama endpointleri calismaz

### 2. Ogrenci transkript PDF ile kayit olur

- Login ekranindaki `Ogrenci Kaydi` sekmesi acilir.
- Ad soyad, e-posta, sifre, bolum, giris yili ve transkript PDF yuklenir.
- PDF icinde `GANO` veya `GABNO` etiketiyle gecen deger okunur.
- Beklenen sonuc:
  - kayit `201` doner
  - kullanici rolu `ogrenci` olur
  - ogrenci `approval_status=pending` baslar
  - ogrenci secilen bolume kaydolur
  - okunan GANO ogrenci profilinde gorunur
  - transkriptteki ad soyad formdaki addan farkliysa uyari saklanir

### 3. GANO/GABNO okuma varyasyonlari

- `GANO: 3.42` iceren PDF denenir.
- `GABNO 3,42` iceren PDF denenir.
- Eksik veya `0-4` araligi disinda GANO iceren PDF denenir.
- Beklenen sonuc:
  - nokta ve virgul ondalik ayraci kabul edilir
  - GABNO etiketi GANO gibi okunur
  - gecersiz veya eksik not bilgisiyle kayit reddedilir

### 4. Pending ogrenci tercih yapamaz

- Yeni kayit olan pending ogrenci ile giris yapilir.
- Danisman listesi ve tercih endpointleri cagirilir.
- Beklenen sonuc:
  - ogrenci panelinde `Admin onayi bekleniyor` ekrani gorunur
  - `/students/faculty-list`, `/students/preferences` ve davet endpointleri 403 doner
  - pending ogrenci merkezi atamaya dahil edilmez

### 5. Admin ogrenci basvurusunu inceler

- Admin panelinde `Onay bekleyen kayitlar` tablosu acilir.
- Basvurunun form adi, transkript adi, okunan GANO, giris yili ve varsa uyari alani incelenir.
- Admin GANO, giris yili, ad soyad veya e-posta bilgisini duzenleyip onaylar ya da reddeder.
- Beklenen sonuc:
  - onaylanan ogrenci `approved` olur ve tercih yapabilir
  - reddedilen ogrenci tercih/teklif/atama akislarina dahil edilmez
  - admin islemi `ADMIN_REVIEW_STUDENT` logu olusturur

### 6. Admin panelinden yalnizca danisman eklenir

- Admin panelindeki kayit yonetimi alani kontrol edilir.
- Beklenen sonuc:
  - `Danisman ekle` formu vardir
  - admin panelinde `Ogrenci ekle` formu yoktur
  - `/admin/users` endpointi olusturdugu kullaniciyi `hoca` roluyle kaydeder
  - danisman secilen bolum altinda olusturulur

### 7. Approved ogrenci tercih kaydeder

- Approved ogrenci panelinde aktif danisman havuzu acilir.
- Ogrenci kendi bolumundeki aktif danismanlari tercih listesine ekler.
- Beklenen sonuc:
  - yalnizca ayni bolumdeki aktif danismanlar listelenir
  - tercih sirasi kaydedilir
  - sayfa yenilendiginde tercih listesi korunur
  - `UPDATE_PREFERENCES` logu olusur

### 8. Atanmis ogrenci tercih degistiremez

- Approved ogrenci tercih kaydettikten sonra merkezi atama calistirilir.
- Atanmis ogrenci tekrar tercih kaydetmeye calisir.
- Beklenen sonuc:
  - ogrenci panelinde kesinlesen danisman sonucu gorunur
  - tercih kaydetme endpointi 400 doner
  - mevcut atama korunur

### 9. Puanli merkezi atama dogru calisir

- Onayli ve atanmamis ogrenciler icin tercihler hazirlanir.
- Admin `Kontenjanlari hesapla` ve `Atamayi baslat` islemlerini calistirir.
- Beklenen sonuc:
  - sadece approved ogrenciler islenir
  - sadece ayni bolumdeki aktif danismanlara atama yapilir
  - kontenjan asilmaz
  - toplam puan `%80 GANO + %20 tercih sirasi` formuluyle hesaplanir
  - siralama: toplam puan, GANO, tercih sirasi, ogrenci ID, danisman ID
  - `SCORE_ASSIGN` logunda puan, GANO katkisi, tercih katkisi ve tercih sirasi gorunur

### 10. Tercih disi fallback atamasi

- Approved ogrencinin tercihleri dolu veya gecersiz kalacak sekilde kontenjan senaryosu hazirlanir.
- Ayni bolumde bos kontenjani olan aktif danisman bulunur.
- Beklenen sonuc:
  - ogrenci tercihleriyle atanamazsa fallback ile bos kontenjana yerlestirilir
  - `FALLBACK_ASSIGN` logu olusur
  - bolum disi veya pasif danisman fallback hedefi olmaz

### 11. Danisman yalnizca uygun ogrencileri gorur

- Pending, rejected, approved ve atanmis ogrenciler ayni test ortaminda hazirlanir.
- Danisman panelinde minimum GANO filtresi uygulanir.
- Beklenen sonuc:
  - yalnizca approved ve atanmamis ogrenciler listelenir
  - pending/rejected ogrenciler gorunmez
  - danisman yalnizca kendi bolumundeki ogrencilere teklif gonderebilir
  - pending/rejected ogrenciye teklif gonderme denemesi reddedilir

### 12. Hoca aktif / pasif durumu

- Admin bir danismani pasife alir.
- Beklenen sonuc:
  - pasif danisman ogrenci tercih havuzunda gorunmez
  - pasif danisman yeni teklif gonderemez
  - pasif danisman merkezi atama kontenjani hesaplamasina aktif hedef olarak girmez
  - mevcut atamalar sistemde korunur

### 13. Manuel danisman degisikligi

- Admin approved ogrenciyi ayni bolumdeki aktif danismana manuel atar.
- Beklenen sonuc:
  - eski danismanin `current_quota` degeri gerekiyorsa azalir
  - yeni danismanin `current_quota` degeri artar
  - pending veya rejected ogrenci manuel atanamaz
  - bolum disi veya pasif danismana manuel atama reddedilir

### 14. Kullanici silme

- Admin bir ogrenci veya danisman kaydini siler.
- Beklenen sonuc:
  - `users` kaydi ve ilgili profil kaydi temizlenir
  - ogrenci silindiyse tercihleri, teklifleri ve ilgili atama etkileri temizlenir
  - atamali ogrenci silindiyse danisman kotasi tutarli kalir
  - danisman silinecekse bagli atama etkileri kontrollu islenir

### 15. Sifre degistirme

- Kullanici mevcut sifresini girerek yeni sifre belirler.
- Beklenen sonuc:
  - mevcut sifre dogrulanir
  - yeni sifre hashlenerek saklanir
  - hatali mevcut sifre ile islem reddedilir

### 16. Cok bolum tutarliligi

- Departman listesi ve paneller kontrol edilir.
- Beklenen sonuc:
  - seed ortaminda `Yapay Zeka ve Veri Muhendisligi` ve `Bilgisayar Muhendisligi` vardir
  - ogrenci self-register akisi secilen bolume kaydeder
  - admin danisman olustururken bolum secer
  - ogrenci ve hoca listeleri bolum disina cikmaz

## CSV Atama Dataset Senaryolari

Bu senaryolar `docs/assignment_cases` altinda CSV olarak kayitlidir ve `node docs/assignment_case_runner.cjs --all` komutuyla kosulur.

### 17. Test Case 1: Yogun talep goren iki hoca

- YZVM bolumunde 4 hoca ve 22 approved ogrenci vardir.
- En cok talep goren 2 hocayi 7'ser ogrenci birinci tercih yapar.
- Diger 2 hocayi 4'er ogrenci birinci tercih yapar.
- Beklenen sonuc:
  - tum ogrenciler atanir
  - dagilim `6/6/5/5` olur
  - kota asimi ve bolum disi atama olmaz
  - her atama icin puan logu olusur

### 18. Test Case 2: Happy path esit tercih

- YZVM bolumunde 4 hoca ve 40 approved ogrenci vardir.
- Her hocayi 10 ogrenci birinci tercih yapar.
- Beklenen sonuc:
  - dagilim `10/10/10/10` olur
  - tum ogrenciler tercih uzerinden atanir

### 19. Test Case 3: Bizim bolum 40 kontenjan

- YZVM bolumunde 4 hoca ve 40 approved ogrenci vardir.
- Tercihler dengesiz dagilir.
- Beklenen sonuc:
  - sistem 40 ogrenciyi bolum icinde dengeli kotaya gore yerlestirir
  - dagilim `10/10/10/10` olur
  - puanli siralama ve kota sinirlari korunur

### 20. Test Case 4: Bilgisayar Muhendisligi 110 ogrenci

- Bilgisayar Muhendisligi bolumunde 10 hoca ve 110 approved ogrenci vardir.
- Tercihler populer hoca yogunlugu ve normal dagilim karisimi icerir.
- Beklenen sonuc:
  - her hocanin kotasi ortalama 11 olur
  - 110 ogrencinin tamami atanir
  - bolum disi atama olusmaz

### 21. Test Case 5: Kapasite benchmark

- `05_capacity_100`, `05_capacity_500`, `05_capacity_1000`, `05_capacity_5000` datasetleri kosulur.
- Beklenen sonuc:
  - algoritma hata vermeden tamamlanir
  - tum ogrenciler atanir
  - kontenjan asimi olmaz
  - sure raporlanir; 5000 ogrenci icin 60 saniye ustu sonuc uyari sayilir

### 22. Ek aykiri durum datasetleri

- Pending/rejected ogrenciler atamaya dahil edilmez.
- Pasif hoca tercihte olsa bile kullanilmaz.
- Tercihsiz ogrenci fallback ile bos kontenjana gider.
- Ayni puan/GANO/tercih sirasi durumunda ogrenci ID ve hoca ID tie-break calisir.
- Ayni anda iki bolum verisi varken bolumler birbirine karismaz.

## Kontrol Listesi

- Login ve rol bazli yonlendirme calisiyor mu?
- Ogrenci kaydi multipart PDF ile yapiliyor mu?
- `GANO` ve `GABNO` okuma varyasyonlari dogru mu?
- Pending ogrenci tercih, danisman listesi, teklif ve atama akislarindan engelleniyor mu?
- Admin onayindan sonra ogrenci tercih kaydedebiliyor mu?
- Admin panelinde ogrenci ekleme kaldirilmis, danisman ekleme korunmus mu?
- Atanmis ogrenci tercih degistiremiyor mu?
- Merkezi atama `%80 GANO + %20 tercih sirasi` puanini uyguluyor mu?
- Puan detaylari admin loglarina yaziliyor mu?
- Danisman paneli yalnizca approved ve atanmamis ogrencileri gosteriyor mu?
- Cok bolum izolasyonu tum UI ve API akislarinda korunuyor mu?
- CSV dataset runner tum ana ve aykiri atama senaryolarini PASS veriyor mu?
- README, mimari dokumani, runtime test ve Playwright e2e ayni sistemi anlatiyor mu?
