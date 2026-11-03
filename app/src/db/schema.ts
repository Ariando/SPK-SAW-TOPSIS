import {
  bigint,
  boolean,
  char,
  datetime,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

export const user = mysqlTable('user', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  email: varchar('email', { length: 160 }).notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  username: varchar('username', { length: 60 }),
  displayUsername: varchar('display_username', { length: 60 }),
  role: mysqlEnum('role', ['admin', 'viewer']).notNull().default('viewer'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: datetime('created_at', { mode: 'date' }).notNull(),
  updatedAt: datetime('updated_at', { mode: 'date' }).notNull(),
}, (t) => [
  uniqueIndex('uq_user_email').on(t.email),
  uniqueIndex('uq_user_username').on(t.username),
]);

export const session = mysqlTable('session', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  token: varchar('token', { length: 255 }).notNull(),
  expiresAt: datetime('expires_at', { mode: 'date' }).notNull(),
  ipAddress: varchar('ip_address', { length: 64 }),
  userAgent: text('user_agent'),
  createdAt: datetime('created_at', { mode: 'date' }).notNull(),
  updatedAt: datetime('updated_at', { mode: 'date' }).notNull(),
}, (t) => [uniqueIndex('uq_session_token').on(t.token), index('ix_session_user').on(t.userId)]);

export const account = mysqlTable('account', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  accountId: varchar('account_id', { length: 255 }).notNull(),
  providerId: varchar('provider_id', { length: 64 }).notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: datetime('access_token_expires_at', { mode: 'date' }),
  refreshTokenExpiresAt: datetime('refresh_token_expires_at', { mode: 'date' }),
  scope: text('scope'),
  password: varchar('password', { length: 255 }),
  createdAt: datetime('created_at', { mode: 'date' }).notNull(),
  updatedAt: datetime('updated_at', { mode: 'date' }).notNull(),
}, (t) => [index('ix_account_user').on(t.userId)]);

export const verification = mysqlTable('verification', {
  id: varchar('id', { length: 36 }).primaryKey(),
  identifier: varchar('identifier', { length: 255 }).notNull(),
  value: text('value').notNull(),
  expiresAt: datetime('expires_at', { mode: 'date' }).notNull(),
  createdAt: datetime('created_at', { mode: 'date' }).notNull(),
  updatedAt: datetime('updated_at', { mode: 'date' }).notNull(),
}, (t) => [index('ix_verification_identifier').on(t.identifier)]);

export const criteria = mysqlTable('criteria', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  code: varchar('code', { length: 8 }).notNull(),
  name: varchar('name', { length: 160 }).notNull(),
  weight: decimal('weight', { precision: 10, scale: 4 }).notNull(),
  direction: mysqlEnum('direction', ['benefit', 'cost']).notNull(),
  sortOrder: int('sort_order').notNull().default(0),
  createdAt: datetime('created_at', { mode: 'date' }).notNull(),
  updatedAt: datetime('updated_at', { mode: 'date' }).notNull(),
}, (t) => [uniqueIndex('uq_criteria_code').on(t.code)]);

export const rubrics = mysqlTable('rubrics', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  criterionId: bigint('criterion_id', { mode: 'number', unsigned: true }).notNull(),
  label: varchar('label', { length: 160 }).notNull(),
  value: decimal('value', { precision: 12, scale: 4 }).notNull(),
  sortOrder: int('sort_order').notNull().default(0),
}, (t) => [index('ix_rubrics_criterion').on(t.criterionId)]);

