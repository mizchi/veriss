// Checklist J: the HTML content model and ARIA ownership — parent-child structure the parser rebuilds, that changes
// what the browser renders or exposes, or that only the content model forbids.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

const css = '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}';
const run = html => analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}, accessibility: true});
const codes = (r, code) => [...(r.layoutWarnings ?? []), ...(r.accessibility?.warnings ?? []), ...r.diagnostics].filter(w => w.code === code);
const restructured = html => codes(run(html), 'W_HTML_RESTRUCTURED');

test('J1: a table part written outside a table is dropped by the parser', () => {
  const [w] = restructured('<div class="d"><td>x</td></div>');
  assert.equal(w?.tag, 'div');
  assert.equal(w.kind, 'dropped');
  assert.deepEqual(w.dropped, ['td']);
  assert.match(w.message, /<td>/); assert.match(w.message, /<table>/);
  assert.deepEqual(restructured('<div class="d"><tr><td>x</td></tr></div>')[0]?.dropped, ['tr', 'td']);
  assert.deepEqual(restructured('<section class="d"><thead><tr><th>h</th></tr></thead><caption>c</caption></section>')[0]?.dropped, ['thead', 'tr', 'th', 'caption']);
  // Where they belong, nothing is dropped; a tbody the parser supplies is not a restructuring either.
  for (const html of ['<table><tr><td>x</td></tr></table>', '<table><caption>c</caption><colgroup><col></colgroup><thead><tr><th>h</th></tr></thead><tbody><tr><td>x</td></tr></tbody></table>',
    '<template><tr><td>x</td></tr></template>', '<svg width="10" height="10"><title>t</title></svg>', '<div class="d">td</div>'])
    assert.deepEqual(restructured(html), [], html);
});

test('J2: an element written inside one of its own kind whose end tag is optional is closed by it', () => {
  for (const [html, tag, inside] of [
    ['<ul><li>a<li class="n">b</li></li></ul>', 'li', 'li'],
    ['<dl><dt>a</dt><dd>a<dd class="n">b</dd></dd></dl>', 'dd', 'dd'],
    ['<dl><dt>a<dd class="n">b</dd></dt></dl>', 'dd', 'dt'],
    ['<select aria-label="s"><option>a<option class="n">b</option></option></select>', 'option', 'option'],
    ['<table><tbody><tr><td>a<td class="n">b</td></td></tr></tbody></table>', 'td', 'td'],
    ['<table><tbody><tr><td>a<tr class="n"><td>b</td></tr></td></tr></tbody></table>', 'tr', 'td'],
    ['<table><tbody><tr><td>a<tbody class="n"><tr><td>b</td></tr></tbody></td></tr></tbody></table>', 'tbody', 'td'],
  ]) {
    const found = restructured(html);
    assert.equal(found.length, 1, `${html} ${JSON.stringify(found.map(f => f.message))}`);
    assert.equal(found[0].kind, 'auto-closed', html);
    assert.equal(found[0].tag, tag, html);
    assert.equal(found[0].writtenIn, inside, html);
    assert.match(found[0].message, new RegExp(`<${inside}>`), html);
  }
  // Omitted end tags (valid HTML) and a real nested list are not restructurings.
  for (const html of ['<ul><li>a<li>b</ul>', '<ul><li>a</li><li>b</li></ul>', '<ul><li>a<ul><li>b</li></ul></li></ul>', '<table><tr><td>a<td>b</tr></table>',
    '<table><tbody><tr><td><table><tbody><tr><td>x</td></tr></tbody></table></td></tr></tbody></table>', '<dl><dt>a<dd>b</dl>'])
    assert.deepEqual(restructured(html), [], html);
});

test('J3, J4: a summary outside details and a legend outside fieldset are not theirs', () => {
  const tags = (html, code) => codes(run(html), code).map(w => w.tag);
  assert.deepEqual(tags('<details><div><summary class="s">s</summary></div>x</details>', 'W_HTML_SUMMARY_OUTSIDE'), ['summary']);
  assert.match(codes(run('<details><div><summary class="s">s</summary></div>x</details>'), 'W_HTML_SUMMARY_OUTSIDE')[0].message, /"Details"/);
  assert.deepEqual(tags('<div><summary class="s">s</summary></div>', 'W_HTML_SUMMARY_OUTSIDE'), ['summary']);
  // Anywhere among the details' children it is the summary (the browsers draw it first).
  for (const html of ['<details><summary>s</summary>x</details>', '<details><p>p</p><summary>s</summary></details>'])
    assert.deepEqual(tags(html, 'W_HTML_SUMMARY_OUTSIDE'), [], html);
  assert.deepEqual(tags('<fieldset><div><legend class="l">l</legend></div><input aria-label="x"></fieldset>', 'W_HTML_LEGEND_OUTSIDE'), ['legend']);
  for (const html of ['<fieldset><legend>l</legend><input aria-label="x"></fieldset>', '<fieldset><input aria-label="x"><legend>l</legend></fieldset>'])
    assert.deepEqual(tags(html, 'W_HTML_LEGEND_OUTSIDE'), [], html);
  // At the root of what was analyzed the parent is the page's body: marked, so a component lint leaves it to the caller.
  assert.equal(codes(run('<summary class="s">s</summary>'), 'W_HTML_SUMMARY_OUTSIDE')[0].atRoot, true);
  assert.equal(codes(run('<div><summary class="s">s</summary></div>'), 'W_HTML_SUMMARY_OUTSIDE')[0].atRoot, undefined);
});

