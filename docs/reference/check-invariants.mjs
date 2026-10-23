// Pemeriksaan invarian fixture F0 untuk TELAAH.
// Dijalankan: node docs/reference/check-invariants.mjs
// Mengimplementasikan ulang rumus dari definisi, bukan memanggil engine aplikasi,
// sehingga hasilnya independen terhadap implementasi F5.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(fs.readFileSync(path.join(here, 'dataset-demo-f0.json'), 'utf8'));

const { criteria, matrix, expected } = fixture;
const w = criteria.map((c) => c.weight);
const wSum = w.reduce((s, v) => s + v, 0);
const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });

const ORDER = (vals) => vals.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).map((x) => x[1]).join(',');

const sawV = (m) => {
  const max = criteria.map((_, j) => Math.max(...m.map((r) => r[j])));
  const min = criteria.map((_, j) => Math.min(...m.map((r) => r[j])));
  return m.map((row) =>
    row.reduce((s, v, j) => s + w[j] * (criteria[j].direction === 'benefit' ? v / max[j] : min[j] / v), 0)
  );
};

const wpV = (m) => {
  const s = m.map((row) =>
    row.reduce((p, v, j) => p * Math.pow(v, criteria[j].direction === 'benefit' ? w[j] / wSum : -w[j] / wSum), 1)
  );
  const t = s.reduce((a, b) => a + b, 0);
  return s.map((v) => v / t);
};

const topV = (m) => {
  const div = criteria.map((_, j) => Math.sqrt(m.reduce((s, r) => s + r[j] * r[j], 0)));
  const y = m.map((r) => r.map((v, j) => (w[j] / wSum) * (v / div[j])));
  const plus = criteria.map((c, j) =>
    c.direction === 'benefit' ? Math.max(...y.map((r) => r[j])) : Math.min(...y.map((r) => r[j]))
  );
  const minus = criteria.map((c, j) =>
    c.direction === 'benefit' ? Math.min(...y.map((r) => r[j])) : Math.max(...y.map((r) => r[j]))
  );
  const dp = y.map((r) => Math.sqrt(r.reduce((s, v, j) => s + (v - plus[j]) ** 2, 0)));
  const dm = y.map((r) => Math.sqrt(r.reduce((s, v, j) => s + (v - minus[j]) ** 2, 0)));
  return dp.map((d, i) => dm[i] / (d + dm[i]));
};

check('bobot total = 1', Math.abs(wSum - 1) < 1e-9, String(wSum));

check(
  'SAW dalam rentang 0..sum(w)',
  expected.saw.v.every((v) => v >= 0 && v <= wSum + 1e-9),
  'total V=' + expected.saw.v.reduce((s, v) => s + v, 0).toFixed(6)
);

const wpSum = expected.wp.v.reduce((s, v) => s + v, 0);
check('WP dalam rentang 0..1', expected.wp.v.every((v) => v >= 0 && v <= 1), 'n=' + expected.wp.v.length);
check('jumlah V WP = 1', Math.abs(wpSum - 1) < 1e-9, wpSum.toFixed(10));

check(
  'TOPSIS dalam rentang 0..1',
  expected.topsis.v.every((v) => v >= 0 && v <= 1),
  expected.topsis.v.map((v) => v.toFixed(4)).join(', ')
);

const scaled = matrix.map((row) => row.map((v) => v * 3));
check(
  'SAW invarian terhadap skala positif',
  ORDER(sawV(matrix)) === ORDER(sawV(scaled)),
  ORDER(sawV(matrix)) + ' vs ' + ORDER(sawV(scaled))
);
check(
  'WP invarian terhadap skala positif',
  ORDER(wpV(matrix)) === ORDER(wpV(scaled)),
  ORDER(wpV(matrix)) + ' vs ' + ORDER(wpV(scaled))
);
check(
  'TOPSIS invarian terhadap skala positif',
  ORDER(topV(matrix)) === ORDER(topV(scaled)),
  ORDER(topV(matrix)) + ' vs ' + ORDER(topV(scaled))
);

const tie = [matrix[0], [...matrix[0]], matrix[2], matrix[3]];
const tieSaw = sawV(tie);
check(
  'alternatif identik memperoleh skor identik',
  Math.abs(tieSaw[0] - tieSaw[1]) < 1e-12,
  tieSaw[0].toFixed(12) + ' vs ' + tieSaw[1].toFixed(12)
);

const referenceRanks = { saw: [1, 3, 2, 4], wp: [1, 2, 3, 4], topsis: [1, 2, 3, 4] };
for (const method of ['saw', 'wp', 'topsis']) {
  const got = expected[method].rank.map((r) => r.rank);
  check('peringkat ' + method + ' sesuai acuan', got.join(',') === referenceRanks[method].join(','), got.join(','));
}

let failed = 0;
for (const r of results) {
  console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.name + '  (' + r.detail + ')');
  if (!r.ok) failed++;
}
console.log(failed === 0 ? 'SEMUA INVARIAN LOLOS' : failed + ' GAGAL');
process.exit(failed === 0 ? 0 : 1);