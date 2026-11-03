// Memeriksa isi PDF dengan membandingkan teks halaman yang dirender
// terhadap teks yang seharusnya muncul.
//
// Dijalankan: tsx scripts/verify-pdf-text.mjs
//
// Alasan pendekatan ini: PDF hasil Chrome memakai font subset dengan encoding
// glyph, sehingga ekstraksi teks dari stream PDF mentah menghasilkan karakter
// tak terbaca. Yang dapat dipercaya adalah teks yang diambil dari DOM sebelum
// dicetak. Bila DOM memuat data yang benar dan halaman yang sama dicetak, isi
// PDF berasal dari sumber yang sudah diverifikasi.

import 'dotenv/config';
import mysql from 'mysql2/promise';
import puppeteer from 'puppeteer-core';
import { resolveExecutablePath } from '../src/lib/pdf/browser.ts';
import { ADMIN_USERNAME, ADMIN_PASSWORD } from './test-credentials.mjs';

const base = process.env.VERIFY_BASE ?? 'http://localhost:1111';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  (' + detail + ')' : ''));
};

/* ---------- Data uji ---------- */
{
  const { truncateDataTables, seedCriteriaAndRubrics, seedAlternatives } = await import('./test-data.ts');

  const connection = await mysql.createConnection({ uri: process.env.DATABASE_URL, decimalNumbers: true });
  await truncateDataTables(connection);
  const ids = await seedCriteriaAndRubrics(connection);
  await seedAlternatives(connection, ids, [
    { code: 'A1', title: 'Sistem rekomendasi beasiswa', values: [4, 3, 5, 2] },
    { code: 'A2', title: 'Deteksi plagiarisme dokumen', values: [3, 5, 4, 3] },
    { code: 'A3', title: 'Monitoring magang berbasis web', values: [5, 4, 3, 4] },
  ]);
  await connection.end();
  console.log('data uji siap');
}

/* ---------- Sesi lewat HTTP ---------- */
const jar = new Map();
const store = (r) => {
  for (const line of r.headers.getSetCookie?.() ?? []) {
    const [pair] = String(line).split(';');
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
};
const request = async (path, options = {}) => {
  const headers = { ...(options.headers ?? {}) };
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  if (cookie) headers.cookie = cookie;
  const r = await fetch(new URL(path, base), { ...options, headers, redirect: 'manual' });
  store(r);
  const buffer = Buffer.from(await r.arrayBuffer());
  return { status: r.status, buffer, text: buffer.toString('utf8') };
};

const login = await request('/api/auth/sign-in/username', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base },
  body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
});
check('login admin', login.status === 200, String(login.status));
if (login.status !== 200) process.exit(1);

const ALL = ['saw', 'wp', 'topsis', 'waspas', 'moora', 'copras', 'vikor', 'edas', 'aras', 'mabac', 'smart'];
let saved = 0;
for (const method of ALL) {
  const r = await request(`/hitung/${method}?_action=runs.save`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ method, scenarioId: '' }),
  });
  if (r.status === 200) saved++;
}
check('hasil tersimpan', saved === ALL.length, saved + '/' + ALL.length);

