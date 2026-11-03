// Uji F7c-E7e: halaman perbandingan, ekspor Excel, dan isi berkas.
// Dijalankan: tsx scripts/verify-comparison-page.mjs
// Prasyarat: dev server berjalan, DB sudah di-seed.

import fs from 'node:fs';
import mysql from 'mysql2/promise';
import ExcelJS from 'exceljs';
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

// Siapkan dataset F0
{
  const fixture = JSON.parse(
    fs.readFileSync(new URL('../../docs/reference/dataset-demo-f0.json', import.meta.url), 'utf8')
  );

  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of ['scores', 'rubrics', 'alternatives', 'criteria', 'computation_results', 'computation_runs']) {
    await connection.query(`TRUNCATE TABLE \`${table}\``);
  }
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');

  const now = new Date();
  const criterionIds = new Map();
  for (const [index, c] of fixture.criteria.entries()) {
    const [res] = await connection.query(
      'INSERT INTO criteria (code, name, weight, direction, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [c.code, c.name, c.weight, c.direction, index + 1, now, now]
    );
    criterionIds.set(c.code, res.insertId);
  }

  const alternativeIds = new Map();
  for (const [index, a] of fixture.alternatives.entries()) {
    const [res] = await connection.query(
      'INSERT INTO alternatives (code, title, student_name, nim, concentration, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
      [a.code, a.title, 'Mahasiswa ' + a.code, '2110100' + (index + 1), 'RPL', now, now]
    );
    alternativeIds.set(a.code, res.insertId);
  }

  for (const a of fixture.alternatives) {
    for (const [j, c] of fixture.criteria.entries()) {
      await connection.query(
        'INSERT INTO scores (alternative_id, criterion_id, rubric_id, value, updated_at) VALUES (?, ?, NULL, ?, ?)',
        [alternativeIds.get(a.code), criterionIds.get(c.code), a.values[j], now]
      );
    }
  }
  console.log('dataset F0 ditanam');
}

// Sesi login
const jar = new Map();
const store = (r) => {
  const list = r.headers.getSetCookie?.() ?? [];
  for (const line of list) {
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
  return { status: r.status, text: buffer.toString('utf8'), buffer, headers: r.headers };
};

const login = await request('/api/auth/sign-in/username', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base },
  body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
});
check('login admin', login.status === 200, String(login.status));
if (login.status !== 200) process.exit(1);

// 1. Tanpa run, halaman menahan perbandingan
{
  const r = await request('/hasil/bandingkan');
  check('tanpa run: halaman terbuka', r.status === 200, String(r.status));
  check('tanpa run: menampilkan penghalang', r.text.includes('Perbandingan belum bisa ditampilkan'));
  check('tanpa run: menyebut metode yang kurang', r.text.includes('Belum ada hasil tersimpan untuk metode'));
  check('tanpa run: tidak menampilkan tabel Borda', !r.text.includes('Peringkat gabungan Borda'));
}

// 2. Excel ditolak saat belum siap
{
  const r = await request('/api/hasil/perbandingan.xlsx');
  check('tanpa run: unduhan Excel ditolak', r.status === 409, String(r.status));
  check('tanpa run: alasan penolakan berupa teks', r.text.includes('Belum ada hasil tersimpan'));
}

// 3. Simpan semua metode terdaftar
{
  for (const m of ['saw', 'wp', 'topsis', 'waspas', 'moora', 'copras', 'vikor', 'edas', 'aras', 'mabac', 'smart']) {
    const r = await request(`/hitung/${m}?_action=runs.save`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
      body: new URLSearchParams({ method: m }),
    });
    check('simpan ' + m.toUpperCase(), r.status === 200, String(r.status));
  }
}

// 4. Halaman perbandingan lengkap
{
  const r = await request('/hasil/bandingkan');
  check('halaman terbuka', r.status === 200, String(r.status));
  check('menampilkan sumber data', r.text.includes('Sumber data'));
  check('menampilkan tingkat kesepakatan', r.text.includes('Tingkat kesepakatan'));
  check('menampilkan Kendall W', r.text.includes('Kendall W'));
  check('menampilkan tabel Borda', r.text.includes('Peringkat gabungan Borda'));
  check('menampilkan tabel Spearman', r.text.includes('Korelasi Spearman antar metode'));
  check('menampilkan tautan unduh Excel', r.text.includes('/api/hasil/perbandingan.xlsx'));
  // Tombol cetak peramban sudah diganti tautan PDF dari server.
  check('menampilkan tautan unduh PDF', r.text.includes('/api/pdf?halaman='));
  check('menyebut keterbatasan tafsiran', r.text.includes('bukan ambang baku'));
  // Dataset F0 tidak memiliki seri, jadi catatan koreksi seri harus tidak muncul.
  check('tanpa seri: catatan koreksi seri tidak ditampilkan', !r.text.includes('Koreksi seri diterapkan'));
  check('tanpa seri: koreksi seri bernilai nol di data', true, 'diperiksa di bawah');
  check('tidak ada penghalang', !r.text.includes('Perbandingan belum bisa ditampilkan'));

  const status = await compareLatestRuns(appDb);
  check(
    'data F0 memang tanpa seri',
    (status.analysis?.kendall.tieCorrection ?? -1) === 0,
    String(status.analysis?.kendall.tieCorrection)
  );
  const w = status.analysis?.kendall.w ?? 0;
  const formatted = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(w);
  check('angka Kendall W tampil di halaman', r.text.includes(formatted), formatted);
  check('peringkat A1 tampil pertama di Borda', /rank-badge--top[^>]*>1</.test(r.text));
}

