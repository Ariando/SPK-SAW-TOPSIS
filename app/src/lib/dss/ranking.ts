/**
 * Analisis kesepakatan antar metode perangkingan.
 *
 * Modul ini murni: tidak menyentuh database dan tidak bergantung pada Astro,
 * sehingga bisa diuji langsung. Semua masukan berupa peringkat dense seperti
 * yang dihasilkan engine DSS (seri memakai nomor yang sama, misalnya 1,1,3).
 */

export class RankingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RankingError';
  }
}

export interface RankingEntry {
  code: string;
  title: string;
  rank: number;
}

export interface MethodRanking {
  methodId: string;
  label: string;
  entries: RankingEntry[];
}

export interface AlternativeRef {
  code: string;
  title: string;
}

export interface BordaRow {
  code: string;
  title: string;
  points: number;
  rank: number;
  tied: boolean;
}

export interface SpearmanPair {
  a: string;
  b: string;
  rho: number;
}

export interface KendallResult {
  /** Koefisien kesepakatan Kendall, atau null bila tidak terdefinisi. */
  w: number | null;
  /** Jumlah kuadrat simpangan total peringkat. */
  s: number;
  /** Total koreksi seri seluruh penilai. */
  tieCorrection: number;
  /** Statistik uji khi kuadrat, m(n-1)W. */
  chiSquare: number | null;
  /** Derajat kebebasan, n-1. */
  df: number;
  /** Nilai p satu sisi dari sebaran khi kuadrat. */
  pValue: number | null;
  /** Alasan W tidak terdefinisi, bila ada. */
  reason: string | null;
}

export interface AgreementAnalysis {
  alternatives: AlternativeRef[];
  methods: { methodId: string; label: string; averageRanks: number[] }[];
  borda: BordaRow[];
  spearman: { pairs: SpearmanPair[]; average: number | null };
  kendall: KendallResult;
  warnings: string[];
}

const EPSILON = 1e-12;

/* ------------------------------------------------------------------ */
/* Fungsi sebaran khi kuadrat                                          */
/* ------------------------------------------------------------------ */

const LANCZOS = [
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
];

function gammaLn(x: number): number {
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - gammaLn(1 - x);
  }
  const z = x - 1;
  let a = 0.99999999999980993;
  for (let i = 0; i < LANCZOS.length; i++) {
    a += LANCZOS[i] / (z + i + 1);
  }
  const t = z + LANCZOS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Fungsi gamma tak lengkap teratur, cabang deret. Menghasilkan P(a,x). */
function gammaSeries(a: number, x: number): number {
  let ap = a;
  let sum = 1 / a;
  let del = sum;
  for (let n = 1; n <= 1000; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - gammaLn(a));
}

/** Fungsi gamma tak lengkap teratur, cabang pecahan lanjut. Menghasilkan Q(a,x). */
function gammaContinuedFraction(a: number, x: number): number {
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - gammaLn(a)) * h;
}

/**
 * Peluang ekor atas sebaran khi kuadrat, P(X >= x) untuk df derajat kebebasan.
 * Dipakai untuk menilai kebermaknaan koefisien Kendall W.
 */
export function chiSquareUpperTail(x: number, df: number): number {
  if (!Number.isFinite(df) || df <= 0) {
    throw new RankingError('Derajat kebebasan harus lebih dari nol.');
  }
  if (!Number.isFinite(x) || x <= 0) return 1;

  const a = df / 2;
  const half = x / 2;
  const value = half < a + 1 ? 1 - gammaSeries(a, half) : gammaContinuedFraction(a, half);
  return Math.min(1, Math.max(0, value));
}

/* ------------------------------------------------------------------ */
/* Peringkat                                                           */
/* ------------------------------------------------------------------ */

/**
 * Mengubah peringkat dense menjadi peringkat rata rata.
 *
 * Contoh: dense 1,1,3 untuk tiga alternatif menempati posisi 1 dan 2 untuk
 * yang seri, keduanya memperoleh 1,5, dan yang ketiga tetap 3. Konversi ini
 * wajib sebelum menghitung Kendall W dan Spearman, karena memakai peringkat
 * dense langsung menghasilkan koefisien di atas 1 pada data berseri.
 */
