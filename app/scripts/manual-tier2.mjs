// Hitung manual WASPAS, MOORA, COPRAS, VIKOR untuk satu dataset kecil.
// Ditulis terpisah dari engine. Angka di sini menjadi acuan uji.
//
// Dataset: 3 alternatif, 2 kriteria.
//   C1 benefit, bobot 0,6
//   C2 cost,    bobot 0,4
//   X = [[4, 2], [3, 3], [5, 1]]

const X = [
  [4, 2],
  [3, 3],
  [5, 1],
];
const W = [0.6, 0.4];
const DIR = ['benefit', 'cost'];

const f = (n, d = 10) => Number(n.toFixed(d));
const sum = (a) => a.reduce((s, v) => s + v, 0);

/* ---------------- WASPAS ---------------- */
const maxC = [Math.max(...X.map((r) => r[0])), Math.max(...X.map((r) => r[1]))];
const minC = [Math.min(...X.map((r) => r[0])), Math.min(...X.map((r) => r[1]))];

const R_saw = X.map((row) =>
  row.map((v, j) => (DIR[j] === 'benefit' ? v / maxC[j] : minC[j] / v))
);

const S = R_saw.map((row) => sum(row.map((r, j) => W[j] * r)));
const P = R_saw.map((row) => row.reduce((acc, r, j) => acc * Math.pow(r, W[j]), 1));
const lambda = 0.5;
const Q_waspas = S.map((s, i) => lambda * s + (1 - lambda) * P[i]);

/* ---------------- MOORA ---------------- */
const divisor = [0, 1].map((j) => Math.sqrt(sum(X.map((r) => r[j] * r[j]))));
const R_moora = X.map((row) => row.map((v, j) => v / divisor[j]));
const W_moora = R_moora.map((row) => row.map((r, j) => W[j] * r));
const y_moora = W_moora.map((row) =>
  sum(row.map((v, j) => (DIR[j] === 'benefit' ? v : 0))) - sum(row.map((v, j) => (DIR[j] === 'cost' ? v : 0)))
);

/* ---------------- COPRAS ---------------- */
// Normalisasi standar: r_ij = x_ij / jumlah_i x_ij untuk SEMUA kriteria.
// Memakai (1/x) untuk cost akan membalik hasil, karena rumus Q sudah
// memberi nilai besar saat S- kecil.
const sumC1 = sum(X.map((r) => r[0]));
const sumC2 = sum(X.map((r) => r[1]));
const R_copras = X.map((row) => [row[0] / sumC1, row[1] / sumC2]);
const W_copras = R_copras.map((row) => row.map((r, j) => W[j] * r));
const Splus = W_copras.map((row) => row[0]);
const Sminus = W_copras.map((row) => row[1]);
const sMinusMin = Math.min(...Sminus);
const sMinusSum = sum(Sminus);
const Q_copras = Splus.map(
  (sp, i) => sp + (sMinusMin * sMinusSum) / (Sminus[i] * sum(Sminus.map((v) => sMinusMin / v)))
);

/* ---------------- VIKOR ---------------- */
const best = [Math.max(...X.map((r) => r[0])), Math.min(...X.map((r) => r[1]))];
const worst = [Math.min(...X.map((r) => r[0])), Math.max(...X.map((r) => r[1]))];
const gaps = X.map((row) => row.map((v, j) => (best[j] - v) / (best[j] - worst[j])));
const wgaps = gaps.map((row) => row.map((g, j) => W[j] * g));
const Sv = wgaps.map((row) => sum(row));
const Rv = wgaps.map((row) => Math.max(...row));
const sPlus = Math.min(...Sv);
const sMinus = Math.max(...Sv);
const rPlus = Math.min(...Rv);
const rMinus = Math.max(...Rv);
const v = 0.5;
const Q_vikor = Sv.map(
  (s, i) => v * ((s - sPlus) / (sMinus - sPlus)) + (1 - v) * ((Rv[i] - rPlus) / (rMinus - rPlus))
);

/* ---------------- Laporan ---------------- */
console.log('Dataset X =', JSON.stringify(X));
console.log('Bobot   =', JSON.stringify(W), '| arah:', DIR.join(', '));
console.log('');

console.log('WASPAS');
console.log('  max =', maxC.map((x) => f(x)), '| min =', minC.map((x) => f(x)));
console.log('  R =', R_saw.map((row) => row.map((x) => f(x, 6))));
console.log('  S =', S.map((x) => f(x, 6)));
console.log('  P =', P.map((x) => f(x, 6)));
console.log('  Q (lambda 0,5) =', Q_waspas.map((x) => f(x)));
console.log('');

console.log('MOORA');
console.log('  pembagi =', divisor.map((x) => f(x, 6)));
console.log('  y =', y_moora.map((x) => f(x)));
console.log('');

console.log('COPRAS');
console.log('  jumlah kolom =', [sumC1, sumC2].map((x) => f(x, 6)));
console.log('  S+ =', Splus.map((x) => f(x, 6)));
console.log('  S- =', Sminus.map((x) => f(x, 6)));
console.log('  S- min =', f(sMinusMin, 6), '| jumlah S- =', f(sMinusSum, 6));
console.log('  Q =', Q_copras.map((x) => f(x)));
console.log('');

console.log('VIKOR');
console.log('  f+ =', best, '| f- =', worst);
console.log('  gap =', gaps.map((row) => row.map((x) => f(x, 6))));
console.log('  S =', Sv.map((x) => f(x, 6)));
console.log('  R =', Rv.map((x) => f(x, 6)));
console.log('  S+ / S- =', f(sPlus, 6), '/', f(sMinus, 6));
console.log('  R+ / R- =', f(rPlus, 6), '/', f(rMinus, 6));
console.log('  Q (v 0,5) =', Q_vikor.map((x) => f(x)));
console.log('');

console.log('Peringkat (semua metode, terbaik lebih dulu):');
const rankDesc = (vals, label) => {
  const order = vals.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
  console.log('  ' + label + ':', order.map(([v, i]) => 'A' + (i + 1) + '=' + f(v, 4)).join(' > '));
};
const rankAsc = (vals, label) => {
  const order = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  console.log('  ' + label + ':', order.map(([v, i]) => 'A' + (i + 1) + '=' + f(v, 4)).join(' < '));
};

rankDesc(Q_waspas, 'WASPAS');
rankDesc(y_moora, 'MOORA');
rankDesc(Q_copras, 'COPRAS');
rankAsc(Q_vikor, 'VIKOR (terkecil terbaik)');