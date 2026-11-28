// UA profiles (the ua layout option): unstyled form controls laid out with the profile of the browser and platform the
// test runs on match that browser's rectangles. The same page differs between Chromium, Firefox and WebKit (padding,
// borders, margins), and WebKit's differs between Linux and macOS; each platform profile carries its own values
// (packages/veriss/src/layout/ua-profile.mjs), and the platform-agnostic one (ua: 'webkit') is Unknown where they differ.
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/veriss/src/html.mjs';
import {uaProfiles, uaPlatforms} from '../packages/veriss/src/layout/ua-profile.mjs';

// The profile of the platform this runs on: webkit-macos on macOS, webkit-linux on Linux (chromium has one profile).
const platform = {darwin: 'macos', linux: 'linux'}[process.platform];
const platformUA = engine => uaProfiles[`${engine}-${platform}`] ? `${engine}-${platform}` : engine;

const reset = '*{margin:0}html,body{margin:0;display:grid;grid-template-columns:minmax(0,1fr)}';
// Controls with only a size: their UA padding, border and margins decide where they and the boxes after them go.
const cases = [
  ['text input (content-box)', '<main class="g"><input class="f" type="text"><div class="after"></div></main>', '.f{display:block;inline-size:100px;block-size:20px}'],
  ['textarea (content-box)', '<main class="g"><textarea class="f"></textarea><div class="after"></div></main>', '.f{display:block;inline-size:100px;block-size:40px;resize:none}'],
  ['button (content-box)', '<main class="g"><button class="f" type="button" aria-label="Go"></button><div class="after"></div></main>', '.f{display:block;box-sizing:content-box;inline-size:120px;block-size:24px}'],
  // (appearance: none keeps the UA margins: only they decide where the box after it goes.)
  ['checkbox margins', '<main class="g"><input class="f" type="checkbox" aria-label="A"><div class="after"></div></main>', '.f{appearance:none;display:block;box-sizing:border-box;inline-size:13px;block-size:13px;min-inline-size:0;min-block-size:0;padding:0;border:1px solid #000}'],
  ['radio margins', '<main class="g"><input class="f" type="radio" aria-label="A"><div class="after"></div></main>', '.f{appearance:none;display:block;box-sizing:border-box;inline-size:13px;block-size:13px;min-inline-size:0;min-block-size:0;padding:0;border:1px solid #000}'],
];
const common = '.g{display:grid;grid-template-columns:minmax(0,1fr);justify-items:start;align-content:start}.after{inline-size:40px;block-size:10px}';
const value = a => Number(String(a.constant).split('/').reduce((x, y) => x / y)) + (a.coefficient ? Number(String(a.coefficient).split('/').reduce((x, y) => x / y)) : 0);

for (const [name, html, css] of cases) {
  test(`${name}: the browser's UA profile for this platform places the control and the box after it as the browser does`, async ({page}, testInfo) => {
    test.skip(!platform, `no measured UA profile for ${process.platform}`);
    const ua = platformUA(testInfo.project.name);
    const sheet = reset + common + css;
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: sheet, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, ua});
    expect(report.status === 'unknown', `${ua}: ${JSON.stringify(report.diagnostics.map(d => d.message))}`).toBe(false);
    await page.setViewportSize({width: 400, height: 300});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${sheet}</style></head><body>${html}</body></html>`);
    for (const sel of ['.f', '.after']) {
      const browser = await page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }, sel);
      const row = report.sizes.find(r => r.box.startsWith(sel) && r.rect);
      expect(row, `${ua} ${sel}: no rectangle`).toBeTruthy();
      const model = [row.rect.inlineStart, row.rect.blockStart, row.rect.inlineSize, row.rect.blockSize].map(value);
      model.forEach((v, i) => expect(Math.abs(v - browser[i]), `${ua} ${name} ${sel} [x, y, w, h][${i}]: model ${v}, browser ${browser[i]}`).toBeLessThanOrEqual(1 / 64 + 1e-6));
    }
  });
}

// The platform-agnostic profile (plain webkit, firefox) never verifies a geometry one of its platforms contradicts:
// where the platforms' analyses place a box differently it is Unknown, and where it decides, it agrees with both and
// with this browser.
for (const [name, html, css] of cases) {
  test(`${name}: the platform-agnostic profile is Unknown where the platforms differ, and agrees with both where it decides`, async ({page}, testInfo) => {
    const engine = testInfo.project.name, sheet = reset + common + css;
    const rects = ua => { const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: sheet, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, ua});
      return {status: report.status, boxes: ['.f', '.after'].map(sel => { const row = report.sizes.find(r => r.box.startsWith(sel) && r.rect); return row && [row.rect.inlineStart, row.rect.blockStart, row.rect.inlineSize, row.rect.blockSize].map(value); })}; };
    const any = rects(engine), platforms = uaPlatforms[engine].map(rects);
    const agree = platforms.every(p => p.status !== 'unknown' && JSON.stringify(p.boxes) === JSON.stringify(platforms[0].boxes));
    if (!agree) expect(any.status, `${engine} ${name}: the platforms differ (${JSON.stringify(platforms.map(p => p.boxes))}), so ${engine} must not decide`).toBe('unknown');
    if (any.status === 'unknown') return;
    for (const p of platforms) expect(any.boxes, `${engine} ${name}: agrees with every platform`).toEqual(p.boxes);
    await page.setViewportSize({width: 400, height: 300});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${sheet}</style></head><body>${html}</body></html>`);
    for (const [k, sel] of ['.f', '.after'].entries()) {
      const browser = await page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }, sel);
      any.boxes[k].forEach((v, i) => expect(Math.abs(v - browser[i]), `${engine} ${name} ${sel} [x, y, w, h][${i}]: model ${v}, browser ${browser[i]}`).toBeLessThanOrEqual(1 / 64 + 1e-6));
    }
  });
}

