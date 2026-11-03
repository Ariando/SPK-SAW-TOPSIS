import fs from 'node:fs';
import { existsSync } from 'node:fs';

/**
 * Mencari peramban Chromium yang sudah terpasang di mesin.
 *
 * Dipakai `puppeteer-core` yang tidak membawa Chromium sendiri, supaya tidak
 * perlu mengunduh sekitar 150 MB. Bila tidak ada yang ditemukan, pemanggil
 * menerima pesan yang menjelaskan cara mengatasinya, bukan galat samar.
 */
const WINDOWS_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const MACOS_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

const LINUX_CANDIDATES = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
];

export class BrowserNotFoundError extends Error {
  constructor(searched: string[]) {
    super(
      'Tidak ditemukan peramban Chromium untuk membuat PDF. ' +
        'Pasang Google Chrome atau Microsoft Edge, atau set PUPPETEER_EXECUTABLE_PATH ' +
        'ke lokasi berkas executable. Lokasi yang diperiksa: ' +
        searched.join(', ')
    );
    this.name = 'BrowserNotFoundError';
  }
}

export function resolveExecutablePath(): string {
  // Variabel lingkungan menang, supaya pengguna bisa menunjuk lokasi khusus.
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const candidates =
    process.platform === 'win32'
      ? WINDOWS_CANDIDATES
      : process.platform === 'darwin'
        ? MACOS_CANDIDATES
        : LINUX_CANDIDATES;

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new BrowserNotFoundError(candidates);
}

export function browserAvailable(): boolean {
  try {
    resolveExecutablePath();
    return true;
  } catch {
    return false;
  }
}

/** Membaca versi peramban untuk ditampilkan di laporan, bila memungkinkan. */
export function browserLabel(): string {
  try {
    const path = resolveExecutablePath();
    return path.split(/[\\/]/).slice(-3).join('/');
  } catch {
    return 'tidak tersedia';
  }
}

export { fs };