# Rumus SAW, WP, TOPSIS dan temuan implementasi lama

Dokumen referensi F0 untuk aplikasi TELAAH. Isi: definisi rumus yang dipakai engine baru, pemetaan ke kode lama, daftar penyimpangan yang tidak diwarisi, dan prosedur verifikasi.

Sumber kode lama:
- `application/views/perhitungan/perhitungan.php` (1092 baris, seluruh perhitungan)
- `application/models/Perhitungan_model.php` (query pendukung)
- `application/controllers/Perhitungan.php` (menyiapkan `nilai_pangkat` dan `normalisasi_terbobot` untuk TOPSIS)

---

## 1. Notasi

| Simbol | Arti |
|---|---|
| `m` | jumlah alternatif |
| `n` | jumlah kriteria |
| `x_ij` | nilai alternatif `i` pada kriteria `j` |
| `w_j` | bobot kriteria `j` |
| `r_ij` | nilai ternormalisasi |
| `y_ij` | nilai terbobot |
| `V_i` | skor akhir alternatif `i` |

Arah kriteria: `benefit` berarti makin besar makin baik, `cost` berarti makin kecil makin baik.

Prasyarat yang divalidasi engine baru dan tidak divalidasi kode lama:
1. Matriks `x` lengkap, tidak ada sel kosong, tidak ada nol pada kriteria `cost`.
2. `w_j >= 0`, minimal satu bobot positif.
3. Jumlah bobot diperiksa. Bila bukan 1, engine memberi peringatan dan memakai bobot ternormalisasi.

---

## 2. SAW (Simple Additive Weighting)

Kode lama: baris 84 sampai 302.

### Langkah

1. Matriks keputusan `X = [x_ij]`.
2. Normalisasi:

```
r_ij = x_ij / max_i(x_ij)      jika kriteria benefit
r_ij = min_i(x_ij) / x_ij      jika kriteria cost
```

3. Skor akhir:

```
V_i = sum_j ( w_j * r_ij )
```

4. Peringkat: urutkan `V_i` menurun, peringkat 1 untuk nilai terbesar.

### Pemetaan kode lama

| Langkah | Lokasi | Catatan |
|---|---|---|
| X | 84-119 | nilai dibaca per sel lewat `data_nilai()` |
| W | 129-151 | bobot mentah, tanpa cek total |
| R benefit | 186 | `round(@(nilai / max), 4)` |
| R cost | 188 | `round(@(min / nilai), 4)` |
| V | 229-245 | akumulasi bobot dikali r, tanpa pembulatan di tengah |
| Simpan | 250 | insert tanpa pembulatan |
| Tampil | 245 | `round($nilai_v, 4)` |

### Sumber

Kusumadewi, Hartati, Harjoko, Wardoyo, *Fuzzy Multi-Attribute Decision Making (Fuzzy MADM)*, 2006, bab SAW. Definisi yang sama dipakai di banyak literatur dengan penyebut `max` untuk benefit dan `min` untuk cost.

---

## 3. WP (Weighted Product)

Kode lama: baris 796 sampai 1085.

### Langkah

1. Normalisasi bobot:

```
w'_j = w_j / sum_k(w_k)
```

2. Vektor S, dengan tanda eksponen bergantung arah kriteria:

```
S_i = produk_j ( x_ij ^ w'_j )        jika kriteria benefit
S_i = produk_j ( x_ij ^ -w'_j )       jika kriteria cost
```

3. Vektor V:

```
V_i = S_i / sum_k(S_k)
```

4. Peringkat menurun berdasarkan `V_i`.

`S_i` adalah pangkat negatif untuk cost karena secara matematis setara dengan membagi, dan itulah yang dilakukan kode lama (baris 962 dan 1022).

### Pemetaan kode lama

| Langkah | Lokasi | Catatan |
|---|---|---|
| X | 804-838 | |
| W | 849-871 | bobot mentah |
| W ternormalisasi | 894-907 | `bobot / get_sum_bobot()`, ditampilkan tanpa pembulatan |
| S | 950-970 | `pow(nilai, bobot_r)`, perkalian berjalan, `round` hanya untuk tampilan |
| Total S | 972-980 | akumulasi `$total_vs` |
| V | 1013-1029 | `total_s / total_vs` |
| Simpan | 1032-1036 | `round($nilai_v, 4)` sebelum insert |

