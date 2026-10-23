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

### F7. Hasil, perbandingan, ekspor (BELUM)
- Halaman perbandingan metode: Borda, Spearman, Kendall W.
- CSS print A4 sudah tersedia di `global.css` dan tombol cetak sudah ada di halaman detail hasil.
- Ekspor Excel dengan `exceljs` belum dikerjakan.

Sudah selesai di fase ini: halaman hasil per run, ranking dengan penanda seri, tabel nilai per kriteria dari snapshot, sidik snapshot, dan gaya cetak.

Belum: halaman `/hasil/bandingkan`, ekspor Excel.

### F8. Pengerasan dan pembersihan
- Semua state: kosong, loading, error, akses ditolak.
- Audit keyboard, fokus terlihat, kontras AA, target sentuh 44 piksel di layar kecil.
- Indeks database untuk query yang sering dipakai.
- `npm run db:reset` dan `npm run db:seed` untuk memulai ulang lingkungan lokal.
- Hapus kode lama dari root setelah aplikasi baru diterima.

Kriteria selesai: Delivery Gate bersih, aplikasi jalan dari nol, root repo hanya berisi aplikasi baru dan dokumentasi.

### F9. Tier 2, delapan metode
WASPAS, MOORA, COPRAS, VIKOR, EDAS, ARAS, MABAC, SMART. Satu file, satu entri registry, satu fixture manual, satu baris di lembar verifikasi.

Kriteria selesai: semua metode muncul di pemilih dan lulus test.

### F10. AHP dan Fuzzy AHP
- `inputMode: 'pairwise'`, halaman perbandingan berpasangan, validasi rasio konsistensi di bawah 0,1.
- Bobot hasil AHP dapat dipakai metode lain.

Kriteria selesai: CR tervalidasi pada fixture, bobot dapat dipakai di tier 1 dan 2.

### F11. Setelah rilis
Analisis sensitivitas bobot, heatmap perubahan ranking, ekspor PDF.

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