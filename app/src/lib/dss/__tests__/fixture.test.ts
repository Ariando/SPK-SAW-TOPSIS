import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getMethod } from '../registry';
import type { Criterion, DssInput } from '../types';

interface Fixture {
  criteria: { code: string; name: string; weight: number; direction: 'benefit' | 'cost' }[];
  alternatives: { code: string; title: string; values: number[] }[];
  tolerance: number;
  expected: {
    saw: { r: number[][]; v: number[]; rank: { rank: number; tied: boolean }[] };
    wp: { s: number[]; totalS: number; v: number[]; rank: { rank: number; tied: boolean }[] };
    topsis: {
      divisor: number[];
      r: number[][];
      y: number[][];
      idealPlus: number[];
      idealMinus: number[];
      dPlus: number[];
      dMinus: number[];
      v: number[];
      rank: { rank: number; tied: boolean }[];
    };
  };
}

const fixturePath = new URL('../../../../../docs/reference/dataset-demo-f0.json', import.meta.url);
const fixture: Fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

function toInput(): DssInput {
  const criteria: Criterion[] = fixture.criteria.map((c, i) => ({
    id: i + 1,
    code: c.code,
    name: c.name,
    weight: c.weight,
    direction: c.direction,
  }));
  return {
    criteria,
    alternatives: fixture.alternatives.map((a, i) => ({ id: i + 1, code: a.code, title: a.title })),
    values: fixture.alternatives.map((a) => a.values),
  };
}

function stepRows(result: ReturnType<NonNullable<ReturnType<typeof getMethod>>['compute']>, key: string) {
  const step = result.steps.find((s) => s.key === key);
  if (!step) throw new Error('langkah ' + key + ' tidak ada');
  return step.rows;
}

const tol = fixture.tolerance;

describe('paritas terhadap fixture F0', () => {
  const input = toInput();

  it('SAW cocok dengan hitung manual', () => {
    const result = getMethod('saw')!.compute(input);
    const rows = stepRows(result, 'normalized').slice(0, 4);
    fixture.expected.saw.r.forEach((expectedRow, i) => {
      expectedRow.forEach((expected, j) => {
        const shown = Number(rows[i][j + 1]);
        expect(Math.abs(shown - expected)).toBeLessThan(tol);
      });
    });
    result.scores.forEach((s, i) => {
      expect(Math.abs(s.value - fixture.expected.saw.v[i])).toBeLessThan(tol);
    });
    expect(result.ranking.map((r) => r.rank)).toEqual(fixture.expected.saw.rank.map((r) => r.rank));
  });

  it('WP cocok dengan hitung manual', () => {
    const result = getMethod('wp')!.compute(input);
    const sRows = stepRows(result, 'vectorS').slice(0, 4);
    fixture.expected.wp.s.forEach((expected, i) => {
      const shown = Number(sRows[i][sRows[i].length - 1]);
      expect(Math.abs(shown - expected)).toBeLessThan(tol);
    });
    const vRows = stepRows(result, 'vectorV');
    fixture.expected.wp.v.forEach((expected, i) => {
      const shown = Number(vRows[i][2]);
      expect(Math.abs(shown - expected)).toBeLessThan(tol);
    });
    expect(result.ranking.map((r) => r.rank)).toEqual(fixture.expected.wp.rank.map((r) => r.rank));
  });

  it('TOPSIS cocok dengan hitung manual', () => {
    const result = getMethod('topsis')!.compute(input);

    const divRows = stepRows(result, 'divisor');
    fixture.expected.topsis.divisor.forEach((expected, i) => {
      expect(Math.abs(Number(divRows[i][1]) - expected)).toBeLessThan(tol);
    });

    const yRows = stepRows(result, 'weighted');
    fixture.expected.topsis.y.forEach((expectedRow, i) => {
      expectedRow.forEach((expected, j) => {
        expect(Math.abs(Number(yRows[i][j + 1]) - expected)).toBeLessThan(tol);
      });
    });

    const idealRows = stepRows(result, 'ideal');
    fixture.expected.topsis.idealPlus.forEach((expected, j) => {
      expect(Math.abs(Number(idealRows[0][j + 1]) - expected)).toBeLessThan(tol);
    });
    fixture.expected.topsis.idealMinus.forEach((expected, j) => {
      expect(Math.abs(Number(idealRows[1][j + 1]) - expected)).toBeLessThan(tol);
    });

    const distRows = stepRows(result, 'distance');
    fixture.expected.topsis.dPlus.forEach((expected, i) => {
      expect(Math.abs(Number(distRows[i][1]) - expected)).toBeLessThan(tol);
    });
    fixture.expected.topsis.dMinus.forEach((expected, i) => {
      expect(Math.abs(Number(distRows[i][2]) - expected)).toBeLessThan(tol);
    });

    result.scores.forEach((s, i) => {
      expect(Math.abs(s.value - fixture.expected.topsis.v[i])).toBeLessThan(tol);
    });
    expect(result.ranking.map((r) => r.rank)).toEqual(fixture.expected.topsis.rank.map((r) => r.rank));
  });

  it('tidak ada peringatan bobot pada dataset demo', () => {
    for (const id of ['saw', 'wp', 'topsis']) {
      const result = getMethod(id)!.compute(input);
      expect(result.warnings.filter((w) => w.includes('dinormalisasi otomatis'))).toHaveLength(0);
    }
  });
});