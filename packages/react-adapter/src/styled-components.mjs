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
  // exports: aliases (export default X, export { a as b }), re-exports (export { a as b } from 'm') and export * from 'm'
  const consts = new Map(), imports = new Map(), aliases = new Map(), reexports = new Map(), stars = [], comps = new Map();
  for (const stmt of ast.program.body) {
    if (stmt.type === 'ExportDefaultDeclaration' && stmt.declaration.type === 'Identifier') aliases.set('default', stmt.declaration.name);
    // function components: function X / export default function X (found by expandReact under that name or 'default')
    const fnDecl = stmt.type === 'ExportDefaultDeclaration' || stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt;
    if (fnDecl?.type === 'FunctionDeclaration') {
      if (fnDecl.id) comps.set(fnDecl.id.name, fnDecl.id.name);
      if (stmt.type === 'ExportDefaultDeclaration') comps.set('default', 'default');
    }
    if (stmt.type === 'ExportNamedDeclaration' && !stmt.declaration && stmt.exportKind !== 'type') {
      for (const sp of stmt.specifiers) {
        if (sp.type !== 'ExportSpecifier' || sp.exportKind === 'type') continue;
        const exported = sp.exported.name ?? sp.exported.value, local = sp.local.name ?? sp.local.value;
        if (stmt.source) reexports.set(exported, { specifier: stmt.source.value, imported: local });
        else aliases.set(exported, local);
      }
    }
    if (stmt.type === 'ExportAllDeclaration' && !stmt.exported && stmt.exportKind !== 'type') stars.push(stmt.source.value);
    if (stmt.type === 'ImportDeclaration' && stmt.source.value !== 'styled-components') {
      for (const sp of stmt.specifiers) imports.set(sp.local.name, { specifier: stmt.source.value, imported: sp.type === 'ImportNamespaceSpecifier' ? '*' : sp.type === 'ImportDefaultSpecifier' ? 'default' : sp.imported.name ?? sp.imported.value });
    }
    const decl = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt;
    if (decl?.type === 'VariableDeclaration' && decl.kind === 'const') for (const d of decl.declarations) if (d.id.type === 'Identifier' && d.init && !defs.has(d.id.name) && !fragments.has(d.id.name)) consts.set(d.id.name, d.init);
  }
  const mod = { file, source, ast, names, defs, fragments, consts, imports, aliases, reexports, stars, comps };
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
// the names a binding pattern declares
function patternNames(p) {
  if (!p) return [];
  if (p.type === 'Identifier') return [p.name];
  if (p.type === 'AssignmentPattern') return patternNames(p.left);
  if (p.type === 'RestElement') return patternNames(p.argument);
  if (p.type === 'ObjectPattern') return p.properties.flatMap(x => patternNames(x.type === 'RestElement' ? x : x.value));
  if (p.type === 'ArrayPattern') return p.elements.flatMap(patternNames);
  return [];
}

// a function declaration of the module by name (export default function counts as 'default')
function functionDeclaration(mod, name) {
  for (const stmt of mod.ast.program.body) {
    const decl = stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportDefaultDeclaration' ? stmt.declaration : stmt;
    if (decl?.type === 'FunctionDeclaration' && (decl.id?.name === name || (name === 'default' && stmt.type === 'ExportDefaultDeclaration'))) return decl;
  }
  return null;
}

