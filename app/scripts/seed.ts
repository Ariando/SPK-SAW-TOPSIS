import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { createAuth } from '../src/lib/auth-factory';
import { createDatabase, createPool } from '../src/db/factory';
import { criteria, rubrics, user } from '../src/db/schema';
import { createUserAccount } from '../src/lib/user-service';

const databaseUrl = process.env.DATABASE_URL;
const secret = process.env.BETTER_AUTH_SECRET;
const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:1111';

if (!databaseUrl) throw new Error('DATABASE_URL belum diisi');
if (!secret) throw new Error('BETTER_AUTH_SECRET belum diisi');

const DEMO_CRITERIA = [
  { code: 'C1', name: 'Relevansi tema dan judul', weight: '0.3000', direction: 'benefit' as const, sortOrder: 1 },
  { code: 'C2', name: 'Ketajaman metodologi', weight: '0.2500', direction: 'benefit' as const, sortOrder: 2 },
  { code: 'C3', name: 'Ketersediaan data', weight: '0.2000', direction: 'benefit' as const, sortOrder: 3 },
  { code: 'C4', name: 'Beban biaya dan waktu', weight: '0.2500', direction: 'cost' as const, sortOrder: 4 },
];

// Kata sandi akun awal. Bisa ditimpa lewat lingkungan tanpa mengubah berkas,
// supaya nilai di database dan nilai yang dicetak tidak pernah berbeda.
// Ubah nilai bawaan di sini, atau isi SEED_ADMIN_PASSWORD di .env.
const ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Mbgindonesia@2026';

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
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
      role: 'admin',
    }
  );

  console.log('akun admin dibuat: ' + ADMIN_USERNAME + ' (id ' + created.id + ')');
  console.log('kata sandi diambil dari SEED_ADMIN_PASSWORD bila diisi, jika tidak memakai nilai bawaan di berkas ini.');
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