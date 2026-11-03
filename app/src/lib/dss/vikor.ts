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
 * VIKOR (VIseKriterijumska Optimizacija I Kompromisno Resenje).
 *
 * Berbeda dari SAW, WP, TOPSIS, WASPAS, MOORA, dan COPRAS: pada VIKOR nilai
 * Q yang lebih KECIL adalah alternatif yang lebih baik. Karena itu metode ini
 * memakai higherIsBetter = false, bukan menegasikan Q untuk mengakali
 * pengurutan menurun.
 *
 * Langkah:
 *   f+_j = max_i x_ij (benefit) atau min_i x_ij (cost)   solusi terbaik
 *   f-_j = min_i x_ij (benefit) atau max_i x_ij (cost)   solusi terburuk
 *   S_i  = jumlah_j ( w_j * (f+_j - x_ij) / (f+_j - f-_j) )
 *   R_i  = max_j   ( w_j * (f+_j - x_ij) / (f+_j - f-_j) )
 *   Q_i  = v * (S_i - S-) / (S+ - S-) + (1 - v) * (R_i - R-) / (R+ - R-)
 *
 * v adalah bobot strategi mayoritas, biasanya 0,5. S+ dan S- adalah nilai
 * S terkecil dan terbesar, demikian pula R.
 */
const DEFAULT_V = 0.5;

// Pembagi nol praktis. Nilai di bawah ini dianggap nol agar tidak menghasilkan
// Infinity saat seluruh alternatif memiliki nilai sama pada satu kriteria.
const ZERO = 1e-12;

