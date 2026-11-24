// A user-action state (:hover, :active, :focus, …) anywhere in a compound, not only last: .btn:hover:not([disabled])
// is a hover rule for the buttons that are not disabled (the usual way a component library writes it).
import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSelector, matches} from '../src/layout/selectors.mjs';
import {analyzeHTML} from '../src/html.mjs';

const box = (attributes = {}) => ({tag: 'button', classes: ['btn'], attributes, children: [], path: 'P/0', ...(attributes.disabled !== undefined ? {disabled: true} : {})});

test('a state before :not() compiles, and matches only in that state', () => {
  for (const [source, state] of [['.btn:hover:not([disabled])', 'hover'], [':active:not(:disabled)', 'active'], ['.btn:focus-visible:not(.ghost)', 'focus-visible'], ['.btn:hover:not([data-disabled="true"])', 'hover']]) {
    const sel = compileSelector(source);
    assert.equal(sel.state, state, source);
    assert.equal(matches(sel, box(), undefined), false, `${source} without the state`);
    assert.equal(matches(sel, box(), new Set([state])), true, `${source} in the state`);
  }
  // The :not() still applies in the state.
  assert.equal(matches(compileSelector('.btn:hover:not([disabled])'), box({disabled: ''}), new Set(["hover"])), false);
  // Two states in one compound are not modeled.
  assert.throws(() => compileSelector('.btn:hover:focus'));
});

test('a page whose stylesheet has such a rule is analysed', () => {
  const r = analyzeHTML('<html lang="en"><body><button class="btn" type="button">Go</button></body></html>', {name: 'P',
    css: '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.btn{height:20px}.btn:hover:not([disabled]){background:#eee}', viewport: {min: 320, max: 800}});
  assert.deepEqual(r.diagnostics.filter(d => d.code === 'U_LAYOUT_SELECTOR'), []);
});
