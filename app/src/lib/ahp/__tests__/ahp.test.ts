import { describe, expect, it } from 'vitest';
import {
  AhpValidationError,
  CONSISTENCY_THRESHOLD,
  MAX_CRITERIA,
  RANDOM_INDEX,
  computeAhp,
  consistencyIndex,
  consistencyRatio,
  geometricMeanWeights,
  lambdaMaxOf,
  matrixFromUpper,
  principalEigenvector,
  randomIndexOf,
  validatePairwise,
} from '../ahp';

const close = (actual: number, expected: number, tolerance = 1e-6) => {
  expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
};

describe('matriks dari segitiga atas', () => {
  it('membangun matriks resiprokal dari tiga nilai', () => {
    const matrix = matrixFromUpper(['C1', 'C2', 'C3'], [2, 4, 3]);
    // a_12 = 2, a_13 = 4, a_23 = 3
    expect(matrix[0][1]).toBe(2);
    expect(matrix[0][2]).toBe(4);
    expect(matrix[1][2]).toBe(3);
    expect(matrix[1][0]).toBe(0.5);
    expect(matrix[2][0]).toBe(0.25);
    expect(matrix[2][1]).toBeCloseTo(1 / 3, 12);
    expect(matrix[0][0]).toBe(1);
    expect(matrix[1][1]).toBe(1);
    expect(matrix[2][2]).toBe(1);
  });

  it('menolak jumlah nilai yang tidak sesuai', () => {
    expect(() => matrixFromUpper(['C1', 'C2', 'C3'], [2, 4])).toThrow(AhpValidationError);
  });

  it('menolak nilai nol atau negatif', () => {
    expect(() => matrixFromUpper(['C1', 'C2'], [0])).toThrow(AhpValidationError);
    expect(() => matrixFromUpper(['C1', 'C2'], [-2])).toThrow(AhpValidationError);
  });

  it('jumlah nilai untuk n kriteria adalah n(n-1)/2', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const labels = Array.from({ length: n }, (_, i) => 'C' + (i + 1));
      const values = new Array((n * (n - 1)) / 2).fill(1);
      expect(() => matrixFromUpper(labels, values)).not.toThrow();
    }
  });
});

describe('validasi matriks', () => {
  const valid = [
    [1, 2],
    [0.5, 1],
  ];

  it('menerima matriks resiprokal yang sah', () => {
    expect(() => validatePairwise(['C1', 'C2'], valid)).not.toThrow();
  });

  it('menolak satu kriteria', () => {
    expect(() => validatePairwise(['C1'], [[1]])).toThrow(AhpValidationError);
  });

  it('menolak melebihi batas kriteria', () => {
    const n = MAX_CRITERIA + 1;
    const labels = Array.from({ length: n }, (_, i) => 'C' + (i + 1));
    const matrix = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 1 : 1))
    );
    expect(() => validatePairwise(labels, matrix)).toThrow(AhpValidationError);
  });

  it('menolak diagonal bukan satu', () => {
    expect(() =>
      validatePairwise(['C1', 'C2'], [
        [2, 2],
        [0.5, 1],
      ])
    ).toThrow(AhpValidationError);
  });

  it('menolak pasangan yang tidak resiprokal', () => {
    expect(() =>
      validatePairwise(['C1', 'C2'], [
        [1, 2],
        [0.4, 1],
      ])
    ).toThrow(AhpValidationError);
  });

  it('menolak nilai negatif', () => {
    expect(() =>
      validatePairwise(['C1', 'C2'], [
        [1, -2],
        [-0.5, 1],
      ])
    ).toThrow(AhpValidationError);
  });

  it('menolak kode kriteria berulang', () => {
    expect(() => validatePairwise(['C1', 'C1'], valid)).toThrow(AhpValidationError);
  });
});

