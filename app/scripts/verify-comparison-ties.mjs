// Uji jalur seri pada halaman perbandingan: memastikan catatan koreksi seri
// muncul saat memang ada seri, bukan hanya saat tidak ada.
// Dijalankan: tsx scripts/verify-comparison-ties.mjs

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

// Data yang memaksa seri: dua alternatif identik.
{
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of ['scores', 'rubrics', 'alternatives', 'criteria', 'computation_results', 'computation_runs']) {
    await connection.query(`TRUNCATE TABLE \`${table}\``);
  }
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');

  const now = new Date();
  const criteriaRows = [
    ['C1', 'Relevansi', '0.5000', 'benefit'],
    ['C2', 'Beban', '0.5000', 'cost'],
  ];
  const criterionIds = [];
  for (const [index, [code, name, weight, direction]] of criteriaRows.entries()) {
    const [res] = await connection.query(
      'INSERT INTO criteria (code, name, weight, direction, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [code, name, weight, direction, index + 1, now, now]
    );
    criterionIds.push(res.insertId);
  }

  // A1 dan A2 identik, A3 berbeda jauh.
  const alternatives = [
    ['A1', 'Proposal kembar satu', [3, 3]],
    ['A2', 'Proposal kembar dua', [3, 3]],
    ['A3', 'Proposal unggul', [5, 1]],
  ];
  const alternativeIds = [];
  for (const [index, [code, title, values]] of alternatives.entries()) {
    const [res] = await connection.query(
      'INSERT INTO alternatives (code, title, student_name, nim, concentration, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
      [code, title, 'Mahasiswa ' + code, '211010' + index, 'RPL', now, now]
    );
    alternativeIds.push(res.insertId);
    for (const [j, value] of values.entries()) {
      await connection.query(
        'INSERT INTO scores (alternative_id, criterion_id, rubric_id, value, updated_at) VALUES (?, ?, NULL, ?, ?)',
        [res.insertId, criterionIds[j], value, now]
      );
    }
  }
  console.log('data seri ditanam: A1 dan A2 identik');
}

// Login
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
  return { status: r.status, text: await r.text() };
};

const login = await request('/api/auth/sign-in/username', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base },
  body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
});
check('login admin', login.status === 200, String(login.status));
if (login.status !== 200) process.exit(1);

for (const method of ['saw', 'wp', 'topsis', 'waspas', 'moora', 'copras', 'vikor', 'edas', 'aras', 'mabac', 'smart']) {
  const r = await request(`/hitung/${method}?_action=runs.save`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ method }),
  });
  check('simpan ' + method.toUpperCase(), r.status === 200, String(r.status));
}

// Seri harus terdeteksi oleh engine
{
  const status = await compareLatestRuns(appDb);
  const analysis = status.analysis;
  check('analisis terbentuk pada data seri', analysis !== null, String(analysis !== null));
  check('koreksi seri lebih dari nol', (analysis?.kendall.tieCorrection ?? 0) > 0, String(analysis?.kendall.tieCorrection));
  check('W tetap dalam rentang', (analysis?.kendall.w ?? -1) >= 0 && (analysis?.kendall.w ?? 2) <= 1, String(analysis?.kendall.w));
  check('ada peringatan seri', (analysis?.warnings ?? []).some((w) => w.toLowerCase().includes('seri')));

  const bordered = analysis?.borda.filter((row) => row.tied) ?? [];
  check('Borda menandai alternatif seri', bordered.length >= 2, String(bordered.length));
}

// Halaman harus menyebut koreksi seri
{
  const r = await request('/hasil/bandingkan');
  check('halaman terbuka pada data seri', r.status === 200, String(r.status));
  check('halaman menampilkan catatan koreksi seri', r.text.includes('Koreksi seri diterapkan'));
  check('halaman menampilkan penanda seri', r.text.includes('seri'));
}

await appPool.end();
await connection.end();

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? 'SEMUA UJI SERI LOLOS' : failed + ' GAGAL'} (${results.length} butir)`);
process.exit(failed === 0 ? 0 : 1);
