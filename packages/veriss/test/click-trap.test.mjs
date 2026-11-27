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
  // In the flow of a page that scrolls far enough, the links scroll out from under the fixed box: covered
  // (E_A11Y_OCCLUDED), but not a trap.
  const flow = page(frame, painted + '.t{display:block;height:2000px}', {host: '<main><a class="l" href="/a">First</a><a class="m" href="/b">Second</a><div class="t"></div></main>'});
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

// Boxes inside an overflow: hidden layer (an ad slot clips its frame and close control) hit-test where they sit at the
// initial scroll position: a transparent wrapper is invisible only where none of its descendants paint.
const slot = frameCSS => page('<div class="w"><iframe class="f" title="Advertisement" width="300" height="250"></iframe><div class="x"></div></div>',
  `.w{width:300px;height:250px;position:absolute;display:block;z-index:2147483647;overflow:hidden;top:0;left:10px}.f{display:block;width:300px;height:250px;position:relative;top:0;left:0;overflow:hidden;border:0;${frameCSS}}.x{width:42px;height:42px;position:absolute;overflow:hidden;cursor:pointer;top:0;right:0}`);

test('a transparent clipping wrapper filled by a painting frame covers visibly: an occlusion, not an invisible blocker', () => {
  const r = slot('');
  assert.equal(find(r, 'E_A11Y_INVISIBLE_BLOCKER').length, 0, JSON.stringify(find(r, 'E_A11Y_INVISIBLE_BLOCKER').map(d => d.message)));
  const occluded = find(r, 'E_A11Y_OCCLUDED').filter(d => d.box === '.l');
  assert.ok(occluded.length > 0, JSON.stringify(r.diagnostics.map(d => d.code)));
  // The frame at opacity 0: nothing paints there, so the wrapper (or the frame) blocks invisibly.
  const ghost = slot('opacity:0');
  assert.deepEqual([...new Set(find(ghost, 'E_A11Y_INVISIBLE_BLOCKER').map(d => d.box))], ['.l', '.m']);
  assert.equal(find(ghost, 'E_A11Y_OCCLUDED').filter(d => ['.l', '.m'].includes(d.box)).length, 0);
});

// A full-viewport overlay that clips its content (overflow: hidden): its close control must still be judged.
const clipped = frameCSS => page('<div class="ov"><iframe class="f" title="Advertisement"></iframe><div class="x"></div></div>',
  `.ov{position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;background:#000;overflow:hidden}.f{display:block;width:300px;height:250px;border:0;${frameCSS}}.x{position:absolute;top:0;right:0;width:42px;height:42px;cursor:pointer;background-size:42px 42px;background-image:https://example.com/close.png}`);

test('the close control of a clipping overlay is a way-out candidate, and why it fails is said', () => {
  const r = clipped('opacity:0');
  const [trap] = find(r, 'E_A11Y_CLICK_TRAP');
  assert.ok(trap, JSON.stringify(r.diagnostics.map(d => d.code)));
  const x = trap.exits.find(e => e.box === '.x');
  assert.ok(x, JSON.stringify(trap.exits));
  assert.match(x.why, /paints nothing.*background-image .*dropped.*W_CSS_IMAGE_INVALID/);
  assert.match(x.why, /cannot take focus and has no role/);
  assert.doesNotMatch(trap.message, /it has no control/);
  assert.match(trap.message, /\.x paints nothing/);
  // A frame that paints may hold the way out: Unknown, still naming the failing close control.
  const shown = clipped('');
  assert.equal(find(shown, 'E_A11Y_CLICK_TRAP').length, 0);
  const [unknown] = find(shown, 'U_A11Y_CLICK_TRAP');
  assert.ok(unknown, JSON.stringify(shown.diagnostics.map(d => d.code)));
  assert.ok(unknown.exits.some(e => e.box === '.x'));
});

test('a candidate whose position is not known (in a scroll container) makes the trap Unknown, not an error', () => {
  const r = page('<div class="ov"><div class="s"><button class="x" aria-label="Close">x</button></div></div>',
    overlay + '.s{position:absolute;top:0;right:0;width:60px;height:60px;overflow:auto}.x{width:44px;height:44px;background:#fff;color:#000}', {boxes: {'.x': {minInlineSize: 10, maxInlineSize: 10, intrinsicBlockSize: 20}}});
  assert.equal(find(r, 'E_A11Y_CLICK_TRAP').length, 0, JSON.stringify(find(r, 'E_A11Y_CLICK_TRAP').map(d => d.message)));
  // Unresolved, not dropped: the trap is Unknown and names the close button as the candidate it could not place.
  const unknown = find(r, 'U_A11Y_CLICK_TRAP');
  assert.ok(unknown.length > 0 && unknown.every(d => d.box === '.ov'), JSON.stringify(r.diagnostics.map(d => d.code)));
  assert.ok(unknown.every(d => d.unplaced && /the position of \.x is not known/.test(d.message)), JSON.stringify(unknown.map(d => d.message)));
});

