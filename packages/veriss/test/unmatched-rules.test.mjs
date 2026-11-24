// A declaration the analysis does not model makes a box Unknown only where its rule applies: a stylesheet shared by
// a whole site (a component library's) has rules for elements the page does not have, and they style nothing here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

const run = (css, html = '<div class="a"></div>') => analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P',
  css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}${css}`, viewport: {min: 320, max: 800, height: {min: 400, max: 800}}, block: true});
const unknowns = r => r.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message);

test('an unmodeled declaration in a rule that matches no element leaves the analysis decided', () => {
  for (const css of ['.zzz{text-box:cap alphabetic}', '.zzz{stroke-width:3}', '.zzz{border-image:url(a.png) 30}', '.zzz{transform:scale(0)}', 'nav .zzz span{border-top-left-radius:8px}']) {
    const r = run(css);
    assert.deepEqual(unknowns(r), [], css);
    assert.equal(r.status, 'verified', css);
  }
});

test('the same declaration on an element it matches is Unknown there, with the rule\'s line', () => {
  for (const [css, what] of [['.a{text-box:cap alphabetic}', /text-box/], ['.a{transform:scale(0)}', /scale\(0\)/]]) {
    const r = run(css);
    assert.equal(r.status, 'unknown', css);
    assert.ok(unknowns(r).some(m => what.test(m)), `${css}: ${unknowns(r)}`);
  }
  // A :hover rule applies in the hovered layout, which the analysis takes: that one is Unknown.
  assert.ok(run('.a:hover{text-box:cap alphabetic}').diagnostics.some(d => d.code === 'U_LAYOUT_HOVER_SHIFT' && /text-box/.test(d.message)));
  // A ::before's style is computed to read its content, so its rule is read even when it generates nothing
  // (conservative: Unknown).
  assert.equal(run('.a::before{text-box:cap alphabetic}').status, 'unknown');
});
