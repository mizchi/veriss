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

test('deviceChecks: fullscreen gives an iPhone the whole screen; safeAreaMeasured per mode', async () => {
  const {deviceChecks, deviceData} = await import('../src/devices/index.mjs');
  const find = (checks, orientation) => checks.find(c => c.devices.includes('iPhone 14 Pro') && c.orientation === orientation);
  const browser = deviceChecks({mode: 'browser', minShare: 0}), full = deviceChecks({mode: 'fullscreen', minShare: 0});
  assert.deepEqual(find(browser, 'landscape').viewport, {min: 734, max: 734, height: {min: 343, max: 393}});
  assert.deepEqual(find(full, 'landscape').viewport, {min: 852, max: 852, height: {min: 343, max: 393}});
  assert.deepEqual(find(full, 'portrait').viewport, {min: 393, max: 393, height: {min: 660, max: 852}});
  // An iPhone without a known safe area gets the whole screen too, and no safe area.
  const air = full.find(c => c.devices.includes('iPhone Air') && c.orientation === 'landscape');
  assert.equal(air.viewport.min, 912);
  assert.equal('safeArea' in air, false);
  // Other devices keep the browser's viewport.
  const other = c => !c.safeArea && !c.devices.includes('iPhone Air');
  assert.deepEqual(full.filter(other).map(c => c.viewport), browser.filter(other).map(c => c.viewport));
  // Provenance per mode, from the data.
  const profile = deviceData.profiles.find(p => p.devices.includes('iPhone 14 Pro'));
  assert.equal(find(browser, 'portrait').safeAreaMeasured, profile.safeArea.measured.browser);
  assert.equal(find(full, 'portrait').safeAreaMeasured, profile.safeArea.measured.fullscreen);
});

test('deviceChecks: a check owns its objects; changing one does not change the data or a later call', async () => {
  const {deviceChecks, deviceData} = await import('../src/devices/index.mjs');
  const before = JSON.stringify(deviceData);
  const checks = deviceChecks({mode: 'fullscreen'});
  const island = checks.find(c => c.devices.includes('iPhone 15 Pro') && c.orientation === 'portrait');
  const spanned = checks.find(c => c.orientation === 'spanned');
  island.safeArea.top = 999; island.devices.push('x'); island.viewport.height.min = 1;
  spanned.hinge.left = 1; spanned.devices.length = 0;
  assert.equal(JSON.stringify(deviceData), before);
  const again = deviceChecks({mode: 'fullscreen'});
  assert.ok(again.find(c => c.devices.includes('iPhone 15 Pro') && c.orientation === 'portrait').safeArea.top < 999);
  assert.equal(again.find(c => c.orientation === 'spanned').hinge.left, 540);
});

