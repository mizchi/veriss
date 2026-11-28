// Every initial state a browser and a reset stylesheet give a page: one analysis per (UA × reset) branch, as a
// property-based check whose input space is finite, so it is enumerated (or sampled with a seed when combined with
// other generated dimensions). The layout properties must hold in every branch; what breaks is named by branch.
//
//   analyzeResetMatrix({ html, css }, { uas, resets, viewport, ... })
//     → { status, branches: [{ id, ua, reset, status, findings, unknowns, report }],
//         holdsEverywhere: [finding], onlyIn: [finding], resetFindings: { [resetId]: [finding] },
//         unknowns: { [branchId]: [diagnostic] },
//         equivalent: [{ members, basis }], space }
//
// A finding (an error or warning: diagnostics and layoutWarnings) is keyed by its code, box and property, so the same
// defect with branch-specific numbers is one finding. For each: the branches it is in, the decided branches it is
// absent from, and the Unknown branches where its absence is not shown (never counted as absent), with the smallest
// product of UAs and resets that covers where it is (where / summary).
//
// The branch definitions are data (src/resets/manifest.json: id, name, version, license, url, css; branch ids ua:reset), so
// a renderer (vlmkit) can open the same branches in Chromium, Firefox and WebKit.
import manifest from './resets/manifest.json' with { type: 'json' };
import { analyzeHTML } from './html.mjs';
import { analyzeLayout } from './index.mjs';
import { uaProfiles } from './layout/ua-profile.mjs';

export const resets = manifest.resets;
export const resetById = id => resets.find(r => r.id === id) ?? (() => { throw new Error(`Unknown reset: ${id} (one of ${resets.map(r => r.id).join(', ')})`); })();
export const uas = Object.keys(uaProfiles);

/** Every (ua, reset) pair, UA-major, in the order given. */
export function enumerateBranches({ uas: u = uas, resets: r = resets.map(x => x.id) } = {}) {
  for (const ua of u) if (!uaProfiles[ua]) throw new Error(`Invalid reset matrix: ua must be one of ${uas.join(', ')}`);
  for (const id of r) resetById(id);
  return u.flatMap(ua => r.map(reset => ({ id: `${ua}:${reset}`, ua, reset })));
}

