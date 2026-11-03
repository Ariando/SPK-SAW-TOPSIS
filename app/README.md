# TELAAH

Telaah Kelayakan Proposal Skripsi. Aplikasi perbandingan metode pengambilan keputusan multi-kriteria untuk menilai kelayakan proposal skripsi.

Dibangun dengan Astro 7, MySQL 8, Drizzle ORM, dan better-auth.

## Prasyarat

- Node.js 22.23.4 atau lebih baru
- MySQL 8.x, atau Docker untuk menjalankan MySQL lokal
- Google Chrome, Microsoft Edge, atau Chromium, hanya bila ingin memakai ekspor PDF

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

   Perintah ini membuat ulang database, menerapkan migrasi, dan menjalankan seed. Akun bawaan: `admin` dengan kata sandi dari `SEED_ADMIN_PASSWORD`, atau nilai bawaan di `scripts/seed.ts` bila variabel itu kosong. Ganti kata sandi sebelum aplikasi dipakai di luar mesin pengembang.

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
| `npm run test:paging` | uji paginasi riwayat dan deteksi ketidakcocokan tabel hasil |
| `npm run test:kendall` | cocokkan Kendall W dengan rumus klasik yang ditulis terpisah |
| `npm run test:comparison` | uji pengaman perbandingan antar metode (Opsi A) |
| `npm run test:comparison-page` | uji halaman perbandingan dan isi berkas Excel |
| `npm run test:ties` | uji jalur seri pada perbandingan |
| `npm run test:hardening` | uji token warna, struktur aksesibel, dan seluruh halaman |
| `npm run test:tier2` | invarian lintas tujuh metode pada empat dataset |
| `npm run test:methods` | alur sebelas metode lewat HTTP, termasuk perbandingan dan Excel |
| `npm run test:ahp` | AHP dibandingkan dengan dua metode aljabar independen |
| `npm run test:ahp-http` | alur AHP lewat HTTP, termasuk validasi dan ketidakcocokan kriteria |
| `npm run test:scenario` | pemakaian skenario AHP pada perhitungan dan pencatatan di snapshot |
| `npm run test:sensitivity` | modul sensitivitas dibandingkan dengan hitung terpisah |
| `npm run test:sensitivity-http` | halaman sensitivitas, heatmap, dan integrasi skenario |
| `npm run db:restore` | pulihkan kriteria dan rubrik seed tanpa menyentuh akun |
| `npm run audit` | tiga audit aksesibilitas: UI, kontras, keyboard |
| `npm run audit:ui` | tabel tanpa nama, input tanpa label, heading, tautan mati |
| `npm run audit:contrast` | 28 pasangan warna terhadap ambang WCAG AA |
| `npm run audit:keyboard` | fokus, target sentuh, reduced motion, label menggantung |
| `npm run verify:all` | seluruh uji berurutan |
| `npm run db:reset` | buat ulang database kosong |
| `npm run db:migrate` | terapkan migrasi |
| `npm run db:seed` | isi akun admin dan kriteria contoh |
| `npm run db:seed:viewer` | buat akun peninjau contoh untuk menguji RBAC |
| `npm run db:generate` | buat berkas migrasi dari perubahan skema |
| `npm run db:studio` | buka Drizzle Studio |

`verify:all` memerlukan server pengembangan berjalan dan database yang sudah di-seed, termasuk akun peninjau. `test:ui`, `test:snapshot`, `test:paging`, `test:comparison`, `test:comparison-page`, `test:ties`, dan `test:hardening` menimpa data kriteria, alternatif, dan nilai. Tiga audit aksesibilitas tidak menyentuh database.

Bila uji dijalankan berulang dalam waktu dekat, naikkan `AUTH_LOGIN_RATE_LIMIT` di `.env` menjadi 100. Nilai default 6 percobaan per menit adalah batas untuk produksi.

Kata sandi akun awal diambil dari `SEED_ADMIN_PASSWORD` dan `SEED_VIEWER_PASSWORD` bila diisi. Bila tidak, dipakai nilai bawaan di `scripts/seed.ts` dan `scripts/seed-viewer.ts`. Uji otomatis membaca sumber yang sama lewat `scripts/test-credentials.mjs`, jadi mengganti kata sandi tidak mematahkan suite.

## Bobot AHP

Halaman `/ahp` menerima perbandingan berpasangan antar kriteria dengan skala Saaty 1/9 sampai 9. Sistem menghitung bobot lewat eigenvector, lalu melaporkan Consistency Ratio.

Sifat penting:

- Bobot disimpan sebagai **skenario**, tidak menimpa bobot kriteria di master.
- Skenario tidak konsisten tetap tersimpan tetapi ditandai, agar bisa diperiksa.
- Skenario terikat pada sidik kriteria. Bila susunan kriteria berubah, skenario ditandai tidak cocok.
- CR di bawah 0,1 berarti penilaian tidak saling bertentangan, bukan berarti penilaiannya benar.

Pemakaian bobot skenario:

- Halaman `/hitung` punya pemilih sumber bobot. Pilihan dibawa lewat `?skenario=<id>` sehingga dapat di-bookmark dan dicetak.
- Hanya skenario konsisten dan cocok dengan kriteria yang dapat dipilih.
- Hasil yang disimpan mencatat asal bobot di snapshot: sumber, id skenario, nama, dan CR. Dua run dengan sumber bobot berbeda tidak pernah dianggap setara.

## Analisis sensitivitas

Halaman `/sensitivitas` menguji apakah peringkat berubah ketika bobot kriteria digeser.

