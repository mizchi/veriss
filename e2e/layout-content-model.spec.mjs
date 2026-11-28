// Checklist J: parent-child structure (the HTML content model). Each warning holds exactly where the browser builds,
// renders or labels something other than what the markup writes — and W_HTML_CONTENT_MODEL exactly where the browser
// keeps the markup as written (so it is a conformance rule, in the strict lint profile only).
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/veriss/src/html.mjs';

const analyze = html => analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
const has = (html, code, kinds) => (analyze(html).layoutWarnings ?? []).some(w => w.code === code && (!kinds || kinds.includes(w.kind)));
const load = (page, html) => page.setContent(`<!doctype html><html lang="en"><body>${html}</body></html>`);

test('J1, J2: the parser drops a table part outside a table, and closes an element at a start tag of its own kind', async ({page}) => {
  // [markup, a selector that matches only if the element is where the markup wrote it, restructured]
  for (const [html, written, restructured] of [
    ['<div class="p"><td class="d">x</td></div>', '.p > .d', true],
    ['<div class="p"><tr class="d"><td>x</td></tr></div>', '.p > .d', true],
    ['<section class="p"><caption class="d">c</caption></section>', '.p > .d', true],
    ['<div class="p"><thead class="d"><tr><th>h</th></tr></thead></div>', '.p > .d', true],
    ['<table class="p"><tbody><tr><td class="d">x</td></tr></tbody></table>', '.p .d', false],
    ['<table class="p"><tr><td class="d">x</td></tr></table>', '.p .d', false],
    ['<ul><li class="p">a<li class="d">b</li></li></ul>', '.p > .d', true],
    ['<ul><li class="p">a<ul><li class="d">b</li></ul></li></ul>', '.p .d', false],
    ['<ul class="p"><li>a<li class="d">b</ul>', '.p > .d', false],
    ['<dl><dt>t</dt><dd class="p">a<dd class="d">b</dd></dd></dl>', '.p > .d', true],
    ['<dl><dt class="p">a<dd class="d">b</dd></dt></dl>', '.p > .d', true],
    ['<select aria-label="s"><option class="p">a<option class="d">b</option></option></select>', '.p > .d', true],
    ['<select aria-label="s"><optgroup class="p" label="a"><optgroup class="d" label="b"><option>x</option></optgroup></optgroup></select>', '.p > .d', true],
    ['<table><tbody><tr><td class="p">a<td class="d">b</td></td></tr></tbody></table>', '.p > .d', true],
    ['<table><tbody><tr><td class="p">a<tr class="d"><td>b</td></tr></td></tr></tbody></table>', '.p .d', true],
    ['<table><tbody><tr><td class="p"><table><tbody><tr class="d"><td>b</td></tr></tbody></table></td></tr></tbody></table>', '.p .d', false],
    ['<table class="p"><tr><td>a<td class="d">b</tr></table>', '.p .d', false],
  ]) {
    await load(page, html);
    expect(await page.evaluate(s => document.querySelector(s) === null, written), html).toBe(restructured);
    expect(has(html, 'W_HTML_RESTRUCTURED', ['dropped', 'auto-closed']), html).toBe(restructured);
  }
});

test('J3: a summary is the details\' summary only as its child', async ({page}) => {
  for (const [html, theirs] of [
    ['<details class="x"><summary class="s">S</summary>body</details>', true],
    ['<details class="x"><p>p</p><summary class="s">S</summary>body</details>', true],
    ['<details class="x"><div><summary class="s">S</summary></div>body</details>', false],
    ['<details class="x"><section><div><summary class="s">S</summary></div></section>body</details>', false],
  ]) {
    await load(page, html);
    // Its activation behavior opens the details only if it is the details' summary; elsewhere the details draws its
    // own label first (the summary is not at its top).
    const opened = await page.evaluate(() => { document.querySelector('.s').click(); return document.querySelector('.x').open; });
    expect(opened, html).toBe(theirs);
    expect(has(html, 'W_HTML_SUMMARY_OUTSIDE'), html).toBe(!theirs);
  }
});

test('J4: a legend is the fieldset\'s legend (drawn on its border) only as its child', async ({page}) => {
  for (const [html, theirs] of [
    ['<fieldset class="f"><legend class="l">Legend</legend><input aria-label="x"></fieldset>', true],
    ['<fieldset class="f"><input aria-label="x"><legend class="l">Legend</legend></fieldset>', true],
    ['<fieldset class="f"><div><legend class="l">Legend</legend></div><input aria-label="x"></fieldset>', false],
  ]) {
    await load(page, html);
    const onBorder = await page.evaluate(() => document.querySelector('.l').getBoundingClientRect().top === document.querySelector('.f').getBoundingClientRect().top);
    expect(onBorder, html).toBe(theirs);
    expect(has(html, 'W_HTML_LEGEND_OUTSIDE'), html).toBe(!theirs);
  }
});

