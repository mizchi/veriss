import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// width: fit-content / min-content / max-content on a block in block flow. The content is a wrapping row of three 60px
// items (min-content 60px, max-content 190px) inside padding 0 8px and a 1px border (+18px). Measured in Chromium,
// Firefox and WebKit at 500, 150 and 50px: fit-content 208 / 150 / 78 (centred at 500 by auto margins: left 146,
// see below), the same for box-sizing: content-box; min-content 78 everywhere; max-content 208 everywhere.
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

// Its own max-width (or min-width) would nest the clamps the other way round; auto margins (centred at 500: left 146)
// on a width that is not px or % are not modeled yet. Both stay Unknown.
test('fit-content with its own max-width, or centred by auto margins, stays Unknown', () => {
  assert.equal(run('.f{width:fit-content;max-width:100px}').status, 'unknown');
  assert.equal(run('.f{width:fit-content;margin:0 auto}').status, 'unknown');
});
