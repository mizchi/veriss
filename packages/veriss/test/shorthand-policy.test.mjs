import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// shorthandConflicts: 'error' (the default; docs/css-shorthands.md) rejects a shorthand and another property writing
// the same longhand in one rule, and leaves the layout unanalysed. 'warning' (for existing CSS a project does not
// write to this rule, such as CSS-in-JS read by an adapter) reports it and analyses the layout: within one rule the
// later declaration wins, which is deterministic.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = options => analyzeHTML('<html lang="en"><body><main class="page"><div class="a"></div></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}\n.a{border:1px solid;\nborder-top:2px solid}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, ...options});

test('shorthand conflicts are errors by default', () => {
  const r = run({});
  assert.equal(r.status, 'violated');
  assert.ok(r.diagnostics.some(d => d.code === 'E_CSS_SHORTHAND_CONFLICT'));
});

test("shorthandConflicts: 'warning' reports both declarations and analyses the layout", () => {
  const r = run({shorthandConflicts: 'warning'});
  assert.ok(!r.diagnostics.some(d => d.code === 'E_CSS_SHORTHAND_CONFLICT'));
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics));
  const w = r.layoutWarnings.find(x => x.code === 'W_CSS_SHORTHAND_CONFLICT');
  assert.ok(w, JSON.stringify(r.layoutWarnings));
  assert.equal(w.severity, 'warning');
  assert.deepEqual(w.css.map(c => [c.property, c.line]), [['border-top', 3], ['border', 2]]);
  assert.ok(r.sizes.some(s => s.box === '.a'));
});
