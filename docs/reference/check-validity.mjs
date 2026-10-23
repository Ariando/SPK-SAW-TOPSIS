// Uji validitas tambahan F0: properti analitik dan lintasan hitung alternatif.
// Dijalankan: node docs/reference/check-validity.mjs
// Tidak menguji "cocok dengan dirinya sendiri", tetapi menguji sifat yang
// harus dipenuhi bila rumus benar, plus hitung ulang lewat jalur berbeda.

const crit = (code, weight, direction) => ({ code, weight, direction });

const saw = (criteria, m) => {
  const max = criteria.map((_, j) => Math.max(...m.map((r) => r[j])));
  const min = criteria.map((_, j) => Math.min(...m.map((r) => r[j])));
  const wsum = criteria.reduce((s, c) => s + c.weight, 0);
  const r = m.map((row) =>
    row.map((v, j) => (criteria[j].direction === 'benefit' ? v / max[j] : min[j] / v))
  );
  const v = r.map((row) => row.reduce((s, x, j) => s + (criteria[j].weight / wsum) * x, 0));
  return { max, min, r, v };
};

const wp = (criteria, m) => {
  const wsum = criteria.reduce((s, c) => s + c.weight, 0);
  const wn = criteria.map((c) => c.weight / wsum);
  const s = m.map((row) =>
    row.reduce((p, v, j) => p * Math.pow(v, criteria[j].direction === 'benefit' ? wn[j] : -wn[j]), 1)
  );
  const t = s.reduce((a, b) => a + b, 0);
  return { wn, s, total: t, v: s.map((x) => x / t) };
};

const wpLogDomain = (criteria, m) => {
  const wsum = criteria.reduce((s, c) => s + c.weight, 0);
  const wn = criteria.map((c) => c.weight / wsum);
  const logs = m.map((row) =>
    row.reduce((acc, v, j) => acc + (criteria[j].direction === 'benefit' ? wn[j] : -wn[j]) * Math.log(v), 0)
  );
  const s = logs.map((l) => Math.exp(l));
  const t = s.reduce((a, b) => a + b, 0);
  return { s, v: s.map((x) => x / t) };
};

const topsis = (criteria, m) => {
  const wsum = criteria.reduce((s, c) => s + c.weight, 0);
  const wn = criteria.map((c) => c.weight / wsum);
  const div = criteria.map((_, j) => Math.sqrt(m.reduce((s, r) => s + r[j] * r[j], 0)));
  const r = m.map((row) => row.map((v, j) => v / div[j]));
  const y = r.map((row) => row.map((v, j) => wn[j] * v));
  const plus = criteria.map((c, j) =>
    c.direction === 'benefit' ? Math.max(...y.map((row) => row[j])) : Math.min(...y.map((row) => row[j]))
  );
  const minus = criteria.map((c, j) =>
    c.direction === 'benefit' ? Math.min(...y.map((row) => row[j])) : Math.max(...y.map((row) => row[j]))
  );
  const d2 = (row, ideal) => row.reduce((s, v, j) => s + (v - ideal[j]) ** 2, 0);
  const dp = y.map((row) => Math.sqrt(d2(row, plus)));
  const dm = y.map((row) => Math.sqrt(d2(row, minus)));
  const v = dp.map((d, i) => dm[i] / (d + dm[i]));
  return { div, r, y, plus, minus, dp, dm, v };
};

// Jalur alternatif D+ memakai ekspansi aljabar: |y|^2 - 2 y.A+ + |A+|^2
const topsisExpanded = (criteria, m) => {
  const base = topsis(criteria, m);
  const d2expanded = (row, ideal) => {
    const yy = row.reduce((s, v) => s + v * v, 0);
    const yy2 = row.reduce((s, v, j) => s + v * ideal[j], 0);
    const ii = ideal.reduce((s, v) => s + v * v, 0);
    return yy - 2 * yy2 + ii;
  };
  const dp = base.y.map((row) => Math.sqrt(Math.max(0, d2expanded(row, base.plus))));
  const dm = base.y.map((row) => Math.sqrt(Math.max(0, d2expanded(row, base.minus))));
  return { dp, dm, v: dp.map((d, i) => dm[i] / (d + dm[i])) };
};

const results = [];
const t = (name, ok, detail) => results.push({ name, ok, detail });
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ---------- Kasus 1: single criterion benefit, urutan harus terjaga ----------
{
  const criteria = [crit('C1', 0.6, 'benefit')];
  const m = [[5], [3], [1], [4]];
  const a = saw(criteria, m);
  const b = wp(criteria, m);
  const c = topsis(criteria, m);
  const order = (v) => v.map((x, i) => [x, i]).sort((p, q) => q[0] - p[0]).map((x) => x[1]).join('');
  t('SAW benefit tunggal: urutan sama dengan nilai asli', order(a.v) === order(m.map((r) => r[0])), order(a.v));
  t('WP benefit tunggal: urutan sama dengan nilai asli', order(b.v) === order(m.map((r) => r[0])), order(b.v));
  t('TOPSIS benefit tunggal: urutan sama dengan nilai asli', order(c.v) === order(m.map((r) => r[0])), order(c.v));
  t('SAW benefit tunggal: r maksimum = 1', close(Math.max(...a.r.map((r) => r[0])), 1), String(Math.max(...a.r.map((r) => r[0]))));
}

