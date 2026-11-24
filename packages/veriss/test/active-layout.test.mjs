// A :active rule that changes layout (a pressed button whose content drops by its padding): the page is laid out again
// with each box it matches pressed (:active with :hover for a pointer, :active alone for a key), on the box and its
// ancestors. The pressed layout is checked like the base one; a shift is not reported (it follows a pointer or key
// press, an input Chromium excuses from layout shifts).
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

const base = '*{margin:0;box-sizing:border-box}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.b{display:grid;grid-template-columns:minmax(0,1fr);height:34px;border:1px solid #333}.i{height:20px}';
const run = (css, body = '<button class="b" type="button"><div class="i"></div></button>') => analyzeHTML(`<html lang="en"><body>${body}</body></html>`, {name: 'P', css: base + css, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, block: true});
const unknown = r => r.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message);

test('a pressed button whose content still fits is verified', () => {
  const r = run('.b:active:not([disabled]){padding-top:2px}');
  assert.equal(r.status, 'verified', JSON.stringify(unknown(r)));
});

test('content that overflows only while the button is pressed is reported for the pressed state', () => {
  const r = run('.b:active{padding-top:16px}');
  assert.equal(r.status, 'violated', JSON.stringify(r.diagnostics.map(d => d.message)));
  const pressed = r.diagnostics.filter(d => d.pressed === '.b');
  assert.ok(pressed.length && pressed.every(d => /while \.b is pressed/i.test(d.message)), JSON.stringify(r.diagnostics.map(d => [d.code, d.message])));
  // Not pressed, it fits.
  assert.equal(run('.b:hover{color:red}').status, 'verified');
});

test('a disabled button is not pressed', () => {
  assert.equal(run('.b:active:not([disabled]){padding-top:16px}', '<button class="b" type="button" disabled><div class="i"></div></button>').status, 'verified');
});

test('a pressed layout that is not decided is Unknown', () => {
  const r = run('.b:active{margin-left:10%}');
  assert.equal(r.status, 'unknown');
  assert.ok(unknown(r).some(m => /pressed/.test(m)), JSON.stringify(unknown(r)));
});
