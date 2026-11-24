// E_A11Y_CLICK_TRAP: a layer that covers the page's controls and offers no control a user can see and operate (no way
// out). E_A11Y_INVISIBLE_BLOCKER: a box that paints nothing is the top hit-test target over a visible control, so the
// click lands on something the user cannot see. Fixtures: an ad overlay over a page, a modal, a click-catcher.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

const viewport = {min: 320, max: 800, height: {min: 600, max: 900}};
const line = {minInlineSize: 40, maxInlineSize: 40, intrinsicBlockSize: 20};
const base = '*{box-sizing:border-box;margin:0}body{display:block;background:#fff;color:#000}main{display:block}'
  + '.l,.m{display:block;width:100px;height:40px;color:#000;font-size:16px;line-height:20px}'
  + 'button{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;font-size:16px;line-height:20px}';
// A page with two host links, then the layer markup.
const page = (layer, css, {host = '<main><a class="l" href="/a">First</a><a class="m" href="/b">Second</a></main>', boxes = {}} = {}) =>
  analyzeHTML(`<html lang="en"><body>${host}${layer}</body></html>`, {name: 'P', viewport, accessibility: true,
    boxes: {'.l': line, '.m': line, ...boxes}, scrollbars: [{name: 'o', inlineSize: 0, blockSize: 0}], css: base + css});
const find = (report, code) => report.diagnostics.filter(d => d.code === code);
const overlay = '.ov{position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;background:#000}';

test('a full-viewport overlay whose only close control paints nothing is a click trap', () => {
  // The close "button": a div with cursor: pointer, no focus, no role, and a background-image the browser drops.
  const r = page('<div class="ov"><div class="x"></div></div>', overlay + '.x{position:absolute;top:0;right:0;width:42px;height:42px;cursor:pointer;background-image:https://example.com/close.png}');
  assert.equal(find(r, 'U_LAYOUT_CSS').length, 0);
  const traps = find(r, 'E_A11Y_CLICK_TRAP');
  assert.ok(traps.length > 0, JSON.stringify(r.diagnostics.map(d => d.code)));
  assert.ok(traps.every(t => t.box === '.ov' && t.severity === 'error' && t.rule === 'click-trap'));
  const [trap] = traps;
  assert.deepEqual(trap.covered, ['.l', '.m']);
  assert.match(trap.message, /covers 2 controls of the page \(\.l, \.m\)/);
  assert.match(trap.message, /\.x paints nothing/);
  assert.equal(trap.exits.length, 1);
  assert.equal(trap.exits[0].box, '.x');
  // The host links are still reported as covered (the overlay paints).
  assert.ok(find(r, 'E_A11Y_OCCLUDED').some(d => d.box === '.l'));
  assert.equal(find(r, 'E_A11Y_INVISIBLE_BLOCKER').length, 0);
});

test('a painted close control that cannot take focus and has no role is no way out either', () => {
  const r = page('<div class="ov"><div class="x"></div></div>', overlay + '.x{position:absolute;top:0;right:0;width:42px;height:42px;cursor:pointer;background:#fff}');
  const [trap] = find(r, 'E_A11Y_CLICK_TRAP');
  assert.ok(trap);
  assert.match(trap.message, /\.x .*cannot take focus and has no role/);
});

test('the same overlay with a visible, focusable close button is not a trap', () => {
  const r = page('<div class="ov"><button class="x" aria-label="Close">x</button></div>', overlay + '.x{position:absolute;top:0;right:0;width:44px;height:44px;background:#fff;color:#000}', {boxes: {'.x': {minInlineSize: 10, maxInlineSize: 10, intrinsicBlockSize: 20}}});
  assert.equal(find(r, 'E_A11Y_CLICK_TRAP').length, 0, JSON.stringify(find(r, 'E_A11Y_CLICK_TRAP')));
  assert.equal(find(r, 'U_A11Y_CLICK_TRAP').length, 0);
  // A div with role=button and tabindex=0 that paints is a way out too.
  const div = page('<div class="ov"><div class="x" role="button" tabindex="0" aria-label="Close"></div></div>', overlay + '.x{position:absolute;top:0;right:0;width:44px;height:44px;background:#fff}');
  assert.equal(find(div, 'E_A11Y_CLICK_TRAP').length, 0);
  // A close button placed outside the overlay's subtree, painted above it (a sibling with a higher z-index), too.
  const sibling = page('<div class="ov"></div><button class="x" aria-label="Close">x</button>', '.ov{position:fixed;top:0;left:0;right:0;bottom:0;z-index:10;background:#000}.x{position:fixed;top:0;right:0;width:44px;height:44px;z-index:11;background:#fff;color:#000}', {boxes: {'.x': {minInlineSize: 10, maxInlineSize: 10, intrinsicBlockSize: 20}}});
  assert.equal(find(sibling, 'E_A11Y_CLICK_TRAP').length, 0);
  // Below the overlay it is covered too: no way out.
  const under = page('<div class="ov"></div><button class="x" aria-label="Close">x</button>', '.ov{position:fixed;top:0;left:0;right:0;bottom:0;z-index:12;background:#000}.x{position:fixed;top:0;right:0;width:44px;height:44px;z-index:11;background:#fff;color:#000}', {boxes: {'.x': {minInlineSize: 10, maxInlineSize: 10, intrinsicBlockSize: 20}}});
  const [trap] = find(under, 'E_A11Y_CLICK_TRAP');
  assert.ok(trap);
  assert.deepEqual(trap.covered, ['.l', '.m', '.x']);
});

