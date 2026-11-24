// Absolutely positioned and fixed children of a flex container (CSS Flexbox 1 §4.1): they are not flex items; they are
// laid out against their containing block once the container's size is known. On an axis whose insets are both auto
// they sit at their static position, which is where the container's content box starts when the container aligns to
// the start (justify-content and align-self/align-items at the start, stretch counting as flex-start); other
// alignments stay Unknown.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

const base = '*{margin:0;box-sizing:border-box}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.top{height:40px}.f{display:flex;height:60px;padding:10px 12px}.i{width:30px;height:20px}.a{width:20px;height:16px}';
const run = (css, body = '<div class="top"></div><div class="f"><div class="i"></div><div class="a"></div></div>') => analyzeHTML(`<html lang="en"><body>${body}</body></html>`, {name: 'P', css: base + css, viewport: {min: 320, max: 800, height: {min: 400, max: 800}}, block: true, integrity: true});
const at = (r, box) => { const s = r.sizes.find(x => x.box === box && x.rect); return s && [Number(s.rect.inlineStart.constant), Number(s.rect.blockStart.constant), s.rect.inlineStart.coefficient, s.rect.blockStart.coefficient]; };
const unknown = r => r.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message);

test('an absolute child with insets is laid out against its positioned flex container', () => {
  const r = run('.f{position:relative}.a{position:absolute;top:4px;left:6px}');
  assert.equal(r.status, 'verified', JSON.stringify(unknown(r)));
  assert.deepEqual(at(r, '.a'), [6, 44, '0', '0']);
  // It is not a flex item: the in-flow item starts at the content box.
  assert.deepEqual(at(r, '.i'), [12, 50, '0', '0']);
});

test('on an axis with both insets auto, it sits where the content box starts', () => {
  const r = run('.f{position:relative}.a{position:absolute}');
  assert.equal(r.status, 'verified', JSON.stringify(unknown(r)));
  assert.deepEqual(at(r, '.a'), [12, 50, '0', '0']);
  // One axis given, the other static.
  assert.deepEqual(at(run('.f{position:relative}.a{position:absolute;top:4px}'), '.a'), [12, 44, '0', '0']);
  // stretch counts as flex-start for it (align-items: stretch is the default above too).
  assert.deepEqual(at(run('.f{position:relative;align-items:stretch}.a{position:absolute}'), '.a'), [12, 50, '0', '0']);
});

test('a fixed child with no insets in a flex container sits at the container\'s content start (the page at scroll 0)', () => {
  const r = run('.a{position:fixed}');
  assert.equal(r.status, 'verified', JSON.stringify(unknown(r)));
  assert.deepEqual(at(r, '.a'), [12, 50, '0', '0']);
});

test('an alignment that is not at the start leaves its static position Unknown', () => {
  for (const css of ['.f{position:relative;justify-content:center}.a{position:absolute}', '.f{position:relative;align-items:center}.a{position:absolute}', '.f{position:relative}.a{position:absolute;align-self:flex-end}', '.f{position:relative;flex-direction:row-reverse}.a{position:absolute}'])
    assert.equal(run(css).status, 'unknown', css);
  // With both insets on each axis given, the alignment does not matter.
  assert.equal(run('.f{position:relative;justify-content:center}.a{position:absolute;top:0;left:0}').status, 'verified');
});
