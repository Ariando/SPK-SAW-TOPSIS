// Hitung manual EDAS, ARAS, MABAC, SMART untuk dataset acuan.
// Ditulis terpisah dari engine, memakai rumus dari literatur yang dirujuk
// pada komentar tiap berkas metode.
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
const m = X.length;
const n = W.length;

const f = (v, d = 10) => Number(v.toFixed(d));
const sum = (a) => a.reduce((s, v) => s + v, 0);
const col = (j) => X.map((r) => r[j]);
const maxOf = (j) => Math.max(...col(j));
const minOf = (j) => Math.min(...col(j));

console.log('Dataset X =', JSON.stringify(X));
console.log('Bobot =', JSON.stringify(W), '| arah:', DIR.join(', '));
console.log('');

/* ---------------- EDAS ---------------- */
const av = Array.from({ length: n }, (_, j) => sum(col(j)) / m);

const pda = X.map((row) =>
  row.map((x, j) => {
    const diff = DIR[j] === 'benefit' ? x - av[j] : av[j] - x;
    return Math.max(0, diff) / av[j];
  })
);
const nda = X.map((row) =>
  row.map((x, j) => {
    const diff = DIR[j] === 'benefit' ? av[j] - x : x - av[j];
    return Math.max(0, diff) / av[j];
  })
);
const sp = pda.map((row) => sum(row.map((v, j) => W[j] * v)));
const sn = nda.map((row) => sum(row.map((v, j) => W[j] * v)));
const maxSp = Math.max(...sp);
const maxSn = Math.max(...sn);
const nsp = sp.map((v) => v / maxSp);
const nsn = sn.map((v) => 1 - v / maxSn);
const as = nsp.map((v, i) => (v + nsn[i]) / 2);

console.log('EDAS');
console.log('  AV  =', av.map((v) => f(v, 6)));
console.log('  PDA =', pda.map((row) => row.map((v) => f(v, 6))));
console.log('  NDA =', nda.map((row) => row.map((v) => f(v, 6))));
console.log('  SP  =', sp.map((v) => f(v, 6)), '| SN =', sn.map((v) => f(v, 6)));
console.log('  NSP =', nsp.map((v) => f(v, 6)), '| NSN =', nsn.map((v) => f(v, 6)));
console.log('  AS  =', as.map((v) => f(v)));
console.log('');

/* ---------------- ARAS ---------------- */
const best = Array.from({ length: n }, (_, j) => (DIR[j] === 'benefit' ? maxOf(j) : minOf(j)));
const ext = [best, ...X];

const ratios = [];
for (let j = 0; j < n; j++) {
  if (DIR[j] === 'benefit') {
    const s = sum(ext.map((r) => r[j]));
    ratios.push(ext.map((r) => r[j] / s));
  } else {
    const inv = ext.map((r) => best[j] / r[j]);
    const s = sum(inv);
    ratios.push(inv.map((v) => v / s));
  }
}

const arasScore = (i) => sum(Array.from({ length: n }, (_, j) => W[j] * ratios[j][i]));
const s0 = arasScore(0);
const sAlt = X.map((_, i) => arasScore(i + 1));
const k = sAlt.map((v) => v / s0);

console.log('ARAS');
console.log('  A0  =', best);
console.log('  R   =', ratios.map((r) => r.map((v) => f(v, 6))));
console.log('  S   =', sAlt.map((v) => f(v, 6)), '| S0 =', f(s0, 6));
console.log('  K   =', k.map((v) => f(v)));
console.log('');

/* ---------------- MABAC ---------------- */
const norm = X.map((row) =>
  row.map((x, j) => {
    const range = maxOf(j) - minOf(j);
    return DIR[j] === 'benefit' ? (x - minOf(j)) / range : (x - maxOf(j)) / (minOf(j) - maxOf(j));
  })
);
const v = norm.map((row) => row.map((nv, j) => W[j] * (nv + 1)));
const g = Array.from({ length: n }, (_, j) => Math.pow(v.reduce((acc, row) => acc * row[j], 1), 1 / m));
const q = v.map((row) => row.map((vv, j) => vv - g[j]));
const mabacScore = q.map((row) => sum(row));

console.log('MABAC');
console.log('  max =', Array.from({ length: n }, (_, j) => maxOf(j)), '| min =', Array.from({ length: n }, (_, j) => minOf(j)));
console.log('  N   =', norm.map((row) => row.map((x) => f(x, 6))));
console.log('  V   =', v.map((row) => row.map((x) => f(x, 6))));
console.log('  G   =', g.map((x) => f(x, 6)));
console.log('  Q   =', q.map((row) => row.map((x) => f(x, 6))));
console.log('  S   =', mabacScore.map((x) => f(x)));
console.log('');

/* ---------------- SMART ---------------- */
const util = X.map((row) =>
  row.map((x, j) => {
    const range = maxOf(j) - minOf(j);
    return DIR[j] === 'benefit' ? (x - minOf(j)) / range : (maxOf(j) - x) / range;
  })
);
const smartScore = util.map((row) => sum(row.map((u, j) => W[j] * u)));

console.log('SMART');
console.log('  u =', util.map((row) => row.map((x) => f(x, 6))));
console.log('  U =', smartScore.map((x) => f(x)));
console.log('');

/* ---------------- Peringkat ---------------- */
console.log('Peringkat (terbesar terbaik):');
const rankDesc = (vals, label) => {
  const order = vals.map((vv, i) => [vv, i]).sort((a, b) => b[0] - a[0]);
  console.log('  ' + label.padEnd(8) + ':', order.map(([vv, i]) => 'A' + (i + 1) + '=' + f(vv, 4)).join(' > '));
};

rankDesc(as, 'EDAS');
rankDesc(k, 'ARAS');
rankDesc(mabacScore, 'MABAC');
rankDesc(smartScore, 'SMART');