test('a transparent wrapper that scrolls (overflow: auto) around a painting frame is not known to be invisible', () => {
  const r = page('<div class="w"><iframe class="f" title="Advertisement" width="300" height="250"></iframe></div>',
    '.w{width:300px;height:250px;position:absolute;display:block;z-index:2147483647;overflow:auto;top:0;left:10px}.f{display:block;width:300px;height:250px;border:0}');
  assert.equal(find(r, 'E_A11Y_INVISIBLE_BLOCKER').length, 0, JSON.stringify(find(r, 'E_A11Y_INVISIBLE_BLOCKER').map(d => d.message)));
  assert.ok(find(r, 'E_A11Y_OCCLUDED').some(d => d.box === '.l'));
});

// A transparent link over the whole viewport (an ad's click hijack): the user sees the page's controls, every click
// lands on the ad link. A link is a control, but the covered controls are not its own (unlike a stretched link's
// ::after over the buttons of its own card): an invisible blocker, like a <div>.
test('a transparent full-viewport link over the page is an invisible blocker; a stretched link over its own card stays an occlusion', () => {
  const r = page('<a class="catch" href="https://adv.example/"></a>', '.catch{position:fixed;top:0;left:0;right:0;bottom:0;z-index:5;display:block}');
  const blockers = find(r, 'E_A11Y_INVISIBLE_BLOCKER');
  assert.deepEqual([...new Set(blockers.map(d => d.box))], ['.l', '.m'], JSON.stringify(r.diagnostics.map(d => [d.code, d.box])));
  assert.equal(find(r, 'E_A11Y_OCCLUDED').filter(d => ['.l', '.m'].includes(d.box)).length, 0);
  // Absolutely positioned against the whole page (body is its containing block): the same.
  const abs = page('<a class="catch" href="https://adv.example/"></a>', 'body{position:relative}.catch{position:absolute;top:0;left:0;right:0;bottom:0;z-index:5;display:block}');
  assert.deepEqual([...new Set(find(abs, 'E_A11Y_INVISIBLE_BLOCKER').map(d => d.box))], ['.l', '.m']);
  // A stretched link: its ::after covers the button of its own card (the card is the ::after's containing block).
  const card = page('', '.card{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:40px;position:relative;background:#fff}.s{display:block;height:40px}.s::after{content:"";position:absolute;inset:0}.b{display:block;width:100px;height:40px;background:#246}',
    {host: '<main><a class="l" href="/a">First</a><a class="m" href="/b">Second</a><article class="card"><a class="s" href="/item" aria-label="Item"></a><button class="b" aria-label="Save"></button></article></main>'});
  assert.ok(find(card, 'E_A11Y_OCCLUDED').some(d => d.box === '.b'), JSON.stringify(card.diagnostics.map(d => [d.code, d.box])));
  assert.equal(find(card, 'E_A11Y_INVISIBLE_BLOCKER').filter(d => d.box === '.b').length, 0);
});

// A visible close button under a transparent link that fills the same overlay: the click lands on the link.
test('a close button under a transparent link of the same overlay is no way out: a click trap naming the link', () => {
  const r = page('<div class="ov"><button class="x" aria-label="Close"></button><a class="lp" href="https://adv.example/"></a></div>',
    overlay + '.x{position:absolute;top:0;right:0;width:44px;height:44px;background:#fff}.lp{position:absolute;top:0;left:0;right:0;bottom:0;display:block}');
  const [trap] = find(r, 'E_A11Y_CLICK_TRAP');
  assert.ok(trap, JSON.stringify(r.diagnostics.map(d => [d.code, d.box])));
  assert.equal(trap.box, '.ov');
  const x = trap.exits.find(e => e.box === '.x');
  assert.ok(x, JSON.stringify(trap.exits));
  assert.match(x.why, /covered by \.lp, which paints nothing/);
  assert.match(trap.message, /\.x is covered by \.lp, which paints nothing/);
  // Control: the link under the button (or not taking the pointer), the button is the way out.
  for (const css of ['.lp{pointer-events:none}', '.x{z-index:1}']) {
    const ok = page('<div class="ov"><button class="x" aria-label="Close"></button><a class="lp" href="https://adv.example/"></a></div>',
      overlay + '.x{position:absolute;top:0;right:0;width:44px;height:44px;background:#fff}.lp{position:absolute;top:0;left:0;right:0;bottom:0;display:block}' + css);
    assert.equal(find(ok, 'E_A11Y_CLICK_TRAP').length, 0, css);
  }
});

