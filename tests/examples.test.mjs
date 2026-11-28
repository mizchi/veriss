// The examples under examples/ are the guide's worked cases (docs/guide/). Each example's package.json scripts are run
// as npm would run them (sh, node_modules/.bin on PATH): `check:broken` must print exactly expected.txt and exit 1,
// `check` (the fixed components) must report no error and no warning and exit 0, and the README's table must name
// exactly the error and warning codes each broken component gets, so neither the docs nor the expected output drift.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync, readdirSync} from 'node:fs';
import {join, delimiter} from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const examples = ['svelte', 'linaria'];

const run = (dir, script) => {
  const {scripts} = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  assert.ok(scripts?.[script], `${dir}: no "${script}" script`);
  const r = spawnSync('sh', ['-c', scripts[script]], {cwd: dir, encoding: 'utf8', env: {...process.env, PATH: `${join(dir, 'node_modules/.bin')}${delimiter}${process.env.PATH}`}});
  return {status: r.status, stdout: r.stdout, stderr: r.stderr};
};

// Error and warning codes per file in the text output: "src/broken/X.svelte:12  error    CODE  …".
const codesByFile = text => {
  const out = new Map();
  for (const m of text.matchAll(/^src\/broken\/([^:\s]+)(?::\d+)?\s+(?:error|warning)\s+(\S+)/gm)) {
    if (!out.has(m[1])) out.set(m[1], new Set());
    out.get(m[1]).add(m[2]);
  }
  return out;
};

// README rows: | `File.svelte` | … | `CODE`, `CODE` | — the codes named for each broken file.
const codesInReadme = text => {
  const out = new Map();
  for (const line of text.split('\n')) {
    const m = /^\|\s*`([^`]+\.(?:svelte|tsx))`\s*\|/.exec(line);
    if (!m) continue;
    out.set(m[1], new Set([...line.matchAll(/`([EW]_[A-Z0-9_]+)`/g)].map(c => c[1])));
  }
  return out;
};

for (const name of examples) {
  const dir = join(root, 'examples', name);

  test(`examples/${name}: every broken component has its fixed version`, () => {
    const list = d => readdirSync(join(dir, 'src', d)).sort();
    assert.deepEqual(list('broken'), list('fixed'));
  });

  test(`examples/${name}: check:broken prints expected.txt and exits 1`, () => {
    const r = run(dir, 'check:broken');
    assert.equal(r.stdout, readFileSync(join(dir, 'expected.txt'), 'utf8'), r.stderr);
    assert.equal(r.status, 1);
  });

  test(`examples/${name}: check (the fixed components) reports no error or warning and exits 0`, () => {
    const r = run(dir, 'check');
    assert.match(r.stdout, /^0 error\(s\), 0 warning\(s\), \d+ not checked or assumed$/m, r.stdout);
    assert.doesNotMatch(r.stdout, /^\S+\s+(?:error|warning)\s/m);
    assert.equal(r.status, 0);
  });

  test(`examples/${name}: the README names exactly the codes each broken component gets`, () => {
    const expected = codesByFile(readFileSync(join(dir, 'expected.txt'), 'utf8'));
    const readme = codesInReadme(readFileSync(join(dir, 'README.md'), 'utf8'));
    for (const file of readdirSync(join(dir, 'src', 'broken'))) {
      assert.ok(readme.has(file), `README.md has no row for ${file}`);
      assert.deepEqual([...readme.get(file)].sort(), [...(expected.get(file) ?? [])].sort(), file);
    }
  });
}
