// word-break: break-all: text measured with the font files the browser loads, its line count at each width compared
// with the browser's (the break opportunities are Chromium's measured pairs, tools/measure-break-all.mjs). Firefox and
// WebKit break elsewhere under break-all (WebKit before most punctuation too; docs/css-baseline.md).
import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {loadTextMetrics} from '../packages/veriss/src/text-node.mjs';
import {applyBrowserBaseline} from './support/browser-baseline.mjs';
test.beforeEach(({}, testInfo) => applyBrowserBaseline(testInfo));

const fixture = name => new URL(`../packages/veriss/text-metrics/fixtures/${name}`, import.meta.url).pathname;
const fonts = {Roboto: {file: fixture('roboto-variable.ttf')}, NotoJP: {file: fixture('japanese-variable.ttf')}};
const cases = [
  {family: 'Roboto', lang: 'en', text: 'Notification preferences for account 2024'},
  {family: 'Roboto', lang: 'en', text: 'Hello world, office AV To WMW'},
  {family: 'NotoJP', lang: 'ja', text: '日本語の新しい番号を確認します。英語ABC 123'},
  {family: 'NotoJP', lang: 'ja', text: '検査の時間は年末までです'},
];

test('word-break: break-all text takes at least as many lines as Chromium gives it, and the same at most widths', async ({page}) => {
  const metrics = await loadTextMetrics({fonts});
  for (const [route, family] of [['**/roboto.ttf', 'Roboto'], ['**/noto.ttf', 'NotoJP']]) await page.route(route, r => r.fulfill({body: readFileSync(fonts[family].file), contentType: 'font/ttf'}));
  let compared = 0, exact = 0, fewer = 0;
  for (const {family, lang, text} of cases) {
    const font = {family, size: 16, lineHeight: 24, weight: 400};
    const all = metrics.resolveBoxes({x: {text: {font, content: text, lang, wordBreak: 'break-all'}, wrap: 'normal'}}).x;
    const normal = metrics.resolveBoxes({x: {text: {font, content: text, lang}, wrap: 'normal'}}).x;
    const lines = (contract, w) => { const step = contract.intrinsicBlockSize.filter(s => s.atLeastInlineSize <= w).at(-1); return step?.blockSize == null ? null : step.blockSize / 24; };
    const widths = Array.from({length: 40}, (_, i) => Math.ceil(all.minInlineSize) + i * 7);
    const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>@font-face{font-family:Roboto;src:url(/roboto.ttf);font-display:block}@font-face{font-family:NotoJP;src:url(/noto.ttf);font-display:block}
      body{margin:0}p{margin:0 0 8px;font:400 16px/24px ${family};word-break:break-all}</style></head><body>${widths.map(w => `<p style="width:${w}px">${text}</p>`).join('')}</body></html>`;
    // Served from an origin (the fonts are routed next to it), as the other font e2e do.
    await page.route('http://break-all.test/', route => route.fulfill({contentType: 'text/html; charset=utf-8', body: html}));
    await page.goto('http://break-all.test/');
    await page.unroute('http://break-all.test/');
    // Load the faces before measuring (fonts.ready may settle before a face starts loading).
    await page.evaluate(() => Promise.all([...document.fonts].map(face => face.load())));
    const heights = await page.evaluate(() => [...document.querySelectorAll('p')].map(p => p.getBoundingClientRect().height));
    widths.forEach((w, i) => {
      const modeled = lines(all, w);
      if (modeled === null) return;
      // The modeled bound is wider than the advance (rounding allowance): at a boundary it may give one more line, never
      // fewer.
      expect(modeled, `${text} at ${w}px`).toBeGreaterThanOrEqual(heights[i] / 24);
      compared++;
      if (modeled === heights[i] / 24) exact++;
      if (lines(normal, w) !== null && modeled < lines(normal, w)) fewer++;
    });
  }
  // Not vacuous: widths were compared, and break-all gives fewer lines than normal at some of them.
  expect(compared).toBeGreaterThan(100);
  expect(exact / compared, `${exact} of ${compared} widths exact`).toBeGreaterThan(0.9);
  expect(fewer).toBeGreaterThan(0);
});
