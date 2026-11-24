#!/bin/sh
# Record the finding set of every unit test run (all packages) into $1:
#   tools/finding-set/record.sh before.jsonl   (then change the code)
#   tools/finding-set/record.sh after.jsonl
#   node tools/finding-set/compare.mjs before.jsonl after.jsonl
# Each suite runs whatever the others report (a failing root test does not stop the packages).
set -u
out=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
cd "$(dirname "$0")/../.."
: > "$out"
export VERISS_FINDINGS_OUT="$out" NODE_OPTIONS="--import $PWD/tools/finding-set/register.mjs"
node --test tests/*.test.mjs
# One package at a time: pnpm -r skips the dependents of a failing package.
for dir in packages/*/; do (cd "$dir" && pnpm test); done
echo "$(wc -l < "$out") analyses recorded in $out"
