// Checklist I25 (issue #58): px inline margins, negative too, on block-level boxes in block flow. Every box is where the
// browser puts it (rectangles compared exactly), at two widths; inside a scroll container, where positions are withheld,
// the sizes are compared. The controls that must stay Unknown are checked to stay Unknown.
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/veriss/src/html.mjs';

const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const html = '<main class="p"><section class="box"><div class="a"><div class="b"></div></div><div class="c"></div></section></main>';
const base = `*{box-sizing:border-box;margin:0}html,body,.p{${g}}.box{display:block;padding:0 24px;border:3px solid #000}.b,.c{height:10px}`;
const boxes = ['.box', '.a', '.b', '.c'];
const n = t => { const [a, b = '1'] = String(t ?? '0').split('/'); return Number(a) / Number(b); };
const analyze = (css, width, dir = 'ltr') => analyzeHTML(`<html lang="en" dir="${dir}"><body>${html}</body></html>`, {name: 'P', css: base + css, viewport: {min: width, max: width, height: {min: 600, max: 600}}, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]});
const unknownReasons = r => JSON.stringify(r.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message));
const load = async (page, css, width, dir = 'ltr') => {
  await page.setViewportSize({width, height: 600});
  await page.setContent(`<!doctype html><html lang="en" dir="${dir}"><head><style>${base}${css}</style></head><body>${html}</body></html>`);
  return page.evaluate(boxes => Object.fromEntries(boxes.map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [s, [r.left, r.top, r.width, r.height]]; })), boxes);
};

// [css, direction]
const placed = [
  ['.a{margin:0 24px}', 'ltr'], ['.a{margin:0 -24px}', 'ltr'], ['.a{margin-left:-24px}', 'ltr'], ['.a{margin-right:-30px}', 'ltr'],
  ['.a{margin-left:-24.5px;margin-right:0.25px}', 'ltr'], ['.a{margin:0 -500px}', 'ltr'],
  // An explicit width is over-constrained: margin-right is ignored in ltr (and margin-left in rtl, equal margins only).
  ['.a{width:200px;margin:0 -24px}', 'ltr'], ['.a{width:500px;margin-left:10px;margin-right:-50px}', 'ltr'], ['.a{width:50%;margin-left:-24px}', 'ltr'],
  ['.a{max-width:300px;margin:0 -24px}', 'ltr'], ['.a{margin:0 -24px;padding:0 5px;border:2px solid;box-sizing:content-box}', 'ltr'],
  // Nested: each level is pulled out of its parent's content box.
  ['.a{margin:0 -24px}.b{margin:0 -10px}', 'ltr'], ['.a{margin:0 -27px}.b{margin-left:-5px;width:100px}', 'ltr'],
  // Intrinsic width keywords on the pulled-out box: fit-content takes the space the margins give.
  ['.a{width:fit-content;margin:0 -24px}.b{width:600px}', 'ltr'], ['.a{width:fit-content;margin-left:-24px}.b{width:100px}', 'ltr'], ['.a{width:max-content;margin-left:-24px}.b{width:100px}', 'ltr'],
  // Grid and flex containers are block-level boxes too.
  ['.a{display:grid;grid-template-columns:minmax(0,1fr);margin:0 -24px}', 'ltr'], ['.a{display:flex;flex-direction:column;margin-left:-24px}', 'ltr'],
  ['.a{margin:0 -24px}', 'rtl'], ['.a{width:200px;margin:0 -24px}', 'rtl'],
];

