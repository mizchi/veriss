import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';
import {createNoShiftContract} from '../src/transitions.mjs';
import {verifyNoShift} from '../src/transitions-node.mjs';
import {createLayoutIR} from '../src/layout-contract.mjs';

// noshift/1 on a whole document (rooted at <html>). The root is allowed to be taller than the viewport when the viewport
// scrolls (its block check is not enforced): that is the page scroll, not a weakened overflow policy, and it moves no box
// at scroll position 0, so the shift is decided as for a fragment. A box appearing above the target moves it by its
// height in Chromium (getBoundingClientRect().top: 0 → 250, short and long pages alike).
const viewport = {min: 320, max: 800, height: {min: 600, max: 900}};
const page = (slot, filler, extra = '', scrollbars = [{name: 'overlay', inlineSize: 0, blockSize: 0}]) => analyzeHTML(`<html lang="en"><body><main><div class="slot">${slot}</div><div class="target"></div><div class="filler"></div></main></body></html>`, {
  name: 'P', viewport, scrollbars, css: `*{box-sizing:border-box;margin:0}.target{height:40px}.filler{height:${filler}px}.ad{height:250px}.slot{${extra}}`,
});
const contract = createNoShiftContract({name: 'Appear', targets: [{name: 'target', before: 'P/0/0/1', after: 'P/0/0/1'}]});
const messages = result => (result.coverage?.diagnostics ?? []).map(d => `${d.code}: ${d.message}`);

for (const filler of [10, 2000]) {
  test(`a box appearing above the target of a ${filler === 10 ? 'short' : 'long'} document is a shift of 250px`, async () => {
    const before = page('', filler), after = page('<div class="ad"></div>', filler);
    assert.equal(before.status, 'verified'); assert.equal(after.status, 'verified');
    const result = await verifyNoShift(before, after, contract);
    assert.equal(result.status, 'violated', JSON.stringify(messages(result)));
    assert.equal(result.change.field, 'blockStart');
    assert.equal(result.change.delta.exact, '250');
  });
  test(`a reserved slot keeps the target of a ${filler === 10 ? 'short' : 'long'} document in place`, async () => {
    const result = await verifyNoShift(page('', filler, 'height:250px'), page('<div class="ad"></div>', filler, 'height:250px'), contract);
    assert.equal(result.status, 'verified', JSON.stringify(messages(result)));
  });
}

test('a classic page scrollbar that appears in one endpoint only stays Unknown, saying why', async () => {
  const classic = [{name: 'classic', inlineSize: 15, blockSize: 15}];
  const before = page('', 10, '', classic), after = page('<div class="ad"></div>', 600, '', classic);
  const result = await verifyNoShift(before, after, contract);
  assert.equal(result.status, 'unknown');
  assert.ok(messages(result).some(m => m.startsWith('U_LAYOUT_SCROLLBAR') && /narrows the page/.test(m)), JSON.stringify(messages(result)));
});

test('safe-grid/1 component contracts still refuse a document whose root may outgrow the viewport', () => {
  const ir = createLayoutIR(page('', 10));
  assert.ok(ir.diagnostics.some(d => d.code === 'U_LAYOUT_PROFILE'));
});