export function binding(mod, name, seen = new Set()) {
  if (mod.defs.has(name)) return { kind: 'def', def: mod.defs.get(name) };
  if (mod.fragments.has(name)) return { kind: 'fragment', fragment: mod.fragments.get(name) };
  if (mod.comps.has(name)) return { kind: 'component', name: mod.comps.get(name), mod };
  if (mod.consts.has(name)) {
    // a const that is a function component (possibly in forwardRef / memo)
    let n = mod.consts.get(name);
    while (n && ['TSAsExpression', 'TSSatisfiesExpression', 'ParenthesizedExpression'].includes(n.type)) n = n.expression;
    while (n?.type === 'CallExpression' && /^(?:React\.)?(?:forwardRef|memo)$/.test(mod.source.slice(n.callee.start, n.callee.end))) n = n.arguments[0];
    if (n && ['ArrowFunctionExpression', 'FunctionExpression'].includes(n.type)) return { kind: 'component', name, mod };
    return { kind: 'const', node: mod.consts.get(name), mod };
  }
  const key = `${mod.file}\u0000${name}`;
  if (seen.has(key)) return null;
  seen.add(key);
  if (mod.aliases.has(name)) return binding(mod, mod.aliases.get(name), seen);
  const im = mod.imports.get(name) ?? mod.reexports.get(name);
  if (im) {
    const target = mod.load(im.specifier);
    if (!target) return /^[./]/.test(im.specifier) ? { kind: 'missing', message: `${name} is imported from '${im.specifier}', which was not read (pass options.resolveModule)` } : null;
    return im.imported === '*' ? { kind: 'ns', mod: target } : binding(target, im.imported, seen);
  }
  // export * from 'm': the first module that has the name (never default)
  if (name !== 'default') for (const specifier of mod.stars) { const target = mod.load(specifier); const b = target && binding(target, name, seen); if (b) return b; }
  return null;
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
/** One expression of a component in module `mod` (see expression mode in evaluateStyled): [{v, choices}]. */
export const evaluateExpression = (expression, mod, ctx) => evaluateStyled({ mod, name: '' }, new Map(), { ...ctx, expression });
export const isUnknownValue = v => isUnknown(v);

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
    // a module function (binding() names any function a component): as a value it is the function
    if (b.kind === 'component') {
      const fn = b.mod.consts.get(b.name) ?? functionDeclaration(b.mod, b.name);
      if (fn) return inModule(b.mod, () => fn.type === 'FunctionDeclaration' ? one({ [FN]: fn, mod: b.mod, env: [] }) : ev(fn));
    }
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
  const member = (objNode, keyOf, node) => combine([ev(objNode), keyOf], ([o, k]) => getKey(o, k, node));
  const getKey = (o, k, node) => {
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
  };

  let scopes = [];
  const lookup = name => { for (let i = scopes.length - 1; i >= 0; i--) if (scopes[i].has(name)) return scopes[i].get(name); return null; };

  function ev(node) {
    switch (node.type) {
      case 'StringLiteral': case 'NumericLiteral': case 'BooleanLiteral': return one(node.value);
      case 'NullLiteral': return one(null);
      case 'ParenthesizedExpression': return ev(node.expression);
      case 'TSAsExpression': case 'TSNonNullExpression': case 'TSSatisfiesExpression': return ev(node.expression);
      case 'TemplateLiteral': return combine(node.expressions.map(e => ev(e).flatMap(r => valueOf(r.v).map(x => ({ v: x.v, choices: merge(r.choices, x.choices) })).filter(x => x.choices))), vs => {
        const bad = vs.find(isUnknown); if (bad) return one(bad);
        return one(node.quasis.map((q, i) => q.value.cooked + (i < vs.length ? String(unwrap(vs[i])) : '')).join('')); // as JavaScript: `${undefined}` is "undefined"
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
      case 'ArrowFunctionExpression': case 'FunctionExpression': return one({ [FN]: node, mod: cur(), env: scopes.slice() });
      case 'CallExpression': return callExpression(node);
      case 'ObjectExpression': case 'ArrayExpression': {
        // An object or array literal: its fields hold any value (a prop, a theme value, a function, an Unknown read
        // only if the field is read); a field that varies makes a variant of the whole object.
        const fields = node.type === 'ArrayExpression' ? node.elements.map((value, i) => value && value.type !== 'SpreadElement' ? { key: i, value } : null) : node.properties.map(p => p.type === 'ObjectProperty' && !p.computed ? { key: p.key.name ?? p.key.value, value: p.value } : null);
        if (fields.some(f => !f)) return one(unknownValue('U_STYLED_VALUE', `${src(node)}: spread, holes and computed keys are not modeled`));
        return combine(fields.map(f => ev(f.value)), vs => {
          const out = node.type === 'ArrayExpression' ? [] : {};
          fields.forEach((f, i) => { out[f.key] = vs[i]; });
          return one(out);
        });
      }
      default: break;
    }
    return one(unknownValue('U_STYLED_INTERPOLATION', `${src(node)} is not modeled`));
  }

  // A function value applied to argument variants (a function interpolation gets the props): parameters are bound by
  // name, by object pattern ({ a, theme }) and with defaults ({ size = 'm' }, style = 'solid'); the body is evaluated
  // in the function's module, over the scopes it closed over.
  let depth = 0;
  // a binding pattern (name, default, object pattern) set in `scope` from value variants; false if not modeled
  const withDefault = (variants, right) => variants.flatMap(r => r.v === undefined ? ev(right).map(d => ({ v: d.v, choices: merge(r.choices, d.choices) })).filter(x => x.choices) : [r]);
  const bind = (scope, pattern, variants) => {
    if (pattern.type === 'Identifier') { scope.set(pattern.name, variants); return true; }
    if (pattern.type === 'AssignmentPattern' && pattern.left.type === 'Identifier') { scope.set(pattern.left.name, withDefault(variants, pattern.right)); return true; }
    if (pattern.type !== 'ObjectPattern') return false;
    for (const p of pattern.properties) {
      if (p.type !== 'ObjectProperty' || p.computed) return false;
      const key = p.key.name ?? p.key.value;
      const field = variants.flatMap(a => fieldOf(a.v, key, p).map(x => ({ v: x.v, choices: merge(a.choices, x.choices) })).filter(x => x.choices));
      if (!bind(scope, p.value, field)) return false;
    }
    return true;
  };
  // a destructured field: a plain object (an argument built in the template) without the key gives undefined, as in JS
  const fieldOf = (v, key, node) => {
    const plain = v !== PROPS && !isUnknown(v) && !isSym(v) && !(v && typeof v === 'object' && ('path' in v || NS in v || FN in v));
    return plain && (v === null || typeof v !== 'object' || !Object.hasOwn(v, key)) ? one(undefined) : getKey(v, key, node);
  };
  const call = f => apply(f, [one(PROPS)]);
  const apply = (f, args) => {
    const fn = f[FN];
    if (depth > 32) return one(unknownValue('U_STYLED_INTERPOLATION', `${src(fn)}: calls nested too deep`));
    return inModule(f.mod, () => {
      const saved = scopes, scope = new Map();
      scopes = [...(f.env ?? []), scope]; depth++;
      try {
        for (const [i, param] of fn.params.entries()) {
          if (!bind(scope, param, args[i] ?? one(undefined))) return one(unknownValue('U_STYLED_INTERPOLATION', `${src(fn)}: the parameter ${src(param)} is not modeled`));
        }
        if (fn.body.type !== 'BlockStatement') return ev(fn.body);
        // falling off the end returns undefined
        return run(fn.body.body).map(p => ({ v: p.done ? p.v : undefined, choices: p.choices }));
      } finally { scopes = saved; depth--; }
    });
  };
  // a call of a function value (a module function, an imported one, a local arrow); other calls are Unknown
  // pure methods of strings and arrays whose receiver and arguments are known
  const METHODS = {
    includes: (o, a) => o.includes(a), startsWith: (o, a) => typeof o === 'string' && o.startsWith(a), endsWith: (o, a) => typeof o === 'string' && o.endsWith(a),
    indexOf: (o, a) => o.indexOf(a), join: (o, a) => Array.isArray(o) ? o.map(unwrap).join(a ?? ',') : undefined,
    toLowerCase: o => typeof o === 'string' ? o.toLowerCase() : undefined, toUpperCase: o => typeof o === 'string' ? o.toUpperCase() : undefined, trim: o => typeof o === 'string' ? o.trim() : undefined,
  };
  const known = v => !isUnknown(v) && !isSym(v);
  const method = node => {
    const name = node.callee.property.name;
    const lists = [node.callee.object, ...node.arguments].map(n => ev(n).flatMap(r => valueOf(r.v).map(x => ({ v: x.v, choices: merge(r.choices, x.choices) })).filter(x => x.choices)));
    return combine(lists, ([o, ...args]) => {
      const bad = [o, ...args].find(v => !known(v)); if (bad) return one(bad);
      const base = unwrap(o);
      const elements = Array.isArray(base) ? base.map(unwrap) : base;
      if (!(typeof base === 'string' || Array.isArray(base))) return one(unknownValue('U_STYLED_VALUE', `${src(node)}: .${name} of a value that is not a string or an array`));
      const r = name === 'join' ? METHODS.join(base, ...args.map(unwrap)) : METHODS[name](elements, ...args.map(unwrap));
      return one(r === undefined ? unknownValue('U_STYLED_VALUE', `${src(node)} is not modeled`) : r);
    });
  };
  const callExpression = node => {
    if (node.arguments.some(a => a.type === 'SpreadElement')) return one(unknownValue('U_STYLED_INTERPOLATION', `${src(node)} is not modeled`));
    if (['MemberExpression', 'OptionalMemberExpression'].includes(node.callee.type) && !node.callee.computed && Object.hasOwn(METHODS, node.callee.property.name)) return method(node);
    // the theme hook (useTheme from styled-components or a wrapper named like it) is the theme
    if (node.callee.type === 'Identifier' && /^use\w*Theme$/.test(node.callee.name) && !node.arguments.length) return propsLookup('theme');
    return ev(node.callee).flatMap(c => {
      if (!(c.v && typeof c.v === 'object' && FN in c.v)) return [{ v: isUnknown(c.v) ? c.v : unknownValue('U_STYLED_INTERPOLATION', `${src(node)} is not modeled`), choices: c.choices }];
      return thread(c, apply(c.v, node.arguments.map(a => ev(a))));
    });
  };

  // A function body, statement by statement: paths of {done (returned or broke), v, choices}. Modeled: return, if /
  // else, blocks, switch on literal cases (fall-through and break), and const / let bindings; any other statement
  // makes the path Unknown.
  const thread = (p, rs) => rs.map(r => { const choices = merge(p.choices, r.choices); return choices && { ...r, choices }; }).filter(Boolean);
  const run = (stmts, start = [{ done: false, choices: {} }]) => stmts.reduce((paths, st) => paths.flatMap(p => p.done ? [p] : thread(p, step(st))), start);
  const notModeled = st => [{ done: true, v: unknownValue('U_STYLED_INTERPOLATION', `the statement ${src(st).split('\n')[0]} is not modeled`), choices: {} }];
  const step = st => {
    switch (st.type) {
      case 'ReturnStatement': return (st.argument ? ev(st.argument) : one(undefined)).map(r => ({ done: true, v: r.v, choices: r.choices }));
      case 'BlockStatement': return run(st.body);
      case 'EmptyStatement': return [{ done: false, choices: {} }];
      case 'IfStatement': return ev(st.test).flatMap(t => truth(t.v).flatMap(b => {
        const choices = merge(t.choices, b.choices); if (!choices) return [];
        if (isUnknown(b.v)) return [{ done: true, v: b.v, choices }];
        const branch = b.v ? st.consequent : st.alternate;
        return thread({ choices }, branch ? step(branch) : [{ done: false, choices: {} }]);
      }));
      case 'VariableDeclaration': {
        if (st.kind === 'var' || !st.declarations.every(d => d.init)) return notModeled(st);
        for (const d of st.declarations) if (!bind(scopes[scopes.length - 1], d.id, ev(d.init))) return notModeled(st);
        return [{ done: false, choices: {} }];
      }
      case 'SwitchStatement': return ev(st.discriminant).flatMap(dr => valueOf(dr.v).flatMap(x => {
        const choices = merge(dr.choices, x.choices); if (!choices) return [];
        if (isUnknown(x.v)) return [{ done: true, v: x.v, choices }];
        // the first case whose literal test equals the value, else default; then its statements and those after it
        const tests = st.cases.map(c => c.test && ev(c.test));
        if (tests.some(t => t && (t.length !== 1 || isUnknown(t[0].v) || isSym(t[0].v)))) return thread({ choices }, notModeled(st));
        let at = tests.findIndex(t => t && unwrap(t[0].v) === unwrap(x.v));
        if (at < 0) at = st.cases.findIndex(c => !c.test);
        if (at < 0) return [{ done: false, choices }];
        const body = [];
        for (const c of st.cases.slice(at)) body.push(...c.consequent);
        // break ends the switch (a path that broke goes on after it)
        return thread({ choices }, run(body)).map(p => p.broke ? { done: false, choices: p.choices } : p);
      }));
      case 'BreakStatement': return st.label ? notModeled(st) : [{ done: true, broke: true, choices: {} }];
      default: return notModeled(st);
    }
  };

  // a template's text variants: each interpolation is a function of the props, a value, or a css fragment
  let slot = 0;
  const marks = new Map();
  function template(quasi) {
    const parts = quasi.expressions.map(e => ev(e).flatMap(r => (r.v && typeof r.v === 'object' && FN in r.v ? call(r.v).map(x => ({ v: x.v, choices: merge(r.choices, x.choices) })) : [r])).filter(x => x.choices)
      .flatMap(r => valueOf(r.v).map(x => ({ v: x.v, choices: merge(r.choices, x.choices) })).filter(x => x.choices)));
    // The template's own text, with // line comments dropped as stylis does (outside strings and parentheses, so
    // url(http://…) stays). Values are written on one line; templateLines says which template line each line is.
    const cooked = stripLineComments(quasi.quasis);
    return combine(parts, vs => one(cooked.map((own, i) => {
      if (i >= vs.length) return own;
      const v = vs[i];
      // An Unknown in statement position (a mixin: only whitespace since the last ; { or }) becomes a comment, so the
      // declarations after it still parse; inside a declaration value it stays a bare mark (the declaration is dropped).
      if (isUnknown(v)) {
        const mark = `\u0001${slot++}\u0001`; marks.set(mark, v[UNK]);
        const before = cooked.slice(0, i + 1).join('\u0002').replace(/\/\*[\s\S]*?\*\//g, '');
        return own + (/(^|[;{}])[\s\u0002]*$/.test(before) ? `/*${mark}*/` : mark);
      }
      const x = unwrap(v);
      if (x !== null && typeof x === 'object') { const mark = `\u0001${slot++}\u0001`; marks.set(mark, { code: 'U_STYLED_INTERPOLATION', message: 'an interpolation evaluates to an object' }); return own + mark; }
      // styled-components writes nothing for false, null and undefined
      return own + (x === false || x === null || x === undefined ? '' : String(x).replace(/\n/g, ' '));
    }).join('')));
  }

  // Expression mode: one expression of a component (a prop passed to a styled element), over the component's props
  // (ctx.scope: name → variants) and its local bindings (ctx.bindings: [pattern, init], in order).
  if (ctx.expression) {
    const scope = new Map(ctx.scope ?? []);
    scopes = [scope];
    for (const [pattern, init] of ctx.bindings ?? []) if (!bind(scope, pattern, ev(init))) for (const name of patternNames(pattern)) scope.set(name, one(unknownValue('U_STYLED_VALUE', `${src(init)} is not modeled`)));
    return ev(ctx.expression);
  }
  const lines = templateLines(def.quasi);
  const unreadable = (text, e, choices) => ({ text: '', lines, choices, unknowns: [{ code: 'U_STYLED_CSS', message: `${def.name}: its CSS cannot be read (${e.reason ?? e.message}${e.line ? ` at template line ${lines[e.line - 1] ?? def.line}: ${JSON.stringify(`x{${text}}`.split('\n')[e.line - 1]?.trim().replace(/[\u0001-\u0003]/g, '·'))}` : ''})` }] });
  return template(def.quasi).map(({ v: text, choices }) => {
    // Declarations and rules holding an Unknown value are left out and reported; declarations left empty (an
    // interpolation that wrote nothing) are left out as stylis does. Both are blanked in place, newlines kept.
    const unknowns = [];
    const report = (where, mark) => { const u = marks.get(mark); unknowns.push({ code: u.code, message: `${def.name}${where}: ${u.message}` }); };
    let parsed;
    try { parsed = postcss.parse(`x{${text}}`); } catch (e) { return unreadable(text, e, choices); }
    const spans = [];
    parsed.walk(n => {
      if (n.parent?.type === 'root') return;
      const own = n.type === 'decl' ? `${n.prop}${n.value}` : n.type === 'rule' ? n.selector : '';
      const mark = own.match(/\u0001\d+\u0001/)?.[0];
      if (mark) report(n.type === 'decl' ? ` ${n.prop}` : ' selector', mark);
      else if (!(n.type === 'decl' && n.value.trim() === '')) return;
      spans.push([n.source.start.offset - 2, n.source.end.offset - 2 + 1]);
    });
    let out = text;
    for (const [a, b] of spans.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + out.slice(a, b).replace(/[^\n]/g, ' ') + out.slice(b).replace(/^;/, ' ');
    // a bare Unknown interpolation (a mixin whose text is not known) is dropped
    out = out.replace(/\/\*(\u0001\d+\u0001)\*\/|\u0001\d+\u0001/g, (m, inner) => { report('', inner ?? m); return ''; });
    return { text: out, lines, choices, unknowns };
  });
}

// // line comments removed from a template's text pieces (the newline kept), outside strings and parentheses.
function stripLineComments(quasis) {
  let quote = null, depth = 0;
  return quasis.map(q => {
    let out = '';
    const t = q.value.cooked;
    for (let j = 0; j < t.length; j++) {
      const c = t[j];
      if (quote) { if (c === '\\') { out += c + (t[j + 1] ?? ''); j++; continue; } if (c === quote) quote = null; out += c; continue; }
      if (c === '"' || c === "'") quote = c;
      else if (c === '(') depth++;
      else if (c === ')') depth = Math.max(0, depth - 1);
      else if (c === '/' && t[j + 1] === '/' && depth === 0) { while (j < t.length && t[j] !== '\n') j++; if (j < t.length) out += '\n'; continue; }
      out += c;
    }
    return out;
  });
}

// The template line of each line of the evaluated text (values are one line; a piece's newlines are its own).
function templateLines(quasi) {
  const lines = [quasi.quasis[0].loc.start.line];
  for (const q of quasi.quasis) {
    let line = q.loc.start.line;
    for (const c of q.value.cooked) if (c === '\n') lines.push(++line);
  }
  return lines;
}

export const symbolOf = (key, prop, negate = false) => ({ [SYM]: { key, prop, negate } });
/** {key, negate} of a prop symbol, or null for a literal value. */
export const symbolInfo = v => (isSym(v) ? { key: v[SYM].key, negate: v[SYM].negate } : null);
export const styledClass = (name, text) => `sc-${name}-${hash(text)}`;
