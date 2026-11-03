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
 * ARAS (Additive Ratio Assessment).
 *
 * Rujukan: Zavadskas dan Turskis, "A new additive ratio assessment (ARAS)
 * method in multicriteria decision-making", Technological and Economic
 * Development of Economy 16(2), 2010.
 *
 * Langkah:
 *   Alternatif nol (A0) adalah solusi optimal hipotetis:
 *     benefit: x_0j = max_i x_ij
 *     cost:    x_0j = min_i x_ij
 *
 *   Normalisasi memakai jumlah kolom termasuk A0:
 *     benefit: r_ij = x_ij / jumlah_i x_ij
 *     cost:    r_ij = x_0j / x_ij, dibagi lagi dengan bentuk yang sama
 *              agar konsisten. Artikel aslinya memakai r_ij = x_0j / x_ij
 *              lalu menormalkan terhadap jumlah kolom cost.
 *
 *   Yang dipakai di sini, sesuai artikel: untuk cost, r_ij = (x_0j / x_ij) / S_j
 *   dengan S_j = jumlah_i (x_0j / x_ij). Untuk benefit, r_ij = x_ij / S_j
 *   dengan S_j = jumlah_i x_ij (termasuk A0).
 *
 *   Nilai terbobot: v_ij = w_j * r_ij
 *   Skor akhir:     S_i  = jumlah_j v_ij
 *   Derajat utilitas: K_i = S_i / S_0
 *
 * Alternatif terbaik memiliki K terbesar. K bernilai 1 untuk A0 dan selalu
 * kurang dari 1 untuk alternatif nyata, sehingga K dapat dibaca sebagai
 * proporsi terhadap solusi optimal.
 */
function compute(input: DssInput): DssResult {
  const p = prepareInput(input);
  const { criteria, alternatives, values, weights } = p;

  const best = criteria.map((c, j) =>
    c.direction === 'benefit' ? Math.max(...column(values, j)) : Math.min(...column(values, j))
  );

  // Baris A0 diletakkan di depan untuk perhitungan, lalu dibuang dari hasil.
  const extended = [best, ...values];

  const colSum = criteria.map((_, j) => extended.reduce((s, row) => s + row[j], 0));

  const ratios = criteria.map((c, j) => {
    if (c.direction === 'benefit') {
      return extended.map((row) => (colSum[j] === 0 ? 0 : row[j] / colSum[j]));
    }
    // cost: x_0j / x_ij, lalu dinormalkan dengan jumlah kolom cost.
    const inverted = extended.map((row) => (row[j] === 0 ? 0 : best[j] / row[j]));
    const sum = inverted.reduce((s, v) => s + v, 0);
    return inverted.map((v) => (sum === 0 ? 0 : v / sum));
  });

  // ratios[j][i] dengan i = 0 untuk A0.
  const weighted = criteria.map((_, j) => ratios[j].map((r) => weights[j] * r));

  const scoreOf = (rowIndex: number) => weighted.reduce((s, col) => s + col[rowIndex], 0);

  const s0 = scoreOf(0);
  const s = alternatives.map((_, i) => scoreOf(i + 1));
  const k = s.map((v) => (s0 === 0 ? 0 : v / s0));

  const warnings: string[] = [];
  if (s0 === 0) {
    warnings.push('Skor solusi optimal bernilai nol, sehingga derajat utilitas tidak dapat dihitung.');
  }

  const ranking = buildResult(
    'aras',
    'ARAS',
    p,
    [],
    alternatives.map((alt, i) => ({ alternativeId: alt.id, value: k[i] }))
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
      key: 'optimal',
      title: 'Solusi Optimal (A0)',
      formula: 'benefit: x_0j = max, cost: x_0j = min',
      columns: ['Kriteria', 'Arah', 'x_0j'],
      rows: criteria.map((c, j) => [c.code, c.direction, best[j]]),
      note: 'A0 bukan alternatif nyata, melainkan pembanding hipotetis untuk menghitung derajat utilitas.',
    },
    {
      key: 'normalized',
      title: 'Matriks Ternormalisasi (R)',
      formula: 'benefit: x_ij / jumlah x_ij. cost: (x_0j / x_ij) / jumlah_i (x_0j / x_ij).',
      columns: ['Baris', ...criteria.map((c) => c.code)],
      rows: [
        ['A0', ...criteria.map((_, j) => display(ratios[j][0], 6))],
        ...alternatives.map((alt, i) => [alt.code, ...criteria.map((_, j) => display(ratios[j][i + 1], 6))]),
      ],
      note: 'Jumlah setiap kolom sama dengan 1, termasuk baris A0.',
    },
    {
      key: 'score',
      title: 'Nilai Terbobot dan Skor',
      formula: 'S_i = jumlah_j ( w_j * r_ij )',
      columns: ['Baris', 'S'],
      rows: [
        ['A0', display(s0, 6)],
        ...alternatives.map((alt, i) => [alt.code, display(s[i], 6)]),
      ],
    },
    {
      key: 'aggregate',
      title: 'Derajat Utilitas (K)',
      formula: 'K_i = S_i / S_0',
      columns: ['Alternatif', 'S', 'K'],
      rows: alternatives.map((alt, i) => [alt.code, display(s[i], 6), display(k[i], 6)]),
      note: 'K antara 0 dan 1. Nilai mendekati 1 berarti mendekati solusi optimal.',
    },
    {
      key: 'ranking',
      title: 'Peringkat Akhir ARAS',
      columns: ['Peringkat', 'Alternatif', 'K', 'Seri'],
      rows: ranking.map((entry) => {
        const alt = alternatives.find((a) => a.id === entry.alternativeId)!;
        return [entry.rank, alt.code, display(entry.value, 6), entry.tied ? 'ya' : 'tidak'];
      }),
    },
  ];

  return buildResult(
    'aras',
    'ARAS',
    p,
    steps,
    alternatives.map((alt, i) => ({ alternativeId: alt.id, value: k[i] })),
    warnings
  );
}

export const aras: DssMethod = {
  id: 'aras',
  label: 'ARAS',
  inputMode: 'matrix',
  description: 'Perbandingan terhadap solusi optimal hipotetis, dinyatakan sebagai derajat utilitas.',
  compute,
};