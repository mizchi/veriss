import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// Mismatches the safe-subset fuzzer (e2e/layout-fuzz-safe-subset.spec.mjs) found against Chromium, Firefox and WebKit,
// each shrunk to its smallest page. The browser truth is written next to each one; the e2e spec replays the same pages.
const base = '*{box-sizing:border-box;margin:0}html{scrollbar-width:none;font-size:16px}html,body{display:grid;grid-template-columns:minmax(0,1fr)}';
const run = (css, body = '<div id="n0"><div id="n1"></div></div>', width = 400, height = 600) =>
  analyzeHTML(`<html lang="en"><body>${body}</body></html>`, {name: 'P', css: base + css, viewport: {min: width, max: width, height: {min: height, max: height}}, scrollIntent: 'css'});
const num = t => t === undefined ? 0 : Number(String(t).split('/').reduce((x, y) => x / y));
const rect = (report, box, width = 400, height = 600) => {
  const row = report.sizes.find(s => s.box === box);
  return row && ['inlineStart', 'blockStart', 'inlineSize', 'blockSize'].map(k => num(row.rect[k].constant) + num(row.rect[k].coefficient) * width + num(row.rect[k].heightCoefficient) * height);
};
const codes = report => report.diagnostics.filter(d => d.severity === 'error').map(d => `${d.code} ${d.box} ${d.axis}`);

test('a grid item at justify-self center or end that is wider than its area sticks out of it (E_LAYOUT_ITEM_SIZE), as at start', () => {
  // All three browsers: a 20px item at end of a 10px column is at -10 (unsafe alignment), 10px out of the area.
  for (const self of ['start', 'center', 'end']) {
    const r = run(`#n0{display:grid;grid-template-columns:10px}#n1{width:20px;justify-self:${self}}`);
    assert.equal(r.status, 'violated', self);
    assert.deepEqual(codes(r), ['E_LAYOUT_ITEM_SIZE #n1 inline'], self);
  }
  assert.deepEqual(rect(run('#n0{display:grid;grid-template-columns:10px}#n1{width:20px;justify-self:end}'), '#n1'), [-10, 0, 20, 0]);
  // One that fits stays verified.
  assert.equal(run('#n0{display:grid;grid-template-columns:30px}#n1{width:20px;justify-self:end}').status, 'verified');
});

test('a grid item at justify-self center or end is aligned by its width after max-width and min-width', () => {
  // Chromium, Firefox, WebKit: width 20px, max-width 10px at end of a 400px column is at 390, 10px wide.
  assert.deepEqual(rect(run('#n0{display:grid;grid-template-columns:minmax(0,1fr)}#n1{width:20px;max-width:10px;justify-self:end}'), '#n1'), [390, 0, 10, 0]);
  assert.deepEqual(rect(run('#n0{display:grid;grid-template-columns:minmax(0,1fr)}#n1{width:20px;max-width:10px;justify-self:center}'), '#n1'), [195, 0, 10, 0]);
  // min-width wins over max-width.
  assert.deepEqual(rect(run('#n0{display:grid;grid-template-columns:minmax(0,1fr)}#n1{width:20px;max-width:10px;min-width:30px;justify-self:end}'), '#n1'), [370, 0, 30, 0]);
  // content-box: the bounds are content sizes, the padding is added.
  assert.deepEqual(rect(run('#n0{display:grid;grid-template-columns:minmax(0,1fr)}#n1{box-sizing:content-box;padding:0 5px;width:20px;max-width:10px;justify-self:end}'), '#n1'), [380, 0, 20, 0]);
  // A bound that is not px is not modeled here: Unknown, never the unclamped width.
  assert.equal(run('#n0{display:grid;grid-template-columns:minmax(0,1fr)}#n1{width:20px;max-width:2%;justify-self:end}').status, 'unknown');
});

test('a content-sized column flex item with min-height: 0 shrinks by its inner size (it was an internal error, Unknown)', () => {
  // Chromium, Firefox, WebKit: n1 10px and n2 0px; with a 30px child and 2px padding, n1 2.4px and n2 7.6px (§9.7:
  // free −44px shared by inner sizes 20 : 30).
  const body = '<div id="n0"><div id="n1"></div><div id="n2"><div id="n3"></div></div></div>';
  const empty = run('#n0{display:flex;flex-direction:column;height:10px}#n1{height:20px}#n2{min-height:0}', '<div id="n0"><div id="n1"></div><div id="n2"></div></div>');
  assert.equal(empty.status, 'verified');
  assert.deepEqual([rect(empty, '#n1'), rect(empty, '#n2')], [[0, 0, 400, 10], [0, 10, 400, 0]]);
  const full = run('#n0{display:flex;flex-direction:column;height:10px}#n1{height:20px}#n2{min-height:0;padding:2px}#n3{height:30px}', body);
  assert.deepEqual([rect(full, '#n1'), rect(full, '#n2')], [[0, 0, 400, 2.4], [0, 2.4, 400, 7.6]]);
});

