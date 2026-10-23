import { defineMiddleware } from 'astro:middleware';
import { getSession } from './lib/guard';

const PUBLIC_PATHS = ['/login', '/api/auth'];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));

  const user = await getSession(context.request);
  context.locals.user = user;

  if (!user && !isPublic) {
    return context.redirect('/login', 303);
  }

  if (user && pathname === '/login') {
    return context.redirect('/dashboard', 303);
  }

  return next();
});