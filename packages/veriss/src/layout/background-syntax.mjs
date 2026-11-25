// F115: background shorthands the browser drops (CSS Backgrounds 3 §3.10; measured in Chromium, Firefox and WebKit): a
// color in any layer but the last, an unquoted url() with white space in it, a "/" (the size) with no position before
// it, and a size keyword (cover, contain) without the "/". var() is not judged. isColor says whether a token is a color.
const split = (text, at) => { const out = []; let cur = '', depth = 0, quote = null; for (const ch of text) { if (quote) { cur += ch; if (ch === quote) quote = null; continue; } if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; } if (ch === '(') depth++; if (ch === ')') depth--; if (depth === 0 && at.test(ch)) { out.push(cur); cur = ''; continue; } cur += ch; } out.push(cur); return out; };
const position = /^(?:left|right|top|bottom|center|0|[+-]?(?:\d+\.?\d*|\.\d+)(?:px|%|em|rem|vw|vh|vmin|vmax|ch|ex|cm|mm|in|pt|pc)|calc\(.*\))$/i;
/** Why the background shorthand is invalid, or null (valid, or not judged). */
export function backgroundProblem(value, isColor) {
  const text = String(value).trim();
  if (!text || /var\(|env\(|attr\(/i.test(text) || /^(?:inherit|initial|unset|revert|revert-layer)$/i.test(text)) return null;
  const unquoted = /url\(\s*([^"')\s][^)]*?\s[^)]*)\)/i.exec(text);
  if (unquoted) return `url(${unquoted[1]}) has white space in an unquoted URL (quote it, or write %20)`;
  const layers = split(text, /,/).map(l => l.trim());
  for (const [i, layer] of layers.entries()) {
    const tokens = split(layer.replace(/\//g, ' / '), /\s/).filter(Boolean);
    if (i < layers.length - 1) { const color = tokens.find(t => isColor(t)); if (color) return `the color ${color} is in layer ${i + 1} of ${layers.length}; only the last layer takes a color`; }
    const slash = tokens.indexOf('/');
    if (slash !== -1 && !(slash > 0 && position.test(tokens[slash - 1]))) return 'the size after "/" needs a position before the "/" (center / cover)';
    const size = tokens.findIndex(t => /^(?:cover|contain)$/i.test(t));
    if (size !== -1 && (slash === -1 || size < slash)) return `${tokens[size]} is a size, written after a position and "/" (center / ${tokens[size]})`;
  }
  return null;
}

// A background-image layer must be an <image> (CSS Images 3/4): url(), image-set(), a gradient, image(), cross-fade(),
// element(), paint() — or none. A bare URL without url() or a quoted string is not one: the browser drops the whole
// declaration (measured in Chromium, Firefox and WebKit: background-image: https://… and "x.png" both leave
// getComputedStyle at the earlier value). var(), env() and attr() are not judged. STRAY_COLON marks a ':' the parser
// stage replaced (see tolerateStrayColons in css.mjs).
export const STRAY_COLON = '';
const imageFunction = /^(?:url|src|(?:-webkit-)?image-set|image|cross-fade|-webkit-cross-fade|element|-moz-element|paint|(?:-webkit-|-moz-|-o-)?(?:repeating-)?(?:linear|radial|conic)-gradient|-webkit-gradient)\(/i;
/** Why a background-image value is not a list of <image>s (or none), or null. */
export function imageProblem(value) {
  const text = String(value).replaceAll(STRAY_COLON, ':').trim();
  if (!text || /var\(|env\(|attr\(/i.test(text) || /^(?:inherit|initial|unset|revert|revert-layer)$/i.test(text)) return null;
  const layers = split(text, /,/).map(l => l.trim());
  for (const layer of layers) {
    if (/^none$/i.test(layer)) continue;
    if (imageFunction.test(layer) && layer.endsWith(')') && split(layer, /\s/).filter(Boolean).length === 1) continue;
    return imageWhy(layer);
  }
  return null;
}
const imageWhy = token => /^["']/.test(token) ? `${token} is a quoted string, not an image` : /[:/.]/.test(token) ? `${token} is a bare URL, not an image (a URL needs url())` : `${token} is not an image`;
/** The URL to suggest in url("…") for an invalid image token. */
export const imageURL = token => String(token).replaceAll(STRAY_COLON, ':').trim().replace(/^(["'])(.*)\1$/, '$2');
// In the background shorthand, the parts the shorthand never takes that look like an image: a quoted string, or a
// bare URL (with a scheme, a path or a file extension).
/** The token of a background shorthand that was meant as an image but is not one, or null. */
export function shorthandImageToken(value) {
  const text = String(value).replaceAll(STRAY_COLON, ':').trim();
  if (/var\(|env\(|attr\(/i.test(text)) return null;
  for (const layer of split(text, /,/)) for (const token of split(layer, /\s/).filter(Boolean)) {
    if (/^["']/.test(token)) return token;
    // A "/" glued to the size ("center /cover", "0 0 /50% auto") separates the position from the size: not a path.
    if (/^\/(?:cover|contain|auto|[+-]?(?:\d+\.?\d*|\.\d+)(?:[a-z]+|%)?|calc\(.*\))$/i.test(token)) continue;
    if (/^[a-z][\w+.-]*:\/\//i.test(token) || /^\.{0,2}\/[^\s/]/.test(token) || /\.(?:png|jpe?g|gif|webp|avif|svg)(?:[?#].*)?$/i.test(token)) return token;
  }
  return null;
}
