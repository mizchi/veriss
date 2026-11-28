import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// An img's width/height attributes reserve the ratio aspect-ratio: auto w / h, which holds only until the file loads:
// afterwards the file's natural ratio wins (issue #55; measured in #54 in Chromium, Firefox and WebKit: width="120"
// height="30" at a 24px height is 96px wide before load and 24px after, for a square file). So the attributes' ratio is
// taken as the file's only under trustImageAttributes: true. By default an img whose geometry depends on that ratio and
// whose file's size is not in the images option is Unknown. A known file and sizes that do not depend on the ratio
// (both axes px, from the attributes or from CSS) are unaffected.
const logo = {'/logo.png': {width: 120, height: 30}, '/square.png': {width: 60, height: 60}};
const page = inner => `<html lang="en"><body><div class="s"><div class="a">${inner}</div><div class="b"></div></div></body></html>`;
const run = (css, inner, extra = {}) => analyzeHTML(page(inner), {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr);align-content:start}.b{height:5px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, images: logo, ...extra});
const size = (r, box, vw = 500) => { const s = r.sizes.find(s => s.box === box && s.rect && s.range.min <= vw && vw <= s.range.max); const v = a => Number(String(a.coefficient).split('/').reduce((p, c) => p / c)) * vw + Number(String(a.constant).split('/').reduce((p, c) => p / c)); return s && [v(s.rect.inlineSize), v(s.rect.blockSize)]; };
const decided = r => assert.notEqual(r.status, 'unknown', JSON.stringify(r.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message)));
const unknowns = r => r.diagnostics.filter(d => d.severity === 'unknown');
const img = (attrs, src = '/unknown.png') => `<img src="${src}" alt="Logo"${attrs}>`;
const attrs = ' width="120" height="30"';
const trusted = {trustImageAttributes: true};
const saysHow = r => {
  assert.equal(r.status, 'unknown');
  assert.ok(unknowns(r).some(d => d.code === 'U_LAYOUT_IMAGE' && /images/.test(d.message) && /trustImageAttributes/.test(d.message)), JSON.stringify(unknowns(r).map(d => [d.code, d.message])));
};

// A width-sized img with height: auto (the common `img{max-width:100%;height:auto}` reset).
const widthSized = 'img{display:block;width:200px;height:auto}';
// The #54 path: an img whose width comes from its px height through the ratio (in a content-sized flex item).
const heightSized = '.s{display:flex;column-gap:10px}.b{flex:1}img{display:block;width:auto;height:24px}';

test('by default the attributes ratio of an img with an unknown file is Unknown where the height depends on it', () => {
  saysHow(run(widthSized, img(attrs)));
});

test('by default the attributes ratio of an img with an unknown file is Unknown where the width depends on it (#54)', () => {
  saysHow(run(heightSized, img(attrs)));
  // In block flow too.
  const block = '.a{width:300px}img{display:block;width:auto;height:24px}';
  saysHow(run(block, img(attrs)));
  decided(run(block, img(attrs), trusted));
  assert.deepEqual(size(run(block, img(attrs), trusted), 'img@P/0/0/0/0'), [96, 24]);
  // A grid item (the ratio width of a grid item with a definite height): the reason names the attributes too.
  saysHow(run('.a{display:grid;grid-template-columns:300px}img{display:block;width:auto;height:24px}', img(attrs)));
});

test('trustImageAttributes: true takes the attributes as the file\'s size (the layout before the file loads)', () => {
  const tall = run(widthSized, img(attrs), trusted);
  decided(tall);
  assert.deepEqual(size(tall, 'img@P/0/0/0/0'), [200, 50]);
  const wide = run(heightSized, img(attrs), trusted);
  decided(wide);
  assert.deepEqual(size(wide, 'img@P/0/0/0/0'), [96, 24]);
  assert.equal(size(wide, '.b')[0], 500 - 96 - 10);
  // The result states what it assumed; by default (and with a known file) there is nothing to state.
  assert.ok(tall.assumptions.some(a => /trustImageAttributes/.test(a) && /img/.test(a)), JSON.stringify(tall.assumptions));
  assert.ok(!run('img{display:block}', img(attrs)).assumptions.some(a => /trustImageAttributes/.test(a)));
  assert.ok(!run(widthSized, img(attrs, '/logo.png'), trusted).assumptions.some(a => /trustImageAttributes/.test(a)));
});

