// Nested style blocks (styled-components and Linaria templates, a style language with nesting) lowered to flat CSS,
// with provenance: every emitted rule is one line, and the map says which template line and which nesting path it came
// from. A nested selector is an edge from its parent rule to the element it styles (`& > .title`: .title is a child of
// the parent); the selector-usage check (W_CSS_SELECTOR_RELATION) runs on the flat CSS and relocateSelectorWarnings
// reports it at the template line with that edge, so the same check serves any nested source.
//
//   block: {selector: '.sc-Card', text: <template body>, origin: {file, line: <line of the body's first line>, lines?, name}}
//   lowerNested(blocks) -> {css, map: [{cssLine, selector, origin: {file, line, name}, path, relation}]}
//   relation: {parent, combinator: '>' | ' ' | '+' | '~', child} | null (a rule on the element itself, or & compounds)
//
// Declarations after a nested rule are a rule of their own after it (CSS Nesting's nested declarations rule), so the
// order of appearance is kept. A selector list is one rule per selector (same declarations, same order: the cascade is
// unchanged). @media / @supports / @container wrap the rule; other at-rules are left out (the caller reports Unknown).
import postcss from 'postcss';

const conditional = new Set(['media', 'supports', 'container']);
const decl = d => `${d.prop}:${d.value}${d.important ? ' !important' : ''}`;

// & is a parent reference only outside quoted strings and escapes (`[data-label="A&B"]`, `.a\&b` are not one)
const PARENT = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\\.)|&/g;
const hasParent = s => [...s.matchAll(PARENT)].some(m => !m[1]);

// The edge a nested selector adds, written against the resolved parent selector.
function edge(parent, nested) {
  const s = nested.trim();
  let m;
  if ((m = /^&(\s*([>+~])\s*|\s+)(.+)$/.exec(s))) return { parent, combinator: m[2] ?? ' ', child: m[3].trim() };
  if ((m = /^(.+?)(\s*([>+~])\s*|\s+)&$/.exec(s))) return { parent: m[1].trim(), combinator: m[3] ?? ' ', child: parent };
  if (hasParent(s)) return null; // &:hover, &.active, & + & … : the same element or a relation the flat selector carries
  if ((m = /^([>+~])\s*(.+)$/.exec(s))) return { parent, combinator: m[1], child: m[2].trim() };
  return { parent, combinator: ' ', child: s };
}

// & is the parent; a selector without & is relative to it (a descendant, or the combinator it starts with).
const resolve = (parent, nested) => (hasParent(nested) ? nested.trim().replace(PARENT, (m, keep) => keep ?? parent) : `${parent} ${nested.trim()}`);

export function lowerNested(blocks) {
  const lines = [], map = [];
  // wrappers: the conditional at-rules around the rule, outermost first ({name, params})
  const emit = (selector, decls, wrappers, origin, path, relation, nodeLine) => {
    const prefix = wrappers.map(w => `@${w.name} ${w.params}{`).join('');
    lines.push(`${prefix}${selector}{${decls.map(decl).join(';')}}${'}'.repeat(wrappers.length)}`);
    // origin.lines (optional): the template line of each text line, when the text is not line-for-line the template
    // (an interpolation written over several lines collapsed into its value)
    const { lines: lineMap, ...rest } = origin;
    const templateLine = l => lineMap?.[l - 1] ?? origin.line + l - 1;
    // each declaration: its 1-based column in the emitted line, and where it is in the template (the column only when
    // the text is line-for-line the template)
    let column = prefix.length + selector.length + 2;
    const declarations = decls.map(d => {
      const at = { column, line: templateLine(d.source.start.line), ...(lineMap ? {} : { templateColumn: d.source.start.line === 1 ? d.source.start.column - selector.length - 1 : d.source.start.column }) };
      column += decl(d).length + 1;
      return at;
    });
    map.push({ cssLine: lines.length, selector, origin: { ...rest, line: templateLine(nodeLine) }, path, relation, declarations });
  };
  for (const block of blocks) {
    const root = postcss.parse(`${block.selector}{${block.text}}`);
    // A nested style rule's first declarations are reported at its selector line (where a relation is written);
    // later runs, and runs inside @media, at their first declaration.
    const walk = (node, selector, wrappers, path, relation, head = null) => {
      let run = [];
      const flush = () => { if (run.length) { emit(selector, run, wrappers, block.origin, path, relation, head ?? run[0].source.start.line); head = null; } run = []; };
      for (const n of node.nodes ?? []) {
        if (n.type === 'decl') { run.push(n); continue; }
        if (n.type === 'comment') continue;
        flush();
        if (n.type === 'rule') {
          for (const part of postcss.list.comma(n.selector)) walk(n, resolve(selector, part), wrappers, [...path, part.trim()], edge(selector, part), n.source.start.line);
        } else if (n.type === 'atrule' && conditional.has(n.name)) {
          // @media directly inside @media is one @media (the conditions joined); any other nesting is a block each
          const last = wrappers.at(-1);
          const next = n.name === 'media' && last?.name === 'media'
            ? [...wrappers.slice(0, -1), { name: 'media', params: `${last.params} and ${n.params}` }]
            : [...wrappers, { name: n.name, params: n.params }];
          walk(n, selector, next, path, relation);
        }
      }
      flush();
    };
    walk(root.nodes[0], block.selector, [], [block.selector], null);
  }
  return { css: lines.join('\n'), map };
}