test('an overlay showing a frame and no way out of its own: the way out may be inside the frame (Unknown)', () => {
  const r = page('<div class="ov"><iframe class="f" title="Advertisement" src="https://example.com/ad"></iframe></div>', overlay + '.f{display:block;position:absolute;top:100px;left:10px;width:300px;height:250px;border:0}');
  assert.equal(find(r, 'E_A11Y_CLICK_TRAP').length, 0);
  const [unknown] = find(r, 'U_A11Y_CLICK_TRAP');
  assert.ok(unknown, JSON.stringify(r.diagnostics.map(d => d.code)));
  assert.equal(unknown.box, '.ov');
  assert.equal(unknown.frame, find(r, 'U_A11Y_CLICK_TRAP')[0].frame);
  assert.match(unknown.message, /\.f/);
});

test('an overlay whose frame is at opacity 0 is a trap: an invisible frame is no way out', () => {
  const r = page('<div class="ov"><iframe class="f" title="Advertisement" src="https://example.com/ad"></iframe></div>', overlay + '.f{display:block;position:absolute;top:100px;left:10px;width:300px;height:250px;border:0;opacity:0}');
  assert.equal(find(r, 'U_A11Y_CLICK_TRAP').length, 0);
  const [trap] = find(r, 'E_A11Y_CLICK_TRAP');
  assert.ok(trap, JSON.stringify(r.diagnostics.map(d => d.code)));
  assert.match(trap.message, /\.f .*opacity 0/);
});

// A 300×250 fixed box stuck in the middle of the page, showing nothing but an opacity-0 frame.
const stuck = '.box{position:fixed;top:0;left:0;width:300px;height:250px;z-index:2147483647}.f{display:block;width:300px;height:250px;border:0;opacity:0}';
const frame = '<div class="box"><iframe class="f" title="Advertisement" src="https://example.com/ad"></iframe></div>';

test('a stuck box showing only an opacity-0 frame over the page links is an invisible blocker', () => {
  const r = page(frame, stuck);
  const blockers = find(r, 'E_A11Y_INVISIBLE_BLOCKER');
  assert.deepEqual([...new Set(blockers.map(d => d.box))], ['.l', '.m']);
  assert.ok(blockers.every(d => d.cover === blockers[0].cover && d.rule === 'invisible-blocker'));
  assert.match(blockers[0].message, /\.f/);
  assert.match(blockers[0].message, /opacity 0/);
  // The pair is reported once: not also as E_A11Y_OCCLUDED.
  assert.equal(find(r, 'E_A11Y_OCCLUDED').filter(d => ['.l', '.m'].includes(d.box)).length, 0);
  // Invisible: no trap is reported for it (the blocker is the finding).
  assert.equal(find(r, 'E_A11Y_CLICK_TRAP').length, 0);
});

test('a painted stuck box over fixed page controls is a trap; over links in the flow scrolling frees them', () => {
  const painted = stuck + '.box{background:#eee}';
  // In the flow, the links scroll out from under the fixed box: covered (E_A11Y_OCCLUDED), but not a trap.
  const flow = page(frame, painted);
  assert.ok(find(flow, 'E_A11Y_OCCLUDED').some(d => d.box === '.l'));
  assert.equal(find(flow, 'E_A11Y_CLICK_TRAP').length, 0);
  // In a fixed bar under the box, they never move out: a trap.
  const bar = page(frame, painted + '.bar{position:fixed;top:0;left:0;width:300px;height:80px;display:block}', {host: '<main><nav class="bar"><a class="l" href="/a">First</a><a class="m" href="/b">Second</a></nav></main>'});
  const [trap] = find(bar, 'E_A11Y_CLICK_TRAP');
  assert.ok(trap, JSON.stringify(bar.diagnostics.map(d => d.code)));
  assert.equal(trap.box, '.box');
  assert.match(trap.message, /\.f .*opacity 0/);
});