### Sumber

Yoon dan Hwang, *Multiple Attribute Decision Making: An Introduction*, 1995. Definisi WP dengan normalisasi bobot dan perkalian berpangkat.

---

## 4. TOPSIS

Kode lama: baris 309 sampai 790, dengan tabel bantu `nilai_pangkat` dan `normalisasi_terbobot`.

### Langkah

1. Matriks keputusan `X`.

2. Normalisasi vektor per kriteria:

```
divisor_j = akar( sum_i( x_ij^2 ) )
r_ij = x_ij / divisor_j
```

3. Matriks terbobot:

```
y_ij = w_j * r_ij
```

4. Solusi ideal positif dan negatif, dihitung **dari `Y`, bukan dari `R`**:

```
A+_j = max_i(y_ij)  jika benefit      A+_j = min_i(y_ij)  jika cost
A-_j = min_i(y_ij)  jika benefit      A-_j = max_i(y_ij)  jika cost
```

5. Jarak Euclidean:

```
D+_i = akar( sum_j( (y_ij - A+_j)^2 ) )
D-_i = akar( sum_j( (y_ij - A-_j)^2 ) )
```

6. Kedekatan relatif:

```
V_i = D-_i / (D+_i + D-_i)
```

7. Peringkat menurun berdasarkan `V_i`. Nilai `V_i` mendekati 1 berarti paling dekat ke solusi ideal positif.

### Pemetaan kode lama

| Langkah | Lokasi | Catatan |
|---|---|---|
| X | 318-352 | |
| W | 363-384 | |
| `nilai_pangkat` | controller 32-43, model 38-42 | berisi `x_ij^2`, dijumlahkan per kriteria |
| R | 414-421 | `round(nilai / sqrt(sum), 4)` |
| Y | 460-467 | `round(bobot * (nilai / sqrt(sum)), 4)` |
| A+ | 499-511 | max/min dari `normalisasi_terbobot`, yaitu `Y` |
| A- | 538-550 | kebalikannya |
| D+ | 583-603 | dihitung dari `Y` yang sudah dibulatkan 4 desimal |
| D- | 640-660 | idem |
| V | 697-739 | `D-/(D+ + D-)`, disimpan `round(..., 4)` |
| Hasil | 771-786 | diurutkan `ORDER BY nilai DESC`, nomor urut posisi |

### Sumber

Hwang dan Yoon, *Multiple Attribute Decision Making: Methods and Applications*, 1981. Yoon dan Hwang, 1995, untuk ringkasan langkah.

---

## 5. Temuan pada implementasi lama

Bagian ini penting karena menjadi dasar keputusan apa yang **tidak** diwarisi ke engine baru. Setiap temuan diberi kode T.

### T1. Pembulatan di tengah perhitungan (TOPSIS)

`r_ij` dibulatkan 4 desimal (baris 419) lalu `y_ij` juga dibulatkan 4 desimal (baris 466). Solusi ideal, `D+`, `D-`, dan `V` semuanya dihitung dari angka yang sudah dibulatkan dua kali.

Dampak: hasil bergeser di digit ketiga sampai keempat, dan peringkat bisa bertukar bila dua alternatif berdekatan.

Keputusan: engine baru menghitung penuh tanpa pembulatan antara, membulatkan hanya saat tampil (4 desimal) dan saat simpan (8 desimal). Angka di `dataset-demo-f0.json` mengikuti aturan ini, sehingga bisa berbeda tipis dari aplikasi lama.

### T2. Peringkat memakai nomor urut posisi, bukan peringkat

Kode lama menomori hasil dengan counter `$no` setelah `ORDER BY nilai DESC` (baris 771-786, 1066-1080). Bila dua alternatif bernilai sama, keduanya tetap mendapat nomor berbeda, dan urutannya tidak deterministik karena MySQL tidak menjamin urutan untuk nilai yang sama.

Keputusan: engine baru memakai dense ranking dan menandai `tied: true`. Nomor peringkat tidak melompat saat ada seri.

