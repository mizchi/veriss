// Device shapes (docs/devices.md): Chromium's DevTools overrides stand in for the device. The safe-area override sets
// env(safe-area-inset-*) on a viewport-fit=cover page, and a display feature splits the viewport into two segments
// around a hinge. The static checks are compared with where Chromium puts the control and the bands: the control's
// rectangle reaches into a band exactly where the static rule reports it. Firefox and WebKit have no such override.
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/veriss/src/html.mjs';

const chromiumOnly = () => test.skip(test.info().project.name !== 'chromium', 'safe-area and display-feature overrides are Chromium DevTools Protocol only');
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const css = x => `*{box-sizing:border-box;margin:0}html,body,.page{${g}}.page{background:#fff;color:#000}.t{height:20px}.x{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;width:24px;height:24px;background:#246;position:fixed;${x}}`;
const body = '<main class="page"><p class="t">text</p></main><button class="x" aria-label="Close"></button>';
const cover = '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">';

test('safe-area-target matches where the control sits against Chromium\'s safe-area insets', async ({page}) => {
  chromiumOnly();
  const client = await page.context().newCDPSession(page);
  const cases = [
    [{width: 393, height: 852}, {top: 59, right: 0, bottom: 34, left: 0}, 'top:8px;right:8px'], [{width: 393, height: 852}, {top: 59, right: 0, bottom: 34, left: 0}, 'top:60px;right:8px'],
    [{width: 393, height: 852}, {top: 59, right: 0, bottom: 34, left: 0}, 'bottom:8px;left:8px'], [{width: 393, height: 852}, {top: 59, right: 0, bottom: 34, left: 0}, 'top:calc(env(safe-area-inset-top) + 4px);right:8px'],
    [{width: 852, height: 393}, {top: 0, right: 59, bottom: 21, left: 59}, 'top:100px;right:8px'], [{width: 852, height: 393}, {top: 0, right: 59, bottom: 21, left: 59}, 'top:100px;right:calc(env(safe-area-inset-right) + 4px)'],
  ];
  for (const [vp, insets, x] of cases) {
    const report = analyzeHTML(`<html lang="en"><head>${cover}</head><body>${body}</body></html>`, {name: 'P', css: css(x), viewport: {min: vp.width, max: vp.width, height: {min: vp.height, max: vp.height}}, accessibility: true, safeArea: insets, boxes: {'.t': {minInlineSize: 1, intrinsicBlockSize: 20}}});
    expect(report.status === 'unknown', JSON.stringify(report.diagnostics.filter(d => d.severity === 'unknown'))).toBe(false);
    const statics = [...new Set(report.accessibility.warnings.filter(d => d.code === 'W_A11Y_SAFE_AREA_TARGET').map(d => d.side))].sort();
    await page.setViewportSize(vp);
    await client.send('Emulation.setSafeAreaInsetsOverride', {insets});
    await page.setContent(`<!doctype html><html lang="en"><head>${cover}<style>${css(x)}</style></head><body>${body}</body></html>`);
    const browser = await page.evaluate(i => { const r = document.querySelector('.x').getBoundingClientRect(); const out = []; if (r.top < i.top) out.push('top'); if (r.bottom > innerHeight - i.bottom) out.push('bottom'); if (r.left < i.left) out.push('left'); if (r.right > innerWidth - i.right) out.push('right'); return out.sort(); }, insets);
    expect(statics, `${JSON.stringify(insets)} ${x}`).toEqual(browser);
  }
});

test('hinge-target matches the viewport segments of Chromium\'s display feature', async ({page}) => {
  chromiumOnly();
  const client = await page.context().newCDPSession(page);
  await page.setViewportSize({width: 1114, height: 720});
  await client.send('Emulation.setDeviceMetricsOverride', {width: 1114, height: 720, deviceScaleFactor: 2.5, mobile: true, displayFeature: {orientation: 'vertical', offset: 540, maskLength: 34}});
  for (const x of ['top:100px;left:545px', 'top:100px;left:520px', 'top:100px;left:100px', 'top:100px;left:600px', 'top:100px;left:calc(50% - 12px)']) {
    const report = analyzeHTML(`<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${body}</body></html>`, {name: 'P', css: css(x), viewport: {min: 1114, max: 1114, height: {min: 720, max: 720}}, accessibility: true, hinge: {left: 540, top: 0, width: 34, height: 720}, boxes: {'.t': {minInlineSize: 1, intrinsicBlockSize: 20}}});
    const statics = report.accessibility.warnings.some(d => d.code === 'W_A11Y_HINGE_TARGET');
    await page.setContent(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css(x)}</style></head><body>${body}</body></html>`);
    const browser = await page.evaluate(() => { const [a, b] = window.viewport.segments; const r = document.querySelector('.x').getBoundingClientRect(); return r.right > a.x + a.width && r.left < b.x; });
    expect(statics, x).toBe(browser);
  }
});