test('a known file is unaffected: its ratio decides, and a differing one is still E_LAYOUT_IMAGE_RATIO', () => {
  for (const extra of [{}, trusted]) {
    const r = run(widthSized, img(attrs, '/logo.png'), extra);
    decided(r);
    assert.deepEqual(size(r, 'img@P/0/0/0/0'), [200, 50]);
    const w = run(heightSized, img(attrs, '/logo.png'), extra);
    decided(w);
    assert.deepEqual(size(w, 'img@P/0/0/0/0'), [96, 24]);
    const square = run(widthSized, img(attrs, '/square.png'), extra);
    assert.ok(square.diagnostics.some(d => d.code === 'E_LAYOUT_IMAGE_RATIO'), JSON.stringify(square.diagnostics.map(d => d.code)));
  }
});

test('sizes that do not depend on the ratio are decided by default', () => {
  // Both sizes from the attributes.
  const own = run('img{display:block}', img(attrs));
  decided(own);
  assert.deepEqual(size(own, 'img@P/0/0/0/0'), [120, 30]);
  // CSS fixes both axes over the attributes.
  const css = run('img{display:block;width:100px;height:40px}', img(attrs));
  decided(css);
  assert.deepEqual(size(css, 'img@P/0/0/0/0'), [100, 40]);
  // Without a block axis the height is not checked, so height: auto does not need the ratio.
  const inline = analyzeHTML(page(img(attrs)), {name: 'P', css: `*{box-sizing:border-box;margin:0}${widthSized}`, viewport: {min: 320, max: 800}});
  decided(inline);
});

test('the distortion check takes the attributes as the picture only under trustImageAttributes', () => {
  const distorted = r => (r.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_IMAGE_DISTORTED');
  const css = 'img{display:block;width:100px;height:100px}';
  assert.deepEqual(distorted(run(css, img(attrs))), []);
  const t = distorted(run(css, img(attrs), trusted));
  assert.equal(t.length, 1);
  assert.equal(t[0].basis, 'attributes');
  assert.equal(distorted(run(css, img(attrs, '/logo.png')))[0]?.basis, 'file');
});

test('trustImageAttributes must be a boolean', () => {
  assert.throws(() => run(widthSized, img(attrs), {trustImageAttributes: 'yes'}), /trustImageAttributes/);
});

// A srcset with width descriptors (or a dynamic src) leaves the loaded file open, so images cannot name it: the reason
// says trustImageAttributes is the way to take the attributes, and does not send the caller to images.
test('an img whose loaded file is not known names trustImageAttributes only', () => {
  const thumb = ' srcset="/p-400.jpg 400w, /p-800.jpg 800w" width="400" height="300"';
  const files = {'/p-400.jpg': {width: 400, height: 300}, '/p-800.jpg': {width: 800, height: 600}};
  const r = run(widthSized, img(thumb, '/p-400.jpg'), {images: files});
  assert.equal(r.status, 'unknown');
  assert.ok(unknowns(r).some(d => d.code === 'U_LAYOUT_IMAGE' && /trustImageAttributes/.test(d.message) && /width descriptors/.test(d.message)), JSON.stringify(unknowns(r).map(d => d.message)));
  const t = run(widthSized, img(thumb, '/p-400.jpg'), {images: files, ...trusted});
  decided(t);
  assert.deepEqual(size(t, 'img@P/0/0/0/0'), [200, 150]);
});
