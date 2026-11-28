// What the vendored reset stylesheets (packages/veriss/resets) need from the analysis: each construct they use is read
// where it is decided, and kept Unknown only on the boxes it may change.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

const run = (css, html = '<div class="a"></div>', options = {}) => analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}${css}`, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, ...options});

test('tab-size is inherited: on a box with elements inside it is Unknown only where a descendant keeps tabs', () => {
  // modern-normalize, sanitize.css and Tailwind Preflight set html { tab-size: 4 }.
  assert.equal(run('html{tab-size:4}').status, 'verified');
  assert.equal(run('html{tab-size:4}.p{height:10px}', '<div class="a"><div class="p"></div></div>').status, 'verified');
  // a pre (or pre-wrap / break-spaces) below inherits it: its tabs are 4 wide, which is not modeled
  assert.equal(run('html{tab-size:4}.p{white-space:pre}', '<div class="a"><div class="p"></div></div>').status, 'unknown');
  assert.equal(run('html{tab-size:4}.p{white-space:pre-wrap}', '<div class="a"><div class="p"></div></div>').status, 'unknown');
  assert.equal(run('html{tab-size:4}.p{white-space:break-spaces}', '<div class="a"><div class="p"></div></div>').status, 'unknown');
  // reset back to 8 below, or inherited from 8: nothing to model
  assert.equal(run('html{tab-size:4}.p{white-space:pre;tab-size:8;height:10px}', '<div class="a"><div class="p"></div></div>').status, 'verified');
  assert.equal(run('.p{white-space:pre;height:10px}', '<div class="a"><div class="p"></div></div>').status, 'verified');
  // inherit takes the parent's value
  assert.equal(run('.q{tab-size:2}.p{white-space:pre;tab-size:inherit}', '<div class="q"><div class="p"></div></div>').status, 'unknown');
  assert.equal(run('.q{tab-size:2}.p{white-space:pre;tab-size:initial;height:10px}', '<div class="q"><div class="p"></div></div>').status, 'verified');
});

test('declarations nested in a conditional group rule under a pseudo-element apply to it (Tailwind Preflight ::placeholder)', () => {
  const r = run('::placeholder{opacity:1}@supports (color: red){::placeholder{color:currentcolor;@supports (color: color-mix(in lab, red, red)){color:color-mix(in oklab, currentcolor 50%, transparent)}}}');
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
  // a nested style rule under a pseudo-element is still not modeled
  assert.equal(run('::placeholder{color:red;& .x{color:blue}}').status, 'unknown');
});

test('a rule on a control\'s internal part reaches only the controls that have that part', () => {
  for (const [css, owner, other] of [
    ['::-webkit-file-upload-button{-webkit-appearance:button;font:inherit}', '<input type="file" aria-label="f">', '<input type="text" aria-label="t">'],
    ['::file-selector-button{margin-inline-end:4px}', '<input type="file" aria-label="f">', '<button type="button" aria-label="b"></button>'],
    ['[type="number"]::-webkit-inner-spin-button{height:auto}', '<input type="number" aria-label="n">', '<input type="text" aria-label="t">'],
    ['::-webkit-search-decoration{-webkit-appearance:none}', '<input type="search" aria-label="s">', '<input type="text" aria-label="t">'],
    ['::-webkit-datetime-edit-fields-wrapper{padding:0}', '<input type="date" aria-label="d">', '<input type="text" aria-label="t">'],
  ]) {
    const sized = 'input,button{display:block;inline-size:100px;block-size:20px;padding:0;border:0;font:16px/20px sans-serif}';
    assert.equal(run(sized + css, `<div class="a">${other}</div>`, {ua: 'chromium'}).status, 'verified', `${css} without its control`);
    assert.equal(run(sized + css, `<div class="a">${owner}</div>`, {ua: 'chromium'}).status, 'unknown', `${css} with its control`);
  }
});

test('Firefox\'s :-moz-ui-invalid matches only form controls', () => {
  const r = run(':-moz-ui-invalid{box-shadow:none}');
  assert.deepEqual(r.diagnostics.filter(d => d.code.startsWith('U_')), []);
  assert.ok(!(r.unknowns ?? []).some(u => /moz-ui-invalid/.test(u.message ?? '')));
});

test('interpolate-size changes only how keywords animate: allowed in a preference media rule (Josh Comeau\'s reset)', () => {
  assert.equal(run('@media (prefers-reduced-motion: no-preference){html{interpolate-size:allow-keywords}}').status, 'verified');
});

test('-moz-tab-size (sanitize.css) is read like tab-size: inherited, Unknown only where a descendant keeps tabs', () => {
  assert.equal(run('html{-moz-tab-size:4;tab-size:4}.p{height:10px}', '<div class="a"><div class="p"></div></div>').status, 'verified');
  assert.equal(run('html{-moz-tab-size:4;tab-size:4}.p{white-space:pre;height:10px}', '<div class="a"><div class="p"></div></div>').status, 'unknown');
  // Chromium and WebKit drop -moz-tab-size and keep tab-size: 4; Firefox takes the later. Unknown, whichever is 8.
  assert.equal(run('html{tab-size:4;-moz-tab-size:8}.p{white-space:pre;height:10px}', '<div class="a"><div class="p"></div></div>').status, 'unknown');
  assert.equal(run('html{tab-size:8;-moz-tab-size:4}.p{white-space:pre;height:10px}', '<div class="a"><div class="p"></div></div>').status, 'unknown');
});

test('a shorthand and its longhand in one rule of a reset stylesheet are a warning there (Tailwind Preflight font: inherit; font-feature-settings: inherit)', () => {
  const r = run('.a{inline-size:10px}', '<div class="a"></div>', {reset: [{css: 'button{font:inherit;font-feature-settings:inherit}', file: 'preflight.css'}]});
  assert.equal(r.status, 'verified');
  assert.ok((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_SHORTHAND_CONFLICT'));
  // in the page's own CSS it stays an error
  assert.ok(run('button{font:inherit;font-feature-settings:inherit}').diagnostics.some(d => d.code === 'E_CSS_SHORTHAND_CONFLICT'));
});

test('@supports in Tailwind Preflight: (not (-webkit-appearance: -apple-pay-button)) or (contain-intrinsic-size: 1px) holds in every target browser', async () => {
  const {supportsCondition} = await import('../src/layout/supports.mjs');
  assert.equal(supportsCondition('(contain-intrinsic-size: 1px)'), true);
  assert.equal(supportsCondition('(not (-webkit-appearance: -apple-pay-button))  or (contain-intrinsic-size: 1px)'), true);
  assert.equal(supportsCondition('(not (-webkit-appearance: -apple-pay-button))'), undefined);
});

test('a rule the analysis cannot read marks only the boxes its readable parts may match (sanitize.css, Tailwind Preflight)', () => {
  // :where([aria-hidden="false" i][hidden]:not(:focus)) may match only [aria-hidden][hidden] elements
  const where = ':where([aria-hidden="false" i][hidden]:not(:focus)){clip:rect(0, 0, 0, 0);position:absolute}';
  assert.equal(run(where).status, 'verified');
  assert.equal(run(where, '<div class="a" hidden aria-hidden="false"></div><div class="a"></div>').status, 'unknown');
  // ::backdrop exists only for a dialog or popover in the top layer
  const backdrop = '::backdrop{margin:0;padding:0;border:0 solid}';
  assert.equal(run(backdrop).status, 'verified');
  assert.equal(run(backdrop, '<div class="a"></div><dialog></dialog>').status, 'unknown');
});

test(':host in a document stylesheet matches nothing (Tailwind Preflight html, :host)', () => {
  const r = run('html, :host{line-height:1.5;font-family:sans-serif}.a{inline-size:10px}');
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.equal(run(':host(.x) .a{margin-left:3px}').status, 'verified');
});

test('with a UA profile, body and p margins are the UA values every engine shares (8px; 1em)', () => {
  const page = (css, html, ua) => analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, ...(ua ? {ua} : {})});
  const x = r => Number(r.sizes.find(s => s.box.startsWith('.a') && s.rect)?.rect.inlineStart.constant);
  for (const ua of ['chromium', 'firefox', 'webkit']) assert.equal(x(page('.a{height:10px}', '<div class="a"></div>', ua)), 8, ua);
  // without a profile it stays Unknown, as before
  assert.equal(page('.a{height:10px}', '<div class="a"></div>').status, 'unknown');
  const y = r => Number(r.sizes.find(s => s.box.startsWith('.b') && s.rect)?.rect.blockStart.constant);
  // p { margin-block: 1em }: 16px at its 16px size, above and below it
  assert.equal(y(page('body{margin:0}p{height:10px;font-size:16px}.b{height:10px}', '<p></p><div class="b"></div>', 'webkit')), 42);
});

test('-webkit-appearance is appearance in every engine; -moz-appearance only in Firefox', () => {
  const sized = 'input{display:block;inline-size:100px;block-size:20px;padding:0;border:0}';
  const field = '<div class="a"><input type="number" aria-label="n"></div>';
  // destyle.css: -webkit-appearance: none; appearance: none on every control
  assert.equal(run(`${sized}input{-webkit-appearance:none;appearance:none}`, field, {ua: 'chromium'}).status, 'verified');
  assert.equal(run(`${sized}input{-webkit-appearance:none}`, field, {ua: 'chromium'}).status, 'verified');
  // [type="number"] { -moz-appearance: textfield }: Chromium and WebKit drop it
  for (const ua of ['chromium', 'webkit']) assert.equal(run(`${sized}input{appearance:none}[type="number"]{-moz-appearance:textfield}`, field, {ua}).status, 'verified', ua);
  // Firefox takes it (a different appearance from the one the analysis reads), and without a profile the engine is not known
  assert.equal(run(`${sized}input{appearance:none}[type="number"]{-moz-appearance:textfield}`, field, {ua: 'firefox'}).status, 'unknown');
  assert.equal(run(`${sized}input{appearance:none}[type="number"]{-moz-appearance:textfield}`, field).status, 'unknown');
  // no control under it: nothing to read
  assert.equal(run('[type="number"]{-moz-appearance:textfield}', '<div class="a"></div>', {ua: 'firefox'}).status, 'verified');
});

test('::-moz-focus-inner moves no button in any engine (normalize.css)', () => {
  const sized = 'button{display:block;inline-size:100px;block-size:20px;padding:0;border:0}';
  for (const ua of ['chromium', 'firefox', 'webkit']) assert.equal(run(`${sized}button::-moz-focus-inner,[type="button"]::-moz-focus-inner{border-style:none;padding:0}`, '<div class="a"><button type="button" aria-label="b"></button></div>', {ua}).status, 'verified', ua);
});
