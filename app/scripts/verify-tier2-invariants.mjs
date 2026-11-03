// Uji invarian lintas sebelas metode pada beberapa dataset.
// Dijalankan: node scripts/verify-tier2-invariants.mjs
// Memakai modul engine langsung, tanpa database.

const { saw } = await import('../src/lib/dss/saw.ts');
const { wp } = await import('../src/lib/dss/wp.ts');
const { topsis } = await import('../src/lib/dss/topsis.ts');
const { waspas } = await import('../src/lib/dss/waspas.ts');
const { moora } = await import('../src/lib/dss/moora.ts');
const { copras } = await import('../src/lib/dss/copras.ts');
const { vikor } = await import('../src/lib/dss/vikor.ts');
const { edas } = await import('../src/lib/dss/edas.ts');
const { aras } = await import('../src/lib/dss/aras.ts');
const { mabac } = await import('../src/lib/dss/mabac.ts');
const { smart } = await import('../src/lib/dss/smart.ts');

const all = [saw, wp, topsis, waspas, moora, copras, vikor, edas, aras, mabac, smart];

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
};

const criterion = (id, code, weight, direction) => ({ id, code, name: code, weight, direction });
const alt = (id, code) => ({ id, code, title: 'Alternatif ' + code });

/* ---------- Dataset 1: campuran benefit dan cost ---------- */
const ds1 = {
  criteria: [criterion(1, 'C1', 0.3, 'benefit'), criterion(2, 'C2', 0.25, 'benefit'), criterion(3, 'C3', 0.2, 'benefit'), criterion(4, 'C4', 0.25, 'cost')],
  alternatives: [alt(1, 'A1'), alt(2, 'A2'), alt(3, 'A3'), alt(4, 'A4')],
  values: [
    [4, 3, 5, 2],
    [3, 5, 4, 3],
    [5, 4, 3, 4],
    [2, 2, 4, 1],
  ],
};

/* ---------- Dataset 2: semua kriteria benefit ---------- */
const ds2 = {
  criteria: [criterion(1, 'C1', 0.5, 'benefit'), criterion(2, 'C2', 0.5, 'benefit')],
  alternatives: [alt(1, 'A1'), alt(2, 'A2'), alt(3, 'A3')],
  values: [
    [5, 5],
    [3, 3],
    [1, 1],
  ],
};

/* ---------- Dataset 3: semua kriteria cost ---------- */
const ds3 = {
  criteria: [criterion(1, 'C1', 0.6, 'cost'), criterion(2, 'C2', 0.4, 'cost')],
  alternatives: [alt(1, 'A1'), alt(2, 'A2'), alt(3, 'A3')],
  values: [
    [5, 5],
    [3, 3],
    [1, 1],
  ],
};

/* ---------- Dataset 4: dua alternatif identik ---------- */
const ds4 = {
  criteria: [criterion(1, 'C1', 0.5, 'benefit'), criterion(2, 'C2', 0.5, 'cost')],
  alternatives: [alt(1, 'A1'), alt(2, 'A2'), alt(3, 'A3')],
  values: [
    [3, 2],
    [3, 2],
    [5, 1],
  ],
};

const orderOf = (result) =>
  result.ranking
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((r) => r.alternativeId)
    .join(',');

/* ---------- Invarian 1: tidak ada NaN atau Infinity ---------- */
for (const [label, ds] of Object.entries({ ds1, ds2, ds3, ds4 })) {
  for (const method of all) {
    const result = method.compute(ds);
    const finite = result.scores.every((s) => Number.isFinite(s.value));
    if (!finite) check(`${method.label} tanpa NaN/Infinity pada ${label}`, false, result.scores.map((s) => s.value).join(','));
  }
}
check('semua metode menghasilkan nilai berhingga pada 4 dataset', !results.some((r) => !r.ok && r.name.includes('NaN')), '');

