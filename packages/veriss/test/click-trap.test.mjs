// E_A11Y_INVISIBLE_BLOCKER: a box that paints nothing is the top hit-test target over a visible control, so the
// click lands on something the user cannot see. Fixtures: an ad box over a page, a click-catcher.
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
