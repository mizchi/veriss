// Checklist F: CSS the browser accepts but that does nothing. Each warning holds exactly where the browser shows no
// effect of the declaration.
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/veriss/src/html.mjs';
import {analyzeStates} from '../packages/adapter-core/src/index.mjs';

const base = '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px;color:rgb(0, 0, 0)}';
const warns = (css, code) => (analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: base + css, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === code);
const load = async (page, css) => page.setContent(`<!doctype html><html lang="en"><head><style>${base}${css}</style></head><body><div class="a"></div></body></html>`);

test('F1, F2: an animation that never runs', async ({page}) => {
  for (const [css, code] of [['.a{animation:spin 1s infinite}', 'W_CSS_KEYFRAMES_MISSING'], ['.a{animation:spn 1s infinite}@keyframes spin{to{opacity:.5}}', 'W_CSS_KEYFRAMES_MISSING'], ['.a{animation:spin 1s infinite}@keyframes spin{to{opacity:.5}}', null],
    ['.a{animation:spin infinite}@keyframes spin{to{opacity:.5}}', 'W_CSS_ANIMATION_NO_DURATION'], ['.a{animation:spin 0s forwards}@keyframes spin{to{opacity:.5}}', null],
    // Keyframes names are case-sensitive: a mixed-case name runs its own @keyframes, another case runs none.
    ['.a{animation:2s linear 0s infinite normal none running cqkDSr}@keyframes cqkDSr{to{opacity:.5}}', null], ['.a{animation-name:cqkDSr;animation-duration:2s;animation-iteration-count:infinite}@keyframes cqkDSr{to{opacity:.5}}', null],
    ['.a{animation:Spin 1s infinite}@keyframes spin{to{opacity:.5}}', 'W_CSS_KEYFRAMES_MISSING']]) {
    await load(page, css);
    // Running for some time: a missing @keyframes gives no animation; a 0s one never shows a frame between its ends.
    const running = await page.evaluate(() => document.getAnimations().some(a => a.effect.getComputedTiming().duration > 0));
    for (const c of ['W_CSS_KEYFRAMES_MISSING', 'W_CSS_ANIMATION_NO_DURATION']) expect(warns(css, c), `${css} ${c}`).toBe(c === code);
    if (code) expect(running, css).toBe(false);
    else if (!css.includes('0s')) expect(running, css).toBe(true);
  }
});

test('F3: a var() with no value and no fallback leaves the property unset', async ({page}) => {
  for (const [css, invalid] of [['.a{color:var(--brand)}', true], ['.a{color:var(--brand, rgb(255, 0, 0))}', false], [':root{--brand:rgb(255, 0, 0)}.a{color:var(--brand)}', false]]) {
    await load(page, `body{color:rgb(0, 0, 255)}${css}`);
    const color = await page.evaluate(() => getComputedStyle(document.querySelector('.a')).color);
    expect(warns(`body{color:rgb(0, 0, 255)}${css}`, 'W_CSS_VAR_INVALID'), css).toBe(invalid);
    // Unset: color inherits from body.
    expect(color === 'rgb(0, 0, 255)', `${css}: ${color}`).toBe(invalid);
  }
});

test('F4: a max size below the min size fixes the box at the min', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  for (const [css, fixed] of [['.a{min-width:50px;max-width:10px;justify-self:start}', true], ['.a{min-width:10px;max-width:50px;justify-self:start}', false]]) {
    expect(warns(css + '.a{width:30px}', 'W_LAYOUT_MIN_ABOVE_MAX'), css).toBe(fixed);
    // Whatever the width, the box is the min wide where min is above max.
    const widths = [];
    for (const width of [5, 30, 80]) { await load(page, `${css}.a{width:${width}px}`); widths.push(await page.evaluate(() => document.querySelector('.a').getBoundingClientRect().width)); }
    expect(widths.every(w => w === 50), `${css}: ${widths}`).toBe(fixed);
  }
});

test('F5: a media query that no viewport matches', async ({page}) => {
  for (const [query, never] of [['(min-width:900px) and (max-width:600px)', true], ['(width > 600px) and (width < 600px)', true], ['(min-width:600px) and (max-width:900px)', false], ['(min-height:800px) and (max-height:400px)', true]]) {
    const css = `@media ${query}{.a{color:rgb(255, 0, 0)}}`;
    expect(warns(css, 'W_CSS_MEDIA_NEVER'), query).toBe(never);
    let matched = false;
    for (const [w, h] of [[320, 300], [600, 400], [750, 600], [900, 800], [1200, 900]]) { await page.setViewportSize({width: w, height: h}); matched ||= await page.evaluate(q => matchMedia(q).matches, query); }
    expect(matched, query).toBe(!never);
  }
});

test('F6: a property declared twice in one rule: the browser uses the one the warning keeps', async ({page}) => {
  for (const [css, kept] of [['.a{color:rgb(255, 0, 0);color:rgb(0, 0, 255)}', 'rgb(0, 0, 255)'], ['.a{color:rgb(255, 0, 0) !important;color:rgb(0, 0, 255)}', 'rgb(255, 0, 0)'], ['.a{color:rgb(0, 128, 0);color:rgb(0, 128, 0)}', 'rgb(0, 128, 0)']]) {
    await load(page, css);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.a')).color), css).toBe(kept);
    const w = (analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: base + css, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).find(x => x.code === 'W_CSS_DUPLICATE_DECLARATION');
    expect(w, css).toBeTruthy();
    // The message names the declaration that wins as the browser's value.
    expect(w.message.includes(`(${kept}`) || w.message.includes(`${kept} twice`), `${css}: ${w.message}`).toBe(true);
  }
});

test('F7: z-index stacks a box only where it is positioned or a flex or grid item', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  // .a has z-index 5 and comes first; .b overlaps it (moved up 20px) and comes after. Painting order puts .b on top
  // unless .a's z-index applies.
  const html = '<div class="p"><div class="a"></div><div class="b"></div></div>';
  for (const [css, inert] of [['.p{display:block}', true], ['.p{display:block}.a{position:relative}', false], ['.p{display:flex;flex-direction:column}.a,.b{flex:none}', false], ['.p{display:grid;grid-template-columns:minmax(0,1fr)}', false]]) {
    const full = `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a,.b{height:40px;background:#888}.a{z-index:5;background:#f00}.b{position:relative;top:-20px}${css}`;
    await page.setContent(`<!doctype html><html lang="en"><head><style>${full}</style></head><body>${html}</body></html>`);
    const top = await page.evaluate(() => document.elementFromPoint(10, 30)?.className);
    const warned = (analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: full, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('z-index'));
    expect(warned, css).toBe(inert);
    expect(top, css).toBe(inert ? 'b' : 'a');
  }
});

test('F8: a transition between auto (or none) and a length jumps', async ({page}) => {
  for (const [css, jumps] of [['.a{width:100px;height:auto;transition:height 1s linear}.a:hover{height:100px}', true], ['.a{width:100px;height:20px;transition:height 1s linear}.a:hover{height:100px}', false], ['.a{width:100px;max-height:none;transition:max-height 1s linear}.a:hover{max-height:10px}', true]]) {
    expect(warns(css, 'W_CSS_TRANSITION_AUTO'), css).toBe(jumps);
    // The hovered state, applied after a first frame: a transition runs, or the box is at its end value at once.
    await page.setContent(`<!doctype html><html lang="en"><head><style>${base}${css.replace(':hover', '.on')}</style></head><body><div class="a">x</div></body></html>`);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const running = await page.evaluate(() => { document.querySelector('.a').classList.add('on'); return document.getAnimations().length > 0; });
    expect(running, css).toBe(!jumps);
  }
});

test('F9: a pseudo-element without content on a grid container (body) is not generated either', async ({page}) => {
  for (const [css, generated] of [['body::before{display:block;height:10px}', false], ['body::before{content:"";display:block;height:10px}', true]]) {
    await load(page, css);
    expect(await page.evaluate(() => getComputedStyle(document.body, '::before').content !== 'none'), css).toBe(generated);
    // A generated ::before is the first grid item: it pushes .a down by its height.
    expect(await page.evaluate(() => document.querySelector('.a').getBoundingClientRect().top), css).toBe(generated ? 10 : 0);
    expect(warns(css, 'W_CSS_PSEUDO_NO_CONTENT'), css).toBe(!generated);
  }
});

test('F9, F10: a pseudo-element without content, and content on an element', async ({page}) => {
  for (const [css, generated] of [['.a::before{display:block;width:10px;height:10px}', false], ['.a::before{content:"";display:block;height:10px}', true]]) {
    await load(page, css);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.a'), '::before').content !== 'none'), css).toBe(generated);
    expect(warns(css, 'W_CSS_PSEUDO_NO_CONTENT'), css).toBe(!generated);
  }
  await load(page, '.a{content:"hi"}');
  expect(await page.evaluate(() => document.querySelector('.a').getBoundingClientRect().height)).toBe(20);
  expect((analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: base + '.a{content:"hi"}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('content'))).toBe(true);
});

test('F8 between component states: a class toggle that changes a size between auto and a length jumps', async ({page}) => {
  const viewport = {min: 400, max: 400, height: {min: 600, max: 600}};
  for (const [css, jumps] of [['*{margin:0}.panel{width:100px;transition:height 1s linear}.panel.open{height:120px}', true], ['*{margin:0}.panel{width:100px;height:0;transition:height 1s linear}.panel.open{height:120px}', false]]) {
    const states = [{html: '<div class="panel"></div>', choices: {open: false}}, {html: '<div class="panel open"></div>', choices: {open: true}}];
    expect(analyzeStates({states, css}, {viewport}).findings.some(f => f.code === 'W_CSS_TRANSITION_AUTO'), css).toBe(jumps);
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body><div class="panel">x</div></body></html>`);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await page.evaluate(() => { document.querySelector('.panel').classList.add('open'); return document.getAnimations().length > 0; }), css).toBe(!jumps);
  }
});

test('F12: a transition with no duration changes at once', async ({page}) => {
  for (const [css, instant] of [['.a{transition:opacity}.a.on{opacity:.2}', true], ['.a{transition:opacity 1s}.a.on{opacity:.2}', false]]) {
    expect(warns(css.replace('.a.on', '.a:hover'), 'W_CSS_TRANSITION_NO_DURATION'), css).toBe(instant);
    await load(page, css);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await page.evaluate(() => { document.querySelector('.a').classList.add('on'); return document.getAnimations().length > 0; }), css).toBe(!instant);
  }
});

test('F13: an over-constrained absolute box ignores its end inset', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  const html = '<div class="p"><div class="a"></div></div>';
  const rect = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>*{margin:0}.p{position:relative;height:100px}${css}</style></head><body>${html}</body></html>`); return page.evaluate(() => JSON.stringify(document.querySelector('.a').getBoundingClientRect())); };
  for (const [css, ignored] of [['.a{position:absolute;top:0;left:10px;right:10px;width:50px;height:10px}', 'right'], ['.p{direction:rtl}.a{position:absolute;top:0;left:10px;right:10px;width:50px;height:10px}', 'left'], ['.a{position:absolute;top:5px;bottom:5px;left:0;width:10px;height:30px}', 'bottom'], ['.a{position:absolute;top:0;left:10px;right:10px;height:10px}', null]]) {
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.p{position:relative;height:100px}${css}`, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
    const warned = (r.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_DECLARATION_INERT').flatMap(w => w.properties).find(p => ['left', 'right', 'bottom', 'top'].includes(p)) ?? null;
    expect(warned, css).toBe(ignored);
    if (ignored) expect(await rect(css.replace(/\.a\{/, `.a{${ignored}:auto!important;`)), css).toBe(await rect(css));
  }
});

test('F14: a border width with no border style draws no border', async ({page}) => {
  for (const [css, none] of [['.a{border-width:4px}', true], ['.a{border-width:0 4px}', true], ['.a{border-width:4px;border-style:solid}', false]]) {
    await load(page, `.a{box-sizing:content-box;width:50px}${css}`);
    const b = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('.a')); return {top: s.borderTopWidth, right: s.borderRightWidth, width: document.querySelector('.a').getBoundingClientRect().width}; });
    expect(warns(`.a{box-sizing:content-box;width:50px}${css}`, 'W_CSS_BORDER_NO_STYLE'), css).toBe(none);
    expect(b.width === 50 && b.right === '0px', `${css}: ${JSON.stringify(b)}`).toBe(none);
  }
});

test('F14: a side\'s own border shorthand draws that side; a style written none is no border on purpose', async ({page}) => {
  // [css, warned, the sides drawn]: border-top / -right / -bottom / -left give their side a style (after border: none
  // too), a width alone in one leaves its style none, and border: none as a browser serializes it (border-width: medium;
  // border-style: none) draws nothing and is not a forgotten style.
  for (const [css, warned, drawn] of [
    ['.a{border:none}.a{border-top:1px dashed rgb(179, 186, 193)}', false, ['top']], ['.a{border-right:1px solid rgb(226, 232, 234)}', false, ['right']],
    ['.a{border-left:solid 3px blue}', false, ['left']], ['.a{border:solid}', false, ['top', 'right', 'bottom', 'left']],
    ['.a{border-width:2px}.a{border-top:1px solid red}', true, ['top']], ['.a{border-top:2px}', true, []],
    ['.a{border-width:medium;border-style:none;border-color:currentcolor}', false, []], ['.a{border-width:2px;border-style:hidden}', false, []]]) {
    await load(page, `.a{box-sizing:content-box;width:50px}${css}`);
    const widths = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('.a')); return {top: s.borderTopWidth, right: s.borderRightWidth, bottom: s.borderBottomWidth, left: s.borderLeftWidth}; });
    expect(Object.entries(widths).filter(([, w]) => w !== '0px').map(([side]) => side), `${css}: ${JSON.stringify(widths)}`).toEqual(drawn);
    expect(warns(`.a{box-sizing:content-box;width:50px}${css}`, 'W_CSS_BORDER_NO_STYLE'), css).toBe(warned);
  }
});

test('F15, F16: background-size with no image and text-decoration-color with no line paint nothing different', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  const shot = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>${base}.a{background-color:rgb(200, 220, 240)}${css}</style></head><body><div class="a">text</div></body></html>`); return (await page.screenshot()).toString('base64'); };
  for (const [css, prop, inert] of [['.a{background-size:10px 10px;background-position:5px 5px}', 'background-size', true], ['.a{text-decoration-color:red;text-decoration-thickness:4px}', 'text-decoration-color', true], ['.a{text-decoration:underline;text-decoration-color:red;text-decoration-thickness:4px}', 'text-decoration-color', false]]) {
    expect((analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: base + css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes(prop)), css).toBe(inert);
    // The same pixels as without the declarations where they do nothing.
    const without = css.replace(/background-size:[^;}]*;?|background-position:[^;}]*;?|text-decoration-color:[^;}]*;?|text-decoration-thickness:[^;}]*;?/g, '');
    expect((await shot(css)) === (await shot(without)), css).toBe(inert);
  }
});

test('F17, F18: state rules that never apply: focus on an element that cannot take it, hover with pointer-events: none', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  for (const [html, css, never] of [['<div class="a">x</div>', '.a:focus{color:rgb(255, 0, 0)}', true], ['<div class="a" tabindex="0">x</div>', '.a:focus{color:rgb(255, 0, 0)}', false], ['<a class="a">x</a>', '.a:focus{color:rgb(255, 0, 0)}', true], ['<a class="a" href="#x">x</a>', '.a:focus{color:rgb(255, 0, 0)}', false]]) {
    expect((analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: base + css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}}).layoutWarnings ?? []).some(w => w.code === 'W_CSS_STATE_UNREACHABLE'), html).toBe(never);
    await page.setContent(`<!doctype html><html lang="en"><head><style>${base}${css}</style></head><body>${html}</body></html>`);
    // Every way to focus it: a click, Tab, and focus().
    await page.click('.a').catch(() => {}); await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => { const a = document.querySelector('.a'); a.focus(); return document.activeElement === a && getComputedStyle(a).color === 'rgb(255, 0, 0)'; });
    expect(focused, html).toBe(!never);
  }
  for (const [css, never] of [['.a{pointer-events:none}.a:hover{color:rgb(255, 0, 0)}', true], ['.a:hover{color:rgb(255, 0, 0)}', false]]) {
    expect(warns(css, 'W_CSS_STATE_UNREACHABLE'), css).toBe(never);
    await page.setContent(`<!doctype html><html lang="en"><head><style>${base}${css}</style></head><body><div class="a"></div></body></html>`);
    await page.mouse.move(10, 10);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.a')).color === 'rgb(255, 0, 0)'), css).toBe(!never);
  }
});

test('F19: :checked only on checkable elements, ::placeholder only where a placeholder shows', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  for (const [html, never] of [['<div class="a" role="checkbox" tabindex="0">x</div>', true], ['<input class="a" type="checkbox" aria-label="x">', false]]) {
    const css = '.a:checked{outline:3px solid rgb(255, 0, 0)}';
    expect((analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: base + css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}}).layoutWarnings ?? []).some(w => w.code === 'W_CSS_STATE_UNREACHABLE'), html).toBe(never);
    await page.setContent(`<!doctype html><html lang="en"><head><style>${base}${css}</style></head><body>${html}</body></html>`);
    await page.click('.a');
    expect(await page.evaluate(() => document.querySelector('.a').matches(':checked')), html).toBe(!never);
  }
  for (const [html, never] of [['<input class="a" type="text" aria-label="x">', true], ['<input class="a" type="text" placeholder="Name" aria-label="x">', false]]) {
    const css = '.a::placeholder{color:rgb(255, 0, 0)}';
    expect((analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: base + css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}}).layoutWarnings ?? []).some(w => w.code === 'W_CSS_STATE_UNREACHABLE'), html).toBe(never);
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    const shot = (await page.locator('.a').screenshot()).toString('base64');
    await page.setContent(`<!doctype html><html lang="en"><head><style></style></head><body>${html}</body></html>`);
    expect(shot === (await page.locator('.a').screenshot()).toString('base64'), html).toBe(never);
  }
});

test('F20: a visited link takes only the colors of a :visited rule', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  const css = 'a{font:16px/20px sans-serif;color:rgb(0, 0, 255)}a:visited{color:rgb(255, 0, 0);font-weight:900;letter-spacing:10px}';
  expect((analyzeHTML('<html lang="en"><body><a class="a" href="#visited-target">Docs</a></body></html>', {name: 'P', css: base + css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, boxes: {'.a': {minInlineSize: 0, intrinsicBlockSize: 20}}}).layoutWarnings ?? []).filter(w => w.code === 'W_CSS_VISITED_IGNORED').map(w => w.property).sort()).toEqual(['font-weight', 'letter-spacing']);
  // A real history entry: serve two pages, visit the target, then load the page whose link points there.
  const page2 = (body, style = '') => `<!doctype html><html lang="en"><head><style>${style}</style></head><body>${body}</body></html>`;
  await page.route('http://visited.test/**', route => route.fulfill({contentType: 'text/html', body: route.request().url().endsWith('/target') ? page2('target') : page2('<a class="a" href="http://visited.test/target">Docs</a> <a class="b" href="http://visited.test/never">Docs</a>', css)}));
  await page.goto('http://visited.test/target');
  await page.goto('http://visited.test/page'); await page.waitForTimeout(300);
  const box = sel => page.evaluate(s => document.querySelector(s).getBoundingClientRect().width, sel);
  const shot = async sel => (await page.locator(sel).screenshot()).toString('base64');
  // .a is visited, .b is not: the same width (weight and spacing ignored), different pixels (the color applies).
  expect(await box('.a')).toBe(await box('.b'));
  expect((await shot('.a')) !== (await shot('.b'))).toBe(true);
});