test('a transparent full-page click-catcher over visible links is an invisible blocker, not an occlusion', () => {
  const r = page('<div class="catch"></div>', '.catch{position:fixed;top:0;left:0;right:0;bottom:0;z-index:5}');
  const blockers = find(r, 'E_A11Y_INVISIBLE_BLOCKER');
  assert.deepEqual([...new Set(blockers.map(d => d.box))], ['.l', '.m']);
  assert.ok(blockers.every(d => d.cover === blockers[0].cover));
  assert.match(blockers[0].message, /\.catch paints nothing/);
  assert.equal(find(r, 'E_A11Y_OCCLUDED').length, 0);
  assert.equal(find(r, 'E_A11Y_CLICK_TRAP').length, 0);
  // With pointer-events: none it takes no click: nothing to report.
  const passes = page('<div class="catch"></div>', '.catch{position:fixed;top:0;left:0;right:0;bottom:0;z-index:5;pointer-events:none}');
  assert.equal(find(passes, 'E_A11Y_INVISIBLE_BLOCKER').length, 0);
  // Painted (a translucent scrim), it is seen: an occlusion as before.
  const scrim = page('<div class="catch"></div>', '.catch{position:fixed;top:0;left:0;right:0;bottom:0;z-index:5;background:rgba(0,0,0,.5)}');
  assert.equal(find(scrim, 'E_A11Y_INVISIBLE_BLOCKER').length, 0);
  assert.ok(find(scrim, 'E_A11Y_OCCLUDED').length > 0);
});

test('a modal with a close button over a backdrop is neither a trap nor a blocker', () => {
  const r = page('<div class="bd"></div><div class="dlg" role="dialog" aria-modal="true" aria-label="Notice"><button class="x" aria-label="Close">x</button></div>',
    '.bd{position:fixed;top:0;left:0;right:0;bottom:0;z-index:10;background:rgba(0,0,0,.5)}.dlg{position:fixed;top:100px;left:10px;width:300px;height:200px;z-index:11;background:#fff;display:block}.x{width:44px;height:44px;background:#fff;color:#000}',
    {boxes: {'.x': {minInlineSize: 10, maxInlineSize: 10, intrinsicBlockSize: 20}}});
  for (const code of ['E_A11Y_CLICK_TRAP', 'U_A11Y_CLICK_TRAP', 'E_A11Y_INVISIBLE_BLOCKER', 'E_A11Y_OCCLUDED']) assert.equal(find(r, code).length, 0, code);
  // Without the close button, the modal is a trap.
  const closed = page('<div class="bd"></div><div class="dlg" role="dialog" aria-modal="true" aria-label="Notice"></div>',
    '.bd{position:fixed;top:0;left:0;right:0;bottom:0;z-index:10;background:rgba(0,0,0,.5)}.dlg{position:fixed;top:100px;left:10px;width:300px;height:200px;z-index:11;background:#fff;display:block}');
  assert.ok(find(closed, 'E_A11Y_CLICK_TRAP').length > 0);
});

test('a layer that covers only text is not a trap', () => {
  const r = page('<div class="ov"></div>', overlay, {host: '<main><p class="l">Some text</p><p class="m">More text</p></main>'});
  assert.equal(find(r, 'E_A11Y_CLICK_TRAP').length, 0);
  assert.equal(find(r, 'E_A11Y_INVISIBLE_BLOCKER').length, 0);
});

test('a partly covered control is not trapped: it can still be clicked where it shows', () => {
  const r = page('<div class="ov"></div>', '.ov{position:fixed;top:0;left:0;width:50px;height:600px;z-index:5;background:#000}.bar{position:fixed;top:0;left:0;width:300px;height:80px;display:block}', {host: '<main><nav class="bar"><a class="l" href="/a">First</a><a class="m" href="/b">Second</a></nav></main>'});
  assert.ok(find(r, 'E_A11Y_OCCLUDED').length > 0);
  assert.equal(find(r, 'E_A11Y_CLICK_TRAP').length, 0);
});

test('a link inside a line of text under a transparent box: an invisible blocker too', () => {
  const font = {family: 'Roboto', size: 16, lineHeight: 24, weight: 400};
  const contract = {minInlineSize: 140, intrinsicBlockSize: 24, wrap: 'nowrap', font,
    textMetrics: {kind: 'content', text: 'Read the guide first.', width: 139, inline: {'.u': {start: [66.5, 66.6], end: [105.7, 105.8], top: [1.6, 3.7], bottom: [20.3, 22.4]}}}};
  const html = '<html lang="en"><body><main class="page"><p class="p">Read the <a class="u" href="/x">guide</a> first.</p><div class="cover"></div></main></body></html>';
  const css = cover => '*{box-sizing:border-box;margin:0}body{display:block;background:#fff;color:#000}.page{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:24px;position:relative}'
    + `.p{font-family:Roboto;font-size:16px;line-height:24px;font-weight:400;white-space:nowrap}.u{color:#000}.cover{position:absolute;top:0;left:0;inline-size:300px;block-size:24px;${cover}}`;
  const codes = cover => analyzeHTML(html, {name: 'P', viewport, accessibility: true, boxes: {'.p': contract}, scrollbars: [{name: 'o', inlineSize: 0, blockSize: 0}], css: css(cover)})
    .diagnostics.filter(d => d.box === '.u' && /OCCLUDED|BLOCKER/.test(d.code)).map(d => d.code);
  assert.deepEqual([...new Set(codes(''))], ['E_A11Y_INVISIBLE_BLOCKER']);
  assert.deepEqual([...new Set(codes('background:#eee'))], ['E_A11Y_OCCLUDED']);
});
