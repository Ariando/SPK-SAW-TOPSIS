// Verifikasi independen modul sensitivitas.
// Menghitung ulang bobot perturbasi dan peringkat dengan jalur terpisah,
// lalu membandingkan dengan modul.
//
// Dijalankan: tsx scripts/verify-sensitivity.mjs

const { analyseSensitivity, shiftMatrix, directionOfInfluence } = await import(
  '../src/lib/dss/sensitivity.ts'
);
const { getMethod } = await import('../src/lib/dss/registry.ts');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  (' + detail + ')' : ''));
};

const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

const criteria = [
  { id: 1, code: 'C1', name: 'C1', weight: 0.4, direction: 'benefit' },
  { id: 2, code: 'C2', name: 'C2', weight: 0.35, direction: 'benefit' },
  { id: 3, code: 'C3', name: 'C3', weight: 0.25, direction: 'cost' },
];
const alternatives = [
  { id: 1, code: 'A1', title: 'A1' },
  { id: 2, code: 'A2', title: 'A2' },
  { id: 3, code: 'A3', title: 'A3' },
  { id: 4, code: 'A4', title: 'A4' },
];
const values = [
  [5, 4, 2],
  [4, 5, 3],
  [3, 3, 1],
  [2, 2, 5],
];
const input = { criteria, alternatives, values };

/* ---------- Perhitungan ulang bobot perturbasi secara terpisah ---------- */
const delta = 0.2;
const result = analyseSensitivity(input, { methodId: 'saw', delta });

{
  const baseSum = criteria.reduce((s, c) => s + c.weight, 0);
  const base = criteria.map((c) => c.weight / baseSum);

  const maxWeightsError = Math.max(
    ...result.baseline.weights.map((w, i) => Math.abs(w - base[i]))
  );
  check('bobot dasar cocok dengan normalisasi terpisah', maxWeightsError < 1e-12, maxWeightsError.toExponential(2));

  let worst = 0;
  for (const p of result.perturbations) {
    const index = criteria.findIndex((c) => c.code === p.criterionCode);
    const factor = p.direction === 'increase' ? 1 + delta : 1 - delta;

    // Hitung ulang: bobot dasar dikali faktor pada satu kriteria, lalu normal.
    const raw = base.slice();
    raw[index] = base[index] * factor;
    const total = raw.reduce((s, v) => s + v, 0);
    const expected = raw.map((v) => v / total);

    for (let i = 0; i < expected.length; i++) {
      worst = Math.max(worst, Math.abs(expected[i] - p.weights[i]));
    }
  }
  check('bobot setiap perturbasi cocok dengan hitung terpisah', worst < 1e-12, worst.toExponential(2));
}

/* ---------- Perhitungan ulang peringkat secara terpisah ---------- */
{
  const method = getMethod('saw');

  let worstRank = 0;
  let mismatches = 0;

  for (const p of result.perturbations) {
    const recomputed = method.compute({
      criteria: criteria.map((c, i) => ({ ...c, weight: p.weights[i] })),
      alternatives,
      values,
    });

    const expectedRank = new Map(
      recomputed.ranking.map((r) => {
        const alt = alternatives.find((a) => a.id === r.alternativeId);
        return [alt.code, r.rank];
      })
    );

    for (const row of p.rows) {
      const expected = expectedRank.get(row.code);
      if (expected !== row.rank) {
        mismatches++;
        worstRank = Math.max(worstRank, Math.abs((expected ?? 0) - row.rank));
      }
    }
  }

  check('peringkat setiap perturbasi cocok dengan hitung terpisah', mismatches === 0, mismatches + ' beda, maks ' + worstRank);
}

/* ---------- Selisih peringkat konsisten ---------- */
{
  const baseByCode = new Map(result.baseline.rows.map((r) => [r.code, r.rank]));
  let bad = 0;
  for (const p of result.perturbations) {
    for (const row of p.rows) {
      const expected = row.rank - baseByCode.get(row.code);
      if (row.shift !== expected) bad++;
      if (row.changed !== (expected !== 0)) bad++;
    }
  }
  check('selisih dan penanda perubahan konsisten', bad === 0, bad + ' kesalahan');
}

/* ---------- Total perubahan per kriteria maksimal dua ---------- */
{
  const matrix = shiftMatrix(result);
  const over = matrix.counts.flat().filter((v) => v > 2);
  check('tidak ada sel melebihi dua perubahan', over.length === 0, over.join(',') || 'aman');
  check('bentuk matriks sesuai jumlah kriteria dan alternatif', matrix.criteria.length === 3 && matrix.alternatives.length === 4, matrix.criteria.length + 'x' + matrix.alternatives.length);
}

