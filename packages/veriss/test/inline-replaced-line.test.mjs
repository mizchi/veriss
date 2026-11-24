import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// An iframe (or img, video, canvas) left display: inline as the only content of a block (an ad tag's insertion) sits on
// a line box of its own: on the baseline of the block's strut, which reserves the font's descent (and half-leading)
// below it. Measured with Roboto 16px in Chromium (e2e/layout-inline-replaced.spec.mjs): the block is 250 + 5px tall at
// line-height 20px, 250 + 10 at 30px, 250 + 3 at 16px; a 12px-tall frame sits 3px down a 20px line. With font-size: 0
// (and line-height normal) the strut is empty and the block is as tall as the frame, in all three engines; with
// vertical-align: top or bottom and a line no taller than the frame, likewise.
const vp = {min: 320, max: 800, height: {min: 600, max: 900}};
const roboto = (lineHeight, extra = {}) => ({family: 'Roboto', size: 16, lineHeight, weight: 400, ascent: 15, descent: 4, ...extra});
const run = (slot, iframe, {css = '', boxes = {}, ua, whitespace = false} = {}) => analyzeHTML(`<html lang="en"><body><main><div class="slot">${whitespace ? '\n  ' : ''}<iframe title="ad" src="about:blank" width="300" ${iframe} frameborder="0"></iframe>${whitespace ? '\n' : ''}</div><p class="after">x</p></main></body></html>`, {
  name: 'P', viewport: vp, ua, scrollbars: [{name: 'o', inlineSize: 0, blockSize: 0}],
  boxes: {'.after': {minInlineSize: 10, maxInlineSize: 10, intrinsicBlockSize: 20}, ...boxes},
  css: `body,p{margin:0}.slot{${slot}}${css}`,
});
const at = (report, label) => { const r = report.sizes.find(s => s.box === label || s.box.startsWith(label + '@')); assert.ok(r?.rect, `${label}: ${JSON.stringify(report.diagnostics.map(d => d.message))}`); return r; };
const top = (report, label) => Number(at(report, label).rect.blockStart.constant);
const height = (report, label) => Number(at(report, label).blockSize.constant);
const unknowns = report => report.diagnostics.filter(d => d.severity === 'unknown').map(d => `${d.code}: ${d.message}`);

test('font-size: 0 on the block: the line is exactly the frame', () => {
  for (const whitespace of [false, true]) for (const va of ['', 'iframe{vertical-align:middle}', 'iframe{vertical-align:top}']) {
    const report = run('font-size:0', 'height="250"', {whitespace, css: va});
    assert.deepEqual(unknowns(report), [], va);
    assert.equal(height(report, '.slot'), 250);
    assert.equal(top(report, 'iframe'), 0);
    assert.equal(top(report, '.after'), 250);
  }
});

test('vertical-align: top or bottom with a line no taller than the frame: no gap', () => {
  for (const va of ['top', 'bottom']) {
    const report = run('font-size:16px;line-height:24px', 'height="250"', {css: `iframe{vertical-align:${va}}`});
    assert.deepEqual(unknowns(report), [], va);
    assert.equal(height(report, '.slot'), 250);
    assert.equal(top(report, '.after'), 250);
  }
});

test('on the baseline, with the block font\'s ascent and descent declared: the descent gap under it (Chromium)', () => {
  for (const [lh, expected] of [[20, 255], [21, 255], [30, 260], [16, 253], [10, 250]]) {
    const report = run(`font-family:Roboto;font-size:16px;line-height:${lh}px`, 'height="250"', {boxes: {'.slot': {font: roboto(lh)}}});
    assert.deepEqual(unknowns(report), [], String(lh));
    assert.equal(height(report, '.slot'), expected, String(lh));
    assert.equal(top(report, 'iframe'), 0);
    assert.equal(top(report, '.after'), expected);
  }
  // A frame shorter than the strut's ascent sits lower: 12px in a 20px line at y = 3.
  const short = run('font-family:Roboto;font-size:16px;line-height:20px', 'height="12"', {boxes: {'.slot': {font: roboto(20)}}});
  assert.deepEqual(unknowns(short), []);
  assert.equal(height(short, '.slot'), 20);
  assert.equal(top(short, 'iframe'), 3);
});

test('text-align: center centres it on its line', () => {
  const report = run('font-size:0;text-align:center', 'height="250"');
  assert.deepEqual(unknowns(report), []);
  const r = at(report, 'iframe').rect.inlineStart;
  // (viewport − 300) / 2
  assert.deepEqual([r.coefficient, r.constant], ['1/2', '-150']);
});

test('what stays Unknown says why', () => {
  // On the baseline with no font metrics: the gap is the font's descent.
  const plain = run('font-size:16px', 'height="250"');
  assert.equal(plain.status, 'unknown');
  assert.ok(unknowns(plain).some(m => m.startsWith('U_LAYOUT_INLINE') && /descent/.test(m) && /vertical-align: top/.test(m)), JSON.stringify(unknowns(plain)));
  // Firefox and WebKit place the baseline with unrounded metrics.
  assert.equal(run('font-family:Roboto;font-size:16px;line-height:20px', 'height="250"', {boxes: {'.slot': {font: roboto(20)}}, ua: 'webkit'}).status, 'unknown');
  // Mixed inline content (text beside it) stays Unknown.
  const mixed = analyzeHTML('<html lang="en"><body><main><div class="slot">Ad <iframe title="ad" src="about:blank" width="300" height="250" frameborder="0"></iframe></div></main></body></html>', {name: 'P', viewport: vp, scrollbars: [{name: 'o', inlineSize: 0, blockSize: 0}], css: 'body{margin:0}.slot{font-size:0}'});
  assert.equal(mixed.status, 'unknown');
});

test('a font contract takes ascent and descent only together, as whole px', () => {
  for (const font of [roboto(20, {descent: undefined}), roboto(20, {ascent: 1.5})])
    assert.throws(() => run('font-family:Roboto;font-size:16px;line-height:20px', 'height="250"', {boxes: {'.slot': {font}}}), /ascent/);
});
