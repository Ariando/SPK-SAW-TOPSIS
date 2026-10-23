// Uji P1a: sidik snapshot harus mencerminkan isi, bukan waktu penyimpanan.
// Dijalankan: node scripts/verify-snapshot-hash.mjs [baseUrl]
// Prasyarat: dev server berjalan, DB sudah di-seed, dataset F0 tertanam.

import fs from 'node:fs';
import mysql from 'mysql2/promise';
import 'dotenv/config';
import { hashSnapshot, splitSnapshot } from '../src/lib/snapshot.ts';

const base = process.env.VERIFY_BASE ?? 'http://localhost:4321';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL belum diisi');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
};

// 1. Tanam dataset F0 supaya isi snapshot pasti
{
  const fixture = JSON.parse(
    fs.readFileSync(new URL('../../docs/reference/dataset-demo-f0.json', import.meta.url), 'utf8')
  );

  const connection = await mysql.createConnection({ uri: databaseUrl });
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
      [a.code, a.title, 'Mahasiswa ' + a.code, '2110100' + (index + 1), 'Rekayasa Perangkat Lunak', now, now]
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

  await connection.end();
  console.log('dataset F0 ditanam ulang');
}

// 2. Login
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
  return { status: r.status, text: await r.text(), location: r.headers.get('location') };
};

const login = await request('/api/auth/sign-in/username', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base },
  body: JSON.stringify({ username: 'admin', password: 'TelaahAdmin2026' }),
});
if (login.status !== 200) {
  console.log('login gagal: ' + login.status);
  process.exit(1);
}

const saveTopsis = () =>
  request('/hitung/topsis?_action=runs.save', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ method: 'topsis' }),
  });

// 3. Simpan dua kali tanpa mengubah data
{
  const first = await saveTopsis();
  check('penyimpanan pertama berhasil', first.status === 200, String(first.status));

  await new Promise((resolve) => setTimeout(resolve, 1100));

  const second = await saveTopsis();
  check('penyimpanan kedua berhasil', second.status === 200, String(second.status));
}

// 4. Bandingkan hash dua run
{
  const connection = await mysql.createConnection({ uri: databaseUrl });
  const [rows] = await connection.query(
    'SELECT id, snapshot_hash, snapshot, created_at FROM computation_runs ORDER BY id ASC'
  );
  await connection.end();

  check('dua run tersimpan', rows.length === 2, String(rows.length));

  if (rows.length === 2) {
    const [a, b] = rows;
    check(
      'dua penyimpanan dengan data identik menghasilkan sidik sama',
      a.snapshot_hash === b.snapshot_hash,
      a.snapshot_hash.slice(0, 12) + ' vs ' + b.snapshot_hash.slice(0, 12)
    );
    check(
      'waktu simpan kedua run memang berbeda',
      new Date(a.created_at).getTime() !== new Date(b.created_at).getTime(),
      String(a.created_at) + ' vs ' + String(b.created_at)
    );

    // 5. Sidik tersimpan cocok dengan isi snapshot
    for (const row of rows) {
      const snapshot = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot;
      const recomputed = hashSnapshot(splitSnapshot(snapshot).content);
      check(
        'sidik tersimpan cocok dengan isi snapshot run ' + row.id,
        recomputed === row.snapshot_hash,
        recomputed.slice(0, 12)
      );
      check(
        'snapshot run ' + row.id + ' memuat nilai matriks',
        Array.isArray(snapshot.alternatives) &&
          snapshot.alternatives.length > 0 &&
          Array.isArray(snapshot.alternatives[0].values) &&
          snapshot.alternatives[0].values.length > 0,
        JSON.stringify(snapshot.alternatives?.[0]?.values ?? null)
      );
    }
  }
}

// 6. Halaman hasil menampilkan status cocok
{
  const list = await request('/hasil');
  const link = list.text.match(/href="\/hasil\/(\d+)"/);
  if (link?.[1]) {
    const detail = await request(`/hasil/${link[1]}`);
    check('halaman hasil menampilkan status sidik cocok', detail.text.includes('Cocok dengan isi snapshot'), String(detail.status));
    check(
      'halaman hasil menjelaskan waktu tidak ikut dihitung',
      detail.text.includes('Waktu penyimpanan dan catatan tidak ikut dihitung')
    );
  } else {
    check('tautan hasil ditemukan', false, '-');
  }
}

// 7. Mengubah isi snapshot di DB harus membuat verifikasi gagal
{
  const connection = await mysql.createConnection({ uri: databaseUrl });
  const [rows] = await connection.query('SELECT id, snapshot FROM computation_runs ORDER BY id ASC LIMIT 1');
  const snapshot = typeof rows[0].snapshot === 'string' ? JSON.parse(rows[0].snapshot) : rows[0].snapshot;
  snapshot.ranking[0].value = 0.123456;
  await connection.query('UPDATE computation_runs SET snapshot = ? WHERE id = ?', [
    JSON.stringify(snapshot),
    rows[0].id,
  ]);
  await connection.end();

  const detail = await request(`/hasil/${rows[0].id}`);
  check('halaman hasil menandai sidik tidak cocok setelah snapshot diubah', detail.text.includes('Tidak cocok dengan isi snapshot'));
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? 'SEMUA UJI SIDIK SNAPSHOT LOLOS' : failed + ' GAGAL'} (${results.length} butir)`);
process.exit(failed === 0 ? 0 : 1);