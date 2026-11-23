import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// Both insets of an axis on an absolute box: an auto size fills the containing block between them (inset: 0
// overlays); with an explicit size the end inset is ignored.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const rect = (overlay, card = '') => {
  const report = analyzeHTML('<html lang="en"><body><main class="page"><div class="card"><div class="o"></div></div></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page,.card{${g}}.card{position:relative;height:200px;${card}}.o{position:absolute;${overlay}}`, viewport: {min: 400, max: 400, height: {min: 600, max: 600}}});
  assert.equal(report.status, 'verified', JSON.stringify(report.diagnostics.map(d => d.message)));
  const n = t => { const [a, b = '1'] = String(t ?? '0').split('/'); return Number(a) / Number(b); };
  const r = report.sizes.find(s => s.box === '.o').rect, v = x => n(x.constant) + 400 * n(x.coefficient) + 600 * n(x.heightCoefficient);
  return [v(r.inlineStart), v(r.blockStart), v(r.inlineSize), v(r.blockSize)];
};

test('inset: 0 fills the containing block; insets with an auto size leave the gaps', () => {
  assert.deepEqual(rect('inset:0'), [0, 0, 400, 200]);
  assert.deepEqual(rect('top:10px;bottom:20px;left:5%;right:15px'), [20, 10, 400 - 20 - 15, 170]);
  // content-box: the padding is inside the filled width.
  assert.deepEqual(rect('inset:0;box-sizing:content-box;padding:0 10px'), [0, 0, 400, 200]);
  // Over-constrained: width wins, right (ltr) and bottom are ignored.
  assert.deepEqual(rect('inset:0;width:100px;height:50px'), [0, 0, 100, 50]);
});

test('a stretched link (::after inset: 0 over the card) covers the other controls in the card', () => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const run = fix => analyzeHTML('<html lang="en"><body><main class="page"><article class="card"><a class="l" href="/item" aria-label="Item"></a><button class="b" aria-label="Save"></button></article></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}.page{background:#fff}.card{${g};position:relative;grid-auto-rows:40px;row-gap:8px;background:#fff}.l{display:block;height:40px}.l::after{content:"";position:absolute;inset:0}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:40px;background:#246}${fix}`, viewport: {min: 320, max: 800, height: {min: 480, max: 900}}, accessibility: true});
  assert.deepEqual(run('').diagnostics.filter(d => d.code === 'E_A11Y_OCCLUDED').map(d => d.box), ['.b']);
  assert.equal(run('.l::after{pointer-events:none}').status, 'verified');
});

// No inline inset (left and right auto): the static position. In a grid container that is the containing block it is
// the padding edge (css-grid-1 §9.4: padding-left does not move it); in a block container that is the containing block
// it is the content edge (its padding-left, or padding-right in rtl). Measured in Chromium, Firefox and WebKit.
test('left and right auto: the static position in a grid and in a block containing block', () => {
  assert.deepEqual(rect('top:0;width:50px;height:20px', 'padding-left:10px'), [0, 0, 50, 20]);
  assert.deepEqual(rect('top:0;width:50px;height:20px', 'display:block;padding:0 0 0 12px'), [12, 0, 50, 20]);
  assert.deepEqual(rect('top:0;width:50px;height:20px', 'display:block;direction:rtl;padding:0 12px 0 0'), [338, 0, 50, 20]);
  assert.deepEqual(rect('bottom:0;width:50%;height:20px', 'display:block;padding-left:12px'), [12, 180, 200, 20]);
  const status = (overlay, card) => analyzeHTML('<html lang="en"><body><main class="page"><div class="card"><div class="o"></div></div></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page,.card{${g}}.card{position:relative;height:200px;${card}}.o{position:absolute;${overlay}}`, viewport: {min: 400, max: 400, height: {min: 600, max: 600}}}).status;
  // An inline-level box sits on a line (text-align: center puts it at 206); a % padding is of another box's width;
  // flex static positions follow the container's alignment.
  assert.equal(status('top:0;width:50px;height:20px;display:inline-block', 'display:block;padding-left:12px;text-align:center'), 'unknown');
  assert.equal(status('top:0;width:50px;height:20px;display:inline', 'display:block;padding-left:12px;text-align:center'), 'unknown');
  assert.equal(status('top:0;width:50px;height:20px', 'display:block;padding-left:10%'), 'unknown');
  assert.equal(status('top:0;width:50px;height:20px', 'display:flex;justify-content:center'), 'unknown');
  // A margin on an absolute box is not modeled (the browsers put it at 17: the padding plus the margin).
  assert.equal(status('top:0;width:50px;height:20px;margin-left:5px', 'display:block;padding-left:12px'), 'unknown');
  // The block axis in a block container depends on the boxes before it.
  assert.equal(status('left:0;width:50px;height:20px', 'display:block'), 'unknown');
});

// An auto height on an absolute box is its content's, not its containing block's (CSS 2 §10.6.4; measured in
// Chromium, Firefox and WebKit). A min or max height on it stays Unknown.
test('an absolute box with an auto height is as tall as its content', () => {
  const html = '<html lang="en"><body><main class="page"><div class="card"><div class="o"><div class="k1"></div><div class="k2"></div></div></div></main></body></html>';
  const run = o => analyzeHTML(html, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page,.card{${g}}.card{position:relative;height:200px}.o{position:absolute;${g};${o}}.k1{height:30px}.k2{height:12px}`, viewport: {min: 400, max: 400, height: {min: 600, max: 600}}});
  const at = o => { const r = run(o); assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message))); const s = r.sizes.find(s => s.box === '.o').rect; return [s.blockStart.constant, s.blockSize.constant]; };
  assert.deepEqual(at('top:0;width:50px'), ['0', '42']);
  assert.deepEqual(at('bottom:0;width:50px'), ['158', '42']);
  assert.deepEqual(at('top:0;width:50px;padding:3px 0'), ['0', '48']);
  for (const o of ['top:0;width:50px;min-height:60px', 'top:0;width:50px;max-height:20px']) assert.equal(run(o).status, 'unknown', o);
});

// A scroll lock (body { position: fixed; left: 0; right: 0 }) leaves top auto: the body sits at its static position,
// the html's content edge (its padding-top; html with no margin or border is at the viewport's origin at scroll 0).
// Measured in Chromium, Firefox and WebKit for a grid and a block html, with and without padding.
test('a fixed body with auto top sits at the html content edge', () => {
  const at = html => {
    const r = analyzeHTML('<html lang="en"><body><div class="k"></div></body></html>', {name: 'P', css: `*{margin:0;box-sizing:border-box}${html}body{position:fixed;left:0;right:0;${g}}.k{height:30px}`, viewport: {min: 400, max: 400, height: {min: 600, max: 600}}, accessibility: true});
    assert.notEqual(r.status, 'unknown', JSON.stringify(r.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message)));
    const s = r.sizes.find(s => s.box.startsWith('body') && s.rect).rect;
    return [s.inlineStart.constant, s.blockStart.constant, s.blockSize.constant];
  };
  assert.deepEqual(at(`html{${g}}`), ['0', '0', '30']);
  assert.deepEqual(at(`html{${g};padding:5px 0 0 7px}`), ['0', '5', '30']);
  assert.deepEqual(at('html{display:block;padding:5px 0 0 7px}'), ['0', '5', '30']);
});
