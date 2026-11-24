// Module hook for register.mjs: wraps the engine's analyzeBoxTree (an exported function declaration is a live,
// assignable binding, so importers see the wrapper) to record its findings. Only the outermost call is recorded: the
// re-layouts an analysis makes of itself (untransformed, hovered) take inputs that depend on what it found.
const recorder = new URL('./record.mjs', import.meta.url).href;

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (!url.endsWith('/packages/veriss/src/layout/engine.mjs')) return result;
  const source = String(result.source);
  return {...result, source: `${source}
import {record as $recordFindings, inputOf as $inputOf} from ${JSON.stringify(recorder)};
{ const $original = analyzeBoxTree; let $depth = 0;
  analyzeBoxTree = function (...args) {
    if ($depth) return $original.apply(this, args);
    const input = $inputOf(args); $depth++;
    try { const report = $original.apply(this, args); $recordFindings(report, input); return report; } finally { $depth--; }
  }; }
`};
}
