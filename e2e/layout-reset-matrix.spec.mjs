// The reset matrix (packages/veriss/src/reset-matrix.mjs) against the browser: each vendored reset stylesheet put
// before a component's CSS, rendered in the browser this project runs, and the box geometry compared with the analysis
// of the branch (this browser's UA profile × the reset). Where the branch is decided, every box the analysis places is
// where the browser puts it, and a finding it reports is a box the browser draws outside its parent's content box.
// Where it is Unknown it stays Unknown: the list at the end is the measured record of what is not decided, per reset.
import {test, expect} from '@playwright/test';
import {analyzeResetMatrix, resets} from '../packages/veriss/src/reset-matrix.mjs';
import {uaProfiles} from '../packages/veriss/src/layout/ua-profile.mjs';

// The UA profiles were measured on Linux. A platform whose unstyled controls differ (macOS WebKit: text fields
// padding 2px 5px, 11px font) is not the platform the profile describes: the control components are skipped there.
async function controlProfileHolds(page, ua) {
  await page.setContent('<!doctype html><html lang="en"><body><input type="text" aria-label="t"><button type="button">b</button><textarea aria-label="a"></textarea></body></html>');
  const [field, button, area] = await page.evaluate(() => [...document.querySelectorAll('input, button, textarea')].map(e => { const c = getComputedStyle(e); return ['Top', 'Right', 'Bottom', 'Left'].flatMap(side => [c[`padding${side}`], c[`border${side}Width`]]); }));
  const p = uaProfiles[ua], expected = profile => [0, 1, 2, 3].flatMap(i => [profile.padding[i], profile.border[i]]);
  return JSON.stringify(field) === JSON.stringify(expected(p.textField)) && JSON.stringify(button) === JSON.stringify(expected(p.button)) && JSON.stringify(area) === JSON.stringify(expected(p.textarea));
}
const controlComponents = new Set(['button', 'field', 'number', 'textarea']);

const viewport = {min: 400, max: 400, height: {min: 300, max: 300}};
const svg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#06c"/></svg>');
// name → [body HTML, CSS, the boxes compared, the Unknown branches expected (reset ids, every UA)]
const components = {
  // the UA list padding (40px) decides whether an 80px box fits a 100px list
  list: ['<main class="c"><ul class="l"><li class="i"><div class="w"></div></li></ul></main>', 'body{margin:0}.l{margin:0}.i{display:block}.c{width:100px}.w{width:80px;height:10px}', ['.l', '.i', '.w'], []],
  // body's UA margin (8px in every engine) where the page sets none
  page: ['<div class="x"></div>', '.x{height:10px}', ['.x'], []],
  // h2's UA margins (0.83em of a UA font size) are not modeled: Unknown until a reset zeroes them
  heading: ['<main class="c"><h2 class="h"></h2><div class="after"></div></main>', 'body{margin:0}.c{width:300px}.h{height:20px}.after{height:10px}', ['.h', '.after'], ['none', 'modern-normalize', 'normalize', 'sanitize']],
  // p's UA margins: 1em
  paragraph: ['<main class="c"><p class="p"></p><div class="after"></div></main>', 'body{margin:0}.c{width:300px}.p{height:20px;font-size:16px}.after{height:10px}', ['.p', '.after'], []],
  button: ['<main class="c"><button class="b" type="button" aria-label="Go"></button><div class="after"></div></main>', 'body{margin:0}.c{display:grid;grid-template-columns:minmax(0,1fr);justify-items:start;width:300px}.b{display:block;inline-size:120px;block-size:24px}.after{inline-size:40px;block-size:10px}', ['.b', '.after'], []],
  field: ['<main class="c"><input class="f" type="text" aria-label="Name"><div class="after"></div></main>', 'body{margin:0}.c{display:grid;grid-template-columns:minmax(0,1fr);justify-items:start;width:300px}.f{display:block;inline-size:100px;block-size:20px}.after{inline-size:40px;block-size:10px}', ['.f', '.after'], []],
  // a number field: its spin buttons, which five resets restyle (::-webkit-inner-spin-button { height: auto }), are not
  // modeled (destyle's [type="number"] { -moz-appearance: textfield } would also be Unknown in Firefox)
  number: ['<main class="c"><input class="f" type="number" aria-label="Count"><div class="after"></div></main>', 'body{margin:0}.c{display:grid;grid-template-columns:minmax(0,1fr);justify-items:start;width:300px}.f{display:block;inline-size:100px;block-size:20px}.after{inline-size:40px;block-size:10px}', ['.f', '.after'], ['modern-normalize', 'normalize', 'sanitize', 'tailwind-preflight', 'destyle']],
  // a textarea in a 107px column: its UA border (Chromium and WebKit 1px, Firefox 2px) makes it overflow in Firefox only,
  // and only where no reset changes its box; normalize.css and destyle give it overflow: auto (scrollbars: Unknown)
  textarea: ['<main class="c"><div class="col"><textarea class="s" aria-label="Note"></textarea></div></main>', 'body{margin:0}.c{width:300px}.col{width:107px}.s{display:block;inline-size:100px;block-size:40px;resize:none}', ['.col', '.s'], ['normalize', 'destyle']],
  card: ['<main class="c"><article class="card"><img class="m" src="IMG" alt="" width="400" height="200"><h3 class="t"></h3></article></main>', 'body{margin:0}.c{width:300px}.card{display:grid;grid-template-columns:minmax(0,1fr);padding:8px}.m{width:100%;height:auto}.t{height:20px;margin:0}', ['.card', '.m', '.t'], []],
};
const value = (a, width) => Number(String(a.constant).split('/').reduce((x, y) => x / y)) + Number(String(a.coefficient ?? 0).split('/').reduce((x, y) => x / y)) * width;