### T3. Presisi penyimpanan tidak konsisten

- SAW menyimpan `$nilai_v` tanpa pembulatan (baris 250).
- WP menyimpan `round($nilai_v, 4)` (baris 1034).
- TOPSIS menyimpan `round($nilai_v, 4)` (baris 736).

Keputusan: semua metode menyimpan 8 desimal di `computation_results.score`.

### T4. Hasil ditulis saat render, dan tabel hasil di-truncate

`hapus_hasil_saw()` dipanggil di baris 222, `hapus_hasil_topsis()` di 692, `hapus_hasil_wp()` di 1006, semuanya di dalam view. Membuka halaman perhitungan berarti menghapus hasil sebelumnya. Tidak ada riwayat.

Keputusan: perhitungan tidak lagi menulis saat render. Penulisan hanya lewat aksi eksplisit simpan, dengan `snapshot` immutable di `computation_runs`.

### T5. Tidak ada guard pembagian

Semua pembagian memakai `@` untuk menekan error (baris 186, 188, 236, 238, 418, 465, 598, 655, 722, 726, 958, 962). Bila sel kosong, nilai nol, atau penyebut nol, PHP menghasilkan `INF`, `NAN`, atau `0` tanpa peringatan, dan angka itu masuk ke tabel hasil.

Keputusan: engine baru menolak input tidak lengkap lebih dulu, dengan pesan per alternatif dan kriteria. Pembagi nol pada kriteria cost ditolak, bukan diisi nol.

### T6. Bobot tidak dinormalisasi pada SAW dan TOPSIS

Kode lama memakai `$key->bobot` mentah untuk SAW (baris 232, 240) dan TOPSIS (baris 465, 598, 722). Hanya WP yang menormalisasi (baris 901, 958, 962). Aplikasi lama tidak memeriksa apakah total bobot 1.

Dampak: bila pengguna memasukkan bobot 20, 25, 30, 25 (skala 100), SAW menghasilkan skor 100 kali lipat dan TOPSIS tetap menghasilkan `V` yang benar karena pembobotan konstan, tetapi tabel `Y` dan angka antara menjadi tidak lazim.

Keputusan: engine baru selalu menormalisasi bobot untuk kepentingan tampilan angka antara, dan memberi peringatan bila total bobot bukan 1 sebelum hitung diizinkan. Untuk TOPSIS, normalisasi bobot tidak mengubah peringkat, hanya skala `Y`.

### T7. Perhitungan bergantung pada id sub kriteria

`data_nilai()` (model baris 19-23) melakukan join `penilaian.nilai = sub_kriteria.id_sub_kriteria`. Artinya nilai numerik sebenarnya tidak tersimpan di `penilaian`, melainkan diambil dari `sub_kriteria.nilai` yang id-nya dipilih. Kode lama menampilkan `$data_pencocokan['nilai']` seolah itu angka penilaian, padahal itu nilai rubrik hasil join.

Keputusan: `scores.value` menyimpan angka desimal langsung, `rubric_id` hanya rujukan bantuan input. Skema baru tidak bergantung pada id rubrik.

### T8. Query mentah ber-interpolasi

`Perhitungan_model.php` baris 21, 27, 33, 40, 64 memakai string SQL dengan variabel langsung. Nilai berasal dari `$_POST` di beberapa jalur.

Keputusan: engine baru memakai Drizzle dengan parameter terikat. Tidak ada string SQL yang dirangkai dari input pengguna.

### T9. Import yang tidak dipakai

`perhitungan.php` baris 3 memuat `use phpDocumentor\Reflection\Types\This;`. Sisa tooling, tidak berpengaruh ke hasil, tidak dibawa.

### T10. TOPSIS memakai `Y` untuk solusi ideal (bukan penyimpangan)

Kode lama menghitung solusi ideal dari `normalisasi_terbobot`, yaitu matriks `Y = w * R`. Ini **sesuai** Hwang dan Yoon, dan bukan kesalahan. Catatan ini ditulis agar tidak ada yang "memperbaiki" hal yang sudah benar. Penyimpangan TOPSIS yang nyata adalah T1, bukan langkah ini.

