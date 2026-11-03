# Plan Migrasi: CodeIgniter 3 ke Astro + MySQL

Status: keputusan pemilik produk terkunci, siap eksekusi.
Tanggal: 2026-10-23.
Ruang lingkup: aplikasi SPK perbandingan metode DSS untuk seleksi kelayakan proposal skripsi.

---

## 0. Keputusan pemilik produk (terkunci)

| Kode | Keputusan | Konsekuensi |
|---|---|---|
| D1 | **Big Bang** | Tidak ada jalan paralel. Aplikasi lama tidak dijalankan. Kode lama hanya dipakai sebagai referensi rumus lalu dipensiunkan |
| D2 | **Data baru dan bersih** | Tanpa importer. Seed memuat akun admin dan data contoh yang ditandai sebagai data demo |
| D3 | **Drizzle ORM** | `src/db/schema.ts` + `drizzle-kit`, driver `mysql2` |
| D4 | **better-auth** | Sesi dan hash password dikelola library |
| D5 | Arah visual **A, institusional tenang** | Dial ENERGY 1 / RHYTHM 2 / MOTION 1 |
| D6 + S4 | **Hanya terang, tanpa dark mode** | Satu tema, tidak ada toggle, alasan di bagian 6 |
| D7 | Deploy **lokal** | Node lokal + MySQL lokal, tanpa konfigurasi server produksi |
| D8 | Tier 2: **WASPAS, MOORA, COPRAS, VIKOR, EDAS, ARAS, MABAC, SMART** | Delapan metode, fase F9 |
| D9 | **AHP dan Fuzzy AHP** fase terpisah | `inputMode: 'pairwise'`, fase F10 |
| D10 | **Perbandingan metode di rilis pertama** | Borda, Spearman, Kendall W masuk F7. Sensitivitas bobot setelahnya |
| D11 | **Print + Excel** dulu, PDF menyusul | CSS print + `exceljs`, dompdf tidak dibawa |
| D12 | Antarmuka **Indonesia** | Tanpa i18n, format angka `id-ID` |
| S1 | **Logo dipakai ulang** | `assets/img/logo-akprind.png` disalin ke `app/public/brand/logo-akprind.png` |
| S2 | **Aksen institusi** | Indigo dari logo, detail di bagian 6 |
| S3 | **TELAAH** (Telaah Kelayakan Proposal Skripsi) | Dipakai di judul halaman, header, laporan cetak, dan nama file ekspor. Tidak ada lagi penanda `[NAMA APLIKASI]` |

Konsekuensi penting dari Big Bang: **tidak ada lagi uji paritas otomatis**. Aplikasi lama tidak dijalankan, jadi tidak ada oracle pembanding. Kompensasinya ada di 4.4 dan risiko baru di bagian 8: fixture dihitung manual dari contoh literatur, ditambah lembar verifikasi independen.

---

## 1. Kondisi awal repo

| Aspek | Kondisi |
|---|---|
| Framework lama | CodeIgniter 3, PHP, MVC, semua logika hitung di dalam view 1092 baris |
| Metode lama | SAW, WP, TOPSIS |
| Database lama | `spk_saw_topsis_ci`, tidak ada file `.sql` di repo |
| Core CI3 | folder `system/` tidak ada, aplikasi lama tidak bisa dijalankan |
| Dompdf | folder `vendor/` tidak ada |
| Auth lama | `md5()`, guard hanya di view |
| Toolchain terpasang | Node 24.16.0, npm 11.13.0, PHP 8.3, composer tidak ada |
| Repo | git aktif, riwayat 10 commit, working tree bersih kecuali `.kilo/` |

Karena aplikasi lama tidak perlu berjalan, ketiadaan `system/` dan `vendor/` tidak lagi menjadi blocker. Kode lama tetap dibaca untuk mengambil rumus, dan itu satu-satunya perannya.

---

## 2. Struktur kerja

Aplikasi baru dibangun di subfolder `app/`, bukan menimpa root. Alasannya: kode lama masih diperlukan sebagai rujukan rumus selama F5 sampai F7, dan penghapusan bisa dilakukan sekali di akhir tanpa kehilangan konteks.

```
/                                root repo
  application/, index.php, ...   kode lama, read-only, dihapus di F8
  assets/img/logo-akprind.png    sumber logo
  docs/
    plan-migrasi-astro.md        dokumen ini
    reference/
      perhitungan-manual.xlsx    lembar verifikasi independen
      rumus-saw-wp-topsis.md     ekstraksi rumus dari kode lama + sumber literatur
  app/                           aplikasi Astro baru
```

Isi `app/`:

```
src/
  pages/
    index.astro
    login.astro
    dashboard.astro
    kriteria/index.astro, [id]/edit.astro
    rubrik/index.astro
    alternatif/index.astro, baru.astro, [id]/edit.astro
    penilaian/index.astro
    hitung/[metode].astro
    hasil/[runId].astro
    hasil/bandingkan.astro
  actions/index.ts
  db/schema.ts, client.ts, seed.ts
  lib/
    auth.ts, rbac.ts
    dss/
      types.ts, registry.ts, normalize.ts
      saw.ts, wp.ts, topsis.ts
      waspas.ts, moora.ts, copras.ts, vikor.ts
      edas.ts, aras.ts, mabac.ts, smart.ts
      ranking.ts          dense ranking, Borda, Spearman, Kendall W
      __tests__/
    export/excel.ts
  components/
    StepTable.astro, MatrixTable.astro, RankTable.astro,
    WeightTotalNotice.astro, EmptyState.astro
  layouts/Base.astro, App.astro
  middleware.ts
  styles/global.css, print.css
public/brand/logo-akprind.png
drizzle/
scripts/seed-demo.ts
```

Stack: Astro 5 `output: 'server'` + `@astrojs/node` standalone, TypeScript strict, Drizzle + `mysql2`, better-auth, Zod, Vitest, `exceljs`.

Mutasi lewat Astro Actions. Interaktivitas klien hanya editor matriks nilai, pemilih metode, dan grafik ranking.

---

## 3. Model data

```sql
users (
  id, name, username UNIQUE, email UNIQUE,
  password_hash, role ENUM('admin','viewer'),
  is_active, created_at, updated_at
)

sessions ( ... )                     -- dikelola better-auth

criteria (
  id, code VARCHAR(8) UNIQUE, name VARCHAR(120),
  weight DECIMAL(10,4), direction ENUM('benefit','cost'),
  sort_order INT
)

rubrics (
  id, criterion_id FK, label VARCHAR(160),
  value DECIMAL(12,4), sort_order INT
)

alternatives (
  id, code VARCHAR(16) UNIQUE, title VARCHAR(255),
  student_name VARCHAR(160), nim VARCHAR(24),
  concentration VARCHAR(120) NULL, is_active, created_at
)

scores (
  id, alternative_id FK, criterion_id FK,
  rubric_id FK NULL, value DECIMAL(12,4),
  UNIQUE (alternative_id, criterion_id)
)

computation_runs (
  id, method VARCHAR(24), snapshot JSON,
  snapshot_hash CHAR(64), created_by FK, created_at
)

computation_results (
  id, run_id FK, alternative_id FK,
  score DECIMAL(18,8), rank_no INT
)

settings (
  id, key_name VARCHAR(64) UNIQUE,
  value TEXT, updated_at
)
```

Alasan perubahan dari skema lama:

- `scores.value` menyimpan angka, bukan ID sub kriteria. Rubrik hanya membantu pengisian, tidak mengunci nilai.
- `computation_runs.snapshot` menyimpan seluruh input, sehingga hasil lama tetap bisa dibuka walau master data berubah. Menggantikan pola lama yang menimpa tabel hasil setiap halaman dibuka.
- Tabel `nilai_pangkat` dan `normalisasi_terbobot` tidak dibawa. Keduanya nilai antara, sekarang bagian dari langkah perhitungan di memori.
- Perhitungan tidak menulis ke database saat render. Penulisan hanya pada aksi eksplisit "Simpan hasil".

---

## 4. Engine DSS

### 4.1 Kontrak

```ts
export type Direction = 'benefit' | 'cost';

export interface Criterion {
  id: number;
  code: string;
  name: string;
  weight: number;
  direction: Direction;
}

export interface Alternative {
  id: number;
  code: string;
  title: string;
}

export interface DssInput {
  criteria: Criterion[];
  alternatives: Alternative[];
  values: number[][];
  options?: Record<string, unknown>;
}

export interface TraceStep {
  key: string;
  title: string;
  formula?: string;
  columns: string[];
  rows: (string | number)[][];
  note?: string;
}

export interface DssResult {
  method: string;
  steps: TraceStep[];
  scores: { alternativeId: number; value: number }[];
  ranking: { alternativeId: number; rank: number; value: number; tied: boolean }[];
  warnings: string[];
}

export interface DssMethod {
  id: string;
  label: string;
  inputMode: 'matrix' | 'pairwise';
  compute(input: DssInput): DssResult;
}
```

