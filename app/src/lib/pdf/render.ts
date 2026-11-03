import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { resolveExecutablePath } from './browser';

/**
 * Pembuatan PDF dari halaman yang sudah dirender.
 *
 * Pendekatan: memuat halaman yang sama seperti yang dilihat pengguna, lalu
 * meminta Chromium mencetaknya. Ini menghindari tata letak kedua yang harus
 * dipelihara terpisah, dan memastikan lembar PDF selalu sama dengan hasil
 * cetak peramban.
 *
 * Sesi login tidak diperlukan karena permintaan dibuat dengan cookie yang
 * diteruskan pemanggil; halaman yang memerlukan admin tetap diperiksa oleh
 * aplikasi, bukan oleh pembuat PDF.
 */

export class PdfRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfRenderError';
  }
}

export interface RenderOptions {
  url: string;
  /** Cookie sesi, diteruskan apa adanya ke peramban. */
  cookies: { name: string; value: string }[];
  /** Teks header dan footer. */
  headerLabel: string;
  footerLabel: string;
  /** Batas waktu memuat halaman, milidetik. */
  timeoutMs?: number;
}

let sharedBrowser: Browser | null = null;

/**
 * Peramban dipakai ulang antar permintaan karena menjalankan Chromium baru
 * setiap kali memakan waktu 1 sampai 2 detik. Ditutup lewat `closeBrowser`.
 */
async function getBrowser(): Promise<Browser> {
  if (sharedBrowser && sharedBrowser.connected) return sharedBrowser;

  // Hook dipasang saat peramban pertama kali dibuat, bukan saat modul dimuat,
  // agar proses yang tidak pernah membuat PDF tidak mendaftarkan hook.
  installShutdownHooks();

  const executablePath = resolveExecutablePath();
  sharedBrowser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      // Font dan gambar lokal tidak butuh jaringan, tetapi tetap dibatasi.
      '--disable-background-networking',
      '--disable-extensions',
    ],
  });

  return sharedBrowser;
}

export async function closeBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
  }
}

/**
 * Peramban bersama harus ditutup saat proses berakhir. Tanpa ini, proses
 * Chromium tertinggal hidup setelah server berhenti, dan pada mode dev dengan
 * restart berulang proses yatim itu menumpuk.
 *
 * Hook dipasang sekali saja, dan tidak menahan proses tetap hidup.
 */
let shutdownHooksInstalled = false;

function installShutdownHooks(): void {
  if (shutdownHooksInstalled) return;
  shutdownHooksInstalled = true;

  const shutdown = () => {
    void closeBrowser();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  process.once('beforeExit', shutdown);
}

function parseUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new PdfRenderError('Protokol URL harus http atau https.');
  }
  return parsed;
}

export async function renderPdf(options: RenderOptions): Promise<Buffer> {
  const parsed = parseUrl(options.url);
  const timeout = options.timeoutMs ?? 30000;

  let page: Page | null = null;

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    // Ukuran A4 dengan margin yang menyisakan ruang header dan footer.
    await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 2 });

    // API baru puppeteer 25: cookie diset pada konteks peramban, bukan halaman.
    if (options.cookies.length > 0) {
      await browser.setCookie(
        ...options.cookies.map((cookie) => ({
          name: cookie.name,
          value: cookie.value,
          domain: parsed.hostname,
          path: '/',
          httpOnly: true,
        }))
      );
    }

    // Media print dipakai sejak awal agar halaman dirender dalam bentuk cetak,
    // termasuk menyembunyikan navigasi dan tombol.
    await page.emulateMediaType('print');

    const response = await page.goto(parsed.toString(), {
      waitUntil: 'networkidle0',
      timeout,
    });

    if (!response) throw new PdfRenderError('Halaman tidak memberikan respons.');

    if (response.status() >= 400) {
      throw new PdfRenderError(
        'Halaman mengembalikan status ' + response.status() + '. PDF tidak dibuat.'
      );
    }

    /**
     * Redirect harus ditolak.
     *
     * Halaman yang tidak ada, atau halaman yang menolak akses, mengalihkan ke
     * halaman lain dengan status 3xx. Peramban mengikuti redirect itu secara
     * otomatis, sehingga respons akhirnya 200 dan PDF tercetak dari halaman
     * yang salah tanpa terlihat. Perbandingan URL akhir dengan URL yang diminta
     * menangkap kasus itu.
     */
    const redirects = response.request().redirectChain();
    if (redirects.length > 0 || response.url() !== parsed.toString()) {
      const landed = response.url();
      throw new PdfRenderError(
        'Halaman mengalihkan ke ' + landed + ', sehingga isinya bukan yang diminta. PDF tidak dibuat.'
      );
    }

    // Tunggu font selesai dimuat agar tabel tidak tercetak dengan font cadangan.
    await page.evaluateHandle('document.fonts.ready');

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:8px; width:100%; padding:0 14mm; color:#5a5f70; display:flex; justify-content:space-between;">
        <span>${escapeHtml(options.headerLabel)}</span>
        <span>Dicetak ${escapeHtml(new Date().toLocaleString('id-ID'))}</span>
      </div>`,
      footerTemplate: `<div style="font-size:8px; width:100%; padding:0 14mm; color:#5a5f70; display:flex; justify-content:space-between;">
        <span>${escapeHtml(options.footerLabel)}</span>
        <span>Halaman <span class="pageNumber"></span> dari <span class="totalPages"></span></span>
      </div>`,
      margin: { top: '18mm', right: '12mm', bottom: '18mm', left: '12mm' },
    });

    return Buffer.from(pdf);
  } catch (error) {
    if (error instanceof PdfRenderError) throw error;
    throw new PdfRenderError(
      error instanceof Error ? error.message : 'Pembuatan PDF gagal tanpa keterangan.'
    );
  } finally {
    if (page) {
      await page.close().catch(() => undefined);
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}