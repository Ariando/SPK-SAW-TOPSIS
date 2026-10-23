import { describe, expect, it } from 'vitest';
import { getMethod, methods } from '../registry';
import { DssValidationError, prepareInput, type Criterion, type DssInput } from '../types';

const crit = (id: number, code: string, weight: number, direction: 'benefit' | 'cost'): Criterion => ({
  id,
  code,
  name: code,
  weight,
  direction,
});

const alts = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, code: 'A' + (i + 1), title: 'Alt ' + (i + 1) }));

const order = (v: number[]) =>
  v.map((x, i) => [x, i] as const).sort((a, b) => b[0] - a[0]).map((x) => x[1]).join(',');

describe('invarian umum', () => {
  it('jumlah bobot ternormalisasi = 1', () => {
    const input: DssInput = {
      criteria: [crit(1, 'C1', 3, 'benefit'), crit(2, 'C2', 7, 'cost')],
      alternatives: alts(2),
      values: [
        [4, 2],
        [2, 4],
      ],
    };
    const prepared = prepareInput(input);
    expect(Math.abs(prepared.weights.reduce((s, v) => s + v, 0) - 1)).toBeLessThan(1e-12);
  });

  it('bobot bukan 1 memunculkan peringatan tetapi hasil tetap wajar', () => {
    const input: DssInput = {
      criteria: [crit(1, 'C1', 30, 'benefit'), crit(2, 'C2', 70, 'cost')],
      alternatives: alts(2),
      values: [
        [4, 2],
        [2, 4],
      ],
    };
    for (const m of methods) {
      const result = m.compute(input);
      expect(result.warnings.some((w) => w.includes('dinormalisasi'))).toBe(true);
      expect(result.scores.every((s) => Number.isFinite(s.value))).toBe(true);
    }
  });

  it('skala positif tidak mengubah peringkat', () => {
    const input: DssInput = {
      criteria: [crit(1, 'C1', 0.4, 'benefit'), crit(2, 'C2', 0.3, 'benefit'), crit(3, 'C3', 0.3, 'cost')],
      alternatives: alts(4),
      values: [
        [5, 4, 2],
        [4, 5, 3],
        [3, 3, 1],
        [2, 2, 5],
      ],
    };
    const scaled: DssInput = {
      ...input,
      values: input.values.map((row) => row.map((v) => v * 7)),
    };
    for (const m of methods) {
      const a = m.compute(input).scores.map((s) => s.value);
      const b = m.compute(scaled).scores.map((s) => s.value);
      expect(order(a)).toBe(order(b));
    }
  });

  it('alternatif identik memperoleh skor identik dan ditandai seri', () => {
    const input: DssInput = {
      criteria: [crit(1, 'C1', 0.5, 'benefit'), crit(2, 'C2', 0.5, 'cost')],
      alternatives: alts(3),
      values: [
        [3, 2],
        [3, 2],
        [5, 1],
      ],
    };
    for (const m of methods) {
      const result = m.compute(input);
      expect(Math.abs(result.scores[0].value - result.scores[1].value)).toBeLessThan(1e-12);
      expect(result.ranking[0].tied).toBe(true);
      expect(result.ranking[1].tied).toBe(true);
      expect(result.ranking[0].rank).toBe(result.ranking[1].rank);
    }
  });

  it('alternatif dominan selalu peringkat 1', () => {
    const input: DssInput = {
      criteria: [crit(1, 'C1', 0.4, 'benefit'), crit(2, 'C2', 0.3, 'benefit'), crit(3, 'C3', 0.3, 'cost')],
      alternatives: alts(4),
      values: [
        [5, 5, 1],
        [4, 4, 2],
        [3, 3, 3],
        [1, 1, 5],
      ],
    };
    for (const m of methods) {
      const result = m.compute(input);
      const best = result.ranking.find((r) => r.rank === 1)!;
      expect(best.alternativeId).toBe(1);
    }
  });
});

