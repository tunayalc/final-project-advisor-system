import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';

const apiBaseUrl = 'http://127.0.0.1:3000/api';
const studentPassword = 'Temp1234!';

function escapePdfText(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function makeTranscriptPdf({ fullName, label = 'GABNO', gano = '3,42' }) {
  const textOps = ['BT', '/F1 12 Tf', '72 760 Td'];
  [
    'Ankara Universitesi Transkript Belgesi',
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
  return loginApi(request, 'admin@ankara.edu.tr', 'admin123');
}

async function approveStudent(request, email) {
  const adminToken = await getAdminToken(request);
  const applicationsResponse = await request.get(`${apiBaseUrl}/admin/student-applications`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  expect(applicationsResponse.status()).toBe(200);

  const applications = await applicationsResponse.json();
  const application = applications.find((item) => item.email === email);
  expect(application).toBeTruthy();

  const reviewResponse = await request.patch(`${apiBaseUrl}/admin/students/${application.id}/review`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: {
      approval_status: 'approved',
      full_name: application.full_name,
      email: application.email,
      gano: Number(application.gano),
      entry_year: Number(application.entry_year),
    },
  });
  expect(reviewResponse.status()).toBe(200);

  return adminToken;
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

test('admin can log in, manage quotas, and no longer sees student creation', async ({ page }) => {
  await login(page, 'admin@ankara.edu.tr', 'admin123');

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Yerleştirme ve kullanıcı yönetimi' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bölüm ekle' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Danışman ekle' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Onay bekleyen kayıtlar' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Öğrenci ekle' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Kontenjanları hesapla' }).click();
  await expect(page.getByText(/Kontenjanlar güncellendi/i)).toBeVisible();
});

test('admin can create a new department', async ({ page }) => {
  const uniqueId = Date.now();
  const departmentName = `E2E Bölüm ${uniqueId}`;

  await login(page, 'admin@ankara.edu.tr', 'admin123');
  await expect(page).toHaveURL(/\/admin$/);

  const departmentPanel = page.locator('section.panel', {
    has: page.getByRole('heading', { name: 'Bölüm ekle' }),
  });
  await departmentPanel.getByLabel('Bölüm adı').fill(departmentName);
  await departmentPanel.getByRole('button', { name: 'Bölüm ekle' }).click();
  await expect(page.getByText(new RegExp(`${departmentName} bölümü eklendi`, 'i'))).toBeVisible();
  await expect(departmentPanel.getByText(departmentName)).toBeVisible();

  const createPanel = page.locator('section.panel', {
    has: page.getByRole('heading', { name: 'Danışman ekle' }),
  });
  await createPanel.getByLabel('Bölüm').selectOption({ label: departmentName });
});

test('admin can create faculty under computer engineering department', async ({ page }) => {
  const uniqueId = Date.now();
  const facultyName = `E2E BM Hoca ${uniqueId}`;
  const facultyEmail = `e2e.bm.hoca.${uniqueId}@ankara.edu.tr`;

  await login(page, 'admin@ankara.edu.tr', 'admin123');
  await expect(page).toHaveURL(/\/admin$/);

  const createPanel = page.locator('section.panel', {
    has: page.getByRole('heading', { name: 'Danışman ekle' }),
  });
  await createPanel.getByLabel('Bölüm').selectOption({ label: 'Bilgisayar Mühendisliği' });
  await createPanel.getByLabel('Uzmanlık alanları').fill('Algoritmalar');
  await createPanel.getByLabel('Ad soyad').fill(facultyName);
  await createPanel.getByLabel('E-posta').fill(facultyEmail);
  await createPanel.getByLabel('Geçici şifre').fill('Hoca1234!');
  await createPanel.getByRole('button', { name: 'Danışman ekle' }).click();

  await expect(page.getByText(new RegExp(`${facultyName} danışman olarak sisteme eklendi`, 'i'))).toBeVisible();
});

test('student registration uploads transcript PDF and lands on pending screen', async ({ page }) => {
  const uniqueId = Date.now();
  const email = `e2e.register.${uniqueId}@ankara.edu.tr`;
  const fullName = `E2E Register ${uniqueId}`;

  await page.goto('/login');
  await page.getByRole('button', { name: 'Öğrenci Kaydı' }).click();
  await page.getByLabel('Ad soyad').fill(fullName);
  await page.getByLabel('E-posta adresi').fill(email);
  await page.getByLabel('Bölüm').selectOption({ label: 'Bilgisayar Mühendisliği' });
  await page.getByLabel('Şifre').fill(studentPassword);
  await page.getByLabel('Giriş yılı').fill('2024');
  await page.getByLabel('Transkript PDF').setInputFiles({
    name: 'transcript.pdf',
    mimeType: 'application/pdf',
    buffer: makeTranscriptPdf({ fullName, label: 'GABNO', gano: '3,42' }),
  });
  await page.getByRole('button', { name: 'Öğrenci kaydı oluştur' }).click();

  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByRole('heading', { name: 'Admin onayı bekleniyor' })).toBeVisible();
  await expect(page.getByText('Okunan GANO')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Aktif danışmanlar' })).toHaveCount(0);
});

test('admin approves a pending student application from the UI', async ({ page, request }) => {
  const uniqueId = Date.now();
  const email = `e2e.approve.${uniqueId}@ankara.edu.tr`;
  const fullName = `E2E Approve ${uniqueId}`;

  await registerStudent(request, { email, fullName, label: 'GANO', gano: '3.52' });
  await login(page, 'admin@ankara.edu.tr', 'admin123');

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Onay bekleyen kayıtlar' })).toBeVisible();

  const applicationsPanel = page.locator('section.panel', {
    has: page.getByRole('heading', { name: 'Onay bekleyen kayıtlar' }),
  });
  const row = applicationsPanel.locator('tbody tr', { hasText: fullName });
  await expect(row).toBeVisible();
  await expect(row.locator('input[type="number"]').first()).toHaveValue('3.52');
  await row.getByRole('button', { name: 'Onayla' }).click();
  await expect(page.getByText(/Öğrenci kaydı güncellendi/i)).toBeVisible();
  await expect(row).toHaveCount(0);
});

test('approved student can persist preferences after admin approval', async ({ page, request }) => {
  const uniqueId = Date.now();
  const email = `e2e.preferences.${uniqueId}@ankara.edu.tr`;
  const fullName = `E2E Preferences ${uniqueId}`;

  await registerStudent(request, { email, fullName, label: 'GABNO', gano: '3,65' });
  await approveStudent(request, email);
  await login(page, email, studentPassword);

  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByRole('heading', { name: 'Aktif danışmanlar' })).toBeVisible();

  const firstFacultyName = (await page.locator('.list-card h3').first().textContent())?.trim();
  expect(firstFacultyName).toBeTruthy();

  await page.getByRole('button', { name: 'Ekle' }).first().click();
  await page.getByRole('button', { name: 'Tercihleri kaydet' }).click();
  await expect(page.getByText(/Tercih listeniz kaydedildi/i)).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Kayıtlı tercih listeniz' })).toBeVisible();
  await expect(page.locator('.preference-card')).toHaveCount(1);
  await expect(page.getByText(firstFacultyName)).toBeVisible();
});

