import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { supportedContract } from '../src/layout/input.mjs';

// The runtime contract keys and the published LayoutBoxContract type must not drift apart (issue #8).
const dts = readFileSync(new URL('../src/layout-contracts.d.ts', import.meta.url), 'utf8');
const body = dts.match(/export interface LayoutBoxContract \{([\s\S]*?)\n\}/)[1];

test('LayoutBoxContract declares every key the runtime accepts', () => {
  const declared = new Set([...body.matchAll(/^\s{2}(\w+)\??:/gm)].map(m => m[1]));
  assert.deepEqual([...supportedContract].filter(key => !declared.has(key)), []);
  assert.deepEqual([...declared].filter(key => !supportedContract.has(key)), []);
});

test("LayoutBoxContract's wrap lists every accepted value", () => {
  const wrap = body.match(/^\s{2}wrap\?: (.*);$/m)[1];
  for (const value of ['normal', 'anywhere', 'nowrap', 'one-line']) assert.match(wrap, new RegExp(`'${value}'`));
});
