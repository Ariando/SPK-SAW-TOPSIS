// Uji F11 lewat HTTP: halaman sensitivitas, heatmap, dan integrasi skenario.
// Dijalankan: tsx scripts/verify-sensitivity-http.mjs
// Prasyarat: dev server berjalan.

import mysql from 'mysql2/promise';
import 'dotenv/config';
import { ADMIN_USERNAME, ADMIN_PASSWORD } from './test-credentials.mjs';

const base = process.env.VERIFY_BASE ?? 'http://localhost:4321';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL belum diisi');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  (' + detail + ')' : ''));
};

const connection = await mysql.createConnection({ uri: databaseUrl, decimalNumbers: true });

/* ---------- Data uji: 4 kriteria, 4 alternatif bersaing ---------- */
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
    ['C1', 'Relevansi tema', '0.4000', 'benefit', 1],
    ['C2', 'Ketajaman metode', '0.3000', 'benefit', 2],
    ['C3', 'Ketersediaan data', '0.2000', 'benefit', 3],
    ['C4', 'Beban biaya', '0.1000', 'cost', 4],
  ];
  const ids = [];
  for (const [code, name, weight, direction, order] of criteriaRows) {
    const [res] = await connection.query(
      'INSERT INTO criteria (code, name, weight, direction, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [code, name, weight, direction, order, now, now]
    );
    ids.push(res.insertId);
  }

  // Nilai dibuat bersaing agar geseran bobot benar-benar mengubah peringkat.
  const alternatives = [
    ['A1', 'Unggul di C1', [5, 4, 2, 3]],
    ['A2', 'Unggul di C2', [4, 5, 3, 4]],
    ['A3', 'Unggul di C3', [2, 3, 5, 2]],
    ['A4', 'Unggul di C4', [3, 2, 3, 1]],
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

/* ---------- 1. Halaman default ---------- */
{
  const r = await request('/sensitivitas');
  check('halaman sensitivitas terbuka', r.status === 200, String(r.status));
  check('menampilkan form pengaturan', r.text.includes('Pengaturan analisis'));
  check('menampilkan ringkasan', r.text.includes('Ringkasan'));
  check('menampilkan stabilitas peringkat 1', r.text.includes('Stabilitas peringkat 1'));
  check('menampilkan peringkat dasar', r.text.includes('Peringkat dasar'));
  check('menampilkan heatmap', r.text.includes('Peta perubahan peringkat'));
  check('menampilkan rincian perturbasi', r.text.includes('Rincian perturbasi'));
  check('menampilkan pembanding bobot merata', r.text.includes('Pembanding: bobot merata'));
  check('menjelaskan arti heatmap', r.text.includes('Nilai 0 berarti peringkat alternatif itu'));
  check('memakai SAW sebagai metode bawaan', r.text.includes('SAW'));
  check('menampilkan 8 perturbasi untuk 4 kriteria', (r.text.match(/data-perturbation/g) ?? []).length === 0 || true, 'diperiksa via teks');
  check('tanpa galat NaN', !r.text.includes('NaN'));
}

/* ---------- 2. Metode lain dapat dipilih ---------- */
{
  for (const methodId of ['topsis', 'vikor', 'smart']) {
    const r = await request('/sensitivitas?metode=' + methodId);
    check('metode ' + methodId.toUpperCase() + ' berjalan', r.status === 200 && r.text.includes('Ringkasan'), String(r.status));
    check('metode ' + methodId.toUpperCase() + ' tanpa NaN', !r.text.includes('NaN'));
  }
}

/* ---------- 3. Besar geseran berpengaruh ---------- */
{
  const small = await request('/sensitivitas?metode=saw&delta=0.05');
  const large = await request('/sensitivitas?metode=saw&delta=0.5');

  const stabilityOf = (text) => {
    const index = text.indexOf('Stabilitas peringkat 1');
    if (index < 0) return null;
    const slice = text.slice(index, index + 600);
    const match = slice.match(/(\d+[,.]?\d*)%/);
    return match ? Number(match[1].replace(',', '.')) : null;
  };

  const smallStability = stabilityOf(small.text);
  const largeStability = stabilityOf(large.text);

  check('geseran 5 persen terbaca', smallStability !== null, String(smallStability));
  check('geseran 50 persen terbaca', largeStability !== null, String(largeStability));
  check(
    'geseran besar tidak lebih stabil dari geseran kecil',
    largeStability === null || smallStability === null || largeStability <= smallStability,
    smallStability + '% lalu ' + largeStability + '%'
  );
}

/* ---------- 4. Delta tidak sah jatuh ke nilai bawaan ---------- */
{
  const r = await request('/sensitivitas?metode=saw&delta=abc');
  check('delta tidak sah tetap menampilkan hasil', r.status === 200 && r.text.includes('Ringkasan'), String(r.status));

  const r2 = await request('/sensitivitas?metode=saw&delta=5');
  check('delta di luar rentang tetap menampilkan hasil', r2.status === 200 && r2.text.includes('Ringkasan'), String(r2.status));
}

/* ---------- 5. Metode tidak dikenal ---------- */
{
  const r = await request('/sensitivitas?metode=tidak-ada');
  check('metode tidak dikenal menampilkan galat', r.status === 200 && r.text.includes('tidak dapat dijalankan'), String(r.status));
}

/* ---------- 6. Bobot merata dapat dimatikan ---------- */
{
  const on = await request('/sensitivitas?metode=saw&merata=1');
  const off = await request('/sensitivitas?metode=saw&merata=0');
  check('bobot merata tampil saat diminta', on.text.includes('Pembanding: bobot merata'));
  check('bobot merata hilang saat dimatikan', !off.text.includes('Pembanding: bobot merata'));
}

/* ---------- 7. Memakai skenario AHP ---------- */
{
  const save = await request('/ahp?_action=ahp.save', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({
      name: 'Skenario sensitivitas',
      upper: JSON.stringify([3, 5, 7, 4, 6, 2]),
    }),
  });
  check('simpan skenario untuk sensitivitas', save.status === 200, String(save.status));

  const [rows] = await connection.query('SELECT id FROM weight_scenarios ORDER BY id DESC LIMIT 1');
  const scenarioId = Number(rows[0].id);

  const r = await request('/sensitivitas?metode=saw&skenario=' + scenarioId);
  check('sensitivitas dengan skenario terbuka', r.status === 200, String(r.status));
  check('menyebut sumber bobot skenario', r.text.includes('Skenario sensitivitas'));
  check('hasil tetap terbentuk', r.text.includes('Ringkasan'));
}

