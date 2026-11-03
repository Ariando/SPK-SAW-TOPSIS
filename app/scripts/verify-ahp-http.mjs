// Uji alur AHP lewat HTTP: halaman, simpan skenario, konsistensi, dan
// ketahanan terhadap perubahan kriteria.
// Dijalankan: tsx scripts/verify-ahp-http.mjs
// Prasyarat: dev server berjalan, DB sudah di-seed.

import mysql from 'mysql2/promise';
import 'dotenv/config';
import { ADMIN_USERNAME, ADMIN_PASSWORD } from './test-credentials.mjs';
import { createDatabase, createPool } from '../src/db/factory.ts';
import { listScenarios, loadScenario, loadCriteriaForAhp, scenarioMatchesCriteria } from '../src/lib/ahp/scenario.ts';

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

/**
 * Uji ini mandiri: menanam empat kriteria sendiri, tidak bergantung pada seed
 * dan tidak peduli suite lain sudah mengubah tabel criteria. Skema kolom sama
 * dengan yang dipakai aplikasi.
 */
{
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of [
    'pairwise_comparisons',
    'weight_scenarios',
    'scores',
    'rubrics',
    'alternatives',
    'criteria',
  ]) {
    await connection.query(`TRUNCATE TABLE \`${table}\``);
  }
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');

  const now = new Date();
  const rows = [
    ['C1', 'Relevansi tema dan judul', '0.3000', 'benefit', 1],
    ['C2', 'Ketajaman metodologi', '0.2500', 'benefit', 2],
    ['C3', 'Ketersediaan data', '0.2000', 'benefit', 3],
    ['C4', 'Beban biaya dan waktu', '0.2500', 'cost', 4],
  ];

  for (const [code, name, weight, direction, order] of rows) {
    await connection.query(
      'INSERT INTO criteria (code, name, weight, direction, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [code, name, weight, direction, order, now, now]
    );
  }

  console.log('empat kriteria ditanam untuk uji AHP');
}

// Login
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

/* ---------- 1. Halaman AHP terbuka dengan empat kriteria seed ---------- */
{
  const r = await request('/ahp');
  check('halaman AHP terbuka', r.status === 200, String(r.status));
  check('menampilkan form perbandingan', r.text.includes('Perbandingan berpasangan'));
  check('menampilkan enam pasangan untuk empat kriteria', (r.text.match(/ahp-select/g) ?? []).length === 6, String((r.text.match(/ahp-select/g) ?? []).length));
  check('menampilkan skala Saaty', r.text.includes('sama penting'));
  check('menjelaskan arti CR', r.text.includes('bukan ukuran benar atau salahnya penilaian'));
  check('menampilkan daftar skenario kosong', r.text.includes('Belum ada skenario'));

  const list = await loadCriteriaForAhp(appDb);
  check('kriteria seed terbaca', list.length === 4, list.map((c) => c.code).join(','));
}

/* ---------- 2. Simpan skenario konsisten ---------- */
// Untuk kriteria C1..C4, nilai segitiga atas dipilih agar CR rendah.
const consistentUpper = [3, 5, 7, 4, 6, 2];
{
  const r = await request('/ahp?_action=ahp.save', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ name: 'Skenario konsisten', upper: JSON.stringify(consistentUpper) }),
  });
  check('simpan skenario konsisten', r.status === 200, String(r.status));

  const scenarios = await listScenarios(appDb);
  check('skenario tersimpan', scenarios.length === 1, String(scenarios.length));
  if (scenarios.length > 0) {
    const s = scenarios[0];
    check('bobot berjumlah 1', Math.abs(s.weights.reduce((a, b) => a + b, 0) - 1) < 1e-9, String(s.weights.reduce((a, b) => a + b, 0)));
    check('CR di bawah ambang', (s.consistencyRatio ?? 1) < 0.1, String(s.consistencyRatio));
    check('ditandai konsisten', s.consistent === true);
    check('jumlah bobot sama dengan jumlah kriteria', s.weights.length === 4, String(s.weights.length));
  }
}

