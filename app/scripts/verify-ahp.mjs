// Verifikasi independen AHP.
// Menghitung eigenvector dengan metode yang berbeda dari implementasi:
// dekomposisi QR untuk eigenvalue, dan rata-rata geometrik baris untuk bobot.
// Kalau dua jalur berbeda sepakat, implementasi utama bukan sekadar cocok
// dengan dirinya sendiri.
//
// Dijalankan: tsx scripts/verify-ahp.mjs

const { computeAhp, principalEigenvector, geometricMeanWeights, RANDOM_INDEX } = await import(
  '../src/lib/ahp/ahp.ts'
);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  (' + detail + ')' : ''));
};

const close = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;

/* ---------------- Aljabar linear independen ---------------- */

const multiply = (A, B) =>
  A.map((row) => B[0].map((_, j) => row.reduce((s, v, k) => s + v * B[k][j], 0)));

const transpose = (A) => A[0].map((_, j) => A.map((row) => row[j]));

const norm = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

// Dekomposisi QR dengan Gram-Schmidt, lalu iterasi QR untuk eigenvalue.
/**
 * Gram-Schmidt gagal bila kolom bergantung linear, yang terjadi pada matriks
 * dengan eigenvalue berulang seperti matriks semua-satu. Fungsi ini
 * mengembalikan null pada kasus itu, dan pemanggil melewati pembandingan QR
 * dengan catatan, bukan menganggapnya gagal.
 */
const qrDecompose = (A) => {
  const n = A.length;
  const Q = [];
  const columns = transpose(A);

  for (let j = 0; j < n; j++) {
    let v = columns[j].slice();
    for (const q of Q) {
      const proj = q.reduce((s, val, k) => s + val * v[k], 0);
      v = v.map((val, k) => val - proj * q[k]);
    }
    const length = norm(v);
    if (length < 1e-12) return null;
    Q.push(v.map((x) => x / length));
  }

  const Qm = Q[0].map((_, i) => Q.map((q) => q[i]));
  const R = multiply(transpose(Qm), A);
  return { Q: Qm, R };
};

const eigenByQr = (A, iterations = 2000) => {
  let Ak = A.map((row) => row.slice());
  for (let i = 0; i < iterations; i++) {
    const decomposed = qrDecompose(Ak);
    if (!decomposed) return null;
    Ak = multiply(decomposed.R, decomposed.Q);
  }
  return Ak.map((row, i) => row[i]);
};

const powerMethodIndependent = (A, iterations = 2000) => {
  const n = A.length;
  let v = new Array(n).fill(1);
  for (let i = 0; i < iterations; i++) {
    const next = A.map((row) => row.reduce((s, val, k) => s + val * v[k], 0));
    const sum = next.reduce((s, x) => s + x, 0);
    v = next.map((x) => x / sum);
  }
  return v;
};

/* ---------------- Kasus uji ---------------- */

const cases = [
  {
    name: 'Saaty: gaji, reputasi, kesempatan',
    labels: ['Gaji', 'Reputasi', 'Kesempatan'],
    matrix: [
      [1, 3, 5],
      [1 / 3, 1, 3],
      [1 / 5, 1 / 3, 1],
    ],
  },
  {
    name: 'konsisten sempurna, bobot 0,5/0,3/0,2',
    labels: ['C1', 'C2', 'C3'],
    matrix: (() => {
      const w = [0.5, 0.3, 0.2];
      return w.map((wi) => w.map((wj) => wi / wj));
    })(),
  },
  {
    name: 'tidak konsisten melingkar 3x3',
    labels: ['C1', 'C2', 'C3'],
    matrix: [
      [1, 9, 1 / 9],
      [1 / 9, 1, 9],
      [9, 1 / 9, 1],
    ],
  },
  {
    name: 'empat kriteria',
    labels: ['C1', 'C2', 'C3', 'C4'],
    matrix: [
      [1, 3, 5, 7],
      [1 / 3, 1, 4, 6],
      [1 / 5, 1 / 4, 1, 2],
      [1 / 7, 1 / 6, 1 / 2, 1],
    ],
  },
  {
    name: 'merata 5x5',
    labels: ['C1', 'C2', 'C3', 'C4', 'C5'],
    matrix: Array.from({ length: 5 }, () => new Array(5).fill(1)),
  },
];

