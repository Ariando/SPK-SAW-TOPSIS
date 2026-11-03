import type { TraceStep } from '../dss/types';

/**
 * AHP crisp untuk perbandingan berpasangan antar KRITERIA.
 *
 * Rujukan: Saaty, T. L., "The Analytic Hierarchy Process", McGraw-Hill, 1980.
 * Untuk Consistency Index dan Random Index: Saaty, "A scaling method for
 * priorities in hierarchical structures", Journal of Mathematical Psychology
 * 15(3), 1977.
 *
 * Vektor prioritas dihitung dengan iterasi pangkat (power iteration) menuju
 * eigenvector utama matriks, sesuai definisi Saaty. Metode rata-rata geometrik
 * baris dipakai sebagai pembanding di uji, bukan sebagai implementasi utama,
 * karena keduanya dapat berbeda di digit ke-6.
 *
 * Cakupan: hanya bobot kriteria. Perbandingan berpasangan antar alternatif
 * tidak termasuk, sesuai keputusan pemilik produk.
 */

/** Nilai skala Saaty yang diterima, termasuk kebalikannya. */
export const SAATY_VALUES = [9, 8, 7, 6, 5, 4, 3, 2, 1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6, 1 / 7, 1 / 8, 1 / 9];

/**
 * Indeks acak Saaty untuk n = 1 sampai 15.
 *
 * Nilai ini adalah tabel empiris, bukan rumus. Literatur berbeda tipis pada
 * n >= 12. Tabel berikut memakai nilai yang paling banyak dikutip, dan
 * layanan ini menolak menghitung CR di atas n = 15.
 */
export const RANDOM_INDEX: number[] = [
  0, 0, 0.58, 0.9, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49, 1.51, 1.48, 1.56, 1.57, 1.59,
];

export const MAX_CRITERIA = 15;
export const CONSISTENCY_THRESHOLD = 0.1;

export class AhpValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues.join('; '));
    this.name = 'AhpValidationError';
    this.issues = issues;
  }
}

export interface AhpInput {
  /** Kode kriteria, dipakai sebagai label pada jejak langkah. */
  labels: string[];
  /** Matriks perbandingan n x n, bersifat resiprokal. */
  matrix: number[][];
}

export interface AhpResult {
  labels: string[];
  weights: number[];
  lambdaMax: number;
  ci: number;
  ri: number;
  cr: number;
  /** true bila CR < 0,1 atau CR tidak terdefinisi karena n <= 2. */
  consistent: boolean;
  iterations: number;
  converged: boolean;
  steps: TraceStep[];
}

/**
 * Memeriksa bentuk matriks. Kesalahan bentuk adalah kesalahan pengguna,
 * bukan hasil perhitungan, jadi ditolak sebelum apa pun dihitung.
 */
export function validatePairwise(labels: string[], matrix: number[][]): void {
  const issues: string[] = [];
  const n = labels.length;

  if (n < 2) issues.push('Perbandingan berpasangan memerlukan minimal dua kriteria.');
  if (n > MAX_CRITERIA) issues.push('Maksimal ' + MAX_CRITERIA + ' kriteria untuk perbandingan berpasangan.');

  if (matrix.length !== n) {
    issues.push('Jumlah baris matriks ' + matrix.length + ' tidak sama dengan jumlah kriteria ' + n + '.');
  }

  matrix.forEach((row, i) => {
    if (row.length !== n) {
      issues.push('Baris ' + (i + 1) + ' memiliki ' + row.length + ' kolom, seharusnya ' + n + '.');
      return;
    }
    row.forEach((value, j) => {
      if (!Number.isFinite(value)) {
        issues.push('Nilai baris ' + (i + 1) + ' kolom ' + (j + 1) + ' bukan angka berhingga.');
        return;
      }
      if (value <= 0) {
        issues.push('Nilai baris ' + (i + 1) + ' kolom ' + (j + 1) + ' harus lebih dari nol.');
      }
      if (i === j && Math.abs(value - 1) > 1e-9) {
        issues.push('Diagonal baris ' + (i + 1) + ' harus bernilai 1.');
      }
      if (i !== j && Math.abs(value * matrix[j]?.[i] - 1) > 1e-6) {
        issues.push(
          'Nilai baris ' + (i + 1) + ' kolom ' + (j + 1) + ' dan kebalikannya tidak konsisten resiprokal.'
        );
      }
    });
  });

  if (new Set(labels).size !== labels.length) {
    issues.push('Kode kriteria tidak boleh berulang.');
  }

  if (issues.length > 0) throw new AhpValidationError(issues);
}