// ---------- Kasus 2: single criterion cost, urutan harus terbalik ----------
{
  const criteria = [crit('C1', 0.6, 'cost')];
  const m = [[5], [3], [1], [4]];
  const a = saw(criteria, m);
  const b = wp(criteria, m);
  const c = topsis(criteria, m);
  const desc = (v) => v.map((x, i) => [x, i]).sort((p, q) => q[0] - p[0]).map((x) => x[1]).join('');
  // Nilai cost [5, 3, 1, 4]: terbaik indeks 2, lalu 1, lalu 3, lalu 0.
  t('SAW cost tunggal: nilai terkecil terbaik', desc(a.v) === '2130', desc(a.v));
  t('WP cost tunggal: nilai terkecil terbaik', desc(b.v) === '2130', desc(b.v));
  t('TOPSIS cost tunggal: nilai terkecil terbaik', desc(c.v) === '2130', desc(c.v));
  // r = min(x)/x. Nilai terbaik (x terkecil) memperoleh r = 1, jadi r maksimum = 1
  // untuk kriteria cost maupun benefit. Yang membedakan hanya nilai mentahnya.
  t('SAW cost tunggal: r maksimum = 1', close(Math.max(...a.r.map((r) => r[0])), 1), String(Math.max(...a.r.map((r) => r[0]))));
}

// ---------- Kasus 3: dominasi, alternatif terbaik harus unggul ----------
{
  const criteria = [crit('C1', 0.4, 'benefit'), crit('C2', 0.3, 'benefit'), crit('C3', 0.3, 'cost')];
  const m = [
    [5, 5, 1],
    [4, 4, 2],
    [3, 3, 3],
    [1, 1, 5],
  ];
  const a = saw(criteria, m);
  const b = wp(criteria, m);
  const c = topsis(criteria, m);
  t('SAW: alternatif dominan peringkat 1', a.v[0] === Math.max(...a.v), a.v.map((x) => x.toFixed(4)).join(' '));
  t('WP: alternatif dominan peringkat 1', b.v[0] === Math.max(...b.v), b.v.map((x) => x.toFixed(4)).join(' '));
  t('TOPSIS: alternatif dominan peringkat 1', c.v[0] === Math.max(...c.v), c.v.map((x) => x.toFixed(4)).join(' '));
  t('TOPSIS: alternatif dominan mencapai V = 1', close(c.v[0], 1, 1e-12), c.v[0].toFixed(12));
  t('TOPSIS: alternatif terburuk mencapai V = 0', close(c.v[3], 0, 1e-12), c.v[3].toFixed(12));
  t('SAW: alternatif dominan mendapat V = 1 (bobot total 1)', close(a.v[0], 1, 1e-12), a.v[0].toFixed(12));
}

// ---------- Kasus 4: 2x2 yang bisa dihitung tangan ----------
{
  // w = 0,5 / 0,5. A1 = (4, 2), A2 = (2, 4). C1 benefit, C2 cost.
  // SAW: max C1 = 4, min C2 = 2.
  //   A1: 0,5*(4/4) + 0,5*(2/2) = 0,5 + 0,5 = 1
  //   A2: 0,5*(2/4) + 0,5*(2/4) = 0,25 + 0,25 = 0,5
  const criteria = [crit('C1', 0.5, 'benefit'), crit('C2', 0.5, 'cost')];
  const m = [
    [4, 2],
    [2, 4],
  ];
  const a = saw(criteria, m);
  t('SAW 2x2: A1 = 1 dan A2 = 0,5 sesuai hitung tangan', close(a.v[0], 1) && close(a.v[1], 0.5), a.v.join(' / '));

  // WP: w' = 0,5. S1 = 4^0,5 * 2^-0,5 = 2 / 1,41421356 = 1,41421356
  //               S2 = 2^0,5 * 4^-0,5 = 1,41421356 / 2 = 0,70710678
  //     total = 2,12132034. V1 = 0,66666667, V2 = 0,33333333
  const b = wp(criteria, m);
  const root2 = Math.SQRT2;
  t('WP 2x2: V1 = 2/3 sesuai hitung tangan', close(b.v[0], 2 / 3, 1e-12), b.v[0].toFixed(12));
  t('WP 2x2: S1 = akar 2 sesuai hitung tangan', close(b.s[0], root2, 1e-12), b.s[0].toFixed(12));

  // TOPSIS: divisor C1 = akar(16+4) = akar20 = 4,47213595
  //         divisor C2 = akar(4+16) = akar20 = 4,47213595
  //   r1 = (0,89442719, 0,44721360)  r2 = (0,44721360, 0,89442719)
  //   y  = 0,5 * r  ->  y1 = (0,44721360, 0,22360680)  y2 = (0,22360680, 0,44721360)
  //   A+ = (0,44721360, 0,22360680)  A- = (0,22360680, 0,44721360)
  //   D+ A1 = 0  -> V1 = 1 ; D+ A2 = akar(2 * 0,22360680^2) -> V2 = 0
  const c = topsis(criteria, m);
  t('TOPSIS 2x2: A1 = 1 dan A2 = 0 sesuai hitung tangan', close(c.v[0], 1, 1e-12) && close(c.v[1], 0, 1e-12), c.v.map((x) => x.toFixed(12)).join(' / '));
  t('TOPSIS 2x2: pembagi = akar 20', close(c.div[0], Math.sqrt(20), 1e-12) && close(c.div[1], Math.sqrt(20), 1e-12), c.div.map((x) => x.toFixed(8)).join(' / '));
}

