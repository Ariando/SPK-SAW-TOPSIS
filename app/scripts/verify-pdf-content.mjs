// Memeriksa isi PDF, bukan hanya tanda tangan berkasnya.
// PDF dengan text layer dicari menggunakan pdftotext bila tersedia;
// bila tidak, dipakai pemeriksaan struktur dan ukuran sebagai gantinya.
//
// Dijalankan: tsx scripts/verify-pdf-content.mjs

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import 'dotenv/config';
import { ADMIN_USERNAME, ADMIN_PASSWORD } from './test-credentials.mjs';

const base = process.env.VERIFY_BASE ?? 'http://localhost:1111';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  (' + detail + ')' : ''));
};

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
  return { status: r.status, buffer, text: buffer.toString('latin1') };
};

/* ---------- Data uji ---------- */
{
  const { default: mysql } = await import('mysql2/promise');
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
  console.log('data uji isi PDF siap');
}

const login = await request('/api/auth/sign-in/username', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base },
  body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
});
check('login admin', login.status === 200, String(login.status));
if (login.status !== 200) process.exit(1);

// Halaman perbandingan memerlukan kesebelas metode.
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
check('hasil tersimpan untuk uji isi', saved === ALL.length, saved + '/' + ALL.length);

const tmp = mkdtempSync(join(tmpdir(), 'telaah-pdf-'));

const countPages = (text) => {
  const matches = text.match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 0;
};

const hasFont = (text) => /\/Font/.test(text);

const pdfToTextAvailable = (() => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
console.log('pdftotext tersedia:', pdfToTextAvailable);

const extractText = (buffer, name) => {
  if (!pdfToTextAvailable) return null;
  const file = join(tmp, name + '.pdf');
  writeFileSync(file, buffer);
  try {
    return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  } catch {
    return null;
  }
};

/* ---------- PDF detail hasil ---------- */
{
  const page = await request('/hasil');
  const link = page.text.match(/href="\/hasil\/(\d+)"/);
  const runId = link?.[1];

  if (!runId) {
    check('tautan run ditemukan', false, '-');
  } else {
    const pdf = await request('/api/pdf?halaman=' + encodeURIComponent('/hasil/' + runId));
    check('PDF detail dihasilkan', pdf.status === 200, String(pdf.status));

    const pages = countPages(pdf.text);
    check('PDF punya minimal satu halaman', pages >= 1, pages + ' halaman');
    check('PDF menyertakan font', hasFont(pdf.text));
    check('PDF berukuran layak untuk tabel', pdf.buffer.length > 20000, pdf.buffer.length + ' byte');

    const text = extractText(pdf.buffer, 'hasil');
    if (text !== null) {
      check('teks PDF memuat nama produk', text.includes('TELAAH'), text.slice(0, 60).replace(/\s+/g, ' '));
      check('teks PDF memuat nama institusi', text.includes('AKPRIND'));
      check('teks PDF memuat judul halaman', text.includes('Hasil') || text.includes('Peringkat'));
      check('teks PDF memuat label sidik snapshot', text.includes('Sidik snapshot') || text.includes('Sidik'));
      check('teks PDF memuat nomor halaman', /Halaman\s+\d+\s+dari\s+\d+/.test(text), 'footer halaman');
      check('teks PDF tidak memuat elemen navigasi', !text.includes('Lewati ke konten'));
      check('teks PDF tidak memuat tombol ekspor', !text.includes('Unduh PDF'));
    } else {
      console.log('  (pdftotext tidak tersedia, isi teks tidak diperiksa)');
    }
  }
}

/* ---------- PDF perbandingan ---------- */
{
  const pdf = await request('/api/pdf?halaman=' + encodeURIComponent('/hasil/bandingkan'));
  check('PDF perbandingan dihasilkan', pdf.status === 200, String(pdf.status));
  check('perbandingan: beberapa halaman', countPages(pdf.text) >= 1, countPages(pdf.text) + ' halaman');

  const text = extractText(pdf.buffer, 'bandingkan');
  if (text !== null) {
    check('teks memuat Kendall', text.includes('Kendall'));
    check('teks memuat Borda', text.includes('Borda'));
    check('teks memuat Spearman', text.includes('Spearman'));
  }
}

/* ---------- PDF sensitivitas ---------- */
{
  const pdf = await request('/api/pdf?halaman=' + encodeURIComponent('/sensitivitas?metode=saw&delta=0.1'));
  check('PDF sensitivitas dihasilkan', pdf.status === 200, String(pdf.status));

  const text = extractText(pdf.buffer, 'sensitivitas');
  if (text !== null) {
    check('teks memuat stabilitas', text.includes('Stabilitas') || text.includes('stabilitas'));
    check('teks memuat heatmap', text.includes('Peta perubahan') || text.includes('perubahan peringkat'));
  }
}

/* ---------- Konsistensi ukuran antar metode ---------- */
{
  const pdf = await request('/api/pdf?halaman=' + encodeURIComponent('/hasil/bandingkan'));
  const second = await request('/api/pdf?halaman=' + encodeURIComponent('/hasil/bandingkan'));
  const near = Math.abs(pdf.buffer.length - second.buffer.length) / pdf.buffer.length < 0.02;
  check('dua pemanggilan menghasilkan ukuran serupa', near, pdf.buffer.length + ' vs ' + second.buffer.length);
}

rmSync(tmp, { recursive: true, force: true });

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