/**
 * Membangun matriks penuh dari segitiga atas. Ini bentuk yang diisi pengguna
 * di antarmuka, karena kebalikannya sudah pasti.
 */
export function matrixFromUpper(labels: string[], upper: number[]): number[][] {
  const n = labels.length;
  const expected = (n * (n - 1)) / 2;
  if (upper.length !== expected) {
    throw new AhpValidationError([
      'Jumlah nilai segitiga atas ' + upper.length + ' tidak sama dengan ' + expected + ' untuk ' + n + ' kriteria.',
    ]);
  }

  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(1));
  let k = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const value = upper[k++];
      if (!Number.isFinite(value) || value <= 0) {
        throw new AhpValidationError(['Nilai perbandingan ke-' + k + ' harus angka positif.']);
      }
      matrix[i][j] = value;
      matrix[j][i] = 1 / value;
    }
  }
  return matrix;
}

export function multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
  return matrix.map((row) => row.reduce((sum, value, j) => sum + value * vector[j], 0));
}

/**
 * Eigenvector utama lewat iterasi pangkat.
 *
 * Iterasi pangkat konvergen ke eigenvector yang bersesuaian dengan eigenvalue
 * dominan, yang justru yang dibutuhkan AHP. Vektor dinormalkan setiap langkah
 * agar tidak meluap.
 */
export function principalEigenvector(
  matrix: number[][],
  options: { maxIterations?: number; tolerance?: number } = {}
): { vector: number[]; iterations: number; converged: boolean } {
  const maxIterations = options.maxIterations ?? 500;
  const tolerance = options.tolerance ?? 1e-12;
  const n = matrix.length;

  let vector = new Array<number>(n).fill(1 / n);

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const next = multiplyMatrixVector(matrix, vector);
    const sum = next.reduce((s, v) => s + v, 0);
    if (sum === 0) return { vector, iterations: iteration, converged: false };

    const normalized = next.map((v) => v / sum);
    const delta = normalized.reduce((max, v, i) => Math.max(max, Math.abs(v - vector[i])), 0);

    vector = normalized;
    if (delta < tolerance) return { vector, iterations: iteration, converged: true };
  }

  return { vector, iterations: maxIterations, converged: false };
}

/**
 * Rata-rata geometrik baris. Dipakai sebagai pembanding di uji, bukan sebagai
 * jalur utama. Untuk matriks resiprokal, hasilnya mendekati eigenvector utama.
 */
export function geometricMeanWeights(matrix: number[][]): number[] {
  const n = matrix.length;
  const means = matrix.map((row) => Math.pow(row.reduce((product, v) => product * v, 1), 1 / n));
  const sum = means.reduce((s, v) => s + v, 0);
  return means.map((v) => v / sum);
}

export function lambdaMaxOf(matrix: number[][], weights: number[]): number {
  const product = multiplyMatrixVector(matrix, weights);
  const n = matrix.length;
  const ratios = product.map((value, i) => (weights[i] === 0 ? 0 : value / weights[i]));
  return ratios.reduce((s, v) => s + v, 0) / n;
}

export function consistencyIndex(lambdaMax: number, n: number): number {
  if (n <= 2) return 0;
  return (lambdaMax - n) / (n - 1);
}

export function randomIndexOf(n: number): number {
  if (n < 1 || n > RANDOM_INDEX.length) {
    throw new AhpValidationError(['Indeks acak tidak tersedia untuk ' + n + ' kriteria.']);
  }
  return RANDOM_INDEX[n - 1];
}

