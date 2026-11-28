// One entry point for the safe-subset coverage measurement (local or CI): build the corpus, measure it, summarise.
//
//   node tools/safe-subset-coverage.mjs --out <dir> [--vlmkit <checkout> | VLMKIT_DIR=<checkout>] [--set all|local|public]
//     [--only id,id] [--jobs N] [--delay ms] [--budget ms] [--steps N] [--widths 390x844@3,1280x800@1] [--corpus <dir>] [--no-capture]
//
// Writes to <dir>: corpus/ (manifest.json + snapshots/), coverage.json (per page), summary.json (aggregated) and
// tables.md (the report's tables). --no-capture measures an existing corpus (--corpus, default <dir>/corpus).
// Exit 0 when the measurement ran, whatever the coverage: the numbers are a report, not a gate. Non-zero only when a
// step could not run at all (no corpus, a tool crashed before writing its output).
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const out = resolve(opt('--out', 'test-results/safe-subset-coverage'));
const corpus = resolve(opt('--corpus', join(out, 'corpus')));
const tools = fileURLToPath(new URL('.', import.meta.url));
const pass = names => names.flatMap(n => opt(n) !== undefined ? [n, opt(n)] : []);
mkdirSync(out, {recursive: true});

const run = (step, script, argv) => {
  console.error(`== ${step}: node ${script} ${argv.join(' ')}`);
  const r = spawnSync(process.execPath, [join(tools, script), ...argv], {stdio: 'inherit'});
  if (r.status !== 0) { console.error(`${step} failed (exit ${r.status})`); process.exit(r.status || 1); }
};
if (!args.includes('--no-capture')) run('capture', 'corpus/capture.mjs', ['--out', corpus, ...pass(['--vlmkit', '--set', '--only', '--delay'])]);
if (!existsSync(join(corpus, 'manifest.json'))) { console.error(`no corpus at ${corpus}`); process.exit(1); }
run('measure', 'subset-coverage.mjs', ['--corpus', corpus, '--out', join(out, 'coverage.json'), ...pass(['--only', '--jobs', '--budget', '--steps', '--widths'])]);
run('summary', 'subset-coverage-summary.mjs', [join(out, 'coverage.json'), '--out', join(out, 'summary.json'), '--md', join(out, 'tables.md')]);
console.error(`wrote ${out}/{coverage.json,summary.json,tables.md}`);
