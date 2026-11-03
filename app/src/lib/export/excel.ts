import ExcelJS from 'exceljs';
import type { AgreementAnalysis } from '../dss/ranking';
import type { ComparisonStatus } from '../comparison';

export interface ExportMeta {
  generatedAt: Date;
  generatedBy: string;
  dataHash: string;
}

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFECEBF7' },
};

const TITLE_FONT: Partial<ExcelJS.Font> = { bold: true, size: 14 };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true };

function styleHeaderRow(row: ExcelJS.Row) {
  row.font = HEADER_FONT;
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFB9BDCC' } } };
  });
}

function addTitle(sheet: ExcelJS.Worksheet, title: string, subtitle: string) {
  sheet.getCell('A1').value = title;
  sheet.getCell('A1').font = TITLE_FONT;
  sheet.getCell('A2').value = subtitle;
  sheet.getCell('A2').font = { size: 10, color: { argb: 'FF5A5F70' } };
}

/**
 * Membangun berkas Excel perbandingan metode.
 * Angka ditulis sebagai angka, bukan teks, supaya bisa dihitung ulang di Excel.
 */
export async function buildComparisonWorkbook(
  status: ComparisonStatus,
  analysis: AgreementAnalysis,
  meta: ExportMeta
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TELAAH';
  workbook.created = meta.generatedAt;

  const dataHashShort = meta.dataHash.slice(0, 16);

  /* ---------------- Ringkasan ---------------- */
  const summary = workbook.addWorksheet('Ringkasan');
  addTitle(
    summary,
    'TELAAH, perbandingan metode',
    'Dibuat ' + meta.generatedAt.toISOString() + ' oleh ' + meta.generatedBy + '. Sidik data ' + dataHashShort + '.'
  );

  summary.getCell('A4').value = 'Kendall W';
  summary.getCell('B4').value = analysis.kendall.w ?? '-';
  summary.getCell('A5').value = 'S';
  summary.getCell('B5').value = analysis.kendall.s;
  summary.getCell('A6').value = 'Khi kuadrat';
  summary.getCell('B6').value = analysis.kendall.chiSquare ?? '-';
  summary.getCell('A7').value = 'Derajat kebebasan';
  summary.getCell('B7').value = analysis.kendall.df;
  summary.getCell('A8').value = 'Nilai p';
  summary.getCell('B8').value = analysis.kendall.pValue ?? '-';
  summary.getColumn(1).width = 22;
  summary.getColumn(2).width = 18;

  if (typeof analysis.kendall.w === 'number') summary.getCell('B4').numFmt = '0.0000';
  if (typeof analysis.kendall.chiSquare === 'number') summary.getCell('B6').numFmt = '0.0000';
  if (typeof analysis.kendall.pValue === 'number') summary.getCell('B8').numFmt = '0.000000';

  summary.getCell('A10').value = 'Rata rata korelasi Spearman';
  summary.getCell('B10').value = analysis.spearman.average ?? '-';
  if (typeof analysis.spearman.average === 'number') summary.getCell('B10').numFmt = '0.0000';

  let summaryRow = 12;
  summary.getCell(`A${summaryRow}`).value = 'Metode';
  summary.getCell(`B${summaryRow}`).value = 'Run';
  summary.getCell(`C${summaryRow}`).value = 'Waktu simpan';
  summary.getCell(`D${summaryRow}`).value = 'Sidik data';
  styleHeaderRow(summary.getRow(summaryRow));

  for (const run of status.runs) {
    summaryRow++;
    summary.getCell(`A${summaryRow}`).value = run.label;
    summary.getCell(`B${summaryRow}`).value = run.id;
    summary.getCell(`C${summaryRow}`).value = run.createdAt;
    summary.getCell(`C${summaryRow}`).numFmt = 'yyyy-mm-dd hh:mm';
    summary.getCell(`D${summaryRow}`).value = run.dataHash.slice(0, 16);
  }
  summary.getColumn(3).width = 20;
  summary.getColumn(4).width = 20;

  /* ---------------- Peringkat ---------------- */
  const ranks = workbook.addWorksheet('Peringkat');
  addTitle(ranks, 'Peringkat per metode dan peringkat gabungan Borda', 'Peringkat rata rata, seri berbagi posisi.');

  const rankHeader = ['Kode', 'Judul', ...analysis.methods.map((m) => 'Peringkat ' + m.label), 'Poin Borda', 'Peringkat Borda'];
  const headerRow = ranks.getRow(4);
  rankHeader.forEach((value, i) => {
    headerRow.getCell(i + 1).value = value;
  });
  styleHeaderRow(headerRow);

  const order = analysis.alternatives.map((a) => a.code);
  const bordaByCode = new Map(analysis.borda.map((row) => [row.code, row]));

  order.forEach((code, index) => {
    const row = ranks.getRow(5 + index);
    row.getCell(1).value = code;
    row.getCell(2).value = analysis.alternatives[index].title;
    analysis.methods.forEach((method, j) => {
      row.getCell(3 + j).value = method.averageRanks[index];
      row.getCell(3 + j).numFmt = '0.00';
    });
    const borda = bordaByCode.get(code);
    row.getCell(3 + analysis.methods.length).value = borda?.points ?? null;
    row.getCell(3 + analysis.methods.length).numFmt = '0.00';
    row.getCell(4 + analysis.methods.length).value = borda?.rank ?? null;
  });

  ranks.getColumn(1).width = 8;
  ranks.getColumn(2).width = 46;
  for (let c = 3; c <= 3 + analysis.methods.length + 1; c++) ranks.getColumn(c).width = 16;

  /* ---------------- Borda ---------------- */
  const bordaSheet = workbook.addWorksheet('Borda');
  addTitle(bordaSheet, 'Peringkat gabungan Borda', 'Poin dijumlahkan antar metode, lalu diurutkan menurun.');

  const bordaHeader = ['Peringkat', 'Kode', 'Judul', 'Poin', 'Seri'];
  const bordaRow = bordaSheet.getRow(4);
  bordaHeader.forEach((value, i) => {
    bordaRow.getCell(i + 1).value = value;
  });
  styleHeaderRow(bordaRow);

  analysis.borda.forEach((entry, index) => {
    const row = bordaSheet.getRow(5 + index);
    row.getCell(1).value = entry.rank;
    row.getCell(2).value = entry.code;
    row.getCell(3).value = entry.title;
    row.getCell(4).value = entry.points;
    row.getCell(4).numFmt = '0.00';
    row.getCell(5).value = entry.tied ? 'ya' : 'tidak';
  });
  bordaSheet.getColumn(1).width = 11;
  bordaSheet.getColumn(2).width = 8;
  bordaSheet.getColumn(3).width = 46;
  bordaSheet.getColumn(4).width = 12;

  /* ---------------- Spearman ---------------- */
  const spearmanSheet = workbook.addWorksheet('Spearman');
  addTitle(spearmanSheet, 'Korelasi peringkat Spearman', 'Dihitung dari peringkat rata rata, sehingga tetap sah saat ada seri.');

  const spearmanHeader = ['Metode A', 'Metode B', 'Koefisien'];
  const spearmanRow = spearmanSheet.getRow(4);
  spearmanHeader.forEach((value, i) => {
    spearmanRow.getCell(i + 1).value = value;
  });
  styleHeaderRow(spearmanRow);

  const labelOf = (methodId: string) =>
    analysis.methods.find((m) => m.methodId === methodId)?.label ?? methodId;

  analysis.spearman.pairs.forEach((pair, index) => {
    const row = spearmanSheet.getRow(5 + index);
    row.getCell(1).value = labelOf(pair.a);
    row.getCell(2).value = labelOf(pair.b);
    row.getCell(3).value = pair.rho;
    row.getCell(3).numFmt = '0.0000';
  });

  if (analysis.spearman.average !== null) {
    const row = spearmanSheet.getRow(5 + analysis.spearman.pairs.length);
    row.getCell(1).value = 'Rata rata';
    row.getCell(3).value = analysis.spearman.average;
    row.getCell(3).numFmt = '0.0000';
    row.font = HEADER_FONT;
  }

  spearmanSheet.getColumn(1).width = 16;
  spearmanSheet.getColumn(2).width = 16;
  spearmanSheet.getColumn(3).width = 14;

  /* ---------------- Kendall ---------------- */
  const kendallSheet = workbook.addWorksheet('Kendall');
  addTitle(kendallSheet, 'Koefisien kesepakatan Kendall W', 'Termasuk koreksi seri pada penyebut.');

  const kendallRows: [string, string | number][] = [
    ['W', analysis.kendall.w ?? '-'],
    ['S', analysis.kendall.s],
    ['Koreksi seri', analysis.kendall.tieCorrection],
    ['Khi kuadrat', analysis.kendall.chiSquare ?? '-'],
    ['Derajat kebebasan', analysis.kendall.df],
    ['Nilai p', analysis.kendall.pValue ?? '-'],
  ];

  kendallRows.forEach(([label, value], index) => {
    const row = kendallSheet.getRow(4 + index);
    row.getCell(1).value = label;
    row.getCell(1).font = HEADER_FONT;
    row.getCell(2).value = value;
    if (typeof value === 'number' && label !== 'Derajat kebebasan' && label !== 'Koreksi seri') {
      row.getCell(2).numFmt = label === 'Nilai p' ? '0.000000' : '0.0000';
    }
  });

  if (analysis.kendall.reason) {
    kendallSheet.getCell('A12').value = 'Catatan';
    kendallSheet.getCell('A12').font = HEADER_FONT;
    kendallSheet.getCell('B12').value = analysis.kendall.reason;
  }

  kendallSheet.getColumn(1).width = 20;
  kendallSheet.getColumn(2).width = 50;

  /* ---------------- Catatan ---------------- */
  if (analysis.warnings.length > 0) {
    const notes = workbook.addWorksheet('Catatan');
    addTitle(notes, 'Catatan perhitungan', 'Baca sebelum mengutip angka pada laporan.');
    analysis.warnings.forEach((warning, index) => {
      const row = notes.getRow(4 + index);
      row.getCell(1).value = index + 1;
      row.getCell(2).value = warning;
      row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    });
    notes.getColumn(1).width = 5;
    notes.getColumn(2).width = 96;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}