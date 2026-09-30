import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';

for (const status of ['accepted', 'rejected']) {
  test(`invitation ${status} is archived once and duplicate responses are rejected`, async ({ request }) => {
    const unique = `${Date.now()}.${status}`;
    const admin = await getAdminToken(request);
    const email = `faculty.${unique}@example.invalid`;
    const created = await request.post(`${apiBaseUrl}/admin/users`, {
      headers: { Authorization: `Bearer ${admin}` },
      data: { email, full_name: 'Archive Test Faculty', password: 'ArchiveFaculty123!', department_id: 1 },
    });
    expect(created.status()).toBe(201);
    const faculty = await loginApi(request, email, 'ArchiveFaculty123!');
    const registration = await registerStudent(request, { email: `invite.${unique}@example.invalid`, fullName: 'Invitation Test Student' });
    const student = registration.token;
    const profile = await (await request.get(`${apiBaseUrl}/students/me`, { headers: { Authorization: `Bearer ${student}` } })).json();
    expect((await request.post(`${apiBaseUrl}/faculty/invite`, { headers: { Authorization: `Bearer ${faculty}` }, data: { student_id: profile.id } })).status()).toBe(200);
    const invites = await (await request.get(`${apiBaseUrl}/students/invitations`, { headers: { Authorization: `Bearer ${student}` } })).json();
    const respond = () => request.post(`${apiBaseUrl}/students/invitations/${invites[0].id}/respond`, { headers: { Authorization: `Bearer ${student}` }, data: { status } });
    expect((await respond()).status()).toBe(200);
    expect((await respond()).status()).toBe(400);
    const history = await request.get(`${apiBaseUrl}/admin/selection-backups/export`, { headers: { Authorization: `Bearer ${admin}` } });
    const records = (await history.text()).trim().split('\n').map(line => JSON.parse(line)).filter(row => row.record.student.user_id === registration.user.id);
    expect(records).toHaveLength(1);
    expect(records[0].record.selection.status).toBe(status);
    expect(records[0].record.action).toBe('INVITATION_RESPONDED');
    // Isolated test database: remove fixture faculty after cleaning its student.
    await request.delete(`${apiBaseUrl}/admin/users/${registration.user.id}`, { headers: { Authorization: `Bearer ${admin}` } });
    await request.delete(`${apiBaseUrl}/admin/users/${(await created.json()).user.id}`, { headers: { Authorization: `Bearer ${admin}` } });
  });
}

const apiBaseUrl = 'http://127.0.0.1:3000/api';
const studentPassword = 'Temp1234!';

test('original PDF persists, downloads only for admin, and disappears when student is removed', async ({ page, request }) => {
  const email = `pdf.${Date.now()}@example.invalid`;
  const fullName = 'Transcript Test Student';
  const registration = await registerStudent(request, { email, fullName });
  const admin = await getAdminToken(request);
  const adminHeaders = { Authorization: `Bearer ${admin}` };
  const profile = await (await request.get(`${apiBaseUrl}/students/me`, {
    headers: { Authorization: `Bearer ${registration.token}` },
  })).json();
  const url = `${apiBaseUrl}/admin/students/${profile.id}/transcript`;
  expect((await request.get(url)).status()).toBe(401);
  expect((await request.get(url, { headers: { Authorization: `Bearer ${registration.token}` } })).status()).toBe(403);
  const downloaded = await request.get(url, { headers: adminHeaders });
  expect(downloaded.status()).toBe(200);
  expect(downloaded.headers()['content-type']).toContain('application/pdf');
  expect(downloaded.headers()['cache-control']).toBe('no-store');
  expect(await downloaded.body()).toEqual(makeTranscriptPdf({ fullName }));
  await login(page, 'admin@ankara.edu.tr', 'AdminTest1234!');
  const row = page.getByRole('row').filter({ hasText: email });
  await expect(row.getByRole('button', { name: 'Transkript indir' })).toBeVisible();
  const download = page.waitForEvent('download');
  await row.getByRole('button', { name: 'Transkript indir' }).click();
  expect((await download).suggestedFilename()).toBe(`transkript-${profile.id}.pdf`);
  expect((await request.delete(`${apiBaseUrl}/admin/users/${registration.user.id}`, { headers: adminHeaders })).status()).toBe(200);
  expect((await request.get(url, { headers: adminHeaders })).status()).toBe(404);
  expect((await request.get(`${apiBaseUrl}/students/me`, { headers: { Authorization: `Bearer ${registration.token}` } })).status()).toBe(401);
});

