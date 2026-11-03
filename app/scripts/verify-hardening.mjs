// Verifikasi F8 melalui runtime: token warna benar-benar sampai ke halaman,
// audit aksesibilitas dibersihkan, dan tidak ada halaman yang rusak.
// Dijalankan: tsx scripts/verify-hardening.mjs
// Prasyarat: dev server berjalan, DB sudah di-seed.

import mysql from 'mysql2/promise';
import 'dotenv/config';
import { ADMIN_USERNAME, ADMIN_PASSWORD, VIEWER_USERNAME, VIEWER_PASSWORD } from './test-credentials.mjs';

const base = process.env.VERIFY_BASE ?? 'http://localhost:1111';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL belum diisi');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
};

const connection = await mysql.createConnection({ uri: databaseUrl, decimalNumbers: true });

/* ---------- Siapkan data agar semua halaman punya isi ---------- */
{
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of ['scores', 'rubrics', 'alternatives', 'criteria', 'computation_results', 'computation_runs']) {
    await connection.query(`TRUNCATE TABLE \`${table}\``);
  }
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');

  const now = new Date();
  const criteriaRows = [
    ['C1', 'Relevansi tema', '0.4000', 'benefit'],
    ['C2', 'Ketajaman metode', '0.3500', 'benefit'],
    ['C3', 'Beban biaya', '0.2500', 'cost'],
  ];
  const criterionIds = [];
  for (const [index, [code, name, weight, direction]] of criteriaRows.entries()) {
    const [res] = await connection.query(
      'INSERT INTO criteria (code, name, weight, direction, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [code, name, weight, direction, index + 1, now, now]
    );
    criterionIds.push(res.insertId);
    await connection.query(
      'INSERT INTO rubrics (criterion_id, label, value, sort_order) VALUES (?, ?, ?, ?)',
      [res.insertId, 'Baik', '4.0000', 1]
    );
  }

  const alternatives = [
    ['A1', 'Sistem rekomendasi beasiswa', [4, 5, 2]],
    ['A2', 'Deteksi plagiarisme', [5, 4, 3]],
    ['A3', 'Monitoring magang', [3, 3, 1]],
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
  return { status: r.status, text: await r.text(), headers: r.headers };
};

const login = await request('/api/auth/sign-in/username', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base },
  body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
});
check('login admin', login.status === 200, String(login.status));
if (login.status !== 200) process.exit(1);

/* ---------- 1. Token warna baru benar-benar terkirim ---------- */
{
  const css = await request('/src/styles/global.css');
  check('CSS terkirim', css.status === 200, String(css.status));
  check('token ink-faint baru dipakai', css.text.includes('#676c7c'));
  check('token line-strong baru dipakai', css.text.includes('#7e8499'));
  // Nilai lama boleh muncul di komentar penjelas, tetapi tidak boleh lagi
  // menjadi nilai deklarasi token.
  check(
    'tidak ada deklarasi token dengan nilai lama',
    !/--ink-faint:\s*#7d8294/i.test(css.text) && !/--line-strong:\s*#b9bdcc/i.test(css.text)
  );
  check('ada prefers-reduced-motion', css.text.includes('prefers-reduced-motion'));
  check('ada aturan 44px', /min-height:\s*44px/.test(css.text));
}

/* ---------- 2. Semua halaman terbuka dan punya struktur aksesibel ---------- */
{
  const pages = [
    '/dashboard',
    '/kriteria',
    '/kriteria/baru',
    '/alternatif',
    '/alternatif/baru',
    '/penilaian',
    '/hitung',
    '/hasil',
    '/hasil/bandingkan',
    '/pengguna',
  ];

  for (const path of pages) {
    const r = await request(path);
    check(path + ' terbuka', r.status === 200, String(r.status));
    check(path + ' punya h1', /<h1[^>]*>/.test(r.text));
    check(path + ' punya skip link', r.text.includes('skip-link'));
  }
}

/* ---------- 3. Tabel punya nama aksesibel ---------- */
{
  const pages = ['/kriteria', '/alternatif', '/penilaian', '/hitung', '/hasil', '/hasil/bandingkan', '/pengguna'];
  for (const path of pages) {
    const r = await request(path);
    const tables = r.text.match(/<table[\s\S]*?<\/table>/g) ?? [];
    let unnamed = 0;
    for (const table of tables) {
      const named = /<caption/.test(table) || /aria-label=/.test(table) || /aria-labelledby=/.test(table);
      if (!named) unnamed++;
    }
    check(path + ' semua tabel bernama', unnamed === 0, tables.length + ' tabel, ' + unnamed + ' tanpa nama');
  }
}

