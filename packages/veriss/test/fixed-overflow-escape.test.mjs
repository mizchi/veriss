import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// A position: fixed box whose containing block is the viewport is neither placed against nor clipped by an ancestor that
// hides or scrolls its overflow (CSS Overflow 3 §3: overflow clips the boxes whose containing block chain passes through
// it; a fixed box's chain goes straight to the viewport). Chromium and WebKit draw it outside the ancestor and hit-test
// it there (e2e/layout-fixed-escape.spec.mjs). Only an ancestor that becomes its containing block (a transform, a
// filter) traps it.
const vp = {min: 320, max: 800, height: {min: 600, max: 900}};
const run = (layer, holder = '') => analyzeHTML('<html lang="en"><body><main><p class="t">Text</p></main><div class="holder"><div class="layer"><div class="btn"></div></div></div></body></html>', {
  name: 'P', viewport: vp, accessibility: true, integrity: true,
  boxes: {'.t': {minInlineSize: 30, maxInlineSize: 30, intrinsicBlockSize: 20}}, scrollbars: [{name: 'o', inlineSize: 0, blockSize: 0}],
  css: `*{box-sizing:border-box;margin:0}body{display:block;color:#000;background:#fff}.holder{${holder}}.layer{position:fixed;top:0;left:0;width:100px;height:100px;${layer}}.btn{position:fixed;top:0;right:0;width:42px;height:42px;background:#c00}`,
});
const at = (report, w) => { const r = report.sizes.find(s => s.box === '.btn')?.rect; if (!r) return null; const v = x => Number(x.constant) + w * Number(x.coefficient); return [v(r.inlineStart), v(r.blockStart)]; };
const unknowns = report => report.diagnostics.filter(d => d.severity === 'unknown').map(d => `${d.code}: ${d.message}`);

for (const [name, layer, holder] of [
  ['a fixed, overflow: hidden parent', 'overflow:hidden', ''],
  ['a fixed, scrolling parent', 'overflow:auto', ''],
  ['a fixed, overflow: clip parent', 'overflow:clip', ''],
  ['a static overflow: hidden grandparent', '', 'overflow:hidden;height:10px'],
]) test(`a fixed box escapes ${name}: placed on the viewport, not Unknown`, () => {
  const report = run(layer, holder);
  assert.deepEqual(unknowns(report), []);
  assert.notEqual(report.status, 'unknown');
  // Chromium / WebKit at 400px: the box's rect is (358, 0), outside the 100px parent.
  assert.deepEqual(at(report, 400), [400 - 42, 0]);
  assert.deepEqual(at(report, 800), [800 - 42, 0]);
  // Not reported as clipped by the ancestor it escapes.
  assert.deepEqual((report.integrity?.warnings ?? []).filter(w => /btn/.test(JSON.stringify(w))), []);
});

test('a transformed ancestor still traps the fixed box (its containing block): Unknown, as before', () => {
  const report = run('overflow:hidden;transform:translateX(0px)');
  assert.equal(report.status, 'unknown');
  assert.ok(report.diagnostics.some(d => d.code === 'U_LAYOUT_FIXED_CONTAINED'));
});

test('the overflow it escapes does not cut its focus ring, and it still covers what lies under it', () => {
  const report = analyzeHTML('<html lang="en"><body><main><a class="next" href="/x">Next</a></main><div class="layer"><button class="close" aria-label="Close"></button></div></body></html>', {
    name: 'P', viewport: vp, accessibility: true, integrity: true, scrollbars: [{name: 'o', inlineSize: 0, blockSize: 0}],
    boxes: {'.next': {minInlineSize: 30, maxInlineSize: 30, intrinsicBlockSize: 20}},
    css: '*{box-sizing:border-box;margin:0}body{display:block;color:#000;background:#fff}main{display:flex;justify-content:flex-end}.next{display:block;width:44px;height:44px;color:#000}.layer{position:fixed;top:0;left:0;width:100px;height:100px;overflow:clip}.close{position:fixed;top:0;right:0;width:42px;height:42px;background:#c00;border:1px solid #000}',
  });
  const all = [...report.diagnostics, ...report.accessibility.warnings];
  assert.deepEqual(all.filter(f => ['W_A11Y_FOCUS_RING_CLIPPED', 'E_A11Y_FOCUS_CLIPPED'].includes(f.code)).map(f => f.message), []);
  // elementFromPoint at the link's centre returns the fixed button in Chromium and WebKit.
  assert.ok(report.diagnostics.some(f => f.code === 'E_A11Y_OCCLUDED' && f.box === '.next'), JSON.stringify(report.diagnostics.map(f => f.code)));
});
