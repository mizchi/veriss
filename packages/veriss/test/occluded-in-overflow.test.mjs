import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// A target inside an ancestor that hides, clips or scrolls its overflow, under a box outside that ancestor (a fixed
// bottom sheet that escapes it, or a later positioned sibling). Measured in Chromium, Firefox and WebKit at 375×667
// (e2e/layout-accessibility.spec.mjs): elementFromPoint at the centres of the buttons at 288, 432 and 576px returns the
// sheet in every case below, and neither the wheel nor PageDown scrolls. Inside a 350px wrapper only the button at 288
// is covered: the ones below the wrapper's edge are clipped away (elementFromPoint returns html without the sheet).
// It used to be silently clean: positions inside a scroll container are not known (they follow its scroll offset), and
// the occlusion pass looked only at boxes with a known position.
const buttons = n => Array.from({length: n}, (_, i) => `<button class="go" aria-label="B${i}"></button>`).join('');
const base = 'body{margin:0}.p{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:44px;row-gap:100px}.go{display:block;width:44px;height:44px;background:#246;border:0;padding:0}.sh{position:fixed;left:0;right:0;bottom:0;height:60vh;background:#333;z-index:9}.w{height:350px}';
const run = (html, css, extra = {}) => analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: base + css, viewport: {min: 375, max: 375, height: {min: 667, max: 667}}, accessibility: true, ...extra});
const occluded = report => report.diagnostics.filter(d => d.code === 'E_A11Y_OCCLUDED').map(d => d.path).sort();
const page = `<div class="p">${buttons(8)}</div><div class="sh"></div>`;
const wrapped = `<div class="p w">${buttons(8)}</div><div class="sh"></div>`;
const covered = ['P/0/0/2', 'P/0/0/3', 'P/0/0/4'];

test('control: html overflow hidden alone (body overflow propagates to the viewport): three buttons occluded', () => {
  assert.deepEqual(occluded(run(page, 'html{overflow:hidden}')), covered);
});

for (const [name, css] of [
  ['html and body overflow: hidden (a scroll lock)', 'html{overflow:hidden}body{overflow:hidden}'],
  ['html overflow: hidden, body overflow: clip', 'html{overflow:hidden}body{overflow:clip}'],
]) test(`${name}: the fixed sheet escapes body and occludes the buttons under it`, () => {
  const report = run(page, css);
  assert.deepEqual(occluded(report), covered, JSON.stringify(report.diagnostics.map(d => `${d.code} ${d.path}`)));
  // Never a silent pass: the covered buttons are errors; where body scrolls (hidden: a script or focus may scroll it)
  // the other offsets stay Unknown.
  assert.notEqual(report.status, 'verified');
});

for (const [name, css] of [
  ['overflow: hidden', 'html{overflow:hidden}.w{overflow:hidden}'],
  ['overflow: clip', 'html{overflow:hidden}.w{overflow:clip}'],
]) test(`a 350px wrapper with ${name}: only the button inside its box is occluded; the ones it clips away are not covered`, () => {
  const report = run(wrapped, css);
  assert.deepEqual(occluded(report), ['P/0/0/2'], JSON.stringify(report.diagnostics.map(d => `${d.code} ${d.path}`)));
});

test('a later absolutely positioned sibling over an overflow: hidden wrapper occludes the button inside it', () => {
  // (Not a fixed box: this was silent before the fixed-escape change too.)
  const report = run(`<div class="p w">${buttons(3)}</div><div class="ab"></div>`, 'html{overflow:hidden}body{position:relative}.w{overflow:hidden}.ab{position:absolute;left:0;right:0;top:300px;height:200px;background:#333;z-index:9}');
  assert.deepEqual(occluded(report), ['P/0/0/2'], JSON.stringify(report.diagnostics.map(d => `${d.code} ${d.path}`)));
});

test('a target in a scroll container under a cover outside it: decided at the initial scroll offset, other offsets Unknown', () => {
  const report = run(wrapped, 'html{overflow:hidden}.w{overflow:auto}', {scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]});
  const found = report.diagnostics.filter(d => d.code === 'E_A11Y_OCCLUDED');
  assert.deepEqual(found.map(d => d.path), ['P/0/0/2'], JSON.stringify(report.diagnostics.map(d => `${d.code} ${d.path}`)));
  assert.match(found[0].message, /initial scroll position/);
  const u = report.diagnostics.find(d => d.code === 'U_A11Y_SCROLLED_COVER');
  assert.ok(u && u.path === 'P/0/0' && u.cover === 'P/0/1' && u.targets.includes('P/0/0/2'), 'other scroll offsets stay Unknown');
});

test('a cover beside the scroll container (not over it): nothing to report', () => {
  const report = run(wrapped, 'html{overflow:hidden}.w{overflow:auto}.sh{height:300px}', {scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]});
  assert.deepEqual(occluded(report), []);
  assert.ok(!report.diagnostics.some(d => d.code === 'U_A11Y_SCROLLED_COVER'), JSON.stringify(report.diagnostics.map(d => `${d.code} ${d.path}`)));
});

// The same gap for text: inside overflow: hidden (a scroll container) and overflow: clip, a fixed sheet over the text
// was verified: the text-cover Unknown looked only at auto/scroll containers.
for (const [overflow, expected] of [['hidden', ['E_A11Y_TEXT_START_OBSCURED', 'U_A11Y_SCROLLED_COVER']], ['clip', ['U_A11Y_SCROLLED_COVER']], ['auto', ['E_A11Y_SCROLL_END_COVERED', 'E_A11Y_TEXT_START_OBSCURED', 'U_A11Y_SCROLLED_COVER']]])
  test(`text inside an overflow: ${overflow} box under a fixed sheet outside it is never verified`, () => {
    const report = analyzeHTML('<html lang="en"><body><div class="w"><p class="t">Hello</p></div><div class="sh"></div></body></html>', {
      name: 'P', viewport: {min: 375, max: 375, height: {min: 667, max: 667}}, accessibility: true, boxes: {'.t': {minInlineSize: 0, intrinsicBlockSize: 24}}, scrollbars: [{name: 'o', inlineSize: 0, blockSize: 0}],
      css: `*{margin:0}html{overflow:hidden}body{display:block;background:#fff}.w{height:350px;overflow:${overflow};padding-top:320px;box-sizing:border-box}.t{display:block;font-size:16px;line-height:24px;color:#000;text-align:left}.sh{position:fixed;left:0;right:0;bottom:0;height:60vh;background:#333;z-index:9}`,
    });
    assert.deepEqual([...new Set(report.diagnostics.map(d => d.code))].sort(), expected);
  });
