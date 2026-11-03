// Memulihkan kriteria dan rubrik ke keadaan seed tanpa menyentuh akun.
// Dijalankan: npm run db:restore
//
// Dipakai setelah menjalankan suite uji destruktif di luar urutan baku, karena
// beberapa suite memotong tabel kriteria, rubrik, alternatif, dan nilai.
// `verify:all` sudah menaruh suite destruktif di akhir, jadi perintah ini hanya
// diperlukan bila suite dijalankan satu per satu secara manual.

import 'dotenv/config';
import mysql from 'mysql2/promise';
import { restoreSeedState, SEED_CRITERIA, SEED_SCALE } from './test-data';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL belum diisi di app/.env');

const connection = await mysql.createConnection({ uri: databaseUrl });

try {
  await restoreSeedState(connection);
  console.log(
    'dipulihkan: ' + SEED_CRITERIA.length + ' kriteria, ' + SEED_CRITERIA.length * SEED_SCALE.length + ' rubrik'
  );
  console.log('akun tidak disentuh');
} finally {
  await connection.end();
}
