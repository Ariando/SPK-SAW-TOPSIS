// Uji P3: paginasi riwayat dan deteksi ketidakcocokan tabel hasil.
// Dijalankan: node scripts/verify-history-paging.mjs [baseUrl]
// Prasyarat: dev server berjalan, DB sudah di-seed, dataset F0 tertanam.

import fs from 'node:fs';
import mysql from 'mysql2/promise';
import 'dotenv/config';
import { hashSnapshot } from '../src/lib/snapshot.ts';

import { ADMIN_USERNAME, ADMIN_PASSWORD } from './test-credentials.mjs';
const base = process.env.VERIFY_BASE ?? 'http://localhost:4321';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL belum diisi');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
};

const connection = await mysql.createConnection({ uri: databaseUrl, decimalNumbers: true });

// 1. Siapkan data: kriteria, alternatif, nilai dari fixture F0
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

  globalThis.__fixture = fixture;
  globalThis.__altIds = alternativeIds;
  console.log('dataset F0 ditanam: ' + fixture.alternatives.length + ' alternatif');
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
  return { status: r.status, text: await r.text() };
};

const login = await request('/api/auth/sign-in/username', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base },
  body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
});
check('login admin', login.status === 200, String(login.status));
if (login.status !== 200) process.exit(1);

// 3. Buat 25 run lewat aksi simpan, bergantian metode
const methods = ['saw', 'wp', 'topsis'];
{
  let ok = 0;
  for (let i = 0; i < 25; i++) {
    const r = await request(`/hitung/${methods[i % 3]}?_action=runs.save`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
      body: new URLSearchParams({ method: methods[i % 3], note: 'catatan ' + (i + 1) }),
    });
    if (r.status === 200) ok++;
    else console.log('  gagal simpan ke-' + (i + 1) + ': ' + r.status);
  }
  check('25 run tersimpan', ok === 25, ok + '/25');
}

const [totalRows] = await connection.query('SELECT COUNT(*) AS n FROM computation_runs');
check('jumlah run di database 25', Number(totalRows[0].n) === 25, String(totalRows[0].n));

