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
 * MOORA (Multi-Objective Optimization on the basis of Ratio Analysis).
 *
 * Normalisasi memakai bentuk rasio terhadap akar jumlah kuadrat per kriteria,
 * sehingga r_ij = x_ij / akar(jumlah_i x_ij^2). Ini bentuk yang dipakai pada
 * sumber aslinya (Brauers dan Zavadskas) dan pada banyak penerapan.
 *
 * Agregasi ratio system:
 *   y_i = jumlah_j(w_j * r_ij) untuk benefit  -  jumlah_j(w_j * r_ij) untuk cost
 *
 * Alternatif terbaik memiliki y terbesar.
 *
 * Varian reference point tidak dipakai di sini karena membutuhkan penentuan
 * titik acuan per kriteria, yang lebih tepat menjadi metode terpisah agar
 * hasilnya tidak tercampur dalam satu label.
 */
function compute(input: DssInput): DssResult {
  const p = prepareInput(input);
  const { criteria, alternatives, values, weights } = p;

  const divisor = criteria.map((_, j) => Math.sqrt(column(values, j).reduce((s, v) => s + v * v, 0)));
  const r = values.map((row) => row.map((v, j) => v / divisor[j]));
  const weighted = r.map((row) => row.map((rv, j) => weights[j] * rv));

  const benefitSum = weighted.map((row) =>
    row.reduce((s, v, j) => (criteria[j].direction === 'benefit' ? s + v : s), 0)
  );
  const costSum = weighted.map((row) =>
    row.reduce((s, v, j) => (criteria[j].direction === 'cost' ? s + v : s), 0)
  );
  const y = benefitSum.map((b, i) => b - costSum[i]);

  const ranking = buildResult(
    'moora',
    'MOORA',
    p,
    [],
    alternatives.map((alt, i) => ({ alternativeId: alt.id, value: y[i] }))
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
      key: 'divisor',
      title: 'Pembagi Normalisasi',
      formula: 'divisor_j = akar( jumlah_i x_ij^2 )',
      columns: ['Kriteria', 'Pembagi'],
      rows: criteria.map((c, j) => [c.code, display(divisor[j], 6)]),
    },
    {
      key: 'normalized',
      title: 'Matriks Ternormalisasi (R)',
      formula: 'r_ij = x_ij / divisor_j',
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
      key: 'weighted',
      title: 'Nilai Terbobot',
      formula: 'w_j * r_ij',
      columns: ['Alternatif', ...criteria.map((c) => c.code)],
      rows: alternatives.map((alt, i) => [alt.code, ...weighted[i].map((x) => display(x, 6))]),
    },
    {
      key: 'aggregate',
      title: 'Agregasi Ratio System',
      formula: 'y_i = jumlah benefit - jumlah cost',
      columns: ['Alternatif', 'Jumlah benefit', 'Jumlah cost', 'y_i'],
      rows: alternatives.map((alt, i) => [
        alt.code,
        display(benefitSum[i], 6),
        display(costSum[i], 6),
        display(y[i], 6),
      ]),
      note: 'Nilai y lebih besar berarti lebih baik. Skala y dapat bernilai negatif bila jumlah cost melebihi benefit.',
    },
    {
      key: 'ranking',
      title: 'Peringkat Akhir MOORA',
      columns: ['Peringkat', 'Alternatif', 'y_i', 'Seri'],
      rows: ranking.map((entry) => {
        const alt = alternatives.find((a) => a.id === entry.alternativeId)!;
        return [entry.rank, alt.code, display(entry.value, 6), entry.tied ? 'ya' : 'tidak'];
      }),
    },
  ];

  return buildResult(
    'moora',
    'MOORA',
    p,
    steps,
    alternatives.map((alt, i) => ({ alternativeId: alt.id, value: y[i] }))
  );
}

export const moora: DssMethod = {
  id: 'moora',
  description: 'Rasio terhadap akar jumlah kuadrat, lalu selisih total benefit dan cost.',
  label: 'MOORA',
  inputMode: 'matrix',
  compute,
};