// inert: the page's controls take no click or focus. A shown layer that is not inert must offer the way out.
test('an inert page under a painted layer with no way out is a click trap; a named visible close button frees it', () => {
  const host = '<main class="w" inert><a class="l" href="/a">First</a><a class="m" href="/b">Second</a></main>';
  const ad = '.ad{position:fixed;top:200px;left:20px;width:300px;height:200px;background:#ffe;z-index:9;display:block}';
  const r = page('<div class="ad" role="dialog" aria-label="Ad"></div>', ad, {host});
  const [trap] = find(r, 'E_A11Y_CLICK_TRAP');
  assert.ok(trap, JSON.stringify(r.diagnostics.map(d => [d.code, d.box])));
  assert.equal(trap.box, '.ad');
  assert.deepEqual(trap.covered, ['.l', '.m']);
  assert.match(trap.message, /inert/);
  // A visible, named close button in the dialog: no trap.
  const ok = page('<div class="ad" role="dialog" aria-label="Ad"><button class="x" aria-label="Close">x</button></div>', ad + '.x{width:44px;height:44px;background:#fff;color:#000}', {host, boxes: {'.x': {minInlineSize: 10, maxInlineSize: 10, intrinsicBlockSize: 20}}});
  assert.equal(find(ok, 'E_A11Y_CLICK_TRAP').length, 0, JSON.stringify(find(ok, 'E_A11Y_CLICK_TRAP').map(d => d.message)));
  // A control of the page that is not inert is a way out too.
  const free = page('<div class="ad" role="dialog" aria-label="Ad"></div><a class="k" href="/k">Home</a>', ad + '.k{display:block;width:100px;height:40px;color:#000}', {host, boxes: {'.k': {minInlineSize: 40, maxInlineSize: 40, intrinsicBlockSize: 20}}});
  assert.equal(find(free, 'E_A11Y_CLICK_TRAP').length, 0);
  // Nothing inert: no trap (the layer covers nothing).
  assert.equal(find(page('<div class="ad" role="dialog" aria-label="Ad"></div>', ad), 'E_A11Y_CLICK_TRAP').length, 0);
});

// A close button that paints nothing itself, whose icon shows only at 600px and wider: below, it is no way out.
test('a way out that paints only through a child shown at some widths frees the layer only there', () => {
  const r = page('<div class="ov"><button class="x" aria-label="Close"><span class="i"></span></button></div>',
    overlay + '.x{position:absolute;top:0;right:0;width:44px;height:44px;background:transparent}.i{display:block;width:44px;height:44px;background:#fff}@media (width < 600px){.i{display:none}}');
  const traps = find(r, 'E_A11Y_CLICK_TRAP');
  assert.ok(traps.length > 0, JSON.stringify(r.diagnostics.map(d => [d.code, d.box])));
  assert.ok(traps.every(t => t.range.max <= 600), JSON.stringify(traps.map(t => t.range)));
  assert.match(traps[0].message, /\.x paints nothing/);
});

// A transparent clipping layer whose only paint is a frame without a position in the first pass: the layer gets the
// trap analysis (the frame may hold the way out: Unknown), not only the occlusion of the controls under it.
test('a transparent overflow: hidden overlay that shows a frame gets the trap analysis (Unknown)', () => {
  const r = page('<div class="w"><iframe class="f" title="Advertisement" width="300" height="250"></iframe></div>',
    '.w{position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;overflow:hidden;display:block}.f{display:block;width:300px;height:250px;border:0}');
  assert.ok(find(r, 'U_A11Y_CLICK_TRAP').length > 0, JSON.stringify(r.diagnostics.map(d => [d.code, d.box])));
  assert.equal(find(r, 'E_A11Y_CLICK_TRAP').length, 0);
});

