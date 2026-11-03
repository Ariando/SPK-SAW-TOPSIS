// Uji F11b: pembuatan PDF dari halaman yang sudah ada.
// Dijalankan: tsx scripts/verify-pdf.mjs
// Prasyarat: dev server berjalan, Chrome atau Edge terpasang.

import mysql from 'mysql2/promise';
import 'dotenv/config';
import { ADMIN_USERNAME, ADMIN_PASSWORD } from './test-credentials.mjs';

const base = process.env.VERIFY_BASE ?? 'http://localhost:1111';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL belum diisi');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  (' + detail + ')' : ''));
};

const connection = await mysql.createConnection({ uri: databaseUrl, decimalNumbers: true });

/* ---------- Siapkan data agar halaman punya isi ---------- */
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
    ['C1', 'Relevansi tema dan judul', '0.3000', 'benefit', 1],
    ['C2', 'Ketajaman metodologi', '0.2500', 'benefit', 2],
    ['C3', 'Ketersediaan data', '0.2000', 'benefit', 3],
    ['C4', 'Beban biaya dan waktu', '0.2500', 'cost', 4],
  ];
  const ids = [];
  for (const [code, name, weight, direction, order] of criteriaRows) {
    const [res] = await connection.query(
      'INSERT INTO criteria (code, name, weight, direction, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
      [code, name, weight, direction, order, now, now]
    );
    ids.push(res.insertId);
  }

  const alternatives = [
    ['A1', 'Sistem rekomendasi beasiswa', [4, 3, 5, 2]],
    ['A2', 'Deteksi plagiarisme dokumen', [3, 5, 4, 3]],
    ['A3', 'Monitoring magang berbasis web', [5, 4, 3, 4]],
  ];
  for (const [index, [code, title, values]] of alternatives.entries()) {
    const [res] = await connection.query(
      'INSERT INTO alternatives (code, title, student_name, nim, concentration, is_active, created_at, updated_at) VALUES (?,?,?,?,?,1,?,?)',
      [code, title, 'Mahasiswa ' + code, '211010' + index, 'RPL', now, now]
    );
    for (const [j, value] of values.entries()) {
      await connection.query(
        'INSERT INTO scores (alternative_id, criterion_id, rubric_id, value, updated_at) VALUES (?,?,NULL,?,?)',
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
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

const request = async (path, options = {}) => {
  const headers = { ...(options.headers ?? {}) };
  const cookie = cookieHeader();
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

/* ---------- Simpan hasil semua metode agar perbandingan siap ---------- */
const ALL_METHODS = ['saw', 'wp', 'topsis', 'waspas', 'moora', 'copras', 'vikor', 'edas', 'aras', 'mabac', 'smart'];
{
  let saved = 0;
  for (const method of ALL_METHODS) {
    const r = await request(`/hitung/${method}?_action=runs.save`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
      body: new URLSearchParams({ method, scenarioId: '' }),
    });
    if (r.status === 200) saved++;
  }
  check('hasil kesebelas metode tersimpan', saved === ALL_METHODS.length, saved + '/' + ALL_METHODS.length);
}

const [runRows] = await connection.query('SELECT id FROM computation_runs ORDER BY id DESC LIMIT 1');
const runId = Number(runRows[0].id);
check('run tersimpan untuk uji PDF', Number.isFinite(runId), String(runId));

/* ---------- 1. Tanpa sesi ditolak ---------- */
{
  // Memakai fetch langsung tanpa header cookie. Middleware mengalihkan tamu
  // ke halaman login, sehingga statusnya 303, bukan 401. Yang penting: tidak
  // ada berkas PDF yang terkirim.
  const r = await fetch(new URL('/api/pdf?halaman=' + encodeURIComponent('/hasil/bandingkan'), base), {
    redirect: 'manual',
  });
  check('tanpa sesi tidak menghasilkan PDF', r.status === 303 || r.status === 401, String(r.status));
  check('tidak ada berkas PDF terkirim', !(r.headers.get('content-type') ?? '').includes('pdf'));
}

/* ---------- 2. Parameter wajib ---------- */
{
  const r = await request('/api/pdf');
  check('tanpa parameter halaman ditolak', r.status === 400, String(r.status));
  check('pesan menjelaskan parameter wajib', r.text.includes('Parameter halaman wajib diisi'));
}

/* ---------- 3. Halaman di luar daftar ditolak ---------- */
{
  const r = await request('/api/pdf?halaman=' + encodeURIComponent('/kriteria'));
  check('halaman kriteria ditolak', r.status === 400, String(r.status));
  check('pesan menyebut daftar yang diizinkan', r.text.includes('tidak diizinkan untuk diekspor'));
}

/* ---------- 4. URL eksternal ditolak ---------- */
{
  const r = await request('/api/pdf?halaman=' + encodeURIComponent('https://example.com/hasil/1'));
  check('URL eksternal ditolak', r.status === 400, String(r.status));
}

/* ---------- 4b. Path traversal ditolak ---------- */
{
  // `/hasil/../kriteria` berawalan `/hasil/` sehingga lolos pemeriksaan string
  // mentah, lalu dinormalkan menjadi `/kriteria`. Harus ditolak.
  const cases = [
    '/hasil/../kriteria',
    '/sensitivitas/../kriteria',
    '/ahp/../pengguna',
    '/hasil/../../login',
    '/hasil/%2e%2e/kriteria',
  ];

  for (const target of cases) {
    const r = await request('/api/pdf?halaman=' + encodeURIComponent(target));
    check('traversal ditolak: ' + target, r.status === 400, String(r.status));
    check(
      'traversal tidak menghasilkan PDF: ' + target,
      !(r.headers.get('content-type') ?? '').includes('pdf'),
      r.headers.get('content-type') ?? '-'
    );
  }
}

/* ---------- 5. PDF detail hasil ---------- */
{
  const r = await request('/api/pdf?halaman=' + encodeURIComponent('/hasil/' + runId));
  check('detail hasil menghasilkan PDF', r.status === 200, String(r.status));
  check(
    'content type pdf',
    (r.headers.get('content-type') ?? '').includes('application/pdf'),
    r.headers.get('content-type') ?? '-'
  );
  check('nama berkas disertakan', (r.headers.get('content-disposition') ?? '').includes('.pdf'), r.headers.get('content-disposition') ?? '-');
  check(
    'berkas diunduh, bukan dibuka di tab',
    (r.headers.get('content-disposition') ?? '').startsWith('attachment'),
    r.headers.get('content-disposition') ?? '-'
  );
  check('berkas bukan kosong', r.buffer.length > 5000, r.buffer.length + ' byte');
  check('berawalan tanda PDF', r.buffer.subarray(0, 5).toString() === '%PDF-', r.buffer.subarray(0, 5).toString());

  const text = r.buffer.toString('latin1');
  check('memuat penanda akhir PDF', text.includes('%%EOF'));
  check('jumlah halaman terbaca', /\/Type\s*\/Page[^s]/.test(text), 'ada objek Page');
}

/* ---------- 6. PDF halaman perbandingan ---------- */
{
  const r = await request('/api/pdf?halaman=' + encodeURIComponent('/hasil/bandingkan'));
  check('perbandingan menghasilkan PDF', r.status === 200, String(r.status));
  check('perbandingan: ukuran wajar', r.buffer.length > 5000, r.buffer.length + ' byte');
  check('perbandingan: berawalan PDF', r.buffer.subarray(0, 5).toString() === '%PDF-');
}

/* ---------- 7. PDF halaman AHP ---------- */
{
  const save = await request('/ahp?_action=ahp.save', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ name: 'Skenario PDF', upper: JSON.stringify([3, 5, 7, 4, 6, 2]) }),
  });
  check('simpan skenario untuk PDF', save.status === 200, String(save.status));

  const [rows] = await connection.query('SELECT id FROM weight_scenarios ORDER BY id DESC LIMIT 1');
  const scenarioId = Number(rows[0].id);

  const r = await request('/api/pdf?halaman=' + encodeURIComponent('/ahp/' + scenarioId));
  check('skenario AHP menghasilkan PDF', r.status === 200, String(r.status));
  check('skenario AHP: berawalan PDF', r.buffer.subarray(0, 5).toString() === '%PDF-');
}