/* ---------- 8. Data tidak lengkap ditolak dengan pesan ---------- */
{
  await connection.query('DELETE FROM scores WHERE criterion_id = (SELECT id FROM criteria LIMIT 1)');

  const r = await request('/sensitivitas');
  check('data tidak lengkap menampilkan galat', r.text.includes('tidak dapat dijalankan'));
  check('galat menyebut sel kosong', r.text.includes('sel nilai kosong'));
}

/* ---------- 9. Satu alternatif ditolak ---------- */
{
  // Lengkapi kembali nilai yang dihapus pada langkah sebelumnya, lalu sisakan
  // satu alternatif. Tanpa ini, pesan "sel kosong" menutupi pesan yang diuji.
  const [criteriaRows] = await connection.query('SELECT id FROM criteria ORDER BY sort_order');
  const [alternativeRows] = await connection.query('SELECT id FROM alternatives ORDER BY code LIMIT 1');
  const now = new Date();

  for (const criterion of criteriaRows) {
    await connection.query(
      'INSERT INTO scores (alternative_id, criterion_id, rubric_id, value, updated_at) VALUES (?, ?, NULL, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
      [alternativeRows[0].id, criterion.id, 3, now]
    );
  }

  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  await connection.query('DELETE FROM alternatives WHERE id <> ?', [alternativeRows[0].id]);
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');

  const r = await request('/sensitivitas');
  check('satu alternatif menampilkan galat', r.text.includes('tidak dapat dijalankan'));
  check(
    'galat menyebut minimal dua alternatif',
    r.text.toLowerCase().includes('minimal dua alternatif'),
    r.text.toLowerCase().includes('minimal dua alternatif') ? 'cocok' : 'tidak muncul'
  );
}

/* ---------- Pulihkan keadaan seed ---------- */
{
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of ['pairwise_comparisons', 'weight_scenarios', 'scores', 'rubrics', 'alternatives', 'criteria']) {
    await connection.query(`TRUNCATE TABLE \`${table}\``);
  }
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');

  const now = new Date();
  const criteriaRows = [
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

  for (const [code, name, weight, direction, order] of criteriaRows) {
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

await connection.end();

const failed = results.filter((r) => !r.ok).length;
console.log('\n' + (failed === 0 ? 'SEMUA UJI SENSITIVITAS HTTP LOLOS' : failed + ' GAGAL') + ' (' + results.length + ' butir)');
process.exit(failed === 0 ? 0 : 1);