describe('eigenvector dan konsistensi', () => {
  it('matriks konsisten sempurna menghasilkan lambda_max sama dengan n', () => {
    // Matriks yang dibangun dari bobot [0,5, 0,3, 0,2] selalu konsisten sempurna.
    const w = [0.5, 0.3, 0.2];
    const matrix = w.map((wi) => w.map((wj) => wi / wj));
    const { vector } = principalEigenvector(matrix);
    const lambda = lambdaMaxOf(matrix, vector);

    close(lambda, 3, 1e-6);
    close(vector[0], 0.5, 1e-6);
    close(vector[1], 0.3, 1e-6);
    close(vector[2], 0.2, 1e-6);
    close(consistencyIndex(lambda, 3), 0, 1e-9);
  });

  it('geometric mean menghasilkan bobot yang sama pada matriks konsisten', () => {
    const w = [0.5, 0.3, 0.2];
    const matrix = w.map((wi) => w.map((wj) => wi / wj));
    const geo = geometricMeanWeights(matrix);
    close(geo[0], 0.5, 1e-9);
    close(geo[1], 0.3, 1e-9);
    close(geo[2], 0.2, 1e-9);
  });

  it('hasil iterasi pangkat berjumlah 1', () => {
    const matrix = [
      [1, 3, 5],
      [1 / 3, 1, 3],
      [1 / 5, 1 / 3, 1],
    ];
    const { vector } = principalEigenvector(matrix);
    close(vector.reduce((s, v) => s + v, 0), 1, 1e-12);
  });

  it('matriks 2x2 selalu konsisten sempurna', () => {
    const matrix = [
      [1, 7],
      [1 / 7, 1],
    ];
    const { vector } = principalEigenvector(matrix);
    const lambda = lambdaMaxOf(matrix, vector);
    close(lambda, 2, 1e-6);
    expect(consistencyIndex(lambda, 2)).toBe(0);
  });

  it('indeks acak sesuai tabel Saaty', () => {
    expect(randomIndexOf(1)).toBe(0);
    expect(randomIndexOf(2)).toBe(0);
    expect(randomIndexOf(3)).toBe(0.58);
    expect(randomIndexOf(4)).toBe(0.9);
    expect(randomIndexOf(5)).toBe(1.12);
    expect(RANDOM_INDEX).toHaveLength(15);
  });

  it('menolak indeks acak di luar tabel', () => {
    expect(() => randomIndexOf(16)).toThrow(AhpValidationError);
  });

  it('CR nol bila RI nol', () => {
    expect(consistencyRatio(0.05, 0)).toBe(0);
  });
});

describe('contoh literatur Saaty', () => {
  /**
   * Contoh klasik Saaty untuk pemilihan pekerjaan, tiga kriteria:
   * gaji, reputasi, dan kesempatan naik jabatan.
   *
   * Matriks:
   *   [ 1,   3,   5 ]
   *   [ 1/3, 1,   3 ]
   *   [ 1/5, 1/3, 1 ]
   *
   * lambda_max sekitar 3,0385, CI sekitar 0,0193, CR sekitar 0,0332.
   * Nilai ini muncul di banyak sumber sebagai contoh perhitungan AHP.
   */
  const matrix = [
    [1, 3, 5],
    [1 / 3, 1, 3],
    [1 / 5, 1 / 3, 1],
  ];

  it('lambda_max sesuai contoh literatur', () => {
    const { vector } = principalEigenvector(matrix);
    const lambda = lambdaMaxOf(matrix, vector);
    close(lambda, 3.0385, 1e-3);
  });

  it('bobot prioritas sesuai contoh literatur', () => {
    const result = computeAhp({ labels: ['Gaji', 'Reputasi', 'Kesempatan'], matrix });
    // Nilai acuan: sekitar 0,6370 / 0,2583 / 0,1047
    close(result.weights[0], 0.637, 1e-2);
    close(result.weights[1], 0.258, 1e-2);
    close(result.weights[2], 0.105, 1e-2);
  });

  it('CI dan CR sesuai contoh literatur', () => {
    const result = computeAhp({ labels: ['Gaji', 'Reputasi', 'Kesempatan'], matrix });
    close(result.ci, 0.0193, 1e-3);
    close(result.cr, 0.0332, 1e-2);
    expect(result.consistent).toBe(true);
  });

  it('dinyatakan konsisten karena CR di bawah 0,1', () => {
    const result = computeAhp({ labels: ['Gaji', 'Reputasi', 'Kesempatan'], matrix });
    expect(result.cr).toBeLessThan(CONSISTENCY_THRESHOLD);
  });
});

describe('contoh tidak konsisten', () => {
  /**
   * Matriks 3x3 yang sengaja tidak konsisten:
   *   [ 1,   9,   1/9 ]
   *   [ 1/9, 1,   9   ]
   *   [ 9,   1/9, 1   ]
   *
   * Pola melingkar seperti ini menghasilkan CR jauh di atas 0,1.
   */
  const matrix = [
    [1, 9, 1 / 9],
    [1 / 9, 1, 9],
    [9, 1 / 9, 1],
  ];

  it('CR melewati ambang', () => {
    const result = computeAhp({ labels: ['C1', 'C2', 'C3'], matrix });
    expect(result.cr).toBeGreaterThan(CONSISTENCY_THRESHOLD);
    expect(result.consistent).toBe(false);
  });

  it('lambda_max jauh di atas n', () => {
    const result = computeAhp({ labels: ['C1', 'C2', 'C3'], matrix });
    expect(result.lambdaMax).toBeGreaterThan(4);
  });

  it('bobot masih berjumlah 1 walau tidak konsisten', () => {
    const result = computeAhp({ labels: ['C1', 'C2', 'C3'], matrix });
    close(result.weights.reduce((s, v) => s + v, 0), 1, 1e-12);
  });
});

