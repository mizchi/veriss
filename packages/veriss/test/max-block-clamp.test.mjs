// A block container in block flow with an auto height, children and a px max-height: its height is
// min(content height, max-height) (CSS 2 §10.7), and min-height wins over both. The content keeps its layout and overflows
// a clamped box (a scroll container scrolls it). Measured in Chromium, Firefox and WebKit: content-box and border-box,
// overflow visible / hidden / auto, an absolute child at the bottom, a min-height above the clamp, a sibling below.
// Where the clamp binds and the last child's bottom margin would collapse through the box, WebKit collapses it and
// Chromium and Firefox do not: that stays Unknown.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

const base = '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.p{width:300px}.c{height:60px}.n{height:10px}';
const run = (css, body) => analyzeHTML(`<html lang="en"><body>${body}</body></html>`, {name: 'P', css: base + css, viewport: {min: 320, max: 800, height: {min: 400, max: 800}}, block: true, scrollIntent: 'css', scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]});
const page = inner => `<div class="p"><div class="a">${inner}</div><div class="n"></div></div>`;
const two = '<div class="c"></div><div class="c"></div>';
const unknown = r => r.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message);
const heights = (r, box) => [...new Set(r.sizes.filter(x => x.box === box).map(x => `${x.blockSize.coefficient}w+${x.blockSize.constant}`))].sort();
const origins = (r, box) => [...new Set(r.sizes.filter(x => x.box === box).map(x => x.rect ? `${x.rect.blockStart.coefficient}w+${x.rect.blockStart.constant}` : `${x.origin.block.coefficient}w+${x.origin.block.constant}`))].sort();

test('a px max-height above the content does nothing', () => {
  const r = run('.a{max-height:200px;padding:5px;border:2px solid}', page(two));
  assert.deepEqual(unknown(r), []);
  assert.deepEqual(heights(r, '.a'), ['0w+134']);
});

test('a px max-height below the content caps the height (content-box adds the edges)', () => {
  const r = run('.a{max-height:100px;padding:5px;border:2px solid;overflow:auto}', page(two));
  assert.deepEqual(unknown(r), []);
  assert.deepEqual(heights(r, '.a'), ['0w+114']);
  assert.deepEqual(origins(r, '.n'), ['0w+114']);
});

test('border-box: the max-height is the border box', () => {
  const r = run('.a{box-sizing:border-box;max-height:100px;padding:5px;border:2px solid;overflow:auto}', page(two));
  assert.deepEqual(unknown(r), []);
  assert.deepEqual(heights(r, '.a'), ['0w+100']);
});

test('content that overflows a clamped box with overflow visible is reported', () => {
  const r = run('.a{max-height:100px}', page(two));
  assert.equal(r.status, 'violated', JSON.stringify(unknown(r)));
  assert.ok(r.diagnostics.some(d => d.severity === 'error' && d.box === '.a'), JSON.stringify(r.diagnostics.map(d => d.code + ' ' + d.box)));
});

test('a scroll container clamped by max-height scrolls its content; with overflow hidden it is cut off', () => {
  const r = run('.a{max-height:100px;overflow:auto}', page(two));
  assert.equal(r.status, 'verified', JSON.stringify(unknown(r)));
  assert.deepEqual(heights(r, '.a'), ['0w+100']);
  const hidden = run('.a{max-height:100px;overflow:hidden}', page(two));
  assert.deepEqual(unknown(hidden), []);
  assert.equal(hidden.status, 'violated');
});

test('min-height wins over max-height', () => {
  const r = run('.a{max-height:100px;min-height:150px;overflow:auto}', page(two));
  assert.deepEqual(unknown(r), []);
  assert.deepEqual(heights(r, '.a'), ['0w+150']);
});

test('an absolute child at the bottom sits at the clamped bottom', () => {
  const r = run('.a{max-height:100px;overflow:auto;position:relative}.ab{position:absolute;bottom:0;left:0;width:10px;height:10px}', page(two + '<div class="ab"></div>'));
  assert.deepEqual(unknown(r), []);
  assert.deepEqual(origins(r, '.ab'), ['0w+90']);
});

test('a bottom margin that would collapse through a clamped box stays Unknown', () => {
  const r = run('.a{max-height:100px}.c:last-child{margin-bottom:20px}', page(two));
  assert.equal(r.status, 'unknown');
  assert.ok(unknown(r).some(m => /bottom margin of \.c collapses through its container/.test(m)), JSON.stringify(unknown(r)));
  // (Also from a level deeper: the last child is a plain block whose own last child has the margin.)
  const deep = run('.a{max-height:100px}.i{margin-bottom:20px;height:30px}', page('<div class="c"></div><div class="w"><div class="i"></div></div>'));
  assert.equal(deep.status, 'unknown');
});

test('an aligned grid item with a px max-height: min(content, max-height), and its row follows', () => {
  const r = run('.p{display:grid;grid-template-columns:1fr 1fr;align-items:start}.a{max-height:100px;overflow:auto}', page(two) .replace('<div class="n"></div>', '<div class="n"></div><div class="n"></div>'));
  assert.deepEqual(unknown(r), []);
  assert.deepEqual(heights(r, '.a'), ['0w+100']);
  assert.deepEqual(heights(r, '.p'), ['0w+110']);
});

test('a percentage or calc() max-height on such a box, or a max-height on a flex item, stays Unknown', () => {
  assert.equal(run('.a{max-height:50%;overflow:auto}', page(two)).status, 'unknown');
  assert.equal(run('.a{max-height:calc(100vh - 100px);overflow:auto}', page(two)).status, 'unknown');
  assert.equal(run('.p{display:flex;flex-direction:column}.a{max-height:100px;overflow:auto}', page(two)).status, 'unknown');
});
