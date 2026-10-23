export type Direction = 'benefit' | 'cost';

export interface Criterion {
  id: number;
  code: string;
  name: string;
  weight: number;
  direction: Direction;
}

export interface Alternative {
  id: number;
  code: string;
  title: string;
}

export interface DssInput {
  criteria: Criterion[];
  alternatives: Alternative[];
  values: number[][];
  options?: Record<string, unknown>;
}

export interface TraceStep {
  key: string;
  title: string;
  formula?: string;
  columns: string[];
  rows: (string | number)[][];
  note?: string;
}

export interface RankedScore {
  alternativeId: number;
  rank: number;
  value: number;
  tied: boolean;
}

export interface DssResult {
  method: string;
  label: string;
  steps: TraceStep[];
  scores: { alternativeId: number; value: number }[];
  ranking: RankedScore[];
  warnings: string[];
}

export interface DssMethod {
  id: string;
  label: string;
  inputMode: 'matrix' | 'pairwise';
  compute(input: DssInput): DssResult;
}

export class DssValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues.join('; '));
    this.name = 'DssValidationError';
    this.issues = issues;
  }
}

export const EPSILON = 1e-9;

export interface PreparedInput {
  criteria: Criterion[];
  alternatives: Alternative[];
  values: number[][];
  weights: number[];
  rawWeightSum: number;
  weightNormalized: boolean;
}

export function prepareInput(input: DssInput): PreparedInput {
  const issues: string[] = [];
  const { criteria, alternatives, values } = input;

  if (criteria.length === 0) issues.push('Belum ada kriteria.');
  if (alternatives.length === 0) issues.push('Belum ada alternatif.');

  criteria.forEach((c) => {
    if (!Number.isFinite(c.weight)) issues.push(`Bobot ${c.code} bukan angka.`);
    else if (c.weight < 0) issues.push(`Bobot ${c.code} negatif.`);
  });

  const rawWeightSum = criteria.reduce((s, c) => s + (Number.isFinite(c.weight) ? c.weight : 0), 0);
  if (criteria.length > 0 && rawWeightSum <= 0) issues.push('Total bobot harus lebih dari nol.');

  if (values.length !== alternatives.length) {
    issues.push('Jumlah baris matriks nilai tidak sama dengan jumlah alternatif.');
  }

  alternatives.forEach((alt, i) => {
    const row = values[i];
    if (!row || row.length !== criteria.length) {
      issues.push(`Baris nilai ${alt.code} tidak lengkap.`);
      return;
    }
    criteria.forEach((c, j) => {
      const v = row[j];
      if (v === null || v === undefined || Number.isNaN(v)) {
        issues.push(`Nilai ${alt.code} pada ${c.code} kosong.`);
        return;
      }
      if (!Number.isFinite(v)) issues.push(`Nilai ${alt.code} pada ${c.code} bukan angka berhingga.`);
      if (c.direction === 'cost' && v === 0) {
        issues.push(`Nilai ${alt.code} pada ${c.code} nol, tidak boleh untuk kriteria cost.`);
      }
    });
  });

  if (issues.length > 0) throw new DssValidationError(issues);

  const weights = rawWeightSum > 0 ? criteria.map((c) => c.weight / rawWeightSum) : [];
  return {
    criteria,
    alternatives,
    values,
    weights,
    rawWeightSum,
    weightNormalized: Math.abs(rawWeightSum - 1) > 1e-6,
  };
}

export function weightWarning(prepared: PreparedInput): string | null {
  if (!prepared.weightNormalized) return null;
  return `Total bobot ${round(prepared.rawWeightSum, 6)} bukan 1, bobot dinormalisasi otomatis untuk perhitungan.`;
}

export function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function display(value: number, digits = 4): string {
  return round(value, digits).toFixed(digits);
}

export function column(values: number[][], j: number): number[] {
  return values.map((row) => row[j]);
}

export function rankScores(
  scores: { alternativeId: number; value: number }[]
): RankedScore[] {
  const sortedValues = [...new Set(scores.map((s) => round(s.value, 9)))].sort((a, b) => b - a);
  return scores.map((s) => {
    const value = round(s.value, 9);
    const tied = scores.filter((o) => Math.abs(round(o.value, 9) - value) < EPSILON).length > 1;
    return {
      alternativeId: s.alternativeId,
      rank: sortedValues.indexOf(value) + 1,
      value: s.value,
      tied,
    };
  });
}

export function buildResult(
  method: string,
  label: string,
  prepared: PreparedInput,
  steps: TraceStep[],
  rawScores: { alternativeId: number; value: number }[],
  warnings: string[] = []
): DssResult {
  const warning = weightWarning(prepared);
  return {
    method,
    label,
    steps,
    scores: rawScores,
    ranking: rankScores(rawScores),
    warnings: warning ? [warning, ...warnings] : warnings,
  };
}

export function sortedRanking(result: DssResult): RankedScore[] {
  return [...result.ranking].sort((a, b) => a.rank - b.rank || a.alternativeId - b.alternativeId);
}