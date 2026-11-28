#!/bin/bash
# The check before a push (see AGENTS.md / docs/handoff.md「どこで何が走るか」).
#   tools/gate.sh           fast, local: the root and every package's unit tests (about a minute). The browser e2e and
#                           the component-lint eval run on the pull request (.github/workflows/ci.yml).
#   tools/gate.sh --full    the old local gate: unit tests, the component-lint eval (its results must not change) and
#                           the css-mistakes e2e in Chromium, Firefox and WebKit (20-30 minutes).
#   tools/gate.sh --remote  push the current branch and watch ci.yml run on it (needs gh). With --print, only print
#                           the commands.
# PLAYWRIGHT_BROWSERS_PATH: set it if the browsers are not where Playwright looks by default (--full).
set -u
cd "$(dirname "$0")/.." || exit 1
mode=fast print=0
for a in "$@"; do
  case "$a" in
    --full) mode=full ;;
    --remote) mode=remote ;;
    --print) print=1 ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "unknown option: $a (--full, --remote [--print])" >&2; exit 2 ;;
  esac
done

if [ "$mode" = remote ]; then
  branch=$(git rev-parse --abbrev-ref HEAD)
  [ "$branch" != main ] || { echo "on main: push a branch and open a pull request" >&2; exit 2; }
  cmds=(
    "git push -u origin $branch"
    "gh run list --workflow ci.yml --branch $branch --limit 1"
    "gh run watch --exit-status \$(gh run list --workflow ci.yml --branch $branch --limit 1 --json databaseId -q '.[0].databaseId')"
  )
  if [ "$print" = 1 ]; then printf '%s\n' "${cmds[@]}"; exit 0; fi
  git push -u origin "$branch" || exit 1
  head=$(git rev-parse HEAD) id=""
  # ci.yml runs on pull_request (and on push to main); without a pull request for the branch nothing starts.
  for _ in $(seq 1 30); do
    id=$(gh run list --workflow ci.yml --branch "$branch" --commit "$head" --limit 1 --json databaseId -q '.[0].databaseId' 2>/dev/null)
    [ -n "$id" ] && break; sleep 4
  done
  [ -n "$id" ] || { echo "no ci.yml run for $head: open a pull request (gh pr create) and run again" >&2; exit 1; }
  gh run watch "$id" --exit-status; s=$?
  [ $s = 0 ] || echo "failed jobs: gh run view $id --log-failed; artifacts: gh run download $id"
  exit $s
fi

bad=0
unit() { # <label> <dir>: node --test in <dir>, print its fail count
  local f; f=$(cd "$2" && node --test $3 2>&1 | grep -E "^(# |ℹ )fail" | awk '{print $3}'); echo "$1 fail=$f"; [ "$f" = "0" ]
}
# The packages run side by side (they share nothing); each prints one line. svelte-adapter runs after them on its own:
# its text-max-length test times itself and fails under the others' load.
pids=()
out=$(mktemp -d); trap 'rm -rf "$out"' EXIT
unit root . 'tests/*.test.mjs' > "$out/root" & pids+=($!)
for p in veriss adapter-core react-adapter vue-adapter linaria; do
  unit "$p" "packages/$p" 'test/*.test.mjs' > "$out/$p" & pids+=($!)
done
for pid in "${pids[@]}"; do wait "$pid" || bad=1; done
unit svelte-adapter packages/svelte-adapter 'test/*.test.mjs' > "$out/svelte-adapter" || bad=1
cat "$out/root"; for p in veriss adapter-core react-adapter vue-adapter svelte-adapter linaria; do cat "$out/$p"; done
if [ "$mode" = fast ]; then
  [ $bad = 0 ] && echo "unit tests pass; the e2e and the eval run on the pull request (ci.yml)"
  exit $bad
fi

for a in '' run-1 run-2 run-3; do err=$(node tools/eval-component-lint.mjs ${a:+--attempt $a} 2>&1 >/dev/null) || { echo "eval failed ($a): $(echo "$err" | grep -m1 -E 'Error|error' )"; bad=1; }; done
# The results hold the Chromium version they were recorded with: a different version shapes text differently and moves
# the narrow-width breaks, so a change there may be the browser, not the code (record again on the new version).
[ -z "$(git status --short evals/ | grep -v '^??')" ] || { echo "eval changed"; git status --short evals/ | grep -v '^??'; git diff -U0 evals/ | grep -E '^[-+] +"browser"' | sort -u; bad=1; }
r=$(npx playwright test -c playwright.layout.config.mjs --trace off e2e/layout-css-mistakes.spec.mjs 2>&1 | grep -E '^\s+[0-9]+ (passed|failed)' | tr '\n' ' ')
echo "css-mistakes e2e: $r"; echo "$r" | grep -q failed && bad=1
exit $bad
