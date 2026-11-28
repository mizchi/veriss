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

// --resets: the component under every UA × reset branch (veriss/reset-matrix). A textarea's UA border is 1px in Chromium
// and WebKit and 2px in Firefox, so a 100px content-box textarea overflows a 107px column in Firefox only, and only where
// the reset leaves its box alone. (WebKit's UA padding differs by platform — 2px on Linux, 2px 5px on macOS — so plain
// webkit leaves it undecided, and webkit-macos overflows.)
const note = () => files({'Note.svelte': '<div class="col"><textarea class="s" aria-label="Note"></textarea></div>\n\n<style>\n  .col { width: 107px; }\n  .s { display: block; inline-size: 100px; block-size: 40px; resize: none; }\n</style>\n'})['Note.svelte'];
const small = ['--viewport', '400', '--height', '300'];

test('css-lint --resets: findings are grouped into every branch / only in the smallest UA × reset product, Unknown branches named', () => {
  const file = note();
  const json = run([...small, '--resets', 'all', '--format', 'json', file]);
  assert.equal(json.status, 1, json.stderr);
  const [result] = JSON.parse(json.stdout).files;
  assert.equal(result.file, file);
  assert.equal(result.branches.length, 21);
  assert.deepEqual(result.space.uas, ['chromium', 'firefox', 'webkit']);
  const overflow = result.onlyIn.find(f => f.code === 'E_LAYOUT_ITEM_SIZE');
  assert.ok(overflow, JSON.stringify(result.onlyIn.map(f => f.code)));
  assert.ok(overflow.in.length && overflow.in.every(id => id.startsWith('firefox:')), overflow.in.join());
  assert.ok(overflow.in.includes('firefox:none'));
  assert.match(overflow.summary, /^firefox × /);
  assert.ok(overflow.absent.includes('chromium:none'));
  assert.ok(result.unknownBranches.some(b => b.id === 'webkit:none' && /differs between platforms in webkit/.test(b.reason)), JSON.stringify(result.unknownBranches));
  assert.equal(overflow.severity, 'error');
  assert.equal(overflow.line, 1);
  // a branch the analysis does not decide is named, never counted as one where the finding is absent
  for (const id of result.unknownBranches.map(b => b.id)) assert.ok(!overflow.absent.includes(id), id);
  assert.ok(result.unknownBranches.every(b => b.reason));
  // the resets' own text (selectors no element of the component matches) is not a finding of the component
  assert.ok(!result.branches.some(b => b.messages.some(m => m.code === 'W_CSS_SELECTOR_UNMATCHED')));
  const text = run([...small, '--resets', 'all', file]);
  assert.equal(text.status, 1);
  assert.match(text.stdout, /only in firefox × [^\n]*:\n\s+.*Note\.svelte:1\s+error\s+E_LAYOUT_ITEM_SIZE/);
  assert.match(text.stdout, /21 branches \(chromium, firefox, webkit × none, modern-normalize, normalize, sanitize, josh-comeau, tailwind-preflight, destyle\)/);
  if (result.unknownBranches.length) assert.match(text.stdout, /not decided in /);
});

test('css-lint --resets: --ua narrows the UA axis, a list of resets the reset axis, and the exit status is 0 without an error in any branch', () => {
  const file = note();
  const r = run([...small, '--resets', 'none,modern-normalize', '--ua', 'chromium,webkit', '--format', 'json', file]);
  assert.equal(r.status, 0, r.stdout);
  const [result] = JSON.parse(r.stdout).files;
  assert.deepEqual(result.branches.map(b => b.id), ['chromium:none', 'chromium:modern-normalize', 'webkit:none', 'webkit:modern-normalize']);
  assert.ok(!result.onlyIn.some(f => f.code === 'E_LAYOUT_ITEM_SIZE'));
});

test('css-lint --resets: --ua takes a platform\'s profile (webkit-linux, webkit-macos) as a branch of its own', () => {
  const file = note();
  const r = run([...small, '--resets', 'none', '--ua', 'webkit-linux,webkit-macos', '--format', 'json', file]);
  assert.equal(r.status, 1, r.stderr);
  const [result] = JSON.parse(r.stdout).files;
  assert.deepEqual(result.branches.map(b => [b.id, b.status]), [['webkit-linux:none', 'verified'], ['webkit-macos:none', 'violated']]);
  assert.deepEqual(result.onlyIn.find(f => f.code === 'E_LAYOUT_ITEM_SIZE').in, ['webkit-macos:none']);
});

test('css-lint --resets: --sample and --seed draw a reproducible subset of the branches', () => {
  const file = note();
  const ids = () => JSON.parse(run([...small, '--resets', 'all', '--sample', '4', '--seed', '3', '--format', 'json', file]).stdout).files[0].branches.map(b => b.id);
  const first = ids();
  assert.equal(first.length, 4);
  assert.deepEqual(ids(), first);
  const [result] = JSON.parse(run([...small, '--resets', 'all', '--sample', '4', '--seed', '3', '--format', 'json', file]).stdout).files;
  assert.deepEqual(result.space.sampled, {sample: 4, seed: 3});
});

test('css-lint --resets: an unknown reset or UA is a usage error naming the known ones', () => {
  const file = note();
  const r = run(['--resets', 'bootstrap-reboot', file]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown reset bootstrap-reboot.*none, modern-normalize/);
  const u = run(['--resets', 'all', '--ua', 'ie', file]);
  assert.equal(u.status, 2);
  assert.match(u.stderr, /chromium, firefox, webkit/);
  assert.equal(run(['--sample', '3', file]).status, 2, '--sample needs --resets');
});

test('css-lint --resets: a reset\'s selectors are not the component\'s global CSS (Linaria scope check)', () => {
  const {'T.tsx': file} = files({'T.tsx': "import { css } from '@linaria/core';\nconst col = css`width: 107px;`;\nconst s = css`display: block; inline-size: 100px; block-size: 40px; resize: none;`;\nexport default function Note() { return <div className={col}><textarea className={s} aria-label=\"Note\" /></div>; }\n"});
  const r = run([...small, '--resets', 'none,normalize', '--ua', 'firefox,chromium', '--format', 'json', file]);
  assert.equal(r.status, 1, r.stderr);
  const [result] = JSON.parse(r.stdout).files;
  assert.ok(!result.branches.some(b => b.messages.some(m => m.code === 'E_SCOPE_GLOBAL')), JSON.stringify(result.onlyIn.map(f => f.message)));
  assert.equal(result.onlyIn.find(f => f.code === 'E_LAYOUT_ITEM_SIZE').summary, 'firefox (any reset)');
});

test('css-lint --suggest-reset takes platform profiles, and a target that does not know a value it would keep is a usage error', () => {
  const r = run(['--suggest-reset', 'webkit-linux,webkit-macos', '--ua', 'webkit-macos']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /:where\(textarea\) \{\n  padding-block: 2px;\n  padding-inline: 5px;/);
  const u = run(['--suggest-reset', 'chromium,webkit', '--ua', 'webkit']);
  assert.equal(u.status, 2);
  assert.match(u.stderr, /webkit-linux or webkit-macos/);
});
