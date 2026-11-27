// A background-image (or the image of the background shorthand) that is not an <image> — a bare URL without url(), a
// quoted string — is invalid: the browser drops the declaration and the box paints no image from it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';
import {parseLayoutCSS} from '../src/layout/css.mjs';
import {imageProblem} from '../src/layout/background-syntax.mjs';

const parse = css => { const diagnostics = []; const out = parseLayoutCSS([{css, file: 'a.css'}], (code, message) => diagnostics.push({code, message})); return {...out, diagnostics}; };
const run = css => analyzeHTML('<html lang="en"><body><div class="b"></div></body></html>', {name: 'P', viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, scrollbars: [{name: 'o', inlineSize: 0, blockSize: 0}],
  css: `*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${css}`});
const warnings = (r, code) => (r.layoutWarnings ?? []).filter(w => w.code === code);

test('imageProblem: values that are not an <image>', () => {
  for (const v of ['https://example.com/close.png', '"close.png"', "'close.png'", 'close.png', '/img/close.png', 'url(a.png), "b.png"', 'red'])
    assert.ok(imageProblem(v), v);
  for (const v of ['none', 'url(a.png)', 'url("https://example.com/close.png")', "url('a.png')", 'image-set("a.png" 1x, "a-2x.png" 2x)', '-webkit-image-set(url(a.png) 1x)',
    'linear-gradient(red, blue)', 'repeating-radial-gradient(circle, red, blue 10px)', 'conic-gradient(red, blue)', 'url(a.png), linear-gradient(red, blue)',
    'var(--img)', 'inherit', 'initial', 'unset', 'revert', 'revert-layer', 'cross-fade(url(a.png), url(b.png))', 'paint(foo)', 'element(#a)', '-webkit-gradient(linear, left top, left bottom, from(red), to(blue))'])
    assert.equal(imageProblem(v), null, v);
});

test('a bare URL in background-image is dropped with a warning, not U_LAYOUT_CSS for the sheet', () => {
  const css = '.b{width:42px;height:42px;background-image:https://example.com/close.png;background-size:42px 42px}';
  const parsed = parse(css);
  assert.deepEqual(parsed.diagnostics, []);
  const [note] = parsed.notes.filter(n => n.code === 'W_CSS_IMAGE_INVALID');
  assert.ok(note, JSON.stringify(parsed.notes));
  assert.equal(note.value, 'https://example.com/close.png');
  // The rest of the rule applies; the image does not.
  const decls = parsed.rules.flatMap(r => r.declarations.map(d => d.property));
  assert.ok(decls.includes('inline-size'), decls.join());
  assert.ok(!decls.includes('background-image'), decls.join());

  const r = run(css);
  assert.notEqual(r.status, 'unknown', JSON.stringify(r.diagnostics));
  assert.equal(r.diagnostics.filter(d => d.code === 'U_LAYOUT_CSS').length, 0);
  const [w] = warnings(r, 'W_CSS_IMAGE_INVALID');
  assert.ok(w, JSON.stringify(r.layoutWarnings));
  assert.equal(w.property, 'background-image');
  assert.equal(w.selector, '.b');
  assert.match(w.message, /https:\/\/example\.com\/close\.png/);
  assert.match(w.message, /drops/);
  assert.match(w.message, /url\("https:\/\/example\.com\/close\.png"\)/);
});

test('a quoted string in background-image is dropped; the earlier image stays', () => {
  const parsed = parse('.b{background-image:url(a.png);background-image:"close.png"}');
  assert.equal(parsed.notes.filter(n => n.code === 'W_CSS_IMAGE_INVALID').length, 1);
  assert.deepEqual(parsed.rules.flatMap(r => r.declarations.filter(d => d.property === 'background-image').map(d => d.value)), ['url(a.png)']);
});

