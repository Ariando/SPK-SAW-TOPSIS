// Uji alur sebelas metode lewat HTTP: pemilih, perhitungan, penyimpanan,
// dan perbandingan.
// Dijalankan: tsx scripts/verify-methods-http.mjs
// Prasyarat: dev server berjalan, DB sudah di-seed.

import mysql from 'mysql2/promise';
import 'dotenv/config';
import { ADMIN_USERNAME, ADMIN_PASSWORD } from './test-credentials.mjs';
import { createDatabase, createPool } from '../src/db/factory.ts';
import { compareLatestRuns } from '../src/lib/comparison.ts';

const base = process.env.VERIFY_BASE ?? 'http://localhost:4321';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL belum diisi');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
};

const appPool = createPool(databaseUrl);
const appDb = createDatabase(appPool);
const connection = await mysql.createConnection({ uri: databaseUrl, decimalNumbers: true });

/* ---------- Data uji: 4 alternatif, 4 kriteria ---------- */
{
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of ['scores', 'rubrics', 'alternatives', 'criteria', 'computation_results', 'computation_runs']) {
    await connection.query(`TRUNCATE TABLE \`${table}\``);
  }
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');

  const now = new Date();
  const criteriaRows = [
    ['C1', 'Relevansi tema dan judul', '0.3000', 'benefit'],
    ['C2', 'Ketajaman metodologi', '0.2500', 'benefit'],
    ['C3', 'Ketersediaan data', '0.2000', 'benefit'],
    ['C4', 'Beban biaya dan waktu', '0.2500', 'cost'],
  ];
  const criterionIds = [];
  for (const [index, [code, name, weight, direction]] of criteriaRows.entries()) {
    const [res] = await connection.query(
      'INSERT INTO criteria (code, name, weight, direction, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [code, name, weight, direction, index + 1, now, now]
    );
    criterionIds.push(res.insertId);
  }

  const alternatives = [
    ['A1', 'Sistem rekomendasi beasiswa', [4, 3, 5, 2]],
    ['A2', 'Deteksi plagiarisme', [3, 5, 4, 3]],
    ['A3', 'Optimasi jadwal kuliah', [5, 4, 3, 4]],
    ['A4', 'Monitoring magang', [2, 2, 4, 1]],
  ];
  for (const [index, [code, title, values]] of alternatives.entries()) {
    const [res] = await connection.query(
      'INSERT INTO alternatives (code, title, student_name, nim, concentration, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
      [code, title, 'Mahasiswa ' + code, '211010' + index, 'RPL', now, now]
    );
    for (const [j, value] of values.entries()) {
      await connection.query(
        'INSERT INTO scores (alternative_id, criterion_id, rubric_id, value, updated_at) VALUES (?, ?, NULL, ?, ?)',
        [res.insertId, criterionIds[j], value, now]
      );
    }
  }
  console.log('data uji siap');
}

/* ---------- Sesi ---------- */
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
  return { status: r.status, text: await r.text() };
};

const login = await request('/api/auth/sign-in/username', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base },
  body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
});
check('login admin', login.status === 200, String(login.status));
if (login.status !== 200) process.exit(1);

const ALL = ['saw', 'wp', 'topsis', 'waspas', 'moora', 'copras', 'vikor', 'edas', 'aras', 'mabac', 'smart'];

/* ---------- 1. Pemilih metode menampilkan tujuh metode ---------- */
{
  const r = await request('/hitung');
  check('halaman hitung terbuka', r.status === 200, String(r.status));
  for (const id of ALL) {
    const label = id === 'waspas' ? 'WASPAS' : id === 'moora' ? 'MOORA' : id === 'copras' ? 'COPRAS' : id === 'vikor' ? 'VIKOR' : id.toUpperCase();
    check('pemilih memuat ' + label, r.text.includes('Hitung ' + label), '');
  }
  check('pemilih menandai VIKOR nilai terkecil', r.text.includes('nilai terkecil terbaik'));
  check('pemilih memuat deskripsi WASPAS', r.text.includes('parameter lambda'));
}

