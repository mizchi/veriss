// tools/blocker-weights.mjs: the Unknown boxes of a snapshot are removed one by one, each charged with its subtree.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('each Unknown box is charged with its subtree, and the rest of the page is decided', () => {
  const dir = mkdtempSync(join(tmpdir(), 'blocker-weights-'));
  const page = join(dir, 'page.json'), out = join(dir, 'out.json');
  // .cols (with 2 children) uses multi-column layout; .gap uses an unsupported length; the rest is laid out.
  writeFileSync(page, JSON.stringify({
    html: '<html lang="en"><body><main class="m"><div class="ok"></div><div class="cols"><i></i><i></i></div><div class="gap"></div></main></body></html>',
    css: '*{margin:0}html,body,.m{display:grid;grid-template-columns:minmax(0,1fr)}.ok{height:10px}.cols{columns:2}.cols i{display:block;height:4px}.gap{height:10px;margin-left:10%}',
  }));
  execFileSync(process.execPath, [new URL('../tools/blocker-weights.mjs', import.meta.url).pathname, '--out', out, page], {stdio: 'pipe'});
  const result = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(result.pages[0].status, 'verified');
  // Two reasons: the multi-column box with its 2 children (3) and the margin box (1).
  assert.deepEqual(result.weights.map(w => w.boxes).sort(), [1, 3], JSON.stringify(result.weights));
  assert.equal(result.pages[0].removed, 4);
});
