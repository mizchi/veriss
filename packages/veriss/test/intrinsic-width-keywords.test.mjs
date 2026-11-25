import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// width: fit-content / min-content / max-content on a block in block flow. The content is a wrapping row of three 60px
// items (min-content 60px, max-content 190px) inside padding 0 8px and a 1px border (+18px). Measured in Chromium,
// Firefox and WebKit at 500, 150 and 50px: fit-content 208 / 150 / 78 (centred by auto margins, see below), the same for box-sizing: content-box; min-content 78 everywhere; max-content 208 everywhere.
const base = '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr);align-content:start}.w{display:flex;flex-wrap:wrap;column-gap:5px}.w i{display:block;width:60px;height:2px}.f{border:1px solid red;padding:0 8px}';
const run = css => analyzeHTML('<html lang="en"><body><div class="s"><div class="f"><div class="w"><i></i><i></i><i></i></div></div></div></body></html>', {name: 'P', css: base + css, viewport: {min: 50, max: 800, height: {min: 600, max: 900}}});
const value = (a, vw) => Number(String(a.coefficient).split('/').reduce((p, c) => p / c)) * vw + Number(String(a.constant).split('/').reduce((p, c) => p / c));
const rect = (r, vw) => { const s = r.sizes.find(s => s.box === '.f' && s.rect && s.range.min <= vw && vw <= s.range.max); return [value(s.rect.inlineStart, vw), value(s.rect.inlineSize, vw)]; };

for (const [name, css, expected] of [
  ['fit-content', '.f{width:fit-content}', {500: [0, 208], 150: [0, 150], 50: [0, 78]}],
  ['fit-content content-box', '.f{width:fit-content;box-sizing:content-box}', {500: [0, 208], 150: [0, 150], 50: [0, 78]}],
  ['min-content', '.f{width:min-content}', {500: [0, 78], 150: [0, 78], 50: [0, 78]}],
  ['max-content', '.f{width:max-content}', {500: [0, 208], 150: [0, 208], 50: [0, 208]}],
]) test(`${name} on a block in block flow`, () => {
  const r = run(css);
  assert.notEqual(r.status, 'unknown', JSON.stringify(r.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message)));
  for (const [vw, at] of Object.entries(expected)) assert.deepEqual(rect(r, Number(vw)), at, `${name} at ${vw}px`);
});

// Centred (or pushed to the end) by auto margins: the free space left of the used width, none of it when the box is
// wider than its container (the margins are then 0 and it overflows at the end). Measured in Chromium, Firefox and
// WebKit at 800, 500, 300, 209, 208, 207, 190, 150, 79, 78, 77, 60, 50 and 30px; the same for box-sizing: content-box.
for (const [name, css, expected] of [
  ['fit-content, margin: 0 auto', '.f{width:fit-content;margin:0 auto}', {800: [296, 208], 500: [146, 208], 209: [0.5, 208], 150: [0, 150], 50: [0, 78]}],
  ['fit-content content-box, margin: 0 auto', '.f{width:fit-content;margin:0 auto;box-sizing:content-box}', {500: [146, 208], 150: [0, 150], 50: [0, 78]}],
  ['fit-content, margin-left: auto', '.f{width:fit-content;margin-left:auto}', {500: [292, 208], 209: [1, 208], 150: [0, 150], 50: [0, 78]}],
  ['fit-content, margin-right: auto', '.f{width:fit-content;margin-right:auto}', {500: [0, 208], 150: [0, 150], 50: [0, 78]}],
  ['min-content, margin: 0 auto', '.f{width:min-content;margin:0 auto}', {500: [211, 78], 150: [36, 78], 79: [0.5, 78], 50: [0, 78]}],
  ['min-content, margin-left: auto', '.f{width:min-content;margin-left:auto}', {500: [422, 78], 150: [72, 78], 50: [0, 78]}],
  ['max-content, margin: 0 auto', '.f{width:max-content;margin:0 auto}', {500: [146, 208], 150: [0, 208], 50: [0, 208]}],
  ['max-content content-box, margin-left: auto', '.f{width:max-content;margin-left:auto;box-sizing:content-box}', {500: [292, 208], 150: [0, 208], 50: [0, 208]}],
]) test(`${name} on a block in block flow`, () => {
  const r = run(css);
  assert.notEqual(r.status, 'unknown', JSON.stringify(r.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message)));
  for (const [vw, at] of Object.entries(expected)) assert.deepEqual(rect(r, Number(vw)), at, `${name} at ${vw}px`);
});

// Its own max-width (or min-width) would nest the clamps the other way round. An auto margin with a non-zero margin
// on the other side differs once the box overflows (at 79px, margin-left: auto with margin-right: 10px: WebKit -9,
// Chromium and Firefox 0), and rtl is not modeled. These stay Unknown.
test('fit-content with its own max-width, an auto margin against a px margin, or rtl stays Unknown', () => {
  assert.equal(run('.f{width:fit-content;max-width:100px}').status, 'unknown');
  assert.equal(run('.f{width:fit-content;margin-left:auto;margin-right:10px}').status, 'unknown');
  assert.equal(run('.s{direction:rtl}.f{width:max-content;margin:0 auto}').status, 'unknown');
});

// Under inline-size containment (container-type: inline-size / size) the intrinsic widths ignore the content
// (CSS Containment 3 §3.1), which the content measurement here does not apply: such a box stays Unknown.
test('an intrinsic width keyword on an inline-size container stays Unknown', () => {
  for (const css of ['.f{width:max-content;container-type:inline-size}', '.f{width:fit-content;container-type:size;height:10px}', '.f{width:max-content;container-type:inline-size;margin:0 auto}'])
    assert.equal(run(css).status, 'unknown', css);
});
