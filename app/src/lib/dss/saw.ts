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

function compute(input: DssInput): DssResult {
  const p = prepareInput(input);
  const { criteria, alternatives, values, weights } = p;

  const max = criteria.map((_, j) => Math.max(...column(values, j)));
  const min = criteria.map((_, j) => Math.min(...column(values, j)));

  const r = values.map((row) =>
    row.map((v, j) => (criteria[j].direction === 'benefit' ? v / max[j] : min[j] / v))
  );

  const v = r.map((row) => row.reduce((s, rv, j) => s + weights[j] * rv, 0));

  const steps: TraceStep[] = [
    {
      key: 'matrix',
      title: 'Matriks Keputusan (X)',
      columns: ['Alternatif', ...criteria.map((c) => c.code)],
      rows: alternatives.map((alt, i) => [alt.code, ...values[i].map((x) => x)]),
      note: 'Nilai asli setiap alternatif pada setiap kriteria.',
    },
    {
      key: 'weights',
      title: 'Bobot Ternormalisasi (w)',
      formula: 'w_j = bobot_j / total bobot',
      columns: ['Kriteria', 'Bobot asli', 'Bobot ternormalisasi'],
      rows: criteria.map((c, j) => [c.code, c.weight, display(weights[j], 6)]),
    },
    {
      key: 'extrema',
      title: 'Nilai Maksimum dan Minimum per Kriteria',
      columns: ['Kriteria', 'Arah', 'Max', 'Min'],
      rows: criteria.map((c, j) => [c.code, c.direction, max[j], min[j]]),
    },
    {
      key: 'normalized',
      title: 'Matriks Ternormalisasi (R)',
      formula: 'r_ij = x_ij / max(x_j) untuk benefit, min(x_j) / x_ij untuk cost',
      columns: ['Alternatif', ...criteria.map((c) => c.code)],
      rows: alternatives.map((alt, i) => [alt.code, ...r[i].map((x) => display(x))]),
      note: 'Alternatif terbaik pada setiap kriteria memperoleh r = 1.',
    },
    {
      key: 'score',
      title: 'Perhitungan Nilai (V)',
      formula: 'V_i = jumlah w_j * r_ij',
      columns: ['Alternatif', ...criteria.map((c) => c.code), 'V_i'],
      rows: alternatives.map((alt, i) => [
        alt.code,
        ...r[i].map((x, j) => display(weights[j] * x)),
        display(v[i]),
      ]),
    },
    {
      key: 'ranking',
      title: 'Peringkat Akhir SAW',
      columns: ['Peringkat', 'Alternatif', 'V_i', 'Seri'],
      rows: buildResult('saw', 'SAW', p, [], alternatives.map((alt, i) => ({ alternativeId: alt.id, value: v[i] })))
        .ranking.slice()
        .sort((a, b) => a.rank - b.rank)
        .map((entry) => {
          const alt = alternatives.find((a) => a.id === entry.alternativeId)!;
          return [entry.rank, alt.code, display(entry.value), entry.tied ? 'ya' : 'tidak'];
        }),
    },
  ];

  return buildResult(
    'saw',
    'SAW',
    p,
    steps,
    alternatives.map((alt, i) => ({ alternativeId: alt.id, value: v[i] }))
  );
}

export const saw: DssMethod = {
  id: 'saw',
  description: 'Normalisasi proporsional lalu penjumlahan terbobot. Paling sederhana dan paling banyak dipakai.',
  label: 'SAW',
  inputMode: 'matrix',
  compute,
};