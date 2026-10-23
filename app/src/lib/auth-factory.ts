import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { username } from 'better-auth/plugins';
import { createDatabase, createPool } from '../db/factory';
import * as schema from '../db/schema';

export interface AuthEnv {
  databaseUrl: string;
  secret: string;
  baseUrl: string;
  loginRateLimit?: number;
}

export function createAuth(env: AuthEnv) {
  const pool = createPool(env.databaseUrl);
  const db = createDatabase(pool);

  const instance = betterAuth({
    baseURL: env.baseUrl,
    secret: env.secret,
    database: drizzleAdapter(db, {
      provider: 'mysql',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: true,
      // Aplikasi ini hanya untuk pengelola dan peninjau yang didaftarkan.
      // Tanpa ini, siapa pun bisa membuat akun sendiri lewat /api/auth/sign-up.
      disableSignUp: true,
    },
    user: {
      additionalFields: {
        role: {
          type: 'string',
          required: false,
          defaultValue: 'viewer',
          input: false,
        },
        isActive: {
          type: 'boolean',
          required: false,
          defaultValue: true,
          input: false,
        },
      },
    },
    plugins: [username({ minUsernameLength: 3, maxUsernameLength: 30 })],
    session: {
      expiresIn: 60 * 60 * 8,
      updateAge: 60 * 30,
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },
    advanced: {
      database: { generateId: 'uuid' },
      defaultCookieAttributes: { sameSite: 'lax', httpOnly: true, secure: false },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 20,
      customRules: {
        // Batas ketat untuk percobaan login. Nilai ini bisa dinaikkan lewat
        // AUTH_LOGIN_RATE_LIMIT saat menguji secara lokal, tanpa mengubah
        // default produksi.
        '/sign-in/username': { window: 60, max: env.loginRateLimit ?? 6 },
      },
    },
  });

  return { auth: instance, pool, db };
}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: 'admin' | 'viewer';
};