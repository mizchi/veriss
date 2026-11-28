// The fuzz workflow's summaries (.github/workflows/fuzz.yml).
//   node tools/ci/fuzz-summary.mjs parse <fuzz.log> <browser> <seed>   one run's tally as JSON (stdout)
//   node tools/ci/fuzz-summary.mjs table <summary.json>...              a Markdown table of the runs
// The spec prints one line per run: "safe-subset fuzz (<browser>, seed <s>, <a>..<b>): {...}; decided cases N%, boxes
// with a rectangle M%"; each mismatch it found is "seed <s> index <i>: <kind>" in the failure message.
import {readFileSync} from 'node:fs';

const [command, ...args] = process.argv.slice(2);
if (command === 'parse') {
  const [log, browser, seed] = args, text = readFileSync(log, 'utf8');
  const m = text.match(/safe-subset fuzz \([^)]*\): (\{[^}]*\}); decided cases ([\d.]+)%, boxes with a rectangle ([\d.]+)%/);
  const mismatches = new Set(text.match(/seed \d+ index \d+: /g) ?? []).size;
  console.log(JSON.stringify({browser, seed, tally: m ? JSON.parse(m[1]) : null, decided: m?.[2] ?? null, boxes: m?.[3] ?? null, mismatches}));
} else if (command === 'table') {
  const rows = args.map(f => JSON.parse(readFileSync(f, 'utf8')));
  rows.sort((a, b) => a.browser.localeCompare(b.browser) || Number(a.seed) - Number(b.seed));
  console.log('| browser | seed | cases | verified | violated | unknown | decided cases | boxes with a rectangle | mismatches |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const s of rows) {
    const t = s.tally ?? {}, v = x => x ?? '-';
    console.log(`| ${s.browser} | ${s.seed} | ${v(t.cases)} | ${v(t.verified)} | ${v(t.violated)} | ${v(t.unknown)} | ${v(s.decided)}% | ${v(s.boxes)}% | ${s.mismatches}${s.tally ? '' : ' (no tally: the run did not finish)'} |`);
  }
} else {
  console.error('usage: fuzz-summary.mjs parse <log> <browser> <seed> | table <summary.json>...'); process.exit(2);
}