export function toAverageRanks(denseRanks: number[]): number[] {
  const grouped = new Map<number, number[]>();
  denseRanks.forEach((rank, index) => {
    if (!grouped.has(rank)) grouped.set(rank, []);
    grouped.get(rank)!.push(index);
  });

  const ordered = [...grouped.keys()].sort((a, b) => a - b);
  const result = new Array<number>(denseRanks.length);
  let position = 0;

  for (const rank of ordered) {
    const indexes = grouped.get(rank)!;
    const start = position + 1;
    const end = position + indexes.length;
    const average = (start + end) / 2;
    for (const index of indexes) result[index] = average;
    position = end;
  }

  return result;
}

function assertValidRankings(rankings: MethodRanking[]): void {
  if (rankings.length === 0) throw new RankingError('Minimal satu metode diperlukan.');

  let reference: string[] | null = null;

  for (const ranking of rankings) {
    const { methodId, entries } = ranking;
    if (entries.length === 0) {
      throw new RankingError('Metode ' + methodId + ' tidak memiliki alternatif.');
    }

    const codes = entries.map((e) => e.code);
    if (new Set(codes).size !== codes.length) {
      throw new RankingError('Metode ' + methodId + ' memiliki kode alternatif ganda.');
    }

    for (const entry of entries) {
      if (!Number.isInteger(entry.rank) || entry.rank < 1) {
        throw new RankingError(
          'Peringkat ' + entry.code + ' pada ' + methodId + ' harus bilangan bulat positif.'
        );
      }
    }

    const distinct = [...new Set(entries.map((e) => e.rank))].sort((a, b) => a - b);
    const expected = Array.from({ length: distinct.length }, (_, i) => i + 1);
    if (distinct.join(',') !== expected.join(',')) {
      throw new RankingError(
        'Peringkat pada ' + methodId + ' harus berurutan tanpa lompatan, ditemukan ' + distinct.join(',')
      );
    }

    const sorted = [...codes].sort();
    if (reference === null) {
      reference = sorted;
    } else if (reference.join('|') !== sorted.join('|')) {
      throw new RankingError('Himpunan alternatif berbeda antara ' + methodId + ' dan metode lain.');
    }
  }
}