test('analyzeDevices: the caller\'s safeArea never reaches a check; a check without its own stays Unknown on env()', async () => {
  const {analyzeDevices} = await import('../src/devices/index.mjs');
  const checks = [
    {id: 'own/portrait', viewport: {min: 393, max: 393, height: {min: 852, max: 852}}, safeArea: {top: 20, right: 0, bottom: 0, left: 0}},
    {id: 'unknown/portrait', viewport: {min: 393, max: 393, height: {min: 852, max: 852}}},
  ];
  const css = x => `*{box-sizing:border-box;margin:0}html,body,.page{${g}}.page{background:#fff;color:#000}.t{height:20px}.x{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;width:24px;height:24px;background:#246;position:fixed;${x}}`;
  const options = x => ({name: 'P', css: css(x), accessibility: true, boxes: {'.t': {minInlineSize: 1, intrinsicBlockSize: 20}}, safeArea: {top: 59, right: 0, bottom: 34, left: 0}});
  // top:30px is under the caller's 59px but not under the check's own 20px: only the check's counts.
  const {results, findings} = analyzeDevices(page(cover), options('top:30px;right:8px'), checks);
  assert.deepEqual(findings.filter(f => f.code === 'W_A11Y_SAFE_AREA_TARGET'), []);
  assert.notEqual(results[1].report.status, 'unknown');
  // Reading env() with no safe area of its own: Unknown, not the caller's 59px.
  const envResults = analyzeDevices(page(cover), options('top:env(safe-area-inset-top);right:8px'), checks).results;
  assert.equal(envResults[0].report.sizes.find(s => s.box === '.x' && s.rect).rect.blockStart.constant, '20');
  assert.equal(envResults[1].report.status, 'unknown');
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

// A control (or its wrapper) fixed only on one side of a breakpoint and in the flow on the other: the fixed-box
// checks apply where it is fixed, not where it scrolls with the page.
test('target-offscreen and safe-area-target: position fixed on one side of a breakpoint only', () => {
  const cover = '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">';
  const run = (html, css, meta = plain, options = {}) => analyzeHTML(`<html lang="en"><head>${meta}</head><body><main class="page"><p class="t">text</p>${html}</main></body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}.page{background:#fff;color:#000;padding-top:2000px}.t{height:20px}.x{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;width:24px;height:24px;background:#246}${css}`, viewport: {min: 300, max: 800, height: {min: 600, max: 600}}, accessibility: true, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}], boxes: {'.t': {minInlineSize: 1, intrinsicBlockSize: 20}}, ...options});
  const spans = (r, code) => [...r.diagnostics, ...r.accessibility.warnings].filter(d => d.code === code).map(d => [d.range.minExact, d.range.maxExact]).sort();
  const self = '<button class="x" aria-label="Close"></button>', wrapped = `<div class="w">${self}</div>`;
  // Fixed above the top edge below 500px; in the flow (2000px down the page, it scrolls into view) from 500px.
  assert.deepEqual(spans(run(self, '@media (max-width:499px){.x{position:fixed;top:-30px;left:8px}}'), 'E_A11Y_TARGET_OFFSCREEN'), [['300', '499']]);
  assert.deepEqual(spans(run(self, '@media (min-width:500px){.x{position:fixed;top:-30px;left:8px}}'), 'E_A11Y_TARGET_OFFSCREEN'), [['500', '800']]);
  assert.deepEqual(spans(run(wrapped, '@media (max-width:499px){.w{position:fixed;top:-30px;left:8px;width:40px}}'), 'E_A11Y_TARGET_OFFSCREEN'), [['300', '499']]);
  assert.deepEqual(spans(run(wrapped, '@media (min-width:500px){.w{position:fixed;top:-30px;left:8px;width:40px}}'), 'E_A11Y_TARGET_OFFSCREEN'), [['500', '800']]);
  // Safe area: at the page's top in the flow it scrolls out of the notch's band; fixed there, it stays.
  const top = {safeArea: {top: 59, right: 0, bottom: 34, left: 0}}, flow = '.page{padding-top:0}';
  assert.deepEqual(spans(run(self, `${flow}@media (max-width:499px){.x{position:fixed;top:8px;left:8px}}`, cover, top), 'W_A11Y_SAFE_AREA_TARGET'), [['300', '499']]);
  assert.deepEqual(spans(run(self, `${flow}@media (min-width:500px){.x{position:fixed;top:8px;left:8px}}`, cover, top), 'W_A11Y_SAFE_AREA_TARGET'), [['500', '800']]);
  assert.deepEqual(spans(run(wrapped, `${flow}@media (max-width:499px){.w{position:fixed;top:8px;left:8px;width:40px}}`, cover, top), 'W_A11Y_SAFE_AREA_TARGET'), [['300', '499']]);
  assert.deepEqual(spans(run(wrapped, `${flow}@media (min-width:500px){.w{position:fixed;top:8px;left:8px;width:40px}}`, cover, top), 'W_A11Y_SAFE_AREA_TARGET'), [['500', '800']]);
  // Fixed everywhere: the whole range.
  assert.deepEqual(spans(run(self, '.x{position:fixed;top:-30px;left:8px}'), 'E_A11Y_TARGET_OFFSCREEN'), [['300', '800']]);
});

// A control in a corner reaches into two safe-area bands: one warning per side, not one per range.
test('safe-area-target: a corner control is reported for each side it reaches into', () => {
  const r = run(cover, 'top:8px;left:8px', {safeArea: {top: 59, right: 0, bottom: 34, left: 40}});
  assert.deepEqual(r.accessibility.warnings.filter(d => d.code === 'W_A11Y_SAFE_AREA_TARGET').map(d => d.side).sort(), ['left', 'top']);
});
