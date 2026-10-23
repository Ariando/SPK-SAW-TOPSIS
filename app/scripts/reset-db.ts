import 'dotenv/config';
import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL belum diisi di app/.env');

const parsed = new URL(url);
const dbName = parsed.pathname.replace(/^\//, '');
if (!dbName) throw new Error('DATABASE_URL tidak memuat nama database');

const adminUrl = new URL(url);
adminUrl.pathname = '/';

const conn = await mysql.createConnection({ uri: adminUrl.toString() });
await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
await conn.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
await conn.end();

console.log('database ' + dbName + ' dibuat ulang');