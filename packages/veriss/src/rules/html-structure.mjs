// Checklist J: parent-child structure in HTML (the content model) that the parser rebuilds, that changes what the
// browser renders or exposes, or that only the content model forbids. Each warning carries `fix`, the structure to
// write instead. `atRoot` marks a finding decided only by the element's place at the root of what was analyzed (its
// parent is the page's body): for a component that parent is the caller's, so a component lint does not claim it.

// The structure to write instead of nesting `tag` in `inside` (the parser closes `inside` at `tag`'s start tag).
const autoClosedFix = (tag, inside) => ({
  li: 'list items are siblings; for a nested list write <li>…<ul><li>…</li></ul></li>',
  dt: 'dt and dd are siblings in <dl>; for a nested list write a <dl> inside the <dd>',
  dd: 'dt and dd are siblings in <dl>; for a nested list write a <dl> inside the <dd>',
  option: 'options are siblings in <select>; group them with <optgroup label="…">',
  optgroup: 'optgroups do not nest: put each <optgroup> directly in <select>',
  td: 'cells are siblings in a <tr>; for a table inside a cell write <td><table>…</table></td>',
  th: 'cells are siblings in a <tr>; for a table inside a cell write <td><table>…</table></td>',
  tr: 'rows are siblings in a <tbody>; for a table inside a cell write <td><table>…</table></td>',
  tbody: 'row groups are siblings in a <table>; for a table inside a cell write <td><table>…</table></td>',
  thead: 'row groups are siblings in a <table>; for a table inside a cell write <td><table>…</table></td>',
  tfoot: 'row groups are siblings in a <table>; for a table inside a cell write <td><table>…</table></td>',
  caption: 'a <caption> is the first child of its <table>',
  colgroup: 'a <colgroup> is a child of its <table>, before the rows',
}[tag] ?? `${tag} and ${inside} annotations are siblings inside <ruby>`);
const droppedFix = dropped => dropped.some(t => ['td', 'th'].includes(t)) || dropped.includes('tr')
  ? 'write the cells in rows inside a table (<table><tbody><tr><td>…</td></tr></tbody></table>); a component that renders a row or a cell is placed by its caller inside the caller\'s table'
  : 'write the table parts inside a <table> (caption first, then colgroup, thead, tbody, tfoot)';

// The fix of the kinds checklist F27 found (the message names the cause).
const earlierFix = { fostered: 'put the element in a cell (<td>) or a <caption>, or outside the table', 'nested-form': 'close the outer form first, or use the form attribute on the fields', implied: 'nest only phrasing content (text, span, a, strong…) in a <p>; use a <div> around block content', unclosed: 'fix the nesting: no link in a link, no heading in a heading, no form control or button in a button' };

/** The kind, message and fix of a W_HTML_RESTRUCTURED (box.restructured: the kind the HTML adapter recorded). */
export function restructuredDetail(box) {
  if (box.restructured in earlierFix) { const b = box; return { kind: box.restructured, fix: earlierFix[box.restructured], message: b.restructured === 'fostered' ? `${b.label} is written inside a <table> but outside its cells, so the HTML parser moves it before the table (foster parenting): it is not in the table in the page. Put it in a cell (<td>) or a <caption>, or outside the table` : b.restructured === 'nested-form' ? `${b.label} has a <form> written inside it: the HTML parser drops the inner <form> start tag, so its fields belong to the outer form and its attributes (action, method) are lost. Forms cannot be nested: close the outer one first, or use the form attribute on the fields` : b.restructured === 'implied' ? `${b.label} is not in the source: the HTML parser made it (a stray </${b.tag}> after an element that cannot be inside a <${b.tag}> — a block in a paragraph — closed the open one, and the end tag became an empty <${b.tag}>). The elements written inside it are siblings in the page: nest only phrasing content in <${b.tag}>` : `${b.label} is closed early by the HTML parser (its </${b.tag}> does not end it: an element it cannot contain — a nested <a>, a <button> in a <button> or a heading in a heading — was written inside), so the elements after that point are not inside it in the page. Fix the nesting` }; }
  if (box.restructured === 'dropped') {
    const tags = box.droppedTags.map(t => `<${t}>`).join(', ');
    return { kind: 'dropped', dropped: [...box.droppedTags], fix: droppedFix(box.droppedTags),
      message: `${box.label} has ${tags} written inside it, outside a <table>: the HTML parser ignores ${box.droppedTags.length > 1 ? 'those start tags' : 'that start tag'}, so the element${box.droppedTags.length > 1 ? 's do' : ' does'} not exist in the page (the text inside stays, in ${box.label}). A server-rendered page or a template parsed by the browser loses ${box.droppedTags.length > 1 ? 'them' : 'it'}; a DOM built by script keeps ${box.droppedTags.length > 1 ? 'them' : 'it'}, so the two differ` };
  }
  return { kind: 'auto-closed', writtenIn: box.writtenIn, fix: autoClosedFix(box.tag, box.writtenIn),
    message: `${box.label} is written inside a <${box.writtenIn}>, but its <${box.tag}> start tag closes the open <${box.writtenIn}> (whose end tag is optional), so in the page it is the next sibling of that <${box.writtenIn}>, not inside it; the </${box.writtenIn}> written after it is ignored. A DOM built by script keeps it nested, so the server-rendered page and the hydrated one differ` };
}

