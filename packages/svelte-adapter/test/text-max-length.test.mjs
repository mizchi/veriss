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
  // A GitHub runner is about 3.5x slower than the machine the 12s was set on (15s there; the uncached version would take
  // about 100s), so CI gets the same margin over the cached time, still far below the uncached one.
  const limit = process.env.CI ? 30 : 12;
  assert.ok(seconds < limit, `took ${seconds.toFixed(1)}s (29s before the length domain was cached)`);
});