test('J5: a label labels one control (control.labels)', async ({page}) => {
  for (const html of [
    '<label class="lab">Name <input class="a"> <input class="b"></label>',
    '<label class="lab">Name <input class="a"></label>',
    '<label class="lab">Name <span><input class="a"></span></label>',
    '<label class="lab">Name <button class="a">x</button><input class="b"></label>',
    '<label class="lab">Name <input type="hidden" class="a"><input class="b"></label>',
    '<div><label class="lab" for="b">Name <input class="a"></label><input id="b" class="b"></div>',
    '<label class="lab">Name <select class="a"><option>x</option></select><textarea class="b"></textarea></label>',
  ]) {
    await load(page, html);
    // The controls inside the label that it does not label.
    const unlabeled = await page.evaluate(() => [...document.querySelector('.lab').querySelectorAll('input:not([type=hidden]), button, select, textarea')]
      .filter(c => ![...c.labels].includes(document.querySelector('.lab'))).map(c => `.${c.className}`));
    expect((analyze(html).layoutWarnings ?? []).filter(w => w.code === 'W_HTML_LABEL_EXTRA_CONTROL').map(w => w.box), html).toEqual(unlabeled);
  }
});

test('J6: what only the content model forbids is kept as written, and rendered', async ({page, browserName}) => {
  for (const [html, written] of [
    ['<button class="p"><div class="d">x</div></button>', '.p > .d'],
    ['<span class="p"><div class="d">x</div></span>', '.p > .d'],
    ['<span class="p"><a href="#x"><div class="d">x</div></a></span>', '.p .d'],
    ['<label class="p">a <h2 class="d">x</h2></label>', '.p > .d'],
    ['<header class="p"><nav><header class="d">x</header></nav></header>', '.p .d'],
    ['<div class="p"><option class="d">x</option></div>', '.p > .d'],
    ['<div class="p"><figcaption class="d">x</figcaption></div>', '.p > .d'],
    ['<label class="p">a <label class="d">b <input aria-label="x"></label></label>', '.p > .d'],
  ]) {
    await load(page, html);
    expect(await page.evaluate(s => document.querySelector(s) !== null && document.querySelector(s).getBoundingClientRect().height > 0, written), html).toBe(true);
    expect(has(html, 'W_HTML_CONTENT_MODEL'), html).toBe(true);
    expect(has(html, 'W_HTML_RESTRUCTURED'), html).toBe(false);
  }
  // No measured effect, which is why these are strict-only: even a heading inside a button stays a heading in
  // Chromium's accessibility tree (the one Playwright reaches), and a heading in a label likewise.
  if (browserName === 'chromium') {
    const roles = async html => { await load(page, html); const cdp = await page.context().newCDPSession(page); const {nodes} = await cdp.send('Accessibility.getFullAXTree'); return nodes.filter(n => !n.ignored).map(n => n.role?.value); };
    expect(await roles('<button><h2>Title</h2></button>')).toContain('heading');
    expect(await roles('<label>a <h2>Title</h2><input></label>')).toContain('heading');
  }
});

test('J7: a paragraph built through the DOM keeps flow content inside it; parsing the same markup does not', async ({page}) => {
  await load(page, '<main id="m"></main>');
  for (const tag of ['div', 'ul', 'table', 'h2', 'p', 'span']) {
    const r = await page.evaluate(tag => {
      const m = document.getElementById('m'); m.replaceChildren();
      // As React and Vue build it: createElement and appendChild, no HTML parser.
      const p = document.createElement('p'); p.className = 'q'; p.append('b');
      const child = document.createElement(tag); child.className = 'd'; child.textContent = 'x'; p.append(child); m.append(p);
      const pr = p.getBoundingClientRect(), cr = child.getBoundingClientRect();
      const built = child.parentElement === p && cr.height > 0 && cr.top >= pr.top && cr.bottom <= pr.bottom;
      // The same markup through the parser (server rendering, innerHTML).
      const html = m.innerHTML; m.innerHTML = html;
      return {built, reparsed: m.querySelector('.q > .d') !== null};
    }, tag);
    expect(r.built, tag).toBe(true);
    expect(r.reparsed, tag).toBe(tag === 'span');
    const tree = {tag: 'main', classes: ['m'], children: [{tag: 'p', classes: ['q'], children: [{tag, classes: ['d']}]}]};
    const {analyzeLayout} = await import('../packages/veriss/src/index.mjs');
    expect(analyzeLayout(tree, {name: 'C', css: '*{margin:0}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).diagnostics.some(d => d.code === 'E_HTML_PARAGRAPH_CONTENT'), tag).toBe(tag !== 'span');
  }
});