/* ---------- Arah pengaruh konsisten ---------- */
{
  const contested = {
    criteria: [
      { id: 1, code: 'C1', name: 'C1', weight: 0.5, direction: 'benefit' },
      { id: 2, code: 'C2', name: 'C2', weight: 0.5, direction: 'benefit' },
      { id: 3, code: 'C3', name: 'C3', weight: 0.3, direction: 'cost' },
    ],
    alternatives: alternatives.slice(0, 3),
    values: [
      [9, 1, 5],
      [1, 9, 5],
      [5, 5, 1],
    ],
  };

  const r = analyseSensitivity(contested, { methodId: 'saw', delta: 0.4 });
  const directions = directionOfInfluence(r);

  check('dataset bersaing menghasilkan entri arah', directions.length > 0, directions.length + ' entri');

  let bad = 0;
  for (const d of directions) {
    const rows = r.perturbations.filter((x) => x.criterionCode === d.criterionCode);
    const match = rows.some((p) => {
      const row = p.rows.find((x) => x.code === d.code);
      return row && row.changed && ((row.shift < 0 && d.direction === 'naik') || (row.shift > 0 && d.direction === 'turun'));
    });
    if (!match) bad++;
  }
  check('arah pengaruh konsisten dengan selisih', bad === 0, bad + ' kesalahan dari ' + directions.length + ' entri');
}

/* ---------- Stabilitas peringkat 1 pada data dominan ---------- */
{
  const dominant = {
    criteria: [
      { id: 1, code: 'C1', name: 'C1', weight: 0.5, direction: 'benefit' },
      { id: 2, code: 'C2', name: 'C2', weight: 0.5, direction: 'benefit' },
    ],
    alternatives: alternatives.slice(0, 3),
    values: [
      [9, 9],
      [5, 5],
      [1, 1],
    ],
  };

  const r = analyseSensitivity(dominant, { methodId: 'saw', delta: 0.1 });
  check('data dominan: stabilitas 1', r.summary.topStability === 1, String(r.summary.topStability));
  check('data dominan: tanpa perubahan peringkat', r.summary.withRankChange === 0, String(r.summary.withRankChange));
  check('data dominan: memberi peringatan stabilitas', r.warnings.some((w) => w.includes('stabil')));
}

/* ---------- Perubahan besar membalik peringkat ---------- */
{
  const contested = {
    criteria: [
      { id: 1, code: 'C1', name: 'C1', weight: 0.5, direction: 'benefit' },
      { id: 2, code: 'C2', name: 'C2', weight: 0.5, direction: 'benefit' },
    ],
    alternatives: alternatives.slice(0, 2),
    values: [
      [9, 1],
      [1, 9],
    ],
  };

  const r = analyseSensitivity(contested, { methodId: 'saw', delta: 0.5 });
  check('data bersaing: ada perubahan peringkat 1', r.summary.withTopChange > 0, String(r.summary.withTopChange));
  check('data bersaing: stabilitas di bawah 1', r.summary.topStability < 1, String(r.summary.topStability));
  check('data bersaing: memberi peringatan kesimpulan', r.warnings.some((w) => w.includes('tidak boleh bergantung')));
}

/* ---------- Semua metode berjalan tanpa galat ---------- */
{
  const methods = ['saw', 'wp', 'topsis', 'waspas', 'moora', 'copras', 'vikor', 'edas', 'aras', 'mabac', 'smart'];
  let failed = 0;
  for (const methodId of methods) {
    try {
      const r = analyseSensitivity(input, { methodId, delta: 0.15 });
      if (r.perturbations.length !== 6) failed++;
      if (!r.baseline.rows.every((row) => Number.isFinite(row.value))) failed++;
    } catch (error) {
      failed++;
      console.log('    galat pada ' + methodId + ': ' + error.message);
    }
  }
  check('sebelas metode berjalan tanpa galat', failed === 0, failed + ' kegagalan');
}

/* ---------- Determinisme ---------- */
{
  const a = analyseSensitivity(input, { methodId: 'topsis', delta: 0.1, includeEqualWeights: true });
  const b = analyseSensitivity(input, { methodId: 'topsis', delta: 0.1, includeEqualWeights: true });
  const sameWeights = JSON.stringify(a.perturbations.map((p) => p.weights)) === JSON.stringify(b.perturbations.map((p) => p.weights));
  const sameRanks = JSON.stringify(a.perturbations.map((p) => p.rows.map((r) => r.rank))) === JSON.stringify(b.perturbations.map((p) => p.rows.map((r) => r.rank)));
  check('deterministik pada pemanggilan berulang', sameWeights && sameRanks);
  check('bobot merata berjumlah 1', near(a.equalWeights.weights.reduce((s, v) => s + v, 0), 1, 1e-12));
}

/* ---------- Masukan tidak berubah ---------- */
{
  const snapshot = JSON.stringify(input);
  analyseSensitivity(input, { methodId: 'saw', delta: 0.3 });
  check('objek masukan tidak diubah', JSON.stringify(input) === snapshot);
}

const failed = results.filter((r) => !r.ok).length;
console.log('\n' + (failed === 0 ? 'SELURUHNYA COCOK' : failed + ' GAGAL') + ' (' + results.length + ' butir)');
process.exit(failed === 0 ? 0 : 1);