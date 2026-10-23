import type { APIRoute } from 'astro';
import { auth } from '../../lib/auth';

export const POST: APIRoute = async ({ request, redirect }) => {
  await auth.api.signOut({ headers: request.headers });
  return redirect('/login', 303);
};