test('the background shorthand with a bare URL or a quoted string as its image is dropped', () => {
  for (const css of ['.b{background:https://example.com/close.png no-repeat}', '.b{background:"close.png" center / cover no-repeat}']) {
    const parsed = parse(css);
    assert.deepEqual(parsed.diagnostics, [], css);
    const [note] = parsed.notes.filter(n => n.code === 'W_CSS_IMAGE_INVALID');
    assert.ok(note, css);
    assert.equal(note.property, 'background');
    assert.ok(!parsed.rules.flatMap(r => r.declarations.map(d => d.property)).some(p => p.startsWith('background')), css);
  }
  // A valid shorthand is kept.
  const ok = parse('.b{background:url(https://example.com/close.png) center / 42px 42px no-repeat}');
  assert.equal(ok.notes.filter(n => n.code === 'W_CSS_IMAGE_INVALID').length, 0);
  assert.ok(ok.rules.flatMap(r => r.declarations.map(d => d.property)).includes('background-image'));
});

test('valid images keep working', () => {
  for (const value of ['url(a.png)', 'url("https://example.com/close.png")', 'image-set("a.png" 1x)', 'linear-gradient(red, blue)', 'none', 'var(--img)']) {
    const r = run(`.b{width:42px;height:42px;background-image:${value}}`);
    assert.equal(warnings(r, 'W_CSS_IMAGE_INVALID').length, 0, value);
    assert.equal(r.diagnostics.filter(d => d.code === 'U_LAYOUT_CSS').length, 0, value);
  }
});

test('a stray colon in any other declaration (a missing semicolon) drops that declaration only', () => {
  // The browser reads "red\n background: blue" as one invalid value of color, and goes on with the next declaration.
  const parsed = parse('.b{color:red\n background:blue;width:10px}.c{height:5px}');
  assert.deepEqual(parsed.diagnostics, []);
  const props = parsed.rules.flatMap(r => r.declarations.map(d => d.property));
  assert.ok(!props.includes('color') && !props.some(p => p.startsWith('background')), props.join());
  assert.ok(props.includes('inline-size') && props.includes('block-size'), props.join());
  const [note] = parsed.notes.filter(n => n.code === 'W_CSS_STRAY_COLON');
  assert.ok(note);
  assert.equal(note.property, 'color');
  assert.equal(note.value, 'red\n background:blue'.replace(/\s+/g, ' '));
});

test('a "/" glued to the size in the shorthand is the position/size separator, not a bare URL', () => {
  for (const css of ['.b{background:url(a.png) center /cover no-repeat}', '.b{background:url(a.png) 0 0 /50% auto}', '.b{background:url(a.png) center/contain}', '.b{background:#fff url(a.png) left top /42px 42px no-repeat}']) {
    const parsed = parse(css);
    assert.equal(parsed.notes.filter(n => n.code === 'W_CSS_IMAGE_INVALID').length, 0, css);
    assert.ok(parsed.rules.flatMap(r => r.declarations.map(d => d.property)).includes('background-image'), css);
  }
  // A bare absolute path is still not an image.
  const bare = parse('.b{background:/img/close.png center / cover no-repeat}');
  assert.equal(bare.notes.filter(n => n.code === 'W_CSS_IMAGE_INVALID').length, 1);
});

test('an authored U+E000 in a string is not a repaired stray colon', () => {
  const parsed = parse('.b::before{content:"";width:10px}');
  assert.equal(parsed.notes.filter(n => n.code === 'W_CSS_STRAY_COLON').length, 0, JSON.stringify(parsed.notes));
  assert.ok(parsed.rules.flatMap(r => r.declarations.map(d => d.property)).includes('content'));
  // Both in one sheet: only the repaired declaration is dropped.
  const both = parse('.b::before{content:"";width:10px}.c{color:red\n background:blue}');
  assert.deepEqual(both.notes.filter(n => n.code === 'W_CSS_STRAY_COLON').map(n => n.property), ['color']);
  assert.ok(both.rules.flatMap(r => r.declarations.map(d => d.property)).includes('content'));
});