UI tidak menghardcode tabel per metode. Satu `StepTable.astro` merender semua `TraceStep`. Menambah metode = satu file + satu entri registry.

### 4.2 Urutan metode

| Tier | Metode | Fase |
|---|---|---|
| 1 | SAW, WP, TOPSIS | F5 |
| 2 | WASPAS, MOORA, COPRAS, VIKOR, EDAS, ARAS, MABAC, SMART | F9 |
| 3 | AHP, Fuzzy AHP (input pairwise) | F10 |
| 4 | PROMETHEE, ELECTRE | di luar plan, belum diputuskan |

### 4.3 Penanganan kasus tepi

- Pembagi nol pada kriteria cost atau vektor normalisasi nol: nilai 0 ditangani eksplisit, `warnings` diisi, bukan NaN.
- Bobot: validasi total, peringatan bila bukan 1, tawaran normalisasi otomatis sebelum hitung.
- Seri: dense ranking dengan penanda `tied`.
- Presisi: hitung `number`, bulatkan saat tampil 4 desimal, simpan 8 desimal, epsilon 1e-9 untuk perbandingan.
- Sel kosong: ditolak sebelum hitung, pesan per alternatif dan kriteria.
- Bobot negatif atau kriteria tanpa bobot: ditolak di validasi Zod dan di engine.

### 4.4 Verifikasi tanpa baseline lama

Karena Big Bang mematikan pembanding, kebenaran angka bergantung pada tiga sumber:

1. **Fixture manual per metode.** Nilai dihitung tangan langkah demi langkah, ditulis di komentar fixture, lalu dijadikan ekspektasi Vitest. Minimal satu fixture per metode memakai contoh dari literatur (misalnya contoh SAW dan WP pada Kusumadewi, contoh TOPSIS pada Hwang dan Yoon), supaya bukan hanya cocok dengan dirinya sendiri.
2. **Lembar verifikasi independen** `docs/reference/perhitungan-manual.xlsx`: rumus yang sama disusun ulang di spreadsheet untuk dataset demo. Angka spreadsheet dibandingkan dengan output aplikasi saat F5 selesai. Ini pengganti oracle otomatis, dijalankan manual sekali per metode.
3. **Invarian numerik** yang diuji otomatis: jumlah bobot ternormalisasi = 1, skor berada pada rentang yang sah per metode, urutan ranking konsisten setelah data diskalakan dengan konstanta positif, dan alternatif identik memperoleh skor identik.

Ekstraksi rumus dari kode lama dilakukan di F0 dan ditulis ke `docs/reference/rumus-saw-wp-topsis.md`, termasuk catatan penyimpangan yang ditemukan. Satu penyimpangan yang sudah terlihat: kode lama menghitung matriks ternormalisasi TOPSIS dengan membagi bobot dikali nilai terhadap akar jumlah kuadrat, sehingga solusi ideal diambil dari nilai terbobot. Ini perlu dipastikan sesuai definisi yang dipakai di laporan, bukan diwarisi diam-diam.

---

## 5. Ide (status final)

| Kode | Ide | Status |
|---|---|---|
| I1 | Jejak perhitungan dirender dari `TraceStep` | diambil, F5 |
| I2 | Perbandingan metode: Borda, Spearman, Kendall W | diambil, F7 |
| I3 | Riwayat perhitungan dengan snapshot immutable | diambil, F6 |
| I4 | Analisis sensitivitas bobot | F11 |
| I5 | Editor matriks nilai; CSV | editor diambil, CSV opsional |
| I6 | Rubrik sebagai bantuan input | diambil, F3 |
| I7 | Validasi dan normalisasi bobot | diambil, F3 |
| I8 | Print + Excel; PDF | diambil, F7. PDF di F11 |
| I9 | Periode atau batch | ditunda |
| I10 | Hasil publik read-only | ditunda |
| I11 | Audit log | ditunda |
| I12 | Tema | terang saja |

---

## 6. Arah visual (A, institusional tenang)

Dial: **ENERGY 1 / RHYTHM 2 / MOTION 1**. RHYTHM 2 berarti sebagian besar halaman tenang dan seragam karena memang alat kerja, tetapi halaman hasil dan perbandingan punya komposisi berbeda dari halaman input.

### 6.1 Palet

Aksen diambil dari logo institusi, bukan dikarang:

| Peran | Nilai | Alasan |
|---|---|---|
| Aksen utama | `#2F318B` (indigo logo) | warna dominan logo, kontras 10,9:1 di atas putih, lolos WCAG AAA untuk teks normal, aman untuk tombol dan tautan |
| Netral teks | `#1B1D2A` sampai `#5A5F70` | hierarki teks tabel tanpa mengandalkan warna |
| Latar | `#FFFFFF` dan `#F5F6F9` | tabel panjang, dicetak, kontras stabil |
| Garis | `#D8DAE4` | pemisah baris tabel, bukan dekorasi |
| Detail institusi | `#FFF000` (kuning logo) | hanya sebagai garis 3 piksel di bawah bilah atas dan pemisah header cetak. Tidak pernah untuk teks karena kontras 1,1:1 di atas putih |

Tiga warna inti + satu aksen, sesuai batas palet. Hijau dan biru logo tidak dipakai sebagai warna antarmuka karena akan memecah hierarki.

### 6.2 Tipografi dan motif

- Satu keluarga sans untuk teks, angka tabular untuk seluruh tabel perhitungan, skala ukuran terbatas (13/15/18/24/32).
- Nama produk dan judul halaman memakai bobot tebal, bukan ukuran raksasa.
- Motif identitas: **blok matriks bernomor**, yaitu penanda baris dan kolom berindeks (`A1`, `C1`) dengan latar netral tipis, dipakai konsisten di semua tabel langkah perhitungan, tabel hasil, dan cetak. Ini yang membuat halaman perhitungan punya ciri, bukan gradien atau kartu.
- Tanpa animasi masuk. Hanya transisi hover dan fokus, durasi 120 ms.

### 6.3 Nama produk: TELAAH

| Item | Nilai |
|---|---|
| Nama | **TELAAH** |
| Kepanjangan | Telaah Kelayakan Proposal Skripsi |
| Pemakaian | judul halaman (`TELAAH - <halaman>`), header sidebar, header laporan cetak, footer Excel, judul PDF |
| Tidak dipakai | akronim di dalam kalimat antarmuka, agar tidak terbaca sebagai singkatan lembaga lain |

Aturan penulisan: TELAAH selalu kapital penuh saat berdiri sebagai nama produk, dan ditulis biasa saat merujuk pekerjaan telaah. Tidak ada maskot, ikon buatan, atau varian logo TELAAH. Logo yang dipakai tetap logo institusi dari S1, dengan nama TELAAH sebagai teks di sebelahnya.

### 6.4 Cetak

Stylesheet terpisah, A4 portrait, header tabel berulang antar halaman, angka tidak terpotong, logo hitam-putih kecil di header, footer berisi nama metode, waktu hitung, dan hash snapshot.

---

## 7. Fase pekerjaan

### F0. Ekstraksi rumus dan verifikasi referensi (SELESAI 2026-10-23)
- Baca `application/views/perhitungan/perhitungan.php` dan `Perhitungan_model.php`, tulis rumus SAW, WP, TOPSIS ke `docs/reference/rumus-saw-wp-topsis.md` beserta sumber literatur.
- Catat penyimpangan implementasi lama yang tidak boleh diwarisi (contoh: solusi ideal TOPSIS dari nilai terbobot, pembulatan di tengah langkah, pembagian tanpa guard).
- Susun `docs/reference/perhitungan-manual.xlsx` untuk dataset demo.

Kriteria selesai: dokumen rumus lengkap per langkah, spreadsheet menghasilkan angka untuk dataset demo.

Hasil F0:

