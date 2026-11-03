import { describe, expect, it } from 'vitest';
import { copras } from '../copras';
import { moora } from '../moora';
import { methods, getMethod, methodIds } from '../registry';
import type { Criterion, DssInput, DssMethod } from '../types';
import { vikor } from '../vikor';
import { waspas } from '../waspas';

/**
 * Dataset acuan sama dengan scripts/manual-tier2.mjs, yang dihitung tangan.
 * Angka harapan di bawah diambil dari keluaran skrip itu, bukan dari engine.
 *
 * X = [[4,2],[3,3],[5,1]]
 * C1 benefit bobot 0,6
 * C2 cost    bobot 0,4
 */
const criteria: Criterion[] = [
  { id: 1, code: 'C1', name: 'Benefit', weight: 0.6, direction: 'benefit' },
  { id: 2, code: 'C2', name: 'Cost', weight: 0.4, direction: 'cost' },
];

const alternatives = [
  { id: 1, code: 'A1', title: 'Alternatif satu' },
  { id: 2, code: 'A2', title: 'Alternatif dua' },
  { id: 3, code: 'A3', title: 'Alternatif tiga' },
];

const baseInput: DssInput = {
  criteria,
  alternatives,
  values: [
    [4, 2],
    [3, 3],
    [5, 1],
  ],
};

const valuesOf = (method: DssMethod, input: DssInput = baseInput) =>
  method.compute(input).scores.map((s) => s.value);

const ranksOf = (method: DssMethod, input: DssInput = baseInput) => {
  const result = method.compute(input);
  return result.ranking
    .slice()
    .sort((a, b) => a.alternativeId - b.alternativeId)
    .map((r) => r.rank);
};

const close = (actual: number, expected: number, tolerance = 1e-9) => {
  expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
};

describe('WASPAS', () => {
  it('normalisasi sesuai bentuk SAW', () => {
    // max C1 = 5, min C2 = 1
    // R = [[4/5, 1/2], [3/5, 1/3], [5/5, 1/1]]
    const result = waspas.compute(baseInput);
    const step = result.steps.find((s) => s.key === 'normalized')!;
    close(Number(step.rows[0][1]), 0.8, 1e-6);
    close(Number(step.rows[0][2]), 0.5, 1e-6);
    close(Number(step.rows[1][1]), 0.6, 1e-6);
    close(Number(step.rows[1][2]), 1 / 3, 1e-6);
    close(Number(step.rows[2][1]), 1, 1e-6);
    close(Number(step.rows[2][2]), 1, 1e-6);
  });

  it('bagian penjumlahan dan perkalian cocok dengan hitung tangan', () => {
    const result = waspas.compute(baseInput);
    const s = result.steps.find((x) => x.key === 'sumPart')!;
    const p = result.steps.find((x) => x.key === 'productPart')!;

    close(Number(s.rows[0][s.rows[0].length - 1]), 0.68, 1e-6);
    close(Number(s.rows[1][s.rows[1].length - 1]), 0.493333, 1e-6);
    close(Number(s.rows[2][s.rows[2].length - 1]), 1, 1e-6);

    close(Number(p.rows[0][1]), 0.662891, 1e-6);
    close(Number(p.rows[1][1]), 0.474288, 1e-6);
    close(Number(p.rows[2][1]), 1, 1e-6);
  });

  it('nilai Q cocok dengan hitung tangan pada lambda 0,5', () => {
    const q = valuesOf(waspas);
    close(q[0], 0.6714454017);
    close(q[1], 0.4838107276);
    close(q[2], 1);
  });

  it('peringkat A3, A1, A2', () => {
    expect(ranksOf(waspas)).toEqual([2, 3, 1]);
  });

  it('lambda 0 menghasilkan nilai sama dengan bagian penjumlahan', () => {
    const lambda0: DssInput = { ...baseInput, options: { lambda: 0 } };
    const q = valuesOf(waspas, lambda0);
    // Q = 0 * S + 1 * P, jadi sama dengan bagian perkalian terbobot.
    close(q[0], 0.662891, 1e-6);
    close(q[1], 0.474288, 1e-6);
    close(q[2], 1, 1e-6);
  });

  it('lambda 1 menghasilkan nilai sama dengan penjumlahan terbobot', () => {
    const lambda1: DssInput = { ...baseInput, options: { lambda: 1 } };
    const q = valuesOf(waspas, lambda1);
    // Q = 1 * S + 0 * P, jadi sama dengan S yang identik dengan SAW.
    close(q[0], 0.68, 1e-9);
    close(q[1], 0.4933333333, 1e-9);
    close(q[2], 1, 1e-9);
  });

  it('lambda di luar rentang memunculkan peringatan dan memakai nilai bawaan', () => {
    const result = waspas.compute({ ...baseInput, options: { lambda: 2 } });
    expect(result.warnings.some((w) => w.includes('Lambda'))).toBe(true);
    close(result.scores[0].value, 0.6714454017);
  });

  it('lambda negatif ditolak dengan peringatan', () => {
    const result = waspas.compute({ ...baseInput, options: { lambda: -0.5 } });
    expect(result.warnings.some((w) => w.includes('Lambda'))).toBe(true);
  });
});