- Satu kriteria digeser pada satu waktu, naik dan turun, lalu bobot dinormalkan ulang.
- Besar geseran dapat dipilih: 5, 10, 20, 30, atau 50 persen.
- Sumber bobot dapat memakai master kriteria atau skenario AHP.
- Bobot merata tersedia sebagai pembanding untuk memeriksa ketergantungan pada pembobotan.

Keluaran: stabilitas peringkat 1, jumlah perturbasi yang mengubah urutan, kriteria paling berpengaruh, alternatif paling sensitif, heatmap perubahan peringkat, dan rincian setiap perturbasi.

Peringatan muncul otomatis bila tidak ada perubahan sama sekali, atau bila ada perturbasi yang mengganti juara. Yang kedua penting: kesimpulan tidak boleh bergantung pada satu pembobotan.

## Ekspor PDF

Empat halaman bisa diunduh sebagai PDF: detail hasil, perbandingan metode, detail skenario AHP, dan analisis sensitivitas.

Cara kerja: server memuat halaman yang sama seperti yang dilihat pengguna, lalu meminta peramban mencetaknya. Tata letak cetak tidak ditulis dua kali, sehingga berkas PDF selalu sama dengan hasil cetak peramban.

Contoh tautan:

```
/api/pdf?halaman=/hasil/12
/api/pdf?halaman=/hasil/bandingkan
/api/pdf?halaman=/ahp/3
/api/pdf?halaman=/sensitivitas?metode=topsis&delta=0.2
```

### Prasyarat

PDF dibuat memakai `puppeteer-core`, yang **tidak** membawa Chromium sendiri. Salah satu peramban berikut harus terpasang:

- Google Chrome
- Microsoft Edge
- Chromium

Bila peramban berada di lokasi tidak lazim, set variabel lingkungan:

```
PUPPETEER_EXECUTABLE_PATH=C:\path\to\chrome.exe
```

Tanpa peramban, endpoint mengembalikan status 503 dengan pesan yang menjelaskan. Halaman lain tetap berfungsi normal.

### Batasan

| Batasan | Keterangan |
|---|---|
| Hanya path internal | parameter `halaman` harus diawali `/hasil/`, `/ahp/`, atau `/sensitivitas`. URL eksternal dan path traversal ditolak dengan status 400 |
| Wajib login | endpoint memerlukan sesi, sama seperti halaman lain |
| Sinkron | pembuatan PDF menahan permintaan 1 sampai 2 detik. Memadai untuk aplikasi lokal |
| Berkas diunduh | header `content-disposition: attachment`, jadi berkas tersimpan, bukan dibuka di tab |

### Uji

```
npm run test:pdf
npm run test:pdf-content
npm run test:pdf-text
```

`test:pdf` memeriksa keamanan endpoint, header, dan tanda tangan berkas. `test:pdf-content` memeriksa struktur dan ukuran. `test:pdf-text` membandingkan teks halaman yang dirender terhadap isi yang seharusnya muncul.

## Aksesibilitas

Tiga audit bisa dijalankan tanpa server:

```
npm run audit
```

| Pemeriksaan | Cakupan |
|---|---|
| UI | tabel wajib bernama lewat caption atau aria-labelledby, input wajib berlabel, satu h1 per halaman, tanpa tautan mati, gambar beralt |
| Kontras | 28 pasangan warna diuji terhadap 4,5:1 untuk teks dan 3:1 untuk komponen |
| Keyboard | tanpa outline yang dihapus, ada `:focus-visible`, target sentuh 44 piksel, `prefers-reduced-motion`, label menunjuk id yang ada |

Token warna yang dipakai:

| Token | Nilai | Rasio terendah |
|---|---|---|
| `--ink` | #1b1d2a | 15,47:1 |
| `--ink-muted` | #5a5f70 | 5,88:1 |
| `--ink-faint` | #676c7c | 4,84:1 |
| `--accent` | #2f318b | 9,20:1 |
| `--line-strong` | #7e8499 | 3,44:1 (komponen) |

## Akun

| Peran | Hak |
|---|---|
| Pengelola | membaca dan mengubah seluruh data |
| Peninjau | hanya membaca, tanpa menu akun dan tanpa tombol ubah |

Pendaftaran mandiri dinonaktifkan. Akun hanya dibuat lewat `db:seed`, `db:seed:viewer`, atau kode di `src/lib/user-service.ts`.

## Metode yang tersedia

| Metode | Pendekatan | Arah nilai |
|---|---|---|
| SAW | normalisasi proporsional lalu penjumlahan terbobot | terbesar terbaik |
| WP | perkalian berpangkat dengan bobot ternormalisasi | terbesar terbaik |
| TOPSIS | jarak ke solusi ideal positif dan negatif | terbesar terbaik |
| WASPAS | gabungan penjumlahan dan perkalian dengan lambda | terbesar terbaik |
| MOORA | rasio akar jumlah kuadrat, selisih benefit dan cost | terbesar terbaik |
| COPRAS | proporsi S+ dan S-, menyeimbangkan benefit dan cost | terbesar terbaik |
| VIKOR | indeks kompromi dari jarak total dan jarak terburuk | **terkecil terbaik** |
| EDAS | jarak positif dan negatif terhadap rata-rata | terbesar terbaik |
| ARAS | derajat utilitas terhadap solusi optimal hipotetis | terbesar terbaik |
| MABAC | jarak terhadap batas perkiraan per kriteria | terbesar terbaik |
| SMART | utilitas ternormalisasi 0 sampai 1 dengan bobot | terbesar terbaik |

WASPAS menerima parameter `lambda` dan VIKOR menerima `v`, keduanya 0 sampai 1 dengan nilai bawaan 0,5. Parameter disimpan di jejak perhitungan sehingga hasil dapat direproduksi.

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