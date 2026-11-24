// word-break: break-all: break opportunities inside words, from Chromium's measured pairs (tools/measure-break-all.mjs);
// wrapping text with it is measured with them, and text that is only assumed stays Unknown.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {breakOpportunities} from '../src/text.mjs';
import {loadTextMetrics} from '../src/text-node.mjs';
import {analyzeHTML} from '../src/html.mjs';

test('break-all adds breaks between letters, digits and kana; spaces and punctuation keep their rules', () => {
  assert.deepEqual(breakOpportunities('abc'), []);
  assert.deepEqual(breakOpportunities('abc', {wordBreak: 'break-all'}), [1, 2]);
  assert.deepEqual(breakOpportunities('ab cd', {wordBreak: 'break-all'}), [1, 3, 4]);
  // No break before a closing mark or after an opening bracket.
  assert.deepEqual(breakOpportunities('a、b', {wordBreak: 'break-all'}), [2]);
  assert.deepEqual(breakOpportunities('「ab」', {wordBreak: 'break-all'}), [2]);
  // A character outside the measured set stands for its group (ü for the Latin-1 letters, 漢 for the ideographs).
  assert.deepEqual(breakOpportunities('üß漢字', {wordBreak: 'break-all'}), [1, 2, 3]);
});

test('break-all contexts outside the pairs are not modeled', () => {
  // ICU's numeric rule next to non-ASCII, and a hyphen before a Latin-1 letter (depends on the character before it).
  assert.throws(() => breakOpportunities('$「0', {wordBreak: 'break-all'}), /numeric rule/);
  assert.throws(() => breakOpportunities('日-é', {wordBreak: 'break-all'}), /hyphen/);
  assert.throws(() => breakOpportunities('abc', {wordBreak: 'keep-all'}), /outside the line-breaking model/);
});

const file = fileURLToPath(new URL('../text-metrics/fixtures/roboto-variable.ttf', import.meta.url));
const fonts = {Roboto: {file}};

test('a text contract measured with break-all: its min-content is one character, and more lines below the word', async () => {
  const metrics = await loadTextMetrics({fonts});
  const contract = wordBreak => metrics.resolveBoxes({x: {text: {font: {family: 'Roboto', size: 16, lineHeight: 24, weight: 400}, content: 'Hello world', ...(wordBreak ? {wordBreak} : {})}, wrap: 'normal'}}).x;
  const normal = contract(), all = contract('break-all');
  assert.equal(all.textMetrics.wordBreak, 'break-all');
  assert.ok(all.minInlineSize < normal.minInlineSize / 2, `${all.minInlineSize} vs ${normal.minInlineSize}`);
  assert.equal(all.maxInlineSize, normal.maxInlineSize);
});

test('wrapping text with break-all is laid out when it is measured with it, and Unknown when it is not', async () => {
  const textMetrics = await loadTextMetrics({fonts});
  const css = '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.c{display:grid;grid-template-columns:60px}.t{font-family:Roboto;font-size:16px;line-height:24px;font-weight:400;word-break:break-all;color:#000}';
  const html = '<html lang="en"><body><div class="c"><p class="t">Hello world</p></div></body></html>';
  const options = {name: 'P', css, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, block: true};
  // Measured without break-all (a hand-made contract): the CSS breaks inside words, so the lines are not those.
  const plain = textMetrics.resolveBoxes({x: {text: {font: {family: 'Roboto', size: 16, lineHeight: 24, weight: 400}, content: 'Hello world'}, wrap: 'normal'}}).x;
  const unmeasured = analyzeHTML(html, {...options, boxes: {'.t': plain}});
  assert.equal(unmeasured.status, 'unknown');
  assert.ok(unmeasured.diagnostics.some(d => /break-all/.test(d.message)), JSON.stringify(unmeasured.diagnostics.map(d => d.message)));
  const measured = textMetrics.resolveBoxes({x: {text: {font: {family: 'Roboto', size: 16, lineHeight: 24, weight: 400}, content: 'Hello world', wordBreak: 'break-all'}, wrap: 'normal'}}).x;
  const r = analyzeHTML(html, {...options, boxes: {'.t': measured}});
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
});