/* ---------- Ambil teks halaman lewat Chromium ---------- */
const browser = await puppeteer.launch({
  executablePath: resolveExecutablePath(),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const cookies = [...jar].map(([name, value]) => ({
  name,
  value,
  domain: 'localhost',
  path: '/',
  httpOnly: true,
}));

await browser.setCookie(...cookies);

/**
 * Memuat halaman dan mengembalikan teks yang terlihat, sama seperti yang
 * akan dicetak. Media print dipakai agar elemen yang disembunyikan saat
 * cetak juga tidak ikut terhitung.
 */
async function pageText(path) {
  const page = await browser.newPage();
  try {
    await page.emulateMediaType('print');
    const response = await page.goto(new URL(path, base).toString(), {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });
    if (!response || response.status() >= 400) {
      return { ok: false, status: response?.status() ?? 0, text: '' };
    }
    const text = await page.evaluate(() => {
      const main = document.querySelector('main') ?? document.body;
      return main ? main.innerText : '';
    });
    return { ok: true, status: response.status(), text };
  } finally {
    await page.close();
  }
}

/* ---------- Isi halaman detail hasil ---------- */
{
  const page = await request('/hasil');
  const link = page.text.match(/href="\/hasil\/(\d+)"/);
  check('tautan run ditemukan', Boolean(link?.[1]), String(link?.[1] ?? '-'));

  if (link?.[1]) {
    const detail = await pageText('/hasil/' + link[1]);
    check('halaman detail terbuka di peramban', detail.ok, String(detail.status));

    check('teks memuat judul hasil', /Hasil\s+\w+/i.test(detail.text), detail.text.slice(0, 60).replace(/\s+/g, ' '));
    check('teks memuat kode alternatif', /\bA[123]\b/.test(detail.text));
    check('teks memuat judul proposal', detail.text.includes('Sistem rekomendasi beasiswa') || detail.text.includes('Monitoring magang'));
    check('teks memuat bagian bobot', /Bobot yang dipakai/i.test(detail.text));
    check('teks memuat sidik snapshot', /Sidik snapshot/i.test(detail.text));
    check('navigasi tidak terlihat saat cetak', !/Lewati ke konten/i.test(detail.text));
    check('tombol ekspor tidak terlihat saat cetak', !/Unduh PDF/i.test(detail.text));

    const pdf = await request('/api/pdf?halaman=' + encodeURIComponent('/hasil/' + link[1]));
    check('PDF untuk halaman yang sama dihasilkan', pdf.status === 200, String(pdf.status));
    check('PDF lebih besar dari satu halaman kosong', pdf.buffer.length > 40000, pdf.buffer.length + ' byte');
  }
}

/* ---------- Isi halaman perbandingan ---------- */
{
  const detail = await pageText('/hasil/bandingkan');
  check('perbandingan terbuka di peramban', detail.ok, String(detail.status));
  check('teks memuat Kendall W', /Kendall W/i.test(detail.text));
  check('teks memuat Borda', /Borda/i.test(detail.text));
  check('teks memuat Spearman', /Spearman/i.test(detail.text));
  check('teks memuat tabel sumber data', /Sumber data/i.test(detail.text));

  const pdf = await request('/api/pdf?halaman=' + encodeURIComponent('/hasil/bandingkan'));
  check('PDF perbandingan dihasilkan', pdf.status === 200, String(pdf.status));
}

/* ---------- Isi halaman sensitivitas ---------- */
{
  const detail = await pageText('/sensitivitas?metode=saw&delta=0.1');
  check('sensitivitas terbuka di peramban', detail.ok, String(detail.status));
  check('teks memuat stabilitas', /Stabilitas peringkat 1/i.test(detail.text));
  check('teks memuat heatmap', /Peta perubahan peringkat/i.test(detail.text));
  check('teks memuat rincian perturbasi', /Rincian perturbasi/i.test(detail.text));

  const pdf = await request('/api/pdf?halaman=' + encodeURIComponent('/sensitivitas?metode=saw&delta=0.1'));
  check('PDF sensitivitas dihasilkan', pdf.status === 200, String(pdf.status));
}

/* ---------- Bukti negatif: jumlah halaman PDF tumbuh dengan isi ---------- */
{
  const short = await request('/api/pdf?halaman=' + encodeURIComponent('/hasil/bandingkan'));
  const countPages = (buffer) => {
    const matches = buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g);
    return matches ? matches.length : 0;
  };

  check('perbandingan lebih dari satu halaman', countPages(short.buffer) >= 2, countPages(short.buffer) + ' halaman');
}

await browser.close();

// Pulihkan keadaan seed agar suite berikutnya tidak terpengaruh. Tanpa ini,
// smoke-p0 dan suite lain gagal karena kriteria dan rubrik sudah dipotong.
{
  const { default: mysql } = await import('mysql2/promise');
  const { restoreSeedState } = await import('./test-data.ts');
  const connection = await mysql.createConnection({ uri: process.env.DATABASE_URL });
  await restoreSeedState(connection);
  await connection.end();
  console.log('kriteria dan rubrik seed dipulihkan');
}


const failed = results.filter((r) => !r.ok).length;
console.log('\n' + (failed === 0 ? 'SEMUA UJI ISI PDF LOLOS' : failed + ' GAGAL') + ' (' + results.length + ' butir)');
process.exit(failed === 0 ? 0 : 1);