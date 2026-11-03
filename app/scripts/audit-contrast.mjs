// Audit kontras WCAG AA untuk token warna aplikasi.
// Dijalankan: node scripts/audit-contrast.mjs
// Menghitung rasio menurut rumus WCAG 2.x, tanpa pustaka luar.

const hexToRgb = (hex) => {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
};

const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a, b) => {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
};

// Token diambil dari src/styles/global.css. Perbarui bila token berubah.
const T = {
  ink: '#1b1d2a',
  inkMuted: '#5a5f70',
  inkFaint: '#676c7c',
  accent: '#2f318b',
  accentStrong: '#24266e',
  accentSoft: '#ecebf7',
  danger: '#a3271f',
  dangerSoft: '#fbeceb',
  dangerText: '#6d1a15',
  warning: '#7a4a12',
  warningSoft: '#fdf3e3',
  warningText: '#5b3708',
  success: '#1f6b47',
  successSoft: '#eaeeF2',
  successText: '#17513a',
  surface: '#ffffff',
  surfaceSunken: '#f5f6f9',
  line: '#d8dae4',
  lineStrong: '#7e8499',
  institutionDetail: '#fff000',
  white: '#ffffff',
};

const results = [];
const textPair = (name, fg, bg) => {
  const r = ratio(fg, bg);
  results.push({ name, ratio: r, threshold: 4.5, kind: 'teks normal' });
};

const uiPair = (name, fg, bg) => {
  const r = ratio(fg, bg);
  results.push({ name, ratio: r, threshold: 3, kind: 'komponen' });
};

// Teks pada latar utama
textPair('teks utama di putih', T.ink, T.surface);
textPair('teks utama di sunken', T.ink, T.surfaceSunken);
textPair('teks muted di putih', T.inkMuted, T.surface);
textPair('teks muted di sunken', T.inkMuted, T.surfaceSunken);
textPair('teks faint di putih', T.inkFaint, T.surface);
textPair('teks faint di sunken', T.inkFaint, T.surfaceSunken);
// Penanda nav di dalam tautan aktif di-override menjadi accent, bukan faint.
// Lihat .nav__link[aria-current='page'] .nav__marker di global.css.
textPair('penanda nav aktif di accent-soft', T.accent, T.accentSoft);

// Tautan dan aksen
textPair('tautan di putih', T.accent, T.surface);
textPair('tautan di sunken', T.accent, T.surfaceSunken);
textPair('tautan di accent-soft', T.accent, T.accentSoft);
textPair('accent-strong di accent-soft', T.accentStrong, T.accentSoft);
textPair('putih di accent', T.white, T.accent);
textPair('putih di accent-strong', T.white, T.accentStrong);

// Notifikasi
textPair('danger di danger-soft', T.danger, T.dangerSoft);
textPair('dangerText di danger-soft', T.dangerText, T.dangerSoft);
textPair('warning di warning-soft', T.warning, T.warningSoft);
textPair('warningText di warning-soft', T.warningText, T.warningSoft);
textPair('success di success-soft', T.success, T.successSoft);
textPair('successText di success-soft', T.successText, T.successSoft);
textPair('danger di putih', T.danger, T.surface);
textPair('warning di putih', T.warning, T.surface);
textPair('success di putih', T.success, T.surface);

// Heatmap sensitivitas: empat tingkat intensitas. Angka pada sel harus
// tetap terbaca, jadi setiap tingkat diuji sebagai teks normal.
textPair('heat-0 teks di putih', '#6b7080', '#ffffff');
textPair('heat-1 teks di lavender muda', '#23255f', '#ecebf7');
textPair('heat-2 teks di lavender tua', '#1b1d2a', '#c9c7ea');
textPair('heat-3 teks di indigo', '#ffffff', '#2f318b');

// Batas komponen interaktif wajib 3:1
uiPair('batas input dan tombol di putih', T.lineStrong, T.surface);
uiPair('batas input dan tombol di sunken', T.lineStrong, T.surfaceSunken);
uiPair('cincin fokus di putih', T.accent, T.surface);
uiPair('cincin fokus di sunken', T.accent, T.surfaceSunken);

// Garis pemisah baris tabel adalah dekorasi struktural, bukan batas komponen
// interaktif. WCAG 1.4.11 tidak mewajibkan 3:1 untuk garis ini, dan
// menaikkannya akan membuat tabel penuh garis berat yang mengganggu
// pembacaan angka. Batas input dan tombol tetap diuji di atas.
results.push({
  name: 'garis pemisah baris tabel',
  ratio: ratio(T.line, T.surface),
  threshold: null,
  kind: 'dekorasi struktural',
});

// Detail institusi tidak pernah dipakai untuk teks
results.push({
  name: 'detail institusi di putih (hanya garis, tidak untuk teks)',
  ratio: ratio(T.institutionDetail, T.surface),
  threshold: null,
  kind: 'dekorasi',
});

let failed = 0;
let warned = 0;

for (const r of results) {
  if (r.threshold === null) {
    console.log(`INFO  ${r.name}: ${r.ratio.toFixed(2)}:1 (${r.kind}, tanpa syarat)`);
    continue;
  }
  const ok = r.ratio >= r.threshold;
  if (!ok) failed++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${r.name}: ${r.ratio.toFixed(2)}:1 (${r.kind}, minimal ${r.threshold}:1)`
  );
}

// Peringatan untuk pasangan di dekat ambang
for (const r of results) {
  if (r.threshold !== null && r.ratio >= r.threshold && r.ratio < r.threshold + 0.3) {
    warned++;
    console.log(`PERHATIAN  ${r.name}: ${r.ratio.toFixed(2)}:1, dekat ambang ${r.threshold}:1`);
  }
}

console.log(
  `\n${failed === 0 ? 'SEMUA PASANGAN LOLOS' : failed + ' PASANGAN GAGAL'} (${results.length} pasangan, ${warned} dekat ambang)`
);
process.exit(failed === 0 ? 0 : 1);