function escapePdfText(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function makeTranscriptPdf({ fullName, label = 'GABNO', gano = '3,42', university = 'Ankara Universitesi', department = 'Yapay Zeka ve Veri Muhendisligi' }) {
  const textOps = ['BT', '/F1 12 Tf', '72 760 Td'];
  [
    university,
    department ? `Bolum: ${department}` : '',
    `Ad Soyad: ${fullName}`,
    `${label}: ${gano}`,
    'Belge sonu',
  ].forEach((line) => {
    textOps.push(`(${escapePdfText(line)}) Tj`);
    textOps.push('0 -18 Td');
  });
  textOps.push('ET');

  const stream = textOps.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

async function login(page, email, password) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
}

async function loginApi(request, email, password) {
  const response = await request.post(`${apiBaseUrl}/auth/login`, {
    data: { email, password },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).token;
}

async function registerStudent(request, {
  email,
  fullName,
  label = 'GABNO',
  gano = '3,42',
  departmentId = 1,
}) {
  const response = await request.post(`${apiBaseUrl}/auth/register`, {
    multipart: {
      full_name: fullName,
      email,
      password: studentPassword,
      department_id: String(departmentId),
      entry_year: '2024',
      transcript: {
        name: 'transcript.pdf',
        mimeType: 'application/pdf',
        buffer: makeTranscriptPdf({ fullName, label, gano }),
      },
    },
  });

  expect(response.status()).toBe(201);
  return response.json();
}

async function getAdminToken(request) {
  return loginApi(request, 'admin@ankara.edu.tr', 'AdminTest1234!');
}

async function saveFirstPreferences(request, token, count = 4) {
  const facultyResponse = await request.get(`${apiBaseUrl}/students/faculty-list`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(facultyResponse.status()).toBe(200);

  const facultyList = await facultyResponse.json();
  expect(facultyList.length).toBeGreaterThan(0);

  const preferences = facultyList.slice(0, count).map((faculty) => faculty.id);
  const saveResponse = await request.post(`${apiBaseUrl}/students/preferences`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { preferences },
  });
  expect(saveResponse.status()).toBe(200);

  return preferences;
}

test('home page explains scoring and only offers the enabled department', async ({ page, request }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Danışman tercihi nasıl yapılır?' })).toBeVisible();
  await expect(page.locator('.assignment-guide')).toContainText('84');
  await expect(page.locator('.assignment-guide')).toContainText('GANO puanı × 0,80 + tercih puanı × 0,20');
  await page.getByRole('button', { name: 'Öğrenci Kaydı' }).click();
  await expect(page.getByLabel('Bölüm').locator('option')).toHaveCount(1);
  const departments = await request.get(`${apiBaseUrl}/auth/departments`);
  expect((await departments.json()).map(item => item.name)).toEqual(['Yapay Zeka ve Veri Mühendisliği']);
  const token = await getAdminToken(request);
  const blocked = await request.post(`${apiBaseUrl}/admin/departments`, {
    headers: { Authorization: `Bearer ${token}` }, data: { name: 'Bilgisayar Mühendisliği' },
  });
  expect(blocked.status()).toBe(403);
});

const invalidTranscripts = [
  ['different name', { fullName: 'Baska Ogrenci' }],
  ['missing name', { fullName: '' }],
  ['different university', { university: 'Gazi Universitesi' }],
  ['missing university', { university: '' }],
  ['different department', { department: 'Bilgisayar Muhendisligi' }],
  ['missing department', { department: '' }],
  ['missing average', { gano: '' }],
  ['invalid average', { gano: '4.50' }],
];
for (const [description, overrides] of invalidTranscripts) {
  test(`registration rejects ${description} without creating an account`, async ({ request }) => {
    const email = `invalid.${Date.now()}@ankara.edu.tr`;
    const data = { full_name: 'Deniz Yilmaz', email, password: studentPassword, department_id: '1', entry_year: '2024' };
    const submit = (options) => request.post(`${apiBaseUrl}/auth/register`, {
      multipart: { ...data, transcript: { name: 'transcript.pdf', mimeType: 'application/pdf', buffer: makeTranscriptPdf({ fullName: data.full_name, ...options }) } },
    });
    const rejected = await submit(overrides);
    expect(rejected.status()).toBe(422);
    expect((await rejected.json()).error).toBeTruthy();
    // The same email must remain available after a failed transcript check.
    const accepted = await submit({});
    expect(accepted.status()).toBe(201);
    expect((await accepted.json()).user.profile.approval_status).toBe('approved');
  });
}

test('registration rejects a forged department id and malformed PDF', async ({ request }) => {
  const data = { full_name: 'Deniz Yilmaz', email: `badpdf.${Date.now()}@ankara.edu.tr`, password: studentPassword, department_id: '2', entry_year: '2024' };
  const transcript = { name: 'transcript.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf') };
  expect((await request.post(`${apiBaseUrl}/auth/register`, { multipart: { ...data, transcript } })).status()).toBe(400);
  expect((await request.post(`${apiBaseUrl}/auth/register`, { multipart: { ...data, department_id: '1', transcript } })).status()).toBe(422);
});

test('admin can log in, manage quotas, and no longer sees student creation', async ({ page }) => {
  await login(page, 'admin@ankara.edu.tr', 'AdminTest1234!');

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Yerleştirme ve kullanıcı yönetimi' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bölüm ekle' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Danışman ekle' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Onay bekleyen kayıtlar' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Öğrenci ekle' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Kontenjanları hesapla' }).click();
  await expect(page.getByText(/Kontenjanlar güncellendi/i)).toBeVisible();
});

