import { asc, sql } from 'drizzle-orm';
import { db } from './guard';
import { criteria, rubrics, scores } from '../db/schema';
import type { Criterion, Alternative } from './dss/types';
import {
  loadAlternativesCore,
  loadCriteriaCore,
  loadMatrixCore,
  loadWeightOptionsCore,
  MANUAL_WEIGHT_SOURCE,
  type LoadMatrixOptions,
  type MatrixBundle,
  type WeightOption,
  type WeightSourceInfo,
} from './matrix-core';

export type { MatrixBundle, WeightOption, WeightSourceInfo };
export { MANUAL_WEIGHT_SOURCE };

export function loadCriteria(): Promise<Criterion[]> {
  return loadCriteriaCore(db);
}

export function loadAlternatives(onlyActive = false): Promise<Alternative[]> {
  return loadAlternativesCore(db, onlyActive);
}

export function loadWeightOptions(): Promise<WeightOption[]> {
  return loadWeightOptionsCore(db);
}

export function loadMatrix(options: LoadMatrixOptions = {}): Promise<MatrixBundle> {
  return loadMatrixCore(db, options);
}

export async function countFilledScores(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(scores);
  return Number(row?.n ?? 0);
}

export async function criteriaWithRubrics() {
  const crit = await db.select().from(criteria).orderBy(asc(criteria.sortOrder), asc(criteria.code));
  const rub = await db.select().from(rubrics).orderBy(asc(rubrics.sortOrder), asc(rubrics.value));
  return crit.map((c) => ({
    ...c,
    rubrics: rub.filter((r) => Number(r.criterionId) === Number(c.id)),
  }));
}

export async function loadScoreMap(): Promise<Map<string, number>> {
  const rows = await db.select().from(scores);
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(`${Number(row.alternativeId)}:${Number(row.criterionId)}`, Number(row.value));
  }
  return map;
}