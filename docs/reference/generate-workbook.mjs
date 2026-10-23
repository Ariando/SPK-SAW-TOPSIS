// Generator workbook verifikasi F0 untuk TELAAH.
// Dijalankan: node docs/reference/generate-workbook.mjs
// Membutuhkan paket exceljs, yang nanti menjadi dependensi app/ pada F7.
// Sebelum app/ ada, pasang sekali tanpa menyimpan ke manifest:
//   npm install --no-save exceljs
// Atau tunjuk lokasi instalasi lain lewat EXCELJS_PATH:
//   $env:EXCELJS_PATH="C:\path\to\node_modules\exceljs"; node docs/reference/generate-workbook.mjs
// Rumus ditulis ulang di spreadsheet, terpisah dari kode engine, supaya
// perbandingan angka benar-benar independen.

const ExcelJS = await (async () => {
  try {
    return (await import('exceljs')).default;
  } catch (err) {
    const custom = process.env.EXCELJS_PATH;
    if (!custom) {
      console.error('exceljs tidak ditemukan. Jalankan: npm install --no-save exceljs');
      console.error('atau set EXCELJS_PATH ke folder paket exceljs.');
      throw err;
    }
    return (await import(new URL('file://' + custom.replace(/\\/g, '/') + '/lib/exceljs.nodejs.js').href)).default;
  }
})();

const outPath = new URL('./perhitungan-manual.xlsx', import.meta.url);

const wb = new ExcelJS.Workbook();
wb.creator = 'TELAAH F0';
wb.created = new Date('2026-10-23T00:00:00Z');
wb.calcProperties.fullCalcOnLoad = true;

const headings = (ws, row, values) => {
  const r = ws.getRow(row);
  values.forEach((v, i) => {
    r.getCell(i + 1).value = v;
  });
  r.font = { bold: true };
};

const criteria = [
  ['C1', 'Relevansi tema dan judul', 0.3, 'benefit'],
  ['C2', 'Ketajaman metodologi', 0.25, 'benefit'],
  ['C3', 'Ketersediaan data', 0.2, 'benefit'],
  ['C4', 'Beban biaya dan waktu', 0.25, 'cost'],
];

const alternatives = [
  ['A1', 'Sistem rekomendasi beasiswa berbasis profil', [4, 3, 5, 2]],
  ['A2', 'Deteksi plagiarisme dokumen akademik', [3, 5, 4, 3]],
  ['A3', 'Optimasi jadwal kuliah dengan algoritma genetika', [5, 4, 3, 4]],
  ['A4', 'Aplikasi monitoring magang berbasis web', [2, 2, 4, 1]],
];

const inCols = ['C', 'D', 'E', 'F'];
const outCols = ['B', 'C', 'D', 'E'];

// ---------------- Input ----------------
const input = wb.addWorksheet('Input', { views: [{ state: 'frozen', ySplit: 12 }] });
input.getCell('A1').value = 'TELAAH - Lembar verifikasi manual (dataset demo F0)';
input.getCell('A1').font = { bold: true, size: 14 };
input.getCell('A2').value =
  'Ubah bobot di C5:C8 dan nilai di C13:F16. Sheet SAW, WP, TOPSIS menghitung ulang otomatis.';

headings(input, 4, ['Kode', 'Kriteria', 'Bobot', 'Arah']);
criteria.forEach(([k, n, b, d], i) => {
  const row = 5 + i;
  input.getCell(row, 1).value = k;
  input.getCell(row, 2).value = n;
  input.getCell(row, 3).value = b;
  input.getCell(row, 4).value = d;
});
input.getCell('A10').value = 'Total bobot';
input.getCell('C10').value = { formula: 'SUM(C5:C8)' };

headings(input, 12, ['Kode', 'Judul proposal', 'C1', 'C2', 'C3', 'C4']);
alternatives.forEach(([k, t, x], i) => {
  const row = 13 + i;
  input.getCell(row, 1).value = k;
  input.getCell(row, 2).value = t;
  x.forEach((v, j) => {
    input.getCell(row, 3 + j).value = v;
  });
});

input.getCell('A18').value =
  'Bobot 0.30 / 0.25 / 0.20 / 0.25 dipilih agar totalnya tepat 1. Arah C4 adalah cost.';
