import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// Replaced and form elements inside a content-sized flex item (flex-basis auto, width auto): the item's min- and
// max-content widths come from the element's own width. Measured in Chromium, Firefox and WebKit (checklist I20).
// - An img with an auto width and a px height takes its width from the height through its ratio (the file's natural
//   size, else the width/height attributes): a 120×30 picture 24px tall is 96px wide (min and max) in all three.
// - An auto-sized img with a known file is its natural size (120px).
// - Form controls without a px width (input, select, textarea) differ between the browsers (a text input is 153px in
//   Chromium, 189px in Firefox, 155.875px in WebKit): Unknown.
// - An svg sized by the 300px default (no width, no viewBox ratio): Firefox's min-content is 0, Chromium's and WebKit's
//   300px: Unknown.
const g = 'display:grid;grid-template-columns:minmax(0,1fr);align-content:start';
const logo = {'/logo.png': {width: 120, height: 30}, '/square.png': {width: 60, height: 60}};
const run = (css, inner, extra = {}) => analyzeHTML(`<html lang="en"><body><div class="s"><div class="a">${inner}</div><div class="b"></div></div></body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.s{display:flex;column-gap:10px}.b{flex:1;height:5px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, images: logo, ...extra});
const size = (r, box, vw = 500) => { const s = r.sizes.find(s => s.box === box && s.rect && s.range.min <= vw && vw <= s.range.max); const v = a => Number(String(a.coefficient).split('/').reduce((p, c) => p / c)) * vw + Number(String(a.constant).split('/').reduce((p, c) => p / c)); return s && [v(s.rect.inlineSize), v(s.rect.blockSize)]; };
const decided = r => assert.notEqual(r.status, 'unknown', JSON.stringify(r.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message)));
const reason = r => r.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message).join('\n');

const img = (attrs = '', src = '/logo.png') => `<img src="${src}" alt="Logo"${attrs}>`;
for (const [name, css, inner, width, height] of [
  ['px height and the file ratio', 'img{display:block;height:24px}', img(), 96, 24],
  ['the attributes ratio under width: auto', 'img{display:block;width:auto;height:24px}', img(' width="120" height="30"', '/unknown.png'), 96, 24],
  ['border-box padding and border', 'img{display:block;height:24px;padding:0 4px;border:1px solid red}', img(), 98, 24],
  ['content-box padding', 'img{display:block;height:24px;padding:2px;box-sizing:content-box}', img(), 100, 28],
  ['a px max-width caps it', 'img{display:block;height:24px;max-width:50px}', img(), 50, 24],
  ['a px min-width raises it', 'img{display:block;height:24px;min-width:150px}', img(), 150, 24],
  ['a percentage of the parent\'s px height', '.a{height:24px}img{display:block;height:100%}', img(), 96, 24],
  ['an auto-sized img with a known file', 'img{display:block}', img(), 120, 30],
]) test(`img in a content-sized flex item: ${name}`, () => {
  const r = run(css, inner);
  decided(r);
  assert.deepEqual(size(r, 'img@P/0/0/0/0'), [width, height]);
  assert.deepEqual(size(r, '.a')[0], width);
  // The grower starts after the item and the gap at every width.
  for (const vw of [320, 800]) assert.equal(size(r, '.b', vw)[0], vw - width - 10);
});

test('in a wider block parent the img keeps its ratio width (block-level replaced elements do not stretch)', () => {
  const r = run('.a{width:300px}img{display:block;height:24px}', img());
  decided(r);
  assert.deepEqual(size(r, 'img@P/0/0/0/0'), [96, 24]);
  assert.deepEqual(size(r, '.a')[0], 300);
});

test('an img whose width follows an unknown ratio stays Unknown', () => {
  // No attributes and no known file: the loaded file decides the width.
  assert.match(reason(run('img{display:block;height:24px}', img('', '/unknown.png'))), /img/);
  // The attributes say 4:1, the file is square: reserved 96px wide, loaded 24px (measured): the width shifts on load.
  assert.equal(run('img{display:block;width:auto;height:24px}', img(' width="120" height="30"', '/square.png')).status, 'unknown');
  // A min- or max-height in play: not modeled.
  assert.equal(run('img{display:block;height:24px;max-height:12px}', img()).status, 'unknown');
  // Stretched in a column flex container or a stretching grid it fills the area (300px, measured), not 96px.
  assert.equal(run('.a{width:300px;display:flex;flex-direction:column}img{height:24px}', img()).status, 'unknown');
  assert.equal(run('.a{width:300px;display:grid;justify-items:stretch}img{height:24px}', img()).status, 'unknown');
  // A percentage height against a parent without a px height.
  assert.equal(run('img{display:block;height:100%}', img()).status, 'unknown');
  // A parent whose min- or max-height clamps its px height: the used height differs from the declared one (24px with
  // min-height 48px → the img is 48px tall and 192px wide; max-height 12px → 48px wide; measured in all three).
  assert.equal(run('.a{height:24px;min-height:48px}img{display:block;height:100%}', img()).status, 'unknown');
  assert.equal(run('.a{height:24px;max-height:12px}img{display:block;height:100%}', img()).status, 'unknown');
});

// srcset: a density descriptor scales the natural size (a 120×30 file as the single 2x candidate is 60×15 CSS px,
// measured in all three); several candidates without a device pixel ratio leave the loaded one open. The natural-width
// fallback is not used with a srcset; the width from a px height and the ratio is (96px at 2x too, measured).
test('an auto-sized img with a srcset keeps its natural width Unknown; a px height still gives it', () => {
  assert.equal(run('img{display:block}', '<img srcset="/logo.png 2x" alt="Logo">').status, 'unknown');
  assert.equal(run('img{display:block}', '<img srcset="/logo.png 1x, /logo.png 2x" alt="Logo">', {images: {...logo}}).status, 'unknown');
  assert.equal(run('img{display:block}', '<img src="/logo.png" srcset="/logo.png 2x" alt="Logo">').status, 'unknown');
  const r = run('img{display:block;height:24px}', '<img srcset="/logo.png 2x" alt="Logo">');
  decided(r);
  assert.deepEqual(size(r, 'img@P/0/0/0/0'), [96, 24]);
});

test('form controls without a px width stay Unknown (their default widths differ between browsers)', () => {
  for (const inner of ['<input type="text" aria-label="Name">', '<select aria-label="Kind"></select>', '<textarea aria-label="Note"></textarea>'])
    assert.match(reason(run('input,select,textarea{display:block}', inner)), /replaced or form element/, inner);
});

test('an svg at the 300px default width stays Unknown; one sized by its attributes is decided', () => {
  // Firefox gives the default-sized svg a min-content contribution of 0, Chromium and WebKit 300px.
  assert.match(reason(run('svg{display:block}', '<svg></svg>')), /svg/);
  assert.match(reason(run('svg{display:block}', '<svg height="40"></svg>')), /svg/);
  const r = run('svg{display:block}', '<svg width="100"></svg>');
  decided(r);
  assert.deepEqual(size(r, '.a')[0], 100);
});

test('a bare fr column with a default-width svg stays Unknown (its minimum is the min-content contribution)', () => {
  const grid = svg => analyzeHTML(`<html lang="en"><body><div class="g"><div class="c">${svg}</div><div class="d"></div></div></body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.g{display:grid;grid-template-columns:1fr 1fr}svg{display:block}.d{height:5px}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
  assert.match(reason(grid('<svg></svg>')), /300px default width/);
  decided(grid('<svg width="100"></svg>'));
});

// A width from the height and the ratio that a max-width caps: the box is 48×24 for a 120×30 picture (measured in
// Chromium, Firefox and WebKit), so object-fit: fill squeezes it (W_LAYOUT_IMAGE_DISTORTED). Uncapped it is 96×24, the
// picture's own ratio: nothing to report.
test('a max-width that caps the width from the ratio distorts the picture', () => {
  const distorted = r => (r.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_IMAGE_DISTORTED');
  const capped = run('img{display:block;height:24px;max-width:48px}', img());
  decided(capped);
  assert.equal(distorted(capped).length, 1);
  assert.equal(distorted(capped)[0].natural, '120/30');
  assert.deepEqual(distorted(run('img{display:block;height:24px}', img())), []);
});
