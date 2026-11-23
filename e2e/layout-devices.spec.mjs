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
    [{width: 393, height: 852}, {top: 59, right: 0, bottom: 34, left: 40}, 'top:8px;left:8px'],
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

// target-offscreen: a fixed control outside the viewport (no scroll brings it in). In each browser: the control's
// rectangle against the viewport — entirely outside, partly outside, or inside — at two heights, and the skip link that
// slides in on focus (not reported).
test('target-offscreen matches where each browser puts a fixed control', async ({page}) => {
  const verdict = r => { const codes = [...r.diagnostics, ...r.accessibility.warnings].map(d => d.code); return codes.includes('E_A11Y_TARGET_OFFSCREEN') ? 'outside' : codes.includes('W_A11Y_TARGET_PARTLY_OFFSCREEN') ? 'partly' : 'inside'; };
  const cases = ['top:-7px;right:8px', 'top:-30px;right:8px', 'top:8px;right:-10px', 'top:8px;left:400px', 'top:8px;right:8px', 'bottom:-20px;left:8px', 'top:calc(100% - 12px);left:8px', 'top:50%;left:calc(100% - 30px)', 'top:-40px;left:8px'];
  let compared = 0;
  for (const x of cases) for (const h of [600, 852]) {
    const extra = x === 'top:-40px;left:8px' ? '.x:focus{top:8px}' : '';
    const report = analyzeHTML(`<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${body}</body></html>`, {name: 'P', css: css(x) + extra, viewport: {min: 393, max: 393, height: {min: h, max: h}}, accessibility: true, boxes: {'.t': {minInlineSize: 1, intrinsicBlockSize: 20}}});
    expect(report.status === 'unknown', `${x}: ${JSON.stringify(report.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message))}`).toBe(false);
    await page.setViewportSize({width: 393, height: h});
    await page.setContent(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css(x)}${extra}</style></head><body>${body}</body></html>`);
    const browser = await page.evaluate(() => { const r = document.querySelector('.x').getBoundingClientRect(), W = innerWidth, H = innerHeight; if (r.right <= 0 || r.left >= W || r.bottom <= 0 || r.top >= H) return 'outside'; return r.top < 0 || r.left < 0 || r.right > W || r.bottom > H ? 'partly' : 'inside'; });
    // The focus-revealed skip link is outside until focused, and not reported by design.
    expect(verdict(report), `${x} at height ${h}`).toBe(extra ? 'inside' : browser);
    if (extra) expect(browser, 'the skip link starts outside').toBe('outside');
    compared++;
  }
  expect(compared).toBe(cases.length * 2);
});

// A control (or its wrapper) fixed above the top edge on one side of a breakpoint only, and in the flow 2000px down the
// page on the other. Each browser at both widths: outside the viewport at the top and the bottom of the scroll (fixed)
// or scrolled into view (in the flow); the static check reports E_A11Y_TARGET_OFFSCREEN only at the widths where it is
// fixed.
test('target-offscreen follows a breakpoint that makes the control fixed in each browser', async ({page}) => {
  const flow = `*{box-sizing:border-box;margin:0}html,body,.page{${g}}.page{background:#fff;color:#000;padding-top:2000px}.t{height:20px}.x{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;width:24px;height:24px;background:#246}`;
  const self = '<button class="x" aria-label="Close"></button>', wrapped = `<div class="w">${self}</div>`;
  const cases = [[self, '@media (max-width:499px){.x{position:fixed;top:-30px;left:8px}}'], [self, '@media (min-width:500px){.x{position:fixed;top:-30px;left:8px}}'],
    [wrapped, '@media (max-width:499px){.w{position:fixed;top:-30px;left:8px;width:40px}}'], [wrapped, '@media (min-width:500px){.w{position:fixed;top:-30px;left:8px;width:40px}}']];
  const verdicts = new Set();
  for (const [html, rule] of cases) {
    const doc = `<main class="page"><p class="t">text</p>${html}</main>`;
    const report = analyzeHTML(`<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${doc}</body></html>`, {name: 'P', css: flow + rule, viewport: {min: 300, max: 800, height: {min: 600, max: 600}}, accessibility: true, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}], boxes: {'.t': {minInlineSize: 1, intrinsicBlockSize: 20}}});
    const found = report.diagnostics.filter(d => d.code === 'E_A11Y_TARGET_OFFSCREEN');
    for (const width of [400, 600]) {
      await page.setViewportSize({width, height: 600});
      await page.setContent(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{scrollbar-width:none}${flow}${rule}</style></head><body>${doc}</body></html>`);
      const browser = await page.evaluate(() => [0, document.documentElement.scrollHeight].every(y => { scrollTo(0, y); const r = document.querySelector('.x').getBoundingClientRect(); return r.right <= 0 || r.left >= innerWidth || r.bottom <= 0 || r.top >= innerHeight; }));
      const statics = found.some(d => d.range.min <= width && width <= d.range.max);
      expect(statics, `${rule} at ${width}px`).toBe(browser);
      verdicts.add(browser);
    }
  }
  expect([...verdicts].sort()).toEqual([false, true]);
});