// Content-model tables (HTML Living Standard §4): flow content that is not phrasing content, the elements whose content
// is phrasing content only, and the transparent elements whose content model is their parent's.
export const flowOnly = new Set(['address', 'article', 'aside', 'blockquote', 'details', 'dialog', 'div', 'dl', 'fieldset', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'main', 'menu', 'nav', 'ol', 'p', 'pre', 'search', 'section', 'table', 'ul']);
const headings = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hgroup']);
const phrasingOnly = new Set(['abbr', 'b', 'bdi', 'bdo', 'button', 'cite', 'code', 'data', 'dfn', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'i', 'kbd', 'label', 'legend', 'mark', 'meter', 'output', 'progress', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'summary', 'sup', 'time', 'u', 'var']);
const transparent = new Set(['a', 'audio', 'canvas', 'del', 'ins', 'map', 'noscript', 'object', 'slot', 'video']);
// Elements a <label> labels (HTML §4.10.2 labelable elements; a hidden input is not one).
const labelable = box => ['button', 'meter', 'output', 'progress', 'select', 'textarea'].includes(box.tag) || (box.tag === 'input' && box.inputType !== 'hidden');

/** E_HTML_PARAGRAPH_CONTENT on paragraph `p` (a box) holding a `tag` element: a spec-tier error (markup conformance). */
export function paragraphContent(p, tag) {
  return { code: 'E_HTML_PARAGRAPH_CONTENT', severity: 'error', box: p.label, path: p.path, tag: 'p', rule: 'html-structure', child: tag,
    fix: 'use a <div> as the container, or <span> inside the paragraph',
    message: `${p.label} is a <p> holding a <${tag}>: a paragraph's content is phrasing content only. Built through the DOM (React, Vue) the browsers render it nested, but the same markup parsed as HTML (server rendering, hydration) closes the <p> before the <${tag}>, so the two trees differ` };
}

/**
 * Structure warnings over a box tree: W_HTML_SUMMARY_OUTSIDE, W_HTML_LEGEND_OUTSIDE, W_HTML_LABEL_EXTRA_CONTROL (each
 * measured in Chromium, Firefox and WebKit) and W_HTML_CONTENT_MODEL (what only the content model forbids; the
 * browsers keep it as written and render it).
 * @param boxes the boxes in tree order; parentOf(box) its parent box.
 */