test('approved student only sees advisors from the selected department', async ({ page, request }) => {
  const uniqueId = Date.now();
  const email = `e2e.department.${uniqueId}@ankara.edu.tr`;
  const fullName = `E2E Department ${uniqueId}`;

  await registerStudent(request, {
    email,
    fullName,
    label: 'GABNO',
    gano: '3,44',
    departmentId: 2,
  });
  await approveStudent(request, email);
  await login(page, email, studentPassword);

  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByText('Bilgisayar Mühendisliği bölümünde kayıtlı öğrenci profili')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Aktif danışmanlar' })).toBeVisible();
  expect(await page.locator('.list-card').count()).toBeGreaterThanOrEqual(10);
  await expect(page.locator('.list-card', { hasText: 'Cem Arslan' })).toBeVisible();
  await expect(page.locator('.list-card', { hasText: 'Ahmet Yılmaz' })).toHaveCount(0);
});

test('scored assignment locks an assigned student and writes score details', async ({ page, request }) => {
  const uniqueId = Date.now();
  const email = `e2e.assigned.${uniqueId}@ankara.edu.tr`;
  const fullName = `E2E Assigned ${uniqueId}`;

  const registerResponse = await registerStudent(request, { email, fullName, label: 'GABNO', gano: '3,91' });
  const studentToken = registerResponse.token;
  const adminToken = await approveStudent(request, email);
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