describe('sifat hasil computeAhp', () => {
  const matrix = matrixFromUpper(['C1', 'C2', 'C3', 'C4'], [3, 5, 7, 4, 6, 2]);

  it('bobot berjumlah 1', () => {
    const result = computeAhp({ labels: ['C1', 'C2', 'C3', 'C4'], matrix });
    close(result.weights.reduce((s, v) => s + v, 0), 1, 1e-12);
  });

  it('semua bobot positif', () => {
    const result = computeAhp({ labels: ['C1', 'C2', 'C3', 'C4'], matrix });
    expect(result.weights.every((w) => w > 0)).toBe(true);
  });

  it('RI sesuai jumlah kriteria', () => {
    const result = computeAhp({ labels: ['C1', 'C2', 'C3', 'C4'], matrix });
    expect(result.ri).toBe(0.9);
  });

  it('iterasi dinyatakan konvergen', () => {
    const result = computeAhp({ labels: ['C1', 'C2', 'C3', 'C4'], matrix });
    expect(result.converged).toBe(true);
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.iterations).toBeLessThanOrEqual(500);
  });

  it('menyertakan langkah jejak yang konsisten bentuknya', () => {
    const result = computeAhp({ labels: ['C1', 'C2', 'C3', 'C4'], matrix });
    expect(result.steps.length).toBeGreaterThanOrEqual(5);
    for (const step of result.steps) {
      for (const row of step.rows) {
        expect(row.length).toBe(step.columns.length);
      }
    }
  });

  it('jejak memuat kesimpulan konsistensi', () => {
    const result = computeAhp({ labels: ['C1', 'C2', 'C3', 'C4'], matrix });
    const step = result.steps.find((s) => s.key === 'consistency')!;
    const conclusion = step.rows.find((row) => row[0] === 'Kesimpulan');
    expect(conclusion?.[1]).toBe(result.consistent ? 'konsisten' : 'tidak konsisten');
  });
});

describe('kasus tepi', () => {
  it('matriks dengan semua nilai sama menghasilkan bobot merata', () => {
    const n = 4;
    const labels = Array.from({ length: n }, (_, i) => 'C' + (i + 1));
    const matrix = Array.from({ length: n }, () => new Array(n).fill(1));
    const result = computeAhp({ labels, matrix });

    for (const w of result.weights) close(w, 1 / n, 1e-9);
    close(result.cr, 0, 1e-9);
    expect(result.consistent).toBe(true);
  });

  it('matriks 2x2 dengan skala ekstrem tetap menghasilkan bobot sah', () => {
    const matrix = [
      [1, 9],
      [1 / 9, 1],
    ];
    const result = computeAhp({ labels: ['C1', 'C2'], matrix });
    close(result.weights[0], 0.9, 1e-6);
    close(result.weights[1], 0.1, 1e-6);
    expect(result.consistent).toBe(true);
  });

  it('n = 2 tidak memerlukan uji konsistensi', () => {
    const matrix = [
      [1, 4],
      [1 / 4, 1],
    ];
    const result = computeAhp({ labels: ['C1', 'C2'], matrix });
    expect(result.ci).toBe(0);
    expect(result.cr).toBe(0);
    expect(result.consistent).toBe(true);
  });

  it('matriks konsisten sempurna untuk n = 6 menghasilkan CR nol', () => {
    const w = [0.3, 0.25, 0.2, 0.12, 0.08, 0.05];
    const labels = w.map((_, i) => 'C' + (i + 1));
    const matrix = w.map((wi) => w.map((wj) => wi / wj));
    const result = computeAhp({ labels, matrix });

    close(result.cr, 0, 1e-9);
    w.forEach((expected, i) => close(result.weights[i], expected, 1e-6));
  });

  it('menolak matriks yang tidak lengkap sebelum menghitung apa pun', () => {
    expect(() => computeAhp({ labels: ['C1', 'C2'], matrix: [[1, 2]] })).toThrow(AhpValidationError);
  });

  it('konvergensi tercapai dalam jumlah langkah wajar pada matriks 15 kriteria', () => {
    const n = 15;
    const labels = Array.from({ length: n }, (_, i) => 'C' + (i + 1));
    // Matriks konsisten sempurna dengan bobot menurun.
    const w = Array.from({ length: n }, (_, i) => n - i);
    const total = w.reduce((s, v) => s + v, 0);
    const normalized = w.map((v) => v / total);
    const matrix = normalized.map((wi) => normalized.map((wj) => wi / wj));

    const result = computeAhp({ labels, matrix });
    expect(result.converged).toBe(true);
    close(result.cr, 0, 1e-6);
    close(result.weights.reduce((s, v) => s + v, 0), 1, 1e-12);
  });
});