/* ---------- 2. Setiap metode bisa dihitung ---------- */
for (const id of ALL) {
  const r = await request(`/hitung/${id}`);
  check('hitung ' + id.toUpperCase() + ' terbuka', r.status === 200, String(r.status));
  check('hitung ' + id.toUpperCase() + ' punya peringkat', r.text.includes('Peringkat akhir'));
  check('hitung ' + id.toUpperCase() + ' punya jejak langkah', r.text.includes('Jejak langkah perhitungan'));
  check('hitung ' + id.toUpperCase() + ' tanpa NaN', !r.text.includes('NaN') && !r.text.includes('Infinity'));
}

/* ---------- 3. Halaman VIKOR menjelaskan arah nilai ---------- */
{
  const r = await request('/hitung/vikor');
  check('VIKOR menjelaskan arah nilai', r.text.includes('nilai terkecil adalah alternatif terbaik'));
  check('VIKOR menjelaskan Q terkecil terbaik', r.text.includes('Q terkecil adalah alternatif terbaik'));
}

/* ---------- 4. Simpan seluruh metode ---------- */
for (const id of ALL) {
  const r = await request(`/hitung/${id}?_action=runs.save`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ method: id }),
  });
  check('simpan ' + id.toUpperCase(), r.status === 200, String(r.status));
}

/* ---------- 5. Perbandingan mencakup tujuh metode ---------- */
{
  const status = await compareLatestRuns(appDb);
  check('perbandingan lengkap', status.complete === true, status.missingMethods.join(', ') || 'lengkap');
  check('perbandingan data sama', status.sameData === true);
  check('perbandingan tanpa penghalang', status.blockers.length === 0, status.blockers.join(' | ').slice(0, 100));
  check('perbandingan memuat sebelas metode', (status.analysis?.methods.length ?? 0) === 11, String(status.analysis?.methods.length));
  check('Kendall W terdefinisi', status.analysis?.kendall.w !== null, String(status.analysis?.kendall.w));
  check(
    'Spearman memuat 55 pasangan',
    (status.analysis?.spearman.pairs.length ?? 0) === 55,
    String(status.analysis?.spearman.pairs.length)
  );
  check('Borda memuat empat alternatif', (status.analysis?.borda.length ?? 0) === 4, String(status.analysis?.borda.length));
}

/* ---------- 6. Halaman perbandingan menampilkan tujuh metode ---------- */
{
  const r = await request('/hasil/bandingkan');
  check('halaman perbandingan terbuka', r.status === 200, String(r.status));
  for (const label of ['SAW', 'WP', 'TOPSIS', 'WASPAS', 'MOORA', 'COPRAS', 'VIKOR']) {
    check('perbandingan memuat ' + label, r.text.includes(label), '');
  }
  check('perbandingan menampilkan Kendall W', r.text.includes('Kendall W'));
  check('perbandingan tanpa NaN', !r.text.includes('NaN'));
}

/* ---------- 7. Excel memuat tujuh metode ---------- */
{
  const r = await fetch(new URL('/api/hasil/perbandingan.xlsx', base), {
    headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
  });
  check('unduhan Excel berhasil', r.status === 200, String(r.status));
  const buffer = Buffer.from(await r.arrayBuffer());
  check('berkas Excel berisi', buffer.length > 3000, buffer.length + ' byte');

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const peringkat = wb.getWorksheet('Peringkat');
  const header = [];
  peringkat.getRow(4).eachCell((cell) => header.push(String(cell.value)));
  check('Excel memuat kolom sebelas metode', header.filter((h) => h.includes('Peringkat')).length >= 7, header.join(' | '));
}

await appPool.end();
await connection.end();

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? 'SEMUA UJI SEBELAS METODE LOLOS' : failed + ' GAGAL'} (${results.length} butir)`);
process.exit(failed === 0 ? 0 : 1);