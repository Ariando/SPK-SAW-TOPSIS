import {
  buildResult,
  display,
  prepareInput,
  type DssInput,
  type DssMethod,
  type DssResult,
  type TraceStep,
} from './types';

function compute(input: DssInput): DssResult {
  const p = prepareInput(input);
  const { criteria, alternatives, values, weights } = p;

  const exponent = criteria.map((c, j) => (c.direction === 'benefit' ? weights[j] : -weights[j]));

  const powered = values.map((row) => row.map((v, j) => Math.pow(v, exponent[j])));
  const s = powered.map((row) => row.reduce((acc, v) => acc * v, 1));
  const totalS = s.reduce((a, b) => a + b, 0);
  const v = s.map((x) => x / totalS);

  const ranking = buildResult(
    'wp',
    'WP',
    p,
    [],
    alternatives.map((alt, i) => ({ alternativeId: alt.id, value: v[i] }))
  ).ranking.slice().sort((a, b) => a.rank - b.rank);

  const steps: TraceStep[] = [
    {
      key: 'matrix',
      title: 'Matriks Keputusan (X)',
      columns: ['Alternatif', ...criteria.map((c) => c.code)],
      rows: alternatives.map((alt, i) => [alt.code, ...values[i]]),
    },
    {
      key: 'weights',
      title: 'Bobot Ternormalisasi (w)',
      formula: 'w_j = bobot_j / total bobot',
      columns: ['Kriteria', 'Arah', 'Eksponen', 'Bobot ternormalisasi'],
      rows: criteria.map((c, j) => [
        c.code,
        c.direction,
        c.direction === 'benefit' ? display(weights[j], 6) : '-' + display(weights[j], 6),
        display(weights[j], 6),
      ]),
      note: 'Kriteria cost memakai eksponen negatif, setara dengan membagi.',
    },
    {
      key: 'powered',
      title: 'Nilai Berpangkat x^w',
      formula: 'x_ij ^ w_j untuk benefit, x_ij ^ (-w_j) untuk cost',
      columns: ['Alternatif', ...criteria.map((c) => c.code)],
      rows: alternatives.map((alt, i) => [alt.code, ...powered[i].map((x) => display(x, 6))]),
    },
    {
      key: 'vectorS',
      title: 'Nilai Vektor (S)',
      formula: 'S_i = produk_j ( x_ij ^ w_j )',
      columns: ['Alternatif', ...criteria.map((c) => c.code), 'S_i'],
      rows: [
        ...alternatives.map((alt, i) => [alt.code, ...powered[i].map((x) => display(x, 6)), display(s[i], 6)]),
        ['Total', ...criteria.map(() => ''), display(totalS, 6)],
      ],
    },
    {
      key: 'vectorV',
      title: 'Nilai Vektor (V)',
      formula: 'V_i = S_i / jumlah S',
      columns: ['Alternatif', 'S_i', 'V_i'],
      rows: alternatives.map((alt, i) => [alt.code, display(s[i], 6), display(v[i], 6)]),
    },
    {
      key: 'ranking',
      title: 'Peringkat Akhir WP',
      columns: ['Peringkat', 'Alternatif', 'V_i', 'Seri'],
      rows: ranking.map((entry) => {
        const alt = alternatives.find((a) => a.id === entry.alternativeId)!;
        return [entry.rank, alt.code, display(entry.value), entry.tied ? 'ya' : 'tidak'];
      }),
    },
  ];

  return buildResult(
    'wp',
    'WP',
    p,
    steps,
    alternatives.map((alt, i) => ({ alternativeId: alt.id, value: v[i] }))
  );
}

export const wp: DssMethod = {
  id: 'wp',
  description: 'Perkalian berpangkat dengan bobot ternormalisasi. Peka terhadap perbedaan rasio antar nilai.',
  label: 'WP',
  inputMode: 'matrix',
  compute,
};