test(':disabled and :enabled match as in the browser (own attribute, disabled fieldset, its first legend)', async ({page}) => {
  const {htmlBoxTree} = await import('../packages/veriss/src/html.mjs');
  const {normalizeTree} = await import('../packages/veriss/src/tree.mjs');
  const {compileSelector, matches} = await import('../packages/veriss/src/layout/selectors.mjs');
  const html = '<form><input class="c1" disabled aria-label="a"><fieldset disabled><legend><input class="c2" aria-label="b"><button class="c3" type="button">x</button></legend><input class="c4" aria-label="c"><select class="c5" aria-label="s"><option class="c6">o</option></select></fieldset><button class="c7" type="button">y</button><fieldset><input class="c8" aria-label="d" disabled></fieldset><select class="c9" aria-label="t"><optgroup class="c10" disabled label="g"><option class="c11">p</option></optgroup></select></form>';
  const {root} = normalizeTree(htmlBoxTree(`<html lang="en"><body>${html}</body></html>`).tree, 'P');
  const all = []; (function walk(b) { all.push(b); for (const c of [...(b.children ?? []), ...(b.inline ?? [])]) walk(c); })(root);
  await page.setContent(`<!doctype html><html lang="en"><body>${html}</body></html>`);
  for (let i = 1; i <= 11; i++) {
    const box = all.find(b => b.classes?.includes(`c${i}`));
    for (const pseudo of [':disabled', ':enabled']) {
      const browser = await page.evaluate(([cls, p]) => document.querySelector(`.${cls}`).matches(p), [`c${i}`, pseudo]);
      // Where browsers differ (an option in a disabled select) the box tree says dynamic: the analysis stays Unknown.
      if (box.disabled === 'dynamic') continue;
      expect(matches(compileSelector(`.c${i}${pseudo}`), box), `c${i}${pseudo}`).toBe(browser);
    }
  }
});

test('F22: ::marker ignores all but its own properties, and has no effect off list items', async ({page}) => {
  await page.setViewportSize({width: 300, height: 120});
  const html = '<ul class="l"><li class="i">item</li></ul><div class="d">div</div>';
  const shot = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>*{margin:0}body{font:16px/20px sans-serif}.l{padding-left:40px}${css}</style></head><body>${html}</body></html>`); return (await page.screenshot()).toString('base64'); };
  const plain = await shot('');
  const analysis = css => analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.l{display:block;padding-left:40px}.i,.d{height:20px}${css}`, viewport: {min: 300, max: 300, height: {min: 120, max: 120}}, boxes: {'.i': {minInlineSize: 0, intrinsicBlockSize: 20}, '.d': {minInlineSize: 0, intrinsicBlockSize: 20}}}).layoutWarnings ?? [];
  const ignored = '.i::marker{margin-left:60px;padding:10px;background:rgb(255, 0, 0);width:80px}';
  expect(analysis(ignored).filter(w => w.code === 'W_CSS_MARKER_IGNORED').length).toBe(4);
  expect(await shot(ignored)).toBe(plain);
  const offList = '.d::marker{color:rgb(255, 0, 0);font-size:40px}';
  expect(analysis('.d::marker{color:rgb(255, 0, 0)}').some(w => w.code === 'W_CSS_STATE_UNREACHABLE')).toBe(true);
  expect(await shot(offList)).toBe(plain);
  // And color does apply on the list item (the check is not vacuous).
  expect(await shot('.i::marker{color:rgb(255, 0, 0)}')).not.toBe(plain);
});

test('F8 in plain HTML: a class toggle named by the stylesheet jumps between auto and a length', async ({page}) => {
  for (const [css, jumps] of [['.panel{width:100px;transition:height 1s linear}.panel.open{height:120px}', true], ['.panel{width:100px;height:0;transition:height 1s linear}.panel.open{height:120px}', false]]) {
    expect((analyzeHTML('<html lang="en"><body><div class="panel"></div></body></html>', {name: 'P', css: base + css, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_CSS_TRANSITION_AUTO'), css).toBe(jumps);
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body><div class="panel">x</div></body></html>`);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await page.evaluate(() => { document.querySelector('.panel').classList.add('open'); return document.getAnimations().length > 0; }), css).toBe(!jumps);
  }
});

test('F23, G1: user-select: none on a text field; a summary without its disclosure triangle', async ({page}) => {
  await page.setContent('<!doctype html><html lang="en"><head><style>input{user-select:none;-webkit-user-select:none}</style></head><body><input aria-label="x" value="hello world"></body></html>');
  await page.click('input', {clickCount: 3});
  expect(await page.evaluate(() => { const i = document.querySelector('input'); return i.selectionEnd - i.selectionStart; })).toBe(11);
  await page.setViewportSize({width: 200, height: 60});
  const shot = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>*{margin:0}body{font:16px/20px sans-serif}${css}</style></head><body><details><summary class="s">More</summary>x</details></body></html>`); return (await page.screenshot()).toString('base64'); };
  const triangle = await shot(''), none = await shot('.s{list-style:none}');
  // display: block draws what list-style: none draws (no triangle); with a ::before the indicator is back.
  expect(triangle).not.toBe(none);
  expect(await shot('.s{display:block}')).toBe(none);
  for (const [css, warned] of [['.s{display:block}', true], ['.s{display:block}.s::before{content:"+ "}', false]]) expect((analyzeHTML('<html lang="en"><body><details><summary class="s">More</summary><p>x</p></details></body></html>', {name: 'P', css: base + css, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_A11Y_SUMMARY_INDICATOR'), css).toBe(warned);
});

test('F24, F25: table-layout: fixed without a width, border-spacing with collapsed borders', async ({page}) => {
  const html = '<table class="t"><tbody><tr><td class="c1">aaaaaaaaaaaaaaaaaaaa</td><td class="c2">b</td></tr></tbody></table>';
  const cells = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>*{margin:0}body{font:16px/20px monospace}td{border:1px solid}${css}</style></head><body>${html}</body></html>`); return page.evaluate(() => JSON.stringify(['.t', '.c1', '.c2'].map(s => document.querySelector(s).getBoundingClientRect()))); };
  for (const [css, prop, inert, without] of [['.t{table-layout:fixed}', 'table-layout', true, ''], ['.t{table-layout:fixed;width:300px}', 'table-layout', false, '.t{width:300px}'], ['.t{border-collapse:collapse;border-spacing:20px}', 'border-spacing', true, '.t{border-collapse:collapse}'], ['.t{border-spacing:20px}', 'border-spacing', false, '']]) {
    expect((analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: base + css, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes(prop)), css).toBe(inert);
    expect((await cells(css)) === (await cells(without)), css).toBe(inert);
  }
});

test('F26: a child combinator through the tbody the parser inserts never matches', async ({page}) => {
  for (const [html, sel, never] of [['<table class="t"><tr class="r"><td>x</td></tr></table>', '.t > .r', true], ['<table class="t"><tr class="r"><td>x</td></tr></table>', '.t .r', false], ['<table class="t"><tbody><tr class="r"><td>x</td></tr></tbody></table>', '.t > tbody > .r', false],
    // The implied tbody in the middle of the selector (the subject is the cell or something inside it).
    ...[['.t > .r > td', true], ['.t > tr > .c', true], ['table > tr td', true], ['.t > .r > .c > .s', true], ['.t > .r .s', true],
      ['.t .r > td', false], ['.t td', false], ['.t > tbody > .r > td', false], ['.r > .c > .s', false]]
      .map(([sel, never]) => ['<table class="t"><tr class="r"><td class="c"><span class="s">x</span></td></tr></table>', sel, never]),
    ['<table class="t"><tbody><tr class="r"><td>x</td></tr></tbody></table>', '.t > tbody > .r > td', false]]) {
    await page.setContent(`<!doctype html><html lang="en"><body>${html}</body></html>`);
    expect(await page.evaluate(s => document.querySelector(s) !== null, sel), sel).toBe(!never);
    expect((analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `${sel}{color:red}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_CSS_SELECTOR_IMPLIED_PARENT'), sel).toBe(never);
  }
});

test('F27: the browser restructures exactly where the parser warning says', async ({page}) => {
  for (const [html, probe, restructured] of [['<p class="p">text<div class="d">x</div></p>', '.p .d', true], ['<a class="a" href="#x">a<a class="b" href="#y">b</a></a>', '.a .b', true], ['<p class="p">text<span class="d">x</span></p>', '.p .d', false], ['<ul class="p"><li class="d">a<li>b</ul>', '.p .d', false], ['<table class="p"><div class="d">x</div><tr><td>a</td></tr></table>', '.p .d', true], ['<form class="p" action="/a"><form class="d" action="/b"><input aria-label="x"></form></form>', '.p .d, .d', true], ['<table class="p"><tr><td><div class="d">x</div></td></tr></table>', '.p .d', false]]) {
    await page.setContent(`<!doctype html><html lang="en"><body>${html}</body></html>`);
    expect(await page.evaluate(s => document.querySelector(s) === null, probe), html).toBe(restructured);
    expect((analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: '*{margin:0}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_HTML_RESTRUCTURED'), html).toBe(restructured);
  }
});

test('F28: presentational attributes on elements they do not map to change nothing', async ({page}) => {
  await page.setViewportSize({width: 400, height: 200});
  const shot = async html => { await page.setContent(`<!doctype html><html lang="en"><head><style>*{margin:0}.a{height:20px}</style></head><body>${html}</body></html>`); return (await page.screenshot()).toString('base64') + JSON.stringify(await page.evaluate(() => document.querySelector('.a').getBoundingClientRect())); };
  const plain = await shot('<div class="a">x</div>');
  expect(await shot('<div class="a" width="100" height="50" bgcolor="red" border="2">x</div>')).toBe(plain);
  expect(await shot('<span class="a" width="100" bgcolor="red">x</span>')).toBe(await shot('<span class="a">x</span>'));
  // Where they map, they do something (the check is not vacuous).
  expect(await shot('<table class="a" width="300" bgcolor="red"><tr><td>x</td></tr></table>')).not.toBe(await shot('<table class="a"><tr><td>x</td></tr></table>'));
  // size, color and align where they do not map (a component library's props leaked to the DOM), and names that are
  // not HTML attributes at all, change nothing; where size, color and align map they do.
  expect(await shot('<span class="a" size="18" color="red" align="center">x</span>')).toBe(await shot('<span class="a">x</span>'));
  expect(await shot('<div class="a" placement="top" position="relative" _size="small" hastoasts="true" variant="primary">x</div>')).toBe(plain);
  expect(await shot('<hr class="a" size="12" color="red">')).not.toBe(await shot('<hr class="a">'));
  expect(await shot('<p class="a" align="center">x</p>')).not.toBe(await shot('<p class="a">x</p>'));
  expect(await shot('<input class="a" size="3">')).not.toBe(await shot('<input class="a">'));
});

test('F29: :empty does not match an element holding whitespace', async ({page}) => {
  for (const [html, missed] of [['<div class="x"> </div>', true], ['<div class="x">\n  </div>', true], ['<div class="x"></div>', false], ['<div class="x"><!-- c --></div>', false]]) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>.x{height:20px}.x:empty{display:none}</style></head><body>${html}</body></html>`);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.x')).display === 'none'), html).toBe(!missed);
    expect((analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: '.x{height:20px}.x:empty{display:none}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_CSS_EMPTY_WHITESPACE'), html).toBe(missed);
  }
});

test('F30: display: contents on a replaced element or form control removes it', async ({page}) => {
  const cases = [['<input class="x" aria-label="q">', true], ['<img class="x" alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="20" height="20">', true], ['<textarea class="x" aria-label="q">t</textarea>', true], ['<select class="x" aria-label="q"><option>abc</option></select>', true], ['<button class="x" type="button">abc</button>', false]];
  for (const [html, removed] of cases) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>.x{display:contents}</style></head><body><div id="w" style="display:inline-block">${html}</div></body></html>`);
    const r = await page.evaluate(() => document.getElementById('w').getBoundingClientRect());
    expect(r.width === 0 && r.height === 0, html).toBe(removed);
    expect((analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: '.x{display:contents}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_CONTENTS_REMOVED'), html).toBe(removed);
  }
});

test('F31: overflow: auto or scroll on a table does not scroll it', async ({page}) => {
  const table = '<table class="t" style="width:100px"><tbody><tr><td style="padding:0"><div style="width:300px;height:10px"></div></td></tr></tbody></table>';
  for (const [css, html, inert] of [['.t{overflow:auto}', table, true], ['.t{overflow-x:scroll}', table, true], ['.w{overflow-x:auto;width:100px}', `<div class="w">${table}</div>`, false], ['.t{display:block;overflow-x:auto}', table, false]]) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}${css}</style></head><body>${html}</body></html>`);
    const scrolls = await page.evaluate(() => { const e = document.querySelector('.w') ?? document.querySelector('.t'); e.scrollLeft = 50; return e.scrollLeft > 0; });
    expect(scrolls, css).toBe(!inert);
    expect((analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.some(p => p.startsWith('overflow'))), css).toBe(inert);
  }
});

test('F32: ::before on an img, a text field and other replaced elements is not rendered', async ({page}) => {
  const gif = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
  const pseudo = '.x::before{content:"";display:inline-block;width:30px;height:30px;background:rgb(255,0,0)}';
  const cases = [[`<img class="x" alt="" src="${gif}" width="40" height="40">`, true], ...['text', 'email', 'password', 'search', 'tel', 'url', 'number'].map(t => [`<input class="x" type="${t}" aria-label="q">`, true]),
    ['<select class="x" aria-label="q"><option>a</option></select>', true], ['<textarea class="x" aria-label="q"></textarea>', true], ['<iframe class="x" title="f" width="60" height="40"></iframe>', true],
    ['<video class="x" width="60" height="40"></video>', true], ['a<br class="x">b', true], ['<canvas class="x" width="40" height="40"></canvas>', true],
    ['<div class="x">d</div>', false], ['<button class="x" type="button">b</button>', false], ['<input class="x" type="checkbox" aria-label="q" style="appearance:none;width:20px;height:20px;border:1px solid">', false]];
  for (const [html, hidden] of cases) {
    const shot = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:20px}${css}</style></head><body>${html}</body></html>`); await page.waitForTimeout(30); return (await page.screenshot()).toString('base64'); };
    expect(await shot('') === await shot(pseudo), html).toBe(hidden);
    expect((analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: pseudo, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_CSS_PSEUDO_NOT_RENDERED'), html).toBe(hidden);
  }
});

test('F33: :last-child and :nth-child miss because of a template or script sibling', async ({page}) => {
  const cases = [['.a:last-child', '<template><b></b></template>', 'last'], ['.a:last-child', '<script>1</script>', 'last'], ['.a:first-child', '<template></template>', 'first'],
    ['.a:nth-child(2)', '<template></template>', 'first'], ['.a:last-of-type', '<template></template>', 'last'], ['.a:last-child', '', 'last']];
  for (const [sel, hidden, where] of cases) {
    const html = where === 'last' ? `<div class="w"><div class="a" id="p"></div><div class="a" id="t"></div>${hidden}</div>` : `<div class="w">${hidden}<div class="a" id="t"></div><div class="a" id="p"></div></div>`;
    await page.setContent(`<!doctype html><html lang="en"><body>${html}</body></html>`);
    const browser = await page.evaluate(s => { const items = [...document.querySelectorAll('.a')], before = items.map(e => e.matches(s)); document.querySelectorAll('.w > template, .w > script').forEach(e => e.remove()); return items.filter((e, i) => !before[i] && e.matches(s)).length; }, sel);
    expect((analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}${sel}{height:50px}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).filter(w => w.code === 'W_CSS_CHILD_INDEX_HIDDEN_SIBLING').length, `${sel} ${hidden}`).toBe(browser);
  }
  expect(await page.evaluate(() => { document.body.innerHTML = '<template id="x"><b>t</b></template>'; return document.getElementById('x').getBoundingClientRect().height; })).toBe(0);
});

test('F34: columns on a flex or grid container do nothing', async ({page}) => {
  const items = '<div class="x"><div class="a">a</div><div class="a">b</div><div class="a">c</div></div>';
  const rects = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0;width:400px}.a{height:20px}${css}</style></head><body>${items}</body></html>`); return page.evaluate(() => [...document.querySelectorAll('.a')].map(e => JSON.stringify(e.getBoundingClientRect()))); };
  for (const [base, extra, inert] of [['.x{display:flex}', '.x{columns:2}', true], ['.x{display:grid}', '.x{column-count:3}', true], ['.x{display:flex;flex-direction:column}', '.x{column-width:100px}', true], ['.x{display:block}', '.x{columns:2}', false]]) {
    expect(JSON.stringify(await rects(base)) === JSON.stringify(await rects(base + extra)), base + extra).toBe(inert);
    const r = analyzeHTML(`<html lang="en"><body>${items}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}${base}${extra}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.some(p => p.startsWith('column-'))), base + extra).toBe(inert);
    if (!inert) expect(r.status).toBe('unknown');
  }
});

test('F35: :focus-within with nothing focusable inside; F17: tabindex="-1" takes focus', async ({page}) => {
  const css = '.x:focus-within{outline:2px solid}.x:focus{color:red}';
  for (const html of ['<div class="x"><p class="a">t</p></div>', '<div class="x"><button class="a" type="button">b</button></div>', '<div class="x"><p class="a">t <a href="/y">y</a></p></div>',
    '<div class="x" tabindex="-1"><p class="a">t</p></div>', '<div class="x"><div class="a" tabindex="0"></div></div>', '<div class="x"><a class="a">no href</a></div>']) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    const [within, self] = await page.evaluate(() => { const x = document.querySelector('.x'); const all = [x, ...x.querySelectorAll('*')]; const within = all.some(e => { e.focus(); const m = x.matches(':focus-within'); document.activeElement?.blur(); return m; }); x.focus(); return [within, x.matches(':focus')]; });
    const warnings = (analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).filter(w => w.code === 'W_CSS_STATE_UNREACHABLE');
    expect(warnings.some(w => w.state === 'focus-within'), html).toBe(!within);
    expect(warnings.some(w => w.state === 'focus'), html).toBe(!self);
  }
});

