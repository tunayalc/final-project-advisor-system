# Tercih geçmişi ve dosya yedekleri

Öğrenci **Tercihleri kaydet** işlemini başarıyla tamamladığında veya bir daveti kabul/reddettiğinde ayrı bir kayıt oluşturulur. Ekranda henüz kaydedilmemiş sıralamalar arşivlenmez. Özellik etkinleştirilmeden önceki değişiklik geçmişi geriye dönük üretilemez.

Her kayıtta benzersiz olay kimliği, UTC zaman damgası, öğrenci kimliği/adı/e-postası/bölümü ve sıralı danışman kimlikleri/adları bulunur. Davet kararları davet kimliği ve kabul/ret durumuyla kaydedilir. Transkript, şifre ve oturum anahtarları dosyalara eklenmez.

`selection_backups` tablosuna yazma, tercih güncellemesiyle aynı veritabanı işlemi içinde gerçekleşir. Arşiv kaydı başarısız olursa tercih değişikliği de geri alınır. Başarılı işlemin ardından sunucuda `selection-backups/<event_id>.json` dosyası oluşturulur. İçerik SHA-256 özetiyle birlikte saklanır; bu bir dijital imza değildir.

`SELECTION_BACKUP_DIR` dosya dizinini değiştirir. Varsayılan dizin `DB_PATH` yanındadır; Docker/Render kurulumunda `/data/selection-backups` olur. Dizin web üzerinden sunulmaz, Git ve Docker build bağlamına alınmaz. Öğrenci hesabının silinmesi eski arşiv kayıtlarını silmez.

Render Free diski kalıcı değildir. Bu nedenle asıl kalıcı arşiv Supabase PostgreSQL'dedir; sunucu yeniden başlatıldığında JSON dosyaları arşivden yeniden oluşturulur. Dosya yazım hatası kalıcı arşivi silmez; sunucu günlüğüne yazılır ve sonraki açılışta yeniden denenir.

Yönetici panelindeki **Tercih geçmişini indir** düğmesi, bütün geçmişi JSONL dosyası olarak indirir. Her satır bir kayıt ve SHA-256 özetini içerir. API: `GET /api/admin/selection-backups/export`; yalnızca yönetici erişebilir. İndirilen dosya kişisel bilgi içerir ve yetkisiz kişilerle paylaşılmamalıdır.

Bu arşiv, aynı veritabanındaki güncel tercih tablosundan bağımsız bir geçmiş sağlar; veritabanının tamamen kaybına karşı ayrı bir dış yedek hizmeti değildir. Bağımsız kopya için yönetici dosyayı indirip güvenli bir yerde saklamalıdır.

Geri bildirim formu: https://docs.google.com/forms/d/e/1FAIpQLScfhKxeBDtfwtQP7TBWzxU7VyIo2ODKHYqHmJ7tqo71Akbt4w/viewform
