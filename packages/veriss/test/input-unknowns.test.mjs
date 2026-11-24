// What the HTML adapter or the box tree cannot model on one element (an element with no size adapter, an attribute that
// renders there, text mixed with child elements) makes that box Unknown where the layout reaches it, not the whole
// analysis: the rest of the page is still laid out and checked, and a hidden one changes nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

const css = '*{margin:0;box-sizing:border-box}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}.w{display:grid;grid-template-columns:minmax(0,1fr)}.hide{display:none}';
const run = (body, extra = '') => analyzeHTML(`<html lang="en"><body>${body}</body></html>`, {name: 'P', css: css + extra, viewport: {min: 320, max: 800, height: {min: 400, max: 800}}, block: true});
const unknowns = r => r.diagnostics.filter(d => d.severity === 'unknown').map(d => [d.code, d.box]);

test('an element with no size adapter is Unknown on its own box', () => {
  const r = run('<div class="a"></div><div class="w"><hr class="h"></div>');
  assert.deepEqual(unknowns(r).filter(([code]) => code === 'U_LAYOUT_ELEMENT').map(([, box]) => box), ['.h']);
  // Hidden, it changes nothing.
  assert.equal(run('<div class="w hide"><hr class="h"></div><div class="a"></div>').status, 'verified');
});

test('an attribute that renders on its element is Unknown on that box', () => {
  const r = run('<div class="w"><input class="f" size="5" aria-label="n"><div class="a"></div></div>');
  assert.deepEqual(unknowns(r).filter(([code]) => code === 'U_LAYOUT_HTML').map(([, box]) => box), ['.f']);
  assert.equal(run('<div class="w hide"><input class="f" size="5" aria-label="n"></div><div class="a"></div>').status, 'verified');
});

test('text mixed with child elements is Unknown on that box', () => {
  const r = run('<div class="w"><div class="m">Hello <b>you</b><div class="a"></div></div></div>');
  assert.ok(unknowns(r).some(([code, box]) => code === 'U_LAYOUT_STRUCTURE' && box === '.m'), JSON.stringify(unknowns(r)));
  assert.equal(run('<div class="w hide"><div class="m">Hello <b>you</b><div class="a"></div></div></div><div class="a"></div>').status, 'verified');
});
