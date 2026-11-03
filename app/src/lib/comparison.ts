import { desc, eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { computationRuns } from '../db/schema';
import * as schema from '../db/schema';
import { methods } from './dss/registry';
import { analyseAgreement, type AgreementAnalysis, type MethodRanking } from './dss/ranking';
import { extractSnapshotData, hashSnapshotData, verifySnapshotHash, type RunSnapshot } from './snapshot';

type AnyDb = MySql2Database<typeof schema>;

export interface SelectedRun {
  id: number;
  method: string;
  label: string;
  createdAt: Date;
  snapshotHash: string;
  /** Sidik masukan data saja, dipakai untuk menilai kesebandingan antar metode. */
  dataHash: string;
  note: string | null;
  hashValid: boolean;
  alternatives: number;
}

export interface ComparisonStatus {
  /** false bila ketiga metode belum punya hasil tersimpan. */
  complete: boolean;
  /** false bila hash ketiga run tidak sama, artinya datanya berbeda. */
  sameData: boolean;
  missingMethods: string[];
  invalidHashMethods: string[];
  runs: SelectedRun[];
  analysis: AgreementAnalysis | null;
  warnings: string[];
  /** Pesan siap tampil untuk pengguna, kosong bila siap dibandingkan. */
  blockers: string[];
}

/**
 * Opsi A: membandingkan hasil terbaru dari setiap metode yang terdaftar.
 *
 * Hasil hanya dianggap sebanding bila ketiga run berasal dari isi data yang
 * sama, diperiksa lewat sidik snapshot. Tanpa pengaman ini, membandingkan
 * SAW yang dihitung sebelum bobot diubah dengan TOPSIS sesudahnya akan
 * menghasilkan angka yang tampak sah padahal tidak sebanding.
 *
 * Database diterima sebagai argumen supaya fungsi ini bisa diuji tanpa
 * runtime Astro.
 */
export async function compareLatestRuns(db: AnyDb): Promise<ComparisonStatus> {
  const wanted = methods.filter((m) => m.inputMode === 'matrix');

  const latestRows = await Promise.all(
    wanted.map(async (method) => {
      const [row] = await db
        .select()
        .from(computationRuns)
        .where(eq(computationRuns.method, method.id))
        .orderBy(desc(computationRuns.createdAt), desc(computationRuns.id))
        .limit(1);
      return { method, row: row ?? null };
    })
  );

  const missingMethods: string[] = [];
  const invalidHashMethods: string[] = [];
  const runs: SelectedRun[] = [];
  const rankings: MethodRanking[] = [];
  const warnings: string[] = [];

  for (const { method, row } of latestRows) {
    if (!row) {
      missingMethods.push(method.label);
      continue;
    }

    const snapshot = row.snapshot as RunSnapshot;
    const hashValid = verifySnapshotHash(snapshot, row.snapshotHash);
    if (!hashValid) invalidHashMethods.push(method.label);

    const dataHash = hashSnapshotData(snapshot);

    runs.push({
      id: Number(row.id),
      method: method.id,
      label: method.label,
      createdAt: row.createdAt,
      snapshotHash: row.snapshotHash,
      dataHash,
      note: row.note ?? null,
      hashValid,
      alternatives: snapshot.ranking?.length ?? 0,
    });

    rankings.push({
      methodId: method.id,
      label: method.label,
      entries: (snapshot.ranking ?? []).map((entry) => ({
        code: entry.code,
        title: entry.title,
        rank: entry.rank,
      })),
    });
  }

  const blockers: string[] = [];
  const complete = missingMethods.length === 0;

  if (!complete) {
    blockers.push('Belum ada hasil tersimpan untuk metode: ' + missingMethods.join(', ') + '.');
  }

  if (invalidHashMethods.length > 0) {
    blockers.push(
      'Isi snapshot berubah pada metode: ' +
        invalidHashMethods.join(', ') +
        '. Hasil itu tidak dapat dipercaya sebagai catatan asli.'
    );
  }

  const dataHashes = new Set(runs.map((run) => run.dataHash));
  const sameData = dataHashes.size <= 1;

  if (complete && !sameData) {
    blockers.push(
      'Hasil ketiga metode dihitung dari data yang berbeda. Hitung ulang ketiga metode dari data yang sama, lalu simpan berurutan tanpa mengubah kriteria, bobot, atau nilai.'
    );
  }

  let analysis: AgreementAnalysis | null = null;

  if (complete && sameData && invalidHashMethods.length === 0) {
    try {
      analysis = analyseAgreement(rankings);
      warnings.push(...analysis.warnings);
    } catch (error) {
      blockers.push(
        'Analisis kesepakatan gagal: ' + (error instanceof Error ? error.message : String(error))
      );
    }
  }

  return {
    complete,
    sameData,
    missingMethods,
    invalidHashMethods,
    runs,
    analysis,
    warnings,
    blockers,
  };
}

export function snapshotContentOf(snapshot: RunSnapshot) {
  return extractSnapshotData(snapshot);
}