// TypeScript props types, read across modules: a name is looked up as a type alias or interface in the module, then
// through its imports and type re-exports (export type { X } from, export * from). Only what decides a component's
// states is modeled: the members of an object type (type literals, interfaces with extends, intersections) and unions
// of string / number literals. Anything else (generics, mapped and utility types) contributes nothing.

/** The declaration of type `name` in `mod` ({node, mod}) or null; `mod` is a loadModule result. */
export function resolveTypeName(mod, name, seen = new Set()) {
  const key = `${mod.file}\u0000${name}`;
  if (seen.has(key)) return null;
  seen.add(key);
  for (const stmt of mod.ast.program.body) {
    const decl = stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportDefaultDeclaration' ? stmt.declaration : stmt;
    if ((decl?.type === 'TSTypeAliasDeclaration' || decl?.type === 'TSInterfaceDeclaration') && decl.id.name === name) return { node: decl, mod };
  }
  for (const stmt of mod.ast.program.body) {
    if (stmt.type === 'ImportDeclaration') {
      const sp = stmt.specifiers.find(s => s.type === 'ImportSpecifier' && s.local.name === name);
      if (sp) { const target = mod.load(stmt.source.value); return target && resolveTypeName(target, sp.imported.name ?? sp.imported.value, seen); }
    }
    if (stmt.type === 'ExportNamedDeclaration' && !stmt.declaration) {
      const sp = stmt.specifiers.find(s => s.type === 'ExportSpecifier' && (s.exported.name ?? s.exported.value) === name);
      if (sp) {
        const local = sp.local.name ?? sp.local.value;
        if (!stmt.source) return local === name ? null : resolveTypeName(mod, local, seen);
        const target = mod.load(stmt.source.value);
        return target && resolveTypeName(target, local, seen);
      }
    }
  }
  for (const stmt of mod.ast.program.body) {
    if (stmt.type !== 'ExportAllDeclaration' || stmt.exported) continue;
    const target = mod.load(stmt.source.value);
    const found = target && resolveTypeName(target, name, seen);
    if (found) return found;
  }
  return null;
}

// a type reference to a plain name (Foo, not ns.Foo) resolved in `mod`
const reference = (type, mod) => type?.type === 'TSTypeReference' && type.typeName.type === 'Identifier' ? resolveTypeName(mod, type.typeName.name) : null;

/** The property members of an object type, each with the module it was declared in: [{member, mod}]. */
export function typeMembers(type, mod, depth = 0) {
  if (!type || depth > 16) return [];
  if (type.type === 'TSParenthesizedType') return typeMembers(type.typeAnnotation, mod, depth + 1);
  if (type.type === 'TSTypeLiteral') return type.members.map(member => ({ member, mod }));
  if (type.type === 'TSIntersectionType') return type.types.flatMap(t => typeMembers(t, mod, depth + 1));
  if (type.type === 'TSExpressionWithTypeArguments' || type.type === 'TSInterfaceHeritage') {
    const name = type.expression?.type === 'Identifier' ? type.expression.name : null;
    return name ? declarationMembers(resolveTypeName(mod, name), depth) : [];
  }
  return declarationMembers(reference(type, mod), depth);
}
const declarationMembers = (found, depth) => {
  if (!found) return [];
  const { node, mod } = found;
  if (node.type === 'TSTypeAliasDeclaration') return typeMembers(node.typeAnnotation, mod, depth + 1);
  return [...(node.extends ?? []).flatMap(h => typeMembers(h, mod, depth + 1)), ...node.body.body.map(member => ({ member, mod }))];
};

const literal = t => t?.type === 'TSLiteralType' && ['string', 'number'].includes(typeof t.literal.value) && !t.literal.expressions ? [t.literal.value] : null;
/** The values of a union of string / number literals (through aliases, in any module), or null. */
export function literalValues(type, mod, depth = 0) {
  if (!type || depth > 16) return null;
  if (type.type === 'TSParenthesizedType') return literalValues(type.typeAnnotation, mod, depth + 1);
  if (literal(type)) return literal(type);
  if (type.type === 'TSUnionType') {
    const parts = type.types.map(t => literalValues(t, mod, depth + 1));
    return parts.every(Boolean) ? [...new Set(parts.flat())] : null;
  }
  const found = reference(type, mod);
  return found?.node.type === 'TSTypeAliasDeclaration' ? literalValues(found.node.typeAnnotation, found.mod, depth + 1) : null;
}

/** Whether values of the type are text (strings, numbers, literals, unions of them with undefined / null). */
export function isTextType(type, mod, depth = 0) {
  if (!type || depth > 16) return false;
  if (['TSStringKeyword', 'TSNumberKeyword', 'TSLiteralType'].includes(type.type)) return true;
  if (type.type === 'TSParenthesizedType') return isTextType(type.typeAnnotation, mod, depth + 1);
  if (type.type === 'TSUnionType') return type.types.every(t => ['TSUndefinedKeyword', 'TSNullKeyword'].includes(t.type) || isTextType(t, mod, depth + 1));
  const found = reference(type, mod);
  return found?.node.type === 'TSTypeAliasDeclaration' ? isTextType(found.node.typeAnnotation, found.mod, depth + 1) : false;
}
