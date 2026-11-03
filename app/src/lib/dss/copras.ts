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
 * COPRAS (Complex Proportional Assessment).
 *
 * Normalisasi linear yang sama untuk semua kriteria: r_ij = x_ij / jumlah_i x_ij.
 * Setiap kolom berjumlah 1, sehingga perbandingan antar kolom seimbang.
 *
 * Catatan penting: sebagian implementasi memakai (1 / x_ij) untuk kriteria
 * cost. Itu keliru bila dipasangkan dengan rumus Q di bawah, karena Q sudah
 * memberi nilai besar ketika S- kecil. Membalik normalisasi cost sekaligus
 * memakai Q yang sama berarti dua inversi yang seharusnya saling membatalkan
 * justru bertumpuk, sehingga alternatif dengan cost terburuk menang. Sudah
 * diuji: dengan (1 / x), alternatif cost terburuk memperoleh Q tertinggi.
 *
 *   S+_i = jumlah_j ( w_j * r_ij ) untuk kriteria benefit
 *   S-_i = jumlah_j ( w_j * r_ij ) untuk kriteria cost
 *
 *   Q_i = S+_i + ( S-_min * jumlah_i S-_i ) / ( S-_i * jumlah_i ( S-_min / S-_i ) )
 *
 * Alternatif terbaik memiliki Q terbesar. Karena r kecil berarti cost kecil,
 * S- kecil berarti baik, dan suku kedua memberi tambahan besar untuk S- kecil.
 */
function compute(input: DssInput): DssResult {
  const p = prepareInput(input);
  const { criteria, alternatives, values, weights } = p;

  const colSum = criteria.map((_, j) => column(values, j).reduce((s, v) => s + v, 0));

  const r = values.map((row) => row.map((v, j) => (colSum[j] === 0 ? 0 : v / colSum[j])));

  const weighted = r.map((row) => row.map((rv, j) => weights[j] * rv));

  const sPlus = weighted.map((row) =>
    row.reduce((s, v, j) => (criteria[j].direction === 'benefit' ? s + v : s), 0)
  );
  const sMinus = weighted.map((row) =>
    row.reduce((s, v, j) => (criteria[j].direction === 'cost' ? s + v : s), 0)
  );

  const sMinusMin = sMinus.length > 0 ? Math.min(...sMinus) : 0;
  const sMinusSum = sMinus.reduce((a, b) => a + b, 0);

  const warnings: string[] = [];
  if (sMinus.every((v) => v === 0)) {
    warnings.push(
      'Tidak ada kriteria cost sehingga S- seluruhnya nol. Suku proporsional COPRAS tidak dapat dihitung dan Q disamakan dengan S+.'
    );
  }

  const q = sPlus.map((sp, i) => {
    const sm = sMinus[i];
    if (sMinusSum === 0 || sm === 0) return sp;
    const denominator = sm * sMinus.reduce((s, v) => s + (v === 0 ? 0 : sMinusMin / v), 0);
    if (denominator === 0) return sp;
    return sp + (sMinusMin * sMinusSum) / denominator;
  });

  const ranking = buildResult(
    'copras',
    'COPRAS',
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
      key: 'colSum',
      title: 'Jumlah Kolom untuk Normalisasi',
      formula: 'jumlah x_ij per kriteria',
      columns: ['Kriteria', 'Arah', 'Jumlah'],
      rows: criteria.map((c, j) => [c.code, c.direction, display(colSum[j], 6)]),
    },
    {
      key: 'normalized',
      title: 'Matriks Ternormalisasi (R)',
      formula: 'r_ij = x_ij / jumlah_i x_ij, sama untuk benefit dan cost',
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
      key: 'sums',
      title: 'Nilai S+ dan S-',
      formula: 'S+_i = jumlah benefit terbobot, S-_i = jumlah cost terbobot',
      columns: ['Alternatif', 'S+', 'S-'],
      rows: alternatives.map((alt, i) => [alt.code, display(sPlus[i], 6), display(sMinus[i], 6)]),
    },
    {
      key: 'aggregate',
      title: 'Nilai Relatif (Q)',
      formula: 'Q_i = S+_i + (S-_min * jumlah S-) / (S-_i * jumlah (S-_min / S-_i))',
      columns: ['Alternatif', 'S+', 'S-', 'Q_i'],
      rows: [
        ...alternatives.map((alt, i) => [
          alt.code,
          display(sPlus[i], 6),
          display(sMinus[i], 6),
          display(q[i], 6),
        ]),
        ['S- minimum', '', display(sMinusMin, 6), ''],
      ],
      note: 'Q lebih besar berarti lebih baik. Suku proporsional memberi keuntungan pada S- yang kecil.',
    },
    {
      key: 'ranking',
      title: 'Peringkat Akhir COPRAS',
      columns: ['Peringkat', 'Alternatif', 'Q_i', 'Seri'],
      rows: ranking.map((entry) => {
        const alt = alternatives.find((a) => a.id === entry.alternativeId)!;
        return [entry.rank, alt.code, display(entry.value, 6), entry.tied ? 'ya' : 'tidak'];
      }),
    },
  ];

  return buildResult(
    'copras',
    'COPRAS',
    p,
    steps,
    alternatives.map((alt, i) => ({ alternativeId: alt.id, value: q[i] })),
    warnings
  );
}

export const copras: DssMethod = {
  id: 'copras',
  description: 'Proporsi S+ dan S-, menyeimbangkan kriteria benefit dan cost secara terpisah.',
  label: 'COPRAS',
  inputMode: 'matrix',
  compute,
};