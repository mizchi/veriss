// The CI tools: the e2e shard planner (tools/ci/e2e-shards.mjs), the daily fuzz's summaries and history
// (tools/ci/fuzz-summary.mjs) and its dashboard (tools/fuzz-dashboard/build.mjs). The fuzz workflow only runs from main,
// so its path from per-job reports to the published page is run here on made-up reports.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {key, listedTests, units, planShards, parseDurations, keepsOrder} from '../tools/ci/e2e-shards.mjs';
import {planMatrix, jobSummary, aggregateDay, recordDay, dayTable} from '../tools/ci/fuzz-summary.mjs';
import {loadData, renderDashboard} from '../tools/fuzz-dashboard/build.mjs';

const listReport = files => ({config: {rootDir: '/x/e2e'}, suites: Object.entries(files).map(([file, titles]) => ({file, specs: titles.map(title => ({file, title, tests: ['chromium', 'webkit'].map(projectName => ({projectName}))}))}))});

test('e2e shards: every test of the project lands in exactly one shard, long tests apart', () => {
  const report = listReport({'a.spec.mjs': ['a1', 'a2', 'a3'], 'b.spec.mjs': ['b1', 'b2'], 'c.spec.mjs': ['c1', 'c2']});
  const durations = {[key('chromium', 'a.spec.mjs', ['a1'])]: 100, [key('chromium', 'a.spec.mjs', ['a2'])]: 90, [key('chromium', 'b.spec.mjs', ['b1'])]: 10};
  const plan = planShards(units(listedTests(report), durations, 'chromium', () => false), 2, 2);
  const all = plan.flatMap(s => s.tests.map(t => key(t.project, t.file, t.titles)));
  assert.equal(all.length, 7); assert.equal(new Set(all).size, 7);
  assert.ok(all.every(k => k.startsWith('[chromium]')));
  const shardOf = title => plan.findIndex(s => s.tests.some(t => t.titles[0] === title));
  assert.notEqual(shardOf('a1'), shardOf('a2'));
  // A file that keeps its order is one unit.
  const ordered = planShards(units(listedTests(report), durations, 'chromium', f => f === 'a.spec.mjs'), 3, 2);
  assert.equal(new Set(['a1', 'a2', 'a3'].map(t => ordered.findIndex(s => s.tests.some(x => x.titles[0] === t)))).size, 1);
  assert.deepEqual(ordered.find(s => s.tests.some(x => x.file === 'a.spec.mjs')).tests.filter(x => x.file === 'a.spec.mjs').map(x => x.titles[0]), ['a1', 'a2', 'a3']);
});

test('e2e shards: durations from list-reporter lines (GitHub log prefixes, minutes, skipped tests)', () => {
  const log = [
    'e2e (webkit, 4)\tLayout e2e\t2026-11-28T17:07:58Z   ✓  118 [webkit] › e2e/layout-a.spec.mjs:70:1 › fuzz: one (block containers) (2.4m)',
    '  ✓   3 [chromium] › e2e/layout-b.spec.mjs:5:3 › two › nested (850ms)',
    '  ✘   4 [firefox] › e2e/layout-b.spec.mjs:9:1 › three (12.5s)',
    '  -   5 [firefox] › e2e/layout-b.spec.mjs:12:1 › skipped one',
    'noise ✓ Lockfile passes supply-chain policies (263 entries in 869ms)',
  ].join('\n');
  assert.deepEqual(parseDurations(log), {
    '[webkit] › layout-a.spec.mjs › fuzz: one (block containers)': 144,
    '[chromium] › layout-b.spec.mjs › two › nested': 0.9,
    '[firefox] › layout-b.spec.mjs › three': 12.5,
    '[firefox] › layout-b.spec.mjs › skipped one': 0,
  });
  assert.equal(keepsOrder("test.describe.configure({mode: 'default'});"), true);
  assert.equal(keepsOrder("test.describe.configure({ mode: \"serial\" })"), true);
  assert.equal(keepsOrder("test.describe.configure({mode: 'parallel'});"), false);
});

test('e2e shards: the recorded durations cover the committed specs, and order-keeping specs say so', () => {
  const durations = JSON.parse(readFileSync(new URL('../tools/ci/e2e-durations.json', import.meta.url), 'utf8'));
  assert.ok(Object.keys(durations).length > 1000);
  assert.equal(keepsOrder(readFileSync(new URL('../e2e/layout-individual-transforms.spec.mjs', import.meta.url), 'utf8')), true);
});