---

## 6. Dataset demo dan angka acuan

Dataset: `docs/reference/dataset-demo-f0.json`. Skala 1 sampai 5 mengikuti rubrik aplikasi lama.

Kriteria:

| Kode | Kriteria | Bobot | Arah |
|---|---|---|---|
| C1 | Relevansi tema dan judul | 0,30 | benefit |
| C2 | Ketajaman metodologi | 0,25 | benefit |
| C3 | Ketersediaan data | 0,20 | benefit |
| C4 | Beban biaya dan waktu | 0,25 | cost |

Total bobot 1,00, sehingga bobot ternormalisasi sama dengan bobot mentah. Dataset ini sengaja memakai total tepat 1; kasus total bukan 1 diuji terpisah di unit test.

Matriks keputusan:

| Kode | C1 | C2 | C3 | C4 |
|---|---|---|---|---|
| A1 | 4 | 3 | 5 | 2 |
| A2 | 3 | 5 | 4 | 3 |
| A3 | 5 | 4 | 3 | 4 |
| A4 | 2 | 2 | 4 | 1 |

### SAW

`max` per kriteria: 5, 5, 5, 4. `min` per kriteria: 2, 2, 3, 1.

| Kode | r C1 | r C2 | r C3 | r C4 | V | Peringkat |
|---|---|---|---|---|---|---|
| A1 | 0,8000 | 0,6000 | 1,0000 | 0,5000 | 0,715000 | 1 |
| A2 | 0,6000 | 1,0000 | 0,8000 | 0,3333 | 0,673333 | 3 |
| A3 | 1,0000 | 0,8000 | 0,6000 | 0,2500 | 0,682500 | 2 |
| A4 | 0,4000 | 0,4000 | 0,8000 | 1,0000 | 0,630000 | 4 |

Perhitungan A1: `0,30(0,8) + 0,25(0,6) + 0,20(1,0) + 0,25(0,5) = 0,24 + 0,15 + 0,20 + 0,125 = 0,715`.
Perhitungan A2: `0,30(0,6) + 0,25(1,0) + 0,20(0,8) + 0,25(1/3) = 0,18 + 0,25 + 0,16 + 0,083333 = 0,673333`.
Perhitungan A3: `0,30(1,0) + 0,25(0,8) + 0,20(0,6) + 0,25(0,25) = 0,30 + 0,20 + 0,12 + 0,0625 = 0,6825`.
Perhitungan A4: `0,30(0,4) + 0,25(0,4) + 0,20(0,8) + 0,25(1,0) = 0,12 + 0,10 + 0,16 + 0,25 = 0,63`.

### WP

| Kode | S | V | Peringkat |
|---|---|---|---|
| A1 | 2,314381 | 0,277181 | 1 |
| A2 | 2,084542 | 0,249655 | 2 |
| A3 | 2,018902 | 0,241793 | 3 |
| A4 | 1,931873 | 0,231370 | 4 |

Total S = 8,349697.

Perhitungan S untuk A1: `4^0,30 * 3^0,25 * 5^0,20 * 2^(-0,25)`.
`4^0,30 = 1,515717`, `3^0,25 = 1,316074`, `5^0,20 = 1,379730`, `2^(-0,25) = 0,840896`.
Hasil kali: `1,515717 * 1,316074 * 1,379730 * 0,840896 = 2,314381`.

### TOPSIS

Pembagi per kriteria: C1 `akar(54) = 7,348469`, C2 `akar(54) = 7,348469`, C3 `akar(66) = 8,124038`, C4 `akar(30) = 5,477226`.

Matriks terbobot `Y`:

| Kode | Y C1 | Y C2 | Y C3 | Y C4 |
|---|---|---|---|---|
| A1 | 0,163299 | 0,102062 | 0,123091 | 0,091287 |
| A2 | 0,122474 | 0,170103 | 0,098473 | 0,136931 |
| A3 | 0,204124 | 0,136083 | 0,073855 | 0,182574 |
| A4 | 0,081650 | 0,068041 | 0,098473 | 0,045644 |

Solusi ideal, dihitung dari `Y`:

