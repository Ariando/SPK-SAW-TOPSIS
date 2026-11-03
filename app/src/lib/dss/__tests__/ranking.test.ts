import { describe, expect, it } from 'vitest';
import {
  analyseAgreement,
  bordaPoints,
  chiSquareUpperTail,
  pearsonCorrelation,
  spearmanCorrelation,
  toAverageRanks,
  RankingError,
  type MethodRanking,
} from '../ranking';

const ranking = (methodId: string, rows: [string, number][]): MethodRanking => ({
  methodId,
  label: methodId.toUpperCase(),
  entries: rows.map(([code, rank]) => ({ code, title: 'Proposal ' + code, rank })),
});

const approx = (actual: number | null, expected: number, tolerance = 1e-10) => {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual as number) - expected)).toBeLessThan(tolerance);
};

describe('konversi peringkat rata rata', () => {
  it('tanpa seri menghasilkan peringkat apa adanya', () => {
    expect(toAverageRanks([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
  });

  it('seri dua di posisi pertama berbagi 1,5', () => {
    expect(toAverageRanks([1, 1, 3])).toEqual([1.5, 1.5, 3]);
  });

  it('seri tiga di posisi tengah berbagi 3', () => {
    expect(toAverageRanks([1, 2, 2, 2, 5])).toEqual([1, 3, 3, 3, 5]);
  });

  it('seri di posisi terakhir', () => {
    expect(toAverageRanks([1, 2, 3, 3])).toEqual([1, 2, 3.5, 3.5]);
  });

  it('semua seri menghasilkan rata rata tengah', () => {
    expect(toAverageRanks([1, 1, 1, 1])).toEqual([2.5, 2.5, 2.5, 2.5]);
  });

  it('peringkat tidak berurutan tetap dipetakan menurut nilai', () => {
    expect(toAverageRanks([2, 1, 2, 1])).toEqual([3.5, 1.5, 3.5, 1.5]);
  });
});

describe('poin Borda', () => {
  it('peringkat terbaik memperoleh n dan terburuk memperoleh 1', () => {
    expect(bordaPoints([1, 2, 3, 4], 4)).toEqual([4, 3, 2, 1]);
  });

  it('seri berbagi poin di antara posisi', () => {
    expect(bordaPoints([1.5, 1.5, 3], 3)).toEqual([2.5, 2.5, 1]);
  });

  it('jumlah poin setiap metode selalu n(n+1)/2', () => {
    const points = bordaPoints(toAverageRanks([1, 1, 3, 4]), 4);
    expect(points.reduce((s, v) => s + v, 0)).toBeCloseTo(10, 12);
  });
});

describe('korelasi', () => {
  it('Pearson untuk hubungan linear sempurna', () => {
    approx(pearsonCorrelation([1, 2, 3, 4], [2, 4, 6, 8]), 1);
  });

  it('Pearson untuk hubungan linear negatif sempurna', () => {
    approx(pearsonCorrelation([1, 2, 3, 4], [8, 6, 4, 2]), -1);
  });

  it('Pearson mengembalikan null bila salah satu deret konstan', () => {
    expect(pearsonCorrelation([1, 1, 1], [1, 2, 3])).toBeNull();
  });

  it('Spearman tanpa seri sama dengan rumus 1 - 6 sum d kuadrat / (n(n^2-1))', () => {
    // Peringkat [1,2,3,4] lawan [2,1,4,3]: d = -1,1,-1,1, sum d^2 = 4
    // rho = 1 - 6(4) / (4(16-1)) = 1 - 24/60 = 0,6
    approx(spearmanCorrelation([1, 2, 3, 4], [2, 1, 4, 3]), 0.6);
  });

  it('Spearman menangani seri lewat peringkat rata rata', () => {
    const rho = spearmanCorrelation([1.5, 1.5, 3, 4], [1, 2, 3, 4]);
    expect(rho).not.toBeNull();
    expect(rho as number).toBeGreaterThan(0.9);
    expect(rho as number).toBeLessThanOrEqual(1);
  });

  it('Spearman untuk peringkat identik bernilai 1', () => {
    approx(spearmanCorrelation([1.5, 1.5, 3, 4], [1.5, 1.5, 3, 4]), 1);
  });
});

describe('sebaran khi kuadrat', () => {
  it('peluang ekor untuk x = 0 adalah 1', () => {
    approx(chiSquareUpperTail(0, 3), 1);
  });

  it('nilai acuan df 2 pada x = 5,991 mendekati 0,05', () => {
    approx(chiSquareUpperTail(5.991, 2), 0.05, 1e-3);
  });

  it('nilai acuan df 1 pada x = 3,841 mendekati 0,05', () => {
    approx(chiSquareUpperTail(3.841, 1), 0.05, 1e-3);
  });

  it('nilai acuan df 4 pada x = 9,488 mendekati 0,05', () => {
    approx(chiSquareUpperTail(9.488, 4), 0.05, 1e-3);
  });

  it('makin besar x makin kecil peluangnya', () => {
    expect(chiSquareUpperTail(2, 3)).toBeGreaterThan(chiSquareUpperTail(10, 3));
  });
});

describe('analisis kesepakatan', () => {
  it('tiga metode dengan peringkat identik menghasilkan W = 1 dan Spearman = 1', () => {
    const rankingRows: [string, number][] = [
      ['A1', 1],
      ['A2', 2],
      ['A3', 3],
      ['A4', 4],
    ];
    const result = analyseAgreement([
      ranking('saw', rankingRows),
      ranking('wp', rankingRows),
      ranking('topsis', rankingRows),
    ]);

    approx(result.kendall.w, 1);
    expect(result.kendall.pValue).not.toBeNull();
    expect(result.kendall.pValue as number).toBeLessThan(0.05);
    expect(result.spearman.pairs).toHaveLength(3);
    for (const pair of result.spearman.pairs) approx(pair.rho, 1);
    approx(result.spearman.average, 1);
  });

  it('peringkat terbalik sempurna menghasilkan Spearman -1', () => {
    const result = analyseAgreement([
      ranking('saw', [
        ['A1', 1],
        ['A2', 2],
        ['A3', 3],
      ]),
      ranking('wp', [
        ['A1', 3],
        ['A2', 2],
        ['A3', 1],
      ]),
    ]);

    expect(result.spearman.pairs).toHaveLength(1);
    approx(result.spearman.pairs[0].rho, -1);
    approx(result.kendall.w, 0);
  });

  it('Borda menggabungkan poin dan mengurutkan menurun', () => {
    const result = analyseAgreement([
      ranking('saw', [
        ['A1', 1],
        ['A2', 2],
        ['A3', 3],
      ]),
      ranking('wp', [
        ['A1', 1],
        ['A2', 3],
        ['A3', 2],
      ]),
    ]);

    expect(result.borda.map((row) => row.code)).toEqual(['A1', 'A2', 'A3']);
    // A1: 3 + 3 = 6. A2: 2 + 1 = 3. A3: 1 + 2 = 3. A2 dan A3 seri.
    expect(result.borda[0].points).toBeCloseTo(6, 10);
    expect(result.borda[1].points).toBeCloseTo(3, 10);
    expect(result.borda[2].points).toBeCloseTo(3, 10);
    expect(result.borda[1].tied).toBe(true);
    expect(result.borda[2].tied).toBe(true);
  });

  it('seri pada satu metode memunculkan peringatan dan W tetap dalam rentang', () => {
    // Dense ranking: dua alternatif seri di posisi pertama, yang ketiga 2.
    const result = analyseAgreement([
      ranking('saw', [
        ['A1', 1],
        ['A2', 1],
        ['A3', 2],
      ]),
      ranking('wp', [
        ['A1', 2],
        ['A2', 1],
        ['A3', 3],
      ]),
    ]);

    expect(result.kendall.tieCorrection).toBe(6);
    expect(result.warnings.some((w) => w.includes('seri'))).toBe(true);
    expect(result.kendall.w).not.toBeNull();
    expect(result.kendall.w as number).toBeGreaterThanOrEqual(0);
    expect(result.kendall.w as number).toBeLessThanOrEqual(1);
  });

  it('semua alternatif seri membuat W tidak terdefinisi dengan alasan jelas', () => {
    const result = analyseAgreement([
      ranking('saw', [
        ['A1', 1],
        ['A2', 1],
      ]),
      ranking('wp', [
        ['A1', 1],
        ['A2', 1],
      ]),
    ]);

    expect(result.kendall.w).toBeNull();
    expect(result.kendall.reason).toContain('seri');
  });

  it('satu metode saja tidak bisa mengukur kesepakatan', () => {
    const result = analyseAgreement([
      ranking('saw', [
        ['A1', 1],
        ['A2', 2],
      ]),
    ]);

    expect(result.kendall.w).toBeNull();
    expect(result.kendall.reason).toContain('dua metode');
  });

  it('peringatan muncul saat alternatif kurang dari tujuh', () => {
    const result = analyseAgreement([
      ranking('saw', [
        ['A1', 1],
        ['A2', 2],
      ]),
      ranking('wp', [
        ['A1', 1],
        ['A2', 2],
      ]),
    ]);
    expect(result.warnings.some((w) => w.includes('perkiraan'))).toBe(true);
  });

  it('menolak himpunan alternatif yang berbeda antar metode', () => {
    expect(() =>
      analyseAgreement([
        ranking('saw', [
          ['A1', 1],
          ['A2', 2],
        ]),
        ranking('wp', [
          ['A1', 1],
          ['A3', 2],
        ]),
      ])
    ).toThrow(RankingError);
  });

  it('menolak peringkat yang melompat', () => {
    expect(() =>
      analyseAgreement([
        ranking('saw', [
          ['A1', 1],
          ['A2', 3],
        ]),
        ranking('wp', [
          ['A1', 1],
          ['A2', 2],
        ]),
      ])
    ).toThrow(RankingError);
  });

  it('menolak kode alternatif ganda', () => {
    expect(() =>
      analyseAgreement([
        ranking('saw', [
          ['A1', 1],
          ['A1', 2],
        ]),
      ])
    ).toThrow(RankingError);
  });

  it('menolak peringkat nol atau negatif', () => {
    expect(() =>
      analyseAgreement([
        ranking('saw', [
          ['A1', 0],
          ['A2', 1],
        ]),
      ])
    ).toThrow(RankingError);
  });

  it('menolak daftar metode kosong', () => {
    expect(() => analyseAgreement([])).toThrow(RankingError);
  });

  it('urutan masukan alternatif tidak mempengaruhi hasil', () => {
    const first = analyseAgreement([
      ranking('saw', [
        ['A1', 1],
        ['A2', 2],
        ['A3', 3],
      ]),
      ranking('wp', [
        ['A1', 1],
        ['A2', 3],
        ['A3', 2],
      ]),
    ]);

    const second = analyseAgreement([
      ranking('saw', [
        ['A3', 3],
        ['A1', 1],
        ['A2', 2],
      ]),
      ranking('wp', [
        ['A2', 3],
        ['A3', 2],
        ['A1', 1],
      ]),
    ]);

    approx(first.kendall.w, second.kendall.w as number);
    expect(first.borda.map((r) => r.code)).toEqual(second.borda.map((r) => r.code));
  });
});