test('F36: a :hover transform on an inline link does not move it', async ({page}) => {
  for (const [css, html, inert] of [['.x:hover{transform:translateY(-8px)}', '<p class="a">text <a class="x" href="/y">link</a></p>', true], ['.x:hover{scale:2}', '<p class="a">text <span class="x" tabindex="0">s</span></p>', true],
    ['.x{display:inline-block}.x:hover{transform:translateY(-8px)}', '<p class="a">text <a class="x" href="/y">link</a></p>', false], ['.x:hover{transform:translateY(-8px)}', '<div class="x a">block</div>', false]]) {
    await page.mouse.move(0, 0);
    await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:40px}${css}</style></head><body>${html}</body></html>`);
    const before = await page.evaluate(() => JSON.stringify(document.querySelector('.x').getBoundingClientRect()));
    await page.hover('.x'); await page.waitForTimeout(30);
    const after = await page.evaluate(() => JSON.stringify(document.querySelector('.x').getBoundingClientRect()));
    expect(before === after, css).toBe(inert);
    expect((analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.state === 'hover'), css).toBe(inert);
  }
});

test('F37: ::first-letter / ::first-line on an inline, flex or grid box never applies', async ({page}) => {
  for (const [css, html, inert] of [['.x{display:flex}', '<div class="x">Hello there</div>', true], ['.x{display:grid}', '<div class="x">Hello there</div>', true], ['', '<p>t <span class="x">Hello</span></p>', true], ['', '<p class="x">Hello there</p>', false], ['.x{display:inline-block}', '<p>t <span class="x">Hello</span></p>', false]]) {
    for (const pe of ['first-letter', 'first-line']) {
      const rule = `.x::${pe}{color:rgb(255,0,0)}`;
      const shot = async extra => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:10px;font:16px sans-serif}${css}${extra}</style></head><body>${html}</body></html>`); return (await page.screenshot()).toString('base64'); };
      expect(await shot('') === await shot(rule), css + rule).toBe(inert);
      const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: css + rule, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
      expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_STATE_UNREACHABLE' && w.state === `::${pe}`), css + rule).toBe(inert);
    }
  }
});

test('F38: margin: auto does not centre an absolutely positioned box with an auto inset', async ({page}) => {
  for (const c of ['margin:auto', 'left:0;margin:0 auto', 'right:0;margin:auto', 'inset:0;margin:auto', 'left:0;right:0;margin:0 auto', 'top:0;bottom:0;margin:auto 0', 'inset:0 auto 0 0;margin:auto']) {
    const css = `.w{position:relative;height:300px;width:400px}.m{position:absolute;width:200px;height:50px;${c}}`;
    await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}${css}</style></head><body><div class="w"><div class="m"></div></div></body></html>`);
    const [cx, cy] = await page.evaluate(() => { const r = document.querySelector('.m').getBoundingClientRect(); return [r.x === 100, r.y === 125]; });
    const m = c.match(/margin:([^;]+)/)[1].trim().split(/\s+/), wantsY = m[0] === 'auto', wantsX = (m[1] ?? m[0]) === 'auto';
    const missed = ['horizontal', 'vertical'].filter((axis, i) => (i === 0 ? wantsX : wantsY) && !(i === 0 ? cx : cy));
    const w = (analyzeHTML('<html lang="en"><body><div class="w"><div class="m"></div></div></body></html>', {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).find(x => x.code === 'W_LAYOUT_AUTO_MARGIN_ABSOLUTE');
    expect(w?.axes ?? [], c).toEqual(missed);
  }
});

test('F39: object-position does nothing under object-fit: fill', async ({page}) => {
  const src = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="20" height="20" fill="red"/><rect x="20" width="20" height="20" fill="blue"/></svg>');
  for (const fit of ['fill', 'contain', 'cover', 'none', 'scale-down']) {
    const html = `<img class="x" alt="" src="${src}" width="40" height="20">`;
    const css = `.x{display:block;width:100px;height:100px;object-fit:${fit}}`;
    const shot = async extra => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}${css}${extra}</style></head><body>${html}</body></html>`); await page.waitForTimeout(50); return (await page.screenshot()).toString('base64'); };
    const inert = await shot('') === await shot('.x{object-position:left top}');
    expect(inert, fit).toBe(fit === 'fill');
    expect((analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${css}.x{object-position:left top}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('object-position')), fit).toBe(inert);
  }
});

test('F40: place-items / place-content lay out as their longhands', async ({page}) => {
  const items = '<div class="x"><div class="a">a</div><div class="a">b</div></div>';
  const base = '.x{display:grid;grid-template-columns:100px 100px;width:300px;height:100px}.a{height:20px;width:40px}';
  const rects = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}${base}${css}</style></head><body>${items}</body></html>`); return page.evaluate(() => [...document.querySelectorAll('.a')].map(e => JSON.stringify(e.getBoundingClientRect()))); };
  const analyse = css => analyzeHTML(`<html lang="en"><body>${items}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${base}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
  for (const [short, long] of [['.x{place-items:center}', '.x{align-items:center;justify-items:center}'], ['.x{place-items:end start}', '.x{align-items:end;justify-items:start}'], ['.x{place-content:center}', '.x{align-content:center;justify-content:center}'], ['.x{place-content:end space-between}', '.x{align-content:end;justify-content:space-between}']]) {
    expect(await rects(short), short).toEqual(await rects(long));
    const a = analyse(short), b = analyse(long);
    expect(a.status, short).toBe(b.status);
    expect(JSON.stringify(a.layoutWarnings ?? []), short).toBe(JSON.stringify(b.layoutWarnings ?? []).replaceAll(long.slice(3, -1), short.slice(3, -1)));
  }
});

test('F41: fill / stroke on an svg whose shapes set their own attributes', async ({page}) => {
  const svg = inner => `<svg class="i" width="40" height="40" viewBox="0 0 20 20" aria-hidden="true">${inner}</svg>`;
  for (const [css, inner, key] of [['.i{fill:rgb(255,0,0)}', '<path fill="#000" d="M0 0h20v20H0z"/>', 'fill'], ['.i{fill:rgb(255,0,0)}', '<path d="M0 0h20v20H0z"/>', 'fill'], ['.i{fill:rgb(255,0,0)}', '<path fill="inherit" d="M0 0h20v20H0z"/>', 'fill'],
    ['.i{fill:rgb(255,0,0)}', '<g fill="#000"><path d="M0 0h20v20H0z"/></g>', 'fill'], ['.i{fill:rgb(255,0,0)}', '<path fill="#000" d="M0 0h10v20H0z"/><path d="M10 0h10v20H10z"/>', 'fill'],
    ['.i{stroke:rgb(255,0,0)}', '<path fill="none" stroke="#000" stroke-width="4" d="M2 2h16v16H2z"/>', 'stroke'], ['.i{fill:rgb(255,0,0)}.i path{fill:rgb(0,0,255)}', '<path fill="#000" d="M0 0h20v20H0z"/>', 'fill']]) {
    const shot = async extra => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}.i{display:block}${extra}</style></head><body>${svg(inner)}</body></html>`); return (await page.screenshot()).toString('base64'); };
    const inert = await shot('') === await shot(css);
    const own = css.replace(/\.i path\{[^}]*\}/, '');
    const ownInert = css === own ? inert : await shot('') === await shot(own) && await shot(css.replace(own, '')) === await shot(css);
    expect((analyzeHTML(`<html lang="en"><body>${svg(inner)}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.i{display:block}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes(key)), `${css} ${inner}`).toBe(css === own ? inert : false);
    if (css !== own) expect(ownInert, 'the svg rule alone is inert there').toBe(true);
  }
});

test('F42: background, color, border and padding on a checkbox or radio of appearance auto change nothing', async ({page}) => {
  for (const type of ['checkbox', 'radio']) for (const [d, inert] of [['background-color:rgb(255,0,0)', true], ['color:rgb(255,0,0)', true], ['border:3px solid red', true], ['padding:5px', true], ['accent-color:rgb(255,0,0)', false], ['appearance:none;width:20px;height:20px;background-color:rgb(255,0,0)', false]]) {
    const html = `<input class="x" type="${type}" checked aria-label="q"><span>after</span>`;
    const shot = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:20px}${css}</style></head><body>${html}</body></html>`); return [(await page.screenshot()).toString('base64'), await page.evaluate(() => JSON.stringify([document.querySelector('.x').getBoundingClientRect(), document.querySelector('span').getBoundingClientRect().x]))]; };
    const [a, b] = [await shot(''), await shot(`.x{${d}}`)];
    expect(a[0] === b[0] && a[1] === b[1], `${type} ${d}`).toBe(inert);
    const warned = (analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `.x{${d}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path && /appearance: auto/.test(w.message));
    expect(warned, `${type} ${d}`).toBe(inert);
  }
});

test('F43: min-height / max-height on a table cell, and min-width / max-width in a fixed table, do nothing', async ({page}) => {
  for (const layout of ['auto', 'fixed']) for (const d of ['min-height:80px', 'max-height:5px', 'max-width:30px', 'min-width:250px']) {
    const table = '<table class="t"><tbody><tr><td class="c">word word</td><td>x</td></tr><tr><td>a</td><td>b</td></tr></tbody></table>';
    const css = `.t{table-layout:${layout};width:300px;border-spacing:0}td{padding:0}`;
    const m = async extra => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}${css}${extra}</style></head><body>${table}</body></html>`); return page.evaluate(() => [...document.querySelectorAll('td')].map(t => JSON.stringify(t.getBoundingClientRect())).join()); };
    const inert = await m('') === await m(`.c{${d}}`);
    const warned = (analyzeHTML(`<html lang="en"><body>${table}</body></html>`, {name: 'P', css: `${css}.c{${d}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && /table cell/.test(w.message));
    expect(warned, `${layout} ${d}`).toBe(inert);
  }
});

test('F44: an element with pointer-events: none is never under the pointer, so its cursor never shows', async ({page}) => {
  for (const [css, html] of [['.x{pointer-events:none;cursor:pointer}', '<div class="x a"></div>'], ['.p{pointer-events:none}.x{cursor:not-allowed}', '<div class="p"><div class="x a"></div></div>'], ['.x{cursor:pointer}', '<div class="x a"></div>']]) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}.a{height:20px}${css}</style></head><body>${html}</body></html>`);
    const hit = await page.evaluate(() => { const r = document.querySelector('.x').getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.classList.contains('x') ?? false; });
    const warned = (analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('cursor'));
    expect(warned, css).toBe(!hit);
  }
});

test('F45: text-align / text-indent / text-align-last on an inline element do nothing', async ({page}) => {
  const html = '<p class="a">before <span class="x">span text here</span> after more words to wrap the line around</p>';
  for (const [d, disp] of [['text-align:center', 'inline'], ['text-indent:40px', 'inline'], ['text-align-last:center', 'inline'], ['text-align:center', 'block'], ['text-indent:40px', 'block']]) {
    const css = `.a{width:300px}.x{display:${disp};${d}}`;
    const shot = async extra => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:10px;font:16px sans-serif}.a{width:300px}.x{display:${disp}}${extra}</style></head><body>${html}</body></html>`); return (await page.screenshot()).toString('base64'); };
    const inert = await shot('') === await shot(`.x{${d}}`);
    expect(inert, `${disp} ${d}`).toBe(disp === 'inline');
    const warned = (analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.some(p => /^text-(?:align|indent|align-last)$/.test(p)));
    expect(warned, `${disp} ${d}`).toBe(inert);
  }
});

test('F46: ::selection ignores box properties (font-size, padding, border, margin, outline) and the analysis reads it', async ({page}) => {
  for (const [d, ignored] of [['font-size:30px', true], ['font-weight:bold', true], ['letter-spacing:5px', true], ['opacity:0.2', true], ['padding:10px', true], ['border:2px solid red', true], ['margin:10px', true], ['outline:2px solid red', true], ['color:rgb(255,0,0)', false], ['background-color:rgb(255,255,0)', false]]) {
    const shot = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:10px;font:16px sans-serif}${css}</style></head><body><p class="x">Select this text</p></body></html>`);
      await page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('.x')); getSelection().removeAllRanges(); getSelection().addRange(r); }); await page.waitForTimeout(150); return (await page.screenshot()).toString('base64'); };
    // Against a ::selection rule without the property (WebKit paints the selection differently once any rule exists).
    expect(await shot('.x::selection{--z:1}') === await shot(`.x::selection{--z:1;${d}}`), d).toBe(ignored);
    const r = analyzeHTML('<html lang="en"><body><div class="x"></div></body></html>', {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.x{height:20px}.x::selection{${d}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect(r.status, d).toBe('verified');
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_SELECTION_IGNORED'), d).toBe(ignored);
  }
});

test('F47: margin, height, display and position in ::placeholder are ignored', async ({page}) => {
  const field = '<input class="x" placeholder="Search here" aria-label="q">';
  const base = '.x{display:block;inline-size:200px;block-size:30px;box-sizing:border-box;appearance:none;padding:0;border:0;min-inline-size:0;min-block-size:0}';
  for (const [d, ignored] of [['margin:10px', true], ['height:40px', true], ['display:block', true], ['position:absolute', true], ['color:rgb(255,0,0)', false], ['font-size:30px', false]]) {
    const shot = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:10px;font:16px sans-serif}${base}${css}</style></head><body>${field}</body></html>`); await page.waitForTimeout(50); return (await page.screenshot()).toString('base64') + await page.evaluate(() => JSON.stringify(document.querySelector('.x').getBoundingClientRect())); };
    expect(await shot('.x::placeholder{--z:1}') === await shot(`.x::placeholder{--z:1;${d}}`), d).toBe(ignored);
    const warned = (analyzeHTML(`<html lang="en"><body>${field}</body></html>`, {name: 'P', css: `${base}.x::placeholder{${d}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_CSS_PLACEHOLDER_IGNORED');
    expect(warned, d).toBe(ignored);
  }
});

test('F48: :link / :any-link match only a link with href', async ({page}) => {
  for (const [sel, html] of [['.x:any-link', '<a class="x a">no href</a>'], ['.x:link', '<a class="x a">no href</a>'], ['.x:link', '<button class="x a" type="button">b</button>'], ['.x:any-link', '<a class="x a" href="/y">y</a>'], ['.x:link', '<a class="x a" href="">e</a>']]) {
    await page.setContent(`<!doctype html><html lang="en"><body>${html}</body></html>`);
    const matched = await page.evaluate(s => document.querySelector('.x').matches(s), sel);
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{display:block;height:20px}${sel}{color:red}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_STATE_UNREACHABLE' && /link/.test(w.state ?? '')), `${sel} ${html}`).toBe(!matched);
    expect(r.diagnostics.some(d => /Unsupported selector/.test(d.message)), `${sel} ${html}`).toBe(false);
  }
});

test('F49: :placeholder-shown needs a placeholder attribute', async ({page}) => {
  const base = '.x{display:block;inline-size:200px;block-size:30px;box-sizing:border-box;appearance:none;padding:0;border:0;min-inline-size:0;min-block-size:0}';
  for (const html of ['<input class="x" aria-label="q" placeholder="Search">', '<input class="x" aria-label="q">', '<input class="x" aria-label="q" placeholder="">', '<input class="x" aria-label="q" placeholder="x" value="v">', '<textarea class="x" aria-label="q" placeholder="x"></textarea>', '<textarea class="x" aria-label="q"></textarea>', '<input class="x" type="number" aria-label="q" placeholder="0">']) {
    await page.setContent(`<!doctype html><html lang="en"><body>${html}</body></html>`);
    const matched = await page.evaluate(() => document.querySelector('.x').matches(':placeholder-shown'));
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${base}.x:placeholder-shown{border-color:red}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    const warned = (r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_STATE_UNREACHABLE' && w.state === ':placeholder-shown');
    // Warned exactly where the field has no placeholder attribute (it never matches, whatever is typed).
    expect(warned, html).toBe(!/placeholder=/.test(html));
    if (warned) expect(matched, html).toBe(false);
    expect(r.diagnostics.some(d => /Unsupported selector/.test(d.message)), html).toBe(false);
  }
});

test('F50: :required / :optional match form fields only', async ({page}) => {
  const base = '.x{display:block;inline-size:200px;block-size:30px;box-sizing:border-box;appearance:none;padding:0;border:0;min-inline-size:0;min-block-size:0}';
  for (const [sel, html, warn] of [['label:required', '<label class="x">Name</label>', true], ['.x:required', '<input class="x" type="range" aria-label="q" required>', true], ['.x:required', '<input class="x" type="color" aria-label="q" required>', true],
    ['.x:required', '<input class="x" aria-label="q" required>', false], ['.x:optional', '<input class="x" aria-label="q">', false], ['.x:required', '<select class="x" aria-label="q" required><option>a</option></select>', false], ['.x:optional', '<div class="x"></div>', true]]) {
    await page.setContent(`<!doctype html><html lang="en"><body>${html}</body></html>`);
    const matched = await page.evaluate(s => document.querySelector('.x').matches(s), sel);
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${base}${sel}{border-color:red}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    const warned = (r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_STATE_UNREACHABLE' && /^:(?:required|optional)$/.test(w.state ?? ''));
    expect(warned, `${sel} ${html}`).toBe(warn);
    if (warn) expect(matched, `${sel} ${html}`).toBe(false); else expect(matched, `${sel} ${html}`).toBe(true);
  }
});

test('F51: overflow on both html and body stops a sticky header from sticking', async ({page}) => {
  const html = '<header class="h"></header><main class="m"></main>';
  for (const css of ['', 'body{overflow-x:hidden}', 'html{overflow-x:hidden}', 'html,body{overflow-x:hidden}', 'html{overflow:auto}body{overflow:hidden}', 'html,body{overflow-x:clip}']) {
    await page.setViewportSize({width: 400, height: 300});
    await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}.h{position:sticky;top:0;height:40px;background:red}.m{height:2000px}${css}</style></head><body>${html}</body></html>`);
    await page.evaluate(() => window.scrollTo(0, 500)); await page.waitForTimeout(50);
    const sticks = await page.evaluate(() => Math.round(document.querySelector('.h').getBoundingClientRect().top) === 0);
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.h{position:sticky;top:0;height:40px}.m{height:2000px}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}, accessibility: true});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_STICKY_SCROLLER'), css || 'none').toBe(!sticks);
  }
});

test('F52: an invalid grid-template-areas is dropped (the layout is as without it)', async ({page}) => {
  const items = '<div class="x"><div class="a">a</div><div class="b">b</div></div>';
  const base = '.x{display:grid;grid-template-columns:100px 100px}.a,.b{height:20px}.a{grid-area:a}.b{grid-area:b}';
  const rects = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}${base}${css}</style></head><body>${items}</body></html>`); return page.evaluate(() => [...document.querySelectorAll('.a,.b')].map(e => JSON.stringify(e.getBoundingClientRect())).join()); };
  for (const [v, invalid] of [['"a b" "b b"', true], ['"a b" "a"', true], ['"a b" "c a"', true], ['"b a"', false], ['"a ." ". b"', false]]) {
    expect(await rects(`.x{grid-template-areas:${v}}`) === await rects(''), v).toBe(invalid);
    const warned = (analyzeHTML(`<html lang="en"><body>${items}</body></html>`, {name: 'P', css: `${base}.x{grid-template-areas:${v}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_CSS_GRID_AREAS_INVALID');
    expect(warned, v).toBe(invalid);
  }
});

