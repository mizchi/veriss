import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const page = '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}';
const run = (html, css, scope) => {
  const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'C', css: `${page}\n${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, scope: {firstLine: 2, ...scope}});
  return (r.selectors?.warnings ?? []).filter(w => /^E_SCOPE/.test(w.code)).map(w => [w.code, w.selector]);
};

test('scope: a compound left of a combinator that matches no element of the component depends on the page (E_SCOPE_OUTSIDE)', () => {
  const html = `<div class="card"><p class="t">Hi</p></div>`;
  assert.deepEqual(run(html, `.card{${g}}.theme-dark .card{padding:4px}`, {mode: 'scoped'}), [['E_SCOPE_OUTSIDE', '.theme-dark .card']]);
  // body and html are the page around the component, not its elements.
  assert.deepEqual(run(html, `.card{${g}}body .card{padding:4px}`, {mode: 'scoped'}), [['E_SCOPE_OUTSIDE', 'body .card']]);
  // A relation inside the component is fine; the page CSS (before firstLine) is not the component's.
  assert.deepEqual(run(html, `.card{${g}}.card > .t{padding:4px}`, {mode: 'scoped'}), []);
});

test('scope: unscoped CSS-in-JS may not style what a child component, slot or children renders (E_SCOPE_REACHES)', () => {
  const html = `<ul class="list"><!--isle-boundary:component Item--></ul>`;
  const css = `.list{${g};padding:0}.list > li{padding:4px}.list li{margin:0}`;
  assert.deepEqual(run(html, css, {mode: 'global', owned: ['list']}), [['E_SCOPE_REACHES', '.list > li'], ['E_SCOPE_REACHES', '.list li']]);
  // Its own li (no boundary under the list) is closed in the component.
  assert.deepEqual(run(`<ul class="list"><li class="i">a</li></ul>`, css, {mode: 'global', owned: ['list', 'i']}), []);
  // A subject pinned by an owned class cannot match another component's elements.
  assert.deepEqual(run(`<ul class="list"><li class="i">a</li><!--isle-boundary:children--></ul>`, `.list{${g};padding:0}.list > .i{padding:4px}`, {mode: 'global', owned: ['list', 'i']}), []);
  // Scoped styles (Svelte, Vue) hash the styled element: no reach.
  assert.deepEqual(run(html, css, {mode: 'scoped'}), []);
});

test('scope: in CSS that applies to the whole page, a selector with no class the component owns matches elements anywhere (E_SCOPE_GLOBAL)', () => {
  const html = `<ul class="list"><li class="i">a</li></ul>`;
  // A type, a class the page may use too, the universal selector, and a relation with no owned class.
  for (const sel of ['li', '.list', '*', '.list > li', 'ul li'])
    assert.deepEqual(run(html, `.list{${g};padding:0}${sel}{margin:0}`, {mode: 'global', owned: ['x']}).filter(([, s]) => s === sel), [['E_SCOPE_GLOBAL', sel]], sel);
  // Any compound with an owned class keeps the selector inside the component: a subject or an ancestor.
  assert.deepEqual(run(html, `.list{${g};padding:0}.i{margin:0}.list > .i{margin:0}`, {mode: 'global', owned: ['list', 'i']}), []);
  assert.deepEqual(run(html, `.list{${g};padding:0}.list li{margin:0}`, {mode: 'global', owned: ['list']}), []);
  // Scoped styles (Svelte, Vue scoped) hash the styled element: never global.
  assert.deepEqual(run(html, `.list{${g};padding:0}li{margin:0}`, {mode: 'scoped'}), []);
});

test('scope: sheets of different modes in one component are judged each by its own (a scoped and a plain <style>)', () => {
  const html = `<ul class="list"><li class="i">a</li></ul>`;
  // Component CSS line 1 is the scoped sheet, line 2 the plain one.
  const css = `.list{${g};padding:0} li{margin:0}\nli{padding:0}`;
  assert.deepEqual(run(html, css, {mode: 'global', owned: [], sheets: [{mode: 'scoped', from: 2, to: 2}, {mode: 'global', from: 3, to: 3}]}), [['E_SCOPE_GLOBAL', 'li']]);
});
