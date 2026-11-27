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

test('a wrapper that clips only below 600px: above it the buttons past its edge are still covered', () => {
  // The clipper's padding box bounds the overlap only where it clips; elsewhere the overlap stays whole.
  const report = analyzeHTML(`<html lang="en"><body>${wrapped}</body></html>`, {name: 'P', css: base + 'html{overflow:hidden}@media (max-width:599px){.w{overflow:clip}}', viewport: {min: 375, max: 800, height: {min: 667, max: 667}}, accessibility: true});
  const found = report.diagnostics.filter(d => d.code === 'E_A11Y_OCCLUDED');
  const seen = JSON.stringify(found.map(d => `${d.path} ${d.range.min}-${d.range.max}`));
  // The whole-px widths each button is reported at, joined across the pieces (max-width: 599px leaves (599, 600) open).
  const ints = ({min, max, minInclusive, maxInclusive}) => { const lo = minInclusive ? Math.ceil(min) : Math.floor(min) + 1, hi = maxInclusive ? Math.floor(max) : Math.ceil(max) - 1; return Array.from({length: Math.max(0, hi - lo + 1)}, (_, i) => lo + i); };
  const widths = path => [...new Set(found.filter(d => d.path === path).flatMap(d => ints(d.range)))].sort((a, b) => a - b);
  const span = (lo, hi) => Array.from({length: hi - lo + 1}, (_, i) => lo + i);
  assert.deepEqual(widths('P/0/0/2'), span(375, 800), seen);
  for (const path of ['P/0/0/3', 'P/0/0/4']) assert.deepEqual(widths(path), span(600, 800), seen);
});

test('the scrolled-cover Unknown lists only the controls that exist where the cover reaches the scroller', () => {
  // B1 is shown only from 600px, the sheet only below it: they never meet, so the sheet's Unknown does not name B1.
  const report = analyzeHTML(`<html lang="en"><body><div class="p w"><button class="go" aria-label="B0"></button><button class="go late" aria-label="B1"></button></div><div class="sh"></div></body></html>`, {
    name: 'P', css: base + 'html{overflow:hidden}.w{overflow:auto}.late{display:none}@media (min-width:600px){.late{display:block}.sh{display:none}}', viewport: {min: 375, max: 800, height: {min: 667, max: 667}}, accessibility: true, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]});
  const u = report.diagnostics.filter(d => d.code === 'U_A11Y_SCROLLED_COVER' && d.cover === 'P/0/1');
  assert.ok(u.length, JSON.stringify(report.diagnostics.map(d => `${d.code} ${d.path}`)));
  for (const d of u) {
    assert.deepEqual(d.targets, ['P/0/0/0'], d.message);
    assert.doesNotMatch(d.message, /B1|P\/0\/0\/1/);
  }
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

test('a clipper with no position in another viewport range does not make the overlap Unknown where it is located', () => {
  // .w clips (overflow: clip) everywhere, but below 600px it sits in a scroll container and has no position; the sheet
  // exists only from 600px, where .w is located: the covered button is decided there.
  const report = analyzeHTML(`<html lang="en"><body><div class="s"><div class="p w">${buttons(3)}</div></div><div class="sh"></div></body></html>`, {
    name: 'P', css: base + 'html{overflow:hidden}.w{overflow:clip}.sh{display:none}@media (max-width:599px){.s{overflow:auto;height:400px}}@media (min-width:600px){.sh{display:block}}',
    viewport: {min: 375, max: 800, height: {min: 667, max: 667}}, accessibility: true, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]});
  const seen = JSON.stringify(report.diagnostics.map(d => `${d.code} ${d.path} ${d.range?.min}-${d.range?.max}`));
  assert.deepEqual(occluded(report), ['P/0/0/0/2'], seen);
  assert.ok(!report.diagnostics.some(d => d.code === 'U_A11Y_SCROLLED_COVER'), seen);
});

test('a control whose scroll container changes with the viewport: each range has the Unknown of its own scroller', () => {
  // From 600px .i is the scroll container of the buttons; below it .o scrolls too, so .i has no position there and
  // the buttons are seen only inside .o. The sheet covers both: each range is Unknown at the other scroll offsets.
  const report = analyzeHTML(`<html lang="en"><body><div class="o"><div class="p i">${buttons(3)}</div></div><div class="sh"></div></body></html>`, {
    name: 'P', css: base + 'html{overflow:hidden}.i{overflow:auto;height:350px}@media (max-width:599px){.o{overflow:auto;height:400px}}',
    viewport: {min: 375, max: 800, height: {min: 667, max: 667}}, accessibility: true, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]});
  const u = report.diagnostics.filter(d => d.code === 'U_A11Y_SCROLLED_COVER' && d.cover === 'P/0/1');
  const seen = JSON.stringify(u.map(d => `${d.path} ${d.range.min}-${d.range.max} ${d.targets}`));
  assert.ok(u.some(d => d.path === 'P/0/0' && d.range.min < 599 && d.targets.includes('P/0/0/0/2')), `below 600px, under .o: ${seen}`);
  assert.ok(u.some(d => d.path === 'P/0/0/0' && d.range.max > 600 && d.targets.includes('P/0/0/0/2')), `from 600px, under .i: ${seen}`);
  assert.ok(!u.some(d => d.path === 'P/0/0' && d.range.max > 600), `.o does not scroll from 600px: ${seen}`);
});