test('without the ua option, a field\'s UA padding and border stay unknown (the historical default)', async () => {
  const report = analyzeHTML('<html lang="en"><body><main class="g"><input class="f" type="text"></main></body></html>', {name: 'P', css: reset + common + cases[0][2], viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
  expect(report.status).toBe('unknown');
});

// The suggested reset: with it applied, the target profile (chromium) describes every browser — the unstyled
// controls land where the chromium model puts them, in Firefox and WebKit too.
import {suggestReset} from '../packages/veriss/src/layout/ua-reset.mjs';
const resetCSS = suggestReset().css;
for (const [name, html, css] of cases) {
  test(`${name}: with the suggested reset, the chromium profile places it in every browser`, async ({page}, testInfo) => {
    const sheet = reset + resetCSS + common + css;
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: sheet, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, ua: 'chromium'});
    expect(report.status === 'unknown', JSON.stringify(report.diagnostics.map(d => d.message))).toBe(false);
    await page.setViewportSize({width: 400, height: 300});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${sheet}</style></head><body>${html}</body></html>`);
    for (const sel of ['.f', '.after']) {
      const browser = await page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }, sel);
      const row = report.sizes.find(r => r.box.startsWith(sel) && r.rect);
      const model = [row.rect.inlineStart, row.rect.blockStart, row.rect.inlineSize, row.rect.blockSize].map(value);
      model.forEach((v, i) => expect(Math.abs(v - browser[i]), `${testInfo.project.name} ${name} ${sel} [x, y, w, h][${i}]: model ${v}, browser ${browser[i]}`).toBeLessThanOrEqual(1 / 64 + 1e-6));
    }
  });
}

// A label in a 100px button: its UA padding (Chromium and WebKit 6px, Firefox 4px) decides whether "Publish now"
// (86.7px in Roboto 16px) fits. The verdict with this browser's profile agrees with this browser.
test('a button label that fits one browser\'s padding only: the verdict with its profile agrees with the browser', async ({page}, testInfo) => {
  const {readFileSync} = await import('node:fs');
  const {loadTextMetrics} = await import('../packages/veriss/src/text-node.mjs');
  const file = new URL('../packages/veriss/text-metrics/fixtures/roboto-variable.ttf', import.meta.url).pathname;
  const metrics = await loadTextMetrics({fonts: {Roboto: {file}}});
  const face = `@font-face{font-family:Roboto;src:url(data:font/ttf;base64,${readFileSync(file).toString('base64')})}`;
  test.skip(!platform, `no measured UA profile for ${process.platform}`);
  const ua = platformUA(testInfo.project.name);
  const html = '<main class="g"><button class="b" type="button">Publish now</button></main>';
  const sheet = reset + '.g{display:grid;grid-template-columns:100px}.b{display:block;white-space:nowrap;font-family:Roboto;font-size:16px;line-height:24px}';
  const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, metrics.resolveOptions({name: 'P', css: sheet, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, ua, boxes: {'.b': {text: {font: {family: 'Roboto', size: 16, lineHeight: 24, weight: 400}, content: 'Publish now'}, wrap: 'nowrap'}}}));
  const flagged = report.diagnostics.some(d => d.code === 'E_LAYOUT_CONTENT');
  await page.setViewportSize({width: 400, height: 300});
  await page.setContent(`<!doctype html><html lang="en"><head><style>${face}${sheet}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  const overflows = await page.evaluate(() => { const b = document.querySelector('.b'), r = document.createRange(); r.selectNodeContents(b); const t = r.getBoundingClientRect(), c = getComputedStyle(b), box = b.getBoundingClientRect(); return t.left < box.left + parseFloat(c.paddingLeft) + parseFloat(c.borderLeftWidth) - 0.01 || t.right > box.right - parseFloat(c.paddingRight) - parseFloat(c.borderRightWidth) + 0.01; });
  expect(flagged, `${ua}: the label overflows in the browser: ${overflows}`).toBe(overflows);
  expect(flagged).toBe(!ua.startsWith('firefox'));
});
