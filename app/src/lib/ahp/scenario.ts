import { createHash } from 'node:crypto';
import { asc, desc, eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from '../../db/schema';
import { criteria, pairwiseComparisons, weightScenarios } from '../../db/schema';
import { computeAhp, matrixFromUpper, AhpValidationError } from './ahp';

type AnyDb = MySql2Database<typeof schema>;

export interface ScenarioSummary {
  id: number;
  name: string;
  weights: number[];
  lambdaMax: number | null;
  consistencyRatio: number | null;
  consistent: boolean;
  createdAt: Date;
  criteriaCount: number;
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** Sidik kriteria, agar skenario tidak dipakai pada susunan kriteria lain. */
export function hashCriteria(list: { id: number; code: string; name: string }[]): string {
  return hashJson(list.map((c) => ({ id: c.id, code: c.code, name: c.name })));
}

export async function loadCriteriaForAhp(db: AnyDb) {
  const rows = await db
    .select({ id: criteria.id, code: criteria.code, name: criteria.name })
    .from(criteria)
    .orderBy(asc(criteria.sortOrder), asc(criteria.code));
  return rows.map((r) => ({ id: Number(r.id), code: r.code, name: r.name }));
}

export interface SaveScenarioInput {
  name: string;
  upper: number[];
  createdBy: string;
}

/**
 * Menghitung AHP dan menyimpan skenario. Bobot master kriteria tidak diubah.
 * Skenario yang tidak konsisten tetap disimpan bila pengguna memaksa, tetapi
 * ditandai, sehingga halaman hitung bisa menolaknya.
 */
export async function saveScenario(db: AnyDb, input: SaveScenarioInput) {
  const list = await loadCriteriaForAhp(db);
  if (list.length < 2) {
    throw new AhpValidationError(['Butuh minimal dua kriteria untuk perbandingan berpasangan.']);
  }

  const labels = list.map((c) => c.code);
  const matrix = matrixFromUpper(labels, input.upper);
  const result = computeAhp({ labels, matrix });

  const criteriaHash = hashCriteria(list);
  const inputHash = hashJson({ upper: input.upper, criteriaHash });

  const inserted = await db
    .insert(weightScenarios)
    .values({
      name: input.name.trim().slice(0, 160),
      method: 'ahp',
      inputHash,
      weights: result.weights,
      criteriaHash,
      lambdaMax: result.lambdaMax.toFixed(8),
      consistencyIndex: result.ci.toFixed(8),
      consistencyRatio: result.cr.toFixed(8),
      consistent: result.consistent,
      createdBy: input.createdBy,
      createdAt: new Date(),
    })
    .$returningId();

  const scenarioId = inserted[0].id;

  let k = 0;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      await db.insert(pairwiseComparisons).values({
        scenarioId,
        rowCriterionId: list[i].id,
        colCriterionId: list[j].id,
        value: input.upper[k++].toFixed(8),
      });
    }
  }

  return { scenarioId, result, labels };
}

export async function listScenarios(db: AnyDb, limit = 50): Promise<ScenarioSummary[]> {
  const rows = await db
    .select()
    .from(weightScenarios)
    .orderBy(desc(weightScenarios.createdAt), desc(weightScenarios.id))
    .limit(limit);

  return rows.map((row) => {
    const weights = row.weights as number[];
    return {
      id: Number(row.id),
      name: row.name,
      weights: Array.isArray(weights) ? weights : [],
      lambdaMax: row.lambdaMax === null ? null : Number(row.lambdaMax),
      consistencyRatio: row.consistencyRatio === null ? null : Number(row.consistencyRatio),
      consistent: row.consistent,
      createdAt: row.createdAt,
      criteriaCount: Array.isArray(weights) ? weights.length : 0,
    };
  });
}

export async function loadScenario(db: AnyDb, id: number) {
  const [row] = await db.select().from(weightScenarios).where(eq(weightScenarios.id, id)).limit(1);
  if (!row) return null;

  const pairs = await db
    .select()
    .from(pairwiseComparisons)
    .where(eq(pairwiseComparisons.scenarioId, id));

  return {
    id: Number(row.id),
    name: row.name,
    weights: row.weights as number[],
    criteriaHash: row.criteriaHash,
    lambdaMax: row.lambdaMax === null ? null : Number(row.lambdaMax),
    consistencyRatio: row.consistencyRatio === null ? null : Number(row.consistencyRatio),
    consistent: row.consistent,
    createdAt: row.createdAt,
    pairs: pairs.map((p) => ({
      rowCriterionId: Number(p.rowCriterionId),
      colCriterionId: Number(p.colCriterionId),
      value: Number(p.value),
    })),
  };
}

export async function deleteScenario(db: AnyDb, id: number) {
  await db.delete(pairwiseComparisons).where(eq(pairwiseComparisons.scenarioId, id));
  await db.delete(weightScenarios).where(eq(weightScenarios.id, id));
}

/**
 * Memeriksa apakah skenario masih cocok dengan susunan kriteria sekarang.
 * Skenario dari kriteria yang sudah diubah tidak boleh dipakai diam-diam.
 */
export function scenarioMatchesCriteria(
  scenarioCriteriaHash: string,
  currentList: { id: number; code: string; name: string }[]
): boolean {
  return scenarioCriteriaHash === hashCriteria(currentList);
}