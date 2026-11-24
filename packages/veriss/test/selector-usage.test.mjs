import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// options.selectors: each stylesheet selector against the template's elements. A selector that matches nothing is
// W_CSS_SELECTOR_UNMATCHED (with a near class name when one exists); a complex selector whose compounds each match
// some element but whose combinator never holds is W_CSS_SELECTOR_RELATION, naming the broken link.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const html = '<html lang="en"><body><main class="page"><ul class="list"><li class="item"></li></ul><div class="card"><p class="item title"></p></div></main></body></html>';
const run = css => analyzeHTML(html, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page,.list,.card{${g}}.item{height:10px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, selectors: true});
const codes = report => report.selectors.warnings.map(w => [w.code, w.selector]);

test('matching selectors are listed with their counts and raise nothing', () => {
  const report = run('.list > .item{color:red}.card .title{color:blue}');
  assert.deepEqual(codes(report), []);
  const row = report.selectors.rows.find(r => r.selector === '.list > .item');
  assert.equal(row.matched, 1);
  assert.equal(row.line, 1);
});

test('a selector that matches nothing, with a near class name', () => {
  const [w] = run('.itme{color:red}').selectors.warnings;
  assert.equal(w.code, 'W_CSS_SELECTOR_UNMATCHED');
  assert.match(w.message, /\.item/);
});

test('a broken parent-child relation names the link and the actual parents', () => {
  const [w] = run('.card > .item{color:red}.list .title{color:blue}').selectors.warnings.filter(w => w.selector === '.card > .item');
  assert.equal(w, undefined); // .title.item is a child of .card: it holds
  const warnings = run('.page > .item{color:red}.list .title{color:blue}.title + .item{color:green}').selectors.warnings;
  const child = warnings.find(w => w.selector === '.page > .item');
  assert.equal(child.code, 'W_CSS_SELECTOR_RELATION');
  assert.match(child.message, /parent/);
  assert.match(child.message, /\.list/);
  assert.match(child.message, /\.card/);
  assert.equal(warnings.find(w => w.selector === '.list .title').code, 'W_CSS_SELECTOR_RELATION');
  assert.match(warnings.find(w => w.selector === '.title + .item').message, /follow/);
});

test('state and pseudo-element selectors are judged on their element; off by default', () => {
  assert.deepEqual(codes(run('.item:hover{color:red}.title::before{content:"";color:red}')), []);
  assert.equal(analyzeHTML(html, {name: 'P', css: `*{margin:0}html,body,.page,.list,.card{${g}}.item{height:10px}.nope{color:red}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}}).selectors, undefined);
});

// Content an adapter could not see (<!--isle-boundary:children-->, a child component) may hold the element a selector
// styles: such a selector is not reported when its other compounds hold with the boundary's element as the parent or
// ancestor; it is when they cannot.
test('selectors that may style content behind a boundary (children, a child component) are not reported', () => {
  const bhtml = '<html lang="en"><body><main class="page"><button class="btn">…<!--isle-boundary:children--></button><div class="field"><!--isle-boundary:component Input--></div><div class="plain"><i class="x"></i></div></main></body></html>';
  const brun = css => analyzeHTML(bhtml, {name: 'B', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, selectors: true});
  const warnings = brun('.btn > span{color:red}.btn svg{width:1px}.field > input{color:red}.plain > span{color:red}.page > *:last-child{color:red}.other > input{color:red}').selectors.warnings;
  const reported = warnings.map(w => w.selector).sort();
  // .plain has no boundary; .other is not an element of the template at all
  assert.deepEqual(reported, ['.other > input', '.plain > span']);
});

test('a selector whose inner compounds may all be unseen content still needs its outer compounds to hold', () => {
  const bhtml = '<html lang="en"><body><main class="page"><button class="btn">…<!--isle-boundary:children--></button><div class="plain"></div></main></body></html>';
  const brun = css => analyzeHTML(bhtml, {name: 'B', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, selectors: true});
  const reported = brun('.btn > span:only-child > svg{width:1px}.plain > span > svg{width:1px}.page > .btn > span > svg{width:1px}.nav > .btn > span{width:1px}').selectors.warnings.map(w => w.selector).sort();
  assert.deepEqual(reported, ['.nav > .btn > span', '.plain > span > svg']);
});

test('selectors on the shapes inside an svg (not laid out as boxes) match them; a misspelt one is still reported', () => {
  const shtml = '<html lang="en"><body><main class="page"><svg class="icon" viewBox="0 0 10 10" width="10" height="10"><circle class="dot" cx="5" cy="5" r="4"></circle></svg></main></body></html>';
  const srun = css => analyzeHTML(shtml, {name: 'S', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, selectors: true});
  const reported = srun('.dot{fill:none}.icon > .dot{stroke-width:3}.missing{fill:none}').selectors.warnings.map(w => w.selector).sort();
  assert.deepEqual(reported, ['.missing']);
});

test('a single-compound selector is judged on the seen elements even when a boundary is present', () => {
  const bhtml = '<html lang="en"><body><main class="page"><span class="label">x</span><div class="slot">…<!--isle-boundary:children--></div></main></body></html>';
  const brun = css => analyzeHTML(bhtml, {name: 'B', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, selectors: true});
  // a span is never :disabled; .lable is a typo of .label
  const reported = brun('.label:disabled{color:gray}.lable{color:red}').selectors.warnings.map(w => w.selector).sort();
  assert.deepEqual(reported, ['.label:disabled', '.lable']);
});
