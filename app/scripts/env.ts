import 'dotenv/config';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL belum diisi. Salin .env.example ke .env di app/.');
process.env.DATABASE_URL = url;

export const databaseUrl = url;