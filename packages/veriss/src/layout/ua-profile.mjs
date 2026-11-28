// User-agent style profiles for form controls, per browser engine and platform, measured with tools/css-baseline.mjs
// (evals/results/css-baseline): Chromium 153, Firefox 157 and WebKit 27.2 on Linux; Chromium 156, Firefox 157 and
// WebKit 27.2 on macOS 26 (all Playwright 1.64.1). A profile is the "initial condition" the layout of an unstyled control
// starts from: its padding, border, margins, colors and font.
//
//   ua: 'chromium' | 'firefox' | 'webkit'                 platform-agnostic: a value only where Linux and macOS agree
//   ua: 'firefox-linux' | 'firefox-macos' | 'webkit-linux' | 'webkit-macos'   one platform's measured values
//   ua: { base: 'webkit', button: { padding: [...] } }    a profile with some values replaced (your own baseline)
//
// WebKit's controls differ by platform (macOS: text fields and textareas padding 2px 5px, buttons 0 6px 1px, the 11px
// system-ui control font), so plain 'webkit' keeps those values 'ua' (not known): the geometry that depends on them is
// Unknown, never verified on a value one platform does not have. Firefox differs only in its control font. Chromium
// measured the same on both platforms, so it has one profile.
//
// numberField is a number input's box (macOS WebKit: a 2px inline-end padding beside its spin buttons).
//
// Without the ua option the engine keeps its historical behaviour: the Chromium button and range boxes are modeled,
// and the other controls' UA padding, border and margins are not known ('ua'). Sides are [top, right, bottom, left].
const px = v => `${v}px`;
const sides = (t, r = t, b = t, l = r) => [px(t), px(r), px(b), px(l)];

const chromium = {
  button: { padding: sides(1, 6), border: sides(2), background: '#efefef', color: '#000000', darkBackground: '#6b6b6b', darkColor: '#ffffff' },
  textField: { padding: sides(1, 2), border: sides(2) },
  numberField: { padding: sides(1, 2), border: sides(2) },
  textarea: { padding: sides(2), border: sides(1) },
  select: { padding: sides(0), border: sides(1) },
  checkbox: { margin: sides(3, 3, 3, 4), size: 13 },
  radio: { margin: sides(3, 3, 0, 5), size: 13 },
  range: { margin: sides(2) },
  controlFont: { family: 'Arial', size: '13.3333px', textareaFamily: 'monospace', textareaSize: '13.3333px' },
  placeholder: 'rgb(117, 117, 117)',
  focusRing: '1px',
  nativePadding: false,
};
const firefoxLinux = {
  button: { padding: sides(1, 4), border: sides(2), background: 'rgb(233, 233, 237)', color: '#000000' },
  textField: { padding: sides(1, 2), border: sides(2) },
  numberField: { padding: sides(1, 2), border: sides(2) },
  textarea: { padding: sides(2), border: sides(2) },
  select: { padding: sides(1, 4), border: sides(2) },
  checkbox: { margin: sides(3, 3, 3, 4), size: 14 },
  radio: { margin: sides(3, 3, 0, 5), size: 14 },
  range: { margin: sides(2) },
  controlFont: { family: 'sans-serif', size: '13.3281px', textareaFamily: 'monospace', textareaSize: '12px' },
  placeholder: 'rgba(0, 0, 0, 0.54)',
  focusRing: '1px',
  nativePadding: false,
};
const firefoxMacos = { ...firefoxLinux, controlFont: { family: '-apple-system', size: '13.3281px', textareaFamily: 'monospace', textareaSize: '13px' } };
const webkitLinux = {
  button: { padding: sides(2, 6, 3, 6), border: sides(2), background: 'rgb(192, 192, 192)', color: 'rgba(0, 0, 0, 0.8)' },
  textField: { padding: sides(1), border: sides(2) },
  numberField: { padding: sides(1), border: sides(2) },
  textarea: { padding: sides(2), border: sides(1) },
  select: { padding: sides(0), border: sides(1) },
  checkbox: { margin: sides(3, 2), size: 12 },
  radio: { margin: sides(3, 2), size: 12 },
  range: { margin: sides(2) },
  controlFont: { family: '-webkit-standard', size: '16px', textareaFamily: '-webkit-standard', textareaSize: '16px' },
  placeholder: 'rgb(169, 169, 169)',
  focusRing: '3px',
  nativePadding: false,
};
const webkitMacos = {
  button: { padding: sides(0, 6, 1, 6), border: sides(2), background: 'rgb(192, 192, 192)', color: 'rgba(0, 0, 0, 0.847)' },
  textField: { padding: sides(2, 5), border: sides(2) },
  numberField: { padding: sides(2, 2, 2, 5), border: sides(2) },
  textarea: { padding: sides(2, 5), border: sides(1) },
  select: { padding: sides(0), border: sides(1) },
  checkbox: { margin: sides(3, 2), size: 12 },
  radio: { margin: sides(3, 2), size: 12 },
  range: { margin: sides(2) },
  controlFont: { family: 'system-ui', size: '11px', textareaFamily: 'system-ui', textareaSize: '11px' },
  placeholder: 'rgb(169, 169, 169)',
  focusRing: '3px',
  // The native (aqua) controls: the field, number and textarea padding above is the one at the UA control font (11px):
  // it scales with font-size (floor(size / 4) floor(size / 2): 4px 8px at 16px, 7px 15px at 30px). appearance: none
  // gives 1px, 2px and the button 2px 6px 3px; every other appearance keeps the native padding. So an author font-size,
  // or appearance: none, leaves the sides the author does not set unknown.
  nativePadding: true,
};