export function consistencyRatio(ci: number, ri: number): number {
  if (ri === 0) return 0;
  return ci / ri;
}

const show = (value: number, digits = 6): string => value.toFixed(digits);

export function computeAhp(input: AhpInput): AhpResult {
  validatePairwise(input.labels, input.matrix);

  const { labels, matrix } = input;
  const n = labels.length;

  const { vector: weights, iterations, converged } = principalEigenvector(matrix);
  const lambdaMax = lambdaMaxOf(matrix, weights);
  const ci = consistencyIndex(lambdaMax, n);
  const ri = randomIndexOf(n);
  const cr = consistencyRatio(ci, ri);
  const consistent = n <= 2 || cr < CONSISTENCY_THRESHOLD;

  const rowSums = matrix.map((row) => row.reduce((s, v) => s + v, 0));

  const steps: TraceStep[] = [
    {
      key: 'matrix',
      title: 'Matriks Perbandingan Berpasangan',
      formula: 'a_ji = 1 / a_ij, a_ii = 1',
      columns: ['Kriteria', ...labels],
      rows: labels.map((label, i) => [label, ...matrix[i].map((v) => show(v, 4))]),
      note: 'Skala Saaty 1 sampai 9. Nilai 1 berarti sama penting, 9 berarti mutlak lebih penting.',
    },
    {
      key: 'rowSum',
      title: 'Jumlah Baris',
      columns: ['Kriteria', 'Jumlah'],
      rows: labels.map((label, i) => [label, show(rowSums[i], 6)]),
      note: 'Ditampilkan sebagai pemeriksaan awal, bukan dasar perhitungan bobot.',
    },
    {
      key: 'weights',
      title: 'Vektor Prioritas (w)',
      formula: 'eigenvector utama dari iterasi pangkat, dinormalkan hingga berjumlah 1',
      columns: ['Kriteria', 'Bobot'],
      rows: [
        ...labels.map((label, i) => [label, show(weights[i], 6)]),
        ['Total', show(weights.reduce((s, v) => s + v, 0), 6)],
      ],
      note: 'Iterasi konvergen dalam ' + iterations + ' langkah.',
    },
    {
      key: 'lambda',
      title: 'Eigenvalue Maksimum',
      formula: 'lambda_max = (1/n) * jumlah_i ( (A w)_i / w_i )',
      columns: ['Kriteria', '(A w)_i', 'w_i', 'Rasio'],
      rows: (() => {
        const product = multiplyMatrixVector(matrix, weights);
        return labels.map((label, i) => [
          label,
          show(product[i], 6),
          show(weights[i], 6),
          show(weights[i] === 0 ? 0 : product[i] / weights[i], 6),
        ]);
      })(),
      note: 'Untuk matriks yang sepenuhnya konsisten, seluruh rasio bernilai n dan lambda_max = n.',
    },
    {
      key: 'consistency',
      title: 'Uji Konsistensi',
      formula: 'CI = (lambda_max - n) / (n - 1), CR = CI / RI',
      columns: ['Besaran', 'Nilai'],
      rows: [
        ['Jumlah kriteria (n)', n],
        ['lambda_max', show(lambdaMax, 6)],
        ['Consistency Index (CI)', show(ci, 6)],
        ['Random Index (RI)', show(ri, 4)],
        ['Consistency Ratio (CR)', show(cr, 6)],
        ['Ambang', CONSISTENCY_THRESHOLD.toFixed(2)],
        ['Kesimpulan', consistent ? 'konsisten' : 'tidak konsisten'],
      ],
      note:
        'CR di bawah 0,1 berarti penilaian tidak saling bertentangan. Ini bukan ukuran kebenaran penilaian, hanya ukuran konsistensi internal.',
    },
  ];

  return {
    labels,
    weights,
    lambdaMax,
    ci,
    ri,
    cr,
    consistent,
    iterations,
    converged,
    steps,
  };
}