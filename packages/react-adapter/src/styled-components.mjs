// styled-components, statically: a styled.tag`` / styled(Base)`` template evaluated for the props an element passes,
// one class per evaluated CSS text, plus a stable class per component (sc-Name) that `${Other}` selectors refer to.
// Nested rules are lowered with provenance (adapter-core lowerNested), so selector checks report template lines.
//
// Props are values or symbols. A JSX attribute that is a literal is its value; any other expression is a symbol named
// by its source text (the same condition key the JSX branches use). A symbol used as a condition (?:, &&, ||, !) splits
// the state on that key; used as a value, it is one of its literal-union values when the component's props type gives
// them, and Unknown otherwise. Theme values come from options.theme; a path missing there is Unknown. An Unknown value
// leaves its declaration out (never guessed) and is reported: U_STYLED_THEME, U_STYLED_VALUE, U_STYLED_INTERPOLATION.
import postcss from 'postcss';
import { parse } from '@babel/parser';
import { merge, choose } from '@mizchi/veriss-adapter-core';

const UNK = Symbol('unknown'), SYM = Symbol('symbol'), PROPS = Symbol('props'), FN = Symbol('function'), NS = Symbol('namespace');
const unknownValue = (code, message) => ({ [UNK]: { code, message } });
const isUnknown = v => v !== null && typeof v === 'object' && UNK in v;
const isSym = v => v !== null && typeof v === 'object' && SYM in v;
const one = v => [{ v, choices: {} }];
const hash = text => { let h = 5381; for (const c of text) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return h.toString(36); };

/** The names styled-components binds in the module: its default (styled) and css. */
export function styledImports(ast) {
  const names = { styled: null, css: null };
  for (const stmt of ast.program.body) {
    if (stmt.type !== 'ImportDeclaration' || stmt.source.value !== 'styled-components') continue;
    for (const s of stmt.specifiers) {
      if (s.type === 'ImportDefaultSpecifier') names.styled = s.local.name;
      else if (s.type === 'ImportSpecifier' && (s.imported.name ?? s.imported.value) === 'css') names.css = s.local.name;
    }
  }
  return names;
}

/**
 * Module-level styled components and css`` fragments.
 * @returns {{defs: Map<string, {name, tag, base, quasi, line}>, fragments: Map<string, object>}}
 */
export function collectStyled(ast, text, names) {
  const defs = new Map(), fragments = new Map();
  if (!names.styled && !names.css) return { defs, fragments };
  const tagOf = tag => {
    // styled.div / styled('div') / styled(Base); a .attrs(...) or generic call is left out (Unknown at use)
    if (tag.type === 'MemberExpression' && tag.object.type === 'Identifier' && tag.object.name === names.styled && !tag.computed) return { tag: tag.property.name, base: null };
    if (tag.type === 'CallExpression' && tag.callee.type === 'Identifier' && tag.callee.name === names.styled) {
      const a = tag.arguments[0];
      if (a?.type === 'StringLiteral') return { tag: a.value, base: null };
      if (a?.type === 'Identifier') return { tag: null, base: a.name };
    }
    return null;
  };
  for (const stmt of ast.program.body) {
    const decls = stmt.type === 'VariableDeclaration' ? stmt.declarations : stmt.type === 'ExportNamedDeclaration' && stmt.declaration?.type === 'VariableDeclaration' ? stmt.declaration.declarations : [];
    for (const d of decls) {
      const init = d.init, name = d.id?.name;
      if (!name || init?.type !== 'TaggedTemplateExpression') continue;
      if (init.tag.type === 'Identifier' && init.tag.name === names.css) { fragments.set(name, { quasi: init.quasi }); continue; }
      const t = tagOf(init.tag);
      if (t) defs.set(name, { name, ...t, quasi: init.quasi, line: init.quasi.loc.start.line, text: text.slice(init.start, init.end) });
    }
  }
  return { defs, fragments };
}

/**
 * A module as the styled evaluation sees it: its styled components, css fragments, const initializers (evaluated when
 * read) and imports. Imports are followed through resolveModule(specifier, importerFile) -> {file, source} | null.
 */
