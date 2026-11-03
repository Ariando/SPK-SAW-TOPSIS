// @ts-check
import { defineConfig, envField } from 'astro/config';
import node from '@astrojs/node';

const port = Number(process.env.PORT ?? 1111);

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: { port, host: true },
  security: {
    checkOrigin: true,
  },
  env: {
    schema: {
      DATABASE_URL: envField.string({ context: 'server', access: 'secret' }),
      BETTER_AUTH_SECRET: envField.string({ context: 'server', access: 'secret', min: 32 }),
      BETTER_AUTH_URL: envField.string({ context: 'server', access: 'secret' }),
      AUTH_LOGIN_RATE_LIMIT: envField.number({
        context: 'server',
        access: 'public',
        default: 6,
        min: 1,
        max: 10000,
      }),
    },
  },
  vite: {
    ssr: {
      external: ['mysql2'],
    },
  },
});