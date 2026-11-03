// Verifikasi independen Kendall W terhadap rumus klasik literatur.
// Ditulis terpisah dari modul yang diuji. Peringkat dense dikonversi ke
// peringkat rata rata lebih dulu, karena rumus klasik mengandaikan peringkat
// 1 sampai n tanpa lompatan.

const toAverage = (dense) => {
  const groups = new Map();
  dense.forEach((r, i) => {
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  });
  const ordered = [...groups.keys()].sort((a, b) => a - b);
  const out = new Array(dense.length);
  let pos = 0;
  for (const key of ordered) {
    const idx = groups.get(key);
    const start = pos + 1;
    const end = pos + idx.length;
    const avg = (start + end) / 2;
    for (const i of idx) out[i] = avg;
    pos = end;
  }
  return out;
};

// Argumen: daftar metode, tiap metode berisi peringkat dense per alternatif.
// Mengembalikan W, S, dan koreksi seri menurut rumus klasik.
const classicW = (densePerMethod) => {
  const m = densePerMethod.length;
  const avgPerMethod = densePerMethod.map(toAverage);
  const n = avgPerMethod[0].length;

  const totals = Array.from({ length: n }, (_, i) => avgPerMethod.reduce((s, r) => s + r[i], 0));
  const meanTotal = (m * (n + 1)) / 2;
  const S = totals.reduce((s, t) => s + (t - meanTotal) ** 2, 0);

  let T = 0;
  for (const ranks of avgPerMethod) {
    const counts = new Map();
    for (const v of ranks) counts.set(v, (counts.get(v) ?? 0) + 1);
    for (const c of counts.values()) T += c ** 3 - c;
  }

  const denom = m * m * (n ** 3 - n) - m * T;
  return { W: denom === 0 ? null : (12 * S) / denom, S, T };
};

const cases = [
  { name: 'identik, 4 alternatif', ranks: [[1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4]] },
  { name: 'berbeda, 4 alternatif', ranks: [[1, 2, 3, 4], [2, 4, 1, 3], [3, 1, 4, 2]] },
  { name: 'seri 1,2,2', ranks: [[1, 2, 2], [2, 1, 3]] },
  { name: 'seri penuh pada satu metode', ranks: [[1, 1, 1], [1, 2, 3]] },
  { name: 'terbalik penuh, 3 metode', ranks: [[1, 2, 3, 4], [4, 3, 2, 1], [2, 1, 4, 3]] },
];

const { analyseAgreement } = await import('../src/lib/dss/ranking.ts');

let failed = 0;

for (const c of cases) {
  const methods = c.ranks.map((r, i) => ({
    methodId: 'm' + i,
    label: 'M' + i,
    entries: r.map((rank, j) => ({ code: 'A' + (j + 1), title: 'A' + (j + 1), rank })),
  }));

  let got;
  try {
    got = analyseAgreement(methods);
  } catch (error) {
    console.log('GAGAL  ' + c.name + '  (' + error.message + ')');
    failed++;
    continue;
  }

  const expected = classicW(c.ranks);
  const sameW =
    (got.kendall.w === null && expected.W === null) ||
    (got.kendall.w !== null && expected.W !== null && Math.abs(got.kendall.w - expected.W) < 1e-12);
  const sameS = Math.abs(got.kendall.s - expected.S) < 1e-12;
  const sameT = got.kendall.tieCorrection === expected.T;

  const ok = sameW && sameS && sameT;
  if (!ok) failed++;

  console.log(
    (ok ? 'PASS  ' : 'BEDA  ') +
      c.name.padEnd(30) +
      ' W modul ' +
      (got.kendall.w === null ? 'null' : got.kendall.w.toFixed(12)) +
      ' klasik ' +
      (expected.W === null ? 'null' : expected.W.toFixed(12)) +
      ' | S ' +
      (sameS ? 'cocok' : 'beda') +
      ' | T ' +
      (sameT ? 'cocok' : 'beda')
  );
}

console.log('\n' + (failed === 0 ? 'SELURUHNYA COCOK DENGAN RUMUS KLASIK' : failed + ' BEDA') + ' (' + cases.length + ' kasus)');
process.exit(failed === 0 ? 0 : 1);