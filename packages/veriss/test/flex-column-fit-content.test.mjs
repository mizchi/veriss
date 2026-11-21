import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// Issue #6: a column flex item that is not stretched (align-items / align-self other than stretch) with an auto width
// shrink-wraps its content: min(max-content, max(min-content, available)). Expected values were measured in Chromium,
// Firefox and WebKit (all three agree), including the unsafe overflow of center / end below the min-content width.
const w = '<div class="w"><i></i><i></i><i></i></div>'; // min-content 60px, max-content 190px
const run = (css, html = `<div class="a">${w}</div>`, boxes) => analyzeHTML(`<main class="col">${html}</main>`, {name: 'P', css: `*{box-sizing:border-box;margin:0;padding:0}.col{display:flex;flex-direction:column}.w{display:flex;flex-wrap:wrap;column-gap:5px}.w i{display:block;width:60px;height:2px}${css}`, viewport: {min: 50, max: 400, height: {min: 200, max: 800}}, ...(boxes ? {boxes} : {})});
const at = (r, vw) => { const v = a => Number(String(a.coefficient).split('/').reduce((p, c) => p / c)) * vw + Number(String(a.constant).split('/').reduce((p, c) => p / c)); return r.sizes.filter(s => s.box === '.a' && s.rect && s.range.min <= vw && vw <= s.range.max).slice(0, 1).map(s => [Math.round(v(s.rect.inlineStart) * 1000) / 1000, Math.round(v(s.rect.inlineSize) * 1000) / 1000]); };
const cases = {
  'flex-start': ['.col{align-items:flex-start}.a{height:4px}', {50: [0, 60], 100: [0, 100], 150: [0, 150], 200: [0, 190], 400: [0, 190]}],
  'align-self center': ['.a{align-self:center;height:4px}', {50: [-5, 60], 100: [0, 100], 200: [5, 190], 400: [105, 190]}],
  'flex-end': ['.col{align-items:flex-end}.a{height:4px}', {50: [-10, 60], 150: [0, 150], 250: [60, 190], 400: [210, 190]}],
  'content-box padding': ['.col{align-items:flex-start}.a{height:4px;padding:0 7px 0 10px;box-sizing:content-box}', {50: [0, 77], 100: [0, 100], 200: [0, 200], 250: [0, 207], 400: [0, 207]}],
  'min-width and max-width': ['.col{align-items:flex-start}.a{height:4px;min-width:80px;max-width:150px}', {50: [0, 80], 100: [0, 100], 190: [0, 150], 400: [0, 150]}],
  'margins': ['.col{align-items:center}.a{height:4px;margin:0 10px 0 20px}', {50: [0, 60], 100: [20, 70], 200: [20, 170], 250: [35, 190], 400: [110, 190]}],
};
for (const [name, [css, widths]] of Object.entries(cases)) test(name, () => {
  const r = run(css);
  assert.notEqual(r.status, 'unknown', JSON.stringify(r.diagnostics.map(d => d.message)));
  for (const [vw, expected] of Object.entries(widths)) assert.deepEqual(at(r, Number(vw)), [expected], `${name} at ${vw}px`);
});

test('the empty box is as wide as its padding', () => {
  const r = run('.col{align-items:center}.a{height:4px;padding:0 5px}', '<div class="a"></div>');
  assert.notEqual(r.status, 'unknown', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.deepEqual(at(r, 100), [[45, 10]]);
});

test('the issue repro: a text leaf with a max-content contract is verified', () => {
  const r = run('.col{align-items:flex-start}.a{font:400 14px/20px Arial;white-space:nowrap}', '<div class="a">hello</div>', {'.a': {minInlineSize: 40, maxInlineSize: 40, intrinsicBlockSize: 20, wrap: 'nowrap'}});
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.deepEqual(at(r, 300), [[0, 40]]);
});

test('min-content wider than the container overflows, as with a px width', () => {
  const r = run('.col{align-items:flex-start}.a{font:400 14px/20px Arial;white-space:nowrap}', '<div class="a">hello</div>', {'.a': {minInlineSize: 120, maxInlineSize: 120, intrinsicBlockSize: 20, wrap: 'nowrap'}});
  assert.equal(r.status, 'violated');
  const d = r.diagnostics.find(d => d.severity === 'error');
  assert.deepEqual([d.range.min, d.range.max], [50, 120]);
});

test('text without a max-content width stays Unknown', () => {
  const r = run('.col{align-items:flex-start}', '<div class="a">hello</div>', {'.a': {minInlineSize: 40, intrinsicBlockSize: 20}});
  assert.equal(r.status, 'unknown');
  assert.match(r.diagnostics.map(d => d.message).join('\n'), /maxInlineSize/);
});