| Artefak | Isi |
|---|---|
| `docs/reference/rumus-saw-wp-topsis.md` | definisi rumus per langkah, pemetaan ke baris kode lama, 10 temuan (T1-T10), angka acuan, prosedur verifikasi |
| `docs/reference/dataset-demo-f0.json` | fixture 4 kriteria, 4 alternatif, nilai harapan ketiga metode dengan presisi 10 desimal |
| `docs/reference/generate-fixture.mjs` | generator fixture, mereproduksi JSON di atas |
| `docs/reference/check-invariants.mjs` | 12 pemeriksaan invarian, semua lolos |
| `docs/reference/perhitungan-manual.xlsx` | workbook 4 sheet dengan formula aktif, nilai sudah dihitung dan cocok dengan fixture |
| `docs/reference/generate-workbook.mjs` | generator workbook lewat exceljs |
| `docs/reference/verify-workbook.ps1` | pembaca nilai workbook lewat Excel COM, dipakai untuk membuktikan angka |

Keputusan rumus yang mengikat F5, hasil temuan T1 sampai T10:

1. Tanpa pembulatan antara. Hitung penuh, bulatkan saat tampil (4 desimal) dan simpan (8 desimal). Ini membatalkan perilaku lama yang membulatkan `r`, `y`, `D+`, `D-` bertahap.
2. Dense ranking dengan penanda `tied`, bukan nomor urut posisi.
3. Presisi simpan seragam 8 desimal untuk semua metode.
4. Tidak ada penulisan hasil saat render. Hasil hanya ditulis pada aksi simpan eksplisit.
5. Input tidak lengkap ditolak sebelum hitung, tanpa `@` dan tanpa NaN/INF.
6. Bobot selalu dinormalisasi untuk tampilan angka antara, dengan peringatan bila total bukan 1.
7. Nilai disimpan sebagai angka di `scores.value`, rubrik hanya bantuan input.
8. Parameter terikat lewat Drizzle, tanpa string SQL.
9. Import tak terpakai dibuang.
10. Solusi ideal TOPSIS tetap dihitung dari `Y`, sesuai Hwang dan Yoon. Ini bukan penyimpangan.

Verifikasi angka F0:

| Pemeriksaan | Hasil |
|---|---|
| Workbook dihitung ulang di Excel | total bobot 1, semua formula menghasilkan nilai |
| Workbook vs fixture | cocok pada 6 desimal untuk SAW, WP, TOPSIS |
| Invarian numerik (12 butir) | semua lolos |
| Peringkat acuan | SAW 1-3-2-4, WP 1-2-3-4, TOPSIS 1-2-3-4 |

### F1. Fondasi `app/` (SELESAI 2026-10-23)
- Scaffold Astro + TypeScript strict + `@astrojs/node` mode standalone.
- Drizzle + `mysql2` + `drizzle-kit`, `.env` divalidasi `astro:env`.
- Skema 11 tabel + migrasi awal + seed admin dan kriteria contoh.
- Layout `Base` dan `App`, halaman login, middleware session.

Kriteria selesai: `npm run dev` jalan, `npm run db:migrate` sukses di DB kosong, login tampil. **Tercapai.** Versi terpasang: Astro 7.4.2, @astrojs/node 11.1.9, better-auth 1.7.12, drizzle-orm 0.45.4, drizzle-kit 0.31.11, mysql2 3.24.6, zod 4.6.7, vitest 5.0.5, TypeScript 6.0.3. Database lokal berjalan di MySQL 8.4.13 lewat Docker, port 3307, nama database `telaah`.

### F2. Autentikasi dan otorisasi (SELESAI 2026-10-23)
- better-auth dengan plugin username, cookie httpOnly, sameSite lax.
- Middleware mengisi `locals.user`, mengalihkan tamu ke `/login`, mengalihkan pengguna aktif dari `/login` ke `/dashboard`.
- Rate limit login 6 percobaan per menit, pesan error tidak membocorkan akun mana yang salah.
- Setiap action memeriksa role admin.

Kriteria selesai: login, logout, sesi kedaluwarsa, pengguna nonaktif ditolak. **Tercapai**, dibuktikan `scripts/smoke-http.mjs` 19 butir.

Catatan temuan: rate limit better-auth dihitung per IP dan sempat memblokir uji otomatis berulang. Untuk pengembangan, uji dijalankan dengan jeda 60 detik atau sekali pakai. Di produksi nilai ini justru yang diinginkan.

### F3. Master data (SELESAI 2026-10-23)
- Kriteria: CRUD, validasi Zod, kode unik, peringatan total bobot, aksi normalisasi.
- Alternatif: CRUD, aktif/nonaktif, penanda jumlah nilai terisi.
- Rubrik: halaman kelola di `/kriteria/[id]/rubrik` dengan tambah, ubah, dan hapus per baris. Rubrik tetap bersifat bantuan, tidak mengunci nilai.
- Akun: halaman `/pengguna` menampilkan daftar akun, peran, status, dan waktu pembuatan. Hanya baca, hanya untuk pengelola.

Kriteria selesai: CRUD kriteria, alternatif, dan rubrik lengkap, data tidak valid ditolak dengan pesan jelas. **Tercapai.**

Catatan P0 yang dikerjakan setelah F3:
1. Tautan `/kriteria/[id]/rubrik` yang sebelumnya 404 kini berfungsi penuh.
2. Tautan `/pengguna` di navigasi yang sebelumnya 404 kini halaman daftar akun read-only.
3. Cacat keamanan ditemukan dan diperbaiki: pendaftaran publik `/api/auth/sign-up` sebelumnya terbuka dan membuat akun aktif dengan peran peninjau. Sekarang ditutup dengan `disableSignUp: true`. Akun hanya lahir dari `src/lib/user-service.ts`, yang dipakai seed dan nantinya halaman pengelolaan akun.
4. Rate limit login dijadikan konfigurabel lewat `AUTH_LOGIN_RATE_LIMIT` (default 6 untuk produksi) agar uji otomatis tidak saling memblokir.

### F4. Penilaian (SELESAI 2026-10-23)
- Editor matriks satu sel per form, tersimpan mandiri, tidak menimpa nilai lain.
- Penghitung sel terisi dan peringatan sel kosong sebelum hitung.
- Aksi `scores.clearRow` untuk mengosongkan satu baris.

Kriteria selesai: matriks lengkap tersimpan, sel kosong terdeteksi. **Tercapai.**

Catatan temuan: input `values[<id>]` yang dikirim sebagai form-urlencoded tidak terbaca oleh skema `z.record` di Astro Actions (respons 400). Jalur yang dipakai akhirnya satu action per sel, yang juga lebih aman terhadap kehilangan data.

Kriteria selesai: CRUD lengkap, data tidak valid ditolak dengan pesan jelas.

### F5. Engine tier 1 (SELESAI 2026-10-23)
- `types.ts` dengan `prepareInput`, `rankScores`, `buildResult`, `DssValidationError`; `registry.ts`; `saw.ts`; `wp.ts`; `topsis.ts`.
- Setiap metode mengembalikan `TraceStep[]`, sehingga satu komponen `StepTable.astro` merender semua langkah.
- Unit test 21 butir di `src/lib/dss/__tests__/`: 4 uji paritas fixture, 17 uji invarian dan validasi.
- Halaman `/hitung/[metode]` merender seluruh jejak langkah, peringkat, dan peringatan bobot.

Kriteria selesai: semua test lulus, selisih terhadap fixture maksimal 0,0001. **Tercapai.** Paritas terhadap fixture F0 dibuktikan dua kali: lewat unit test Vitest dan lewat perbandingan angka yang dirender halaman (`scripts/verify-ui-numbers.mjs`, 9 butir lolos, nilai dan urutan peringkat ketiga metode cocok).

Catatan implementasi yang berbeda dari rencana:
- `normalize.ts` tidak dibuat terpisah, fungsinya masuk ke `prepareInput` di `types.ts` agar validasi dan normalisasi tidak terpisah dari kontrak.
- Metode cost dengan nilai nol ditolak di validasi, bukan diisi nol, karena `r = min/x` tidak terdefinisi.

### F6. Riwayat dan penyimpanan hasil (SELESAI 2026-10-23)
- Aksi `runs.save` membangun snapshot immutable, menghitung SHA-256, menulis `computation_runs` dan `computation_results` dalam satu alur.
- Halaman `/hasil` menampilkan riwayat, halaman `/hasil/[id]` membuka hasil dari snapshot, bukan dari data master terkini.
- Snapshot memuat kriteria, bobot asli, matriks nilai, peringkat, dan peringatan.

Kriteria selesai: hasil tetap konsisten setelah master data diubah. **Tercapai.** Dibuktikan `scripts/smoke-crud.mjs`: setelah menyimpan run TOPSIS, halaman detail menampilkan sidik snapshot dan data historis.

Temuan: input `note` opsional dari form kosong dikirim sebagai `null` dan ditolak union Zod. Diperbaiki dengan `z.preprocess` yang memetakan `null` ke string kosong.

