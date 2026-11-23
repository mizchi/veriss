// Controls under a device's safe area (notch, Dynamic Island, home indicator) on a viewport-fit=cover page, and
// controls under a dual-screen hinge. Opt-in through the safeArea and hinge options (see docs/devices.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const page = (meta, x) => `<html lang="en"><head>${meta}</head><body><main class="page"><p class="t">text</p></main><button class="x" aria-label="Close"></button></body></html>`;
const cover = '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">';
const plain = '<meta name="viewport" content="width=device-width,initial-scale=1">';
const run = (meta, x, options) => analyzeHTML(page(meta), {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}.page{background:#fff;color:#000}.t{height:20px}.x{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;width:24px;height:24px;background:#246;position:fixed;${x}}`, viewport: {min: 393, max: 393, height: {min: 852, max: 852}}, accessibility: true, boxes: {'.t': {minInlineSize: 1, intrinsicBlockSize: 20}}, ...options});
const warn = (r, code) => [...new Set(r.accessibility.warnings.filter(d => d.code === code).map(d => d.box))];

test('safe-area-target: a fixed control under the top or bottom inset of a viewport-fit=cover page', () => {
  const portrait = {safeArea: {top: 59, right: 0, bottom: 34, left: 0}};
  assert.deepEqual(warn(run(cover, 'top:8px;right:8px', portrait), 'W_A11Y_SAFE_AREA_TARGET'), ['.x']);
  assert.match(run(cover, 'top:8px;right:8px', portrait).accessibility.warnings.find(d => d.code === 'W_A11Y_SAFE_AREA_TARGET').message, /top/);
  assert.deepEqual(warn(run(cover, 'top:70px;right:8px', portrait), 'W_A11Y_SAFE_AREA_TARGET'), []);
  assert.deepEqual(warn(run(cover, 'bottom:8px;left:8px', portrait), 'W_A11Y_SAFE_AREA_TARGET'), ['.x']);
  // The fix the message suggests: offset by the inset (env() in a calc() inset is resolved from the safeArea option).
  const offset = run(cover, 'top:calc(env(safe-area-inset-top) + 4px);right:8px', portrait);
  assert.deepEqual(warn(offset, 'W_A11Y_SAFE_AREA_TARGET'), []);
  assert.equal(offset.sizes.find(s => s.box === '.x' && s.rect).rect.blockStart.constant, '63');
  // Without viewport-fit=cover the browser keeps the page inside the safe area.
  assert.deepEqual(warn(run(plain, 'top:8px;right:8px', portrait), 'W_A11Y_SAFE_AREA_TARGET'), []);
  // Landscape: the cutout may be on either side.
  const landscape = {safeArea: {top: 0, right: 59, bottom: 21, left: 59}};
  assert.deepEqual(warn(run(cover, 'top:100px;right:8px', landscape), 'W_A11Y_SAFE_AREA_TARGET'), ['.x']);
  assert.deepEqual(warn(run(cover, 'top:100px;right:80px', landscape), 'W_A11Y_SAFE_AREA_TARGET'), []);
});

test('hinge-target: a control under a dual-screen hinge', () => {
  const run2 = x => analyzeHTML(page(plain), {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}.page{background:#fff;color:#000}.t{height:20px}.x{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;width:24px;height:24px;background:#246;position:fixed;top:100px;${x}}`, viewport: {min: 1114, max: 1114, height: {min: 720, max: 720}}, accessibility: true, boxes: {'.t': {minInlineSize: 1, intrinsicBlockSize: 20}}, hinge: {left: 540, top: 0, width: 34, height: 720}});
  assert.deepEqual(warn(run2('left:545px'), 'W_A11Y_HINGE_TARGET'), ['.x']);
  assert.deepEqual(warn(run2('left:520px'), 'W_A11Y_HINGE_TARGET'), ['.x']); // straddles the hinge
  assert.deepEqual(warn(run2('left:100px'), 'W_A11Y_HINGE_TARGET'), []);
  assert.deepEqual(warn(run2('left:600px'), 'W_A11Y_HINGE_TARGET'), []);
});

test('deviceChecks: profiles by share, orientations, safe areas by mode, and the dual-screen spanned check', async () => {
  const {deviceChecks, deviceData} = await import('../src/devices/index.mjs');
  assert.ok(deviceData.profiles.length > 50 && /^\d{4}-\d{2}$/.test(deviceData.month));
  const checks = deviceChecks({region: 'jp', minShare: 1, mode: 'fullscreen'});
  assert.ok(checks.every(c => c.viewport.min === c.viewport.max && c.viewport.height.min <= c.viewport.height.max));
  // An iPhone with a Dynamic Island: the top inset reaches a full-screen page in portrait, the sides in landscape.
  const island = checks.find(c => c.devices.includes('iPhone 15 Pro') && c.orientation === 'portrait');
  assert.equal(island.cutout, 'dynamic-island');
  assert.ok(island.safeArea.top > 0 && island.safeArea.bottom > 0);
  const sideways = checks.find(c => c.devices.includes('iPhone 15 Pro') && c.orientation === 'landscape');
  assert.ok(sideways.safeArea.left > 0 && sideways.safeArea.right > 0 && sideways.safeArea.top === 0);
  // In Safari the portrait top inset is behind its bars.
  assert.equal(deviceChecks({mode: 'browser'}).find(c => c.devices.includes('iPhone 15 Pro') && c.orientation === 'portrait').safeArea.top, 0);
  // Foldables and the dual-screen device are kept whatever their share; spanned carries the hinge.
  assert.ok(checks.some(c => c.kind === 'foldable'));
  const spanned = checks.find(c => c.orientation === 'spanned');
  assert.deepEqual(spanned.hinge, {left: 540, top: 0, width: 34, height: 720});
  assert.equal(spanned.viewport.min, 1114);
  // A higher threshold keeps fewer screens.
  assert.ok(deviceChecks({minShare: 10, special: false}).length < checks.length);
});

test('analyzeDevices: one report per check, findings grouped with the checks they appear on', async () => {
  const {analyzeDevices} = await import('../src/devices/index.mjs');
  const checks = [
    {id: 'a/portrait', viewport: {min: 393, max: 393, height: {min: 852, max: 852}}, safeArea: {top: 59, right: 0, bottom: 34, left: 0}},
    {id: 'b/portrait', viewport: {min: 393, max: 393, height: {min: 852, max: 852}}, safeArea: {top: 20, right: 0, bottom: 0, left: 0}},
  ];
  const {results, findings} = analyzeDevices(page(cover), {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}.page{background:#fff;color:#000}.t{height:20px}.x{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;width:24px;height:24px;background:#246;position:fixed;top:30px;right:8px}`, accessibility: true, boxes: {'.t': {minInlineSize: 1, intrinsicBlockSize: 20}}}, checks);
  assert.equal(results.length, 2);
  assert.deepEqual(findings.filter(f => f.code === 'W_A11Y_SAFE_AREA_TARGET').map(f => f.checks), [['a/portrait']]);
});

// target-offscreen: a control in a fixed (or sticky) box does not scroll into view: the part outside the viewport is
// never shown. Entirely outside: E_A11Y_TARGET_OFFSCREEN; partly: W_A11Y_TARGET_PARTLY_OFFSCREEN. Content in the flow
// scrolls into view (a negative offset in it is focus-offscreen's).
test('target-offscreen: a fixed control outside or partly outside the viewport', () => {
  const at = (x, extra = '') => analyzeHTML(page(plain), {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}.page{background:#fff;color:#000}.t{height:20px}.x{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;width:24px;height:24px;background:#246;position:fixed;${x}}${extra}`, viewport: {min: 393, max: 393, height: {min: 600, max: 852}}, accessibility: true, boxes: {'.t': {minInlineSize: 1, intrinsicBlockSize: 20}}});
  const codes = r => [...new Set([...r.diagnostics, ...r.accessibility.warnings].filter(d => /TARGET_(?:PARTLY_)?OFFSCREEN/.test(d.code)).map(d => d.code))].sort();
  assert.deepEqual(codes(at('top:-7px;right:8px')), ['W_A11Y_TARGET_PARTLY_OFFSCREEN']);
  assert.deepEqual(codes(at('top:-30px;right:8px')), ['E_A11Y_TARGET_OFFSCREEN']);
  assert.deepEqual(codes(at('top:8px;right:-10px')), ['W_A11Y_TARGET_PARTLY_OFFSCREEN']);
  assert.deepEqual(codes(at('top:8px;left:400px')), ['E_A11Y_TARGET_OFFSCREEN']);
  assert.deepEqual(codes(at('top:8px;right:8px')), []);
  // Below the bottom edge only where the viewport is short: reported for those heights (700px and up is fine).
  const low = at('top:690px;left:8px');
  const found = [...low.diagnostics, ...low.accessibility.warnings].filter(d => /TARGET_(?:PARTLY_)?OFFSCREEN/.test(d.code));
  assert.ok(found.length && found.every(d => d.heightRange.max <= 714), JSON.stringify(found.map(d => [d.code, d.heightRange])));
  // A skip link hidden above the top until focused (a :focus rule moves it in): not reported.
  assert.deepEqual(codes(at('top:-40px;left:8px', '.x:focus{top:8px}')), []);
  // In the flow it scrolls into view: not reported.
  const flow = analyzeHTML(`<html lang="en"><head>${plain}</head><body><main class="page"><p class="t">text</p><button class="x" aria-label="Close"></button></main></body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}.page{background:#fff;color:#000;padding-top:2000px}.t{height:20px}.x{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;width:24px;height:24px;background:#246}`, viewport: {min: 393, max: 393, height: {min: 600, max: 852}}, accessibility: true, boxes: {'.t': {minInlineSize: 1, intrinsicBlockSize: 20}}});
  assert.deepEqual(codes(flow), []);
});