test('student registration automatically approves all four transcript fields', async ({ page }) => {
  const uniqueId = Date.now();
  const email = `e2e.register.${uniqueId}@ankara.edu.tr`;
  const fullName = 'Deniz Yilmaz';

  await page.goto('/login');
  await page.getByRole('button', { name: 'Öğrenci Kaydı' }).click();
  await page.getByLabel('Ad soyad').fill(fullName);
  await page.getByLabel('E-posta adresi').fill(email);
  await page.getByLabel('Bölüm').selectOption({ label: 'Yapay Zeka ve Veri Mühendisliği' });
  await page.getByLabel('Şifre').fill(studentPassword);
  await page.getByLabel('Giriş yılı').fill('2024');
  await page.getByLabel('Transkript PDF').setInputFiles({
    name: 'transcript.pdf',
    mimeType: 'application/pdf',
    buffer: makeTranscriptPdf({ fullName, label: 'GABNO', gano: '3,42' }),
  });
  await page.getByRole('button', { name: 'Öğrenci kaydı oluştur' }).click();

  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByRole('heading', { name: 'Aktif danışmanlar' })).toBeVisible();
  const transcriptPanel = page.getByRole('region', { name: 'Transkriptten okunan bilgiler' });
  await expect(transcriptPanel).toContainText('Deniz Yilmaz');
  await expect(transcriptPanel).toContainText('3.42');
  await expect(transcriptPanel).toContainText('Ankara Üniversitesi');
  await expect(transcriptPanel).toContainText('Yapay Zeka ve Veri Mühendisliği');
  await page.reload();
  await expect(transcriptPanel).toBeVisible();
});

