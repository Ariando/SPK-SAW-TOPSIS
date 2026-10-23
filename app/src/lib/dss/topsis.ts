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

  const divisor = criteria.map((_, j) => Math.sqrt(column(values, j).reduce((s, v) => s + v * v, 0)));
  const r = values.map((row) => row.map((v, j) => v / divisor[j]));
  const y = r.map((row) => row.map((rv, j) => weights[j] * rv));

  const idealPlus = criteria.map((c, j) =>
    c.direction === 'benefit' ? Math.max(...column(y, j)) : Math.min(...column(y, j))
  );
  const idealMinus = criteria.map((c, j) =>
    c.direction === 'benefit' ? Math.min(...column(y, j)) : Math.max(...column(y, j))
  );

  const sq = (row: number[], ideal: number[]) => row.reduce((s, v, j) => s + (v - ideal[j]) ** 2, 0);
  const dPlus = y.map((row) => Math.sqrt(sq(row, idealPlus)));
  const dMinus = y.map((row) => Math.sqrt(sq(row, idealMinus)));
  const v = dPlus.map((dp, i) => dMinus[i] / (dp + dMinus[i]));

  const ranking = buildResult(
    'topsis',
    'TOPSIS',
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
      columns: ['Kriteria', 'Arah', 'Bobot ternormalisasi'],
      rows: criteria.map((c, j) => [c.code, c.direction, display(weights[j], 6)]),
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
      note: 'Norma Euclidean setiap kolom sama dengan 1.',
    },
    {
      key: 'weighted',
      title: 'Matriks Terbobot (Y)',
      formula: 'y_ij = w_j * r_ij',
      columns: ['Alternatif', ...criteria.map((c) => c.code)],
      rows: alternatives.map((alt, i) => [alt.code, ...y[i].map((x) => display(x, 6))]),
    },
    {
      key: 'ideal',
      title: 'Solusi Ideal Positif (A+) dan Negatif (A-)',
      columns: ['Baris', ...criteria.map((c) => c.code)],
      rows: [
        ['A+', ...idealPlus.map((x) => display(x, 6))],
        ['A-', ...idealMinus.map((x) => display(x, 6))],
      ],
      note: 'Solusi ideal dihitung dari matriks terbobot Y, sesuai Hwang dan Yoon.',
    },
    {
      key: 'distance',
      title: 'Jarak ke Solusi Ideal',
      formula: 'D_i+ = akar( jumlah_j (y_ij - A+_j)^2 ), D_i- = akar( jumlah_j (y_ij - A-_j)^2 )',
      columns: ['Alternatif', 'D+', 'D-'],
      rows: alternatives.map((alt, i) => [alt.code, display(dPlus[i], 6), display(dMinus[i], 6)]),
    },
    {
      key: 'closeness',
      title: 'Kedekatan Relatif (V)',
      formula: 'V_i = D_i- / (D_i+ + D_i-)',
      columns: ['Alternatif', 'V_i'],
      rows: alternatives.map((alt, i) => [alt.code, display(v[i], 6)]),
      note: 'Nilai mendekati 1 berarti paling dekat ke solusi ideal positif.',
    },
    {
      key: 'ranking',
      title: 'Peringkat Akhir TOPSIS',
      columns: ['Peringkat', 'Alternatif', 'V_i', 'Seri'],
      rows: ranking.map((entry) => {
        const alt = alternatives.find((a) => a.id === entry.alternativeId)!;
        return [entry.rank, alt.code, display(entry.value), entry.tied ? 'ya' : 'tidak'];
      }),
    },
  ];

  return buildResult(
    'topsis',
    'TOPSIS',
    p,
    steps,
    alternatives.map((alt, i) => ({ alternativeId: alt.id, value: v[i] }))
  );
}

export const topsis: DssMethod = {
  id: 'topsis',
  label: 'TOPSIS',
  inputMode: 'matrix',
  compute,
};