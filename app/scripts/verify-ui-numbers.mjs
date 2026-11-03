// Menanam dataset F0 ke database, lalu membandingkan angka yang dirender
// halaman /hitung dengan fixture. Dijalankan: node scripts/verify-ui-numbers.mjs
// Skrip ini menimpa kriteria, alternatif, dan nilai yang ada.

import fs from 'node:fs';
import mysql from 'mysql2/promise';
import 'dotenv/config';

import { ADMIN_USERNAME, ADMIN_PASSWORD } from './test-credentials.mjs';
const base = process.env.VERIFY_BASE ?? 'http://localhost:1111';
const fixture = JSON.parse(
  fs.readFileSync(new URL('../../docs/reference/dataset-demo-f0.json', import.meta.url), 'utf8')
);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL belum diisi di app/.env');

const connection = await mysql.createConnection({ uri: databaseUrl });

await connection.query('SET FOREIGN_KEY_CHECKS = 0');
for (const table of ['scores', 'rubrics', 'alternatives', 'criteria', 'computation_results', 'computation_runs']) {
  await connection.query(`TRUNCATE TABLE \`${table}\``);
}
await connection.query('SET FOREIGN_KEY_CHECKS = 1');

const now = new Date();
const criterionIds = new Map();
for (const [index, c] of fixture.criteria.entries()) {
  const [result] = await connection.query(
    'INSERT INTO criteria (code, name, weight, direction, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [c.code, c.name, c.weight, c.direction, index + 1, now, now]
  );
  criterionIds.set(c.code, result.insertId);
}

const alternativeIds = new Map();
for (const [index, a] of fixture.alternatives.entries()) {
  const [result] = await connection.query(
    'INSERT INTO alternatives (code, title, student_name, nim, concentration, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
    [a.code, a.title, 'Mahasiswa ' + a.code, '2110100' + (index + 1), 'Rekayasa Perangkat Lunak', now, now]
  );
  alternativeIds.set(a.code, result.insertId);
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
console.log('dataset F0 ditanam: ' + fixture.criteria.length + ' kriteria, ' + fixture.alternatives.length + ' alternatif');

// Login dan baca halaman hitung
const jar = new Map();
const store = (r) => {
  const list = r.headers.getSetCookie?.() ?? [r.headers.get('set-cookie')].filter(Boolean);
  for (const line of list) {
    const [p] = String(line).split(';');
    const i = p.indexOf('=');
    if (i > 0) jar.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
  }
};
const fetchWithJar = async (path, options = {}) => {
  const headers = { ...(options.headers ?? {}) };
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  if (cookie) headers.cookie = cookie;
  const r = await fetch(new URL(path, base), { ...options, headers, redirect: 'manual' });
  store(r);
  return { status: r.status, text: await r.text() };
};

const login = await fetchWithJar('/api/auth/sign-in/username', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base },
  body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
});
if (login.status !== 200) {
  console.log('login gagal: ' + login.status);
  process.exit(1);
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
};

const fixed4 = (n) =>
  new Intl.NumberFormat('id-ID', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(n);

for (const method of ['saw', 'wp', 'topsis']) {
  const page = await fetchWithJar(`/hitung/${method}`);
  check(`halaman ${method.toUpperCase()} terbuka`, page.status === 200, String(page.status));

  const expected = fixture.expected[method].v.map(fixed4);
  const missing = expected.filter((text) => !page.text.includes(text));
  check(
    `nilai ${method.toUpperCase()} cocok dengan fixture F0`,
    missing.length === 0,
    missing.length === 0 ? 'semua nilai tampil' : 'tidak ditemukan: ' + missing.join(', ')
  );

  // Fixture menyimpan peringkat per urutan alternatif. Tabel UI terurut menurut
  // peringkat, jadi yang dibandingkan adalah urutan kode hasil pengurutan itu.
  const expectedOrder = fixture.alternatives
    .map((a, i) => ({ code: a.code, rank: fixture.expected[method].rank[i].rank }))
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.code);

  const rankingSection = page.text.slice(page.text.indexOf('Peringkat akhir'));
  const renderedOrder = [...rankingSection.matchAll(/matrix-tag[^>]*>([A-Z]\d+)</g)]
    .map((m) => m[1])
    .slice(0, expectedOrder.length);

  check(
    `urutan peringkat ${method.toUpperCase()} cocok`,
    JSON.stringify(renderedOrder) === JSON.stringify(expectedOrder),
    'UI ' + renderedOrder.join('>') + ' | fixture ' + expectedOrder.join('>')
  );
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? 'ANGKA UI COCOK DENGAN FIXTURE F0' : failed + ' GAGAL'} (${results.length} butir)`);
process.exit(failed === 0 ? 0 : 1);