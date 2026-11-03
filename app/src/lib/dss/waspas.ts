import {
  buildResult,
  column,
  display,
  prepareInput,
  type DssInput,
  type DssMethod,
  type DssResult,
  type TraceStep,
} from './types';

/**
 * WASPAS (Weighted Aggregated Sum Product Assessment) menggabungkan dua
 * pendekatan: penjumlahan terbobot seperti SAW (Q dengan lambda 0) dan
 * perkalian terbobot seperti WP (Q dengan lambda 1).
 *
 *   Q_i = lambda * sum_j(w_j * r_ij) + (1 - lambda) * produk_j(r_ij ^ w_j)
 *
 * Parameter lambda berada di antara 0 dan 1. Bila tidak diberikan, dipakai
 * 0,5 seperti pada banyak penerapan. Nilai lambda disimpan di trace karena
 * mengubah hasil akhir.
 */
const DEFAULT_LAMBDA = 0.5;

function compute(input: DssInput): DssResult {
  const p = prepareInput(input);
  const { criteria, alternatives, values, weights } = p;

  const rawLambda = input.options?.lambda;
  let lambda = typeof rawLambda === 'number' && Number.isFinite(rawLambda) ? rawLambda : DEFAULT_LAMBDA;
  const warnings: string[] = [];

  if (lambda < 0 || lambda > 1) {
    warnings.push(
      'Lambda ' + round6(lambda) + ' di luar rentang 0 sampai 1, dipakai nilai bawaan ' + DEFAULT_LAMBDA + '.'
    );
    lambda = DEFAULT_LAMBDA;
  }

  // Normalisasi memakai bentuk yang sama dengan SAW.
  const max = criteria.map((_, j) => Math.max(...column(values, j)));
  const min = criteria.map((_, j) => Math.min(...column(values, j)));

  const r = values.map((row) =>
    row.map((v, j) => (criteria[j].direction === 'benefit' ? v / max[j] : min[j] / v))
  );

  // Bagian penjumlahan terbobot.
  const sumPart = r.map((row) => row.reduce((s, rv, j) => s + weights[j] * rv, 0));

  // Bagian perkalian terbobot. Karena r sudah ternormalisasi dan positif,
  // pangkat positif selalu terdefinisi.
  const productPart = r.map((row) =>
    row.reduce((acc, rv, j) => acc * Math.pow(rv, weights[j]), 1)
  );

  const q = sumPart.map((s, i) => lambda * s + (1 - lambda) * productPart[i]);

  const ranking = buildResult(
    'waspas',
    'WASPAS',
    p,
    [],
    alternatives.map((alt, i) => ({ alternativeId: alt.id, value: q[i] }))
  ).ranking
    .slice()
    .sort((a, b) => a.rank - b.rank);

  const steps: TraceStep[] = [
    {
      key: 'matrix',
      title: 'Matriks Keputusan (X)',
      columns: ['Alternatif', ...criteria.map((c) => c.code)],
      rows: alternatives.map((alt, i) => [alt.code, ...values[i]]),
    },
    {
      key: 'extrema',
      title: 'Nilai Maksimum dan Minimum',
      columns: ['Kriteria', 'Arah', 'Max', 'Min'],
      rows: criteria.map((c, j) => [c.code, c.direction, max[j], min[j]]),
    },
    {
      key: 'normalized',
      title: 'Matriks Ternormalisasi (R)',
      formula: 'r_ij = x_ij / max(x_j) untuk benefit, min(x_j) / x_ij untuk cost',
      columns: ['Alternatif', ...criteria.map((c) => c.code)],
      rows: alternatives.map((alt, i) => [alt.code, ...r[i].map((x) => display(x, 6))]),
    },
    {
      key: 'weights',
      title: 'Bobot Ternormalisasi',
      formula: 'w_j = bobot_j / total bobot',
      columns: ['Kriteria', 'Arah', 'Bobot'],
      rows: criteria.map((c, j) => [c.code, c.direction, display(weights[j], 6)]),
    },
    {
      key: 'sumPart',
      title: 'Bagian Penjumlahan Terbobot',
      formula: 'S_i = jumlah_j ( w_j * r_ij )',
      columns: ['Alternatif', ...criteria.map((c) => c.code), 'S_i'],
      rows: alternatives.map((alt, i) => [
        alt.code,
        ...r[i].map((x, j) => display(weights[j] * x, 6)),
        display(sumPart[i], 6),
      ]),
    },
    {
      key: 'productPart',
      title: 'Bagian Perkalian Terbobot',
      formula: 'P_i = produk_j ( r_ij ^ w_j )',
      columns: ['Alternatif', 'P_i'],
      rows: alternatives.map((alt, i) => [alt.code, display(productPart[i], 6)]),
    },
    {
      key: 'aggregate',
      title: 'Nilai Gabungan (Q)',
      formula: 'Q_i = lambda * S_i + (1 - lambda) * P_i',
      columns: ['Alternatif', 'S_i', 'P_i', 'Q_i'],
      rows: [
        ...alternatives.map((alt, i) => [
          alt.code,
          display(sumPart[i], 6),
          display(productPart[i], 6),
          display(q[i], 6),
        ]),
        ['Lambda', '', '', display(lambda, 4)],
      ],
      note: 'Lambda 0 berarti hanya penjumlahan terbobot, lambda 1 berarti hanya perkalian terbobot.',
    },
    {
      key: 'ranking',
      title: 'Peringkat Akhir WASPAS',
      columns: ['Peringkat', 'Alternatif', 'Q_i', 'Seri'],
      rows: ranking.map((entry) => {
        const alt = alternatives.find((a) => a.id === entry.alternativeId)!;
        return [entry.rank, alt.code, display(entry.value, 6), entry.tied ? 'ya' : 'tidak'];
      }),
    },
  ];

  return buildResult(
    'waspas',
    'WASPAS',
    p,
    steps,
    alternatives.map((alt, i) => ({ alternativeId: alt.id, value: q[i] })),
    warnings
  );
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

export const waspas: DssMethod = {
  id: 'waspas',
  description: 'Gabungan penjumlahan terbobot dan perkalian terbobot dengan parameter lambda.',
  label: 'WASPAS',
  inputMode: 'matrix',
  compute,
};