export function structureWarnings(boxes, parentOf) {
  const out = [];
  const isRoot = box => { const p = parentOf(box); return !p || ['body', 'html'].includes(p.tag); };
  const ancestors = box => { const list = []; for (let p = parentOf(box); p; p = parentOf(p)) list.push(p); return list; };
  const add = (code, box, message, fix, extra = {}) => out.push({ code, severity: 'warning', box: box.label, path: box.path, tag: box.tag, rule: 'html-structure', message, fix, ...extra });
  for (const box of boxes) {
    if (box.pseudo) continue;
    const parent = parentOf(box);
    // J3: a summary is the details' summary only as its child (the first such child): elsewhere the details draws its
    // own "Details" label, and the summary is ordinary content that toggles nothing.
    if (box.tag === 'summary' && parent?.tag !== 'details')
      add('W_HTML_SUMMARY_OUTSIDE', box, `${box.label} is not a child of <details>, so it is not a summary: ${ancestors(box).some(a => a.tag === 'details') ? 'the details shows the browser\'s own "Details" label instead, and clicking this one does not open it' : 'it is an ordinary block that opens and closes nothing'}`,
        'put the <summary> as the first child of its <details>', isRoot(box) ? { atRoot: true } : {});
    // J4: a legend is the fieldset's legend only as its child: elsewhere it is an ordinary block (not drawn on the
    // fieldset's border) and does not name the group.
    if (box.tag === 'legend' && parent?.tag !== 'fieldset')
      add('W_HTML_LEGEND_OUTSIDE', box, `${box.label} is not a child of <fieldset>, so it is not the fieldset's legend: it is not drawn on the border and does not name the group`,
        'put the <legend> as the first child of its <fieldset>', isRoot(box) ? { atRoot: true } : {});
    // J5: a label labels one control: the one its for= names, else its first labelable descendant. Every other
    // control inside it gets nothing from it (control.labels does not list it).
    if (box.tag === 'label' && box.labelFor !== 'dynamic') {
      const controls = []; (function walk(b) { for (const c of b.children ?? []) { if (labelable(c)) controls.push(c); walk(c); } })(box);
      const labeled = box.labelFor !== undefined ? boxes.find(b => b.id === box.labelFor) : controls[0];
      for (const control of controls.filter(c => c !== labeled))
        add('W_HTML_LABEL_EXTRA_CONTROL', control, `${control.label} is inside ${box.label}, but a label labels only ${box.labelFor !== undefined ? `the element its for names (#${box.labelFor})` : `its first control (${labeled.label})`}: this one gets no name or click target from it`,
          'give each control its own <label> (wrap it, or use for= with its id)');
    }
    // J6 (content model only): flow content in an element whose content is phrasing only (through transparent
    // elements such as <a>, whose content model is their parent's), and the other parent-child rules below.
    if (flowOnly.has(box.tag)) {
      let host = parent; while (host && transparent.has(host.tag)) host = parentOf(host);
      if (host && phrasingOnly.has(host.tag) && !(headings.has(box.tag) && ['legend', 'summary'].includes(host.tag)))
        add('W_HTML_CONTENT_MODEL', box, `${box.label} is a <${box.tag}> inside a <${host.tag}>, whose content is phrasing content only (text and inline elements such as span, a, strong)`,
          `use a phrasing element (a <span>, styled display: block if needed), or move the <${box.tag}> out of the <${host.tag}>`, { kind: 'flow-in-phrasing', parentTag: host.tag });
    }
    // J7: a paragraph whose content is phrasing only holding flow content. Only a tree built through the DOM can hold
    // it (the HTML parser closes the paragraph first: F27); the browsers render it nested as built.
    if (flowOnly.has(box.tag)) {
      let host = parent; while (host && transparent.has(host.tag)) host = parentOf(host);
      if (host?.tag === 'p') out.push(paragraphContent(host, box.tag));
    }
    if (['header', 'footer'].includes(box.tag)) {
      const outer = ancestors(box).find(a => ['header', 'footer'].includes(a.tag));
      if (outer) add('W_HTML_CONTENT_MODEL', box, `${box.label} is a <${box.tag}> inside a <${outer.tag}>: a header or footer has no header or footer inside it`, `use a <div> for the inner one`, { kind: 'header-footer', parentTag: outer.tag });
    }
    if (['option', 'optgroup'].includes(box.tag) && !ancestors(box).some(a => ['select', 'datalist'].includes(a.tag)))
      add('W_HTML_CONTENT_MODEL', box, `${box.label} is an <${box.tag}> outside <select> and <datalist>: it is no option of any list`, 'put options in a <select> or <datalist> (or use role="option" inside a role="listbox")', { kind: 'option-outside', ...(isRoot(box) ? { atRoot: true } : {}) });
    if (box.tag === 'figcaption' && parent?.tag !== 'figure')
      add('W_HTML_CONTENT_MODEL', box, `${box.label} is a <figcaption> outside a <figure>: it captions nothing`, 'put the <figcaption> as the first or last child of its <figure>', { kind: 'figcaption-outside', ...(isRoot(box) ? { atRoot: true } : {}) });
    if (box.tag === 'label' && ancestors(box).some(a => a.tag === 'label'))
      add('W_HTML_CONTENT_MODEL', box, `${box.label} is a <label> inside another <label>: a label has no label inside it`, 'give each control its own label, side by side', { kind: 'label-in-label', parentTag: 'label' });
  }
  return out;
}