const fuzzReport = (browser, seed, first, cases, mismatches = []) => ({browser, seed, first, cases, tally: {cases, verified: cases * 0.5, violated: cases * 0.3, unknown: cases * 0.2, boxes: cases * 10, decidedBoxes: cases * 9, violations: 7}, decided: 0.8, boxes: 0.9, mismatches});

test('fuzz: the matrix cuts each browser × seed into chunks of cases', () => {
  const {include} = planMatrix({browsers: 'chromium, webkit', seeds: '1,2', cases: 1200, first: 0, chunk: 500});
  assert.equal(include.length, 2 * 2 * 3);
  assert.deepEqual(include.filter(j => j.browser === 'webkit' && j.seed === 2).map(j => [j.first, j.cases]), [[0, 500], [500, 500], [1000, 200]]);
});

test('fuzz: per-job summaries become one day, recorded to history and rendered on the dashboard', t => {
  const dir = mkdtempSync(join(tmpdir(), 'fuzz-data-')); t.after(() => rmSync(dir, {recursive: true, force: true}));
  // An empty history renders.
  const empty = renderDashboard(loadData(dir));
  assert.match(empty, /No runs recorded yet/);
  const plan = planMatrix({browsers: 'chromium,firefox', seeds: '1', cases: 1000, chunk: 500});
  const mismatch = {index: 612, kind: 'E_LAYOUT_ITEM_SIZE verified-but-overflows', shrunk: {width: 400, height: 600, fixed: [], root: {id: 0, decl: {display: 'grid'}, kids: []}}, css: '.b0{display:grid}', body: '<div class="b0"></div>', mismatches: [{kind: 'rect'}]};
  const jobs = [
    jobSummary(fuzzReport('chromium', 1, 0, 500), {browser: 'chromium', seed: 1, first: 0, cases: 500}),
    jobSummary(fuzzReport('chromium', 1, 500, 500), {browser: 'chromium', seed: 1, first: 500, cases: 500}),
    jobSummary(fuzzReport('firefox', 1, 0, 500), {browser: 'firefox', seed: 1, first: 0, cases: 500}),
    // The firefox chunk 500..999 found a mismatch; nothing else is missing.
    jobSummary(fuzzReport('firefox', 1, 500, 500, [mismatch]), {browser: 'firefox', seed: 1, first: 500, cases: 500}),
  ];
  const day1 = aggregateDay(jobs.map(j => j.browser === 'firefox' ? {...j, mismatches: []} : j), {date: '2026-11-27', commit: 'a'.repeat(40), runUrl: 'https://github.com/mizchi/veriss/actions/runs/1', plan});
  assert.equal(day1.ok, true);
  assert.deepEqual(day1.totals.chromium, {cases: 1000, planned: 1000, verified: 500, violated: 300, unknown: 200, mismatches: 0, missingChunks: 0, failedChunks: 0, problems: 0, decided: 0.8});
  recordDay(dir, day1);

  // The next day: the mismatch, and one chunk that wrote no report (a timeout).
  const day2 = aggregateDay([...jobs.slice(0, 1), jobSummary(null, {browser: 'chromium', seed: 1, first: 500, cases: 500}), ...jobs.slice(2)], {date: '2026-11-28', commit: 'b'.repeat(40), runUrl: 'https://github.com/mizchi/veriss/actions/runs/2', plan});
  assert.equal(day2.ok, false);
  const chromium = day2.runs.find(r => r.browser === 'chromium'), firefox = day2.runs.find(r => r.browser === 'firefox');
  assert.deepEqual(chromium.missingChunks, [{first: 500, cases: 500}]);
  assert.equal(chromium.cases, 500); assert.equal(chromium.planned, 1000);
  assert.equal(firefox.mismatches.length, 1);
  assert.match(firefox.mismatches[0].repro.local, /FUZZ_CASES=1 FUZZ_SEED=1 FUZZ_FIRST=612 .*--project firefox/);
  assert.match(firefox.mismatches[0].repro.ci, /gh workflow run fuzz\.yml -f browsers=firefox -f seeds=1 -f first=612 -f cases=1 -f chunk=1/);
  assert.match(dayTable(day2), /\| chromium \| 1 \| 500 \/ 1000 \|.*\| 500\.\.999 \|/);
  recordDay(dir, day2);
  // A second run of one date replaces it.
  const index = recordDay(dir, day2);
  assert.deepEqual(index.days.map(d => [d.date, d.ok, d.file]), [['2026-11-27', true, 'history/2026-11-27.json'], ['2026-11-28', false, 'history/2026-11-28.json']]);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'history/2026-11-28.json'), 'utf8')), day2);

  const html = renderDashboard(loadData(dir));
  assert.match(html, /<svg [^>]*class="chart"/);
  assert.match(html, /Latest run: 2026-11-28/);
  assert.match(html, /firefox, seed 1, index 612/);
  assert.match(html, /FUZZ_FIRST=612/);
  assert.match(html, /&lt;div class=&quot;b0&quot;&gt;&lt;\/div&gt;/);
  assert.match(html, /chromium 1: decided|chromium 2026-11-28: decided 80\.0% of 500 cases, 0 mismatches, 1 chunks not finished/);
  assert.match(html, /actions\/runs\/2/);
  assert.doesNotMatch(html, /<script/);
});

