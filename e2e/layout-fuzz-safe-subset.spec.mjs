// Differential fuzzing of the safe subset (docs/safe-subset.md §1–§4) against the browser of the project: seeded pages
// of nested grid / flex / block flow / absolute boxes (e2e/support/layout-fuzz.mjs), each analysed at its viewport.
// Wherever veriss gives a box a rectangle, the browser draws it there (within the engine's rounding); every geometric
// violation is a breakage the browser shows at that box; a verified page shows none; Unknown is always acceptable and
// is counted, and the decided share must stay high (a fuzzer whose cases are mostly Unknown proves little).
// A mismatch is shrunk to a minimal page and printed as a regression case to paste into `regressions` below.
//   FUZZ_CASES=5000 FUZZ_SEED=7 pnpm test:e2e -- layout-fuzz-safe-subset --project webkit
// FUZZ_CASES=0 runs only the regression cases (ci.yml on every pull request); the seeded run is fuzz.yml's, daily.
// FUZZ_REPORT=<file> also writes the run's tally and mismatches there as JSON (tools/ci/fuzz-summary.mjs reads it).
import {test, expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {generateLayoutCase, renderCase, shrink} from './support/layout-fuzz.mjs';
import {checkCase} from './support/layout-fuzz-check.mjs';

const cases = Number(process.env.FUZZ_CASES ?? 400), seed = Number(process.env.FUZZ_SEED ?? 1), first = Number(process.env.FUZZ_FIRST ?? 0);
// LayoutUnit: 1/64px in Chromium and WebKit, 1/60px in Firefox; a box may round once per ancestor and per sibling before it.
const tolerance = () => { const unit = test.info().project.name === 'firefox' ? 60 : 64; return steps => (steps + 2) / unit; };
const signature = m => `${m.kind} ${m.code ?? ''}`;

// Minimal pages the fuzzer found, after the fix each needed (packages/veriss/test/safe-subset-fuzz.test.mjs has the
// browser truth). Each replays the whole property.
const leaf = (id, decl = {}, kids = []) => ({id, decl, kids});
const regressions = [
  // A grid item at justify-self: end wider than its column was verified, though it sticks out (now E_LAYOUT_ITEM_SIZE).
  {width: 400, height: 600, fixed: [], root: leaf(0, {display: 'grid', 'grid-template-columns': '10px'}, [leaf(1, {width: '20px', 'justify-self': 'end'})])},
  {width: 400, height: 600, fixed: [], root: leaf(0, {display: 'grid', 'grid-template-columns': 'minmax(0,1fr) minmax(0,3fr)'}, [leaf(1, {width: '160px', 'justify-self': 'center'})])},
  // ... and was aligned by its width before max-width (10px early at end).
  {width: 400, height: 600, fixed: [], root: leaf(0, {}, [leaf(1, {display: 'grid', 'grid-template-columns': 'minmax(0,3fr)'}, [leaf(2, {width: '20px', 'justify-self': 'end', 'max-width': '10px'})])])},
  {width: 400, height: 600, fixed: [], root: leaf(0, {display: 'grid', 'grid-template-columns': '10px'}, [leaf(1, {width: '20px', 'justify-self': 'center', 'max-width': '10px'})])},
  // A content-sized column item with min-height: 0 crashed the flex shrink (Unknown); now decided.
  {width: 400, height: 600, fixed: [], root: leaf(0, {display: 'flex', 'flex-direction': 'column', height: '10px'}, [leaf(1, {height: '20px'}), leaf(2, {'min-height': '0', padding: '2px'}, [leaf(3, {height: '30px'})])])},
  // A flex: N item with min-width: 0 that is a flex container was Unknown (its content was measured for nothing).
  {width: 400, height: 600, fixed: [], root: leaf(0, {display: 'flex'}, [leaf(1, {flex: '2', 'min-width': '0', display: 'flex'}, [leaf(2, {'flex-basis': '10px'})]), leaf(3, {width: '50px'})])},
  // Auto margins centred a border box by its specified width where its padding and border are wider (1px early).
  {width: 768, height: 900, fixed: [], root: leaf(0, {}, [leaf(3, {width: '10px', display: 'flex'}, [leaf(8, {width: '20px', 'min-width': '0'}, [leaf(9, {width: '75%', margin: 'auto', border: '2px solid #000'})]), leaf(13, {width: '150px'})])])},
  {width: 400, height: 600, fixed: [], root: leaf(0, {width: '100px'}, [leaf(1, {width: '2px', margin: '0 auto', border: '2px solid #000', height: '10px'})])},
  // A text leaf whose line is taller than the box a flex row gives it (E_LAYOUT_CONTENT on the block axis).
  {width: 400, height: 600, fixed: [], root: leaf(0, {}, [leaf(1, {display: 'flex', height: '10px'}, [{...leaf(11, {'white-space': 'nowrap', 'line-height': '24px'}), text: 'Sign in'}])])},
  // A justified item whose end margin does not fit was verified, though it starts outside its column (now E_LAYOUT_ITEM_SIZE).
  {width: 400, height: 600, fixed: [], root: leaf(0, {display: 'grid', 'grid-template-columns': '100px'}, [leaf(1, {width: '100px', 'margin-right': '20px', 'justify-self': 'end', height: '10px'})])},
  // WebKit placed this absolute box against its flex container's content height (the container is stretched to 0 by a
  // row flex): 20px where veriss (and Chromium, Firefox) had 6px. Now Unknown.
  {width: 320, height: 640, fixed: [], unknown: true, root: leaf(0, {}, [leaf(1, {display: 'flex', 'flex-direction': 'column', gap: '4px', height: '130px'}, [leaf(2, {height: '40px'}),
    leaf(5, {flex: '1', 'min-height': '0', display: 'flex'}, [leaf(6, {display: 'flex', position: 'relative'}, [leaf(7, {height: '40px'}), leaf(11, {position: 'absolute', top: '0%', bottom: '50%', width: '60px', border: '3px solid #000'})])]),
    leaf(15, {width: '180px', 'min-height': '0', padding: '4px 8px', 'box-sizing': 'content-box', display: 'flex', 'flex-wrap': 'wrap', 'align-items': 'stretch'}, [leaf(16, {width: '120px', 'flex-grow': '0', height: '80px'})])])])},
  // Firefox drew no overflow where the exact fractions left a nowrap text box 0.022px short (2fr/1fr columns, a 2/1 flex
  // row; Firefox lays out in 1/60px): a shortfall within layout rounding is Unknown (U_LAYOUT_ROUNDING), not a violation.
  // (Its status depends on the browser's own width of the text: Unknown is required in Firefox only.)
  {width: 375, height: 700, fixed: [], unknown: ['firefox'], root: leaf(0, {padding: '4px', border: '1px solid #000', display: 'grid', 'grid-template-columns': 'minmax(0,2fr) minmax(0,1fr)'}, [leaf(9, {display: 'flex'}, [leaf(10, {flex: '2'}),
    leaf(11, {flex: '1', 'min-width': '0'}, [{...leaf(12, {padding: '12px', 'white-space': 'nowrap', 'line-height': '24px'}), text: 'Sign in'}])])])},
];

test('safe-subset fuzz: the shrunk regression cases', async ({page}) => {
  const tol = tolerance();
  for (const [i, c] of regressions.entries()) {
    const r = await checkCase(page, c, tol);
    expect(r.mismatches, `regression ${i}: ${renderCase(c).css}`).toEqual([]);
    const project = test.info().project.name;
    if (c.unknown === true || c.unknown?.includes?.(project)) expect(r.status, `regression ${i} is Unknown (the browsers disagree)`).toBe('unknown');
    else if (!c.unknown) expect(r.status, `regression ${i} is decided`).not.toBe('unknown');
  }
});

test(`safe-subset fuzz: ${cases} seeded pages agree with the browser wherever veriss decides`, async ({page}) => {
  test.skip(cases === 0, 'FUZZ_CASES=0: the regression cases only');
  // About 0.4s a page in Firefox on a CI runner, and a mismatch is shrunk on top of that.
  test.setTimeout(Math.max(120_000, cases * 1_000));
  const tol = tolerance(), tally = {cases: 0, verified: 0, violated: 0, unknown: 0, boxes: 0, decidedBoxes: 0, violations: 0};
  const failures = [], found = [];
  for (let index = first; index < first + cases; index++) {
    const c = generateLayoutCase(seed, index), r = await checkCase(page, c, tol);
    tally.cases++; tally[r.status]++; tally.boxes += r.boxes; tally.decidedBoxes += r.verifiedBoxes; tally.violations += r.violations;
    if (!r.mismatches.length) continue;
    const kind = signature(r.mismatches[0]);
    const small = await shrink(c, async x => { try { return (await checkCase(page, x, tol)).mismatches.some(m => signature(m) === kind); } catch { return false; } });
    const again = await checkCase(page, small, tol);
    const shrunk = {width: small.width, height: small.height, fixed: small.fixed, root: small.root}, page2 = renderCase(small);
    found.push({index, kind, shrunk, css: page2.css, body: page2.body, mismatches: again.mismatches.slice(0, 3)});
    failures.push(`seed ${seed} index ${index}: ${kind}\n  shrunk: ${JSON.stringify(shrunk)}\n  css: ${page2.css}\n  body: ${page2.body}\n  ${JSON.stringify(again.mismatches.slice(0, 3))}`);
    if (failures.length >= 5) break;
  }
  const decided = (tally.verified + tally.violated) / tally.cases, boxShare = tally.decidedBoxes / tally.boxes;
  console.log(`safe-subset fuzz (${test.info().project.name}, seed ${seed}, ${first}..${first + cases - 1}): ${JSON.stringify(tally)}; decided cases ${(decided * 100).toFixed(1)}%, boxes with a rectangle ${(boxShare * 100).toFixed(1)}%`);
  if (process.env.FUZZ_REPORT) writeFileSync(process.env.FUZZ_REPORT, JSON.stringify({browser: test.info().project.name, seed, first, cases, tally, decided, boxes: boxShare, stoppedEarly: failures.length >= 5, mismatches: found}, null, 1) + '\n');
  expect(failures, failures.join('\n\n')).toEqual([]);
  expect(decided).toBeGreaterThan(0.6);
  expect(tally.violated).toBeGreaterThan(0);
  expect(tally.verified).toBeGreaterThan(0);
});
