// Uji P0: tautan yang sebelumnya mati, halaman rubrik, dan halaman akun.
// Dijalankan: node scripts/smoke-p0.mjs [baseUrl]
// Prasyarat: dev server berjalan, database sudah di-seed.

import { ADMIN_USERNAME, ADMIN_PASSWORD, VIEWER_USERNAME, VIEWER_PASSWORD } from './test-credentials.mjs';
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
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: params,
  });
};

const login = await request('/api/auth/sign-in/username', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base },
  body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
});
check('login admin', login.status === 200, String(login.status));
if (login.status !== 200) process.exit(1);

// 1. Semua tautan navigasi harus punya tujuan yang hidup
{
  const dash = await request('/dashboard');
  const hrefs = [...new Set([...dash.text.matchAll(/class="nav__link" href="(\/[^"]*)"/g)].map((m) => m[1]))];
  check('navigasi memuat tautan akun', hrefs.includes('/pengguna'), hrefs.join(' '));

  for (const href of hrefs) {
    const r = await request(href);
    check(`nav ${href} tidak 404`, r.status !== 404, String(r.status));
  }
}

// 2. Halaman akun
{
  const r = await request('/pengguna');
  check('halaman akun terbuka', r.status === 200, String(r.status));
  check('halaman akun memuat daftar', r.text.includes('Daftar akun'));
  check('halaman akun memuat akun admin', r.text.includes('admin@telaah.local'));
  check('halaman akun menandai pengguna sendiri', r.text.includes('(Anda)'));
  check('halaman akun menyebut batasan fitur', r.text.includes('belum tersedia di antarmuka'));
}

// 3. Halaman rubrik untuk kriteria pertama
let criterionId = null;
{
  const list = await request('/kriteria');
  const match = list.text.match(/href="\/kriteria\/(\d+)"[^>]*>Ubah/);
  criterionId = match?.[1] ?? null;
  check('id kriteria ditemukan', Boolean(criterionId), String(criterionId ?? '-'));

  const edit = await request(criterionId ? `/kriteria/${criterionId}` : '/kriteria');
  check('tautan kelola rubrik mengarah ke rute yang ada', /href="\/kriteria\/\d+\/rubrik"/.test(edit.text));
}

if (criterionId) {
  const rubrik = await request(`/kriteria/${criterionId}/rubrik`);
  check('halaman rubrik terbuka', rubrik.status === 200, String(rubrik.status));
  check('halaman rubrik memuat daftar', rubrik.text.includes('Daftar rubrik'));
  check('halaman rubrik memuat form tambah', rubrik.text.includes('Tambah rubrik'));
  const initialRubrics = (rubrik.text.match(/data-rubric-id=/g) ?? []).length;
  check('halaman rubrik memuat rubrik', initialRubrics > 0, String(initialRubrics));

  // 4. Tambah rubrik
  {
    const r = await postForm(`/kriteria/${criterionId}/rubrik?_action=rubrics.save`, {
      criterionId,
      label: 'Di luar skala',
      value: '0',
      sortOrder: '9',
    });
    check('tambah rubrik menjawab halaman', r.status === 200, String(r.status));

    const after = await request(`/kriteria/${criterionId}/rubrik`);
    check('rubrik baru tampil', after.text.includes('Di luar skala'));
    const afterAdd = (after.text.match(/data-rubric-id=/g) ?? []).length;
    check('jumlah rubrik bertambah satu', afterAdd === initialRubrics + 1, String(afterAdd));
  }

  // 5. Ubah rubrik
  {
    const page = await request(`/kriteria/${criterionId}/rubrik`);
    const ids = [...page.text.matchAll(/data-rubric-id="(\d+)"/g)].map((m) => m[1]);
    const target = ids[ids.length - 1];

    const r = await postForm(`/kriteria/${criterionId}/rubrik?_action=rubrics.save`, {
      id: target,
      criterionId,
      label: 'Di luar skala revisi',
      value: '0.5',
      sortOrder: '9',
    });
    check('ubah rubrik menjawab halaman', r.status === 200, String(r.status));

    const after = await request(`/kriteria/${criterionId}/rubrik`);
    check('label rubrik berubah', after.text.includes('Di luar skala revisi'));
  }

  // 6. Validasi rubrik: label kosong ditolak
  {
    const r = await postForm(`/kriteria/${criterionId}/rubrik?_action=rubrics.save`, {
      criterionId,
      label: '',
      value: '3',
      sortOrder: '1',
    });
    check('label kosong ditolak', r.status === 400, String(r.status));
    check('pesan validasi rubrik tampil', r.text.includes('Perubahan tidak tersimpan'));
  }

  // 7. Hapus rubrik
  {
    const page = await request(`/kriteria/${criterionId}/rubrik`);
    const ids = [...page.text.matchAll(/data-rubric-id="(\d+)"/g)].map((m) => m[1]);
    const target = ids[ids.length - 1];
    const r = await postForm(`/kriteria/${criterionId}/rubrik?_action=rubrics.remove`, { id: target });
    check('hapus rubrik menjawab halaman', r.status === 200, String(r.status));

    const after = await request(`/kriteria/${criterionId}/rubrik`);
    const afterRemove = (after.text.match(/data-rubric-id=/g) ?? []).length;
    check('jumlah rubrik kembali seperti semula', afterRemove === initialRubrics, String(afterRemove));
  }

  // 8. Rubrik untuk kriteria yang tidak ada
  {
    const r = await request('/kriteria/99999/rubrik');
    check('kriteria tidak ada dialihkan, bukan error', r.status === 303, String(r.status));
  }
}

// 9. RBAC: peran peninjau tidak boleh membuka halaman pengelolaan
{
  const viewerJar = new Map();
  const storeViewer = (response) => {
    const list = response.headers.getSetCookie?.() ?? [];
    for (const line of list) {
      const [pair] = String(line).split(';');
      const i = pair.indexOf('=');
      if (i > 0) viewerJar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  };

  const loginViewer = await fetch(new URL('/api/auth/sign-in/username', base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ username: VIEWER_USERNAME, password: VIEWER_PASSWORD }),
    redirect: 'manual',
  });
  storeViewer(loginViewer);
  check('login peninjau berhasil', loginViewer.status === 200, String(loginViewer.status));

  if (loginViewer.status === 200) {
    const cookie = [...viewerJar].map(([k, v]) => `${k}=${v}`).join('; ');
    const viewerGet = async (path) => {
      const r = await fetch(new URL(path, base), { headers: { cookie }, redirect: 'manual' });
      return { status: r.status, text: await r.text() };
    };

    const akun = await viewerGet('/pengguna');
    check('peninjau ditolak di halaman akun', akun.status === 303, String(akun.status));

    const rubrik = criterionId ? await viewerGet(`/kriteria/${criterionId}/rubrik`) : { status: 0, text: '' };
    check('peninjau ditolak di halaman rubrik', rubrik.status === 303, String(rubrik.status));

    const daftar = await viewerGet('/kriteria');
    check('peninjau tetap bisa membaca daftar kriteria', daftar.status === 200, String(daftar.status));
    check('peninjau tidak melihat tombol tambah kriteria', !daftar.text.includes('Tambah kriteria'));
    check('peninjau tidak melihat tombol ubah', !/>Ubah</.test(daftar.text));

    const navAkun = await viewerGet('/dashboard');
    check('peninjau tidak melihat menu akun', !/href="\/pengguna"/.test(navAkun.text));
  }
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? 'SEMUA UJI P0 LOLOS' : failed + ' GAGAL'} (${results.length} butir)`);
process.exit(failed === 0 ? 0 : 1);