function sortedAlternatives(rankings: MethodRanking[]): AlternativeRef[] {
  const seen = new Map<string, string>();
  for (const ranking of rankings) {
    for (const entry of ranking.entries) seen.set(entry.code, entry.title);
  }
  return [...seen.entries()]
    .map(([code, title]) => ({ code, title }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

function alignedAverageRanks(ranking: MethodRanking, order: string[]): number[] {
  const indexByCode = new Map(ranking.entries.map((e, i) => [e.code, i]));
  const dense = order.map((code) => {
    const index = indexByCode.get(code);
    if (index === undefined) throw new RankingError('Alternatif ' + code + ' tidak ada pada ' + ranking.methodId);
    return ranking.entries[index].rank;
  });
  return toAverageRanks(dense);
}

function tieCorrectionOf(ranking: MethodRanking): number {
  const counts = new Map<number, number>();
  for (const entry of ranking.entries) {
    counts.set(entry.rank, (counts.get(entry.rank) ?? 0) + 1);
  }
  let correction = 0;
  for (const size of counts.values()) {
    if (size > 1) correction += size ** 3 - size;
  }
  return correction;
}

/**
 * Poin Borda. Alternatif dengan n alternatif memperoleh n + 1 dikurangi
 * peringkat rata ratanya, sehingga peringkat terbaik memperoleh n dan
 * peringkat terburuk memperoleh 1, dan seri berbagi poin di antara posisi
 * yang ditempatinya.
 */
export function bordaPoints(averageRanks: number[], n: number): number[] {
  return averageRanks.map((rank) => n + 1 - rank);
}

function denseRanksOf(totals: number[]): number[] {
  const sorted = [...new Set(totals.map((v) => Number(v.toFixed(9))))].sort((a, b) => b - a);
  return totals.map((v) => sorted.indexOf(Number(v.toFixed(9))) + 1);
}

export function pearsonCorrelation(a: number[], b: number[]): number | null {
  const n = a.length;
  if (n !== b.length) throw new RankingError('Panjang kedua deret harus sama.');
  if (n < 2) return null;

  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;

  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    covariance += da * db;
    varianceA += da * da;
    varianceB += db * db;
  }

  if (varianceA < EPSILON || varianceB < EPSILON) return null;
  const rho = covariance / Math.sqrt(varianceA * varianceB);
  return Math.min(1, Math.max(-1, rho));
}

/**
 * Korelasi peringkat Spearman. Memakai korelasi Pearson atas peringkat rata
 * rata, yang tetap sah ketika ada seri. Pada data tanpa seri, hasilnya identik
 * dengan rumus 1 - 6 sum(d^2) / (n(n^2 - 1)).
 */
export function spearmanCorrelation(rankA: number[], rankB: number[]): number | null {
  return pearsonCorrelation(rankA, rankB);
}

export function analyseAgreement(rankings: MethodRanking[]): AgreementAnalysis {
  assertValidRankings(rankings);

  const alternatives = sortedAlternatives(rankings);
  const order = alternatives.map((a) => a.code);
  const n = alternatives.length;
  const m = rankings.length;
  const warnings: string[] = [];

  const methods = rankings.map((ranking) => ({
    methodId: ranking.methodId,
    label: ranking.label,
    averageRanks: alignedAverageRanks(ranking, order),
  }));

  /* ---------------- Borda ---------------- */
  const totals = order.map((_, i) =>
    methods.reduce((sum, method) => sum + bordaPoints(method.averageRanks, n)[i], 0)
  );
  const bordaRanks = denseRanksOf(totals);
  const borda: BordaRow[] = order.map((code, i) => {
    const tiedCount = bordaRanks.filter((r) => r === bordaRanks[i]).length;
    return {
      code,
      title: alternatives[i].title,
      points: Number(totals[i].toFixed(6)),
      rank: bordaRanks[i],
      tied: tiedCount > 1,
    };
  });
  borda.sort((a, b) => a.rank - b.rank || a.code.localeCompare(b.code));

  if (borda.some((row) => row.tied)) {
    warnings.push('Ada alternatif dengan total poin Borda yang sama, peringkat gabungan memakai dense ranking.');
  }

  /* ---------------- Spearman ---------------- */
  const pairs: SpearmanPair[] = [];
  for (let i = 0; i < methods.length; i++) {
    for (let j = i + 1; j < methods.length; j++) {
      const rho = spearmanCorrelation(methods[i].averageRanks, methods[j].averageRanks);
      if (rho === null) {
        warnings.push(
          'Korelasi ' + methods[i].label + ' dan ' + methods[j].label + ' tidak terdefinisi karena sebaran peringkat seragam.'
        );
        continue;
      }
      pairs.push({ a: methods[i].methodId, b: methods[j].methodId, rho });
    }
  }
  const average = pairs.length === 0 ? null : pairs.reduce((s, p) => s + p.rho, 0) / pairs.length;

  /* ---------------- Kendall W ---------------- */
  const tieCorrection = rankings.reduce((sum, ranking) => sum + tieCorrectionOf(ranking), 0);
  const df = Math.max(0, n - 1);

  let kendall: KendallResult;

  if (m < 2) {
    kendall = {
      w: null,
      s: 0,
      tieCorrection,
      chiSquare: null,
      df,
      pValue: null,
      reason: 'Butuh minimal dua metode untuk mengukur kesepakatan.',
    };
  } else if (n < 2) {
    kendall = {
      w: null,
      s: 0,
      tieCorrection,
      chiSquare: null,
      df,
      pValue: null,
      reason: 'Butuh minimal dua alternatif untuk mengukur kesepakatan.',
    };
  } else {
    const meanTotal = (m * (n + 1)) / 2;
    const totalsByAlternative = order.map((_, i) =>
      methods.reduce((sum, method) => sum + method.averageRanks[i], 0)
    );
    const s = totalsByAlternative.reduce((sum, total) => sum + (total - meanTotal) ** 2, 0);
    const denominator = m * m * (n ** 3 - n) - m * tieCorrection;

    if (denominator <= EPSILON) {
      kendall = {
        w: null,
        s,
        tieCorrection,
        chiSquare: null,
        df,
        pValue: null,
        reason: 'Seluruh alternatif seri sehingga pembagi Kendall bernilai nol.',
      };
    } else {
      const w = Math.min(1, Math.max(0, (12 * s) / denominator));
      const chiSquare = m * (n - 1) * w;
      kendall = {
        w,
        s,
        tieCorrection,
        chiSquare,
        df,
        pValue: chiSquareUpperTail(chiSquare, df),
        reason: null,
      };
    }
  }

  if (tieCorrection > 0) {
    warnings.push('Ada nilai seri, koreksi seri diterapkan pada Kendall W dan Spearman memakai peringkat rata rata.');
  }
  if (kendall.w !== null && n < 7) {
    warnings.push(
      'Dengan ' + n + ' alternatif, uji khi kuadrat untuk Kendall W bersifat perkiraan. Sebutkan batas ini saat melaporkan nilai p.'
    );
  }

  return {
    alternatives,
    methods,
    borda,
    spearman: { pairs, average },
    kendall,
    warnings,
  };
}