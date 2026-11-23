import test from 'node:test';
import assert from 'node:assert/strict';
import { q, negativeRange, contains } from '../src/layout/linear.mjs';

test('exact interval solving agrees with an independent bounded arithmetic oracle', () => {
  for (const [minInclusive, maxInclusive] of [[true, true], [true, false], [false, true], [false, false]]) {
    const domain = { min: q(0), max: q(8), minInclusive, maxInclusive };
    for (let slope = -5; slope <= 5; slope++) for (let offset = -10; offset <= 10; offset++) {
      const solved = negativeRange({ a: q(slope), b: q(offset) }, domain);
      for (let quarter = 0; quarter <= 32; quarter++) {
        const width = quarter / 4;
        const inside = (width > 0 || minInclusive) && (width < 8 || maxInclusive);
        assert.equal(Boolean(solved && contains(solved, q(width))), inside && slope * quarter + offset * 4 < 0);
      }
    }
  }
});

test('decimal: the exact decimal text of a rational, or null', async () => {
  const {q, div, mul, decimal} = await import('../src/layout/linear.mjs');
  assert.equal(decimal(mul(q('26.666666666666668'), q('1.1'))), '29.3333333333333348');
  assert.equal(decimal(q('-1.5')), '-1.5');
  assert.equal(decimal(q(0)), '0');
  assert.equal(decimal(div(q(1), q(1024))), '0.0009765625');
  assert.equal(decimal(div(q(100), q(3))), null);
  assert.equal(decimal(div(q(1), q(1073741824))), null); // 2^-30: 30 decimals, more than q() reads
});