// The root does not scroll for the user when html is overflow: hidden / clip (and body is not a scroller), or html is
// visible and body is hidden / clip (body's overflow goes to the viewport). Measured with the wheel and PageDown in
// Chromium, Firefox and WebKit (16 combinations; html auto always scrolls).
const sheetHost = '<main><div class="gap"></div><a class="l" href="/a">First</a><a class="m" href="/b">Second</a></main>';
const sheet = (root, tail = 0) => page('<div class="sh"></div>', `.gap{display:block;height:500px}.t{display:block;height:${tail}px}.sh{position:fixed;left:0;right:0;bottom:0;height:60vh;background:#333;z-index:9;display:block}${root}`, {host: sheetHost.replace('</main>', '<div class="t"></div></main>')});
test('a fixed sheet over in-flow controls of a page that does not scroll: scrolling cannot free them (a click trap)', () => {
  for (const root of ['html{overflow:hidden}', 'html{overflow:clip}', 'html{overflow:hidden}body{overflow:visible}']) {
    const r = sheet(root);
    const [trap] = find(r, 'E_A11Y_CLICK_TRAP');
    assert.ok(trap, `${root}: ${JSON.stringify(r.diagnostics.map(d => [d.code, d.box]))}`);
    assert.deepEqual(trap.covered, ['.l', '.m']);
    assert.match(trap.message, /does not scroll/);
    assert.ok(find(r, 'E_A11Y_OCCLUDED').filter(d => d.box === '.l').every(d => /scrolling cannot free it/.test(d.message)), root);
  }
  // The page scrolls (far enough): scrolling frees them. Body hidden or auto under a hidden html is a box that clips (or
  // scrolls) of its own, which the layout does not model for a fixed box: Unknown, never a trap.
  for (const root of ['', 'html{overflow:auto}', 'html{overflow:hidden}body{overflow:hidden}', 'html{overflow:hidden}body{overflow:auto}']) {
    const r = sheet(root, 1000);
    assert.equal(find(r, 'E_A11Y_CLICK_TRAP').length, 0, root);
    assert.ok(find(r, 'E_A11Y_OCCLUDED').filter(d => d.box === '.l').every(d => !/scrolling cannot free it/.test(d.message)), root);
  }
});

// A fixed box that paints nothing (an ad left at opacity 0) low in the viewport: in-flow links pass under it as the
// page scrolls, and a click on them lands on the box (measured in Chromium, Firefox and WebKit with elementFromPoint
// at several scroll offsets; with pointer-events: none nothing does).
const wipeHost = '<main><a class="l" href="/a">First</a><div class="gap"></div><a class="m" href="/b">Second</a><div class="tail"></div></main>';
const wipe = css => page('<div class="ad"></div>', `.gap{display:block;height:960px}.tail{display:block;height:400px}.ad{position:fixed;right:0;bottom:120px;width:320px;height:180px;z-index:2147483000;opacity:0;background:#fff}${css}`, {host: wipeHost});
test('in-flow controls that scroll under a fixed box that paints nothing are invisible blockers at those offsets', () => {
  const r = wipe('');
  const blockers = find(r, 'E_A11Y_INVISIBLE_BLOCKER');
  assert.deepEqual([...new Set(blockers.map(d => d.box))], ['.m'], JSON.stringify(r.diagnostics.map(d => [d.code, d.box])));
  assert.ok(blockers.every(d => d.range.max <= 420 && d.scrolled), JSON.stringify(blockers.map(d => [d.range, d.scrolled])));
  assert.match(blockers[0].message, /scroll/);
  // Controls: no pointer events; a box that paints (scrolling on is the way out); a page that does not scroll.
  for (const css of ['.ad{pointer-events:none}', '.ad{opacity:1}', 'html{overflow:hidden}'])
    assert.equal(find(wipe(css), 'E_A11Y_INVISIBLE_BLOCKER').length, 0, css);
});

// Review follow-ups (PR #35).
test('a fixed box with no area takes no click: no invisible blocker as controls scroll past it', () => {
  for (const css of ['.ad{left:50px;right:auto;width:0}', '.ad{left:0;right:auto;height:0}'])
    assert.equal(find(wipe(css), 'E_A11Y_INVISIBLE_BLOCKER').length, 0, css);
});

test('a fixed sheet over in-flow controls of a page too short to scroll is a click trap; a page that scrolls them out is not', () => {
  // 580px of content in a 600-900px viewport: the page does not scroll, so the links stay under the 60vh sheet.
  const [trap] = find(sheet(''), 'E_A11Y_CLICK_TRAP');
  assert.ok(trap);
  assert.deepEqual(trap.covered, ['.l', '.m']);
  // A page that scrolls up to 50px: not enough to lift the links (from 500px) above the sheet (from 240px): a trap.
  const short = sheet('', 50);
  assert.ok(find(short, 'E_A11Y_CLICK_TRAP').length > 0, JSON.stringify(short.diagnostics.map(d => [d.code, d.box])));
  // A page that scrolls far enough: scrolling frees them (the other test).
});

