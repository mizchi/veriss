import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// Checklist I25: px inline margins, negative too, on block-level boxes in block flow (issue #58). An auto width is the
// containing block's width less both margins; an explicit width is over-constrained and placed by margin-left (ltr).
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = (inner, css, dir = 'ltr') => analyzeHTML(`<html lang="en" dir="${dir}"><body><main class="p"><section class="box">${inner}</section></main></body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g}}.box{display:block;padding:0 24px}.a,.b{height:10px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
const rects = (report, viewport) => report.sizes.filter(s => s.rect && s.range.min <= viewport && viewport <= s.range.max && /^\.[ab]$/.test(s.box)).map(s => { const v = t => Number(String(t).split('/').map(Number).reduce((a, b) => a / b)); const at = a => v(a.coefficient) * viewport + v(a.constant); return [s.box, at(s.rect.inlineStart), at(s.rect.blockStart), at(s.rect.inlineSize), at(s.rect.blockSize)]; });
const ok = r => assert.notEqual(r.status, 'unknown', JSON.stringify(r.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message)));
const unknown = (r, re) => { assert.equal(r.status, 'unknown'); assert.ok(r.diagnostics.some(d => d.severity === 'unknown' && re.test(d.message)), JSON.stringify(r.diagnostics.map(d => d.message))); };

test('a negative inline margin pulls an auto-width block out into the padding', () => {
  const both = run('<div class="a"></div>', '.a{margin:0 -24px}');
  ok(both);
  assert.deepEqual(rects(both, 500), [['.a', 0, 0, 500, 10]]);
  assert.deepEqual(rects(both, 320), [['.a', 0, 0, 320, 10]]);
  const left = run('<div class="a"></div>', '.a{margin-left:-24px}');
  ok(left);
  assert.deepEqual(rects(left, 500), [['.a', 0, 0, 476, 10]]);
  const mixed = run('<div class="a"></div>', '.a{margin-left:-24.5px;margin-right:0.25px}');
  ok(mixed);
  assert.deepEqual(rects(mixed, 500), [['.a', -0.5, 0, 476.25, 10]]);
});

test('nested negative margins and an explicit width (over-constrained: margin-right is ignored in ltr)', () => {
  const nested = run('<div class="a"><div class="b"></div></div>', '.a{margin:0 -24px}.b{margin:0 -10px}');
  ok(nested);
  assert.deepEqual(rects(nested, 500).sort(), [['.a', 0, 0, 500, 10], ['.b', -10, 0, 520, 10]]);
  const fixed = run('<div class="a"></div>', '.a{width:200px;margin:0 -24px}');
  ok(fixed);
  assert.deepEqual(rects(fixed, 500), [['.a', 0, 0, 200, 10]]);
  const wide = run('<div class="a"></div>', '.a{width:500px;margin-left:10px;margin-right:-50px}');
  assert.deepEqual(rects(wide, 500), [['.a', 34, 0, 500, 10]]);
  // A % width is of the containing block; max-width caps the stretched width.
  assert.deepEqual(rects(run('<div class="a"></div>', '.a{width:50%;margin-left:-24px}'), 500), [['.a', 0, 0, 226, 10]]);
  assert.deepEqual(rects(run('<div class="a"></div>', '.a{max-width:300px;margin:0 -24px}'), 500), [['.a', 0, 0, 300, 10]]);
});

test('intrinsic width keywords with a negative margin: fit-content takes the space the margins give', () => {
  // fit-content = min(max-content, max(min-content, available)), available = 452 + 48 at 500.
  const fit = run('<div class="a"><div class="b"></div></div>', '.a{width:fit-content;margin:0 -24px}.a{height:auto}.b{width:600px}');
  ok(fit);
  assert.deepEqual(rects(fit, 500).sort(), [['.a', 0, 0, 600, 10], ['.b', 0, 0, 600, 10]]);
  const max = run('<div class="a"><div class="b"></div></div>', '.a{width:max-content;margin-left:-24px}.a{height:auto}.b{width:100px}');
  ok(max);
  assert.deepEqual(rects(max, 500).sort(), [['.a', 0, 0, 100, 10], ['.b', 0, 0, 100, 10]]);
});

test('what the analysis does not model stays Unknown', () => {
  // A percentage margin (Firefox rounds it differently), rtl with unequal margins, a negative margin beside an auto one.
  assert.equal(run('<div class="a"></div>', '.a{margin:0 -5%}').status, 'unknown');
  unknown(run('<div class="a"></div>', '.a{margin-left:-10px;margin-right:10px}', 'rtl'), /unequal inline margins in rtl/);
  unknown(run('<div class="a"></div>', '.a{margin-left:-24px}', 'rtl'), /unequal inline margins in rtl/);
  unknown(run('<div class="a"></div>', '.a{width:200px;margin-left:auto;margin-right:-24px}'), /inline margin/);
});
