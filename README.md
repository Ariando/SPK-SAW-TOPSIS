# TELAAH

Telaah Kelayakan Proposal Skripsi. Aplikasi perbandingan metode pengambilan keputusan multi-kriteria untuk menilai kelayakan proposal skripsi.

Repositori ini berisi dua bagian:

| Folder | Isi |
|---|---|
| `app/` | aplikasi Astro 7 dengan MySQL, Drizzle ORM, dan better-auth |
| `docs/` | rencana migrasi, rumus yang dipakai, dan dataset verifikasi |

Kode lama CodeIgniter sudah dihapus. Rumusnya diekstrak lebih dulu ke `docs/reference/rumus-saw-wp-topsis.md`, dan setiap penyimpangan implementasi lama dicatat sebelum kode baru ditulis.

## Menjalankan

Panduan lengkap ada di `app/README.md`. Ringkasnya:

```
cd app
npm install
npm run db:setup
npm run dev
```

Aplikasi terbuka di `http://localhost:4321`.

Prasyarat: Node.js 22 atau lebih baru, dan MySQL 8. Untuk Docker:

```
docker run -d --name telaah-mysql -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=telaah -p 3307:3306 mysql:8.4
```

## Metode

| Metode | Status |
|---|---|
| SAW, WP, TOPSIS | tersedia |
| WASPAS, MOORA, COPRAS, VIKOR | tersedia |
| EDAS, ARAS, MABAC, SMART | tersedia |
| AHP crisp | tersedia, bobot dapat dipakai pada perhitungan |
| Fuzzy AHP | direncanakan |

Perbandingan antar metode memakai Borda, korelasi Spearman, dan koefisien kesepakatan Kendall W, dengan koreksi seri.

Analisis sensitivitas menguji ketahanan peringkat ketika bobot kriteria digeser, termasuk heatmap perubahan peringkat dan pembanding bobot merata.

## Dokumentasi

- `docs/plan-migrasi-astro.md`: keputusan, fase, dan status pekerjaan.
- `docs/reference/rumus-saw-wp-topsis.md`: rumus per langkah, temuan pada kode lama, dan prosedur verifikasi.
- `docs/reference/dataset-demo-f0.json`: dataset verifikasi dengan nilai harapan.
- `docs/reference/perhitungan-manual.xlsx`: lembar hitung independen untuk memeriksa angka.

## Verifikasi

```
cd app
npm run verify:all
```

Perintah itu menjalankan unit test, uji keamanan autentikasi, uji CRUD, uji paritas angka terhadap dataset verifikasi, uji sidik snapshot, uji paginasi, serta uji perbandingan metode termasuk jalur seri. Seluruhnya memerlukan server pengembangan berjalan dan database yang sudah di-seed.