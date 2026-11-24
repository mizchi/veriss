// Declarations that do nothing where they are (W_LAYOUT_DECLARATION_INERT) and the mistakes found beside them (a
// scroll box that never scrolls, an svg or iframe without a size, a container that collapses, content-visibility
// without a size), judged on one box's computed style and the facts the layout hands over (ADR-0016 M6): where the
// box sits (its parent's display, in flow or not) and its ancestors. Moved out of the layout's finish(); the checks
// are unchanged.
//   report: where findings go (warnings, the viewport ranges of a region)
//   facts:  what the syntax stage found (rules)
//   tools:  selector matching, and whether a flex factor is positive (read as the layout reads it)
export function createInertDeclarations({ report, facts, tools }) {
  const { warnings: layoutWarnings, ranges } = report;
  const { rules } = facts;
  const { matches, compileSelector, dynamicStates, positive } = tools;
  /**
   * box, style: the box and its computed style in one state (region).
   * placement: the layout's facts about where the box is: parents (the ancestors laid out, nearest last, {box, style}),
   *   parentDisplay ('block' for a block container, else the parent's display) and inFlow (not position: absolute).
   */
  return function inertDeclarations(box, style, { parents, parentDisplay, inFlow }, region) {
    if (box.pseudo || layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path)) return;
    const initial = { 'grid-column': 'auto', 'grid-row': 'auto', 'flex-grow': '0', 'flex-shrink': '1', 'flex-basis': 'auto', 'grid-template-columns': 'none', 'grid-template-rows': 'none', 'grid-auto-rows': 'auto', 'grid-auto-flow': 'row', 'flex-direction': 'row', 'flex-wrap': 'nowrap' };
    const written = key => style.$sources?.[key] && String(style[key]) !== initial[key];
    const reasons = [];
    if (inFlow && parentDisplay === 'block') for (const key of ['flex-grow', 'flex-shrink', 'flex-basis']) if (written(key)) reasons.push([key, `its parent ${parents.at(-1).box.label} is display: block, not flex`]);
    // top/right/bottom/left move only a positioned box.
    if (style.position === 'static') for (const key of ['top', 'left', 'bottom', 'right']) if (style.$sources?.[key] && String(style[key]) !== 'auto') reasons.push([key, 'it is position: static (add position: relative, or use a margin or transform)']);
    // z-index stacks a positioned box or a grid/flex item; a static block-level box in block flow has no z-order.
    if (style.position === 'static' && parentDisplay === 'block' && style.$sources?.['z-index'] && String(style['z-index']) !== 'auto') reasons.push(['z-index', `it is position: static and its parent ${parents.at(-1).box.label} is display: block (add position: relative)`]);
    // gap spaces grid and flex items; a block container has none.
    // (F92: also a block with nothing inside, which is not turned into a one-column grid; measured in Chromium, Firefox and WebKit.)
    if (style.$blockFlow || (['block', 'inline-block', 'list-item'].includes(String(style.display)) && !box.tablePart)) for (const key of ['row-gap', 'column-gap']) if (style.$sources?.[key] && !['normal', '0', '0px'].includes(String(style.$sources[key].specified ?? '').trim())) reasons.push([key, 'it is display: block, not grid or flex (use margins, or display: grid / flex)']);
    if (inFlow && parentDisplay === 'flex') for (const key of ['grid-column', 'grid-row']) if (written(key)) reasons.push([key, `its parent ${parents.at(-1).box.label} is display: flex, not grid`]);
    if (inFlow && parentDisplay === 'grid') for (const key of ['flex-grow', 'flex-shrink', 'flex-basis']) if (written(key)) reasons.push([key, `its parent ${parents.at(-1).box.label} is display: grid, not flex`]);
    if (style.display === 'flex') for (const key of ['grid-template-columns', 'grid-template-rows', 'grid-auto-rows', 'grid-auto-flow']) if (written(key)) reasons.push([key, 'it is display: flex, not grid']);
    if (style.display === 'grid' && !style.$blockFlow) for (const key of ['flex-direction', 'flex-wrap']) if (written(key)) reasons.push([key, 'it is display: grid, not flex']);
    // Flex and grid container properties on a block container (display: flex forgotten, or overridden): they do
    // nothing (align-content and justify-items do apply to block containers, measured; they are not reported).
    const blockInitial = { 'justify-content': ['normal'], 'align-items': ['normal', 'stretch'], 'flex-direction': ['row'], 'flex-wrap': ['nowrap'], 'grid-template-columns': ['none'], 'grid-template-rows': ['none'], 'grid-auto-flow': ['row'], 'grid-template-areas': ['none'] };
    if ((style.$blockFlow || ['block', 'list-item'].includes(style.display)) && !box.pseudo && !style.$anonymousGridText) for (const [key, initials] of Object.entries(blockInitial)) {
      const specified = String(style.$sources?.[key]?.specified ?? '').trim();
      if (style.$sources?.[key] && specified && !initials.includes(specified)) reasons.push([key, 'it is display: block, not flex or grid']);
    }
    // aspect-ratio sizes an auto dimension; with both sizes set there is none to size.
    if (style.$sources?.['aspect-ratio'] && style['aspect-ratio'] !== 'auto' && ['inline-size', 'block-size'].every(key => style.$sources?.[key] && style[key] !== 'auto')) reasons.push(['aspect-ratio', 'both its width and height are set']);
    // vertical-align applies to inline boxes and table cells; a grid or flex item (blockified) ignores it.
    if (style.$sources?.['vertical-align'] && !['baseline'].includes(String(style['vertical-align'])) && ['grid', 'flex', 'block'].includes(parentDisplay) && !box.tablePart && !style.$inlineLevel) reasons.push(['vertical-align', parentDisplay === 'block' ? 'it is a block-level box, not inline or a table cell' : `it is a ${parentDisplay} item, not inline or a table cell (use align-self)`]);
    // Paint declarations that only work together with another one: text-overflow marks inline overflow that is
    // clipped, -webkit-line-clamp clamps a -webkit-box. (z-index always applies here: every parent is grid or flex.)
    const set = (key, unset) => style.$sources?.[key] && String(style[key]) !== unset;
    // Auto inline margins of a block-level box in block flow with an auto width and no max-width: the box fills its
    // container, so the margins compute to 0 and nothing is centered (CSS 2.2 §10.3.3; measured: the same layout
    // without them). Replaced boxes and form controls keep their own width and are centered: not reported.
    if (inFlow && ['block', 'list-item'].includes(String(parentDisplay)) && String(style['inline-size']) === 'auto' && String(style['max-inline-size']) === 'none' && !['img', 'video', 'canvas', 'iframe', 'svg', 'input', 'button', 'select', 'textarea', 'table'].includes(box.tag) && ['block', 'list-item', 'grid', 'flex'].includes(String(style.display))) {
      const autoSides = ['margin-left', 'margin-right'].filter(key => style.$sources?.[key] && String(style[key]) === 'auto');
      for (const key of autoSides) reasons.push([key, 'its width is auto, so it fills its container and the auto margins are 0 (give it a width or max-width to center it)']);
    }
    // justify-content on a flex row with an item that grows without a cap: the item takes all the free space, so
    // there is none to distribute (measured: the same layout without it). Reported on the container.
    {
      const ps = parents.at(-1)?.style, pbox = parents.at(-1)?.box;
      if (inFlow && ps && ['flex', 'inline-flex'].includes(String(ps.display)) && !String(ps['flex-direction'] ?? 'row').startsWith('column') && String(ps['flex-wrap']) === 'nowrap'
        && ps.$sources?.['justify-content'] && !['normal', 'flex-start', 'start', 'left', 'stretch'].includes(String(ps['justify-content']))
        && positive(String(style['flex-grow'] ?? '0')) && String(style['max-inline-size']) === 'none'
        && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === pbox.path && w.properties.includes('justify-content')))
        layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: pbox.label, path: pbox.path, properties: ['justify-content'],
          css: [{ property: 'justify-content', file: ps.$sources['justify-content'].file, line: ps.$sources['justify-content'].line, selector: ps.$sources['justify-content'].selector }],
          message: `${pbox.label}: justify-content: ${ps['justify-content']} has no effect (${box.label} grows with flex-grow: ${style['flex-grow']} and takes all the free space, so there is none to distribute)`, ...ranges(region) });
    }
    // justify-content (align-content) on a grid with an fr column (row, in a definite height): the fr track takes all
    // the free space, so there is none to distribute (measured: the same layout without it).
    if (style.display === 'grid' && !style.$blockFlow) {
      const fr = v => /(?:^|[\s(,])\d*\.?\d+fr\b/.test(String(v ?? ''));
      if (set('justify-content', 'normal') && !['start', 'flex-start', 'left', 'stretch'].includes(String(style['justify-content'])) && fr(style['grid-template-columns'])) reasons.push(['justify-content', 'an fr column takes all the free space, so there is none to distribute']);
      if (set('align-content', 'normal') && !['start', 'flex-start', 'stretch'].includes(String(style['align-content'])) && fr(style['grid-template-rows']) && /^\d+(?:\.\d+)?px$/.test(String(style['block-size']))) reasons.push(['align-content', 'an fr row takes all the free space, so there is none to distribute']);
    }
    // overflow-y: auto/scroll on a box of block flow with an auto height and no max-height: the box grows with its
    // content, so it never scrolls vertically (measured: scrollHeight equals clientHeight); the page scrolls
    // instead. (In a column flex or grid with a definite height it is shrunk and does scroll: not reported.)
    if (['block', 'list-item'].includes(String(parentDisplay)) && inFlow && ['auto', 'scroll'].includes(String(style['overflow-y'])) && style.$sources?.['overflow-y'] && String(style['block-size']) === 'auto' && String(style['max-block-size']) === 'none' && box.tag !== 'html' && box.tag !== 'body' && !layoutWarnings.some(w => w.code === 'W_LAYOUT_SCROLL_NEVER' && w.path === box.path))
      layoutWarnings.push({ code: 'W_LAYOUT_SCROLL_NEVER', severity: 'warning', box: box.label, path: box.path, css: [{ property: 'overflow-y', file: style.$sources['overflow-y'].file, line: style.$sources['overflow-y'].line, selector: style.$sources['overflow-y'].selector }],
        message: `${box.label} is overflow-y: ${style['overflow-y']} with an auto height and no max-height in block flow: it grows with its content, so it never scrolls (the page does instead). Give it a max-height (or a height)`, ...ranges(region) });
    // text-overflow marks the overflow of the box's own lines; a flex or grid container has none (its text is in its
    // items, anonymous ones included, whose text-overflow is the initial clip; measured: no ellipsis is drawn).
    if (set('text-overflow', 'clip') && ['flex', 'inline-flex', 'grid', 'inline-grid'].includes(String(style.display)) && !style.$blockFlow) reasons.push(['text-overflow', `it is display: ${style.display}, whose text is laid out in its items: put text-overflow (with overflow: hidden and white-space: nowrap) on the item that holds the text`]);
    else if (set('text-overflow', 'clip') && !['hidden', 'clip', 'auto', 'scroll'].includes(String(style['overflow-x']))) reasons.push(['text-overflow', `its overflow-x is ${style['overflow-x']}, so nothing is clipped to mark`]);
    if (inFlow && ['flex', 'inline-flex'].includes(parentDisplay) && set('justify-self', 'auto')) reasons.push(['justify-self', `its parent ${parents.at(-1).box.label} is display: flex, which ignores justify-self (use margin-inline-start: auto, or justify-content on the parent)`]);
    if (['flex', 'inline-flex'].includes(style.display) && set('justify-items', 'normal')) reasons.push(['justify-items', 'it is display: flex, which ignores justify-items (use justify-content)']);
    if (style['content-visibility'] === 'auto' && String(style['contain-intrinsic-block-size']) === 'none' && style['block-size'] === 'auto' && !layoutWarnings.some(w => w.code === 'W_LAYOUT_CONTENT_VISIBILITY_SIZE' && w.path === box.path))
      layoutWarnings.push({ code: 'W_LAYOUT_CONTENT_VISIBILITY_SIZE', severity: 'warning', box: box.label, path: box.path,
        ...(style.$sources?.['content-visibility'] ? { css: [{ property: 'content-visibility', file: style.$sources['content-visibility'].file, line: style.$sources['content-visibility'].line, selector: style.$sources['content-visibility'].selector }] } : {}),
        message: `${box.label} is content-visibility: auto with no contain-intrinsic-size and an auto height: offscreen it is 0px tall, so the page's scroll height and the scrollbar jump as it comes into view (and an in-page link past it lands in the wrong place). Add contain-intrinsic-size: auto <its usual height>`, ...ranges(region) });
    // A main size under a non-auto flex-basis (flex: 1; width: 200px): flex-basis replaces it (inertMainSize).
    if (style.$inertMain) reasons.push([style.$inertMain.property, `flex-basis: ${style['flex-basis']} sets its main size instead (use flex: 1 1 auto, or flex-basis: ${style.$inertMain.value})`]);
    if (style.$svgUnsized && !layoutWarnings.some(w => w.code === 'W_LAYOUT_SVG_UNSIZED' && w.path === box.path))
      layoutWarnings.push({ code: 'W_LAYOUT_SVG_UNSIZED', severity: 'warning', box: box.label, path: box.path,
        message: style.$svgUnsized === 'fills'
          ? `${box.label} is an svg with a viewBox but no width or height (attribute or CSS): it fills its container's width, so an icon grows with the layout. Give it a width and height (e.g. width="24" height="24")`
          : `${box.label} is an svg with no width, height or viewBox: it is drawn at the default 300×150. Give it a width and height`, ...ranges(region) });
    if (style.$embedDefaultHeight && !layoutWarnings.some(w => w.code === 'W_LAYOUT_EMBED_NO_RATIO' && w.path === box.path))
      layoutWarnings.push({ code: 'W_LAYOUT_EMBED_NO_RATIO', severity: 'warning', box: box.label, path: box.path,
        message: `${box.label} sets its width (${style.$sources['inline-size'].specified ?? style['inline-size']}) but not its height: an iframe has no aspect ratio of its own, so it stays 150px tall at every width and the embedded page (a video, a map) is cut or letterboxed. Add aspect-ratio (e.g. 16 / 9) or a height`, ...ranges(region) });
    if (style.$containerCollapse && !layoutWarnings.some(w => w.code === 'W_LAYOUT_CONTAINER_COLLAPSE' && w.path === box.path))
      layoutWarnings.push({ code: 'W_LAYOUT_CONTAINER_COLLAPSE', severity: 'warning', box: box.label, path: box.path,
        message: `${box.label} is position: absolute and container-type: ${style['container-type']} with no width: an absolute box shrinks to fit its content, which size containment ignores, so it is only as wide as its padding and border and its content overflows. Give it a width (or both left and right)`, ...ranges(region) });
    // container-type: inline-size on a flex item sized by its content (auto width and basis, not growing): the
    // containment drops the content's size, so it collapses to its padding and border.
    if (inFlow && ['flex', 'inline-flex'].includes(parentDisplay) && !String(parents.at(-1).style['flex-direction']).startsWith('column') && ['inline-size', 'size'].includes(style['container-type'])
      && style['inline-size'] === 'auto' && ['auto', 'content'].includes(String(style['flex-basis'])) && String(style['flex-grow']) === '0' && !layoutWarnings.some(w => w.code === 'W_LAYOUT_CONTAINER_COLLAPSE' && w.path === box.path))
      layoutWarnings.push({ code: 'W_LAYOUT_CONTAINER_COLLAPSE', severity: 'warning', box: box.label, path: box.path,
        message: `${box.label} is container-type: ${style['container-type']} with no width in a flex row: size containment ignores its content, so it is only as wide as its padding and border and its content overflows. Give it a width (or flex: 1, or a flex-basis)`, ...ranges(region) });
    // align-content distributes flex lines: a single-line (nowrap) flex container has one line and nothing to distribute.
    if (['flex', 'inline-flex'].includes(style.display) && style['flex-wrap'] === 'nowrap' && set('align-content', 'normal')) reasons.push(['align-content', 'it is a single-line flex container (flex-wrap: nowrap), so there are no lines to distribute (use align-items)']);
    // object-fit sizes the content of a replaced element (img, video, canvas, …); other boxes have none.
    if (set('object-fit', 'fill') && !['img', 'video', 'canvas', 'iframe', 'embed', 'object', 'svg', 'input'].includes(box.tag)) reasons.push(['object-fit', `a <${box.tag}> is not a replaced element (put it on the img or video)`]);
    // An img sized on one axis by its own ratio (aspect-ratio auto, or auto w/h from its attributes: the loaded
    // file's ratio wins) with no min/max size on that axis has the image's shape: object-fit has nothing to fit.
    const ownRatio = /^auto(?:\s|$)/.test(String(style['aspect-ratio'] ?? 'auto'));
    const follows = axis => style[`${axis}-size`] === 'auto' && ['auto', '0', '0px'].includes(String(style[`min-${axis}-size`])) && style[`max-${axis}-size`] === 'none';
    if (set('object-fit', 'fill') && box.tag === 'img' && ownRatio && (follows('block') || follows('inline'))) reasons.push(['object-fit', `its ${follows('block') ? 'height' : 'width'} follows the image's own ratio, so the image already fills its box exactly (object-fit needs a box of another shape: a fixed width and height, or aspect-ratio)`]);
    // F39: object-position places the content inside the box when object-fit leaves room or crops (contain, cover,
    // none, scale-down); with fill the content is stretched to the whole box, so there is nothing to place (measured
    // in Chromium, Firefox and WebKit).
    if (style.$sources?.['object-position'] && !['50% 50%', 'center', 'center center', 'initial', 'unset', 'revert', 'revert-layer', 'inherit'].includes(String(style['object-position'])) && ['img', 'video', 'canvas', 'iframe', 'embed', 'object', 'svg', 'input'].includes(box.tag) && String(style['object-fit']) === 'fill')
      reasons.push(['object-position', 'object-fit is fill, so the image is stretched to the whole box and there is nothing to place; set object-fit: cover or contain']);
    // order reorders grid and flex items; children in block flow keep the source order.
    if (inFlow && parentDisplay === 'block' && set('order', '0')) reasons.push(['order', `its parent ${parents.at(-1).box.label} is display: block, not grid or flex, so the boxes keep the source order`]);
    // table-layout chooses the column algorithm of a table box.
    if (set('table-layout', 'auto') && box.tag !== 'table' && !['table', 'inline-table'].includes(style.display)) reasons.push(['table-layout', `it is display: ${style.$blockFlow ? 'block' : style.display}, not table`]);
    // list-style-type draws the marker of a list item; it is inherited, so on a list it styles the items. A box that
    // is not a list item and has no descendants has no marker to style.
    const ownSource = key => { const a = style.$sources?.[key], b = parents.at(-1)?.style.$sources?.[key]; return a && !(b && a.file === b.file && a.line === b.line && a.selector === b.selector); };
    if (set('list-style-type', 'disc') && ownSource('list-style-type') && !style.$listItem && style.display !== 'list-item' && !(box.children ?? []).length && !box.inline?.length && !['ul', 'ol', 'menu', 'li', 'summary'].includes(box.tag)) reasons.push(['list-style-type', 'it is not a list item (display: list-item) and has no items in it']);
    // overscroll-behavior and scroll-snap-type act on a scroll container (the root's apply to the viewport).
    const scrolls = ['overflow-x', 'overflow-y'].some(key => !['visible', 'clip'].includes(String(style[key])));
    if (!scrolls && !['html', 'body'].includes(box.tag)) {
      for (const key of ['overscroll-behavior-x', 'overscroll-behavior-y']) if (set(key, 'auto')) reasons.push([key, `it is not a scroll container (overflow ${style['overflow-x']} ${style['overflow-y']})`]);
      if (set('scroll-snap-type', 'none')) reasons.push(['scroll-snap-type', `it is not a scroll container (overflow ${style['overflow-x']} ${style['overflow-y']}); set overflow: auto on it, or put the snap type on the box that scrolls`]);
    }
    // content: a string on an element (not ::before or ::after) generates nothing (measured: Chromium shows the
    // element's own children, and an empty one stays 0px wide); only url() replaces an element, which is not modeled.
    if (!box.pseudo && style.$sources?.content && !['none', undefined].includes(style.content)) reasons.push(['content', 'a string in content is drawn only in ::before and ::after; on the element itself it shows nothing; put it on ::before or ::after']);
    // A table cell has no margins (CSS 2.2 §17.5: they do not apply to table cells; measured).
    if (box.tableCell) for (const side of ['top', 'right', 'bottom', 'left']) if (style.$sources?.[`margin-${side}`] && !['0', '0px', 'auto'].includes(String(style[`margin-${side}`]))) reasons.push([`margin-${side}`, 'it is a table cell, which has no margins; space cells with border-spacing on the table, or pad the cell']);
    // scroll-padding insets the snapport of a scroll container; the viewport takes the root's, not body's (measured:
    // body { scroll-padding-top } does not move where scrollIntoView or a #fragment lands; html's does).
    if (!scrolls && box.tag !== 'html') for (const side of ['top', 'right', 'bottom', 'left']) {
      const key = `scroll-padding-${side}`;
      if (style.$sources?.[key] && !['auto', '0', '0px'].includes(String(style[key]))) reasons.push([key, box.tag === 'body' ? 'the viewport takes its scroll-padding from html, not body; set it on html' : `it is not a scroll container (overflow ${style['overflow-x']} ${style['overflow-y']}); set it on the box that scrolls, or on html for the page`]);
    }
    // scroll-snap-align snaps the box in its snap container, the nearest scrolling ancestor (the viewport, whose
    // snap type is the root's, when none scrolls): with scroll-snap-type none there it never snaps.
    if (set('scroll-snap-align', 'none')) {
      const scroller = [...parents].reverse().find(p => p.box.tag === 'html' || ['overflow-x', 'overflow-y'].some(key => !['visible', 'clip'].includes(String(p.style[key]))));
      if (scroller && String(scroller.style['scroll-snap-type'] ?? 'none') === 'none') reasons.push(['scroll-snap-align', `its scroll container ${scroller.box.tag === 'html' ? '(the viewport)' : scroller.box.label} has no scroll-snap-type, so it never snaps; set scroll-snap-type on ${scroller.box.tag === 'html' ? 'html' : 'it'}`]);
    }
    // F80: overflow-wrap only adds break points where lines may wrap; nowrap and pre never wrap, so it does nothing
    // (measured in Chromium, Firefox and WebKit). Descendants inherit it, so only a box with no element inside is checked.
    if (set('overflow-wrap', 'normal') && ['nowrap', 'pre'].includes(String(style['white-space'])) && !box.children.some(child => !child.anonymous)) reasons.push(['overflow-wrap', `its white-space is ${style['white-space']}, so its lines never wrap and there is nothing to break (use white-space: normal, or text-overflow: ellipsis to mark the cut)`]);
    // F81: column-span takes a box out of its multi-column container's columns; with none above it there is nothing to span.
    if (set('column-span', 'none')) reasons.push(['column-span', 'it is not inside a multi-column container (column-count or column-width), so there are no columns to span'])
    // F83: transform-origin is the fixed point of a transform; a box that no rule transforms in any state (and that no
    // animation moves) never uses it (measured in Chromium, Firefox and WebKit). An SVG element can be transformed by its
    // transform attribute, so it is not checked; a rule whose selector cannot be read without its states counts as moving it.
    if (style.$sources?.['transform-origin'] && !box.pseudo && box.tag !== 'svg' && !parents.some(p => p.box.tag === 'svg')
      && ['transform', 'translate', 'rotate', 'scale'].every(key => [undefined, 'none'].includes(style[key])) && String(style['animation-name'] ?? 'none') === 'none'
      && !rules.some(rule => (rule.declarations ?? []).some(d => ['transform', 'translate', 'rotate', 'scale', 'animation', 'animation-name'].includes(d.property) && !['none', 'initial', 'unset', 'revert', 'revert-layer'].includes(String(d.value).trim()))
        && (rule.selectors ?? []).some(sel => { try { return matches(compileSelector(String(sel.source).replace(dynamicStates, '')), box); } catch { return true; } })))
      reasons.push(['transform-origin', 'no rule gives it a transform (transform, translate, rotate or scale) in any state, so there is nothing to place the origin of']);
    // F88: list-style-position places the marker of a list item; an element that is not one, with nothing inside to inherit
    // it, has no marker (measured in Chromium, Firefox and WebKit).
    if (set('list-style-position', 'outside') && ownSource('list-style-position') && !style.$listItem && style.display !== 'list-item' && !(box.children ?? []).length && !box.inline?.length && !['ul', 'ol', 'menu', 'li', 'summary'].includes(box.tag)) reasons.push(['list-style-position', 'it is not a list item (display: list-item) and has no items in it, so there is no marker to place']);
    // F104: likewise list-style-image (measured in Chromium, Firefox and WebKit).
    if (set('list-style-image', 'none') && ownSource('list-style-image') && !style.$listItem && style.display !== 'list-item' && !(box.children ?? []).length && !box.inline?.length && !['ul', 'ol', 'menu', 'li', 'summary'].includes(box.tag)) reasons.push(['list-style-image', 'it is not a list item (display: list-item) and has no items in it, so there is no marker to draw']);
    if (set('resize', 'none')) reasons.push(['resize', `its overflow is ${style['overflow-x']} ${style['overflow-y']}, and only a box whose overflow is not visible can be resized; set overflow: auto on it`]);
    if (set('line-clamp', 'none') && style.$lineClamp === undefined && !['-webkit-box', '-webkit-inline-box'].includes(style.display)) reasons.push(['line-clamp', `it is display: ${style.display}, not -webkit-box`]);
    if (reasons.length) layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: reasons.map(r => r[0]),
      css: reasons.map(([key]) => ({ property: key, file: style.$sources[key].file, line: style.$sources[key].line, selector: style.$sources[key].selector })),
      message: `${box.label}: ${reasons.map(([key, why]) => `${key}: ${style.$inertMain?.property === key ? style.$inertMain.value : (style.$blockFlow && /gap$/.test(key)) || (reasons.find(r => r[0] === key)?.[1] === 'it is display: block, not flex or grid') ? style.$sources[key].specified : key === 'content' ? (String(style.content).startsWith('text:') ? JSON.stringify(String(style.content).slice(5)) : '""') : String(style[key]).replace(/^area:/, '')} has no effect (${why})`).join('; ')}`, ...ranges(region) });
  };
}