describe('MOORA', () => {
  it('pembagi memakai akar jumlah kuadrat', () => {
    const result = moora.compute(baseInput);
    const step = result.steps.find((s) => s.key === 'divisor')!;
    close(Number(step.rows[0][1]), Math.sqrt(50), 1e-6);
    close(Number(step.rows[1][1]), Math.sqrt(14), 1e-6);
  });

  it('nilai y cocok dengan hitung tangan', () => {
    const y = valuesOf(moora);
    close(y[0], 0.1256022614);
    close(y[1], -0.0661550491);
    close(y[2], 0.3173595719);
  });

  it('peringkat A3, A1, A2', () => {
    expect(ranksOf(moora)).toEqual([2, 3, 1]);
  });

  it('nilai y boleh negatif tanpa mengubah peringkat', () => {
    const y = valuesOf(moora);
    expect(y[1]).toBeLessThan(0);
    expect(ranksOf(moora)[1]).toBe(3);
  });
});

describe('COPRAS', () => {
  it('normalisasi memakai x dibagi jumlah kolom untuk semua kriteria', () => {
    const result = copras.compute(baseInput);
    const step = result.steps.find((s) => s.key === 'normalized')!;
    // Jumlah C1 = 12, jumlah C2 = 6
    close(Number(step.rows[0][1]), 4 / 12, 1e-6);
    close(Number(step.rows[0][2]), 2 / 6, 1e-6);
    close(Number(step.rows[2][1]), 5 / 12, 1e-6);
    close(Number(step.rows[2][2]), 1 / 6, 1e-6);
  });

  it('normalisasi cost TIDAK memakai kebalikan nilai', () => {
    // Dengan (1/x) alternatif cost terburuk akan menang, itu yang harus dicegah.
    const result = copras.compute(baseInput);
    const step = result.steps.find((s) => s.key === 'normalized')!;
    const a1c2 = Number(step.rows[0][2]);
    // Jika memakai (1/2)/(1/2+1/3+1/1) hasilnya 0,272727, bukan 0,333333
    expect(Math.abs(a1c2 - 0.272727)).toBeGreaterThan(1e-4);
    close(a1c2, 2 / 6, 1e-6);
  });

  it('S+ dan S- cocok dengan hitung tangan', () => {
    const result = copras.compute(baseInput);
    const step = result.steps.find((s) => s.key === 'sums')!;
    close(Number(step.rows[0][1]), 0.2, 1e-6);
    close(Number(step.rows[1][1]), 0.15, 1e-6);
    close(Number(step.rows[2][1]), 0.25, 1e-6);
    close(Number(step.rows[0][2]), 0.133333, 1e-6);
    close(Number(step.rows[1][2]), 0.2, 1e-6);
    close(Number(step.rows[2][2]), 0.066667, 1e-6);
  });

  it('nilai Q cocok dengan hitung tangan', () => {
    const q = valuesOf(copras);
    close(q[0], 0.3090909091);
    close(q[1], 0.2227272727);
    close(q[2], 0.4681818182);
  });

  it('peringkat A3, A1, A2 selaras dengan metode lain', () => {
    expect(ranksOf(copras)).toEqual([2, 3, 1]);
  });

  it('kriteria cost tunggal menempatkan cost terkecil sebagai terbaik', () => {
    const costOnly: DssInput = {
      criteria: [{ id: 1, code: 'C1', name: 'Cost', weight: 1, direction: 'cost' }],
      alternatives,
      values: [[5], [3], [1]],
    };
    const ranks = copras.compute(costOnly).ranking
      .slice()
      .sort((a, b) => a.alternativeId - b.alternativeId)
      .map((r) => r.rank);
    // A3 punya cost terkecil (1), jadi peringkat 1.
    expect(ranks[2]).toBe(1);
    expect(ranks[0]).toBe(3);
  });

  it('tanpa kriteria cost, Q disamakan dengan S+ dan diberi peringatan', () => {
    const benefitOnly: DssInput = {
      criteria: [{ id: 1, code: 'C1', name: 'Benefit', weight: 1, direction: 'benefit' }],
      alternatives,
      values: [[4], [3], [5]],
    };
    const result = copras.compute(benefitOnly);
    expect(result.warnings.some((w) => w.includes('cost'))).toBe(true);
    expect(result.scores.every((s) => Number.isFinite(s.value))).toBe(true);
  });
});

