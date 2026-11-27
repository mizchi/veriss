// noshift/1 on a whole document: a box appearing above the target moves it by the box's height whether or not the page
// is taller than the viewport (the page scroll moves nothing at scroll position 0), and a reserved slot keeps it in place.
// The verifier decides both (packages/veriss/test/noshift-document.test.mjs).
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/veriss/src/html.mjs';
import {createNoShiftContract} from '../packages/veriss/src/transitions.mjs';
import {verifyNoShift} from '../packages/veriss/src/transitions-node.mjs';

const body = slot => `<main><div class="slot">${slot}</div><div class="target"></div><div class="filler"></div></main>`;
const css = (filler, slot) => `*{box-sizing:border-box;margin:0}.target{height:40px}.filler{height:${filler}px}.ad{height:250px}.slot{${slot}}`;
const contract = createNoShiftContract({name: 'Appear', targets: [{name: 'target', before: 'P/0/0/1', after: 'P/0/0/1'}]});

for (const filler of [10, 2000]) for (const slot of ['', 'height:250px']) test(`noshift on a ${filler}px-filler document${slot ? ' with a reserved slot' : ''} agrees with the browser`, async ({page}) => {
  await page.setViewportSize({width: 400, height: 600});
  const top = async markup => { await page.setContent(`<!doctype html><html lang="en"><head><style>${css(filler, slot)}</style></head><body>${markup}</body></html>`); return page.evaluate(() => document.querySelector('.target').getBoundingClientRect().top); };
  const moved = (await top(body('<div class="ad"></div>'))) - (await top(body('')));
  const run = markup => analyzeHTML(`<html lang="en"><body>${markup}</body></html>`, {name: 'P', css: css(filler, slot), viewport: {min: 400, max: 400, height: {min: 600, max: 600}}, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]});
  const result = await verifyNoShift(run(body('')), run(body('<div class="ad"></div>')), contract);
  expect(result.status).toBe(moved === 0 ? 'verified' : 'violated');
  if (moved) expect(Number(result.change.delta.exact)).toBe(moved);
});
