// Generator fixture F0 untuk TELAAH.
// Dijalankan: node docs/reference/generate-fixture.mjs
// Menulis ulang dataset-demo-f0.json. Angka dihitung dari definisi rumus pada
// rumus-saw-wp-topsis.md, bukan dari engine aplikasi, supaya fixture tetap
// independen terhadap implementasi yang diuji di F5.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(here, 'dataset-demo-f0.json');

const criteria = [
  { code: 'C1', name: 'Relevansi tema dan judul', weight: 0.3, direction: 'benefit' },
  { code: 'C2', name: 'Ketajaman metodologi', weight: 0.25, direction: 'benefit' },
  { code: 'C3', name: 'Ketersediaan data', weight: 0.2, direction: 'benefit' },
  { code: 'C4', name: 'Beban biaya dan waktu', weight: 0.25, direction: 'cost' },
];

const alternatives = [
  { code: 'A1', title: 'Sistem rekomendasi beasiswa berbasis profil', x: [4, 3, 5, 2] },
  { code: 'A2', title: 'Deteksi plagiarisme dokumen akademik', x: [3, 5, 4, 3] },
  { code: 'A3', title: 'Optimasi jadwal kuliah dengan algoritma genetika', x: [5, 4, 3, 4] },
  { code: 'A4', title: 'Aplikasi monitoring magang berbasis web', x: [2, 2, 4, 1] },
];

const r10 = (n) => Number(n.toFixed(10));
const col = (j) => alternatives.map((a) => a.x[j]);
const wSum = criteria.reduce((s, c) => s + c.weight, 0);
const wNorm = criteria.map((c) => c.weight / wSum);

const sawMax = criteria.map((_, j) => Math.max(...col(j)));
const sawMin = criteria.map((_, j) => Math.min(...col(j)));
const sawR = alternatives.map((a) =>
  a.x.map((v, j) => (criteria[j].direction === 'benefit' ? v / sawMax[j] : sawMin[j] / v))
);
const sawV = sawR.map((row) => row.reduce((s, r, j) => s + criteria[j].weight * r, 0));

const wpS = alternatives.map((a) =>
  a.x.reduce((p, v, j) => p * Math.pow(v, criteria[j].direction === 'benefit' ? wNorm[j] : -wNorm[j]), 1)
);
const wpTotal = wpS.reduce((s, v) => s + v, 0);
const wpV = wpS.map((s) => s / wpTotal);

const divisor = criteria.map((_, j) => Math.sqrt(col(j).reduce((s, v) => s + v * v, 0)));
const topR = alternatives.map((a) => a.x.map((v, j) => v / divisor[j]));
const topY = topR.map((row) => row.map((r, j) => criteria[j].weight * r));
const idealPlus = criteria.map((c, j) =>
  c.direction === 'benefit' ? Math.max(...topY.map((r) => r[j])) : Math.min(...topY.map((r) => r[j]))
);
const idealMinus = criteria.map((c, j) =>
  c.direction === 'benefit' ? Math.min(...topY.map((r) => r[j])) : Math.max(...topY.map((r) => r[j]))
);
const dPlus = topY.map((row) => Math.sqrt(row.reduce((s, y, j) => s + (y - idealPlus[j]) ** 2, 0)));
const dMinus = topY.map((row) => Math.sqrt(row.reduce((s, y, j) => s + (y - idealMinus[j]) ** 2, 0)));
const topV = topY.map((_, i) => dMinus[i] / (dPlus[i] + dMinus[i]));

const denseRank = (vals) => {
  const uniq = [...new Set(vals.map((v) => Number(v.toFixed(6))))].sort((a, b) => b - a);
  return vals.map((v) => {
    const rank = uniq.indexOf(Number(v.toFixed(6))) + 1;
    const ties = vals.filter((o) => Math.abs(o - v) < 1e-9).length;
    return { rank, tied: ties > 1 };
  });
};

const roundMatrix = (m) => m.map((row) => row.map(r10));

const doc = {
  name: 'dataset-demo-f0',
  purpose:
    'Fixture verifikasi untuk F5. Angka dihitung manual dan dicocokkan dengan lembar perhitungan-manual.xlsx.',
  scale: 'Skala nilai 1 sampai 5, mengikuti rubrik aplikasi lama. Skala ini bukan ketentuan metode.',
  criteria: criteria.map((c) => ({ ...c, weight: r10(c.weight) })),
  weightSum: r10(wSum),
  normalizedWeights: wNorm.map(r10),
  alternatives: alternatives.map((a) => ({ code: a.code, title: a.title, values: a.x })),
  matrix: alternatives.map((a) => a.x),
  expected: {
    saw: { max: sawMax, min: sawMin, r: roundMatrix(sawR), v: sawV.map(r10), rank: denseRank(sawV) },
    wp: { s: wpS.map(r10), totalS: r10(wpTotal), v: wpV.map(r10), rank: denseRank(wpV) },
    topsis: {
      divisor: divisor.map(r10),
      r: roundMatrix(topR),
      y: roundMatrix(topY),
      idealPlus: idealPlus.map(r10),
      idealMinus: idealMinus.map(r10),
      dPlus: dPlus.map(r10),
      dMinus: dMinus.map(r10),
      v: topV.map(r10),
      rank: denseRank(topV),
    },
  },
  tolerance: 1e-4,
  notes: [
    'Peringkat memakai dense ranking. Aplikasi lama memakai nomor urut posisi sehingga seri menjadi peringkat berbeda.',
    'Nilai V disimpan 8 desimal, dibulatkan 4 desimal hanya saat tampil.',
    'TOPSIS: solusi ideal dihitung dari matriks terbobot Y, bukan dari matriks ternormalisasi R.',
  ],
};

fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log('written: ' + path.relative(process.cwd(), outPath));