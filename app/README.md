# TELAAH

Telaah Kelayakan Proposal Skripsi. Aplikasi perbandingan metode pengambilan keputusan multi-kriteria untuk menilai kelayakan proposal skripsi.

Dibangun dengan Astro 7, MySQL 8, Drizzle ORM, dan better-auth.

## Prasyarat

- Node.js 22.23.4 atau lebih baru
- MySQL 8.x, atau Docker untuk menjalankan MySQL lokal

## Menyiapkan lingkungan lokal

1. Pasang dependensi:

   ```
   npm install
   ```

2. Siapkan MySQL. Bila memakai Docker:

   ```
   docker run -d --name telaah-mysql -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=telaah -p 3307:3306 mysql:8.4
   ```

3. Salin konfigurasi lingkungan:

   ```
   cp .env.example .env
   ```

   Sesuaikan `DATABASE_URL`, `BETTER_AUTH_SECRET` minimal 32 karakter, dan `BETTER_AUTH_URL`.

4. Siapkan database, migrasi, dan data awal:

   ```
   npm run db:setup
   ```

   Perintah ini membuat ulang database, menerapkan migrasi, dan menjalankan seed. Akun bawaan: `admin` dengan kata sandi `TelaahAdmin2026`. Ganti kata sandi setelah login pertama.

5. Jalankan server pengembangan:

   ```
   npm run dev
   ```

   Aplikasi tersedia di `http://localhost:4321`.

## Perintah

| Perintah | Kegunaan |
|---|---|
| `npm run dev` | server pengembangan |
| `npm run build` | build produksi |
| `npm start` | jalankan hasil build |
| `npm run check` | typecheck Astro dan TypeScript |
| `npm test` | unit test engine DSS |
| `npm run test:auth` | uji keamanan autentikasi, termasuk penolakan pendaftaran publik |
| `npm run test:http` | uji alur HTTP dasar, termasuk login dan guard |
| `npm run test:p0` | uji halaman rubrik, halaman akun, dan RBAC peninjau |
| `npm run test:crud` | uji CRUD dan perhitungan lewat HTTP |
| `npm run test:ui` | tanam dataset F0 lalu bandingkan angka halaman hitung dengan fixture |
| `npm run test:snapshot` | uji sidik snapshot: stabilitas hash dan deteksi perubahan isi |
| `npm run verify:all` | seluruh uji berurutan |
| `npm run db:reset` | buat ulang database kosong |
| `npm run db:migrate` | terapkan migrasi |
| `npm run db:seed` | isi akun admin dan kriteria contoh |
| `npm run db:seed:viewer` | buat akun peninjau contoh untuk menguji RBAC |
| `npm run db:generate` | buat berkas migrasi dari perubahan skema |
| `npm run db:studio` | buka Drizzle Studio |

`verify:all` memerlukan server pengembangan berjalan dan database yang sudah di-seed, termasuk akun peninjau. `test:ui` dan `test:snapshot` menimpa data kriteria, alternatif, dan nilai, jadi keduanya dijalankan paling akhir.

Bila uji dijalankan berulang dalam waktu dekat, naikkan `AUTH_LOGIN_RATE_LIMIT` di `.env` menjadi 100. Nilai default 6 percobaan per menit adalah batas untuk produksi.

## Akun

| Peran | Hak |
|---|---|
| Pengelola | membaca dan mengubah seluruh data |
| Peninjau | hanya membaca, tanpa menu akun dan tanpa tombol ubah |

Pendaftaran mandiri dinonaktifkan. Akun hanya dibuat lewat `db:seed`, `db:seed:viewer`, atau kode di `src/lib/user-service.ts`.

## Metode yang tersedia

| Metode | Keluaran | Rentang nilai |
|---|---|---|
| SAW | penjumlahan terbobot setelah normalisasi proporsional | 0 sampai total bobot |
| WP | perkalian berpangkat dengan bobot ternormalisasi | 0 sampai 1, jumlah 1 |
| TOPSIS | kedekatan relatif ke solusi ideal | 0 sampai 1 |

Setiap perhitungan menampilkan jejak langkah lengkap, bukan hanya nilai akhir. Hasil disimpan sebagai snapshot immutable dengan sidik SHA-256, sehingga laporan lama tetap dapat dibuka walau data master berubah.

## Struktur

```
src/
  pages/            rute halaman
  actions/          mutasi dengan validasi Zod
  db/               skema Drizzle dan koneksi
  lib/
    dss/            engine SAW, WP, TOPSIS
    queries.ts      pembacaan data
    runs.ts         snapshot dan riwayat
  layouts/          kerangka halaman
  styles/           gaya global dan cetak
scripts/            seed, reset, dan uji HTTP
drizzle/            berkas migrasi SQL
```

Dokumentasi rumus dan verifikasi: `../docs/reference/rumus-saw-wp-topsis.md`.
Rencana migrasi: `../docs/plan-migrasi-astro.md`.