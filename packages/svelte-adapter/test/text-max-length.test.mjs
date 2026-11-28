import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// data-text-max-length inside {#each}: the same length domain (font, characters, length) is asked for by every state,
// both text sizes and every leaf it is on. The lint took 29s on this fixture when each ask shaped all 95 + 95² strings
// again. The output is pinned to what that version printed (test/snapshots/tag-lengths.json): caching may not change a
// finding, an Unknown or an assumption.
const cwd = fileURLToPath(new URL('..', import.meta.url));
const args = ['bin/veriss-svelte.mjs', '--format', 'json', '--font', 'Roboto=../veriss/text-metrics/fixtures/roboto-variable.ttf', 'fixtures/TagLengths.svelte'];

test('data-text-max-length in {#each}: the output is unchanged and it runs in seconds, not tens of seconds', () => {
  const started = Date.now();
  let stdout;
  try { stdout = execFileSync(process.execPath, args, {cwd, encoding: 'utf8'}); } catch (error) { assert.equal(error.status, 1); stdout = error.stdout; }
  const seconds = (Date.now() - started) / 1000;
  assert.deepEqual(JSON.parse(stdout), JSON.parse(readFileSync(new URL('snapshots/tag-lengths.json', import.meta.url), 'utf8')));
  assert.ok(seconds < 12, `took ${seconds.toFixed(1)}s (29s before the length domain was cached)`);
});
