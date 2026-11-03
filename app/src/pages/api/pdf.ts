import type { APIRoute } from 'astro';
import { browserAvailable } from '../../lib/pdf/browser';
import { renderPdf, PdfRenderError } from '../../lib/pdf/render';
import { ORIGIN_LABEL } from '../../lib/format';

/**
 * Endpoint pembuatan PDF.
 *
 * Hanya menerima path internal, bukan URL bebas. Tanpa batas ini, endpoint
 * dapat dipakai mengambil halaman mana pun di internet dan mengembalikannya
 * sebagai PDF, yang membuka celah penyalahgunaan sumber daya server.
 */
const ALLOWED_PREFIXES = ['/hasil/', '/hasil/bandingkan', '/ahp/', '/sensitivitas'];

export interface ResolvedTarget {
  /** Path ternormalisasi, tanpa query string. */
  pathname: string;
  /** Path lengkap dengan query string, untuk dimuat peramban. */
  url: string;
  filenameBase: string;
}

/**
 * Menormalkan path sebelum diperiksa.
 *
 * Pemeriksaan string mentah dapat dilewati: `/hasil/../kriteria` berawalan
 * `/hasil/` sehingga lolos, lalu URL dinormalkan menjadi `/kriteria`. Karena
 * itu path dinormalkan lebih dulu, segmen `..` ditolak, dan hasil normalisasi
 * yang diperiksa terhadap daftar izin.
 */
export function resolveTarget(target: string, origin: string): ResolvedTarget | null {
  if (!target.startsWith('/')) return null;

  // Titik dua menandakan URL absolut dengan skema, bukan path internal.
  if (target.includes('://')) return null;

  const [rawPath, ...rest] = target.split('?');
  const query = rest.length > 0 ? '?' + rest.join('?') : '';

  // Segmen `..` ditolak mentah, sebelum normalisasi apa pun.
  if (rawPath.split('/').includes('..')) return null;
  if (rawPath.includes('\\')) return null;

  let parsed: URL;
  try {
    parsed = new URL(rawPath, 'http://internal.invalid');
  } catch {
    return null;
  }

  // Origin harus tetap placeholder, membuktikan path tidak memindahkan host.
  if (parsed.origin !== 'http://internal.invalid') return null;

  const pathname = parsed.pathname;
  const allowed = ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix)
  );
  if (!allowed) return null;

  // Origin aplikasi dipakai untuk URL yang dimuat peramban.
  const absolute = new URL(pathname + query, origin);

  return {
    pathname,
    url: absolute.toString(),
    filenameBase: pathname.replace(/^\/+/, '').replace(/\//g, '-') || 'dokumen',
  };
}

function getCookieHeader(request: Request): { name: string; value: string }[] {
  const raw = request.headers.get('cookie');
  if (!raw) return [];

  return raw
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.includes('='))
    .map((part) => {
      const index = part.indexOf('=');
      return { name: part.slice(0, index), value: part.slice(index + 1) };
    });
}

export const GET: APIRoute = async ({ request, url, locals }) => {
  const user = locals.user;
  if (!user) return new Response('Sesi tidak ditemukan.', { status: 401 });

  const target = url.searchParams.get('halaman');
  if (!target) {
    return new Response('Parameter halaman wajib diisi.', { status: 400 });
  }

  const resolved = resolveTarget(target, url.origin);
  if (!resolved) {
    return new Response(
      'Halaman tidak diizinkan untuk diekspor. Pilih dari halaman hasil, perbandingan, AHP, atau sensitivitas.',
      { status: 400 }
    );
  }

  if (!browserAvailable()) {
    return new Response(
      'Pembuatan PDF memerlukan Google Chrome atau Microsoft Edge yang terpasang di mesin ini.',
      { status: 503 }
    );
  }

  try {
    const buffer = await renderPdf({
      url: resolved.url,
      cookies: getCookieHeader(request),
      headerLabel: 'TELAAH, Telaah Kelayakan Proposal Skripsi',
      footerLabel: ORIGIN_LABEL,
    });

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = 'telaah-' + resolved.filenameBase + '-' + stamp + '.pdf';

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        // Label tombol berbunyi "Unduh PDF", jadi berkas disimpan, bukan
        // dibuka di tab peramban.
        'content-disposition': 'attachment; filename="' + filename + '"',
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    const message =
      error instanceof PdfRenderError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Pembuatan PDF gagal.';

    return new Response(message, {
      status: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
};