test('negative and positive px inline margins in block flow: every box is where the browser puts it', async ({page}) => {
  let compared = 0;
  for (const width of [320, 500]) for (const [css, dir] of placed) {
    const r = analyze(css, width, dir);
    expect(r.status === 'unknown', `${dir} ${css}: ${unknownReasons(r)}`).toBe(false);
    const browser = await load(page, css, width, dir);
    for (const box of boxes) {
      const s = r.sizes.find(s => s.box === box)?.rect;
      expect(s, `${dir} ${css} ${box} has a rectangle`).toBeTruthy();
      const v = x => n(x.constant) + width * n(x.coefficient) + 600 * n(x.heightCoefficient);
      expect([v(s.inlineStart), v(s.blockStart), v(s.inlineSize), v(s.blockSize)], `${width} ${dir} ${css} ${box}`).toEqual(browser[box]);
      compared++;
    }
  }
  expect(compared).toBe(2 * placed.length * boxes.length);
});

// Inside a scroll container positions are withheld; the sizes are proved and compared.
test('negative inline margins inside a scroll container: the sizes are the browser\'s', async ({page}) => {
  const cases = ['.box{overflow:auto}.a{margin:0 -40px}', '.box{overflow:auto}.a{margin:0 -24px}.b{margin:0 -10px}', '.box{overflow:hidden}.a{margin-right:-60px}', '.box{overflow:auto}.a{width:200px;margin:0 -24px}'];
  for (const width of [320, 500]) for (const css of cases) {
    const r = analyze(css, width);
    expect(r.status === 'unknown', `${css}: ${unknownReasons(r)}`).toBe(false);
    const browser = await load(page, css, width);
    for (const box of ['.a', '.b', '.c']) {
      const s = r.sizes.find(s => s.box === box);
      const v = x => n(x.constant) + width * n(x.coefficient);
      expect([v(s.inlineSize), v(s.blockSize)], `${width} ${css} ${box}`).toEqual(browser[box].slice(2));
    }
  }
});

// Overflow is tracked as for any box: pulled into the padding is fine, into the border or past it protrudes, past the
// viewport's right edge scrolls the page (and the browser agrees that it does).
test('a negative margin past the padding is reported by the integrity rules', async ({page}) => {
  const check = (css, width) => analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: base + css, viewport: {min: width, max: width, height: {min: 600, max: 600}}, integrity: {}});
  for (const [css, codes, scrolls] of [['.a{margin:0 -24px}', [], false], ['.a{margin:0 -27px}', ['E_LAYOUT_PROTRUSION'], false], ['.a{margin:0 -40px}', ['E_LAYOUT_PAGE_OVERFLOW', 'E_LAYOUT_PROTRUSION'], true], ['.a{margin-left:-40px}', ['E_LAYOUT_PROTRUSION'], false]]) {
    const r = check(css, 500);
    expect(r.status === 'unknown', `${css}: ${unknownReasons(r)}`).toBe(false);
    expect([...new Set(r.diagnostics.filter(d => d.severity === 'error').map(d => d.code))].sort(), css).toEqual(codes);
    await load(page, css, 500);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), css).toBe(scrolls);
  }
});

// Controls: what is not modeled stays Unknown (a percentage margin, which Firefox rounds differently from Chromium and
// WebKit; rtl with unequal margins; a negative margin beside an auto one; a negative margin on a flex item's cross axis; an inline-level box, which shrinks to fit).
test('percentage, rtl unequal, beside auto: stay Unknown', async ({page}) => {
  for (const [css, dir] of [['.a{margin:0 -5%}', 'ltr'], ['.a{margin-left:-24px}', 'rtl'], ['.a{margin-left:-10px;margin-right:10px}', 'rtl'], ['.a{width:200px;margin-left:auto;margin-right:-24px}', 'ltr'],
    ['.box{display:flex;flex-direction:column}.a{margin:0 -24px}', 'ltr'], ['.a{display:inline-block;margin-left:-24px}', 'ltr']]) {
    const r = analyze(css, 500, dir);
    expect(r.status, `${dir} ${css}`).toBe('unknown');
  }
  // The percentage control differs between browsers (the reason it is not modeled): Firefox's width is not Chromium's.
  const widths = await load(page, '.a{margin:0 -5%}', 400);
  expect(widths['.a'][2]).toBeGreaterThan(380);
});
