-- Danışman Atama Sistemi — Seed Data

INSERT OR IGNORE INTO departments (id, name) VALUES
(1, 'Yapay Zeka ve Veri Mühendisliği'),
(2, 'Bilgisayar Mühendisliği');

-- Admin kullanıcı (şifre database.js içinde admin123 olarak hashlenir)
INSERT OR IGNORE INTO users (id, email, password_hash, role, full_name) VALUES
(1, 'admin@ankara.edu.tr', 'seed-admin-password', 'admin', 'Sistem Yöneticisi');

-- Danışmanlar (şifre database.js içinde hoca123 olarak hashlenir)
INSERT OR IGNORE INTO users (id, email, password_hash, role, full_name) VALUES
(2, 'ahmet.yilmaz@ankara.edu.tr', 'seed-hoca-password', 'hoca', 'Prof. Dr. Ahmet Yılmaz'),
(3, 'ayse.demir@ankara.edu.tr', 'seed-hoca-password', 'hoca', 'Doç. Dr. Ayşe Demir'),
(4, 'mehmet.kaya@ankara.edu.tr', 'seed-hoca-password', 'hoca', 'Dr. Öğr. Üyesi Mehmet Kaya'),
(5, 'selin.yildiz@ankara.edu.tr', 'seed-hoca-password', 'hoca', 'Prof. Dr. Selin Yıldız'),
(6, 'cem.arslan@ankara.edu.tr', 'seed-hoca-password', 'hoca', 'Prof. Dr. Cem Arslan'),
(7, 'deniz.kurt@ankara.edu.tr', 'seed-hoca-password', 'hoca', 'Doç. Dr. Deniz Kurt'),
(8, 'elif.ozkan@ankara.edu.tr', 'seed-hoca-password', 'hoca', 'Dr. Öğr. Üyesi Elif Özkan'),
(9, 'furkan.celik@ankara.edu.tr', 'seed-hoca-password', 'hoca', 'Prof. Dr. Furkan Çelik'),
(10, 'gizem.sahin@ankara.edu.tr', 'seed-hoca-password', 'hoca', 'Doç. Dr. Gizem Şahin'),
(11, 'hakan.koc@ankara.edu.tr', 'seed-hoca-password', 'hoca', 'Dr. Öğr. Üyesi Hakan Koç'),
(12, 'irem.akyol@ankara.edu.tr', 'seed-hoca-password', 'hoca', 'Prof. Dr. İrem Akyol'),
(13, 'kaan.dogan@ankara.edu.tr', 'seed-hoca-password', 'hoca', 'Doç. Dr. Kaan Doğan'),
(14, 'leyla.tas@ankara.edu.tr', 'seed-hoca-password', 'hoca', 'Dr. Öğr. Üyesi Leyla Taş'),
(15, 'mert.erdem@ankara.edu.tr', 'seed-hoca-password', 'hoca', 'Prof. Dr. Mert Erdem');

INSERT OR IGNORE INTO faculty (id, user_id, department_id, expertise_keywords, base_quota, current_quota, is_active) VALUES
(1, 2, 1, 'Yapay Zeka, Makine Öğrenmesi, Derin Öğrenme', 0, 0, 1),
(2, 3, 1, 'Veri Madenciliği, Büyük Veri, NLP', 0, 0, 1),
(3, 4, 1, 'Veri Mühendisliği, Veri Tabanları, Dağıtık Sistemler', 0, 0, 1),
(4, 5, 1, 'Bilgisayarlı Görü, Üretken Yapay Zeka, MLOps', 0, 0, 1),
(5, 6, 2, 'Algoritmalar, Veri Yapıları, Rekabetçi Programlama', 0, 0, 1),
(6, 7, 2, 'Bilgisayar Ağları, Dağıtık Sistemler, Bulut Bilişim', 0, 0, 1),
(7, 8, 2, 'Yazılım Mühendisliği, Gereksinim Analizi, Test Otomasyonu', 0, 0, 1),
(8, 9, 2, 'Siber Güvenlik, Kriptografi, Ağ Güvenliği', 0, 0, 1),
(9, 10, 2, 'Veritabanları, Bilgi Sistemleri, Büyük Veri', 0, 0, 1),
(10, 11, 2, 'İşletim Sistemleri, Paralel Programlama, Sistem Yazılımı', 0, 0, 1),
(11, 12, 2, 'Grafik, İnsan Bilgisayar Etkileşimi, Oyun Teknolojileri', 0, 0, 1),
(12, 13, 2, 'Yapay Zeka, Makine Öğrenmesi, Robotik', 0, 0, 1),
(13, 14, 2, 'Programlama Dilleri, Derleyiciler, Formal Yöntemler', 0, 0, 1),
(14, 15, 2, 'Mobil Sistemler, Web Teknolojileri, Nesnelerin İnterneti', 0, 0, 1);