/**
 * Findings located in lowered CSS (css: {line, column}; related[].css too), moved to the template: the line (and, when
 * the text is the template line for line, the column) of the declaration at that column, else of the rule; the
 * component name is added. Findings elsewhere are unchanged. offset: lines before the lowered CSS.
 */
export function relocateFindings(findings, map, { offset = 0 } = {}) {
  const move = css => {
    const m = css && map.find(x => x.cssLine + offset === css.line);
    if (!m) return null;
    const d = css.column ? [...m.declarations].reverse().find(x => x.column <= css.column) : null;
    return { css: { file: m.origin.file, line: d?.line ?? m.origin.line, ...(d?.templateColumn ? { column: d.templateColumn } : {}) }, component: m.origin.name };
  };
  return findings.map(f => {
    // a warning's css is a list of locations (each with its property): each moved
    if (Array.isArray(f.css)) {
      const moved = f.css.map(c => { const m = move(c); return m ? { ...c, ...m.css, component: m.component } : c; });
      const first = moved.find(c => c.component);
      return first ? { ...f, css: moved.map(({ component, ...c }) => c), component: first.component } : f;
    }
    const at = move(f.css);
    if (!at) return f;
    return { ...f, ...at, cssLine: f.css.line, ...(f.related ? { related: f.related.map(r => { const m = move(r.css); return m ? { ...r, css: m.css } : r; }) } : {}) };
  });
}

/**
 * Selector-usage warnings on lowered CSS, moved to the template: file, line, component name and the nesting edge.
 * A warning is matched by its flat selector and its line (offset: lines before the lowered CSS): a page rule with the
 * same selector is not the template's.
 */
export function relocateSelectorWarnings(warnings, map, { offset = 0 } = {}) {
  const moved = warnings.map(w => {
    const m = map.find(x => x.selector === w.selector && x.cssLine + offset === w.line);
    if (!m) return w;
    return { ...w, cssLine: w.line, file: m.origin.file, line: m.origin.line, component: m.origin.name, nesting: { path: m.path, relation: m.relation } };
  });
  // One template line evaluated into several variants (one class each) is one finding: reported once, with the
  // number of variants, and a message from a variant whose class the markup has.
  const out = [], byKey = new Map();
  for (const w of moved) {
    if (!w.nesting) { out.push(w); continue; }
    const key = `${w.code}\u0000${w.file}\u0000${w.line}\u0000${w.nesting.path.slice(1).join('\u0000')}`;
    const seen = byKey.get(key);
    if (!seen) { const first = { ...w, variants: 1 }; byKey.set(key, first); out.push(first); continue; }
    seen.variants++;
    if (/no element has class/.test(seen.message) && !/no element has class/.test(w.message)) Object.assign(seen, { ...w, variants: seen.variants });
  }
  // A template rule is unmatched only when every variant of it is: one variant that matches (a variant rendered only in
  // the states where the rule applies) means the line is used.
  const emitted = new Map();
  for (const m of map) { const key = `${m.origin.file}\u0000${m.origin.line}\u0000${m.path.slice(1).join('\u0000')}`; emitted.set(key, (emitted.get(key) ?? 0) + 1); }
  return out.filter(w => w.code !== 'W_CSS_SELECTOR_UNMATCHED' || !w.nesting || w.variants >= (emitted.get(`${w.file}\u0000${w.line}\u0000${w.nesting.path.slice(1).join('\u0000')}`) ?? 0));
}
