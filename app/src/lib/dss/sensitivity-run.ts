import { loadMatrixCore, loadWeightOptionsCore, type WeightOption } from '../matrix-core';
import { analyseSensitivity, shiftMatrix, directionOfInfluence, SensitivityError } from './sensitivity';
import { getMethod } from './registry';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from '../../db/schema';

type AnyDb = MySql2Database<typeof schema>;

export interface SensitivityRunOptions {
  methodId: string;
  delta: number;
  scenarioId?: number | null;
  includeEqualWeights?: boolean;
}

export interface SensitivityRunResult {
  ok: true;
  payload: ReturnType<typeof analyseSensitivity>;
  matrix: ReturnType<typeof shiftMatrix>;
  directions: ReturnType<typeof directionOfInfluence>;
  weightOrigin: {
    source: 'criteria' | 'scenario';
    scenarioName: string | null;
    scenarioCr: number | null;
  };
}

export interface SensitivityRunFailure {
  ok: false;
  message: string;
}

/**
 * Menyiapkan analisis sensitivitas dari database. Diletakkan terpisah dari
 * halaman agar dapat diuji tanpa merender Astro.
 */
export async function runSensitivity(
  db: AnyDb,
  options: SensitivityRunOptions
): Promise<SensitivityRunResult | SensitivityRunFailure> {
  const method = getMethod(options.methodId);
  if (!method) return { ok: false, message: 'Metode tidak dikenal.' };

  let matrix;
  try {
    matrix = await loadMatrixCore(db, { onlyActive: true, scenarioId: options.scenarioId ?? null });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Data tidak dapat dimuat.' };
  }

  if (matrix.missing.length > 0) {
    return {
      ok: false,
      message: 'Masih ada ' + matrix.missing.length + ' sel nilai kosong. Analisis memerlukan matriks lengkap.',
    };
  }

  if (matrix.input.alternatives.length < 2) {
    return { ok: false, message: 'Perlu minimal dua alternatif aktif untuk menganalisis peringkat.' };
  }

  try {
    const payload = analyseSensitivity(matrix.input, {
      methodId: options.methodId,
      delta: options.delta,
      includeEqualWeights: options.includeEqualWeights ?? true,
    });

    return {
      ok: true,
      payload,
      matrix: shiftMatrix(payload),
      directions: directionOfInfluence(payload),
      weightOrigin: {
        source: matrix.weightSource.source,
        scenarioName: matrix.weightSource.scenarioName,
        scenarioCr: matrix.weightSource.scenarioCr,
      },
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof SensitivityError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Analisis gagal dijalankan.',
    };
  }
}

export async function listScenarioOptions(db: AnyDb) {
  const options = await loadWeightOptionsCore(db);
  return options.filter((o: WeightOption) => o.usable);
}