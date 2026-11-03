import { db } from './guard';
import { compareLatestRuns, type ComparisonStatus } from './comparison';

/**
 * Pembungkus runtime Astro. Modul perbandingan sendiri tidak mengimpor
 * `astro:env`, supaya bisa dipanggil dari skrip uji.
 */
export function loadComparison(): Promise<ComparisonStatus> {
  return compareLatestRuns(db);
}

export type { ComparisonStatus } from './comparison';