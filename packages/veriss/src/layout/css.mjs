import postcss from 'postcss';
import { calcOperatorProblem } from './calc-syntax.mjs';
import { drop } from './dropped.mjs';
import { colorSyntaxProblem, parseColor } from '../color/index.mjs';
import { backgroundProblem, imageProblem, imageURL, shorthandImageToken, STRAY_COLON } from './background-syntax.mjs';
import { sizeKeywordSplits } from './size-keyword-syntax.mjs';
import { familyProblem, fontShorthandProblem } from './font-syntax.mjs';
import { gridTrackProblem } from './grid-syntax.mjs';
import { keywordProblem } from './keyword-syntax.mjs';
import { timingProblem } from './timing-syntax.mjs';
import {findCSSWriteConflicts,cssWriteConflictMessage} from '../css-writes.mjs';
import { q, cmp, add, mul, div, exact, decimal } from './linear.mjs';
import { parseCondition, preferenceValues } from './conditions.mjs';
import { supportsCondition, supportsFunctionToken } from './supports.mjs';
import { flattenNesting } from './nesting.mjs';
import {customName,variableValue,variableEnvironment,substituteDeclaration} from './variables.mjs';

import { compileSelector, matches, greaterRank, scopeProximity } from './selectors.mjs';
export { matches, simpleSelector } from './selectors.mjs';
const pointSize = /^(?:\d+(?:\.\d{1,20})?px|0)$/;
const remLengths = ['top', 'right', 'bottom', 'left'].flatMap(side => [`margin-${side}`, `padding-${side}`, side]).concat(['inline-size', 'block-size', 'min-inline-size', 'max-inline-size', 'min-block-size', 'max-block-size', 'row-gap', 'column-gap', 'flex-basis', 'font-size']);
// rem resolves against the analysed html root's px font-size once the engine has seen it (setRootFontSize).
let rootFontSize = null;
// A logical inline longhand (padding-inline-start, …) is expanded to the ltr physical side; the side it means in an rtl
// box, or undefined for a longhand that is not one of the inline sides.
const logicalFlip = (property, name) => /-inline(?:-start|-end)?$/.test(property) && /(?:^|-)(?:left|right)$/.test(name) ? name.replace(/(left|right)$/, side => side === 'left' ? 'right' : 'left') : undefined;

