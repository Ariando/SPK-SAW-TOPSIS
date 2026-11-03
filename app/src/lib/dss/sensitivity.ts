import { getMethod } from './registry';
import type { Criterion, Direction, DssInput, RankedScore } from './types';

/**
 * Analisis sensitivitas bobot.
 *
 * Tujuan: menjawab pertanyaan "apakah peringkat berubah bila bobot digeser".
 * Ini pertanyaan yang hampir selalu muncul saat sidang, dan jawabannya tidak
 * boleh berupa dugaan.
 *
 * Metode: perturbasi satu kriteria pada satu waktu (ceteris paribus), lalu
 * bobot dinormalkan ulang sehingga totalnya tetap 1. Pendekatan ini dipilih
 * karena mudah dijelaskan dan hasilnya dapat direproduksi. Perturbasi
 * gabungan tidak dilakukan karena jumlah kombinasinya meledak dan
 * tafsirannya jauh lebih sulit.
 */

export class SensitivityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SensitivityError';
  }
}

export interface SensitivityOptions {
  /** Metode yang dipakai, misal 'saw'. */
  methodId: string;
  /** Besar geseran relatif, misal 0,1 berarti plus minus 10 persen. */
  delta: number;
  /** Sertakan skenario bobot merata sebagai pembanding. */
  includeEqualWeights?: boolean;
}

export interface RankRow {
  code: string;
  rank: number;
  value: number;
  /** Selisih peringkat dibanding dasar. Negatif berarti naik. */
  shift: number;
  /** Peringkat berubah dibanding dasar. */
  changed: boolean;
}

export interface Perturbation {
  /** Kode kriteria yang digeser. */
  criterionCode: string;
  /** Posisi kriteria pada daftar, dipakai untuk membaca bobotnya. */
  criterionIndex: number;
  direction: 'increase' | 'decrease';
  /** Faktor pengali yang dipakai, misal 1,1 atau 0,9. */
  factor: number;
  /** Bobot kriteria ini setelah normalisasi, sesudah digeser. */
  criterionWeight: number;
  weights: number[];
  rows: RankRow[];
  /** Kode alternatif yang peringkatnya berubah, urut kode. */
  changedCodes: string[];
  /** Peringkat 1 berganti. */
  topChanged: boolean;
  /** Korelasi peringkat terhadap dasar, -1 sampai 1. */
  rankCorrelation: number | null;
}

export interface EqualWeightResult {
  weights: number[];
  rows: RankRow[];
  changedCodes: string[];
  topChanged: boolean;
  rankCorrelation: number | null;
}

export interface SensitivityResult {
  methodId: string;
  methodLabel: string;
  delta: number;
  baseline: { weights: number[]; rows: RankRow[] };
  perturbations: Perturbation[];
  equalWeights: EqualWeightResult | null;
  /** Ringkasan yang siap dikutip di laporan. */
  summary: {
    totalPerturbations: number;
    withRankChange: number;
    withTopChange: number;
    /** Persentase perturbasi yang tidak mengubah peringkat 1. */
    topStability: number;
    /** Kode alternatif yang paling sering berubah peringkat. */
    mostSensitiveAlternative: string | null;
    /** Kode kriteria yang geserannya paling sering mengubah peringkat. */
    mostInfluentialCriterion: string | null;
  };
  warnings: string[];
}

const EPS = 1e-12;

function normalize(weights: number[]): number[] {
  const total = weights.reduce((s, v) => s + v, 0);
  if (total <= EPS) throw new SensitivityError('Total bobot harus lebih dari nol.');
  return weights.map((w) => w / total);
}

function rowsFromRanking(ranking: RankedScore[], alternatives: { id: number; code: string }[], values: Map<number, number>): RankRow[] {
  return alternatives.map((alt) => {
    const entry = ranking.find((r) => r.alternativeId === alt.id);
    return {
      code: alt.code,
      rank: entry?.rank ?? 0,
      value: values.get(alt.id) ?? 0,
      shift: 0,
      changed: false,
    };
  });
}

function applyBaseline(baseline: RankRow[], current: RankRow[]): RankRow[] {
  const baseByCode = new Map(baseline.map((r) => [r.code, r]));
  return current.map((row) => {
    const base = baseByCode.get(row.code);
    if (!base) return row;
    const shift = row.rank - base.rank;
    return { ...row, shift, changed: shift !== 0 };
  });
}

