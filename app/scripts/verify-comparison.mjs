// Uji pengaman Opsi A: perbandingan hanya boleh berjalan bila ketiga metode
// punya hasil tersimpan dari data yang sama.
// Dijalankan: node scripts/verify-comparison.mjs
// Prasyarat: dev server berjalan, DB sudah di-seed.

import fs from 'node:fs';
import mysql from 'mysql2/promise';
import 'dotenv/config';
import { ADMIN_USERNAME, ADMIN_PASSWORD } from './test-credentials.mjs';
import { createDatabase, createPool } from '../src/db/factory.ts';
import { compareLatestRuns } from '../src/lib/comparison.ts';

const base = process.env.VERIFY_BASE ?? 'http://localhost:1111';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL belum diisi');

// Modul perbandingan menerima instance database, jadi uji memakai koneksi
// sendiri, bukan runtime Astro.
const appPool = createPool(databaseUrl);
const appDb = createDatabase(appPool);
const importCompatibility = async () => ({ compareLatestRuns: () => compareLatestRuns(appDb) });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
};

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

  console.log('dataset F0 ditanam: ' + fixture.alternatives.length + ' alternatif, ' + fixture.criteria.length + ' kriteria');
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

const saveRun = (method) =>
  request(`/hitung/${method}?_action=runs.save`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ method }),
  });

// 1. Tanpa hasil tersimpan, perbandingan belum siap
{
  const module = await importCompatibility();
  const status = await module.compareLatestRuns();
  check('belum ada run: complete false', status.complete === false);
  check('belum ada run: alternatif tidak dibandingkan', status.analysis === null);
check(
    'belum ada run: menyebut semua metode terdaftar',
    status.missingMethods.length === 11,
    status.missingMethods.join(', ')
  );
  check('belum ada run: ada pesan penghalang', status.blockers.length > 0);
}

// 2. Simpan hanya satu metode
{
  const r = await saveRun('saw');
  check('simpan SAW', r.status === 200, String(r.status));

  const module = await importCompatibility();
  const status = await module.compareLatestRuns();
  check('satu run: complete false', status.complete === false);
  check('satu run: metode kurang sepuluh', status.missingMethods.length === 10, status.missingMethods.join(', '));
}

// 3. Simpan ketiga metode dari data yang sama
{
  for (const m of ['wp', 'topsis', 'waspas', 'moora', 'copras', 'vikor', 'edas', 'aras', 'mabac', 'smart']) {
    const r = await saveRun(m);
    check('simpan ' + m.toUpperCase(), r.status === 200, String(r.status));
  }

  const module = await importCompatibility();
  const status = await module.compareLatestRuns();
  check('sebelas run: complete true', status.complete === true);
  check('sebelas run: data sama', status.sameData === true);
  check('sebelas run: tidak ada penghalang', status.blockers.length === 0, status.blockers.join(' | '));
  check('sebelas run: analisis terbentuk', status.analysis !== null);

  const analysis = status.analysis;
  check('Borda memuat 4 alternatif', analysis?.borda.length === 4, String(analysis?.borda.length));
  check('Spearman memuat 55 pasangan', analysis?.spearman.pairs.length === 55, String(analysis?.spearman.pairs.length));
  check(
    'Kendall W berada di rentang 0 sampai 1',
    analysis !== null && analysis.kendall.w !== null && analysis.kendall.w >= 0 && analysis.kendall.w <= 1,
    String(analysis?.kendall.w)
  );
  check('Kendall S positif', (analysis?.kendall.s ?? 0) > 0, String(analysis?.kendall.s));

  // Fixture F0: peringkat SAW 1-3-2-4, WP 1-2-3-4, TOPSIS 1-2-3-4.
  const sawRank = analysis?.methods.find((m) => m.methodId === 'saw')?.averageRanks ?? [];
  const wpRank = analysis?.methods.find((m) => m.methodId === 'wp')?.averageRanks ?? [];
  check(
    'peringkat SAW sesuai fixture',
    JSON.stringify(sawRank) === JSON.stringify([1, 3, 2, 4]),
    JSON.stringify(sawRank)
  );
  check('peringkat WP sesuai fixture', JSON.stringify(wpRank) === JSON.stringify([1, 2, 3, 4]), JSON.stringify(wpRank));
  check(
    'Borda menempatkan A1 pertama',
    analysis?.borda[0]?.code === 'A1',
    String(analysis?.borda[0]?.code)
  );
}

// 4. Ubah data lalu simpan satu metode: data jadi tidak sebanding
{
  await connection.query('UPDATE criteria SET weight = 0.4000 WHERE code = ?', ['C1']);
  await connection.query('UPDATE criteria SET weight = 0.1500 WHERE code = ?', ['C2']);

  const r = await saveRun('saw');
  check('simpan SAW setelah bobot diubah', r.status === 200, String(r.status));

  const module = await importCompatibility();
  const status = await module.compareLatestRuns();
  check('data berbeda: complete true tapi sameData false', status.complete === true && status.sameData === false);
  check('data berbeda: analisis ditahan', status.analysis === null);
  check(
    'data berbeda: pesan menjelaskan cara memperbaiki',
    status.blockers.some((b) => b.includes('data yang berbeda')),
    status.blockers.join(' | ').slice(0, 120)
  );
}

// 5. Samakan lagi: hitung ulang ketiga metode
{
  for (const m of ['wp', 'topsis', 'waspas', 'moora', 'copras', 'vikor', 'edas', 'aras', 'mabac', 'smart']) {
    await saveRun(m);
  }

  const module = await importCompatibility();
  const status = await module.compareLatestRuns();
  check('setelah dihitung ulang: sameData true', status.sameData === true);
  check('setelah dihitung ulang: analisis kembali tersedia', status.analysis !== null);
}

// 6. Rusak isi snapshot satu run: hash tidak valid
{
  const [rows] = await connection.query('SELECT id, snapshot FROM computation_runs ORDER BY id DESC LIMIT 1');
  const snapshot = typeof rows[0].snapshot === 'string' ? JSON.parse(rows[0].snapshot) : rows[0].snapshot;
  snapshot.ranking[0].value = 0.999999;
  await connection.query('UPDATE computation_runs SET snapshot = ? WHERE id = ?', [
    JSON.stringify(snapshot),
    rows[0].id,
  ]);

  const module = await importCompatibility();
  const status = await module.compareLatestRuns();
  check('hash tidak valid: terdeteksi', status.invalidHashMethods.length === 1, status.invalidHashMethods.join(', '));
  check('hash tidak valid: analisis ditahan', status.analysis === null);
  check(
    'hash tidak valid: pesan menjelaskan',
    status.blockers.some((b) => b.includes('tidak dapat dipercaya')),
    status.blockers.join(' | ').slice(0, 120)
  );
}

await appPool.end();
await connection.end();

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? 'SEMUA UJI PERBANDINGAN LOLOS' : failed + ' GAGAL'} (${results.length} butir)`);
process.exit(failed === 0 ? 0 : 1);
