// analyzeResetMatrix: one analysis per (UA × reset) branch, and what holds in every branch, what only in some, and what
// is not known where.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {analyzeResetMatrix, enumerateBranches, sampleBranches, describeBranchSet, resets, resetById} from '../src/reset-matrix.mjs';

const viewport = {min: 400, max: 400, height: {min: 300, max: 300}};
const list = {html: '<html lang="en"><body><main class="c"><ul class="l"><li><div class="w"></div></li></ul></main></body></html>', css: 'body{margin:0}.l{margin:0}li{display:block}.c{width:100px}.w{width:80px;height:10px}'};

test('the manifest: every reset has a pinned version, a license, a source URL and the exact vendored text', () => {
  assert.deepEqual(resets.map(r => r.id), ['none', 'modern-normalize', 'normalize', 'sanitize', 'josh-comeau', 'tailwind-preflight', 'destyle']);
  for (const r of resets.filter(r => r.id !== 'none')) {
    assert.ok(r.version && r.license && /^https:\/\//.test(r.url), r.id);
    const css = readFileSync(new URL(`../src/resets/${r.file}`, import.meta.url), 'utf8');
    assert.equal(r.css, css, r.id);
    assert.equal(r.sha256, createHash('sha256').update(css).digest('hex'), r.id);
    assert.ok(readFileSync(new URL(`../src/resets/${r.licenseFile}`, import.meta.url), 'utf8').length > 100, `${r.id} license text`);
  }
  assert.equal(resetById('none').css, '');
});

test('the branch space is UA × reset, with ids both veriss and vlmkit read', () => {
  const b = enumerateBranches({uas: ['chromium', 'firefox'], resets: ['none', 'destyle']});
  assert.deepEqual(b.map(x => x.id), ['chromium:none', 'chromium:destyle', 'firefox:none', 'firefox:destyle']);
  assert.deepEqual(b[0], {id: 'chromium:none', ua: 'chromium', reset: 'none'});
  assert.equal(enumerateBranches().length, 21);
  assert.throws(() => enumerateBranches({resets: ['bootstrap-reboot']}), /Unknown reset/);
  assert.throws(() => enumerateBranches({uas: ['ie']}), /ua/);
});

test('a finding that needs the UA list padding holds only under the resets that keep it, on every UA', () => {
  const m = analyzeResetMatrix(list, {viewport});
  assert.equal(m.branches.length, 21);
  assert.equal(m.status, 'violated');
  assert.deepEqual(m.holdsEverywhere, []);
  const [f] = m.onlyIn;
  assert.equal(f.code, 'E_LAYOUT_ITEM_SIZE');
  assert.match(f.box, /^\.w/);
  assert.deepEqual(f.where, {uas: 'any', resets: ['none', 'modern-normalize', 'normalize', 'sanitize', 'josh-comeau']});
  assert.equal(f.summary, 'none, modern-normalize, normalize, sanitize, josh-comeau (any UA)');
  // decided absent where the reset zeroes the padding
  assert.deepEqual(f.absent.sort(), ['chromium:destyle', 'chromium:tailwind-preflight', 'firefox:destyle', 'firefox:tailwind-preflight', 'webkit:destyle', 'webkit:tailwind-preflight']);
  assert.deepEqual(f.undecided, []);
  assert.equal(m.branches.find(b => b.id === 'webkit:destyle').status, 'verified');
  // nothing else differs: what the resets' own text draws (a vendor selector list in normalize.css, Preflight's
  // shorthand conflicts) is reported per reset, apart from the page
  assert.equal(m.onlyIn.length, 1);
  assert.ok(m.resetFindings.normalize.some(f => f.code === 'W_CSS_SELECTOR_LIST_VENDOR'));
  assert.ok(m.resetFindings['tailwind-preflight'].some(f => f.code === 'W_CSS_SHORTHAND_CONFLICT'));
  assert.deepEqual(m.resetFindings.destyle, []);
});

test('an Unknown branch is never counted as one where a finding is absent', () => {
  // h2's UA margins are not modeled: Unknown under the resets that keep them; Josh Comeau's, Preflight and destyle zero them
  const html = '<html lang="en"><body><main class="c"><h2 class="h"></h2><div class="w"></div></main></body></html>';
  const m = analyzeResetMatrix({html, css: 'body{margin:0}.c{width:100px}.h{height:20px}.w{width:80px;height:10px}.c{padding-left:40px}'}, {viewport, uas: ['chromium'], resets: ['none', 'destyle']});
  // a failing branch is a decided failure, Unknown elsewhere or not
  assert.equal(m.status, 'violated');
  const none = m.branches.find(b => b.id === 'chromium:none');
  assert.equal(none.status, 'unknown');
  assert.ok(m.unknowns['chromium:none'].some(u => /margin/i.test(u.message)));
  assert.deepEqual(m.unknowns['chromium:destyle'], []);
  const [f] = [...m.holdsEverywhere, ...m.onlyIn].filter(x => x.code === 'E_LAYOUT_ITEM_SIZE');
  // found under destyle; under none the analysis is Unknown, so it is undecided there, not absent
  assert.deepEqual(f.in, ['chromium:destyle']);
  assert.deepEqual(f.absent, []);
  assert.deepEqual(f.undecided, ['chromium:none']);
});

test('branches with identical results are collapsed, and said to be', () => {
  const m = analyzeResetMatrix(list, {viewport});
  const group = m.equivalent.find(g => g.members.includes('chromium:destyle'));
  assert.deepEqual(group.members, ['chromium:tailwind-preflight', 'chromium:destyle', 'firefox:tailwind-preflight', 'firefox:destyle', 'webkit:tailwind-preflight', 'webkit:destyle']);
  assert.equal(group.basis, 'identical results');
});

test('sample and seed draw a reproducible subset; the shrink is over what was analysed', () => {
  const all = enumerateBranches();
  const a = sampleBranches(all, {sample: 5, seed: 7}), b = sampleBranches(all, {sample: 5, seed: 7}), c = sampleBranches(all, {sample: 5, seed: 8});
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.equal(new Set(a.map(x => x.id)).size, 5);
  const m = analyzeResetMatrix(list, {viewport, sample: 5, seed: 7});
  assert.equal(m.branches.length, 5);
  assert.deepEqual(m.space, {uas: ['chromium', 'firefox', 'webkit'], resets: resets.map(r => r.id), total: 21, analyzed: 5, sampled: {sample: 5, seed: 7}});
});

test('describeBranchSet names the smallest product of UAs and resets', () => {
  const space = {uas: ['chromium', 'firefox', 'webkit'], resets: ['none', 'destyle']};
  assert.deepEqual(describeBranchSet(['firefox:none'], space), {where: {uas: ['firefox'], resets: ['none']}, summary: 'firefox × none'});
  assert.deepEqual(describeBranchSet(['chromium:none', 'firefox:none', 'webkit:none'], space), {where: {uas: 'any', resets: ['none']}, summary: 'none (any UA)'});
  assert.deepEqual(describeBranchSet(['firefox:none', 'firefox:destyle'], space), {where: {uas: ['firefox'], resets: 'any'}, summary: 'firefox (any reset)'});
  // not a product: a union of products, one per reset
  assert.deepEqual(describeBranchSet(['firefox:none', 'webkit:destyle'], space), {where: [{uas: ['firefox'], resets: ['none']}, {uas: ['webkit'], resets: ['destyle']}], summary: 'firefox × none; webkit × destyle'});
});

test('the reset goes before the page CSS and the author\'s own resets', () => {
  const html = '<html lang="en"><body><main class="c"><div class="w"></div></main></body></html>';
  const seen = [];
  analyzeResetMatrix({html, css: '.w{height:1px}'}, {viewport, uas: ['chromium'], resets: ['destyle'], reset: [{css: '*{margin:0}', file: 'mine.css'}],
    analyze: options => { seen.push(options.reset.map(s => s.file)); return {status: 'verified', diagnostics: []}; }});
  assert.deepEqual(seen, [['reset:destyle', 'mine.css']]);
});

test('resets/manifest.json is what tools/vendor-resets.mjs writes from the vendored files', async () => {
  const {buildManifest} = await import('../../../tools/vendor-resets.mjs');
  assert.equal(readFileSync(new URL('../src/resets/manifest.json', import.meta.url), 'utf8'), `${JSON.stringify(buildManifest(), null, 2)}\n`);
});

test('a finding one UA\'s profile causes, under one reset: only firefox × none', () => {
  // a textarea's UA border is 1px in Chromium and WebKit, 2px in Firefox: 100px + 2 × 2px padding + 2 × 2px border > 107px
  const html = '<html lang="en"><body><main class="c"><div class="col"><textarea class="s" aria-label="Note"></textarea></div></main></body></html>';
  const m = analyzeResetMatrix({html, css: 'body{margin:0}.c{width:300px}.col{width:107px}.s{display:block;inline-size:100px;block-size:40px;resize:none}'}, {viewport});
  const [f] = m.onlyIn;
  assert.equal(m.onlyIn.length, 1);
  assert.equal(f.summary, 'firefox × none');
  assert.deepEqual(f.in, ['firefox:none']);
  // normalize.css and destyle give the textarea overflow: auto, whose scrollbars are not modeled: undecided, not absent.
  // WebKit's textarea padding differs by platform (2px on Linux, 2px 5px on macOS): undecided under every reset that
  // keeps it (Preflight zeroes it).
  assert.deepEqual(f.undecided, ['chromium:normalize', 'chromium:destyle', 'firefox:normalize', 'firefox:destyle', 'webkit:none', 'webkit:modern-normalize', 'webkit:normalize', 'webkit:sanitize', 'webkit:josh-comeau', 'webkit:destyle']);
  assert.ok(f.absent.includes('chromium:none') && f.absent.includes('firefox:modern-normalize'));
});

test('platform UA profiles are branches when asked for; the default space keeps the three platform-agnostic UAs', async () => {
  const {uas, allUAs} = await import('../src/reset-matrix.mjs');
  assert.deepEqual(uas, ['chromium', 'firefox', 'webkit']);
  assert.ok(allUAs.includes('webkit-macos') && allUAs.includes('webkit-linux'));
  assert.deepEqual(enumerateBranches({uas: ['webkit-macos', 'webkit-linux'], resets: ['none']}).map(b => b.id), ['webkit-macos:none', 'webkit-linux:none']);
  const html = '<html lang="en"><body><main class="c"><div class="col"><textarea class="s" aria-label="Note"></textarea></div></main></body></html>';
  const m = analyzeResetMatrix({html, css: 'body{margin:0}.c{width:300px}.col{width:107px}.s{display:block;inline-size:100px;block-size:40px;resize:none}'}, {viewport, uas: ['webkit', 'webkit-linux', 'webkit-macos'], resets: ['none']});
  assert.deepEqual(m.branches.map(b => [b.id, b.status]), [['webkit:none', 'unknown'], ['webkit-linux:none', 'verified'], ['webkit-macos:none', 'violated']]);
});