test('F53: auto margin-top / margin-bottom are 0 in block flow; the analysed positions match', async ({page}) => {
  const html = '<div class="p"><div class="s"></div><div class="c"></div><div class="n"></div></div>';
  for (const [parent, child] of [['display:block', 'margin:auto 0'], ['display:block', 'margin-top:auto'], ['display:block', 'margin-bottom:auto']]) {
    const css = `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.p{${parent};height:200px}.s{height:30px}.c{${child};height:20px}.n{height:10px}`;
    await page.setViewportSize({width: 400, height: 300});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    const browser = await page.evaluate(() => ['.c', '.n'].map(s => document.querySelector(s).getBoundingClientRect().y));
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
    expect(r.status, child).toBe('verified');
    const at = sel => Number(r.sizes.find(s => s.box === sel).rect.blockStart.constant);
    expect([at('.c'), at('.n')], `${parent} ${child}`).toEqual(browser);
    expect(r.layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.some(p => /^margin-(?:top|bottom)$/.test(p))), child).toBe(true);
  }
});

test('F54: clear on a flex or grid item does nothing', async ({page}) => {
  const html = '<div class="p"><div class="a"></div><div class="x"></div><div class="a"></div></div>';
  for (const parent of ['display:flex', 'display:grid;grid-template-columns:50px 50px', 'display:flex;flex-direction:column']) {
    const base = `.p{${parent};width:200px}.a{width:30px;height:30px}.x{width:40px;height:20px}`;
    const rects = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}${base}${css}</style></head><body>${html}</body></html>`); return page.evaluate(() => [...document.querySelectorAll('.p > div')].map(e => JSON.stringify(e.getBoundingClientRect())).join()); };
    expect(await rects('.x{clear:both}'), parent).toBe(await rects(''));
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${base}.x{clear:both}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('clear')), parent).toBe(true);
    expect(r.diagnostics.some(d => /clear/.test(d.message)), parent).toBe(false);
  }
});

test('F55: a percentage top / bottom of a relative box in an auto-height block does not move it', async ({page}) => {
  const html = '<div class="g"><div class="p"><div class="s"></div><div class="c"></div><div class="n"></div></div></div>';
  for (const c of ['top:50%', 'bottom:20%', 'top:-30%']) {
    const css = `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.g,.p{display:block}.s{height:30px}.c{position:relative;height:20px;${c}}.n{height:10px}`;
    await page.setViewportSize({width: 400, height: 300});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    const browser = await page.evaluate(() => ['.c', '.n'].map(s => document.querySelector(s).getBoundingClientRect().y));
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
    expect(r.status, c).toBe('verified');
    expect(['.c', '.n'].map(sel => Number(r.sizes.find(s => s.box === sel).rect.blockStart.constant)), c).toEqual(browser);
    expect(r.layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.some(p => p === 'top' || p === 'bottom')), c).toBe(true);
  }
  // .p a stretched grid item (body is a grid): Chromium and Firefox resolve the percentage there; not reported.
  const gridHtml = '<div class="p"><div class="s"></div><div class="c"></div></div>';
  const gridCss = '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.p{display:block}.s{height:30px}.c{position:relative;height:20px;top:50%}';
  const r = analyzeHTML(`<html lang="en"><body>${gridHtml}</body></html>`, {name: 'P', css: gridCss, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
  expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('top'))).toBe(false);
  expect(r.status).toBe('unknown');
});

test('F56: a percentage height in an auto-height block (itself in block flow) is auto; the analysed sizes match', async ({page}) => {
  const html = '<div class="g"><div class="p"><div class="s"></div><div class="c"><div class="i"></div></div><div class="n"></div></div></div>';
  for (const [pcss, c] of [['', 'height:100%'], ['', 'height:50%'], ['', 'min-height:50%'], ['', 'max-height:10%'], ['min-height:300px', 'height:50%']]) {
    const css = `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.g,.p{display:block}.p{${pcss}}.s{height:30px}.i{height:20px}.n{height:10px}.c{${c}}`;
    await page.setViewportSize({width: 400, height: 300});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    const browser = await page.evaluate(() => [document.querySelector('.c').getBoundingClientRect().height, document.querySelector('.n').getBoundingClientRect().y]);
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
    expect(r.status, `${pcss} ${c}`).toBe('verified');
    const size = sel => r.sizes.find(s => s.box === sel).rect;
    expect([Number(size('.c').blockSize.constant), Number(size('.n').blockStart.constant)], `${pcss} ${c}`).toEqual(browser);
  }
});

test('F57: overflow, text-overflow and resize on an inline element do nothing', async ({page}) => {
  const html = '<p class="a">before <span class="x">a long span of text here</span> after</p>';
  for (const [d, disp] of [['overflow:hidden;text-overflow:ellipsis', 'inline'], ['overflow:auto', 'inline'], ['resize:both;overflow:auto', 'inline'], ['overflow:hidden', 'inline-block']]) {
    const shot = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:10px;font:16px sans-serif}.a{width:120px;white-space:nowrap}.x{display:${disp}}${css}</style></head><body>${html}</body></html>`); return (await page.screenshot()).toString('base64'); };
    const inert = await shot('') === await shot(`.x{${d}}`);
    expect(inert, `${disp} ${d}`).toBe(disp === 'inline');
    const warned = (analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `.a{width:120px;white-space:nowrap}.x{display:${disp};${d}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.some(p => /^(?:overflow-[xy]|text-overflow|resize)$/.test(p)));
    expect(warned, `${disp} ${d}`).toBe(inert);
  }
});

test('F58: text-decoration: none on a descendant does not remove an ancestor line', async ({page}) => {
  for (const [css, html, inert] of [['.c{text-decoration:none}', '<p class="a">t <a href="/y">link <span class="c">child</span></a></p>', true], ['.l{text-decoration:underline}.c{text-decoration:none}', '<p class="a l">text <span class="c">child</span></p>', true],
    ['.c{text-decoration:none}', '<p class="a">t <a class="c" href="/y">link</a></p>', false]]) {
    const shot = async extra => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:10px;font:16px sans-serif}${extra}</style></head><body>${html}</body></html>`); return (await page.screenshot()).toString('base64'); };
    const base = css.replace(/\.c\{text-decoration:none\}/, '');
    expect(await shot(base) === await shot(css), css).toBe(inert);
    const warned = (analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('text-decoration-line'));
    expect(warned, css).toBe(inert);
  }
});

test('F59: border-radius does not round the border of a collapsed table', async ({page}) => {
  const t = '<table class="t"><tbody><tr><td>a</td><td>b</td></tr></tbody></table>';
  for (const collapse of ['collapse', 'separate']) {
    const css = `.t{border-collapse:${collapse};border:3px solid red}td{padding:10px}`;
    const shot = async extra => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:10px}${css}${extra}</style></head><body>${t}</body></html>`); return (await page.screenshot()).toString('base64'); };
    const inert = await shot('') === await shot('.t{border-radius:12px}');
    expect(inert, collapse).toBe(collapse === 'collapse');
    const warned = (analyzeHTML(`<html lang="en"><body>${t}</body></html>`, {name: 'P', css: `${css}.t{border-radius:12px}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('border-radius'));
    expect(warned, collapse).toBe(inert);
  }
});

test('F60: gap on a table and padding on a collapsed table do nothing', async ({page}) => {
  const t = '<table class="t"><tbody><tr><td class="c">a</td><td class="c">b</td></tr><tr><td class="c">c</td><td class="c">d</td></tr></tbody></table>';
  for (const [collapse, d, inert] of [['separate', 'gap:10px', true], ['collapse', 'gap:10px', true], ['collapse', 'padding:10px', true], ['separate', 'padding:10px', false]]) {
    const base = `.t{border-collapse:${collapse};border-spacing:0;border:2px solid red}.c{padding:0}`;
    const m = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}${base}${css}</style></head><body>${t}</body></html>`); return page.evaluate(() => JSON.stringify([...document.querySelectorAll('td, table')].map(e => e.getBoundingClientRect()))); };
    expect(await m('') === await m(`.t{${d}}`), `${collapse} ${d}`).toBe(inert);
    const warned = (analyzeHTML(`<html lang="en"><body>${t}</body></html>`, {name: 'P', css: `${base}.t{${d}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.some(p => /^(?:row-gap|column-gap|padding-)/.test(p)));
    expect(warned, `${collapse} ${d}`).toBe(inert);
  }
});

test('F61: :read-write never matches what cannot be edited', async ({page}) => {
  const base = '.x{display:block;inline-size:200px;block-size:30px;box-sizing:border-box;appearance:none;padding:0;border:0;min-inline-size:0;min-block-size:0}';
  for (const [html, warn] of [['<div class="x"></div>', true], ['<input class="x" type="checkbox" aria-label="q">', true], ['<input class="x" type="range" aria-label="q">', true], ['<button class="x" type="button">b</button>', true],
    ['<input class="x" aria-label="q">', false], ['<input class="x" aria-label="q" readonly>', false], ['<textarea class="x" aria-label="q"></textarea>', false], ['<input class="x" type="number" aria-label="q">', false]]) {
    await page.setContent(`<!doctype html><html lang="en"><body>${html}</body></html>`);
    const [rw, ro] = await page.evaluate(() => [':read-write', ':read-only'].map(s => document.querySelector('.x').matches(s)));
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${base}.x:read-write{border-color:red}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_STATE_UNREACHABLE' && w.state === ':read-write'), html).toBe(warn);
    if (warn) expect([rw, ro], html).toEqual([false, true]);
    expect(r.diagnostics.some(d => /Unsupported selector/.test(d.message)), html).toBe(false);
  }
});

test('F62: :lang() follows the inherited lang; :lang(jp) matches no Japanese page', async ({page}) => {
  for (const [lang, sel, html] of [['ja-JP', ':lang(ja)', '<div class="a x"></div>'], ['ja-JP', ':lang(jp)', '<div class="a x"></div>'], ['ja', ':lang(en)', '<div class="a x" lang="en-US"></div>'], ['en', ':lang(ja)', '<div class="a x"></div>']]) {
    await page.setContent(`<!doctype html><html lang="${lang}"><body>${html}</body></html>`);
    const matched = await page.evaluate(s => document.querySelector('.x').matches(s), sel);
    const r = analyzeHTML(`<html lang="${lang}"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}.x${sel}{color:red}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect(r.diagnostics.some(d => /Unsupported selector/.test(d.message)), sel).toBe(false);
    expect(r.status, `${lang} ${sel}`).toBe('verified');
    if (sel === ':lang(jp)') { expect(matched).toBe(false); expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_LANG_CODE')).toBe(true); }
  }
});

test('F63: :dir() follows the dir attribute, not the CSS direction', async ({page}) => {
  for (const [css, html, warn] of [['.x{direction:rtl}', '<div class="x a"></div>', true], ['', '<div class="x a" dir="rtl"></div>', false], ['', '<div dir="rtl"><div class="x a"></div></div>', false], ['', '<div class="x a"></div>', false]]) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    const matched = await page.evaluate(() => document.querySelector('.x').matches(':dir(rtl)'));
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}${css}.x:dir(rtl){color:red}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect(r.diagnostics.some(d => /Unsupported selector/.test(d.message)), html).toBe(false);
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_STATE_UNREACHABLE' && w.state === ':dir'), `${css} ${html}`).toBe(warn);
    if (warn) expect(matched).toBe(false);
  }
});

test('F64: DOM properties written as HTML attributes do nothing', async ({page}) => {
  for (const [html, prop, idle] of [['<input class="x" type="checkbox" aria-label="q" indeterminate>', 'indeterminate', false], ['<textarea class="x" aria-label="q" value="hi"></textarea>', 'value', ''],
    ['<select class="x" aria-label="q" value="b"><option value="a">a</option><option value="b">b</option></select>', 'value', 'a'], ['<input class="x" aria-label="q" defaultValue="x">', 'value', '']]) {
    await page.setContent(`<!doctype html><html lang="en"><body>${html}</body></html>`);
    expect(await page.evaluate(p => document.querySelector('.x')[p], prop), html).toBe(idle);
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: '.x{display:block;inline-size:200px;block-size:30px;box-sizing:border-box;appearance:none;padding:0;border:0;min-inline-size:0;min-block-size:0}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_HTML_ATTRIBUTE_NOT_HTML'), html).toBe(true);
  }
});

test('F65: disabled on a link or div, checked on a text field, selected on a div do nothing', async ({page}) => {
  for (const [html, warn] of [['<a class="x" href="#y" disabled>link</a>', true], ['<div class="x" tabindex="0" disabled>d</div>', true], ['<input class="x" aria-label="q" checked>', true], ['<div class="x" selected>s</div>', true], ['<button class="x" type="button" disabled>b</button>', false]]) {
    await page.setContent(`<!doctype html><html lang="en"><body>${html}</body></html>`);
    const [disabled, focused, checked] = await page.evaluate(() => { const x = document.querySelector('.x'); x.focus(); return [x.matches(':disabled'), document.activeElement === x, x.matches(':checked')]; });
    if (warn) expect(disabled || checked, html).toBe(false);
    if (/disabled/.test(html) && warn) expect(focused, html).toBe(true);
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: '', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_HTML_ATTRIBUTE_NOT_HTML'), html).toBe(warn);
  }
});

test('F66: readonly on a checkbox, radio or select does not stop changes', async ({page}) => {
  for (const [html, act, warn] of [['<input class="x" type="checkbox" aria-label="q" readonly>', 'click', true], ['<input class="x" type="radio" name="g" aria-label="q" readonly>', 'click', true], ['<select class="x" aria-label="q" readonly><option>a</option><option>b</option></select>', 'select', true], ['<input class="x" aria-label="q" readonly value="v">', 'type', false]]) {
    await page.setContent(`<!doctype html><html lang="en"><body>${html}</body></html>`);
    if (act === 'click') await page.click('.x'); else if (act === 'select') await page.selectOption('.x', 'b'); else { await page.click('.x'); await page.keyboard.type('zz'); }
    const changed = await page.evaluate(() => { const x = document.querySelector('.x'); return x.type === 'checkbox' || x.type === 'radio' ? x.checked : x.tagName === 'SELECT' ? x.value === 'b' : x.value !== 'v'; });
    expect(changed, html).toBe(warn);
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: '', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_HTML_ATTRIBUTE_NOT_HTML'), html).toBe(warn);
  }
});

test('F67: placeholder where no placeholder shows, maxlength on a number input', async ({page}) => {
  for (const [h, warn] of [['<select class="x" aria-label="q"><option></option></select>', true], ['<input class="x" type="checkbox" aria-label="q">', true], ['<input class="x" type="date" aria-label="q">', true], ['<input class="x" type="number" aria-label="q">', false], ['<input class="x" aria-label="q">', false]]) {
    const shot = async attr => { await page.setContent(`<!doctype html><html lang="en"><body style="margin:10px">${h.replace('class="x"', `class="x" ${attr}`)}</body></html>`); return (await page.screenshot()).toString('base64'); };
    expect(await shot('') === await shot('placeholder="Pick one"'), h).toBe(warn);
    const r = analyzeHTML(`<html lang="en"><body>${h.replace('class="x"', 'class="x" placeholder="Pick one"')}</body></html>`, {name: 'P', css: '', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_HTML_ATTRIBUTE_NOT_HTML'), h).toBe(warn);
  }
  await page.setContent('<!doctype html><html lang="en"><body><input class="x" type="number" aria-label="q" maxlength="2"></body></html>');
  await page.click('.x'); await page.keyboard.type('12345');
  expect(await page.evaluate(() => document.querySelector('.x').value)).toBe('12345');
  expect((analyzeHTML('<html lang="en"><body><input class="x" type="number" aria-label="q" maxlength="2"></body></html>', {name: 'P', css: '', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_HTML_ATTRIBUTE_NOT_HTML')).toBe(true);
});

test('F68: input type=hidden is not rendered whatever the author display', async ({page}) => {
  const html = '<div class="a"></div><input class="x" type="hidden" name="t" value="1">';
  for (const css of ['', '.x{display:block;inline-size:50px;block-size:20px}', '.x{display:block !important;width:50px;height:20px}']) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>.a{height:20px}${css}</style></head><body>${html}</body></html>`);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.x')).display), css).toBe('none');
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect(r.status, css).toBe('verified');
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('display')), css).toBe(css !== '');
  }
});

test('F69: a datalist is not rendered; the analysis lays out the page around it', async ({page}) => {
  const html = '<div class="a"></div><input class="f" list="d" aria-label="q"><datalist id="d"><option value="a">a</option><option value="b">b</option></datalist><div class="n"></div>';
  const css = '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}.n{height:10px}.f{display:block;inline-size:200px;block-size:30px;box-sizing:border-box;appearance:none;padding:0;border:0;min-inline-size:0;min-block-size:0}';
  await page.setViewportSize({width: 400, height: 300});
  await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
  const y = await page.evaluate(() => document.querySelector('.n').getBoundingClientRect().y);
  const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
  expect(r.status).toBe('verified');
  expect(Number(r.sizes.find(s => s.box === '.n').rect.blockStart.constant)).toBe(y);
});

test('F70: :nth-child(An+B of S) — the analysed heights match the browser', async ({page}) => {
  const html = '<div class="w"><div class="i v"></div><div class="i"></div><div class="i v"></div><div class="i v"></div><div class="i"></div></div>';
  for (const sel of [':nth-child(2 of .v)', ':nth-child(odd of .v)', ':nth-last-child(1 of .v)', ':nth-child(-n+2 of .v)']) {
    const css = `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.i{height:10px}.i${sel}{height:30px}`;
    await page.setViewportSize({width: 400, height: 300});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    const browser = await page.evaluate(() => [...document.querySelectorAll('.i')].map(e => e.getBoundingClientRect().height));
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
    expect(r.status, sel).toBe('verified');
    expect(r.sizes.filter(s => s.box.startsWith('.i')).map(s => Number(s.rect.blockSize.constant)), sel).toEqual(browser);
  }
});

