import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema';

export function createPool(databaseUrl: string): mysql.Pool {
  return mysql.createPool({
    uri: databaseUrl,
    connectionLimit: 10,
    waitForConnections: true,
    timezone: 'Z',
    decimalNumbers: true,
  });
}

export function createDatabase(pool: mysql.Pool) {
  return drizzle(pool, { schema, mode: 'default' });
}

export type Database = ReturnType<typeof createDatabase>;
export { schema };