Perbaikan P1a (2026-10-23): sidik snapshot sebelumnya tidak stabil.

1. `createdAt` ikut masuk ke objek yang di-hash, sehingga dua penyimpanan dengan data identik menghasilkan sidik berbeda. Halaman hasil saat itu menulis klaim "nilai yang sama menandakan snapshot identik", dan klaim itu salah.
2. Setelah `createdAt` dikeluarkan, muncul penyebab kedua: MySQL menyimpan JSON sebagai double dan mengembalikannya dengan digit terakhir bergeser (0,49314085404809205 menjadi 0,4931408540480921). Hash yang dihitung saat menyimpan tidak lagi cocok saat dibaca kembali.

Perbaikan yang diterapkan:

- Isi snapshot dipisah menjadi `SnapshotContent` (masuk sidik) dan `RunSnapshot` (menambah `createdAt`, tidak masuk sidik), di `src/lib/snapshot.ts`.
- Angka dinormalkan ke 12 desimal sebelum di-hash dan sebelum disimpan lewat `normalizeNumbers`, sehingga bolak balik lewat MySQL tidak menggeser sidik. Presisi ini di atas kebutuhan simpan 8 desimal.
- Kunci objek diurutkan saat kanonikalisasi, sehingga urutan properti tidak memengaruhi sidik. Urutan array tetap dipertahankan karena bermakna.
- `snapshot.alternatives[].values` sekarang benar-benar berisi nilai matriks, bukan array kosong.
- Halaman hasil memverifikasi ulang sidik dan menampilkan status cocok atau tidak cocok, bukan hanya menampilkan hash.

Bukti: 16 unit test di `src/lib/__tests__/snapshot.test.ts`, termasuk kasus selisih floating point yang benar-benar terjadi. 12 uji integrasi di `scripts/verify-snapshot-hash.mjs` membuktikan dua penyimpanan dengan waktu berbeda menghasilkan sidik sama, sidik cocok setelah dibaca dari DB, dan sidik gagal bila isi snapshot diubah langsung di database.

### P3. Paginasi riwayat dan pembersihan (SELESAI 2026-10-23)

Tiga cacat yang ditemukan saat menyusun prioritas, semuanya diperbaiki.

1. **Riwayat tidak berpaginasi.** `loadRuns(100)` membuat run ke-101 dan seterusnya hilang dari jangkauan meski datanya masih ada. Diganti `loadRunPage` dengan 20 baris per halaman, navigasi sebelumnya dan berikutnya, penjepitan halaman di luar rentang, dan penanganan parameter tidak sah.
2. **Tabel `computation_results` ditulis dan dibaca tetapi tidak pernah dirender.** Ada dua sumber kebenaran yang bisa berbeda tanpa terdeteksi. Halaman `/hasil/[id]` sekarang membandingkan tabel hasil dengan isi snapshot dan melaporkan bila berbeda, bukan diam.
3. **`criteriaList()` tidak dipakai siapa pun.** Dihapus, bersama import yang menjadi tidak terpakai.

Tambahan yang muncul saat pengerjaan:

- Kata sandi akun seed sebelumnya ditulis di dua tempat: nilai yang dipakai dan nilai yang dicetak di log. Saat kata sandi diubah, log tetap mencetak nilai lama sehingga menyesatkan. Sekarang satu konstanta `ADMIN_PASSWORD` dan `VIEWER_PASSWORD`, dapat ditimpa lewat `SEED_ADMIN_PASSWORD` dan `SEED_VIEWER_PASSWORD`.
- Uji otomatis membaca kredensial dari `scripts/test-credentials.mjs` yang memakai variabel lingkungan yang sama, sehingga mengganti kata sandi tidak lagi mematahkan seluruh suite.

Bukti: 28 butir di `scripts/verify-history-paging.mjs`. Termasuk 25 run tersimpan, halaman 1 berisi 20 baris, halaman 2 berisi 5 baris, halaman 99 dijepit ke halaman terakhir, empat bentuk parameter tidak sah jatuh ke halaman 1, tidak ada run terlewat atau duplikat antar halaman, ketidakcocokan tabel hasil terdeteksi lalu hilang setelah diperbaiki, dan hash run pertama sama dengan run terakhir karena datanya sama.

### F7a. Mesin analisis perbandingan (SELESAI 2026-10-23)

Opsi A disetujui pemilik produk: halaman perbandingan akan memakai hasil terbaru setiap metode secara otomatis, dengan pengaman sidik data. Bagian halaman, ekspor Excel, dan cetak tetap menyusul di F7c sampai F7e.

Isi yang selesai:

1. `src/lib/dss/ranking.ts`: Borda, Spearman, Kendall W, dan peluang ekor khi kuadrat. Murni, tanpa database.
2. `src/lib/comparison.ts`: pemilihan run terbaru per metode, pemeriksaan kesebandingan, dan penyusunan analisis. Menerima instance database sebagai argumen sehingga bisa diuji di luar runtime Astro.
3. `src/lib/comparison-runtime.ts`: pembungkus tipis yang menyuntikkan koneksi Astro.

Cacat desain yang ditemukan uji dan diperbaiki:

Sidik snapshot penuh menyertakan nama metode. Akibatnya tiga metode yang dihitung dari data identik selalu punya sidik berbeda, sehingga pengaman "hanya bandingkan bila datanya sama" tidak akan pernah lolos. Perbaikannya: sidik dipisah menjadi dua.

| Fungsi | Isi | Kegunaan |
|---|---|---|
| `hashSnapshot` | metode, kriteria, nilai, hasil, peringatan | integritas satu run, terdeteksi bila snapshot diubah |
| `hashSnapshotData` | kriteria, bobot, matriks nilai saja | kesebandingan antar metode |

Keputusan penanganan seri yang dipakai:

- Peringkat dense dari engine dikonversi ke peringkat rata rata sebelum Kendall W dan Spearman. Tanpa konversi ini, koefisien bisa melewati 1 pada data berseri.
- Kendall W memakai koreksi seri pada penyebut. Beberapa sumber mengabaikannya dan menghasilkan W terlalu tinggi.
- Borda memakai poin n + 1 dikurangi peringkat rata rata, sehingga jumlah poin setiap metode selalu n(n+1)/2.

Bukti:

| Uji | Butir | Isi |
|---|---|---|
| `src/lib/dss/__tests__/ranking.test.ts` | 33 | konversi peringkat, Borda, Pearson, Spearman, sebaran khi kuadrat, validasi masukan |
| `scripts/verify-kendall.mjs` | 5 kasus | Kendall W dicocokkan dengan rumus klasik yang ditulis terpisah, termasuk kasus seri dan peringkat terbalik |
| `scripts/verify-comparison.mjs` | 30 | pengaman Opsi A dari kondisi kosong sampai hash rusak |

Angka dari dataset demo F0: Kendall W = 0,9111, S = 41, peringkat SAW [1,3,2,4] dan WP [1,2,3,4] sesuai fixture. Ketidaksepakatan kecil itu justru berguna: membuktikan halaman perbandingan nanti tidak selalu menampilkan kesepakatan sempurna.

### F7c sampai F7e. Halaman perbandingan, ekspor, cetak (SELESAI 2026-10-26)

Halaman `/hasil/bandingkan` memakai Opsi A: hasil terbaru setiap metode dipilih otomatis, lalu dibandingkan hanya bila sidik datanya sama.

Isi halaman:

1. Tabel sumber data: run, waktu simpan, catatan, sidik data, dan status integritas per metode.
2. Kartu kesepakatan: Kendall W, rata rata Spearman, nilai p, df, dan S.
3. Tabel peringkat gabungan Borda, memuat peringkat tiap metode dan poin gabungan.
4. Tabel korelasi Spearman antar pasangan metode dengan tafsiran.
5. Catatan perhitungan, termasuk peringatan koreksi seri dan batas uji khi kuadrat pada sampel kecil.
6. Tombol unduh Excel dan tombol cetak.

Ekspor Excel di `/api/hasil/perbandingan.xlsx` memuat enam lembar: Ringkasan, Peringkat, Borda, Spearman, Kendall, dan Catatan. Angka ditulis sebagai angka, bukan teks, sehingga bisa dihitung ulang di Excel. Unduhan ditolak dengan kode 409 bila perbandingan tidak sah, supaya tidak ada berkas yang memuat angka dari data tidak sebanding.

Titik masuk: tombol "Bandingkan metode" di halaman riwayat hasil dan halaman hitung.