test('a focusable way out covered by a box of its own layer is no way out', () => {
  // A painted div with tabindex=0 (not a control) under a later sibling that paints over it.
  const r = page('<div class="ov"><div class="x" tabindex="0" aria-label="Close"></div><div class="c"></div></div>',
    overlay + '.x{position:absolute;top:0;right:0;width:44px;height:44px;background:#fff}.c{position:absolute;top:0;right:0;width:100px;height:100px;background:#333}');
  const [trap] = find(r, 'E_A11Y_CLICK_TRAP');
  assert.ok(trap, JSON.stringify(r.diagnostics.map(d => [d.code, d.box])));
  assert.match(trap.exits.find(e => e.box === '.x')?.why ?? '', /covered by \.c/);
});

test('a close button clipped away by an overflow: hidden ancestor is no way out', () => {
  const r = page('<div class="ov"><div class="w"><button class="x" aria-label="Close">x</button></div></div>',
    overlay + '.w{position:absolute;top:0;right:0;width:100px;height:60px;overflow:hidden;display:block}.x{position:absolute;top:100px;left:0;width:44px;height:44px;background:#fff;color:#000}', {boxes: {'.x': {minInlineSize: 10, maxInlineSize: 10, intrinsicBlockSize: 20}}});
  assert.ok(find(r, 'E_A11Y_CLICK_TRAP').length + find(r, 'U_A11Y_CLICK_TRAP').length > 0, JSON.stringify(r.diagnostics.map(d => [d.code, d.box])));
  // Still a way out where it shows inside the wrapper.
  const shown = page('<div class="ov"><div class="w"><button class="x" aria-label="Close">x</button></div></div>',
    overlay + '.w{position:absolute;top:0;right:0;width:100px;height:60px;overflow:hidden;display:block}.x{position:absolute;top:10px;left:0;width:44px;height:44px;background:#fff;color:#000}', {boxes: {'.x': {minInlineSize: 10, maxInlineSize: 10, intrinsicBlockSize: 20}}});
  assert.equal(find(shown, 'E_A11Y_CLICK_TRAP').length + find(shown, 'U_A11Y_CLICK_TRAP').length, 0, JSON.stringify(shown.diagnostics.map(d => [d.code, d.box])));
});

// What the target shows is decided by every box painted over it, pointer-events: none or not: under an opaque sheet that
// takes no click, the control is not seen, so the transparent catcher between them is an occlusion, not an invisible
// blocker (giving the catcher pointer-events: none would not show the control).
test('an opaque pointer-events: none sheet over the control: the catcher under it is an occlusion', () => {
  const r = page('<div class="catch"></div><div class="sheet"></div>', '.catch{position:fixed;top:0;left:0;right:0;bottom:0;z-index:5}.sheet{position:fixed;top:0;left:0;right:0;height:100px;z-index:6;background:#000;pointer-events:none}');
  assert.equal(find(r, 'E_A11Y_INVISIBLE_BLOCKER').filter(d => ['.l', '.m'].includes(d.box)).length, 0, JSON.stringify(find(r, 'E_A11Y_INVISIBLE_BLOCKER').map(d => d.message)));
  assert.ok(find(r, 'E_A11Y_OCCLUDED').some(d => d.box === '.l' && d.cover === find(r, 'E_A11Y_OCCLUDED').find(x => x.box === '.l').cover && /\.catch/.test(d.message)), JSON.stringify(r.diagnostics.map(d => [d.code, d.box])));
  // Without the sheet the catcher is an invisible blocker (control).
  assert.ok(find(page('<div class="catch"></div>', '.catch{position:fixed;top:0;left:0;right:0;bottom:0;z-index:5}'), 'E_A11Y_INVISIBLE_BLOCKER').some(d => d.box === '.l'));
});

// Two boxes that paint nothing over one control, the upper one only at some widths (it moves with the viewport): each
// width range is reported under the box that is on top there, whichever comes first in the tree.
test('an invisible blocker is named by the box on top in each width range', () => {
  const css = '.a{position:fixed;top:0;left:0;right:0;bottom:0;z-index:5}.b{position:fixed;top:0;left:calc(50% - 300px);width:100px;height:300px;z-index:6}';
  for (const html of ['<div class="a"></div><div class="b"></div>', '<div class="b"></div><div class="a"></div>']) {
    const r = page(html, css);
    const named = find(r, 'E_A11Y_INVISIBLE_BLOCKER').filter(d => d.box === '.l').map(d => [d.message.match(/but (\S+)/)[1], d.range.minExact, d.range.maxExact]).sort((x, y) => Number(x[1]) - Number(y[1]));
    // .b reaches .l (x 0..100) while 400 < width < 800.
    assert.deepEqual(named, [['.a', '320', '400'], ['.b', '400', '800'], ['.a', '800', '800']], html);
  }
});
