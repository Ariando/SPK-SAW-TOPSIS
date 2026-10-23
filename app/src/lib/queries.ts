import { asc, eq, sql } from 'drizzle-orm';
import { db } from '../lib/guard';
import { alternatives, criteria, rubrics, scores } from '../db/schema';
import type { Criterion, Alternative, DssInput } from './dss/types';

export interface MatrixBundle {
  input: DssInput;
  missing: { alternativeCode: string; criterionCode: string }[];
  rawWeights: number[];
  weightSum: number;
}

export async function loadCriteria(): Promise<Criterion[]> {
  const rows = await db
    .select()
    .from(criteria)
    .orderBy(asc(criteria.sortOrder), asc(criteria.code));
  return rows.map((r) => ({
    id: Number(r.id),
    code: r.code,
    name: r.name,
    weight: Number(r.weight),
    direction: r.direction,
  }));
}

export async function loadAlternatives(onlyActive = false): Promise<Alternative[]> {
  const rows = onlyActive
    ? await db.select().from(alternatives).where(eq(alternatives.isActive, true)).orderBy(asc(alternatives.code))
    : await db.select().from(alternatives).orderBy(asc(alternatives.code));
  return rows.map((r) => ({ id: Number(r.id), code: r.code, title: r.title }));
}

export async function loadMatrix(onlyActive = true): Promise<MatrixBundle> {
  const crit = await loadCriteria();
  const alts = await loadAlternatives(onlyActive);

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
  const values = alts.map((alt) => {
    return crit.map((c) => {
      const v = lookup.get(`${alt.id}:${c.id}`);
      if (v === undefined) {
        missing.push({ alternativeCode: alt.code, criterionCode: c.code });
        return Number.NaN;
      }
      return v;
    });
  });

  const rawWeights = crit.map((c) => c.weight);
  const weightSum = rawWeights.reduce((s, v) => s + v, 0);

  return {
    input: {
      criteria: crit,
      alternatives: alts,
      values: missing.length === 0 ? values : values.map((row) => row.map((v) => (Number.isNaN(v) ? 0 : v))),
    },
    missing,
    rawWeights,
    weightSum,
  };
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