function correlation(a: number[], b: number[]): number | null {
  const n = a.length;
  if (n < 2) return null;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let covariance = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    covariance += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA < EPS || varB < EPS) return null;
  return Math.max(-1, Math.min(1, covariance / Math.sqrt(varA * varB)));
}

function topCode(rows: RankRow[]): string | null {
  const best = [...rows].sort((a, b) => a.rank - b.rank)[0];
  return best ? best.code : null;
}

/**
 * Menjalankan satu perhitungan tanpa menormalkan bobot sendiri.
 *
 * Engine sudah menormalkan bobot di dalam `prepareInput`, jadi bobot hasil
 * perturbasi tetap diproses dengan aturan yang sama seperti perhitungan biasa.
 */
function run(methodId: string, criteria: Criterion[], alternatives: { id: number; code: string; title: string }[], values: number[][], weights: number[]) {
  const method = getMethod(methodId);
  if (!method) throw new SensitivityError('Metode tidak dikenal: ' + methodId);

  const input: DssInput = {
    criteria: criteria.map((c, i) => ({ ...c, weight: weights[i] })),
    alternatives,
    values,
  };

  const result = method.compute(input);
  const valueByAlt = new Map(result.scores.map((s) => [s.alternativeId, s.value]));
  return {
    result,
    rows: rowsFromRanking(result.ranking, alternatives, valueByAlt),
  };
}

