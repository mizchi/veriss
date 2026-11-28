// The component linter's command line (runLint) on inputs that are not a working component, and on bad options.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const cli = fileURLToPath(new URL('../../../tools/css-lint.mjs', import.meta.url));
const card = fileURLToPath(new URL('../../svelte-adapter/fixtures/Card.svelte', import.meta.url));
const run = args => spawnSync('node', [cli, ...args], {encoding: 'utf8'});
const files = entries => { const dir = mkdtempSync(join(tmpdir(), 'veriss-cli-')); return Object.fromEntries(Object.entries(entries).map(([name, text]) => { const file = join(dir, name); writeFileSync(file, text); return [name, file]; })); };

test('css-lint: a Svelte component that does not compile is an error finding with its position and a fix, and the other files are still linted', () => {
  const {'Bad.svelte': bad} = files({'Bad.svelte': '<section>\n  <p><div></div></p>\n</section>\n'});
  const text = run([bad, card]);
  assert.equal(text.status, 1, text.stderr);
  assert.doesNotMatch(text.stderr, /at .*\.mjs:\d+/, 'no stack trace');
  assert.match(text.stdout, /Bad\.svelte:2:17\s+error\s+E_ADAPTER_COMPILE\s+.*element_invalid_closing_tag_autoclosed/);
  assert.match(text.stdout, /fix: .*phrasing content/);
  assert.match(text.stderr, /Card\.svelte: \d+ states/, 'the next file is linted');
  const json = JSON.parse(run(['--format', 'json', bad, card]).stdout);
  const [finding] = json.filter(m => m.code === 'E_ADAPTER_COMPILE');
  assert.deepEqual([finding.file, finding.line, finding.column, finding.severity], [bad, 2, 17, 'error']);
  assert.match(finding.message, /does not compile/);
  assert.match(finding.message, /cannot nest `<div>` inside `<p>`/);
  assert.match(finding.fix, /<p> holds phrasing content only/);
  assert.ok(json.some(m => m.file === card), 'Card.svelte has findings of its own');
});

test('css-lint: any other Svelte compile error is reported the same way, with the compiler\'s code and message', () => {
  const {'Script.svelte': script} = files({'Script.svelte': '<script>\n  let a = ;\n</script>\n<div>{a}</div>\n'});
  const r = run(['--format', 'json', script]);
  assert.equal(r.status, 1, r.stderr);
  const [finding] = JSON.parse(r.stdout).filter(m => m.code === 'E_ADAPTER_COMPILE');
  assert.equal(finding.line, 2);
  assert.match(finding.message, /js_parse_error/);
  assert.ok(finding.fix);
});

test('css-lint: a JSX file with a syntax error and a Vue SFC that does not parse are error findings, not a crash', () => {
  const {'Bad.jsx': jsx, 'Bad.vue': vue} = files({
    'Bad.jsx': 'export default function A() {\n  return <div><span></div>;\n}\n',
    'Bad.vue': '<template>\n  <div><span></div>\n</template>\n',
  });
  const r = run(['--format', 'json', jsx, vue, card]);
  assert.equal(r.status, 1, r.stderr);
  const found = JSON.parse(r.stdout).filter(m => m.code === 'E_ADAPTER_COMPILE');
  const react = found.find(m => m.file === jsx), sfc = found.find(m => m.file === vue);
  assert.ok(react && react.severity === 'error' && react.line === 2 && react.column > 0, JSON.stringify(found));
  assert.ok(sfc && sfc.severity === 'error' && sfc.line === 2, JSON.stringify(found));
  assert.match(sfc.message, /missing end tag/);
});

test('css-lint: an unknown or misspelled option is a usage error naming the nearest known option, and does not eat the next argument', () => {
  const r = run(['--image', 'images.json', card]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown option --image/);
  assert.match(r.stderr, /did you mean --images\?/);
  assert.equal(r.stdout, '');
  const flag = run(['--trust-image-attribute', card]);
  assert.equal(flag.status, 2);
  assert.match(flag.stderr, /--trust-image-attributes/);
  const missing = run([card, '--css']);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /--css needs a value/);
});
