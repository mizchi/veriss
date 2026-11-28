// The layout e2e's shards in ci.yml, cut by measured test time instead of Playwright's --shard (which cuts the test
// list into equal counts in file order, so the fuzz specs, a few minutes each, landed in one shard).
//   node tools/ci/e2e-shards.mjs plan --list <list.json> --project <p> --shards <n> --shard <i> [--workers 2]
//        [--durations tools/ci/e2e-durations.json] [--out <test-list.txt>]
//     list.json is `npx playwright test -c playwright.layout.config.mjs --list --reporter json`. Writes the tests of
//     shard i (1-based) as a Playwright --test-list file and prints the plan of every shard on stderr.
//   node tools/ci/e2e-shards.mjs record <job log>... > tools/ci/e2e-durations.json
//     The durations from the list reporter's lines ("✓  12 [webkit] › e2e/x.spec.mjs:3:1 › title (2.5s)"), e.g. of
//     `gh run view <id> --log`. Re-record when a spec gets much slower or faster; a test missing from the file counts
//     as the median of its project.
// A file that keeps its tests in one worker (test.describe.configure with mode 'serial' or 'default') is one unit: all
// of its tests go to the same shard, in file order.
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

export const key = (project, file, titles) => [`[${project}]`, file, ...titles].join(' › ');

// The tests of a --list JSON report: [{project, file, titles}].
export function listedTests(report) {
  const out = [];
  const walk = (suite, titles) => {
    for (const spec of suite.specs ?? []) for (const t of spec.tests) out.push({project: t.projectName, file: spec.file, titles: [...titles, spec.title]});
    for (const child of suite.suites ?? []) walk(child, [...titles, child.title]);
  };
  for (const file of report.suites ?? []) {
    for (const spec of file.specs ?? []) for (const t of spec.tests) out.push({project: t.projectName, file: spec.file, titles: [spec.title]});
    for (const child of file.suites ?? []) walk(child, [child.title]);
  }
  return out;
}

export const keepsOrder = source => /test\.describe\.configure\(\s*\{\s*mode:\s*['"](serial|default)['"]/.test(source);

// Units of one project: a test each, or a whole file when the file keeps its tests in order.
export function units(tests, durations, project, isOrdered) {
  const mine = tests.filter(t => t.project === project);
  const known = mine.map(t => durations[key(t.project, t.file, t.titles)]).filter(x => x !== undefined).sort((a, b) => a - b);
  const fallback = known.length ? known[Math.floor(known.length / 2)] : 5;
  const byFile = new Map(), out = [];
  for (const t of mine) {
    const seconds = durations[key(t.project, t.file, t.titles)] ?? fallback;
    if (isOrdered(t.file)) {
      let u = byFile.get(t.file);
      if (!u) { u = {tests: [], seconds: 0}; byFile.set(t.file, u); out.push(u); }
      u.tests.push(t); u.seconds += seconds;
    } else out.push({tests: [t], seconds});
  }
  return out;
}

// Longest unit first, each to the shard whose wall time it raises least; a shard's wall time with W workers is
// max(sum / W, its longest unit). Deterministic: ties go to the lower shard.
export function planShards(unitList, shards, workers = 2) {
  const plan = Array.from({length: shards}, () => ({units: [], seconds: 0, longest: 0}));
  const wall = s => Math.max(s.seconds / workers, s.longest);
  const order = unitList.map((u, i) => [u, i]).sort((a, b) => b[0].seconds - a[0].seconds || a[1] - b[1]);
  for (const [u, i] of order) {
    let best = 0, bestWall = Infinity;
    for (const [n, s] of plan.entries()) {
      const w = Math.max((s.seconds + u.seconds) / workers, s.longest, u.seconds);
      if (w < bestWall - 1e-9) { best = n; bestWall = w; }
    }
    const s = plan[best]; s.units.push([u, i]); s.seconds += u.seconds; s.longest = Math.max(s.longest, u.seconds);
  }
  // In list order inside a shard (Playwright runs a --test-list in file order anyway).
  return plan.map(s => ({tests: s.units.sort((a, b) => a[1] - b[1]).flatMap(([u]) => u.tests), seconds: s.seconds, wall: wall(s)}));
}

// {"[project] › file › title": seconds} from list-reporter lines.
export function parseDurations(text) {
  const out = {};
  for (const line of text.split('\n')) {
    // A skipped test ("-", no duration) costs nothing.
    const m = line.match(/[✓✘-]\s+\d+ \[([\w-]+)\] › ([^:›]+):\d+:\d+ › (.*?)(?: \(([\d.]+)(ms|s|m)\))?\s*$/);
    if (!m || (!m[4] && !/-\s+\d+ \[/.test(line))) continue;
    const seconds = m[4] ? Number(m[4]) * (m[5] === 'ms' ? 0.001 : m[5] === 'm' ? 60 : 1) : 0;
    const file = m[2].trim().replace(/^e2e\//, '');
    out[key(m[1], file, m[3].split(' › '))] = Math.round(seconds * 10) / 10;
  }
  return out;
}

function args(list) {
  const o = {};
  for (let i = 0; i < list.length; i++) if (list[i].startsWith('--')) o[list[i].slice(2)] = list[++i];
  return o;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'record') {
    const all = Object.assign({}, ...rest.map(f => parseDurations(readFileSync(f, 'utf8'))));
    console.log(JSON.stringify(Object.fromEntries(Object.entries(all).sort(([a], [b]) => a.localeCompare(b))), null, 1));
  } else if (command === 'plan') {
    const o = args(rest), shards = Number(o.shards), shard = Number(o.shard), workers = Number(o.workers ?? 2);
    if (!o.list || !o.project || !(shard >= 1 && shard <= shards)) { console.error('plan needs --list, --project, --shards and --shard (1..shards)'); process.exit(2); }
    const report = JSON.parse(readFileSync(o.list, 'utf8'));
    if (report.errors?.length) { console.error(report.errors.map(e => e.message).join('\n')); process.exit(1); }
    const durations = JSON.parse(readFileSync(o.durations ?? new URL('e2e-durations.json', import.meta.url), 'utf8'));
    const testDir = report.config.rootDir, cache = new Map();
    const isOrdered = file => { if (!cache.has(file)) cache.set(file, keepsOrder(readFileSync(join(testDir, file), 'utf8'))); return cache.get(file); };
    const plan = planShards(units(listedTests(report), durations, o.project, isOrdered), shards, workers);
    for (const [n, s] of plan.entries()) console.error(`${n + 1 === shard ? '>' : ' '} shard ${n + 1}/${shards}: ${s.tests.length} tests, ${Math.round(s.seconds)}s of tests, ~${Math.round(s.wall)}s with ${workers} workers`);
    const mine = plan[shard - 1].tests;
    if (!mine.length) { console.error(`shard ${shard} has no tests: lower --shards`); process.exit(1); }
    const text = mine.map(t => key(t.project, t.file, t.titles)).join('\n') + '\n';
    if (o.out) writeFileSync(o.out, text); else process.stdout.write(text);
  } else {
    console.error('usage: e2e-shards.mjs plan --list <list.json> --project <p> --shards <n> --shard <i> [--workers 2] [--out <file>] | record <log>...');
    process.exit(2);
  }
}