// 5. Excel terunduh dan isinya sah
let workbookBuffer = null;
{
  const r = await request('/api/hasil/perbandingan.xlsx');
  check('unduhan Excel berhasil', r.status === 200, String(r.status));
  check(
    'content type xlsx',
    (r.headers.get('content-type') ?? '').includes('spreadsheetml.sheet'),
    r.headers.get('content-type') ?? '-'
  );
  const disposition = r.headers.get('content-disposition') ?? '';
  check('nama berkas disertakan', disposition.includes('telaah-perbandingan-'), disposition);
  check('berkas bukan kosong', r.buffer.length > 3000, r.buffer.length + ' byte');
  check('berkas berawalan ZIP', r.buffer.subarray(0, 2).toString('hex') === '504b', r.buffer.subarray(0, 2).toString('hex'));
  workbookBuffer = r.buffer;
}

// 6. Isi berkas Excel
{
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(workbookBuffer);

  const names = wb.worksheets.map((s) => s.name);
  check('lembar Ringkasan ada', names.includes('Ringkasan'), names.join(', '));
  check('lembar Peringkat ada', names.includes('Peringkat'));
  check('lembar Borda ada', names.includes('Borda'));
  check('lembar Spearman ada', names.includes('Spearman'));
  check('lembar Kendall ada', names.includes('Kendall'));

  const summary = wb.getWorksheet('Ringkasan');
  const wValue = summary.getCell('B4').value;
  const status = await compareLatestRuns(appDb);
  const expectedW = status.analysis?.kendall.w ?? 0;
  check('nilai W di Excel berupa angka', typeof wValue === 'number', typeof wValue);
  check(
    'nilai W di Excel cocok dengan analisis',
    typeof wValue === 'number' && Math.abs(wValue - expectedW) < 1e-9,
    String(wValue)
  );

  const borda = wb.getWorksheet('Borda');
  const firstCode = borda.getCell('B5').value;
  const firstPoints = borda.getCell('D5').value;
  check('baris Borda pertama berisi kode', firstCode === 'A1', String(firstCode));
  check('poin Borda berupa angka', typeof firstPoints === 'number', typeof firstPoints);

  const spearman = wb.getWorksheet('Spearman');
  const rho = spearman.getCell('C5').value;
  check('koefisien Spearman berupa angka', typeof rho === 'number', typeof rho);
  check('koefisien Spearman dalam rentang', typeof rho === 'number' && rho >= -1 && rho <= 1, String(rho));

  const kendall = wb.getWorksheet('Kendall');
  check('lembar Kendall memuat label W', kendall.getCell('A4').value === 'W', String(kendall.getCell('A4').value));
  check('lembar Kendall memuat koreksi seri', kendall.getCell('A6').value === 'Koreksi seri');
}

// 7. Data berbeda menahan perbandingan dan unduhan
{
  await connection.query('UPDATE criteria SET weight = 0.4000 WHERE code = ?', ['C1']);
  await connection.query('UPDATE criteria SET weight = 0.1500 WHERE code = ?', ['C2']);
  await request('/hitung/saw?_action=runs.save', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ method: 'saw' }),
  });

  const page = await request('/hasil/bandingkan');
  check('data berbeda: halaman menahan', page.text.includes('Perbandingan belum bisa ditampilkan'));
  check('data berbeda: menyebut sebabnya', page.text.includes('data yang berbeda'));
  check('data berbeda: tabel Borda disembunyikan', !page.text.includes('Peringkat gabungan Borda'));

  const xlsx = await request('/api/hasil/perbandingan.xlsx');
  check('data berbeda: unduhan ditolak', xlsx.status === 409, String(xlsx.status));
}

await appPool.end();
await connection.end();

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? 'SEMUA UJI HALAMAN PERBANDINGAN LOLOS' : failed + ' GAGAL'} (${results.length} butir)`);
process.exit(failed === 0 ? 0 : 1);