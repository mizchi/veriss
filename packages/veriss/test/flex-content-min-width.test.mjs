import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// Issue #7: a row item with flex-basis auto, an auto width and a px min-width. Its flex base size is still its content
// size (0 plus its padding when it is empty) — the min-width clamps only the hypothetical size (Flexbox §9.2, §9.7).
// Expected values were measured in Chromium, Firefox and WebKit (all three agree).
const run = (css, html, boxes) => analyzeHTML(`<main class="row">${html}</main>`, {name: 'P', css: `*{box-sizing:border-box;margin:0;padding:0}.row{display:flex}${css}`, viewport: {min: 100, max: 600, height: {min: 200, max: 800}}, ...(boxes ? {boxes} : {})});
const at = (r, vw) => { const v = a => Number(String(a.coefficient).split('/').reduce((p, c) => p / c)) * vw + Number(String(a.constant).split('/').reduce((p, c) => p / c)); return r.sizes.filter(s => /^\.[fgb]$/.test(s.box) && s.rect && s.range.min <= vw && vw <= s.range.max).filter((s, i, all) => all.findIndex(o => o.box === s.box) === i).map(s => [Math.round(v(s.rect.inlineStart) * 1000) / 1000, Math.round(v(s.rect.inlineSize) * 1000) / 1000]); };
const empty = '<div class="f"></div>', input = '<div class="f"></div><div class="b"></div>', two = '<div class="f"></div><div class="g"></div>';
const cases = {
  'grow': ['.f{flex:1 0 auto;min-width:160px;height:32px}', empty, {150: [[0, 160]], 200: [[0, 200]], 400: [[0, 400]]}],
  'no grow': ['.f{flex:0 0 auto;min-width:160px;height:32px}', empty, {150: [[0, 160]], 400: [[0, 160]]}],
  'input + button': ['.f{flex:1 0 auto;min-width:160px;height:32px}.b{flex:none;width:80px;height:32px}', input, {200: [[0, 160], [160, 80]], 250: [[0, 170], [170, 80]], 600: [[0, 520], [520, 80]]}],
  'shrinking input + button': ['.f{flex:1 1 auto;min-width:160px;height:32px}.b{flex:none;width:80px;height:32px}', input, {200: [[0, 160], [160, 80]], 300: [[0, 220], [220, 80]]}],
  // The base is 0, not the min-width: at 600px the free space splits 1:2 from 0 (200 / 400), not from 160.
  'two growing': ['.f{flex:1 0 auto;min-width:160px;height:32px}.g{flex:2 0 auto;min-width:40px;height:32px}', two, {200: [[0, 160], [160, 40]], 400: [[0, 160], [160, 240]], 600: [[0, 200], [200, 400]]}],
  'padded': ['.f{flex:1 0 auto;min-width:60px;padding:0 50px;height:32px}.g{flex:1 0 auto;min-width:10px;height:32px}', two, {100: [[0, 100], [100, 10]], 300: [[0, 200], [200, 100]], 600: [[0, 350], [350, 250]]}],
};
for (const [name, [css, html, widths]] of Object.entries(cases)) test(name, () => {
  const r = run(css, html);
  assert.notEqual(r.status, 'unknown', JSON.stringify(r.diagnostics.map(d => d.message)));
  for (const [vw, expected] of Object.entries(widths)) assert.deepEqual(at(r, Number(vw)), expected, `${name} at ${vw}px`);
});

test('text with a max-content contract: the base is the max-content width, not the min-width', () => {
  const r = run('.f{flex:1 0 auto;min-width:100px;height:32px;font:400 14px/20px Arial;white-space:nowrap}.g{flex:1 0 auto;height:32px}', '<div class="f">hello world</div><div class="g"></div>', {'.f': {minInlineSize: 66.5, maxInlineSize: 66.5, intrinsicBlockSize: 20, wrap: 'nowrap'}});
  assert.notEqual(r.status, 'unknown', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.deepEqual(at(r, 600), [[0, 333.25], [333.25, 266.75]]);
  assert.deepEqual(at(r, 100), [[0, 100], [100, 0]]);
});

test('text without a max-content width stays Unknown', () => {
  assert.equal(run('.f{flex:1 0 auto;min-width:100px;height:32px}', '<div class="f">hello</div>').status, 'unknown');
});

// PR #10 review: an empty item with aspect-ratio and a px height has a ratio-derived content size (here 40 × 2 = 80px),
// not 0. Chromium, Firefox and WebKit give 190 / 110 in a 300px row, whatever the min-width (20px, 0 or auto). The
// model does not derive it: Unknown, never the 150 / 150 of a 0 base. The same items without aspect-ratio stay known.
for (const min of ['20px', '0', 'auto']) test(`aspect-ratio on an auto-basis item stays Unknown (min-width ${min})`, () => {
  const r = run(`.f{flex:1 0 auto;min-width:${min};height:40px;aspect-ratio:2}.g{flex:1 0 auto;min-width:${min};height:40px}`, two);
  assert.equal(r.status, 'unknown');
  const plain = run(`.f{flex:1 0 auto;min-width:${min};height:40px}.g{flex:1 0 auto;min-width:${min};height:40px}`, two);
  assert.notEqual(plain.status, 'unknown', JSON.stringify(plain.diagnostics.map(d => d.message)));
  assert.deepEqual(at(plain, 300), [[0, 150], [150, 150]]);
});

// PR #10 review: the flex base size is the max-content width, not capped by max-width; the max-width clamps only the
// hypothetical and target sizes (Flexbox §9.2 C, §9.7). A (max-content 400px, max-width 100px) and B (flex: 0 1 400px)
// in a 300px row: browsers give 100 / 200 for min-width 20px, 0 and auto; from a 100px base the shrink would be 60 / 240.
for (const min of ['20px', '0', 'auto']) test(`max-width does not cap the content base (min-width ${min})`, () => {
  const r = run(`.f{flex:1 1 auto;min-width:${min};max-width:100px}.f>div{width:400px;height:10px}.b{flex:0 1 400px;min-width:0;height:10px}`, '<div class="f"><div></div></div><div class="b"></div>');
  assert.notEqual(r.status, 'unknown', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.deepEqual(at(r, 300), [[0, 100], [100, 200]]);
});

// A content-sized flex item that is itself a flex container with an in-flow ::before: the generated item is a flex
// item of it too (Chromium, Firefox and WebKit: a 100px generated item makes the row 210 / 90), which the content
// measurement does not count. Unknown, for every min-width.
test('an in-flow generated item inside a content-sized item keeps the row Unknown', () => {
  for (const m of ['20px', 'auto', '0']) {
    const css = `*{margin:0;box-sizing:border-box}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.row{display:flex;width:300px}.a{display:flex;flex:1 0 auto;min-inline-size:${m};height:20px}.k{flex:none;width:20px;height:10px}.a::before{content:"x";flex:none}.b{flex:1 0 auto;height:20px}`;
    const r = analyzeHTML('<html lang="en"><body><div class="row"><div class="a"><div class="k"></div></div><div class="b"></div></div></body></html>', {name: 'P', css, viewport: {min: 300, max: 300, height: {min: 200, max: 200}}, boxes: {'.a::before': {minInlineSize: 100, maxInlineSize: 100, intrinsicBlockSize: 20}}});
    assert.equal(r.status, 'unknown', `${m}: ${JSON.stringify(r.sizes.filter(s => /^\.[ab]$/.test(s.box) && s.rect).map(s => [s.box, s.rect.inlineSize.constant]))}`);
  }
});