/* ---------- 4. Hitung dan simpan, lalu cek halaman detail ---------- */
{
  for (const method of ['saw', 'wp', 'topsis', 'waspas', 'moora', 'copras', 'vikor', 'edas', 'aras', 'mabac', 'smart']) {
    const save = await request(`/hitung/${method}?_action=runs.save`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
      body: new URLSearchParams({ method }),
    });
    check('simpan ' + method.toUpperCase(), save.status === 200, String(save.status));
  }

  const history = await request('/hasil');
  const link = history.text.match(/href="\/hasil\/(\d+)"/);
  check('tautan detail hasil ada', Boolean(link?.[1]), String(link?.[1] ?? '-'));

  if (link?.[1]) {
    const detail = await request(`/hasil/${link[1]}`);
    check('detail hasil terbuka', detail.status === 200, String(detail.status));
    const tables = detail.text.match(/<table[\s\S]*?<\/table>/g) ?? [];
    let unnamed = 0;
    for (const table of tables) {
      const named = /<caption/.test(table) || /aria-label=/.test(table) || /aria-labelledby=/.test(table);
      if (!named) unnamed++;
    }
    check('detail hasil: semua tabel bernama', unnamed === 0, tables.length + ' tabel, ' + unnamed + ' tanpa nama');

    const labels = (detail.text.match(/<label/g) ?? []).length;
    const labelledInputs = (detail.text.match(/aria-labelledby=/g) ?? []).length;
    check('detail hasil memakai aria-labelledby', labelledInputs > 0, String(labelledInputs));
    check('detail hasil tanpa label menggantung', labels === 0 || !/for="[^"]*"[^>]*>\s*<\/label>/.test(detail.text));
  }
}

/* ---------- 5. Halaman perbandingan lengkap setelah tiga run ---------- */
{
  const r = await request('/hasil/bandingkan');
  check('perbandingan siap', r.text.includes('Tingkat kesepakatan'));
  const tables = r.text.match(/<table[\s\S]*?<\/table>/g) ?? [];
  let unnamed = 0;
  for (const table of tables) {
    const named = /<caption/.test(table) || /aria-label=/.test(table) || /aria-labelledby=/.test(table);
    if (!named) unnamed++;
  }
  check('perbandingan: semua tabel bernama', unnamed === 0, tables.length + ' tabel, ' + unnamed + ' tanpa nama');
}

/* ---------- 6. RBAC tetap utuh setelah perubahan CSS ---------- */
{
  const viewerJar = new Map();
  const loginViewer = await fetch(new URL('/api/auth/sign-in/username', base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ username: VIEWER_USERNAME, password: VIEWER_PASSWORD }),
    redirect: 'manual',
  });
  for (const line of loginViewer.headers.getSetCookie?.() ?? []) {
    const [pair] = String(line).split(';');
    const i = pair.indexOf('=');
    if (i > 0) viewerJar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  check('login peninjau', loginViewer.status === 200, String(loginViewer.status));

  const cookie = [...viewerJar].map(([k, v]) => `${k}=${v}`).join('; ');
  const akun = await fetch(new URL('/pengguna', base), { headers: { cookie }, redirect: 'manual' });
  check('peninjau tetap ditolak di halaman akun', akun.status === 303, String(akun.status));
}

/* ---------- 7. Tidak ada halaman dengan galat server ---------- */
{
  const pages = ['/', '/login', '/dashboard', '/kriteria', '/alternatif', '/penilaian', '/hitung', '/hasil', '/pengguna'];
  for (const path of pages) {
    const r = await request(path);
    check(path + ' tanpa galat 500', r.status < 500, String(r.status));
  }
}

// Pulihkan rubrik untuk setiap kriteria agar suite berikutnya mendapat
// keadaan yang sama seperti seed. Tanpa ini, uji lain yang mengharapkan
// rubrik akan gagal karena suite ini men-truncate tabel rubrics.
{
  const [criteriaRows] = await connection.query('SELECT id FROM criteria ORDER BY sort_order');
  const scale = [
    ['Sangat kurang', '1.0000'],
    ['Kurang', '2.0000'],
    ['Cukup', '3.0000'],
    ['Baik', '4.0000'],
    ['Sangat baik', '5.0000'],
  ];
  for (const criterion of criteriaRows) {
    for (const [index, [label, value]] of scale.entries()) {
      await connection.query(
        'INSERT INTO rubrics (criterion_id, label, value, sort_order) VALUES (?, ?, ?, ?)',
        [criterion.id, label, value, index + 1]
      );
    }
  }
  console.log('rubrik dipulihkan untuk ' + criteriaRows.length + ' kriteria');
}

await connection.end();

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? 'SEMUA UJI PENGERASAN LOLOS' : failed + ' GAGAL'} (${results.length} butir)`);
process.exit(failed === 0 ? 0 : 1);