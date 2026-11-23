import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// Row flex items with flex-basis: auto and an auto width: the flex base size is the max-content width and the
// automatic minimum the min-content width (Flexbox §9.2, §4.5), from the same intrinsic sizes as grid columns.
// Expected values are Chromium's (measured).
const g = 'display:grid;grid-template-columns:minmax(0,1fr);align-content:start';
const w = '<div class="w"><i></i><i></i><i></i></div>'; // min-content 60px, max-content 190px
const run = (css, html) => analyzeHTML(`<html lang="en"><body><div class="s">${html}</div></body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.s{display:flex;column-gap:10px}.a,.b{height:5px}.w{display:flex;flex-wrap:wrap;column-gap:5px}.w i{display:block;width:60px;height:2px}.k{display:block;width:24px;height:2px}${css}`, viewport: {min: 100, max: 800, height: {min: 600, max: 900}}});
const columns = (r, vw) => { const v = a => Number(String(a.coefficient).split('/').reduce((p, c) => p / c)) * vw + Number(String(a.constant).split('/').reduce((p, c) => p / c)); return r.sizes.filter(s => /^\.[ab]$/.test(s.box) && s.rect && s.range.min <= vw && vw <= s.range.max).map(s => [Math.round(v(s.rect.inlineStart) * 1000) / 1000, Math.round(v(s.rect.inlineSize) * 1000) / 1000]); };
const cases = {
  'two content items': ['', `<div class="a">${w}</div><div class="b"><i class="k"></i></div>`, {500: [[0, 190], [200, 24]], 300: [[0, 190], [200, 24]], 150: [[0, 116], [126, 24]]}],
  'content + grow': ['.b{flex:1}', `<div class="a">${w}</div><div class="b"></div>`, {500: [[0, 190], [200, 300]], 300: [[0, 190], [200, 100]], 150: [[0, 140], [150, 0]]}],
  'content + fixed': ['.b{width:100px;flex-shrink:0}', `<div class="a">${w}</div><div class="b"></div>`, {500: [[0, 190], [200, 100]], 150: [[0, 60], [70, 100]]}],
  'icon + grow': ['.b{flex:1;min-width:0}', `<div class="a"><i class="k"></i></div><div class="b"></div>`, {500: [[0, 24], [34, 466]], 150: [[0, 24], [34, 116]]}],
  'two shrinking': ['', `<div class="a">${w}</div><div class="b">${w}</div>`, {500: [[0, 190], [200, 190]], 300: [[0, 145], [155, 145]], 150: [[0, 70], [80, 70]]}],
};
for (const [name, [css, html, widths]] of Object.entries(cases)) test(name, () => {
  const r = run(css, html);
  assert.notEqual(r.status, 'unknown', JSON.stringify(r.diagnostics.map(d => d.message)));
  for (const [vw, expected] of Object.entries(widths)) assert.deepEqual(columns(r, Number(vw)), expected, `${name} at ${vw}px`);
});

test('text without a max-content width stays Unknown', () => {
  assert.equal(run('', '<div class="a">text</div><div class="b"></div>').status, 'unknown');
});

// max-width in vw on a content-sized flex item: where the content is no wider than that fraction of the narrowest
// viewport, it never caps (a 300px dialog with max-width: 100vw from 320px: measured 300px wide at 320 and 800 in
// Chromium, Firefox and WebKit). Where it may cap (360px content, or 50vw) it stays Unknown.
test('a vw max-width that never caps the content width of a flex item', () => {
  const html = '<html lang="en"><body><div class="bg"><div class="c"><div class="i"></div><div class="k"></div></div></div></body></html>';
  const css = (max, k) => `*{box-sizing:border-box;margin:0}html,body{${g}}.bg{position:fixed;top:0;left:0;width:100%;height:100%;display:flex;justify-content:center;align-items:center}.c{position:relative;${max}}.i{display:block;width:16px;height:16px}.k{width:${k}px;height:250px}`;
  const at = (max, k) => analyzeHTML(html, {name: 'P', css: css(max, k), viewport: {min: 320, max: 1280, height: {min: 480, max: 900}}, accessibility: true});
  const r = at('max-width:100vw', 300);
  assert.notEqual(r.status, 'unknown', JSON.stringify(r.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message)));
  const c = r.sizes.find(s => s.box === '.c' && s.rect).rect;
  assert.deepEqual([c.inlineSize.constant, c.inlineSize.coefficient], ['300', '0']);
  // Centred: (width − 300) / 2.
  assert.deepEqual([c.inlineStart.constant, c.inlineStart.coefficient], ['-150', '1/2']);
  for (const [max, k] of [['max-width:100vw', 360], ['max-width:50vw', 300]]) assert.equal(at(max, k).status, 'unknown', `${max} ${k}`);
});

// max-height in vh on an auto-height box: where its height never exceeds that fraction of the viewport height, the
// clamp does nothing; where it may, Unknown.
test('a vh max-height that never caps an auto height', () => {
  const html = '<html lang="en"><body><div class="bg"><div class="c"><div class="i"></div><div class="k"></div></div></div></body></html>';
  const css = (max, k) => `*{box-sizing:border-box;margin:0}html,body{${g}}.bg{position:fixed;top:0;left:0;width:100%;height:100%;display:flex;justify-content:center;align-items:center}.c{position:relative;max-width:100vw;${max}}.i{display:block;width:16px;height:16px}.k{width:300px;height:${k}px}`;
  const at = (max, k) => analyzeHTML(html, {name: 'P', css: css(max, k), viewport: {min: 320, max: 1280, height: {min: 480, max: 900}}, accessibility: true});
  const r = at('max-height:100vh', 250);
  assert.notEqual(r.status, 'unknown', JSON.stringify(r.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message)));
  const c = r.sizes.find(s => s.box === '.c' && s.rect).rect;
  assert.deepEqual([c.blockSize.constant, c.blockStart.constant, c.blockStart.heightCoefficient], ['266', '-133', '1/2']);
  for (const [max, k] of [['max-height:100vh', 500], ['max-height:30vh', 250]]) assert.equal(at(max, k).status, 'unknown', `${max} ${k}`);
});
