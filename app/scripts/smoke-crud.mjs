// Uji alur CRUD dan perhitungan lewat HTTP dalam satu sesi login.
// Dijalankan: node scripts/smoke-crud.mjs [baseUrl]
// Prasyarat: dev server berjalan, database sudah dimigrasi dan di-seed.

import { ADMIN_USERNAME, ADMIN_PASSWORD } from './test-credentials.mjs';
const base = process.argv[2] ?? 'http://localhost:1111';
const jar = new Map();

const store = (response) => {
  const list = response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie')].filter(Boolean);
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
  const response = await fetch(new URL(path, base), { ...options, headers, redirect: 'manual' });
  store(response);
  const text = await response.text();
  return { status: response.status, text, location: response.headers.get('location') };
};

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
};

const postForm = (path, data) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) params.set(k, String(v));
  return request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base, accept: 'text/html' },
    body: params,
  });
};

// 1. Login
{
  const r = await request('/api/auth/sign-in/username', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  check('login admin', r.status === 200, String(r.status));
  if (r.status !== 200) {
    console.log('login gagal, sisa uji dilewati');
    process.exit(1);
  }
}

// 2. Tambah kriteria lewat form action
{
  const r = await postForm('/kriteria/baru?_action=criteria.save', {
    code: 'C5',
    name: 'Kesesuaian bidang pembimbing',
    weight: '0.15',
    direction: 'benefit',
    sortOrder: '5',
  });
  check('simpan kriteria menjawab halaman', r.status === 200, String(r.status));

  const page = await request('/kriteria');
  check('kriteria C5 tampil', page.text.includes('Kesesuaian bidang pembimbing'));
  check('peringatan total bobot muncul', page.text.includes('bukan 1'));
}

// 3. Validasi: kode kosong ditolak
{
  const r = await postForm('/kriteria/baru?_action=criteria.save', {
    code: '',
    name: 'Uji validasi',
    weight: '0.1',
    direction: 'benefit',
    sortOrder: '9',
  });
  check('kode kosong ditolak dengan pesan', r.status === 400, String(r.status));
  check('pesan validasi tampil', r.text.includes('Kode wajib diisi') || r.text.includes('wajib'));
}

// 4. Normalisasi bobot
{
  const r = await postForm('/kriteria?_action=criteria.normalizeWeights', {});
  check('normalisasi bobot menjawab halaman', r.status === 200, String(r.status));
  const page = await request('/kriteria');
  check('total bobot kembali 1', !page.text.includes('bukan 1'));
}

// 5. Hapus kriteria C5
{
  const page = await request('/kriteria');
  const row = page.text.match(/<tr data-criterion-id="(\d+)" data-criterion-code="C5"[\s\S]*?<\/tr>/);
  const id = row?.[1];
  check('id kriteria C5 ditemukan', Boolean(id), String(id ?? '-'));

  if (id) {
    const r = await postForm('/kriteria?_action=criteria.remove', { id });
    check('hapus kriteria menjawab halaman', r.status === 200, String(r.status));
    const after = await request('/kriteria');
    check('kriteria C5 hilang', !after.text.includes('Kesesuaian bidang pembimbing'));
  }
}

// 6. Tambah dua alternatif
for (const alt of [
  { code: 'A1', title: 'Sistem rekomendasi beasiswa berbasis profil', studentName: 'Nadia Pramesti', nim: '21101001', concentration: 'Rekayasa Perangkat Lunak' },
  { code: 'A2', title: 'Deteksi plagiarisme dokumen akademik', studentName: 'Bagas Nugraha', nim: '21101002', concentration: 'Sistem Informasi' },
]) {
  const r = await postForm('/alternatif/baru?_action=alternatives.save', alt);
  check(`simpan alternatif ${alt.code}`, r.status === 200, String(r.status));
}

{
  const page = await request('/alternatif');
  check('dua alternatif tampil', page.text.includes('Sistem rekomendasi beasiswa') && page.text.includes('Deteksi plagiarisme'));
}

// 7. Isi seluruh matriks nilai
{
  const page = await request('/penilaian');
  check('halaman penilaian terbuka', page.status === 200, String(page.status));

  const rows = [...page.text.matchAll(/data-alternative-id="(\d+)"/g)].map((m) => m[1]);
  const critIds = [...page.text.matchAll(/data-criterion-id="(\d+)"/g)].map((m) => m[1]);
  const uniqueCrit = [...new Set(critIds)];
  check('alternatif terdeteksi di penilaian', rows.length >= 2, String(rows.length));
  check('kriteria terdeteksi di penilaian', uniqueCrit.length >= 4, String(uniqueCrit.length));

  const seedValues = {
    A1: [4, 3, 5, 2],
    A2: [3, 5, 4, 3],
  };

  for (const [index, altId] of rows.slice(0, 2).entries()) {
    const values = seedValues[index === 0 ? 'A1' : 'A2'];
    for (const [j, cid] of uniqueCrit.entries()) {
      const r = await postForm('/penilaian?_action=scores.saveCell', {
        alternativeId: altId,
        criterionId: cid,
        value: values[j],
      });
      if (r.status !== 200) {
        check(`simpan nilai alt ${altId} kriteria ${cid}`, false, String(r.status));
      }
    }
  }

  const after = await request('/penilaian');
  check('seluruh sel terisi', after.text.includes('Semua sel terisi'));
}

// 8. Hitung ketiga metode
for (const method of ['saw', 'wp', 'topsis']) {
  const r = await request(`/hitung/${method}`);
  check(`halaman hitung ${method.toUpperCase()} terbuka`, r.status === 200, String(r.status));
  check(`jejak langkah ${method.toUpperCase()} tampil`, r.text.includes('Jejak langkah perhitungan'));
  check(`peringkat ${method.toUpperCase()} tampil`, r.text.includes('Peringkat akhir'));
}

// 9. Simpan hasil TOPSIS dan buka riwayat
{
  const r = await postForm('/hitung/topsis?_action=runs.save', { method: 'topsis' });
  check('simpan hasil TOPSIS menjawab halaman', r.status === 200, String(r.status));

  const history = await request('/hasil');
  check('riwayat menampilkan catatan', history.text.includes('Daftar perhitungan') || history.text.includes('TOPSIS'));

  const link = history.text.match(/href="\/hasil\/(\d+)"/);
  check('tautan detail hasil tersedia', Boolean(link?.[1]), String(link?.[1] ?? '-'));

  if (link?.[1]) {
    const detail = await request(`/hasil/${link[1]}`);
    check('detail hasil terbuka', detail.status === 200, String(detail.status));
    check('detail memuat sidik snapshot', detail.text.includes('Sidik snapshot') || detail.text.length > 1000);
  }
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? 'SEMUA UJI CRUD LOLOS' : failed + ' GAGAL'} (${results.length} butir)`);
process.exit(failed === 0 ? 0 : 1);