describe('VIKOR', () => {
  it('memakai arah nilai terkecil lebih baik', () => {
    expect(vikor.compute(baseInput).higherIsBetter).toBe(false);
  });

  it('S dan R cocok dengan hitung tangan', () => {
    const result = vikor.compute(baseInput);
    const step = result.steps.find((s) => s.key === 'sr')!;
    close(Number(step.rows[0][1]), 0.5, 1e-6);
    close(Number(step.rows[1][1]), 1, 1e-6);
    close(Number(step.rows[2][1]), 0, 1e-6);
    close(Number(step.rows[0][2]), 0.3, 1e-6);
    close(Number(step.rows[1][2]), 0.6, 1e-6);
    close(Number(step.rows[2][2]), 0, 1e-6);
  });

  it('Q cocok dengan hitung tangan dan A3 terkecil', () => {
    const q = valuesOf(vikor);
    close(q[0], 0.5, 1e-9);
    close(q[1], 1, 1e-9);
    close(q[2], 0, 1e-9);
  });

  it('peringkat 1 diberikan pada Q terkecil', () => {
    expect(ranksOf(vikor)).toEqual([2, 3, 1]);
  });

  it('v di luar rentang memunculkan peringatan', () => {
    const result = vikor.compute({ ...baseInput, options: { v: 1.5 } });
    expect(result.warnings.some((w) => w.includes('Parameter v'))).toBe(true);
  });

  it('v 0 memakai hanya R, v 1 memakai hanya S', () => {
    const onlyS = valuesOf(vikor, { ...baseInput, options: { v: 1 } });
    // Q = (S - S+) / (S- - S+) saat v = 1
    close(onlyS[0], 0.5, 1e-9);
    close(onlyS[1], 1, 1e-9);
    close(onlyS[2], 0, 1e-9);

    const onlyR = valuesOf(vikor, { ...baseInput, options: { v: 0 } });
    // Q = (R - R+) / (R- - R+) saat v = 0
    close(onlyR[0], 0.5, 1e-9);
    close(onlyR[1], 1, 1e-9);
    close(onlyR[2], 0, 1e-9);
  });

  it('kriteria dengan nilai seragam tidak menghasilkan Infinity', () => {
    const flat: DssInput = {
      criteria,
      alternatives,
      values: [
        [4, 2],
        [4, 3],
        [4, 1],
      ],
    };
    const q = valuesOf(vikor, flat);
    expect(q.every((v) => Number.isFinite(v))).toBe(true);
  });
});

describe('pendaftaran metode', () => {
  it('metode tier 1 dan tier 2 batch pertama terdaftar', () => {
    // Daftar lengkap diuji di tier2b agar berkas ini tidak perlu disunting
    // setiap kali metode baru ditambahkan.
    const ids = methodIds();
    for (const id of ['saw', 'wp', 'topsis', 'waspas', 'moora', 'copras', 'vikor']) {
      expect(ids).toContain(id);
    }
  });

  it('setiap metode dapat diambil lewat getMethod tanpa peduli huruf besar kecil', () => {
    for (const id of methodIds()) {
      expect(getMethod(id.toUpperCase())?.id).toBe(id);
    }
  });

  it('hanya VIKOR yang memakai arah terkecil lebih baik', () => {
    const lower = methods.filter((m) => m.higherIsBetter === false).map((m) => m.id);
    expect(lower).toEqual(['vikor']);
  });

  it('setiap metode menghasilkan langkah dengan kolom dan baris konsisten', () => {
    for (const method of methods) {
      const result = method.compute(baseInput);
      expect(result.steps.length).toBeGreaterThan(3);
      for (const step of result.steps) {
        for (const row of step.rows) {
          expect(row.length).toBe(step.columns.length);
        }
      }
      expect(result.steps[result.steps.length - 1].key).toBe('ranking');
    }
  });

  it('setiap metode memberi peringkat untuk semua alternatif tanpa duplikat', () => {
    for (const method of methods) {
      const result = method.compute(baseInput);
      const ranks = result.ranking
        .slice()
        .sort((a, b) => a.alternativeId - b.alternativeId)
        .map((r) => r.rank);
      expect(ranks).toHaveLength(3);
      expect(new Set(ranks).size).toBe(3);
      expect(ranks.sort()).toEqual([1, 2, 3]);
    }
  });

  it('setiap metode menghasilkan nilai berhingga', () => {
    for (const method of methods) {
      const result = method.compute(baseInput);
      expect(result.scores.every((s) => Number.isFinite(s.value))).toBe(true);
    }
  });
});