import { describe, expect, it } from 'vitest';
import { analyseSensitivity, directionOfInfluence, shiftMatrix, SensitivityError } from '../sensitivity';
import type { Criterion, DssInput } from '../types';

const crit = (id: number, code: string, weight: number, direction: 'benefit' | 'cost'): Criterion => ({
  id,
  code,
  name: code,
  weight,
  direction,
});

const alts = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, code: 'A' + (i + 1), title: 'Alternatif ' + (i + 1) }));

const baseInput: DssInput = {
  criteria: [crit(1, 'C1', 0.4, 'benefit'), crit(2, 'C2', 0.35, 'benefit'), crit(3, 'C3', 0.25, 'cost')],
  alternatives: alts(4),
  values: [
    [5, 4, 2],
    [4, 5, 3],
    [3, 3, 1],
    [2, 2, 5],
  ],
};

describe('analisis sensitivitas', () => {
  it('menghasilkan dua perturbasi per kriteria', () => {
    const result = analyseSensitivity(baseInput, { methodId: 'saw', delta: 0.1 });
    expect(result.perturbations).toHaveLength(6);
    expect(result.perturbations.filter((p) => p.direction === 'increase')).toHaveLength(3);
    expect(result.perturbations.filter((p) => p.direction === 'decrease')).toHaveLength(3);
  });

  it('bobot setiap perturbasi berjumlah 1', () => {
    const result = analyseSensitivity(baseInput, { methodId: 'saw', delta: 0.1 });
    for (const p of result.perturbations) {
      expect(Math.abs(p.weights.reduce((s, v) => s + v, 0) - 1)).toBeLessThan(1e-12);
    }
  });

  it('bobot dasar berjumlah 1 walau bobot masukan bukan 1', () => {
    const scaled: DssInput = {
      ...baseInput,
      criteria: baseInput.criteria.map((c) => ({ ...c, weight: c.weight * 100 })),
    };
    const result = analyseSensitivity(scaled, { methodId: 'saw', delta: 0.1 });
    expect(Math.abs(result.baseline.weights.reduce((s, v) => s + v, 0) - 1)).toBeLessThan(1e-12);
    expect(result.warnings.some((w) => w.includes('bukan 1'))).toBe(true);
  });

  it('hanya kriteria yang digeser yang bobotnya berubah arah relatif', () => {
    const result = analyseSensitivity(baseInput, { methodId: 'saw', delta: 0.2 });
    const increase = result.perturbations.find((p) => p.criterionCode === 'C1' && p.direction === 'increase')!;

    // C1 naik, C2 dan C3 turun secara relatif karena normalisasi.
    expect(increase.weights[0]).toBeGreaterThan(result.baseline.weights[0]);
    expect(increase.weights[1]).toBeLessThan(result.baseline.weights[1]);
    expect(increase.weights[2]).toBeLessThan(result.baseline.weights[2]);
  });

  it('faktor pengali sesuai delta', () => {
    const result = analyseSensitivity(baseInput, { methodId: 'saw', delta: 0.25 });
    const inc = result.perturbations.find((p) => p.direction === 'increase')!;
    const dec = result.perturbations.find((p) => p.direction === 'decrease')!;
    expect(inc.factor).toBeCloseTo(1.25, 12);
    expect(dec.factor).toBeCloseTo(0.75, 12);
  });

  it('selisih peringkat bernilai nol untuk perturbasi yang tidak mengubah apa pun', () => {
    // Dataset dengan satu alternatif dominan kuat: peringkat 1 harus stabil.
    const dominant: DssInput = {
      criteria: [crit(1, 'C1', 0.5, 'benefit'), crit(2, 'C2', 0.5, 'benefit')],
      alternatives: alts(3),
      values: [
        [9, 9],
        [5, 5],
        [1, 1],
      ],
    };
    const result = analyseSensitivity(dominant, { methodId: 'saw', delta: 0.05 });
    for (const p of result.perturbations) {
      expect(p.topChanged).toBe(false);
      expect(p.changedCodes).toHaveLength(0);
    }
    expect(result.summary.topStability).toBe(1);
  });

  it('mendeteksi perubahan peringkat saat bobot digeser besar', () => {
    // Dua alternatif yang unggul pada kriteria berbeda: geseran besar harus
    // membalik peringkat.
    const contested: DssInput = {
      criteria: [crit(1, 'C1', 0.5, 'benefit'), crit(2, 'C2', 0.5, 'benefit')],
      alternatives: alts(2),
      values: [
        [9, 1],
        [1, 9],
      ],
    };
    const result = analyseSensitivity(contested, { methodId: 'saw', delta: 0.5 });
    const changes = result.perturbations.filter((p) => p.topChanged);
    expect(changes.length).toBeGreaterThan(0);
    expect(result.summary.withTopChange).toBeGreaterThan(0);
    expect(result.summary.topStability).toBeLessThan(1);
  });

  it('korelasi peringkat 1 untuk perturbasi yang tidak mengubah urutan', () => {
    const dominant: DssInput = {
      criteria: [crit(1, 'C1', 0.5, 'benefit'), crit(2, 'C2', 0.5, 'benefit')],
      alternatives: alts(3),
      values: [
        [9, 9],
        [5, 5],
        [1, 1],
      ],
    };
    const result = analyseSensitivity(dominant, { methodId: 'saw', delta: 0.05 });
    for (const p of result.perturbations) {
      expect(p.rankCorrelation).toBeCloseTo(1, 9);
    }
  });

  it('menyertakan bobot merata bila diminta', () => {
    const result = analyseSensitivity(baseInput, {
      methodId: 'saw',
      delta: 0.1,
      includeEqualWeights: true,
    });
    expect(result.equalWeights).not.toBeNull();
    expect(result.equalWeights!.weights).toHaveLength(3);
    for (const w of result.equalWeights!.weights) {
      expect(w).toBeCloseTo(1 / 3, 12);
    }
  });

  it('tidak menyertakan bobot merata bila tidak diminta', () => {
    const result = analyseSensitivity(baseInput, { methodId: 'saw', delta: 0.1 });
    expect(result.equalWeights).toBeNull();
  });

  it('bekerja untuk semua metode terdaftar', () => {
    const methods = ['saw', 'wp', 'topsis', 'waspas', 'moora', 'copras', 'vikor', 'edas', 'aras', 'mabac', 'smart'];
    for (const methodId of methods) {
      const result = analyseSensitivity(baseInput, { methodId, delta: 0.1 });
      expect(result.methodId).toBe(methodId);
      expect(result.perturbations.length).toBe(6);
      expect(result.baseline.rows).toHaveLength(4);
      for (const p of result.perturbations) {
        expect(p.rows.every((r) => Number.isFinite(r.value))).toBe(true);
      }
    }
  });

  it('menghormati arah VIKOR yang terkecil terbaik', () => {
    // VIKOR: Q kecil lebih baik. Baseline harus menempatkan alternatif dengan
    // nilai terkecil di peringkat 1.
    const result = analyseSensitivity(baseInput, { methodId: 'vikor', delta: 0.1 });
    const best = [...result.baseline.rows].sort((a, b) => a.rank - b.rank)[0];
    const smallest = [...result.baseline.rows].sort((a, b) => a.value - b.value)[0];
    expect(best.code).toBe(smallest.code);
  });

  it('menolak delta nol atau negatif', () => {
    expect(() => analyseSensitivity(baseInput, { methodId: 'saw', delta: 0 })).toThrow(SensitivityError);
    expect(() => analyseSensitivity(baseInput, { methodId: 'saw', delta: -0.1 })).toThrow(SensitivityError);
  });

  it('menolak delta satu atau lebih', () => {
    expect(() => analyseSensitivity(baseInput, { methodId: 'saw', delta: 1 })).toThrow(SensitivityError);
    expect(() => analyseSensitivity(baseInput, { methodId: 'saw', delta: 1.5 })).toThrow(SensitivityError);
  });

  it('menolak metode tidak dikenal', () => {
    expect(() => analyseSensitivity(baseInput, { methodId: 'tidak-ada', delta: 0.1 })).toThrow(SensitivityError);
  });

  it('menolak satu alternatif', () => {
    const single: DssInput = { ...baseInput, alternatives: alts(1), values: [[5, 4, 2]] };
    expect(() => analyseSensitivity(single, { methodId: 'saw', delta: 0.1 })).toThrow(SensitivityError);
  });

  it('menolak tanpa kriteria', () => {
    const empty: DssInput = { criteria: [], alternatives: alts(2), values: [[], []] };
    expect(() => analyseSensitivity(empty, { methodId: 'saw', delta: 0.1 })).toThrow(SensitivityError);
  });

  it('ringkasan menunjuk kriteria paling berpengaruh', () => {
    const result = analyseSensitivity(baseInput, { methodId: 'saw', delta: 0.4 });
    if (result.summary.withRankChange > 0) {
      expect(result.summary.mostInfluentialCriterion).not.toBeNull();
      expect(['C1', 'C2', 'C3']).toContain(result.summary.mostInfluentialCriterion);
    }
  });

  it('ringkasan menunjuk alternatif paling sensitif', () => {
    const result = analyseSensitivity(baseInput, { methodId: 'saw', delta: 0.4 });
    if (result.summary.withRankChange > 0) {
      expect(result.summary.mostSensitiveAlternative).not.toBeNull();
      expect(['A1', 'A2', 'A3', 'A4']).toContain(result.summary.mostSensitiveAlternative);
    }
  });

  it('total perturbasi pada ringkasan sesuai jumlah sebenarnya', () => {
    const result = analyseSensitivity(baseInput, { methodId: 'saw', delta: 0.1 });
    expect(result.summary.totalPerturbations).toBe(result.perturbations.length);
    expect(result.summary.withRankChange).toBe(result.perturbations.filter((p) => p.changedCodes.length > 0).length);
    expect(result.summary.withTopChange).toBe(result.perturbations.filter((p) => p.topChanged).length);
  });

  it('hasil dapat direproduksi dengan masukan sama', () => {
    const a = analyseSensitivity(baseInput, { methodId: 'topsis', delta: 0.15 });
    const b = analyseSensitivity(baseInput, { methodId: 'topsis', delta: 0.15 });

    expect(a.baseline.rows.map((r) => r.rank)).toEqual(b.baseline.rows.map((r) => r.rank));
    expect(a.perturbations.length).toBe(b.perturbations.length);
    a.perturbations.forEach((p, i) => {
      expect(p.weights).toEqual(b.perturbations[i].weights);
      expect(p.rows.map((r) => r.rank)).toEqual(b.perturbations[i].rows.map((r) => r.rank));
    });
  });

  it('tidak mengubah objek masukan', () => {
    const snapshot = JSON.stringify(baseInput);
    analyseSensitivity(baseInput, { methodId: 'saw', delta: 0.2 });
    expect(JSON.stringify(baseInput)).toBe(snapshot);
  });
});