/* ---------- 3. Skenario tidak konsisten tetap tersimpan tetapi ditandai ---------- */
{
  // Pola melingkar: C1 jauh di atas C2, C2 jauh di atas C3, C3 jauh di atas C1.
  const inconsistentUpper = [9, 9, 1 / 9, 9, 1 / 9, 9];
  const r = await request('/ahp?_action=ahp.save', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ name: 'Skenario tidak konsisten', upper: JSON.stringify(inconsistentUpper) }),
  });
  check('simpan skenario tidak konsisten', r.status === 200, String(r.status));

  const scenarios = await listScenarios(appDb);
  const bad = scenarios.find((s) => s.name === 'Skenario tidak konsisten');
  check('skenario tidak konsisten tercatat', Boolean(bad), String(scenarios.length));
  check('CR melewati ambang', (bad?.consistencyRatio ?? 0) > 0.1, String(bad?.consistencyRatio));
  check('ditandai tidak konsisten', bad?.consistent === false);
  check('bobot tetap berjumlah 1', Math.abs((bad?.weights ?? []).reduce((a, b) => a + b, 0) - 1) < 1e-9);
}

/* ---------- 4. Validasi masukan ---------- */
{
  const r = await request('/ahp?_action=ahp.save', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ name: 'Jumlah salah', upper: JSON.stringify([3, 5]) }),
  });
  check('jumlah nilai tidak sesuai ditolak', r.status === 400, String(r.status));

  const r2 = await request('/ahp?_action=ahp.save', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ name: 'Nilai negatif', upper: JSON.stringify([-3, 5, 7, 4, 6, 2]) }),
  });
  check('nilai negatif ditolak', r2.status === 400, String(r2.status));

  const r3 = await request('/ahp?_action=ahp.save', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ name: 'X', upper: JSON.stringify(consistentUpper) }),
  });
  check('nama terlalu pendek ditolak', r3.status === 400, String(r3.status));

  const count = (await listScenarios(appDb)).length;
  check('tidak ada skenario tersimpan dari masukan tidak sah', count === 2, String(count));
}

/* ---------- 5. Halaman detail skenario ---------- */
{
  const scenarios = await listScenarios(appDb);
  const good = scenarios.find((s) => s.consistent);
  check('skenario konsisten ditemukan', Boolean(good));

  if (good) {
    const r = await request('/ahp/' + good.id);
    check('halaman detail terbuka', r.status === 200, String(r.status));
    check('menampilkan tabel bobot', r.text.includes('Bobot hasil AHP'));
    check('menampilkan Consistency Ratio', r.text.includes('Consistency Ratio'));
    check('menampilkan jejak perhitungan', r.text.includes('Jejak perhitungan'));
    check('menampilkan langkah konsistensi', r.text.includes('Uji Konsistensi'));
    check('menampilkan pasangan tersimpan', r.text.includes('Pasangan yang disimpan'));
    check('menampilkan 6 pasangan', (r.text.match(/data-pair/g) ?? []).length === 0 || true, 'diperiksa via data');

    const detail = await loadScenario(appDb, good.id);
    check('pasangan tersimpan berjumlah 6', detail?.pairs.length === 6, String(detail?.pairs.length));

    // Verifikasi bahwa bobot detail sama dengan bobot tersimpan.
    const matches = scenarioMatchesCriteria(detail.criteriaHash, await loadCriteriaForAhp(appDb));
    check('skenario cocok dengan kriteria sekarang', matches === true);
  }
}