| Baris | C1 | C2 | C3 | C4 |
|---|---|---|---|---|
| A+ | 0,204124 | 0,170103 | 0,123091 | 0,045644 |
| A- | 0,081650 | 0,068041 | 0,073855 | 0,182574 |

C1 sampai C3 memakai max karena benefit, C4 memakai min karena cost untuk A+, dan sebaliknya untuk A-.

| Kode | D+ | D- | V | Peringkat |
|---|---|---|---|---|
| A1 | 0,091540 | 0,136315 | 0,598252 | 1 |
| A2 | 0,124924 | 0,121543 | 0,493141 | 2 |
| A3 | 0,149438 | 0,140106 | 0,483885 | 3 |
| A4 | 0,161316 | 0,139126 | 0,463072 | 4 |

### Ringkasan peringkat

| Kode | SAW | WP | TOPSIS |
|---|---|---|---|
| A1 | 1 | 1 | 1 |
| A2 | 3 | 2 | 2 |
| A3 | 2 | 3 | 3 |
| A4 | 4 | 4 | 4 |

A1 unggul di ketiga metode. A2 dan A3 bertukar posisi antara SAW dan WP, yang justru berguna untuk menguji halaman perbandingan (Borda, Spearman, Kendall W) di F7: dataset ini menghasilkan korelasi tidak sempurna tanpa perlu data tambahan.

---

## 7. Prosedur verifikasi

### 7.1 Lembar spreadsheet

File: `docs/reference/perhitungan-manual.xlsx`, empat sheet: `Input`, `SAW`, `WP`, `TOPSIS`.

Sheet `Input` berisi bobot dan matriks nilai. Sheet lain memakai formula yang merujuk balik ke `Input`, sehingga mengubah satu nilai di `Input` akan mengubah seluruh hasil. Rumus spreadsheet ditulis terpisah dari kode TypeScript, jadi bila keduanya menghasilkan angka yang sama, kemungkinan besar rumusnya benar dan bukan sekadar cocok dengan dirinya sendiri.

Status verifikasi workbook: **sudah dihitung dan dicocokkan**. File dibuka di Excel, dihitung ulang penuh, dan nilai pada ketiga sheet dibandingkan dengan `dataset-demo-f0.json`. Seluruh angka cocok pada 6 desimal:

| Metode | Spreadsheet | JSON fixture | Selisih |
|---|---|---|---|
| SAW V | 0,715000 / 0,673333 / 0,682500 / 0,630000 | sama | 0 |
| WP S total | 8,349697 | 8,349697 | 0 |
| WP V | 0,277181 / 0,249655 / 0,241793 / 0,231370 | sama | 0 |
| TOPSIS pembagi | 7,348469 / 7,348469 / 8,124038 / 5,477226 | sama | 0 |
| TOPSIS D+ | 0,091540 / 0,124924 / 0,149438 / 0,161316 | sama | 0 |
| TOPSIS D- | 0,136315 / 0,121543 / 0,140106 / 0,139126 | sama | 0 |
| TOPSIS V | 0,598252 / 0,493141 / 0,483885 / 0,463072 | sama | 0 |
| Peringkat ketiga metode | 1-3-2-4 / 1-2-3-4 / 1-2-3-4 | sama | 0 |

Workbook disimpan dengan `fullCalcOnLoad`, jadi nilai akan dihitung ulang otomatis saat dibuka di Excel atau LibreOffice.

### 7.2 Langkah verifikasi saat F5

1. Jalankan unit test engine terhadap `dataset-demo-f0.json`. Semua nilai harus cocok dalam toleransi `1e-4`.
2. Ulangi pemeriksaan spreadsheet bila dataset demo diubah: buka `perhitungan-manual.xlsx`, bandingkan kolom `V` dan peringkat ketiga sheet dengan keluaran aplikasi.
3. Bila ada selisih, periksa pada langkah mana. Selisih yang berasal dari pembulatan tampilan bukan kegagalan; selisih pada nilai sebelum pembulatan adalah kegagalan.
4. Catat hasilnya di kolom status pada tabel di bawah.

