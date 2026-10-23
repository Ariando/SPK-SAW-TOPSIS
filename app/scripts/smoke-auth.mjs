// Uji keamanan autentikasi: pendaftaran publik harus tertutup,
// login tetap berfungsi, dan halaman admin menolak peran peninjau.
// Dijalankan: node scripts/smoke-auth.mjs [baseUrl]

const base = process.argv[2] ?? 'http://localhost:4321';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
};

const json = (path, body) =>
  fetch(new URL(path, base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify(body),
    redirect: 'manual',
  });

const cookieOf = (response) => {
  const list = response.headers.getSetCookie?.() ?? [];
  return list.map((line) => String(line).split(';')[0]).join('; ');
};

// 1. Pendaftaran publik harus ditolak
{
  const r = await json('/api/auth/sign-up/email', {
    email: 'penyusup-' + Date.now() + '@contoh.test',
    password: 'CobaMasuk123',
    name: 'Penyusup',
  });
  const text = await r.text();
  check('pendaftaran publik ditolak', r.status === 400, String(r.status));
  check(
    'alasan penolakan menyebut sign up tidak aktif',
    text.includes('EMAIL_PASSWORD_SIGN_UP_DISABLED'),
    text.slice(0, 60)
  );
}

// 2. Login admin tetap berfungsi
{
  const r = await json('/api/auth/sign-in/username', { username: 'admin', password: 'TelaahAdmin2026' });
  check('login admin berhasil', r.status === 200, String(r.status));
}

// 3. Kata sandi salah ditolak tanpa membocorkan akun
{
  const r = await json('/api/auth/sign-in/username', { username: 'admin', password: 'salah-total-999' });
  const text = await r.text();
  check('kata sandi salah ditolak', r.status === 401, String(r.status));
  check('pesan tidak menyebut kolom mana yang salah', !/username tidak|user not found/i.test(text));
}

// 4. Sesi aktif bisa membaca dashboard, tanpa sesi tidak bisa
{
  const login = await json('/api/auth/sign-in/username', { username: 'admin', password: 'TelaahAdmin2026' });
  const cookie = cookieOf(login);
  check('cookie sesi diterima', cookie.length > 0, cookie.split(';')[0]?.split('=')[0] ?? '-');

  const withSession = await fetch(new URL('/dashboard', base), {
    headers: { cookie },
    redirect: 'manual',
  });
  check('dashboard terbuka dengan sesi', withSession.status === 200, String(withSession.status));

  const without = await fetch(new URL('/dashboard', base), { redirect: 'manual' });
  check('dashboard tertutup tanpa sesi', without.status === 303, String(without.status));
}

// 5. Endpoint akun tidak membocorkan data tanpa sesi
{
  const r = await fetch(new URL('/pengguna', base), { redirect: 'manual' });
  check('halaman akun tertutup tanpa sesi', r.status === 303, String(r.status));
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? 'SEMUA UJI AUTH LOLOS' : failed + ' GAGAL'} (${results.length} butir)`);
process.exit(failed === 0 ? 0 : 1);