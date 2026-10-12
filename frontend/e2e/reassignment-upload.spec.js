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

test('preview clearly identifies protected manual assignments and excludes them from changes', async ({ page }) => {
  const panel = page.getByRole('region', { name: 'Bütün öğrencileri yeniden yerleştir' });
  await page.route('**/api/admin/reassignment/preview', async (route) => {
    await route.fulfill({ json: {
      fingerprint: 'protected-preview', source: { name: 'Güncel kayıtlı tercihler', mode: 'current' },
      stats: { totalStudents: 1, placedByPreference: 0, placedRandomly: 0, preservedManual: 1, unplaced: 0, changed: 0 },
      faculty: [{ faculty_id: 1, faculty_name: 'Elle Seçilen Danışman', department_name: 'Test Bölümü', priority: 1, base_quota: 1, current_quota: 1 }],
      assignments: [{ student_id: 1, student_name: 'Korunan Öğrenci', student_email: 'protected@example.invalid', department_name: 'Test Bölümü', gano: 3,
        faculty_name: 'Elle Seçilen Danışman', previous_faculty_name: 'Elle Seçilen Danışman', method: 'manual', preference_rank: 2, score: null, changed: false }],
    } });
  });
  await panel.getByRole('button', { name: 'Dağıtım önizlemesini hazırla' }).click();
  await expect(panel.locator('.stat-card').filter({ hasText: 'Elle yapılan ataması korunan' })).toContainText('1');
  await expect(panel).toContainText('Öğrencilerin danışmanlarında değişiklik yok.');
  await panel.getByText('Bütün öğrencilerin yeni yerleşimlerini göster (1)', { exact: true }).click();
  const row = panel.getByRole('row').filter({ hasText: 'Korunan Öğrenci' });
  await expect(row).toContainText('Elle yapılan atama korundu');
  await expect(row.getByRole('cell').nth(4)).toHaveText('2');
  await expect(row.getByRole('cell').nth(5)).toHaveText('—');
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
