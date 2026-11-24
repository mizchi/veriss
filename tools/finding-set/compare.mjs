// Compare two finding-set recordings (register.mjs): the calls must line up (same file, same number of calls) and
// each call must report the same (code, box, path) set. Prints each difference; exits 1 when there is one.
//   node tools/finding-set/compare.mjs before.jsonl after.jsonl
import {readFileSync} from 'node:fs';

const read = path => {
  const calls = new Map();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line) continue;
    const {file, call, findings} = JSON.parse(line);
    // node --test may run a file twice (a watch rerun): the later run wins.
    calls.set(`${file}#${call}`, findings);
  }
  return calls;
};
const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) { console.error('usage: compare.mjs before.jsonl after.jsonl'); process.exit(2); }
const before = read(beforePath), after = read(afterPath);
let differences = 0;
for (const key of new Set([...before.keys(), ...after.keys()])) {
  const a = before.get(key), b = after.get(key);
  if (!a || !b) { differences++; console.log(`${key}: ${a ? 'missing after' : 'new after'}`); continue; }
  const lost = a.filter(f => !b.includes(f)), gained = b.filter(f => !a.includes(f));
  if (!lost.length && !gained.length) continue;
  differences++;
  for (const f of lost) console.log(`${key}: - ${f}`);
  for (const f of gained) console.log(`${key}: + ${f}`);
}
console.log(`${before.size} calls before, ${after.size} after, ${differences} differing`);
process.exit(differences ? 1 : 0);
