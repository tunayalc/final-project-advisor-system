-- Danışman Atama Sistemi — Seed Data

INSERT OR IGNORE INTO departments (id, name) VALUES
(1, 'Yapay Zeka ve Veri Mühendisliği');

-- Admin kullanıcı (şifre database.js içinde admin123 olarak hashlenir)
INSERT OR IGNORE INTO users (id, email, password_hash, role, full_name) VALUES
(1, 'admin@ankara.edu.tr', 'seed-admin-password', 'admin', 'Sistem Yöneticisi');

-- Danışmanlar (şifre database.js içinde hoca123 olarak hashlenir)
INSERT OR IGNORE INTO users (id, email, password_hash, role, full_name) VALUES
(2, 'ahmet.yilmaz@ankara.edu.tr', 'seed-hoca-password', 'hoca', 'Prof. Dr. Ahmet Yılmaz'),
(3, 'ayse.demir@ankara.edu.tr', 'seed-hoca-password', 'hoca', 'Doç. Dr. Ayşe Demir'),
(4, 'mehmet.kaya@ankara.edu.tr', 'seed-hoca-password', 'hoca', 'Dr. Öğr. Üyesi Mehmet Kaya'),
(5, 'selin.yildiz@ankara.edu.tr', 'seed-hoca-password', 'hoca', 'Prof. Dr. Selin Yıldız');

INSERT OR IGNORE INTO faculty (id, user_id, department_id, expertise_keywords, base_quota, current_quota, is_active) VALUES
(1, 2, 1, 'Yapay Zeka, Makine Öğrenmesi, Derin Öğrenme', 0, 0, 1),
(2, 3, 1, 'Veri Madenciliği, Büyük Veri, NLP', 0, 0, 1),
(3, 4, 1, 'Veri Mühendisliği, Veri Tabanları, Dağıtık Sistemler', 0, 0, 1),
(4, 5, 1, 'Bilgisayarlı Görü, Üretken Yapay Zeka, MLOps', 0, 0, 1);
