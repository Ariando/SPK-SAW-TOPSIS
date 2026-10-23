import { createAuth } from './auth-factory';
import { DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, AUTH_LOGIN_RATE_LIMIT } from 'astro:env/server';

const instance = createAuth({
  databaseUrl: DATABASE_URL,
  secret: BETTER_AUTH_SECRET,
  baseUrl: BETTER_AUTH_URL,
  loginRateLimit: AUTH_LOGIN_RATE_LIMIT,
});

export const auth = instance.auth;
export const db = instance.db;
export const pool = instance.pool;
export type { SessionUser } from './auth-factory';