export function loadModule({ file, source, ast }, resolveModule, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  ast ??= parse(source, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  const names = styledImports(ast);
  const { defs, fragments } = collectStyled(ast, source, names);
  const consts = new Map(), imports = new Map();
  for (const stmt of ast.program.body) {
    if (stmt.type === 'ImportDeclaration' && stmt.source.value !== 'styled-components') {
      for (const sp of stmt.specifiers) imports.set(sp.local.name, { specifier: stmt.source.value, imported: sp.type === 'ImportNamespaceSpecifier' ? '*' : sp.type === 'ImportDefaultSpecifier' ? 'default' : sp.imported.name ?? sp.imported.value });
    }
    const decl = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt;
    if (decl?.type === 'VariableDeclaration' && decl.kind === 'const') for (const d of decl.declarations) if (d.id.type === 'Identifier' && d.init && !defs.has(d.id.name) && !fragments.has(d.id.name)) consts.set(d.id.name, d.init);
  }
  const mod = { file, source, ast, names, defs, fragments, consts, imports };
  mod.load = specifier => {
    if (!resolveModule) return null;
    const r = resolveModule(specifier, file);
    return r ? loadModule({ file: r.file, source: r.source }, resolveModule, cache) : null;
  };
  for (const d of defs.values()) d.mod = mod;
  for (const f of fragments.values()) f.mod = mod;
  cache.set(file, mod);
  return mod;
}

/**
 * What a name means in a module: a styled component, a css fragment, a const, an imported module namespace, an import
 * that could not be read ({missing}), or null (not something styled evaluation knows).
 */
export function binding(mod, name, seen = new Set()) {
  if (mod.defs.has(name)) return { kind: 'def', def: mod.defs.get(name) };
  if (mod.fragments.has(name)) return { kind: 'fragment', fragment: mod.fragments.get(name) };
  if (mod.consts.has(name)) return { kind: 'const', node: mod.consts.get(name), mod };
  const im = mod.imports.get(name);
  if (!im) return null;
  const target = mod.load(im.specifier);
  if (!target) return /^[./]/.test(im.specifier) ? { kind: 'missing', message: `${name} is imported from '${im.specifier}', which was not read (pass options.resolveModule)` } : null;
  if (im.imported === '*') return { kind: 'ns', mod: target };
  const key = `${target.file}\u0000${im.imported}`;
  if (seen.has(key)) return null;
  seen.add(key);
  return binding(target, im.imported, seen);
}

/** The styled component a JSX tag names (Name or Namespace.Name), an import that was not read, or null. */
export function styledTag(mod, tag) {
  const [head, member] = tag.split('.');
  let b = binding(mod, head);
  if (member !== undefined && b) b = b.kind === 'ns' ? binding(b.mod, member) : b.kind === 'missing' ? b : null;
  return b && (b.kind === 'def' || b.kind === 'missing') ? b : null;
}

/**
 * Evaluate a styled component's template for the props an element passes.
 * @param {object} def from collectStyled
 * @param {Map<string, Array<{v, choices}>>} props a prop's variants (absent: undefined)
 * @param {{defs, fragments, constants: Map, theme?: object, names, source: string, literalProps?: Map}} ctx
 * @returns {Array<{text: string, choices: object, unknowns: Array<{code, message}>}>}
 */
export function evaluateStyled(def, props, ctx) {
  // the module being evaluated: a fragment or const from another module is read in that module
  const mods = [def.mod];
  const cur = () => mods[mods.length - 1];
  const inModule = (mod, f) => { mods.push(mod); try { return f(); } finally { mods.pop(); } };
  const src = node => cur().source.slice(node.start, node.end);
  const fromBinding = (b, name) => {
    if (!b) return one(unknownValue('U_STYLED_INTERPOLATION', `${name} is not a module constant, a styled component or a css fragment`));
    if (b.kind === 'def') return one(`.sc-${b.def.name}`);
    if (b.kind === 'fragment') return inModule(b.fragment.mod, () => template(b.fragment.quasi));
    if (b.kind === 'const') return inModule(b.mod, () => ev(b.node));
    if (b.kind === 'ns') return one({ [NS]: b.mod });
    return one(unknownValue('U_STYLED_INTERPOLATION', b.message));
  };
  const propsLookup = key => key === 'theme'
    ? one(ctx.theme === undefined ? unknownValue('U_STYLED_THEME', 'no theme was given (options.theme)') : { theme: ctx.theme, path: 'theme' })
    : props.get(key) ?? one(undefined);
  // theme values carry their path, for the message when a key is missing
  const unwrap = v => (v && typeof v === 'object' && 'theme' in v && 'path' in v ? v.theme : v);
  const combine = (lists, f) => lists.reduce((acc, list) => acc.flatMap(a => list.map(b => { const choices = merge(a.choices, b.choices); return choices && { vs: [...a.vs, b.v], choices }; }).filter(Boolean)), [{ vs: [], choices: {} }])
    .flatMap(({ vs, choices }) => f(vs).map(r => { const c = merge(choices, r.choices); return c && { v: r.v, choices: c }; }).filter(Boolean));

  // truthiness of a value: a symbol splits on its key
  const truth = v => {
    if (isUnknown(v)) return [{ v, choices: {} }];
    if (isSym(v)) return [true, false].map(on => ({ v: on, choices: choose(v[SYM].key, on !== v[SYM].negate) }));
    return one(Boolean(unwrap(v)));
  };
  // a symbol used as a value: its literal-union values, or Unknown
  const valueOf = v => {
    if (!isSym(v)) return one(v);
    const values = ctx.literalProps?.get(v[SYM].key);
    if (values) return values.map(x => ({ v: x, choices: choose(v[SYM].key, x) }));
    return one(unknownValue('U_STYLED_VALUE', `the value of ${v[SYM].prop} (${v[SYM].key}) is not a literal`));
  };

  // a missing theme path is reported with the whole expression that reads it (theme.colors.text, not theme.colors)
  const themeMissing = (node, missing) => ({ [UNK]: { code: 'U_STYLED_THEME', message: `${src(node)}: ${missing} is not in the theme`, missing } });
  const member = (objNode, keyOf, node) => combine([ev(objNode), keyOf], ([o, k]) => {
    if (isUnknown(o)) return one(o[UNK].missing ? themeMissing(node, o[UNK].missing) : o);
    if (o === PROPS) return propsLookup(k);
    if (o && typeof o === 'object' && NS in o) return fromBinding(binding(o[NS], k), `${src(objNode)}.${k}`);
    if (isSym(o)) return one(unknownValue('U_STYLED_VALUE', `${src(node)}: a member of a prop that is not a literal`));
    const base = unwrap(o);
    if (base !== null && typeof base === 'object' && Object.hasOwn(base, k)) {
      const v = base[k];
      return one(o && typeof o === 'object' && 'path' in o && v !== null && typeof v === 'object' ? { theme: v, path: `${o.path}.${k}` } : v);
    }
    if (o && typeof o === 'object' && 'path' in o) return one(themeMissing(node, `${o.path}.${k}`));
    return one(unknownValue('U_STYLED_VALUE', `${src(node)} is not known statically`));
  });

  const scopes = [];
  const lookup = name => { for (let i = scopes.length - 1; i >= 0; i--) if (scopes[i].has(name)) return scopes[i].get(name); return null; };

  function ev(node) {
    switch (node.type) {
      case 'StringLiteral': case 'NumericLiteral': case 'BooleanLiteral': return one(node.value);
      case 'NullLiteral': return one(null);
      case 'ParenthesizedExpression': return ev(node.expression);
      case 'TSAsExpression': case 'TSNonNullExpression': case 'TSSatisfiesExpression': return ev(node.expression);
      case 'TemplateLiteral': return combine(node.expressions.map(e => ev(e).flatMap(r => valueOf(r.v).map(x => ({ v: x.v, choices: merge(r.choices, x.choices) })).filter(x => x.choices))), vs => {
        const bad = vs.find(isUnknown); if (bad) return one(bad);
        return one(node.quasis.map((q, i) => q.value.cooked + (i < vs.length ? String(unwrap(vs[i]) ?? '') : '')).join(''));
      });
      case 'Identifier': {
        const bound = lookup(node.name); if (bound) return bound;
        if (node.name === 'undefined') return one(undefined);
        return fromBinding(binding(cur(), node.name), node.name);
      }
      case 'MemberExpression': case 'OptionalMemberExpression':
        return member(node.object, node.computed ? ev(node.property).flatMap(r => valueOf(r.v).map(x => ({ v: x.v, choices: merge(r.choices, x.choices) }))) : one(node.property.name), node);
      case 'ConditionalExpression': return ev(node.test).flatMap(t => truth(t.v).flatMap(b => {
        const choices = merge(t.choices, b.choices); if (!choices) return [];
        if (isUnknown(b.v)) return [{ v: b.v, choices }];
        return ev(b.v ? node.consequent : node.alternate).map(r => { const c = merge(choices, r.choices); return c && { v: r.v, choices: c }; }).filter(Boolean);
      }));
      case 'LogicalExpression': return ev(node.left).flatMap(l => truth(l.v).flatMap(b => {
        const choices = merge(l.choices, b.choices); if (!choices) return [];
        if (isUnknown(b.v)) return [{ v: b.v, choices }];
        const takeRight = node.operator === '&&' ? b.v : node.operator === '||' ? !b.v : unwrap(l.v) === null || unwrap(l.v) === undefined;
        if (!takeRight) return [{ v: node.operator === '&&' ? false : l.v, choices }];
        return ev(node.right).map(r => { const c = merge(choices, r.choices); return c && { v: r.v, choices: c }; }).filter(Boolean);
      }));
      case 'UnaryExpression':
        if (node.operator === '!') return ev(node.argument).flatMap(r => isSym(r.v) ? [{ v: { [SYM]: { ...r.v[SYM], negate: !r.v[SYM].negate } }, choices: r.choices }] : truth(r.v).map(b => ({ v: isUnknown(b.v) ? b.v : !b.v, choices: merge(r.choices, b.choices) })).filter(x => x.choices));
        if (node.operator === '-') return ev(node.argument).map(r => ({ v: typeof unwrap(r.v) === 'number' ? -unwrap(r.v) : unknownValue('U_STYLED_VALUE', `${src(node)} is not a number`), choices: r.choices }));
        break;
      case 'BinaryExpression': {
        const sides = [node.left, node.right].map(n => ev(n).flatMap(r => valueOf(r.v).map(x => ({ v: x.v, choices: merge(r.choices, x.choices) })).filter(x => x.choices)));
        return combine(sides, ([a, b]) => {
          if (isUnknown(a)) return one(a); if (isUnknown(b)) return one(b);
          const [x, y] = [unwrap(a), unwrap(b)];
          const ops = { '+': () => x + y, '-': () => x - y, '*': () => x * y, '/': () => x / y, '===': () => x === y, '!==': () => x !== y, '==': () => x == y, '!=': () => x != y, '<': () => x < y, '>': () => x > y, '<=': () => x <= y, '>=': () => x >= y };
          return ops[node.operator] ? one(ops[node.operator]()) : one(unknownValue('U_STYLED_VALUE', `${src(node)}: operator ${node.operator} is not modeled`));
        });
      }
      case 'TaggedTemplateExpression':
        if (node.tag.type === 'Identifier' && node.tag.name === cur().names.css) return template(node.quasi);
        break;
      case 'ArrowFunctionExpression': case 'FunctionExpression': return one({ [FN]: node });
      case 'ObjectExpression': case 'ArrayExpression': {
        // a literal object or array of single values (a token table); anything else is Unknown
        const out = node.type === 'ArrayExpression' ? [] : {};
        for (const p of node.type === 'ArrayExpression' ? node.elements.map((value, i) => ({ key: i, value })) : node.properties.map(p => p.type === 'ObjectProperty' && !p.computed ? { key: p.key.name ?? p.key.value, value: p.value } : null)) {
          const r = p && ev(p.value);
          if (!r || r.length !== 1 || isUnknown(r[0].v) || isSym(r[0].v) || Object.keys(r[0].choices).length) return one(unknownValue('U_STYLED_VALUE', `${src(node)} is not a literal table`));
          out[p.key] = unwrap(r[0].v);
        }
        return one(out);
      }
      default: break;
    }
    return one(unknownValue('U_STYLED_INTERPOLATION', `${src(node)} is not modeled`));
  }

  // call a function interpolation with the props: (props) => …, ({ a, theme }) => …, ({ size = 'm' }) => …
  const call = fn => {
    const param = fn.params[0], scope = new Map();
    if (param?.type === 'Identifier') scope.set(param.name, one(PROPS));
    else if (param?.type === 'ObjectPattern') {
      for (const p of param.properties) {
        if (p.type !== 'ObjectProperty' || p.computed) return one(unknownValue('U_STYLED_INTERPOLATION', `${src(fn)}: a rest or computed props pattern`));
        const key = p.key.name ?? p.key.value;
        if (p.value.type === 'Identifier') scope.set(p.value.name, propsLookup(key));
        else if (p.value.type === 'AssignmentPattern' && p.value.left.type === 'Identifier') {
          const def = ev(p.value.right);
          scope.set(p.value.left.name, propsLookup(key).flatMap(r => r.v === undefined ? def.map(d => ({ v: d.v, choices: merge(r.choices, d.choices) })).filter(x => x.choices) : [r]));
        } else return one(unknownValue('U_STYLED_INTERPOLATION', `${src(fn)}: a nested props pattern`));
      }
    } else if (param) return one(unknownValue('U_STYLED_INTERPOLATION', `${src(fn)}: its parameter is not modeled`));
    scopes.push(scope);
    try {
      const body = fn.body.type === 'BlockStatement' ? fn.body.body.length === 1 && fn.body.body[0].type === 'ReturnStatement' ? fn.body.body[0].argument : null : fn.body;
      return body ? ev(body) : one(unknownValue('U_STYLED_INTERPOLATION', `${src(fn)}: a function body other than one return`));
    } finally { scopes.pop(); }
  };

  // a template's text variants: each interpolation is a function of the props, a value, or a css fragment
  let slot = 0;
  const marks = new Map();
  function template(quasi) {
    const parts = quasi.expressions.map(e => ev(e).flatMap(r => (r.v && typeof r.v === 'object' && FN in r.v ? call(r.v[FN]).map(x => ({ v: x.v, choices: merge(r.choices, x.choices) })) : [r])).filter(x => x.choices)
      .flatMap(r => valueOf(r.v).map(x => ({ v: x.v, choices: merge(r.choices, x.choices) })).filter(x => x.choices)));
    return combine(parts, vs => one(quasi.quasis.map((q, i) => {
      if (i >= vs.length) return q.value.cooked;
      const v = vs[i];
      if (isUnknown(v)) { const mark = `\u0001${slot++}\u0001`; marks.set(mark, v[UNK]); return q.value.cooked + mark; }
      const x = unwrap(v);
      return q.value.cooked + (x === false || x === null || x === undefined ? '' : typeof x === 'object' ? (() => { const mark = `\u0001${slot++}\u0001`; marks.set(mark, { code: 'U_STYLED_INTERPOLATION', message: 'an interpolation evaluates to an object' }); return mark; })() : String(x).replace(/\n/g, ' '));
    }).join('')));
  }

  return template(def.quasi).map(({ v: text, choices }) => {
    // Declarations and rules holding an Unknown value are left out and reported. They are blanked in place (their
    // newlines kept), so every remaining line is still the template's line.
    const unknowns = [];
    if (!/\u0001\d+\u0001/.test(text)) return { text, choices, unknowns };
    const report = (where, mark) => { const u = marks.get(mark); unknowns.push({ code: u.code, message: `${def.name}${where}: ${u.message}` }); };
    const spans = [];
    postcss.parse(`x{${text}}`).walk(n => {
      const own = n.type === 'decl' ? `${n.prop}${n.value}` : n.type === 'rule' ? n.selector : '';
      const mark = own.match(/\u0001\d+\u0001/)?.[0];
      if (!mark || n.parent?.type === 'root') return;
      report(n.type === 'decl' ? ` ${n.prop}` : ' selector', mark);
      spans.push([n.source.start.offset - 2, n.source.end.offset - 2 + 1]);
    });
    let out = text;
    for (const [a, b] of spans.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + out.slice(a, b).replace(/[^\n]/g, ' ') + out.slice(b).replace(/^;/, ' ');
    // a bare Unknown interpolation (a mixin whose text is not known) is dropped
    out = out.replace(/\u0001\d+\u0001/g, m => { report('', m); return ''; });
    return { text: out, choices, unknowns };
  });
}

export const symbolOf = (key, prop, negate = false) => ({ [SYM]: { key, prop, negate } });
export const styledClass = (name, text) => `sc-${name}-${hash(text)}`;
