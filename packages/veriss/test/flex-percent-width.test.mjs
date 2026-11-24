// A flex item with a percentage width, flex-basis auto, flex-shrink 1 and min-width auto (the defaults): its base is the
// share of the container's content width, and its automatic minimum, min(its content's min-content width, the specified
// width), is at most that base (CSS Flexbox 1 §4.5). The minimum matters only when the item shrinks: decided while the
// line does not shrink, Unknown when it would.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

const base = '*{margin:0;box-sizing:border-box}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.row{display:flex;height:40px}.m{height:20px}.s{width:60px;height:20px;flex-shrink:0}';
const run = (css, body) => analyzeHTML(`<html lang="en"><body>${body}</body></html>`, {name: 'P', css: base + css, viewport: {min: 320, max: 800, height: {min: 400, max: 800}}, block: true});
const rect = (r, box) => { const s = r.sizes.find(x => x.box === box && x.rect); return s && [s.rect.inlineStart.coefficient, s.rect.inlineStart.constant, s.rect.inlineSize?.coefficient, s.rect.inlineSize?.constant]; };
const unknown = r => r.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message);

test('a lone 100% item with the default shrink and minimum fills the row', () => {
  const r = run('.m{width:100%;padding-left:24px}', '<div class="row"><div class="m"><div class="x"></div></div></div>');
  assert.equal(r.status, 'verified', JSON.stringify(unknown(r)));
  const s = r.sizes.find(x => x.box === '.m' && x.rect);
  assert.equal(s.rect.inlineSize?.coefficient ?? s.rect.inlineEnd?.coefficient, '1', JSON.stringify(s.rect));
});

test('items whose percentages fit the row are decided; a row that must shrink one stays Unknown', () => {
  assert.equal(run('.m{width:50%}', '<div class="row"><div class="m"><div class="x"></div></div><div class="m"><div class="x"></div></div></div>').status, 'verified');
  // 100% beside a 60px item that does not shrink: the 100% item would shrink, to a minimum that depends on its content.
  const r = run('.m{width:100%}', '<div class="row"><div class="s"></div><div class="m"><div class="x"></div></div></div>');
  assert.equal(r.status, 'unknown');
  assert.ok(unknown(r).some(m => /automatic minimum depends on its content would shrink/.test(m)), JSON.stringify(unknown(r)));
  // A flex-basis percentage (auto width) has its content measured (here: min-content 0), so it shrinks to the room left.
  const basis = run('.m{flex-basis:100%}', '<div class="row"><div class="s"></div><div class="m"><div class="x"></div></div></div>');
  assert.equal(basis.status, 'verified');
  const m = basis.sizes.find(x => x.box === '.m' && x.rect).rect;
  assert.deepEqual([m.inlineStart.constant, m.inlineSize.coefficient, m.inlineSize.constant], ['60', '1', '-60']);
});