export const alternatives = mysqlTable('alternatives', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  code: varchar('code', { length: 16 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  studentName: varchar('student_name', { length: 160 }).notNull(),
  nim: varchar('nim', { length: 24 }).notNull(),
  concentration: varchar('concentration', { length: 120 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: datetime('created_at', { mode: 'date' }).notNull(),
  updatedAt: datetime('updated_at', { mode: 'date' }).notNull(),
}, (t) => [uniqueIndex('uq_alternatives_code').on(t.code), index('ix_alternatives_active').on(t.isActive)]);

export const scores = mysqlTable('scores', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  alternativeId: bigint('alternative_id', { mode: 'number', unsigned: true }).notNull(),
  criterionId: bigint('criterion_id', { mode: 'number', unsigned: true }).notNull(),
  rubricId: bigint('rubric_id', { mode: 'number', unsigned: true }),
  value: decimal('value', { precision: 12, scale: 4 }).notNull(),
  updatedAt: datetime('updated_at', { mode: 'date' }).notNull(),
}, (t) => [uniqueIndex('uq_scores_pair').on(t.alternativeId, t.criterionId)]);

export const computationRuns = mysqlTable('computation_runs', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  method: varchar('method', { length: 24 }).notNull(),
  snapshot: json('snapshot').notNull(),
  snapshotHash: char('snapshot_hash', { length: 64 }).notNull(),
  note: varchar('note', { length: 255 }),
  createdBy: varchar('created_by', { length: 36 }).notNull(),
  createdAt: datetime('created_at', { mode: 'date' }).notNull(),
}, (t) => [
  index('ix_runs_method').on(t.method),
  // Paginasi riwayat mengurutkan created_at menurun dengan id sebagai pemecah
  // seri, dan pemilihan run terbaru per metode memfilter method lalu mengurutkan
  // created_at. Dua indeks komposit di bawah melayani keduanya tanpa filesort.
  index('ix_runs_created_id').on(t.createdAt, t.id),
  index('ix_runs_method_created').on(t.method, t.createdAt, t.id),
]);

export const computationResults = mysqlTable('computation_results', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  runId: bigint('run_id', { mode: 'number', unsigned: true }).notNull(),
  alternativeId: bigint('alternative_id', { mode: 'number', unsigned: true }).notNull(),
  score: decimal('score', { precision: 20, scale: 10 }).notNull(),
  rankNo: int('rank_no').notNull(),
  tied: boolean('tied').notNull().default(false),
}, (t) => [index('ix_results_run').on(t.runId), uniqueIndex('uq_results_run_alt').on(t.runId, t.alternativeId)]);

export const settings = mysqlTable('settings', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  keyName: varchar('key_name', { length: 64 }).notNull(),
  value: text('value'),
  updatedAt: datetime('updated_at', { mode: 'date' }).notNull(),
}, (t) => [uniqueIndex('uq_settings_key').on(t.keyName)]);

/**
 * Skenario bobot hasil AHP. Disimpan terpisah dari tabel criteria supaya
 * bobot master tidak tertimpa, sesuai keputusan pemilik produk. Bobot di sini
 * bersifat usulan; pemakaiannya eksplisit lewat halaman hitung.
 */
export const weightScenarios = mysqlTable('weight_scenarios', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  name: varchar('name', { length: 160 }).notNull(),
  method: varchar('method', { length: 24 }).notNull().default('ahp'),
  /** Sidik masukan, dipakai untuk menandai skenario yang identik. */
  inputHash: char('input_hash', { length: 64 }).notNull(),
  /** Bobot ternormalisasi per kriteria, urut sesuai snapshot kriteria. */
  weights: json('weights').notNull(),
  /** Sidik kriteria yang dirujuk, agar skenario tidak dipakai pada kriteria lain. */
  criteriaHash: char('criteria_hash', { length: 64 }).notNull(),
  lambdaMax: decimal('lambda_max', { precision: 12, scale: 8 }),
  consistencyIndex: decimal('consistency_index', { precision: 12, scale: 8 }),
  consistencyRatio: decimal('consistency_ratio', { precision: 12, scale: 8 }),
  consistent: boolean('consistent').notNull().default(false),
  createdBy: varchar('created_by', { length: 36 }).notNull(),
  createdAt: datetime('created_at', { mode: 'date' }).notNull(),
}, (t) => [
  index('ix_scenarios_method').on(t.method),
  index('ix_scenarios_created').on(t.createdAt, t.id),
]);

/** Nilai segitiga atas perbandingan berpasangan untuk satu skenario. */
export const pairwiseComparisons = mysqlTable('pairwise_comparisons', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  scenarioId: bigint('scenario_id', { mode: 'number', unsigned: true }).notNull(),
  rowCriterionId: bigint('row_criterion_id', { mode: 'number', unsigned: true }).notNull(),
  colCriterionId: bigint('col_criterion_id', { mode: 'number', unsigned: true }).notNull(),
  value: decimal('value', { precision: 12, scale: 8 }).notNull(),
}, (t) => [
  index('ix_pairwise_scenario').on(t.scenarioId),
  uniqueIndex('uq_pairwise_pair').on(t.scenarioId, t.rowCriterionId, t.colCriterionId),
]);