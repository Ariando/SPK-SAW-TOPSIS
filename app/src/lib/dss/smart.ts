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
 * SMART (Simple Multi-Attribute Rating Technique).
 *
 * Rujukan: Edwards, "How to use multiattribute utility measurement for social
 * decisionmaking", IEEE Transactions on Systems, Man, and Cybernetics 7(5),
 * 1977. Ringkasan penerapan banyak dipakai pada literatur Indonesia.
 *
 * Langkah:
 *   Normalisasi memakai rentang antar alternatif, sehingga setiap kriteria
 *   berada pada skala 0 sampai 1:
 *
 *     benefit: u_ij = (x_ij - min_i x_ij) / (max_i x_ij - min_i x_ij)
 *     cost:    u_ij = (max_i x_ij - x_ij) / (max_i x_ij - min_i x_ij)
 *
 *   Skor akhir:
 *     U_i = jumlah_j ( w_j * u_ij )
 *
 * Alternatif terbaik memiliki U terbesar. Karena u berada pada 0 sampai 1 dan
 * bobot berjumlah 1, U juga berada pada 0 sampai 1.
 *
 * Catatan perbedaan definisi: sebagian penerapan memakai skala 100 untuk
 * utilitas. Itu hanya mengalikan seluruh skor dengan konstanta dan tidak
 * mengubah peringkat, jadi bentuk 0 sampai 1 dipakai di sini.
 */
function compute(input: DssInput): DssResult {
  const p = prepareInput(input);
  const { criteria, alternatives, values, weights } = p;

  const max = criteria.map((_, j) => Math.max(...column(values, j)));
  const min = criteria.map((_, j) => Math.min(...column(values, j)));

  const warnings: string[] = [];
  const flat = criteria.filter((_, j) => Math.abs(max[j] - min[j]) < 1e-12);
  if (flat.length > 0) {
    warnings.push(
      'Kriteria ' +
        flat.map((c) => c.code).join(', ') +
        ' memiliki nilai seragam pada semua alternatif, sehingga utilitasnya dianggap nol.'
    );
  }

  const utility = values.map((row) =>
    row.map((x, j) => {
      const range = max[j] - min[j];
      if (Math.abs(range) < 1e-12) return 0;
      return criteria[j].direction === 'benefit' ? (x - min[j]) / range : (max[j] - x) / range;
    })
  );

  const weighted = utility.map((row) => row.map((u, j) => weights[j] * u));
  const total = weighted.map((row) => row.reduce((s, v) => s + v, 0));

  const ranking = buildResult(
    'smart',
    'SMART',
    p,
    [],
    alternatives.map((alt, i) => ({ alternativeId: alt.id, value: total[i] }))
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
      key: 'weights',
      title: 'Bobot Ternormalisasi',
      formula: 'w_j = bobot_j / total bobot',
      columns: ['Kriteria', 'Arah', 'Bobot'],
      rows: criteria.map((c, j) => [c.code, c.direction, display(weights[j], 6)]),
    },
    {
      key: 'utility',
      title: 'Nilai Utilitas (u)',
      formula: 'benefit: (x - min) / (max - min). cost: (max - x) / (max - min).',
      columns: ['Alternatif', ...criteria.map((c) => c.code)],
      rows: alternatives.map((alt, i) => [alt.code, ...utility[i].map((u) => display(u, 6))]),
      note: 'Nilai 1 berarti alternatif terbaik pada kriteria itu, nilai 0 berarti terburuk.',
    },
    {
      key: 'weighted',
      title: 'Utilitas Terbobot',
      formula: 'w_j * u_ij',
      columns: ['Alternatif', ...criteria.map((c) => c.code)],
      rows: alternatives.map((alt, i) => [alt.code, ...weighted[i].map((v) => display(v, 6))]),
    },
    {
      key: 'aggregate',
      title: 'Skor Akhir (U)',
      formula: 'U_i = jumlah_j ( w_j * u_ij )',
      columns: ['Alternatif', ...criteria.map((c) => c.code), 'U'],
      rows: alternatives.map((alt, i) => [
        alt.code,
        ...weighted[i].map((v) => display(v, 6)),
        display(total[i], 6),
      ]),
      note: 'U berada pada rentang 0 sampai 1 karena utilitas dan bobot sama-sama ternormalisasi.',
    },
    {
      key: 'ranking',
      title: 'Peringkat Akhir SMART',
      columns: ['Peringkat', 'Alternatif', 'U', 'Seri'],
      rows: ranking.map((entry) => {
        const alt = alternatives.find((a) => a.id === entry.alternativeId)!;
        return [entry.rank, alt.code, display(entry.value, 6), entry.tied ? 'ya' : 'tidak'];
      }),
    },
  ];

  return buildResult(
    'smart',
    'SMART',
    p,
    steps,
    alternatives.map((alt, i) => ({ alternativeId: alt.id, value: total[i] })),
    warnings
  );
}

export const smart: DssMethod = {
  id: 'smart',
  label: 'SMART',
  inputMode: 'matrix',
  description: 'Utilitas ternormalisasi 0 sampai 1, dijumlahkan dengan bobot.',
  compute,
};