/** The value two profiles share, leaf by leaf: a leaf they disagree on (or one has not) is 'ua', not known. */
export function agreeingProfile(a, b) {
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) return a.map((v, i) => agreeingProfile(v, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b))
    return Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => k in a && k in b).map(k => [k, agreeingProfile(a[k], b[k])]));
  return a === b ? a : 'ua';
}

export const uaProfiles = {
  chromium,
  firefox: agreeingProfile(firefoxLinux, firefoxMacos),
  webkit: agreeingProfile(webkitLinux, webkitMacos),
  'firefox-linux': firefoxLinux,
  'firefox-macos': firefoxMacos,
  'webkit-linux': webkitLinux,
  'webkit-macos': webkitMacos,
};
/** The platform-agnostic profiles: the browsers a check covers by default (--ua chromium,firefox,webkit). */
export const browserUAs = ['chromium', 'firefox', 'webkit'];
/** The measured platforms of each profile id (chromium measured the same on both). */
export const uaPlatforms = { chromium: ['chromium'], firefox: ['firefox-linux', 'firefox-macos'], webkit: ['webkit-linux', 'webkit-macos'] };
/** The engine a profile id names: 'webkit-macos' → 'webkit'. */
export const uaEngineOf = id => String(id).split('-')[0];

const merge = (base, over) => {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = merge(base?.[k], v);
  return out;
};

/** The profile for an ua option (a name, or { base, ...overrides }), or null for the engine's historical defaults. */
export function resolveUAProfile(ua) {
  if (ua === undefined || ua === null) return null;
  if (typeof ua === 'string') {
    if (!uaProfiles[ua]) throw new Error(`Invalid layout options: ua must be one of ${Object.keys(uaProfiles).join(', ')} (or { base, ... })`);
    return { name: ua, engine: uaEngineOf(ua), ...uaProfiles[ua] };
  }
  if (typeof ua !== 'object') throw new Error('Invalid layout options: ua must be a browser name or { base, ... }');
  const { base = 'chromium', ...overrides } = ua;
  if (!uaProfiles[base]) throw new Error(`Invalid layout options: ua.base must be one of ${Object.keys(uaProfiles).join(', ')}`);
  return { ...merge(uaProfiles[base], overrides), name: `${base} (with overrides)`, engine: uaEngineOf(base) };
}