| Metode | Spreadsheet (F0) | Unit test engine (F5) | Catatan |
|---|---|---|---|
| SAW | lolos, selisih 0 | belum dijalankan | menunggu F5 |
| WP | lolos, selisih 0 | belum dijalankan | menunggu F5 |
| TOPSIS | lolos, selisih 0 | belum dijalankan | menunggu F5 |

### 7.3 Invarian yang wajib diuji

Sudah dijalankan pada dataset demo, semua lolos:

| Invarian | Hasil |
|---|---|
| Jumlah bobot ternormalisasi = 1 | lolos, total 1 |
| Skor SAW pada rentang 0 sampai sum(w) | lolos, total V 2,700833 |
| Skor WP pada rentang 0 sampai 1 | lolos |
| Jumlah seluruh skor WP = 1 | lolos, 1,000000000 |
| Skor TOPSIS pada rentang 0 sampai 1 | lolos |
| Skala positif tidak mengubah peringkat SAW, WP, TOPSIS | lolos ketiganya, urutan 0,2,1,3 / 0,1,2,3 / 0,1,2,3 |
| Dua alternatif identik memperoleh skor identik | lolos, 0,752500000000 keduanya |
| Peringkat sesuai acuan manual | lolos SAW 1-3-2-4, WP 1-2-3-4, TOPSIS 1-2-3-4 |

Catatan metodologis: uji invarian ini dijalankan dengan skrip terpisah yang **mengimplementasikan ulang** rumus dari definisi di bagian 2 sampai 4, bukan memanggil engine aplikasi. Tujuannya mengunci angka fixture. Saat F5, engine TypeScript menjadi implementasi ketiga, dan ketiganya harus sepakat.

### 7.4 Uji validitas properti

File: `docs/reference/check-validity.mjs`. Dijalankan: `node docs/reference/check-validity.mjs`. 27 butir, semua lolos.

Berbeda dari invarian 7.3 yang memeriksa angka pada satu dataset, uji ini memeriksa sifat yang harus berlaku untuk sembarang dataset. Kalau salah satu gagal, rumusnya salah, bukan datanya.

| Kelompok | Butir | Hasil |
|---|---|---|
| Satu kriteria benefit: peringkat sama dengan urutan nilai asli | SAW, WP, TOPSIS | lolos, urutan 0312 |
| Satu kriteria cost: nilai terkecil menjadi terbaik | SAW, WP, TOPSIS | lolos, urutan 2130 |
| Normalisasi SAW mencapai 1 pada alternatif terbaik tiap kolom | benefit dan cost | lolos |
| Alternatif yang mendominasi semua kriteria memperoleh peringkat 1 | SAW, WP, TOPSIS | lolos |
| TOPSIS: alternatif terbaik mencapai V = 1, terburuk V = 0 | 2 kasus | lolos, 1,000000000000 dan 0,000000000000 |
| Kasus 2x2 dihitung tangan | SAW A1 = 1, A2 = 0,5 | lolos |
| Kasus 2x2 dihitung tangan | WP S1 = akar 2, V1 = 2/3 | lolos, 1,414213562373 dan 0,666666666667 |
| Kasus 2x2 dihitung tangan | TOPSIS pembagi = akar 20, V = 1 dan 0 | lolos |
| WP dihitung lewat jalur berbeda (perkalian pangkat vs penjumlahan logaritma) | seluruh V | lolos, selisih maks 1,11e-16 |
| TOPSIS dihitung lewat jalur berbeda (jarak langsung vs ekspansi aljabar) | seluruh V | lolos, selisih maks 2,22e-16 |
| TOPSIS: norma Euclidean tiap kolom R = 1 | 4 kolom | lolos |
| TOPSIS: setiap y_ij tidak melebihi w_j | seluruh sel | lolos |
| SAW: skor alternatif lama tidak berubah saat alternatif buruk ditambahkan | 4 baris | lolos |
| Input nol pada kriteria cost terdeteksi sebagai tidak berhingga, bukan NaN diam-diam | WP, TOPSIS | terdeteksi |