/* ---------- 8. PDF halaman sensitivitas ---------- */
{
  const r = await request('/api/pdf?halaman=' + encodeURIComponent('/sensitivitas?metode=saw&delta=0.1'));
  check('sensitivitas menghasilkan PDF', r.status === 200, String(r.status));
  check('sensitivitas: berawalan PDF', r.buffer.subarray(0, 5).toString() === '%PDF-');
}

/* ---------- 8b. Halaman sensitivitas menyediakan tautan PDF ---------- */
{
  const page = await request('/sensitivitas?metode=topsis&delta=0.2');
  check('halaman sensitivitas terbuka', page.status === 200, String(page.status));
  check('menampilkan tautan unduh PDF', page.text.includes('/api/pdf?halaman='));
  check('tautan membuka tab baru', /target="_blank"[^>]*>Unduh PDF/.test(page.text) || page.text.includes('target="_blank"'));
  check('tautan membawa metode yang dipilih', page.text.includes('metode=topsis') || page.text.includes('metode%3Dtopsis'), '');
  check('tautan membawa delta yang dipilih', page.text.includes('delta=0.2') || page.text.includes('delta%3D0.2'), '');
  check('tautan tidak memuat tombol cetak lama', !page.text.includes('window.print()'));

  // Tautan yang dibangun halaman harus benar-benar menghasilkan PDF.
  const encoded = page.text.match(/\/api\/pdf\?halaman=%2Fsensitivitas[^"]*/);
  check('tautan sensitivitas dapat diurai', Boolean(encoded), encoded?.[0]?.slice(0, 90) ?? '-');

  if (encoded) {
    const r = await request(encoded[0].replace(/&amp;/g, '&'));
    check('tautan sensitivitas menghasilkan PDF', r.status === 200, String(r.status));
    check('tautan sensitivitas: berawalan PDF', r.buffer.subarray(0, 5).toString() === '%PDF-');
  }
}

/* ---------- 9. Tanpa JavaScript di peramban: tombol berubah jadi tautan ---------- */
{
  const page = await request('/hasil/' + runId);
  check('tombol cetak lama hilang', !page.text.includes('window.print()'));
  check('tautan PDF tersedia', page.text.includes('/api/pdf?halaman='));
  check('tautan membuka tab baru', page.text.includes('target="_blank"'));

  const bandingkan = await request('/hasil/bandingkan');
  // Perbandingan hanya menampilkan bagian ekspor bila ketiga metode punya
  // hasil dari data yang sama. Uji ini menyimpan SAW, WP, dan TOPSIS di atas,
  // jadi seharusnya siap. Bila tidak siap, itu kegagalan tersendiri.
  check('perbandingan siap untuk menampilkan ekspor', !bandingkan.text.includes('belum bisa ditampilkan'));

  if (!bandingkan.text.includes('belum bisa ditampilkan')) {
    check('perbandingan memakai tautan PDF', bandingkan.text.includes('/api/pdf?halaman='));
  }
  check('perbandingan tanpa tombol cetak lama', !bandingkan.text.includes('window.print()'));
}

/* ---------- 10. Halaman yang diminta 404 tidak menghasilkan PDF ---------- */
{
  const r = await request('/api/pdf?halaman=' + encodeURIComponent('/hasil/999999'));
  check('halaman tidak ada tidak menghasilkan PDF', r.status !== 200, String(r.status));
  check(
    'pesan menjelaskan pengalihan',
    r.text.includes('mengalihkan') || r.text.includes('status'),
    r.text.slice(0, 80).replace(/\s+/g, ' ')
  );
  check('tidak ada berkas PDF terkirim', !(r.headers.get('content-type') ?? '').includes('pdf'));
}

/* ---------- Pulihkan keadaan seed ---------- */
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
      'INSERT INTO criteria (code, name, weight, direction, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
      [code, name, weight, direction, order, now, now]
    );
    for (const [index, [label, value]] of scale.entries()) {
      await connection.query(
        'INSERT INTO rubrics (criterion_id, label, value, sort_order) VALUES (?,?,?,?)',
        [res.insertId, label, value, index + 1]
      );
    }
  }
  console.log('kriteria dan rubrik seed dipulihkan');
}

await connection.end();

const failed = results.filter((r) => !r.ok).length;
console.log('\n' + (failed === 0 ? 'SEMUA UJI PDF LOLOS' : failed + ' GAGAL') + ' (' + results.length + ' butir)');
process.exit(failed === 0 ? 0 : 1);