test('approved student can persist preferences without admin approval', async ({ page, request }) => {
  const uniqueId = Date.now();
  const email = `e2e.preferences.${uniqueId}@ankara.edu.tr`;
  const fullName = 'Deniz Yilmaz';

  await registerStudent(request, { email, fullName, label: 'GABNO', gano: '3,65' });
  await login(page, email, studentPassword);

  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByRole('heading', { name: 'Aktif danışmanlar' })).toBeVisible();

  const firstFacultyName = (await page.locator('.list-card h3').first().textContent())?.trim();
  expect(firstFacultyName).toBeTruthy();
  await expect(page.locator('.list-card')).toHaveCount(9);
  await expect(page.locator('.list-card', { hasText: 'Ebubekir Kaya' })).toBeVisible();
  await expect(page.locator('.list-card', { hasText: 'İbrahim Kök' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Ekle' }).first().click();
  await page.getByRole('button', { name: 'Tercihleri kaydet' }).click();
  await expect(page.getByText(/Tercih listeniz kaydedildi/i)).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Kayıtlı tercih listeniz' })).toBeVisible();
  await expect(page.locator('.preference-card')).toHaveCount(1);
  await expect(page.getByText(firstFacultyName)).toBeVisible();
});

test('each saved preference revision is archived and only admins can export history', async ({ request }) => {
  const registration = await registerStudent(request, { email: `archive.${Date.now()}@example.invalid`, fullName: 'Archive Test Student' });
  const token = registration.token;
  const choices = await saveFirstPreferences(request, token, 3);
  const reversed = [...choices].reverse();
  const saved = await request.post(`${apiBaseUrl}/students/preferences`, {
    headers: { Authorization: `Bearer ${token}` }, data: { preferences: reversed },
  });
  expect(saved.status()).toBe(200);
  expect((await saved.json()).receipt.event_id).toBeTruthy();
  const invalid = await request.post(`${apiBaseUrl}/students/preferences`, {
    headers: { Authorization: `Bearer ${token}` }, data: { preferences: [choices[0], choices[0]] },
  });
  expect(invalid.status()).toBe(400);
  const url = `${apiBaseUrl}/admin/selection-backups/export`;
  expect((await request.get(url)).status()).toBe(401);
  expect((await request.get(url, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(403);
  const admin = await getAdminToken(request);
  const download = await request.get(url, { headers: { Authorization: `Bearer ${admin}` } });
  expect(download.status()).toBe(200);
  expect(download.headers()['content-disposition']).toContain('attachment');
  const records = (await download.text()).trim().split('\n').map(line => JSON.parse(line)).filter(row => row.record.student.user_id === registration.user.id);
  expect(records).toHaveLength(2);
  expect(records[0].record.selection.preferences.map(p => p.faculty_id)).toEqual(choices);
  expect(records[1].record.selection.preferences.map(p => p.faculty_id)).toEqual(reversed);
  expect(records[0].sha256).toHaveLength(64);
});

test('scored assignment locks an assigned student and writes score details', async ({ page, request }) => {
  const uniqueId = Date.now();
  const email = `e2e.assigned.${uniqueId}@ankara.edu.tr`;
  const fullName = 'Deniz Yilmaz';

  const registerResponse = await registerStudent(request, { email, fullName, label: 'GABNO', gano: '3,91' });
  const studentToken = registerResponse.token;
  const adminToken = await getAdminToken(request);
  const preferences = await saveFirstPreferences(request, studentToken);

  const quotaResponse = await request.post(`${apiBaseUrl}/admin/calculate-quotas`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  expect(quotaResponse.status()).toBe(200);

  const assignmentResponse = await request.post(`${apiBaseUrl}/admin/run-assignment`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  expect(assignmentResponse.status()).toBe(200);

  const resaveResponse = await request.post(`${apiBaseUrl}/students/preferences`, {
    headers: { Authorization: `Bearer ${studentToken}` },
    data: { preferences },
  });
  expect(resaveResponse.status()).toBe(400);

  const logsResponse = await request.get(`${apiBaseUrl}/admin/logs`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  expect(logsResponse.status()).toBe(200);
  const logs = await logsResponse.json();
  expect(logs.some((log) => log.action === 'SCORE_ASSIGN' && log.details.includes('Puan:'))).toBeTruthy();

  await login(page, email, studentPassword);
  await expect(page.getByRole('heading', { name: 'Danışman ataması tamamlandı' })).toBeVisible();
});

test('admin can download complete system and transcript archives while students cannot', async ({ page, request }) => {
  const admin = await getAdminToken(request);
  const headers = { Authorization: `Bearer ${admin}` };
  const registration = await registerStudent(request, { email: `bulk.${Date.now()}@example.invalid`, fullName: 'Bulk Archive Student' });
  await saveFirstPreferences(request, registration.token);
  for (const endpoint of ['system-export', 'transcripts/export']) {
    const url = `${apiBaseUrl}/admin/${endpoint}`;
    expect((await request.get(url)).status()).toBe(401);
    expect((await request.get(url, { headers: { Authorization: `Bearer ${registration.token}` } })).status()).toBe(403);
    const response = await request.get(url, { headers });
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/zip');
    expect(response.headers()['cache-control']).toBe('no-store');
    const body = await response.body();
    expect(body.subarray(0, 2).toString()).toBe('PK');
    expect(body.includes(Buffer.from('icerik.json'))).toBeTruthy();
  }
  await login(page, 'admin@ankara.edu.tr', 'AdminTest1234!');
  await expect(page.getByRole('heading', { name: 'Toplu indirme', exact: true })).toBeVisible();
  for (const [label, filename] of [['Tüm kayıtları indir', 'tum-sistem-kayitlari.zip'], ['Tüm transkriptleri indir', 'tum-transkriptler.zip']]) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: label, exact: true }).click();
    expect((await download).suggestedFilename()).toBe(filename);
  }
});

test('reset requires admin confirmation and preserves faculty identities', async ({ page, request }) => {
  const admin = await getAdminToken(request);
  const headers = { Authorization: `Bearer ${admin}` };
  const before = await (await request.get(`${apiBaseUrl}/admin/users`, { headers })).json();
  const teachers = before.filter(user => user.role === 'hoca').map(user => ({ id: user.id, email: user.email }));
  const registered = await registerStudent(request, { email: `reset.${Date.now()}@example.invalid`, fullName: 'Reset Test Student' });
  await saveFirstPreferences(request, registered.token);
  const resetUrl = `${apiBaseUrl}/admin/reset-system`;
  expect((await request.post(resetUrl, { headers: { Authorization: `Bearer ${registered.token}` }, data: { confirmation: 'SIFIRLA' } })).status()).toBe(403);
  expect((await request.post(resetUrl, { headers, data: { confirmation: 'wrong' } })).status()).toBe(400);
  await login(page, 'admin@ankara.edu.tr', 'AdminTest1234!');
  const resetButton = page.getByRole('button', { name: 'Sistemi kalıcı olarak sıfırla' });
  await expect(resetButton).toBeDisabled();
  await page.getByLabel('Kalıcı silmeyi onaylamak için SIFIRLA yazın').fill('SIFIRLA');
  await resetButton.click();
  await expect(page).toHaveURL(/login/);
  expect((await request.get(`${apiBaseUrl}/admin/users`, { headers })).status()).toBe(401);
  expect((await request.get(`${apiBaseUrl}/students/me`, { headers: { Authorization: `Bearer ${registered.token}` } })).status()).toBe(401);
  const newHeaders = { Authorization: `Bearer ${await getAdminToken(request)}` };
  const after = await (await request.get(`${apiBaseUrl}/admin/users`, { headers: newHeaders })).json();
  expect(after.filter(user => user.role === 'hoca').map(user => ({ id: user.id, email: user.email }))).toEqual(teachers);
  expect(after.filter(user => user.role !== 'hoca')).toHaveLength(1);
  expect(await (await request.get(`${apiBaseUrl}/admin/selection-backups/export`, { headers: newHeaders })).text()).toBe('');
  expect(await (await request.get(`${apiBaseUrl}/admin/logs`, { headers: newHeaders })).json()).toEqual([]);
  const faculty = await (await request.get(`${apiBaseUrl}/admin/faculty-overview`, { headers: newHeaders })).json();
  expect(faculty.every(item => item.base_quota === 0 && item.current_quota === 0)).toBeTruthy();
});
