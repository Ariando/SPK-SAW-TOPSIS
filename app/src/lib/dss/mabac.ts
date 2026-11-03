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
 * MABAC (Multi-Attributive Border Approximation area Comparison).
 *
 * Rujukan: Pamucar dan Cirovic, "The selection of transport and handling
 * resources in logistics centers using Multi-Attributive Bordering area
 * Comparison (MABAC) method", Expert Systems with Applications 42(4), 2015.
 *
 * Varian yang dipakai: normalisasi pembagian dengan batas atas dan bawah
 * (min-max), yang merupakan bentuk pada artikel asli.
 *
 *   benefit: n_ij = (x_ij - min_i x_ij) / (max_i x_ij - min_i x_ij)
 *   cost:    n_ij = (x_ij - max_i x_ij) / (min_i x_ij - max_i x_ij)
 *
 *   Matriks terbobot: v_ij = w_j * (n_ij + 1)
 *
 *   Batas perkiraan (border approximation) per kriteria:
 *     g_j = ( produk_i v_ij ) ^ (1 / m)
 *
 *   Jarak elemen ke batas:
 *     q_ij = v_ij - g_j
 *
 *   Skor akhir: S_i = jumlah_j q_ij
 *
 * Alternatif terbaik memiliki S terbesar. Nilai q positif berarti alternatif
 * berada di atas batas perkiraan pada kriteria itu.
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
        ' memiliki nilai seragam pada semua alternatif, sehingga normalisasinya dianggap nol.'
    );
  }

  const normalized = values.map((row) =>
    row.map((x, j) => {
      const range = max[j] - min[j];
      if (Math.abs(range) < 1e-12) return 0;
      return criteria[j].direction === 'benefit' ? (x - min[j]) / range : (x - max[j]) / (min[j] - max[j]);
    })
  );

  const weighted = normalized.map((row) => row.map((n, j) => weights[j] * (n + 1)));

  const m = alternatives.length;
  const border = criteria.map((_, j) => {
    const product = weighted.reduce((acc, row) => acc * row[j], 1);
    return Math.pow(product, 1 / m);
  });

  const distance = weighted.map((row) => row.map((v, j) => v - border[j]));
  const s = distance.map((row) => row.reduce((sum, q) => sum + q, 0));

  const ranking = buildResult(
    'mabac',
    'MABAC',
    p,
    [],
    alternatives.map((alt, i) => ({ alternativeId: alt.id, value: s[i] }))
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
      columns: ['Kriteria', 'Arah', 'Max', 'Min', 'Rentang'],
      rows: criteria.map((c, j) => [c.code, c.direction, max[j], min[j], display(max[j] - min[j], 6)]),
    },
    {
      key: 'normalized',
      title: 'Matriks Ternormalisasi (N)',
      formula: 'benefit: (x - min) / (max - min). cost: (x - max) / (min - max).',
      columns: ['Alternatif', ...criteria.map((c) => c.code)],
      rows: alternatives.map((alt, i) => [alt.code, ...normalized[i].map((n) => display(n, 6))]),
      note: 'Nilai ternormalisasi berada pada rentang 0 sampai 1, terbaik selalu mendekati 1.',
    },
    {
      key: 'weighted',
      title: 'Matriks Terbobot (V)',
      formula: 'v_ij = w_j * (n_ij + 1)',
      columns: ['Alternatif', ...criteria.map((c) => c.code)],
      rows: alternatives.map((alt, i) => [alt.code, ...weighted[i].map((v) => display(v, 6))]),
    },
    {
      key: 'border',
      title: 'Batas Perkiraan (G)',
      formula: 'g_j = ( produk_i v_ij ) ^ (1 / m)',
      columns: ['Kriteria', 'g_j'],
      rows: criteria.map((c, j) => [c.code, display(border[j], 6)]),
      note: 'Rata-rata geometrik dipakai agar batas tidak terpengaruh satu nilai ekstrem.',
    },
    {
      key: 'distance',
      title: 'Jarak ke Batas Perkiraan (Q)',
      formula: 'q_ij = v_ij - g_j',
      columns: ['Alternatif', ...criteria.map((c) => c.code)],
      rows: alternatives.map((alt, i) => [alt.code, ...distance[i].map((q) => display(q, 6))]),
    },
    {
      key: 'aggregate',
      title: 'Skor Akhir (S)',
      formula: 'S_i = jumlah_j q_ij',
      columns: ['Alternatif', ...criteria.map((c) => c.code), 'S'],
      rows: alternatives.map((alt, i) => [
        alt.code,
        ...distance[i].map((q) => display(q, 6)),
        display(s[i], 6),
      ]),
      note: 'S lebih besar berarti lebih baik.',
    },
    {
      key: 'ranking',
      title: 'Peringkat Akhir MABAC',
      columns: ['Peringkat', 'Alternatif', 'S', 'Seri'],
      rows: ranking.map((entry) => {
        const alt = alternatives.find((a) => a.id === entry.alternativeId)!;
        return [entry.rank, alt.code, display(entry.value, 6), entry.tied ? 'ya' : 'tidak'];
      }),
    },
  ];

  return buildResult(
    'mabac',
    'MABAC',
    p,
    steps,
    alternatives.map((alt, i) => ({ alternativeId: alt.id, value: s[i] })),
    warnings
  );
}

export const mabac: DssMethod = {
  id: 'mabac',
  label: 'MABAC',
  inputMode: 'matrix',
  description: 'Jarak terhadap batas perkiraan per kriteria, dijumlahkan menjadi skor akhir.',
  compute,
};