test('a fixed box inside a scroll container escapes it: its link is not content that scrolls there', () => {
  // The centred list overflows, so its first item starts before its top; the fixed header inside it is placed against
  // the viewport and does not scroll with it (CSS Overflow 3 §3): no scroll-start finding for its link.
  const html = '<html lang="en"><body><main class="m"><div class="gap"></div><div class="list"><p class="i first">First</p><p class="i">Two</p><p class="i">Three</p><p class="i">Four</p><p class="i">Five</p><p class="i">Six</p><p class="i">Seven</p><div class="f"><a class="l" href="/x">Go</a></div></div></main></body></html>';
  const css = '*{margin:0;padding:0;box-sizing:border-box}html,body,.m{display:grid;grid-template-columns:minmax(0,1fr);background:#fff}.gap{height:300px}.list{display:flex;flex-direction:column;overflow-y:auto;height:200px;justify-content:center}.i{flex:none;height:40px;font-size:16px;line-height:24px;color:#000}.f{position:fixed;top:0;left:0;width:200px;height:40px;background:#fff}.l{display:block;width:44px;height:24px;font-size:16px;line-height:24px;color:#000}';
  const report = analyzeHTML(html, {name: 'P', css, viewport: {min: 320, max: 800, height: {min: 480, max: 900}}, accessibility: true, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}], scrollIntent: 'css', boxes: {'.i': {minInlineSize: 0, intrinsicBlockSize: 24}, '.l': {minInlineSize: 0, intrinsicBlockSize: 24}}});
  assert.deepEqual(report.diagnostics.filter(d => d.code === 'E_A11Y_SCROLL_START_UNREACHABLE').map(d => d.box), ['.i.first']);
});

// The text-cover Unknown for an overflow box, per viewport range and with the cover's own clipping applied.
const textRun = (css, body = '<div class="w"><p class="t">Hello</p></div><div class="sh"></div>') => analyzeHTML(`<html lang="en"><body>${body}</body></html>`, {
  name: 'P', viewport: {min: 375, max: 800, height: {min: 667, max: 667}}, accessibility: true, boxes: {'.t': {minInlineSize: 0, intrinsicBlockSize: 24}}, scrollbars: [{name: 'o', inlineSize: 0, blockSize: 0}],
  css: `*{margin:0}html{overflow:hidden}body{display:block;background:#fff}.w{height:350px;overflow:clip;padding-top:320px;box-sizing:border-box}.t{display:block;font-size:16px;line-height:24px;color:#000;text-align:left}.sh{position:fixed;left:0;right:0;bottom:0;height:60vh;background:#333;z-index:9}${css}`,
});
const textCovers = report => report.diagnostics.filter(d => d.code === 'U_A11Y_SCROLLED_COVER').map(d => `${d.path} ${d.range.min}-${d.range.max}`);

test('text-cover Unknown: only in the viewport range where the box holds the text', () => {
  // The text shows below 600px, the sheet from 600px: they never meet.
  assert.deepEqual(textCovers(textRun('.sh{display:none}@media (min-width:600px){.sh{display:block}.t{display:none}}')), []);
  // Control: both everywhere.
  assert.deepEqual(textCovers(textRun('')), ['P/0/0 375-800']);
});

test('text-cover Unknown: a cover its own overflow: clip ancestor cuts away is no cover', () => {
  // .sh reaches up over .w, but .c clips it to its 10px box below .w: Chromium, Firefox and WebKit hit-test the text
  // at (10, 330), not the sheet.
  const body = '<div class="w"><p class="t">Hello</p></div><div class="c"><div class="sh"></div></div>';
  assert.deepEqual(textCovers(textRun('.c{overflow:clip;height:10px;position:relative}.sh{position:absolute;top:-30px;left:0;right:0;height:20px;bottom:auto}', body)), []);
});

test('an invisible cover outside a scroll container: the initial-scroll invisible-blocker finding is kept', () => {
  // The sheet is opacity 0: Chromium, Firefox and WebKit hit-test it at the third button's centre (288px).
  const report = run(wrapped.replace(buttons(8), buttons(3)), 'html{overflow:hidden}.w{overflow:auto}.sh{opacity:0}', {scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]});
  const found = report.diagnostics.filter(d => d.code === 'E_A11Y_INVISIBLE_BLOCKER');
  assert.deepEqual(found.map(d => d.path), ['P/0/0/2'], JSON.stringify(report.diagnostics.map(d => `${d.code} ${d.path}`)));
  assert.match(found[0].message, /initial scroll position/);
  assert.ok(report.diagnostics.some(d => d.code === 'U_A11Y_SCROLLED_COVER'), 'other scroll offsets stay Unknown');
});

test('text start under a cover at the initial scroll offset: a scroller bounds it only in its own viewport range', () => {
  // .s (overflow: hidden) sits at y = 0 below 600px and at y = 200 from 600px. Below 600px the fixed badge covers where
  // the text starts; the scroller's wide-screen place must not bound the narrow range.
  const report = analyzeHTML('<html lang="en"><body><div class="gap"></div><div class="s"><p class="t">Hello</p></div><div class="b"></div></body></html>', {
    name: 'P', viewport: {min: 375, max: 800, height: {min: 667, max: 667}}, accessibility: true, boxes: {'.t': {minInlineSize: 0, intrinsicBlockSize: 24}}, scrollbars: [{name: 'o', inlineSize: 0, blockSize: 0}],
    css: '*{margin:0}body{display:block;background:#fff}.gap{height:0}@media (min-width:600px){.gap{height:200px}}.s{height:100px;overflow:hidden}.t{display:block;font-size:16px;line-height:24px;color:#000;text-align:left}.b{position:fixed;left:0;top:0;width:40px;height:30px;background:#333;z-index:9}'});
  const found = report.diagnostics.filter(d => d.code === 'E_A11Y_TEXT_START_OBSCURED');
  assert.deepEqual(found.map(d => `${d.path} ${d.range.min}-${d.range.max}`), ['P/0/1/0 375-600'], JSON.stringify(report.diagnostics.map(d => `${d.code} ${d.path}`)));
});
