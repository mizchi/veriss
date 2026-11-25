// A block container in block flow (or an aligned grid item) with an auto height, children and a px max-height: the
// model's height min(content, max-height) and the position of the box after it, compared with the browser where the
// clamp binds and where it does not (checklist I21).
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/veriss/src/html.mjs';

const base = '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.p{width:300px}.c{height:60px}.n{height:10px}';
const two = '<div class="c"></div><div class="c"></div>';
const cases = [
  ['.a{max-height:200px;padding:5px;border:2px solid}', two],
  ['.a{max-height:100px;padding:5px;border:2px solid;overflow:auto}', two],
  ['.a{box-sizing:border-box;max-height:100px;padding:5px;border:2px solid;overflow:hidden}', two],
  ['.a{max-height:100px}', two],
  ['.a{max-height:100px;min-height:150px;overflow:auto}', two],
  ['.a{max-height:100px;overflow:auto;position:relative}.ab{position:absolute;bottom:0;left:0;width:10px;height:10px}', two + '<div class="ab"></div>'],
  ['.p{display:grid;grid-template-columns:1fr 1fr;align-items:start}.a{max-height:100px;overflow:auto}', two],
  ['.p{display:grid;grid-template-columns:1fr;align-items:start}.a{max-height:200px;overflow:auto}', two],
];

test('a px max-height on a block container with an auto height: the clamped height and the box after it, where the browser puts them', async ({page}) => {
  const num = v => { const [n, d = '1'] = String(v).split('/'); return Number(n) / Number(d); };
  const at = (a, w) => num(a.constant) + w * num(a.coefficient);
  for (const [css, inner] of cases) {
    const html = `<div class="p"><div class="a">${inner}</div><div class="n"></div></div>`;
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: base + css, viewport: {min: 320, max: 800, height: {min: 400, max: 800}}, block: true, scrollIntent: 'css', scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]});
    expect(report.diagnostics.filter(d => d.severity === 'unknown'), css).toEqual([]);
    for (const width of [360, 700]) {
      await page.setViewportSize({width, height: 600});
      await page.setContent(`<!doctype html><html lang="en"><head><style>${base}${css}</style></head><body>${html}</body></html>`);
      const browser = await page.evaluate(() => { const a = document.querySelector('.a').getBoundingClientRect(), n = document.querySelector('.n').getBoundingClientRect(); return [a.height, n.y, n.height]; });
      // The rectangle of the region the width falls in (regions meet at a boundary, where they agree).
      const inRegion = x => { const ws = x.region.vertices.map(v => num(v.width)); return Math.min(...ws) <= width && width <= Math.max(...ws); };
      // (A scroll container's rectangle is not reported: its height is.)
      const a = report.sizes.find(s => s.box === '.a' && inRegion(s)), n = report.sizes.find(s => s.box === '.n' && s.rect && inRegion(s));
      const model = [at(a.blockSize, width), at(n.rect.blockStart, width), at(n.rect.blockSize, width)];
      expect(model, `${css} at ${width}`).toEqual(browser);
    }
  }
});
