// The Lean definition of L1 (models/lean: Grid, and Flex as the §9.7 freezing loop, with proved properties) as an
// oracle: random configurations at several container widths, the Lean boxes against the Z3 reference (exact rationals)
// and against the engine (its affine boxes evaluated at the width). Skipped where Lean (elan) is not installed.
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {analyzeHTML} from '../packages/veriss/src/html.mjs';
import {spec, toCSS, toHTML} from '../models/layout/spec.mjs';
import {boxesAt, close} from '../models/layout/solve.mjs';
import {randomGrid, randomFlex} from '../models/layout/random.mjs';

after(close);
const project = new URL('../models/lean/', import.meta.url).pathname;
const lake = ['lake', join(homedir(), '.elan/bin/lake')].find(p => spawnSync(p, ['--version']).status === 0);
const built = lake && spawnSync(lake, ['build', 'l1'], {cwd: project, encoding: 'utf8', env: {...process.env, PATH: `${join(homedir(), '.elan/bin')}:${process.env.PATH}`}}).status === 0;
const oracle = process.env.L1_ORACLE ?? join(project, '.lake/build/bin/l1');
const lean = cases => JSON.parse(spawnSync(oracle, [], {input: JSON.stringify(cases), encoding: 'utf8', maxBuffer: 1 << 28}).stdout);
const frac = s => { const [n, d = '1'] = String(s).split('/'); return [BigInt(n), BigInt(d)]; };
const eq = ([a, b], [c, d]) => a * d === c * b;
const exact = ({n, d}) => [BigInt(n), BigInt(d)];
// Many widths: a mistake in how items shrink shows only where some (not all) are shrinking.
const widths = [0, 37, 120.5, 200, 260, 333, 400, 480, 560, 640, 800, 1280];
const skip = !built && 'Lean (elan) is not installed: models/lean is not built';

for (const [kind, make] of [['grid', randomGrid], ['flex', randomFlex]]) test(`Lean = Z3 reference (${kind}, 200 random configurations x ${widths.length} widths)`, {skip}, async () => {
  const configs = Array.from({length: 200}, (_, i) => make(i + 1));
  const out = lean(configs.flatMap(config => widths.map(W => ({config, W}))));
  let compared = 0; const misses = [];
  for (const [i, config] of configs.entries()) {
    const s = spec(config);
    for (const [j, W] of widths.entries()) {
      const got = out[i * widths.length + j], want = await boxesAt(s, W);
      assert.ok(Array.isArray(got), JSON.stringify(got));
      want.forEach((b, k) => { compared++;
        for (const key of ['w', 'h', ...(b.ok ? ['x', 'y'] : [])]) if (!eq(frac(got[k][key]), exact(b[key]))) misses.push(`seed ${i + 1} W ${W} item ${k} ${key}: Lean ${got[k][key]}, Z3 ${b[key].n}/${b[key].d}\n  ${toCSS(config)}`);
        if (got[k].ok !== b.ok) misses.push(`seed ${i + 1} W ${W} item ${k} ok: Lean ${got[k].ok}, Z3 ${b.ok}`);
      });
    }
  }
  assert.equal(misses.slice(0, 5).join('\n'), '');
  assert.ok(compared > 1000, `compared ${compared}`);
});

// The engine's box of item k at width W: the size row whose region holds (W, 700).
const at = (a, w, h) => { const t = [frac(a.coefficient), frac(a.heightCoefficient ?? '0'), frac(a.constant)]; const [cw, ch, c0] = t;
  const n = cw[0] * w[0] * ch[1] * h[1] * c0[1] + ch[0] * h[0] * cw[1] * w[1] * c0[1] + c0[0] * cw[1] * w[1] * ch[1] * h[1]; return [n, cw[1] * w[1] * ch[1] * h[1] * c0[1]]; };
const holds = (row, w, h) => { const inside = (r, v) => { const lo = frac(r.minExact), hi = frac(r.maxExact), [a, b] = v;
    const ge = (x, y) => x[0] * y[1] >= y[0] * x[1], gt = (x, y) => x[0] * y[1] > y[0] * x[1];
    return (r.minInclusive ? ge([a, b], lo) : gt([a, b], lo)) && (r.maxInclusive ? ge(hi, [a, b]) : gt(hi, [a, b])); };
  return inside(row.range, w) && (!row.heightRange || inside(row.heightRange, h)) && (row.region?.constraints ?? []).every(c => { const [n, d] = at(c, w, h); return c.strict ? n * d > 0n : n * d >= 0n; }); };
for (const [kind, make] of [['grid', randomGrid], ['flex', randomFlex]]) test(`Lean = engine (${kind}, 60 random configurations)`, {skip}, () => {
  const ws = [1, 37, 120.5, 200, 260, 333, 400, 480, 560, 640, 720, 799];
  const configs = Array.from({length: 60}, (_, i) => make(i + 1));
  const out = lean(configs.flatMap(config => ws.map(W => ({config, W}))));
  let compared = 0; const misses = [];
  for (const [i, config] of configs.entries()) {
    const report = analyzeHTML(`<html lang="en"><body>${toHTML(config)}</body></html>`, {name: 'P', viewport: {min: 1, max: 800, height: {min: 600, max: 900}},
      css: `*{margin:0;padding:0;border:0;box-sizing:border-box}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${toCSS(config)}`});
    if (report.status === 'unknown') continue;
    for (const [j, W] of ws.entries()) {
      const w = frac(String(W * 2)), w2 = [w[0], 2n], h = [700n, 1n];
      config.items.forEach((_, k) => {
        const row = (report.sizes ?? []).find(r => r.box === `.i${k}` && r.rect && holds(r, w2, h));
        if (!row) return;
        const got = out[i * ws.length + j][k]; compared++;
        const keys = [['w', 'inlineSize'], ['h', 'blockSize'], ...(got.ok ? [['x', 'inlineStart'], ['y', 'blockStart']] : [])];
        for (const [key, field] of keys) if (!eq(frac(got[key]), at(row.rect[field], w2, h))) misses.push(`seed ${i + 1} W ${W} item ${k} ${key}: Lean ${got[key]}, engine ${at(row.rect[field], w2, h).join('/')}\n  ${toCSS(config)}`);
      });
    }
  }
  assert.equal(misses.slice(0, 5).join('\n'), '');
  assert.ok(compared > 200, `compared ${compared}`);
});