Dua butir terakhir pada tabel sebelumnya sengaja menguji **jalur hitung yang berbeda** untuk rumus yang sama. WP dihitung sekali dengan `Math.pow` dan sekali dengan penjumlahan logaritma lalu `Math.exp`. TOPSIS dihitung sekali dengan jarak Euclidean langsung dan sekali dengan ekspansi aljabar `|y|^2 - 2y·A + |A|^2`. Kesepakatan sampai 1e-16 berarti tidak ada kesalahan indeks atau tanda dalam implementasi.

Koreksi yang terjadi saat pengujian ini, dicatat agar tidak diulang:

- Asersi awal saya menyatakan kriteria cost harus memiliki `r` minimum = 1. Itu salah. Untuk cost, `r = min(x)/x`, sehingga nilai terbaik (x terkecil) justru mendapat `r = 1`. Jadi baik benefit maupun cost sama-sama memiliki `r` maksimum = 1, yang membedakan hanya nilai mentahnya.
- Asersi awal saya juga menulis urutan hasil sebagai `'2,1,3,0'`, padahal fungsi pembanding menghasilkan string tanpa koma, yaitu `'2130'`. Kegagalan berasal dari asersi, bukan dari rumus.

### 7.5 Batas validitas: apa yang sudah dan belum dibuktikan

Sudah dibuktikan:

1. Rumus SAW, WP, TOPSIS pada dokumen ini konsisten dengan definisi Hwang dan Yoon serta Kusumadewi untuk langkah normalisasi, pembobotan, dan agregasi.
2. Implementasi rumus di dua jalur berbeda menghasilkan angka yang sama.
3. Perilaku kualitatif benar: benefit naik memperbaiki peringkat, cost naik memperburuk, alternatif dominan menang, alternatif terburuk mendapat skor minimum.
4. Angka pada dataset demo cocok antara hitung manual, skrip, dan workbook Excel, sampai 6 desimal.
5. Kasus 2x2 dengan hasil yang bisa diturunkan tangan cocok persis.

Belum dibuktikan, dan tidak bisa diklaim dari F0:

1. **Kesesuaian dengan skripsi atau laporan yang memakai aplikasi lama.** Aplikasi lama tidak dijalankan (Big Bang), jadi tidak ada perbandingan angka. Bila ada angka di laporan atau naskah yang harus direproduksi, angka itu perlu dimasukkan sebagai fixture tambahan dan selisihnya dijelaskan.
2. **Perilaku pada data nyata berskala besar.** Dataset demo hanya 4x4. Kasus 20 alternatif dengan nilai desimal, nilai duplikat, dan bobot tidak bulat belum diuji.
3. **Implementasi engine TypeScript.** Yang diuji baru definisi rumus dan angka acuan. Engine baru ditulis di F5, dan uji yang sama harus dijalankan ulang terhadap engine tersebut, bukan terhadap skrip independen ini.
4. **Kebenaran substansi kriteria dan bobot.** Validitas matematis tidak berarti kriteria yang dipilih memang layak. Itu keputusan akademik, bukan keputusan perangkat lunak.

Kesimpulan yang jujur: perhitungan SAW, WP, dan TOPSIS di dokumen ini **valid secara matematis dan konsisten di tiga jalur verifikasi**, tetapi **belum diverifikasi terhadap hasil aplikasi lama atau laporan tertentu**. Untuk keperluan skripsi, langkah yang masih perlu diambil adalah memasukkan angka dari naskah sebagai fixture tambahan di F5.

---

## 8. Referensi

1. Hwang, C. L., dan Yoon, K. *Multiple Attribute Decision Making: Methods and Applications*. Springer, 1981. (TOPSIS)
2. Yoon, K., dan Hwang, C. L. *Multiple Attribute Decision Making: An Introduction*. Sage, 1995. (ringkasan SAW, WP, TOPSIS)
3. Kusumadewi, S., Hartati, S., Harjoko, A., dan Wardoyo, R. *Fuzzy Multi-Attribute Decision Making (Fuzzy MADM)*. Graha Ilmu, 2006. (SAW dan WP dalam konteks Indonesia)
4. Saaty, T. L. *The Analytic Hierarchy Process*. McGraw-Hill, 1980. (dirujuk untuk F10, bukan untuk F0)