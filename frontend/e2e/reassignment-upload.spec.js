import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';

const validArchive = '{"record":{"action":"PREFERENCES_SAVED"}}\n';
const admin = { id: 1, full_name: 'Test Yöneticisi', email: 'admin@example.invalid', role: 'admin' };

test.beforeEach(async ({ page }) => {
  await page.addInitScript((user) => {
    localStorage.setItem('token', 'isolated-ui-test');
    localStorage.setItem('user', JSON.stringify(user));
    const readText = Blob.prototype.text;
    Blob.prototype.text = function () {
      return this.name === 'okunamayan.jsonl' ? Promise.reject(new Error('Dosya okunamadı.')) : readText.call(this);
    };
  }, admin);
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const response = pathname.endsWith('/auth/me') ? { user: admin }
      : pathname.endsWith('/get_dashboard_data') ? { studentCount: 0, assignedStudentCount: 0 }
        : [];
    await route.fulfill({ json: response });
  });
  await page.goto('/admin');
  await expect(page.getByRole('region', { name: 'Bütün öğrencileri yeniden yerleştir' })).toBeVisible();
});

test('valid JSONL enables preview, sends selected source, and a new source invalidates it', async ({ page }) => {
  const panel = page.getByRole('region', { name: 'Bütün öğrencileri yeniden yerleştir' });
  const previewButton = panel.getByRole('button', { name: 'Dağıtım önizlemesini hazırla' });
  const input = panel.getByLabel('Tercih geçmişi dosyası (isteğe bağlı, JSONL)');
  const requests = [];
  await page.route('**/api/admin/reassignment/preview', async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: {
      fingerprint: 'preview-fingerprint',
      source: { name: requests.at(-1).source_name, mode: 'archive' },
      stats: { totalStudents: 0, placedByPreference: 0, placedRandomly: 0, unplaced: 0, changed: 0 },
      faculty: [], assignments: [],
    } });
  });
  await input.setInputFiles({ name: 'tercihler.jsonl', mimeType: 'application/x-ndjson', buffer: Buffer.from(validArchive) });
  await expect(panel).toContainText('Seçilen kaynak: tercihler.jsonl');
  await expect(previewButton).toBeEnabled();
  await expect(panel).not.toContainText('Dosya kullanılamıyor');
  await previewButton.click();
  await expect(panel.getByRole('button', { name: 'Bu dağıtımı uygula' })).toBeEnabled();
  expect(requests).toEqual([{ source_name: 'tercihler.jsonl', archive_text: validArchive }]);
  await input.setInputFiles({ name: 'yeni-tercihler.jsonl', mimeType: 'application/x-ndjson', buffer: Buffer.from(validArchive) });
  await expect(panel).toContainText('Seçilen kaynak: yeni-tercihler.jsonl');
  await expect(panel.getByRole('button', { name: 'Bu dağıtımı uygula' })).toHaveCount(0);
  await expect(previewButton).toBeEnabled();
});

for (const scenario of [
  { name: 'empty', filename: 'bos.jsonl', buffer: () => Buffer.from(' \n'), error: 'Seçilen dosya boş.' },
  { name: 'oversized', filename: 'buyuk.jsonl', buffer: () => Buffer.alloc(5 * 1024 * 1024 + 1, 'a'), error: 'en fazla 5 MB' },
  { name: 'read failure', filename: 'okunamayan.jsonl', buffer: () => Buffer.from(validArchive), error: 'Dosya okunamadı.' },
]) {
  test(`${scenario.name} archive blocks preview until a valid file or current source is selected`, async ({ page }) => {
    const panel = page.getByRole('region', { name: 'Bütün öğrencileri yeniden yerleştir' });
    const input = panel.getByLabel('Tercih geçmişi dosyası (isteğe bağlı, JSONL)');
    const previewButton = panel.getByRole('button', { name: 'Dağıtım önizlemesini hazırla' });
    const uploadInvalid = () => input.setInputFiles({
      name: scenario.filename, mimeType: 'application/x-ndjson', buffer: scenario.buffer(),
    });
    await uploadInvalid();
    await expect(panel.getByRole('status')).toContainText(scenario.error);
    await expect(previewButton).toBeDisabled();
    await expect(panel).toContainText('Dosya kullanılamıyor');
    await input.setInputFiles({ name: 'duzeltilmis.jsonl', mimeType: 'application/x-ndjson', buffer: Buffer.from(validArchive) });
    await expect(panel).toContainText('Seçilen kaynak: duzeltilmis.jsonl');
    await expect(previewButton).toBeEnabled();
    await expect(panel.getByRole('status')).toHaveCount(0);
    await uploadInvalid();
    await expect(previewButton).toBeDisabled();
    await panel.getByRole('button', { name: 'Sistemdeki tercihleri kullan' }).click();
    await expect(panel).toContainText('Kaynak: Sistemde kayıtlı tercihler');
    await expect(previewButton).toBeEnabled();
    await expect(panel.getByRole('status')).toHaveCount(0);
  });
}