describe('validasi input', () => {
  it('menolak sel kosong', () => {
    const input = {
      criteria: [crit(1, 'C1', 1, 'benefit')],
      alternatives: alts(2),
      values: [[4], []],
    } as unknown as DssInput;
    expect(() => prepareInput(input)).toThrow(DssValidationError);
  });

  it('menolak nilai nol pada kriteria cost', () => {
    const input: DssInput = {
      criteria: [crit(1, 'C1', 1, 'cost')],
      alternatives: alts(2),
      values: [[0], [2]],
    };
    expect(() => prepareInput(input)).toThrow(DssValidationError);
  });

  it('menolak bobot negatif', () => {
    const input: DssInput = {
      criteria: [crit(1, 'C1', -1, 'benefit')],
      alternatives: alts(2),
      values: [[1], [2]],
    };
    expect(() => prepareInput(input)).toThrow(DssValidationError);
  });

  it('menolak matriks tanpa kriteria', () => {
    const input: DssInput = { criteria: [], alternatives: alts(1), values: [[]] };
    expect(() => prepareInput(input)).toThrow(DssValidationError);
  });

  it('menolak total bobot nol', () => {
    const input: DssInput = {
      criteria: [crit(1, 'C1', 0, 'benefit')],
      alternatives: alts(2),
      values: [[1], [2]],
    };
    expect(() => prepareInput(input)).toThrow(DssValidationError);
  });

  it('tidak menghasilkan NaN atau Infinity pada input sah', () => {
    const input: DssInput = {
      criteria: [crit(1, 'C1', 0.5, 'benefit'), crit(2, 'C2', 0.5, 'cost')],
      alternatives: alts(3),
      values: [
        [2, 8],
        [5, 3],
        [9, 1],
      ],
    };
    for (const m of methods) {
      const result = m.compute(input);
      expect(result.scores.every((s) => Number.isFinite(s.value))).toBe(true);
      expect(result.steps.every((step) => step.rows.every((row) => row.every((cell) => cell !== 'NaN')))).toBe(true);
    }
  });
});

describe('properti per metode', () => {
  it('SAW satu kriteria benefit menjaga urutan nilai', () => {
    const input: DssInput = {
      criteria: [crit(1, 'C1', 0.6, 'benefit')],
      alternatives: alts(4),
      values: [[5], [3], [1], [4]],
    };
    const v = getMethod('saw')!.compute(input).scores.map((s) => s.value);
    expect(order(v)).toBe('0,3,1,2');
  });

  it('SAW satu kriteria cost membalik urutan nilai', () => {
    const input: DssInput = {
      criteria: [crit(1, 'C1', 0.6, 'cost')],
      alternatives: alts(4),
      values: [[5], [3], [1], [4]],
    };
    const v = getMethod('saw')!.compute(input).scores.map((s) => s.value);
    expect(order(v)).toBe('2,1,3,0');
  });

  it('TOPSIS alternatif terbaik mencapai 1 dan terburuk 0', () => {
    const input: DssInput = {
      criteria: [crit(1, 'C1', 0.4, 'benefit'), crit(2, 'C2', 0.3, 'benefit'), crit(3, 'C3', 0.3, 'cost')],
      alternatives: alts(4),
      values: [
        [5, 5, 1],
        [4, 4, 2],
        [3, 3, 3],
        [1, 1, 5],
      ],
    };
    const result = getMethod('topsis')!.compute(input);
    expect(Math.abs(result.scores[0].value - 1)).toBeLessThan(1e-12);
    expect(Math.abs(result.scores[3].value - 0)).toBeLessThan(1e-12);
  });

  it('WP jumlah skor = 1', () => {
    const input: DssInput = {
      criteria: [crit(1, 'C1', 0.3, 'benefit'), crit(2, 'C2', 0.7, 'cost')],
      alternatives: alts(4),
      values: [
        [4, 2],
        [3, 3],
        [5, 1],
        [2, 4],
      ],
    };
    const total = getMethod('wp')!.compute(input).scores.reduce((s, x) => s + x.value, 0);
    expect(Math.abs(total - 1)).toBeLessThan(1e-12);
  });

  it('kasus 2x2 sama dengan hitung tangan', () => {
    const input: DssInput = {
      criteria: [crit(1, 'C1', 0.5, 'benefit'), crit(2, 'C2', 0.5, 'cost')],
      alternatives: alts(2),
      values: [
        [4, 2],
        [2, 4],
      ],
    };
    const saw = getMethod('saw')!.compute(input).scores;
    expect(Math.abs(saw[0].value - 1)).toBeLessThan(1e-12);
    expect(Math.abs(saw[1].value - 0.5)).toBeLessThan(1e-12);

    const wp = getMethod('wp')!.compute(input).scores;
    expect(Math.abs(wp[0].value - 2 / 3)).toBeLessThan(1e-12);

    const topsis = getMethod('topsis')!.compute(input).scores;
    expect(Math.abs(topsis[0].value - 1)).toBeLessThan(1e-12);
    expect(Math.abs(topsis[1].value - 0)).toBeLessThan(1e-12);
  });
});

describe('struktur jejak langkah', () => {
  it('setiap metode memberi langkah dengan kolom dan baris konsisten', () => {
    const input: DssInput = {
      criteria: [crit(1, 'C1', 0.6, 'benefit'), crit(2, 'C2', 0.4, 'cost')],
      alternatives: alts(3),
      values: [
        [4, 2],
        [3, 3],
        [5, 1],
      ],
    };
    for (const m of methods) {
      const result = m.compute(input);
      expect(result.steps.length).toBeGreaterThan(3);
      for (const step of result.steps) {
        expect(step.columns.length).toBeGreaterThan(0);
        for (const row of step.rows) {
          expect(row.length).toBe(step.columns.length);
        }
      }
      expect(result.steps[result.steps.length - 1].key).toBe('ranking');
    }
  });
});