for (const c of cases) {
  console.log('\n=== ' + c.name + ' ===');
  const result = computeAhp({ labels: c.labels, matrix: c.matrix });

  // 1. Bobot dari iterasi pangkat dibandingkan dengan metode pangkat independen
  const independent = powerMethodIndependent(c.matrix);
  const maxDiffWeights = Math.max(...result.weights.map((w, i) => Math.abs(w - independent[i])));
  check('bobot cocok dengan pangkat independen', maxDiffWeights < 1e-9, 'selisih maks ' + maxDiffWeights.toExponential(2));

  // 2. Bobot dibandingkan dengan rata-rata geometrik baris
  const geo = geometricMeanWeights(c.matrix);
  const maxDiffGeo = Math.max(...result.weights.map((w, i) => Math.abs(w - geo[i])));
  check('bobot mendekati rata-rata geometrik', maxDiffGeo < 5e-2, 'selisih maks ' + maxDiffGeo.toExponential(2));

  // 3. lambda_max dibandingkan dengan eigenvalue dari iterasi QR
  const eigen = eigenByQr(c.matrix);
  if (eigen === null) {
    // Matriks dengan eigenvalue berulang membuat QR Gram-Schmidt degenerasi.
    // Untuk matriks seperti itu, lambda_max yang benar adalah n, dan itu
    // diperiksa langsung.
    check(
      'lambda_max sama dengan n pada matriks eigenvalue berulang',
      close(result.lambdaMax, c.labels.length, 1e-9),
      'modul ' + result.lambdaMax.toFixed(9) + ', n = ' + c.labels.length
    );
  } else {
    const lambdaFromQr = eigen.sort((a, b) => b - a)[0];
    check(
      'lambda_max cocok dengan eigenvalue QR',
      close(result.lambdaMax, lambdaFromQr, 1e-6),
      'modul ' + result.lambdaMax.toFixed(9) + ' | QR ' + lambdaFromQr.toFixed(9)
    );
  }

  // 4. Bobot berjumlah 1
  check('bobot berjumlah 1', close(result.weights.reduce((s, v) => s + v, 0), 1, 1e-12), '');

  // 5. CR sesuai definisi
  const expectedCr = result.ri === 0 ? 0 : result.ci / result.ri;
  check('CR sesuai definisi CI/RI', close(result.cr, expectedCr, 1e-12), result.cr.toFixed(9));

  // 6. RI sesuai tabel
  check('RI sesuai tabel Saaty', result.ri === RANDOM_INDEX[c.labels.length - 1], String(result.ri));
}

/* ---------------- Kasus konsisten sempurna: CR harus nol ---------------- */
console.log('\n=== CR pada matriks konsisten sempurna ===');
for (const n of [2, 3, 4, 5, 6, 8, 10]) {
  const w = Array.from({ length: n }, (_, i) => n - i);
  const total = w.reduce((s, v) => s + v, 0);
  const normalized = w.map((v) => v / total);
  const matrix = normalized.map((wi) => normalized.map((wj) => wi / wj));
  const labels = Array.from({ length: n }, (_, i) => 'C' + (i + 1));
  const result = computeAhp({ labels, matrix });
  check('CR nol untuk n = ' + n, result.cr < 1e-9, result.cr.toExponential(2));
}

/* ---------------- Ketahanan iterasi ---------------- */
console.log('\n=== ketahanan iterasi ===');
{
  const matrix = [
    [1, 2, 3],
    [1 / 2, 1, 2],
    [1 / 3, 1 / 2, 1],
  ];
  let prev = null;
  let monotone = true;
  for (const tol of [1e-3, 1e-6, 1e-9, 1e-12]) {
    const { iterations } = principalEigenvector(matrix, { tolerance: tol });
    if (prev !== null && iterations < prev) monotone = false;
    prev = iterations;
  }
  check('toleransi lebih ketat membutuhkan langkah lebih banyak', monotone, '');
}

const failed = results.filter((r) => !r.ok).length;
console.log('\n' + (failed === 0 ? 'SELURUHNYA COCOK DENGAN METODE INDEPENDEN' : failed + ' GAGAL') + ' (' + results.length + ' butir)');
process.exit(failed === 0 ? 0 : 1);