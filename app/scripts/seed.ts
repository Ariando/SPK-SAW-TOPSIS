import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { createAuth } from '../src/lib/auth-factory';
import { createDatabase, createPool } from '../src/db/factory';
import { criteria, rubrics, user } from '../src/db/schema';
import { createUserAccount } from '../src/lib/user-service';

const databaseUrl = process.env.DATABASE_URL;
const secret = process.env.BETTER_AUTH_SECRET;
const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:4321';

if (!databaseUrl) throw new Error('DATABASE_URL belum diisi');
if (!secret) throw new Error('BETTER_AUTH_SECRET belum diisi');

const DEMO_CRITERIA = [
  { code: 'C1', name: 'Relevansi tema dan judul', weight: '0.3000', direction: 'benefit' as const, sortOrder: 1 },
  { code: 'C2', name: 'Ketajaman metodologi', weight: '0.2500', direction: 'benefit' as const, sortOrder: 2 },
  { code: 'C3', name: 'Ketersediaan data', weight: '0.2000', direction: 'benefit' as const, sortOrder: 3 },
  { code: 'C4', name: 'Beban biaya dan waktu', weight: '0.2500', direction: 'cost' as const, sortOrder: 4 },
];

const RUBRIC_SCALE = [
  { label: 'Sangat kurang', value: '1.0000' },
  { label: 'Kurang', value: '2.0000' },
  { label: 'Cukup', value: '3.0000' },
  { label: 'Baik', value: '4.0000' },
  { label: 'Sangat baik', value: '5.0000' },
];

const appPool = createPool(databaseUrl);
const db = createDatabase(appPool);
const authInstance = createAuth({ databaseUrl, secret, baseUrl });

async function seedAdmin() {
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, 'admin@telaah.local'))
    .limit(1);

  if (existing.length > 0) {
    console.log('akun admin sudah ada, dilewati');
    return;
  }

  const context = await authInstance.auth.$context;
  const created = await createUserAccount(
    { db, context },
    {
      name: 'Pengelola TELAAH',
      email: 'admin@telaah.local',
      username: 'admin',
      password: 'TelaahAdmin2026',
      role: 'admin',
    }
  );

  console.log('akun admin dibuat: admin / TelaahAdmin2026 (id ' + created.id + ')');
}

async function seedCriteria() {
  const existing = await db.select({ id: criteria.id }).from(criteria).limit(1);
  if (existing.length > 0) {
    console.log('kriteria sudah ada, dilewati');
    return;
  }

  const now = new Date();
  for (const item of DEMO_CRITERIA) {
    const inserted = await db
      .insert(criteria)
      .values({ ...item, createdAt: now, updatedAt: now })
      .$returningId();

    await db.insert(rubrics).values(
      RUBRIC_SCALE.map((r, i) => ({
        criterionId: inserted[0].id,
        label: r.label,
        value: r.value,
        sortOrder: i + 1,
      }))
    );
  }
  console.log('kriteria contoh dan rubrik dibuat: ' + DEMO_CRITERIA.length + ' kriteria');
}

try {
  await seedAdmin();
  await seedCriteria();
  console.log('seed selesai');
} catch (error) {
  console.error('seed gagal:', error);
  process.exitCode = 1;
} finally {
  await authInstance.pool.end();
  await appPool.end();
}