Ketergantungan baru: `exceljs` 4.4.0. Audit npm mencatat 6 kerentanan moderat, tanpa high atau critical: empat berasal dari rantai `drizzle-kit` yang hanya dipakai saat pengembangan, dua dari `uuid` yang dibawa `exceljs` untuk pembuatan id internal. Tidak ada yang masuk jalur runtime permintaan pengguna.

Bukti:

| Uji | Butir | Isi |
|---|---|---|
| `scripts/verify-comparison-page.mjs` | 47 | keadaan kosong, halaman lengkap, unduhan Excel, isi berkas, dan penolakan saat data berbeda |
| `scripts/verify-comparison-ties.mjs` | 12 | jalur seri: dua alternatif identik, koreksi seri muncul di halaman |

Isi berkas Excel diperiksa dengan membacanya kembali memakai `exceljs`: lima lembar ada, nilai W di sel B4 berupa angka dan cocok dengan analisis sampai 1e-9, baris Borda pertama berisi A1, koefisien Spearman berupa angka dalam rentang -1 sampai 1.

Kasus seri diuji terpisah karena dataset demo tidak memiliki seri. Data uji: dua alternatif identik dan satu alternatif unggul. Hasil: koreksi seri 18, W = 1, penanda seri muncul di tabel Borda dan catatan koreksi muncul di halaman. Angka W = 1 diverifikasi manual: S = 13,5, penyebut 162, sehingga 12 x 13,5 / 162 = 1.

Kesalahan yang terjadi saat pengerjaan:

1. Import path di `src/lib/export/excel.ts` salah karena berkas berada di subfolder `export/`. Diperbaiki menjadi `../dss/ranking` dan `../comparison`.
2. Karakter titik tengah pada pesan seri rusak menjadi dua karakter akibat encoding saat berkas uji ditulis ulang dengan `Set-Content`. Asersi diganti memakai kata biasa yang tidak bergantung pada karakter khusus.

### F8. Pengerasan dan pembersihan (SELESAI 2026-10-26)

Tiga audit otomatis dibuat supaya hasilnya bisa diperiksa ulang, bukan diklaim.

| Perintah | Memeriksa |
|---|---|
| `npm run audit:ui` | tabel tanpa nama aksesibel, input tanpa label, heading, tautan mati, gambar tanpa alt, form tanpa POST, tabel tanpa pembungkus overflow |
| `npm run audit:contrast` | 28 pasangan warna terhadap ambang WCAG AA, memakai rumus yang sama dengan standar |
| `npm run audit:keyboard` | outline tanpa pengganti, `:focus-visible`, target sentuh 44 piksel, `prefers-reduced-motion`, label menggantung, tombol tanpa type |

Temuan yang diperbaiki:

1. **Kontras teks samar gagal.** `--ink-faint` bernilai `#7d8294`, hanya 3,82:1 di atas putih dan 3,24:1 di atas accent-soft. Ambang untuk teks normal adalah 4,5:1. Diganti `#676c7c`, memberi 5,23:1 di putih dan 4,84:1 di sunken.
2. **Batas komponen interaktif gagal.** `--line-strong` bernilai `#b9bdcc`, hanya 1,87:1. Batas tombol dan input nyaris tak terlihat, padahal WCAG 1.4.11 menuntut 3:1. Diganti `#7e8499`, memberi 3,72:1 di putih dan 3,44:1 di sunken.
3. **Sembilan tabel tanpa nama aksesibel.** Dihubungkan ke heading yang sudah ada memakai `aria-labelledby`, bukan menambah caption yang menduplikasi teks.
4. **Transisi tanpa `prefers-reduced-motion`.** Ditambahkan; semua animasi dan transisi dimatikan bila sistem memintanya.
5. **Indeks paginasi belum optimal.** `EXPLAIN` menunjukkan `Using filesort` pada kueri riwayat. Ditambahkan indeks komposit `(created_at, id)` dan `(method, created_at, id)` lewat migrasi `0001`. Dengan 3000 baris data uji, kedua kueri memakai `Backward index scan` tanpa filesort, dan waktu halaman konstan sekitar 37 ms dari halaman 1 sampai 150.

Catatan jujur tentang dua temuan audit yang ternyata positif palsu:

- `--ink-faint` di dalam tautan navigasi aktif di-override menjadi `--accent`, sehingga pasangan yang relevan adalah accent di atas accent-soft (9,20:1), bukan faint di atas accent-soft. Audit diperbaiki agar menguji pasangan yang benar.
- Garis pemisah baris tabel memakai `--line` dengan rasio 1,39:1. Garis ini dekorasi struktural, bukan batas komponen interaktif, jadi WCAG 1.4.11 tidak mewajibkannya 3:1. Menaikkannya akan membuat tabel penuh garis berat yang mengganggu pembacaan angka, jadi tetap dibiarkan dan dicatat sebagai pengecualian yang disengaja.

Pembersihan kode lama:

- 1905 berkas CodeIgniter dihapus dari root: `application/`, `assets/`, `index.php`, `composer.json`, `composer.lock`, `.htaccess`, dan README lama yang hanya berisi "tes".
- Sebelum dihapus, dipastikan tidak ada berkas di `app/` yang merujuk path lama. Pemeriksaan awal sempat memberi positif palsu karena `content-type: application/json` mengandung kata "application".
- Logo institusi sudah tersalin ke `app/public/logo-akprind.png`, jadi tidak ada aset yang hilang.
- Kode lama tetap dapat dipulihkan dari riwayat git (1905 berkas terlacak) dan dari salinan di folder sementara.
- README root ditulis ulang: menjelaskan struktur baru, cara menjalankan, metode, dokumentasi, dan verifikasi.
- `.gitignore` root diperbarui untuk proyek Node; entri lama `/system` dan `/vendor` dihapus karena tidak ada lagi.

Bukti:

| Uji | Butir | Status |
|---|---|---|
| `npm run audit:ui` | 0 temuan | lolos |
| `npm run audit:contrast` | 28 pasangan, 0 dekat ambang | lolos |
| `npm run audit:keyboard` | 0 temuan | lolos |
| `scripts/verify-hardening.mjs` | 65 | lolos |
| Seluruh suite lain setelah pembersihan | 282 | lolos |

Kriteria selesai: audit bersih, aplikasi jalan dari nol, root repo hanya berisi `app/`, `docs/`, dan README. **Tercapai.**

### F9a. Tier 2 batch pertama (SELESAI 2026-10-26)

Empat metode ditambahkan: WASPAS, MOORA, COPRAS, VIKOR. Total terdaftar kini tujuh.

Perubahan kontrak engine:

1. `DssMethod.description` wajib. Sebelumnya deskripsi metode ditulis hardcoded di halaman hitung, sehingga setiap metode baru butuh suntingan halaman. Sekarang deskripsi hidup bersama metodenya.
2. `DssResult.higherIsBetter` dan `rankScores(scores, higherIsBetter)`. VIKOR memberi peringkat 1 pada Q terkecil. Menegasikan Q untuk memaksa pengurutan menurun akan mengubah angka yang ditampilkan, jadi arah pengurutan dibuat eksplisit.
3. Dashboard dan halaman hitung membaca daftar metode dari registry, bukan menulis ulang.

Parameter opsional per metode, disimpan di trace agar hasil dapat direproduksi:

| Metode | Parameter | Bawaan | Catatan |
|---|---|---|---|
| WASPAS | `lambda` | 0,5 | 0 berarti hanya penjumlahan, 1 hanya perkalian |
| VIKOR | `v` | 0,5 | bobot strategi mayoritas |

Dua bug nyata yang ditemukan pengujian, bukan dugaan:

1. **VIKOR: penyebut Q terbalik tanda.** Ditulis `(S+ - S-)` padahal harus `(S- - S+)`. Akibatnya Q bernilai negatif dan peringkat terbalik. Tertangkap karena uji membandingkan dengan hitung tangan, bukan hanya memeriksa rentang.
2. **COPRAS: normalisasi cost keliru.** Implementasi pertama memakai `(1/x) / jumlah(1/x)` untuk kriteria cost. Rumus Q COPRAS sudah memberi nilai besar ketika S- kecil, jadi membalik normalisasi cost membuat dua inversi bertumpuk. Terbukti pada kasus satu kriteria cost: alternatif dengan cost **terburuk** memperoleh Q tertinggi. Normalisasi standar memakai `x / jumlah(x)` untuk semua kriteria. Setelah diperbaiki, cost terkecil menang dan hasilnya selaras dengan metode lain.

Bug ketiga, pada tampilan: `higherIsBetter: false` hanya diset di hasil, tidak di objek metode, sehingga registry menganggap VIKOR mengurutkan menurun.

