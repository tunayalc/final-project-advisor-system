require('../config');
const { getDb, initializeDb } = require('../db/database');
const { resetSystem, ResetError } = require('../services/reset-system');

async function main() {
  if (process.argv[2] !== '--execute') {
    console.error('Hocalar korunur; tüm öğrenciler, yöneticiler, transkriptler, tercihler ve geçmiş silinir.');
    console.error('Uygulama durdurulmuşken çalıştırın: node backend/scripts/reset-system.js --execute');
    process.exitCode = 1;
    return;
  }
  await initializeDb();
  const db = getDb();
  try { console.log(JSON.stringify(await resetSystem(db))); }
  finally { await db.close(); }
}
main().catch(error => {
  console.error(error instanceof ResetError ? error.message : 'Sıfırlama tamamlanamadı. Veritabanı bağlantısını kontrol edin.');
  process.exitCode = 1;
});