// 4. Halaman pertama menampilkan 20 baris
{
  const r = await request('/hasil');
  const rows = (r.text.match(/data-run-id="/g) ?? []).length;
  check('halaman 1 terbuka', r.status === 200, String(r.status));
  check('halaman 1 menampilkan 20 baris', rows === 20, String(rows));
  check('halaman 1 menyebut total 25', r.text.includes('dari 25 catatan'));
  check('halaman 1 menyebut halaman 1 dari 2', r.text.includes('Halaman 1 dari 2'));
  check('tombol sebelumnya nonaktif di halaman 1', r.text.includes('aria-disabled="true"'));
  check('tautan berikutnya ada', r.text.includes('/hasil?halaman=2'));
}

// 5. Halaman kedua menampilkan 5 baris
{
  const r = await request('/hasil?halaman=2');
  const rows = (r.text.match(/data-run-id="/g) ?? []).length;
  check('halaman 2 terbuka', r.status === 200, String(r.status));
  check('halaman 2 menampilkan 5 baris', rows === 5, String(rows));
  check('halaman 2 menyebut halaman 2 dari 2', r.text.includes('Halaman 2 dari 2'));
  check('tautan sebelumnya ada di halaman 2', r.text.includes('rel="prev"'));
  check('tidak ada tautan berikutnya di halaman 2', !r.text.includes('/hasil?halaman=3'));
}

// 6. Halaman di luar rentang dijepit ke halaman terakhir
{
  const r = await request('/hasil?halaman=99');
  const rows = (r.text.match(/data-run-id="/g) ?? []).length;
  check('halaman 99 dijepit ke halaman terakhir', r.status === 200 && rows === 5, String(rows));
  check('halaman 99 tetap dianggap halaman 2', r.text.includes('Halaman 2 dari 2'));
}

// 7. Nilai halaman tidak sah tidak membuat galat
for (const bad of ['abc', '-5', '0', '']) {
  const r = await request(`/hasil?halaman=${encodeURIComponent(bad)}`);
  const rows = (r.text.match(/data-run-id="/g) ?? []).length;
  check(
    'halaman tidak sah "' + (bad || 'kosong') + '" jatuh ke halaman 1',
    r.status === 200 && rows === 20,
    r.status + ', baris ' + rows
  );
}

// 8. Tidak ada run yang terlewat antar halaman
{
  const first = await request('/hasil');
  const second = await request('/hasil?halaman=2');
  const idsOf = (text) => [...text.matchAll(/data-run-id="(\d+)"/g)].map((m) => m[1]);
  const all = [...idsOf(first.text), ...idsOf(second.text)];
  const unique = new Set(all);
  check('tidak ada duplikat antar halaman', all.length === unique.size, all.length + ' baris, ' + unique.size + ' unik');
  check('seluruh 25 run terjangkau', unique.size === 25, String(unique.size));
}

// 9. Tabel hasil cocok dengan snapshot setelah penyimpanan normal
{
  const [runs] = await connection.query('SELECT id FROM computation_runs ORDER BY id DESC LIMIT 1');
  const r = await request(`/hasil/${runs[0].id}`);
  check('halaman detail menyatakan tabel hasil cocok', r.text.includes('cocok dengan isi snapshot'), String(r.status));
}

// 10. Ketidakcocokan tabel hasil terdeteksi
{
  const [runs] = await connection.query('SELECT id, snapshot FROM computation_runs ORDER BY id DESC LIMIT 1');
  await connection.query(
    'UPDATE computation_results SET score = score + 0.5 WHERE run_id = ? ORDER BY rank_no ASC LIMIT 1',
    [runs[0].id]
  );

  const r = await request(`/hasil/${runs[0].id}`);
  check('ketidakcocokan tabel hasil dilaporkan', r.text.includes('Tabel hasil tidak cocok dengan snapshot'));
  check('pesan menyebut tampilan memakai snapshot', r.text.includes('memakai isi snapshot'));

  // Kembalikan agar pemeriksaan berikutnya bersih
  const snapshot = typeof runs[0].snapshot === 'string' ? JSON.parse(runs[0].snapshot) : runs[0].snapshot;
  await connection.query('DELETE FROM computation_results WHERE run_id = ?', [runs[0].id]);
  for (const entry of snapshot.ranking) {
    const altId = globalThis.__altIds.get(entry.code);
    await connection.query(
      'INSERT INTO computation_results (run_id, alternative_id, score, rank_no, tied) VALUES (?, ?, ?, ?, ?)',
      [runs[0].id, altId, entry.value.toFixed(10), entry.rank, entry.tied ? 1 : 0]
    );
  }

  const after = await request(`/hasil/${runs[0].id}`);
  check('laporan hilang setelah tabel hasil diperbaiki', !after.text.includes('Tabel hasil tidak cocok'));
}

// 11. Hash tidak terpengaruh jumlah run
{
  const [first] = await connection.query('SELECT snapshot, snapshot_hash FROM computation_runs ORDER BY id ASC LIMIT 1');
  const [last] = await connection.query('SELECT snapshot, snapshot_hash FROM computation_runs ORDER BY id DESC LIMIT 1');
  const contentOf = (raw) => {
    const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const { createdAt, ...rest } = s;
    return rest;
  };
  check(
    'hash run pertama dan terakhir sama karena data sama',
    first[0].snapshot_hash === last[0].snapshot_hash,
    first[0].snapshot_hash.slice(0, 12) + ' vs ' + last[0].snapshot_hash.slice(0, 12)
  );
  check('hash tersimpan cocok dengan isi', hashSnapshot(contentOf(first[0].snapshot)) === first[0].snapshot_hash);
}

await connection.end();

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? 'SEMUA UJI RIWAYAT LOLOS' : failed + ' GAGAL'} (${results.length} butir)`);
process.exit(failed === 0 ? 0 : 1);