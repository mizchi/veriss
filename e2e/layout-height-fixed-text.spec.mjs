// W_LAYOUT_HEIGHT_FIXED_TEXT where nothing can be seen to overflow: text inside a collapsed panel (a 0px padding box
// hiding its block overflow) shows nothing at a 32px default font size, and a block svg icon box does not overflow; real
// text in a px-high box does (packages/veriss/test/height-fixed-text-collapsed.test.mjs). (An inline svg in such a box
// does move with the font size: it sits on the strut's baseline. veriss lays an inline svg out as a block, so a literal
// one is not warned; a dynamic '…' child is, see the unit test.)
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/veriss/src/html.mjs';

const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const cases = [
  ['<div class="panel"><p class="t">Details text</p></div>', '.panel{display:block;height:0;overflow:hidden}.t{display:block;height:24px}', false],
  ['<div class="panel"><p class="t">Details text</p></div>', '.panel{display:block;height:0;overflow-y:clip}.t{display:block;height:24px}', false],
  ['<div class="panel t">Details text</div>', '.panel{display:block;height:0px;overflow-y:hidden}', false],
  ['<div class="panel"><p class="t">Details text</p></div>', '.panel{display:block;height:0;padding:8px 0;overflow:hidden}.t{display:block;height:24px}', true],
  ['<div class="panel"><p class="t">Details text</p></div>', '.panel{display:block;height:0}.t{display:block;height:24px}', true],
  // A block svg icon in a px-high box: nothing follows the font size.
  ['<span class="t"><svg width="12" height="12" viewBox="0 0 12 12"><path d="M0 0h12v12z"/></svg></span>', '.t{display:block;position:relative;width:12px;height:12px;overflow:hidden}svg{display:block}', false],
  ['<p class="t">Text</p>', '.t{display:block;height:24px}', true],
];

test('px height on text: the warning fires exactly where overflowing text can be seen at a 32px default font size', async ({page, browserName}) => {
  test.skip(browserName !== 'chromium', 'the default font size is set through the Chromium DevTools protocol');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.enable');
  await cdp.send('Page.setFontSizes', {fontSizes: {standard: 32}});
  for (const [html, css, warn] of cases) {
    const full = `*{box-sizing:border-box;margin:0}html,body,.page{${g}}${css}`;
    const report = analyzeHTML(`<html lang="en"><body><main class="page">${html}</main></body></html>`, {name: 'P', css: full, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
    expect((report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_HEIGHT_FIXED_TEXT'), css).toBe(warn);
    await page.setContent(`<!doctype html><html lang="en"><head><style>${full}</style></head><body><main class="page">${html}</main></body></html>`);
    // Seen to overflow: the text box overflows, and some of the overflow lies outside every clipping ancestor.
    const seen = await page.evaluate(() => {
      const t = document.querySelector('.t');
      if (t.scrollHeight <= t.clientHeight) return false;
      const r = t.getBoundingClientRect(); let top = r.top, bottom = r.top + t.scrollHeight;
      for (let a = t; a; a = a.parentElement) { const s = getComputedStyle(a); if (s.overflowY !== 'visible') { const c = a.getBoundingClientRect(), pt = parseFloat(s.borderTopWidth); top = Math.max(top, c.top + pt); bottom = Math.min(bottom, c.top + pt + a.clientHeight); } }
      return bottom - top > 0;
    });
    expect(seen, `${css}: overflowing text visible at a 32px default`).toBe(warn);
  }
});