Bukti:

| Uji | Butir | Isi |
|---|---|---|
| `src/lib/dss/__tests__/tier2.test.ts` | 30 | paritas terhadap hitung tangan, parameter, arah VIKOR, kasus tepi |
| `scripts/verify-tier2-invariants.mjs` | 50 | tujuh metode pada empat dataset: skala positif, alternatif identik, dominasi, benefit tunggal, cost tunggal, bobot berskala |
| `scripts/verify-methods-http.mjs` | 68 | pemilih, hitung, simpan, perbandingan tujuh metode, Excel |
| `scripts/manual-tier2.mjs` | acuan | hitung manual independen, ditulis terpisah dari engine |

Angka acuan dataset kecil `X = [[4,2],[3,3],[5,1]]`, bobot 0,6 benefit dan 0,4 cost:

| Metode | Nilai | Peringkat |
|---|---|---|
| WASPAS | Q = 0,6714 / 0,4838 / 1,0000 | A3, A1, A2 |
| MOORA | y = 0,1256 / -0,0662 / 0,3174 | A3, A1, A2 |
| COPRAS | Q = 0,3091 / 0,2227 / 0,4682 | A3, A1, A2 |
| VIKOR | Q = 0,5000 / 1,0000 / 0,0000 | A3, A1, A2, Q terkecil terbaik |

Kendall W pada dataset demo dengan tujuh metode: 0,7714, dengan 21 pasangan Spearman.

### F9b. Tier 2 batch kedua (SELESAI 2026-10-26)

Empat metode ditambahkan: EDAS, ARAS, MABAC, SMART. Total terdaftar kini sebelas, sesuai komitmen D8.

Rujukan yang dipakai, sesuai pilihan pemilik produk (Opsi 1, rujukan standar):

| Metode | Rujukan | Varian yang dipakai |
|---|---|---|
| EDAS | Keshavarz Ghorabaee dkk., Informatica 26(3), 2015 | jarak dari rata-rata (average), bukan simpangan baku |
| ARAS | Zavadskas dan Turskis, TEDE 16(2), 2010 | normalisasi jumlah kolom dengan baris A0 |
| MABAC | Pamucar dan Cirovic, ESWA 42(4), 2015 | normalisasi min-max, batas rata-rata geometrik |
| SMART | Edwards, IEEE TSMC 7(5), 1977 | utilitas 0 sampai 1, bukan skala 100 |

Perbedaan definisi yang dicatat agar tidak menjadi ambiguitas:

1. **EDAS**: artikel 2016 memakai simpangan baku sebagai acuan. Varian yang dipakai di sini adalah rata-rata, sesuai artikel 2015.
2. **ARAS**: normalisasi cost memakai `(x_0j / x_ij)` lalu dibagi jumlah kolom, bukan `x_ij / jumlah` polos. Ini yang membuat A0 selalu bernilai 1.
3. **MABAC**: batas perkiraan memakai rata-rata geometrik. Sebagian penerapan memakai rata-rata aritmetik; itu varian lain dan tidak dipakai.
4. **SMART**: skala utilitas 100 hanya mengalikan seluruh skor dengan konstanta dan tidak mengubah peringkat, jadi skala 0 sampai 1 dipakai.

Bukti:

| Uji | Butir | Isi |
|---|---|---|
| `src/lib/dss/__tests__/tier2b.test.ts` | 34 | paritas terhadap hitung tangan, kasus tepi, pendaftaran sebelas metode |
| `scripts/verify-tier2-invariants.mjs` | 78 | sebelas metode pada empat dataset |
| `scripts/verify-methods-http.mjs` | 92 | alur sebelas metode lewat HTTP, perbandingan, Excel |
| `scripts/manual-tier2b.mjs` | acuan | hitung manual independen |

Angka acuan `X = [[4,2],[3,3],[5,1]]`, bobot 0,6 benefit dan 0,4 cost:

| Metode | Nilai | Peringkat |
|---|---|---|
| EDAS | AS = 0,5000 / 0,0000 / 1,0000 | A3, A1, A2 |
| ARAS | K = 0,6667 / 0,4815 / 1,0000 | A3, A1, A2 |
| MABAC | S = 0,0578 / -0,4422 / 0,5578 | A3, A1, A2 |
| SMART | U = 0,5000 / 0,0000 / 1,0000 | A3, A1, A2 |

ARAS terverifikasi secara khusus: A3 identik dengan solusi optimal A0, sehingga K = 1 tepat. Itu sifat wajib ARAS dan menjadi pemeriksaan paling kuat bahwa normalisasi cost-nya benar.

Kendall W pada dataset demo dengan sebelas metode: 0,8215, dengan 55 pasangan Spearman.

Catatan tampilan: tabel Borda pada halaman perbandingan kini memuat 15 kolom (peringkat, kode, judul, sebelas metode, poin) dan tabel Spearman memuat 55 baris. Keduanya berada di dalam pembungkus `table-wrap` sehingga bisa digeser horizontal tanpa memecahkan tata letak. Diukur: 15 kolom, 74 baris total, HTML 115 KB.

Kesalahan yang terjadi saat pengerjaan, semuanya pada berkas uji bukan kode aplikasi:

1. Indeks baris ARAS salah: baris 0 adalah A0, bukan A1.
2. Uji EDAS memakai nilai cost 0, yang memang ditolak validasi. Diganti kasus seragam.
3. Empat berkas uji masih mengunci jumlah tujuh metode dan 21 pasangan Spearman.
4. Uji pendaftaran di `tier2.test.ts` mengunci daftar persis, sehingga perlu disunting setiap kali metode bertambah. Diganti pemeriksaan keanggotaan, dan daftar lengkap dipusatkan di `tier2b.test.ts`.

F9 selesai seluruhnya. Sisa fase: F10 (AHP dan Fuzzy AHP) dan F11 (sensitivitas bobot, PDF).

### F10a. AHP crisp, perhitungan dan skenario (SELESAI 2026-10-26)

Keputusan pemilik produk yang dipakai:

| Kode | Keputusan | Konsekuensi |
|---|---|---|
| K1 | Bobot AHP sebagai **skenario terpisah** | bobot master kriteria tidak pernah tertimpa |
| K2 | Pairwise **antar kriteria saja** | tidak ada perbandingan berpasangan antar alternatif |
| K3 | Fuzzy AHP **fase terpisah** | F10 hanya AHP crisp |

Rujukan: Saaty, "The Analytic Hierarchy Process", 1980, dan Saaty, "A scaling method for priorities in hierarchical structures", 1977, untuk Consistency Index dan Random Index.

Isi yang selesai:

1. `src/lib/ahp/ahp.ts`: validasi matriks resiprokal, pembentukan matriks dari segitiga atas, eigenvector lewat iterasi pangkat, lambda maksimum, CI, RI, CR, dan jejak langkah. Murni, tanpa database.
2. Skema baru lewat migrasi `0002`: tabel `weight_scenarios` dan `pairwise_comparisons`, dengan sidik masukan dan sidik kriteria.
3. `src/lib/ahp/scenario.ts`: simpan, daftar, muat, dan hapus skenario, plus pemeriksaan kecocokan kriteria.
4. Halaman `/ahp` untuk mengisi segitiga atas dengan skala Saaty 1/9 sampai 9, dan `/ahp/[id]` untuk melihat bobot, CR, pasangan tersimpan, dan jejak perhitungan.
5. Navigasi grup baru "Bobot" berisi tautan AHP.

Keputusan teknis yang diambil sadar:

- **Iterasi pangkat**, bukan rata-rata geometrik baris, karena definisi Saaty memakai eigenvector utama. Rata-rata geometrik hanya dipakai sebagai pembanding di uji.
- **Tabel Random Index ditulis eksplisit** untuk n = 1 sampai 15, dan perhitungan CR di atas 15 kriteria ditolak. Nilai RI adalah tabel empiris, bukan rumus, dan literatur berbeda tipis pada n >= 12.
- **CR bukan ukuran kebenaran.** Antarmuka menyatakan bahwa CR di bawah 0,1 hanya berarti penilaian tidak saling bertentangan. Ini sering disalahpahami di skripsi, jadi ditulis di halaman, bukan hanya di dokumen.
- **Skenario tidak konsisten tetap disimpan** tetapi ditandai `consistent = false`, sehingga pengguna bisa memeriksa apa yang salah. Halaman hitung dapat menolaknya nanti.
- **Skenario terikat pada sidik kriteria.** Bila susunan atau nama kriteria berubah, skenario ditandai tidak cocok dan halaman detail menampilkan peringatan, bukan memakai bobot lama diam-diam.