input.getCell('A19').value =
  'Skala nilai 1 sampai 5 mengikuti rubrik penilaian yang dipakai aplikasi lama.';

input.getColumn(1).width = 12;
input.getColumn(2).width = 46;
[3, 4, 5, 6].forEach((c) => {
  input.getColumn(c).width = 11;
});
input.getColumn(3).numFmt = '0.00';

// ---------------- SAW ----------------
const saw = wb.addWorksheet('SAW');
saw.getCell('A1').value = 'SAW - Simple Additive Weighting';
saw.getCell('A1').font = { bold: true, size: 14 };
saw.getCell('A2').value =
  'r_ij = x_ij / max(x_j) untuk benefit, min(x_j) / x_ij untuk cost. V_i = jumlah w_j * r_ij.';
headings(saw, 4, ['Kode', 'C1', 'C2', 'C3', 'C4', 'V_i', 'Peringkat']);

for (let i = 0; i < 4; i++) {
  const row = 5 + i;
  const src = 13 + i;
  saw.getCell(`A${row}`).value = { formula: `Input!A${src}` };
  outCols.forEach((outCol, j) => {
    const inCol = inCols[j];
    const dirRow = 5 + j;
    saw.getCell(`${outCol}${row}`).value = {
      formula: `IF(Input!$D$${dirRow}="benefit",Input!${inCol}${src}/MAX(Input!${inCol}$13:${inCol}$16),MIN(Input!${inCol}$13:${inCol}$16)/Input!${inCol}${src})`,
    };
  });
  saw.getCell(`F${row}`).value = {
    formula: `Input!$C$5*B${row}+Input!$C$6*C${row}+Input!$C$7*D${row}+Input!$C$8*E${row}`,
  };
  saw.getCell(`G${row}`).value = { formula: `RANK(F${row},$F$5:$F$8,0)` };
  for (let c = 2; c <= 6; c++) saw.getCell(row, c).numFmt = '0.000000';
}
saw.getCell('A10').value =
  'Peringkat memakai RANK. Aplikasi memakai dense ranking agar seri tidak melewati nomor urut.';
saw.getColumn(1).width = 10;
for (let c = 2; c <= 7; c++) saw.getColumn(c).width = 12;

// ---------------- WP ----------------
const wp = wb.addWorksheet('WP');
wp.getCell('A1').value = 'WP - Weighted Product';
wp.getCell('A1').font = { bold: true, size: 14 };
wp.getCell('A2').value =
  'w_j dinormalisasi dengan total bobot. S_i = produk x_ij^w_j untuk benefit, x_ij^(-w_j) untuk cost. V_i = S_i / jumlah S.';
wp.getCell('A4').value = 'Bobot ternormalisasi';
wp.getCell('A4').font = { bold: true };
[5, 6, 7, 8].forEach((srcRow, j) => {
  wp.getCell(`${outCols[j]}4`).value = { formula: `Input!C${srcRow}/Input!$C$10` };
  wp.getCell(`${outCols[j]}4`).numFmt = '0.000000';
});

headings(wp, 6, ['Kode', 'C1', 'C2', 'C3', 'C4', 'S_i', 'V_i', 'Peringkat']);
for (let i = 0; i < 4; i++) {
  const row = 7 + i;
  const src = 13 + i;
  wp.getCell(`A${row}`).value = { formula: `Input!A${src}` };
  outCols.forEach((outCol, j) => {
    const inCol = inCols[j];
    const dirRow = 5 + j;
    wp.getCell(`${outCol}${row}`).value = {
      formula: `IF(Input!$D$${dirRow}="benefit",POWER(Input!${inCol}${src},${outCol}$4),POWER(Input!${inCol}${src},-${outCol}$4))`,
    };
  });
  wp.getCell(`F${row}`).value = { formula: `PRODUCT(B${row}:E${row})` };
  wp.getCell(`G${row}`).value = { formula: `F${row}/SUM($F$7:$F$10)` };
  wp.getCell(`H${row}`).value = { formula: `RANK(G${row},$G$7:$G$10,0)` };
  for (let c = 2; c <= 7; c++) wp.getCell(row, c).numFmt = '0.000000';
}
wp.getCell('A12').value =
  'Peringkat memakai RANK. Aplikasi memakai dense ranking agar seri tidak melewati nomor urut.';
wp.getColumn(1).width = 10;
for (let c = 2; c <= 8; c++) wp.getColumn(c).width = 13;

