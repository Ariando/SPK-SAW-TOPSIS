## TELAAH

Aplikasi Astro 7 full-stack dengan MySQL. Bahasa antarmuka Indonesia, satu tema terang.

## Development

Jalankan server dengan mode background dari folder `app`:

```
npm run dev
```

Perintah lain: `npm run check`, `npm test`, `npm run test:http`, `npm run test:crud`, `npm run test:ui`, `npm run verify:all`.

Database lokal berjalan di Docker, container `telaah-mysql`, port 3307. Nama database `telaah`.

## Aturan kerja

- Semua angka perhitungan lewat `src/lib/dss/`. Jangan menaruh rumus di halaman atau action.
- Setiap metode mengembalikan `TraceStep[]`. Tampilan memakai `StepTable.astro`, jangan membuat tabel per metode.
- Mutasi data hanya lewat action di `src/actions/index.ts`, dengan validasi Zod dan pemeriksaan role admin.
- Jangan menulis hasil perhitungan saat render. Hasil hanya ditulis lewat `runs.save`.
- Nilai desimal disimpan sebagai string desimal (`toFixed`) agar presisi MySQL tidak berubah.
- Semua teks antarmuka Indonesia, tanpa em dash. Angka diformat lewat `src/lib/format.ts`.
- Jangan mengubah `docs/reference/dataset-demo-f0.json` tanpa menjalankan ulang `check-invariants.mjs` dan `check-validity.mjs`.

## Documentation

Astro: https://docs.astro.build
Drizzle: https://orm.drizzle.team
better-auth: https://www.better-auth.com/docs