/* ---------- Invarian 2: skala positif tidak mengubah peringkat ---------- */
for (const method of all) {
  const scaled = { ...ds1, values: ds1.values.map((row) => row.map((v) => v * 7)) };
  const a = orderOf(method.compute(ds1));
  const b = orderOf(method.compute(scaled));
  check(`${method.label} invarian terhadap skala positif`, a === b, a === b ? a : `${a} vs ${b}`);
}

/* ---------- Invarian 3: alternatif identik berskor identik ---------- */
for (const method of all) {
  const result = method.compute(ds4);
  const v1 = result.scores[0].value;
  const v2 = result.scores[1].value;
  const same = Math.abs(v1 - v2) < 1e-9;
  check(`${method.label} memberi skor sama pada alternatif identik`, same, `${v1.toFixed(9)} vs ${v2.toFixed(9)}`);
}

/* ---------- Invarian 4: alternatif dominan peringkat 1 ---------- */
{
  const dominated = {
    criteria: [criterion(1, 'C1', 0.4, 'benefit'), criterion(2, 'C2', 0.3, 'benefit'), criterion(3, 'C3', 0.3, 'cost')],
    alternatives: [alt(1, 'A1'), alt(2, 'A2'), alt(3, 'A3'), alt(4, 'A4')],
    values: [
      [5, 5, 1],
      [4, 4, 2],
      [3, 3, 3],
      [1, 1, 5],
    ],
  };
  for (const method of all) {
    const best = method.compute(dominated).ranking.find((r) => r.rank === 1);
    check(`${method.label} menempatkan alternatif dominan di peringkat 1`, best?.alternativeId === 1, String(best?.alternativeId));
  }
}

/* ---------- Invarian 5: benefit tunggal menjaga urutan ---------- */
{
  const single = {
    criteria: [criterion(1, 'C1', 1, 'benefit')],
    alternatives: [alt(1, 'A1'), alt(2, 'A2'), alt(3, 'A3'), alt(4, 'A4')],
    values: [[5], [3], [1], [4]],
  };
  const expected = '1,4,2,3';
  for (const method of all) {
    const got = orderOf(method.compute(single));
    // COPRAS tanpa cost memakai Q = S+, sehingga urutan tetap mengikuti nilai.
    check(`${method.label} menjaga urutan pada benefit tunggal`, got === expected, `${got} (harap ${expected})`);
  }
}

/* ---------- Invarian 6: cost tunggal membalik urutan ---------- */
{
  const single = {
    criteria: [criterion(1, 'C1', 1, 'cost')],
    alternatives: [alt(1, 'A1'), alt(2, 'A2'), alt(3, 'A3'), alt(4, 'A4')],
    values: [[5], [3], [1], [4]],
  };
  const expected = '3,2,4,1';
  for (const method of all) {
    const got = orderOf(method.compute(single));
    check(`${method.label} membalik urutan pada cost tunggal`, got === expected, `${got} (harap ${expected})`);
  }
}

/* ---------- Invarian 7: jumlah peringkat unik ---------- */
for (const method of all) {
  const result = method.compute(ds1);
  const ranks = result.ranking.map((r) => r.rank).sort((a, b) => a - b);
  const valid = ranks.length === 4 && new Set(ranks).size === 4 && ranks[0] === 1 && ranks[3] === 4;
  check(`${method.label} memberi peringkat 1 sampai 4 tanpa duplikat`, valid, ranks.join(','));
}

/* ---------- Invarian 8: bobot tidak 1 tetap menghasilkan hasil wajar ---------- */
for (const method of all) {
  const scaled = {
    ...ds1,
    criteria: ds1.criteria.map((c) => ({ ...c, weight: c.weight * 100 })),
  };
  const a = method.compute(ds1);
  const b = method.compute(scaled);
  const same = orderOf(a) === orderOf(b);
  check(`${method.label} tidak berubah saat bobot dikali 100`, same, `${orderOf(a)} vs ${orderOf(b)}`);
}

let failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? 'SEMUA INVARIAN TIER 2 LOLOS' : failed + ' GAGAL'} (${results.length} butir)`);
process.exit(failed === 0 ? 0 : 1);