export function analyseSensitivity(
  input: DssInput,
  options: SensitivityOptions
): SensitivityResult {
  const { methodId, delta } = options;

  if (!Number.isFinite(delta) || delta <= 0 || delta >= 1) {
    throw new SensitivityError('Delta harus lebih dari 0 dan kurang dari 1.');
  }
  if (input.criteria.length === 0) {
    throw new SensitivityError('Belum ada kriteria.');
  }
  if (input.alternatives.length < 2) {
    throw new SensitivityError('Perlu minimal dua alternatif untuk menganalisis peringkat.');
  }

  const method = getMethod(methodId);
  if (!method) throw new SensitivityError('Metode tidak dikenal: ' + methodId);

  const criteria = input.criteria;
  const alternatives = input.alternatives;
  const values = input.values;

  const warnings: string[] = [];

  // Bobot dasar dinormalkan agar hasil analisis tidak bergantung pada skala
  // bobot yang dipakai pengguna.
  const rawWeights = criteria.map((c) => c.weight);
  const rawSum = rawWeights.reduce((s, v) => s + v, 0);
  if (rawSum <= EPS) throw new SensitivityError('Total bobot harus lebih dari nol.');
  if (Math.abs(rawSum - 1) > 1e-6) {
    warnings.push(
      'Total bobot ' + rawSum.toFixed(6) + ' bukan 1. Analisis memakai bobot ternormalisasi.'
    );
  }
  const baseWeights = normalize(rawWeights);

  const baselineRun = run(methodId, criteria, alternatives, values, baseWeights);
  const baseline = { weights: baseWeights, rows: baselineRun.rows };
  const baselineTop = topCode(baseline.rows);

  const perturbations: Perturbation[] = [];

  criteria.forEach((criterion, index) => {
    for (const direction of ['increase', 'decrease'] as const) {
      const factor = direction === 'increase' ? 1 + delta : 1 - delta;

      const perturbedRaw = baseWeights.slice();
      perturbedRaw[index] = baseWeights[index] * factor;

      if (perturbedRaw[index] <= EPS) {
        warnings.push(
          'Bobot ' + criterion.code + ' menjadi nol pada penurunan ' +
            (delta * 100).toFixed(0) + ' persen, perturbasi dilewati.'
        );
        continue;
      }

      const weights = normalize(perturbedRaw);
      const current = run(methodId, criteria, alternatives, values, weights);
      const rows = applyBaseline(baseline.rows, current.rows);

      perturbations.push({
        criterionCode: criterion.code,
        criterionIndex: index,
        direction,
        factor,
        criterionWeight: weights[index],
        weights,
        rows,
        changedCodes: rows.filter((r) => r.changed).map((r) => r.code).sort(),
        topChanged: topCode(rows) !== baselineTop,
        rankCorrelation: correlation(
          baseline.rows.map((r) => r.rank),
          rows.map((r) => r.rank)
        ),
      });
    }
  });

  /* ---------- Bobot merata sebagai pembanding ---------- */
  let equalWeights: EqualWeightResult | null = null;
  if (options.includeEqualWeights) {
    const weights = criteria.map(() => 1 / criteria.length);
    const current = run(methodId, criteria, alternatives, values, weights);
    const rows = applyBaseline(baseline.rows, current.rows);
    equalWeights = {
      weights,
      rows,
      changedCodes: rows.filter((r) => r.changed).map((r) => r.code).sort(),
      topChanged: topCode(rows) !== baselineTop,
      rankCorrelation: correlation(
        baseline.rows.map((r) => r.rank),
        rows.map((r) => r.rank)
      ),
    };
  }

  /* ---------- Ringkasan ---------- */
  const withRankChange = perturbations.filter((p) => p.changedCodes.length > 0);
  const withTopChange = perturbations.filter((p) => p.topChanged);

  const altCounter = new Map<string, number>();
  for (const p of perturbations) {
    for (const code of p.changedCodes) {
      altCounter.set(code, (altCounter.get(code) ?? 0) + 1);
    }
  }
  const mostSensitiveAlternative =
    [...altCounter.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;

  const criterionCounter = new Map<string, number>();
  for (const p of withRankChange) {
    criterionCounter.set(p.criterionCode, (criterionCounter.get(p.criterionCode) ?? 0) + 1);
  }
  const mostInfluentialCriterion =
    [...criterionCounter.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;

  if (perturbations.length > 0) {
    const changes = withRankChange.length;
    if (changes === 0) {
      warnings.push(
        'Tidak ada pertubahan peringkat pada seluruh perturbasi. Peringkat stabil pada rentang ' +
          (delta * 100).toFixed(0) + ' persen.'
      );
    } else if (withTopChange.length > 0) {
      warnings.push(
        withTopChange.length + ' perturbasi mengganti peringkat 1. Kesimpulan tidak boleh bergantung pada satu pembobotan saja.'
      );
    }
  }

  return {
    methodId: methodId,
    methodLabel: method.label,
    delta,
    baseline,
    perturbations,
    equalWeights,
    summary: {
      totalPerturbations: perturbations.length,
      withRankChange: withRankChange.length,
      withTopChange: withTopChange.length,
      topStability:
        perturbations.length === 0 ? 1 : (perturbations.length - withTopChange.length) / perturbations.length,
      mostSensitiveAlternative,
      mostInfluentialCriterion,
    },
    warnings,
  };
}

/**
 * Matriks perubahan peringkat untuk ditampilkan sebagai heatmap.
 * Baris = kriteria, kolom = alternatif, isi = jumlah perturbasi yang
 * mengubah peringkat alternatif itu ketika kriteria tersebut digeser.
 */
export function shiftMatrix(result: SensitivityResult): {
  criteria: string[];
  alternatives: string[];
  counts: number[][];
  max: number;
} {
  const criteriaCodes = [...new Set(result.perturbations.map((p) => p.criterionCode))];
  const alternatives = result.baseline.rows.map((r) => r.code).sort();

  const counts = criteriaCodes.map((code) =>
    alternatives.map((altCode) => {
      return result.perturbations.filter(
        (p) => p.criterionCode === code && p.changedCodes.includes(altCode)
      ).length;
    })
  );

  const max = Math.max(0, ...counts.flat());
  return { criteria: criteriaCodes, alternatives, counts, max };
}

/**
 * Ringkasan arah: untuk setiap kriteria, apakah kenaikan bobotnya
 * menguntungkan alternatif tertentu secara konsisten.
 */
export function directionOfInfluence(
  result: SensitivityResult
): { criterionCode: string; code: string; direction: 'naik' | 'turun' }[] {
  const out: { criterionCode: string; code: string; direction: 'naik' | 'turun' }[] = [];
  for (const p of result.perturbations) {
    for (const row of p.rows) {
      if (!row.changed) continue;
      out.push({
        criterionCode: p.criterionCode,
        code: row.code,
        direction: row.shift < 0 ? 'naik' : 'turun',
      });
    }
  }
  return out;
}

export type { Direction };