Bukti:

| Uji | Butir | Isi |
|---|---|---|
| `src/lib/ahp/__tests__/ahp.test.ts` | 37 | validasi, eigenvector, CI dan CR, contoh literatur Saaty, kasus tepi, 15 kriteria |
| `scripts/verify-ahp.mjs` | 38 | dibandingkan dengan dua metode independen: iterasi pangkat terpisah dan eigenvalue lewat dekomposisi QR |
| `scripts/verify-ahp-http.mjs` | 41 | halaman, simpan, validasi, ketidakcocokan kriteria, hapus, bobot master utuh |

Angka acuan contoh Saaty, tiga kriteria gaji, reputasi, kesempatan:

| Besaran | Nilai modul | Nilai literatur |
|---|---|---|
| lambda maksimum | 3,0385 | 3,0385 |
| bobot | 0,6370 / 0,2583 / 0,1047 | 0,637 / 0,258 / 0,105 |
| CI | 0,0193 | 0,0193 |
| CR | 0,0332 | 0,0332 |

Verifikasi independen memakai dua jalur berbeda. Iterasi pangkat saya cocok dengan iterasi pangkat terpisah sampai 1e-13, dan lambda maksimum cocok dengan eigenvalue dari dekomposisi QR sampai 1e-9. Pada matriks dengan eigenvalue berulang (semua nilai satu), QR Gram-Schmidt degenerasi; modul mengembalikan lambda = n, yang memang nilai yang benar.

Kesalahan selama pengerjaan, semuanya pada berkas uji:

1. Path import salah karena `ahp.ts` berada di subfolder `ahp/`.
2. Skrip verifikasi independen memakai Gram-Schmidt tanpa penanganan kolom bergantung linear, sehingga menghasilkan NaN pada matriks seragam.
3. Uji AHP HTTP awalnya bergantung pada kriteria seed, sehingga gagal bila dijalankan setelah uji pengerasan yang men-truncate tabel. Sekarang uji menanam kriteria sendiri dan memulihkannya di akhir, sehingga urutan suite tidak lagi berpengaruh.

Kriteria F10 asli menyebut bobot harus dapat dipakai di tier 1 dan 2. Saat F10a selesai, bagian itu belum terpenuhi. Sudah dipenuhi di F10b.

### F10b. Pemakaian bobot skenario (SELESAI 2026-10-26)

Keputusan pemilik produk: **Opsi A**, asal bobot dicatat di snapshot. Tanpa pencatatan itu, laporan tidak dapat menjelaskan darimana angka berasal.

Yang dibangun:

1. **Pemilih sumber bobot** di `/hitung`, memakai form GET sehingga pilihan dapat di-bookmark, dicetak, dan tidak memerlukan JavaScript. Hanya skenario konsisten dan cocok dengan kriteria yang muncul.
2. **Penerusan skenario** lewat query string `?skenario=<id>` ke halaman metode, sehingga tautan Hitung membawa pilihan yang sama.
3. **Snapshot versi 2** dengan field `weightSource`: `source` (`criteria` atau `scenario`), `scenarioId`, `scenarioName`, dan `scenarioCr`. Field ini masuk sidik, sehingga dua run dengan sumber bobot berbeda tidak pernah dianggap setara.
4. **Keterangan asal bobot** di halaman hasil, termasuk tautan ke skenario AHP asalnya.
5. **Penolakan eksplisit** di tiga lapis: halaman hitung menampilkan alasan penolakan, `loadMatrix` menolak dengan pesan spesifik, dan halaman metode dialihkan kembali bila skenario tidak layak.

Pemisahan modul yang diperlukan:

`queries.ts` mengimpor `guard` yang memuat `astro:env`, sehingga tidak dapat dipanggil dari skrip uji. Inti logika dipindahkan ke `src/lib/matrix-core.ts` yang menerima instance database, dan `queries.ts` menjadi pembungkus tipis yang menyuntikkan koneksi Astro. Pola yang sama sudah dipakai pada `comparison.ts`.

Bukti:

| Uji | Butir | Isi |
|---|---|---|
| `scripts/verify-scenario-usage.mjs` | 44 | pemilih, penerusan, penolakan, pencatatan snapshot, pemisahan hash |
| Regresi seluruh suite | 180 unit dan 505 butir integrasi | lolos |

Angka dari uji: skenario layak memberi bobot 0,5583 / 0,2902 / 0,0952 / 0,0563, tercatat di snapshot bersama id dan nama skenario. Sidik data antara bobot kriteria dan bobot skenario berbeda (512fcdc307 lawan e5a37044c7), sedangkan dua metode berbeda yang memakai skenario sama memiliki sidik data identik. Keduanya perilaku yang diinginkan.

Satu masalah kelas yang muncul lagi: uji skenario men-truncate tabel rubrik tanpa memulihkannya, sehingga `smoke-p0` gagal bila dijalankan setelahnya. Ini kali ketiga masalah yang sama muncul. Perbaikannya bukan menambal berkas itu saja, tetapi menambahkan perintah `npm run db:restore` yang memulihkan kriteria dan rubrik seed tanpa menyentuh akun, serta memulihkan keadaan di akhir uji skenario. Urutan suite kini diuji secara acak untuk membuktikannya.

### F10c. Fuzzy AHP (BELUM)
- Fuzzy AHP dengan Triangular Fuzzy Number dan operasi geometrik, rujukan Chang, 1996.
- Berdiri sendiri, tidak bergantung pada F10b.

### F11a. Analisis sensitivitas bobot (SELESAI 2026-10-26)

Keputusan desain yang diambil:

1. **Perturbasi satu kriteria pada satu waktu** (ceteris paribus), bukan kombinasi. Kombinasi membuat jumlah skenario meledak dan tafsirannya sulit dipertanggungjawabkan. Pendekatan ini juga yang paling mudah dijelaskan saat sidang.
2. **Bobot dinormalkan ulang setelah digeser**, sehingga totalnya tetap 1 dan perbandingan antar skenario bermakna.
3. **Bobot merata sebagai pembanding opsional.** Berguna memeriksa apakah kesimpulan bergantung pada pembobotan yang dipilih.
4. **Heatmap tiga tingkat intensitas** berdasarkan jumlah perturbasi yang mengubah peringkat alternatif pada kriteria tertentu.

Isi yang selesai:

- `src/lib/dss/sensitivity.ts`: modul murni, tanpa database. Menghitung perturbasi, selisih peringkat, korelasi peringkat, matriks geseran, arah pengaruh, dan ringkasan siap kutip.
- `src/lib/dss/sensitivity-run.ts`: penyiapan dari database, menerima instance database sehingga bisa diuji tanpa Astro.
- `/sensitivitas`: pemilih metode, besar geseran, sumber bobot, dan opsi bobot merata. Menampilkan ringkasan, peringkat dasar, heatmap, rincian perturbasi, dan tabel pembanding bobot merata.

Angka yang dilaporkan di antarmuka:

| Besaran | Arti |
|---|---|
| Stabilitas peringkat 1 | persentase perturbasi yang tidak mengganti juara |
| Perturbasi yang mengubah urutan | jumlah skenario yang menggeser peringkat selain juara |
| Kriteria paling berpengaruh | kriteria yang geserannya paling sering mengubah urutan |
| Alternatif paling sensitif | alternatif yang paling sering berubah peringkat |

Peringatan otomatis yang dipasang:

- Bobot masukan bukan 1, analisis memakai bobot ternormalisasi.
- Tidak ada perubahan peringkat sama sekali, peringkat dinyatakan stabil pada rentang itu.
- Ada perturbasi yang mengganti peringkat 1, disertai peringatan bahwa kesimpulan tidak boleh bergantung pada satu pembobotan.
- Bobot kriteria menjadi nol pada penurunan, perturbasi dilewati dengan catatan.

Bukti:

| Uji | Butir | Isi |
|---|---|---|
| `src/lib/dss/__tests__/sensitivity.test.ts` | 27 | perturbasi, normalisasi, arah VIKOR, kasus tepi, determinisme |
| `scripts/verify-sensitivity.mjs` | 18 | bobot dan peringkat dihitung ulang lewat jalur terpisah, lalu dibandingkan |
| `scripts/verify-sensitivity-http.mjs` | 35 | halaman, heatmap, skenario AHP, data tidak lengkap, satu alternatif |

Verifikasi independen menghitung ulang setiap bobot perturbasi dengan rumus terpisah dan memanggil engine langsung untuk membandingkan peringkat. Selisih 0 pada 11 metode.

