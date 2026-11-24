// An iframe left display: inline as the only content of a block: the block's height and the frame's position agree with
// the browser where the verifier decides them (packages/veriss/test/inline-replaced-line.test.mjs). On the baseline with
// the block font's ascent and descent declared (Roboto 16px: 15 and 4, as /text derives them): Chromium only; font-size: 0
// and vertical-align: top in all three engines.
import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {analyzeHTML} from '../packages/veriss/src/html.mjs';

const fonts = new URL('../packages/veriss/text-metrics/fixtures/', import.meta.url);
const face = `@font-face{font-family:"Roboto";src:url(data:font/ttf;base64,${readFileSync(new URL('roboto-variable.ttf', fonts)).toString('base64')})}`;
const body = (h, ws) => `<main><div class="slot">${ws ? '\n  ' : ''}<iframe title="ad" src="about:blank" width="300" height="${h}" frameborder="0"></iframe>${ws ? '\n' : ''}</div><p class="after">x</p></main>`;
const cases = [
  ...[10, 16, 20, 21, 30].flatMap(lh => [250, 12].map(h => ({slot: `font-family:Roboto;font-size:16px;line-height:${lh}px`, h, font: lh, chromiumOnly: true}))),
  {slot: 'font-family:Roboto;font-size:16px;line-height:1.5', h: 250, font: 24, chromiumOnly: true},
  ...[250, 12].map(h => ({slot: 'font-size:0', h})),
  {slot: 'font-size:0;text-align:center', h: 250, ws: true},
  {slot: 'font-size:16px;line-height:24px', h: 250, css: 'iframe{vertical-align:top}'},
  {slot: 'font-size:16px;line-height:24px', h: 250, css: 'iframe{vertical-align:bottom}', ws: true},
];

test('an inline iframe alone in its block: same block height and frame position as the browser', async ({page, browserName}) => {
  for (const c of cases) {
    if (c.chromiumOnly && browserName !== 'chromium') continue;
    const css = `body,p{margin:0}.slot{${c.slot}}${c.css ?? ''}`;
    await page.setViewportSize({width: 400, height: 600});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${face}${css}</style></head><body>${body(c.h, c.ws)}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const b = await page.evaluate(() => { const f = document.querySelector('iframe').getBoundingClientRect(); return [f.x, f.y, document.querySelector('.slot').getBoundingClientRect().height]; });
    const report = analyzeHTML(`<html lang="en"><body>${body(c.h, c.ws)}</body></html>`, {name: 'P', css, ua: browserName, viewport: {min: 400, max: 400, height: {min: 600, max: 600}}, scrollbars: [{name: 'o', inlineSize: 0, blockSize: 0}],
      boxes: {'.after': {minInlineSize: 10, maxInlineSize: 10, intrinsicBlockSize: 20}, ...(c.font ? {'.slot': {font: {family: 'Roboto', size: 16, lineHeight: c.font, weight: 400, ascent: 15, descent: 4}}} : {})}});
    const v = x => Number(eval(x.constant)) + 400 * Number(eval(x.coefficient));
    const f = report.sizes.find(s => s.box.startsWith('iframe'))?.rect, slot = report.sizes.find(s => s.box === '.slot');
    expect(f, `${c.slot}: ${JSON.stringify(report.diagnostics.map(d => d.message))}`).toBeTruthy();
    expect([v(f.inlineStart), v(f.blockStart), v(slot.blockSize)], `${c.slot} ${c.css ?? ''} ${c.h}`).toEqual(b);
  }
});
