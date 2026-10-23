import { eq } from 'drizzle-orm';
import { user } from '../db/schema';
import type { Database } from '../db/factory';
import type { createAuth } from './auth-factory';

export type Role = 'admin' | 'viewer';

export interface CreateUserInput {
  name: string;
  email: string;
  username: string;
  password: string;
  role?: Role;
}

export class UserExistsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserExistsError';
  }
}

/**
 * Tipe konteks diturunkan dari instance auth yang sebenarnya, bukan ditulis
 * ulang, supaya bentuk internal createUser tetap sinkron saat library berubah.
 */
export type AuthContextResolved = Awaited<ReturnType<typeof createAuth>['auth']['$context']>;

/**
 * Membuat akun kredensial tanpa membuka pendaftaran publik.
 * Pendaftaran lewat /api/auth/sign-up dinonaktifkan, jadi akun hanya lahir
 * dari jalur ini: seed dan halaman pengelolaan akun.
 *
 * Fungsi ini tidak mengimpor `astro:env` supaya bisa dipakai juga oleh
 * skrip CLI di luar runtime Astro.
 */
export async function createUserAccount(
  deps: { db: Database; context: AuthContextResolved },
  input: CreateUserInput
) {
  const email = input.email.trim().toLowerCase();
  const username = input.username.trim().toLowerCase();

  const existingEmail = await deps.db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (existingEmail.length > 0) throw new UserExistsError('Email ' + email + ' sudah dipakai.');

  const existingUsername = await deps.db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.username, username))
    .limit(1);
  if (existingUsername.length > 0) throw new UserExistsError('Nama pengguna ' + username + ' sudah dipakai.');

  const hashed = await deps.context.password.hash(input.password);
  const now = new Date();

  const created = await deps.context.internalAdapter.createUser(
    {
      name: input.name.trim(),
      email,
      emailVerified: true,
      image: null,
      username,
      displayUsername: input.username.trim(),
      role: input.role ?? 'viewer',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    { method: 'admin' }
  );

  await deps.context.internalAdapter.createAccount({
    userId: created.id,
    providerId: 'credential',
    accountId: created.id,
    password: hashed,
    createdAt: now,
    updatedAt: now,
  });

  return created;
}