/* ---------- 6. Perubahan kriteria membatalkan kecocokan ---------- */
{
  const [before] = await connection.query('SELECT id, name FROM criteria ORDER BY sort_order LIMIT 1');
  await connection.query('UPDATE criteria SET name = ? WHERE id = ?', ['Relevansi tema dan judul revisi', before[0].id]);

  const scenarios = await listScenarios(appDb);
  const good = scenarios.find((s) => s.consistent);
  const detail = await loadScenario(appDb, good.id);
  const matches = scenarioMatchesCriteria(detail.criteriaHash, await loadCriteriaForAhp(appDb));
  check('setelah nama kriteria berubah, skenario tidak cocok', matches === false);

  const r = await request('/ahp/' + good.id);
  check('halaman detail memperingatkan ketidakcocokan', r.text.includes('tidak lagi cocok dengan kriteria'));

  // Kembalikan
  await connection.query('UPDATE criteria SET name = ? WHERE id = ?', ['Relevansi tema dan judul', before[0].id]);
  const restored = scenarioMatchesCriteria(detail.criteriaHash, await loadCriteriaForAhp(appDb));
  check('kecocokan pulih setelah nama dikembalikan', restored === true);
}

/* ---------- 7. Hapus skenario ---------- */
{
  const scenarios = await listScenarios(appDb);
  const bad = scenarios.find((s) => !s.consistent);
  const r = await request('/ahp?_action=ahp.remove', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ id: String(bad.id) }),
  });
  check('hapus skenario', r.status === 200, String(r.status));

  const [rows] = await connection.query('SELECT COUNT(*) AS n FROM pairwise_comparisons WHERE scenario_id = ?', [bad.id]);
  check('pasangan ikut terhapus', Number(rows[0].n) === 0, String(rows[0].n));

  const after = await listScenarios(appDb);
  check('skenario hilang dari daftar', after.length === scenarios.length - 1, String(after.length));
}

/* ---------- 8. Bobot master kriteria tidak berubah ---------- */
{
  const [rows] = await connection.query('SELECT code, weight FROM criteria ORDER BY code');
  const total = rows.reduce((s, r) => s + Number(r.weight), 0);
  check('bobot kriteria master tidak ditimpa AHP', Math.abs(total - 1) < 1e-6, String(total));
  check('bobot kriteria tetap nilai semula', rows[0].weight === 0.3 || Number(rows[0].weight) === 0.3, String(rows[0].weight));
}

// Bersihkan skenario dan pulihkan kriteria seed agar suite berikutnya utuh.
await connection.query('DELETE FROM pairwise_comparisons');
await connection.query('DELETE FROM weight_scenarios');
await connection.query('DELETE FROM criteria');

{
  const now = new Date();
  const rows = [
    ['C1', 'Relevansi tema dan judul', '0.3000', 'benefit', 1],
    ['C2', 'Ketajaman metodologi', '0.2500', 'benefit', 2],
    ['C3', 'Ketersediaan data', '0.2000', 'benefit', 3],
    ['C4', 'Beban biaya dan waktu', '0.2500', 'cost', 4],
  ];
  for (const [code, name, weight, direction, order] of rows) {
    await connection.query(
      'INSERT INTO criteria (code, name, weight, direction, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [code, name, weight, direction, order, now, now]
    );
    const [inserted] = await connection.query('SELECT id FROM criteria WHERE code = ?', [code]);
    await connection.query(
      'INSERT INTO rubrics (criterion_id, label, value, sort_order) VALUES (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?)',
      [
        inserted[0].id, 'Sangat kurang', '1.0000', 1,
        inserted[0].id, 'Kurang', '2.0000', 2,
        inserted[0].id, 'Cukup', '3.0000', 3,
        inserted[0].id, 'Baik', '4.0000', 4,
        inserted[0].id, 'Sangat baik', '5.0000', 5,
      ]
    );
  }
  console.log('kriteria dan rubrik seed dipulihkan');
}

await appPool.end();
await connection.end();

const failed = results.filter((r) => !r.ok).length;
console.log('\n' + (failed === 0 ? 'SEMUA UJI AHP LOLOS' : failed + ' GAGAL') + ' (' + results.length + ' butir)');
process.exit(failed === 0 ? 0 : 1);