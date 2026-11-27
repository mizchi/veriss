// A position: fixed box inside an ancestor that hides, clips or scrolls its overflow (but is not its containing block)
// escapes that ancestor: the browser places it against the viewport, draws it outside the ancestor and hit-tests it
// there. The verifier places it at the same rectangle (packages/veriss/test/fixed-overflow-escape.test.mjs).
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/veriss/src/html.mjs';

const html = '<main><p class="t">Text</p></main><div class="holder"><div class="layer"><div class="btn"></div></div></div>';
const variants = [['overflow:hidden', ''], ['overflow:auto', ''], ['overflow:clip', ''], ['', 'overflow:hidden;height:10px']];
const css = (layer, holder) => `*{box-sizing:border-box;margin:0}body{display:block;color:#000;background:#fff}.holder{${holder}}.layer{position:fixed;top:0;left:0;width:100px;height:100px;background:#ccc;${layer}}.btn{position:fixed;top:0;right:0;width:42px;height:42px;background:#c00}`;

for (const [layer, holder] of variants) test(`a fixed box escapes ${layer || holder}: same rectangle and hit target as the browser`, async ({page}) => {
  for (const width of [320, 400, 800]) {
    await page.setViewportSize({width, height: 600});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css(layer, holder)}</style></head><body>${html}</body></html>`);
    const b = await page.evaluate(() => { const r = document.querySelector('.btn').getBoundingClientRect(); return {x: r.x, y: r.y, hit: document.elementFromPoint(r.x + 21, 21)?.className}; });
    expect(b.hit).toBe('btn');
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: css(layer, holder), viewport: {min: width, max: width, height: {min: 600, max: 600}}, accessibility: true,
      boxes: {'.t': {minInlineSize: 30, maxInlineSize: 30, intrinsicBlockSize: 20}}, scrollbars: [{name: 'o', inlineSize: 0, blockSize: 0}]});
    expect(report.status, JSON.stringify(report.diagnostics.map(d => d.message))).not.toBe('unknown');
    const r = report.sizes.find(s => s.box === '.btn').rect;
    const v = x => Number(x.constant) + width * Number(x.coefficient);
    expect([v(r.inlineStart), v(r.blockStart)]).toEqual([b.x, b.y]);
  }
});
