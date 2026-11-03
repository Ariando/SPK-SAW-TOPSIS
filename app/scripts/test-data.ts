import mysql from 'mysql2/promise';

/**
 * Data seed untuk kriteria dan rubrik.
 *
 * Dipakai bersama oleh `restore-seed.ts` dan setiap suite uji yang memotong
 * tabel kriteria. Sebelumnya setiap berkas menyalin datanya sendiri, dan
 * beberapa lupa memulihkan sama sekali, sehingga suite berikutnya gagal.
 */
export const SEED_CRITERIA = [
  ['C1', 'Relevansi tema dan judul', '0.3000', 'benefit', 1],
  ['C2', 'Ketajaman metodologi', '0.2500', 'benefit', 2],
  ['C3', 'Ketersediaan data', '0.2000', 'benefit', 3],
  ['C4', 'Beban biaya dan waktu', '0.2500', 'cost', 4],
] as const;

export const SEED_SCALE = [
  ['Sangat kurang', '1.0000'],
  ['Kurang', '2.0000'],
  ['Cukup', '3.0000'],
  ['Baik', '4.0000'],
  ['Sangat baik', '5.0000'],
] as const;

export const ALL_DATA_TABLES = [
  'pairwise_comparisons',
  'weight_scenarios',
  'scores',
  'rubrics',
  'alternatives',
  'criteria',
  'computation_results',
  'computation_runs',
] as const;

export type Connection = mysql.Connection;

/** Mengosongkan seluruh tabel data tanpa menyentuh akun dan sesi. */
export async function truncateDataTables(connection: Connection): Promise<void> {
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of ALL_DATA_TABLES) {
    await connection.query(`TRUNCATE TABLE \`${table}\``);
  }
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');
}

/** Menanam empat kriteria seed beserta rubriknya. Mengembalikan id kriteria. */
export async function seedCriteriaAndRubrics(connection: Connection): Promise<number[]> {
  const now = new Date();
  const ids: number[] = [];

  for (const [code, name, weight, direction, order] of SEED_CRITERIA) {
    const [result] = await connection.query(
      'INSERT INTO criteria (code, name, weight, direction, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [code, name, weight, direction, order, now, now]
    );
    const criterionId = (result as { insertId: number }).insertId;
    ids.push(criterionId);

    for (const [index, [label, value]] of SEED_SCALE.entries()) {
      await connection.query(
        'INSERT INTO rubrics (criterion_id, label, value, sort_order) VALUES (?, ?, ?, ?)',
        [criterionId, label, value, index + 1]
      );
    }
  }

  return ids;
}

export interface SeedAlternative {
  code: string;
  title: string;
  values: number[];
}

export async function seedAlternatives(
  connection: Connection,
  criterionIds: number[],
  alternatives: SeedAlternative[]
): Promise<number[]> {
  const now = new Date();
  const ids: number[] = [];

  for (const [index, alternative] of alternatives.entries()) {
    const [result] = await connection.query(
      'INSERT INTO alternatives (code, title, student_name, nim, concentration, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
      [
        alternative.code,
        alternative.title,
        'Mahasiswa ' + alternative.code,
        '211010' + index,
        'RPL',
        now,
        now,
      ]
    );
    const alternativeId = (result as { insertId: number }).insertId;
    ids.push(alternativeId);

    for (const [j, value] of alternative.values.entries()) {
      await connection.query(
        'INSERT INTO scores (alternative_id, criterion_id, rubric_id, value, updated_at) VALUES (?, ?, NULL, ?, ?)',
        [alternativeId, criterionIds[j], value, now]
      );
    }
  }

  return ids;
}

/**
 * Memulihkan keadaan seed lengkap: tabel data bersih, kriteria dan rubrik
 * seed terpasang, tanpa alternatif. Ini keadaan yang diharapkan `smoke-p0`
 * dan suite lain pada umumnya.
 */
export async function restoreSeedState(connection: Connection): Promise<void> {
  await truncateDataTables(connection);
  await seedCriteriaAndRubrics(connection);
}