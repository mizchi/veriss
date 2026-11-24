// An absolute box whose containing block is inside a clipping or scrolling ancestor: the ancestor clips it like the
// containing block's other content (CSS Overflow 3 §3: overflow clips the descendants whose containing block chain
// passes through it). Clipping ancestors between the box and its containing block (which do not clip it) are handled
// as before. (An icon: a relative, overflow: hidden span with an absolute svg, inside a scrolling nav row.)
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = (css, body) => analyzeHTML(`<html lang="en"><body>${body}</body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]});
const unknown = r => r.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message);
const icon = '<main class="page"><div class="nav"><span class="i"><span class="g"></span></span></div></main>';
const iconCSS = '.nav{overflow-x:auto;height:32px}.i{display:block;position:relative;width:18px;height:18px;overflow:hidden}.g{position:absolute;top:0;left:0;width:100%;height:100%}';

test('an absolute box in a clipping containing block inside a scroll container is placed against its containing block', () => {
  const r = run(iconCSS, icon);
  assert.equal(r.status, 'verified', JSON.stringify(unknown(r)));
  // (Inside a scroll container sizes are reported, positions are not.)
  const g = r.sizes.find(s => s.box === '.g');
  assert.deepEqual([g.inlineSize.constant, g.blockSize.constant], ['18', '18']);
});

test('a positioned containing block inside an overflow: hidden ancestor', () => {
  const r = run('.wrap{overflow:hidden;height:100px}.card{position:relative;height:60px}.o{position:absolute;top:10px;left:10px;width:20px;height:20px}', '<main class="page"><div class="wrap"><div class="card"><div class="o"></div></div></div></main>');
  assert.equal(r.status, 'verified', JSON.stringify(unknown(r)));
});

test('clipping ancestors between the box and its containing block stay as they were (Unknown past one)', () => {
  const r = run('.card{position:relative;height:100px}.w{overflow:hidden;height:50px}.o{position:absolute;top:60px;left:0;width:20px;height:20px}', '<main class="page"><div class="card"><div class="w"><div class="w"><div class="o"></div></div></div></div></main>');
  assert.equal(r.status, 'unknown');
  assert.ok(unknown(r).some(m => /containing block/.test(m)), JSON.stringify(unknown(r)));
});