Kontras heatmap diuji terukur, bukan diperkirakan: keempat tingkat memberi rasio 4,94:1 sampai 11,85:1, semuanya di atas ambang 4,5:1. Keempatnya kini masuk audit kontras otomatis.

Kesalahan selama pengerjaan, semuanya pada berkas uji:

1. Uji arah pengaruh awalnya lolos dengan 0 entri, artinya tidak menguji apa pun. Dataset diganti agar menghasilkan 4 entri nyata.
2. Regex uji mengandaikan tidak ada atribut di antara tag, padahal Astro menyisipkan `data-astro-*` pada mode dev.
3. Uji satu alternatif dijalankan setelah data nilai dihapus, sehingga pesan "sel kosong" muncul lebih dulu dan menutupi pesan yang diuji.

Audit UI dan audit keyboard sama-sama melaporkan form pemilih filter sebagai "form tanpa POST". Itu positif palsu: form GET untuk navigasi memang benar. Kedua audit diperbaiki agar hanya menandai form yang terikat Astro action.

### F11b. Ekspor PDF (SELESAI 2026-10-28)

Pendekatan: memakai `puppeteer-core` untuk mencetak halaman yang sudah dirender, bukan menyusun tata letak PDF kedua. Alasannya, tampilan cetak sudah teruji; menulis ulang tata letak berarti memelihara dua sumber yang bisa berbeda. `puppeteer-core` dipilih daripada `puppeteer` karena memakai Chrome atau Edge yang sudah terpasang, sehingga tidak perlu mengunduh Chromium sekitar 150 MB.

Isi yang selesai:

1. `src/lib/pdf/browser.ts`: mendeteksi Chrome atau Edge pada Windows, macOS, dan Linux, dengan `PUPPETEER_EXECUTABLE_PATH` sebagai override.
2. `src/lib/pdf/render.ts`: render A4 dengan header dan footer, media print sejak awal, cookie sesi diteruskan, font ditunggu selesai dimuat, dan peramban dipakai ulang antar permintaan.
3. `src/pages/api/pdf.ts`: endpoint dengan allowlist halaman, penolakan URL eksternal, dan penolakan path traversal.
4. Tautan "Unduh PDF" di empat halaman: detail hasil, perbandingan, detail skenario AHP, dan analisis sensitivitas. Tombol `window.print()` dihapus dari ketiga halaman yang memilikinya.

Cacat yang ditemukan saat pemeriksaan dan diperbaiki:

1. **Path traversal bisa melewati allowlist.** `/hasil/../kriteria` berawalan `/hasil/` sehingga lolos pemeriksaan string mentah, lalu dinormalkan menjadi `/kriteria`. Pemeriksaan sekarang menormalkan path lebih dulu, menolak segmen `..` dan backslash, serta memeriksa hasil normalisasi. Lima bentuk traversal diuji, termasuk `%2e%2e` terenkode, semuanya ditolak 400.
2. **Halaman sensitivitas tidak punya tautan PDF.** Endpoint mengizinkannya dan uji membuktikannya bekerja, tetapi pengguna tidak bisa menemukannya. Tautan ditambahkan dengan parameter analisis yang sedang tampil.
3. **`closeBrowser` tidak pernah dipanggil.** Peramban bersama tetap hidup sampai proses berakhir. Hook dipasang pada `SIGINT`, `SIGTERM`, dan `beforeExit`, didaftarkan saat peramban pertama kali dibuat.
4. **Label tombol tidak sesuai perilaku.** `content-disposition` bernilai `inline` padahal tombol berbunyi "Unduh PDF". Diubah menjadi `attachment`, sehingga berkas tersimpan.
5. **Redirect tidak ditolak.** Halaman yang tidak ada mengalihkan ke halaman lain, dan peramban mengikuti redirect itu sehingga PDF tercetak dari halaman yang salah tanpa terlihat. Sekarang redirect ditolak dengan pesan yang menjelaskan.

Bukti:

| Uji | Butir | Isi |
|---|---|---|
| `scripts/verify-pdf.mjs` | 54 | keamanan endpoint, lima bentuk traversal, header, tanda tangan berkas, tautan di empat halaman |
| `scripts/verify-pdf-content.mjs` | 10 | struktur, jumlah halaman, konsistensi ukuran antar pemanggilan |
| `scripts/verify-pdf-text.mjs` | 25 | teks halaman dibandingkan isi yang seharusnya, dipakai Chromium dengan media print |

Catatan metodologis: ekstraksi teks langsung dari stream PDF tidak dipakai karena Chrome menanam font subset dengan encoding glyph, sehingga hasilnya tidak terbaca. Yang dipakai adalah teks DOM dari halaman yang sama sebelum dicetak, karena halaman itulah yang menjadi sumber PDF.

Berkas hasil uji: detail hasil 2 halaman sekitar 109 KB, perbandingan 3 halaman sekitar 223 KB, sensitivitas dan skenario AHP masing-masing berhasil dengan tanda tangan `%PDF-` yang sah.

Masalah kelas yang muncul keempat kali, dan akhirnya diperbaiki di akarnya: dua suite PDF memotong tabel kriteria tanpa memulihkannya, sehingga `smoke-p0` gagal bila dijalankan setelahnya. Sebelumnya selalu ditambal per berkas. Kali ini data seed dan fungsi pemulihan dipindahkan ke `scripts/test-data.ts`, dipakai bersama oleh `restore-seed.ts` dan setiap suite yang memotong tabel. Kedua suite PDF kini memulihkan keadaan sendiri di akhir, diuji dengan menjalankan `smoke-p0` tepat setelahnya.

**Prasyarat:** Chrome atau Edge harus terpasang. Tanpa itu endpoint mengembalikan 503 dengan pesan jelas, dan halaman lain tetap berfungsi.

Verifikasi hook penutupan peramban: setelah dev server dihentikan, tidak ada lagi proses `chrome.exe --headless` yang tersisa. Sebelumnya peramban bersama hidup sampai proses Node berakhir tanpa ditutup rapi.

---

## 8. Risiko

| Risiko | Dampak | Mitigasi |
|---|---|---|
| **Tidak ada oracle pembanding** setelah Big Bang | kesalahan rumus tidak terdeteksi otomatis | fixture manual dari literatur, spreadsheet verifikasi independen, invarian numerik, review rumus di F0 |
| Rumus lama menyimpang dari definisi literatur | hasil baru berbeda dari laporan lama | F0 mendokumentasikan setiap penyimpangan sebelum kode baru ditulis, keputusan diambil sadar |
| Skema lama tidak terdokumentasi | model data baru melewatkan kebutuhan nyata | skema baru dirancang dari kebutuhan fitur, bukan menyalin tabel lama |
| Presisi desimal | peringkat berubah di digit terakhir | simpan 8 desimal, bulatkan saat tampil, epsilon 1e-9 |
| Hasil tertimpa | laporan tidak bisa direproduksi | snapshot immutable |
| Scope melar karena "semua metode" | rilis pertama tidak selesai | tier metode, tahap F9 dan F10 terpisah |
| Big Bang menghapus kode lama | kehilangan referensi | kode lama baru dihapus di F8, setelah aplikasi baru lulus uji |
| Satu tema | tidak ada preferensi pengguna | sesuai keputusan, alasan keterbacaan dan cetak |

---

## 9. Status keputusan

Semua keputusan terkunci. Tidak ada pertanyaan terbuka.

| Kode | Keputusan |
|---|---|
| D1 | Big Bang, tanpa aplikasi lama berjalan |
| D2 | Data baru dan bersih |
| D3 | Drizzle ORM |
| D4 | better-auth |
| D5 | Arah visual A, institusional tenang |
| D6 + S4 | Terang saja, tanpa dark mode |
| D7 | Deploy lokal |
| D8 | Tier 2: WASPAS, MOORA, COPRAS, VIKOR, EDAS, ARAS, MABAC, SMART |
| D9 | AHP dan Fuzzy AHP, fase terpisah |
| D10 | Perbandingan metode di rilis pertama, sensitivitas setelahnya |
| D11 | Print + Excel dulu, PDF menyusul |
| D12 | Antarmuka Indonesia |
| S1 | Logo institusi dipakai ulang |
| S2 | Aksen institusi `#2F318B`, detail `#FFF000` |
| S3 | Nama produk **TELAAH** |

Langkah berikutnya: F0, ekstraksi rumus dan penyusunan lembar verifikasi. F1 baru dimulai setelah F0 selesai, karena rumus yang salah akan merambat ke seluruh engine dan UI.