test('J5: a label labels one control; the others inside it get nothing from it', () => {
  const extra = html => codes(run(html), 'W_HTML_LABEL_EXTRA_CONTROL').map(w => w.box);
  assert.deepEqual(extra('<label>Name <input class="a"> <input class="b"></label>'), ['.b']);
  assert.deepEqual(extra('<label>Name <button class="a">x</button><input class="b"></label>'), ['.b']);
  assert.deepEqual(extra('<div><label for="b">Name <input class="a"></label><input id="b" class="b"></div>'), ['.a']);
  for (const html of ['<label>Name <input class="a"></label>', '<label>Name <span><input class="a"></span></label>', '<label>Name <input type="hidden" class="a"><input class="b"></label>', '<div><label for="a">Name</label><input id="a"></div>'])
    assert.deepEqual(extra(html), [], html);
});

test('J6: what only the content model forbids (the browsers keep it as written)', () => {
  const kinds = html => codes(run(html), 'W_HTML_CONTENT_MODEL').map(w => `${w.kind}:${w.tag}`);
  assert.deepEqual(kinds('<button class="b"><div class="d">x</div></button>'), ['flow-in-phrasing:div']);
  assert.deepEqual(kinds('<span class="s"><a href="#x"><div class="d">x</div></a></span>'), ['flow-in-phrasing:div']);
  assert.deepEqual(kinds('<button class="b"><h2>x</h2></button>'), ['flow-in-phrasing:h2']);
  assert.deepEqual(kinds('<header><nav><header>x</header></nav></header>'), ['header-footer:header']);
  assert.deepEqual(kinds('<div><option>x</option></div>'), ['option-outside:option']);
  assert.deepEqual(kinds('<div><figcaption>x</figcaption></div>'), ['figcaption-outside:figcaption']);
  assert.deepEqual(kinds('<label>a <label>b <input aria-label="x"></label></label>'), ['label-in-label:label']);
  for (const html of ['<a href="#x"><div>x</div></a>', '<button><span>x</span></button>', '<details><summary><h2>t</h2></summary>x</details>', '<fieldset><legend><h2>t</h2></legend></fieldset>',
    '<select aria-label="s"><optgroup label="g"><option>x</option></optgroup></select>', '<figure><figcaption>c</figcaption></figure>', '<header><div>x</div></header><footer>y</footer>'])
    assert.deepEqual(kinds(html), [], html);
  // Every one carries the structure to write instead.
  for (const w of codes(run('<button class="b"><div class="d">x</div></button>'), 'W_HTML_CONTENT_MODEL')) assert.ok(w.fix);
});

test('J7: a paragraph holding flow content in a tree built through the DOM (no parser to restructure it)', async () => {
  const {analyzeLayout} = await import('../src/index.mjs');
  const {htmlRestructurings} = await import('../src/html.mjs');
  const tree = kids => ({tag: 'main', classes: ['m'], children: [{tag: 'p', classes: ['q'], children: kids}]});
  const found = kids => analyzeLayout(tree(kids), {name: 'C', css, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).diagnostics.filter(d => d.code === 'E_HTML_PARAGRAPH_CONTENT');
  const [f] = found([{tag: 'div', classes: ['d']}]);
  assert.equal(f?.box, '.q'); assert.equal(f.severity, 'error'); assert.match(f.fix, /<div>/); assert.match(f.message, /<div>/);
  for (const tag of ['ul', 'table', 'h2', 'p']) assert.equal(found([{tag, classes: ['d']}]).length, 1, tag);
  assert.equal(found([{tag: 'a', classes: ['l'], children: [{tag: 'div', classes: ['d']}]}]).length, 1, 'through a transparent a');
  for (const tag of ['span', 'strong', 'a', 'img']) assert.equal(found([{tag, classes: ['d']}]).length, 0, tag);
  // Markup an adapter builds through the DOM API (React, Vue): the paragraph as written, at its line, instead of the
  // parser's empty <p> (which a DOM-built tree never has).
  const dom = htmlRestructurings('<html lang="en"><body><main><p class="q" data-src-line="3">b<div class="d" data-src-line="3">x</div></p></main></body></html>', 'C', {dom: true});
  assert.deepEqual(dom.map(w => `${w.code}:${w.line}`), ['E_HTML_PARAGRAPH_CONTENT:3']);
  // Parsed as HTML (a page, a server-rendered component) it stays the parser's restructuring.
  assert.deepEqual(htmlRestructurings('<html lang="en"><body><main><p class="q">b<div class="d">x</div></p></main></body></html>', 'C').map(w => w.code), ['W_HTML_RESTRUCTURED']);
});
