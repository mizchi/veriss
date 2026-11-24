// Record the finding set of every analysis a run makes: each analyzeBoxTree call appends one JSON line to
// $VERISS_FINDINGS_OUT with the findings it reported, as (code, box, path) triples.
//   VERISS_FINDINGS_OUT=/tmp/before.jsonl NODE_OPTIONS="--import $PWD/tools/finding-set/register.mjs" pnpm test
//   node tools/finding-set/compare.mjs /tmp/before.jsonl /tmp/after.jsonl
// A refactoring that must not change what is reported (docs/adr/0016-module-decomposition.md) compares the two runs.
import {register} from 'node:module';

if (process.env.VERISS_FINDINGS_OUT) register('./hook.mjs', import.meta.url);
