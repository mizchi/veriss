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

// The edge a nested selector adds, written against the resolved parent selector.
function edge(parent, nested) {
  const s = nested.trim();
  let m;
  if ((m = /^&(\s*([>+~])\s*|\s+)(.+)$/.exec(s))) return { parent, combinator: m[2] ?? ' ', child: m[3].trim() };
  if ((m = /^(.+?)(\s*([>+~])\s*|\s+)&$/.exec(s))) return { parent: m[1].trim(), combinator: m[3] ?? ' ', child: parent };
  if (s.includes('&')) return null; // &:hover, &.active, & + & … : the same element or a relation the flat selector carries
  if ((m = /^([>+~])\s*(.+)$/.exec(s))) return { parent, combinator: m[1], child: m[2].trim() };
  return { parent, combinator: ' ', child: s };
}

// & is the parent; a selector without & is relative to it (a descendant, or the combinator it starts with).
const resolve = (parent, nested) => (nested.includes('&') ? nested.trim().replace(/&/g, parent) : `${parent} ${nested.trim()}`);

export function lowerNested(blocks) {
  const lines = [], map = [];
  const emit = (selector, decls, media, origin, path, relation, nodeLine) => {
    const rule = `${selector}{${decls.map(decl).join(';')}}`;
    lines.push(media ? `@media ${media}{${rule}}` : rule);
    // origin.lines (optional): the template line of each text line, when the text is not line-for-line the template
    // (an interpolation written over several lines collapsed into its value)
    const { lines: lineMap, ...rest } = origin;
    map.push({ cssLine: lines.length, selector, origin: { ...rest, line: lineMap?.[nodeLine - 1] ?? origin.line + nodeLine - 1 }, path, relation });
  };
  for (const block of blocks) {
    const root = postcss.parse(`${block.selector}{${block.text}}`);
    // A nested style rule's first declarations are reported at its selector line (where a relation is written);
    // later runs, and runs inside @media, at their first declaration.
    const walk = (node, selector, media, path, relation, head = null) => {
      let run = [];
      const flush = () => { if (run.length) { emit(selector, run, media, block.origin, path, relation, head ?? run[0].source.start.line); head = null; } run = []; };
      for (const n of node.nodes ?? []) {
        if (n.type === 'decl') { run.push(n); continue; }
        if (n.type === 'comment') continue;
        flush();
        if (n.type === 'rule') {
          for (const part of postcss.list.comma(n.selector)) walk(n, resolve(selector, part), media, [...path, part.trim()], edge(selector, part), n.source.start.line);
        } else if (n.type === 'atrule' && conditional.has(n.name)) {
          const params = n.name === 'media' ? n.params : null;
          if (params === null) continue;
          walk(n, selector, media ? `${media} and ${params}` : params, path, relation);
        }
      }
      flush();
    };
    walk(root.nodes[0], block.selector, null, [block.selector], null);
  }
  return { css: lines.join('\n'), map };
}

/**
 * Selector-usage warnings on lowered CSS, moved to the template: file, line, component name and the nesting edge.
 * A warning is matched by its flat selector; when several rules share it, by line (offset: lines before the lowered CSS).
 */
export function relocateSelectorWarnings(warnings, map, { offset = 0 } = {}) {
  return warnings.map(w => {
    const same = map.filter(m => m.selector === w.selector);
    const m = same.length === 1 ? same[0] : same.find(x => x.cssLine + offset === w.line);
    if (!m) return w;
    return { ...w, cssLine: w.line, file: m.origin.file, line: m.origin.line, component: m.origin.name, nesting: { path: m.path, relation: m.relation } };
  });
}
