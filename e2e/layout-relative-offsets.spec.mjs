// Checklist D1: position: relative with px offsets. Every box (the offset one, its children, an absolute box inside it,
// its siblings) is where the browser puts it, in ltr, and in rtl for block offsets (an rtl inline offset is Unknown).
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/veriss/src/html.mjs';

const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const body = '<div class="a"><div class="k"></div><div class="x"></div></div><div class="b"></div>';
const base = `*{margin:0}html,body{${g}}.a{display:grid;grid-template-columns:minmax(0,1fr);height:40px;padding:4px;position:relative}.k{height:10px}.b{height:20px}.x{position:absolute;top:2px;left:5px;width:6px;height:6px}`;
const cases = ['.a{top:7px;left:3px}', '.a{bottom:5px;right:2px}', '.a{top:7px;bottom:100px}', '.a{left:3px;right:100px}', '.a{top:-4px;left:-9px}', '.a{top:0;left:0}', '.b{position:relative;top:12px}', '.k{position:relative;left:6px;top:1px}'];

for (const dir of ['ltr', 'rtl']) test(`relative px offsets (${dir}): every box is where the browser puts it`, async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  for (const c of cases) {
    // In rtl an inline offset stays Unknown (the children are placed mirrored); the block offsets are checked.
    if (dir === 'rtl' && /(?:left|right):(?!0[;}])/.test(c)) continue;
    const css = base + c;
    const r = analyzeHTML(`<html lang="en" dir="${dir}"><body>${body}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, accessibility: true});
    expect(r.status === 'unknown', `${c}: ${JSON.stringify(r.diagnostics.map(d => d.message))}`).toBe(false);
    const model = Object.fromEntries(r.sizes.filter(s => s.rect && /^\.(?:a|b|k|x)$/.test(s.box)).map(s => [s.box, [Number(s.rect.inlineStart.constant), Number(s.rect.blockStart.constant)]]));
    await page.setContent(`<!doctype html><html lang="en" dir="${dir}"><head><style>${css}</style></head><body>${body}</body></html>`);
    const browser = await page.evaluate(() => Object.fromEntries(['.a', '.b', '.k', '.x'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [s, [r.left, r.top]]; })));
    for (const box of Object.keys(model)) expect(model[box], `${dir} ${c} ${box}`).toEqual(browser[box]);
    expect(Object.keys(model).length, `${c}: boxes with a rectangle`).toBeGreaterThanOrEqual(3);
  }
});

// An absolute box with left and right auto sits at its static position: the padding edge of a grid containing block,
// the content edge (inline-start padding) of a block one. Positions at 320 and 400 against the browser's.
test('absolute boxes with auto inline insets sit at the static position', async ({page}) => {
  const html = '<main class="page"><div class="card"><div class="o"></div></div></main>';
  const ok = [['top:0;width:50px;height:20px', 'padding-left:10px'], ['top:0;width:50px;height:20px', 'display:block;padding-left:12px'], ['top:0;width:50px;height:20px', 'display:block;direction:rtl;padding-right:12px'],
    ['bottom:0;width:50%;height:20px', 'display:block;padding-left:12px;border:3px solid black'], ['top:0;width:50px;height:20px', 'padding-left:10px;direction:rtl'], ['top:-20px;width:26.666666666666668px;height:20px', 'display:block;padding-left:7.5px']];
  for (const width of [320, 400]) for (const [o, c] of ok) {
    const css = `*{box-sizing:border-box;margin:0}html,body,.page,.card{${g}}.card{position:relative;height:200px;${c}}.o{position:absolute;${o}}`;
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: width, max: width, height: {min: 600, max: 600}}});
    expect(r.status === 'unknown', `${c} / ${o}: ${JSON.stringify(r.diagnostics.map(d => d.message))}`).toBe(false);
    const n = t => { const [a, b = '1'] = String(t ?? '0').split('/'); return Number(a) / Number(b); };
    const s = r.sizes.find(s => s.box === '.o').rect, v = x => n(x.constant) + width * n(x.coefficient) + 600 * n(x.heightCoefficient);
    await page.setViewportSize({width, height: 600});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    const b = await page.evaluate(() => { const r = document.querySelector('.o').getBoundingClientRect(); return [r.left, r.top]; });
    expect(v(s.inlineStart), `${width} ${c} / ${o}`).toBeCloseTo(b[0], 1);
    expect(v(s.blockStart), `${width} ${c} / ${o}`).toBeCloseTo(b[1], 1);
  }
});

// An absolute box with an auto height is as tall as its content (not stretched to its containing block).
test('absolute boxes with an auto height take their content height', async ({page}) => {
  const html = '<main class="page"><div class="card"><div class="o"><div class="k1"></div><div class="k2"><div class="n"></div></div></div></div></main>';
  const kids = '.k1{height:30px}.k2{height:12px;position:relative}.n{position:absolute;top:0;left:0;width:5px;height:5px}';
  const cases = [['top:0;width:50px', 'display:grid;grid-template-columns:minmax(0,1fr)'], ['bottom:0;width:50px', 'display:grid;grid-template-columns:minmax(0,1fr)'], ['top:10px;left:0;right:0', 'display:grid;grid-template-columns:minmax(0,1fr)'],
    ['top:0;width:50px;padding:3px 0;border:2px solid black', 'display:grid;grid-template-columns:minmax(0,1fr)'], ['top:0;width:50px;padding:3px 0;box-sizing:content-box', 'display:grid;grid-template-columns:minmax(0,1fr)'],
    ['bottom:5px;width:50px;min-height:60px', 'display:grid;grid-template-columns:minmax(0,1fr)'], ['top:0;width:50px;max-height:20px;overflow:hidden', 'display:grid;grid-template-columns:minmax(0,1fr)'], ['bottom:5px;width:50px;min-height:60px', 'display:block'], ['top:0;width:50px;min-height:30px', 'display:grid;grid-template-columns:minmax(0,1fr)'],
    ['top:0;width:50px;min-height:100px;max-height:50px', 'display:grid;grid-template-columns:minmax(0,1fr)'], ['top:0;width:50px;min-height:30px;max-height:50px', 'display:grid;grid-template-columns:minmax(0,1fr)'],
    ['top:0;width:50px', 'display:block'], ['top:0;width:50px;row-gap:4px', 'display:grid;grid-template-columns:minmax(0,1fr)'], ['top:0;width:50px', 'display:flex;flex-direction:column']];
  // A min or max height bounds the content height (laid out again at the bound); a min-height above the max-height wins.
  // (Under overflow: hidden, the nested absolute .n has a clipping ancestor, which is Unknown.)
  const unknownOk = o => /overflow:hidden/.test(o);
  let compared = 0;
  for (const [o, d] of cases) {
    const css = `*{box-sizing:border-box;margin:0}html,body,.page,.card{${g}}.card{position:relative;height:200px}.o{position:absolute;${d};${o}}${kids}`;
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 600, max: 600}}});
    expect(r.status === 'unknown', `${o} / ${d}: ${JSON.stringify(r.diagnostics.filter(x => x.severity === 'unknown').map(x => x.message))}`).toBe(unknownOk(o));
    if (r.status === 'unknown') continue;
    const n = t => { const [a, b = '1'] = String(t ?? '0').split('/'); return Number(a) / Number(b); };
    const v = x => n(x.constant) + 400 * n(x.coefficient) + 600 * n(x.heightCoefficient);
    await page.setViewportSize({width: 400, height: 600});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    for (const sel of ['.o', '.k2', '.n']) {
      const s = r.sizes.find(s => s.box === sel)?.rect;
      if (!s?.blockSize) continue;
      const b = await page.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }, sel);
      expect([v(s.inlineStart), v(s.blockStart), v(s.inlineSize), v(s.blockSize)], `${o} / ${d} ${sel}`).toEqual(b);
      compared++;
    }
  }
  // Children of a box placed by its bottom have no position until its content height is known (Unknown there).
  expect(compared, "every verified case compares .o, .k2 and .n, but the children of the bottom-placed box").toBeGreaterThanOrEqual(22);
});

// A scroll lock: body { position: fixed; left: 0; right: 0 } with top auto sits at the html content edge.
test('a fixed body with auto top sits where the browser puts it', async ({page}) => {
  const body = '<div class="k"></div><div class="m"></div>';
  for (const html of [`html{${g}}`, `html{${g};padding:5px 0 0 7px}`, 'html{display:block}', 'html{display:block;padding:5px 0 0 7px}']) {
    const css = `*{margin:0;box-sizing:border-box}${html}body{position:fixed;left:0;right:0;${g}}.k{height:30px}.m{height:12px}`;
    const r = analyzeHTML(`<html lang="en"><body>${body}</body></html>`, {name: 'P', css, viewport: {min: 320, max: 800, height: {min: 480, max: 900}}, accessibility: true});
    expect(r.status === 'unknown', `${html}: ${JSON.stringify(r.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message))}`).toBe(false);
    const s = r.sizes.find(s => s.box.startsWith('body') && s.rect).rect;
    const n = t => { const [a, b = '1'] = String(t ?? '0').split('/'); return Number(a) / Number(b); };
    for (const w of [320, 800]) {
      const v = x => n(x.constant) + w * n(x.coefficient) + 600 * n(x.heightCoefficient);
      await page.setViewportSize({width: w, height: 600});
      await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${body}</body></html>`);
      const b = await page.evaluate(() => { const r = document.body.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
      expect([v(s.inlineStart), v(s.blockStart), v(s.inlineSize), v(s.blockSize)], `${html} at ${w}`).toEqual(b);
    }
  }
});