test('visibility: collapse removes a table row: the analysis does not lay it out as hidden', async ({page}) => {
  const t = '<table class="t"><tbody><tr><td class="c"></td></tr><tr class="x"><td class="c"></td></tr><tr><td class="c n"></td></tr></tbody></table>';
  const css = '*{margin:0;padding:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.t{table-layout:fixed;inline-size:200px;border-spacing:0}.c{inline-size:200px;block-size:20px}';
  for (const [v, y, status] of [['hidden', 40, 'verified'], ['collapse', 20, 'unknown']]) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}.x{visibility:${v}}</style></head><body>${t}</body></html>`);
    expect(await page.evaluate(() => document.querySelector('.n').getBoundingClientRect().y), v).toBe(y);
    const r = analyzeHTML(`<html lang="en"><body>${t}</body></html>`, {name: 'P', css: `${css}.x{visibility:${v}}`, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
    expect(r.status, v).toBe(status);
    if (status === 'verified') expect(Number(r.sizes.find(s => s.box.includes('.n')).rect.blockStart.constant)).toBe(y);
  }
});

test('F71: a canvas box of another shape than its bitmap stretches the drawing', async ({page}) => {
  for (const [attrs, css] of [['', 'width:300px;height:300px'], ['width="200" height="200"', 'width:300px;height:300px'], ['width="400" height="200"', 'width:300px;height:300px'], ['', 'width:300px;height:150px']]) {
    // (The script is in a block: setContent keeps the page's global scope, where a second const would throw.)
    const shot = async fit => { await page.setContent(`<!doctype html><html lang="en"><body style="margin:0"><canvas class="x" ${attrs} style="display:block;${css};${fit}"></canvas><script>{const c=document.querySelector('.x'),x=c.getContext('2d');x.fillStyle='red';x.fillRect(0,0,c.width/2,c.height);}</script></body></html>`); await page.waitForTimeout(150); return page.screenshot(); };
    const stretched = !(await shot('')).equals(await shot('object-fit:contain'));
    const r = analyzeHTML(`<html lang="en"><body><canvas class="x" ${attrs}></canvas></body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.x{display:block;${css}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect(r.status, `${attrs} ${css}`).toBe('verified');
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_IMAGE_DISTORTED'), `${attrs} ${css}`).toBe(stretched);
  }
});

test('F72: a negative z-index with no stacking context above puts the box behind its ancestors', async ({page}) => {
  const html = '<div class="w"><div class="p"><div class="c" id="c"></div></div></div>';
  for (const css of ['.p{background:#fff}', '', '.p{background:#fff;isolation:isolate}', '.p{background:#fff;position:relative;z-index:0}', '.w{opacity:.9}', '.p{opacity:.9}']) {
    const sheet = `.p{padding:20px}.c{position:relative;z-index:-1;width:50px;height:50px;background:red}${css}`;
    await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}${sheet}</style></head><body>${html}</body></html>`);
    const behind = await page.evaluate(() => document.elementFromPoint(30, 30)?.id !== 'c');
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${sheet}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_NEGATIVE_Z_BEHIND'), css || 'none').toBe(behind);
  }
});

test('F73: a first child margin collapsing through a parent with a background', async ({page}) => {
  const html = '<div class="w"><div class="card"><div class="t"></div></div></div>';
  for (const [css, warn] of [['.card{background:#eee}', true], ['.card{background:#eee;padding-top:1px}', false], ['.card{background:#eee;display:flow-root}', false], ['', false]]) {
    const sheet = `.w{display:block}.t{height:20px;margin-top:20px}${css}`;
    await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}${sheet}</style></head><body>${html}</body></html>`);
    const through = await page.evaluate(() => document.querySelector('.card').getBoundingClientRect().y === document.querySelector('.t').getBoundingClientRect().y);
    if (warn) expect(through, css).toBe(true);
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${sheet}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_MARGIN_COLLAPSE_THROUGH'), css || 'none').toBe(warn);
  }
});

test('F74: a relative box with both insets on an axis ignores one', async ({page}) => {
  for (const [dir, c, ignored] of [['ltr', 'left:10px;right:30px', 'right'], ['rtl', 'left:10px;right:30px', 'left'], ['ltr', 'top:10px;bottom:30px', 'bottom']]) {
    const at = async css => { await page.setContent(`<!doctype html><html lang="en" dir="${dir}"><head><style>body{margin:0}.w{width:300px}.x{position:relative;width:50px;height:20px;${css}}</style></head><body><div class="w"><div class="x"></div></div></body></html>`); return page.evaluate(() => JSON.stringify(document.querySelector('.x').getBoundingClientRect())); };
    // Changing the ignored inset moves nothing.
    expect(await at(c), c).toBe(await at(c.replace(new RegExp(`${ignored}:\\d+px`), `${ignored}:77px`)));
    const r = analyzeHTML(`<html lang="en" dir="${dir}"><body><div class="w"><div class="x"></div></div></body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.w{width:300px}.x{position:relative;width:50px;height:20px;${c}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).find(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && ['left', 'right', 'top', 'bottom'].includes(w.properties[0]))?.properties, `${dir} ${c}`).toEqual([ignored]);
  }
});

test('F75: line-height on a select of appearance auto changes nothing', async ({page}) => {
  for (const [extra, inert] of [['', true], ['appearance:none;', false]]) {
    const html = '<select class="x" aria-label="q"><option>a</option></select>';
    const m = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>.x{${extra}${css}}</style></head><body>${html}</body></html>`); await page.waitForTimeout(30); return (await page.screenshot()).toString('base64') + await page.evaluate(() => document.querySelector('.x').getBoundingClientRect().height); };
    expect(await m('') === await m('line-height:50px'), extra || 'auto').toBe(inert);
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `.x{${extra}line-height:50px}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('line-height')), extra || 'auto').toBe(inert);
  }
});

test('F76: flex / grid container properties on an inline element change nothing', async ({page}) => {
  const html = '<p class="a">t <span class="x">aa <b>bb</b> <i>cc</i> dd ee ff gg hh</span> u</p>';
  for (const [d, disp] of [['gap:20px;justify-content:center', 'inline'], ['grid-template-columns:1fr 1fr', 'inline'], ['flex-direction:column;align-items:center', 'inline'], ['gap:20px', 'inline-flex']]) {
    const shot = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:10px;font:16px sans-serif}.a{width:300px}.x{display:${disp}}${css}</style></head><body>${html}</body></html>`); return (await page.screenshot()).toString('base64'); };
    const inert = await shot('') === await shot(`.x{${d}}`);
    expect(inert, `${disp} ${d}`).toBe(disp === 'inline');
    const warned = (analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `.a{width:300px}.x{display:${disp};${d}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && /display: inline element/.test(w.message) && w.properties.some(p => /gap|grid-|flex-|justify|align/.test(p)));
    expect(warned, `${disp} ${d}`).toBe(inert);
  }
});

test('F77: float on an absolutely positioned box computes to none', async ({page}) => {
  const html = '<div class="w"><div class="x" id="x"></div></div>';
  for (const pos of ['absolute', 'fixed']) {
    const css = `.w{position:relative;height:100px}.x{position:${pos};top:0;left:0;width:20px;height:20px}`;
    const at = async f => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}${css}${f}</style></head><body>${html}</body></html>`); return page.evaluate(() => getComputedStyle(document.getElementById('x')).float + JSON.stringify(document.getElementById('x').getBoundingClientRect())); };
    const plain = await at(''), floated = await at('.x{float:right}');
    expect(floated.startsWith('none'), pos).toBe(true);
    expect(floated.slice(4), pos).toBe(plain.slice(4));
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${css}.x{float:right}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}, accessibility: true});
    expect(r.status, pos).not.toBe('violated');
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('float')), pos).toBe(true);
  }
});

test('F78: a media query with var() never matches', async ({page}) => {
  const css = '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}:root{--bp:600px}.a{height:20px}@media (min-width: var(--bp)){.a{height:40px}}';
  await page.setViewportSize({width: 800, height: 300});
  await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body><div class="a"></div></body></html>`);
  expect(await page.evaluate(() => document.querySelector('.a').getBoundingClientRect().height)).toBe(20);
  const r = analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
  expect(r.status).toBe('verified');
  expect(Number(r.sizes.find(s => s.box === '.a').rect.blockSize.constant)).toBe(20);
  expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_MEDIA_VAR')).toBe(true);
});

test('F79: a media query with a unitless or spaced length never matches', async ({page}) => {
  await page.setViewportSize({width: 800, height: 300});
  for (const q of ['(min-width: 600)', '(width >= 600)', '(min-width: 600 px)']) {
    const css = `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}@media ${q}{.a{height:40px}}`;
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body><div class="a"></div></body></html>`);
    expect(await page.evaluate(() => document.querySelector('.a').getBoundingClientRect().height), q).toBe(20);
    const r = analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect(r.status, q).toBe('verified');
    expect(Number(r.sizes.find(s => s.box === '.a').rect.blockSize.constant), q).toBe(20);
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_MEDIA_INVALID_LENGTH'), q).toBe(true);
  }
  expect(await page.evaluate(() => matchMedia('(min-width: 0)').matches)).toBe(true);
});

test('F80: overflow-wrap does nothing under white-space: nowrap or pre', async ({page}) => {
  const word = 'averyveryveryverylongwordthatdoesnotfit';
  const measure = async css => {
    await page.setContent(`<!doctype html><html lang="en"><head><style>*{margin:0}.t{width:100px;font:16px monospace}${css}</style></head><body><div class="t">${word}</div></body></html>`);
    return page.evaluate(() => { const t = document.querySelector('.t'); return [t.getBoundingClientRect().height, t.scrollWidth]; });
  };
  for (const ws of ['nowrap', 'pre']) for (const ow of ['anywhere', 'break-word'])
    expect(await measure(`.t{white-space:${ws};overflow-wrap:${ow}}`), `${ws} ${ow}`).toEqual(await measure(`.t{white-space:${ws}}`));
  // under normal wrapping it does break the word (so the check above is not vacuous)
  expect((await measure('.t{overflow-wrap:anywhere}'))[0]).toBeGreaterThan((await measure(''))[0]);
  const r = analyzeHTML(`<html lang="en"><body><div class="t">${word}</div></body></html>`, {name: 'P', css: '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.t{width:100px;height:20px;overflow:hidden;white-space:nowrap;overflow-wrap:anywhere}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}, boxes: {'.t': {overflow: 'clip', overflowBlock: 'clip'}}});
  expect(r.status).toBe('verified');
  expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('overflow-wrap'))).toBe(true);
});

test('F81: column-span outside a multi-column container does nothing', async ({page}) => {
  const measure = async css => {
    await page.setContent(`<!doctype html><html lang="en"><head><style>*{margin:0}.p{width:300px}.a{height:20px}.b{height:30px}${css}</style></head><body><div class="p"><div class="a"></div><div class="b"></div></div></body></html>`);
    return page.evaluate(() => [...document.querySelectorAll('.p,.a,.b')].map(e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
  };
  expect(await measure('.a{column-span:all}')).toEqual(await measure(''));
  // in a multi-column container it does take the box out of the columns (so the check above is not vacuous)
  expect(await measure('.p{columns:2}.a{column-span:all}')).not.toEqual(await measure('.p{columns:2}'));
  const r = analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px;column-span:all}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
  expect(r.status).toBe('verified');
  expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('column-span'))).toBe(true);
});

test('F82: empty-cells: hide does nothing with border-collapse: collapse', async ({page}) => {
  const shot = async css => {
    await page.setContent(`<!doctype html><html lang="en"><head><style>*{margin:0}td{width:40px;height:20px;background:rgb(255,0,0);border:2px solid rgb(0,0,255)}${css}</style></head><body><table><tbody><tr><td>a</td><td></td></tr></tbody></table></body></html>`);
    return (await page.locator('table').screenshot()).toString('base64');
  };
  expect(await shot('table{border-collapse:collapse;empty-cells:hide}')).toBe(await shot('table{border-collapse:collapse}'));
  // with separate borders it does hide the empty cell (so the check above is not vacuous)
  expect(await shot('table{empty-cells:hide}')).not.toBe(await shot(''));
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const r = analyzeHTML('<html lang="en"><body><main class="p"><table class="t"><tbody><tr><td class="c"><div class="x"></div></td><td class="c"></td></tr></tbody></table></main></body></html>',
    {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{display:block}.c{padding:8px}.x{display:block;height:24px;width:24px}.t{border-collapse:collapse;empty-cells:hide}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
  expect(r.status).toBe('verified');
  expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('empty-cells'))).toBe(true);
});

const pixelsAndBoxes = async (page, css, html) => {
  await page.setContent(`<!doctype html><html lang="en"><head><style>*{margin:0}${css}</style></head><body>${html}</body></html>`);
  const boxes = await page.evaluate(() => [...document.querySelectorAll('body *')].map(e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
  return [boxes, (await page.screenshot({clip: {x: 0, y: 0, width: 300, height: 120}})).toString('base64')];
};

test('F83: transform-origin with no transform does nothing', async ({page}) => {
  const base = '.a{width:100px;height:50px;background:rgb(255,0,0)}';
  expect(await pixelsAndBoxes(page, `${base}.a{transform-origin:0 0}`, '<div class="a"></div>')).toEqual(await pixelsAndBoxes(page, base, '<div class="a"></div>'));
  // with a transform it moves the result (so the check above is not vacuous)
  expect(await pixelsAndBoxes(page, `${base}.a{transform:scale(.5);transform-origin:0 0}`, '<div class="a"></div>')).not.toEqual(await pixelsAndBoxes(page, `${base}.a{transform:scale(.5)}`, '<div class="a"></div>'));
  const r = analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px;transform-origin:0 0}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
  expect(r.status).toBe('verified');
  expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('transform-origin'))).toBe(true);
});

test('F88: list-style-position on an element that is not a list item does nothing', async ({page}) => {
  const base = '.a{width:100px;padding-left:40px;font:16px monospace}';
  expect(await pixelsAndBoxes(page, `${base}.a{list-style-position:inside}`, '<div class="a">x</div>')).toEqual(await pixelsAndBoxes(page, base, '<div class="a">x</div>'));
  // on a list item it moves the marker inside (so the check above is not vacuous)
  expect(await pixelsAndBoxes(page, `${base}.a{display:list-item;list-style-position:inside}`, '<div class="a">x</div>')).not.toEqual(await pixelsAndBoxes(page, `${base}.a{display:list-item}`, '<div class="a">x</div>'));
  const r = analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px;list-style-position:inside}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
  expect(r.status).toBe('verified');
  expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('list-style-position'))).toBe(true);
});

test('F86: a misspelled !important drops the declaration; !IMPORTANT and "! important" are valid', async ({page}) => {
  const css = '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}';
  const height = async extra => {
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}${extra}</style></head><body><div class="a"></div></body></html>`);
    return page.evaluate(() => document.querySelector('.a').getBoundingClientRect().height);
  };
  for (const [mark, expected] of [['!imporant', 20], ['!importent', 20], ['! improtant', 20], ['!important', 40], ['!IMPORTANT', 40], ['! important', 40]]) {
    expect(await height(`.a{height:40px ${mark}}`), mark).toBe(expected);
    const r = analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: `${css}.a{height:40px ${mark}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect(r.status, mark).toBe('verified');
    expect(Number(r.sizes.find(s => s.box === '.a').rect.blockSize.constant), mark).toBe(expected);
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_IMPORTANT_TYPO'), mark).toBe(expected === 20);
  }
});

test('F87: "and(" in a media query never matches; "and (" does', async ({page}) => {
  const css = '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}';
  for (const [query, expected] of [['screen and(min-width:0px)', 20], ['screen and (min-width:0px)', 40], ['(min-width: 0px) or(max-width: 1px)', 20], ['not(max-width: 1px)', 20]]) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}@media ${query}{.a{height:40px}}</style></head><body><div class="a"></div></body></html>`);
    expect(await page.evaluate(() => document.querySelector('.a').getBoundingClientRect().height), query).toBe(expected);
    const r = analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: `${css}@media ${query}{.a{height:40px}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect(r.status, query).toBe('verified');
    expect(Number(r.sizes.find(s => s.box === '.a').rect.blockSize.constant), query).toBe(expected);
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_MEDIA_AND_SPACE'), query).toBe(expected === 20);
  }
});

test('F89: + and - in calc() need spaces on both sides; without them the declaration is dropped', async ({page}) => {
  const css = '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}';
  await page.setViewportSize({width: 800, height: 300});
  for (const [value, expected] of [['calc(100%-10px)', 800], ['calc(100% -10px)', 800], ['calc(100%- 10px)', 800], ['min(100%-10px, 900px)', 800], ['calc(100% - 10px)', 790], ['calc(50% - -10px)', 410], ['calc(50%*2 - 10px)', 790]]) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}.a{width:${value}}</style></head><body><div class="a"></div></body></html>`);
    expect(await page.evaluate(() => document.querySelector('.a').getBoundingClientRect().width), value).toBe(expected);
    const r = analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: `${css}.a{width:${value}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect(r.status, value).toBe('verified');
    const w = r.sizes.find(s => s.box === '.a').rect.inlineSize;
    const n = x => { const [a, b = '1'] = String(x).split('/'); return Number(a) / Number(b); };
    expect(n(w.coefficient) * 800 + n(w.constant), value).toBe(expected);
    expect((r.layoutWarnings ?? []).some(x => x.code === 'W_CSS_CALC_OPERATOR_SPACE'), value).toBe(expected === 800);
  }
});

test('F92: gap on a block container does nothing, with or without children', async ({page}) => {
  for (const html of ['<div class="a"><div class="c"></div><div class="c"></div></div>', '<div class="a"></div>']) {
    const base = '.a{width:100px;min-height:5px}.c{height:10px}';
    expect(await pixelsAndBoxes(page, `${base}.a{gap:20px}`, html), html).toEqual(await pixelsAndBoxes(page, base, html));
    expect(await pixelsAndBoxes(page, `${base}.a{display:inline-block;gap:20px}`, html), html).toEqual(await pixelsAndBoxes(page, `${base}.a{display:inline-block}`, html));
  }
  // with display: flex the gap spaces the items (so the check above is not vacuous)
  const flex = '.a{display:flex;flex-direction:column;width:100px}.c{height:10px}', two = '<div class="a"><div class="c"></div><div class="c"></div></div>';
  expect(await pixelsAndBoxes(page, `${flex}.a{gap:20px}`, two)).not.toEqual(await pixelsAndBoxes(page, flex, two));
  const r = analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px;gap:20px}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
  expect(r.status).toBe('verified');
  expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('row-gap'))).toBe(true);
});

test('F93: a unitless length other than 0 drops the declaration in standards mode', async ({page}) => {
  const base = '.a{width:200px;height:20px}';
  for (const decl of ['width:100', 'height:40', 'margin-top:10', 'padding:5', 'margin:0 10', 'border-radius:4', 'font-size:30', 'letter-spacing:2', 'inset:5;position:relative']) {
    expect(await pixelsAndBoxes(page, `${base}.a{${decl}}`, '<div class="a">ab</div>'), decl).toEqual(await pixelsAndBoxes(page, base, '<div class="a">ab</div>'));
    const r = analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}.a{${decl}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_UNITLESS_LENGTH'), decl).toBe(true);
  }
  // 0 needs no unit, and with px the declaration applies (so the check above is not vacuous)
  expect(await pixelsAndBoxes(page, `${base}.a{width:100px}`, '<div class="a">ab</div>')).not.toEqual(await pixelsAndBoxes(page, base, '<div class="a">ab</div>'));
  expect(await pixelsAndBoxes(page, `${base}.a{width:0}`, '<div class="a">ab</div>')).not.toEqual(await pixelsAndBoxes(page, base, '<div class="a">ab</div>'));
});