function compute(input: DssInput): DssResult {
  const p = prepareInput(input);
  const { criteria, alternatives, values, weights } = p;

  const rawV = input.options?.v;
  let v = typeof rawV === 'number' && Number.isFinite(rawV) ? rawV : DEFAULT_V;
  const warnings: string[] = [];

  if (v < 0 || v > 1) {
    warnings.push('Parameter v ' + round6(v) + ' di luar rentang 0 sampai 1, dipakai nilai bawaan ' + DEFAULT_V + '.');
    v = DEFAULT_V;
  }

  const best = criteria.map((c, j) =>
    c.direction === 'benefit' ? Math.max(...column(values, j)) : Math.min(...column(values, j))
  );
  const worst = criteria.map((c, j) =>
    c.direction === 'benefit' ? Math.min(...column(values, j)) : Math.max(...column(values, j))
  );

  const normalizedGap = values.map((row) =>
    row.map((x, j) => {
      const range = best[j] - worst[j];
      if (Math.abs(range) < ZERO) return 0;
      return (best[j] - x) / range;
    })
  );

  const weightedGap = normalizedGap.map((row) => row.map((g, j) => weights[j] * g));

  const s = weightedGap.map((row) => row.reduce((sum, g) => sum + g, 0));
  const r = weightedGap.map((row) => Math.max(...row));

  const sPlus = Math.min(...s);
  const sMinus = Math.max(...s);
  const rPlus = Math.min(...r);
  const rMinus = Math.max(...r);

  // Penyebut memakai (terburuk - terbaik), sehingga nilainya positif.
  // Menulisnya terbalik membuat Q negatif dan membalik peringkat.
  const sRange = sMinus - sPlus;
  const rRange = rMinus - rPlus;

  if (Math.abs(sRange) < ZERO && Math.abs(rRange) < ZERO) {
    warnings.push(
      'Seluruh alternatif memiliki S dan R yang sama, sehingga Q tidak dapat membedakan peringkat.'
    );
  }

  const q = s.map((si, i) => {
    const termS = Math.abs(sRange) < ZERO ? 0 : (si - sPlus) / sRange;
    const termR = Math.abs(rRange) < ZERO ? 0 : (r[i] - rPlus) / rRange;
    return v * termS + (1 - v) * termR;
  });

  const ranking = buildResult(
    'vikor',
    'VIKOR',
    p,
    [],
    alternatives.map((alt, i) => ({ alternativeId: alt.id, value: q[i] })),
    [],
    false
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
      title: 'Solusi Terbaik dan Terburuk per Kriteria',
      formula: 'benefit: f+ = max, f- = min. cost: f+ = min, f- = max.',
      columns: ['Kriteria', 'Arah', 'f+ terbaik', 'f- terburuk'],
      rows: criteria.map((c, j) => [c.code, c.direction, best[j], worst[j]]),
      note: 'Berbeda dari TOPSIS, VIKOR memakai nilai asli, bukan matriks terbobot.',
    },
    {
      key: 'weights',
      title: 'Bobot Ternormalisasi',
      formula: 'w_j = bobot_j / total bobot',
      columns: ['Kriteria', 'Bobot'],
      rows: criteria.map((c, j) => [c.code, display(weights[j], 6)]),
    },
    {
      key: 'gap',
      title: 'Jarak Ternormalisasi',
      formula: '(f+_j - x_ij) / (f+_j - f-_j)',
      columns: ['Alternatif', ...criteria.map((c) => c.code)],
      rows: alternatives.map((alt, i) => [alt.code, ...normalizedGap[i].map((g) => display(g, 6))]),
      note: 'Nilai 0 berarti sama dengan solusi terbaik pada kriteria itu, nilai 1 berarti terburuk.',
    },
    {
      key: 'weightedGap',
      title: 'Jarak Terbobot',
      formula: 'w_j * (f+_j - x_ij) / (f+_j - f-_j)',
      columns: ['Alternatif', ...criteria.map((c) => c.code)],
      rows: alternatives.map((alt, i) => [alt.code, ...weightedGap[i].map((g) => display(g, 6))]),
    },
    {
      key: 'sr',
      title: 'Nilai S dan R',
      formula: 'S_i = jumlah jarak terbobot, R_i = jarak terbobot terbesar',
      columns: ['Alternatif', 'S_i', 'R_i'],
      rows: alternatives.map((alt, i) => [alt.code, display(s[i], 6), display(r[i], 6)]),
      note: 'S mengukur jarak total, R mengukur kriteria terburuk. Keduanya dipakai agar kompromi seimbang.',
    },
    {
      key: 'aggregate',
      title: 'Indeks Kompromi (Q)',
      formula: 'Q_i = v * (S_i - S+) / (S- - S+) + (1 - v) * (R_i - R+) / (R- - R+)',
      columns: ['Alternatif', 'S_i', 'R_i', 'Q_i'],
      rows: [
        ...alternatives.map((alt, i) => [
          alt.code,
          display(s[i], 6),
          display(r[i], 6),
          display(q[i], 6),
        ]),
        ['S+ / S-', display(sPlus, 6), display(sMinus, 6), ''],
        ['R+ / R-', display(rPlus, 6), display(rMinus, 6), ''],
        ['v', '', '', display(v, 4)],
      ],
      note: 'Pada VIKOR, Q terkecil adalah alternatif terbaik.',
    },
    {
      key: 'ranking',
      title: 'Peringkat Akhir VIKOR',
      columns: ['Peringkat', 'Alternatif', 'Q_i', 'Seri'],
      rows: ranking.map((entry) => {
        const alt = alternatives.find((a) => a.id === entry.alternativeId)!;
        return [entry.rank, alt.code, display(entry.value, 6), entry.tied ? 'ya' : 'tidak'];
      }),
      note: 'Peringkat 1 diberikan pada Q terkecil.',
    },
  ];

  return buildResult(
    'vikor',
    'VIKOR',
    p,
    steps,
    alternatives.map((alt, i) => ({ alternativeId: alt.id, value: q[i] })),
    warnings,
    false
  );
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

export const vikor: DssMethod = {
  id: 'vikor',
  description: 'Indeks kompromi dari jarak total dan jarak terburuk. Nilai terkecil adalah yang terbaik.',
  label: 'VIKOR',
  inputMode: 'matrix',
  // Q terkecil adalah alternatif terbaik. Tanda ini wajib ada di objek
  // metode, bukan hanya di hasil, karena registry dan halaman memakainya
  // untuk menentukan arah pengurutan sebelum menghitung.
  higherIsBetter: false,
  compute,
};