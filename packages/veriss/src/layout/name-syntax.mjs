// Names the browser does not know, and the known name each is a typo of (checklist F136, F138).
// A name is called a typo only when it is near a known one (edit distance 2 at most): a name far from every known one
// may be newer than the data, so it is left alone.
import data from 'css-tree/definition-syntax-data';

const properties = new Set(Object.keys(data.properties));

// Media Queries 4 and 5, and the deprecated device-* features browsers still evaluate. A feature in a specification that
// no browser implements (prefers-reduced-data) is known: writing it is not a typo.
const rangeFeatures = ['width', 'height', 'aspect-ratio', 'resolution', 'color', 'color-index', 'monochrome', 'device-width', 'device-height', 'device-aspect-ratio', 'horizontal-viewport-segments', 'vertical-viewport-segments'];
const discreteFeatures = ['orientation', 'scan', 'grid', 'update', 'overflow-block', 'overflow-inline', 'color-gamut', 'pointer', 'hover', 'any-pointer', 'any-hover',
  'prefers-reduced-motion', 'prefers-reduced-transparency', 'prefers-contrast', 'prefers-color-scheme', 'prefers-reduced-data', 'forced-colors', 'inverted-colors',
  'scripting', 'display-mode', 'dynamic-range', 'video-dynamic-range', 'video-color-gamut', 'environment-blending', 'device-posture', 'nav-controls', 'shape'];
const mediaFeatures = new Set([...discreteFeatures, ...rangeFeatures, ...rangeFeatures.flatMap(f => [`min-${f}`, `max-${f}`])]);

function distance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  // Optimal string alignment: a swap of two neighbouring letters (widht) is one edit.
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}

function nearest(name, known) {
  if (known.has(name) || name.startsWith('-') || name.length < 4) return null;
  let best = null, bestDistance = 3;
  for (const candidate of known) { const d = distance(name, candidate); if (d < bestDistance) { best = candidate; bestDistance = d; } }
  return best;
}

/** The property a misspelled property name was meant to be, or null when the name is known, vendor or custom, or far from every property. */
export const propertyTypo = name => nearest(name.toLowerCase(), properties);
/** The media feature a misspelled feature name was meant to be, or null. */
export const mediaFeatureTypo = name => nearest(name.toLowerCase(), mediaFeatures);

const nonFeatures = new Set(['and', 'or', 'not', 'only']);
/** The feature names a media query writes: `(name: v)`, `(name)` and the range forms `(name > v)`, `(v < name <= v)`. */
export function mediaFeatureNames(params) {
  const names = [];
  for (const [, inner] of params.matchAll(/\(([^()]*)\)/g)) {
    const named = /^\s*([a-z-][\w-]*)\s*(?::|$)/i.exec(inner);
    if (named) { names.push(named[1].toLowerCase()); continue; }
    for (const side of inner.split(/<=|>=|<|>|=/)) { const m = /^\s*([a-z-][\w-]*)\s*$/i.exec(side); if (m && !nonFeatures.has(m[1].toLowerCase())) names.push(m[1].toLowerCase()); }
  }
  return names;
}