test('F94: border-radius on a table row or row group does nothing', async ({page}) => {
  const html = '<table><tbody class="g"><tr class="r"><td>a</td><td>b</td></tr></tbody></table>';
  for (const model of ['', 'table{border-collapse:collapse}'])
    for (const [box, paint] of [['.r', '.r{background:rgb(255,0,0);border:3px solid rgb(0,0,255)}'], ['.g', '.g{background:rgb(255,0,0)}']]) {
      const base = `${model}td{width:40px;height:30px}${paint}`;
      expect(await pixelsAndBoxes(page, `${base}${box}{border-radius:12px}`, html), `${model} ${box}`).toEqual(await pixelsAndBoxes(page, base, html));
    }
  // on the cells it does round the corners (so the check above is not vacuous)
  const cells = 'td{width:40px;height:30px;background:rgb(255,0,0)}';
  expect(await pixelsAndBoxes(page, `${cells}td{border-radius:12px}`, html)).not.toEqual(await pixelsAndBoxes(page, cells, html));
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const r = analyzeHTML('<html lang="en"><body><main class="p"><table class="t"><tbody class="g"><tr class="r"><td class="c"><div class="x"></div></td></tr></tbody></table></main></body></html>',
    {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{display:block}.c{padding:8px}.x{display:block;height:24px;width:24px}.r{border-radius:8px}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
  expect(r.status).toBe('verified');
  expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.box === '.r' && w.properties.includes('border-radius'))).toBe(true);
});

test('F84: tab-size does nothing where white-space collapses tabs', async ({page}) => {
  const html = '<div class="a">a\tb\tc</div>';
  for (const ws of ['normal', 'nowrap', 'pre-line']) {
    const base = `.a{font:16px monospace;width:max-content;white-space:${ws}}`;
    expect(await pixelsAndBoxes(page, `${base}.a{tab-size:2}`, html), ws).toEqual(await pixelsAndBoxes(page, base, html));
  }
  // with white-space: pre it changes the line (so the check above is not vacuous)
  const pre = '.a{font:16px monospace;width:max-content;white-space:pre}';
  expect(await pixelsAndBoxes(page, `${pre}.a{tab-size:2}`, html)).not.toEqual(await pixelsAndBoxes(page, pre, html));
  const r = analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px;tab-size:2}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
  expect(r.status).toBe('verified');
  expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('tab-size'))).toBe(true);
});

test('F96: in a fixed table a width on a cell after the first row does nothing', async ({page}) => {
  const row = cls => `<tr><td class="${cls}">x</td><td>y</td></tr>`;
  const base = 'table{table-layout:fixed;width:300px}';
  for (const body of [`<tbody>${row('a')}${row('b')}</tbody>`, `<tbody>${row('a')}</tbody><tbody>${row('b')}</tbody>`]) {
    const html = `<table>${body}</table>`;
    expect(await pixelsAndBoxes(page, `${base}.b{width:200px}`, html), body).toEqual(await pixelsAndBoxes(page, base, html));
    // on the first row's cell it sizes the column (so the check above is not vacuous)
    expect(await pixelsAndBoxes(page, `${base}.a{width:200px}`, html), body).not.toEqual(await pixelsAndBoxes(page, base, html));
  }
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const arow = cls => `<tr><td class="c ${cls}"><div class="x"></div></td><td class="c"><div class="x"></div></td></tr>`;
  const r = analyzeHTML(`<html lang="en"><body><main class="p"><table class="t"><tbody>${arow('a')}${arow('b')}</tbody></table></main></body></html>`,
    {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{display:block}.t{table-layout:fixed;width:300px}.c{padding:8px}.x{display:block;height:24px;width:24px}.b{width:200px}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
  expect(r.status).toBe('verified');
  expect(r.sizes.find(s => s.box === '.c.b').rect.inlineSize.constant).toBe('147');
  expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.box === '.c.b' && w.properties.includes('inline-size'))).toBe(true);
});


test('F98: aspect-ratio does nothing on table cells and rows or on non-replaced inline elements', async ({page}) => {
  const T = t => `<table><tbody><tr class="r"><td class="a">${t}</td><td>y</td></tr></tbody></table>`;
  for (const t of ['some text here', '', '<div style="width:60px;height:10px"></div>'])
    for (const layout of ['td{width:100px}', '', 'table{width:300px}', 'table{table-layout:fixed;width:300px}']) {
      expect(await pixelsAndBoxes(page, `${layout}.a{aspect-ratio:1}`, T(t)), `${layout} ${t}`).toEqual(await pixelsAndBoxes(page, layout, T(t)));
      expect(await pixelsAndBoxes(page, `${layout}.r{aspect-ratio:2}`, T(t)), `row ${layout} ${t}`).toEqual(await pixelsAndBoxes(page, layout, T(t)));
    }
  for (const html of ['<p><span class="a">some text</span></p>', '<p><span class="a"></span>x</p>'])
    expect(await pixelsAndBoxes(page, '.a{aspect-ratio:1;width:100px}', html), html).toEqual(await pixelsAndBoxes(page, '.a{width:100px}', html));
  // on an inline-block it does size the box (so the checks above are not vacuous)
  const ib = '<p><span class="a"></span>x</p>';
  expect(await pixelsAndBoxes(page, '.a{display:inline-block;width:100px;aspect-ratio:1}', ib)).not.toEqual(await pixelsAndBoxes(page, '.a{display:inline-block;width:100px}', ib));
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const r = analyzeHTML('<html lang="en"><body><main class="p"><table class="t"><tbody><tr><td class="c a"><div class="x"></div></td></tr></tbody></table></main></body></html>',
    {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{display:block}.c{padding:8px}.x{display:block;height:24px;width:24px}.a{aspect-ratio:1}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
  expect(r.status).toBe('verified');
  expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('aspect-ratio'))).toBe(true);
});

test('F99, F100: an invalid unquoted font-family or a font shorthand without size or family drops the declaration', async ({page}) => {
  const computed = async decl => {
    await page.setContent(`<!doctype html><html lang="en"><head><style>.a{font-size:30px;font-family:monospace}.a{${decl}}</style></head><body><div class="a">x</div></body></html>`);
    return page.evaluate(() => getComputedStyle(document.querySelector('.a')).fontSize);
  };
  for (const [decl, dropped] of [['font:16px Font Awesome 5 Free', true], ['font-family:Foo, 3D Bar, serif', true], ['font:16px -2x, serif', true], ['font:16px a.b', true], ['font:16px', true], ['font:bold Arial', true], ['font:italic 16px', true],
    ['font:16px "Font Awesome 5 Free"', false], ['font:16px Foo-3, serif', false], ['font:16px serif', false], ['font-family:Segoe UI, Roboto', false], ['font:italic bold 16px/1.5 Georgia, serif', false]]) {
    const browser = await computed(decl);
    // a dropped font shorthand leaves 30px; a dropped font-family leaves the size alone either way, so check its family
    if (decl.startsWith('font:')) expect(browser, decl).toBe(dropped ? '30px' : '16px');
    else expect(await page.evaluate(() => getComputedStyle(document.querySelector('.a')).fontFamily) === 'monospace', decl).toBe(dropped);
    const r = analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px;font-size:30px;width:1em}.a{${decl}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect(r.status, decl).toBe('verified');
    if (decl.startsWith('font:')) expect(r.sizes.find(s => s.box === '.a').rect.inlineSize.constant, decl).toBe(dropped ? '30' : '16');
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_FONT_INVALID'), decl).toBe(dropped);
  }
});

test('F104: list-style-image on an element that is not a list item does nothing', async ({page}) => {
  const base = '.a{width:100px;padding-left:40px;font:16px monospace}';
  const svg = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><rect width="12" height="12" fill="red"/></svg>');
  const img = `list-style-image:url("data:image/svg+xml,${svg}")`;
  // shots taken once the image has had time to load
  const loaded = async (css, html) => { const [boxes] = await pixelsAndBoxes(page, css, html); await page.waitForTimeout(200); return [boxes, (await page.screenshot({clip: {x: 0, y: 0, width: 300, height: 120}})).toString('base64')]; };
  expect(await loaded(`${base}.a{${img}}`, '<div class="a">x</div>')).toEqual(await loaded(base, '<div class="a">x</div>'));
  // on a list item it replaces the marker (so the check above is not vacuous; a ul gives the marker room to show)
  expect(await loaded(`li{${img}}`, '<ul><li>x</li></ul>')).not.toEqual(await loaded('', '<ul><li>x</li></ul>'));
  const r = analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px;${img}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
  expect(r.status).toBe('verified');
  expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('list-style-image'))).toBe(true);
});

test('F101: an invalid grid track list drops the declaration', async ({page}) => {
  const html = '<div class="g"><div class="i"></div><div class="i"></div></div>';
  const css = '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.g{display:grid;width:300px;grid-template-columns:100px 200px}.i{height:20px}';
  for (const [v, dropped] of [['repeat(auto-fill,1fr)', true], ['repeat(auto-fill,100px) 1fr', true], ['minmax(1fr,1fr)', true], ['repeat(0,1fr)', true], ['1fr -10px', true], ['fit-content(1fr)', true],
    ['repeat(auto-fill,100px)', false], ['repeat(auto-fit,minmax(100px,1fr))', false], ['minmax(100px,1fr) 1fr', false]]) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}.g{grid-template-columns:${v}}</style></head><body>${html}</body></html>`);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.g')).gridTemplateColumns) === '100px 200px', v).toBe(dropped);
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `${css}.g{grid-template-columns:${v}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_GRID_TRACKS_INVALID'), v).toBe(dropped);
    if (dropped) {
      expect(r.status, v).toBe('verified');
      expect(r.sizes.filter(s => s.box === '.i').map(s => s.rect.inlineSize.constant), v).toEqual(['100', '200']);
    }
  }
});

