import { createHash } from 'node:crypto';

/**
 * Jumlah desimal yang dipakai saat menyimpan dan menghitung sidik snapshot.
 * MySQL menyimpan JSON sebagai double, dan pembacaan kembali bisa menggeser
 * digit terakhir (contoh 0.49314085404809205 menjadi 0.4931408540480921).
 * Dengan membulatkan ke 12 desimal, sidik tetap sama setelah bolak balik
 * lewat database. Presisi ini jauh di atas kebutuhan tampilan 4 desimal.
 */
export const SNAPSHOT_PRECISION = 12;

export interface SnapshotCriterion {
  code: string;
  name: string;
  weight: number;
  direction: string;
}

export interface SnapshotAlternative {
  code: string;
  title: string;
  values: number[];
}

export interface SnapshotRankEntry {
  code: string;
  title: string;
  value: number;
  rank: number;
  tied: boolean;
}

/**
 * Asal bobot yang dipakai pada satu perhitungan.
 *
 * Wajib dicatat karena bobot bisa berasal dari dua tempat yang sangat berbeda:
 * masukan manual di master kriteria, atau hasil perbandingan berpasangan AHP.
 * Tanpa penanda ini, laporan tidak dapat menjelaskan darimana angka berasal.
 */
export interface SnapshotWeightSource {
  source: 'criteria' | 'scenario';
  /** Terisi hanya bila source = 'scenario'. */
  scenarioId: number | null;
  scenarioName: string | null;
  /** Consistency Ratio skenario, bila bobot berasal dari AHP. */
  scenarioCr: number | null;
}

/**
 * Isi snapshot yang menentukan hasil. Semua field di sini masuk ke sidik.
 * Metadata seperti waktu penyimpanan dan catatan sengaja berada di luar
 * struktur ini agar dua penyimpanan dengan data identik menghasilkan sidik
 * yang sama.
 */
export interface SnapshotContent {
  version: number;
  method: string;
  criteria: SnapshotCriterion[];
  rawWeightSum: number;
  /** Asal bobot. Ditambahkan pada versi 2. */
  weightSource: SnapshotWeightSource;
  alternatives: SnapshotAlternative[];
  scores: Record<string, number>;
  ranking: SnapshotRankEntry[];
  warnings: string[];
}

export interface RunSnapshot extends SnapshotContent {
  createdAt: string;
}

function roundNumber(value: number): number {
  if (!Number.isFinite(value)) return value;
  const rounded = Number(value.toFixed(SNAPSHOT_PRECISION));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Menormalkan seluruh angka di dalam struktur snapshot.
 * Dipakai sebelum menyimpan, supaya isi yang tersimpan identik dengan isi
 * yang di-hash.
 */
export function normalizeNumbers<T>(value: T): T {
  const walk = (input: unknown): unknown => {
    if (typeof input === 'number') return roundNumber(input);
    if (Array.isArray(input)) return input.map(walk);
    if (input && typeof input === 'object') {
      const source = input as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(source)) {
        result[key] = walk(source[key]);
      }
      return result;
    }
    return input;
  };
  return walk(value) as T;
}

/**
 * JSON dengan kunci objek terurut dan angka dibulatkan, supaya urutan properti
 * maupun selisih floating point tidak mengubah sidik.
 * Urutan elemen array dipertahankan karena urutan itu bermakna.
 */
export function canonicalize(value: unknown): string {
  const walk = (input: unknown): unknown => {
    if (typeof input === 'number') return roundNumber(input);
    if (Array.isArray(input)) return input.map(walk);
    if (input && typeof input === 'object') {
      const source = input as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(source).sort()) {
        sorted[key] = walk(source[key]);
      }
      return sorted;
    }
    return input;
  };
  return JSON.stringify(walk(value));
}

export function hashSnapshot(content: SnapshotContent): string {
  return createHash('sha256').update(canonicalize(content)).digest('hex');
}

/**
 * Isi snapshot yang hanya mewakili masukan data, tanpa metode dan tanpa hasil.
 *
 * Hash snapshot penuh sengaja menyertakan nama metode, sehingga tiga metode
 * yang dihitung dari data identik selalu menghasilkan hash berbeda. Untuk
 * membandingkan hasil antar metode, yang perlu dibandingkan adalah data
 * masukannya, bukan seluruh isi snapshot. Itulah fungsi hash ini.
 */
export interface SnapshotData {
  version: number;
  criteria: SnapshotCriterion[];
  rawWeightSum: number;
  alternatives: SnapshotAlternative[];
  scores: Record<string, number>;
}

export function extractSnapshotData(content: SnapshotContent): SnapshotData {
  return {
    version: content.version,
    criteria: content.criteria,
    rawWeightSum: content.rawWeightSum,
    alternatives: content.alternatives,
    scores: content.scores,
  };
}

/** Sidik masukan data. Dua run dengan sidik ini sama dihitung dari data yang sama. */
export function hashSnapshotData(content: SnapshotContent): string {
  return createHash('sha256').update(canonicalize(extractSnapshotData(content))).digest('hex');
}

export function splitSnapshot(snapshot: RunSnapshot): { content: SnapshotContent; createdAt: string } {
  const { createdAt, ...content } = snapshot;
  return { content: content as SnapshotContent, createdAt };
}

/**
 * Memeriksa apakah sidik tersimpan masih cocok dengan isi snapshot.
 * Metadata di luar SnapshotContent, seperti createdAt, tidak ikut dihitung.
 */
export function verifySnapshotHash(snapshot: RunSnapshot, storedHash: string): boolean {
  return hashSnapshot(splitSnapshot(snapshot).content) === storedHash;
}