import { asc, eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from '../db/schema';
import { alternatives, criteria, scores, weightScenarios } from '../db/schema';
import type { Criterion, Alternative, DssInput } from './dss/types';
import { hashCriteria } from './ahp/scenario';

type AnyDb = MySql2Database<typeof schema>;

export interface WeightSourceInfo {
  source: 'criteria' | 'scenario';
  scenarioId: number | null;
  scenarioName: string | null;
  scenarioCr: number | null;
}

export interface MatrixBundle {
  input: DssInput;
  missing: { alternativeCode: string; criterionCode: string }[];
  rawWeights: number[];
  weightSum: number;
  weightSource: WeightSourceInfo;
}

export const MANUAL_WEIGHT_SOURCE: WeightSourceInfo = {
  source: 'criteria',
  scenarioId: null,
  scenarioName: null,
  scenarioCr: null,
};

export interface WeightOption {
  id: number;
  name: string;
  consistencyRatio: number | null;
  consistent: boolean;
  matchesCriteria: boolean;
  usable: boolean;
}

export async function loadCriteriaCore(db: AnyDb): Promise<Criterion[]> {
  const rows = await db.select().from(criteria).orderBy(asc(criteria.sortOrder), asc(criteria.code));
  return rows.map((r) => ({
    id: Number(r.id),
    code: r.code,
    name: r.name,
    weight: Number(r.weight),
    direction: r.direction,
  }));
}

export async function loadAlternativesCore(db: AnyDb, onlyActive = false): Promise<Alternative[]> {
  const rows = onlyActive
    ? await db.select().from(alternatives).where(eq(alternatives.isActive, true)).orderBy(asc(alternatives.code))
    : await db.select().from(alternatives).orderBy(asc(alternatives.code));
  return rows.map((r) => ({ id: Number(r.id), code: r.code, title: r.title }));
}

/**
 * Skenario yang boleh dipakai: konsisten, cocok dengan kriteria sekarang, dan
 * jumlah bobotnya sama. Skenario lain tetap dikembalikan agar bisa ditampilkan
 * beserta alasan penolakannya.
 */
export async function loadWeightOptionsCore(db: AnyDb): Promise<WeightOption[]> {
  const crit = await loadCriteriaCore(db);
  const currentHash = hashCriteria(crit.map((c) => ({ id: c.id, code: c.code, name: c.name })));

  const rows = await db.select().from(weightScenarios).orderBy(asc(weightScenarios.name));

  return rows.map((row) => {
    const weights = Array.isArray(row.weights) ? (row.weights as number[]) : [];
    const cr = row.consistencyRatio === null ? null : Number(row.consistencyRatio);
    const countsMatch = weights.length === crit.length;
    const matches = row.criteriaHash === currentHash && countsMatch;
    const usable = row.consistent && matches && cr !== null && cr < 0.1;

    return {
      id: Number(row.id),
      name: row.name,
      consistencyRatio: cr,
      consistent: row.consistent,
      matchesCriteria: matches,
      usable,
    };
  });
}

export interface LoadMatrixOptions {
  onlyActive?: boolean;
  scenarioId?: number | null;
}

export async function loadMatrixCore(db: AnyDb, options: LoadMatrixOptions = {}): Promise<MatrixBundle> {
  const onlyActive = options.onlyActive ?? true;
  const crit = await loadCriteriaCore(db);
  const alts = await loadAlternativesCore(db, onlyActive);

  const rows = await db
    .select({
      alternativeId: scores.alternativeId,
      criterionId: scores.criterionId,
      value: scores.value,
    })
    .from(scores);

  const lookup = new Map<string, number>();
  for (const row of rows) {
    lookup.set(`${Number(row.alternativeId)}:${Number(row.criterionId)}`, Number(row.value));
  }

  const missing: { alternativeCode: string; criterionCode: string }[] = [];
  const values = alts.map((alt) =>
    crit.map((c) => {
      const v = lookup.get(`${alt.id}:${c.id}`);
      if (v === undefined) {
        missing.push({ alternativeCode: alt.code, criterionCode: c.code });
        return Number.NaN;
      }
      return v;
    })
  );

  let weights = crit.map((c) => c.weight);
  let weightSource: WeightSourceInfo = MANUAL_WEIGHT_SOURCE;

  if (options.scenarioId) {
    const [row] = await db
      .select()
      .from(weightScenarios)
      .where(eq(weightScenarios.id, options.scenarioId))
      .limit(1);

    if (!row) throw new Error('Skenario bobot tidak ditemukan.');

    const scenarioWeights = Array.isArray(row.weights) ? (row.weights as number[]) : [];
    if (scenarioWeights.length !== crit.length) {
      throw new Error('Jumlah bobot pada skenario tidak sama dengan jumlah kriteria saat ini.');
    }

    const currentHash = hashCriteria(crit.map((c) => ({ id: c.id, code: c.code, name: c.name })));
    if (row.criteriaHash !== currentHash) {
      throw new Error('Skenario dibuat dari susunan kriteria yang berbeda.');
    }

    if (!row.consistent) {
      throw new Error('Skenario tidak konsisten, tidak boleh dipakai untuk perhitungan.');
    }

    const cr = row.consistencyRatio === null ? null : Number(row.consistencyRatio);
    if (cr === null || cr >= 0.1) {
      throw new Error('Consistency Ratio skenario mencapai atau melewati ambang 0,1.');
    }

    weights = scenarioWeights.map((w) => Number(w));
    weightSource = {
      source: 'scenario',
      scenarioId: Number(row.id),
      scenarioName: row.name,
      scenarioCr: cr,
    };
  }

  const weightedCriteria: Criterion[] = crit.map((c, i) => ({ ...c, weight: weights[i] }));
  const weightSum = weights.reduce((s, v) => s + v, 0);

  return {
    input: {
      criteria: weightedCriteria,
      alternatives: alts,
      values: missing.length === 0 ? values : values.map((row) => row.map((v) => (Number.isNaN(v) ? 0 : v))),
    },
    missing,
    rawWeights: weights,
    weightSum,
    weightSource,
  };
}