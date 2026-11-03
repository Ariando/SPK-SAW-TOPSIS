import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '../lib/guard';
import { alternatives, computationResults, computationRuns } from '../db/schema';
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

async function buildSnapshot(
  methodId: string,
  scenarioId?: number | null
): Promise<{ content: SnapshotContent; createdAt: string }> {
  const method = getMethod(methodId);
  if (!method) throw new Error('Metode tidak dikenal');

  const matrix = await loadMatrix({ onlyActive: true, scenarioId });
  if (matrix.missing.length > 0) throw new Error('Masih ada sel nilai kosong');

  const result = method.compute(matrix.input);
  const altById = new Map<number, { code: string; title: string }>(
    matrix.input.alternatives.map((a) => [a.id, { code: a.code, title: a.title }])
  );

  const scores: Record<string, number> = {};
  matrix.input.alternatives.forEach((alt, i) => {
    matrix.input.criteria.forEach((c, j) => {
      scores[`${alt.code}:${c.code}`] = matrix.input.values[i][j];
    });
  });

  return {
    content: {
      // Versi 2 menambahkan weightSource. Run lama tetap versi 1 dan tetap
      // dapat dibuka, karena sidiknya tidak dihitung ulang dari versi baru.
      version: 2,
      method: method.id,
      criteria: matrix.input.criteria.map((c) => ({
        code: c.code,
        name: c.name,
        weight: c.weight,
        direction: c.direction,
      })),
      rawWeightSum: matrix.weightSum,
      weightSource: matrix.weightSource,
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

export async function saveRun(
  methodId: string,
  userId: string,
  note?: string,
  scenarioId?: number | null
) {
  const built = await buildSnapshot(methodId, scenarioId);
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

export interface RunPage {
  rows: (typeof computationRuns.$inferSelect)[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export const RUNS_PAGE_SIZE = 20;

/**
 * Riwayat dibaca bertahap. Tanpa batas halaman, catatan lama akan lolos dari
 * jangkauan begitu jumlahnya melebihi batas muat, padahal datanya masih ada.
 */
export async function loadRunPage(requestedPage = 1, pageSize = RUNS_PAGE_SIZE): Promise<RunPage> {
  const size = Math.min(Math.max(Math.trunc(pageSize) || RUNS_PAGE_SIZE, 1), 100);

  const [countRow] = await db.select({ n: sql<number>`count(*)` }).from(computationRuns);
  const total = Number(countRow?.n ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(Math.trunc(requestedPage) || 1, 1), totalPages);

  const rows = await db
    .select()
    .from(computationRuns)
    .orderBy(desc(computationRuns.createdAt), desc(computationRuns.id))
    .limit(size)
    .offset((page - 1) * size);

  return {
    rows,
    page,
    pageSize: size,
    total,
    totalPages,
    hasPrev: page > 1,
    hasNext: page < totalPages,
  };
}

export async function loadAlternativeIds(): Promise<[string, number][]> {
  const rows = await db.select({ id: alternatives.id, code: alternatives.code }).from(alternatives);
  return rows.map((r) => [r.code, Number(r.id)] as [string, number]);
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
      // Kosong berarti memakai bobot master kriteria.
      scenarioId: z.preprocess(
        (value) => (value === null || value === undefined || value === '' ? null : value),
        z.union([z.null(), z.coerce.number().int().positive()])
      ),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      if (user.role !== 'admin') throw new ActionError({ code: 'FORBIDDEN', message: 'Hanya pengelola yang boleh menyimpan hasil.' });

      try {
        const saved = await saveRun(input.method, user.id, input.note || undefined, input.scenarioId);
        return { ok: true, runId: saved.runId };
      } catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        const friendly = raw.includes('kosong')
          ? 'Perhitungan belum bisa disimpan karena ada sel nilai yang kosong.'
          : raw.includes('Metode')
            ? 'Metode tidak dikenal.'
            : raw.includes('Skenario') || raw.includes('Consistency')
              ? raw
              : 'Gagal menyimpan hasil. Periksa kembali data penilaian.';
        throw new ActionError({ code: 'BAD_REQUEST', message: friendly });
      }
    },
  }),
};