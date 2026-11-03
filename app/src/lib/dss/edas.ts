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
 * EDAS (Evaluation based on Distance from Average Solution).
 *
 * Rujukan: Keshavarz Ghorabaee, Zavadskas, Olfat, Turskis, "Multi-Criteria
 * Inventory Classification Using a New Method of Evaluation Based on Distance
 * from Average Solution (EDAS)", Informatica 26(3), 2015.
 *
 * Varian yang dipakai: rata-rata (average) sebagai solusi acuan, sesuai
 * artikel aslinya. Varian 2016 memakai simpangan baku; varian itu tidak
 * dipakai di sini dan dicatat sebagai perbedaan definisi.
 *
 * Langkah:
 *   AV_j = rata-rata x_ij
 *
 *   Untuk kriteria benefit:
 *     PDA_ij = max(0, x_ij - AV_j) / AV_j
 *     NDA_ij = max(0, AV_j - x_ij) / AV_j
 *
 *   Untuk kriteria cost, arahnya bertukar:
 *     PDA_ij = max(0, AV_j - x_ij) / AV_j
 *     NDA_ij = max(0, x_ij - AV_j) / AV_j
 *
 *   SP_i = jumlah_j ( w_j * PDA_ij )
 *   SN_i = jumlah_j ( w_j * NDA_ij )
 *
 *   NSP_i = SP_i / max_i(SP_i)
 *   NSN_i = 1 - SN_i / max_i(SN_i)
 *   AS_i  = (NSP_i + NSN_i) / 2
 *
 * Alternatif terbaik memiliki AS terbesar.
 */
function compute(input: DssInput): DssResult {
  const p = prepareInput(input);
  const { criteria, alternatives, values, weights } = p;

  const av = criteria.map((_, j) => {
    const col = column(values, j);
    return col.reduce((s, v) => s + v, 0) / col.length;
  });

  const warnings: string[] = [];
  const zeroAverage = criteria.filter((_, j) => Math.abs(av[j]) < 1e-12);
  if (zeroAverage.length > 0) {
    warnings.push(
      'Rata-rata kriteria ' +
        zeroAverage.map((c) => c.code).join(', ') +
        ' bernilai nol, sehingga jarak ternormalisasi pada kriteria itu dianggap nol.'
    );
  }

  const pda = values.map((row) =>
    row.map((x, j) => {
      if (Math.abs(av[j]) < 1e-12) return 0;
      const diff = criteria[j].direction === 'benefit' ? x - av[j] : av[j] - x;
      return Math.max(0, diff) / av[j];
    })
  );

  const nda = values.map((row) =>
    row.map((x, j) => {
      if (Math.abs(av[j]) < 1e-12) return 0;
      const diff = criteria[j].direction === 'benefit' ? av[j] - x : x - av[j];
      return Math.max(0, diff) / av[j];
    })
  );

  const sp = pda.map((row) => row.reduce((s, v, j) => s + weights[j] * v, 0));
  const sn = nda.map((row) => row.reduce((s, v, j) => s + weights[j] * v, 0));

  const maxSp = Math.max(...sp);
  const maxSn = Math.max(...sn);

  if (maxSp < 1e-12) {
    warnings.push('Seluruh alternatif memiliki SP nol, sehingga NSP tidak dapat membedakan peringkat.');
  }
  if (maxSn < 1e-12) {
    warnings.push('Seluruh alternatif memiliki SN nol, sehingga NSN tidak dapat membedakan peringkat.');
  }

  const nsp = sp.map((v) => (maxSp < 1e-12 ? 0 : v / maxSp));
  const nsn = sn.map((v) => (maxSn < 1e-12 ? 1 : 1 - v / maxSn));
  const as = nsp.map((v, i) => (v + nsn[i]) / 2);

  const ranking = buildResult(
    'edas',
    'EDAS',
    p,
    [],
    alternatives.map((alt, i) => ({ alternativeId: alt.id, value: as[i] }))
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
      key: 'average',
      title: 'Solusi Acuan (AV)',
      formula: 'AV_j = rata-rata_i x_ij',
      columns: ['Kriteria', 'Arah', 'AV'],
      rows: criteria.map((c, j) => [c.code, c.direction, display(av[j], 6)]),
      note: 'EDAS memakai rata-rata, bukan nilai terbaik seperti TOPSIS atau VIKOR.',
    },
    {
      key: 'pda',
      title: 'Positive Distance from Average (PDA)',
      formula: 'benefit: max(0, x - AV) / AV. cost: max(0, AV - x) / AV.',
      columns: ['Alternatif', ...criteria.map((c) => c.code)],
      rows: alternatives.map((alt, i) => [alt.code, ...pda[i].map((v) => display(v, 6))]),
    },
    {
      key: 'nda',
      title: 'Negative Distance from Average (NDA)',
      formula: 'benefit: max(0, AV - x) / AV. cost: max(0, x - AV) / AV.',
      columns: ['Alternatif', ...criteria.map((c) => c.code)],
      rows: alternatives.map((alt, i) => [alt.code, ...nda[i].map((v) => display(v, 6))]),
    },
    {
      key: 'sp_sn',
      title: 'Nilai SP dan SN',
      formula: 'SP_i = jumlah w_j * PDA_ij, SN_i = jumlah w_j * NDA_ij',
      columns: ['Alternatif', 'SP', 'SN'],
      rows: alternatives.map((alt, i) => [alt.code, display(sp[i], 6), display(sn[i], 6)]),
    },
    {
      key: 'normalized',
      title: 'Normalisasi SP dan SN',
      formula: 'NSP_i = SP_i / max(SP), NSN_i = 1 - SN_i / max(SN)',
      columns: ['Alternatif', 'SP', 'SN', 'NSP', 'NSN'],
      rows: [
        ...alternatives.map((alt, i) => [
          alt.code,
          display(sp[i], 6),
          display(sn[i], 6),
          display(nsp[i], 6),
          display(nsn[i], 6),
        ]),
        ['Maksimum', display(maxSp, 6), display(maxSn, 6), '', ''],
      ],
    },
    {
      key: 'aggregate',
      title: 'Skor Penilaian (AS)',
      formula: 'AS_i = (NSP_i + NSN_i) / 2',
      columns: ['Alternatif', 'NSP', 'NSN', 'AS'],
      rows: alternatives.map((alt, i) => [
        alt.code,
        display(nsp[i], 6),
        display(nsn[i], 6),
        display(as[i], 6),
      ]),
      note: 'AS lebih besar berarti lebih baik.',
    },
    {
      key: 'ranking',
      title: 'Peringkat Akhir EDAS',
      columns: ['Peringkat', 'Alternatif', 'AS', 'Seri'],
      rows: ranking.map((entry) => {
        const alt = alternatives.find((a) => a.id === entry.alternativeId)!;
        return [entry.rank, alt.code, display(entry.value, 6), entry.tied ? 'ya' : 'tidak'];
      }),
    },
  ];

  return buildResult(
    'edas',
    'EDAS',
    p,
    steps,
    alternatives.map((alt, i) => ({ alternativeId: alt.id, value: as[i] })),
    warnings
  );
}

export const edas: DssMethod = {
  id: 'edas',
  label: 'EDAS',
  inputMode: 'matrix',
  description: 'Jarak positif dan negatif terhadap rata-rata, lalu skor penilaian gabungan.',
  compute,
};