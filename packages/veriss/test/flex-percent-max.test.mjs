// A flex item with a percentage width (flex-basis auto) and a px max-width: its hypothetical main size is the share
// clamped by the maximum (CSS Flexbox 1 §9.2.3 E, §9.7). The share is affine in the viewport, so the line is split where
// the share crosses the maximum. (A centered page container: width: 100%; max-width; margin: 0 auto.)
// The positions are compared with the browser in e2e/layout-flex.spec.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

const base = '*{margin:0;box-sizing:border-box}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.row{display:flex;height:40px}.m{height:20px}.s{width:60px;height:20px;flex-shrink:0}';
const run = (css, body) => analyzeHTML(`<html lang="en"><body>${body}</body></html>`, {name: 'P', css: base + css, viewport: {min: 320, max: 800, height: {min: 400, max: 800}}, block: true});
// (The distinct widths: the line is split into regions, several of which may give the same width.)
const widths = (r, box) => [...new Set(r.sizes.filter(x => x.box === box).map(x => `${x.inlineSize.coefficient}w+${x.inlineSize.constant}`))].sort();
const unknown = r => r.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message);

test('a centered container: 100% up to its max-width, then the max-width', () => {
  const r = run('.m{overflow:hidden;padding:0 24px;margin:0 auto;width:100%;max-width:600px}', '<div class="row"><div class="m"><div class="x"></div></div></div>');
  assert.equal(r.status, 'verified', JSON.stringify(unknown(r)));
  assert.deepEqual(widths(r, '.m'), ['0w+600', '1w+0']);
});

test('a growing share stops at its max-width', () => {
  const r = run('.m{flex-grow:1;width:50%;max-width:300px}', '<div class="row"><div class="s"></div><div class="m"><div class="x"></div></div></div>');
  assert.equal(r.status, 'verified', JSON.stringify(unknown(r)));
  assert.deepEqual(widths(r, '.m'), ['0w+300', '1w+-60']);
});

test('a share above its max-width in a line that shrinks shrinks from its flex base size', () => {
  const r = run('.m{width:100%;max-width:300px;min-width:0}', '<div class="row"><div class="s"></div><div class="m"><div class="x"></div></div></div>');
  assert.equal(r.status, 'verified', JSON.stringify(unknown(r)));
  assert.deepEqual(widths(r, '.m'), ['0w+300', '1w+-60']);
});

test('a percentage max-width, or an automatic minimum that would shrink, stays Unknown', () => {
  assert.equal(run('.m{width:100%;max-width:50%}', '<div class="row"><div class="m"><div class="x"></div></div></div>').status, 'unknown');
  const r = run('.m{width:100%;max-width:300px}', '<div class="row"><div class="s"></div><div class="m"><div class="x"></div></div></div>');
  assert.equal(r.status, 'unknown');
  assert.ok(unknown(r).some(m => /automatic minimum depends on its content would shrink/.test(m)), JSON.stringify(unknown(r)));
});
