import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {analyzeHTML} from '../src/html.mjs';
import {loadTextMetrics} from '../src/text-node.mjs';

// A block whose only content is one inline-level box (a button: inline-block, inline-flex). It sits on one line: its
// width is shrink-to-fit and it starts at the content edge (text-align: start). The line is as tall as the box when
// the parent's strut (its font's ascent + half-leading above the baseline, descent + half-leading below) fits above
// and below the box's baseline (the baseline of its text); otherwise the line grows, by amounts browsers round
// differently. Measured in Chromium, Firefox and WebKit with Roboto (the fixture): 34px buttons in a 16px/24px parent.
const file = fileURLToPath(new URL('../text-metrics/fixtures/roboto-variable.ttf', import.meta.url));
const metrics = await loadTextMetrics({fonts: {Roboto: {file}}});
const font = (size, lineHeight) => ({family: 'Roboto', size, lineHeight, weight: 400});
const base = '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr);align-content:start}body{font-family:Roboto;font-weight:400}'
  + '.p{font-size:16px;line-height:24px}.c{font-size:14px;line-height:20px;padding:6px 12px;border:1px solid #000}';
const page = inner => `<html lang="en"><body><div class="p">${inner}</div><div class="n"></div></body></html>`;
const run = (css, inner = '<div class="c">Save</div>', boxes = {'.c': {text: {font: font(14, 20), content: 'Save'}, wrap: 'one-line'}}, options = {}) =>
  analyzeHTML(page(inner), metrics.resolveOptions({name: 'P', css: base + css, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, boxes, ...options}));
const value = (a, vw) => Number(String(a.coefficient).split('/').reduce((p, c) => p / c)) * vw + Number(String(a.constant).split('/').reduce((p, c) => p / c));
const rect = (r, box, vw) => { const s = r.sizes.find(s => s.box === box && s.rect && s.range.min <= vw && vw <= s.range.max); return s && ['inlineStart', 'blockStart', 'inlineSize', 'blockSize'].map(k => Math.round(value(s.rect[k], vw) * 1e6) / 1e6); };
const unknowns = r => r.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message);
// The text's measured width (an upper bound of the browsers' widths) plus the padding and border.
const save = metrics.resolveBoxes({x: {text: {font: font(14, 20), content: 'Save'}, wrap: 'one-line'}}).x.minInlineSize + 26;

test('an inline-block button alone in a block: shrink-to-fit at the start, and the block is as tall as the button', () => {
  const r = run('.c{display:inline-block}');
  assert.equal(r.status, 'verified', JSON.stringify(unknowns(r)));
  assert.deepEqual(rect(r, '.c', 500), [0, 0, save, 34]);
  assert.deepEqual(rect(r, '.p', 500), [0, 0, 500, 34]);
  // The next block starts under it.
  assert.deepEqual(rect(r, '.n', 500)?.[1], 34);
});

test('an inline-flex box with a text item, centred in a 34px height', () => {
  const r = run('.c{display:inline-flex;align-items:center;height:34px;padding:0 12px}.c span{display:block}', '<div class="c"><span class="t">Save</span></div>', {'.t': {text: {font: font(14, 20), content: 'Save'}, wrap: 'one-line'}});
  assert.equal(r.status, 'verified', JSON.stringify(unknowns(r)));
  assert.deepEqual(rect(r, '.c', 500), [0, 0, save, 34]);
  assert.deepEqual(rect(r, '.p', 500)[3], 34);
});

// The parent's font in another size of the same family: its ascent and descent come from the font's units.
// 20px/28px: the strut reaches 21px above the baseline (20.84 unrounded); with 8px padding the text's baseline is
// 23.8px down the button (fits), with 6px 21.8px (within a pixel: browsers may differ, Unknown).
test('a parent font in another size of the same family', () => {
  const fits = run('.p{font-size:20px;line-height:28px}.c{display:inline-block;padding:8px 12px}');
  assert.equal(fits.status, 'verified', JSON.stringify(unknowns(fits)));
  assert.deepEqual(rect(fits, '.p', 500)[3], 38);
  assert.equal(run('.p{font-size:20px;line-height:28px}.c{display:inline-block}').status, 'unknown');
  // A contract without the font's units (only the rounded ascent and descent at 14px) gives the strut of a 14px parent
  // only, not of a 20px one.
  const resolved = metrics.resolveBoxes({'.c': {text: {font: font(14, 20), content: 'Save'}, wrap: 'one-line'}})['.c'];
  const {ascent, descent} = resolved.textMetrics.baseline;
  const bare = {'.c': {...resolved, textMetrics: {...resolved.textMetrics, baseline: {ascent, descent}}}};
  assert.equal(run('.p{font-size:14px}.c{display:inline-block}', undefined, bare).status, 'verified');
  const other = run('.p{font-size:20px;line-height:28px}.c{display:inline-block;padding:8px 12px}', undefined, bare);
  assert.ok(unknowns(other).some(m => /no font units/.test(m)), JSON.stringify(unknowns(other)));
});

test('a strut taller than the box, or a parent font that is not known, stays Unknown', () => {
  // 40px line-height: the strut reaches 20px + half the ascent past the baseline: the line is taller than the button.
  const tall = run('.p{line-height:40px}.c{display:inline-block}');
  assert.equal(tall.status, 'unknown');
  assert.ok(unknowns(tall).some(m => /strut/.test(m)), JSON.stringify(unknowns(tall)));
  // line-height: normal, or a family without a font file: the strut is not known.
  assert.equal(run('.p{line-height:normal}.c{display:inline-block}').status, 'unknown');
  assert.equal(run('.p{font-family:serif}.c{display:inline-block;font-family:Roboto}').status, 'unknown');
});

// An empty inline-block has its baseline at its bottom edge: the strut's descent hangs below it, by an amount browsers
// round differently (38, 39 and 37.891px under a 34px box). overflow: hidden does the same to a box with text.
test('a box whose baseline is its bottom edge stays Unknown', () => {
  assert.equal(run('.c{display:inline-block;height:34px}', '<div class="c"></div>', {}).status, 'unknown');
  assert.equal(run('.c{display:inline-block;overflow:hidden}').status, 'unknown');
});

test('alignments and neighbours that are not modeled stay Unknown', () => {
  for (const css of ['.p{text-align:center}', '.p{text-indent:10px}', '.c{vertical-align:middle}', '.c{margin-top:4px}', '.c{margin-left:auto}'])
    assert.equal(run(`.c{display:inline-block}${css}`).status, 'unknown', css);
  // Two boxes share the line.
  assert.equal(run('.c{display:inline-block}', '<div class="c">Save</div><div class="c">Save</div>').status, 'unknown');
});

// The inline axis alone needs no strut.
test('without the block axis, an inline-grid box is shrink-to-fit too', () => {
  const r = run('.c{display:inline-grid;grid-template-columns:40px;padding:0 8px}.k{display:block}', '<div class="c"><i class="k"></i></div>', {}, {viewport: {min: 320, max: 800}});
  assert.notEqual(r.status, 'unknown', JSON.stringify(unknowns(r)));
  const c = r.sizes.find(s => s.box === '.c' && s.range.min <= 500 && 500 <= s.range.max);
  assert.deepEqual([c.inlineSize.coefficient, c.inlineSize.constant], ['0', '58']);
  // With the block axis its baseline is not modeled: Unknown.
  assert.equal(run('.c{display:inline-grid;grid-template-columns:40px;padding:0 8px}.k{display:block;height:2px}', '<div class="c"><i class="k"></i></div>', {}).status, 'unknown');
});
