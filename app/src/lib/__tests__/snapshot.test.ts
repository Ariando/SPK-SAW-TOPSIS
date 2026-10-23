import { describe, expect, it } from 'vitest';
import {
  canonicalize,
  hashSnapshot,
  normalizeNumbers,
  splitSnapshot,
  verifySnapshotHash,
  SNAPSHOT_PRECISION,
  type SnapshotContent,
  type RunSnapshot,
} from '../snapshot';

const baseContent: SnapshotContent = {
  version: 1,
  method: 'saw',
  criteria: [
    { code: 'C1', name: 'Relevansi', weight: 0.3, direction: 'benefit' },
    { code: 'C2', name: 'Biaya', weight: 0.7, direction: 'cost' },
  ],
  rawWeightSum: 1,
  alternatives: [
    { code: 'A1', title: 'Proposal satu', values: [4, 2] },
    { code: 'A2', title: 'Proposal dua', values: [2, 4] },
  ],
  scores: { 'A1:C1': 4, 'A1:C2': 2, 'A2:C1': 2, 'A2:C2': 4 },
  ranking: [
    { code: 'A1', title: 'Proposal satu', value: 0.8, rank: 1, tied: false },
    { code: 'A2', title: 'Proposal dua', value: 0.4, rank: 2, tied: false },
  ],
  warnings: [],
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe('sidik snapshot', () => {
  it('isi yang identik menghasilkan sidik yang sama', () => {
    expect(hashSnapshot(baseContent)).toBe(hashSnapshot(clone(baseContent)));
  });

  it('sidik tidak berubah karena waktu penyimpanan berbeda', () => {
    const first: RunSnapshot = { ...clone(baseContent), createdAt: '2026-01-01T00:00:00.000Z' };
    const second: RunSnapshot = { ...clone(baseContent), createdAt: '2026-10-23T10:00:00.000Z' };

    expect(hashSnapshot(splitSnapshot(first).content)).toBe(hashSnapshot(splitSnapshot(second).content));
  });

  it('sidik berubah bila nilai matriks berubah', () => {
    const changed = clone(baseContent);
    changed.alternatives[0].values[0] = 5;
    changed.scores['A1:C1'] = 5;
    expect(hashSnapshot(changed)).not.toBe(hashSnapshot(baseContent));
  });

  it('sidik berubah bila bobot berubah', () => {
    const changed = clone(baseContent);
    changed.criteria[0].weight = 0.4;
    changed.criteria[1].weight = 0.6;
    expect(hashSnapshot(changed)).not.toBe(hashSnapshot(baseContent));
  });

  it('sidik berubah bila peringkat berubah', () => {
    const changed = clone(baseContent);
    changed.ranking[0].rank = 2;
    changed.ranking[1].rank = 1;
    expect(hashSnapshot(changed)).not.toBe(hashSnapshot(baseContent));
  });

  it('urutan kunci objek tidak mengubah sidik', () => {
    const reordered = {
      warnings: baseContent.warnings,
      ranking: baseContent.ranking,
      scores: baseContent.scores,
      alternatives: baseContent.alternatives,
      rawWeightSum: baseContent.rawWeightSum,
      criteria: baseContent.criteria,
      method: baseContent.method,
      version: baseContent.version,
    } as SnapshotContent;

    expect(hashSnapshot(reordered)).toBe(hashSnapshot(baseContent));
  });

  it('urutan array tetap berpengaruh', () => {
    const swapped = clone(baseContent);
    swapped.alternatives = [swapped.alternatives[1], swapped.alternatives[0]];
    expect(hashSnapshot(swapped)).not.toBe(hashSnapshot(baseContent));
  });

  it('verifikasi cocok untuk snapshot yang belum diubah', () => {
    const snapshot: RunSnapshot = { ...clone(baseContent), createdAt: '2026-10-23T10:00:00.000Z' };
    expect(verifySnapshotHash(snapshot, hashSnapshot(baseContent))).toBe(true);
  });

  it('verifikasi gagal bila isi snapshot diubah setelah disimpan', () => {
    const snapshot: RunSnapshot = { ...clone(baseContent), createdAt: '2026-10-23T10:00:00.000Z' };
    const stored = hashSnapshot(baseContent);
    snapshot.ranking[0].value = 0.99;
    expect(verifySnapshotHash(snapshot, stored)).toBe(false);
  });

  it('verifikasi tetap benar walau createdAt diubah', () => {
    const stored = hashSnapshot(baseContent);
    const snapshot: RunSnapshot = { ...clone(baseContent), createdAt: '2030-12-31T23:59:59.000Z' };
    expect(verifySnapshotHash(snapshot, stored)).toBe(true);
  });

  it('kanonikalisasi mengurutkan kunci bersarang', () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalize({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it('selisih floating point dari penyimpanan JSON tidak mengubah sidik', () => {
    // Kasus nyata: MySQL mengembalikan 0.49314085404809205 sebagai
    // 0.4931408540480921 setelah bolak balik lewat kolom JSON.
    const asWritten = clone(baseContent);
    asWritten.ranking[0].value = 0.49314085404809205;

    const asReadBack = clone(baseContent);
    asReadBack.ranking[0].value = 0.4931408540480921;

    expect(hashSnapshot(asWritten)).toBe(hashSnapshot(asReadBack));
  });

  it('selisih yang melebihi presisi tetap menghasilkan sidik berbeda', () => {
    const a = clone(baseContent);
    a.ranking[0].value = 0.493140854048;
    const b = clone(baseContent);
    b.ranking[0].value = 0.493140854049;
    expect(hashSnapshot(a)).not.toBe(hashSnapshot(b));
  });

  it('normalizeNumbers membulatkan angka bersarang tanpa mengubah struktur', () => {
    const input = {
      a: 0.49314085404809205,
      b: [0.1 + 0.2, { c: 1.0000000000004 }],
      d: 'teks',
      e: true,
    };
    const normalized = normalizeNumbers(input);

    expect(normalized.a).toBe(0.493140854048);
    expect(normalized.b[0]).toBe(0.3);
    expect((normalized.b[1] as { c: number }).c).toBe(1);
    expect(normalized.d).toBe('teks');
    expect(normalized.e).toBe(true);
  });

  it('normalizeNumbers menjaga bilangan bulat apa adanya', () => {
    expect(normalizeNumbers({ a: 4, b: [1, 2, 3] })).toEqual({ a: 4, b: [1, 2, 3] });
  });

  it('presisi snapshot paling sedikit 8 desimal untuk kebutuhan simpan', () => {
    expect(SNAPSHOT_PRECISION).toBeGreaterThanOrEqual(8);
  });
});