test('F102: a CSS counter that nothing reads changes nothing', async ({page}) => {
  const html = '<ol class="l"><li class="i">a</li><li class="i">b</li></ol><div class="d">c</div>';
  const base = '.l{font:16px monospace}';
  for (const extra of ['.i{counter-increment:step}', '.l{counter-reset:step 5}.i{counter-increment:step 2}', '.d{counter-set:other 3}'])
    expect(await pixelsAndBoxes(page, base + extra, html), extra).toEqual(await pixelsAndBoxes(page, base, html));
  // once a counter() shows it, it does change the page (so the check above is not vacuous)
  const shown = `${base}.i::before{content:counter(step) " "}`;
  expect(await pixelsAndBoxes(page, `${shown}.i{counter-increment:step 5}`, html)).not.toEqual(await pixelsAndBoxes(page, shown, html));
  const r = analyzeHTML('<html lang="en"><body><ol class="l"><li class="i"></li></ol></body></html>', {name: 'P', css: '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.i{height:20px;counter-increment:step}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
  expect((r.layoutWarnings ?? []).filter(w => w.code === 'W_CSS_COUNTER_UNUSED').map(w => w.counter)).toEqual(['step']);
});

test('F103: margin auto does not centre an inline-level box in a block container; in a flex container it does', async ({page}) => {
  for (const display of ['inline-block', 'inline-flex', 'inline-grid', 'inline-table', 'inline'])
    for (const html of ['<div class="p"><span class="a">x</span></div>', '<div class="p">t <span class="a">x</span> u</div>']) {
      const base = `.p{width:400px}.a{display:${display};${display === 'inline' ? '' : 'width:100px'}}`;
      expect(await pixelsAndBoxes(page, `${base}.a{margin:0 auto}`, html), `${display} ${html}`).toEqual(await pixelsAndBoxes(page, base, html));
    }
  const flex = '.p{width:400px;display:flex}.a{display:inline-block;width:100px}', one = '<div class="p"><span class="a">x</span></div>';
  expect(await pixelsAndBoxes(page, `${flex}.a{margin:0 auto}`, one)).not.toEqual(await pixelsAndBoxes(page, flex, one));
  const r = analyzeHTML('<html lang="en"><body><div class="a"><span class="s"></span></div></body></html>', {name: 'P', css: '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.s{display:inline-block;width:100px;margin:0 auto}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
  expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.box === '.s' && w.properties.includes('margin-left'))).toBe(true);
  const f = analyzeHTML('<html lang="en"><body><div class="a"><span class="s"></span></div></body></html>', {name: 'P', css: '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{display:flex}.s{display:inline-block;width:100px;height:20px;margin:0 auto}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
  expect((f.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.box === '.s' && w.properties.includes('margin-left'))).toBe(false);
});

test('F105: justify-self / justify-items in block layout align in Chromium and WebKit, not in Firefox', async ({page}, info) => {
  const left = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>*{margin:0}.p{width:400px}${css}</style></head><body><div class="p"><div class="a">x</div></div></body></html>`); return page.evaluate(() => document.querySelector('.a').getBoundingClientRect().x); };
  const aligns = info.project.name !== 'firefox';
  expect(await left('.a{width:100px;justify-self:center}')).toBe(aligns ? 150 : 0);
  expect(await left('.p{justify-items:end}.a{width:100px}')).toBe(aligns ? 300 : 0);
  // stretch and normal are the same everywhere
  expect(await left('.a{width:100px;justify-self:stretch}')).toBe(0);
  const r = analyzeHTML('<html lang="en"><body><main class="p"><div class="a"></div></main></body></html>', {name: 'P', css: '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.p{display:block}.a{height:20px;width:100px;justify-self:center}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
  expect(r.status).toBe('unknown');
  expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_ALIGN_BROWSER_DEPENDENT' && w.property === 'justify-self')).toBe(true);
});

test('F106: word-break, line-break, hyphens and text-wrap-style do nothing under white-space nowrap or pre', async ({page}) => {
  const texts = ['supercalifragilistic expialidocious words here', '日本語の文章を折り返すかどうかの確認です。', 'a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p'];
  const props = ['word-break:break-all', 'word-break:keep-all', 'line-break:anywhere', 'hyphens:auto', 'text-wrap-style:pretty'];
  for (const ws of ['nowrap', 'pre']) for (const decl of props) for (const t of texts) {
    const base = `.a{width:120px;font:16px sans-serif;white-space:${ws}}`, html = `<div class="a">${t}</div>`;
    expect(await pixelsAndBoxes(page, `${base}.a{${decl}}`, html), `${ws} ${decl} ${t}`).toEqual(await pixelsAndBoxes(page, base, html));
  }
  // where the text wraps, word-break moves the breaks (so the checks above are not vacuous)
  const wrap = '.a{width:120px;font:16px sans-serif}', one = `<div class="a">${texts[0]}</div>`;
  expect(await pixelsAndBoxes(page, `${wrap}.a{word-break:break-all}`, one)).not.toEqual(await pixelsAndBoxes(page, wrap, one));
  for (const decl of props) {
    const r = analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px;white-space:nowrap;${decl}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect(r.status, decl).toBe('verified');
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes(decl.split(':')[0])), decl).toBe(true);
  }
});

test('F107: an invalid color drops the declaration in the browser, and the analyzer drops and reports it', async ({page}) => {
  const cases = [['rgb(0 0 0, .5)', true], ['rgb(0, 0, 0 / .5)', true], ['#12345', true], ['hsl(120, 100, 50)', true], ['rgb(10%, 20, 30)', true], ['rgb(255 0 0 0.5)', true], ['rgb(0 0 0 /)', true],
    ['rgb(0,0,0)', false], ['rgb(0 0 0 / 50%)', false], ['rgb(0, 0, 0, .5)', false], ['#1234', false], ['hsl(120 100 50)', false], ['hsl(120, 100%, 50%)', false], ['rgb(10% 20 30)', false]];
  for (const [color, dropped] of cases) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>.a{color:rgb(1, 2, 3)}.a{color:${color}}</style></head><body><div class="a">x</div></body></html>`);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.a')).color) === 'rgb(1, 2, 3)', color).toBe(dropped);
    const r = analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}.a{color:${color}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_COLOR_INVALID'), color).toBe(dropped);
  }
  // modern hsl numbers are percentages: hsl(120 100 50) is pure green in every browser
  await page.setContent('<!doctype html><html lang="en"><head><style>.a{color:hsl(120 100 50)}</style></head><body><div class="a">x</div></body></html>');
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.a')).color)).toBe('rgb(0, 255, 0)');
});

test('F108: on a table column only width, background, visibility and (collapsed) border act', async ({page}) => {
  const html = '<table><colgroup class="g"><col class="c"><col></colgroup><tbody><tr><td>ab cd</td><td>y</td></tr><tr><td>x</td><td>y</td></tr></tbody></table>';
  const base = 'td{font:16px monospace}';
  for (const decl of ['padding:20px', 'height:100px', 'color:rgb(255,0,0)', 'margin:20px', 'text-align:right', 'font-size:30px', 'vertical-align:bottom', 'max-width:5px', 'overflow:hidden', 'border:3px solid rgb(0,0,255)'])
    for (const target of ['.c', '.g']) expect(await pixelsAndBoxes(page, `${base}${target}{${decl}}`, html), `${target} ${decl}`).toEqual(await pixelsAndBoxes(page, base, html));
  // these do act on a column (so the checks above are not vacuous)
  for (const decl of ['width:200px', 'background:rgb(0,0,255)']) expect(await pixelsAndBoxes(page, `${base}.c{${decl}}`, html), decl).not.toEqual(await pixelsAndBoxes(page, base, html));
  const collapsed = `${base}table{border-collapse:collapse}`;
  expect(await pixelsAndBoxes(page, `${collapsed}.c{border:3px solid rgb(0,0,255)}`, html)).not.toEqual(await pixelsAndBoxes(page, collapsed, html));
  const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.c{padding:20px;color:red}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
  expect((r.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.box === '.c').flatMap(w => w.properties)).toEqual(['padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'color']);
});

test('F109: a keyword the property does not take drops the declaration; vendor keywords and Firefox-only ones are left alone', async ({page}) => {
  const cases = [['display', 'flexbox', 'block', true], ['position', 'center', 'relative', true], ['text-align', 'middle', 'right', true], ['align-items', 'middle', 'end', true], ['justify-content', 'middle', 'end', true],
    ['float', 'center', 'left', true], ['overflow', 'none', 'hidden', true], ['white-space', 'no-wrap', 'pre', true], ['letter-spacing', 'auto', '3px', true], ['box-sizing', 'border', 'border-box', true],
    ['cursor', 'hand', 'pointer', true], ['text-transform', 'capitalized', 'uppercase', true], ['font-weight', 'heavy', '700', true], ['visibility', 'none', 'hidden', true], ['flex-direction', 'col', 'column', true],
    ['border-style', 'line', 'dashed', true], ['justify-content', 'space-evenly', 'end', false], ['overflow', 'auto', 'hidden', false], ['letter-spacing', '1px', '3px', false], ['display', 'inline flex', 'block', false]];
  for (const [prop, value, before, dropped] of cases) {
    const read = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body><div class="a">x</div></body></html>`); return page.evaluate(p => getComputedStyle(document.querySelector('.a')).getPropertyValue(p), prop); };
    expect((await read(`.a{${prop}:${before}}.a{${prop}:${value}}`)) === (await read(`.a{${prop}:${before}}`)), `${prop}: ${value}`).toBe(dropped);
    const r = analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}.a{${prop}:${value}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_KEYWORD_INVALID'), `${prop}: ${value}`).toBe(dropped);
  }
});

test('F110: "and(", "or(" and "not(" in @supports make the condition invalid; the analyzer no longer applies the rules', async ({page}) => {
  const css = '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}';
  for (const [condition, applies] of [['(display: grid) and(gap:1px)', false], ['(display: grid) or(display: banana)', false], ['not(display: banana)', false],
    ['(display: grid) and (gap:1px)', true], ['(display: grid)and (gap:1px)', true], ['(display: grid) AND (gap: 1px)', true], ['NOT (display: grid)', false]]) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}@supports ${condition}{.a{height:40px}}</style></head><body><div class="a"></div></body></html>`);
    expect(await page.evaluate(() => document.querySelector('.a').getBoundingClientRect().height), condition).toBe(applies ? 40 : 20);
    const r = analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: `${css}@supports ${condition}{.a{height:40px}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect(r.status, condition).toBe('verified');
    expect(r.sizes.find(s => s.box === '.a').rect.blockSize.constant, condition).toBe(applies ? '40' : '20');
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_SUPPORTS_INVALID'), condition).toBe(/(?<![\w:-])(and|or|not)\(/i.test(condition));
  }
});

test('F111: an invalid @property is ignored by the browser (the property stays unregistered), and by the analyzer', async ({page}) => {
  const css = '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.p{--x:30px}.c{height:var(--x, 5px)}';
  for (const [rule, ignored] of [["syntax: <length>; inherits: false; initial-value: 0px", true], ["syntax: '<length>'; inherits: false", true], ["syntax: '<length>'; initial-value: 0px", true],
    ["syntax: '<length>'; inherits: false; initial-value: 10", true], ["syntax: '<length>'; inherits: false; initial-value: 1em", true], ["syntax: '<lenght>'; inherits: false; initial-value: 0px", true],
    ["syntax: '<length>'; inherits: no; initial-value: 0px", true], ["syntax: '<length>'; inherits: false; initial-value: 0px", false]]) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>@property --x { ${rule}; }${css}</style></head><body><div class="p"><div class="c"></div></div></body></html>`);
    expect(await page.evaluate(() => document.querySelector('.c').getBoundingClientRect().height), rule).toBe(ignored ? 30 : 0);
    const r = analyzeHTML('<html lang="en"><body><div class="p"><div class="c"></div></div></body></html>', {name: 'P', css: `@property --x { ${rule}; }${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect(r.status, rule).toBe('verified');
    expect(r.sizes.find(s => s.box === '.c').rect.blockSize.constant, rule).toBe(ignored ? '30' : '0');
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_PROPERTY_INVALID'), rule).toBe(ignored);
  }
});

test('F112: a higher-specificity declaration in an earlier (or any) layer loses to a later or unlayered one', async ({page}) => {
  const base = '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}';
  for (const [css, width, reported] of [['@layer base{#x.a{width:40px}}.a{width:20px}', 20, true], ['@layer a, b; @layer b{.a{width:40px}} @layer a{#x.a{width:60px}}', 40, true],
    ['@layer base{.a{width:40px}}#x.a{width:20px}', 20, false], ['@layer base{#x.a{width:40px} .a{width:20px}}', 40, false]]) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>${base}${css}</style></head><body><div class="a" id="x"></div></body></html>`);
    expect(await page.evaluate(() => document.querySelector('.a').getBoundingClientRect().width), css).toBe(width);
    const r = analyzeHTML('<html lang="en"><body><div class="a" id="x"></div></body></html>', {name: 'P', css: `${base}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect(r.sizes.find(s => s.box === '#x').rect.inlineSize.constant, css).toBe(String(width));
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_LAYER_OVERRIDDEN'), css).toBe(reported);
  }
});

test('F113: an @font-face the browser ignores is reported, and an invalid font-display falls back to auto', async ({page}) => {
  for (const [rule, registered, display] of [['font-family: F; src: local(Arial)', true, 'auto'], ['src: local(Arial)', false], ['font-family: F', false], ['font-family: 3D Font; src: local(Arial)', false],
    ["font-family: 'F'; src: Arial", false], ['font-family: F; src: local(Arial); font-display: fast', true, 'auto'], ['font-family: F; src: local(Arial); font-display: swap', true, 'swap']]) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>@font-face { ${rule}; }</style></head><body><div>x</div></body></html>`);
    const faces = await page.evaluate(() => [...document.fonts].map(f => f.display));
    expect(faces.length, rule).toBe(registered ? 1 : 0);
    if (registered) expect(faces[0], rule).toBe(display);
    const r = analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: `@font-face { ${rule}; }*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_FONT_FACE_INVALID'), rule).toBe(!registered || /fast/.test(rule));
  }
});

test('F114: invalid transition and animation values are dropped by the browser, and reported', async ({page}) => {
  const cases = [['transition', 'opacity 300', true], ['transition', 'all 0.3 ease', true], ['transition', 'opacity .3s ease-in-out 1s 2s', true], ['transition', 'opacity .3s,', true], ['transition', 'opacity .3s easeInOut', true],
    ['transition', 'opacity 0.3s cubic-bezier(1,2,3)', true], ['transition', 'none, opacity 1s', true], ['transition', 'opacity .3s', false], ['transition', 'opacity .3s, transform', false],
    ['animation', 'spin 1s 1s 1s', true], ['animation', 'spin 1 linear', false], ['transition-duration', '300', true], ['transition-duration', '.3s', false]];
  for (const [prop, value, dropped] of cases) {
    const before = prop === 'animation' ? 'other 7s' : prop === 'transition' ? 'color 7s' : '7s';
    await page.setContent(`<!doctype html><html lang="en"><head><style>.a{${prop}:${before}}.a{${prop}:${value}}</style></head><body><div class="a">x</div></body></html>`);
    const v = await page.evaluate(p => getComputedStyle(document.querySelector('.a')).getPropertyValue(p), prop);
    expect(v.includes('7s'), `${prop}: ${value} -> ${v}`).toBe(dropped);
    const r = analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: `@keyframes spin{to{opacity:0}}*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}.a{${prop}:${value}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_TIMING_INVALID'), `${prop}: ${value}`).toBe(dropped);
  }
});

test('F115: an invalid background shorthand is dropped by the browser, and reported', async ({page}) => {
  for (const [value, dropped] of [['url(a b.png)', true], ['url(x.png) / cover center', true], ['url(x.png) cover', true], ['red url(x.png), blue', true], ['url("a b.png")', false], ['url(x.png) center / cover', false],
    ['url(x.png) no-repeat center / 50% auto', false], ['url(x.png), red', false], ['white', false]]) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>.a{background:rgb(1,2,3)}.a{background:${value}}</style></head><body><div class="a">x</div></body></html>`);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.a')).backgroundColor) === 'rgb(1, 2, 3)', value).toBe(dropped);
    const r = analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}.a{background:${value}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_BACKGROUND_INVALID'), value).toBe(dropped);
  }
});

test('F116: an invalid will-change is dropped (the earlier value stays, a fixed child is not trapped); an unknown name is kept', async ({page}) => {
  const base = '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.p{margin-top:50px;height:100px}.f{position:fixed;top:0;left:0;width:10px;height:10px}';
  for (const [value, dropped] of [['auto, transform', true], ['transform, all', true], ['none', true], ['will-change', true], ['transform opacity', true], ['transform,', true], ['transform, default', true],
    ['transform', false], ['transform, opacity', false], ['transfrom', false], ['left, contents', false]]) {
    const html = '<html lang="en"><body><div class="p"><div class="f"></div></div></body></html>', css = `${base}.p{will-change:${value}}`;
    await page.setContent(`<!doctype html><head><style>${base}.p{will-change:scroll-position}.p{will-change:${value}}</style></head><body><div class="p"><div class="f"></div></div></body>`);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.p')).willChange), value).toBe(dropped ? 'scroll-position' : value.replace(/,$/, ''));
    await page.setContent(`<!doctype html><head><style>${css}</style></head><body><div class="p"><div class="f"></div></div></body>`);
    const top = await page.evaluate(() => document.querySelector('.f').getBoundingClientRect().top);
    if (dropped) expect(top, value).toBe(0);
    const r = analyzeHTML(html, {name: 'P', css, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_KEYWORD_INVALID'), value).toBe(dropped);
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_FIXED_TRAPPED'), value).toBe(top === 50);
  }
});

test('F117: transform-style: preserve-3d contains fixed children and makes a stacking context; a grouping property flattens it, contain: paint only in Firefox', async ({page, browserName}) => {
  const view = {min: 320, max: 1200, height: {min: 300, max: 900}}, base = '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}';
  for (const [extra, flattened] of [['', false], ['overflow:hidden', true], ['overflow:clip', true], ['opacity:.5', true], ['isolation:isolate', true], ['contain:paint', browserName === 'firefox']]) {
    await page.setContent(`<!doctype html><style>*{margin:0}.g{perspective:200px;width:300px;height:300px;padding:50px}.p{transform-style:preserve-3d;width:200px;height:200px;${extra}}.c{width:100px;height:100px;background:red;transform:translateZ(100px)}</style><div class="g"><div class="p"><div class="c"></div></div></div>`);
    expect(await page.evaluate(() => document.querySelector('.c').getBoundingClientRect().width), extra).toBe(flattened ? 100 : 200);
    await page.setContent(`<!doctype html><style>${base}.p{margin-top:50px;height:100px;transform-style:preserve-3d;${extra}}.f{position:fixed;top:0;left:0;width:10px;height:10px}</style><div class="p"><div class="f"></div></div>`);
    expect(await page.evaluate(() => document.querySelector('.f').getBoundingClientRect().top), extra).toBe(50);
    if (extra === 'contain:paint') continue;
    const r = analyzeHTML('<html lang="en"><body><div class="p"><div class="f"></div></div></body></html>', {name: 'P', css: `${base}.p{margin-top:50px;height:100px;transform-style:preserve-3d;${extra}}.f{position:fixed;top:0;left:0;width:10px;height:10px}`, viewport: view});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_FIXED_TRAPPED'), extra).toBe(true);
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('transform-style')), extra).toBe(flattened);
  }
  // A stacking context: a z-index: -1 child stays above the parent's background.
  for (const [style, above] of [['transform-style:preserve-3d', true], ['transform-style:flat', false]]) {
    await page.setContent(`<!doctype html><style>*{margin:0}.p{width:100px;height:100px;background:blue;${style}}.c{position:relative;z-index:-1;width:50px;height:50px;background:red}</style><div class="p"><div class="c"></div></div>`);
    expect(await page.evaluate(() => document.elementFromPoint(10, 10).className), style).toBe(above ? 'c' : 'p');
  }
  // On a span in block flow (not transformable) it does nothing: no containing block.
  await page.setContent(`<!doctype html><style>*{margin:0}.w{margin-top:50px}.p{transform-style:preserve-3d}.f{position:fixed;top:0;left:0;width:10px;height:10px}</style><div class="w"><span class="p"><span class="f"></span></span></div>`);
  expect(await page.evaluate(() => document.querySelector('.f').getBoundingClientRect().top)).toBe(0);
  const r = analyzeHTML('<html lang="en"><body><div class="a"><span class="p"></span></div></body></html>', {name: 'P', css: `${base}.a{height:auto}.p{transform-style:preserve-3d}`, viewport: view});
  expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && /display: inline/.test(w.message))).toBe(true);
});

test('F118: flex factors and order do not move or size an absolute child (flex, grid or block parent); align-self does', async ({page}) => {
  const view = {min: 320, max: 1200, height: {min: 300, max: 900}};
  for (const parent of ['display:flex', 'display:grid;grid-template-columns:100px 100px', 'display:block']) {
    const css = e => `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.p{${parent};position:relative;width:300px;height:200px}.s{width:50px;height:50px}.x{position:absolute;top:0;left:0;width:20px;height:20px;${e}}`;
    const rect = async e => { await page.setContent(`<!doctype html><style>${css(e)}</style><div class="p"><div class="s"></div><div class="x"></div></div>`); return page.evaluate(() => { const r = document.querySelector('.x').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }); };
    const plain = await rect('');
    for (const e of ['flex-grow:1', 'flex:1', 'flex-shrink:5', 'flex-basis:100px', 'order:-1']) {
      expect(await rect(e), `${parent} ${e}`).toEqual(plain);
      const r = analyzeHTML('<html lang="en"><body><div class="p"><div class="s"></div><div class="x"></div></div></body></html>', {name: 'P', css: css(e), viewport: view});
      expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.box === '.x'), `${parent} ${e}`).toBe(true);
    }
    // Without top / bottom, align-self moves it in flex and grid (so it is not reported anywhere).
    const free = async e => { await page.setContent(`<!doctype html><style>${css(e).replace('top:0;', '')}</style><div class="p"><div class="s"></div><div class="x"></div></div>`); return page.evaluate(() => document.querySelector('.x').getBoundingClientRect().top); };
    if (parent !== 'display:block') expect(await free('align-self:end'), parent).toBe(180);
    const r = analyzeHTML('<html lang="en"><body><div class="p"><div class="s"></div><div class="x"></div></div></body></html>', {name: 'P', css: css('align-self:end'), viewport: view});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.box === '.x')).toBe(false);
  }
});

test('F119: text-wrap: balance after white-space: nowrap wraps again; text-wrap: pretty is dropped by Firefox', async ({page, browserName}) => {
  for (const [css, wraps, reported] of [['white-space:nowrap;text-wrap:balance', true, true], ['white-space:pre;text-wrap:stable', true, true], ['white-space:nowrap;text-wrap:pretty', browserName !== 'firefox', true],
    ['text-wrap:balance;white-space:nowrap', false, false], ['white-space:nowrap;text-wrap-style:balance', false, false], ['white-space:nowrap;text-wrap:wrap', true, false]]) {
    await page.setContent(`<!doctype html><style>*{margin:0}.x{width:100px;font:16px/20px monospace;${css}}</style><div class="x">aaa bbb ccc ddd eee fff</div>`);
    expect(await page.evaluate(() => document.querySelector('.x').getBoundingClientRect().height), css).toBe(wraps ? 60 : 20);
    const r = analyzeHTML('<html lang="en"><body><div class="x">aaa bbb</div></body></html>', {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.x{width:100px;${css}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_WRAP_RESTORED'), css).toBe(reported);
  }
});

test('F120: margin on a <br> spaces lines in Firefox only, line-height in WebKit only, the rest nowhere', async ({page, browserName}) => {
  for (const [css, changes, reported] of [['margin-top:50px', browserName === 'firefox', true], ['margin-bottom:50px', browserName === 'firefox', true], ['line-height:80px', browserName === 'webkit', true],
    ['padding-top:50px', false, true], ['display:block;height:50px', false, true], ['width:50px', false, true], ['display:none', true, false]]) {
    await page.setContent(`<!doctype html><style>*{margin:0}div{font:16px/20px monospace;width:300px}br{${css}}</style><div><span>a</span><br><span>b</span></div>`);
    expect(await page.evaluate(() => document.querySelector('div').getBoundingClientRect().height) !== 40, css).toBe(changes);
    const r = analyzeHTML('<html lang="en"><body><div class="a"><span>a</span><br><span>b</span></div></body></html>', {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}br{${css}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_BR_STYLED'), css).toBe(reported);
  }
});

test('F121: font-size, padding, width and height on the options leave a drop-down select the same size', async ({page}) => {
  const size = async css => { await page.setContent(`<!doctype html><style>*{margin:0}${css}</style><select><option>xxxxx</option><option>y</option></select>`); return page.evaluate(() => { const r = document.querySelector('select').getBoundingClientRect(); return [r.width, r.height]; }); };
  const plain = await size('');
  for (const css of ['option{font-size:40px}', 'option{padding:30px}', 'option{width:300px}', 'option{height:80px}', 'option{line-height:60px}']) {
    expect(await size(css), css).toEqual(plain);
    const r = analyzeHTML('<html lang="en"><body><label>L <select class="s"><option>xxxxx</option><option>y</option></select></label></body></html>', {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.select), css).toBe(true);
  }
  expect(await size('select{font-size:40px}')).not.toEqual(plain);
});

test('F122: stretch, -moz-available, -webkit-fit-content and intrinsic are taken by some browsers only; the fallbacks make them agree', async ({page, browserName}) => {
  const takes = { stretch: ['chromium', 'webkit'], '-webkit-fill-available': ['chromium', 'firefox', 'webkit'], '-moz-available': ['firefox'], 'fit-content': ['chromium', 'firefox', 'webkit'], '-webkit-fit-content': ['chromium', 'webkit'], '-moz-fit-content': ['firefox'], intrinsic: ['webkit'] };
  for (const [value, taken] of Object.entries(takes)) {
    await page.setContent(`<!doctype html><style>*{margin:0}.a{width:50px;width:${value}}</style><div class="a">x</div>`);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.a')).width) !== '50px', value).toBe(taken.includes(browserName));
    const r = analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px;width:50px;width:${value}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_SIZE_BROWSER_DEPENDENT'), value).toBe(taken.length < 3);
  }
  // The usual fallback chain: every browser ends on a stretch value.
  await page.setContent(`<!doctype html><style>*{margin:0}.p{width:300px}.a{display:inline-block;width:50px;width:-webkit-fill-available;width:stretch}</style><div class="p"><div class="a">x</div></div>`);
  expect(await page.evaluate(() => document.querySelector('.a').getBoundingClientRect().width)).toBe(300);
});

test('F123: isolation: isolate on the blended element itself does not stop the blend; on the parent it does', async ({page}) => {
  const { PNG } = await import('pngjs');
  await page.setViewportSize({ width: 200, height: 200 });
  for (const [parent, self, blends] of [['', '', true], ['', 'isolation:isolate', true], ['isolation:isolate', '', false]]) {
    await page.setContent(`<!doctype html><style>*{margin:0}body{background:rgb(255,0,0)}.p{width:100px;height:100px;${parent}}.c{width:50px;height:50px;background:rgb(0,255,255);mix-blend-mode:difference;${self}}</style><div class="p"><div class="c"></div></div>`);
    const png = PNG.sync.read(await page.screenshot({ clip: { x: 10, y: 10, width: 1, height: 1 } }));
    expect(png.data[0] > 200, `${parent}|${self}`).toBe(blends); // difference of cyan and red is white; unblended cyan has no red
  }
  const r = analyzeHTML('<html lang="en"><body><div class="p"><div class="c"></div></div></body></html>', {name: 'P', css: '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.c{height:20px;mix-blend-mode:difference;isolation:isolate}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
  expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_ISOLATION_SELF')).toBe(true);
});

test('F124: Firefox indents the shown option of a select twice; the select size does not change; an input agrees', async ({page, browserName}) => {
  const { PNG } = await import('pngjs');
  await page.setViewportSize({ width: 300, height: 100 });
  const left = async (tag, indent) => {
    await page.setContent(`<!doctype html><style>*{margin:0}select,input{width:200px;height:40px;font:20px monospace;color:#000;background:#fff;border:0;padding-left:0;text-indent:${indent}px}</style>${tag === 'select' ? '<select><option>ii</option></select>' : '<input value="ii">'}`);
    const png = PNG.sync.read(await page.screenshot({ clip: { x: 0, y: 0, width: 200, height: 40 } }));
    for (let x = 0; x < 200; x++) for (let y = 5; y < 35; y++) { const i = (y * 200 + x) * 4; if (png.data[i] < 100 && png.data[i + 1] < 100 && png.data[i + 2] < 100) return x; }
    return -1;
  };
  const moved = async tag => (await left(tag, 40)) - (await left(tag, 0));
  expect(Math.abs((await moved('select')) - (browserName === 'firefox' ? 80 : 40)), 'select').toBeLessThanOrEqual(2);
  expect(Math.abs((await moved('input')) - 40), 'input').toBeLessThanOrEqual(2);
  const size = async css => { await page.setContent(`<!doctype html><style>*{margin:0}${css}</style><select><option>xxxx</option></select>`); return page.evaluate(() => { const r = document.querySelector('select').getBoundingClientRect(); return [r.width, r.height]; }); };
  expect(await size('select{text-indent:40px}')).toEqual(await size(''));
  const r = analyzeHTML('<html lang="en"><body><select class="s" aria-label="x"><option>x</option></select></body></html>', {name: 'P', css: '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.s{text-indent:10px}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
  expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_SELECT_INDENT')).toBe(true);
});

test('F125: a 50rem media query is 800px whatever the root font-size', async ({page}) => {
  await page.setViewportSize({ width: 600, height: 400 });
  for (const root of ['', 'html{font-size:10px}', 'html{font-size:62.5%}']) for (const unit of ['em', 'rem']) {
    await page.setContent(`<!doctype html><style>${root}.a{height:10px}@media (min-width:50${unit}){.a{height:40px}}@media (min-width:500px){.b{height:40px}}</style><div class="a"></div><div class="b"></div>`);
    expect(await page.evaluate(() => document.querySelector('.a').getBoundingClientRect().height), `${root} ${unit}`).toBe(10);
    const r = analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${root}.a{height:10px}@media (min-width:50${unit}){.a{height:40px}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_MEDIA_EM_ROOT'), `${root} ${unit}`).toBe(Boolean(root));
  }
});

test('F126: overflow-y: visible beside overflow-x: hidden computes to auto, clip beside auto to hidden (not in Chromium); clip keeps visible', async ({page, browserName}) => {
  // clip beside a scrolling axis: hidden in Firefox (157) and WebKit (27.2), clip in Chromium (156).
  const clipBeside = browserName === 'chromium' ? 'clip' : 'hidden';
  for (const [css, y, reported] of [['overflow-x:hidden;overflow-y:visible', 'auto', true], ['overflow:hidden visible', 'auto', true], ['overflow-x:auto;overflow-y:clip', clipBeside, true],
    ['overflow-x:scroll;overflow-y:clip', clipBeside, true],
    ['overflow-x:clip;overflow-y:visible', 'visible', false], ['overflow-x:hidden', 'auto', false]]) {
    await page.setContent(`<!doctype html><style>*{margin:0}.a{height:50px;${css}}.c{height:100px}</style><div class="a"><div class="c"></div></div>`);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.a')).overflowY), css).toBe(y);
    const r = analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px;${css}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_OVERFLOW_PROMOTED'), css).toBe(reported);
  }
});

test('F127: box-sizing on html is not inherited; F128: margin-top % is a share of the width', async ({page}) => {
  const width = async css => { await page.setContent(`<!doctype html><style>*{margin:0}${css}.b{width:100px;padding:10px}</style><div class="b"></div>`); return page.evaluate(() => document.querySelector('.b').getBoundingClientRect().width); };
  for (const [css, w, reported] of [['html{box-sizing:border-box}', 120, true], ['body{box-sizing:border-box}', 120, true], ['html{box-sizing:border-box}*,*::before,*::after{box-sizing:inherit}', 100, false]]) {
    expect(await width(css), css).toBe(w);
    const r = analyzeHTML('<html lang="en"><body><div class="b"></div></body></html>', {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${css}.b{width:100px;padding:10px;height:20px}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_BOX_SIZING_NOT_INHERITED'), css).toBe(reported);
  }
  for (const [w, h] of [[400, 100], [200, 300]]) {
    await page.setContent(`<!doctype html><style>*{margin:0}.p{width:${w}px;height:${h}px;display:flow-root}.c{margin-top:10%;height:10px}</style><div class="p"><div class="c"></div></div>`);
    expect(await page.evaluate(() => document.querySelector('.c').getBoundingClientRect().top), `${w}x${h}`).toBe(w / 10);
  }
  const r = analyzeHTML('<html lang="en"><body><div class="c"></div></body></html>', {name: 'P', css: '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.c{margin-top:10%;height:10px}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
  expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_MARGIN_PERCENT_WIDTH')).toBe(true);
});

test('F129: * { margin: 0 } puts an open or modal dialog at the top-left; dialog { margin: auto } centres it again', async ({page}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  for (const [css, centred] of [['', true], ['*{margin:0}', false], ['*{margin:0}dialog{margin:auto}', true]]) for (const modal of [false, true]) {
    await page.setContent(`<!doctype html><style>${css}</style><dialog ${modal ? '' : 'open'}>d</dialog>`);
    const left = await page.evaluate(m => { const d = document.querySelector('dialog'); if (m) d.showModal(); return d.getBoundingClientRect().left; }, modal);
    expect(left > 100, `${css} ${modal}`).toBe(centred);
    const r = analyzeHTML(`<html lang="en"><body><dialog ${modal ? '' : 'open'}><p>d</p></dialog></body></html>`, {name: 'P', css: `html,body{display:grid;grid-template-columns:minmax(0,1fr)}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_DIALOG_NOT_CENTRED'), `${css} ${modal}`).toBe(!centred);
  }
});

test('F130: Chrome and Safari ignore ::-webkit-scrollbar beside scrollbar-width or scrollbar-color; Firefox does not take it', async ({page, browserName}) => {
  const html = css => `<!doctype html><style>*{margin:0}.a{width:200px;height:100px;overflow:scroll}${css}</style><div class="a"><div style="height:300px"></div></div>`;
  const gutter = p => p.evaluate(() => { const a = document.querySelector('.a'); return a.offsetWidth - a.clientWidth; });
  if (browserName === 'chromium') {
    // Classic scrollbars (Playwright hides them by default), so the bar has a width to measure.
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] }), p = await browser.newPage();
    try {
      for (const [css, width] of [['.a::-webkit-scrollbar{width:4px}', 4], ['.a{scrollbar-width:thin}.a::-webkit-scrollbar{width:4px}', 10], ['.a{scrollbar-color:red blue}.a::-webkit-scrollbar{width:4px}', 15], ['', 15]]) {
        await p.setContent(html(css));
        expect(await gutter(p), css).toBe(width);
      }
    } finally { await browser.close(); }
  }
  if (browserName === 'webkit') for (const [css, width] of [['.a::-webkit-scrollbar{width:4px}', 4], ['.a{scrollbar-width:thin}.a::-webkit-scrollbar{width:4px}', 0]]) { await page.setContent(html(css)); expect(await gutter(page), css).toBe(width); }
  expect(await page.evaluate(() => CSS.supports('selector(::-webkit-scrollbar)'))).toBe(browserName !== 'firefox');
  const lint = css => (analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px;overflow:auto}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).map(w => w.code).filter(c => /SCROLLBAR/.test(c));
  expect(lint('.a{scrollbar-color:red blue}.a::-webkit-scrollbar{width:4px}')).toEqual(['W_CSS_SCROLLBAR_WEBKIT_IGNORED']);
  expect(lint('.a::-webkit-scrollbar{display:none}')).toEqual(['W_CSS_SCROLLBAR_FIREFOX_SHOWN']);
  expect(lint('.a{scrollbar-width:none}.a::-webkit-scrollbar{display:none}')).toEqual([]);
});

test('F131: a :hover rule a later rule without the state beats shows nothing when hovered (the LVHA order)', async ({page}) => {
  for (const [css, hovered, reported] of [['a:hover{color:red}a:link{color:blue}', 'rgb(0, 0, 255)', true], ['.b:hover{color:red}.b.c{color:blue}', 'rgb(0, 0, 255)', true],
    ['a:link{color:blue}a:hover{color:red}', 'rgb(255, 0, 0)', false], ['.b:hover{color:red}.b{color:blue}', 'rgb(255, 0, 0)', false]]) {
    await page.setContent(`<!doctype html><style>${css}</style><a href="#x" class="b c" id="l">link text</a>`);
    await page.hover('#l');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('#l')).color), css).toBe(hovered);
    const r = analyzeHTML('<html lang="en"><body><a href="/x" class="b c">link text</a></body></html>', {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_STATE_SHADOWED'), css).toBe(reported);
  }
});

test('F132: a selector list with a -moz- selector is dropped by Chrome and Safari, with a -ms- one everywhere; :is() forgives', async ({page, browserName}) => {
  for (const [css, applies, reported] of [['.a::-moz-selection,.a{color:red}', browserName === 'firefox', true], ['.a:-moz-focusring,.a{color:red}', browserName === 'firefox', true], ['.a::-ms-clear,.a{color:red}', false, true],
    ['.a:is(:-moz-focusring,.x),.a{color:red}', true, false], ['.a::-webkit-input-placeholder,.a{color:red}', true, false]]) {
    await page.setContent(`<!doctype html><style>${css}</style><input class="a">`);
    expect((await page.evaluate(() => getComputedStyle(document.querySelector('.a')).color)) === 'rgb(255, 0, 0)', css).toBe(applies);
    const r = analyzeHTML('<html lang="en"><body><div class="a">t</div></body></html>', {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_SELECTOR_LIST_VENDOR'), css).toBe(reported);
  }
});

test('F133: a container query unit with no container for its axis is the small-viewport unit', async ({page}) => {
  const html = '<div class="g"><div class="p"><div class="a"></div></div></div>';
  // [container css, the cq declaration, the same with the sv unit, reported]
  for (const [ctx, cq, sv, reported] of [['', 'width:50cqw', 'width:50svw', true], ['', 'height:30cqh', 'height:30svh', true],
    ['.p{container-type:inline-size}', 'height:30cqh', 'height:30svh', true], ['.p{container-name:card;width:200px}', 'width:50cqw', 'width:50svw', true],
    ['', 'width:calc(100% - 10cqw)', 'width:calc(100% - 10svw)', true],
    ['.p{container-type:inline-size;width:200px}', 'width:50cqw', 'width:50svw', false], ['.g{container-type:inline-size;width:200px}', 'width:50cqw', 'width:50svw', false],
    ['.p{container:card / inline-size;width:200px}', 'width:50cqw', 'width:50svw', false]]) {
    const box = async decl => { await page.setContent(`<!doctype html><style>*{margin:0}${ctx}.a{height:10px;${decl}}</style>${html}`); return page.evaluate(() => { const r = document.querySelector('.a').getBoundingClientRect(); return [r.width, r.height]; }); };
    // Reported exactly where the cq unit measures what the sv unit does (the viewport), not a container.
    expect(JSON.stringify(await box(cq)) === JSON.stringify(await box(sv)), `${ctx} ${cq}`).toBe(reported);
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}${ctx}.a{${cq}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_CONTAINER_UNIT_VIEWPORT'), `${ctx} ${cq}`).toBe(reported);
  }
});

// F135-F139 (the static half of vlmkit check animation's CSS rules): each warning holds exactly where the browser shows
// no effect, and each control (a registered property, the right spelling, calc(), another name) has one.
const started = async (page, css) => { await load(page, css); return page.evaluate(() => { const a = document.querySelector('.a'); a.getBoundingClientRect(); a.classList.add('on'); getComputedStyle(a).width; getComputedStyle(a).opacity; getComputedStyle(a).getPropertyValue('--x'); return document.getAnimations().length; }); };

test('F135: a second @keyframes of one name replaces the first whole', async ({page}) => {
  for (const [css, dup] of [['@keyframes k{from{opacity:0}to{opacity:1}}@keyframes k{from{transform:translateX(10px)}to{transform:none}}.a{animation:k 10s linear -5s paused}', true],
    ['@keyframes k{from{opacity:0}to{opacity:1}}@keyframes j{from{transform:translateX(10px)}to{transform:none}}.a{animation:k 10s linear -5s paused,j 10s linear -5s paused}', false]]) {
    await load(page, css);
    const opacity = await page.evaluate(() => getComputedStyle(document.querySelector('.a')).opacity);
    expect(warns(css, 'W_CSS_KEYFRAMES_DUPLICATE'), css).toBe(dup);
    // Half way through: the first rule's opacity animation shows only when it was not replaced.
    expect(opacity === '1', `${css}: ${opacity}`).toBe(dup);
  }
});

test('F136, F137, F138: a transition that never starts', async ({page}) => {
  for (const [css, code] of [['.a{--x:0;transition:--x 1s}.a.on{--x:1}', 'W_CSS_TRANSITION_UNREGISTERED'], ['@property --x{syntax:"<number>";inherits:false;initial-value:0}.a{--x:0;transition:--x 1s}.a.on{--x:1}', null],
    ['.a{width:10px;transition:widht 1s}.a.on{width:100px}', 'W_CSS_TRANSITION_PROPERTY_UNKNOWN'], ['.a{width:10px;transition:width 1s}.a.on{width:100px}', null],
    [':root{--d:300}.a{transition:opacity var(--d)}.a.on{opacity:.5}', 'W_CSS_DURATION_UNITLESS'], [':root{--d:300}.a{transition:opacity calc(var(--d) * 1ms)}.a.on{opacity:.5}', null], [':root{--d:300ms}.a{transition:opacity var(--d)}.a.on{opacity:.5}', null]]) {
    const running = await started(page, css);
    for (const c of ['W_CSS_TRANSITION_UNREGISTERED', 'W_CSS_TRANSITION_PROPERTY_UNKNOWN', 'W_CSS_DURATION_UNITLESS']) expect(warns(css, c), `${css} ${c}`).toBe(c === code);
    expect(running > 0, `${css}: ${running} running`).toBe(!code);
  }
  // An animation's duration from a bare number: no animation runs.
  for (const [css, unitless] of [[':root{--d:2}@keyframes k{to{opacity:.5}}.a{animation:k var(--d) infinite}', true], [':root{--d:2s}@keyframes k{to{opacity:.5}}.a{animation:k var(--d) infinite}', false]]) {
    await load(page, css);
    expect(warns(css, 'W_CSS_DURATION_UNITLESS'), css).toBe(unitless);
    expect(await page.evaluate(() => document.getAnimations().length) === 0, css).toBe(unitless);
  }
});

test('F139: a misspelled media feature makes the query never match', async ({page}) => {
  await page.setViewportSize({width: 800, height: 600});
  for (const [query, typo] of [['(min-widht: 1px)', true], ['(widht > 1px)', true], ['screen and (hovr: hover)', true], ['not (prefers-reduced-motoin: reduce)', true], ['(prefers-color-schema: light)', true],
    ['(min-width: 1px)', false], ['(scripting: enabled)', false], ['(update: fast)', false], ['(-webkit-min-device-pixel-ratio: 1)', false]]) {
    const css = `.a{color:rgb(0, 0, 255)}@media ${query}{.a{color:rgb(255, 0, 0)}}`;
    await load(page, css);
    const applied = await page.evaluate(() => getComputedStyle(document.querySelector('.a')).color === 'rgb(255, 0, 0)');
    expect(warns(css, 'W_CSS_MEDIA_FEATURE_UNKNOWN'), query).toBe(typo);
    if (typo) expect(applied, query).toBe(false);
    else expect(applied, query).toBe(true);
  }
});

test('F134: a background-image that is not an <image>, and a stray colon, are dropped where the warning says', async ({page}) => {
  const style = async props => page.evaluate(props => { const s = getComputedStyle(document.querySelector('.a')); return props.map(p => s.getPropertyValue(p)).join(' | '); }, props);
  const image = ['background-image', 'background-color'];
  // [css with the declaration, the same rule without it, the properties to compare, the warning, whether it is dropped]
  const cases = [
    ['.a{background-image:url(https://example.com/a.png);background-image:https://example.com/close.png}', '.a{background-image:url(https://example.com/a.png)}', image, 'W_CSS_IMAGE_INVALID', true],
    ['.a{background-image:url(https://example.com/a.png);background-image:"close.png"}', '.a{background-image:url(https://example.com/a.png)}', image, 'W_CSS_IMAGE_INVALID', true],
    ['.a{background:rgb(255, 0, 0);background:"close.png" center / cover no-repeat}', '.a{background:rgb(255, 0, 0)}', image, 'W_CSS_IMAGE_INVALID', true],
    ['.a{background:rgb(255, 0, 0);background:/img/close.png center / cover no-repeat}', '.a{background:rgb(255, 0, 0)}', image, 'W_CSS_IMAGE_INVALID', true],
    ['.a{color:rgb(0, 128, 0);color:rgb(255, 0, 0)\n background:blue;width:10px}', '.a{color:rgb(0, 128, 0);width:10px}', ['color', 'background-color', 'width'], 'W_CSS_STRAY_COLON', true],
    // Controls: valid values apply (absolute URLs: a relative one on about:blank computes alike in Firefox) and are not reported.
    ['.a{background-image:url(https://example.com/a.png);background-image:url("https://example.com/b.png")}', '.a{background-image:url(https://example.com/a.png)}', image, 'W_CSS_IMAGE_INVALID', false],
    ['.a{background:rgb(255, 0, 0);background:rgb(0, 0, 255) url(https://example.com/a.png) center /min(10px,20px) no-repeat}', '.a{background:rgb(255, 0, 0)}', image, 'W_CSS_IMAGE_INVALID', false],
    ['.a{color:rgb(0, 128, 0);color:rgb(255, 0, 0);background:blue}', '.a{color:rgb(0, 128, 0)}', ['color', 'background-color'], 'W_CSS_STRAY_COLON', false],
  ];
  for (const [css, without, props, code, dropped] of cases) {
    await load(page, css); const got = await style(props);
    await load(page, without); const kept = await style(props);
    expect(got === kept, `${css}: the browser ${dropped ? 'drops' : 'applies'} it`).toBe(dropped);
    expect(warns(css, code), `${css}: ${code}`).toBe(dropped);
  }
});

test('F14: a border shorthand with var() keeps its style under a later border-width', async ({page}) => {
  for (const css of [':root{--c:red}.a{border:5px solid var(--c)}.a{border-width:0 0 5px}', ':root{--c:red}.a{border:5px solid var(--c)}.a{border-bottom-width:2px}', ':root{--c:red}.a{border:5px var(--c)}.a{border-width:0 0 5px}']) {
    await load(page, css);
    const height = await page.evaluate(() => document.querySelector('.a').getBoundingClientRect().height);
    const r = analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: base + css, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect(r.status, css).toBe('verified');
    expect(String(height), css).toBe(r.sizes.find(s => s.box === '.a').rect.blockSize.constant);
  }
});
