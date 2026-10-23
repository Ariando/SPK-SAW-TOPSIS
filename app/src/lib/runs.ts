import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '../lib/guard';
import { alternatives, computationResults, computationRuns, criteria } from '../db/schema';
import { getMethod } from '../lib/dss/registry';
import { loadMatrix } from '../lib/queries';
import {
  hashSnapshot,
  normalizeNumbers,
  type RunSnapshot,
  type SnapshotContent,
} from '../lib/snapshot';

export {
  hashSnapshot,
  canonicalize,
  normalizeNumbers,
  verifySnapshotHash,
  splitSnapshot,
  SNAPSHOT_PRECISION,
  type RunSnapshot,
  type SnapshotContent,
} from '../lib/snapshot';

async function buildSnapshot(methodId: string): Promise<{ content: SnapshotContent; createdAt: string }> {
  const method = getMethod(methodId);
  if (!method) throw new Error('Metode tidak dikenal');

  const matrix = await loadMatrix(true);
  if (matrix.missing.length > 0) throw new Error('Masih ada sel nilai kosong');

  const result = method.compute(matrix.input);
  const altById = new Map(matrix.input.alternatives.map((a) => [a.id, a]));

  const scores: Record<string, number> = {};
  matrix.input.alternatives.forEach((alt, i) => {
    matrix.input.criteria.forEach((c, j) => {
      scores[`${alt.code}:${c.code}`] = matrix.input.values[i][j];
    });
  });

  return {
    content: {
      version: 1,
      method: method.id,
      criteria: matrix.input.criteria.map((c) => ({
        code: c.code,
        name: c.name,
        weight: c.weight,
        direction: c.direction,
      })),
      rawWeightSum: matrix.weightSum,
      alternatives: matrix.input.alternatives.map((a, i) => ({
        code: a.code,
        title: a.title,
        values: matrix.input.criteria.map((_, j) => matrix.input.values[i][j]),
      })),
      scores,
      ranking: result.ranking
        .slice()
        .sort((a, b) => a.rank - b.rank)
        .map((entry) => {
          const alt = altById.get(entry.alternativeId);
          return {
            code: alt?.code ?? '',
            title: alt?.title ?? '',
            value: entry.value,
            rank: entry.rank,
            tied: entry.tied,
          };
        }),
      warnings: result.warnings,
    },
    createdAt: new Date().toISOString(),
  };
}

export async function saveRun(methodId: string, userId: string, note?: string) {
  const built = await buildSnapshot(methodId);
  // Angka dinormalkan sebelum di-hash dan disimpan, supaya isi yang tersimpan
  // identik dengan isi yang dihitung dan sidik tidak bergeser akibat
  // representasi double di MySQL.
  const content = normalizeNumbers(built.content);
  const hash = hashSnapshot(content);
  const snapshot: RunSnapshot = { ...content, createdAt: built.createdAt };

  const inserted = await db
    .insert(computationRuns)
    .values({
      method: methodId,
      snapshot,
      snapshotHash: hash,
      note: note?.slice(0, 255) ?? null,
      createdBy: userId,
      createdAt: new Date(),
    })
    .$returningId();

  const runId = inserted[0].id;

  const altRows = await db.select({ id: alternatives.id, code: alternatives.code }).from(alternatives);
  const altIdByCode = new Map(altRows.map((r) => [r.code, Number(r.id)]));

  for (const entry of content.ranking) {
    const altId = altIdByCode.get(entry.code);
    if (!altId) continue;
    await db.insert(computationResults).values({
      runId,
      alternativeId: altId,
      score: entry.value.toFixed(10),
      rankNo: entry.rank,
      tied: entry.tied,
    });
  }

  return { runId, hash, ranking: content.ranking };
}

export async function loadRuns(limit = 50) {
  return db.select().from(computationRuns).orderBy(desc(computationRuns.createdAt)).limit(limit);
}

export async function loadRun(runId: number) {
  const [run] = await db.select().from(computationRuns).where(eq(computationRuns.id, runId)).limit(1);
  if (!run) return null;
  const results = await db
    .select()
    .from(computationResults)
    .where(eq(computationResults.runId, runId))
    .orderBy(asc(computationResults.rankNo));
  return { run, results };
}

export const runActions = {
  save: defineAction({
    accept: 'form',
    input: z.object({
      method: z.string().trim().min(1),
      note: z.preprocess(
        (value) => (value === null || value === undefined ? '' : value),
        z.string().trim().max(255)
      ),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      if (user.role !== 'admin') throw new ActionError({ code: 'FORBIDDEN', message: 'Hanya pengelola yang boleh menyimpan hasil.' });

      try {
        const saved = await saveRun(input.method, user.id, input.note || undefined);
        return { ok: true, runId: saved.runId };
      } catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        const friendly = raw.includes('kosong')
          ? 'Perhitungan belum bisa disimpan karena ada sel nilai yang kosong.'
          : raw.includes('Metode')
            ? 'Metode tidak dikenal.'
            : 'Gagal menyimpan hasil. Periksa kembali data penilaian.';
        throw new ActionError({ code: 'BAD_REQUEST', message: friendly });
      }
    },
  }),
};

export async function criteriaList() {
  return db.select().from(criteria).orderBy(asc(criteria.code));
}