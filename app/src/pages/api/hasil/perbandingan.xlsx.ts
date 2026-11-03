import type { APIRoute } from 'astro';
import { loadComparison } from '../../../lib/comparison-runtime';
import { buildComparisonWorkbook } from '../../../lib/export/excel';
import { formatDateStamp } from '../../../lib/format';

/**
 * Ekspor Excel untuk halaman perbandingan. Hanya tersedia bila perbandingan
 * memang sah dijalankan, supaya berkas yang diunduh tidak pernah memuat
 * angka dari data yang tidak sebanding.
 */
export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) return new Response('Sesi tidak ditemukan.', { status: 401 });

  const status = await loadComparison();

  if (!status.analysis) {
    const reason = status.blockers.join(' ') || 'Perbandingan belum siap.';
    return new Response(reason, { status: 409, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  const dataHash = status.runs[0]?.dataHash ?? '';
  const buffer = await buildComparisonWorkbook(status, status.analysis, {
    generatedAt: new Date(),
    generatedBy: user.name,
    dataHash,
  });

  const filename = 'telaah-perbandingan-' + formatDateStamp(new Date()) + '.xlsx';

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': 'attachment; filename="' + filename + '"',
      'cache-control': 'no-store',
    },
  });
};