// Shrink-to-fit: an absolute or fixed box with one inline inset and an auto width.
test('absolute and fixed boxes with an auto width shrink to fit as the browser does', async ({page}) => {
  const cases = [['position:fixed;top:24px;right:24px;min-width:180px;max-width:320px', ''], ['position:fixed;top:24px;right:24px', '<div class="k" style="width:120px"></div>'],
    ['position:fixed;top:24px;right:24px;max-width:320px', '<div class="k" style="width:500px"></div>'], ['position:fixed;top:24px;left:10px;padding:0 5px;box-sizing:content-box;min-width:50px', '<div class="k" style="width:20px"></div>'],
    ['position:absolute;top:0;right:0', '<div class="k" style="width:120px"></div>'], ['position:absolute;top:0;left:10%', '<div class="k" style="width:90px"></div><div class="k" style="width:60px"></div>'],
    // box-sizing stays content-box on the block axis: the padding adds to the height, the min-height and the max-height.
    ['position:absolute;top:0;left:10px;height:20px;padding:10px;box-sizing:content-box', '<div class="k" style="width:20px"></div>'], ['position:fixed;top:0;right:10px;min-height:30px;padding:10px;border:2px solid #000;box-sizing:content-box', '<div class="k" style="width:20px"></div>'],
    ['position:absolute;top:0;left:10px;height:60px;max-height:20px;padding:10px;box-sizing:content-box', '<div class="k" style="width:20px"></div>'], ['position:absolute;top:0;left:10px;height:20px;padding:10px', '<div class="k" style="width:20px"></div>']];
  const n = t => { const [a, b = '1'] = String(t ?? '0').split('/'); return Number(a) / Number(b); };
  for (const width of [600, 1280]) for (const [box, kids] of cases) {
    const body = `<div class="o" style="${box}">${kids}<div class="i"></div></div>`;
    const css = `*{margin:0;box-sizing:border-box}html,body{${g}}body{position:relative;height:300px}.k{height:10px}.i{position:absolute;right:0;top:-24px;width:20px;height:20px}`;
    const r = analyzeHTML(`<html lang="en"><body>${body}</body></html>`, {name: 'P', css, viewport: {min: width, max: width, height: {min: 720, max: 720}}, accessibility: true});
    expect(r.status === 'unknown', `${box}: ${JSON.stringify(r.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message))}`).toBe(false);
    const s = r.sizes.find(s => s.box === '.o').rect, v = x => n(x.constant) + width * n(x.coefficient) + 720 * n(x.heightCoefficient);
    await page.setViewportSize({width, height: 720});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${body}</body></html>`);
    const b = await page.evaluate(() => { const r = document.querySelector('.o').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
    expect([v(s.inlineStart), v(s.blockStart), v(s.inlineSize), v(s.blockSize)], `${width} ${box}`).toEqual(b);
  }
});
