// Uji F10b: pemakaian skenario AHP pada perhitungan.
// Dijalankan: tsx scripts/verify-scenario-usage.mjs
// Prasyarat: dev server berjalan.

import mysql from 'mysql2/promise';
import 'dotenv/config';
import { ADMIN_USERNAME, ADMIN_PASSWORD } from './test-credentials.mjs';
import { createDatabase, createPool } from '../src/db/factory.ts';
import { loadMatrixCore, loadWeightOptionsCore } from '../src/lib/matrix-core.ts';
import { hashSnapshotData } from '../src/lib/snapshot.ts';

const base = process.env.VERIFY_BASE ?? 'http://localhost:4321';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL belum diisi');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  (' + detail + ')' : ''));
};

const appPool = createPool(databaseUrl);
const appDb = createDatabase(appPool);
const connection = await mysql.createConnection({ uri: databaseUrl, decimalNumbers: true });

/* ---------- Siapkan data: 4 kriteria, 3 alternatif ---------- */
{
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of [
    'pairwise_comparisons',
    'weight_scenarios',
    'scores',
    'rubrics',
    'alternatives',
    'criteria',
    'computation_results',
    'computation_runs',
  ]) {
    await connection.query(`TRUNCATE TABLE \`${table}\``);
  }
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');

  const now = new Date();
  const criteriaRows = [
    ['C1', 'Relevansi tema', '0.3000', 'benefit', 1],
    ['C2', 'Ketajaman metode', '0.2500', 'benefit', 2],
    ['C3', 'Ketersediaan data', '0.2000', 'benefit', 3],
    ['C4', 'Beban biaya', '0.2500', 'cost', 4],
  ];
  const ids = [];
  for (const [code, name, weight, direction, order] of criteriaRows) {
    const [res] = await connection.query(
      'INSERT INTO criteria (code, name, weight, direction, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [code, name, weight, direction, order, now, now]
    );
    ids.push(res.insertId);
  }

  const alternatives = [
    ['A1', 'Sistem rekomendasi beasiswa', [4, 3, 5, 2]],
    ['A2', 'Deteksi plagiarisme', [3, 5, 4, 3]],
    ['A3', 'Monitoring magang', [5, 4, 3, 1]],
  ];
  for (const [index, [code, title, values]] of alternatives.entries()) {
    const [res] = await connection.query(
      'INSERT INTO alternatives (code, title, student_name, nim, concentration, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
      [code, title, 'Mahasiswa ' + code, '211010' + index, 'RPL', now, now]
    );
    for (const [j, value] of values.entries()) {
      await connection.query(
        'INSERT INTO scores (alternative_id, criterion_id, rubric_id, value, updated_at) VALUES (?, ?, NULL, ?, ?)',
        [res.insertId, ids[j], value, now]
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
  return { status: r.status, text: await r.text(), location: r.headers.get('location') };
};

const login = await request('/api/auth/sign-in/username', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base },
  body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
});
check('login admin', login.status === 200, String(login.status));
if (login.status !== 200) process.exit(1);

/* ---------- 1. Tanpa skenario, pemilih kosong dan bobot dari kriteria ---------- */
{
  const options = await loadWeightOptionsCore(appDb);
  check('belum ada skenario layak', options.filter((o) => o.usable).length === 0, String(options.length));

  const matrix = await loadMatrixCore(appDb, { scenarioId: null });
  check('bobot dari kriteria', matrix.weightSource.source === 'criteria', matrix.weightSource.source);
  check('bobot sama dengan master', Math.abs(matrix.rawWeights[0] - 0.3) < 1e-9, String(matrix.rawWeights[0]));

  const page = await request('/hitung');
  check('halaman hitung menjelaskan belum ada skenario', page.text.includes('Belum ada skenario AHP yang layak'));
}

/* ---------- 2. Simpan skenario konsisten ---------- */
let goodId = null;
let badId = null;
{
  const r = await request('/ahp?_action=ahp.save', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ name: 'Skenario layak', upper: JSON.stringify([3, 5, 7, 4, 6, 2]) }),
  });
  check('simpan skenario layak', r.status === 200, String(r.status));

  const r2 = await request('/ahp?_action=ahp.save', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({
      name: 'Skenario tolak',
      upper: JSON.stringify([9, 9, 1 / 9, 9, 1 / 9, 9]),
    }),
  });
  check('simpan skenario tidak konsisten', r2.status === 200, String(r2.status));

  const options = await loadWeightOptionsCore(appDb);
  const usable = options.filter((o) => o.usable);
  check('satu skenario layak', usable.length === 1, String(usable.length));
  goodId = usable[0]?.id ?? null;
  badId = options.find((o) => !o.usable && o.name === 'Skenario tolak')?.id ?? null;
  check('skenario tidak konsisten tidak layak', badId !== null, String(badId));
}

