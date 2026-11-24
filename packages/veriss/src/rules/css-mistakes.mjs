// CSS mistakes that are found on the computed style of one box and its ancestors (ADR-0016 M5): declarations that do
// nothing where they are, rules for boxes that never render, and the like (checklist F). Moved out of the layout
// engine: what a check reads is now an explicit context instead of the engine's closure.
//   report: where findings go (warnings, Unknown diagnostics, the viewport ranges of a region)
//   facts:  what the syntax and style stages found (rules, the indexes parseLayoutCSS keeps, styles() of a box)
//   tools:  selector matching and the dropped-declaration readers
// The checks are unchanged. They run in the style stage's one walk (engine.mjs, M6), never from the layout.
export function createCssMistakes({ report, facts, tools }) {
  const { warnings: layoutWarnings, unknown, diagnostics, ranges } = report;
  const { rules, firstPseudo, contentRules, radiusRules, keyframeNames, dependentDeclarations, userSelectNone, transitionSizes, styles, unreadContainers = [] } = facts;
  const { matches, PARENT, droppedOf, droppedPairs, droppedValue, transitionsOf, animationsOf, dependentProperty, ignoringSiblings, directionality, langMatches, asEditable, readWriteKnown, optionalDivergent, optionalDivergence, requiredCapable, asFormField, placeholderField, focusable: focusableBox } = tools;
  const neverRendered = new Set(['template', 'script', 'style', 'link', 'meta']);
  // F37: a box ::first-letter / ::first-line selects, and the boxes proven to have none (not a block container).
  const firstInert = new Set();
  function firstPseudoInert(box, style) {
    if (box.pseudo) return;
    for (const note of firstPseudo) for (const sel of note.selectors) {
      const pe = `::${sel.pseudoElement}`;
      if (!matches(sel, box, new Set([pe, ...(sel.state ? [sel.state] : [])]))) continue;
      const replaced = ['img', 'video', 'canvas', 'iframe', 'svg', 'input', 'select', 'textarea'].includes(box.tag);
      if (!replaced && !['inline', 'flex', 'inline-flex', 'grid', 'inline-grid', 'none', 'contents'].includes(style.display)) continue;
      firstInert.add(`${box.path}|${sel.source}`);
      if (['none', 'contents'].includes(style.display) || layoutWarnings.some(w => w.code === 'W_CSS_STATE_UNREACHABLE' && w.path === box.path && w.selector === sel.source)) continue;
      layoutWarnings.push({ code: 'W_CSS_STATE_UNREACHABLE', severity: 'warning', box: box.label, path: box.path, selector: sel.source, state: pe, css: [{ property: pe, file: note.file, line: note.line, selector: sel.source }],
        message: `${sel.source} never applies to ${box.label}: it is ${replaced ? `a <${box.tag}>` : `display: ${style.display}`}, not a block container, so it has no ${pe}. ${style.display === 'inline' ? 'Make it display: inline-block or block' : 'Put the rule on the item that holds the text'}` });
    }
  }
  // F45: text-align / text-indent / text-align-last on an inline element (no child elements) do nothing: they align and
  // indent the lines of a block container (measured in Chromium, Firefox and WebKit).
  // F103: in a line (an inline formatting context) a margin-left / -right of auto is 0 (CSS 2.2 §10.3.1, §10.3.9): an
  // inline, inline-block, inline-flex, inline-grid or inline-table box is not centred by margin: 0 auto (measured in
  // Chromium, Firefox and WebKit). A flex or grid parent makes it a block-level item, where auto margins do work.
  function inlineAutoMargin(box, style, parentStyle) {
    const display = String(style.$inlineDisplay ?? style.display);
    if (box.pseudo || !/^inline(?:-block|-flex|-grid|-table)?$/.test(display)) return;
    if (parentStyle && ['flex', 'inline-flex', 'grid', 'inline-grid'].includes(String(parentStyle.display)) && !parentStyle.$blockFlow) return;
    const keys = ['margin-left', 'margin-right'].filter(key => style.$sources?.[key] && String(style[key]) === 'auto');
    if (!keys.length || layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes(keys[0]))) return;
    layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: keys, css: keys.map(key => ({ property: key, file: style.$sources[key].file, line: style.$sources[key].line, selector: style.$sources[key].selector })),
      message: `${box.label}: ${keys.join(' and ')}: auto ${keys.length === 1 ? 'is' : 'are'} 0 on a display: ${display} box in a line of text, so it is not centred or pushed aside. Centre it with text-align: center on its parent, or make it display: block (or the parent a flex container)` });
  }
  // F105: justify-self on a block-level box in block layout, and justify-items on a block container, align (and shrink an
  // auto width) in Chromium and WebKit but do nothing in Firefox (measured, every value but normal, stretch and auto): the
  // page differs by browser. The layout stays Unknown there; this says why it matters.
  function alignBrowserDependent(box, property, value) {
    if (layoutWarnings.some(w => w.code === 'W_LAYOUT_ALIGN_BROWSER_DEPENDENT' && w.path === box.path && w.property === property)) return;
    layoutWarnings.push({ code: 'W_LAYOUT_ALIGN_BROWSER_DEPENDENT', severity: 'warning', box: box.label, path: box.path, property, browsers: { aligns: ['chromium', 'webkit'], ignores: ['firefox'] },
      message: `${box.label}: ${property}: ${value} in block layout aligns ${property === 'justify-items' ? 'the children' : 'the box'} (and shrinks an auto width to fit) in Chromium and Safari, but Firefox ignores it, so the page differs by browser. Use margin-inline: auto (with a width) to centre, or make the parent display: grid` });
  }
  function inlineTextAlignment(box, style) {
    if (box.pseudo || style.display !== 'inline' || (box.children ?? []).some(c => !c.anonymous) || (box.inline ?? []).length) return;
    const found = [...droppedPairs(style, 'inline-text')];
    if (style.$sources?.['text-align'] && !['start', 'initial', 'unset', 'inherit', 'revert', 'revert-layer'].includes(String(style.$sources['text-align'].specified ?? style['text-align']))) found.unshift(['text-align', style['text-align']]);
    if (!found.length || layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes(found[0][0]))) return;
    layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: found.map(([key]) => key), css: found.filter(([key]) => style.$sources?.[key]).map(([key]) => ({ property: key, file: style.$sources[key].file, line: style.$sources[key].line, selector: style.$sources[key].selector })),
      message: `${box.label}: ${found.map(([key, value]) => `${key}: ${value}`).join(', ')} ${found.length === 1 ? 'has' : 'have'} no effect on a display: inline element (they align and indent the lines of a block). Put ${found.length === 1 ? 'it' : 'them'} on the paragraph, or make ${box.label} display: block` });
  }
  // F58: text-decoration: none removes only the element's own line. Where it overrides nothing (not a link's UA underline,
  // not another rule on the element) and an ancestor draws a line, it does nothing: the ancestor's line is drawn across
  // its descendants (measured in Chromium, Firefox and WebKit, inline, inline-block and block children alike).
  function decorationNone(box, style, ancestors) {
    if (box.pseudo || !style.$sources?.['text-decoration-line'] || String(style['text-decoration-line']) !== 'none') return;
    if ((box.tag === 'a' && box.focusable !== false) || (style.$overridden?.['text-decoration-line'] ?? []).length) return;
    const from = [...(ancestors ?? [])].reverse().find(a => a.style && a.box && !['none', 'ua', undefined].includes(String(a.style['text-decoration-line'])));
    if (!from || layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes('text-decoration-line'))) return;
    const src = style.$sources['text-decoration-line'];
    layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: ['text-decoration-line'], css: [{ property: 'text-decoration', file: src.file, line: src.line, selector: src.selector }],
      message: `${box.label}: text-decoration: none does nothing here — it removes only the element's own line, and it has none; the ${from.style['text-decoration-line']} comes from ${from.box.label} and is drawn across its descendants. Remove the line on ${from.box.label} (and put it on the parts that need it), or make ${box.label} display: inline-block` });
  }
  function inlineOverflow(box, style) {
    const box2 = droppedPairs(style, 'inline-container');
    if (box2?.length && !box.pseudo && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes(box2[0][0])))
      layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: box2.map(([key]) => key), css: box2.filter(([key]) => style.$sources?.[key]).map(([key]) => ({ property: key, file: style.$sources[key].file, line: style.$sources[key].line, selector: style.$sources[key].selector })),
        message: `${box.label}: ${box2.map(([key]) => key).join(', ')} ${box2.length === 1 ? 'has' : 'have'} no effect on a display: inline element (they lay out the children of a flex or grid container). Set display: flex (or inline-flex, grid) on it` });
    const found = droppedPairs(style, 'inline-overflow');
    if (!found?.length || box.pseudo || layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes(found[0][0]))) return;
    const shown = [...new Map(found.map(([key, value]) => [key.startsWith('overflow') ? 'overflow' : key, value])).entries()];
    layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: found.map(([key]) => key), css: found.filter(([key]) => style.$sources?.[key]).map(([key]) => ({ property: key, file: style.$sources[key].file, line: style.$sources[key].line, selector: style.$sources[key].selector })),
      message: `${box.label}: ${shown.map(([key, value]) => `${key}: ${value}`).join(', ')} ${shown.length === 1 ? 'has' : 'have'} no effect on a display: inline element (it neither clips nor scrolls, and has no line box of its own to cut with an ellipsis). Make it display: inline-block or block (with a width) for that` });
  }
  function inlineStateTransforms(box, style) {
        // F36: a :hover / :focus / :active transform on a non-replaced inline box (a link or span in text) does nothing,
        // as a static one does (CSS Transforms 1 §1; measured in Chromium, Firefox and WebKit): the hover lift never shows.
    if (!box.pseudo && style.display === 'inline' && !['img', 'video', 'canvas', 'iframe', 'svg', 'input', 'button', 'select', 'textarea'].includes(box.tag)) for (const rule of rules) {
          const moves = (rule.declarations ?? []).filter(d => ['transform', 'translate', 'rotate', 'scale'].includes(d.property) && !['none', 'initial', 'unset', 'revert', 'revert-layer', 'inherit'].includes(String(d.value)));
          if (!moves.length || (rule.declarations ?? []).some(d => d.property === 'display')) continue;
          for (const sel of rule.selectors ?? []) {
            if (!['hover', 'focus', 'focus-visible', 'focus-within', 'active'].includes(sel.state) || sel.pseudoElement || !matches(sel, box, new Set([sel.state])) || layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.state === sel.state)) continue;
            const keys = [...new Set(moves.map(d => d.property))];
            layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: keys, state: sel.state, selector: sel.source, css: moves.map(d => ({ property: d.property, file: d.file ?? rule.file, line: d.line ?? rule.line, selector: sel.source })),
              message: `${sel.source}: ${keys.join(', ')} ${keys.length === 1 ? 'has' : 'have'} no effect on ${box.label}, a display: inline box (transforms apply only to block-level and inline-block boxes), so the :${sel.state} effect never shows. Add display: inline-block to ${box.label}` });
          }
        }
  }
  function pseudoWithoutContent(pbox, pstyle) {
    // F32: content on a ::before / ::after of an element that renders none (css.mjs sets its content to none).
    if (pstyle.$pseudoNotRendered !== undefined) {
      if (!layoutWarnings.some(w => w.code === 'W_CSS_PSEUDO_NOT_RENDERED' && w.path === pbox.path)) {
        const src = pstyle.$sources?.content;
        layoutWarnings.push({ code: 'W_CSS_PSEUDO_NOT_RENDERED', severity: 'warning', box: pbox.label, path: pbox.path, css: src ? [{ property: 'content', file: src.file, line: src.line, selector: src.selector }] : [],
          message: `${pbox.label} is never shown: <${pbox.tag}${pbox.tag === 'input' ? ` type=${pbox.inputType}` : ''}> has no ::${pbox.pseudo} box (an image, a text field or another replaced element renders no pseudo-elements). Put the ::${pbox.pseudo} on a wrapper or a label, or use a background image` });
      }
      return;
    }
    if (contentRules.some(sels => sels.some(sel => sel.pseudoElement === pbox.pseudo && matches(sel, pbox, new Set([`::${pbox.pseudo}`]))))) return;
    if ((pstyle.content ?? 'none') !== 'none' || pstyle.display === 'none' || !Object.keys(pstyle.$sources ?? {}).some(key => key !== 'content') || layoutWarnings.some(w => w.code === 'W_CSS_PSEUDO_NO_CONTENT' && w.path === pbox.path)) return;
    const src = Object.values(pstyle.$sources).find(Boolean);
    layoutWarnings.push({ code: 'W_CSS_PSEUDO_NO_CONTENT', severity: 'warning', box: pbox.label, path: pbox.path, css: src ? [{ property: 'content', file: src.file, line: src.line, selector: src.selector }] : [],
      message: `${pbox.label} is styled (${Object.keys(pstyle.$sources).filter(key => key !== 'content').slice(0, 3).join(', ')}) but has no content, so the browser never generates it. Add content: "" (or the text it should show)` });
  }
  // F108: a table column (col, colgroup) is not an ancestor of the cells and has no box of its own to pad or size: only
  // width, background, visibility and (with border-collapse: collapse) border act on it (CSS 2.2 §17.3; measured in
  // Chromium, Firefox and WebKit). min-width is left out: Chromium and Firefox apply it, WebKit does not.
  // F112: the higher-specificity declaration that its cascade layer makes lose (see css.mjs). Reported once per pair of
  // declarations, on the first box where it happens.
  function layerShadowed(box, style) {
    for (const s of style.$layerShadowed ?? []) {
      const at = o => `${o.file}:${o.line}`;
      if (box.pseudo || layoutWarnings.some(w => w.code === 'W_CSS_LAYER_OVERRIDDEN' && w.loserAt === at(s.loser) && w.winnerAt === at(s.winner) && w.property === s.property)) continue;
      const where = o => o.layer ? `@layer ${o.layer}` : 'no layer';
      layoutWarnings.push({ code: 'W_CSS_LAYER_OVERRIDDEN', severity: 'warning', box: box.label, path: box.path, property: s.property, selector: s.loser.selector, winner: s.winner.selector, loserAt: at(s.loser), winnerAt: at(s.winner),
        css: [{ property: s.property, file: s.loser.file, line: s.loser.line, selector: s.loser.selector }, { property: s.property, file: s.winner.file, line: s.winner.line, selector: s.winner.selector }],
        message: `${box.label}: ${s.loser.selector} { ${s.property}: ${s.value} } (${where(s.loser)}) has the higher specificity but loses to ${s.winner.selector} { ${s.property}: ${s.winnerValue} } (${where(s.winner)}): a ${s.winner.layer ? 'later' : 'unlayered'} rule wins over an earlier layer whatever the specificity. Move the rule into the same layer, or reorder the layers` });
    }
  }
  function columnInert(box, style) {
    if (box.pseudo || !['col', 'colgroup'].includes(box.tag) || layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path)) return;
    const idle = ['0', '0px', 'auto', 'none', 'visible', 'baseline', 'start', 'initial', 'unset', 'inherit', 'revert', 'revert-layer', 'ua'];
    const own = key => style.$sources?.[key] && !idle.includes(String(style.$sources[key].specified ?? style[key]).trim());
    const keys = [...['top', 'right', 'bottom', 'left'].flatMap(side => [`padding-${side}`, `margin-${side}`]), 'block-size', 'color', 'font-size', 'text-align', 'vertical-align', 'overflow-x', 'overflow-y', 'max-inline-size',
      ...(String(style['border-collapse']) === 'collapse' ? [] : ['border-top', 'border-right', 'border-bottom', 'border-left'])].filter(own);
    if (!keys.length) return;
    layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: keys, css: keys.map(key => ({ property: key, file: style.$sources[key].file, line: style.$sources[key].line, selector: style.$sources[key].selector })),
      message: `${box.label}: ${keys.join(', ')} ${keys.length === 1 ? 'has' : 'have'} no effect on a table ${box.tag === 'col' ? 'column' : 'column group'}: a column is not an ancestor of its cells (nothing is inherited from it) and has no box to pad or size; only width, background, visibility${String(style['border-collapse']) === 'collapse' ? ' and border' : ' and, with border-collapse: collapse, border'} act on it. Style the cells instead (td:nth-child(…))` });
  }
  // F117: transform-style: preserve-3d does nothing on an inline box (not transformable), and a grouping property on the
  // same element (overflow other than visible, opacity below 1, filter, isolation: isolate, mix-blend-mode, clip-path,
  // mask) flattens it: the children's 3D positions are painted into its plane (CSS Transforms 2 §6.2.1; measured in
  // Chromium, Firefox and WebKit, overflow: clip included). contain: paint flattens it in Firefox only; not judged.
  function preserve3dInert(box, style, parentStyle) {
    // As in inlineAutoMargin: block flow is laid out as a one-column grid, so an inline child reads as blockified; a
    // real flex or grid parent does blockify it (and makes it transformable).
    const inline = String(style.$inlineDisplay ?? style.display) === 'inline' && !(parentStyle && ['flex', 'inline-flex', 'grid', 'inline-grid'].includes(String(parentStyle.display)) && !parentStyle.$blockFlow);
    const source = style.$sources?.['transform-style'];
    if (box.pseudo || !source || style['transform-style'] !== 'preserve-3d' || layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes('transform-style'))) return;
    const by = inline ? null : [
      ...['overflow-x', 'overflow-y'].filter(key => !['visible', undefined].includes(style[key])).slice(0, 1).map(key => `overflow: ${style[key]}`),
      ...(style.opacity !== undefined && Number(style.opacity) < 1 ? [`opacity: ${style.opacity}`] : []),
      ...['filter', 'clip-path', 'mask', 'mask-image'].filter(key => style[key] !== undefined && !['none', 'initial'].includes(String(style[key]))).map(key => `${key}: ${style[key]}`),
      ...(style.isolation === 'isolate' ? ['isolation: isolate'] : []),
      ...(style['mix-blend-mode'] !== undefined && style['mix-blend-mode'] !== 'normal' ? [`mix-blend-mode: ${style['mix-blend-mode']}`] : []),
    ];
    if (by && !by.length) return;
    layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: ['transform-style'], css: [{ property: 'transform-style', file: source.file, line: source.line, selector: source.selector }],
      message: by ? `${box.label}: transform-style: preserve-3d is flattened by ${by.join(', ')} on the same element: its children's 3D transforms are painted into its plane, as with flat. Move ${by.length === 1 ? 'that property' : 'those properties'} to a wrapper or to the children`
        : `${box.label}: transform-style: preserve-3d has no effect on a display: inline box (it is not transformable). Make it inline-block or block` });
  }
  // F118: an absolutely positioned (or fixed) box is not a flex item: flex-grow, flex-shrink, flex-basis (and flex) and
  // order do not size or move it, in a flex, grid or block parent alike (measured in Chromium, Firefox and WebKit:
  // align-self does move it in flex and grid, and grid placement in a grid, so those are not reported).
  function outOfFlowFlexInert(box, style) {
    if (box.pseudo || !['absolute', 'fixed'].includes(String(style.position)) && !style.$fixed) return;
    const idle = { 'flex-grow': ['0'], 'flex-shrink': ['1'], 'flex-basis': ['auto'], order: ['0'] };
    const found = Object.keys(idle).filter(key => style.$sources?.[key] && !idle[key].includes(String(style[key])) && !['initial', 'unset', 'inherit', 'revert', 'revert-layer'].includes(String(style[key])));
    if (!found.length || layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes(found[0]))) return;
    const position = style.$fixed ? 'fixed' : style.position;
    layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: found, css: found.map(key => ({ property: key, file: style.$sources[key].file, line: style.$sources[key].line, selector: style.$sources[key].selector })),
      message: `${box.label}: ${found.map(key => `${key}: ${style[key]}`).join(', ')} ${found.length === 1 ? 'has' : 'have'} no effect: it is position: ${position}, so it is not a flex item and is placed by its insets (top / left / right / bottom), width and height. Size it with width, or take position: ${position} off to make it an item` });
  }
  // F119: text-wrap: balance / pretty / stable after white-space: nowrap / pre on the same element turns wrapping back on:
  // the shorthand also sets text-wrap-mode: wrap (measured in Chromium, Firefox and WebKit). The author meant the style
  // of wrapping, not the mode (text-wrap: wrap or text-wrap-mode: wrap mean it and are not reported). Firefox (measured
  // with 157) does not take text-wrap: pretty and drops it, so there the text stays on one line.
  function wrapRestored(box, style) {
    const w = style.$wrapRestored, by = String(w?.by.wrapShorthand ?? '').toLowerCase();
    if (box.pseudo || !['balance', 'pretty', 'stable'].includes(by) || layoutWarnings.some(x => x.code === 'W_CSS_WRAP_RESTORED' && x.path === box.path)) return;
    const pretty = by === 'pretty';
    layoutWarnings.push({ code: 'W_CSS_WRAP_RESTORED', severity: 'warning', box: box.label, path: box.path, ...(pretty ? { browsers: { wraps: ['chromium', 'webkit'], oneLine: ['firefox'] } } : {}),
      css: [{ property: 'white-space', file: w.from.file, line: w.from.line, selector: w.from.selector }, { property: 'text-wrap', file: w.by.file, line: w.by.line, selector: w.by.selector }],
      message: `${box.label}: text-wrap: ${by} (${w.by.selector}) also sets text-wrap-mode: wrap, so it undoes white-space: ${w.whiteSpace} (${w.from.selector}) and the text wraps again.${pretty ? ' Firefox does not take text-wrap: pretty and drops it, so there the text stays on one line: the page differs by browser.' : ''} Write text-wrap-style: ${by} to change only how wrapping text breaks, or drop it to keep one line` });
  }
  // F120: a <br> is a forced line break, not a box. margin-top / -bottom on it change the line spacing in Firefox only,
  // line-height in Safari only; padding, width, height, the inline margins and display: block do nothing anywhere
  // (measured in Chromium, Firefox and WebKit). display: none removes the break everywhere, so it is not reported.
  function brStyled(box, style) {
    if (box.tag !== 'br' || box.pseudo || layoutWarnings.some(w => w.code === 'W_CSS_BR_STYLED' && w.path === box.path)) return;
    const own = key => { const src = style.$sources?.[key]; return src && !['initial', 'unset', 'inherit', 'revert', 'revert-layer'].includes(String(src.specified ?? '').trim().toLowerCase()) ? src : null; };
    const zero = key => ['0', '0px', 'auto', 'normal', 'none'].includes(String(style[key]));
    const firefox = ['margin-top', 'margin-bottom'].filter(key => own(key) && !zero(key));
    const webkit = own('line-height') ? ['line-height'] : [];
    const nowhere = ['padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'inline-size', 'block-size', 'margin-left', 'margin-right'].filter(key => own(key) && !zero(key));
    const display = own('display') && style.display !== 'none' && style.display !== 'inline' ? ['display'] : [];
    const found = [...firefox, ...webkit, ...nowhere, ...display];
    if (!found.length) return;
    const name = key => ({ 'inline-size': 'width', 'block-size': 'height' })[key] ?? key, shown = keys => keys.map(key => `${name(key)}: ${style.$sources[key].specified ?? style[key]}`).join(', ');
    const parts = [firefox.length ? `${shown(firefox)} ${firefox.length === 1 ? 'changes' : 'change'} the line spacing in Firefox only` : null, webkit.length ? `${shown(webkit)} changes ${firefox.length ? 'it' : 'the line spacing'} in Safari only` : null,
      nowhere.length + display.length ? `${shown([...nowhere, ...display])} ${nowhere.length + display.length === 1 ? 'does' : 'do'} nothing in any browser` : null].filter(Boolean);
    layoutWarnings.push({ code: 'W_CSS_BR_STYLED', severity: 'warning', box: box.label, path: box.path, properties: found.map(name),
      ...(firefox.length || webkit.length ? { browsers: { ...(firefox.length ? { firefox: firefox.map(name) } : {}), ...(webkit.length ? { webkit: webkit.map(name) } : {}) } } : {}),
      css: found.map(key => ({ property: name(key), file: style.$sources[key].file, line: style.$sources[key].line, selector: style.$sources[key].selector })),
      message: `${box.label}: a <br> is a line break, not a box: ${parts.join('; ')}. Space the lines with margin or padding on the elements around it (or split the text into blocks)` });
  }
  // F121: in a drop-down (a select without multiple or size > 1) the options' font-size, padding, margin, width, height
  // and line-height do not change the control's size (measured in Chromium, Firefox and WebKit); the open menu is drawn
  // by the browser, which takes few of them, differently in each. Size the select itself. appearance: base-select (customizable
  // select, Chromium) does style them; it is skipped, as is a list box.
  function optionInert(box, style, ancestors) {
    if (!['option', 'optgroup'].includes(box.tag) || box.pseudo || layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.select)) return;
    const select = (ancestors ?? []).findLast(a => a.box?.tag === 'select');
    if (!select) return;
    const attrs = select.box.attributes ?? {}, size = Number(attrs.size ?? 1);
    if (Object.hasOwn(attrs, 'multiple') || size > 1 || /base-select/.test(String(select.style?.appearance ?? ''))) return;
    const keys = ['font-size', 'line-height', 'inline-size', 'block-size', 'min-inline-size', 'min-block-size', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left'];
    const idle = ['0', '0px', 'auto', 'normal', 'none'];
    const found = keys.filter(key => { const src = style.$sources?.[key], parent = select.style?.$sources?.[key]; return src && !(parent && parent.file === src.file && parent.line === src.line && parent.selector === src.selector) && !idle.includes(String(style[key])) && !['initial', 'unset', 'inherit', 'revert', 'revert-layer'].includes(String(src.specified ?? '').trim().toLowerCase()); });
    if (!found.length) return;
    const name = key => ({ 'inline-size': 'width', 'block-size': 'height', 'min-inline-size': 'min-width', 'min-block-size': 'min-height' })[key] ?? key;
    layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, select: select.box.label, properties: found.map(name), css: found.map(key => ({ property: name(key), file: style.$sources[key].file, line: style.$sources[key].line, selector: style.$sources[key].selector })),
      message: `${box.label}: ${found.map(key => `${name(key)}: ${style.$sources[key].specified ?? style[key]}`).join(', ')} ${found.length === 1 ? 'does' : 'do'} not change the size of ${select.box.label}: it is a drop-down, and its open menu is drawn by the browser, which takes few of these (differently in each browser). Size and pad the select itself` });
  }
  // F124: text-indent on a <select> indents the shown option twice in Firefox, once in Chromium and Safari (measured:
  // 10px gives 22 / 16 / 17, appearance: none too; the control's size does not change); an <input> agrees. Judged on
  // the select's own computed value (an ancestor's text-indent keeps that ancestor's layout Unknown before it).
  function selectIndent(box, style, ancestors) {
    if (box.tag !== 'select' || box.pseudo || layoutWarnings.some(w => w.code === 'W_LAYOUT_SELECT_INDENT' && w.path === box.path)) return;
    const value = String(style.$selectIndent ?? '0');
    if (/^-?(?:0|0px|0%|0em|0rem)$/.test(value) || !/\d/.test(value)) return;
    const own = style.$sources?.['text-indent'], from = own ? null : (ancestors ?? []).findLast(a => a.style?.$sources?.['text-indent']);
    const src = own ?? from?.style.$sources['text-indent'];
    layoutWarnings.push({ code: 'W_LAYOUT_SELECT_INDENT', severity: 'warning', box: box.label, path: box.path, browsers: { once: ['chromium', 'webkit'], twice: ['firefox'] },
      ...(src ? { css: [{ property: 'text-indent', file: src.file, line: src.line, selector: src.selector }] } : {}),
      message: `${box.label}: text-indent: ${value}${from ? ` (inherited from ${from.box.label})` : ''} indents the selected option twice in Firefox and once in Chrome and Safari, so the text sits in a different place. Use padding-inline-start on the select${from ? `, and text-indent: 0 on it` : ' instead'}` });
  }
  // F126: overflow-x: hidden with overflow-y: visible (or the other way round) does not keep that axis visible: it
  // computes to auto, so the box scrolls or clips on both axes (measured in Chromium, Firefox and WebKit). overflow: clip
  // on the axis to cut keeps the other visible. clip beside hidden / auto / scroll computes to hidden in Firefox (157) and
  // WebKit (27.2) but stays clip in Chromium (156; getComputedStyle, every pair): reported with the browsers, and the
  // layout is Unknown.
  function overflowPromoted(box, style) {
    for (const p of style.$overflowPromoted ?? []) {
      if (layoutWarnings.some(w => w.code === 'W_CSS_OVERFLOW_PROMOTED' && w.path === box.path && w.property === p.property)) continue;
      const axis = p.property.slice(-1), otherAxis = axis === 'x' ? 'y' : 'x';
      const css = [{ property: p.property, file: p.source.file, line: p.source.line, selector: p.source.selector }];
      if (p.written === 'clip') {
        layoutWarnings.push({ code: 'W_CSS_OVERFLOW_PROMOTED', severity: 'warning', box: box.label, path: box.path, property: p.property, css, browsers: { hidden: ['firefox', 'webkit'], clip: ['chromium'] },
          message: `${box.label}: overflow-${axis}: clip beside overflow-${otherAxis}: ${p.other} computes to hidden in Firefox and Safari (the box becomes scrollable on the ${axis} axis too) but stays clip in Chrome, so the page differs by browser. Write the same value on both axes (overflow: ${p.other}), or overflow-${otherAxis}: clip to cut only that axis` });
        // Whether the box scrolls on that axis differs by browser: its layout is not decided (the style keeps hidden).
        if (!diagnostics.some(d => d.code === 'U_LAYOUT_BROWSER' && d.path === box.path))
          unknown('U_LAYOUT_BROWSER', `${box.label}: ${p.property}: clip beside a scrolling overflow (${p.other}) computes to hidden in Firefox and Safari but stays clip in Chrome, so whether it scrolls on that axis differs by browser`, p.source.line, box, p.source.file);
        continue;
      }
      layoutWarnings.push({ code: 'W_CSS_OVERFLOW_PROMOTED', severity: 'warning', box: box.label, path: box.path, property: p.property, css,
        message: `${box.label}: overflow-${axis}: ${p.written} computes to auto because overflow-${otherAxis} is ${p.other}: a box cannot scroll or clip on one axis and stay ${p.written} on the other, so it scrolls (or clips) its overflow on the ${axis} axis too. To cut only the ${otherAxis} axis, write overflow-${otherAxis}: clip` });
    }
  }
  // F133: a container query length unit (cqw, cqi, cqh, cqb) with no query container for its axis among the ancestors
  // is the small-viewport unit (svw, svi, svh, svb): width: 50cqw with no container is 50svw, and cqh inside a
  // container-type: inline-size container is svh (only size containers give the block axis). Measured in Chromium,
  // Firefox and WebKit: the same boxes as with the sv unit, the element's own container-type not counting, a container
  // name alone not making a container; and a container (inline-size, the shorthand, a grandparent) changes the box.
  // A container-type set by any rule that may match the ancestor (another state or media query) counts as there, and a
  // rule that sets one with a selector the analysis cannot match (.card:hover .body) leaves it undecided: not reported.
  // Horizontal writing modes only (cqw is the inline axis there).
  const containerUnit = /(?<![\w.-])(?:\d+\.?\d*|\.\d+)(cqw|cqi|cqh|cqb)(?![\w-])/gi;
  const containerTypes = { inline: ['inline-size', 'size'], block: ['size'] };
  function containerUnitViewport(box, style, ancestors) {
    if (layoutWarnings.some(w => w.code === 'W_CSS_CONTAINER_UNIT_VIEWPORT' && w.path === box.path)) return;
    const found = new Map();
    for (const [key, src] of Object.entries(style.$sources ?? {})) {
      const text = String(src?.specified ?? '').replace(/url\([^)]*\)|"[^"]*"|'[^']*'/g, '');
      for (const m of text.matchAll(containerUnit)) { const unit = m[1].toLowerCase(); if (!found.has(unit)) found.set(unit, { key, src }); }
    }
    // Declarations the style stage could not read (a shorthand expanded to px lengths, padding: 2cqi): the rules that
    // match the box with no state or condition.
    for (const rule of rules) if (rule.unmodeled && !rule.contexts?.length && rule.selectors?.some(sel => !sel.state && !sel.pseudoElement && matches(sel, box)))
      for (const d of rule.unmodeled) for (const m of d.specified.replace(/url\([^)]*\)|"[^"]*"|'[^']*'/g, '').matchAll(containerUnit)) {
        const unit = m[1].toLowerCase(); if (!found.has(unit)) found.set(unit, { key: d.property, src: d });
      }
    if (!found.size || unreadContainers.length) return;
    if ([style, ...ancestors.map(a => a.style)].some(s => s && s['writing-mode'] && s['writing-mode'] !== 'horizontal-tb')) return;
    const may = (a, axis) => containerTypes[axis].includes(String(a.style?.['container-type'] ?? '').toLowerCase())
      || rules.some(rule => rule.declarations?.some(d => d.property === 'container-type' && containerTypes[axis].includes(String(d.value).trim().toLowerCase()))
        && rule.selectors?.some(sel => !sel.pseudoElement && matches(sel, a.box, new Set(sel.state ? [sel.state] : []))));
    const axisOf = unit => ['cqw', 'cqi'].includes(unit) ? 'inline' : 'block';
    const missing = [...found].filter(([unit]) => !ancestors.some(a => may(a, axisOf(unit))));
    if (!missing.length) return;
    const fallback = { cqw: 'svw', cqi: 'svi', cqh: 'svh', cqb: 'svb' }, inlineOnly = ancestors.some(a => may(a, 'inline'));
    const said = missing.map(([unit, { key, src }]) => `${key}: ${src.specified} (${unit} is ${fallback[unit]})`).join(', ');
    const why = missing.some(([unit]) => axisOf(unit) === 'block') && inlineOnly
      ? 'its container has container-type: inline-size, which gives the inline axis only (cqh and cqb need container-type: size)'
      : 'no ancestor has container-type: inline-size or size (a container-name alone, or the element\'s own container-type, does not count)';
    layoutWarnings.push({ code: 'W_CSS_CONTAINER_UNIT_VIEWPORT', severity: 'warning', box: box.label, path: box.path, units: missing.map(([unit]) => unit),
      css: missing.map(([, { key, src }]) => ({ property: key, file: src.file, line: src.line, selector: src.selector })),
      message: `${box.label}: ${said}: ${why}, so the unit measures the small viewport, not a container. Give the ancestor it should measure container-type: ${missing.some(([unit]) => axisOf(unit) === 'block') ? 'size (and a height)' : 'inline-size'}, or write the ${fallback[missing[0][0]]} unit if the viewport is meant` });
  }
  // F129: a <dialog> is centred by the UA's margin: auto (with inset 0 for a modal); a reset such as * { margin: 0 }
  // that reaches it puts it at the top-left corner (measured in Chromium, Firefox and WebKit, open and showModal()).
  // Reported when an author rule sets a horizontal or vertical margin other than auto on a dialog and none sets it back.
  function dialogMarginReset(box, style) {
    if (box.tag !== 'dialog' || box.pseudo || layoutWarnings.some(w => w.code === 'W_CSS_DIALOG_NOT_CENTRED' && w.path === box.path)) return;
    // A rule that names the dialog (its tag, class or id) places it on purpose; only a reset that reaches it is reported.
    const aimed = sel => /dialog/i.test(sel) || (box.classes ?? []).some(c => sel.includes(`.${c}`)) || (box.id && sel.includes(`#${box.id}`));
    const keys = ['margin-left', 'margin-right', 'margin-top', 'margin-bottom'].filter(key => style.$sources?.[key] && !aimed(String(style.$sources[key].selector ?? '')) && !/\bauto\b/i.test(String(style.$sources[key].specified ?? '')));
    if (!keys.length) return;
    const src = style.$sources[keys[0]];
    layoutWarnings.push({ code: 'W_CSS_DIALOG_NOT_CENTRED', severity: 'warning', box: box.label, path: box.path, properties: keys, css: [{ property: 'margin', file: src.file, line: src.line, selector: src.selector }],
      message: `${box.label}: ${src.selector} sets ${keys.map(key => `${key}: ${style.$sources[key].specified}`).join(', ')} on this <dialog>, which takes away the margin: auto the browser centres it with: it opens at the top-left corner. Add dialog { margin: auto } after the reset` });
  }
  // F131: a :hover / :focus / :active rule that a later (or more specific) rule without the state always beats shows
  // nothing: a:hover { color } before a:link { color } leaves a hovered link blue (measured in Chromium, Firefox and
  // WebKit; the LVHA order). Judged per box and declaration: with the state on, the winning declaration comes from a
  // rule that does not need the state and sets another value.
  function stateShadowed(box, style, ancestors, inherited, r) {
    if (box.pseudo || r === undefined) return;
    for (const st of ['hover', 'focus', 'focus-visible', 'active']) {
      const own = rules.flatMap(rule => rule.selectors.filter(sel => sel.state === st && !sel.pseudoElement && matches(sel, box, new Set([st]))).map(sel => ({ rule, sel })));
      if (!own.length) continue;
      let on; try { [on] = styles(box, r, ancestors, inherited, false, false, new Set([st])); } catch { continue; }
      if (!on) continue;
      for (const { rule, sel } of own) for (const d of rule.declarations) {
        const winner = on.style.$sources?.[d.property];
        if (!winner || (winner.file === d.file && winner.line === d.line && winner.selector === sel.source) || new RegExp(`:${st}(?![\\w-])`, 'i').test(String(winner.selector))) continue;
        if (String(winner.specified ?? '').trim().toLowerCase() === String(d.value ?? '').trim().toLowerCase()) continue;
        if (layoutWarnings.some(w => w.code === 'W_CSS_STATE_SHADOWED' && w.path === box.path && w.selector === sel.source && w.property === d.property)) continue;
        layoutWarnings.push({ code: 'W_CSS_STATE_SHADOWED', severity: 'warning', box: box.label, path: box.path, selector: sel.source, property: d.property, state: `:${st}`,
          css: [{ property: d.property, file: d.file, line: d.line, selector: sel.source }, { property: d.property, file: winner.file, line: winner.line, selector: winner.selector }],
          message: `${box.label}: ${sel.source} { ${d.property}: ${d.value} } never shows: ${winner.selector} { ${d.property}: ${winner.specified} } also applies while it is :${st} and wins (it comes later or is more specific). Put the :${st} rule after it (for links: :link, :visited, :hover, :active), or make it more specific` });
      }
    }
  }
  function cssMistakes(box, style, ancestors, inherited, gridItem, r, state) {
    firstPseudoInert(box, style);
    stateShadowed(box, style, ancestors, inherited, r);
    dialogMarginReset(box, style);
    overflowPromoted(box, style);
    containerUnitViewport(box, style, ancestors);
    selectIndent(box, style, ancestors);
    optionInert(box, style, ancestors);
    brStyled(box, style);
    wrapRestored(box, style);
    outOfFlowFlexInert(box, style);
    preserve3dInert(box, style, ancestors?.at(-1)?.style);
    layerShadowed(box, style);
    columnInert(box, style);
    inlineAutoMargin(box, style, ancestors?.at(-1)?.style);
    if (droppedValue(style, 'float-absolute') && !box.pseudo && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes('float')))
      layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: ['float'], ...(style.$sources?.float ? { css: [{ property: 'float', file: style.$sources.float.file, line: style.$sources.float.line, selector: style.$sources.float.selector }] } : {}),
        message: `${box.label}: float: ${droppedValue(style, 'float-absolute')} has no effect on an absolutely positioned box (its float computes to none). Place it with left / right instead` });
    // F106: word-break / line-break (dropped in css.mjs), hyphens and text-wrap-style where white-space keeps one line.
    {
      const found = [...droppedPairs(style, 'one-line')];
      const parentSources = ancestors?.at(-1)?.style?.$sources ?? {}, inheritedFrom = key => { const a = style.$sources?.[key], b = parentSources[key]; return a && b && a.file === b.file && a.line === b.line && a.selector === b.selector; };
      const oneLine = ['nowrap', 'pre'].includes(String(style['white-space'])) && String(style['text-wrap-mode'] ?? 'white-space') !== 'wrap' && !(box.children ?? []).some(c => !c.anonymous) && !(box.inline ?? []).length;
      if (oneLine) for (const [key, idle] of [['hyphens', 'manual'], ['text-wrap-style', 'auto']]) if (style.$sources?.[key] && !inheritedFrom(key) && ![idle, 'initial', 'unset', 'inherit', 'revert', 'revert-layer'].includes(String(style[key]))) found.push([key, style[key]]);
      if (found.length && !box.pseudo && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes(found[0][0])))
        layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: found.map(([key]) => key), css: found.filter(([key]) => style.$sources?.[key]).map(([key]) => ({ property: key, file: style.$sources[key].file, line: style.$sources[key].line, selector: style.$sources[key].selector })),
          message: `${box.label}: ${found.map(([key, value]) => `${key}: ${value}`).join(', ')} ${found.length === 1 ? 'has' : 'have'} no effect with white-space: ${style['white-space']} (the text never wraps, so there are no line breaks to change). Use white-space: normal (or pre-wrap) if the text should wrap` });
    }
    if (droppedValue(style, 'tab-collapsed') !== undefined && !box.pseudo && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes('tab-size')))
      layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: ['tab-size'], ...(style.$sources?.['tab-size'] ? { css: [{ property: 'tab-size', file: style.$sources['tab-size'].file, line: style.$sources['tab-size'].line, selector: style.$sources['tab-size'].selector }] } : {}),
        message: `${box.label}: tab-size: ${droppedValue(style, 'tab-collapsed')} has no effect with white-space: ${style['white-space']} (a tab collapses into a space). Use white-space: pre or pre-wrap to keep tabs` });
    // F75: a select of appearance auto is drawn by the browser at its own height: line-height changes neither its size nor
    // its pixels (measured in Chromium, Firefox and WebKit; with appearance: none it does).
    if (!box.pseudo && box.tag === 'select' && style.appearance === 'auto' && style.$sources?.['line-height'] && !['normal', 'initial', 'inherit', 'unset'].includes(String(style.$sources['line-height'].specified ?? style['line-height'])) && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes('line-height')))
      layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: ['line-height'], css: [{ property: 'line-height', file: style.$sources['line-height'].file, line: style.$sources['line-height'].line, selector: style.$sources['line-height'].selector }],
        message: `${box.label}: line-height has no effect on a select drawn by the browser (appearance: auto keeps its own height). Use height or padding, or appearance: none to draw it yourself` });
    // F74: a relative box with both insets on an axis uses one: left (right in rtl) and top; the other does nothing
    // (CSS 2.2 §9.4.3; measured in Chromium, Firefox and WebKit).
    if (!box.pseudo && style.position === 'relative' && !style.$sticky) {
      const set = key => style.$sources?.[key] && !['auto', undefined].includes(String(style[key]));
      const ignored = [...(set('left') && set('right') ? [style.direction === 'rtl' ? 'left' : 'right'] : []), ...(set('top') && set('bottom') ? ['bottom'] : [])];
      for (const key of ignored) if (!layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes(key)))
        layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: [key], css: [{ property: key, file: style.$sources[key].file, line: style.$sources[key].line, selector: style.$sources[key].selector }],
          message: `${box.label}: ${key}: ${style[key]} has no effect — a position: relative box with both ${key === 'bottom' ? 'top and bottom' : 'left and right'} moves by ${key === 'bottom' ? 'top' : key === 'right' ? 'left' : 'right (rtl)'} only. Remove one, or use position: absolute to stretch between them` });
    }
    // F72: a positioned box with a negative z-index is painted below its stacking context's in-flow boxes. With no
    // stacking context in its parent, every ancestor up to the nearest one paints over it (a background hides it) and is hit first,
    // so it cannot be clicked (measured in Chromium, Firefox and WebKit). Not where an ancestor might make one.
    if (!box.pseudo && ['relative', 'absolute', 'sticky'].includes(String(style.position)) && /^-\d+$/.test(String(style['z-index'])) && !layoutWarnings.some(w => w.code === 'W_LAYOUT_NEGATIVE_Z_BEHIND' && w.path === box.path)) {
      const chain = (ancestors ?? []).filter(a => a.box && a.style);
      const stacks = (a, i) => {
        const st = a.style, parent = chain[i - 1]?.style;
        if (a.box.tag === 'html' || st.$stacks || st.$fixed) return true;
        if (st.position !== 'static' && st.position !== undefined && !['auto', undefined].includes(String(st['z-index']))) return true;
        if (parent && ['flex', 'inline-flex', 'grid', 'inline-grid'].includes(String(parent.display)) && !parent.$blockFlow && !['auto', undefined].includes(String(st['z-index']))) return true;
        if (st.opacity !== undefined && Number(st.opacity) < 1) return true;
        if (!['none', undefined].includes(String(st.transform)) || ['translate', 'rotate', 'scale'].some(key => !['none', undefined].includes(String(st[key])))) return true;
        if (String(st.isolation) === 'isolate' || /transform|opacity|filter/.test(String(st['will-change'] ?? ''))) return true;
        // Properties that also make one, not tracked here: treated as making one (not reported).
        return ['filter', 'backdrop-filter', 'mix-blend-mode', 'mask', 'mask-image', 'clip-path', 'contain', 'perspective', 'container-type'].some(key => st.$sources?.[key] && !['none', 'normal', undefined].includes(String(st[key])));
      };
      const above = chain.slice().reverse();
      const nearest = above.find((a, j) => stacks(a, chain.length - 1 - j));
      // A declaration dropped as unsupported may have been one that makes a stacking context: not judged then.
      const dropped = diagnostics.some(d => /Unsupported (?:layout property: )?(?:filter|backdrop-filter|mix-blend-mode|mask|clip-path|contain|perspective|will-change|isolation|opacity|transform|z-index)/.test(String(d.message)));
      // Every ancestor below the nearest stacking context (the parent at least, when it makes none) paints over it.
      const between = nearest ? above.slice(0, above.indexOf(nearest)) : [];
      if (!dropped && nearest && between.length) {
        const covering = between.find(a => !['transparent', 'rgba(0,0,0,0)', 'ua', undefined, 'none'].includes(String(a.style['background-color'])));
        layoutWarnings.push({ code: 'W_LAYOUT_NEGATIVE_Z_BEHIND', severity: 'warning', box: box.label, path: box.path, ...(style.$sources?.['z-index'] ? { css: [{ property: 'z-index', file: style.$sources['z-index'].file, line: style.$sources['z-index'].line, selector: style.$sources['z-index'].selector }] } : {}),
          message: `${box.label}: z-index: ${style['z-index']} puts it behind ${between.map(a => a.box.label).join(', ')} — its parent makes no stacking context, so it is painted below ${between.length === 1 ? 'it' : 'them'}${covering ? ` (${covering.box.label}'s background hides it)` : ''} and a click lands on them, not on it. Give its parent isolation: isolate (or position: relative; z-index: 0)` });
      }
    }
    // F71: a canvas draws its bitmap (width × height attributes, 300×150 by default) into its box with object-fit (fill
    // by default): a box of another shape stretches the drawing (measured in Chromium, Firefox and WebKit).
    if (!box.pseudo && box.tag === 'canvas' && String(style['object-fit'] ?? 'fill') === 'fill' && !layoutWarnings.some(w => w.code === 'W_LAYOUT_IMAGE_DISTORTED' && w.path === box.path)) {
      const bw = box.canvasSize?.width ?? 300, bh = box.canvasSize?.height ?? 150, px1 = v => /^\d+(?:\.\d+)?px$/.test(String(v)) ? Number(String(v).slice(0, -2)) : null;
      const cw = px1(style['inline-size']), ch = px1(style['block-size']);
      if (typeof bw === 'number' && typeof bh === 'number' && bw > 0 && bh > 0 && cw && ch && Math.abs(cw / ch - bw / bh) > 1e-6)
        layoutWarnings.push({ code: 'W_LAYOUT_IMAGE_DISTORTED', severity: 'warning', box: box.label, path: box.path,
          message: `${box.label}: the canvas bitmap is ${bw}×${bh}${box.canvasSize?.width === undefined || !box.canvasSize ? ' (the default)' : ''} but its box is ${cw}×${ch}px, so the drawing is stretched. Set the width and height attributes to the same shape as the CSS size (times devicePixelRatio for sharpness), or object-fit: contain` });
    }
    inlineOverflow(box, style);
    decorationNone(box, style, ancestors);
    // F59: in the collapsing border model the table's border is not rounded by border-radius (measured in Chromium,
    // Firefox and WebKit: same pixels without a background; a background is clipped to the curve, the border is not).
    if (!box.pseudo && (box.tag === 'table' || ['table', 'inline-table'].includes(String(style.display))) && String(style['border-collapse']) === 'collapse'
      && ['top', 'right', 'bottom', 'left'].some(side => !['0', '0px', 'ua', undefined].includes(String(style[`border-${side}`]))) && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes('border-radius'))) {
      const hits = radiusRules.filter(r => r.selectors.some(sel => matches(sel, box, state))), rule = hits.find(r => !r.zero);
      if (rule && !hits.some(r => r.zero))
        layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: ['border-radius'], css: [{ property: 'border-radius', file: rule.file, line: rule.line, selector: rule.selector }],
          message: `${box.label}: border-radius does not round the table's border with border-collapse: collapse (the cells share the border; only a background is clipped). Use border-collapse: separate with border-spacing: 0, or wrap the table in a rounded div with overflow: hidden` });
    }
    if (droppedValue(style, 'clear-item') && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes('clear')))
      layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: ['clear'], ...(style.$sources?.clear ? { css: [{ property: 'clear', file: style.$sources.clear.file, line: style.$sources.clear.line, selector: style.$sources.clear.selector }] } : {}),
        message: `${box.label}: clear: ${droppedValue(style, 'clear-item')} has no effect on a ${String(inherited?.display ?? '').includes('grid') ? 'grid' : 'flex'} item (floats do not apply there, so there is nothing to clear). Remove it, or use the container's wrapping (flex-wrap, grid rows) to start a new line` });
    // F51: body's overflow goes to the viewport only while html's is visible. With overflow on both (overflow-x: hidden on
    // html and body, the usual guard against a horizontal scrollbar), body is a scroll container of its own that does not
    // scroll (it is as tall as its content): a sticky box in it sticks to body and scrolls away with the page (measured
    // in Chromium, Firefox and WebKit; overflow: clip makes no scroll container and keeps it sticking).
    if (!box.pseudo && style.$sticky && !['left', 'right'].some(side => style[side] !== undefined && style[side] !== 'auto')) {
      const html = (ancestors ?? []).find(a => a.box?.tag === 'html'), body = (ancestors ?? []).find(a => a.box?.tag === 'body');
      const scrolls = st => st && !(st['overflow-x'] === 'clip' && st['overflow-y'] === 'visible') && ['overflow-x', 'overflow-y'].some(key => !['visible', 'clip'].includes(String(st[key])));
      const others = (ancestors ?? []).filter(a => a !== html && a !== body && scrolls(a.style));
      const still = st => ['overflow-x', 'overflow-y'].every(key => st[key] === 'hidden') || (st['block-size'] === 'auto' && ['none', undefined].includes(st['max-block-size']) && st['overflow-y'] !== 'scroll');
      if (html && body && !others.length && ['overflow-x', 'overflow-y'].some(key => String(html.style?.[key] ?? 'visible') !== 'visible') && scrolls(body.style) && still(body.style) && !layoutWarnings.some(w => w.code === 'W_LAYOUT_STICKY_SCROLLER' && w.path === box.path))
        layoutWarnings.push({ code: 'W_LAYOUT_STICKY_SCROLLER', severity: 'warning', box: box.label, path: box.path, scroller: body.box.label,
          message: `${box.label} is position: sticky, but html and body both set overflow (html: ${html.style['overflow-x']} / ${html.style['overflow-y']}, body: ${body.style['overflow-x']} / ${body.style['overflow-y']}): body's overflow then does not go to the viewport, body becomes a scroll container as tall as the page, and the sticky box sticks to it and scrolls away. Set the overflow on html only, or use overflow-x: clip` });
    }
    // F44: the cursor shown is that of the element under the pointer; one with pointer-events: none is never hit (and,
    // with no child element that could take pointer-events back, nothing of it is), so its cursor never shows.
    if (!box.pseudo && String(style['pointer-events']) === 'none' && style.$sources?.cursor && !['auto', 'initial', 'unset', 'inherit', 'revert', 'revert-layer'].includes(String(style.cursor)) && !(box.children ?? []).some(c => !c.anonymous) && !(box.inline ?? []).length && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes('cursor')))
      layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: ['cursor'], css: [{ property: 'cursor', file: style.$sources.cursor.file, line: style.$sources.cursor.line, selector: style.$sources.cursor.selector }],
        message: `${box.label}: cursor: ${style.cursor} never shows: the element is pointer-events: none${style.$sources?.['pointer-events'] ? '' : ' (inherited)'}, so the pointer passes through it and shows the cursor of what is beneath. Remove pointer-events: none, or put the cursor on the element that takes the pointer` });
    // F43: min-width / max-width on a cell of a fixed table (table-layout: fixed with a width) do nothing (measured in
    // three browsers): the first row's widths size the columns. Reported; the layout stays Unknown there.
    if (!box.pseudo && ['td', 'th'].includes(box.tag)) {
      const table = [...(ancestors ?? [])].reverse().find(a => a.box?.tag === 'table')?.style;
      if (table && String(table['table-layout']) === 'fixed' && String(table['inline-size'] ?? 'auto') !== 'auto') for (const key of ['min-inline-size', 'max-inline-size'])
        if (style.$sources?.[key] && !['auto', 'none', '0', '0px'].includes(String(style[key])) && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes(key)))
          layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: [key], css: [{ property: key, file: style.$sources[key].file, line: style.$sources[key].line, selector: style.$sources[key].selector }],
            message: `${box.label}: ${key === 'min-inline-size' ? 'min-width' : 'max-width'} has no effect on a table cell of a fixed table (table-layout: fixed sizes the columns from the first row's widths). Give the column a width (on the first row's cell or a col)` });
    }
    // F96: a fixed table sizes its columns from its first row only (measured in Chromium, Firefox and WebKit): a width on a
    // cell of a later row does nothing. A thead or tfoot is drawn first or last whatever its place in the source, so a table
    // with one is not judged.
    if (!box.pseudo && ['td', 'th'].includes(box.tag) && style.$sources?.['inline-size'] && String(style['inline-size']) !== 'auto') {
      const row = box[PARENT], section = row?.[PARENT], tableBox = section?.[PARENT], table = [...(ancestors ?? [])].reverse().find(a => a.box?.tag === 'table')?.style;
      const sections = (tableBox?.children ?? []).filter(c => !c.anonymous && c.tag !== 'caption' && c.tag !== 'colgroup' && c.tag !== 'col');
      const first = sections[0]?.children?.find(c => c.tag === 'tr');
      if (row?.tag === 'tr' && tableBox?.tag === 'table' && table && String(table['table-layout']) === 'fixed' && String(table['inline-size'] ?? 'auto') !== 'auto'
        && sections.every(c => c.tag === 'tbody') && first && first !== row && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes('inline-size')))
        layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: ['inline-size'], css: [{ property: 'width', file: style.$sources['inline-size'].file, line: style.$sources['inline-size'].line, selector: style.$sources['inline-size'].selector }],
          message: `${box.label}: width has no effect: with table-layout: fixed only the first row's cells (or col elements) size the columns. Put the width on the first row's cell or on a col` });
    }
    if (droppedOf(style, 'aspect-ratio').length && !box.pseudo) aspectInert(box, style);
    if (droppedPairs(style, 'cell-height').length && !box.pseudo && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes(droppedPairs(style, 'cell-height')[0][0])))
      layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: droppedPairs(style, 'cell-height').map(([key]) => key), css: droppedPairs(style, 'cell-height').filter(([key]) => style.$sources?.[key]).map(([key]) => ({ property: key, file: style.$sources[key].file, line: style.$sources[key].line, selector: style.$sources[key].selector })),
        message: `${box.label}: ${droppedPairs(style, 'cell-height').map(([key, value]) => `${key === 'min-block-size' ? 'min-height' : 'max-height'}: ${value}`).join(', ')} ${droppedPairs(style, 'cell-height').length === 1 ? 'has' : 'have'} no effect on a table cell (the row's height decides it). Use height on the cell or the row, or put the bound on a div inside the cell` });
      // F42: a checkbox or radio of appearance auto is drawn by the platform: background, color, border and padding
      // change no pixel and not its size (measured in Chromium, Firefox and WebKit); accent-color colors it.
    if (!box.pseudo && box.tag === 'input' && ['checkbox', 'radio'].includes(box.inputType) && style.appearance === 'auto') {
      const keys = Object.keys(style.$sources ?? {}).filter(key => /^(?:background-color|color|padding-(?:top|right|bottom|left)|border-(?:top|right|bottom|left)(?:-width|-style|-color)?)$/.test(key));
      const names = [...new Set(keys.map(key => key.replace(/-(?:top|right|bottom|left)(?=-|$)/g, '')))];
      if (keys.length && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes(keys[0])))
        layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: keys, css: keys.slice(0, 4).map(key => ({ property: key, file: style.$sources[key].file, line: style.$sources[key].line, selector: style.$sources[key].selector })),
          message: `${box.label}: ${names.join(', ')} ${names.length === 1 ? 'has' : 'have'} no effect on a ${box.inputType} drawn by the browser (appearance: auto). Use accent-color to color it, or appearance: none to draw it yourself` });
    }
      // F41: fill / stroke on an svg reach its shapes by inheritance only; a shape with its own fill / stroke attribute
      // (or a g around it) keeps that (measured in Chromium, Firefox and WebKit). Not where a rule could style the shapes.
    if (box.tag === 'svg' && !box.pseudo) {
      const paint = box.svgSize?.paint ?? {};
      const shapeRule = key => rules.some(rule => (rule.declarations ?? []).some(d => d.property === key) && (rule.selectors ?? []).some(sel => /(?:^|[\s>+~(,])(?:path|circle|rect|g|use|polygon|polyline|line|ellipse|text|tspan|symbol)\b|\*/.test(sel.source)));
      const keys = ['fill', 'stroke'].filter(key => style.$sources?.[key] && paint[`${key}Set`] && !shapeRule(key));
      if (keys.length && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes(keys[0])))
        layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: keys, css: keys.map(key => ({ property: key, file: style.$sources[key].file, line: style.$sources[key].line, selector: style.$sources[key].selector })),
          message: `${box.label}: ${keys.join(' and ')} on the svg ${keys.length === 1 ? 'has' : 'have'} no effect: every shape in it sets its own ${keys.join(' / ')} attribute, which wins over an inherited value. Remove the attribute${keys.length === 1 ? '' : 's'} (or set it to currentColor and use color), or style the shapes (.icon path { ${keys[0]}: … })` });
    }
      // F38: auto margins of an absolutely positioned box centre it only when both insets and the size on that axis are
      // set (CSS 2.2 §10.3.7, §10.6.4: otherwise they are 0; measured in Chromium, Firefox and WebKit).
    if (!box.pseudo && (style.position === 'absolute' || style.$fixed) && !layoutWarnings.some(w => w.code === 'W_LAYOUT_AUTO_MARGIN_ABSOLUTE' && w.path === box.path)) {
      // The authored value (the computed one may have dropped an over-constrained inset).
      const authored = key => String(style.$sources?.[key] ? (style.$sources[key].specified ?? style[key]) : (style[key] ?? 'auto')).trim();
      const axes = [['horizontal', 'margin-left', 'margin-right', 'left', 'right', 'inline-size', 'width'], ['vertical', 'margin-top', 'margin-bottom', 'top', 'bottom', 'block-size', 'height']]
        .filter(([, m1, m2]) => [m1, m2].some(m => style.$sources?.[m] && authored(m) === 'auto'))
        .filter(([, , , i1, i2, size]) => [i1, i2, size].some(key => authored(key) === 'auto'));
      if (axes.length) {
        const src = style.$sources?.[axes[0][1]] ?? style.$sources?.[axes[0][2]];
        const missing = axes.map(([, , , i1, i2, size, name]) => [i1, i2, size].filter(key => authored(key) === 'auto').map(key => key === size ? name : key)).flat();
        layoutWarnings.push({ code: 'W_LAYOUT_AUTO_MARGIN_ABSOLUTE', severity: 'warning', box: box.label, path: box.path, axes: axes.map(([axis]) => axis), ...(src ? { css: [{ property: 'margin', file: src.file, line: src.line, selector: src.selector }] } : {}),
          message: `${box.label}: margin: auto does not centre this ${style.$fixed ? 'fixed' : 'absolutely positioned'} box ${axes.map(([axis]) => axis).join(' and ')}ly: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} auto, and then auto margins are 0 (it stays where it would be in flow). Set inset: 0 (both insets) with a width and height, or use translate(-50%, -50%)` });
      }
    }
      // F3: a declaration whose var() has no value and no fallback is invalid at computed-value time: the property is
      // unset (inherited or initial), silently — a warning where it is written.
    for (const entry of style.$invalid ?? []) if (!layoutWarnings.some(w => w.code === 'W_CSS_VAR_INVALID' && w.css?.[0]?.line === entry.line && w.css?.[0]?.file === entry.file && w.property === entry.property))
        layoutWarnings.push({ code: 'W_CSS_VAR_INVALID', severity: 'warning', box: box.label, path: box.path, property: entry.property, css: [{ property: entry.property, file: entry.file, line: entry.line }],
          message: `${box.label}: ${entry.property} uses a custom property with no value here and no fallback (${entry.message}), so the declaration is invalid at computed-value time and ${entry.property} falls back to inherited or initial. Define the property, or give var() a fallback` });
      // Checklist F: an animation that does nothing — its @keyframes do not exist (F1), or it runs for 0s (F2: an
      // animation shorthand without a time; 0s with fill-mode forwards or both applies the end state on purpose). A max
      // size below the min size (F4): the size is always the min (clamped by the max, then raised to the min), so the
      // width or height and the max no longer size the box — usually swapped values.
    if (!box.pseudo) {
        const at = key => style.$sources?.[key] ? [{ property: key, file: style.$sources[key].file, line: style.$sources[key].line, selector: style.$sources[key].selector }] : [];
        for (const a of animationsOf(style)) {
          const scrollDriven = /^(?:scroll|view)\(/.test(a.timeline);
          if (keyframeNames.has(a.name) && /^-?0+(?:\.0+)?m?s$/.test(String(a.duration)) && !scrollDriven && !['forwards', 'both'].includes(a.fill) && !layoutWarnings.some(w => w.code === 'W_CSS_ANIMATION_NO_DURATION' && w.keyframes === a.name && w.path === box.path))
            layoutWarnings.push({ code: 'W_CSS_ANIMATION_NO_DURATION', severity: 'warning', box: box.label, path: box.path, keyframes: a.name, css: at('animation-duration'),
              message: `${box.label} runs animation ${a.name} for ${a.duration}: with no duration it ends as it starts and nothing is seen. Give it a duration (animation: ${a.name} 1s …)` });
        }
        // F7: z-index on a box that is neither positioned nor a flex or grid item does not stack it (CSS 2.2 §9.9.1,
        // CSS Flexbox §4.3, CSS Grid §9): it paints in tree order as if z-index were auto.
        {
          const ps = ancestors.at(-1)?.style, item = ps && ['flex', 'inline-flex', 'grid', 'inline-grid'].includes(String(ps.display)) && !ps.$blockFlow;
          if (!['auto', undefined].includes(style['z-index']) && style.position === 'static' && !item && style.$sources?.['z-index'] && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes('z-index')))
            layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: ['z-index'], css: at('z-index'),
              message: `${box.label}: z-index: ${style['z-index']} has no effect (it is position: static and not a flex or grid item, so it does not stack above or below its neighbours). Give it position: relative, or remove it`, ...ranges(r) });
        }
        // F13: an absolutely positioned box with both insets and a size on an axis (and no auto margin there) is
        // over-constrained: the end inset is ignored (right in ltr, left in rtl; bottom), CSS 2.2 §10.3.7 / §10.6.4.
        if (['absolute', 'fixed'].includes(style.position)) for (const [a, b, size, m1, m2, label] of [['left', 'right', 'inline-size', 'margin-left', 'margin-right', 'width'], ['top', 'bottom', 'block-size', 'margin-top', 'margin-bottom', 'height']]) {
          // (The declared value: the cascade already sets the ignored inset to auto.)
          const declared = key => style.$sources?.[key]?.specified, set = key => declared(key) !== undefined && String(declared(key)).trim() !== 'auto';
          if (!set(a) || !set(b) || !set(size) || String(style[m1]) === 'auto' || String(style[m2]) === 'auto') continue;
          const ignored = a === 'left' && style.direction === 'rtl' ? 'left' : b;
          if (!style.$sources?.[ignored] || layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes(ignored))) continue;
          layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: [ignored], css: at(ignored),
            message: `${box.label}: ${ignored}: ${declared(ignored)} has no effect (it is position: ${style.position} with ${a}, ${b} and ${label} all set, which over-constrains it, so ${ignored} is ignored). Drop ${label} to stretch it between the insets, or drop ${ignored}`, ...ranges(r) });
        }
        // F14: a border width with no border style draws no border: the style is none, so the used width is 0 (the
        // analysis lays it out that way too).
        {
          // (Declared a non-zero width, yet the used width is 0: the style is none or hidden.)
          const declaredWidth = side => { const t = String(style.$sources?.[`$bw-${side}`]?.specified ?? '').trim().split(/\s+/); if (t.length < 2) return t[0] ?? ''; return { top: t[0], right: t[1], bottom: t[2] ?? t[0], left: t[3] ?? t[1] }[side] ?? ''; };
          const sides = ['top', 'right', 'bottom', 'left'].filter(side => style.$sources?.[`$bw-${side}`] && /[1-9]|thin|medium|thick/.test(declaredWidth(side)) && ['0', '0px'].includes(String(style[`border-${side}`])));
          if (sides.length && !layoutWarnings.some(w => w.code === 'W_CSS_BORDER_NO_STYLE' && w.path === box.path))
            layoutWarnings.push({ code: 'W_CSS_BORDER_NO_STYLE', severity: 'warning', box: box.label, path: box.path, sides, css: at(`$bw-${sides[0]}`).map(c => ({ ...c, property: 'border-width' })),
              message: `${box.label} sets a border width (${sides.join(', ')}) but no border style, which is none by default: no border is drawn and its width is 0. Add border-style: solid (or use the border shorthand: border: 2px solid)` });
        }
        // F15, F16: background-size (…) with no background-image, text-decoration-color (…) with no decoration line on the
        // element itself: they do nothing.
        for (const note of dependentDeclarations) {
          const [needed, idle] = dependentProperty[note.property];
          // (Not where any state of the element — :hover, :focus, … or a media condition — sets the needed property.)
          const anyState = new Set(['hover', 'focus', 'focus-visible', 'focus-within', 'active', 'checked', 'visited', 'target']);
          if (rules.some(rule => rule.declarations.some(d => d.property === needed && String(d.value) !== idle) && rule.selectors.some(sel => matches(sel, box, anyState) || matches(sel, box, state)))) continue;
          if (String(style[needed] ?? idle) !== idle || !note.selectors.some(sel => matches(sel, box, state)) || layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes(note.property))) continue;
          layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: [note.property], css: [{ property: note.property, file: note.file, line: note.line, selector: note.selector }],
            message: `${box.label}: ${note.property}: ${note.value} has no effect (its ${needed} is ${idle}: ${needed === 'background-image' ? 'there is no background image to size or place' : 'the element draws no decoration line of its own'}). Set ${needed}, or remove it`, ...ranges(r) });
        }
        // F29: :empty does not match an element with whitespace in it (measured in Chromium, Firefox and WebKit: a space or
        // a line break is content; a comment is not): a rule that would match it but for that whitespace never applies.
        if (box.whitespace) for (const rule of rules) for (const sel of rule.selectors ?? []) {
          if (!JSON.stringify(sel.parts ?? []).includes('"name":"empty"') || matches(sel, box, state) || !matches(sel, { ...box, whitespace: false }, state) || layoutWarnings.some(w => w.code === 'W_CSS_EMPTY_WHITESPACE' && w.path === box.path && w.selector === sel.source)) continue;
          layoutWarnings.push({ code: 'W_CSS_EMPTY_WHITESPACE', severity: 'warning', box: box.label, path: box.path, selector: sel.source, css: [{ property: ':empty', file: rule.file, line: rule.line, selector: sel.source }],
            message: `${sel.source} does not match ${box.label}: it holds only whitespace (a space or a line break), and whitespace is content to :empty. Remove the whitespace in the markup, or use :not(:has(*)) for "no child elements"` });
        }
        // F33: :first-child, :last-child, :only-child, :nth-child and :nth-last-child count every element sibling, also
        // one that never renders (template, script, style, link, meta: display: none, measured in Chromium, Firefox and
        // WebKit): a rule that would match without such a sibling silently misses.
        const hiddenSiblings = (box[PARENT]?.children ?? []).filter(c => neverRendered.has(c.tag));
        if (hiddenSiblings.length && !box.pseudo) for (const rule of rules) for (const sel of rule.selectors ?? []) {
          if (!/"name":"(?:first-child|last-child|only-child|nth-child|nth-last-child)"/.test(JSON.stringify(sel.parts ?? [])) || matches(sel, box, state) || !ignoringSiblings(neverRendered, () => matches(sel, box, state)) || layoutWarnings.some(w => w.code === 'W_CSS_CHILD_INDEX_HIDDEN_SIBLING' && w.path === box.path && w.selector === sel.source)) continue;
          const tags = [...new Set(hiddenSiblings.map(c => `<${c.tag}>`))].join(', ');
          layoutWarnings.push({ code: 'W_CSS_CHILD_INDEX_HIDDEN_SIBLING', severity: 'warning', box: box.label, path: box.path, selector: sel.source, css: [{ property: 'selector', file: rule.file, line: rule.line, selector: sel.source }],
            message: `${sel.source} does not match ${box.label}: its parent also holds ${tags}, which is never shown but still counts as a child for :first-child, :last-child and :nth-child. Use :first-of-type / :last-of-type / :nth-of-type, or move the ${tags} out of the list` });
        }
        // F34: columns / column-count / column-width on a flex or grid container (css.mjs resets them to auto).
        if (droppedPairs(style, 'multicol-item').length && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes(droppedPairs(style, 'multicol-item')[0][0]))) {
          const keys = droppedPairs(style, 'multicol-item').map(([key]) => key), src = style.$sources?.[keys[0]];
          layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: keys, ...(src ? { css: [{ property: keys[0], file: src.file, line: src.line, selector: src.selector }] } : {}),
            message: `${box.label}: ${droppedPairs(style, 'multicol-item').map(([key, value]) => `${key}: ${value}`).join(', ')} has no effect (it is display: ${style.display}; multi-column layout applies only to a block container). Use grid-template-columns (or flex-wrap with a flex-basis) for columns, or display: block for flowing columns` });
        }
        // F63: :dir() follows the dir attributes; where the directionality is not known it is Unknown, and a rule that
        // misses only because the direction comes from CSS (direction: rtl, not dir="rtl") is reported.
        if (!box.pseudo) for (const rule of rules) for (const sel of rule.selectors ?? []) for (const part of (sel.parts ?? []).filter(p => p.kind === 'dir')) {
          const st = sel.pseudoElement ? new Set([...(state ?? []), `::${sel.pseudoElement}`]) : state;
          const rest = matches({ ...sel, parts: sel.parts.filter(p => p !== part) }, box, st);
          if (!rest) continue;
          const d = directionality(box);
          if (d === 'unknown') { unknown('U_LAYOUT_SELECTOR', `${sel.source}: the directionality of ${box.label} is not known here (dir=auto or no dir in the tree)`, rule.line, box, rule.file); continue; }
          if (d !== part.value && String(style.direction) === part.value && !layoutWarnings.some(w => w.code === 'W_CSS_STATE_UNREACHABLE' && w.path === box.path && w.selector === sel.source))
            layoutWarnings.push({ code: 'W_CSS_STATE_UNREACHABLE', severity: 'warning', box: box.label, path: box.path, selector: sel.source, state: ':dir', css: [{ property: ':dir', file: rule.file, line: rule.line, selector: sel.source }],
              message: `${sel.source} does not apply to ${box.label}: :dir(${part.value}) follows the dir attribute, and ${box.label} is direction: ${part.value} only by CSS. Set dir="${part.value}" on it (or an ancestor) instead of the CSS direction` });
        }
        // F62: :lang() where the language is not known is Unknown (the rule may or may not apply).
        if (!box.pseudo) for (const rule of rules) for (const sel of rule.selectors ?? []) for (const part of (sel.parts ?? []).filter(p => p.kind === 'lang'))
          if (langMatches(box, part.value) === 'unknown' && matches({ ...sel, parts: sel.parts.filter(p => p !== part) }, box, sel.pseudoElement ? new Set([...(state ?? []), `::${sel.pseudoElement}`]) : state)) unknown('U_LAYOUT_SELECTOR', `${sel.source}: the language of ${box.label} is not known here (or browsers match :lang(${part.value}) differently)`, rule.line, box, rule.file);
        // F61: :read-write on what can never be edited (not a text field or textarea, or a checkbox) never applies; where
        // editability is not known (contenteditable, a dynamic disabled, an unmeasured input type) it is Unknown.
        if (!box.pseudo) for (const rule of rules) for (const sel of rule.selectors ?? []) {
          const v = JSON.stringify([sel.parts, sel.chain ?? []]).match(/"kind":"read-write","value":(true|false)/)?.[1];
          if (!v) continue;
          const st = sel.pseudoElement ? new Set([...(state ?? []), `::${sel.pseudoElement}`]) : state;
          // Would the rule select it were it editable (or, for :read-only, were it not)?
          const ifEditable = asEditable(() => matches(sel, box, st)), ifNot = matches(sel, { ...box, tag: box.tag === 'textarea' || box.tag === 'input' ? 'span' : box.tag }, st);
          if (!readWriteKnown(box)) { if (ifEditable || ifNot) unknown('U_LAYOUT_SELECTOR', `${sel.source}: whether ${box.label} is editable is not known`, rule.line, box, rule.file); continue; }
          // Reported only where it can never be editable (a readonly or disabled text field may become editable).
          const textField = box.tag === 'textarea' || (box.tag === 'input' && ['text', 'search', 'url', 'tel', 'email', 'password', 'number', 'date'].includes(box.inputType));
          if (v !== 'true' || textField || matches(sel, box, st) || !ifEditable) continue;
          if (layoutWarnings.some(w => w.code === 'W_CSS_STATE_UNREACHABLE' && w.path === box.path && w.selector === sel.source)) continue;
          layoutWarnings.push({ code: 'W_CSS_STATE_UNREACHABLE', severity: 'warning', box: box.label, path: box.path, selector: sel.source, state: ':read-write', css: [{ property: ':read-write', file: rule.file, line: rule.line, selector: sel.source }],
            message: `${sel.source} never applies to ${box.label}: ${box.tag === 'input' ? `a type=${box.inputType} input` : `a <${box.tag}>`} is not editable text, so it is always :read-only. Select it with a class, or use a text field` });
        }
        // F50: :required / :optional on what is not a form field (a label, a div) or on an input type that ignores required
        // never apply; :optional where browsers differ (Firefox) is Unknown.
        if (!box.pseudo) for (const rule of rules) for (const sel of rule.selectors ?? []) {
          const name = JSON.stringify([sel.parts, sel.chain ?? []]).match(/"kind":"required","value":(true|false)/)?.[1];
          const st = sel.pseudoElement ? new Set([...(state ?? []), `::${sel.pseudoElement}`]) : state;
          if (!name || matches(sel, box, st)) continue;
          if (optionalDivergent(box) && optionalDivergence(() => matches(sel, box, st))) { unknown('U_LAYOUT_SELECTOR', `${sel.source}: browsers differ on whether :optional matches ${box.label} (Firefox does not on a ${box.tag === 'button' ? 'button' : `type=${box.inputType} input`})`, rule.line, box, rule.file); continue; }
          const required = name === 'true';
          if (requiredCapable(box) && !(required && box.nativeStates?.required === true)) continue; // a field that may simply not be required
          if (!asFormField(() => matches(sel, box, st)) || layoutWarnings.some(w => w.code === 'W_CSS_STATE_UNREACHABLE' && w.path === box.path && w.selector === sel.source)) continue;
          const pc = required ? ':required' : ':optional';
          layoutWarnings.push({ code: 'W_CSS_STATE_UNREACHABLE', severity: 'warning', box: box.label, path: box.path, selector: sel.source, state: pc, css: [{ property: pc, file: rule.file, line: rule.line, selector: sel.source }],
            message: `${sel.source} never applies to ${box.label}: ${pc} matches only a form field (input, select, textarea)${box.tag === 'input' ? `, and a type=${box.inputType} input ignores required` : `, not a <${box.tag}>`}. ${box.tag === 'label' ? 'Select the label from the field (input:required + label) or with a class' : 'Select it with a class'}` });
        }
        // F49: :placeholder-shown on a field with no placeholder attribute never applies; where the value is not known (a
        // dynamic value, a textarea holding whitespace) whether it applies is Unknown.
        if (!box.pseudo && placeholderField(box)) for (const rule of rules) for (const sel of rule.selectors ?? []) {
          if (!JSON.stringify([sel.parts, sel.chain ?? []]).includes('"kind":"placeholder-shown"')) continue;
          const empty = { ...box, placeholderAttr: true, value: undefined, text: false, whitespace: false, textContent: undefined, inline: [] };
          const st = sel.pseudoElement ? new Set([...(state ?? []), `::${sel.pseudoElement}`]) : state;
          if (matches(sel, box, st) || !matches(sel, empty, st)) continue;
          if (box.placeholderAttr && (box.value === 'dynamic' || (box.tag === 'textarea' && box.whitespace))) { unknown('U_LAYOUT_SELECTOR', `${sel.source}: whether ${box.label} shows its placeholder depends on its value, which is not known`, rule.line, box, rule.file); continue; }
          if (box.placeholderAttr || layoutWarnings.some(w => w.code === 'W_CSS_STATE_UNREACHABLE' && w.path === box.path && w.selector === sel.source)) continue;
          layoutWarnings.push({ code: 'W_CSS_STATE_UNREACHABLE', severity: 'warning', box: box.label, path: box.path, selector: sel.source, state: ':placeholder-shown', css: [{ property: ':placeholder-shown', file: rule.file, line: rule.line, selector: sel.source }],
            message: `${sel.source} never applies to ${box.label}: it has no placeholder attribute, so no placeholder is ever shown. Add placeholder=" " (a floating label needs one), or select the empty field another way` });
        }
        // F48: :link / :any-link on an element that is not a link (an a without href, a button): the rule would select it
        // were it a link, but never applies.
        if (!box.pseudo && !((box.tag === 'a' && box.href !== undefined) || box.tag === 'area')) for (const rule of rules) for (const sel of rule.selectors ?? []) {
          const name = JSON.stringify([sel.parts, sel.chain ?? []]).match(/"kind":"link","name":"([a-z-]+)"/)?.[1];
          const st = sel.pseudoElement ? new Set([...(state ?? []), `::${sel.pseudoElement}`]) : state;
          if (!name || matches(sel, box, st) || !matches(sel, { ...box, tag: 'a', href: '#' }, st) || layoutWarnings.some(w => w.code === 'W_CSS_STATE_UNREACHABLE' && w.path === box.path && w.selector === sel.source)) continue;
          layoutWarnings.push({ code: 'W_CSS_STATE_UNREACHABLE', severity: 'warning', box: box.label, path: box.path, selector: sel.source, state: `:${name}`, css: [{ property: `:${name}`, file: rule.file, line: rule.line, selector: sel.source }],
            message: `${sel.source} never applies to ${box.label}: ${box.tag === 'a' ? 'an <a> without href' : `a <${box.tag}>`} is not a link, so :${name} does not match it. ${box.tag === 'a' ? 'Give it an href (or use a button for an action)' : 'Select it with its class'}` });
        }
        // F17, F18: a state rule that can never apply here: :focus / :focus-visible on an element that cannot take focus
        // (no tabindex, not a control or link), :hover on an element with pointer-events: none and no children (the
        // pointer never hits it).
        for (const rule of rules) for (const sel of rule.selectors ?? []) {
          // F22: ::marker on an element that is not a list item has no marker.
          if (sel.pseudoElement === 'marker' && !sel.state) {
            if (!matches(sel, box, new Set(['::marker'])) || style.display === 'list-item' || style.$listItem || layoutWarnings.some(w => w.code === 'W_CSS_STATE_UNREACHABLE' && w.path === box.path && w.selector === sel.source)) continue;
            layoutWarnings.push({ code: 'W_CSS_STATE_UNREACHABLE', severity: 'warning', box: box.label, path: box.path, selector: sel.source, state: '::marker', css: [{ property: '::marker', file: rule.file, line: rule.line, selector: sel.source }],
              message: `${sel.source} never applies to ${box.label}: it is display: ${style.display}, not a list item, so it has no marker` });
            continue;
          }
          // F19: ::placeholder on an element that shows none (not a text field or textarea, or no placeholder attribute).
          if (sel.pseudoElement === 'placeholder' && !sel.state) {
            if (!matches(sel, box, new Set(['::placeholder']))) continue;
            const field = box.tag === 'textarea' || (box.tag === 'input' && !['checkbox', 'radio', 'range', 'color', 'file', 'hidden', 'submit', 'reset', 'button', 'image'].includes(box.inputType));
            if ((field && box.placeholder !== undefined) || box.inputType === 'dynamic' || layoutWarnings.some(w => w.code === 'W_CSS_STATE_UNREACHABLE' && w.path === box.path && w.selector === sel.source)) continue;
            layoutWarnings.push({ code: 'W_CSS_STATE_UNREACHABLE', severity: 'warning', box: box.label, path: box.path, selector: sel.source, state: '::placeholder', css: [{ property: '::placeholder', file: rule.file, line: rule.line, selector: sel.source }],
              message: `${sel.source} never applies to ${box.label}: ${field ? 'it has no placeholder attribute' : 'it is not a text field or textarea'}, so there is no placeholder to style` });
            continue;
          }
          if (!['focus', 'focus-visible', 'focus-within', 'hover', 'active', 'checked'].includes(sel.state) || sel.pseudoElement || !matches(sel, box, new Set([sel.state]))) continue;
          // (Focus: not where the adapter could not tell — a dynamic tabindex — nor on elements whose focusability the box
          // tree does not record: frames, media with controls, image map areas, editable content.) Any tabindex, -1 too,
          // makes an element focusable by a click or focus() (measured in Chromium, Firefox and WebKit).
          const unrecordedBox = b => ['iframe', 'video', 'audio', 'embed', 'object', 'area', 'details'].includes(b.tag) || b.focusable === 'dynamic' || b.tabIndex === 'dynamic' || b.contentEditable !== undefined || b.attributes?.contenteditable !== undefined;
          const unrecorded = unrecordedBox(box);
          const takesFocus = b => focusableBox(b) || Number.isInteger(b.tabIndex) || unrecordedBox(b);
          // F35: :focus-within holds when the element or one inside it has focus; with none that can take focus (and no
          // slot or children passed in, whose content is not known) it never does.
          if (sel.state === 'focus-within') {
            const inside = b => takesFocus(b) || (b.boundaries ?? []).some(x => ['slot', 'children', 'component'].includes(x.kind)) || [...(b.children ?? []), ...(b.inline ?? [])].some(inside);
            if (inside(box) || layoutWarnings.some(w => w.code === 'W_CSS_STATE_UNREACHABLE' && w.path === box.path && w.selector === sel.source)) continue;
            layoutWarnings.push({ code: 'W_CSS_STATE_UNREACHABLE', severity: 'warning', box: box.label, path: box.path, selector: sel.source, state: sel.state, css: [{ property: ':focus-within', file: rule.file, line: rule.line, selector: sel.source }],
              message: `${sel.source} never applies to ${box.label}: neither it nor anything inside it is focusable (no link with href, control or tabindex), so nothing in it ever has focus` });
            continue;
          }
          // F19: :checked holds only for a checkbox, a radio button or an option.
          const checkable = (box.tag === 'input' && ['checkbox', 'radio', 'dynamic'].includes(box.inputType)) || box.tag === 'option';
          const never = ['hover', 'active'].includes(sel.state) ? style['pointer-events'] === 'none' && !(box.children ?? []).length && !box.inline?.length : sel.state === 'checked' ? !checkable : !takesFocus(box);
          if (!never || layoutWarnings.some(w => w.code === 'W_CSS_STATE_UNREACHABLE' && w.path === box.path && w.selector === sel.source)) continue;
          layoutWarnings.push({ code: 'W_CSS_STATE_UNREACHABLE', severity: 'warning', box: box.label, path: box.path, selector: sel.source, state: sel.state, css: [{ property: `:${sel.state}`, file: rule.file, line: rule.line, selector: sel.source }],
            message: sel.state === 'checked' ? `${sel.source} never applies to ${box.label}: only a checkbox, a radio button or an option is ever :checked. Use a class or an aria-checked / aria-pressed attribute selector for a custom control` : ['hover', 'active'].includes(sel.state) ? `${sel.source} never applies to ${box.label}: it has pointer-events: none, so the pointer never ${sel.state === 'hover' ? 'hovers' : 'activates'} it. Remove pointer-events: none, or put the :hover on an element the pointer reaches` : `${sel.source} never applies to ${box.label}: it cannot take focus (no tabindex, and it is not a link, button or form control). Make it focusable (a button, or tabindex="0"), or use :focus-within on its container` });
        }
        // F23: user-select: none on a text field does nothing — its text is still selected and edited (measured in Chromium,
        // Firefox and WebKit).
        const selectNone = userSelectNone.find(note => note.selectors.some(sel => matches(sel, box, state)));
        if (selectNone && (box.tag === 'textarea' || (box.tag === 'input' && !['checkbox', 'radio', 'range', 'color', 'file', 'hidden', 'submit', 'reset', 'button', 'image'].includes(box.inputType))) && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes('user-select')))
          layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: ['user-select'], css: [{ property: 'user-select', file: selectNone.file, line: selectNone.line, selector: selectNone.selector }], message: `${box.label}: user-select: none has no effect on a text field: its text is still selected and edited`, ...ranges(r) });
        // G1: a summary that is no longer a list item (display changed, or list-style: none) loses its disclosure triangle
        // (measured in Chromium, Firefox and WebKit); with no indicator of its own (a ::before / ::after, or a child element
        // such as an icon) nothing shows whether it is open.
        if (box.tag === 'summary' && (style.display !== 'list-item' && !style.$listItem || String(style['list-style-type']) === 'none')) {
          const generated = ['before', 'after'].some(kind => { try { return styles({ ...box, path: `${box.path}/${kind}`, label: `${box.label}::${kind}`, children: [], pseudo: kind }, r, ancestors, style, false, false, new Set([`::${kind}`])).some(c => (c.style.content ?? 'none') !== 'none'); } catch { return true; } });
          const icon = (box.children ?? []).some(c => !c.text || ['svg', 'img', 'span', 'i'].includes(c.tag)) || (box.inline ?? []).some(c => ['svg', 'img', 'i'].includes(c.tag));
          if (!generated && !icon && !layoutWarnings.some(w => w.code === 'W_A11Y_SUMMARY_INDICATOR' && w.path === box.path))
            layoutWarnings.push({ code: 'W_A11Y_SUMMARY_INDICATOR', severity: 'warning', box: box.label, path: box.path, css: at(style.display !== 'list-item' && !style.$listItem ? 'display' : 'list-style-type'),
              message: `${box.label} is ${String(style['list-style-type']) === 'none' ? 'list-style: none' : `display: ${style.display}`}, so its disclosure triangle is gone, and nothing else shows whether the details are open or closed. Add an indicator (a ::before that turns with [open], or an icon)`, ...ranges(r) });
        }
        // F24: table-layout: fixed on a table of auto width is the automatic layout (CSS 2.2 §17.5.2: fixed needs a
        // width); F25: border-spacing with border-collapse: collapse does nothing (measured in Chromium, Firefox and WebKit).
        if (['table', 'inline-table'].includes(String(style.display)) || box.tag === 'table') {
          const inert = [];
          if (String(style['table-layout']) === 'fixed' && style.$sources?.['table-layout'] && String(style['inline-size'] ?? 'auto') === 'auto') inert.push(['table-layout', 'table-layout: fixed has no effect on a table of width: auto (the fixed layout needs a width): its columns are sized by their content. Give the table a width']);
          // F31: overflow: auto or scroll on a table is visible (measured in Chromium, Firefox and WebKit): the table
          // grows to its content (its width is a minimum) and never scrolls; hidden and clip do clip.
          const keys = Object.keys(style.$tableOverflow ?? {}), name = keys.length === 2 ? 'overflow' : keys[0];
          if (keys.length && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes(keys[0])))
            layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: keys, css: at(keys[0]),
              message: `${box.label}: ${name}: ${style.$tableOverflow[keys[0]]} has no effect on a table (it grows to fit its content and never scrolls). Wrap the table in a div with ${name === 'overflow-y' ? 'overflow-y' : 'overflow-x'}: auto to scroll it`, ...ranges(r) });
          // F60: gap does not space table cells (measured in Chromium, Firefox and WebKit: border-spacing does).
          for (const key of ['row-gap', 'column-gap']) if (style.$sources?.[key] && !['normal', '0', '0px'].includes(String(style.$sources[key].specified ?? style[key]).trim())) inert.push([key, `${key === 'row-gap' ? 'row-gap' : 'gap'} does not space the cells of a table; use border-spacing`]);
          for (const [key] of droppedPairs(style, 'table-padding')) inert.push([key, 'a table with border-collapse: collapse has no padding (its border is shared with the cells); pad the cells, or use border-collapse: separate']);
          if (String(style['border-collapse']) === 'collapse' && style.$sources?.['border-spacing'] && !/^0(?:px)?(?:\s+0(?:px)?)?$/.test(String(style['border-spacing']))) inert.push(['border-spacing', 'border-spacing has no effect with border-collapse: collapse (the cells share their borders). Use border-collapse: separate for spacing, or remove it']);
          // F82: empty-cells: hide only hides empty cells in the separated border model (measured in Chromium, Firefox and
          // WebKit: with collapse the empty cell's background and borders are still painted).
          if (String(style['border-collapse']) === 'collapse' && style.$sources?.['empty-cells'] && String(style['empty-cells']) === 'hide') inert.push(['empty-cells', 'empty-cells: hide has no effect with border-collapse: collapse (the empty cells are still drawn); use border-collapse: separate']);
          for (const [prop, text] of inert) if (!layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes(prop)))
            layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: [prop], css: at(prop), message: `${box.label}: ${text}`, ...ranges(r) });
        }
        // F12: a transition with no duration (transition: opacity) is 0s: the change is instant (a delay only postpones it).
        for (const t of transitionsOf(style)) if (/^-?0+(?:\.0+)?m?s$/.test(String(t.duration)) && style.$sources?.['transition-property'] && style.$sources?.['transition-duration']?.specified === undefined && !layoutWarnings.some(w => w.code === 'W_CSS_TRANSITION_NO_DURATION' && w.path === box.path && w.property === t.property))
          layoutWarnings.push({ code: 'W_CSS_TRANSITION_NO_DURATION', severity: 'warning', box: box.label, path: box.path, property: t.property, css: at('transition-property'),
            message: `${box.label} transitions ${t.property} with no duration (0s): the change happens at once, as if there were no transition. Give it a time (transition: ${t.property} .2s)` });
        // F8: a transition between a keyword size (auto, none, fit-content, …) and a length does not animate: the box
        // jumps (measured in Chromium, Firefox and WebKit; interpolate-size: allow-keywords animates it in Chromium only).
        // The other value is the :hover or :focus one.
        {
          const sizeNames = { height: 'block-size', width: 'inline-size', 'max-height': 'max-block-size', 'max-width': 'max-inline-size', 'min-height': 'min-block-size', 'min-width': 'min-inline-size', 'block-size': 'block-size', 'inline-size': 'inline-size' };
          const covered = transitionsOf(style).filter(t => !/^-?0+(?:\.0+)?m?s$/.test(String(t.duration))).flatMap(t => t.property === 'all' ? Object.values(sizeNames) : sizeNames[t.property] ? [sizeNames[t.property]] : []);
          // (The values, for adapter-core to compare between component states: a class toggle.)
          if (covered.length && state === undefined && !transitionSizes.some(t => t.path === box.path)) transitionSizes.push({ box: box.label, path: box.path, properties: [...new Set(covered)], values: Object.fromEntries([...new Set(covered)].map(key => [key, String(style[key])])) });
          if (covered.length && state === undefined) {
            const keyword = v => /^(?:auto|none|fit-content|max-content|min-content|stretch)$/.test(String(v));
            // The other states: :hover, :focus, and the class toggles the stylesheet implies — a rule for this element with
            // classes it does not have yet (.panel.open for a .panel: plain HTML has no states, but the CSS names them).
            const toggles = [...new Set(rules.flatMap(rule => (rule.selectors ?? []).filter(sel => !sel.state && !sel.pseudoElement).map(sel => {
              const extra = sel.parts.filter(p => p.kind === 'class' && !box.classes.includes(p.value)).map(p => p.value);
              // (The rule must already name this element by a class it has: .panel.open, not .open alone or another .x.)
              const shared = sel.parts.some(p => p.kind === 'class' && box.classes.includes(p.value));
              return shared && extra.length && extra.length <= 2 && matches(sel, { ...box, classes: [...box.classes, ...extra] }) ? extra.join(' ') : null;
            }).filter(Boolean)))].slice(0, 8);
            for (const st of ['hover', 'focus', ...toggles.map(t => `class:${t}`)]) {
              const toggled = st.startsWith('class:') ? st.slice(6).split(' ') : null;
              let alt; try { alt = toggled ? styles({ ...box, classes: [...box.classes, ...toggled] }, r, ancestors, inherited, false, gridItem) : styles(box, r, ancestors, inherited, false, gridItem, new Set([st])); } catch { continue; }
              for (const a of alt) for (const key of [...new Set(covered)]) {
                if (String(a.style[key]) === String(style[key]) || keyword(a.style[key]) === keyword(style[key]) || layoutWarnings.some(w => w.code === 'W_CSS_TRANSITION_AUTO' && w.path === box.path && w.property === key)) continue;
                const [from, to] = keyword(style[key]) ? [style[key], a.style[key]] : [a.style[key], style[key]];
                layoutWarnings.push({ code: 'W_CSS_TRANSITION_AUTO', severity: 'warning', box: box.label, path: box.path, property: key, css: at('transition-property'),
                  message: `${box.label} transitions ${key} between ${from} and ${to} (${st.startsWith('class:') ? `when it gets the class ${st.slice(6).split(' ').map(c => '.' + c).join('')}` : `on :${st}`}), but a keyword size like ${keyword(style[key]) ? style[key] : a.style[key]} does not interpolate: the box jumps instead of animating (only Chromium animates it, with interpolate-size: allow-keywords). Animate a length (max-height, or grid-template-rows: 0fr → 1fr)`, ...ranges(r) });
              }
            }
          }
        }
        for (const [min, max] of [['min-inline-size', 'max-inline-size'], ['min-block-size', 'max-block-size']]) {
          const v = key => /^\d+(?:\.\d+)?px$/.test(String(style[key])) ? Number(String(style[key]).slice(0, -2)) : null;
          const [minName, maxName, sizeName] = min === 'min-inline-size' ? ['min-width', 'max-width', 'width'] : ['min-height', 'max-height', 'height'];
          if (v(min) !== null && v(max) !== null && v(max) < v(min) && !layoutWarnings.some(w => w.code === 'W_LAYOUT_MIN_ABOVE_MAX' && w.path === box.path && w.properties.includes(max)))
            layoutWarnings.push({ code: 'W_LAYOUT_MIN_ABOVE_MAX', severity: 'warning', box: box.label, path: box.path, properties: [min, max], css: [...at(min), ...at(max)],
              message: `${box.label}: ${maxName}: ${style[max]} is below ${minName}: ${style[min]}, so the box is always ${style[min]} ${min === 'min-inline-size' ? 'wide' : 'tall'} (clamped by the max, then raised to the min): its ${sizeName} and content no longer size it. The two values are probably swapped`, ...ranges(r) });
        }
      }
  }

  // display: contents generates no box of its own (CSS Display §2.5): its sizes, padding, border, margin, background and
  // overflow do nothing (measured in Chromium); its children are laid out in its place and inherit from it.
  const contentsBoxKeys = ['inline-size', 'block-size', 'min-inline-size', 'min-block-size', 'max-inline-size', 'max-block-size',
    ...['top', 'right', 'bottom', 'left'].flatMap(side => [`padding-${side}`, `margin-${side}`, `border-${side}`]), 'background-color', 'background-image', 'overflow-x', 'overflow-y', 'aspect-ratio'];
  function aspectInert(box, style) {
    if (layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes('aspect-ratio'))) return;
    const src = style.$sources?.['aspect-ratio'], { value, where } = droppedOf(style, 'aspect-ratio')[0];
    layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: ['aspect-ratio'], ...(src ? { css: [{ property: 'aspect-ratio', file: src.file, line: src.line, selector: src.selector }] } : {}),
      message: where === 'table' ? `${box.label}: aspect-ratio: ${value} has no effect on a table cell, row or column (the table sizes it). Put the ratio on a block inside the cell` : `${box.label}: aspect-ratio: ${value} has no effect on a display: inline element. Make it display: inline-block (or block)` });
  }
  function tableRowRadius(box, style, state) {
    // F94: a table row or row group is not rounded by border-radius, in either border model (measured in Chromium, Firefox
    // and WebKit: same pixels with a row background and without the radius). Round the first and last cells instead.
    if (!box.pseudo && (['tr', 'thead', 'tbody', 'tfoot'].includes(box.tag) || /^table-(?:row|row-group|header-group|footer-group)$/.test(String(style.display))) && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes('border-radius'))) {
      const hits = radiusRules.filter(r => r.selectors.some(sel => matches(sel, box, state))), rule = hits.find(r => !r.zero);
      if (rule && !hits.some(r => r.zero))
        layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: ['border-radius'], css: [{ property: 'border-radius', file: rule.file, line: rule.line, selector: rule.selector }],
          message: `${box.label}: border-radius has no effect on a table ${box.tag === 'tr' || /row$/.test(String(style.display)) ? 'row' : 'row group'} (it does not round its background or border). Round the corner cells (td:first-child, td:last-child) instead` });
    }
  }
  function contentsInert(box, style, region) {
    if (box.pseudo || ['button', 'input', 'select', 'textarea', 'img', 'video', 'iframe', 'svg', 'canvas', 'legend'].includes(box.tag) || layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path)) return;
    const written = contentsBoxKeys.filter(key => style.$sources?.[key] && !['0', '0px', 'auto', 'none', 'visible', 'transparent'].includes(String(style[key])));
    if (!written.length) return;
    layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: written,
      css: written.map(key => ({ property: key, file: style.$sources[key].file, line: style.$sources[key].line, selector: style.$sources[key].selector })),
      message: box.tablePart
        ? `${box.label}: ${written.join(', ')} ${written.length === 1 ? 'has' : 'have'} no effect (a table row or row group has no padding or margins, and its width does not size the columns). Put them on its cells`
        : `${box.label}: ${written.join(', ')} ${written.length === 1 ? 'has' : 'have'} no effect (it is display: contents, which generates no box of its own; its children are laid out in its place). Put them on a child, or use another display`, ...ranges(region) });
  }
  return { firstInert, firstPseudoInert, stateShadowed, dialogMarginReset, overflowPromoted, containerUnitViewport, selectIndent, optionInert, brStyled, wrapRestored, preserve3dInert, outOfFlowFlexInert, inlineAutoMargin, alignBrowserDependent, inlineTextAlignment, decorationNone, inlineOverflow, inlineStateTransforms, pseudoWithoutContent, cssMistakes, aspectInert, tableRowRadius, contentsInert };
}