describe('matriks geseran', () => {
  it('bentuk sesuai kriteria dan alternatif', () => {
    const result = analyseSensitivity(baseInput, { methodId: 'saw', delta: 0.3 });
    const matrix = shiftMatrix(result);

    expect(matrix.criteria).toHaveLength(3);
    expect(matrix.alternatives).toHaveLength(4);
    expect(matrix.counts).toHaveLength(3);
    for (const row of matrix.counts) {
      expect(row).toHaveLength(4);
    }
  });

  it('nilai maksimum sesuai isi terbesar', () => {
    const result = analyseSensitivity(baseInput, { methodId: 'saw', delta: 0.3 });
    const matrix = shiftMatrix(result);
    const actualMax = Math.max(...matrix.counts.flat());
    expect(matrix.max).toBe(actualMax);
  });

  it('semua nilai tidak negatif dan tidak melebihi dua', () => {
    // Maksimal dua perturbasi per kriteria (naik dan turun).
    const result = analyseSensitivity(baseInput, { methodId: 'saw', delta: 0.3 });
    const matrix = shiftMatrix(result);
    for (const row of matrix.counts) {
      for (const value of row) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(2);
      }
    }
  });
});

describe('arah pengaruh', () => {
  it('mencatat arah naik atau turun untuk setiap perubahan', () => {
    const result = analyseSensitivity(baseInput, { methodId: 'saw', delta: 0.4 });
    const directions = directionOfInfluence(result);
    expect(directions.length).toBeGreaterThan(0);
    for (const d of directions) {
      expect(['naik', 'turun']).toContain(d.direction);
      expect(d.code).toMatch(/^A\d$/);
      expect(d.criterionCode).toMatch(/^C\d$/);
    }
  });

  it('arah konsisten dengan selisih peringkat', () => {
    const result = analyseSensitivity(baseInput, { methodId: 'saw', delta: 0.4 });
    const directions = directionOfInfluence(result);

    for (const p of result.perturbations) {
      for (const row of p.rows) {
        if (!row.changed) continue;
        const match = directions.find(
          (d) => d.criterionCode === p.criterionCode && d.code === row.code
        );
        expect(match).toBeDefined();
        expect(match!.direction).toBe(row.shift < 0 ? 'naik' : 'turun');
      }
    }
  });
});