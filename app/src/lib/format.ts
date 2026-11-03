export function formatNumber(value: number | string, digits = 4): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '-';
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export function formatDateTime(value: Date | string | null): string {
  if (!value) return '-';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

export function formatPercent(value: number, digits = 1): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Nama institusi untuk header dan footer cetak. */
export const ORIGIN_LABEL = 'Institut Sains dan Teknologi AKPRIND Yogyakarta';

export function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '\u2026' : text;
}

/** Tanggal untuk nama berkas, contoh 2026-10-23. Memakai waktu lokal. */
export function formatDateStamp(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Menafsirkan koefisien kesepakatan menjadi kalimat, tanpa memberi label
 * kualitatif yang tidak diminta literatur. Ambang di sini hanya untuk
 * membantu membaca, dan disebut apa adanya.
 */
export function describeAgreement(value: number | null): string {
  if (value === null) return 'tidak dapat dihitung';
  if (value >= 0.9) return 'sangat tinggi';
  if (value >= 0.7) return 'tinggi';
  if (value >= 0.5) return 'sedang';
  if (value >= 0.3) return 'rendah';
  return 'sangat rendah';
}