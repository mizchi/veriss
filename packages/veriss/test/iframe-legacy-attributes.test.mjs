import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// An iframe's UA border is 2px inset (Chromium, Firefox and WebKit). The legacy attributes an ad tag writes map to
// defined behaviour: frameborder="0" / "no" drops that border (a presentational hint: author CSS still wins);
// scrolling, marginwidth and marginheight act on the frame's own document only, so they change nothing on the host
// page; width / height are presentational sizes. Measured in all three engines (e2e/layout-iframe-attributes.spec.mjs).
const vp = {min: 320, max: 800, height: {min: 600, max: 900}};
const run = (attrs, css = '', options = {}) => analyzeHTML(`<html lang="en"><body><main><div class="slot"><iframe title="ad" src="about:blank" ${attrs}></iframe></div><p class="after">x</p></main></body></html>`, {
  name: 'P', viewport: vp, scrollbars: [{name: 'o', inlineSize: 0, blockSize: 0}], boxes: {'.after': {minInlineSize: 10, maxInlineSize: 10, intrinsicBlockSize: 20}},
  css: `body,p{margin:0}iframe{display:block}${css}`, ...options,
});
const frame = report => { const r = report.sizes.find(s => s.box.startsWith('iframe')); assert.ok(r, JSON.stringify(report.diagnostics.map(d => d.message))); return [Number(r.inlineSize.constant), Number(r.blockSize.constant)]; };
const after = report => Number(report.sizes.find(s => s.box === '.after').rect.blockStart.constant);
const unknowns = report => report.diagnostics.filter(d => d.severity === 'unknown').map(d => `${d.code}: ${d.message}`);

test('an iframe draws its 2px UA border outside its width and height (content-box)', () => {
  const report = run('width="300" height="250"');
  assert.deepEqual(unknowns(report), []);
  assert.deepEqual(frame(report), [304, 254]);
  assert.equal(after(report), 254);
  // Author CSS replaces it.
  assert.deepEqual(frame(run('width="300" height="250"', 'iframe{border:0}')), [300, 250]);
  assert.deepEqual(frame(run('width="300" height="250"', 'iframe{border-width:1px}')), [302, 252]);
  assert.deepEqual(frame(run('width="300" height="250"', 'iframe{border-style:none}')), [300, 250]);
});

for (const value of ['0', 'no', 'NO']) test(`frameborder="${value}" drops the UA border`, () => {
  const report = run(`width="300" height="250" frameborder="${value}"`);
  assert.deepEqual(unknowns(report), []);
  assert.deepEqual(frame(report), [300, 250]);
  assert.equal(after(report), 250);
});

test('frameborder is a presentational hint: author CSS wins, and a non-zero value keeps the UA border', () => {
  assert.deepEqual(frame(run('width="300" height="250" frameborder="0"', 'iframe{border:3px solid red}')), [306, 256]);
  // The hint zeroes the width, not the inset style: an author width alone draws again.
  assert.deepEqual(frame(run('width="300" height="250" frameborder="0"', 'iframe{border-width:1px}')), [302, 252]);
  for (const value of ['1', '2', '-1']) assert.deepEqual(frame(run(`width="300" height="250" frameborder="${value}"`)), [304, 254], value);
});

test('scrolling, marginwidth, marginheight and allowtransparency change nothing on the host page', () => {
  const report = run('width="300" height="250" frameborder="0" scrolling="no" marginwidth="0" marginheight="0" allowtransparency="true"');
  assert.deepEqual(unknowns(report), []);
  assert.notEqual(report.status, 'unknown');
  assert.deepEqual(frame(report), [300, 250]);
  assert.deepEqual(frame(run('width="300" height="250" scrolling="yes" marginwidth="20" marginheight="20"')), [304, 254]);
});

test('a frameborder value the engines read differently stays Unknown unless a UA profile names the engine', () => {
  // "yes", "" and "0px": Chromium and WebKit drop the border (an integer error or zero), Firefox keeps it.
  for (const value of ['yes', '', '0px']) {
    const report = run(`width="300" height="250" frameborder="${value}"`);
    assert.equal(report.status, 'unknown', value);
    assert.ok(unknowns(report).some(m => /frameborder/.test(m) && /Firefox/.test(m)), JSON.stringify(unknowns(report)));
    assert.deepEqual(frame(run(`width="300" height="250" frameborder="${value}"`, '', {ua: 'chromium'})), [300, 250]);
    assert.deepEqual(frame(run(`width="300" height="250" frameborder="${value}"`, '', {ua: 'webkit'})), [300, 250]);
    assert.deepEqual(frame(run(`width="300" height="250" frameborder="${value}"`, '', {ua: 'firefox'})), [304, 254]);
  }
});

test('frame attributes on an element they do not apply to do nothing', () => {
  const report = analyzeHTML('<html lang="en"><body><main><div class="d" frameborder="0" scrolling="no" marginwidth="0"></div></main></body></html>', {name: 'P', viewport: vp, scrollbars: [{name: 'o', inlineSize: 0, blockSize: 0}], css: 'body{margin:0}.d{height:10px}'});
  assert.deepEqual(unknowns(report), []);
});
