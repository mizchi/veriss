#!/bin/bash
# The check run before every push (see AGENTS.md / docs/handoff.md): every package's unit tests, the component-lint
# eval (its results must not change), and the css-mistakes e2e in Chromium, Firefox and WebKit.
# PLAYWRIGHT_BROWSERS_PATH: set it if the browsers are not where Playwright looks by default.
set -u
cd "$(dirname "$0")/.." || exit 1
bad=0
f=$(node --test tests/*.test.mjs 2>&1 | grep -E "^(# |ℹ )fail" | awk '{print $3}'); echo "root fail=$f"; [ "$f" = "0" ] || bad=1
for p in veriss adapter-core react-adapter vue-adapter svelte-adapter linaria; do
  f=$(cd packages/$p && node --test test/*.test.mjs 2>&1 | grep -E "^(# |ℹ )fail" | awk '{print $3}'); echo "$p fail=$f"; [ "$f" = "0" ] || bad=1
done
for a in '' run-1 run-2 run-3; do err=$(node tools/eval-component-lint.mjs ${a:+--attempt $a} 2>&1 >/dev/null) || { echo "eval failed ($a): $(echo "$err" | grep -m1 -E 'Error|error' )"; bad=1; }; done
# The results hold the Chromium version they were recorded with: a different version shapes text differently and moves
# the narrow-width breaks, so a change there may be the browser, not the code (record again on the new version).
[ -z "$(git status --short evals/ | grep -v '^??')" ] || { echo "eval changed"; git status --short evals/ | grep -v '^??'; git diff -U0 evals/ | grep -E '^[-+] +"browser"' | sort -u; bad=1; }
r=$(npx playwright test -c playwright.layout.config.mjs --trace off e2e/layout-css-mistakes.spec.mjs 2>&1 | grep -E '^\s+[0-9]+ (passed|failed)' | tr '\n' ' ')
echo "css-mistakes e2e: $r"; echo "$r" | grep -q failed && bad=1
exit $bad
