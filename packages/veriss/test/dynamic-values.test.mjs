import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// A dynamic value (an adapter's placeholder -veriss-dynamic(id): a value only known at run time) takes part in the
// cascade like any declaration. Where it wins, the layout depends on a value nobody declared: an error that points at
// it. Where a declaration of higher rank (importance, specificity, order) beats it, it does not matter.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = css => analyzeHTML('<html lang="en"><body><main class="page"><div class="a b"></div></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});

test('a dynamic value that wins the cascade is an error naming the declaration', () => {
  const report = run('.a{width:100px}.a.b{width:-veriss-dynamic(7)}');
  assert.equal(report.status, 'violated');
  const d = report.diagnostics.find(x => x.code === 'E_LAYOUT_DYNAMIC_VALUE');
  assert.ok(d, JSON.stringify(report.diagnostics));
  assert.equal(d.box, '.a.b');
  assert.match(d.message, /width/);
  assert.match(d.message, /-veriss-dynamic\(7\)/);
  assert.match(d.message, /\.a\.b/);
});

test('a dynamic value beaten by specificity, order or !important does not matter', () => {
  for (const css of [
    '.a{width:-veriss-dynamic(1)}.a.b{width:100px}',
    '.a.b{width:-veriss-dynamic(1)}.a.b{width:100px}',
    '.a{width:100px!important}.a.b{width:-veriss-dynamic(1)}',
  ]) {
    const report = run(css);
    assert.ok(!report.diagnostics.some(x => x.code === 'E_LAYOUT_DYNAMIC_VALUE'), css);
    assert.equal(report.status, 'verified', `${css} ${JSON.stringify(report.diagnostics)}`);
  }
});

test('a dynamic value of a shorthand covers its longhands; one in a media query that never applies does not matter', () => {
  assert.ok(run('.a{padding:-veriss-dynamic(2)}').diagnostics.some(x => x.code === 'E_LAYOUT_DYNAMIC_VALUE' && /padding-/.test(x.message)));
  assert.equal(run('@media (min-width: 2000px){.a{width:-veriss-dynamic(3)}}').status, 'verified');
  // a media query that holds for part of the viewport range: it can win there
  assert.ok(run('@media (min-width: 600px){.a{width:-veriss-dynamic(4)}}').diagnostics.some(x => x.code === 'E_LAYOUT_DYNAMIC_VALUE'));
});