test('fuzz: a failed job, a partial chunk and a small population each make the day not ok', () => {
  const plan = planMatrix({browsers: 'chromium', seeds: '1', cases: 1001, chunk: 500});
  assert.deepEqual(plan.include.map(j => j.cases), [500, 500, 1]);
  const at = (first, cases) => ({browser: 'chromium', seed: 1, first, cases});
  const good = [jobSummary(fuzzReport('chromium', 1, 0, 500), {...at(0, 500), outcome: 'success'}), jobSummary(fuzzReport('chromium', 1, 500, 500), {...at(500, 500), outcome: 'success'})];
  // A 1-case last chunk is judged with its browser and seed, not on its own.
  const one = {...fuzzReport('chromium', 1, 1000, 1), tally: {cases: 1, verified: 0, violated: 0, unknown: 1, boxes: 3, decidedBoxes: 0}};
  const day = aggregateDay([...good, jobSummary(one, {...at(1000, 1), outcome: 'success'})], {date: '2026-11-29', commit: 'c', runUrl: 'u', plan});
  assert.equal(day.ok, true, JSON.stringify(day.runs[0].problems));
  // The test failed although its report has no mismatch: the day is not ok.
  const failed = aggregateDay([...good.slice(0, 1), jobSummary(fuzzReport('chromium', 1, 500, 500), {...at(500, 500), outcome: 'failure'}), jobSummary(one, {...at(1000, 1), outcome: 'success'})], {date: '2026-11-29', plan});
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.runs[0].failedChunks, [{first: 500, cases: 500}]);
  // A chunk whose report stops after 5 cases leaves 5..499 unfinished, its tally kept.
  const partial = aggregateDay([jobSummary(fuzzReport('chromium', 1, 0, 5), {...at(0, 500), outcome: 'failure'}), ...good.slice(1), jobSummary(one, {...at(1000, 1), outcome: 'success'})], {date: '2026-11-29', plan});
  assert.deepEqual(partial.runs[0].missingChunks, [{first: 5, cases: 495}]);
  assert.equal(partial.runs[0].cases, 506);
  assert.equal(partial.ok, false);
  // The population of the combined browser × seed: mostly Unknown fails it.
  const unknownOnly = r => ({...r, tally: {...r.tally, verified: 0, violated: 0, unknown: r.tally.cases}});
  const flat = aggregateDay([0, 500].map(f => jobSummary(unknownOnly(fuzzReport('chromium', 1, f, 500)), {...at(f, 500), outcome: 'success'})).concat(jobSummary(one, {...at(1000, 1), outcome: 'success'})), {date: '2026-11-29', plan});
  assert.equal(flat.ok, false);
  assert.match(flat.runs[0].problems.join('; '), /decided 0\.0% .*no violated .*no verified/);
});

test('dashboard: a browser-day with no finished chunk is marked, and trend lines are not filled', t => {
  const dir = mkdtempSync(join(tmpdir(), 'fuzz-data-')); t.after(() => rmSync(dir, {recursive: true, force: true}));
  const plan = planMatrix({browsers: 'chromium,webkit', seeds: '1', cases: 500, chunk: 500});
  const ok = jobSummary(fuzzReport('chromium', 1, 0, 500), {browser: 'chromium', seed: 1, first: 0, cases: 500, outcome: 'success'});
  recordDay(dir, aggregateDay([ok, jobSummary(fuzzReport('webkit', 1, 0, 500), {browser: 'webkit', seed: 1, first: 0, cases: 500, outcome: 'success'})], {date: '2026-11-27', commit: 'a', runUrl: 'u1', plan}));
  recordDay(dir, aggregateDay([ok], {date: '2026-11-28', commit: 'b', runUrl: 'u2', plan}));
  const html = renderDashboard(loadData(dir));
  assert.match(html, /class="unavailable[^"]*"[^>]*><title>webkit 2026-11-28: no chunk finished/);
  // Series colours fill the markers only: a polyline is never filled.
  assert.doesNotMatch(html, /\.chart \.s[0-9]\{[^}]*fill:/);
  assert.match(html, /\.chart polyline\{fill:none/);
});
