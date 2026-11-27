import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// W_LAYOUT_HEIGHT_FIXED_TEXT warns about a px height on text whose font size follows the user's default font size. A
// collapsed panel (its padding box 0px tall and hiding its block overflow) hides the text on purpose at every font size,
// along with every box inside it: not warned. A box whose only content is a component's dynamic children (rendered as
// '…') may hold an icon rather than text; an inline icon sits on the strut's baseline, which grows with the default font
// size too (Chromium: a 12px inline svg in a 12px overflow: hidden box is 2px down at 16px and entirely cut off at
// 32px), so it is still warned, without claiming the content is text. Real text keeps the plain warning.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const warned = (html, css) => (analyzeHTML(`<html lang="en"><body><main class="page">${html}</main></body></html>`, {
  name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}},
}).layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_HEIGHT_FIXED_TEXT').map(w => w.box);

test('a collapsed panel (0px, block overflow hidden or clipped) is not warned, nor the text inside it', () => {
  for (const overflow of ['overflow:hidden', 'overflow-y:hidden', 'overflow-y:clip', 'overflow:clip'])
    assert.deepEqual(warned('<div class="panel">Details text</div>', `.panel{display:block;height:0px;${overflow}}`), [], overflow);
  assert.deepEqual(warned('<div class="panel"><p class="row">Details text</p></div>', '.panel{display:block;height:0;overflow:hidden}.row{display:block;height:24px}'), []);
  assert.deepEqual(warned('<div class="panel"><div><p class="row">Details text</p></div></div>', '.panel{display:block;height:0;overflow-y:hidden}.row{display:block;height:24px}'), []);
});

test('a 0px panel that shows its overflow, or whose padding shows content, still warns', () => {
  assert.deepEqual(warned('<div class="panel"><p class="row">Details text</p></div>', '.panel{display:block;height:0;padding:8px 0;overflow:hidden}.row{display:block;height:24px}'), ['.row']);
  assert.deepEqual(warned('<div class="panel"><p class="row">Details text</p></div>', '.panel{display:block;height:0}.row{display:block;height:24px}'), ['.row']);
  // A min-height raises the used height (100px here): the panel is open, its rows still warn.
  assert.deepEqual(warned('<div class="panel"><p class="row">Details text</p></div>', '.panel{display:block;height:0;min-height:100px;overflow:hidden}.row{display:block;height:24px}'), ['.row']);
  assert.deepEqual(warned('<div class="panel"><p class="row">Details text</p></div>', '.panel{display:block;height:0;min-height:1px;overflow:hidden}.row{display:block;height:24px}'), ['.row']);
  // Clipped sideways only: the text still shows below.
  assert.deepEqual(warned('<div class="panel"><p class="row">Details text</p></div>', '.panel{display:block;height:0;overflow-x:clip}.row{display:block;height:24px}'), ['.row']);
});

test('a box whose only content is dynamic children is warned without claiming it is text; literal text is warned as text', () => {
  const icon = '.icon{display:block;position:relative;width:12px;height:12px;overflow:hidden}';
  const report = analyzeHTML('<html lang="en"><body><main class="page"><span class="icon">…<!--isle-boundary:children--></span></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}${icon}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
  const [w] = (report.layoutWarnings ?? []).filter(x => x.code === 'W_LAYOUT_HEIGHT_FIXED_TEXT');
  assert.equal(w?.content, 'dynamic');
  assert.doesNotMatch(w.message, /its text/);
  assert.match(w.message, /inline icon/);
  assert.deepEqual(warned('<span class="icon">New</span>', icon), ['.icon']);
  assert.deepEqual(warned('<span class="icon">New …<!--isle-boundary:children--></span>', icon), ['.icon']);
  // Real text in a fixed-height box that overflows visibly keeps the warning.
  assert.deepEqual(warned('<p class="t">Text</p>', '.t{display:block;height:24px}'), ['.t']);
  const text = (analyzeHTML('<html lang="en"><body><main class="page"><p class="t">Text</p></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}.t{display:block;height:24px}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}}).layoutWarnings ?? []).find(x => x.code === 'W_LAYOUT_HEIGHT_FIXED_TEXT');
  assert.match(text.message, /its text follows the user's default font size/);
  assert.equal(text.content, undefined);
});