// mulberry32: a small seeded generator, so a sample is reproducible from its seed.
const random = seed => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** n distinct branches drawn with the seed (a partial Fisher-Yates), in the space's order. */
export function sampleBranches(branches, { sample, seed = 1 }) {
  if (!Number.isInteger(sample) || sample < 1) throw new Error('Invalid reset matrix: sample must be a positive integer');
  if (sample >= branches.length) return [...branches];
  const next = random(seed), pool = branches.map((_, i) => i);
  for (let i = 0; i < sample; i++) { const j = i + Math.floor(next() * (pool.length - i)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, sample).sort((a, b) => a - b).map(i => branches[i]);
}

/**
 * The smallest description of a set of branch ids over the space: one product (UAs × resets, either side 'any' when it
 * is the whole axis), or else a union of products grouped by the UAs each reset holds for.
 */
export function describeBranchSet(ids, space) {
  const pairs = ids.map(id => { const i = id.indexOf(':'); return [id.slice(0, i), id.slice(i + 1)]; });
  const U = space.uas.filter(u => pairs.some(p => p[0] === u)), R = space.resets.filter(r => pairs.some(p => p[1] === r));
  const side = (list, all) => list.length === all.length ? 'any' : list;
  const text = ({ uas: u, resets: r }) => u === 'any' && r === 'any' ? 'every branch' : u === 'any' ? `${r.join(', ')} (any UA)` : r === 'any' ? `${u.join(', ')} (any reset)` : `${u.join(', ')} × ${r.join(', ')}`;
  if (new Set(ids).size === U.length * R.length) { const where = { uas: side(U, space.uas), resets: side(R, space.resets) }; return { where, summary: text(where) }; }
  const groups = [];
  for (const r of R) {
    const us = U.filter(u => pairs.some(p => p[0] === u && p[1] === r)), g = groups.find(x => x.uas.join() === us.join());
    if (g) g.resets.push(r); else groups.push({ uas: us, resets: [r] });
  }
  const where = groups.map(g => ({ uas: side(g.uas, space.uas), resets: side(g.resets, space.resets) }));
  return { where, summary: where.map(text).join('; ') };
}

const findingsOf = report => [
  ...(report.diagnostics ?? []).filter(d => d.severity === 'error' || d.severity === 'warning'),
  ...(report.layoutWarnings ?? []),
];
// A finding located only in the branch's reset stylesheet is about the reset's own text (a vendor selector list, an inert
// declaration in it): kept apart, per reset, out of the comparison of the page across branches.
const sources = f => (Array.isArray(f.css) ? f.css : f.css ? [f.css] : []).map(c => c.file);
const inReset = f => { const files = sources(f); return files.length > 0 && files.every(file => String(file).startsWith('reset:')); };
const keyOf = f => JSON.stringify([f.code, f.path ?? f.box ?? f.selector ?? '', f.property ?? f.properties ?? '']);
const resultKey = branch => JSON.stringify([branch.status, branch.findings.map(f => [keyOf(f), f.message]), branch.unknowns.map(u => [u.code, u.message])]);

/**
 * input: { html } (analyzeHTML), { tree } (analyzeLayout), or options.analyze(options) → report. Every other option is
 * the analysis's own (name, css, viewport, reset, ...): each branch adds ua and puts its reset before options.reset.
 */
export function analyzeResetMatrix(input, { uas: u = uas, resets: r = resets.map(x => x.id), sample, seed, analyze, ...options } = {}) {
  const space = { uas: u, resets: r };
  const all = enumerateBranches(space), chosen = sample === undefined ? all : sampleBranches(all, { sample, seed });
  const { html, tree, ...rest } = input ?? {};
  const run = analyze ?? (html !== undefined ? o => analyzeHTML(html, o) : tree !== undefined ? o => analyzeLayout(tree, o) : null);
  if (!run) throw new TypeError('Invalid reset matrix input: give { html }, { tree } or an analyze function');
  const branches = chosen.map(({ id, ua, reset }) => {
    const sheet = resetById(reset);
    const report = run({ name: 'Document', ...rest, ...options, ua, reset: [...(sheet.css ? [{ css: sheet.css, file: `reset:${reset}` }] : []), ...(options.reset ?? [])] });
    const found = findingsOf(report);
    return { id, ua, reset, status: report.status, findings: found.filter(f => !inReset(f)), resetFindings: found.filter(inReset), unknowns: (report.diagnostics ?? []).filter(d => d.severity === 'unknown'), report };
  });
  // Findings across branches.
  const byKey = new Map();
  for (const b of branches) for (const f of b.findings) {
    const k = keyOf(f);
    if (!byKey.has(k)) byKey.set(k, { code: f.code, severity: f.severity, box: f.box, path: f.path, property: f.property ?? f.properties, in: [], messages: {} });
    const e = byKey.get(k);
    if (!e.in.includes(b.id)) { e.in.push(b.id); e.messages[b.id] = f.message; }
  }
  const analysed = { uas: u.filter(x => chosen.some(c => c.ua === x)), resets: r.filter(x => chosen.some(c => c.reset === x)) };
  const holdsEverywhere = [], onlyIn = [];
  for (const e of byKey.values()) {
    const others = branches.filter(b => !e.in.includes(b.id));
    const out = { ...e, absent: others.filter(b => b.status !== 'unknown').map(b => b.id), undecided: others.filter(b => b.status === 'unknown').map(b => b.id), ...describeBranchSet(e.in, analysed) };
    (e.in.length === branches.length ? holdsEverywhere : onlyIn).push(out);
  }
  // The resets' own findings, once per reset (the first branch that analysed it).
  const resetFindings = {};
  for (const b of branches) if (!(b.reset in resetFindings)) resetFindings[b.reset] = b.resetFindings;
  // Branches whose results are identical (status, findings with their messages, Unknowns): each was analysed.
  const groups = new Map();
  for (const b of branches) { const k = resultKey(b); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(b.id); }
  const equivalent = [...groups.values()].filter(m => m.length > 1).map(members => ({ members, basis: 'identical results' }));
  // A branch that fails is a decided failure; otherwise any Unknown branch keeps the whole matrix Unknown (never verified).
  const status = branches.some(b => b.status === 'violated') ? 'violated' : branches.some(b => b.status === 'unknown') ? 'unknown' : 'verified';
  return {
    status,
    branches,
    holdsEverywhere, onlyIn, resetFindings,
    unknowns: Object.fromEntries(branches.map(b => [b.id, b.unknowns])),
    equivalent,
    space: { uas: u, resets: r, total: all.length, analyzed: chosen.length, ...(sample !== undefined ? { sampled: { sample, seed: seed ?? 1 } } : {}) },
  };
}
