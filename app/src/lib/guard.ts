import { auth, db, pool } from './auth';
import type { SessionUser } from './auth-factory';

export { db, pool, auth };

export async function getSession(request: Request): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;

  const user = session.user as typeof session.user & {
    username?: string | null;
    role?: string | null;
    isActive?: boolean | null;
  };

  if (user.isActive === false) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username ?? null,
    role: user.role === 'admin' ? 'admin' : 'viewer',
  };
}

export function requireAdmin(user: SessionUser | null): SessionUser {
  if (!user) throw new Error('UNAUTHENTICATED');
  if (user.role !== 'admin') throw new Error('FORBIDDEN');
  return user;
}