// ---------- Kasus 5: lintasan hitung alternatif ----------
{
  const criteria = [crit('C1', 0.3, 'benefit'), crit('C2', 0.25, 'benefit'), crit('C3', 0.2, 'benefit'), crit('C4', 0.25, 'cost')];
  const m = [
    [4, 3, 5, 2],
    [3, 5, 4, 3],
    [5, 4, 3, 4],
    [2, 2, 4, 1],
  ];

  // WP: perkalian pangkat vs penjumlahan logaritma
  const direct = wp(criteria, m);
  const logd = wpLogDomain(criteria, m);
  const maxDiff = Math.max(...direct.v.map((v, i) => Math.abs(v - logd.v[i])));
  t('WP: jalur pangkat dan jalur logaritma menghasilkan V sama', maxDiff < 1e-12, 'selisih maks ' + maxDiff.toExponential(2));

  // TOPSIS: jarak langsung vs ekspansi aljabar
  const directTop = topsis(criteria, m);
  const expanded = topsisExpanded(criteria, m);
  const dTop = Math.max(...directTop.v.map((v, i) => Math.abs(v - expanded.v[i])));
  t('TOPSIS: jarak langsung dan ekspansi aljabar menghasilkan V sama', dTop < 1e-9, 'selisih maks ' + dTop.toExponential(2));

  // Properti normalisasi vektor: norma kolom r = 1
  const norms = criteria.map((_, j) => Math.sqrt(directTop.r.reduce((s, row) => s + row[j] * row[j], 0)));
  t('TOPSIS: norma Euclidean setiap kolom R = 1', norms.every((n) => close(n, 1, 1e-12)), norms.map((n) => n.toFixed(12)).join(' '));

  // Properti terbobot: setiap y_ij <= w'_j
  const wn = criteria.map((c) => c.weight / criteria.reduce((s, x) => s + x.weight, 0));
  const bounded = directTop.y.every((row) => row.every((v, j) => v <= wn[j] + 1e-12));
  t('TOPSIS: setiap y_ij <= w_j', bounded, 'ok');

  // SAW: benefit memakai r = x/max, cost memakai r = min/x. Pada keduanya
  // alternatif terbaik mendapat r = 1, jadi r maksimum tiap kolom adalah 1.
  const a = saw(criteria, m);
  const benefitCols = [0, 1, 2];
  const costCols = [3];
  const benefitOk = benefitCols.every((j) => close(Math.max(...a.r.map((row) => row[j])), 1, 1e-12));
  const costOk = costCols.every((j) => close(Math.max(...a.r.map((row) => row[j])), 1, 1e-12));
  t('SAW: setiap kolom memiliki r maksimum = 1', benefitOk && costOk, 'ok');

  // SAW dan WP monoton: alternatif yang mendominasi lemah harus unggul
  const m2 = [...m, [1, 1, 1, 5]];
  const a2 = saw(criteria, m2);
  t('SAW: penambahan alternatif buruk tidak mengubah skor lama', a2.v.slice(0, 4).every((v, i) => close(v, a.v[i], 1e-12)), 'ok');
}

// ---------- Kasus 6: kasus tepi yang harus ditolak ----------
{
  const criteria = [crit('C1', 0.5, 'benefit'), crit('C2', 0.5, 'cost')];
  const withZeroCost = [
    [4, 0],
    [2, 2],
  ];
  const c = topsis(criteria, withZeroCost);
  const wpZero = wp(criteria, withZeroCost);
  t('Input nol pada kriteria cost menghasilkan Infinity (harus ditolak engine)', !Number.isFinite(wpZero.s[0]) || !Number.isFinite(c.v[0]), 'terdeteksi');
  t('Tidak ada NaN diam-diam pada kasus nol', !c.v.some((v) => Number.isNaN(v)), c.v.map((v) => String(v)).join(' / '));
}

let failed = 0;
for (const r of results) {
  console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.name + '  (' + r.detail + ')');
  if (!r.ok) failed++;
}
console.log(failed === 0 ? 'SEMUA UJI VALIDITAS LOLOS (' + results.length + ' butir)' : failed + ' GAGAL dari ' + results.length);
process.exit(failed === 0 ? 0 : 1);