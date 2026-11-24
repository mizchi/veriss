// React (JSX) adapter for @mizchi/veriss, with the style systems that leave a static stylesheet: StyleX
// (stylex.create + stylex.props) and Linaria (css`` and styled.tag``), plus plain className strings with an external
// stylesheet. The JSX a component returns is a family of DOM trees: `cond && <X/>`, `cond ? <A/> : <B/>`, `xs.map(…)`
// item counts, and conditional class or style arguments are choices; the core (adapter-core) analyses every state.
//
// StyleX semantics: stylex.props(a, b, …) merges per property, the later argument winning, whatever the order of
// definition; a value may be an object of conditions ({default, ':hover', '@media …'}). Each element state gets one
// class holding its merged declarations, so the cascade sees what StyleX would apply. Linaria: a css`` template is a
// class rule in definition order (nesting with & and @media blocks is flattened); styled.tag`` is that tag with it.
//
// Unknown (never verified): components other than styled ones, children/props rendered from outside, dynamic class
// names or style objects of other shapes, StyleX values that are not static literals, Linaria interpolations,
// spreads other than stylex.props, and more states than maxStates.
import { parse } from '@babel/parser';
import postcss from 'postcss';
import { product, merge, choose, conditionKey, analyzeStates, scopeEscapes, boundary, literalUnionProps, propsMembers, literalChoicesAgree, lowerNested, relocateSelectorWarnings } from '@mizchi/veriss-adapter-core';
import { loadModule, binding, styledTag, evaluateStyled, symbolOf, symbolInfo, styledClass } from './styled-components.mjs';

const escapeText = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = s => escapeText(s).replace(/"/g, '&quot;');
const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const kebab = name => name.startsWith('--') ? name : name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`).replace(/^ms-/, '-ms-');
// Numbers StyleX (and React's style prop) keep unitless; other numbers are px.
const unitless = new Set(['animationIterationCount', 'aspectRatio', 'flex', 'flexGrow', 'flexShrink', 'fontWeight', 'lineHeight', 'opacity', 'order', 'orphans', 'widows', 'zIndex', 'zoom', 'gridRow', 'gridColumn', 'gridRowStart', 'gridRowEnd', 'gridColumnStart', 'gridColumnEnd', 'columnCount', 'fillOpacity', 'strokeOpacity', 'tabSize']);
const cssValue = (prop, v) => typeof v === 'number' ? (v === 0 || unitless.has(prop) ? String(v) : `${v}px`) : String(v);
// SVG presentation props are camelCase in JSX and hyphenated in the markup (React's attribute names); viewBox and
// preserveAspectRatio keep their case.
const svgAttr = name => /^(?:stroke|fill|clip|font|text|stop|flood|lighting|marker|color|dominant|alignment|baseline|glyph|horiz|vert|underline|overline|strikethrough|word|letter|shape|image|pointer|paint|vector|enable)[A-Z]/.test(name) ? name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`) : name === 'xlinkHref' ? 'xlink:href' : null;
const attrName = name => svgAttr(name) ?? ({ className: 'class', htmlFor: 'for', tabIndex: 'tabindex', autoFocus: 'autofocus', readOnly: 'readonly', maxLength: 'maxlength', colSpan: 'colspan', rowSpan: 'rowspan', srcSet: 'srcset', autoComplete: 'autocomplete', autoPlay: 'autoplay', playsInline: 'playsinline', crossOrigin: 'crossorigin', dateTime: 'datetime', encType: 'enctype', inputMode: 'inputmode' })[name] ?? name;
const hash = text => { let h = 5381; for (const c of text) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return h.toString(36); };

// A static literal value (StyleX objects, style props): strings, numbers, null, nested objects, negative numbers.
function literal(node) {
  if (!node) return undefined;
  if (node.type === 'StringLiteral' || node.type === 'NumericLiteral') return node.value;
  if (node.type === 'NullLiteral') return null;
  if (node.type === 'UnaryExpression' && node.operator === '-' && node.argument.type === 'NumericLiteral') return -node.argument.value;
  if (node.type === 'TemplateLiteral' && !node.expressions.length) return node.quasis[0].value.cooked;
  if (node.type === 'ObjectExpression') {
    const out = {};
    for (const p of node.properties) {
      if (p.type !== 'ObjectProperty' || p.computed) return undefined;
      const key = p.key.type === 'Identifier' ? p.key.name : p.key.type === 'StringLiteral' ? p.key.value : undefined;
      const value = literal(p.value);
      if (key === undefined || value === undefined) return undefined;
      out[key] = value;
    }
    return out;
  }
  return undefined;
}

// Linaria: a css`` template's text as class rules: & is the class, nested @media and & blocks are lifted out.
function linariaRules(className, text) {
  const root = postcss.parse(`.${className}{${text}}`);
  const out = [];
  const walk = (rule, selector, media) => {
    const decls = rule.nodes.filter(n => n.type === 'decl').map(d => `${d.prop}:${d.value}${d.important ? ' !important' : ''}`);
    if (decls.length) out.push(media ? `@media ${media}{${selector}{${decls.join(';')}}}` : `${selector}{${decls.join(';')}}`);
    for (const n of rule.nodes) {
      if (n.type === 'rule') walk(n, n.selector.includes('&') ? n.selector.replace(/&/g, selector) : `${selector} ${n.selector}`, media);
      else if (n.type === 'atrule' && n.name === 'media') walk(n, selector, media ? `${media} and ${n.params}` : n.params);
    }
  };
  walk(root.nodes[0], `.${className}`, null);
  return out.join('');
}