export function setRootFontSize(size) { rootFontSize = size; }
// The form-control UA profile of the analysis (layout option ua), or null for the historical Chromium defaults.
let uaProfile = null;
export function setUAProfile(profile) { uaProfile = profile; }
// @property registrations (name → {inherits, initial, syntax}), set by the analysis from the parsed sheets.
let registeredProperties = new Map();
export function setRegisteredProperties(registry) { registeredProperties = registry ?? new Map(); }
// The transitions of a computed style: one per transition-property entry, the other lists repeated to it.
export function transitionsOf(style) {
  const list = key => postcss.list.comma(String(style[key] ?? ''));
  const names = list('transition-property'), at = (key, i, fallback) => { const l = list(key); return l.length ? l[i % l.length] : fallback; };
  return names.map((property, i) => ({ property, duration: at('transition-duration', i, '0s'), easing: at('transition-timing-function', i, 'ease'), delay: at('transition-delay', i, '0s') })).filter(t => t.property !== 'none');
}
// The animations of a computed style: one per animation-name entry (none included, so indices match), each longhand
// list repeated to that length (CSS Animations 1 §4).
export function animationsOf(style) {
  const list = key => postcss.list.comma(String(style[key] ?? ''));
  const names = list('animation-name'), at = (key, i, fallback) => { const l = list(key); return l.length ? l[i % l.length] : fallback; };
  return names.map((name, i) => ({ name, duration: at('animation-duration', i, '0s'), count: at('animation-iteration-count', i, '1'), playState: at('animation-play-state', i, 'running'), direction: at('animation-direction', i, 'normal'), easing: at('animation-timing-function', i, 'ease'), delay: at('animation-delay', i, '0s'), fill: at('animation-fill-mode', i, 'none'), timeline: at('animation-timeline', i, 'auto') })).filter(a => a.name !== 'none');
}
// Typed syntaxes accepted, with the literal values whose computed value is the value itself (no em, var() or calc():
// those compute where they are declared, which the unregistered substitution does not model).
const typedValue = { '<length>': /^(?:0|-?\d*\.?\d+px)$/, '<number>': /^-?\d*\.?\d+$/, '<integer>': /^-?\d+$/, '<percentage>': /^-?\d*\.?\d+%$/, '<length-percentage>': /^(?:0|-?\d*\.?\d+(?:px|%))$/, '<color>': /^#[0-9a-f]{3,8}$/i };
export const registeredValueProblem = (name, text) => { const r = registeredProperties.get(name); if (!r || r.syntax === '*') return null; const v = String(text).trim(); return typedValue[r.syntax].test(v) || ['initial', 'inherit', 'unset', 'revert'].includes(v.toLowerCase()) ? null : `${name} is registered as ${r.syntax}; its value ${v} is not a literal that computes to itself, which is not modeled`; };
// Parse-time check of a px or rem length; rem resolves at layout time, against the html root (else Unknown).
// env(safe-area-inset-*) (optionally with a px fallback, or as max(px, env(…))) resolves at layout time against the
// declared safe area (setSafeArea; 0 without viewport-fit=cover, as browsers report).
const envPattern = /^env\(\s*safe-area-inset-(top|right|bottom|left)\s*(?:,\s*(\d+(?:\.\d{1,20})?px|0)\s*)?\)$/;
const maxEnv = /^max\(\s*(\d+(?:\.\d{1,20})?px|0)\s*,\s*(env\([^()]*\))\s*\)$/;
let safeArea = null;
export function setSafeArea(area) { safeArea = area; }
// em (checklist D2) also resolves later, against the element's font-size (computeStyle); else it is Unknown where used.
const pxSyntax = text => { if (!/^\d+(?:\.\d{1,20})?r?em$/.test(text) && !envPattern.test(text) && !maxEnv.test(text)) px(text); };
export function px(text) {
  const env = envPattern.exec(text ?? ''), envMax = maxEnv.exec(text ?? '');
  if (envMax) { const a = px(envMax[1]), b = px(envMax[2]); return cmp(a, b) >= 0 ? a : b; }
  if (env) {
    if (safeArea === 'unknown') throw new Error(`${text}: viewport-fit=cover lets the page under the device's safe area; declare the safeArea option`);
    return q(String(safeArea?.[env[1]] ?? 0));
  }
  const rem = /^(\d+(?:\.\d{1,20})?)rem$/.exec(text ?? '');
  if (rem && rootFontSize) return mul(q(rem[1]), rootFontSize);
  if (!pointSize.test(text)) throw new Error(`Unsupported CSS pixel length: ${text}`);
  return q(text.replace(/px$/, ''));
}

const aliases = { width: 'inline-size', 'min-width': 'min-inline-size', 'max-width': 'max-inline-size', height: 'block-size', 'min-height': 'min-block-size', 'max-height': 'max-block-size' };
const insets = { 'inset-inline-start':'left', 'inset-inline-end':'right', 'inset-block-start':'top', 'inset-block-end':'bottom' };
// Why a grid-template-areas value is invalid, or null (a list of strings with equal cell counts, each name a rectangle).
function invalidAreas(value) {
  const strings = [...String(value).matchAll(/"([^"]*)"|'([^']*)'/g)].map(m => (m[1] ?? m[2]).trim());
  if (!strings.length || String(value).replace(/"[^"]*"|'[^']*'/g, '').trim()) return null; // none, a keyword or a var(): not judged here
  const grid = strings.map(row => row.match(/\.+|[^\s.]+/g) ?? []);
  if (grid.some(row => !row.length)) return 'an empty row';
  if (grid.some(row => row.length !== grid[0].length)) return `rows of different lengths (${grid.map(row => row.length).join(', ')} cells)`;
  const cells = new Map();
  grid.forEach((row, y) => row.forEach((name, x) => { if (!/^\./.test(name)) (cells.get(name) ?? cells.set(name, []).get(name)).push([x, y]); }));
  for (const [name, at] of cells) {
    const xs = at.map(([x]) => x), ys = at.map(([, y]) => y), w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
    if (w * h !== at.length) return `the area ${name} is not a rectangle`;
  }
  return null;
}
const textInputTypes = new Set(['text', 'email', 'password', 'search', 'tel', 'url', 'number']);
export const noPseudoHost = box => ['img', 'select', 'textarea', 'iframe', 'video', 'br', 'canvas'].includes(box.tag) || (box.tag === 'input' && textInputTypes.has(box.inputType));
const geometry = new Set(['aspect-ratio', 'display', 'appearance', 'box-sizing', 'inline-size', 'min-inline-size', 'max-inline-size', 'column-gap', 'grid-template-columns', 'grid-template-areas', 'grid-column', 'grid-row', 'overflow-x', 'overflow-y', 'scrollbar-gutter', 'scrollbar-width', 'white-space', 'overflow-wrap', 'float', 'position', 'writing-mode', 'direction', 'block-size', 'min-block-size', 'max-block-size', 'row-gap', 'grid-template-rows', 'grid-auto-rows', 'grid-auto-flow', 'container-type', 'container-name', 'align-items', 'align-self', 'align-content', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'justify-content', 'order']);
// Text/font metrics come from trusted caller contracts. Paint is not validated.
// revert-layer (checklist C4) passes through every property like the other CSS-wide keywords; the cascade resolves it.
// Properties that take only a length (or a keyword / percentage), never a bare number (F93).
const lengthOnly = /^(?:(?:min-|max-)?(?:width|height|inline-size|block-size)|margin(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?|padding(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?|top|right|bottom|left|inset(?:-(?:inline|block)(?:-(?:start|end))?)?|gap|row-gap|column-gap|font-size|border-(?:top-|bottom-)?(?:left-|right-)?radius|border-(?:top|right|bottom|left)-width|border-width|outline-width|outline-offset|letter-spacing|word-spacing|text-indent|flex-basis)$/;
// Properties that take a color, alone or inside a shorthand (F107).
const colorProperty = /^(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-color)?|outline(?:-color)?|caret-color|accent-color|fill|stroke|text-decoration(?:-color)?|text-emphasis(?:-color)?|column-rule(?:-color)?|box-shadow|text-shadow|flood-color|lighting-color|stop-color|scrollbar-color)$/;
// F111: why the browser ignores an @property rule (CSS Properties and Values API 1 §2; measured in Chromium, Firefox and
// WebKit), or null. Judged: the syntax must be a quoted string of known component names (or *), inherits true or false,
// and an initial-value present unless the syntax is *; for <length> the initial value must be an absolute length (not
// a bare number, em, % or a viewport unit). Anything else is left to the checks after (which keep it Unknown).
const syntaxComponents = new Set(['length', 'number', 'percentage', 'length-percentage', 'color', 'image', 'url', 'integer', 'angle', 'time', 'resolution', 'transform-function', 'custom-ident', 'transform-list', 'string']);
function propertyRuleProblem(rawSyntax, inherits, initial) {
  if (rawSyntax === undefined) return 'it has no syntax descriptor';
  const quoted = /^(["'])(.*)\1$/s.exec(rawSyntax.trim());
  if (!quoted) return `the syntax ${rawSyntax.trim()} is not a string (write it in quotes)`;
  const syntax = quoted[2].trim();
  if (syntax !== '*') {
    const unknown = syntax.split('|').map(part => part.trim()).map(part => /^<([a-z-]+)>[+#]?$/i.exec(part)?.[1]).find(name => name !== undefined && !syntaxComponents.has(name.toLowerCase()));
    if (unknown) return `the syntax names <${unknown}>, which is not a syntax component`;
  }
  if (inherits === undefined) return 'it has no inherits descriptor';
  if (!['true', 'false'].includes(inherits)) return `inherits is ${inherits}, not true or false`;
  if (syntax !== '*' && initial === undefined) return 'it has no initial-value (required unless the syntax is *)';
  if (syntax === '<length>' && !/^(?:0|[+-]?(?:\d+\.?\d*|\.\d+)(?:px|cm|mm|in|pt|pc|q))$/i.test(String(initial).trim())) return `the initial-value ${initial} is not an absolute length (a bare number, em, % or a viewport unit is not allowed)`;
  return null;
}
const wide = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);
const decoration = /^(?:background-(?:position|size|repeat|clip|origin|attachment)|border-radius|text-shadow|text-decoration-(?:color|style|thickness)|text-underline-offset|transition-behavior|list-style-(?:position|image))$/;
// Properties a :hover/:focus rule may set: they repaint (or restack) without changing geometry.
// The selector with its pseudo-classes and pseudo-elements removed (:not(), :is(), :has() and states included; tags,
// classes, ids, attributes and combinators kept): fewer conditions, so it matches a superset of the boxes the selector
// matches, in any state. An empty compound becomes *. Null when even that does not compile.
function candidateSelector(text) {
  let out = '';
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (c === '[') { const end = text.indexOf(']', i); if (end < 0) return null; out += text.slice(i, end + 1); i = end + 1; continue; }
    if (c === '\\') { out += text.slice(i, i + 2); i += 2; continue; }
    if (c === ':') {
      let j = i + 1; if (text[j] === ':') j++;
      while (j < text.length && /[\w-]/.test(text[j])) j++;
      if (text[j] === '(') { let depth = 0; for (; j < text.length; j++) { if (text[j] === '(') depth++; else if (text[j] === ')' && --depth === 0) { j++; break; } } }
      i = j; continue;
    }
    out += c; i++;
  }
  out = out.replace(/\s*([>+~])\s*/g, ' $1 ').replace(/\s+/g, ' ').trim();
  // Empty compounds (between combinators, or at either end) become *.
  const parts = out.split(' ').filter(Boolean), fixed = [];
  for (const part of parts) { if (/^[>+~]$/.test(part) && (!fixed.length || /^[>+~]$/.test(fixed.at(-1)))) fixed.push('*'); fixed.push(part); }
  if (!fixed.length || /^[>+~]$/.test(fixed.at(-1))) fixed.push('*');
  try { return compileSelector(fixed.join(' ')); } catch { return null; }
}
// The rule that stands for one the analysis cannot read: on the boxes its candidate selectors match, the layout is
// Unknown ($unmodeled), or only the paint when its declarations only repaint ($paintUnmodeled).
function markRule(candidates, message, node, contexts, layer, file, preferences, kind = paintsOnly(node) ? 'paint' : 'layout') {
  const line = node.source.start.line;
  const declaration = kind === 'paint' ? { property: '$paintUnmodeled', paintUnmodeled: message, file, line } : { property: '$unmodeled', unmodeled: message, code: 'U_LAYOUT_SELECTOR', file, line };
  return { selectors: candidates.map(c => ({ ...c, specificity: [0, 0, 0] })), contexts, declarations: [declaration], layer, file, line, ...(preferences.length ? { preferences } : {}), marker: kind };
}
// Declarations that only repaint (the state paint list, and custom properties).
const paintsOnly = node => (node.nodes ?? []).every(d => d.type !== 'decl' || d.prop.startsWith('--') || statePaint.test(d.prop.toLowerCase()));
const statePaint = /^(?:z-index|color|clip|clip-path|background(?:-.*)?|border-(?:(?:top|right|bottom|left)-)?color|border-radius|outline(?:-.*)?|box-shadow|text-shadow|text-decoration(?:-.*)?|text-underline-offset|cursor|opacity|visibility|pointer-events|animation(?:-.*)?|transition(?:-.*)?|color-scheme)$/;
// Paint and hit-testing facts for the accessibility rules (never geometry).
// An element that is the containing block of its fixed (and absolute) descendants: a transform, a backdrop filter,
// transform-style: preserve-3d (not on an inline box; even where a grouping property flattens it, measured in Chromium,
// Firefox and WebKit), or will-change naming a property that would make one.
/** The declaration that makes the element contain its fixed descendants, as text (for messages). */
export const fixedContainer = style => (style.transform ?? 'none') !== 'none' ? `transform: ${style.transform}` : style['transform-style'] === 'preserve-3d' && style.display !== 'inline' ? 'transform-style: preserve-3d'
  : (style.filter ?? 'none') !== 'none' ? `filter: ${style.filter}` : (style['backdrop-filter'] ?? 'none') !== 'none' ? `backdrop-filter: ${style['backdrop-filter']}` : `will-change: ${style['will-change']}`;
export const containsFixed = style => Boolean(style) && ((style.transform ?? 'none') !== 'none' || (style.filter ?? 'none') !== 'none' || (style['transform-style'] === 'preserve-3d' && style.display !== 'inline') || (style['backdrop-filter'] ?? 'none') !== 'none' || /(?:^|,\s*)(?:transform|translate|rotate|scale|filter|backdrop-filter|perspective)(?:\s*,|$)/.test(style['will-change'] ?? 'auto'));
// Declarations that only act together with another property of the same element (checklist F15, F16): the property
// they need, and the computed value at which they do nothing. (Not inherited, so they act on this element only.)
export const dependentProperty = {
  'background-size': ['background-image', 'none'], 'background-position': ['background-image', 'none'], 'background-repeat': ['background-image', 'none'], 'background-attachment': ['background-image', 'none'], 'background-origin': ['background-image', 'none'],
  'text-decoration-color': ['text-decoration-line', 'none'], 'text-decoration-style': ['text-decoration-line', 'none'], 'text-decoration-thickness': ['text-decoration-line', 'none'],
};
export const paintProperties = ['hyphens', 'object-fit', 'scroll-behavior', 'overscroll-behavior-x', 'overscroll-behavior-y', 'scroll-snap-type', 'scroll-snap-align', 'resize', 'text-wrap-mode', 'text-wrap-style', 'text-overflow', 'line-clamp', 'box-orient', 'touch-action', 'color', 'visibility', 'pointer-events', 'opacity', 'text-decoration-line', 'outline-style', 'outline-width', 'outline-color', 'outline-offset', 'box-shadow', 'cursor', 'list-style-type', 'animation-name', 'animation-duration', 'animation-iteration-count', 'animation-play-state', 'animation-direction', 'animation-timing-function', 'animation-delay', 'animation-fill-mode', 'animation-timeline', 'transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay', 'color-scheme', 'z-index', 'isolation', 'transform-style', 'backface-visibility', 'transform', 'transform-origin', 'translate', 'rotate', 'scale', 'backdrop-filter', 'filter', 'will-change', 'justify-self', 'justify-items', 'fill', 'stroke', 'list-style-position', 'caret-color', 'content-visibility', 'contain-intrinsic-block-size'];
// #46: the SVG-only pointer-events keywords. On a non-SVG element each behaves as auto (CSS UI 4 §5.2.2, SVG 2 §15.6):
// kept as declared (inherited as such) and read as "not none" by the hit tests. On an svg they choose which painted
// parts take the pointer, which is not modeled: computeStyle keeps that Unknown.
const svgPointerEvents = new Set(['all', 'visiblepainted', 'visiblefill', 'visiblestroke', 'visible', 'painted', 'fill', 'stroke']);
const inheritedPaint = ['color', 'fill', 'stroke', 'list-style-position', 'caret-color', 'visibility', 'pointer-events', 'cursor', 'list-style-type', 'color-scheme', 'text-wrap-style', 'text-wrap-mode'];
// Inherited text properties. They are kept as specified strings and only
// interpreted for boxes whose contract derives text metrics from a font.
export const textProperties = ['font-family', 'font-size', 'line-height', 'font-weight', 'font-style', 'font-stretch', 'font-variant', 'text-transform', 'letter-spacing', 'word-spacing', 'text-align'];
const textPropertySet = new Set(textProperties);
/** Marker for longhands set by the `font` shorthand, which is not modeled. */
export const fontShorthand = 'font-shorthand';
// A CSS string literal's value (escapes: \\hex and \\char).
const cssString = literal => literal.slice(1, -1).replace(/\\([\da-f]{1,6}) ?|\\(.)/gi, (_, hex, ch) => hex ? String.fromCodePoint(parseInt(hex, 16)) : ch);
// Checklist B2: an arbitrary rotation composed with other transforms, as floats. Each map is the 14 numbers of an
// affine(...) (A, then the offsets t, W·u, H·w, em·e, rem·r); a rotation by any angle is cos/sin. The result is
// linear-any(...), which the analysis bounds by its circumscribed rectangle (accessibility checks only). em and rem
// offsets are not modeled there.
const floatMap = m => {
  const text = String(m);
  const rot = /^rotate-any\((-?[\d.]+)\)$/.exec(text);
  if (rot) { const r = Number(rot[1]) * Math.PI / 180; return [Math.cos(r), -Math.sin(r), Math.sin(r), Math.cos(r), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; }
  const aff = /^(?:affine|linear-any)\((.+)\)$/.exec(text);
  return aff[1].split(' ').map(x => { const [n, d = '1'] = x.split('/'); return Number(n) / Number(d); });
};
const composeFloat = (P, T) => {
  const [a, b, c, d] = P, lin = (x, y) => [a * x + b * y, c * x + d * y];
  const A = [a * T[0] + b * T[2], a * T[1] + b * T[3], c * T[0] + d * T[2], c * T[1] + d * T[3]];
  return [...A, ...[4, 6, 8, 10, 12].flatMap(i => { const [x, y] = lin(T[i], T[i + 1]); return [x + P[i], y + P[i + 1]]; })];
};
const linearAny = (maps, value) => {
  const m = maps.map(floatMap).reduce(composeFloat);
  if (m.slice(10).some(v => Math.abs(v) > 1e-12)) throw new Error(`Unsupported transform: ${value} (an em or rem translation with a rotation by an angle that is not a quarter turn is not modeled)`);
  return `linear-any(${m.map(v => { const t = (Math.round(v * 1e6) / 1e6).toFixed(6).replace(/\.?0+$/, ''); return t === '-0' || t === '' ? '0' : t; }).join(' ')})`;
};
function expand(property, value) {
  property = aliases[property] ?? property;
  property = insets[property] ?? property;
  // Area names and keyframes names are case-sensitive identifiers (their keywords are lowercased where they are read).
  if (!['container', 'container-name', 'content', 'grid-template-areas', 'grid-area', 'animation', 'animation-name'].includes(property) && !(['grid-row', 'grid-column'].includes(property) && /^-?[A-Za-z_][\w-]*$/.test(value.trim()))) value = value.toLowerCase();
  if (property === 'container-name' && value.toLowerCase() === 'none') value = 'none';
  // white-space also writes text-wrap-mode (CSS Text 4); its mark says white-space itself decides after substitution.
  if (property === 'white-space') return [['white-space', value], ['text-wrap-mode', 'white-space']];
  // aspect-ratio: auto, a ratio (w / h, or one number), or both (auto w / h): normalized to 'auto', 'w/h' or 'auto w/h'.
  if (property === 'aspect-ratio') {
    if (wide.has(value) || value === 'auto') return [[property, value]];
    const m = /^(auto\s+)?(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?))?(\s+auto)?$/.exec(value);
    if (!m || (m[1] && m[4]) || Number(m[2]) <= 0 || (m[3] !== undefined && Number(m[3]) <= 0)) throw new Error(`Unsupported aspect-ratio: ${value}`);
    return [[property, `${m[1] || m[4] ? 'auto ' : ''}${m[2]}/${m[3] ?? '1'}`]];
  }
  if (geometry.has(property)) return [[property, value]];
  if (['left','right','top','bottom'].includes(property)) return [[property,value]];
  if (['inset','inset-inline','inset-block'].includes(property)) {
    const p = postcss.list.space(value), max = property === 'inset' ? 4 : 2;
    if (!p.length || p.length > max) throw new Error('Unsupported inset shorthand');
    if (property === 'inset') return [['top',p[0]],['right',p[1] ?? p[0]],['bottom',p[2] ?? p[0]],['left',p[3] ?? p[1] ?? p[0]]];
    return property === 'inset-inline' ? [['left',p[0]],['right',p[1] ?? p[0]]] : [['top',p[0]],['bottom',p[1] ?? p[0]]];
  }
  // scroll-margin / scroll-padding: they move where the page scrolls a focused or targeted element, never the layout.
  // Only px lengths (and auto for scroll-padding) are modeled; the vertical sides feed the accessibility scroll rules.
  property = property.replace(/^(scroll-(?:margin|padding))-block-(start|end)$/, (_, family, edge) => `${family}-${edge === 'start' ? 'top' : 'bottom'}`);
  const scrollFamily = /^scroll-(margin|padding)(?:-(top|right|bottom|left|block|inline))?$/.exec(property);
  if (scrollFamily) {
    const [, kind, side] = scrollFamily, parts = postcss.list.space(value);
    const length = part => wide.has(part) || /^-?(?:\d+(?:\.\d+)?|\.\d+)px$/.test(part) || part === '0' || (kind === 'padding' && part === 'auto');
    if (!parts.length || !parts.every(length) || (wide.has(value) && parts.length !== 1)) throw new Error(`Unsupported ${property}: ${value}`);
    const name = s => `scroll-${kind}-${s}`;
    if (!side) { if (parts.length > 4) throw new Error(`Unsupported ${property}: ${value}`); return [[name('top'), parts[0]], [name('right'), parts[1] ?? parts[0]], [name('bottom'), parts[2] ?? parts[0]], [name('left'), parts[3] ?? parts[1] ?? parts[0]]]; }
    if (side === 'block' || side === 'inline') { if (parts.length > 2) throw new Error(`Unsupported ${property}: ${value}`); const [a, b] = side === 'block' ? ['top', 'bottom'] : ['left', 'right']; return [[name(a), parts[0]], [name(b), parts[1] ?? parts[0]]]; }
    if (parts.length !== 1) throw new Error(`Unsupported ${property}: ${value}`);
    return [[property, value]];
  }
  // clip / clip-path: only "everything clipped away" (the visually-hidden pattern) and no clipping are modeled; a partial
  // clip changes what is visible in ways the rules do not follow.
  if (property === 'clip') {
    if (wide.has(value) || value === 'auto') return [[property, value]];
    const m = /^rect\(\s*([^,\s]+)[\s,]+([^,\s]+)[\s,]+([^,\s]+)[\s,]+([^,\s)]+)\s*\)$/.exec(value);
    const n = v => v === '0' ? 0 : /^-?\d+(?:\.\d+)?px$/.test(v) ? parseFloat(v) : NaN;
    if (!m || m.slice(1).some(v => Number.isNaN(n(v)))) throw new Error(`Unsupported clip: ${value}`);
    const [top, right, bottom, left] = m.slice(1).map(n);
    if (bottom > top && right > left) throw new Error(`Unsupported clip: ${value} (only an empty rect is modeled)`);
    return [[property, 'empty']];
  }
  if (property === 'clip-path') {
    if (wide.has(value) || value === 'none') return [[property, value]];
    const m = /^inset\(\s*(\d+(?:\.\d+)?)%\s*\)$/.exec(value);
    if (!m || Number(m[1]) < 50) throw new Error(`Unsupported clip-path: ${value} (only inset(50%) or more is modeled)`);
    return [[property, 'empty']];
  }
  if (property==='scrollbar-color') return [];
  if (property === 'all') {
    if (!wide.has(value)) throw new Error('Unsupported all reset');
    return [...geometry, ...textProperties, ...paintProperties, 'background-color', 'background-image', ...['left', 'right', 'top', 'bottom'].flatMap(side => [side, `padding-${side}`, `margin-${side}`, `border-${side}`])].filter(key => key !== 'direction').map(key => [key, value]);
  }
  if (property === 'flex') return flexShorthand(value);
  // grid-area: <name> places the item in the named area of its parent's grid-template-areas (grid.mjs resolves it);
  // a name in grid-row / grid-column is the same area's lines. Line-number forms of grid-area are not modeled.
  if (property === 'grid-area') {
    if (wide.has(value)) return [['grid-row', value], ['grid-column', value]];
    const v = value.trim();
    if (v === 'auto') return [['grid-row', 'auto'], ['grid-column', 'auto']];
    if (/^-?[A-Za-z_][\w-]*$/.test(v) && !/^span$/i.test(v)) return [['grid-row', `area:${v}`], ['grid-column', `area:${v}`]];
    throw new Error(`Unsupported grid-area: ${value} (only a named area or auto is modeled)`);
  }
  if ((property === 'grid-row' || property === 'grid-column') && /^-?[A-Za-z_][\w-]*$/.test(value.trim()) && !['auto', 'span', 'inherit', 'initial', 'unset', 'revert', 'revert-layer'].includes(value.trim())) return [[property, `area:${value.trim()}`]];
  if (property === 'grid-template-areas') {
    if (wide.has(value) || value.trim() === 'none') return [[property, value.trim()]];
    const rows = [...value.matchAll(/"([^"]*)"|'([^']*)'/g)].map(m => (m[1] ?? m[2]).trim());
    if (!rows.length || value.replace(/"[^"]*"|'[^']*'/g, '').trim()) throw new Error(`Unsupported grid-template-areas: ${value}`);
    return [[property, rows.map(r => r.split(/\s+/).join(' ')).join('|')]];
  }
  if (property === 'flex-flow') {
    if (wide.has(value)) return [['flex-direction', value], ['flex-wrap', value]];
    const parts = postcss.list.space(value), direction = parts.filter(p => /^(?:row|row-reverse|column|column-reverse)$/.test(p)), wrap = parts.filter(p => /^(?:nowrap|wrap|wrap-reverse)$/.test(p));
    if (!parts.length || parts.length > 2 || direction.length > 1 || wrap.length > 1 || direction.length + wrap.length !== parts.length) throw new Error(`Unsupported flex-flow: ${value}`);
    return [['flex-direction', direction[0] ?? 'row'], ['flex-wrap', wrap[0] ?? 'nowrap']];
  }
  if (property === 'gap' && wide.has(value)) return [['row-gap', value], ['column-gap', value]];
  if (property === 'overflow' && wide.has(value)) return [['overflow-x', value], ['overflow-y', value]];
  // Generated content: none/normal (no box), an empty string, or text (whose box is not modeled).
  if (property === 'content') { if (['none', 'normal'].includes(value)) return [['content', 'none']]; if (/^(?:""|'')$/.test(value)) return [['content', 'empty']]; if (/^(?:"[^"]*"|'[^']*')$/.test(value)) return [['content', `text:${cssString(value)}`]]; throw new Error(`Unsupported content: ${value}`); }
  if (property === 'gap') {
    const parts = postcss.list.space(value); if (parts.length > 2) throw new Error('Unsupported gap');
    parts.forEach(part => { if (part !== 'normal') pxSyntax(part); }); return [['row-gap', parts[0]], ['column-gap', parts.at(-1)]];
  }
  if (property === 'overflow') {
    const parts = postcss.list.space(value); if (parts.length > 2) throw new Error('Unsupported overflow');
    return [['overflow-x', parts[0]], ['overflow-y', parts[1] ?? parts[0]]];
  }
  if (property === 'padding') {
    const p = postcss.list.space(value); if (p.length < 1 || p.length > 4) throw new Error('Unsupported padding');
    if (!wide.has(value)) p.forEach(pxSyntax); return [['padding-top', p[0]], ['padding-right', p[1] ?? p[0]], ['padding-bottom', p[2] ?? p[0]], ['padding-left', p[3] ?? p[1] ?? p[0]]];
  }
  if (property === 'padding-inline' || property === 'padding-block') {
    const p = postcss.list.space(value); if (p.length > 2) throw new Error('Unsupported padding-inline');
    if (!wide.has(value)) p.forEach(pxSyntax); return property === 'padding-inline' ? [['padding-left', p[0]], ['padding-right', p[1] ?? p[0]]] : [['padding-top', p[0]], ['padding-bottom', p[1] ?? p[0]]];
  }
  if (['padding-left', 'padding-right', 'padding-inline-start', 'padding-inline-end', 'padding-top', 'padding-bottom', 'padding-block-start', 'padding-block-end'].includes(property)) {
    if (!wide.has(value)) pxSyntax(value); return [[property.replace('inline-start', 'left').replace('inline-end', 'right').replace('block-start', 'top').replace('block-end', 'bottom'), value]];
  }
  if (/^margin(?:-(?:inline|block|left|right|top|bottom|inline-start|inline-end|block-start|block-end))?$/.test(property)) {
    const sides = property === 'margin' ? ['top', 'right', 'bottom', 'left'] : property === 'margin-inline' ? ['left', 'right'] : property === 'margin-block' ? ['top', 'bottom'] : [property.slice(7).replace('inline-start', 'left').replace('inline-end', 'right').replace('block-start', 'top').replace('block-end', 'bottom')];
    if (wide.has(value)) return sides.map(side => [`margin-${side}`, value]);
    const parts = postcss.list.space(value);
    const maximum = property === 'margin' ? 4 : ['margin-inline', 'margin-block'].includes(property) ? 2 : 1;
    if (!parts.length || parts.length > maximum) throw new Error(`${property} requires 1..${maximum} values`);
    // Zero, or auto (only flex items may use it on their main axis; checked by the engine).
    // Zero, auto, or a non-negative px length (grid items take px margins; checked by the engine).
    // A non-negative rem margin stays rem until computeStyle resolves it against the root font size.
    const margin = v => { if (v === 'auto') return 'auto'; if (/^\d+(?:\.\d{1,20})?r?em$/.test(v)) return /^0+(?:\.0+)?r?em$/.test(v) ? '0' : v; if (/^-\d+(?:\.\d{1,20})?px$/.test(v)) return v; /* a negative px margin: the engine models it on a flex row's main axis only */ const n = px(v); if (cmp(n, q(0)) === 0) return '0'; if (cmp(n, q(0)) < 0) throw new Error('Negative margins are not modeled'); if (!/^\d+(?:\.\d+)?px$/.test(v)) throw new Error('Only px, zero or auto margins are supported'); return v; };
    const values = property === 'margin' ? [parts[0], parts[1] ?? parts[0], parts[2] ?? parts[0], parts[3] ?? parts[1] ?? parts[0]] : sides.length === 2 ? [parts[0], parts[1] ?? parts[0]] : [parts[0]];
    return sides.map((side, i) => [`margin-${side}`, margin(values[i])]);
  }
  // The border shorthands: border, border-inline, border-block and each side's (border-top, …). Any order of [width]
  // [style] [color], each optional (CSS Backgrounds 3 §4.4): an omitted width is medium, an omitted style none (kept
  // apart from a written none: 'none-implied'), an omitted color currentcolor. Each side keeps its width ($bw-side) and
  // style ($bs-side); computeStyle derives the used width from the pair after the cascade. The color is kept as paint
  // (border-<side>-color) for the non-text contrast rules.
  const borderSides = { border: ['left', 'right', 'top', 'bottom'], 'border-inline': ['left', 'right'], 'border-block': ['top', 'bottom'], 'border-top': ['top'], 'border-right': ['right'], 'border-bottom': ['bottom'], 'border-left': ['left'] };
  if (property in borderSides) {
    const sides = borderSides[property];
    // initial and unset set the side's width and style too (medium, none). A shorthand with var() is expanded as 'initial'
    // to find the longhands it writes: without its width and style here, a later border-width read its style as none.
    // (inherit and revert take the side's used border as a whole, as before.)
    if (wide.has(value)) return sides.flatMap(side => [[`border-${side}`, value], [`border-${side}-color`, value], ...(['initial', 'unset'].includes(value) ? [[`$bw-${side}`, value], [`$bs-${side}`, value]] : [])]);
    const styles = new Set(['none', 'hidden', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset']);
    const lengthLike = /^(?:\d+\.?\d*|\.\d+)(?:px|r?em|ch|ex|vw|vh|vmin|vmax)$/;
    let width, style, color;
    for (const part of postcss.list.space(value)) {
      if (style === undefined && styles.has(part)) style = part;
      else if (width === undefined && (['0', 'thin', 'medium', 'thick'].includes(part) || lengthLike.test(part))) width = part;
      // (A percentage, a negative length or another number is not a color: the declaration is dropped.)
      else if (color === undefined && !styles.has(part) && !/^[-+]?(?:\d|\.\d)/.test(part)) color = part;
      else throw new Error(`Unsupported ${property}: ${value}`);
    }
    // With no style the border draws nothing whatever the width (measured in Chromium, Firefox and WebKit), so any
    // length is taken; a drawn border needs a px width (or a keyword).
    const drawn = style !== undefined && !['none', 'hidden'].includes(style);
    const w = width === undefined ? '3px' : /^0(?:\.0+)?(?:[a-z]+)?$/.test(width) ? '0' : width === 'thin' ? '1px' : width === 'medium' ? '3px' : width === 'thick' ? '5px' : drawn ? (px(width), width) : width;
    return sides.flatMap(side => [[`border-${side}`, drawn ? w : '0'], [`border-${side}-color`, color ?? 'currentcolor'], [`$bw-${side}`, w], [`$bs-${side}`, style ?? 'none-implied']]);
  }
  // border-width / border-style and their side longhands (StyleX writes borders this way): kept as each side's width
  // ($bw-side) and style ($bs-side); computeStyle derives the side's used width from the pair after the cascade (none or
  // hidden: 0), so they combine with the border shorthand (which sets both) in cascade order.
  const fourSides = (p, n) => ({ top: p[0], right: p[1] ?? p[0], bottom: p[2] ?? p[0], left: p[3] ?? p[1] ?? p[0] })[n];
  if (property === 'border-width' || /^border-(?:top|right|bottom|left)-width$/.test(property)) {
    const p = postcss.list.space(value), sides = property === 'border-width' ? ['top', 'right', 'bottom', 'left'] : [property.split('-')[1]];
    if (wide.has(value)) return sides.map(side => [`$bw-${side}`, value]);
    if (!p.length || p.length > (sides.length === 4 ? 4 : 1)) throw new Error(`Unsupported ${property}: ${value}`);
    const width = v => { if (/^0(?:\.0+)?(?:px)?$/.test(v)) return '0'; if (v === 'thin') return '1px'; if (v === 'medium') return '3px'; if (v === 'thick') return '5px'; px(v); return v; };
    return sides.map(side => [`$bw-${side}`, width(sides.length === 4 ? fourSides(p, side) : p[0])]);
  }
  if (property === 'border-style' || /^border-(?:top|right|bottom|left)-style$/.test(property)) {
    const p = postcss.list.space(value), sides = property === 'border-style' ? ['top', 'right', 'bottom', 'left'] : [property.split('-')[1]];
    if (wide.has(value)) return sides.map(side => [`$bs-${side}`, value]);
    const styles = new Set(['none', 'hidden', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset']);
    if (!p.length || p.length > (sides.length === 4 ? 4 : 1) || !p.every(v => styles.has(v))) throw new Error(`Unsupported ${property}: ${value}`);
    return sides.map(side => [`$bs-${side}`, sides.length === 4 ? fourSides(p, side) : p[0]]);
  }
  if (property === 'border-color') {
    const p = postcss.list.space(value);
    if (!p.length || p.length > 4 || (wide.has(value) && p.length !== 1)) throw new Error(`Unsupported border-color: ${value}`);
    return [['top', p[0]], ['right', p[1] ?? p[0]], ['bottom', p[2] ?? p[0]], ['left', p[3] ?? p[1] ?? p[0]]].map(([side, color]) => [`border-${side}-color`, color]);
  }
  if (/^border-(?:top|right|bottom|left)-color$/.test(property)) return [[property, value]];
  if (property === 'container') {
    const p = value.split('/').map(v => v.trim());
    if (p.length > 2 || !p[0]) throw new Error('Unsupported container shorthand');
    return [['container-name', p[0].toLowerCase() === 'none' ? 'none' : p[0]], ['container-type', (p[1] ?? 'normal').toLowerCase()]];
  }
  if (textPropertySet.has(property)) {
    // letter-spacing: normal, px or em (made px at the declaring element, its computed value); word-spacing: normal.
    if (property === 'letter-spacing' && !wide.has(value) && !['normal', '0', '0px'].includes(value) && !/^-?\d+(?:\.\d{1,20})?(?:px|em)$/.test(value)) throw new Error(`Unsupported ${property}: ${value}`);
    if (property === 'word-spacing' && !wide.has(value) && !['normal', '0', '0px'].includes(value)) throw new Error(`Unsupported ${property}: ${value}`);
    return [[property, value]];
  }
  if (property === 'font') {
    // The common form [style] [weight] size[/line-height] family is expanded (the rest of font resets to initial);
    // anything else (system fonts, small-caps, stretch keywords) stays the unmodeled shorthand marker.
    const keys = textProperties.filter(key => key.startsWith('font-') || key === 'line-height');
    if (wide.has(value)) return keys.map(key => [key, value]);
    const m = /^(?:(normal|italic|oblique)\s+)?(?:(normal|bold|bolder|lighter|[1-9]00)\s+)?((?:\d+(?:\.\d+)?)(?:px|em|rem|%)|xx-small|x-small|small|medium|large|x-large|xx-large|smaller|larger)(?:\s*\/\s*(normal|\d+(?:\.\d+)?(?:px|em|rem|%)?))?\s+(\S.*)$/i.exec(value.trim());
    if (!m) return keys.map(key => [key, fontShorthand]);
    const set = { 'font-style': m[1] ?? 'normal', 'font-weight': m[2] ?? 'normal', 'font-size': m[3], 'line-height': m[4] ?? 'normal', 'font-family': m[5].trim(), 'font-variant': 'normal', 'font-stretch': 'normal' };
    return keys.map(key => [key, set[key] ?? fontShorthand]);
  }
  // Paint only: whether a box draws a background (integrity `protrusion: 'painted'`).
  if (property === 'background-color' || property === 'background-image') return [[property, value]];
  // Table layout facts (fixed tables are modeled as an equivalent grid).
  if (['table-layout', 'border-collapse', 'border-spacing', 'caption-side', 'empty-cells', 'vertical-align'].includes(property)) return [[property, value]];
  // F81: column-span; a multi-column container makes the analysis Unknown, so outside one it does nothing (engine reports it).
  if (property === 'column-span') { const v = String(value).trim().toLowerCase(); if (['initial', 'unset', 'revert', 'revert-layer'].includes(v)) return [[property, 'none']]; if (!['none', 'all'].includes(v)) throw new Error(`Unsupported column-span: ${value}`); return [[property, v]]; }
  if (property === 'outline') {
    if (wide.has(value)) return [['outline-style', value], ['outline-width', value], ['outline-color', value]];
    const parts = postcss.list.space(value), style = parts.find(p => /^(?:none|auto|solid|dotted|dashed|double|groove|ridge|inset|outset|hidden)$/.test(p)) ?? 'none';
    const widthPart = parts.find(p => /^(?:\d+(?:\.\d+)?px|0|thin|medium|thick)$/.test(p)) ?? 'medium';
    const colorPart = parts.find(p => p !== style && p !== widthPart) ?? 'currentcolor';
    return [['outline-style', style], ['outline-width', widthPart], ['outline-color', colorPart]];
  }
  if (property === 'text-decoration') {
    if (wide.has(value)) return [['text-decoration-line', value]];
    const lines = postcss.list.space(value).filter(p => ['underline', 'overline', 'line-through', 'none'].includes(p));
    return [['text-decoration-line', lines.length ? lines.join(' ') : 'none']];
  }
  if (property === 'list-style') {
    if (wide.has(value)) return [['list-style-type', value], ['list-style-position', value]];
    const all = postcss.list.space(value), parts = all.filter(p => !/^(?:inside|outside|url\(.*|none)$/.test(p) || p === 'none');
    return [['list-style-type', parts.find(p => p !== 'none') ?? (parts.includes('none') ? 'none' : 'disc')], ['list-style-position', all.includes('inside') ? 'inside' : 'outside']];
  }
  // An outside marker does not take part in the list item's layout; an inside one is an inline box in its first line.
  if (property === 'list-style-position') { if (!wide.has(value) && !['inside', 'outside'].includes(value)) throw new Error(`Unsupported list-style-position: ${value}`); return [[property, value]]; }
  // Transitions (CSS Transitions 1): which properties ease from a before-change value, for how long, with what easing.
  // Kept as lists; the analysis uses them for the starting values of @starting-style (a box that appears).
  if (property === 'transition') {
    const keys = ['transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay'];
    if (wide.has(value)) return keys.map(key => [key, value]);
    const items = postcss.list.comma(value).map(item => {
      const parts = postcss.list.space(item), times = parts.filter(p => /^-?(?:\d+(?:\.\d+)?|\.\d+)m?s$/.test(p));
      const easing = parts.find(p => /^(?:linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end|(?:cubic-bezier|steps|linear)\(.*\))$/.test(p)) ?? 'ease';
      const name = parts.find(p => !times.includes(p) && p !== easing && !['normal', 'allow-discrete'].includes(p)) ?? 'all';
      return [name, times[0] ?? '0s', easing, times[1] ?? '0s'];
    });
    return keys.map((key, i) => [key, items.map(item => item[i]).join(', ')]);
  }
  if (['transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay'].includes(property)) return [[property, wide.has(value) ? value : postcss.list.comma(value).join(', ')]];
  // The easing of an animation (CSS Easing 2): it decides how far past its keyframes a value can go (easing.mjs).
  // Scroll-driven animations (Scroll-driven Animations 1): animation-timeline ties the progress to scrolling. scroll()
  // and view() (anonymous timelines) are modeled as running over the whole progress; a named timeline is not.
  // animation-range only narrows which part of the progress plays, so the states it reaches are among those checked.
  if (property === 'animation-timeline') {
    if (wide.has(value)) return [[property, value]];
    const items = postcss.list.comma(value);
    for (const item of items) if (!/^(?:auto|none|scroll\([^)]*\)|view\([^)]*\))$/.test(item)) throw new Error(`Unsupported animation-timeline: ${item} (a named timeline is not modeled)`);
    return [[property, items.join(', ')]];
  }
  if (/^animation-range(?:-start|-end)?$/.test(property)) return [];
  // The delay before an animation starts, and what it shows before and after it runs (CSS Animations 1 §3).
  if (property === 'animation-delay' || property === 'animation-fill-mode') return [[property, wide.has(value) ? value : postcss.list.comma(value).join(', ')]];
  if (property === 'animation-timing-function') return [[property, wide.has(value) ? value : postcss.list.comma(value).join(', ')]];
  // animation-name: a keyframes name keeps its case; none and the CSS-wide keywords are keywords in any case.
  if (property === 'animation-name') return [[property, postcss.list.comma(value).map(name => wide.has(name.toLowerCase()) || name.toLowerCase() === 'none' ? name.toLowerCase() : name).join(', ')]];
  if (property === 'animation') {
    const keys = ['animation-name', 'animation-duration', 'animation-iteration-count', 'animation-play-state', 'animation-direction', 'animation-timing-function', 'animation-delay', 'animation-fill-mode', 'animation-timeline'];
    if (wide.has(value.trim().toLowerCase())) return keys.map(key => [key, value.trim().toLowerCase()]);
    // A list of animations: each item sets one entry of every longhand list (CSS Animations 1 §4).
    const items = postcss.list.comma(value).map(item => one(item));
    return keys.map((key, i) => [key, items.map(item => item[i][1]).join(', ')]);
  }
  function one(item) {
    // Every part but the keyframes name is a keyword or a number: matched lowercased; the name keeps its case.
    const original = postcss.list.space(item), value = item.toLowerCase();
    const parts = postcss.list.space(value), times = parts.filter(p => /^-?(?:\d+(?:\.\d+)?|\.\d+)m?s$/.test(p));
    const count = parts.find(p => p === 'infinite' || /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(p)), state = parts.find(p => ['running', 'paused'].includes(p));
    const keyword = /^(?:infinite|running|paused|normal|reverse|alternate|alternate-reverse|none|forwards|backwards|both|linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end|(?:cubic-bezier|steps|linear)\(.*)$/;
    const at = parts.findIndex(p => !times.includes(p) && p !== count && !keyword.test(p)), name = at >= 0 ? original[at] : 'none';
    const direction = parts.find(p => ['normal', 'reverse', 'alternate', 'alternate-reverse'].includes(p)) ?? 'normal';
    const easing = parts.find(p => /^(?:linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end|(?:cubic-bezier|steps|linear)\(.*\))$/.test(p)) ?? 'ease';
    return [['animation-name', name], ['animation-duration', times[0] ?? '0s'], ['animation-iteration-count', count ?? '1'], ['animation-play-state', state ?? 'running'], ['animation-direction', direction], ['animation-timing-function', easing], ['animation-delay', times[1] ?? '0s'], ['animation-fill-mode', parts.find(p => ['none', 'forwards', 'backwards', 'both'].includes(p) && p !== name) ?? 'none'], ['animation-timeline', 'auto']]; // the shorthand resets the timeline
  }
  // hyphens (inherited): manual and none break only at explicit opportunities; auto also needs the content language.
  if (property === 'hyphens' && !wide.has(value) && !['manual', 'none', 'auto'].includes(value)) throw new Error(`Unsupported hyphens: ${value}`);
  // object-fit (how a replaced element's content fills its box; no geometry of the box itself).
  if (property === 'object-fit' && !wide.has(value) && !/^(?:fill|contain|cover|none|scale-down)$/.test(value)) throw new Error(`Unsupported object-fit: ${value}`);
  // touch-action (gestures only, no geometry): auto, none, manipulation, or pan-x/pan-y/pinch-zoom (and their -left/-right/-up/-down forms).
  if (property === 'touch-action' && !wide.has(value) && !/^(?:auto|none|manipulation|(?:(?:pan-(?:x|left|right)|pan-(?:y|up|down)|pinch-zoom)(?:\s+|$))+)$/.test(value)) throw new Error(`Unsupported touch-action: ${value}`);
  if (property === 'color-scheme' && !wide.has(value) && !/^(?:normal|(?:only\s+)?(?:light|dark)(?:\s+(?:light|dark))?(?:\s+only)?)$/.test(value)) throw new Error(`Unsupported color-scheme: ${value}`);
  // Stacking order (paint and hit testing only): auto or an integer.
  // transform: a list of px translations, scales and quarter-turn rotations (axis-aligned, about the centre).
  // It composes to p ↦ C + A(p − C) + t: A has one nonzero entry per row, t is each translation mapped by the
  // linear parts before it. Stored exactly as affine(a b c d tx ty) with rational entries.
  // backdrop-filter: blur(…) paints the backdrop (a solid backdrop stays that color); will-change: a hint. Neither
  // moves a box, but both make the element the containing block of its fixed and absolute descendants (Filter Effects 2,
  // CSS Will Change: as transform or filter would), which the engine applies as it does for a transform.
  // filter (measured in Chromium, Firefox and WebKit): any value but none makes a stacking context and the containing
  // block of fixed descendants, keeps the hit area (a drop shadow takes no pointer) and the layout; it changes the
  // painted colors (contrast is Unknown under it). A url() filter (SVG) is not modeled.
  if (property === 'filter' || property === '-webkit-filter') {
    const v = value.trim();
    if (wide.has(value) || v === 'none') return [['filter', v]];
    const fn = /(?:blur|brightness|contrast|drop-shadow|grayscale|hue-rotate|invert|opacity|saturate|sepia)\((?:[^()]|\([^()]*\))*\)/gi;
    if (v.replace(fn, '').trim() === '' && fn.test(v)) return [['filter', v]];
    throw new Error(`Unsupported filter: ${value} (only the filter functions are modeled; url() is not)`);
  }
  if (property === 'backdrop-filter' || property === '-webkit-backdrop-filter') {
    if (wide.has(value) || value === 'none') return [['backdrop-filter', value]];
    if (/^(?:blur\(\s*(?:\d+(?:\.\d+)?px|0)\s*\)\s*)+$/i.test(value.trim())) return [['backdrop-filter', value.trim().toLowerCase()]];
    throw new Error(`Unsupported backdrop-filter: ${value} (only blur() is modeled: other filters change the colors behind the box)`);
  }
  if (property === 'will-change') {
    if (wide.has(value)) return [['will-change', value]];
    const v = value.trim().toLowerCase();
    if (!/^[a-z-]+(?:\s*,\s*[a-z-]+)*$/.test(v)) throw new Error(`Unsupported will-change: ${value}`);
    return [['will-change', v]];
  }
  // The individual transform properties (CSS Transforms 2): each is parsed as the transform function it stands for and
  // composed with transform when the style is computed (translate, then rotate, then scale, then transform). Only 2D
  // values are modeled (a z length, a 3D axis or a z scale stays Unknown).
  if (['translate', 'rotate', 'scale'].includes(property)) {
    if (wide.has(value) || value === 'none') return [[property, value]];
    const parts = postcss.list.space(value);
    const fail = () => { throw new Error(`Unsupported ${property}: ${value} (only 2D values are modeled)`); };
    // A third (z) value without depth (checklist B1): translate's z must be 0, scale's z does nothing to a flat box,
    // and rotate about the z axis (z, or the axis 0 0 n) is the 2D rotation.
    const zero = v => /^-?0+(?:\.0+)?(?:px)?$/.test(v);
    const fn = property === 'translate' ? (parts.length > 3 || (parts.length === 3 && !zero(parts[2])) ? fail() : `translate(${parts.slice(0, 2).join(',')})`)
      : property === 'scale' ? (parts.length > 3 ? fail() : `scale(${parts.slice(0, 2).map(p => /%$/.test(p) ? String(Number(p.slice(0, -1)) / 100) : p).join(',')})`)
      : parts.length === 1 ? `rotate(${parts[0]})`
      : parts.length === 2 && parts[0] === 'z' ? `rotate(${parts[1]})`
      : parts.length === 4 && zero(parts[0]) && zero(parts[1]) && !zero(parts[2]) && Number.isFinite(Number(parts[2])) ? `rotate(${Number(parts[2]) < 0 ? (parts[3].startsWith('-') ? parts[3].slice(1) : `-${parts[3]}`) : parts[3]})`
      : fail();
    const [[, affine]] = expand('transform', fn);
    return [[property, affine]];
  }
  if (property === 'transform') {
    if (wide.has(value) || value === 'none') return [[property, value]];
    const fns = value.match(/[a-z][a-z0-9]*\([^)]*\)/g) ?? [];
    if (!fns.length || value.replace(/[a-z][a-z0-9]*\([^)]*\)/g, '').trim()) throw new Error(`Unsupported transform: ${value}`);
    const fail = () => { throw new Error(`Unsupported transform: ${value} (only px translate, positive scale and quarter-turn rotation are modeled)`); };
    // A length: px, or a percentage of the box's own width (x) or height (y): [px, fraction].
    // A length: px, a percentage of the box's own width (x) or height (y), or em (the element's font-size): [px, fraction, em].
    const len = v => { const m = /^(-?\d+(?:\.\d{1,20})?)px$|^(0)$|^(-?\d+(?:\.\d{1,4})?)%$|^(-?\d+(?:\.\d{1,4})?)em$|^(-?\d+(?:\.\d{1,4})?)rem$/.exec(v.trim()); if (!m) fail();
      return m[3] !== undefined ? [q(0), mul(q(m[3]), q('0.01')), q(0), q(0)] : m[4] !== undefined ? [q(0), q(0), q(m[4]), q(0)] : m[5] !== undefined ? [q(0), q(0), q(0), q(m[5])] : [q(m[1] ?? '0'), q(0), q(0), q(0)]; };
    const factor = v => { const t = v.trim().replace(/^\./, '0.'); if (!/^\d+(?:\.\d{1,20})?$/.test(t) || Number(t) <= 0) fail(); return q(t); };
    // t = t0 + W·u + H·v (W, H the box's border-box size) for percentage translations.
    let A = [q(1), q(0), q(0), q(1)], t = [q(0), q(0)], u = [q(0), q(0)], w = [q(0), q(0)], e = [q(0), q(0)], r = [q(0), q(0)];
    const apply = ([a, b, c, d], [x, y]) => [add(mul(a, x), mul(b, y)), add(mul(c, x), mul(d, y))];
    const times = (m, n) => [add(mul(m[0], n[0]), mul(m[1], n[2])), add(mul(m[0], n[1]), mul(m[1], n[3])), add(mul(m[2], n[0]), mul(m[3], n[2])), add(mul(m[2], n[1]), mul(m[3], n[3]))];
    for (const fn of fns) {
      let [, name, args] = /^([a-z][a-z0-9]*)\((.*)\)$/.exec(fn), parts = args.split(',');
      // 3D functions without depth (checklist B1): a flat box has z = 0, so a zero z translation and any z scale change
      // nothing, and a rotation about the z axis is the 2D rotation. Depth (a z translation, a rotation about x or y,
      // perspective) changes what is drawn with a perspective, which is not modeled.
      const isZero = v => /^\s*-?0+(?:\.0+)?(?:px)?\s*$/.test(v);
      if (name === 'translatez') { if (parts.length !== 1 || !isZero(parts[0])) fail(); continue; }
      if (name === 'scalez') { factor(parts[0]); continue; }
      if (name === 'translate3d') { if (parts.length !== 3 || !isZero(parts[2])) fail(); name = 'translate'; parts = parts.slice(0, 2); args = parts.join(','); }
      if (name === 'scale3d') { if (parts.length !== 3) fail(); factor(parts[2]); name = 'scale'; parts = parts.slice(0, 2); args = parts.join(','); }
      if (name === 'rotatez') name = 'rotate';
      if (name === 'rotate3d') {
        if (parts.length !== 4 || !isZero(parts[0]) || !isZero(parts[1]) || isZero(parts[2]) || !Number.isFinite(Number(parts[2]))) fail();
        const angle = parts[3].trim();
        name = 'rotate'; args = Number(parts[2]) < 0 ? (angle.startsWith('-') ? angle.slice(1) : `-${angle}`) : angle; parts = [args];
      }
      if (name === 'translate' || name === 'translatex' || name === 'translatey') {
        if (parts.length > (name === 'translate' ? 2 : 1)) fail();
        const zeroLen = [q(0), q(0), q(0), q(0)];
        const [x, y] = name === 'translatey' ? [zeroLen, len(parts[0])] : [len(parts[0]), name === 'translate' && parts[1] !== undefined ? len(parts[1]) : zeroLen];
        const moved = apply(A, [x[0], y[0]]), byW = apply(A, [x[1], q(0)]), byH = apply(A, [q(0), y[1]]);
        const byEm = apply(A, [x[2], y[2]]), byRem = apply(A, [x[3], y[3]]); r = [add(r[0], byRem[0]), add(r[1], byRem[1])];
        t = [add(t[0], moved[0]), add(t[1], moved[1])]; u = [add(u[0], byW[0]), add(u[1], byW[1])]; w = [add(w[0], byH[0]), add(w[1], byH[1])]; e = [add(e[0], byEm[0]), add(e[1], byEm[1])];
      } else if (['scale', 'scalex', 'scaley'].includes(name)) {
        if (parts.length > (name === 'scale' ? 2 : 1)) fail();
        const [sx, sy] = name === 'scalex' ? [factor(parts[0]), q(1)] : name === 'scaley' ? [q(1), factor(parts[0])] : [factor(parts[0]), factor(parts[1] ?? parts[0])];
        A = times(A, [sx, q(0), q(0), sy]);
      } else if (name === 'rotate') {
        const m = /^\s*([-+]?(?:\d+(?:\.\d+)?|\.\d+))(deg|turn|grad|rad)\s*$/.exec(args); if (!m) fail();
        // In rad only 0 is a whole number of quarter turns (π is irrational): any other angle is an arbitrary rotation.
        const quarters = m[2] === 'rad' ? (Number(m[1]) === 0 ? 0 : 0.5) : Number(m[1]) * (m[2] === 'turn' ? 4 : m[2] === 'grad' ? 1 / 100 : 1 / 90);
        if (Math.abs(quarters - Math.round(quarters)) > 1e-9) {
          // A lone rotation by any other angle: the box is painted somewhere inside its circumscribed rectangle
          // (modeled for the accessibility checks, which treat what it may cover as undecided).
          const degrees = m[2] === 'rad' ? Number(m[1]) * 180 / Math.PI : Number(m[1]) * (m[2] === 'turn' ? 360 : m[2] === 'grad' ? 0.9 : 1);
          if (/e/i.test(String(degrees))) fail();
          if (fns.length === 1) return [[property, `rotate-any(${degrees})`]];
          // With other functions: each function on its own, composed as floats (checklist B2).
          return [[property, linearAny(fns.map(f => expand('transform', f)[0][1]), value)]];
        }
        A = times(A, [[1, 0, 0, 1], [0, -1, 1, 0], [-1, 0, 0, -1], [0, 1, -1, 0]][((Math.round(quarters) % 4) + 4) % 4].map(n => q(n)));
      } else fail();
    }
    return [[property, `affine(${[...A, ...t, ...u, ...w, ...e, ...r].map(exact).join(' ')})`]];
  }
  // The legacy line clamp (display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: N) is what Chromium
  // implements; the unprefixed line-clamp is not modeled.
  // Properties that never change the checked geometry or paint (scrolling behaviour, selection, caret and accent
  // colours, font smoothing, snapping, view transitions, image sampling, …) are accepted and ignored.
  if (property === 'scroll-behavior') { if (!wide.has(value) && !['auto', 'smooth'].includes(value)) throw new Error(`Unsupported scroll-behavior: ${value}`); return [['scroll-behavior', value]]; }
  // Kept for the inert-declaration check (they act on a scroll container only); they do not change the layout.
  if (property === 'overscroll-behavior') { const parts = wide.has(value) ? [value] : postcss.list.space(value); if (parts.length > 2 || !parts.every(p => wide.has(p) || ['auto', 'contain', 'none'].includes(p))) throw new Error(`Unsupported overscroll-behavior: ${value}`); return [['overscroll-behavior-x', parts[0]], ['overscroll-behavior-y', parts[1] ?? parts[0]]]; }
  if (['overscroll-behavior-x', 'overscroll-behavior-y'].includes(property)) { if (!wide.has(value) && !['auto', 'contain', 'none'].includes(value)) throw new Error(`Unsupported ${property}: ${value}`); return [[property, value]]; }
  if (property === 'scroll-snap-type' || property === 'scroll-snap-align') return [[property, value.trim()]];
  // object-position is kept so the engine can tell an inert one (object-fit: fill, F39) apart.
  if (property === 'object-position') return [['object-position', wide.has(value.trim()) ? value.trim() : value.trim().toLowerCase()]];
  if (/^(?:object-position|font-palette|user-select|-webkit-user-select|accent-color|-webkit-font-smoothing|-moz-osx-font-smoothing|-webkit-tap-highlight-color|print-color-adjust|-webkit-print-color-adjust|color-adjust|overflow-anchor|image-rendering|text-decoration-skip-ink|overscroll-behavior(?:-[xy]|-inline|-block)?|scroll-snap-(?:type|align|stop)|view-transition-name|view-transition-class|interpolate-size|anchor-name|anchor-scope|quotes|counter-(?:reset|increment|set)|-webkit-touch-callout|backface-visibility|-webkit-backface-visibility|text-underline-position|font-optical-sizing|font-kerning)$/.test(property)) return [];
  // Accepted only at values that leave line breaking, shaping, containing blocks and painting as modeled; any other
  // value changes what is checked, so it stays Unknown.
  const neutral = {
    'text-wrap-mode': ['wrap'],
    'font-variant-numeric': ['normal'], 'font-variant-ligatures': ['normal'], 'font-feature-settings': ['normal'], 'font-variation-settings': ['normal'], 'text-rendering': ['auto'],
    'box-decoration-break': ['slice'], '-webkit-box-decoration-break': ['slice'], 'field-sizing': ['fixed'],
    'text-size-adjust': ['none', '100%'], '-webkit-text-size-adjust': ['none', '100%'],
    'mix-blend-mode': ['normal'], contain: ['none', 'style'], perspective: ['none'],
  };
  // white-space and the text-wrap shorthand both write text-wrap-mode (CSS Text 4): each also sets it, so the cascade
  // picks the later or more specific one, and computeStyle folds the mode back into white-space.
  if (property === 'text-wrap-mode') { if (!wide.has(value) && !['wrap', 'nowrap'].includes(value)) throw new Error(`Unsupported text-wrap-mode: ${value}`); return [['text-wrap-mode', value]]; }
  // text-wrap-style: balance and pretty change where wrapping text breaks (the engine keeps wrapping leaves under them
  // Unknown; one-line text is unaffected).
  if (property === 'text-wrap') {
    if (wide.has(value)) return [['text-wrap-mode', value], ['text-wrap-style', value]];
    const v = value.trim().toLowerCase();
    if (v === 'nowrap') return [['text-wrap-mode', 'nowrap'], ['text-wrap-style', 'auto']];
    if (['wrap', 'stable'].includes(v)) return [['text-wrap-mode', 'wrap'], ['text-wrap-style', 'auto']];
    if (['balance', 'pretty'].includes(v)) return [['text-wrap-mode', 'wrap'], ['text-wrap-style', v]];
    throw new Error(`Unsupported text-wrap: ${value}`);
  }
  if (property === 'text-wrap-style') {
    if (wide.has(value)) return [['text-wrap-style', value]];
    const v = value.trim().toLowerCase();
    if (['auto', 'stable'].includes(v)) return [['text-wrap-style', 'auto']];
    if (['balance', 'pretty'].includes(v)) return [['text-wrap-style', v]];
    throw new Error(`Unsupported ${property}: ${value}`);
  }
  // F40: place-items / place-content / place-self are <align> [<justify>] (CSS Box Alignment 3 §5.3), read as their
  // longhands (each validated as written). A baseline value with its first / last keyword keeps the two words together.
  if (['place-items', 'place-content', 'place-self'].includes(property)) {
    const kind = property.slice(6), v = value.trim().toLowerCase();
    if (wide.has(v)) return [...expand(`align-${kind}`, v), ...expand(`justify-${kind}`, v)];
    const words = v.split(/\s+/), parts = [];
    for (let i = 0; i < words.length; i++) parts.push(['first', 'last', 'safe', 'unsafe'].includes(words[i]) && words[i + 1] ? `${words[i]} ${words[++i]}` : words[i]);
    if (!parts.length || parts.length > 2) throw new Error(`Unsupported ${property}: ${value}`);
    // A lone baseline in place-content gives justify-content: start (§5.3).
    const justify = parts[1] ?? (kind === 'content' && /baseline$/.test(parts[0]) ? 'start' : parts[0]);
    return [...expand(`align-${kind}`, parts[0]), ...expand(`justify-${kind}`, justify)];
  }
  // F54: clear is kept so a flex or grid item (where it does nothing) is told apart; elsewhere it is not modeled.
  if (property === 'clear') { const v = value.trim().toLowerCase(); if (!wide.has(v) && !['none', 'left', 'right', 'both', 'inline-start', 'inline-end'].includes(v)) throw new Error(`Unsupported clear: ${value}`); return [['clear', v]]; }
  // F45: text-indent and text-align-last are kept so an inline element (where they do nothing) is told apart; on any
  // other box they are not modeled (Unknown in computeStyle).
  if (property === 'text-indent' || property === 'text-align-last') return [[property, value.trim().toLowerCase()]];
  // Multi-column properties are kept so a flex or grid container (which ignores them, F34) is told apart from a block
  // container, where multi-column layout is not modeled (Unknown in computeStyle).
  if (['columns', 'column-count', 'column-width'].includes(property)) {
    const v = value.trim().toLowerCase();
    if (wide.has(v)) return property === 'columns' ? [['column-count', v], ['column-width', v]] : [[property, v]];
    const parts = v.split(/\s+/), count = parts.filter(t => /^\d+$/.test(t)), length = parts.filter(t => /^\d+(?:\.\d+)?(?:px|em|rem|ch|vw|%)$/.test(t)), auto = parts.filter(t => t === 'auto');
    if (count.length + length.length + auto.length !== parts.length || count.length > 1 || length.length > 1 || parts.length > 2 || (property !== 'columns' && parts.length > 1)
      || (property === 'column-count' && length.length) || (property === 'column-width' && count.length)) throw new Error(`Unsupported ${property}: ${value}`);
    if (property === 'column-count') return [['column-count', count[0] ?? 'auto']];
    if (property === 'column-width') return [['column-width', length[0] ?? 'auto']];
    return [['column-count', count[0] ?? 'auto'], ['column-width', length[0] ?? 'auto']];
  }
  // resize: kept so the engine can tell an inert one (overflow visible) from one the user can drag (Unknown there).
  if (property === 'resize') { const v = value.trim().toLowerCase(); if (!wide.has(v) && !['none', 'both', 'horizontal', 'vertical', 'block', 'inline'].includes(v)) throw new Error(`Unsupported resize: ${value}`); return [['resize', v]]; }
  // F106: word-break and line-break are kept so computeStyle can tell an inert one (no wrapping) from one that moves breaks.
  if (property === 'word-break' || property === 'line-break') { const v = value.trim().toLowerCase(), allowed = property === 'word-break' ? ['normal', 'break-all', 'keep-all', 'break-word', 'auto-phrase'] : ['auto', 'loose', 'normal', 'strict', 'anywhere'];
    if (!wide.has(v) && !allowed.includes(v)) throw new Error(`Unsupported ${property}: ${value}`); return [[property, v]]; }
  // F84: tab-size is kept so computeStyle can tell an inert one (white-space collapses tabs) from one that moves text.
  if (property === 'tab-size') { const v = value.trim().toLowerCase(); if (!wide.has(v) && !/^(?:\d+(?:\.\d+)?|\d+(?:\.\d+)?px)$/.test(v)) throw new Error(`Unsupported tab-size: ${value}`); return [['tab-size', v]]; }
  if (Object.hasOwn(neutral, property)) {
    if (wide.has(value) || neutral[property].includes(value.trim().toLowerCase())) return [];
    throw new Error(`Unsupported ${property}: ${value} (it changes line breaking, shaping, containing blocks or paint, which are not modeled)`);
  }
  if (property === 'line-clamp' || property === 'box-orient') throw new Error(`Unsupported layout property: ${property} (only the -webkit- line clamp is modeled)`);
  if (property === 'text-overflow' && !wide.has(value) && !['clip', 'ellipsis'].includes(value)) throw new Error(`Unsupported text-overflow: ${value}`);
  if (property === '-webkit-line-clamp') { if (!wide.has(value) && !/^(?:none|[1-9]\d{0,2})$/.test(value)) throw new Error(`Unsupported -webkit-line-clamp: ${value}`); return [['line-clamp', value]]; }
  if (property === '-webkit-box-orient') { if (!wide.has(value) && !['vertical', 'horizontal'].includes(value)) throw new Error(`Unsupported -webkit-box-orient: ${value}`); return [['box-orient', value]]; }
  // transform-origin (checklist B3): x and y as px plus a fraction of the box's size, kept as 'origin(px frac px frac)';
  // the map about it is folded into the map about the centre when the style is computed. A z offset other than 0 and
  // em lengths are not modeled.
  if (property === 'transform-origin') {
    if (wide.has(value)) return [[property, value]];
    const parts = postcss.list.space(value);
    if (parts.length > 3 || (parts.length === 3 && !/^-?0+(?:\.0+)?(?:px)?$/.test(parts[2]))) throw new Error(`Unsupported transform-origin: ${value}`);
    const word = { left: ['x', 0], right: ['x', 1], top: ['y', 0], bottom: ['y', 1], center: ['c', 0.5] };
    const length = v => { const m = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|%)$|^(0)$/.exec(v); if (!m) throw new Error(`Unsupported transform-origin: ${value}`); return m[2] === '%' ? [0, Number(m[1]) / 100] : [Number(m[1] ?? 0), 0]; };
    let x = [0, 0.5], y = [0, 0.5];
    const [a, b] = parts.slice(0, 2);
    if (b === undefined) { if (word[a]) { if (word[a][0] === 'y') y = [0, word[a][1]]; else x = [0, word[a][1]]; } else x = length(a); }
    else if (word[a]?.[0] === 'y' || word[b]?.[0] === 'x') { y = word[a] ? [0, word[a][1]] : length(a); x = word[b] ? [0, word[b][1]] : length(b); }
    else { x = word[a] ? [0, word[a][1]] : length(a); y = word[b] ? [0, word[b][1]] : length(b); }
    return [[property, `origin(${x[0]} ${x[1]} ${y[0]} ${y[1]})`]];
  }
  // content-visibility: auto lays a box out as usual on screen and skips it offscreen, where contain-intrinsic-size
  // alone sizes it (the engine admits it where the width does not depend on the content). hidden is not modeled.
  if (property === 'content-visibility') { if (!wide.has(value) && !['visible', 'auto'].includes(value.trim())) throw new Error(`Unsupported content-visibility: ${value}`); return [[property, value.trim()]]; }
  // Only whether the block axis has an intrinsic size is kept (horizontal writing modes).
  if (/^contain-intrinsic-(?:size|width|height|inline-size|block-size)$/.test(property)) {
    if (wide.has(value)) return property === 'contain-intrinsic-size' || /height|block/.test(property) ? [['contain-intrinsic-block-size', value]] : [];
    const parts = value.trim().split(/\s+/), sizes = [];
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === 'none') { sizes.push('none'); continue; }
      const auto = parts[i] === 'auto'; if (auto) i++;
      if (!/^\d+(?:\.\d+)?(?:px|r?em)$|^0$/.test(parts[i] ?? '')) throw new Error(`Unsupported ${property}: ${value}`);
      sizes.push(`${auto ? 'auto ' : ''}${parts[i]}`);
    }
    if (!sizes.length || sizes.length > (property === 'contain-intrinsic-size' ? 2 : 1)) throw new Error(`Unsupported ${property}: ${value}`);
    if (property === 'contain-intrinsic-size') return [['contain-intrinsic-block-size', sizes[1] ?? sizes[0]]];
    return /height|block/.test(property) ? [['contain-intrinsic-block-size', sizes[0]]] : [];
  }
  // F117: transform-style and backface-visibility only change how 3D transforms paint (3D transforms stay Unknown);
  // preserve-3d also makes the element the containing block of fixed descendants (containsFixed).
  if (property === 'transform-style' || property === 'backface-visibility') { const ok = property === 'transform-style' ? ['flat', 'preserve-3d'] : ['visible', 'hidden']; if (!wide.has(value) && !ok.includes(value)) throw new Error(`Unsupported ${property}: ${value}`); return [[property, value]]; }
  if (property === 'isolation') { if (!wide.has(value) && !['auto', 'isolate'].includes(value)) throw new Error(`Unsupported isolation: ${value}`); return [[property, value]]; }
  if (property === 'z-index') { if (!wide.has(value) && !/^(?:auto|-?\d+)$/.test(value)) throw new Error(`Unsupported z-index: ${value}`); return [[property, value]]; }
  // justify-self / justify-items are admitted where they do nothing (flex items and containers); the engine keeps a
  // grid item's or an absolute box's justify alignment Unknown.
  if (['justify-self', 'justify-items'].includes(property) && !wide.has(value) && !/^(?:auto|normal|stretch|start|end|center|flex-start|flex-end|self-start|self-end|left|right|legacy)$/.test(value.trim().toLowerCase())) throw new Error(`Unsupported ${property}: ${value}`);
  if (paintProperties.includes(property)) {
    if (property === 'visibility' && !wide.has(value) && !['visible', 'hidden', 'collapse'].includes(value)) throw new Error(`Unsupported visibility: ${value}`);
    if (property === 'pointer-events' && !wide.has(value)) {
      const keyword = value.trim().toLowerCase();
      if (keyword !== 'auto' && keyword !== 'none' && !svgPointerEvents.has(keyword)) throw new Error(`Unsupported pointer-events: ${value}`);
      return [[property, keyword]];
    }
    if (property === 'opacity' && !wide.has(value) && !/^(?:\d+(?:\.\d+)?|\.\d+)%?$/.test(value)) throw new Error(`Unsupported opacity: ${value}`);
    return [[property, value]];
  }
  if (property === 'background') {
    if (wide.has(value)) return [['background-color', value], ['background-image', value]];
    const parts = postcss.list.space(value), image = parts.find(p => /^(?:url|(?:repeating-)?(?:linear|radial|conic)-gradient|image-set)\(/.test(p)) ?? 'none';
    const color = parts.find(p => !/^(?:url|(?:repeating-)?(?:linear|radial|conic)-gradient|image-set)\(/.test(p) && !/^(?:none|repeat|repeat-x|repeat-y|no-repeat|space|round|scroll|fixed|local|top|bottom|left|right|center|border-box|padding-box|content-box|\d.*|\/|auto|cover|contain)$/.test(p)) ?? 'transparent';
    return [['background-color', color], ['background-image', image]];
  }
  // F104: list-style-image is paint, kept only so the engine can tell one on a box with no marker.
  if (property === 'list-style-image') return [[property, String(value).trim()]];
  if (decoration.test(property)) return [];
  // border-image: none (or its source none, or a CSS-wide keyword) is the initial value: no image, nothing changes (a
  // reset on hr). Dropped as a no-op, it overrides nothing: an earlier image stays the cascaded, Unknown declaration.
  if (/^border-image(?:-source)?$/.test(property) && (wide.has(value) || String(value).trim().toLowerCase() === 'none')) return [];
  throw new Error(`Unsupported layout property: ${property}`);
}

// css-flexbox-1 §7.2: [<grow> <shrink>?] || <basis>, none, auto. A unitless
// zero is a flex factor unless two factors already precede it.
const flexNumber = /^\d+(?:\.\d+)?$/;
// (calc() and vw / vh bases too, checklist D2: flexItem decides whether they are modeled.)
const flexBasis = value => value === 'auto' || value === 'content' || /^\d+(?:\.\d+)?(?:px|%|vw|vh)$/.test(value) || /^(?:calc|min|max|clamp)\(.*\)$/.test(value);
function flexShorthand(value) {
  if (wide.has(value)) return ['flex-grow', 'flex-shrink', 'flex-basis'].map(key => [key, value]);
  if (value === 'none') return [['flex-grow', '0'], ['flex-shrink', '0'], ['flex-basis', 'auto']];
  if (value === 'auto') return [['flex-grow', '1'], ['flex-shrink', '1'], ['flex-basis', 'auto']];
  const parts = postcss.list.space(value), factors = [];
  let basis, groupEnded = false;
  for (const part of parts) {
    if (flexNumber.test(part) && !(part === '0' && factors.length === 2) && !(groupEnded && factors.length)) {
      if (factors.length === 2) throw new Error(`Invalid flex: ${value}`);
      factors.push(part);
    } else if (basis === undefined && (flexBasis(part) || part === '0')) { basis = part === '0' ? '0px' : part; if (factors.length) groupEnded = true; }
    else throw new Error(`Invalid flex: ${value}`);
  }
  if (!factors.length && basis === undefined) throw new Error(`Invalid flex: ${value}`);
  // Omitted grow is 1 and omitted shrink is 1; an omitted basis is 0 (computed as 0%).
  return [['flex-grow', factors[0] ?? '1'], ['flex-shrink', factors[1] ?? '1'], ['flex-basis', basis ?? '0%']];
}

// A declaration value with a ':' outside brackets and strings (background-image: https://…, or a missing semicolon:
// "color: red\n background: blue") is one invalid declaration to the browser: it is dropped up to the next ';' and the
// rest of the rule applies (CSS Syntax 3 §5.4.6; measured in Chromium, Firefox and WebKit). PostCSS throws "Missed
// semicolon" for the whole sheet instead; the stray ':' is replaced with STRAY_COLON (same length, so lines and
// columns stay) and the declaration loop drops the declaration and reports it.
export function tolerateStrayColons(css) { return repairStrayColons(css).css; }
// The repaired text and the offsets of the colons replaced: a U+E000 the author wrote (in a string) is not a repair.
export function repairStrayColons(css) {
  let text = String(css);
  const repaired = [];
  const done = () => ({ css: text, repaired });
  for (let round = 0; round < 10000; round++) {
    try { postcss.parse(text); return done(); }
    catch (error) {
      if (error?.reason !== 'Missed semicolon' || !error.line) return done();
      let offset = 0;
      for (let line = 1; line < error.line; line++) { const next = text.indexOf('\n', offset); if (next === -1) return done(); offset = next + 1; }
      offset += (error.column ?? 1) - 1;
      let depth = 0, quote = null, at = -1;
      for (let i = offset; i < text.length; i++) {
        const ch = text[i];
        if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = null; continue; }
        if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '(') depth++;
        else if (ch === ')') depth = Math.max(0, depth - 1);
        else if (ch === ';' || ch === '{' || ch === '}') break;
        else if (ch === ':' && depth === 0) { at = i; break; }
      }
      if (at === -1) return done();
      text = text.slice(0, at) + STRAY_COLON + text.slice(at + 1);
      repaired.push(at);
    }
  }
  return done();
}

export function parseLayoutCSS(sheets, diagnostic, { shorthandConflicts = 'error' } = {}) {
  sheets = sheets.map(sheet => { const { css, repaired } = repairStrayColons(sheet.css); return { ...sheet, css, repaired }; });
  let repairedOffsets = [];
  // Findings of the syntax stage, one shape: { code, ...data } (ADR-0016 M3). The rules/syntax-notes.mjs catalog words them.
  const notes = [], note = (code, data) => { notes.push({ code, ...data }); }, notesOf = code => notes.filter(n => n.code === code);
  const dependentDeclarations = [], markerSizing = [], firstPseudo = [], radiusRules = [], contentRules = [], userSelectNone = [], rules = [], layers = [], keyframes = new Set(), keyframeFrames = new Map(), fontFaces = [], registered = new Map(), defaultNamespace = [], startingRules = [], unreadContainers = [];
  const layerIndex = name => { if (!layers.includes(name)) layers.push(name); return layers.indexOf(name); };
  let count = 0, scope = null;
  const reportedMediaEm = new Set();
  const visit = (nodes, contexts, layer, filename, depth = 0, preferences = []) => {
    const problem = (code, message, line) => diagnostic(code, message, line, filename);
    if (depth > 32) { problem('U_LAYOUT_LIMIT', 'Conditional nesting limit exceeded'); return; }
    // @import loads another sheet only before every other rule of its sheet (after @charset and @layer statements);
    // anywhere else (after a rule, or inside @media) it is invalid and ignored (CSS Cascade 5 §2).
    let ruleSeen = depth > 0;
    for (const node of nodes) {
      if (node.type === 'comment') continue;
      if (++count > 2048) { problem('U_LAYOUT_LIMIT', 'CSS node limit exceeded'); return; }
      if (node.type === 'atrule' && node.name.toLowerCase() === 'import') {
        if (!ruleSeen) { problem('U_LAYOUT_CSS', `@import ${node.params.trim()} loads another stylesheet, which the analysis does not have`, node.source.start.line); continue; }
        note('W_CSS_IMPORT_IGNORED', { params: node.params.trim(), file: filename, line: node.source.start.line, nested: depth > 0 });
        continue;
      }
      if (!(node.type === 'atrule' && (node.name.toLowerCase() === 'charset' || (node.name.toLowerCase() === 'layer' && !node.nodes)))) ruleSeen = true;
      if (node.type === 'atrule' && node.name.toLowerCase() === 'layer') {
        if (layer !== null || contexts.length) { problem('U_LAYOUT_LAYER', 'Nested or conditional layer declarations are outside the subset', node.source.start.line); continue; }
        const names = node.params.trim() ? postcss.list.comma(node.params) : [];
        if (names.some(name => !/^[a-zA-Z_][\w-]*$/.test(name)) || (node.nodes && names.length > 1) || (!node.nodes && !names.length)) { problem('U_LAYOUT_LAYER', 'Use flat named layers or anonymous blocks', node.source.start.line); continue; }
        const indices = names.map(layerIndex);
        if (node.nodes) visit(node.nodes, contexts, indices[0] ?? layerIndex(`@anonymous:${layers.length}`), filename, depth + 1, preferences);
        continue;
      }
      // @keyframes only names an animation (paint); its frames are not modeled.
      // @font-face declares a web font (no box of its own): its family, font-display and fallback-metric overrides
      // decide whether text can change size when the file arrives (the font-swap rule).
      if (node.type === 'atrule' && node.name.toLowerCase() === 'font-face') {
        const descriptor = name => (node.nodes ?? []).find(d => d.type === 'decl' && d.prop.toLowerCase() === name)?.value.trim();
        // F113: Chromium, Firefox and WebKit ignore an @font-face with no font-family, an invalid family name, no src or a
        // src item that is neither url() nor local() (measured: it is not in document.fonts); it is ignored here too. An
        // invalid font-display is dropped (the face keeps auto).
        const rawFamily = descriptor('font-family'), src = descriptor('src');
        const faceProblem = rawFamily === undefined ? 'it has no font-family' : (b => b && `the family name ${b} is not valid unquoted`)(familyProblem(rawFamily)) || (/,/.test(rawFamily.replace(/(["']).*?\1/g, '')) ? 'font-family names one family, not a list' : null)
          || (src === undefined ? 'it has no src' : postcss.list.comma(src).find(item => !/^(?:url|local)\(/i.test(item.trim())) !== undefined ? `the src item ${postcss.list.comma(src).find(item => !/^(?:url|local)\(/i.test(item.trim())).trim()} is neither url() nor local()` : null);
        if (faceProblem) { note('W_CSS_FONT_FACE_INVALID', { problem: faceProblem, ignored: true, file: filename, line: node.source.start.line }); continue; }
        const family = rawFamily.replace(/^["']|["']$/g, '');
        let display = (descriptor('font-display') ?? 'auto').toLowerCase();
        if (!['auto', 'block', 'swap', 'fallback', 'optional'].includes(display)) { note('W_CSS_FONT_FACE_INVALID', { problem: `font-display ${display} is not auto, block, swap, fallback or optional`, family, file: filename, line: node.source.start.line }); display = 'auto'; }
        fontFaces.push({ family, display, local: /^\s*local\(/i.test(descriptor('src') ?? ''),
          embedded: (() => { const urls = [...(descriptor('src') ?? '').matchAll(/url\(\s*(["']?)([^"')]*)/gi)].map(m => m[2]); return urls.length > 0 && urls.every(u => /^data:/i.test(u)); })(),
          overrides: ['size-adjust', 'ascent-override', 'descent-override', 'line-gap-override'].filter(name => descriptor(name) !== undefined), file: filename, line: node.source.start.line });
        continue;
      }
      if (node.type === 'atrule' && /^(?:-webkit-)?keyframes$/i.test(node.name)) {
        const name = node.params.trim().replace(/^["']|["']$/g, ''); keyframes.add(name);
        // The paint of each frame (for the flash rule): offsets with their background-color and opacity.
        const frames = [];
        for (const frame of node.nodes ?? []) if (frame.type === 'rule') for (const at of frame.selectors) {
          const offset = at.trim().toLowerCase() === 'from' ? 0 : at.trim().toLowerCase() === 'to' ? 1 : /^\d+(?:\.\d+)?%$/.test(at.trim()) ? parseFloat(at) / 100 : null;
          if (offset === null) continue;
          const props = {};
          // Declarations that lay out (not paint, transform or the other compositor-only properties): each such frame
          // is laid out again to find layout shifts.
          const layout = [];
          // !important in a keyframe makes the declaration invalid there: the browser ignores it (CSS Animations 1 §3).
          for (const d of frame.nodes ?? []) if (d.type === 'decl' && d.important && !notesOf('W_CSS_KEYFRAME_IMPORTANT').some(n => n.line === d.source.start.line && n.file === filename && n.property === d.prop.toLowerCase())) note('W_CSS_KEYFRAME_IMPORTANT', { name, property: d.prop.toLowerCase(), file: filename, line: d.source.start.line });
          let easing; for (const d of frame.nodes ?? []) if (d.type === 'decl' && !d.important) { const prop = d.prop.toLowerCase(), value = d.value.trim().toLowerCase(); if (prop === 'animation-timing-function') { easing = value; continue; } if (prop === 'background-color' || prop === 'background') props['background-color'] = value; if (prop === 'opacity') props.opacity = value; if (!prop.startsWith('--') && !statePaint.test(prop) && !/^(?:transform|translate|scale|rotate|filter|backdrop-filter|will-change|offset(?:-.*)?)$/.test(prop)) layout.push(`${d.prop}:${d.value}`); }
          // easing: this keyframe's animation-timing-function, which eases the intervals that start at it.
          frames.push({ offset, props, ...(layout.length ? { layout: layout.join(';') } : {}), ...(easing ? { easing } : {}) });
        }
        keyframeFrames.set(name, frames.sort((a, b) => a.offset - b.offset));
        continue;
      }
      // At-rules that never change the screen: @charset (the encoding of bytes the analysis already has as text), @page
      // (the page box of paged media: print), @view-transition (navigation transitions between documents), and
      // @counter-style (the text of list markers: an outside marker is drawn beside its box and lays nothing out; an
      // inside one is Unknown on its own), and @font-palette-values (the colours of colour-font glyphs).
      if (node.type === 'atrule' && ['charset', 'page', 'view-transition', 'counter-style', 'font-palette-values'].includes(node.name.toLowerCase())) continue;
      // @starting-style sets the values a transition starts from when the box first appears; the settled layout is the
      // one without it. Accepted when it only paints (opacity, colours, transforms: nothing moves in the flow); a starting
      // value that lays out animates the layout in (a shift), which is not modeled.
      if (node.type === 'atrule' && node.name.toLowerCase() === 'starting-style') {
        const paintOnly = /^(?:opacity|color|background-color|background|border-color|outline-color|box-shadow|filter|visibility|transform|translate|rotate|scale|text-decoration-color|fill|stroke)$/;
        const declarations = []; node.walkDecls(d => { declarations.push(d.prop.toLowerCase()); });
        const layout = declarations.filter(p => !paintOnly.test(p));
        // A starting value that lays out: a transition of that property animates the layout in when the box appears.
        // The rules are kept (selector, declarations, order) for the analysis to apply to each box it matches.
        if (layout.length) {
          if ((node.nodes ?? []).some(n => n.type !== 'rule' && n.type !== 'comment')) { problem('U_LAYOUT_CSS', '@starting-style with conditional rules inside is not modeled', node.source.start.line); continue; }
          for (const rule of node.nodes.filter(n => n.type === 'rule')) {
            let selectors;
            try { selectors = rule.selectors.map(selector => compileSelector(selector)); if (selectors.some(s => s.state || s.pseudoElement)) throw new Error('a state or pseudo-element selector'); }
            catch (error) { problem('U_LAYOUT_SELECTOR', `@starting-style ${rule.selector}: ${error.message}`, rule.source.start.line); continue; }
            startingRules.push({ selectors, declarations: (rule.nodes ?? []).filter(d => d.type === 'decl' && !paintOnly.test(d.prop.toLowerCase())).map(d => ({ property: d.prop.toLowerCase(), value: d.value.trim(), important: Boolean(d.important) })), order: startingRules.length, file: filename, line: rule.source.start.line, contexts });
          }
        }
        continue;
      }
      // @namespace with a prefix only affects selectors written with that prefix; a default namespace changes what every
      // type selector matches, which is not modeled.
      if (node.type === 'atrule' && node.name.toLowerCase() === 'namespace') {
        // A default XHTML namespace: type and universal selectors match HTML elements only, which changes nothing unless
        // the page has SVG or MathML elements (checked against the tree by the analysis).
        const xhtml = /^(?:url\(\s*["']?http:\/\/www\.w3\.org\/1999\/xhtml["']?\s*\)|["']http:\/\/www\.w3\.org\/1999\/xhtml["'])$/i.test(node.params.trim());
        if (xhtml) defaultNamespace.push({ file: filename, line: node.source.start.line });
        else if (!/^[a-z_][\w-]*\s+(?:url\(|["'])/i.test(node.params.trim())) problem('U_LAYOUT_CSS', `@namespace ${node.params.trim()} sets the default namespace, which is not modeled`, node.source.start.line);
        continue;
      }
      // @property registers a custom property (CSS Properties and Values API 1 §2): its inherits and initial-value change
      // what var() reads. Only the universal syntax and the typed syntaxes above, with all three descriptors valid.
      if (node.type === 'atrule' && node.name.toLowerCase() === 'property') {
        const name = node.params.trim(), descriptor = d => (node.nodes ?? []).find(x => x.type === 'decl' && x.prop.toLowerCase() === d)?.value.trim();
        const syntax = descriptor('syntax')?.replace(/^["']|["']$/g, '').trim(), inherits = descriptor('inherits')?.toLowerCase(), initial = descriptor('initial-value');
        // F111: an @property the browser ignores (the property then stays unregistered) is ignored here too and reported.
        { const invalid = propertyRuleProblem(descriptor('syntax'), inherits, initial);
          if (invalid) { note('W_CSS_PROPERTY_INVALID', { name, problem: invalid, file: filename, line: node.source.start.line }); continue; } }
        const problemOf = !customName(name) ? 'the name is not a custom property' : !syntax || !(syntax === '*' || typedValue[syntax]) ? `syntax ${syntax ?? '(missing)'} is not modeled` : !['true', 'false'].includes(inherits) ? 'inherits must be true or false' : syntax !== '*' && (initial === undefined || !typedValue[syntax].test(initial)) ? `initial-value ${initial ?? '(missing)'} is not a literal ${syntax}` : null;
        if (problemOf) { problem('U_LAYOUT_CSS', `@property ${name}: ${problemOf}`, node.source.start.line); continue; }
        if (depth > 0) { problem('U_LAYOUT_CSS', `@property ${name} inside a conditional rule is not modeled`, node.source.start.line); continue; }
        registered.set(name, { syntax, inherits: inherits === 'true', initial: initial ?? null });
        continue;
      }
      // @scope (root) { … }: the rules inside apply to the root's descendants, and the nearer root wins ties (Cascade 6
      // §2.5). Only a root without a limit, with compound selectors inside (no :scope, &, or combinators), is modeled.
      if (node.type === 'atrule' && node.name.toLowerCase() === 'scope') {
        const m = /^\(\s*([^()]+?)\s*\)(?:\s+to\s+\(\s*([^()]+?)\s*\))?$/i.exec(node.params.trim());
        if (!m || scope) { problem('U_LAYOUT_SELECTOR', `@scope ${node.params.trim()}: ${!m ? 'an implicit root or a selector list is' : 'a nested @scope is'} not modeled`, node.source.start.line); continue; }
        let root;
        try {
          root = compileSelector(m[1]); if (root.state || root.pseudoElement) throw new Error('a state or pseudo-element root');
          // The limit (to …): its elements below the root, and what is inside them, are outside the scope.
          if (m[2]) { if (/:scope\b|&/.test(m[2])) throw new Error('a limit relative to the root (:scope, &) is not modeled'); const limit = compileSelector(m[2]); if (limit.state || limit.pseudoElement) throw new Error('a state or pseudo-element limit'); root = { ...root, limit }; }
        } catch (error) { problem('U_LAYOUT_SELECTOR', `@scope ${node.params.trim()}: ${error.message}`, node.source.start.line); continue; }
        scope = root;
        try { visit(node.nodes ?? [], contexts, layer, filename, depth + 1, preferences); } finally { scope = null; }
        continue;
      }
      // @supports: its rules apply where the condition holds in every target browser, and are skipped where it fails in
      // all of them; a condition not decided from the known features (supports.mjs) is Unknown.
      if (node.type === 'atrule' && node.name.toLowerCase() === 'supports' && node.nodes) {
        const written = supportsFunctionToken(node.params);
        if (written) { note('W_CSS_SUPPORTS_INVALID', { params: node.params.trim(), written, file: filename, line: node.source.start.line }); continue; }
        const holds = supportsCondition(node.params);
        if (holds === true) visit(node.nodes, contexts, layer, filename, depth + 1, preferences);
        else if (holds === undefined) problem('U_LAYOUT_CSS', `@supports ${node.params.trim()}: the condition is not decided from the features known to be supported in every target browser`, node.source.start.line);
        continue;
      }
      if (node.type === 'atrule') {
        if (!['media', 'container'].includes(node.name.toLowerCase()) || !node.nodes) { problem('U_LAYOUT_CSS', `Unsupported @${node.name}`, node.source.start.line); continue; }
        // F78: var() is not substituted in a media query: the query is invalid and never matches (measured in Chromium,
        // Firefox and WebKit), so its rules never apply. A query list keeps its other queries: left to parseCondition.
        // F79: a width / height value that is a bare number other than 0 (600) or has a space before its unit (600 px) is
        // not a length: the query is malformed and never matches (measured in Chromium, Firefox and WebKit).
        if (node.name.toLowerCase() === 'media' && !postcss.list.comma(node.params).slice(1).length) {
          const values = [...node.params.matchAll(/\(\s*(?:min-|max-)?(?:width|height)\s*:\s*([^)]+)\)/gi)].map(m => m[1])
            .concat([...node.params.matchAll(/\(\s*(?:width|height)\s*(?:<=|>=|<|>|=)\s*([^)<>=]+?)\s*\)/gi)].map(m => m[1]))
            .concat([...node.params.matchAll(/\(\s*([^()<>=]+?)\s*(?:<=|>=|<|>|=)\s*(?:width|height)\s*\)/gi)].map(m => m[1]));
          const bad = values.find(v => /^\s*(?:\d*\.)?\d+\s*$/.test(v) && Number(v) !== 0 || /^\s*(?:\d*\.)?\d+\s+[a-z%]+\s*$/i.test(v));
          if (bad) { note('W_CSS_MEDIA_INVALID_LENGTH', { params: node.params.trim(), value: bad.trim(), file: filename, line: node.source.start.line }); continue; }
        }
        if (rootFont && node.name.toLowerCase() === 'media' && /\d\s*r?em\b/i.test(node.params) && !reportedMediaEm.has(`${filename}:${node.source.start.line}`)) {
          reportedMediaEm.add(`${filename}:${node.source.start.line}`);
          note('W_CSS_MEDIA_EM_ROOT', { params: node.params.trim(), root: rootFont, file: filename, line: node.source.start.line });
        }
        // F87: "and(", "or(" or "not(" (no space) is a function token, not the keyword: the query is invalid and never matches (measured
        // in Chromium, Firefox and WebKit). In a list only that query fails, so only a single query is handled.
        if (node.name.toLowerCase() === 'media' && /(?<![\w:-])(?:and|or|not)\(/i.test(node.params) && !postcss.list.comma(node.params).slice(1).length) { note('W_CSS_MEDIA_AND_SPACE', { params: node.params.trim(), written: /(?<![\w:-])(?:and|or|not)\(/i.exec(node.params)[0], file: filename, line: node.source.start.line }); continue; }
        if (node.name.toLowerCase() === 'media' && /var\(/i.test(node.params) && !postcss.list.comma(node.params).slice(1).length) {
          note('W_CSS_MEDIA_VAR', { params: node.params.trim(), file: filename, line: node.source.start.line });
          continue;
        }
        try {
          const condition = parseCondition(node.params, node.name.toLowerCase());
          const wanted = condition.groups.flat().filter(atom => atom.preference);
          if (wanted.length) {
            if (condition.groups.length !== 1 || wanted.length !== condition.groups[0].length || new Set(wanted.map(atom => atom.feature)).size !== wanted.length) throw new Error('Preference media queries (prefers-*, forced-colors) must be a single group of distinct preferences, without size features');
            visit(node.nodes, contexts, layer, filename, depth + 1, [...preferences, ...wanted.map(({ feature, preference }) => ({ feature, value: preference }))]);
            continue;
          }
          // Provenance for explanations only; never consulted by the proof.
          condition.params = node.params.trim(); condition.css = {file: filename, line: node.source.start.line};
          if (condition.groups.length) visit(node.nodes, [...contexts, condition], layer, filename, depth + 1, preferences);
        } catch (error) { problem('U_LAYOUT_QUERY', error.message, node.source.start.line); }
        continue;
      }
      // F132: a selector list is dropped whole when one of its selectors is invalid in a browser. -moz- pseudo-classes and
      // pseudo-elements are invalid in Chromium and WebKit, -ms- and -o- ones everywhere (measured; -webkit- ones are
      // valid in all three, and :is() / :where() forgive an invalid branch). Then the other selectors of the list lose
      // the rule too.
      if (node.type === 'rule' && postcss.list.comma(node.selector).length > 1) {
        const outside = sel => { let out = '', depth = 0; for (let i = 0; i < sel.length; i++) { const rest = sel.slice(i); const m = depth === 0 && /^:(?:is|where)\(/i.exec(rest); if (m) { depth = 1; i += m[0].length - 1; continue; } if (depth) { if (sel[i] === '(') depth++; else if (sel[i] === ')') depth--; continue; } out += sel[i]; } return out; };
        const vendor = postcss.list.comma(node.selector).map(sel => ({ sel: sel.trim(), m: /::?-(moz|ms|o)-[a-z-]+/i.exec(outside(sel)) })).find(x => x.m);
        if (vendor) { const prefix = vendor.m[1].toLowerCase(), drops = prefix === 'moz' ? ['chromium', 'webkit'] : ['chromium', 'firefox', 'webkit'];
          note('W_CSS_SELECTOR_LIST_VENDOR', { selector: node.selector, vendor: vendor.sel, pseudo: vendor.m[0], drops, file: filename, line: node.source.start.line }); }
      }
      let selectors;
      try {
        if (node.type !== 'rule') throw new Error(`Unsupported CSS node: ${node.type}`);
        // Inside @scope (checklist C2): :scope is the root itself (one pseudo-class of specificity) and & is
        // :where(:scope) (no specificity, whatever the root's selector: measured in Chromium, Firefox and WebKit);
        // :scope > x / & x / x (relative) reach its children or descendants.
        selectors = scope ? node.selectors.map(raw => {
          const text = raw.trim(), m = /^(:scope|&)(?:(\s*>\s*|\s+)(.+))?$/.exec(text);
          const lead = m && m[1] === ':scope' ? [0, 1, 0] : [0, 0, 0];
          if (m && !m[2]) return { ...scope, source: text, specificity: lead, scope, scopeMode: 'self' };
          const rest = compileSelector(m ? m[3] : text);
          if (rest.chain || /:scope\b|&/.test(rest.source)) throw new Error(`${text} inside @scope: a selector with more combinators, or :scope / & further in, is not modeled there`);
          return { ...rest, source: text, specificity: rest.specificity.map((v, i) => v + lead[i]), scope, scopeMode: m && m[2].trim() === '>' ? 'child' : 'descendant' };
        }) : node.selectors.map(selector => compileSelector(selector));
      } catch (error) {
        // A rule the analysis cannot match that may make a query container (F133 then cannot tell there is none).
        if ((node.nodes ?? []).some(d => d.type === 'decl' && /^container(?:-type)?$/i.test(d.prop) && /\b(?:inline-)?size\b/i.test(d.value))) unreadContainers.push({ selector: node.selector, file: filename, line: node.source.start.line });
        // Outside @scope, the selectors it cannot read only mark the boxes they may match (candidateSelector), and the
        // ones it can read keep the rule; when a candidate does not compile either, the whole analysis is Unknown.
        const readable = [], unread = [];
        if (!scope) for (const raw of node.selectors) { try { readable.push(compileSelector(raw)); } catch { unread.push(raw); } }
        const candidates = scope ? null : unread.map(candidateSelector);
        if (!candidates || candidates.some(c => !c)) { problem('U_LAYOUT_SELECTOR', error.message, node.source.start.line); continue; }
        rules.push(markRule(candidates, error.message, node, contexts, layer, filename, preferences));
        if (!readable.length) continue;
        selectors = readable;
      }
      // Checklist F20: in a :visited rule browsers apply only color properties (CSS Selectors 4 §8.2, privacy): every other
      // declaration is ignored — reported, and dropped as the browser does.
      if (selectors.some(sel => sel.state === 'visited')) {
        const visitedColor = /^(?:color|background-color|border-(?:(?:top|right|bottom|left|block-start|block-end|inline-start|inline-end)-)?color|column-rule-color|outline-color|text-decoration-color|text-emphasis-color|caret-color|fill|stroke|--.*)$/;
        for (const d of [...(node.nodes ?? [])]) if (d.type === 'decl' && !visitedColor.test(d.prop.toLowerCase())) {
          note('W_CSS_VISITED_IGNORED', { selector: node.selector, property: d.prop.toLowerCase(), file: filename, line: d.source.start.line });
          d.remove();
        }
      }
      // Checklist F22: ::marker takes only font, white-space, color, content, direction, unicode-bidi, text-combine-upright,
      // animation and transition properties (CSS Lists 3 §3.1.1): the rest is ignored — reported and dropped (measured:
      // margin, padding, background, width and display change no pixel). Those that size the marker (font, line-height,
      // content, white-space, spacing) are kept for the engine, which does not model the marker box (Unknown there).
      if (selectors.some(sel => sel.pseudoElement === 'marker')) {
        const markerApplies = /^(?:color|content|font(?:-.*)?|line-height|white-space(?:-collapse)?|text-wrap(?:-mode)?|direction|unicode-bidi|text-combine-upright|animation(?:-.*)?|transition(?:-.*)?|letter-spacing|word-spacing|text-transform|--.*)$/;
        for (const d of [...(node.nodes ?? [])]) if (d.type === 'decl') {
          const prop = d.prop.toLowerCase();
          if (!markerApplies.test(prop)) { note('W_CSS_MARKER_IGNORED', { selector: node.selector, property: prop, file: filename, line: d.source.start.line }); d.remove(); }
          else if (!/^(?:color|animation(?:-.*)?|transition(?:-.*)?|--.*)$/.test(prop)) markerSizing.push({ selectors, property: prop, file: filename, line: d.source.start.line });
        }
      }
      // F46: ::selection paints the selected text only (a user action, not a modeled state): kept out of the cascade. The
      // box properties in it are ignored by Chromium, Firefox and WebKit alike (measured against a ::selection rule without
      // them: font-size, font-weight, letter-spacing, opacity, padding, border, margin and outline change no pixel) — reported.
      if (selectors.some(sel => sel.pseudoElement === 'selection')) {
        if (!selectors.every(sel => sel.pseudoElement === 'selection')) { problem('U_LAYOUT_SELECTOR', `${node.selector}: a selector list mixing ::selection with other selectors is not modeled`, node.source.start.line); continue; }
        for (const d of node.nodes ?? []) if (d.type === 'decl' && /^(?:font-size|font-weight|letter-spacing|opacity|padding(?:-.*)?|margin(?:-.*)?|border(?:-(?:top|right|bottom|left))?(?:-(?:width|style|color))?|outline(?:-.*)?)$/i.test(d.prop))
          note('W_CSS_SELECTION_IGNORED', { selector: node.selector, property: d.prop.toLowerCase(), file: filename, line: d.source.start.line });
        continue;
      }
      // F37: ::first-letter / ::first-line are kept out of the cascade: the engine reports them where they never apply (a
      // box that is not a block container) and keeps the rest Unknown (the restyled first letter or line is not modeled).
      if (selectors.some(sel => ['first-letter', 'first-line'].includes(sel.pseudoElement))) {
        if (!selectors.every(sel => ['first-letter', 'first-line'].includes(sel.pseudoElement))) { problem('U_LAYOUT_SELECTOR', `${node.selector}: a selector list mixing ::first-letter / ::first-line with other selectors is not modeled`, node.source.start.line); continue; }
        firstPseudo.push({ selectors, selector: node.selector, file: filename, line: node.source.start.line });
        continue;
      }
      // F49: :placeholder-shown stops holding once the user types; a rule in it that changes the layout depends on that.
      if (/:placeholder-shown(?![\w-])/i.test(node.selector) && (node.nodes ?? []).some(d => d.type === 'decl' && !d.prop.startsWith('--') && !statePaint.test(d.prop.toLowerCase()))) { problem('U_LAYOUT_SELECTOR', `${node.selector}: :placeholder-shown holds only until the user types, and this rule changes the layout`, node.source.start.line); continue; }
      // F48: :link matches only while the link is unvisited; a rule in it that changes the layout depends on the history.
      if (/:link(?![\w-])/i.test(node.selector) && (node.nodes ?? []).some(d => d.type === 'decl' && !d.prop.startsWith('--') && !statePaint.test(d.prop.toLowerCase()))) { problem('U_LAYOUT_SELECTOR', `${node.selector}: :link holds only while the link is unvisited, and this rule changes the layout (use :any-link for every link)`, node.source.start.line); continue; }
      // F59: border-radius is paint (not cascaded here); the rules that round a box are kept for the engine, which tells
      // a collapsed table (whose border it does not round) apart. A rule that sets it to 0 for the box keeps it unreported.
      if (selectors.length && selectors.every(sel => !sel.state && !sel.pseudoElement)) for (const d of node.nodes ?? []) if (d.type === 'decl' && /^border-(?:(?:top|bottom)-(?:left|right)-)?radius$/i.test(d.prop))
        radiusRules.push({ selectors, selector: node.selector, file: filename, line: d.source.start.line, ...(/^\s*0(?:px)?\s*$/.test(d.value) ? { zero: true } : {}) });
      // F52: an invalid grid-template-areas (rows of different lengths, a name that does not make one rectangle) is
      // dropped by the browser (measured: CSS.supports is false in Chromium, Firefox and WebKit): dropped here too.
      for (const d of [...(node.nodes ?? [])]) if (d.type === 'decl' && d.prop.toLowerCase() === 'grid-template-areas') {
        const why = invalidAreas(d.value);
        if (why) { note('W_CSS_GRID_AREAS_INVALID', { selector: node.selector, value: d.value, why, file: filename, line: d.source.start.line }); d.remove(); }
      }
      // F47: in ::placeholder, margin, height, display and position are ignored by Chromium, Firefox and WebKit (measured
      // against a ::placeholder rule without them: same pixels, same field size) — reported and dropped.
      if (selectors.length && selectors.every(sel => sel.pseudoElement === 'placeholder'))
        for (const d of [...(node.nodes ?? [])]) if (d.type === 'decl' && /^(?:margin(?:-(?:top|right|bottom|left))?|height|display|position)$/i.test(d.prop)) { note('W_CSS_PLACEHOLDER_IGNORED', { selector: node.selector, property: d.prop.toLowerCase(), file: filename, line: d.source.start.line }); d.remove(); }
      // Checklist F6: one property declared twice in a rule — the earlier declaration never applies (the later wins, or
      // the !important one). A later value the browser may not support (a newer function, unit or keyword, or a
      // vendor-prefixed one) is the progressive-enhancement fallback pattern and is left alone.
      {
        const newer = /(?:\b(?:var|env|calc|min|max|clamp|color-mix|oklch|oklab|lab|lch|light-dark|round|mod|rem|anchor|attr)\(|-webkit-|-moz-|-ms-|\d(?:dvh|svh|lvh|dvw|svw|lvw|dvi|svi|dvb|svb|cqi|cqw|cqh|cqb|cqmin|cqmax|rlh|lh|ic|cap)\b|\b(?:fit-content|max-content|min-content|stretch|-webkit-fill-available|subgrid|contents|clip|anchor-size)\b)/i;
        const seenProps = new Map();
        for (const d of node.nodes ?? []) {
          if (d.type !== 'decl') continue;
          const prop = d.prop.toLowerCase(), earlier = seenProps.get(prop);
          if (earlier && !newer.test(d.value) && !newer.test(earlier.value) && !notesOf('W_CSS_DUPLICATE_DECLARATION').some(n => n.file === filename && n.line === d.source.start.line && n.property === prop)) {
            const dead = earlier.important && !d.important ? d : earlier;
            note('W_CSS_DUPLICATE_DECLARATION', { property: prop, selector: node.selector, file: filename, line: dead.source.start.line, dead: dead.value.trim(), kept: (dead === d ? earlier : d).value.trim(), same: earlier.value.trim() === d.value.trim() });
          }
          seenProps.set(prop, d);
          // F15, F16: a declaration that only acts with another property: kept with the rule's selectors, checked per box
          // against the computed value of that property (background-image, text-decoration-line).
          if (/^(?:-webkit-)?user-select$/.test(prop) && d.value.trim().toLowerCase() === 'none') userSelectNone.push({ selectors, file: filename, line: d.source.start.line, selector: node.selector });
          if (dependentProperty[prop] && !wide.has(d.value.trim().toLowerCase())) dependentDeclarations.push({ selectors, contexts, property: prop, value: d.value.trim(), file: filename, line: d.source.start.line, selector: node.selector });
          // F12: a transition shorthand item with no time is 0s. (An invalid shorthand is F114: dropped, so no transition at all.)
          if (prop === 'transition' && !wide.has(d.value.trim().toLowerCase()) && !timingProblem(prop, d.value)) for (const item of postcss.list.comma(d.value)) if (!/(?:^|\s)-?(?:\d+(?:\.\d+)?|\.\d+)m?s(?:\s|$)/i.test(item.trim()) && item.trim().toLowerCase() !== 'none' && !/var\(/i.test(item))
            note('W_CSS_TRANSITION_NO_DURATION', { selector: node.selector, file: filename, line: d.source.start.line, item: item.trim() });
        }
      }
      // A state rule (:hover, :focus, …) may only repaint: the layout is proved for the base state.
      // Preference rules (prefers-reduced-motion, prefers-color-scheme, …) likewise: layout is proved under the default preferences.
      if (preferences.length && node.nodes.some(d => d.type === 'decl' && !d.prop.startsWith('--') && !statePaint.test(d.prop.toLowerCase()))) { problem('U_LAYOUT_QUERY', `Preference media rules may only change paint and animation; ${node.selector} changes layout`, node.source.start.line); continue; }
      // A :focus/:focus-visible rule may also move an absolutely positioned box by its insets (the skip-link pattern);
      // the engine models that for the accessibility checks only and keeps every other proof Unknown.
      const insetMove = /^(?:left|right|top|bottom|inset(?:-inline|-block)?)$/;
      // A state rule may also transform the box (hover lift, focus scale): transforms paint and hit-test, never lay out.
      const focusOnly = selectors.every(selector => ['focus', 'focus-visible'].includes(selector.state));
      const moves = d => (focusOnly && insetMove.test(d.prop.toLowerCase())) || ['transform', 'translate', 'rotate', 'scale'].includes(d.prop.toLowerCase());
      const stateGeometry = selectors.every(selector => selector.state) && node.nodes.some(d => d.type === 'decl' && moves(d)) && node.nodes.every(d => d.type !== 'decl' || d.prop.startsWith('--') || statePaint.test(d.prop.toLowerCase()) || moves(d));
      // A :checked::before/::after rule builds the pseudo-element only in the checked state; the engine requires it to be
      // absolutely positioned (an overlay), so it never moves the layout.
      const checkedMark = selectors.every(selector => selector.state === 'checked' && selector.pseudoElement);
      // A :focus/:focus-visible/:focus-within rule that changes layout: the engine lays the page out again with that one
      // box focused (accessibility checks only); in the base layout it never applies.
      const focusLayout = selectors.every(selector => ['focus', 'focus-visible', 'focus-within'].includes(selector.state) && !selector.pseudoElement);
      // A :hover rule that changes layout: the page is laid out again with each matching box hovered, and any box
      // whose start position moves is a layout shift (Chromium counts it: hover is not an excusing input; measured).
      const hoverLayout = !stateGeometry && !checkedMark && selectors.every(selector => selector.state === 'hover' && !selector.pseudoElement);
      // A :active rule that changes layout (a pressed button's content dropping by its padding): the page is laid out again
      // with each matching box pressed, and that layout is checked like the base one.
      const activeLayout = !stateGeometry && !checkedMark && selectors.every(selector => selector.state === 'active' && !selector.pseudoElement);
      const stateLayout = !stateGeometry && !checkedMark && (focusLayout || hoverLayout || activeLayout);
      // A state rule that changes layout in a state the analysis does not lay out (:active, :checked, …): Unknown for the
      // boxes it may match in that state (the rule never applies in the states that are laid out, so it is dropped).
      if (!stateGeometry && !checkedMark && !stateLayout && selectors.some(selector => selector.state) && node.nodes.some(d => d.type === 'decl' && !d.prop.startsWith('--') && !statePaint.test(d.prop.toLowerCase()))) {
        const candidates = selectors.map(selector => selector.state ? candidateSelector(selector.source) : selector);
        if (candidates.every(Boolean)) { rules.push(markRule(candidates, `State selector rules may only change paint (color, background, outline, box-shadow, text-decoration); ${node.selector} changes layout`, node, contexts, layer, filename, preferences, 'layout')); continue; }
      }
      if (!stateGeometry && !checkedMark && !stateLayout && selectors.some(selector => selector.state) && node.nodes.some(d => d.type === 'decl' && !d.prop.startsWith('--') && !statePaint.test(d.prop.toLowerCase()))) { problem('U_LAYOUT_SELECTOR', `State selector rules may only change paint (color, background, outline, box-shadow, text-decoration); ${node.selector} changes layout`, node.source.start.line); continue; }
      const declarations = []; let unmodeled;
      const authored=node.nodes.filter(declaration=>declaration.type==='decl');
      // Rules that declare content at all (also a value not read here, such as attr()): F9 does not call them content-less.
      if (authored.some(d => d.prop.toLowerCase() === 'content')) contentRules.push(selectors);
      // transition of display: display is discrete and does not transition without transition-behavior: allow-discrete
      // (CSS Transitions 2; measured: display: none applies at once). Paint timing only, reported as a warning.
      {
        const named = authored.filter(d => /^(?:transition|transition-property)$/i.test(d.prop) && /(?:^|[\s,])display(?:[\s,]|$)/i.test(d.value));
        const discrete = authored.some(d => /^transition-behavior$/i.test(d.prop) && /allow-discrete/i.test(d.value)) || named.some(d => /allow-discrete/i.test(d.value));
        if (named.length && !discrete) note('W_CSS_TRANSITION_DISPLAY', { file: filename, line: named[0].source.start.line, selector: node.selector });
      }
      const conflicts=findCSSWriteConflicts(authored.map(declaration=>declaration.prop));
      for(const conflict of conflicts) {
        const location=index=>({file:filename,line:authored[index].source.start.line,column:authored[index].source.start.column});
        const css=location(conflict.later);
        // 'warning' (CSS this rule was not written for, such as an adapter's CSS-in-JS): reported, and the rule is kept
        // (within one rule the later declaration wins)
        if(shorthandConflicts==='warning') { note('W_CSS_SHORTHAND_CONFLICT',{selector:node.selector,properties:conflict.properties,longhands:conflict.longhands,later:css,earlier:location(conflict.earlier)}); continue; }
        diagnostic('E_CSS_SHORTHAND_CONFLICT',cssWriteConflictMessage(conflict),css.line,filename,
          {severity:'error',css,hint:conflict.hint,conflict:{properties:conflict.properties,longhands:conflict.longhands},
            related:[{css:location(conflict.earlier),message:`Earlier ${conflict.properties[0]} declaration`}]});
      }
      if(conflicts.length && shorthandConflicts!=='warning') continue;
      // F123: isolation: isolate next to mix-blend-mode on the same element isolates its descendants, not the element: it
      // still blends with what is behind it (measured in Chromium, Firefox and WebKit). The parent needs the isolation.
      { const decls = node.nodes.filter(d => d.type === 'decl'), last = prop => decls.findLast(d => d.prop.toLowerCase() === prop);
        const blend = last('mix-blend-mode'), iso = last('isolation');
        if (blend && iso && iso.value.trim().toLowerCase() === 'isolate' && !/^(?:normal|initial|unset|inherit|revert|revert-layer)$/i.test(blend.value.trim()) && !/var\(/i.test(blend.value))
          note('W_CSS_ISOLATION_SELF', { blend: blend.value.trim(), selector: node.selector, file: filename, line: iso.source.start.line }); }
      // F128: a percentage margin-top / margin-bottom is a share of the containing block's width, not its height (CSS 2.2
      // §8.3; measured in Chromium, Firefox and WebKit: 10% in a 400x100 box is 40px). Vertical padding in % is the usual
      // aspect-ratio trick and is not reported. (The layout stays Unknown on % margins.)
      for (const d of node.nodes) if (d.type === 'decl') {
        const prop = d.prop.toLowerCase(), parts = prop === 'margin' ? postcss.list.space(d.value) : null;
        const vertical = prop === 'margin-top' || prop === 'margin-bottom' || prop === 'margin-block' || prop === 'margin-block-start' || prop === 'margin-block-end' ? [d.value.trim()] : parts ? [parts[0], parts[2] ?? parts[0]] : [];
        const pct = vertical.find(v => /^-?(?:\d*\.)?\d+%$/.test(v) && !/^-?0+(?:\.0+)?%$/.test(v));
        if (pct) note('W_CSS_MARGIN_PERCENT_WIDTH', { property: prop, value: d.value.trim(), percent: pct, selector: node.selector, file: filename, line: d.source.start.line });
      }
      // F122: a size keyword some browsers drop (stretch, -moz-available, -webkit-fit-content, intrinsic) without a value
      // the others take: each browser ends on a different value (measured in Chromium, Firefox and WebKit). Reported;
      // the layout stays Unknown on these keywords.
      for (const split of sizeKeywordSplits(node.nodes.filter(d => d.type === 'decl').map(d => ({ prop: d.prop, value: d.value }))))
        note('W_CSS_SIZE_BROWSER_DEPENDENT', { ...split, selector: node.selector, file: filename, line: node.nodes.findLast(d => d.type === 'decl' && d.prop.toLowerCase() === split.property).source.start.line });
      for (const declaration of node.nodes) {
        if (declaration.type === 'comment') continue;
        if (declaration.type !== 'decl') { problem('U_LAYOUT_CSS', 'Nested CSS rules are outside the subset', declaration.source.start.line); continue; }
        // A dynamic value (an adapter's placeholder -veriss-dynamic(id): known only at run time) takes part in the cascade
        // for each longhand it sets; computeStyle reports where it wins (values.$dynamic).
        { const dynamic = /^\s*-veriss-dynamic\((\d+)\)\s*$/i.exec(declaration.value);
          if (dynamic) {
            const property = declaration.prop.toLowerCase();
            let names; try { names = expand(property, 'initial').map(([name]) => name); } catch { names = [property]; }
            for (const name of names) { const flip = logicalFlip(property, name); declarations.push({ property: name, value: 'initial', ...(flip ? { flip } : {}), dynamic: { id: Number(dynamic[1]), written: `${declaration.prop}: ${declaration.value.trim()}` }, important: declaration.important ? 1 : 0, line: declaration.source.start.line, file: filename }); }
            continue;
          } }
        // A stray ':' in the value (tolerateStrayColons) or a background-image that is not an <image> (a bare URL without
        // url(), a quoted string): the browser drops the declaration (measured in Chromium, Firefox and WebKit).
        { const start = declaration.source?.start?.offset, end = declaration.source?.end?.offset;
          const repaired = repairedOffsets.length > 0 && (start === undefined || end === undefined || repairedOffsets.some(o => o >= start && o <= end));
          const prop = declaration.prop.toLowerCase(), raw = declaration.value.trim(), value = repaired ? raw.replaceAll(STRAY_COLON, ':') : raw;
          const line = declaration.source.start.line;
          if (!prop.startsWith('--') && ['background-image', 'background'].includes(prop)) {
            const problem = prop === 'background-image' ? imageProblem(raw) : (t => t && { token: t })(shorthandImageToken(raw));
            if (problem) { const token = prop === 'background' ? problem.token : postcss.list.comma(value).find(l => imageProblem(l)) ?? value;
              note('W_CSS_IMAGE_INVALID', { property: prop, value, token: token.replaceAll(STRAY_COLON, ':'), url: imageURL(token), selector: node.selector, file: filename, line });
              // Kept as a marker on the boxes the rule matches: why such a box may paint nothing (the accessibility rules say so).
              declarations.push({ property: '$droppedImage', droppedImage: { property: prop, value }, file: filename, line });
              continue; }
          }
          if (!prop.startsWith('--') && repaired && raw.includes(STRAY_COLON)) { note('W_CSS_STRAY_COLON', { property: prop, value: value.replace(/\s+/g, ' '), selector: node.selector, file: filename, line }); continue; } }
        // F86: a "!word" other than !important at the end of a value makes the declaration invalid: the browser drops it
        // (measured in Chromium, Firefox and WebKit). PostCSS keeps it in the value; it is dropped here and reported.
        { const bang = !declaration.prop.startsWith('--') && !declaration.important && /!\s*([a-z][\w-]*)\s*$/i.exec(declaration.value);
          if (bang && bang[1].toLowerCase() !== 'important') { note('W_CSS_IMPORTANT_TYPO', { property: declaration.prop.toLowerCase(), value: declaration.value.trim(), word: bang[0].replace(/\s+/g, ''), selector: node.selector, file: filename, line: declaration.source.start.line }); continue; } }
        // F99 / F100: an unquoted family name that is not a run of identifiers (Font Awesome 5 Free), or a font shorthand
        // without a size or a family, is invalid: the browser drops the declaration (measured in Chromium, Firefox and WebKit).
        { const prop = declaration.prop.toLowerCase();
          const problem = prop === 'font-family' ? (b => b && { family: b })(familyProblem(declaration.value)) : prop === 'font' ? fontShorthandProblem(declaration.value) : null;
          if (problem) { note('W_CSS_FONT_INVALID', { property: prop, value: declaration.value.trim(), ...problem, selector: node.selector, file: filename, line: declaration.source.start.line }); continue; } }
        // F101: a grid track list the grammar does not allow (repeat(auto-fill, 1fr), minmax(1fr, …), repeat(0, …)) is
        // invalid: the browser drops the declaration (measured in Chromium, Firefox and WebKit).
        { const prop = declaration.prop.toLowerCase(), problem = /^grid-template-(?:columns|rows)$/.test(prop) && gridTrackProblem(declaration.value);
          if (problem) { note('W_CSS_GRID_TRACKS_INVALID', { property: prop, value: declaration.value.trim(), problem, selector: node.selector, file: filename, line: declaration.source.start.line }); continue; } }
        // F115: a background shorthand the browser drops (a color before the last layer, an unquoted url() with spaces,
        // "/" without a position, cover / contain without "/"; measured in Chromium, Firefox and WebKit).
        { const problem = declaration.prop.toLowerCase() === 'background' && backgroundProblem(declaration.value, t => parseColor(t) !== null || /^currentcolor$/i.test(t));
          if (problem) { note('W_CSS_BACKGROUND_INVALID', { value: declaration.value.trim(), problem, selector: node.selector, file: filename, line: declaration.source.start.line }); continue; } }
        // F114: a transition / animation value the browser drops (a bare number for a time, three times, an unknown
        // easing word, …; measured in Chromium, Firefox and WebKit): dropped here too and reported.
        { const problem = timingProblem(declaration.prop, declaration.value);
          if (problem) { note('W_CSS_TIMING_INVALID', { property: declaration.prop.toLowerCase(), value: declaration.value.trim(), problem, selector: node.selector, file: filename, line: declaration.source.start.line }); continue; } }
        // F109: a keyword the property does not take (position: center, white-space: no-wrap, …): the browser drops the
        // declaration (measured in Chromium, Firefox and WebKit). keyword-syntax.mjs judges only closed keyword sets.
        { const problem = keywordProblem(declaration.prop, declaration.value);
          if (problem) { note('W_CSS_KEYWORD_INVALID', { property: declaration.prop.toLowerCase(), value: declaration.value.trim(), ...problem, selector: node.selector, file: filename, line: declaration.source.start.line }); continue; } }
        // F107: a color the grammar does not allow (hsl(0, 0, 0), rgb(0 0 0, .5), #12345, …) makes the whole declaration
        // invalid: the browser drops it and the earlier color stays (measured in Chromium, Firefox and WebKit). Read in the
        // properties that take a color (also inside a shorthand), outside url() and strings.
        { const prop = declaration.prop.toLowerCase();
          if (colorProperty.test(prop)) {
            const text = declaration.value.replace(/url\([^)]*\)|"[^"]*"|'[^']*'/gi, ' ');
            const bad = [...text.matchAll(/#[0-9a-z]+\b|\b(?:rgba?|hsla?)\((?:[^()]|\([^()]*\))*\)/gi)].map(m => [m[0], colorSyntaxProblem(m[0])]).find(([, problem]) => problem);
            if (bad) { note('W_CSS_COLOR_INVALID', { property: prop, value: declaration.value.trim(), color: bad[0], problem: bad[1], selector: node.selector, file: filename, line: declaration.source.start.line }); continue; }
          } }
        // F93: a bare number other than 0 where only a length is allowed (width: 100) is invalid in standards mode — the
        // mode analysed here — so the browser drops the declaration (measured in Chromium, Firefox and WebKit; only quirks
        // mode, in WebKit, takes it as px).
        { const prop = declaration.prop.toLowerCase(), value = declaration.value.trim();
          if (lengthOnly.test(prop) && !/[(]/.test(value)) {
            const bare = value.split(/[\s/]+/).find(t => /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(t) && Number(t) !== 0);
            if (bare) { note('W_CSS_UNITLESS_LENGTH', { property: prop, value, bare, selector: node.selector, file: filename, line: declaration.source.start.line }); continue; }
          } }
        // F89: + or - without white space on both sides in calc() / min() / max() / clamp() makes the value invalid: the
        // browser drops the declaration (measured in Chromium, Firefox and WebKit), so it is dropped here too.
        { const bad = !declaration.prop.startsWith('--') && calcOperatorProblem(declaration.value);
          if (bad) { note('W_CSS_CALC_OPERATOR_SPACE', { property: declaration.prop.toLowerCase(), value: declaration.value.trim(), written: bad, selector: node.selector, file: filename, line: declaration.source.start.line }); continue; } }
        try {
          const custom=declaration.prop.startsWith('--'),property=custom ? declaration.prop : declaration.prop.toLowerCase();
          const expression=custom || /var\(/i.test(declaration.value) ? variableValue(declaration.value) : undefined;
          const pending=!custom && expression?.references.length ? {property,expression} : undefined;
          if(custom && !customName(property)) throw Object.assign(new Error('Use unescaped ASCII custom-property names'),{code:'U_LAYOUT_VARIABLE'});
          for (const [name, value] of custom ? [[property,declaration.value]] : expand(property,pending ? 'initial' : declaration.value)) {
            // A logical inline side (padding-inline-start, margin-inline, inset-inline-end, …) is stored as its ltr
            // physical side; `flip` is the side it means in an rtl box (computeStyle picks it once the direction is known).
            const flip = logicalFlip(property, name);
            declarations.push({ property:name, value, ...(flip ? {flip} : {}), ...(custom ? {expression} : {}), ...(pending ? {pending,specified:declaration.value} : {}), ...(declaration.prop.toLowerCase() === 'text-wrap' ? { wrapShorthand: declaration.value.trim() } : {}), important: declaration.important ? 1 : 0, line: declaration.source.start.line, file: filename });
          }
        } catch (error) {
          // Not modeled: Unknown where the rule applies (computeStyle), not for the whole page — a site-wide stylesheet
          // has rules for elements this page does not have, and they style nothing here.
          declarations.push({ property: '$unmodeled', unmodeled: error.message, code: error.code ?? 'U_LAYOUT_CSS', file: filename, line: declaration.source.start.line });
          // Kept for the checks that read the written value (F133: a container query unit the layout does not model).
          if (/\d(?:cqw|cqi|cqh|cqb)\b/i.test(declaration.value)) (unmodeled ??= []).push({ property: declaration.prop.toLowerCase(), specified: declaration.value.trim(), file: filename, line: declaration.source.start.line, selector: node.selector });
        }
      }
      rules.push({ selectors, contexts, declarations, ...(unmodeled ? { unmodeled } : {}), layer, file: filename, line: node.source.start.line, ...(preferences.length ? { preferences } : {}), ...(stateGeometry ? { stateGeometry: true } : {}), ...(stateLayout && node.nodes.some(d => d.type === 'decl' && !d.prop.startsWith('--') && !statePaint.test(d.prop.toLowerCase())) ? { stateLayout: true, ...(hoverLayout ? { hoverLayout: true } : {}), ...(activeLayout ? { activeLayout: true } : {}) } : {}) });
    }
  };
  // F125: em and rem in a media query are the browser's default font size (16px unless the user changed it), not the
  // root font-size the page sets (measured in Chromium, Firefox and WebKit: html { font-size: 10px } leaves
  // (min-width: 50rem) at 800px). The root rules are found first, so a query before them is judged too.
  let rootFont = null;
  for (const sheet of sheets) {
    let root; try { root = postcss.parse(sheet.css, { from: sheet.file }); } catch { continue; }
    root.walkRules(rule => { if (rule.parent?.type === 'root' && postcss.list.comma(rule.selector).some(sel => /^(?:html|:root)$/i.test(sel.trim()))) rule.walkDecls(/^(?:font-size|font)$/i, d => {
      const v = d.prop.toLowerCase() === 'font' ? (/(?:^|\s)(\d*\.?\d+(?:px|%|em|rem|pt))(?:\/|\s)/i.exec(d.value)?.[1] ?? '') : d.value.trim().toLowerCase();
      if (v && !/^(?:16px|100%|1em|1rem|medium|12pt|inherit|initial|unset|revert|revert-layer|var\(.*)$/i.test(v)) rootFont = { value: v, selector: rule.selector, file: sheet.file, line: d.source.start.line };
    }); });
  }
  // F130: ::-webkit-scrollbar and the standard scrollbar-width / scrollbar-color. Chromium and WebKit ignore
  // ::-webkit-scrollbar on an element that sets either standard property (measured: scrollbar-width: thin beside
  // ::-webkit-scrollbar { width: 4px } is 10px wide in Chromium with classic scrollbars, 0 instead of 4 in WebKit;
  // scrollbar-color too in Chromium), and Firefox does not take ::-webkit-scrollbar at all (measured:
  // CSS.supports('selector(::-webkit-scrollbar)') is false), so hiding the bar there needs scrollbar-width: none.
  // Matched by the selector text before the pseudo-element.
  { const webkit = new Map(), standard = new Map();
    for (const sheet of sheets) {
      let root; try { root = postcss.parse(sheet.css, { from: sheet.file }); } catch { continue; }
      root.walkRules(rule => { for (const sel of postcss.list.comma(rule.selector)) {
        const m = /^(.*?)::-webkit-scrollbar(?:-[a-z-]+)?(?::[a-z-]+)*$/i.exec(sel.trim());
        const decls = (rule.nodes ?? []).filter(d => d.type === 'decl');
        if (m) { const base = m[1].trim() || '*'; if (!webkit.has(base)) webkit.set(base, { selector: sel.trim(), file: sheet.file, line: rule.source.start.line, hides: false }); const w = webkit.get(base);
          if (/^::-webkit-scrollbar$/i.test(sel.trim().slice(m[1].length).trim()) && decls.some(d => (/^display$/i.test(d.prop) && /^none$/i.test(d.value.trim())) || (/^(?:width|height)$/i.test(d.prop) && /^0(?:px)?$/i.test(d.value.trim())))) w.hides = true; }
        else for (const d of decls) if (/^scrollbar-(?:width|color)$/i.test(d.prop) && !/^(?:auto|initial|unset|inherit|revert|revert-layer)$/i.test(d.value.trim())) {
          const std = standard.get(sel.trim()) ?? {}; std[d.prop.toLowerCase()] = { value: d.value.trim(), file: sheet.file, line: d.source.start.line }; standard.set(sel.trim(), std); }
      } });
    }
    for (const [base, w] of webkit) {
      const std = standard.get(base);
      // scrollbar-width: none hides it in Chrome whatever ::-webkit-scrollbar says (the usual hide-everywhere pair).
      if (std && /^none$/i.test(std['scrollbar-width']?.value ?? '')) continue;
      if (std) note('W_CSS_SCROLLBAR_WEBKIT_IGNORED', { base, webkit: w, standard: Object.entries(std).map(([property, v]) => ({ property, ...v })) });
      else if (w.hides) note('W_CSS_SCROLLBAR_FIREFOX_SHOWN', { base, webkit: w });
    } }
  // F127: box-sizing is not inherited: border-box on html / :root / body alone leaves every other element content-box
  // (measured in Chromium, Firefox and WebKit). Reported unless some rule also sets it on the other elements (the
  // *, *::before, *::after { box-sizing: inherit } pattern, or any rule for other elements).
  { let rootSizing = null, elsewhere = false, affected = null;
    for (const sheet of sheets) {
      let root; try { root = postcss.parse(sheet.css, { from: sheet.file }); } catch { continue; }
      root.walkDecls(/^box-sizing$/i, d => {
        const rule = d.parent; if (rule?.type !== 'rule') return;
        const sels = postcss.list.comma(rule.selector).map(sel => sel.trim());
        if (sels.every(sel => /^(?:html|:root|body)$/i.test(sel)) && d.value.trim().toLowerCase() === 'border-box') rootSizing ??= { selector: rule.selector, file: sheet.file, line: d.source.start.line };
        else elsewhere = true;
      });
      // Only where it matters: a rule for other elements that sets a size and a padding or border.
      root.walkRules(rule => { if (affected || postcss.list.comma(rule.selector).every(sel => /^(?:html|:root|body)$/i.test(sel.trim()))) return;
        const has = re => rule.nodes?.some(d => d.type === 'decl' && re.test(d.prop) && !/^(?:0|0px|auto|none)$/i.test(d.value.trim()));
        if (has(/^(?:width|height|inline-size|block-size)$/i) && has(/^(?:padding|border)(?:-|$)/i)) affected = rule.selector; });
    }
    if (rootSizing && !elsewhere && affected) note('W_CSS_BOX_SIZING_NOT_INHERITED', { ...rootSizing, affected }); }
  for (const sheet of sheets) {
    repairedOffsets = sheet.repaired ?? [];
    try { const root = flattenNesting(postcss.parse(sheet.css, { from: sheet.file })); visit(root.nodes, [], null, sheet.file); }
    catch (error) { diagnostic('U_LAYOUT_CSS', error.reason ?? error.message, error.line, sheet.file); }
  }
  // F102: counter-reset / -increment / -set of a counter that no counter() / counters() in the analysed CSS reads change
  // nothing that shows (measured in Chromium, Firefox and WebKit). list-item is the counter list markers read.
  {
    const declared = [], read = new Set();
    for (const sheet of sheets) {
      let root; try { root = postcss.parse(sheet.css, { from: sheet.file }); } catch { continue; }
      root.walkDecls(d => {
        const prop = d.prop.toLowerCase();
        if (prop === 'content') for (const m of d.value.matchAll(/\bcounters?\(\s*([-\w]+)/gi)) read.add(m[1]);
        if (/^counter-(?:reset|increment|set)$/.test(prop) && !/var\(|^\s*(?:none|inherit|initial|unset|revert|revert-layer)\s*$/i.test(d.value))
          for (const name of d.value.trim().split(/\s+/).filter(w => !/^-?\d+$/.test(w) && !/^reversed\(/i.test(w))) declared.push({ name, property: prop, selector: d.parent?.selector ?? '', file: sheet.file, line: d.source?.start.line });
      });
    }
    const seen = new Set();
    for (const d of declared) if (d.name !== 'list-item' && !read.has(d.name) && !seen.has(d.name)) { seen.add(d.name); note('W_CSS_COUNTER_UNUSED', d); }
  }
  // An animation-name without @keyframes runs no animation.
  // (Checklist F1: the names without @keyframes are kept for a warning — a typo or a missing rule.)
  for (const rule of rules) for (const declaration of rule.declarations) if (declaration.property === 'animation-name' && !wide.has(declaration.value)) declaration.value = postcss.list.comma(declaration.value).map(name => {
    if (name === 'none' || keyframes.has(name)) return name;
    if (!notesOf('W_CSS_KEYFRAMES_MISSING').some(m => m.name === name && m.line === declaration.line && m.file === declaration.file)) note('W_CSS_KEYFRAMES_MISSING', { name, file: declaration.file, line: declaration.line, selector: rule.selectors?.[0]?.source });
    return 'none';
  }).join(', ');
  return { rules, layers, notes, keyframes, dependentDeclarations, markerSizing, firstPseudo, radiusRules, contentRules, userSelectNone, keyframeFrames, fontFaces, registered, defaultNamespace, startingRules, unreadContainers };
}

// The UA default family and the user's default font size are not author
// facts: `medium` and `ua-default` stay unresolved for text metrics.
const textInitial = { 'font-family': 'ua-default', 'font-size': 'medium', 'line-height': 'normal', 'font-weight': 'normal', 'font-style': 'normal', 'font-stretch': 'normal', 'font-variant': 'normal', 'text-transform': 'none', 'letter-spacing': 'normal', 'word-spacing': 'normal', 'text-align': 'start' };

export function computeStyle(rules, box, active, inherited = {}, {spend, state, rtl = false}={}) {
  let flipped = false;
  const values = {
    // Media: track/source never render; audio renders only with controls.
    // ::before/::after are inline by default (CSS Pseudo-Elements 4), whatever their element's tag.
    display: ['before', 'after'].includes(box.pseudo) ? 'inline' : ['track', 'source', 'template', 'datalist'].includes(box.tag) || (box.tag === 'audio' && !box.controls) ? 'none' : ['span', 'a', 'strong', 'em', 'b', 'i', 'small', 'output', 'label', 'img', 'picture', 'iframe', 'video', 'audio'].includes(box.tag) ? 'inline' : 'block',
    'aspect-ratio': 'auto', 'box-sizing': 'content-box', 'inline-size': 'auto', 'min-inline-size': 'auto', 'max-inline-size': 'none',
    'padding-left': '0', 'padding-right': '0', 'border-left': '0', 'border-right': '0',
    'padding-top': '0', 'padding-bottom': '0', 'border-top': '0', 'border-bottom': '0', 'border-top-color': 'currentcolor', 'border-right-color': 'currentcolor', 'border-bottom-color': 'currentcolor', 'border-left-color': 'currentcolor',
    'margin-left': box.tag === 'body' ? 'ua' : '0', 'margin-right': box.tag === 'body' ? 'ua' : '0',
    'margin-top': /^(?:body|p|h[1-6])$/.test(box.tag) ? 'ua' : '0', 'margin-bottom': /^(?:body|p|h[1-6])$/.test(box.tag) ? 'ua' : '0',
    'block-size': 'auto', 'min-block-size': 'auto', 'max-block-size': 'none',
    'grid-template-columns': 'none', 'grid-template-rows': 'none', 'grid-auto-rows': 'auto', 'grid-auto-flow': 'row', 'row-gap': 'normal',
    'container-type': 'normal', 'container-name': 'none', 'align-items': 'normal', 'align-self': 'auto', 'align-content': 'normal',
    'column-gap': 'normal', 'column-span': 'none', 'grid-template-areas': 'none', 'grid-column': 'auto', 'grid-row': 'auto',
    'background-color': 'transparent', 'background-image': 'none',
    'outline-style': 'none', 'outline-width': 'medium', 'outline-color': 'currentcolor', 'outline-offset': '0', 'box-shadow': 'none',
    hyphens: inherited.hyphens ?? 'manual', 'object-fit': 'fill', 'object-position': '50% 50%', 'scroll-behavior': 'auto', 'overscroll-behavior-x': 'auto', 'overscroll-behavior-y': 'auto', 'scroll-snap-type': 'none', 'scroll-snap-align': 'none', resize: 'none', 'text-wrap-mode': inherited['text-wrap-mode'] ?? 'white-space', 'text-wrap-style': inherited['text-wrap-style'] ?? 'auto', 'text-overflow': 'clip', 'line-clamp': 'none', 'box-orient': 'horizontal', 'touch-action': 'auto', 'z-index': 'auto', 'content-visibility': 'visible', 'contain-intrinsic-block-size': 'none', isolation: 'auto', 'transform-style': 'flat', 'backface-visibility': 'visible', transform: 'none', 'transform-origin': 'origin(0 0.5 0 0.5)', translate: 'none', rotate: 'none', scale: 'none', 'backdrop-filter': 'none', filter: 'none', 'will-change': 'auto', 'justify-self': 'auto', 'justify-items': 'normal', clip: 'auto', 'clip-path': 'none', ...Object.fromEntries(['margin', 'padding'].flatMap(kind => ['top', 'right', 'bottom', 'left'].map(side => [`scroll-${kind}-${side}`, kind === 'padding' ? 'auto' : '0']))), 'color-scheme': inherited['color-scheme'] ?? 'normal', cursor: inherited.cursor ?? 'auto', 'list-style-type': inherited['list-style-type'] ?? 'disc', 'animation-name': 'none', 'animation-duration': '0s', 'animation-iteration-count': '1', 'animation-play-state': 'running', 'animation-direction': 'normal', 'animation-timing-function': 'ease', 'animation-delay': '0s', 'animation-fill-mode': 'none', 'animation-timeline': 'auto', 'transition-property': 'all', 'transition-duration': '0s', 'transition-timing-function': 'ease', 'transition-delay': '0s',
    'table-layout': 'auto', // HTML UA: table { border-collapse: separate; border-spacing: 2px } (a UA rule on table, not inherited from above).
    'border-collapse': box.tag === 'table' ? 'separate' : inherited['border-collapse'] ?? 'separate', 'border-spacing': box.tag === 'table' ? '2px' : inherited['border-spacing'] ?? '0', 'caption-side': inherited['caption-side'] ?? 'top', 'empty-cells': 'show',
    // HTML UA: thead, tbody, tfoot, tr { vertical-align: middle } and td, th { vertical-align: inherit }.
    'vertical-align': ['thead', 'tbody', 'tfoot', 'tr'].includes(box.tag) ? 'middle' : ['td', 'th'].includes(box.tag) ? inherited['vertical-align'] ?? 'baseline' : 'baseline',
    fill: inherited.fill ?? 'black', stroke: inherited.stroke ?? 'none', 'list-style-position': inherited['list-style-position'] ?? 'outside', 'caret-color': inherited['caret-color'] ?? 'auto',
    color: box.tag === 'a' && box.focusable !== false ? 'ua-link' : inherited.color ?? 'canvastext', 'text-decoration-line': box.tag === 'a' && box.focusable !== false ? 'underline' : 'none', visibility: inherited.visibility ?? 'visible', 'pointer-events': inherited['pointer-events'] ?? 'auto', opacity: '1',
    'flex-direction': 'row', 'flex-wrap': 'nowrap', 'flex-grow': '0', 'flex-shrink': '1', 'flex-basis': 'auto', 'justify-content': 'normal', order: '0',
    'overflow-x': 'visible', 'overflow-y': 'visible', 'white-space': inherited['white-space'] ?? 'normal',
    'scrollbar-gutter':'auto', 'scrollbar-width':'auto',
    appearance:'auto',
    'overflow-wrap': inherited['overflow-wrap'] ?? 'normal', ...(inherited['word-break'] === 'break-all' ? { 'word-break': 'break-all' } : {}), float: 'none', position: 'static',
    left:'auto',right:'auto',top:'auto',bottom:'auto',
    'writing-mode': inherited['writing-mode'] ?? 'horizontal-tb', direction: inherited.direction ?? 'ltr',
    ...Object.fromEntries(textProperties.map(key => [key, inherited[key] ?? textInitial[key]])),
  };
  const defaults={...values};
  // Lists: UA margins and the start padding for markers; li defaults to display: list-item (unsupported).
  // details is a block; summary a list item with an inside disclosure marker (Chromium's UA sheet, measured).
  if (box.tag === 'details' && !box.pseudo) values.display = 'block';
  if (box.tag === 'summary' && !box.pseudo) { values.display = 'list-item'; values['list-style-type'] = 'disclosure-closed'; values['list-style-position'] = 'inside'; }
  if(['ul', 'ol'].includes(box.tag)) { values['list-style-type'] = box.tag === 'ol' ? 'decimal' : 'disc'; values['margin-top']='ua'; values['margin-bottom']='ua'; values['padding-left']='ua'; }
  if(box.tag==='li') values.display='list-item';
  // dl margins and the dd indent (1em / 40px) stay UA until reset; marquee is inline-block.
  if(box.tag==='dl') { values['margin-top']='ua'; values['margin-bottom']='ua'; }
  if(box.tag==='dd') values['margin-left']='ua';
  if(box.tag==='marquee') values.display='inline-block';
  // Tables keep their UA table-* display (unsupported) until the author restyles them; th is bold and centred.
  const tableDisplay = {table: 'table', caption: 'table-caption', thead: 'table-header-group', tbody: 'table-row-group', tfoot: 'table-footer-group', tr: 'table-row', th: 'table-cell', td: 'table-cell'};
  if (tableDisplay[box.tag]) values.display = tableDisplay[box.tag];
  if (box.tag === 'th') { values['font-weight'] = 'bold'; values['text-align'] = 'ua'; }
  // UA cell padding (HTML rendering: td, th { padding: 1px }).
  if (['td', 'th'].includes(box.tag)) for (const side of ['left', 'right', 'top', 'bottom']) values[`padding-${side}`] = '1px';
  // fieldset/legend: UA border, padding, margin and min-inline-size until reset.
  if (box.tag === 'fieldset') { for (const side of ['left', 'right', 'top', 'bottom']) { values[`padding-${side}`] = 'ua'; values[`border-${side}`] = 'ua'; } values['margin-left'] = 'ua'; values['margin-right'] = 'ua'; values['min-inline-size'] = 'ua'; }
  if (box.tag === 'legend') { values['padding-left'] = 'ua'; values['padding-right'] = 'ua'; }
  // Chromium's UA margin on checkboxes and radios (3px 3px 3px 4px; radio 3px 3px 0 5px, measured) applies whatever
  // their appearance: it stays 'ua' until the author sets the margin.
  // With a UA profile the margins are known (WebKit: 3px 2px on both).
  if (!box.pseudo && box.tag === 'input' && ['checkbox', 'radio'].includes(box.inputType)) ['top', 'right', 'bottom', 'left'].forEach((side, i) => { values[`margin-${side}`] = uaProfile ? uaProfile[box.inputType].margin[i] : 'ua'; });
  // An iframe's UA border: 2px inset on every side (Chromium, Firefox and WebKit, measured). frameborder is a
  // presentational hint that zeroes the widths (not the style): "0" and "no" (any case) in all three engines; other
  // values the integer parse reads as non-zero keep the border; the rest (an integer error such as "yes", "" or "0px")
  // drops it in Chromium and WebKit and keeps it in Firefox, so it needs a UA profile that names the engine.
  if (!box.pseudo && box.tag === 'iframe') {
    values.$uaBorder = true; values.$uaBorderStyled = true;
    const fb = box.frameBorder, zero = fb === undefined ? false : fb === 'dynamic' ? null : /^(?:0|no)$/i.test(fb) ? true
      : /^\s*[+-]?\d/.test(fb) && Number.parseInt(fb, 10) !== 0 ? false : uaProfile ? uaProfile.engine !== 'firefox' : null;
    if (zero === null) throw Object.assign(new Error(fb === 'dynamic' ? `${box.label}: a dynamic frameborder may or may not drop the iframe's UA border` : `${box.label}: frameborder="${fb}" drops the iframe's UA border in Chromium and WebKit but not in Firefox; write frameborder="0" (or "no"), or pass a ua profile that names the engine`), { code: 'U_LAYOUT_HTML' });
    for (const side of ['left', 'right', 'top', 'bottom']) values[`border-${side}`] = zero ? '0' : '2px';
  }
  // The control's UA box rules are not its ::before/::after's.
  if(!box.pseudo && ['button', 'input', 'select', 'textarea'].includes(box.tag)) {
    values.$uaBorder = true;
    for(const side of ['left','right','top','bottom']) {values[`padding-${side}`]='ua';values[`border-${side}`]='ua';}
    for(const key of ['display','box-sizing','min-inline-size','min-block-size']) values[key]='ua';
    // Text fields: Chromium's UA values are known (measured): inline-block, content-box (search: border-box), no min size.
    // Date and time fields (date, time, datetime-local, month, week) take the same box as a text field: content-box,
    // their author size even below their content (measured in Chromium: 218×42 for 200×40 + 8px padding + 1px border).
    if (box.tag === 'textarea' || (box.tag === 'input' && ['text', 'email', 'search', 'password', 'tel', 'url', 'number', 'date', 'time', 'datetime-local', 'month', 'week', undefined].includes(box.inputType))) {
      values.display = 'inline-block'; values['box-sizing'] = box.inputType === 'search' ? 'border-box' : 'content-box'; values['min-inline-size'] = '0'; values['min-block-size'] = '0';
      // With a UA profile (ua option) the field's padding and border are known.
      const edges = uaProfile && (box.tag === 'textarea' ? uaProfile.textarea : uaProfile.textField);
      if (edges) ['top', 'right', 'bottom', 'left'].forEach((side, i) => { values[`padding-${side}`] = edges.padding[i]; values[`border-${side}`] = edges.border[i]; });
    }
    if (uaProfile && box.tag === 'select') ['top', 'right', 'bottom', 'left'].forEach((side, i) => { values[`padding-${side}`] = uaProfile.select.padding[i]; values[`border-${side}`] = uaProfile.select.border[i]; });
    // A range slider: Chromium's UA box is inline-block, content-box, no padding or border, a 2px margin on every side,
    // and it takes its author width and height whatever they are (measured: 160×24, 20×4; 296px wide in a 300px column
    // with the UA margin).
    if (box.tag === 'input' && box.inputType === 'range') {
      values.display = 'inline-block'; values['box-sizing'] = 'content-box'; values['min-inline-size'] = '0'; values['min-block-size'] = '0';
      ['top', 'right', 'bottom', 'left'].forEach((side, i) => { values[`padding-${side}`] = '0'; values[`border-${side}`] = '0'; values[`margin-${side}`] = uaProfile ? uaProfile.range.margin[i] : '2px'; });
    }
    // Buttons: Chromium's UA box is padding 1px 6px, a 2px border, inline-block, border-box (measured, with or without
    // appearance: none).
    if (box.tag === 'button' || (box.tag === 'input' && ['button', 'submit', 'reset'].includes(box.inputType))) {
      // (Per browser with a UA profile: Firefox 1px 4px, WebKit 2px 6px 3px.)
      const b = uaProfile?.button ?? { padding: ['1px', '6px', '1px', '6px'], border: ['2px', '2px', '2px', '2px'] };
      ['top', 'right', 'bottom', 'left'].forEach((side, i) => { values[`padding-${side}`] = b.padding[i]; values[`border-${side}`] = b.border[i]; });
      // min-width stays auto (measured in Chromium: a flex item button grows to its min-content, like a div; in block
      // flow auto is 0).
      values.display = 'inline-block'; values['box-sizing'] = 'border-box'; values['min-inline-size'] = 'auto'; values['min-block-size'] = '0';
    }
    // Controls do not inherit the page's font size: the UA's control font is the default size − 2.67px (13.33px
    // at a 16px default; measured in Chromium), until the author sets it (font: inherit, font-size).
    values['font-size']='ua';
    // The rest of the UA control font (font: -webkit-small-control; measured in Chromium under a page that sets
    // Roboto, weight 300, line-height 2 and letter-spacing 1px: Arial (textarea monospace) 400, line-height normal,
    // letter- and word-spacing normal). The family is the platform's control font: its text is not measured until
    // the author sets the family (font: inherit or font-family).
    values['font-family'] = 'ua-control'; values['font-weight'] = 'normal'; values['font-style'] = 'normal';
    values['line-height'] = 'normal'; values['letter-spacing'] = 'normal'; values['word-spacing'] = 'normal';
  }
  // UA font rules (h1–h6 size, strong/b weight, em/i style, small size) are not author facts: they stay 'ua' until
  // author CSS sets them. h1–h6 (and th) are font-weight: bold in the HTML rendering rules and in Chromium, a fixed
  // absolute weight (strong/b are bolder, relative to the parent, and stay 'ua').
  if (/^h[1-6]$/.test(box.tag)) { values['font-size'] = 'ua'; values['font-weight'] = 'bold'; }
  if (['strong', 'b'].includes(box.tag)) values['font-weight'] = 'ua';
  if (['em', 'i'].includes(box.tag)) values['font-style'] = 'ua';
  if (box.tag === 'small') values['font-size'] = 'ua';
  // [hidden] { display: none } (UA): author display overrides it.
  if(box.hiddenAttr===true) values.display='none';
  // A closed popover: [popover]:not(:popover-open) { display: none } (UA); opening it is runtime state.
  if(box.popover===true) values.display='none';
  // A closed dialog: dialog:not([open]) { display: none } (UA). An open one is placed by the UA (position: absolute,
  // centred, fit-content), which is not modeled.
  if(box.tag==='dialog' && box.dialogOpen===false) values.display='none';
  // Thrown once the cascade has run, so the error carries the dialog's declarations (F129 reads its margins).
  const openDialog = box.tag==='dialog' && box.dialogOpen!==false ? Object.assign(new Error(box.dialogOpen==='dynamic' ? 'A dynamic open attribute decides whether the dialog renders' : 'An open dialog is placed by the UA (position: absolute, centred, fit-content), which is not modeled'),{code:'U_LAYOUT_ELEMENT'}) : null;
  // [dir=ltr|rtl] { direction } (UA, inherited): author CSS may override; dir=auto depends on the text.
  if(box.dirAttr==='ltr' || box.dirAttr==='rtl') values.direction=box.dirAttr;
  else if(box.dirAttr!==undefined) throw Object.assign(new Error(box.dirAttr==='auto' ? 'dir=auto: own text and children both have strong characters, whose order is not known' : `dir=${box.dirAttr} is not a direction`),{code:'U_LAYOUT_ELEMENT'});
  if(box.popover===true && ['html','body'].includes(box.tag)) throw Object.assign(new Error(`A popover on ${box.tag} would hide the whole page`),{code:'U_LAYOUT_ELEMENT'});
  if(box.popover==='dynamic') throw Object.assign(new Error('A dynamic popover attribute decides whether it renders'),{code:'U_LAYOUT_ELEMENT'});
  if(box.hiddenAttr==='until-found' || box.hiddenAttr==='dynamic') throw Object.assign(new Error(`hidden=${box.hiddenAttr === 'dynamic' ? '(dynamic)' : 'until-found'} is outside the modeled rendering`),{code:'U_LAYOUT_ELEMENT'});
  const ua = { ...values };
  const initial = { ...defaults, ...textInitial, fill: 'black', stroke: 'none', 'list-style-position': 'outside', 'caret-color': 'auto', hyphens: 'manual', 'object-fit': 'fill', 'scroll-behavior': 'auto', 'overscroll-behavior-x': 'auto', 'overscroll-behavior-y': 'auto', 'scroll-snap-type': 'none', 'scroll-snap-align': 'none', resize: 'none', 'text-wrap-mode': 'white-space', 'text-wrap-style': 'auto', 'text-overflow': 'clip', 'line-clamp': 'none', 'box-orient': 'horizontal', 'touch-action': 'auto', 'table-layout': 'auto', clear: 'none', 'column-count': 'auto', 'column-width': 'auto', 'column-span': 'none', 'border-collapse': 'separate', 'border-spacing': '0', 'caption-side': 'top', 'empty-cells': 'show', 'vertical-align': 'baseline', 'outline-style': 'none', 'outline-width': 'medium', 'outline-color': 'currentcolor', 'outline-offset': '0', 'box-shadow': 'none', 'z-index': 'auto', 'content-visibility': 'visible', 'contain-intrinsic-block-size': 'none', isolation: 'auto', 'transform-style': 'flat', 'backface-visibility': 'visible', transform: 'none', 'transform-origin': 'origin(0 0.5 0 0.5)', translate: 'none', rotate: 'none', scale: 'none', 'backdrop-filter': 'none', filter: 'none', 'will-change': 'auto', 'justify-self': 'auto', 'justify-items': 'normal', 'color-scheme': 'normal', cursor: 'auto', 'list-style-type': 'disc', 'animation-name': 'none', 'animation-duration': '0s', 'animation-iteration-count': '1', 'animation-play-state': 'running', 'animation-direction': 'normal', 'animation-timing-function': 'ease', 'animation-delay': '0s', 'animation-fill-mode': 'none', 'animation-timeline': 'auto', 'transition-property': 'all', 'transition-duration': '0s', 'transition-timing-function': 'ease', 'transition-delay': '0s', color: 'canvastext', 'text-decoration-line': 'none', visibility: 'visible', 'pointer-events': 'auto', display: 'inline', 'white-space': 'normal', 'overflow-wrap': 'normal', 'writing-mode': 'horizontal-tb', direction: 'ltr', 'margin-left': '0', 'margin-right': '0', 'margin-top': '0', 'margin-bottom': '0',
    // A side's border width and style as the border properties keep them ($bw-/$bs-side): medium and none.
    ...Object.fromEntries(['top', 'right', 'bottom', 'left'].flatMap(side => [[`$bw-${side}`, '3px'], [`$bs-${side}`, 'none']])) };
  const inheritedProperties = new Set(['white-space', 'overflow-wrap', 'word-break', 'writing-mode', 'direction', 'border-collapse', 'border-spacing', 'caption-side', 'empty-cells', ...textProperties, ...inheritedPaint]);
  const priorities = new Map(), sources = {},custom=new Map(),dormant={},overridden={}, candidates = {};
  // The declarations not modeled that apply here (kept apart from values, whose objects are pending substitutions), and
  // whether a rule the analysis cannot read may repaint the box.
  const unmodeled = [];
  const droppedImages = [];
  let paintUnmodeled = false;
  const conditions = rule => rule.contexts.length ? {conditions: rule.contexts.map(c => ({kind: c.kind, ...(c.name ? {name: c.name} : {}), params: c.params, css: c.css}))} : {};
  // A preference rule holds when the state names its value, or the value is the default.
  const preferred = rule => (rule.preferences ?? []).every(({ feature, value }) => ([...(state ?? [])].find(s => s.startsWith(`${feature}:`))?.slice(feature.length + 1) ?? preferenceValues[feature][0]) === value);
  for (const rule of rules) {
    if (!active(rule) || !preferred(rule)) {
      // Matching declarations whose conditions are false here: explanation data.
      const selector = rule.selectors.find(selector => matches(selector, box, state));
      if (selector) for (const declaration of rule.declarations) (dormant[declaration.property] ??= []).push({file: declaration.file, line: declaration.line, selector: selector.source, ...(rule.layerName ? {layer: rule.layerName} : {}), specified: declaration.specified ?? declaration.value, ...conditions(rule)});
      continue;
    }
    for (const selector of rule.selectors) {
      if (!matches(selector, box, state)) continue;
      for (const declaration of rule.declarations) {
        // Not modeled: the declaration is dropped from the style, and the layout of this box is Unknown (the style checks
        // still read the rest).
        if (declaration.paintUnmodeled) { paintUnmodeled = true; continue; }
        if (declaration.droppedImage) { droppedImages.push({ ...declaration.droppedImage, selector: selector.source, file: declaration.file, line: declaration.line }); continue; }
        if (declaration.unmodeled) { if (!unmodeled.some(u => u.line === declaration.line && u.message === declaration.unmodeled)) unmodeled.push({ message: declaration.unmodeled, code: declaration.code, file: declaration.file, line: declaration.line }); continue; }
        const layer = rule.layer === null ? (declaration.important ? -Infinity : Infinity) : declaration.important ? -rule.layer : rule.layer;
        // The style attribute (element-attached) wins over every selector and layer, below only importance (Cascade 5).
        // Scope proximity (Cascade 6 §6.6): after specificity, the nearer scope root wins; unscoped is farthest.
        const rank = [declaration.important, rule.attached ? 1 : 0, layer, ...selector.specificity, selector.scope ? -scopeProximity(selector, box, state) : -Infinity];
        const origin = { file: declaration.file, line: declaration.line, selector: selector.source, layer: rule.layerName, specified: declaration.specified ?? declaration.value, ...(declaration.dynamic ? { dynamic: declaration.dynamic } : {}), ...(declaration.wrapShorthand ? { wrapShorthand: declaration.wrapShorthand } : {}), ...conditions(rule), ...(declaration.flip ? { logical: true } : {}) };
        // A logical side resolves by the box's direction (an rtl pass when the first one finds rtl; CSS Logical 1).
        if (declaration.flip) flipped = true;
        const property = rtl && declaration.flip ? declaration.flip : declaration.property;
        if (!declaration.expression) (candidates[property] ??= []).push({ rank, value: declaration.pending ? declaration : declaration.value, origin, important: declaration.important });
        const wins = !priorities.has(property) || greaterRank(rank, priorities.get(property));
        // Explanation data only: the losing side of each comparison.
        const loser = wins ? sources[property] : origin;
        if (loser) (overridden[property] ??= []).push(loser);
        if (wins) {
          if(declaration.expression) custom.set(property,declaration);
          else values[property] = declaration.pending ? declaration : declaration.value;
          priorities.set(property, rank);
          sources[property] = origin;
        }
      }
    }
  }
  // revert-layer (CSS Cascade 5 §7.3): roll the property back to the best declaration of an earlier layer (rank[2] is the
  // layer; unlayered declarations are the implicit last layer, Infinity, so there it rolls back to the explicit layers —
  // measured in Chromium, Firefox and WebKit). With nothing earlier it is revert (the UA value).
  for (const property of Object.keys(values)) {
    let guard = 0;
    while (values[property] === 'revert-layer' && guard++ < 64) {
      const current = priorities.get(property);
      if (current[0]) throw Object.assign(new Error(`${property}: revert-layer !important is not modeled`), { code: 'U_LAYOUT_CSS' });
      const earlier = (candidates[property] ?? []).filter(c => !c.important && c.rank[2] < current[2]);
      if (!earlier.length) { values[property] = 'revert'; break; }
      const best = earlier.reduce((a, b) => greaterRank(b.rank, a.rank) ? b : a);
      values[property] = best.value; priorities.set(property, best.rank); sources[property] = best.origin;
    }
  }
  // F112: a declaration that has the higher specificity but loses because its cascade layer comes earlier (or the winner
  // is unlayered, the implicit last layer): the layer order decides before specificity (CSS Cascade 5 §6.4). Kept for
  // the rule that reports it; the cascade itself is unchanged. Only normal, selector-matched declarations of different
  // values are compared.
  const layerShadowed = [];
  for (const [property, list] of Object.entries(candidates)) {
    const win = priorities.get(property), winner = sources[property];
    if (!win || win[0] || win[1] || !winner) continue;
    for (const c of list) {
      if (c.important || c.rank[1] || c.origin === winner || !(c.rank[2] < win[2])) continue;
      const spec = c.rank.slice(3, 6), wspec = win.slice(3, 6);
      const higher = spec[0] !== wspec[0] ? spec[0] > wspec[0] : spec[1] !== wspec[1] ? spec[1] > wspec[1] : spec[2] > wspec[2];
      if (higher && String(c.value) !== String(values[property])) layerShadowed.push({ property, loser: c.origin, winner, value: c.value, winnerValue: values[property] });
    }
  }
  for (const [name, declaration] of custom) { const issue = registeredValueProblem(name, declaration.specified ?? declaration.value ?? ''); if (issue) throw Object.assign(new Error(issue), { code: 'U_LAYOUT_VARIABLE' }); }
  const environment=variableEnvironment(custom,inherited.$variables,box.documentRoot,spend,registeredProperties),expanded=new Map(),invalid=[];
  for (const property of Object.keys(values)) {
    let value = values[property];
    if(typeof value==='object') {
      const declaration=value;
      try {
        if(!expanded.has(declaration.pending)) {
          const result=substituteDeclaration(declaration.pending.expression,environment,spend);
          // Invalid at computed-value time: every longhand it writes is unset.
          if(result.invalid) invalid.push({property:declaration.pending.property,file:declaration.file,line:declaration.line,...result.invalid,longhands:[]});
          expanded.set(declaration.pending,{map:new Map(expand(declaration.pending.property,result.invalid ? 'unset' : result.value)),invalid:result.invalid ? invalid.at(-1) : undefined});
        }
        const entry=expanded.get(declaration.pending);
        // The expansion is keyed by the ltr side the declaration was stored under.
        value=entry.map.get(declaration.property);
        entry.invalid?.longhands.push(property);
        if(value===undefined) throw new Error('CSS variable shorthand does not produce the required property');
      } catch(error) {error.css={file:declaration.file,line:declaration.line};throw error;}
    }
    // A side's border width or style ($bw-/$bs-, kept for the pair below): revert rolls back past author-level
    // presentational hints (an iframe's frameborder) to the UA border, which is not modeled (kept, Unknown below).
    if (/^\$b[ws]-/.test(property) && ['revert', 'revert-layer'].includes(value)) { values[property] = value; continue; }
    if (value === 'revert') value = ua[property];
    if (value === 'unset') value = inheritedProperties.has(property) ? 'inherit' : 'initial';
    if (value === 'initial') value = initial[property];
    if (value === 'inherit') {
      if (Object.hasOwn(inherited, property)) value = inherited[property];
      else if (box.documentRoot) value = initial[property];
      else throw new Error(`Cannot resolve inherited ${property}; provide the real ancestor chain`);
    }
    values[property] = value;
  }
  // Content language from the lang attribute (HTML: inherited; empty means unknown). Not settable by CSS.
  values.$lang = box.lang !== undefined ? box.lang : inherited.$lang ?? '';
  // color-scheme: author-declared Canvas/CanvasText resolve in the element's used scheme
  // (Chromium: light #fff/#000, dark #121212/#fff). The UA defaults stay keywords (ADR-0007).
  const schemes = String(values['color-scheme']).split(/\s+/).filter(t => ['light', 'dark'].includes(t));
  const wanted = [...(state ?? [])].find(s => s.startsWith('prefers-color-scheme:'))?.slice(21) ?? 'light';
  const used = schemes.includes(wanted) ? wanted : schemes[0] ?? 'light';
  values.$scheme = used;
  for (const property of ['color', 'background-color']) if (sources[property] && ['canvas', 'canvastext'].includes(String(values[property]).toLowerCase()))
    values[property] = { light: { canvas: '#ffffff', canvastext: '#000000' }, dark: { canvas: '#121212', canvastext: '#ffffff' } }[used][String(values[property]).toLowerCase()];
  // Buttons: the UA's button { color: ButtonText; background-color: ButtonFace } (not inherited; with or without
  // appearance), in the used scheme: light #000 on #efefef, dark #fff on #6b6b6b (Chromium, measured).
  if (!box.pseudo && (box.tag === 'button' || (box.tag === 'input' && ['button', 'submit', 'reset'].includes(box.inputType)))) {
    // (Per browser with a UA profile; a profile without dark colors keeps the dark scheme's colors unknown.)
    const b = uaProfile?.button ?? { background: '#efefef', color: '#000000', darkBackground: '#6b6b6b', darkColor: '#ffffff' };
    if (!sources.color) values.color = used === 'dark' ? (b.darkColor ?? 'ua') : b.color;
    if (!sources['background-color']) values['background-color'] = used === 'dark' ? (b.darkBackground ?? 'ua') : b.background;
  }
  // position: fixed is laid out as absolute against the viewport; the engine admits it for the accessibility and
  // integrity checks only (at scroll position 0) and keeps every other proof Unknown.
  if (values.position === 'fixed') { values.position = 'absolute'; values.$fixed = true; }
  // F77: float computes to none on an absolutely positioned (or fixed) box (CSS 2.2 §9.7; measured in Chromium, Firefox and
  // WebKit: computed none, same position). Recorded for a warning.
  if (values.position === 'absolute' && !['none', undefined].includes(values.float)) { if (sources.float) drop(values, 'float-absolute', 'float', values.float); values.float = 'none'; }
  // template { display: none } (UA): its content is a fragment, never rendered; an author display would draw an empty
  // box (not measured), so it is left Unknown.
  // datalist { display: none } (UA, measured in Chromium, Firefox and WebKit): its options show only in the field's
  // suggestion popup; an author display would draw them (not modeled).
  if (box.tag === 'datalist' && values.display !== 'none') throw Object.assign(new Error(`${box.label}: display: ${values.display} on a datalist is not modeled`), { code: 'U_LAYOUT_ELEMENT' });
  if (box.tag === 'template' && values.display !== 'none') throw Object.assign(new Error(`${box.label}: display: ${values.display} on a template is not modeled`), { code: 'U_LAYOUT_ELEMENT' });
  // display: contents on a replaced element or form control computes to none (CSS Display Appendix B): it has no
  // children to promote (measured: 0x0 in Chromium, Firefox and WebKit for each of these).
  if (values.display === 'contents' && !box.pseudo && ['img', 'input', 'textarea', 'select', 'video', 'audio', 'iframe', 'canvas', 'progress', 'meter', 'br', 'wbr', 'object', 'embed', 'frame', 'frameset'].includes(box.tag)) { values.display = 'none'; values.$contentsRemoved = true; }
  // position: sticky with top: 0 is laid out in flow (as relative, unshifted at scroll 0); the accessibility scroll rules
  // treat it as a bar stuck to the viewport top while its parent is in view.
  // The winning text-wrap-mode folds into white-space (nowrap ↔ normal, pre ↔ pre-wrap); pre-line and break-spaces
  // have no nowrap keyword, so that combination is left for the engine to reject.
  const wrapMode = values['text-wrap-mode'], ws = values['white-space'];
  if (wrapMode === 'nowrap') values['white-space'] = ({ normal: 'nowrap', 'pre-wrap': 'pre', nowrap: 'nowrap', pre: 'pre' })[ws] ?? `${ws}+nowrap`;
  // F119: a text-wrap (or text-wrap-mode) that wins over the element's own white-space: nowrap / pre turns wrapping back
  // on (measured in Chromium, Firefox and WebKit); kept for the warning, with the two declarations.
  else if (wrapMode === 'wrap') {
    if (['nowrap', 'pre'].includes(String(ws)) && sources['white-space'] && sources['text-wrap-mode']) values.$wrapRestored = { whiteSpace: ws, by: sources['text-wrap-mode'], from: sources['white-space'] };
    values['white-space'] = ({ nowrap: 'normal', pre: 'pre-wrap' })[ws] ?? ws;
  }
  // letter-spacing in em computes to px against the element's own font-size (then inherits as px).
  const em = /^(-?\d+(?:\.\d{1,20})?)em$/.exec(String(values['letter-spacing'] ?? ''));
  if (em) values['letter-spacing'] = /^\d+(?:\.\d{1,20})?px$/.test(values['font-size']) ? `${+(Number(em[1]) * Number(values['font-size'].slice(0, -2))).toFixed(6)}px` : 'em-unresolved';
  // $stacks: sticky makes a stacking context whatever its insets (measured in Chromium), even where it never sticks.
  if (values.position === 'sticky') { values.position = 'relative'; values.$sticky = true; values.$stacks = true; }
  // rem box lengths compute to px once the root font size is known (setRootFontSize), so every px-only check sees
  // them as px. Only an exact decimal is written (decimal(): never the nearest double of the product); a value that
  // has none stays rem (Unknown where it is used).
  if (rootFontSize) for (const key of remLengths) {
    const m = /^(\d+(?:\.\d{1,20})?)rem$/.exec(String(values[key] ?? ''));
    if (!m) continue;
    const text = decimal(mul(q(m[1]), rootFontSize));
    if (text !== null) values[key] = text === '0' ? '0' : `${text}px`;
  }
  // em box lengths (checklist D2) compute to px against the element's own px font-size, as rem does against the root's.
  // (font-size in em is relative to the parent's and is left as it is.)
  if (/^\d+(?:\.\d{1,20})?px$/.test(String(values['font-size']))) for (const key of remLengths.filter(k => k !== 'font-size')) {
    const m = /^(\d+(?:\.\d{1,20})?)em$/.exec(String(values[key] ?? ''));
    if (!m) continue;
    const text = decimal(mul(q(m[1]), q(values['font-size'].slice(0, -2))));
    if (text !== null) values[key] = text === '0' ? '0' : `${text}px`;
  }
  // An em length left over (the font-size is not px): Unknown, attributed to the declaration that set it.
  for (const key of remLengths.filter(k => k !== 'font-size')) if (/^\d+(?:\.\d{1,20})?em$/.test(String(values[key] ?? '')))
    throw Object.assign(new Error(`${key}: ${values[key]} needs a px font-size to resolve (font-size is ${values['font-size']})`), { code: 'U_LAYOUT_CSS', css: sources[key] ? { file: sources[key].file, line: sources[key].line } : undefined });
  // A list's UA padding-inline-start is 40px (Chromium's UA sheet): on the left in ltr, on the right in rtl.
  if (['ul', 'ol'].includes(box.tag) && values['padding-left'] === 'ua') {
    values['padding-left'] = values.direction === 'rtl' ? '0' : '40px';
    if (values.direction === 'rtl' && !sources['padding-right']) values['padding-right'] = '40px';
  }
  // A side's used border width from its authored width and style (border-width / border-style longhands or the
  // border shorthand, whichever the cascade left): style none or hidden draws nothing; an unset width is medium (3px);
  // an unset style is the initial none. Sides no author rule touched keep their value (UA borders stay 'ua').
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const bw = `$bw-${side}`, bs = `$bs-${side}`;
    if (!sources[bw] && !sources[bs]) { delete values[bw]; delete values[bs]; continue; }
    // CSS-wide keywords: initial and unset resolved in the cascade (medium, none); revert is not modeled.
    for (const [key, property] of [[bw, 'width'], [bs, 'style']]) if (sources[key] && (values[key] === undefined || wide.has(String(values[key]))))
      throw Object.assign(new Error(`border-${side}-${property}: ${values[key] ?? 'a CSS-wide keyword'} is not modeled here`), { code: 'U_LAYOUT_CSS', css: { file: sources[key].file, line: sources[key].line } });
    // A control's UA border has a style of its own (known widths from a UA profile included): an author width alone
    // keeps that style and draws at the author width (a reset's border-width: 1px on a textarea).
    // (An iframe's border keeps its inset style when frameborder zeroed the width: $uaBorderStyled.)
    const uaStyled = values[`border-${side}`] === 'ua' || values.$uaBorderStyled || (values.$uaBorder && !['0', '0px'].includes(String(values[`border-${side}`])));
    const style = sources[bs] ? values[bs] : (uaStyled ? 'ua' : 'none');
    const width = sources[bw] ? values[bw] : (uaStyled ? values[`border-${side}`] : '3px');
    values[`border-${side}`] = ['none', 'hidden', 'none-implied'].includes(style) ? '0' : String(width) === '0' ? '0' : width;
    // For the border rule (F14): a non-zero width the author wrote, and a style written none or hidden (no border on
    // purpose; a shorthand that leaves the style out does not say so).
    if (sources[bw] && !['0', 'none-implied'].includes(String(values[bw])) && !wide.has(String(values[bw]))) (values.$borderWidthSet ??= []).push(side);
    if (sources[bs] && ['none', 'hidden'].includes(style)) (values.$borderNone ??= []).push(side);
    const later = [sources[bw], sources[bs]].filter(Boolean).at(-1);
    sources[`border-${side}`] = later;
    delete values[bw]; delete values[bs];
  }
  // The used transform: translate · rotate · scale · transform (CSS Transforms 2 §6), each an affine map
  // x ↦ A·x + t + W·u + H·w + em·e + rem·r; composing P after T gives A_P·A_T and A_P·(each T offset) + P's offsets.
  const individual = ['translate', 'rotate', 'scale'].filter(key => values[key] && values[key] !== 'none' && !wide.has(values[key]));
  if (individual.length) {
    const maps = [...individual.map(key => values[key]), ...(values.transform && values.transform !== 'none' ? [values.transform] : [])];
    if (maps.some(m => /^(?:rotate|linear)-any\(/.test(String(m)))) {
      values.transform = maps.length === 1 ? maps[0] : linearAny(maps, individual.join(', '));
    } else {
      const parse = m => /^affine\((.+)\)$/.exec(m)[1].split(' ').map(x => { const [n, d = '1'] = x.split('/'); return div(q(n), q(d)); });
      const compose = (P, T) => {
        const [a, b, c, d] = P, lin = (x, y) => [add(mul(a, x), mul(b, y)), add(mul(c, x), mul(d, y))];
        const A = [add(mul(a, T[0]), mul(b, T[2])), add(mul(a, T[1]), mul(b, T[3])), add(mul(c, T[0]), mul(d, T[2])), add(mul(c, T[1]), mul(d, T[3]))];
        const offsets = [4, 6, 8, 10, 12].flatMap(i => { const [x, y] = lin(T[i], T[i + 1]); return [add(x, P[i]), add(y, P[i + 1])]; });
        return [...A, ...offsets];
      };
      values.transform = `affine(${maps.map(parse).reduce((P, T) => compose(P, T)).map(exact).join(' ')})`;
    }
  }
  // transform-origin (checklist B3): about O the map is O + A(p − O) + t = C + A(p − C) + t + (I − A)(O − C), so the
  // map about the centre C takes the extra translation (I − A)(O − C), where O − C = (px + (f − ½)·W, px + (f − ½)·H).
  const origin = /^origin\((\S+) (\S+) (\S+) (\S+)\)$/.exec(String(values['transform-origin'] ?? ''));
  if (origin && values.transform && values.transform !== 'none' && !(Number(origin[1]) === 0 && Number(origin[2]) === 0.5 && Number(origin[3]) === 0 && Number(origin[4]) === 0.5)) {
    const [ox, fx, oy, fy] = origin.slice(1).map(Number);
    if (/^affine\(/.test(values.transform)) {
      const m = /^affine\((.+)\)$/.exec(values.transform)[1].split(' ').map(x => { const [n, d = '1'] = x.split('/'); return div(q(n), q(d)); });
      const [a, b, c, d] = m, I = q(1), neg = v => mul(v, q(-1)), num = v => q((Math.round(v * 1e6) / 1e6).toFixed(6));
      const vx = [num(ox), add(num(fx), q('-0.5')), q(0)], vy = [num(oy), q(0), add(num(fy), q('-0.5'))];
      // d_x = (1 − a)·v_x − b·v_y, d_y = −c·v_x + (1 − d)·v_y, for the px, W and H parts.
      const dx = [0, 1, 2].map(k => add(mul(add(I, neg(a)), vx[k]), mul(neg(b), vy[k]))), dy = [0, 1, 2].map(k => add(mul(neg(c), vx[k]), mul(add(I, neg(d)), vy[k])));
      m[4] = add(m[4], dx[0]); m[5] = add(m[5], dy[0]); m[6] = add(m[6], dx[1]); m[7] = add(m[7], dy[1]); m[8] = add(m[8], dx[2]); m[9] = add(m[9], dy[2]);
      values.transform = `affine(${m.map(exact).join(' ')})`;
    } else {
      const m = floatMap(values.transform), [a, b, c, d] = m;
      const vx = [ox, fx - 0.5, 0], vy = [oy, 0, fy - 0.5];
      const dx = [0, 1, 2].map(k => (1 - a) * vx[k] - b * vy[k]), dy = [0, 1, 2].map(k => -c * vx[k] + (1 - d) * vy[k]);
      m[4] += dx[0]; m[5] += dy[0]; m[6] += dx[1]; m[7] += dy[1]; m[8] += dx[2]; m[9] += dy[2];
      values.transform = linearAny([`linear-any(${m.join(' ')})`], 'transform-origin');
    }
  }
  values.$sources = sources;
  // the properties whose winning declaration is a dynamic value
  const dynamic = Object.entries(sources).filter(([, o]) => o?.dynamic).map(([property, o]) => ({ property, ...o }));
  if (dynamic.length) values.$dynamic = dynamic;
  if (openDialog) throw Object.assign(openDialog, { $sources: { ...sources } });
  if (layerShadowed.length) values.$layerShadowed = layerShadowed;
  values.$dormant = dormant;
  values.$overridden = overridden;
  values.$invalid = invalid;
  values.$variables = environment;
  // F57: overflow, text-overflow and resize apply to block containers (and replaced elements): on a display: inline
  // element they do nothing (measured in Chromium, Firefox and WebKit). Used as their initial values here.
  // (Not an absolutely positioned or floated box, nor a flex or grid item: those are blockified, and overflow applies.)
  const blockified = ['absolute', 'fixed'].includes(String(values.position)) || values.$fixed || !['none', undefined].includes(values.float) || (['flex', 'inline-flex', 'grid', 'inline-grid'].includes(inherited?.display) && !inherited?.$blockFlow);
  if (!box.pseudo && values.display === 'inline' && !blockified && !['img', 'video', 'canvas', 'iframe', 'svg', 'input', 'button', 'select', 'textarea', 'embed', 'object'].includes(box.tag)) {
    const found = [['overflow-x', 'visible'], ['overflow-y', 'visible'], ['text-overflow', 'clip'], ['resize', 'none']].filter(([key, idle]) => sources[key] && values[key] !== undefined && String(values[key]) !== idle);
    if (found.length) { for (const [key] of found) drop(values, 'inline-overflow', key, values[key]); for (const [key, idle] of found) values[key] = idle; }
    // F76: flex / grid container properties lay out the children of a flex or grid container: on an inline element they do
    // nothing (measured in Chromium, Firefox and WebKit, with element children). Recorded for the warning.
    const containerKeys = ['row-gap', 'column-gap', 'grid-template-columns', 'grid-template-rows', 'grid-template-areas', 'grid-auto-flow', 'grid-auto-rows', 'grid-auto-columns', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content', 'justify-items'];
    const idleOf = { 'row-gap': ['normal', '0', '0px'], 'column-gap': ['normal', '0', '0px'], 'grid-template-columns': ['none'], 'grid-template-rows': ['none'], 'grid-template-areas': ['none'], 'grid-auto-flow': ['row'], 'grid-auto-rows': ['auto'], 'grid-auto-columns': ['auto'], 'flex-direction': ['row'], 'flex-wrap': ['nowrap'], 'justify-content': ['normal'], 'align-items': ['normal'], 'align-content': ['normal'], 'justify-items': ['normal', 'legacy'] };
    const container = containerKeys.filter(key => sources[key] && values[key] !== undefined && !idleOf[key].includes(String(sources[key].specified ?? values[key]).trim()));
    for (const key of container) drop(values, 'inline-container', key, values[key]);
  }
  const nonscroll = value => ['visible', 'clip'].includes(value);
  const x = values['overflow-x'], y = values['overflow-y'];
  // F126: an axis the author wrote visible (or clip) next to a scrolling one on the other axis computes to auto (hidden):
  // the box becomes a scroll container on both axes (measured in Chromium, Firefox and WebKit). Kept for the warning.
  for (const [key, own, other] of [['overflow-x', x, y], ['overflow-y', y, x]]) if (!nonscroll(other) && nonscroll(own) && sources[key] && !box.pseudo)
    (values.$overflowPromoted ??= []).push({ property: key, written: own, other, source: sources[key] });
  if (!nonscroll(y)) values['overflow-x'] = x === 'visible' ? 'auto' : x === 'clip' ? 'hidden' : x;
  if (!nonscroll(x)) values['overflow-y'] = y === 'visible' ? 'auto' : y === 'clip' ? 'hidden' : y;
  // F68: input[type=hidden] { display: none !important } (UA): no author display shows it (measured in Chromium, Firefox
  // and WebKit, even with !important).
  if (!box.pseudo && box.tag === 'input' && box.inputType === 'hidden') { if (sources.display && values.display !== 'none') values.$hiddenInputDisplay = values.display; values.display = 'none'; }
  // visibility: collapse removes a table row, row group or column (measured in Chromium, Firefox and WebKit: the next row
  // moves up), and collapses a flex item in Firefox only: neither is modeled (on other boxes it is hidden).
  if (!box.pseudo && String(values.visibility) === 'collapse' && (['tr', 'tbody', 'thead', 'tfoot', 'col', 'colgroup'].includes(box.tag) || /^table-(?:row|row-group|header-group|footer-group|column|column-group)$/.test(String(values.display)) || (['flex', 'inline-flex'].includes(inherited?.display) && !inherited?.$blockFlow)))
    throw Object.assign(new Error(`${box.label}: visibility: collapse on a ${['flex', 'inline-flex'].includes(inherited?.display) ? 'flex item' : 'table row or column'} is not modeled`), { code: 'U_LAYOUT_ELEMENT' });
  // F32: ::before / ::after of an element that renders none (measured in Chromium, Firefox and WebKit: a loaded img, a
  // text input, select, textarea, iframe, video, br, canvas) are not generated whatever their content. (A broken img
  // shows them in Chromium and Firefox, and a checkbox or radio in Chromium and WebKit; those are left as they are.)
  if ((box.pseudo === 'before' || box.pseudo === 'after') && (values.content ?? 'none') !== 'none' && noPseudoHost(box)) { values.$pseudoNotRendered = values.content; values.content = 'none'; }
  // F45: text-indent and text-align-last apply to block containers. On an inline element with no child elements they do
  // nothing (measured in Chromium, Firefox and WebKit); elsewhere they move the lines, which is not modeled.
  // F106: with white-space nowrap or pre the text has no soft wrap opportunity, so word-break and line-break (which add or
  // remove some) do nothing (measured in Chromium, Firefox and WebKit on Latin, Japanese and hyphenated text). They are
  // inherited, so only a box with no element inside is judged (and warned of only where declared on it); where lines wrap
  // line-break moves the breaks (not modeled), and word-break: break-all is kept (inherited by the text inside) for the
  // layout, which lays the text out only where it was measured with it.
  for (const [key, idle] of [['word-break', 'normal'], ['line-break', 'auto']]) {
    if (values[key] === undefined) continue;
    if ([idle, 'initial', 'unset', 'revert', 'revert-layer'].includes(String(values[key]))) { delete values[key]; continue; }
    if (!box.pseudo && ['nowrap', 'pre'].includes(String(values['white-space'])) && String(values['text-wrap-mode'] ?? 'white-space') !== 'wrap' && !(box.children ?? []).some(c => !c.anonymous) && !(box.inline ?? []).length) { if (sources[key]) drop(values, 'one-line', key, values[key]); delete values[key]; }
    // word-break: break-all where lines wrap: kept; the layout lays out its text only where it was measured with it.
    else if (key === 'word-break' && values[key] === 'break-all') continue;
    else throw new Error(key === 'line-break' ? `Unsupported layout property: line-break (${values[key]} changes line breaking, which is not modeled)` : `Unsupported word-break: ${values[key]} (it changes line breaking, shaping, containing blocks or paint, which are not modeled)`);
  }
  // F84: white-space normal, nowrap and pre-line turn a tab into a space that collapses, so tab-size does nothing there
  // (measured in Chromium, Firefox and WebKit). It is inherited, so only a box with no element inside is judged.
  if (values['tab-size'] !== undefined) {
    if (['8', 'initial', 'unset', 'revert', 'revert-layer'].includes(String(values['tab-size']))) delete values['tab-size'];
    else if (!box.pseudo && ['normal', 'nowrap', 'pre-line'].includes(String(values['white-space'])) && !(box.children ?? []).some(c => !c.anonymous) && !(box.inline ?? []).length) { drop(values, 'tab-collapsed', 'tab-size', values['tab-size']); delete values['tab-size']; }
    else throw new Error(`Unsupported tab-size: ${values['tab-size']} (it changes line breaking, shaping, containing blocks or paint, which are not modeled)`);
  }
  for (const [key, idle] of [['text-indent', ['0', '0px', 'initial', 'unset', 'revert', 'revert-layer']], ['text-align-last', ['auto', 'initial', 'unset', 'revert', 'revert-layer']]]) {
    if (values[key] === undefined || idle.includes(String(values[key]))) continue;
    if (!box.pseudo && values.display === 'inline' && !(box.children ?? []).some(c => !c.anonymous) && !(box.inline ?? []).length) { drop(values, 'inline-text', key, values[key]); delete values[key]; }
    // F124: on a <select> text-indent moves only the shown option's text (twice in Firefox), never the control's size
    // (measured in Chromium, Firefox and WebKit); kept for the warning.
    else if (!box.pseudo && box.tag === 'select' && key === 'text-indent') { values.$selectIndent = values[key]; delete values[key]; }
    else throw new Error(`Unsupported ${key}: ${values[key]} (it changes line breaking, shaping, containing blocks or paint, which are not modeled)`);
  }
  // F54: clear moves a block below earlier floats; a flex or grid item has none to clear (measured in Chromium, Firefox
  // and WebKit: same layout with clear and without, a float beside it or not). In block flow floats are not modeled.
  if (values.clear !== undefined && !['none', 'initial', 'unset', 'revert', 'revert-layer'].includes(String(values.clear)) && !box.pseudo) {
    if (['flex', 'inline-flex', 'grid', 'inline-grid'].includes(inherited?.display) && !inherited?.$blockFlow && !['absolute', 'fixed'].includes(values.position)) { drop(values, 'clear-item', 'clear', values.clear); values.clear = 'none'; }
    else if (!['none', 'contents'].includes(values.display)) throw new Error(`Unsupported layout property: clear (${values.clear}: floats are not modeled)`);
  }
  // F34: multi-column properties on a flex or grid container do nothing (measured in Chromium, Firefox and WebKit: the
  // items are laid out as without them); on another box multi-column layout is not modeled.
  const multicol = ['column-count', 'column-width'].filter(key => values[key] !== undefined && !['auto', 'initial', 'unset', 'revert', 'revert-layer', 'inherit'].includes(String(values[key])));
  if (multicol.length && !box.pseudo) {
    if (['flex', 'inline-flex', 'grid', 'inline-grid'].includes(values.display)) { for (const key of multicol) drop(values, 'multicol-item', key, values[key]); for (const key of multicol) values[key] = 'auto'; }
    else if (!['none', 'contents'].includes(values.display)) throw new Error('Unsupported layout property: columns (multi-column layout is not modeled)');
  }
  // F43: min-height / max-height on a table cell do nothing (measured in Chromium, Firefox and WebKit, in auto and fixed
  // tables): the row's height rules. Dropped here (reported by the engine).
  if (!box.pseudo && ['td', 'th'].includes(box.tag) && ['ua', 'table-cell'].includes(String(values.display))) for (const [key, initial] of [['min-block-size', 'auto'], ['max-block-size', 'none']])
    if (sources[key] && !['auto', 'none', '0', '0px'].includes(String(values[key]))) { drop(values, 'cell-height', key, values[key]); values[key] = initial; }
  // F98: aspect-ratio applies to every box except inline boxes and internal table boxes (CSS Sizing 4 §5.1; measured in
  // Chromium, Firefox and WebKit on cells with text, a box or nothing, in automatic and fixed tables, and on spans): it
  // does nothing there. A replaced element (img, video, …) takes it even when inline.
  if (!box.pseudo && sources['aspect-ratio'] && String(values['aspect-ratio']) !== 'auto') {
    const tablePart = ['td', 'th', 'tr', 'thead', 'tbody', 'tfoot', 'col', 'colgroup'].includes(box.tag) && ['ua', 'table-cell', 'table-row', 'table-row-group', 'table-header-group', 'table-footer-group', 'table-column', 'table-column-group'].includes(String(values.display));
    const inline = String(values.display) === 'inline' && !['img', 'video', 'canvas', 'iframe', 'embed', 'object', 'svg', 'input', 'select', 'textarea', 'button'].includes(box.tag);
    if (tablePart || inline) { drop(values, 'aspect-ratio', 'aspect-ratio', values['aspect-ratio'], { where: tablePart ? 'table' : 'inline' }); values['aspect-ratio'] = 'auto'; }
  }
  // F60: in the collapsing border model the table has no padding (measured in Chromium, Firefox and WebKit: same layout
  // with it and without); used as 0 here, reported by the engine.
  if (!box.pseudo && (['table', 'inline-table'].includes(values.display) || (box.tag === 'table' && values.display === 'ua')) && String(values['border-collapse']) === 'collapse') {
    const pads = ['top', 'right', 'bottom', 'left'].map(side => `padding-${side}`).filter(key => sources[key] && !['0', '0px'].includes(String(values[key])));
    if (pads.length) { for (const key of pads) drop(values, 'table-padding', key, values[key]); for (const key of pads) values[key] = '0'; }
  }
  // overflow: auto or scroll on a table is used as visible (F31, measured in Chromium, Firefox and WebKit): the table
  // grows to its content and never scrolls. Mixed with hidden or clip on the other axis (not measured), it is left as is.
  if (!box.pseudo && (['table', 'inline-table'].includes(values.display) || (box.tag === 'table' && values.display === 'ua')) && ['overflow-x', 'overflow-y'].every(key => ['auto', 'scroll'].includes(String(values[key]))))
    for (const key of ['overflow-x', 'overflow-y']) { if (sources[key] || sources.overflow) (values.$tableOverflow ??= {})[key] = values[key]; values[key] = 'visible'; }
  // A logical side was taken as ltr; in an rtl box cascade again with the sides flipped.
  if (!rtl && flipped && values.direction === 'rtl') return computeStyle(rules, box, active, inherited, {spend, state, rtl: true});
  if (!box.pseudo && box.tag === 'svg' && svgPointerEvents.has(String(values['pointer-events'])))
    throw new Error(`Unsupported pointer-events: ${values['pointer-events']} on an svg (which of its painted parts take the pointer is not modeled)`);
  if (unmodeled.length) values.$unmodeled = unmodeled;
  if (droppedImages.length) values.$droppedImage = droppedImages;
  if (paintUnmodeled) values.$paintUnmodeled = true;
  return values;
}
