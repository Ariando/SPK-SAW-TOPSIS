import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { createAuth } from '../src/lib/auth-factory';
import { createDatabase, createPool } from '../src/db/factory';
import { user } from '../src/db/schema';
import { createUserAccount } from '../src/lib/user-service';

const databaseUrl = process.env.DATABASE_URL;
const secret = process.env.BETTER_AUTH_SECRET;
const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:4321';

if (!databaseUrl) throw new Error('DATABASE_URL belum diisi');
if (!secret) throw new Error('BETTER_AUTH_SECRET belum diisi');

const pool = createPool(databaseUrl);
const db = createDatabase(pool);
const authInstance = createAuth({ databaseUrl, secret, baseUrl });
const context = await authInstance.auth.$context;

const EMAIL = 'peninjau@telaah.local';

try {
  const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, EMAIL)).limit(1);
  if (existing.length > 0) {
    console.log('akun peninjau sudah ada, dilewati');
  } else {
    const created = await createUserAccount(
      { db, context },
      {
        name: 'Peninjau Contoh',
        email: EMAIL,
        username: 'peninjau',
        password: 'TelaahTinjau2026',
        role: 'viewer',
      }
    );
    console.log('akun peninjau dibuat: peninjau / TelaahTinjau2026 (id ' + created.id + ')');
  }
} catch (error) {
  console.error('gagal membuat akun peninjau:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await authInstance.pool.end();
  await pool.end();
}