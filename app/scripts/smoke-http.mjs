// Uji alur HTTP aplikasi TELAAH pada dev server lokal.
// Dijalankan: node scripts/smoke-http.mjs [baseUrl]
// Tidak memakai pustaka eksternal. Menyimpan cookie sesi antar permintaan.

import { ADMIN_USERNAME, ADMIN_PASSWORD } from './test-credentials.mjs';
const base = process.argv[2] ?? 'http://localhost:1111';
const jar = new Map();

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function storeCookies(response) {
  const raw = response.headers.getSetCookie?.() ?? [];
  const list = raw.length > 0 ? raw : [response.headers.get('set-cookie')].filter(Boolean);
  for (const line of list) {
    const [pair] = String(line).split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

async function request(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  const cookies = cookieHeader();
  if (cookies) headers.cookie = cookies;
  const response = await fetch(new URL(path, base), {
    ...options,
    headers,
    redirect: 'manual',
  });
  storeCookies(response);
  const text = await response.text();
  return { status: response.status, location: response.headers.get('location'), text };
}

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
};

// 1. Tanpa sesi, halaman terlindungi dialihkan
{
  const r = await request('/dashboard');
  check('dashboard tanpa sesi dialihkan ke login', r.status === 303 && r.location === '/login', `${r.status} ${r.location}`);
}

// 2. Halaman login tampil
{
  const r = await request('/login');
  check('halaman login 200', r.status === 200, String(r.status));
  check('halaman login memuat form', r.text.includes('signin-form'), 'ada signin-form');
  check('halaman login memuat nama produk', r.text.includes('TELAAH'), 'ada TELAAH');
  check('halaman login memuat logo institusi', r.text.includes('/logo-akprind.png'), 'ada logo');
}

// 3. Login dengan kredensial salah
{
  const r = await request('/api/auth/sign-in/username', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ username: 'admin', password: 'salah-sekali' }),
  });
  check('login salah ditolak', r.status === 401 || r.status === 400, String(r.status));
}

// 4. Login benar
{
  const r = await request('/api/auth/sign-in/username', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  check('login benar diterima', r.status === 200, String(r.status));
  check('cookie sesi diterima', jar.size > 0, [...jar.keys()].join(','));
}

// 5. Setelah login, dashboard terbuka
{
  const r = await request('/dashboard');
  check('dashboard terbuka setelah login', r.status === 200, String(r.status));
  check('dashboard menampilkan nama pengguna', r.text.includes('Pengelola TELAAH'), 'ada nama');
  check('dashboard menampilkan jumlah kriteria', r.text.includes('Kriteria aktif'), 'ada statistik');
  check('navigasi memuat tautan kriteria', r.text.includes('/kriteria'), 'ada tautan');
}

// 6. Login page dialihkan saat sudah masuk
{
  const r = await request('/login');
  check('halaman login mengalihkan pengguna yang sudah masuk', r.status === 303 && r.location === '/dashboard', `${r.status} ${r.location}`);
}

// 7. Halaman kriteria terbuka untuk admin
{
  const r = await request('/kriteria');
  check('halaman kriteria terbuka untuk admin', r.status === 200, String(r.status));
  check('halaman kriteria memuat tabel', r.text.includes('Daftar kriteria'), 'ada tabel');
  check('halaman kriteria memuat 4 kriteria contoh', (r.text.match(/matrix-tag/g) ?? []).length >= 4, 'ada kode kriteria');
}

// 8. Halaman yang tidak ada menghasilkan 404, bukan error server
{
  const r = await request('/tidak-ada-halaman-ini');
  check('halaman tidak ada menjawab 404', r.status === 404, String(r.status));
}

// 9. Keluar
{
  const r = await request('/api/signout', { method: 'POST', headers: { origin: base } });
  check('keluar mengalihkan ke login', r.status === 303 && r.location === '/login', `${r.status} ${r.location}`);
  jar.clear();
  const after = await request('/dashboard');
  check('dashboard tertutup setelah keluar', after.status === 303, String(after.status));
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? 'SEMUA UJI HTTP LOLOS' : failed + ' GAGAL'} (${results.length} butir)`);
process.exit(failed === 0 ? 0 : 1);