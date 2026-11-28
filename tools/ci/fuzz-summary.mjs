// The daily safe-subset fuzz's results (.github/workflows/fuzz.yml), from one job's report to the fuzz-data branch.
//   node tools/ci/fuzz-summary.mjs plan --browsers a,b --seeds 1,2 --cases 5000 --first 0 --chunk 500
//       the matrix: one job per browser × seed × chunk of cases, as JSON {include: [{browser, seed, first, cases}]}
//   node tools/ci/fuzz-summary.mjs job --report <report.json> --browser b --seed s --first f --cases n
//       one job's summary (stdout). The report is what the spec writes with FUZZ_REPORT; a job that wrote none (it
//       timed out, or the browser did not start) is a summary with finished: false
//   node tools/ci/fuzz-summary.mjs day --date D --commit C --run-url U --plan <matrix.json> <summary.json>...
//       the day's result (stdout): per browser and seed, the cases, the verdict counts, the decided share, the chunks
//       that did not finish and every mismatch with its shrunk case and a repro command
//   node tools/ci/fuzz-summary.mjs record --data <dir> <day.json>
//       writes <dir>/history/<date>.json and adds the day to <dir>/index.json (a later run of the same date replaces it)
//   node tools/ci/fuzz-summary.mjs table <day.json>
//       the day as a Markdown table (the run's step summary)
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const list = s => String(s ?? '').split(',').map(x => x.trim()).filter(Boolean);

export function planMatrix({browsers, seeds, cases, first = 0, chunk = 500}) {
  const include = [];
  cases = Number(cases); first = Number(first); chunk = Math.max(1, Number(chunk));
  for (const browser of list(browsers)) for (const seed of list(seeds)) for (let f = first; f < first + cases; f += chunk)
    include.push({browser, seed: Number(seed), first: f, cases: Math.min(chunk, first + cases - f)});
  return {include};
}

export function jobSummary(report, {browser, seed, first, cases}) {
  const base = {browser, seed: Number(seed), first: Number(first), planned: Number(cases)};
  if (!report) return {...base, finished: false, cases: 0, tally: null, mismatches: []};
  return {...base, finished: true, cases: report.tally.cases, tally: report.tally, stoppedEarly: !!report.stoppedEarly, mismatches: report.mismatches ?? []};
}

export const reproCommands = ({browser, seed, index}) => ({
  local: `FUZZ_CASES=1 FUZZ_SEED=${seed} FUZZ_FIRST=${index} npx playwright test -c playwright.layout.config.mjs e2e/layout-fuzz-safe-subset.spec.mjs --project ${browser} -g 'seeded pages'`,
  ci: `gh workflow run fuzz.yml -f browsers=${browser} -f seeds=${seed} -f first=${index} -f cases=1 -f chunk=1`,
});

const share = (n, d) => d ? n / d : null;