test('a flex: N item with min-width: 0 is sized without its content, also when it is a flex container (was Unknown)', () => {
  // Chromium, Firefox, WebKit: n1 350px beside a 50px n3; in a 100px row with a 300px unshrinkable child, n1 is 50px
  // and the child sticks out of it (E_LAYOUT_TRACKS on n1).
  const body = '<div id="n0"><div id="n1"><div id="n2"></div></div><div id="n3"></div></div>';
  const r = run('#n0{display:flex}#n1{flex:2;min-width:0;display:flex}#n2{flex-basis:10px}#n3{width:50px}', body);
  assert.equal(r.status, 'verified');
  assert.deepEqual([rect(r, '#n1'), rect(r, '#n2'), rect(r, '#n3')], [[0, 0, 350, 0], [0, 0, 10, 0], [350, 0, 50, 0]]);
  const over = run('#n0{display:flex;width:100px}#n1{flex:1;min-width:0;display:flex}#n2{flex-basis:300px;flex-shrink:0}#n3{width:50px}', body);
  assert.deepEqual([rect(over, '#n1'), rect(over, '#n3')], [[0, 0, 50, 0], [50, 0, 50, 0]]);
  assert.equal(over.status, 'violated');
  // min-width auto still needs the content: Unknown.
  assert.equal(run('#n0{display:flex}#n1{flex:2;display:flex}#n2{flex-basis:10px}#n3{width:50px}', body).status, 'unknown');
});

test('auto margins place a border-box whose padding and border exceed its width by its used width (the edges)', () => {
  // Chromium, Firefox, WebKit: width 2px + 2px borders centred in 100px is 4px wide at 48; 2% + 3px padding in
  // 100px is 6px at 47 (in 400px, 8px at 196); margin-left: auto puts the 4px box at 96.
  assert.deepEqual(rect(run('#n0{width:100px}#n1{width:2px;margin:0 auto;border:2px solid #000;height:10px}'), '#n1'), [48, 0, 4, 10]);
  assert.deepEqual(rect(run('#n0{width:100px}#n1{width:2%;margin:0 auto;padding:0 3px;height:10px}'), '#n1'), [47, 0, 6, 10]);
  assert.deepEqual(rect(run('#n0{width:400px}#n1{width:2%;margin:0 auto;padding:0 3px;height:10px}'), '#n1'), [196, 0, 8, 10]);
  assert.deepEqual(rect(run('#n0{width:100px}#n1{width:2px;margin:0 0 0 auto;border:2px solid #000;height:10px}'), '#n1'), [96, 0, 4, 10]);
  // The edges past the width are still the author's mistake.
  assert.deepEqual(codes(run('#n0{width:100px}#n1{width:2px;margin:0 auto;border:2px solid #000;height:10px}')), ['E_LAYOUT_BOX_EDGES #n1 inline']);
});

test('an absolute child placed by its containing block height, in a flex container a row flex stretches to 0, is Unknown (WebKit)', () => {
  // WebKit (not Chromium or Firefox) lays the absolute children of a flex container that a row flex stretches to a
  // border box of 0 against its unstretched content height: top 0% / bottom 50% is 20px tall there (0 in the others),
  // top: 0; bottom: 0 is 40px. With 0.5px, a 3px padding, a grid parent, display: block or top: 0 with a px height all
  // three agree.
  const body = '<div id="n0"><div id="n5"><div id="n6"><div id="n7"></div><div id="n11"></div></div></div></div>';
  const page = extra => run(`#n0{display:flex;flex-direction:column}#n6{display:flex;position:relative}#n7{height:40px}${extra}`, body);
  assert.equal(page('#n5{height:0;display:flex}#n11{position:absolute;top:0%;bottom:50%;width:60px}').status, 'unknown');
  assert.equal(page('#n5{height:0;display:flex}#n11{position:absolute;top:0;bottom:0;width:60px}').status, 'unknown');
  for (const ok of ['#n5{height:1px;display:flex}#n11{position:absolute;top:0%;bottom:50%;width:60px}', '#n5{height:0;display:flex}#n11{position:absolute;top:0;height:10px;width:60px}',
    '#n5{height:0;display:flex}#n6{padding:3px}#n11{position:absolute;top:0;bottom:0;width:60px}'])
    assert.notEqual(page(ok).status, 'unknown', ok);
  assert.deepEqual(rect(page('#n5{height:1px;display:flex}#n11{position:absolute;top:0%;bottom:50%;width:60px}'), '#n11'), [0, 0, 60, 0.5]);
});

test('a justified grid item whose end margin does not fit starts outside its area (E_LAYOUT_ITEM_SIZE); at start only the end margin sticks out', () => {
  // Chromium, Firefox, WebKit: width 100px + margin-right 20px at justify-self: end of a 100px column is at -20; at
  // start it is at 0 (its end margin sticks out, which hides nothing); 80px + 20px at end, and 60px + 20px at center,
  // fit (0 and 10).
  const g = '#n0{display:grid;grid-template-columns:100px}';
  const end = run(`${g}#n1{width:100px;margin-right:20px;justify-self:end;height:10px}`);
  assert.deepEqual(rect(end, '#n1'), [-20, 0, 100, 10]);
  assert.deepEqual(codes(end), ['E_LAYOUT_ITEM_SIZE #n1 inline']);
  assert.equal(run(`${g}#n1{width:100px;margin-right:20px;height:10px}`).status, 'verified');
  assert.equal(run(`${g}#n1{width:100px;margin-right:20px;justify-self:start;height:10px}`).status, 'verified');
  assert.equal(run(`${g}#n1{width:80px;margin-right:20px;justify-self:end;height:10px}`).status, 'verified');
  assert.equal(run(`${g}#n1{width:60px;margin-right:20px;justify-self:center;height:10px}`).status, 'verified');
  assert.deepEqual(codes(run(`${g}#n1{width:100px;margin-right:20px;justify-self:center;height:10px}`)), ['E_LAYOUT_ITEM_SIZE #n1 inline']);
});