/* ---------- 3. Bobot skenario dipakai ---------- */
let scenarioWeights = [];
{
  const matrix = await loadMatrixCore(appDb, { scenarioId: goodId });
  check('sumber bobot tercatat skenario', matrix.weightSource.source === 'scenario', matrix.weightSource.source);
  check('id skenario tercatat', matrix.weightSource.scenarioId === goodId, String(matrix.weightSource.scenarioId));
  check('nama skenario tercatat', matrix.weightSource.scenarioName === 'Skenario layak', String(matrix.weightSource.scenarioName));
  check('CR tercatat', (matrix.weightSource.scenarioCr ?? 1) < 0.1, String(matrix.weightSource.scenarioCr));
  check('bobot berjumlah 1', Math.abs(matrix.weightSum - 1) < 1e-6, String(matrix.weightSum));
  check('kriteria membawa bobot skenario', Math.abs(matrix.input.criteria[0].weight - matrix.rawWeights[0]) < 1e-12);

  scenarioWeights = matrix.rawWeights.slice();
  console.log('  bobot skenario:', scenarioWeights.map((w) => w.toFixed(4)).join(' / '));
}

/* ---------- 4. Skenario tidak konsisten ditolak ---------- */
{
  let error = null;
  try {
    await loadMatrixCore(appDb, { scenarioId: badId });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  check('skenario tidak konsisten ditolak', error !== null, error ?? 'tidak ada galat');

  let error2 = null;
  try {
    await loadMatrixCore(appDb, { scenarioId: 999999 });
  } catch (e) {
    error2 = e instanceof Error ? e.message : String(e);
  }
  check('skenario tidak ditemukan ditolak', error2 !== null, error2 ?? 'tidak ada galat');
}

/* ---------- 5. Halaman hitung membawa pilihan skenario ---------- */
{
  const page = await request('/hitung?skenario=' + goodId);
  check('halaman hitung dengan skenario terbuka', page.status === 200, String(page.status));
  check('menampilkan nama skenario aktif', page.text.includes('Skenario layak'));
  check('tautan hitung membawa skenario', page.text.includes('skenario=' + goodId));
  check('tidak ada peringatan penolakan', !page.text.includes('tidak dapat dipakai'));
}

/* ---------- 6. Halaman hitung menolak skenario tidak layak dengan penjelasan ---------- */
{
  const page = await request('/hitung?skenario=' + badId);
  check('halaman dengan skenario buruk tetap terbuka', page.status === 200, String(page.status));
  check('menampilkan peringatan', page.text.includes('tidak dapat dipakai'));
  check('menjelaskan sebabnya', page.text.includes('tidak konsisten'));
  check('jatuh ke bobot kriteria', page.text.includes('memakai bobot kriteria'));
}

/* ---------- 7. Halaman metode menghitung dengan skenario ---------- */
{
  const page = await request('/hitung/saw?skenario=' + goodId);
  check('halaman metode terbuka', page.status === 200, String(page.status));
  check('menampilkan asal bobot skenario', page.text.includes('Bobot skenario Skenario layak'));
}

/* ---------- 8. Simpan hasil mencatat asal bobot ---------- */
{
  const save = await request('/hitung/saw?skenario=' + goodId + '&_action=runs.save', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ method: 'saw', scenarioId: String(goodId) }),
  });
  check('simpan hasil dengan skenario', save.status === 200, String(save.status));

  const [rows] = await connection.query('SELECT id, snapshot, snapshot_hash FROM computation_runs ORDER BY id DESC LIMIT 1');
  check('run tersimpan', rows.length === 1, String(rows.length));

  const snapshot = typeof rows[0].snapshot === 'string' ? JSON.parse(rows[0].snapshot) : rows[0].snapshot;
  check('snapshot versi 2', snapshot.version === 2, String(snapshot.version));
  check('snapshot mencatat sumber skenario', snapshot.weightSource?.source === 'scenario', String(snapshot.weightSource?.source));
  check('snapshot mencatat id skenario', snapshot.weightSource?.scenarioId === goodId, String(snapshot.weightSource?.scenarioId));
  check('snapshot mencatat nama skenario', snapshot.weightSource?.scenarioName === 'Skenario layak');
  check(
    'bobot snapshot sama dengan bobot skenario',
    snapshot.criteria.every((c, i) => Math.abs(c.weight - scenarioWeights[i]) < 1e-9),
    snapshot.criteria.map((c) => c.weight.toFixed(4)).join(' / ')
  );

  const detail = await request('/hasil/' + rows[0].id);
  check('halaman hasil menampilkan asal bobot', detail.text.includes('Bobot berasal dari skenario AHP'));
  check('halaman hasil menampilkan nama skenario', detail.text.includes('Skenario layak'));
  check('halaman hasil menautkan skenario', detail.text.includes('/ahp/' + goodId));
  check('halaman hasil menampilkan CR', detail.text.includes('Consistency Ratio'));
}