for (const [name, [body, css, boxes, unknownResets]] of Object.entries(components)) {
  test(`${name}: every reset in this browser, where the analysis decides, places the boxes as the browser does`, async ({page}, testInfo) => {
    const ua = testInfo.project.name;
    if (controlComponents.has(name)) test.skip(!(await controlProfileHolds(page, ua)), `the ${ua} UA profile does not describe this platform's form controls`);
    const html = body.replace('IMG', svg);
    const matrix = analyzeResetMatrix({html: `<html lang="en"><body>${html}</body></html>`, css}, {name: 'P', viewport, uas: [ua], images: {[svg]: {width: 400, height: 200}}});
    await page.setViewportSize({width: 400, height: 300});
    const record = [];
    for (const branch of matrix.branches) {
      const reset = resets.find(r => r.id === branch.reset);
      await page.setContent(`<!doctype html><html lang="en"><head><style>${reset.css}</style><style>${css}</style></head><body>${html}</body></html>`);
      await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
      const expectedUnknown = unknownResets.includes(branch.reset);
      record.push(`${branch.id}: ${branch.status}${branch.status === 'unknown' ? ` (${branch.unknowns[0]?.message.slice(0, 100)})` : ''}`);
      expect(branch.status === 'unknown', `${branch.id} Unknown: ${JSON.stringify(branch.unknowns.map(u => u.message))}`).toBe(expectedUnknown);
      if (branch.status === 'unknown') continue;
      for (const sel of boxes) {
        const browser = await page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }, sel);
        const row = branch.report.sizes.find(r => (r.box === sel || r.box.startsWith(`${sel}@`) || r.box.startsWith(sel)) && r.rect);
        expect(row, `${branch.id} ${sel}: no rectangle`).toBeTruthy();
        const model = ['inlineStart', 'blockStart', 'inlineSize', 'blockSize'].map(k => value(row.rect[k], 400));
        model.forEach((v, i) => expect(Math.abs(v - browser[i]), `${branch.id} ${name} ${sel} [x, y, w, h][${i}]: model ${v}, browser ${browser[i]}`).toBeLessThanOrEqual(1 / 64 + 1e-6));
      }
      // A box the analysis reports as not fitting sticks out of its parent's content box in the browser, and only then.
      const overflowing = await page.evaluate(sels => sels.filter(s => { const e = document.querySelector(s), p = e.parentElement, c = getComputedStyle(p), r = e.getBoundingClientRect(), q = p.getBoundingClientRect(); return r.right > q.right - parseFloat(c.paddingRight) - parseFloat(c.borderRightWidth) + 0.01; }), boxes);
      const reported = boxes.filter(sel => branch.findings.some(f => f.code === 'E_LAYOUT_ITEM_SIZE' && (f.box === sel || f.box?.startsWith(sel))));
      expect(reported, `${branch.id}: boxes reported as not fitting`).toEqual(overflowing);
    }
    await testInfo.attach('branches', {body: record.join('\n'), contentType: 'text/plain'});
  });
}

// ::-moz-focus-inner (normalize.css removes its border and padding): Chromium and WebKit drop the rule, and Firefox draws
// no box for it any more, so even a large padding, border or margin on it moves no button.
test('::-moz-focus-inner changes no button box in this browser', async ({page}) => {
  const html = '<button>Go</button> <button style="padding:0;border:0">Go</button>';
  const sizes = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}button{font:16px/20px sans-serif}${css}</style></head><body>${html}</body></html>`); return page.evaluate(() => [...document.querySelectorAll('button')].map(b => { const r = b.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })); };
  expect(await sizes('button::-moz-focus-inner{border:5px solid red;padding:10px;margin:7px}')).toEqual(await sizes(''));
  expect(await sizes('button::-moz-focus-inner,[type="button"]::-moz-focus-inner{border-style:none;padding:0}')).toEqual(await sizes(''));
});

// Tailwind Preflight's @supports condition and contain-intrinsic-size (packages/veriss/src/layout/supports.mjs).
test('the @supports conditions the resets use are decided as the browser decides them', async ({page}) => {
  const {supportsCondition} = await import('../packages/veriss/src/layout/supports.mjs');
  await page.setContent('<!doctype html><html lang="en"><body></body></html>');
  for (const c of ['(contain-intrinsic-size: 1px)', '(contain-intrinsic-size: auto 100px)', '(not (-webkit-appearance: -apple-pay-button))  or (contain-intrinsic-size: 1px)', '(color: color-mix(in lab, red, red))'])
    expect(await page.evaluate(c => CSS.supports(c), c), c).toBe(supportsCondition(c));
});
