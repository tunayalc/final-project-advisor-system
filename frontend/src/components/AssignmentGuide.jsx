export default function AssignmentGuide() {
  return (
    <section className="panel assignment-guide" aria-labelledby="assignment-guide-title">
      <p className="eyebrow">Tercih ve yerleştirme rehberi</p>
      <h2 id="assignment-guide-title">Danışman tercihi nasıl yapılır?</h2>
      <ol className="guide-steps">
        <li><strong>Hesabınızı oluşturun.</strong> Transkriptinizdeki ad soyad, GANO, üniversite ve bölüm bilgileri kontrol edilir. Bilgiler eşleştiğinde hesabınız otomatik onaylanır.</li>
        <li><strong>Danışmanları sıralayın.</strong> Çalışmak istediğiniz hocaları en çok istediğinizden başlayarak tercih listenize ekleyin ve listenizi kaydedin.</li>
        <li><strong>Yerleştirme sonucunu takip edin.</strong> Yönetici merkezi atamayı başlattığında öğrenci–danışman tercihleri puana göre değerlendirilir. Yerleştirme, danışmanın boş kontenjanı varsa yapılır.</li>
      </ol>
      <h3>Puanınız nasıl hesaplanır?</h3>
      <p>Her danışman tercihiniz için GANO’nuzun %80’i, o danışmana verdiğiniz tercih puanının %20’si kullanılır.</p>
      <dl className="guide-scores">
        <div><dt>GANO puanı</dt><dd>(GANO / 4) × 100</dd></div>
        <div><dt>Tercih puanı</dt><dd>İlk tercih 100, son tercih 0; aradakiler eşit aralıklarla azalır. Tek tercih varsa 100 puandır.</dd></div>
        <div><dt>Toplam puan</dt><dd>GANO puanı × 0,80 + tercih puanı × 0,20</dd></div>
      </dl>
      <p className="notice notice-info"><strong>Örnek:</strong> GANO’nuz 3,20 ise GANO puanınız 80’dir. İlk tercihiniz için toplam puanınız 80 × 0,80 + 100 × 0,20 = <strong>84</strong> olur.</p>
      <p className="muted-copy">Yüksek puan öncelik sağlar; ilk tercihinize yerleşme garantisi vermez. Puan eşitliğinde önce yüksek GANO, ardından daha üst tercih sırası dikkate alınır. Eşitlik sürerse sistemdeki kayıt sırası kullanılır.</p>
      <p className="muted-copy">Tercihlerine yerleşemeyen veya tercih yapmayan öğrenciler, bölümde kalan kontenjanlara göre değerlendirilir. Toplam puan, GANO ve tercih katkıları ile tercih sırası yöneticinin işlem günlüğünde gösterilir.</p>
    </section>
  );
}