export function aggregateDay(jobs, {date, commit, runUrl, plan}) {
  const planned = plan?.include ?? jobs.map(j => ({browser: j.browser, seed: j.seed, first: j.first, cases: j.planned}));
  const groups = new Map();
  const groupOf = (browser, seed) => {
    const k = `${browser}\u0000${seed}`;
    if (!groups.has(k)) groups.set(k, {browser, seed: Number(seed), planned: 0, cases: 0, verified: 0, violated: 0, unknown: 0, boxes: 0, decidedBoxes: 0, chunks: 0, missingChunks: [], mismatches: []});
    return groups.get(k);
  };
  const byChunk = new Map(jobs.map(j => [`${j.browser}\u0000${j.seed}\u0000${j.first}`, j]));
  for (const p of planned) {
    const g = groupOf(p.browser, p.seed), j = byChunk.get(`${p.browser}\u0000${p.seed}\u0000${p.first}`);
    g.planned += p.cases; g.chunks++;
    if (!j || !j.finished) { g.missingChunks.push({first: p.first, cases: p.cases}); continue; }
    for (const k of ['cases', 'verified', 'violated', 'unknown', 'boxes', 'decidedBoxes']) g[k] += j.tally[k] ?? 0;
    for (const m of j.mismatches) g.mismatches.push({...m, repro: reproCommands({browser: p.browser, seed: p.seed, index: m.index})});
  }
  const runs = [...groups.values()].sort((a, b) => a.browser.localeCompare(b.browser) || a.seed - b.seed).map(g => {
    const {boxes, decidedBoxes, ...rest} = g;
    return {...rest, decided: share(g.verified + g.violated, g.cases), boxesDecided: share(decidedBoxes, boxes)};
  });
  const totals = {};
  for (const r of runs) {
    const t = totals[r.browser] ??= {cases: 0, planned: 0, verified: 0, violated: 0, unknown: 0, mismatches: 0, missingChunks: 0};
    t.cases += r.cases; t.planned += r.planned; t.verified += r.verified; t.violated += r.violated; t.unknown += r.unknown;
    t.mismatches += r.mismatches.length; t.missingChunks += r.missingChunks.length;
  }
  for (const t of Object.values(totals)) t.decided = share(t.verified + t.violated, t.cases);
  const ok = runs.every(r => !r.mismatches.length && !r.missingChunks.length);
  return {version: 1, date, commit, runUrl, ok, totals, runs};
}

export function recordDay(dir, day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date)) throw new Error(`bad date: ${day.date}`);
  mkdirSync(join(dir, 'history'), {recursive: true});
  const file = `history/${day.date}.json`;
  writeFileSync(join(dir, file), JSON.stringify(day, null, 1) + '\n');
  const indexFile = join(dir, 'index.json');
  const index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : {version: 1, days: []};
  index.days = index.days.filter(d => d.date !== day.date);
  index.days.push({date: day.date, file, commit: day.commit, runUrl: day.runUrl, ok: day.ok, totals: day.totals});
  index.days.sort((a, b) => a.date.localeCompare(b.date));
  writeFileSync(indexFile, JSON.stringify(index, null, 1) + '\n');
  return index;
}

const pct = x => x === null || x === undefined ? '-' : `${(x * 100).toFixed(1)}%`;

export function dayTable(day) {
  const out = ['| browser | seed | cases | verified | violated | unknown | decided cases | boxes with a rectangle | mismatches | not finished |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of day.runs) out.push(`| ${r.browser} | ${r.seed} | ${r.cases} / ${r.planned} | ${r.verified} | ${r.violated} | ${r.unknown} | ${pct(r.decided)} | ${pct(r.boxesDecided)} | ${r.mismatches.length} | ${r.missingChunks.map(c => `${c.first}..${c.first + c.cases - 1}`).join(', ') || '-'} |`);
  for (const r of day.runs) for (const m of r.mismatches) out.push('', `**${r.browser}, seed ${r.seed}, index ${m.index}**: ${m.kind}`, '```', `shrunk: ${JSON.stringify(m.shrunk)}`, `css: ${m.css}`, `body: ${m.body}`, `repro: ${m.repro.local}`, '```');
  return out.join('\n');
}

function args(argv) {
  const o = {_: []};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) o[argv[i].slice(2)] = argv[++i]; else o._.push(argv[i]);
  return o;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [command, ...rest] = process.argv.slice(2), o = args(rest);
  const read = f => JSON.parse(readFileSync(f, 'utf8'));
  if (command === 'plan') console.log(JSON.stringify(planMatrix(o)));
  else if (command === 'job') console.log(JSON.stringify(jobSummary(o.report && existsSync(o.report) ? read(o.report) : null, o)));
  else if (command === 'day') console.log(JSON.stringify(aggregateDay(o._.map(read), {date: o.date, commit: o.commit, runUrl: o['run-url'], plan: o.plan ? read(o.plan) : null}), null, 1));
  else if (command === 'record') { recordDay(o.data, read(o._[0])); }
  else if (command === 'table') console.log(dayTable(read(o._[0])));
  else { console.error('usage: fuzz-summary.mjs plan | job | day | record | table (see the header)'); process.exit(2); }
}