// ---------------- TOPSIS ----------------
const tm = wb.addWorksheet('TOPSIS');
tm.getCell('A1').value = 'TOPSIS';
tm.getCell('A1').font = { bold: true, size: 14 };
tm.getCell('A2').value =
  'r_ij = x_ij / akar(jumlah x_ij^2). y_ij = w_j * r_ij. V_i = D_i- / (D_i+ + D_i-).';
tm.getCell('A4').value = 'Pembagi';
tm.getCell('A4').font = { bold: true };
inCols.forEach((inCol, j) => {
  tm.getCell(`${outCols[j]}4`).value = { formula: `SQRT(SUMSQ(Input!${inCol}13:${inCol}16))` };
  tm.getCell(`${outCols[j]}4`).numFmt = '0.000000';
});

tm.getCell('A6').value = 'R ternormalisasi';
tm.getCell('A6').font = { bold: true };
headings(tm, 7, ['Kode', 'C1', 'C2', 'C3', 'C4']);
for (let i = 0; i < 4; i++) {
  const row = 8 + i;
  const src = 13 + i;
  tm.getCell(`A${row}`).value = { formula: `Input!A${src}` };
  outCols.forEach((outCol, j) => {
    tm.getCell(`${outCol}${row}`).value = { formula: `Input!${inCols[j]}${src}/${outCol}$4` };
    tm.getCell(`${outCol}${row}`).numFmt = '0.000000';
  });
}

tm.getCell('A13').value = 'Y terbobot';
tm.getCell('A13').font = { bold: true };
headings(tm, 14, ['Kode', 'C1', 'C2', 'C3', 'C4']);
for (let i = 0; i < 4; i++) {
  const row = 15 + i;
  tm.getCell(`A${row}`).value = { formula: `Input!A${13 + i}` };
  outCols.forEach((outCol, j) => {
    tm.getCell(`${outCol}${row}`).value = { formula: `${outCol}$${8 + i}*Input!$C$${5 + j}` };
    tm.getCell(`${outCol}${row}`).numFmt = '0.000000';
  });
}

tm.getCell('A20').value = 'A+';
tm.getCell('A20').font = { bold: true };
tm.getCell('A21').value = 'A-';
tm.getCell('A21').font = { bold: true };
outCols.forEach((outCol, j) => {
  const dirRow = 5 + j;
  tm.getCell(`${outCol}20`).value = {
    formula: `IF(Input!$D$${dirRow}="benefit",MAX(${outCol}15:${outCol}18),MIN(${outCol}15:${outCol}18))`,
  };
  tm.getCell(`${outCol}21`).value = {
    formula: `IF(Input!$D$${dirRow}="benefit",MIN(${outCol}15:${outCol}18),MAX(${outCol}15:${outCol}18))`,
  };
  tm.getCell(`${outCol}20`).numFmt = '0.000000';
  tm.getCell(`${outCol}21`).numFmt = '0.000000';
});

tm.getCell('A23').value = 'Jarak dan kedekatan';
tm.getCell('A23').font = { bold: true };
headings(tm, 24, ['Kode', 'D+', 'D-', 'V_i', 'Peringkat']);
for (let i = 0; i < 4; i++) {
  const row = 25 + i;
  const src = 15 + i;
  tm.getCell(`A${row}`).value = { formula: `Input!A${13 + i}` };
  tm.getCell(`B${row}`).value = {
    formula: `SQRT(SUMSQ(B${src}-B$20,C${src}-C$20,D${src}-D$20,E${src}-E$20))`,
  };
  tm.getCell(`C${row}`).value = {
    formula: `SQRT(SUMSQ(B${src}-B$21,C${src}-C$21,D${src}-D$21,E${src}-E$21))`,
  };
  tm.getCell(`D${row}`).value = { formula: `C${row}/(B${row}+C${row})` };
  tm.getCell(`E${row}`).value = { formula: `RANK(D${row},$D$25:$D$28,0)` };
  for (let c = 2; c <= 4; c++) tm.getCell(row, c).numFmt = '0.000000';
}
tm.getColumn(1).width = 10;
for (let c = 2; c <= 5; c++) tm.getColumn(c).width = 14;

await wb.xlsx.writeFile(outPath);
console.log('written: docs/reference/perhitungan-manual.xlsx');