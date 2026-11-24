// A rule whose selector the analysis does not read (a state before a combinator, a state rule that changes layout in a
// state the analysis does not lay out) makes Unknown only the boxes it may match: the selector without its
// pseudo-classes and pseudo-elements matches a superset of them, in any state. A rule that only paints leaves the layout
// decided and makes the paint of those boxes undecided.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

const page = body => `<html lang="en"><body>${body}</body></html>`;
const base = '*{margin:0;box-sizing:border-box}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.r{display:grid;grid-template-columns:24px minmax(0,1fr);height:24px}.c{height:20px}.y{height:20px}.btn{appearance:none;display:block;height:20px;padding:0;border:0}';
const run = (css, body, options = {}) => analyzeHTML(page(body), {name: 'P', css: base + css, viewport: {min: 320, max: 800, height: {min: 400, max: 800}}, block: true, ...options});
const global = r => r.diagnostics.filter(d => d.code === 'U_LAYOUT_SELECTOR' && !d.box);
const onBox = (r, box) => r.diagnostics.filter(d => d.severity === 'unknown' && d.box === box);
const row = '<div class="r"><div class="c"></div><span class="y"></span></div>';

test('a paint-only rule with a state before a combinator leaves the layout decided', () => {
  // (A content would generate a box: that rule may change layout.)
  const r = run('.c:hover + .y{background:red;border-color:#00f}', row);
  assert.deepEqual(global(r), []);
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics));
});

test('a rule that may change layout makes Unknown the boxes it may match, and only them', () => {
  const r = run('.c:hover + .y{height:40px}', row);
  assert.deepEqual(global(r), []);
  assert.ok(onBox(r, '.y').some(d => d.code === 'U_LAYOUT_SELECTOR'), JSON.stringify(r.diagnostics));
  assert.deepEqual(onBox(r, '.c'), []);
  // No box it may match: nothing.
  assert.equal(run('.c:hover + .z{height:40px}', row).status, 'verified');
});

test('a state rule that changes layout in a state the analysis does not lay out (:active)', () => {
  const css = '.btn:active:not([disabled]){padding-top:2px}';
  const r = run(css, '<button class="btn" type="button">Go</button>');
  assert.deepEqual(global(r), []);
  assert.ok(onBox(r, '.btn').some(d => d.code === 'U_LAYOUT_SELECTOR'), JSON.stringify(r.diagnostics));
  assert.equal(run(css, '<div class="y"></div>').status, 'verified');
});

test('a selector list keeps its readable selectors', () => {
  // .y is styled by the readable selector; .c:hover + .y only marks .y.
  const r = run('.y, .c:hover + .y{height:40px}', row);
  assert.ok(onBox(r, '.y').some(d => d.code === 'U_LAYOUT_SELECTOR'));
  const plain = run('.y, .q:checked + .z{height:40px}', '<div class="y"></div>');
  assert.equal(plain.status, 'verified', JSON.stringify(plain.diagnostics));
});

test('the paint a paint-only rule may change is not judged', () => {
  const css = '.card{display:grid;grid-template-columns:minmax(0,1fr);background:#fff;color:#000}.t{height:20px}.card:hover > .t{color:#eee}';
  const r = run(css, '<div class="card"><p class="t">Text</p></div>', {accessibility: true, boxes: {'.t': {minInlineSize: 1, intrinsicBlockSize: 20}}});
  assert.equal(r.diagnostics.filter(d => d.code === 'E_A11Y_CONTRAST').length, 0);
  assert.ok(r.diagnostics.some(d => d.code === 'U_A11Y_CONTRAST' && d.box === '.t'), JSON.stringify(r.diagnostics.filter(d => d.severity !== 'info')));
});
