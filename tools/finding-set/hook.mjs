// Module hook for register.mjs: wraps the engine's analyzeBoxTree (an exported function declaration is a live,
// assignable binding, so importers see the wrapper) to record its findings.
const recorder = new URL('./record.mjs', import.meta.url).href;

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (!url.endsWith('/packages/veriss/src/layout/engine.mjs')) return result;
  const source = String(result.source);
  return {...result, source: `${source}
import {record as $recordFindings} from ${JSON.stringify(recorder)};
{ const $original = analyzeBoxTree; analyzeBoxTree = function (...args) { const report = $original.apply(this, args); $recordFindings(report); return report; }; }
`};
}
