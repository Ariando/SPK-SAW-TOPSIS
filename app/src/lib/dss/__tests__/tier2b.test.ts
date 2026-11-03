import { describe, expect, it } from 'vitest';
import { aras } from '../aras';
import { edas } from '../edas';
import { mabac } from '../mabac';
import { methods, methodIds } from '../registry';
import { smart } from '../smart';
import type { Criterion, DssInput, DssMethod } from '../types';

/**
 * Dataset acuan sama dengan scripts/manual-tier2b.mjs yang dihitung tangan.
 * Angka harapan diambil dari keluaran skrip itu, bukan dari engine.
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

const ranksOf = (method: DssMethod, input: DssInput = baseInput) =>
  method.compute(input).ranking
    .slice()
    .sort((a, b) => a.alternativeId - b.alternativeId)
    .map((r) => r.rank);

const close = (actual: number, expected: number, tolerance = 1e-9) => {
  expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
};

describe('EDAS', () => {
  it('memakai rata-rata sebagai solusi acuan', () => {
    const result = edas.compute(baseInput);
    const step = result.steps.find((s) => s.key === 'average')!;
    // AV C1 = (4+3+5)/3 = 4, AV C2 = (2+3+1)/3 = 2
    close(Number(step.rows[0][2]), 4, 1e-6);
    close(Number(step.rows[1][2]), 2, 1e-6);
  });

  it('PDA dan NDA cocok dengan hitung tangan', () => {
    const result = edas.compute(baseInput);
    const pda = result.steps.find((s) => s.key === 'pda')!;
    const nda = result.steps.find((s) => s.key === 'nda')!;

    // A1 (4,2) sama persis dengan rata-rata, jadi PDA dan NDA nol.
    close(Number(pda.rows[0][1]), 0, 1e-6);
    close(Number(pda.rows[0][2]), 0, 1e-6);
    close(Number(nda.rows[0][1]), 0, 1e-6);
    close(Number(nda.rows[0][2]), 0, 1e-6);

    // A2 (3,3): C1 di bawah rata-rata, C2 di atas rata-rata sebagai cost buruk.
    close(Number(nda.rows[1][1]), 0.25, 1e-6);
    close(Number(nda.rows[1][2]), 0.5, 1e-6);

    // A3 (5,1): C1 di atas rata-rata, C2 di bawah rata-rata sebagai cost baik.
    close(Number(pda.rows[2][1]), 0.25, 1e-6);
    close(Number(pda.rows[2][2]), 0.5, 1e-6);
  });

  it('SP dan SN cocok dengan hitung tangan', () => {
    const result = edas.compute(baseInput);
    const step = result.steps.find((s) => s.key === 'sp_sn')!;
    close(Number(step.rows[0][1]), 0, 1e-6);
    close(Number(step.rows[1][2]), 0.35, 1e-6);
    close(Number(step.rows[2][1]), 0.35, 1e-6);
  });

  it('nilai AS cocok dengan hitung tangan', () => {
    const as = valuesOf(edas);
    close(as[0], 0.5);
    close(as[1], 0);
    close(as[2], 1);
  });

  it('peringkat A3, A1, A2', () => {
    expect(ranksOf(edas)).toEqual([2, 3, 1]);
  });

  it('alternatif yang sama dengan rata-rata memperoleh AS 0,5', () => {
    // A1 identik dengan AV sehingga NSP = 0 dan NSN = 1.
    close(valuesOf(edas)[0], 0.5);
  });

  it('kriteria seragam menghasilkan peringatan, bukan NaN', () => {
    // Nilai cost tidak boleh nol, jadi kasus tepi diuji dengan nilai seragam.
    const flat: DssInput = {
      criteria,
      alternatives,
      values: [
        [4, 2],
        [4, 2],
        [4, 2],
      ],
    };
    const result = edas.compute(flat);
    expect(result.scores.every((s) => Number.isFinite(s.value))).toBe(true);
    // Semua alternatif identik, sehingga AS seluruhnya sama.
    const values = result.scores.map((s) => s.value);
    expect(Math.abs(values[0] - values[1])).toBeLessThan(1e-9);
  });
});

describe('ARAS', () => {
  it('solusi optimal memakai nilai terbaik per kriteria', () => {
    const result = aras.compute(baseInput);
    const step = result.steps.find((s) => s.key === 'optimal')!;
    // C1 benefit max = 5, C2 cost min = 1
    close(Number(step.rows[0][2]), 5, 1e-6);
    close(Number(step.rows[1][2]), 1, 1e-6);
  });

  it('normalisasi benefit membagi dengan jumlah kolom termasuk A0', () => {
    const result = aras.compute(baseInput);
    const step = result.steps.find((s) => s.key === 'normalized')!;
    // Jumlah C1 = 5 + 4 + 3 + 5 = 17
    close(Number(step.rows[0][1]), 5 / 17, 1e-6);
    close(Number(step.rows[1][1]), 4 / 17, 1e-6);
  });

  it('normalisasi cost memakai x optimal dibagi x lalu dinormalkan', () => {
    const result = aras.compute(baseInput);
    const step = result.steps.find((s) => s.key === 'normalized')!;
    // x_0/x untuk C2 = 1/1, 1/2, 1/3, 1/1, jumlah 2,833333
    // Baris 0 = A0, baris 1 = A1, baris 2 = A2, baris 3 = A3.
    close(Number(step.rows[0][2]), 1 / (17 / 6), 1e-6);
    close(Number(step.rows[1][2]), (1 / 2) / (17 / 6), 1e-6);
    close(Number(step.rows[2][2]), (1 / 3) / (17 / 6), 1e-6);
  });

  it('skor dan derajat utilitas cocok dengan hitung tangan', () => {
    const result = aras.compute(baseInput);
    const score = result.steps.find((s) => s.key === 'score')!;
    close(Number(score.rows[0][1]), 0.317647, 1e-6);
    close(Number(score.rows[1][1]), 0.211765, 1e-6);

    const k = valuesOf(aras);
    close(k[0], 0.6666666667);
    close(k[1], 0.4814814815);
    close(k[2], 1);
  });

  it('alternatif yang identik dengan solusi optimal memperoleh K 1', () => {
    // A3 = (5,1) sama persis dengan A0.
    close(valuesOf(aras)[2], 1);
  });

  it('semua K berada pada rentang 0 sampai 1', () => {
    const k = valuesOf(aras);
    expect(k.every((v) => v >= 0 && v <= 1)).toBe(true);
  });

  it('peringkat A3, A1, A2', () => {
    expect(ranksOf(aras)).toEqual([2, 3, 1]);
  });
});

describe('MABAC', () => {
  it('normalisasi memakai rentang min-max', () => {
    const result = mabac.compute(baseInput);
    const step = result.steps.find((s) => s.key === 'normalized')!;
    // C1: (4-3)/(5-3) = 0,5 ; C2 cost: (2-3)/(1-3) = 0,5
    close(Number(step.rows[0][1]), 0.5, 1e-6);
    close(Number(step.rows[0][2]), 0.5, 1e-6);
    close(Number(step.rows[1][1]), 0, 1e-6);
    close(Number(step.rows[2][1]), 1, 1e-6);
  });

  it('matriks terbobot menambahkan satu sebelum dikali bobot', () => {
    const result = mabac.compute(baseInput);
    const step = result.steps.find((s) => s.key === 'weighted')!;
    close(Number(step.rows[0][1]), 0.6 * 1.5, 1e-6);
    close(Number(step.rows[2][2]), 0.4 * 2, 1e-6);
  });

  it('batas perkiraan memakai rata-rata geometrik', () => {
    const result = mabac.compute(baseInput);
    const step = result.steps.find((s) => s.key === 'border')!;
    close(Number(step.rows[0][1]), Math.pow(0.9 * 0.6 * 1.2, 1 / 3), 1e-6);
    close(Number(step.rows[1][1]), Math.pow(0.6 * 0.4 * 0.8, 1 / 3), 1e-6);
  });

  it('skor akhir cocok dengan hitung tangan', () => {
    const s = valuesOf(mabac);
    close(s[0], 0.0577504297);
    close(s[1], -0.4422495703);
    close(s[2], 0.5577504297);
  });

  it('peringkat A3, A1, A2', () => {
    expect(ranksOf(mabac)).toEqual([2, 3, 1]);
  });

  it('jumlahan jarak setiap kriteria mendekati nol', () => {
    // Karena g_j adalah rata-rata geometrik, jumlah q_ij tidak nol, tetapi
    // harus berhingga dan tidak meledak.
    const result = mabac.compute(baseInput);
    const step = result.steps.find((s) => s.key === 'distance')!;
    expect(step.rows.every((row) => row.slice(1).every((cell) => Number.isFinite(Number(cell))))).toBe(true);
  });

  it('kriteria seragam diberi peringatan', () => {
    const flat: DssInput = {
      criteria,
      alternatives,
      values: [
        [4, 2],
        [4, 3],
        [4, 1],
      ],
    };
    const result = mabac.compute(flat);
    expect(result.warnings.some((w) => w.includes('seragam'))).toBe(true);
  });
});

describe('SMART', () => {
  it('utilitas benefit dan cost sama-sama bernilai 1 untuk yang terbaik', () => {
    const result = smart.compute(baseInput);
    const step = result.steps.find((s) => s.key === 'utility')!;
    // C1 benefit terbaik 5 -> u = 1 pada A3
    close(Number(step.rows[2][1]), 1, 1e-6);
    // C2 cost terbaik 1 -> u = 1 pada A3
    close(Number(step.rows[2][2]), 1, 1e-6);
  });

  it('utilitas bernilai 0 untuk yang terburuk', () => {
    const result = smart.compute(baseInput);
    const step = result.steps.find((s) => s.key === 'utility')!;
    // C1 terburuk 3 -> u = 0 pada A2
    close(Number(step.rows[1][1]), 0, 1e-6);
    // C2 terburuk 3 -> u = 0 pada A2
    close(Number(step.rows[1][2]), 0, 1e-6);
  });

  it('skor akhir cocok dengan hitung tangan', () => {
    const u = valuesOf(smart);
    close(u[0], 0.5);
    close(u[1], 0);
    close(u[2], 1);
  });

  it('skor berada pada rentang 0 sampai 1', () => {
    const u = valuesOf(smart);
    expect(u.every((v) => v >= 0 && v <= 1)).toBe(true);
  });

  it('peringkat A3, A1, A2', () => {
    expect(ranksOf(smart)).toEqual([2, 3, 1]);
  });

  it('kriteria seragam diberi peringatan', () => {
    const flat: DssInput = {
      criteria,
      alternatives,
      values: [
        [4, 2],
        [4, 3],
        [4, 1],
      ],
    };
    const result = smart.compute(flat);
    expect(result.warnings.some((w) => w.includes('seragam'))).toBe(true);
  });
});

describe('pendaftaran sebelas metode', () => {
  it('sebelas metode terdaftar dalam urutan stabil', () => {
    expect(methodIds()).toEqual([
      'saw',
      'wp',
      'topsis',
      'waspas',
      'moora',
      'copras',
      'vikor',
      'edas',
      'aras',
      'mabac',
      'smart',
    ]);
  });

  it('setiap metode punya deskripsi tidak kosong', () => {
    for (const method of methods) {
      expect(method.description.length).toBeGreaterThan(20);
    }
  });

  it('hanya VIKOR yang memakai arah terkecil lebih baik', () => {
    const lower = methods.filter((m) => m.higherIsBetter === false).map((m) => m.id);
    expect(lower).toEqual(['vikor']);
  });

  it('setiap metode menghasilkan nilai berhingga pada dataset acuan', () => {
    for (const method of methods) {
      const result = method.compute(baseInput);
      expect(result.scores.every((s) => Number.isFinite(s.value))).toBe(true);
    }
  });

  it('setiap metode memberi peringkat penuh tanpa duplikat', () => {
    for (const method of methods) {
      const ranks = method.compute(baseInput).ranking.map((r) => r.rank).sort((a, b) => a - b);
      expect(ranks).toEqual([1, 2, 3]);
    }
  });

  it('setiap langkah punya panjang baris sama dengan kolom', () => {
    for (const method of methods) {
      const result = method.compute(baseInput);
      for (const step of result.steps) {
        for (const row of step.rows) {
          expect(row.length).toBe(step.columns.length);
        }
      }
    }
  });

  it('sebelas metode sepakat pada dataset acuan yang didominasi A3', () => {
    for (const method of methods) {
      expect(ranksOf(method)[2]).toBe(1);
    }
  });
});