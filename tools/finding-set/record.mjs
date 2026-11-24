// Append the findings of one report to $VERISS_FINDINGS_OUT: every object with a string `code` in the report's
// arrays (diagnostics, warnings of each rule family), as sorted "code box path" keys. A line names the test file and
// the call: a hash of its input (the box tree, the options and the rest) and the number of earlier calls with the
// same input, so two runs line up call by call even when a failing assertion skips the rest of a test.
import {appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const seen = new Map();
// Relative to the repository (test files of two packages may share a name), with the arguments (a test runs a tool
// several times on different files).
const file = [relative(fileURLToPath(new URL('../..', import.meta.url)), process.argv[1] ?? ''), ...process.argv.slice(2)].join(' ');

function collect(value, out, depth) {
  if (depth > 3 || !value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === 'object' && typeof item.code === 'string') out.add(`${item.code}\t${item.box ?? ''}\t${item.path ?? ''}`);
      else collect(item, out, depth + 1);
    }
    return;
  }
  for (const child of Object.values(value)) collect(child, out, depth + 1);
}

// Hashed before the call: the analysis may add to its input.
export const inputOf = args => { try { return createHash('sha1').update(JSON.stringify(args)).digest('hex').slice(0, 12); } catch { return 'unhashable'; } };

export function record(report, input) {
  const n = seen.get(input) ?? 0;
  seen.set(input, n + 1);
  const findings = new Set();
  collect(report, findings, 0);
  appendFileSync(process.env.VERISS_FINDINGS_OUT, JSON.stringify({file, call: `${input}.${n}`, findings: [...findings].sort()}) + '\n');
}