/* ---------- 9. Hash data berbeda antara bobot kriteria dan skenario ---------- */
{
  const manual = await loadMatrixCore(appDb, { scenarioId: null });
  const scenario = await loadMatrixCore(appDb, { scenarioId: goodId });

  const contentOf = (m, method) => ({
    version: 2,
    method,
    criteria: m.input.criteria.map((c) => ({ code: c.code, name: c.name, weight: c.weight, direction: c.direction })),
    rawWeightSum: m.weightSum,
    weightSource: m.weightSource,
    alternatives: m.input.alternatives.map((a, i) => ({
      code: a.code,
      title: a.title,
      values: m.input.criteria.map((_, j) => m.input.values[i][j]),
    })),
    scores: {},
    ranking: [],
    warnings: [],
  });

  const manualHash = hashSnapshotData(contentOf(manual, 'saw'));
  const scenarioHash = hashSnapshotData(contentOf(scenario, 'saw'));
  check('hash data berbeda karena bobot berbeda', manualHash !== scenarioHash, manualHash.slice(0, 10) + ' vs ' + scenarioHash.slice(0, 10));

  // Hash data dari skenario yang sama harus identik walau metode berbeda.
  const scenarioTopsis = hashSnapshotData(contentOf(scenario, 'topsis'));
  check('hash data sama untuk metode berbeda pada skenario sama', scenarioHash === scenarioTopsis);
}

/* ---------- 10. Simpan hasil tanpa skenario mencatat sumber kriteria ---------- */
{
  const save = await request('/hitung/topsis?_action=runs.save', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ method: 'topsis', scenarioId: '' }),
  });
  check('simpan hasil tanpa skenario', save.status === 200, String(save.status));

  const [rows] = await connection.query('SELECT snapshot FROM computation_runs ORDER BY id DESC LIMIT 1');
  const snapshot = typeof rows[0].snapshot === 'string' ? JSON.parse(rows[0].snapshot) : rows[0].snapshot;
  check('snapshot mencatat sumber kriteria', snapshot.weightSource?.source === 'criteria', String(snapshot.weightSource?.source));
  check('snapshot tanpa id skenario', snapshot.weightSource?.scenarioId === null, String(snapshot.weightSource?.scenarioId));
}

/* ---------- 11. Verifikasi hash snapshot tetap utuh ---------- */
{
  const { verifySnapshotHash } = await import('../src/lib/snapshot.ts');
  const [rows] = await connection.query('SELECT snapshot, snapshot_hash FROM computation_runs');
  let valid = 0;
  for (const row of rows) {
    const snapshot = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot;
    if (verifySnapshotHash(snapshot, row.snapshot_hash)) valid++;
  }
  check('seluruh sidik snapshot cocok dengan isinya', valid === rows.length, valid + '/' + rows.length);
}

// Bersihkan dan pulihkan keadaan seed, supaya suite lain tidak terpengaruh.
await connection.query('DELETE FROM pairwise_comparisons');
await connection.query('DELETE FROM weight_scenarios');
await connection.query('DELETE FROM computation_results');
await connection.query('DELETE FROM computation_runs');
await connection.query('DELETE FROM scores');
await connection.query('DELETE FROM alternatives');
await connection.query('DELETE FROM rubrics');
await connection.query('DELETE FROM criteria');

{
  const now = new Date();
  const rows = [
    ['C1', 'Relevansi tema dan judul', '0.3000', 'benefit', 1],
    ['C2', 'Ketajaman metodologi', '0.2500', 'benefit', 2],
    ['C3', 'Ketersediaan data', '0.2000', 'benefit', 3],
    ['C4', 'Beban biaya dan waktu', '0.2500', 'cost', 4],
  ];
  const scale = [
    ['Sangat kurang', '1.0000'],
    ['Kurang', '2.0000'],
    ['Cukup', '3.0000'],
    ['Baik', '4.0000'],
    ['Sangat baik', '5.0000'],
  ];

  for (const [code, name, weight, direction, order] of rows) {
    const [res] = await connection.query(
      'INSERT INTO criteria (code, name, weight, direction, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [code, name, weight, direction, order, now, now]
    );
    for (const [index, [label, value]] of scale.entries()) {
      await connection.query(
        'INSERT INTO rubrics (criterion_id, label, value, sort_order) VALUES (?, ?, ?, ?)',
        [res.insertId, label, value, index + 1]
      );
    }
  }
  console.log('kriteria dan rubrik seed dipulihkan');
}

await appPool.end();
await connection.end();

const failed = results.filter((r) => !r.ok).length;
console.log('\n' + (failed === 0 ? 'SEMUA UJI PEMAKAIAN SKENARIO LOLOS' : failed + ' GAGAL') + ' (' + results.length + ' butir)');
process.exit(failed === 0 ? 0 : 1);