/**
 * Enumerate a React component's DOM states.
 * @param {string} source a module (JSX/TSX) whose default export (or `component`) is a function component
 * @param {{component?: string, maxStates?: number, eachCounts?: number[]}} options
 */
// inject (internal, styled(Component)): the component rendered by a styled wrapper, with the wrapper's classes as its
// className, the wrapper's children, and the props the wrapper was given ({v, choices} variants; v a literal or a symbol).
export function expandReact(source, { component, maxStates = 64, eachCounts = [0, 1, 2], sourceLines = false, theme, file = 'component', resolveModule, inject } = {}) {
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  // styled-components (imported from 'styled-components'): evaluated per element from the props it passes.
  // Imported styled modules are read through options.resolveModule(specifier, importerFile).
  const sc = loadModule({ file, source, ast }, resolveModule), scBlocks = inject?.blocks ?? new Map();
  let restName = null;
  const unknowns = [], assumptions = new Set();
  const unknown = (code, message) => { if (!unknowns.some(u => u.message === message)) unknowns.push({ code, message }); };
  const limit = { maxStates, onLimit: max => unknown('U_REACT_STATES', `more than ${max} component states; raise maxStates or split the component`) };
  const empty = [{ html: '', choices: {} }];
  // Props typed as a union of string or number literals (status: 'Active' | 'Pending review'): their text is one of
  // those values, a state each (the choice is the prop's value).
  let literalProps = new Map(), propsName = null; const defaultProps = new Map();
  const text = node => source.slice(node.start, node.end);
  const choice = (node, value) => { const { key, negate } = conditionKey(text(node)); return choose(key, value !== negate); };

  // Module-level styles: stylex.create objects, Linaria css`` classes and styled components.
  const stylex = new Map(), linaria = new Map(), styled = new Map(), constants = new Map(), cssText = [];
  for (const stmt of ast.program.body) {
    const decls = stmt.type === 'VariableDeclaration' ? stmt.declarations : stmt.type === 'ExportNamedDeclaration' && stmt.declaration?.type === 'VariableDeclaration' ? stmt.declaration.declarations : [];
    for (const d of decls) {
      const init = d.init, name = d.id?.name;
      if (!init || !name) continue;
      // A module-level constant (a string, number or object of them) that Linaria templates may interpolate.
      if (stmt.kind === 'const' || stmt.declaration?.kind === 'const') { const value = literal(init); if (value !== undefined && value !== null) constants.set(name, value); }
      if (sc.defs.has(name) || sc.fragments.has(name)) continue;
      if (init.type === 'CallExpression' && text(init.callee) === 'stylex.create') {
        const value = literal(init.arguments[0]);
        if (value === undefined) { unknown('U_STYLEX_DYNAMIC', `stylex.create for ${name} is not a static literal`); continue; }
        stylex.set(name, value);
      } else if (init.type === 'TaggedTemplateExpression' && (text(init.tag) === 'css' || /^styled\.\w+$/.test(text(init.tag)) || (init.tag.type === 'CallExpression' && text(init.tag.callee) === 'styled'))) {
        // Interpolations Linaria evaluates at build time from the module: constants (strings, numbers, object
        // members), a css`` class (its bare name, as Linaria inserts it) and a styled component (.its-class). Others
        // (functions of props, imports) are Unknown.
        const evaluate = node => {
          if (node.type === 'Identifier') {
            if (constants.has(node.name) && ['string', 'number'].includes(typeof constants.get(node.name))) return String(constants.get(node.name));
            if (linaria.has(node.name)) return linaria.get(node.name);
            if (styled.has(node.name)) return `.${styled.get(node.name).className}`;
            return undefined;
          }
          if (node.type === 'MemberExpression') {
            const path = [];
            let n = node;
            while (n.type === 'MemberExpression') { const key = !n.computed ? n.property.name : n.property.type === 'StringLiteral' || n.property.type === 'NumericLiteral' ? n.property.value : undefined; if (key === undefined) return undefined; path.unshift(key); n = n.object; }
            if (n.type !== 'Identifier' || !constants.has(n.name)) return undefined;
            let value = constants.get(n.name);
            for (const key of path) { if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) return undefined; value = value[key]; }
            return ['string', 'number'].includes(typeof value) ? String(value) : undefined;
          }
          const value = literal(node);
          return ['string', 'number'].includes(typeof value) ? String(value) : undefined;
        };
        const parts = init.quasi.expressions.map(evaluate);
        const failed = init.quasi.expressions.find((e, i) => parts[i] === undefined);
        if (failed) { unknown('U_LINARIA_INTERPOLATION', `${name}: the interpolation \${${text(failed)}} in a Linaria template is not a module constant or class`); continue; }
        const body = init.quasi.quasis.map((q, i) => q.value.cooked + (parts[i] ?? '')).join('');
        const className = `lx-${name}`;
        cssText.push(linariaRules(className, body));
        if (text(init.tag) === 'css') linaria.set(name, className);
        else styled.set(name, { tag: init.tag.type === 'MemberExpression' ? init.tag.property.name : literal(init.tag.arguments[0]), className });
      }
    }
  }

  // StyleX: the merged declarations of a list of style refs, as one class and its rules.
  const stylexRules = new Map();
  const stylexClass = refs => {
    const merged = {};
    for (const [ns, key] of refs) {
      const block = stylex.get(ns)?.[key];
      if (!block) { unknown('U_STYLEX_REF', `${ns}.${key} is not a static stylex.create entry`); continue; }
      Object.assign(merged, block);
    }
    const id = `sx-${hash(JSON.stringify(merged))}`;
    if (!stylexRules.has(id)) {
      const base = [], conditional = [];
      for (const [prop, value] of Object.entries(merged)) {
        if (value === null) continue;
        if (typeof value === 'object') {
          for (const [cond, v] of Object.entries(value)) {
            if (v === null) continue;
            const decl = `${kebab(prop)}:${cssValue(prop, v)}`;
            if (cond === 'default') base.push(decl);
            else if (cond.startsWith(':')) conditional.push(`.${id}${cond}{${decl}}`);
            else if (cond.startsWith('@media') || cond.startsWith('@container') || cond.startsWith('@supports')) conditional.push(`${cond}{.${id}{${decl}}}`);
            else unknown('U_STYLEX_CONDITION', `StyleX condition ${cond} is not modeled`);
          }
        } else base.push(`${kebab(prop)}:${cssValue(prop, value)}`);
      }
      // StyleX gives a longhand priority over a shorthand that sets it (paddingBottom over padding), whatever their
      // order: such longhands go into a second rule of higher specificity, so the shorthand never overrides them and
      // no rule writes the same property twice.
      const nameOf = decl => decl.slice(0, decl.indexOf(':'));
      const extra = { gap: ['row-gap', 'column-gap'], inset: ['top', 'right', 'bottom', 'left'], 'place-items': ['align-items', 'justify-items'], 'place-content': ['align-content', 'justify-content'], 'place-self': ['align-self', 'justify-self'], overflow: ['overflow-x', 'overflow-y'] };
      const shorthands = new Set(base.map(nameOf));
      const longhandOfPresent = name => [...shorthands].some(sh => sh !== name && (name.startsWith(`${sh}-`) || extra[sh]?.includes(name)));
      const strong = base.filter(decl => longhandOfPresent(nameOf(decl))), weak = base.filter(decl => !longhandOfPresent(nameOf(decl)));
      stylexRules.set(id, `.${id}{${weak.join(';')}}${strong.length ? `.${id}.${id}{${strong.join(';')}}` : ''}${conditional.join('')}`);
    }
    return id;
  };
  // A stylex.props argument: refs variants.
  const refVariants = node => {
    if (!node || node.type === 'NullLiteral' || (node.type === 'Identifier' && node.name === 'undefined') || (node.type === 'BooleanLiteral' && !node.value)) return [{ refs: [], choices: {} }];
    if (node.type === 'MemberExpression' && node.object.type === 'Identifier' && stylex.has(node.object.name)) return [{ refs: [[node.object.name, node.property.name ?? node.property.value]], choices: {} }];
    if (node.type === 'LogicalExpression' && node.operator === '&&') return [...refVariants(node.right).map(v => ({ ...v, choices: merge(v.choices, choice(node.left, true)) })), { refs: [], choices: choice(node.left, false) }].filter(v => v.choices);
    if (node.type === 'ConditionalExpression') return [...refVariants(node.consequent).map(v => ({ ...v, choices: merge(v.choices, choice(node.test, true)) })), ...refVariants(node.alternate).map(v => ({ ...v, choices: merge(v.choices, choice(node.test, false)) }))].filter(v => v.choices);
    if (node.type === 'ArrayExpression') return node.elements.reduce((acc, el) => acc.flatMap(l => refVariants(el).map(r => { const choices = merge(l.choices, r.choices); return choices && { refs: [...l.refs, ...r.refs], choices }; }).filter(Boolean)), [{ refs: [], choices: {} }]);
    unknown('U_STYLEX_ARGUMENT', `stylex.props argument ${text(node)} is not a static style or a condition of one`);
    return [{ refs: [], choices: {} }];
  };
  // A className expression: class-list variants (strings, Linaria classes, ternaries, &&, cx/clsx/classNames calls).
  const classVariants = node => {
    if (!node) return [{ classes: [], choices: {} }];
    if (node.type === 'StringLiteral') return [{ classes: node.value.split(/\s+/).filter(Boolean), choices: {} }];
    if (node.type === 'TemplateLiteral' && !node.expressions.length) return [{ classes: node.quasis[0].value.cooked.split(/\s+/).filter(Boolean), choices: {} }];
    if (node.type === 'Identifier' && linaria.has(node.name)) return [{ classes: [linaria.get(node.name)], choices: {} }];
    // `${a} ${b} literal`: each expression a whole class list, separated from its neighbours by whitespace (an
    // expression glued to text, as in `btn-${size}`, builds a class name: not a class list).
    if (node.type === 'TemplateLiteral') {
      const q = node.quasis.map(x => x.value.cooked);
      if (q.every((t, i) => (i === 0 || t === '' && i === q.length - 1 || /^\s/.test(t)) && (i === q.length - 1 || i === 0 && t === '' || /\s$/.test(t)))) {
        const parts = [{ classes: q.join(' ').split(/\s+/).filter(Boolean), choices: {} }, ...node.expressions.map(e => classVariants(e))];
        return parts.slice(1).reduce((acc, ps) => acc.flatMap(l => ps.map(r => { const choices = merge(l.choices, r.choices); return choices && { classes: [...l.classes, ...r.classes], choices }; }).filter(Boolean)), [parts[0]]);
      }
    }
    if (node.type === 'NullLiteral' || (node.type === 'BooleanLiteral' && !node.value) || (node.type === 'Identifier' && node.name === 'undefined')) return [{ classes: [], choices: {} }];
    if (node.type === 'LogicalExpression' && node.operator === '&&') return [...classVariants(node.right).map(v => ({ ...v, choices: merge(v.choices, choice(node.left, true)) })), { classes: [], choices: choice(node.left, false) }].filter(v => v.choices);
    if (node.type === 'ConditionalExpression') return [...classVariants(node.consequent).map(v => ({ ...v, choices: merge(v.choices, choice(node.test, true)) })), ...classVariants(node.alternate).map(v => ({ ...v, choices: merge(v.choices, choice(node.test, false)) }))].filter(v => v.choices);
    if (node.type === 'CallExpression' && ['cx', 'clsx', 'classNames', 'classnames'].includes(text(node.callee))) {
      return node.arguments.reduce((acc, arg) => {
        const parts = arg.type === 'ObjectExpression' ? arg.properties.reduce((a, p) => a.flatMap(l => {
          const name = p.key.type === 'Identifier' ? p.key.name : p.key.value;
          return [true, false].map(on => { const choices = merge(l.choices, choice(p.value, on)); return choices && { classes: on ? [...l.classes, name] : l.classes, choices }; }).filter(Boolean);
        }), [{ classes: [], choices: {} }]) : classVariants(arg);
        return acc.flatMap(l => parts.map(r => { const choices = merge(l.choices, r.choices); return choices && { classes: [...l.classes, ...r.classes], choices }; }).filter(Boolean));
      }, [{ classes: [], choices: {} }]);
    }
    if (inject && ((node.type === 'Identifier' && node.name === 'className') || (node.type === 'MemberExpression' && !node.computed && propsName && node.object.type === 'Identifier' && node.object.name === propsName && node.property.name === 'className'))) return [{ classes: inject.classes, choices: {} }];
    unknown('U_REACT_DYNAMIC_CLASS', `className={${text(node)}} is not a literal, a Linaria class or a condition of them`);
    return [{ classes: [], choices: {} }];
  };

  // A styled-components element: its tag (through styled(Base) chains), stable classes, and one class per evaluated
  // CSS of each component in the chain, base first (its rules come first, so the extension wins at equal specificity).
  function styledElement(name, node, def) {
    const chain = [];
    for (let d = def; d; ) {
      chain.unshift(d);
      if (!d.base) break;
      const b = binding(d.mod, d.base);
      if (b?.kind === 'component') { chain[0].baseComponent = b; break; }
      if (b?.kind !== 'def') { unknown('U_STYLED_BASE', `${d.name} extends ${d.base}, which is not a styled component${b?.kind === 'missing' ? ` (${b.message})` : ''}; its markup is analysed with that component`); return null; }
      d = b.def;
    }
    const props = new Map();
    for (const a of node.openingElement.attributes) {
      if (a.type === 'JSXSpreadAttribute') { unknown('U_STYLED_PROPS', `<${name}> spreads ${text(a.argument)}; the props its styles read are not known`); continue; }
      const key = a.name.name, value = a.value?.type === 'JSXExpressionContainer' ? a.value.expression : a.value;
      if (key === 'as' || key === 'forwardedAs') { unknown('U_STYLED_AS', `<${name} ${key}> renders another element`); continue; }
      if (value === null || value === undefined) props.set(key, [{ v: true, choices: {} }]);
      else if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(value.type)) props.set(key, [{ v: value.value, choices: {} }]);
      else if (value.type === 'ConditionalExpression' && [value.consequent, value.alternate].every(e => ['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(e.type))) props.set(key, [true, false].map(on => ({ v: (on ? value.consequent : value.alternate).value, choices: choice(value.test, on) })));
      else { const { key: cond, negate } = conditionKey(text(value)); props.set(key, [{ v: symbolOf(cond, key, negate), choices: {} }]); }
    }
    let lists = [{ classes: [], choices: {} }];
    for (const d of chain) {
      const variants = evaluateStyled(d, props, { theme, literalProps });
      for (const v of variants) for (const u of v.unknowns) unknown(u.code, u.message);
      lists = lists.flatMap(l => variants.map(v => {
        const choices = merge(l.choices, v.choices); if (!choices) return null;
        const cls = styledClass(d.name, v.text);
        if (!scBlocks.has(cls)) scBlocks.set(cls, { selector: `.${cls}`, text: v.text, origin: { file: d.mod.file, line: d.line, lines: v.lines, name: d.name } });
        return { classes: [...l.classes, cls], choices };
      }).filter(Boolean));
    }
    const base = chain[0].baseComponent;
    delete chain[0].baseComponent;
    if (!base) return { tag: chain[0].tag, baseClasses: chain.map(d => `sc-${d.name}`), scLists: lists };
    // styled(Component): that component rendered with these classes as its className, these children and props
    const inner = children(node.children);
    const html = lists.flatMap(l => {
      const rendered = expandReact(base.mod.source, { component: base.name, file: base.mod.file, theme, resolveModule, maxStates, eachCounts, sourceLines,
        inject: { classes: [...chain.map(d => `sc-${d.name}`).flatMap((c, i) => [c, l.classes[i]])], children: inner, props, blocks: scBlocks, prefix: `${chain[0].base}` } });
      for (const u of rendered.unknowns) unknown(u.code, `${chain[0].base}: ${u.message}`);
      for (const a of rendered.assumptions) assumptions.add(a);
      return rendered.states.map(st => { const choices = merge(l.choices, st.choices); return choices && { html: st.html, choices }; }).filter(Boolean);
    });
    return { html };
  }

  function element(node) {
    const name = node.openingElement.name;
    let tag = name.type === 'JSXIdentifier' ? name.name : text(name), baseClasses = [], scLists = null;
    const scTag = /^[A-Z]/.test(tag) ? styledTag(sc, tag) : null;
    if (scTag?.kind === 'missing') { unknown('U_REACT_COMPONENT', `child component <${tag}>: ${scTag.message}`); return [{ html: boundary('component', tag), choices: {} }]; }
    if (scTag) {
      const r = styledElement(tag, node, scTag.def);
      if (!r) return [{ html: boundary('component', tag), choices: {} }];
      if (r.html) return r.html;
      ({ tag, baseClasses, scLists } = r);
    } else if (styled.has(tag)) { baseClasses = [styled.get(tag).className]; tag = styled.get(tag).tag; }
    else if (tag === 'Fragment' || tag === 'React.Fragment') return children(node.children);
    else if (/^[A-Z]/.test(tag) || tag.includes('.')) { unknown('U_REACT_COMPONENT', `child component <${tag}>: its markup is analysed with that component, not here`); return [{ html: boundary('component', tag, node.openingElement.attributes.some(a => a.type === 'JSXAttribute' && a.name?.name === 'data-noshift') ? 'data-noshift' : undefined), choices: {} }]; }
    let classLists = [{ classes: [], choices: {} }], refLists = null;
    const statics = [], attrLists = [];
    for (const a of node.openingElement.attributes) {
      if (a.type === 'JSXSpreadAttribute') {
        if (a.argument.type === 'CallExpression' && text(a.argument.callee) === 'stylex.props') {
          refLists = a.argument.arguments.reduce((acc, arg) => acc.flatMap(l => refVariants(arg).map(r => { const choices = merge(l.choices, r.choices); return choices && { refs: [...l.refs, ...r.refs], choices }; }).filter(Boolean)), refLists ?? [{ refs: [], choices: {} }]);
        } else if (inject && a.argument.type === 'Identifier' && (a.argument.name === restName || a.argument.name === propsName)) {
          // the wrapper's props passed on: its className joins this element's classes
          classLists = classLists.map(l => ({ ...l, classes: [...l.classes, ...inject.classes] }));
          assumptions.add(`props spread onto <${tag}> carry the styled wrapper's className; other props are not rendered as attributes`);
        } else unknown('U_REACT_SPREAD', `<${tag}> spreads ${text(a.argument)}; its attributes are not known`);
        continue;
      }
      const key = a.name.type === 'JSXNamespacedName' ? `${a.name.namespace.name}:${a.name.name.name}` : a.name.name;
      // a styled component's transient props ($x) style it and never reach the DOM
      if (scLists && key.startsWith('$')) continue;
      if (/^on[A-Z]/.test(key) || ['key', 'ref', 'children', 'dangerouslySetInnerHTML'].includes(key)) { if (key === 'dangerouslySetInnerHTML') unknown('U_REACT_HTML', 'dangerouslySetInnerHTML inserts markup that is not known statically'); continue; }
      const value = a.value?.type === 'JSXExpressionContainer' ? a.value.expression : a.value;
      if (key === 'className') { const variants = classVariants(value); classLists = classLists.flatMap(l => variants.map(v => { const choices = merge(l.choices, v.choices); return choices && { classes: [...l.classes, ...v.classes], choices }; })).filter(Boolean); continue; }
      if (key === 'style') {
        const obj = literal(value);
        if (obj && typeof obj === 'object') statics.push(` style="${escapeAttr(Object.entries(obj).filter(([, v]) => v !== null).map(([p, v]) => `${kebab(p)}: ${cssValue(p, v)}`).join('; '))}"`);
        else unknown('U_REACT_DYNAMIC_STYLE', `<${tag}> has a dynamic style={${text(value)}}`);
        continue;
      }
      if (value === null) { statics.push(` ${attrName(key)}`); continue; }
      if (value.type === 'StringLiteral' || value.type === 'NumericLiteral') { statics.push(` ${attrName(key)}="${escapeAttr(String(value.value))}"`); continue; }
      if (value.type === 'BooleanLiteral') { if (value.value) statics.push(` ${attrName(key)}${/^(?:aria|data)-/.test(key) ? '="true"' : ''}`); else if (/^(?:aria|data)-/.test(key)) statics.push(` ${attrName(key)}="false"`); continue; }
      if (value.type === 'ConditionalExpression' && [value.consequent, value.alternate].every(e => ['StringLiteral', 'NumericLiteral'].includes(e.type))) {
        attrLists.push([true, false].map(v => ({ html: ` ${attrName(key)}="${escapeAttr(String((v ? value.consequent : value.alternate).value))}"`, choices: choice(value.test, v) })));
        continue;
      }
      // A boolean expression (a comparison or a negation): an aria-/data- attribute renders "true" or "false", a boolean
      // HTML attribute is present or absent; each value is a state on the condition (shared with classes on it).
      const booleanValued = (value.type === 'BinaryExpression' && ['===', '!==', '==', '!=', '<', '>', '<=', '>='].includes(value.operator)) || (value.type === 'UnaryExpression' && value.operator === '!');
      const booleanAttrs = ['disabled', 'checked', 'hidden', 'required', 'readOnly', 'open', 'inert', 'selected', 'multiple', 'autoFocus'];
      if (booleanValued && (/^(?:aria|data)-/.test(key) || booleanAttrs.includes(key))) {
        attrLists.push([true, false].map(v => ({ html: /^(?:aria|data)-/.test(key) ? ` ${attrName(key)}="${v}"` : v ? ` ${attrName(key)}` : '', choices: choice(value, v) })));
        continue;
      }
      assumptions.add(`dynamic attribute ${key} on <${tag}> is rendered with a non-empty placeholder value`);
      statics.push(` ${attrName(key)}="dynamic"`);
    }
    const own = [];
    for (const c of classLists) for (const r of refLists ?? [null]) for (const at of product(attrLists)) for (const s of scLists ?? [null]) {
      let choices = merge(c.choices, at.choices); if (r) choices = choices && merge(choices, r.choices); if (s) choices = choices && merge(choices, s.choices); if (!choices) continue;
      const list = [...baseClasses, ...(s ? s.classes : []), ...c.classes, ...(r ? [stylexClass(r.refs)] : [])];
      own.push({ open: `<${tag}${list.length ? ` class="${escapeAttr(list.join(' '))}"` : ''}${statics.join('')}${at.html}${sourceLines ? ` data-src-line="${node.loc.start.line}"` : ''}>`, choices });
    }
    const inner = voidTags.has(tag) ? empty : children(node.children);
    const out = [];
    for (const o of own) for (const i of inner) { const choices = merge(o.choices, i.choices); if (choices) out.push({ html: `${o.open}${voidTags.has(tag) ? '' : `${i.html}</${tag}>`}`, choices }); }
    return out;
  }

  // A JSX child expression.
  function expression(node) {
    if (!node || node.type === 'JSXEmptyExpression' || node.type === 'NullLiteral' || node.type === 'BooleanLiteral' || (node.type === 'Identifier' && node.name === 'undefined')) return empty;
    if (node.type === 'JSXElement') return element(node);
    if (node.type === 'JSXFragment') return children(node.children);
    if (node.type === 'StringLiteral' || node.type === 'NumericLiteral') return [{ html: escapeText(String(node.value)), choices: {} }];
    if (node.type === 'LogicalExpression' && node.operator === '&&') return [...expression(node.right).map(v => ({ html: v.html, choices: merge(v.choices, choice(node.left, true)) })), { html: '', choices: choice(node.left, false) }].filter(v => v.choices);
    if (node.type === 'ConditionalExpression') return [...expression(node.consequent).map(v => ({ html: v.html, choices: merge(v.choices, choice(node.test, true)) })), ...expression(node.alternate).map(v => ({ html: v.html, choices: merge(v.choices, choice(node.test, false)) }))].filter(v => v.choices);
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.property.name === 'map') {
      const cb = node.arguments[0], body = cb?.body?.type === 'BlockStatement' ? cb.body.body.find(s => s.type === 'ReturnStatement')?.argument : cb?.body;
      if (!body) { unknown('U_REACT_MAP', `${text(node)}: the map callback does not return JSX directly`); return empty; }
      const key = `#map ${text(node.callee.object)}`;
      assumptions.add(`.map() is checked at ${eachCounts.join(', ')} items, all items taking the same branch choices`);
      const item = expression(body);
      return eachCounts.flatMap(n => item.map(v => ({ html: v.html.repeat(n), choices: merge(v.choices, choose(key, n)) }))).filter(v => v.choices);
    }
    // {children} / {props.children}: what the caller passes, assumed to be text but marked as the caller's content.
    const literalName = node.type === 'Identifier' ? node.name : node.type === 'MemberExpression' && !node.computed && propsName && node.object.type === 'Identifier' && node.object.name === propsName ? node.property.name : null;
    if (node.type === 'Identifier' && defaultProps.has(node.name)) return [{ html: escapeText(String(defaultProps.get(node.name))), choices: choose(`${node.name} given`, false) }, { html: '…', choices: choose(`${node.name} given`, true) }];
    if (inject && literalName === 'children') return inject.children;
    if (literalName && literalProps.has(literalName)) return literalProps.get(literalName).map(value => ({ html: escapeText(String(value)), choices: choose(literalName, value) }));
    if (['Identifier', 'MemberExpression', 'TemplateLiteral', 'CallExpression', 'OptionalMemberExpression'].includes(node.type)) { assumptions.add('{expression} text is placeholder text; its size comes from the box contracts'); return [{ html: /^(?:props\.)?children$/.test(text(node)) ? `…${boundary('children')}` : '…', choices: {} }]; }
    unknown('U_REACT_EXPRESSION', `the JSX child {${text(node)}} is not modeled`);
    return empty;
  }

  // JSX text follows React's whitespace rules: lines are trimmed and blank lines dropped.
  const jsxText = raw => { if (!/\n/.test(raw)) return raw; const lines = raw.split(/\r?\n/).map((l, i, all) => i === 0 ? l.trimEnd() : i === all.length - 1 ? l.trimStart() : l.trim()).filter(Boolean); return lines.join(' '); };
  function children(nodes) {
    return product((nodes ?? []).map(n => n.type === 'JSXText' ? [{ html: escapeText(jsxText(n.value)), choices: {} }] : n.type === 'JSXExpressionContainer' ? expression(n.expression) : n.type === 'JSXElement' ? element(n) : n.type === 'JSXFragment' ? children(n.children) : empty), limit);
  }

  // The component: the named one, else the default export; its returned JSX.
  const functions = [];
  // forwardRef(fn) / memo(fn) (React.-qualified or not) wrap the component; `x as T` and `x!` are only types.
  const unwrapComponent = node => {
    while (node && ['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'ParenthesizedExpression'].includes(node.type)) node = node.expression;
    if (node?.type === 'CallExpression' && /^(?:React\.)?(?:forwardRef|memo)$/.test(text(node.callee))) return unwrapComponent(node.arguments[0]);
    return node;
  };
  const visitFn = (name, fn) => { fn = unwrapComponent(fn); if (fn && ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(fn.type)) functions.push({ name, fn }); };
  for (const stmt of ast.program.body) {
    const defaultDecl = stmt.type === 'ExportDefaultDeclaration' ? unwrapComponent(stmt.declaration) : null;
    if (defaultDecl && defaultDecl.type !== 'Identifier') visitFn('default', defaultDecl);
    if (defaultDecl?.type === 'Identifier') functions.push({ name: 'default', ref: defaultDecl.name });
    const decl = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt;
    if (decl?.type === 'FunctionDeclaration') visitFn(decl.id.name, decl);
    if (decl?.type === 'VariableDeclaration') for (const d of decl.declarations) visitFn(d.id.name, d.init);
  }
  let target = component ? functions.find(f => f.name === component) : functions.find(f => f.name === 'default');
  if (target?.ref) target = functions.find(f => f.name === target.ref);
  if (!target) { unknown('U_REACT_COMPONENT_NOT_FOUND', `no component ${component ?? 'default export'} in the module`); return { states: [], css: '', unknowns, assumptions: [] }; }
  // The props' type: an inline type literal or a local type alias / interface.
  const param = target.fn.params?.[0];
  // Destructured without renaming ({ status }) or read as props.status.
  const local = param?.type === 'ObjectPattern' ? new Set(param.properties.filter(p => p.type === 'ObjectProperty' && p.key.type === 'Identifier' && p.value.type === 'Identifier' && p.key.name === p.value.name).map(p => p.key.name)) : null;
  if (param?.type === 'Identifier') propsName = param.name;
  if (param?.type === 'ObjectPattern') restName = param.properties.find(p => p.type === 'RestElement')?.argument.name ?? null;
  literalProps = literalUnionProps(propsMembers(param?.typeAnnotation?.typeAnnotation, ast.program.body), name => Boolean(propsName) || Boolean(local?.has(name)));
  // A prop with a literal default ({ label = 'Save changes' }): its default is a state of its own (the prop left out).
  for (const p of param?.type === 'ObjectPattern' ? param.properties : []) if (p.type === 'ObjectProperty' && p.key.type === 'Identifier' && p.value.type === 'AssignmentPattern' && p.value.left.type === 'Identifier' && p.value.left.name === p.key.name && ['StringLiteral', 'NumericLiteral'].includes(p.value.right.type) && !literalProps.has(p.key.name)) defaultProps.set(p.key.name, p.value.right.value);
  if (defaultProps.size) assumptions.add(`props with a literal default (${[...defaultProps.keys()].join(', ')}) are checked with that default and with placeholder text for any other value`);
  if (literalProps.size) assumptions.add(`text of props typed as literal unions (${[...literalProps.keys()].join(', ')}) is each of their values`);
  const body = target.fn.body.type === 'BlockStatement' ? target.fn.body.body.filter(s => s.type === 'ReturnStatement').at(-1)?.argument : target.fn.body;
  if (target.fn.body.type === 'BlockStatement' && target.fn.body.body.filter(s => s.type === 'ReturnStatement').length > 1) unknown('U_REACT_EARLY_RETURN', 'the component returns early; only its last return is modeled');
  // A comparison of a literal prop (status === 'Active', status !== 'Active') agrees with the prop's chosen value.
  const consistent = choices => literalChoicesAgree(choices, literalProps);
  let states = body ? expression(body.type === 'ParenthesizedExpression' ? body.expression : body).filter(v => consistent(v.choices)).map(v => ({ html: v.html.trim(), choices: v.choices })) : [];
  // Rendered by a styled wrapper: a condition on a prop the wrapper passed agrees with what it passed (a literal decides
  // it; an expression is the wrapper's own condition); other conditions are this component's, named apart.
  if (inject) states = states.flatMap(st => Object.entries(st.choices).reduce((acc, [key, held]) => acc.flatMap(a => {
    const given = inject.props.get(key);
    if (!given) { const choices = merge(a.choices, choose(`${inject.prefix}:${key}`, held)); return choices ? [{ ...a, choices }] : []; }
    return given.flatMap(g => {
      const sym = symbolInfo(g.v);
      const own = sym ? choose(sym.key, typeof held === 'boolean' ? held !== sym.negate : held) : null;
      if (!sym && (typeof held === 'boolean' ? Boolean(g.v) !== held : g.v !== held)) return [];
      const choices = merge(merge(a.choices, g.choices) ?? {}, own ?? {});
      return choices && merge(a.choices, g.choices) ? [{ ...a, choices }] : [];
    });
  }), [{ html: st.html, choices: {} }]));
  // Linaria's css is global: a class is unique to the component, but a nested selector's other compounds are not
  // pinned (E_SCOPE_REACHES); :global(…) reaches past the component (E_SCOPE_ESCAPE) and is unwrapped for the analysis.
  const linariaCSS = cssText.join('\n');
  // a component rendered by a styled wrapper leaves its blocks to the wrapper's expansion, which lowers them all once
  // only the variants some state renders (a variant whose choices no state keeps would be dead CSS of the analysis)
  const rendered = new Set(states.flatMap(st => [...st.html.matchAll(/ class="([^"]*)"/g)].flatMap(m => m[1].split(' '))));
  const live = [...scBlocks.entries()].filter(([cls]) => rendered.has(cls)).map(([, b]) => b);
  const lowered = live.length && !inject ? lowerNested(live) : null;
  const owned = [...linaria.values(), ...[...styled.values()].map(v => v.className)];
  const scope = owned.length ? { mode: 'global', owned, escapes: scopeEscapes(linariaCSS, ['global']) } : undefined;
  return { states, css: [linariaCSS.replace(/:global\(([^()]*)\)/g, '$1'), ...stylexRules.values(), ...(lowered ? [lowered.css] : [])].join('\n'), unknowns, assumptions: [...assumptions], ...(scope ? { scope } : {}), ...(lowered ? { styleMap: lowered.map, styleCSS: lowered.css } : {}) };
}

/**
 * Analyse every state of a React component.
 * @param {string} source the module
 * @param {object} options veriss options plus pageCSS, page, css (an external stylesheet for plain classNames),
 *   component, maxStates, eachCounts
 */
export function analyzeReact(source, { component, maxStates, eachCounts, sourceLines, theme, file, resolveModule, css = '', ...options } = {}) {
  const expanded = expandReact(source, { component, maxStates, eachCounts, sourceLines, theme, file, resolveModule });
  // An external stylesheet is the page's, not the component's: with a component scope it goes before the component CSS.
  const scoped = Boolean(expanded.scope && css);
  const pageCSS = scoped ? `${options.pageCSS ?? ''}\n${css}` : options.pageCSS ?? '';
  const componentCSS = scoped ? expanded.css : css + expanded.css;
  const report = analyzeStates({ ...expanded, css: componentCSS }, { ...options, pageCSS });
  // styled-components selectors are reported at their template lines, with the nesting edge they assume
  if (expanded.styleMap && report.selectors) {
    const all = expanded.scope ? `${pageCSS}\n${componentCSS}` : pageCSS + componentCSS;
    const offset = all.slice(0, all.lastIndexOf(expanded.styleCSS)).split('\n').length - 1;
    report.selectors = { ...report.selectors, warnings: relocateSelectorWarnings(report.selectors.warnings, expanded.styleMap, { offset }) };
  }
  return report;
}
