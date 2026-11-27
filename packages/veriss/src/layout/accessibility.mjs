// Static checks that combine DOM facts (roles, names, aria-hidden, tree and
// paint order) with the cascade (color, visibility, pointer-events, opacity,
// display) and the proved symbolic geometry. Opt-in through
// `options.accessibility`. Each rule is decided over the whole viewport
// domain; what the model cannot decide is Unknown, never a guessed pass.
//
//   accessible-name  → E_A11Y_NAME              button/link with no rendered text and no name attribute
//   text-contrast    → E_A11Y_CONTRAST          WCAG 2.2 SC 1.4.3 (AA) or 1.4.6 (AAA)
//   occluded-target  → E_A11Y_OCCLUDED          a box painted later, hit-testable, covers part of a target
//   invisible-blocker → E_A11Y_INVISIBLE_BLOCKER a box that paints nothing is the top hit-test target over a control that shows (replaces E_A11Y_OCCLUDED for the pair)
//   click-trap       → E_A11Y_CLICK_TRAP / U_A11Y_CLICK_TRAP  a layer covers page controls for good and has no control that shows and can be operated (Unknown: it shows a frame)
//   target-overlap   → E_A11Y_TARGET_OVERLAP    two interactive targets intersect
//   visual-order     → W_A11Y_ORDER             a later sibling is placed visually before an earlier one (SC 1.3.2)
//   hidden-focusable → E_A11Y_HIDDEN_FOCUSABLE  a rendered focusable element inside aria-hidden
//   empty-heading    → E_A11Y_EMPTY_HEADING     an exposed h1–h6 with no rendered text and no name attribute
//   heading-order    → W_A11Y_HEADING_ORDER     a skipped level among the headings that render (per media region)
//   nested-interactive → E_A11Y_NESTED_INTERACTIVE a rendered button/link inside another
//   duplicate-id     → E_A11Y_DUPLICATE_ID      two elements share an id (DOM, every width)
//   aria-reference   → E_A11Y_REFERENCE         aria-labelledby/describedby/controls names a missing id
//   positive-tabindex → W_A11Y_POSITIVE_TABINDEX tabindex > 0 reorders focus away from the DOM
//   multiple-main    → W_A11Y_MULTIPLE_MAIN     more than one main element renders at once
//   scrollable-region-focusable → E_A11Y_SCROLL_FOCUS  content overflows a scroll container that nothing focusable reaches
//   reflow           → E_A11Y_REFLOW            the page scrolls horizontally at 320 CSS px or narrower (SC 1.4.10)
//   focus-obscured   → E_A11Y_FOCUS_OBSCURED    a focusable box entirely covered by a later painted box (SC 2.4.11)
//   focus-area       → E_A11Y_FOCUS_AREA        a visible focusable box with a zero-size border box
//   pointer-disabled → E_A11Y_POINTER_DISABLED  a visible button/link that pointer-events: none makes unclickable
//   small-text       → W_A11Y_SMALL_TEXT        rendered text below 12px
//   visual-presentation → W_A11Y_LINE_LENGTH   (AAA) wrapping text with lines longer than 80 characters (SC 1.4.8)
//   image-alt        → E_A11Y_IMAGE_ALT         a rendered img without alt (alt="" marks it decorative)
//   form-label       → E_A11Y_LABEL             a field with no label, aria name or title (W_A11Y_PLACEHOLDER_LABEL: placeholder only)
//   label-for        → E_A11Y_LABEL_FOR         label[for] names no labelable element
//   list-structure   → E_A11Y_LIST              a rendered li outside ul/ol, or a list child that is not li
//   radio-group      → W_A11Y_RADIO_GROUP       same-name radios rendered outside a fieldset or radiogroup/group role
//   landmark-name    → W_A11Y_LANDMARK_NAME     two navigation landmarks render at once and not both are named
//   role-valid       → E_A11Y_ROLE              a role token that is not a WAI-ARIA role
//   interactive-role-focusable → E_A11Y_ROLE_FOCUS a rendered element with an interactive role that cannot take focus
//   link-in-text-block → E_A11Y_LINK_IN_TEXT    a link inside text with no underline and under 3:1 against the text (SC 1.4.1)
//   table-headers    → E_A11Y_TABLE_HEADERS     a table's th exist but none renders where data cells do (W_A11Y_TABLE_HEADERS: no th at all)
//   td-headers       → E_A11Y_TABLE_HEADERS_REF td/th headers= names no th of the same table
//   fieldset-name    → W_A11Y_FIELDSET_NAME     a rendered fieldset with no legend or name
//   label-in-name    → E_A11Y_LABEL_IN_NAME     an aria-label that does not contain the control's visible text (SC 2.5.3)
//   link-purpose     → W_A11Y_LINK_PURPOSE      two links with the same name to different hrefs render together
//   link-text        → W_A11Y_LINK_TEXT         generic link text (click here, read more, こちら, …)
//   role-parent / role-children → E_A11Y_ROLE_PARENT / E_A11Y_ROLE_CHILDREN  required ARIA context (WAI-ARIA 1.2)
//   role-attr        → E_A11Y_ROLE_ATTR         a required state for the role (aria-checked, aria-valuenow, …)
//   aria-attr / aria-value → E_A11Y_ARIA_ATTR / E_A11Y_ARIA_VALUE  unknown aria-* names, invalid true/false/mixed values
//   presentation-conflict → E_A11Y_PRESENTATION_CONFLICT role none/presentation on a focusable or ARIA-labelled element
//   empty-th         → E_A11Y_EMPTY_TH          a rendered th with no visible text or name
//   redundant-alt    → W_A11Y_REDUNDANT_ALT     an image alt that repeats the text next to it
//   title-only       → W_A11Y_TITLE_ONLY        a field named only by its title
//   input-button-name → E_A11Y_INPUT_BUTTON_NAME input type=button with no value
//   autocomplete     → E_A11Y_AUTOCOMPLETE      tokens outside the HTML autofill grammar (SC 1.3.5)
//   scope            → E_A11Y_SCOPE             scope on a td, or not row/col/rowgroup/colgroup
//   html-lang / lang-valid → E_A11Y_HTML_LANG / E_A11Y_LANG_VALID  a document without lang, or an invalid language tag (SC 3.1.1)
//   forced-colors    → W_A11Y_FORCED_COLORS / W_A11Y_FORCED_COLORS_FOCUS  a control whose only edge (or focus indicator) is its background or box-shadow (no border, no outline): forced colors
//                      (Windows high contrast) replace the background and drop the shadow, so the control loses its shape
//   meta-viewport    → E_A11Y_META_VIEWPORT     the viewport meta tag disables zoom (user-scalable=no, or maximum-scale below 2) (SC 1.4.4)
//   touch-zoom       → E_A11Y_TOUCH_ZOOM        touch-action on html or body leaves out pinch-zoom (none, or pan-* only) (SC 1.4.4)
//   page-h1 / region / bypass → W_A11Y_PAGE_H1 / W_A11Y_REGION / W_A11Y_BYPASS  page roots: no rendered h1, text outside landmarks, no skip link before navigation
//   landmark-top-level / duplicate-landmark → W_A11Y_LANDMARK_TOP_LEVEL / W_A11Y_DUPLICATE_LANDMARK
//   p-as-heading     → W_A11Y_P_AS_HEADING      a paragraph styled as a heading (bold or larger) before ordinary text
//   orientation      → E_A11Y_ORIENTATION       main content only renders in one orientation (SC 1.3.4)
//   focus-visible    → E_A11Y_FOCUS_VISIBLE     focus shows no change: outline removed, no box-shadow/color/background change (SC 2.4.7)
//   text-spacing     → E_A11Y_TEXT_SPACING      clipped text that no longer fits at line-height 1.5 × font size (SC 1.4.12)
//   state-contrast   → E_A11Y_STATE_CONTRAST    text contrast in the :hover or :focus paint of a control
//   frame-title      → E_A11Y_FRAME_TITLE       a rendered iframe without a title or name (SC 4.1.2)
//   video-caption    → E_A11Y_VIDEO_CAPTION     a rendered video without a captions/subtitles track (SC 1.2.2)
//   autoplay-audio   → W_A11Y_AUTOPLAY_AUDIO    autoplaying media that is not muted (SC 1.4.2)
//   hover-only       → E_A11Y_HOVER_ONLY        a control hidden (opacity 0 / visibility hidden) that :hover reveals and focus does not
//   clickable-look   → W_A11Y_CLICK_LOOK        cursor: pointer set on an element that is neither focusable nor interactive (SC 2.1.1)
//   list-style-semantics → W_A11Y_LIST_STYLE   ul/ol with list-style-type: none and no role=list (WebKit drops the list role)
//   motion           → W_A11Y_MOTION            an animation running over 5s that prefers-reduced-motion: reduce does not stop (SC 2.2.2, 2.3.3)
//                    → W_A11Y_TRANSITION_MOTION  a transition moving the box over 5s that reduce leaves running (SC 2.3.3)
//   blink            → E_A11Y_BLINK             rendered marquee/blink (SC 2.2.2)
//   definition-list  → E_A11Y_DL                dl children other than dt/dd/div groups, or dt/dd outside dl
//   accesskeys       → W_A11Y_ACCESSKEY         the same accesskey on more than one element
//   server-side-image-map → W_A11Y_ISMAP       img ismap needs a pointer (SC 2.1.1)
//   aria-hidden-body → W_A11Y_ARIA_HIDDEN_BODY  aria-hidden="true" on body (ignored by Chromium; hides the document elsewhere)
//   input-image-alt  → E_A11Y_INPUT_IMAGE_ALT    input type=image without alt (or another name)
//   fragment-target  → E_A11Y_FRAGMENT          an in-page link (#id) whose target is missing, or not rendered where the link is
//   page-main        → W_A11Y_NO_MAIN           a page where no main landmark renders
//   icon-font-name   → E_A11Y_ICON_NAME         a control named only by generated icon-font glyphs (Private Use Area)
//   generated-name   → W_A11Y_GENERATED_NAME    a control named only by CSS generated content
//   page-start-unreachable → E_A11Y_PAGE_START_UNREACHABLE in-flow content above the page's top (or left of its left): the page never scrolls there
//   behind-background → E_A11Y_BEHIND_BACKGROUND text in a negative z-index layer painted under an ancestor's background
//   scroll-start-unreachable → E_A11Y_SCROLL_START_UNREACHABLE content before a scroll container's start edge (it never scrolls there)
//   scroll-end-covered → E_A11Y_SCROLL_END_COVERED the end of a scroll container's content stays under a box painted over it at every scroll offset
//   focus-clipped    → E_A11Y_FOCUS_CLIPPED     a focusable box entirely outside an overflow: clip ancestor (it cannot scroll into view)
//   hidden-overridden → W_A11Y_HIDDEN_OVERRIDDEN an element with the hidden attribute that renders (author display overrides [hidden])
//   state-mismatch   → W_A11Y_STATE_MISMATCH    aria-expanded (or a tab's aria-selected) disagrees with whether its aria-controls target renders
//   focus-transparent → W_A11Y_FOCUS_TRANSPARENT a focusable box that stays at opacity 0 (itself or an ancestor) when focused: its own focus indicator cannot show
//   error-message    → W_A11Y_ERROR_HIDDEN / W_A11Y_INVALID_NO_MESSAGE  aria-invalid="true" whose aria-errormessage does not render, or with no message at all (SC 3.3.1)
//   modal-background → W_A11Y_MODAL_BACKGROUND  focusable content outside a rendered aria-modal dialog that is neither inert nor aria-hidden
//   inert-shown      → W_A11Y_INERT_SHOWN       an inert control with nothing painted over it: it looks clickable but takes no click
//   safe-area-target → W_A11Y_SAFE_AREA_TARGET  a fixed control in the device's safe area on a viewport-fit=cover page (option safeArea)
//   hinge-target     → W_A11Y_HINGE_TARGET      a control under a dual-screen hinge (option hinge)
//   target-offscreen → E_A11Y_TARGET_OFFSCREEN / W_A11Y_TARGET_PARTLY_OFFSCREEN  a control in a fixed box (partly) outside the viewport
//   new-window       → W_A11Y_NEW_WINDOW        a link opening a new window/tab (target=_blank) whose name does not say so (G201)
//   form-submit      → W_A11Y_FORM_SUBMIT       a form with fields but no submit button (SC 3.2.2)
//   native-aria-conflict → W_A11Y_NATIVE_ARIA_CONFLICT an ARIA state that contradicts the native one (required/disabled/checked), which Chromium announces instead
//   target-size      → E_A11Y_TARGET_SIZE       SC 2.5.8: under 24px, and its 24px circle meets another target or undersized circle
//   icon-contrast    → E_A11Y_ICON_CONTRAST     the svg icon of a control without text under 3:1 against its background (SC 1.4.11)
//   label-pointer    → W_A11Y_LABEL_POINTER     a field's label with pointer-events: none (clicks pass through it)
//   caret-hidden     → W_A11Y_CARET_HIDDEN      a text field whose caret is transparent or its background color
//   contents-focus   → E_A11Y_CONTENTS_FOCUS    a link, button or tabindex element with display: contents (drawn by its children; Tab skips it)
import { parseColor, over, luminance, contrastRatio, opaqueValue, backdrop as backdropOf } from '../color/index.mjs';
export { parseColor, contrastRatio } from '../color/index.mjs';
import { animationsOf, transitionsOf } from './css.mjs';
import { exact, number } from './linear.mjs';
import { scalar, sum, diff, times, sample, clip, serialize, evaluate, width as domainWidth, height } from './region.mjs';
import { languageTag } from './text-font.mjs';
import { q, add, mul, cmp, div } from './linear.mjs';
import { intersect } from './integrity.mjs';
import { createContrast, unplacedContrast, large } from '../rules/contrast.mjs';

export const accessibilityRules = ['accessible-name', 'text-contrast', 'occluded-target', 'target-overlap', 'visual-order', 'hidden-focusable',
  'empty-heading', 'heading-order', 'nested-interactive', 'duplicate-id', 'aria-reference', 'positive-tabindex', 'multiple-main',
  'scrollable-region-focusable', 'reflow', 'focus-obscured', 'focus-area', 'pointer-disabled', 'small-text', 'target-size', 'image-alt', 'form-label', 'label-for', 'list-structure', 'radio-group', 'landmark-name', 'role-valid', 'interactive-role-focusable', 'link-in-text-block', 'table-headers', 'td-headers', 'fieldset-name', 'label-in-name', 'link-purpose', 'link-text',
  'role-parent', 'role-children', 'role-attr', 'aria-attr', 'aria-value', 'presentation-conflict', 'empty-th', 'redundant-alt', 'title-only', 'input-button-name', 'autocomplete', 'scope',
  'html-lang', 'lang-valid', 'meta-viewport', 'touch-zoom', 'forced-colors', 'page-h1', 'region', 'bypass', 'landmark-top-level', 'duplicate-landmark', 'p-as-heading', 'orientation', 'focus-visible', 'text-spacing', 'state-contrast', 'frame-title', 'video-caption', 'autoplay-audio', 'hover-only',
  'clickable-look', 'list-style-semantics', 'motion', 'blink', 'definition-list', 'accesskeys', 'server-side-image-map', 'aria-hidden-body',
  'color-only-state', 'input-image-alt', 'fragment-target', 'page-main', 'icon-font-name', 'generated-name', 'focus-clipped', 'hidden-overridden', 'state-mismatch', 'focus-transparent', 'error-message', 'modal-background', 'inert-shown', 'safe-area-target', 'hinge-target', 'target-offscreen', 'new-window', 'form-submit', 'native-aria-conflict', 'focus-semantics', 'focus-offscreen', 'focus-scrolled-under', 'fixed-hides-content', 'fixed-covers-part', 'text-start-obscured', 'page-clipped', 'image-fallback-contrast', 'visual-presentation', 'focus-contrast', 'field-boundary', 'placeholder-contrast', 'checked-indicator', 'focus-clipped-away', 'fragment-under-bar', 'flash', 'text-obscured', 'focus-appearance', 'focus-ring-clipped', 'hidden-control', 'select-indicator', 'live-hidden', 'tabindex-removed', 'contents-focus', 'icon-contrast', 'caret-hidden', 'label-pointer', 'bar-covered', 'bar-transparent', 'autofocus', 'scroll-end-covered', 'scroll-start-unreachable', 'behind-background', 'page-start-unreachable', 'invisible-blocker', 'click-trap'];

// Usefulness tiers (docs/accessibility-rule-evaluation.md). core: depends on the CSS result and is proved over the
// viewport region and states; dom: decided by the DOM alone (lint overlaps); heuristic: a Technique or a guess that
// legitimate designs can trip; legacy: rare or obsolete markup. profile 'core' keeps core and dom only.
const tierLists = {
  core: ['invisible-blocker', 'click-trap', 'inert-shown', 'safe-area-target', 'hinge-target', 'target-offscreen', 'page-start-unreachable', 'behind-background', 'scroll-start-unreachable', 'scroll-end-covered', 'bar-transparent', 'bar-covered', 'live-hidden', 'select-indicator', 'hidden-control', 'focus-ring-clipped', 'focus-appearance', 'text-obscured', 'flash', 'fragment-under-bar', 'focus-clipped-away', 'checked-indicator', 'placeholder-contrast', 'field-boundary', 'focus-contrast', 'visual-presentation', 'fixed-hides-content', 'fixed-covers-part', 'text-start-obscured', 'page-clipped', 'image-fallback-contrast', 'focus-scrolled-under', 'focus-offscreen', 'text-contrast', 'state-contrast', 'link-in-text-block', 'target-size', 'target-overlap', 'occluded-target', 'reflow', 'focus-obscured', 'focus-clipped', 'focus-transparent', 'focus-visible', 'focus-area', 'hidden-focusable', 'hover-only', 'pointer-disabled', 'scrollable-region-focusable', 'text-spacing', 'accessible-name', 'form-label', 'label-in-name', 'empty-heading', 'empty-th', 'icon-font-name', 'generated-name', 'hidden-overridden', 'state-mismatch', 'modal-background', 'fragment-target', 'orientation', 'multiple-main', 'heading-order'],
  heuristic: ['color-only-state', 'visual-order', 'p-as-heading', 'link-text', 'link-purpose', 'new-window', 'redundant-alt', 'title-only', 'form-submit', 'clickable-look', 'list-style-semantics', 'small-text', 'region', 'bypass', 'page-h1', 'page-main', 'landmark-name', 'landmark-top-level', 'duplicate-landmark', 'radio-group', 'fieldset-name', 'motion', 'autoplay-audio'],
  legacy: ['blink', 'server-side-image-map', 'accesskeys', 'aria-hidden-body'],
};
export const ruleTier = rule => Object.entries(tierLists).find(([, list]) => list.includes(rule))?.[0] ?? 'dom';
export const accessibilityProfiles = { all: () => true, core: rule => ['core', 'dom'].includes(ruleTier(rule)) };

/** The paint facts of one computed style, kept on each geometry row. */
export function paintFacts(style) {
  // Visually hidden (sr-only): clipped to nothing, or at most 1px tall hiding its overflow. Read, not seen.
  const hiddenVisually = style['clip-path'] === 'empty' || style.clip === 'empty' || (['hidden', 'clip'].includes(style['overflow-x']) && /^\d+(?:\.\d+)?px$/.test(String(style['block-size'])) && Number(String(style['block-size']).slice(0, -2)) <= 1);
  // (paintUnmodeled: a rule the analysis cannot read may repaint this box: its colors are not judged.)
  return { ...(style.$paintUnmodeled ? { paintUnmodeled: true } : {}), ...(style.$droppedImage ? { droppedImage: style.$droppedImage } : {}), ...(style.$iconPaint !== undefined ? { iconPaint: style.$iconPaint } : {}), ...(hiddenVisually ? { hiddenVisually: true } : {}), caretColor: style['caret-color'], objectFit: style['object-fit'], scrollBehavior: style['scroll-behavior'], touchAction: style['touch-action'], color: style.color, backgroundColor: style['background-color'], backgroundImage: style['background-image'], opacity: style.opacity,
    visibility: style.visibility, pointerEvents: style['pointer-events'], fontSize: style['font-size'], fontStyle: style['font-style'], fontWeight: style['font-weight'], position: style.position, decoration: style['text-decoration-line'],
    isolation: style.isolation, transform: style.transform, ...(style['transform-style'] === 'preserve-3d' && style.display !== 'inline' ? { preserve3d: true } : {}), backdropFilter: style['backdrop-filter'] ?? 'none', filter: style.filter ?? 'none', ...(style.$stacks ? { stacks: true } : {}), willChange: style['will-change'] ?? 'auto', scrollMargin: { top: style['scroll-margin-top'], bottom: style['scroll-margin-bottom'] }, scrollPadding: { top: style['scroll-padding-top'], bottom: style['scroll-padding-bottom'] }, outlineStyle: style['outline-style'], outlineWidth: style['outline-width'], outlineColor: style['outline-color'], outlineOffset: style['outline-offset'], clippedAway: style['clip-path'] === 'empty' || (style.clip === 'empty' && ['absolute', 'fixed'].includes(style.$fixed ? 'fixed' : style.position)), borderColors: { top: style['border-top-color'], right: style['border-right-color'], bottom: style['border-bottom-color'], left: style['border-left-color'] }, boxShadow: style['box-shadow'], cursor: style.cursor, listStyleType: style['list-style-type'],
    animations: animationsOf(style).map(a => ({ name: a.name, duration: a.duration, count: a.count, playState: a.playState, direction: a.direction })),
    transitions: transitionsOf(style).map(t => ({ property: t.property, duration: t.duration })) };
}
// defaultColors (a caller-stated assumption, judgeAccessibility sets it): the UA canvas and its text color; see color/.
let uaColors = null;
// A filter on the box or an ancestor repaints its colors (brightness, invert, a drop shadow behind the glyphs): not modeled.
const backdrop = chain => chain.some(layer => layer?.paintUnmodeled) ? { unknown: 'a rule the analysis cannot read (its selector) may repaint it or an ancestor' } : chain.some(layer => (layer?.filter ?? 'none') !== 'none') ? { unknown: 'a filter on it or an ancestor changes the painted colors, which is not modeled' } : backdropOf(chain, uaColors);
const px = value => { const m = /^(\d+(?:\.\d+)?)px$/.exec(String(value)); return m ? Number(m[1]) : undefined; };
const weight = value => value === 'bold' ? 700 : /^\d+$/.test(String(value)) ? Number(value) : 400;

// Accessible-name text comparison: case and white space folded.
const normalize = text => String(text).toLowerCase().replace(/\s+/g, ' ').trim();

// --- tree order and regions -----------------------------------------------
const segments = path => path.split('/');
const isAncestor = (a, b) => b.startsWith(a + '/');
const related = (a, b) => a === b || isAncestor(a, b) || isAncestor(b, a);
/** Pre-order tree comparison of two paths. */
function treeOrder(a, b) {
  const x = segments(a), y = segments(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return (Number(x[i]) || 0) - (Number(y[i]) || 0);
  return x.length - y.length;
}
const negate = constraint => ({ slack: times(constraint.slack, q(-1)), strict: !constraint.strict });
/** region \ cut, as convex pieces. */
function subtract(region, cut) {
  if (!intersect(region, cut)) return [region];
  const pieces = [];
  let rest = region;
  for (const constraint of cut.constraints) {
    const outside = negate(constraint), piece = rest && clip(rest, outside.slack, outside.strict);
    if (piece) pieces.push(piece);
    rest = rest && clip(rest, constraint.slack, constraint.strict);
    if (!rest) break;
  }
  return pieces;
}
const right = row => sum(row.origin.inline, row.inline), bottom = row => sum(row.origin.block, row.block);
const below = (region, value, limit) => region && clip(region, diff(limit, value), true); // value < limit
const atMost = (region, value, limit) => region && clip(region, diff(limit, value)); // value <= limit
/** Where the two border boxes overlap (open intervals: touching is not overlapping). */
function overlap(a, b) {
  let region = intersect(a.region, b.region);
  region = below(region, a.origin.inline, right(b)); region = below(region, b.origin.inline, right(a));
  region = below(region, a.origin.block, bottom(b)); region = below(region, b.origin.block, bottom(a));
  // An empty box overlaps nothing: both boxes need a positive area.
  for (const size of [a.inline, a.block, b.inline, b.block]) region = below(region, scalar(0), size);
  return region;
}

// --- circles (SC 2.5.8 spacing) -------------------------------------------
// Rational unit normals in the first quadrant (Pythagorean triples), at most
// about 2.5° apart. The circle of radius r lies between the polygon
// {n·p < r·c} (c a rational lower bound of cos(gap/2): inside the circle) and
// {n·p < r} (circumscribed: outside it, the point is outside the circle).
const normals = (() => {
  const found = [[q(1), q(0), 0], [q(0), q(1), Math.PI / 2]];
  for (let k = 1; k < 36; k++) {
    const target = k * Math.PI / 72;
    let best = null;
    for (let m = 2; m <= 80; m++) for (let n = 1; n < m; n++) {
      const angle = Math.atan2(2 * m * n, m * m - n * n);
      if (!best || Math.abs(angle - target) < Math.abs(best.angle - target)) best = { m, n, angle };
    }
    const d = BigInt(best.m * best.m + best.n * best.n);
    found.push([div(q(best.m * best.m - best.n * best.n), q(Number(d))), div(q(2 * best.m * best.n), q(Number(d))), best.angle]);
  }
  found.sort((a, b) => a[2] - b[2]);
  let gap = 0; for (let i = 1; i < found.length; i++) gap = Math.max(gap, found[i][2] - found[i - 1][2]);
  return { list: found.map(([a, b]) => [a, b]), cosine: q((Math.floor(Math.cos(gap / 2) * 1e6) - 1) / 1e6) };
})();
const isZero = a => !cmp(a.x, q(0)) && !cmp(a.y, q(0)) && !cmp(a.b, q(0));
const isConstant = a => !cmp(a.x, q(0)) && !cmp(a.y, q(0));
/**
 * Where the point (dx, dy) — affine in the viewport — is strictly inside the
 * circle of radius r: {yes} proven inside, {maybe} not decided (a thin band
 * at the circle when both offsets vary). Exact when an offset is constant zero
 * or both are constants.
 */
export function circleReach(region, dx, dy, r) {
  const yes = [], maybe = [];
  for (const [sx, px] of [[1, dx], [-1, times(dx, q(-1))]]) {
    const a = sx > 0 ? clip(region, px) : clip(region, px, true); // |dx| as px ≥ 0
    if (!a) continue;
    for (const [sy, py] of [[1, dy], [-1, times(dy, q(-1))]]) {
      const piece = sy > 0 ? clip(a, py) : clip(a, py, true);
      if (!piece) continue;
      if (isConstant(px) && isConstant(py)) {
        if (cmp(add(mul(px.b, px.b), mul(py.b, py.b)), mul(r, r)) < 0) yes.push(piece);
        continue;
      }
      if (isZero(px) || isZero(py)) { const one = below(piece, isZero(px) ? py : px, scalar(r)); if (one) yes.push(one); continue; }
      const dot = ([na, nb]) => sum(times(px, na), times(py, nb));
      let inner = piece, outer = piece;
      for (const n of normals.list) { inner = inner && below(inner, dot(n), scalar(mul(r, normals.cosine))); outer = outer && below(outer, dot(n), scalar(r)); }
      if (inner) yes.push(inner);
      if (outer) maybe.push(...(inner ? subtract(outer, inner) : [outer]));
    }
  }
  return { yes, maybe };
}

export function judgeAccessibility({ geometry, waived = [], root, domain }, { keyframeFrames = new Map(), contrast = 'AA', targetLevel = 'AA', targetSize = targetLevel === 'AAA' ? 44 : 24, ranges, block, viewportMin, hostInset = 0, hostBlockInset = 0, viewportBlock = null, safeArea = null, hinge = null, scrollPaddingDeclared = false, forcedColorsHandled = false, smoothReduced = false, defaultColors = null, scrollZero = false }) {
  uaColors = defaultColors;
  const findings = [], warnings = [], unknowns = [], notes = [], exempted = [];
  // Generated boxes (::before/::after) paint and receive the pointer (for their element), but carry no DOM semantics.
  const everything = geometry;
  geometry = geometry.filter(row => !row.box.pseudo);
  const witness = region => { const p = sample(region); return { viewport: number(p.x), viewportExact: exact(p.x), ...(block ? { viewportHeight: number(p.y), viewportHeightExact: exact(p.y) } : {}) }; };
  // `region` keeps the exact constraints: a 2-D region (e.g. width > height) is not the product of its two ranges.
  const push = (list, code, severity, message, row, region, extra) => list.push({ code, severity, message, box: row.box.label, path: row.path, source: row.box.source, ...ranges(region), ...(block ? { regionConstraints: serialize(region).constraints } : {}), witness: witness(region), ...extra });
  // Covered, hidden behind or under a bar: outside an open aria-modal dialog that is the intent (see `modals`).
  const coverCodes = new Set(['E_A11Y_OCCLUDED', 'E_A11Y_INVISIBLE_BLOCKER', 'E_A11Y_FOCUS_OBSCURED', 'E_A11Y_FOCUS_SCROLLED_UNDER', 'E_A11Y_FIXED_HIDES', 'E_A11Y_FIXED_HIDES_PART']);
  const report = (list, code, severity, message, row, region, extra) => { for (const piece of coverCodes.has(code) && row.path ? outsideModals(row, region) : [region]) push(list, code, severity, message, row, piece, extra); };
  const visible = row => row.paint.visibility === 'visible';
  // Interactive: buttons, links with href (or a dynamic one), and form fields (not type=hidden or disabled-hidden).
  const field = box => ['select', 'textarea'].includes(box.tag) || (box.tag === 'input' && box.inputType !== 'hidden');
  // Widget roles that need focus and a name (WAI-ARIA 1.2), on any element.
  const widgetRoles = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'slider', 'spinbutton', 'textbox', 'searchbox', 'combobox', 'treeitem', 'gridcell']);
  const roleOf = box => box.role && box.role !== 'dynamic' ? box.role.split(/\s+/)[0] : undefined;
  const control = row => !row.box.pseudo && (row.box.tag === 'button' || row.box.tag === 'summary' || (row.box.tag === 'a' && row.box.focusable !== false) || widgetRoles.has(roleOf(row.box)));
  const interactive = row => control(row) || (!row.box.pseudo && field(row.box));
  const placed = everything.filter(row => row.origin && row.block);
  // Hit testing (occluded-target, invisible-blocker, click-trap). Boxes inside an overflow: hidden box have no position
  // in the first pass (it is a scroll container); the engine lays the page out again at scroll offset 0 (scrollZero)
  // when a blocker or a trap may depend on them, and takes these findings from there. A user cannot scroll an
  // overflow: hidden box, so offset 0 is where its content hit-tests; inside a box that scrolls (auto, scroll) it is not
  // known, so those boxes stay out (as in the first pass).
  const ancestorRows = row => { const out = []; for (let p = row.path.includes('/') ? row.path.slice(0, row.path.lastIndexOf('/')) : ''; p; p = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '') { const r = everything.find(g => g.path === p); if (r) out.push(r); } return out; };
  const userScrolled = row => scrollZero && ancestorRows(row).some(a => a.overflow === 'scroll' && !a.box.documentRoot && a.path !== root?.path);
  const hitPlaced = placed.filter(row => !userScrolled(row));
  const boxes = new Map(geometry.map(row => [row.path, row.box]));
  // aria-hidden on any ancestor in the box tree (display: contents elements have no geometry row).
  const treeBoxes = new Map(); (function walk(box) { treeBoxes.set(box.path, box); for (const child of [...(box.children ?? []), ...(box.inline ?? [])]) walk(child); })(root);
  const hiddenFrom = path => { for (let p = path; p; p = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '') { const b = treeBoxes.get(p); if (b?.ariaHidden && !['body', 'html'].includes(b.tag)) return true; } return false; };
  // A box at opacity 0 (itself or an ancestor) draws nothing: it hides nothing from sight, but it still hit-tests.
  const zeroOpacity = value => /^(?:0|0?\.0+|0%)$/.test(String(value ?? '1').trim());
  const invisible = row => (row.chain ?? [row.paint]).some(layer => zeroOpacity(layer?.opacity));
  const seen = row => row.painted && !invisible(row);
  // inert (itself or an ancestor): skipped by hit testing, so it covers nothing and its controls take no click
  // (measured in Chromium, Firefox and WebKit).
  const inertAt = row => { if (row.box.inertSubtree) return true; for (let p = row.path; p; p = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '') if (treeBoxes.get(p)?.inertSubtree) return true; return false; };
  // An open aria-modal dialog: the page outside it is meant to be out of reach while it renders, so a target outside
  // it is not reported as covered where the dialog renders (focus escaping it is modal-background's warning).
  const modals = geometry.filter(row => ['dialog', 'alertdialog'].includes(roleOf(row.box)) && row.box.aria?.['aria-modal']?.trim() === 'true' && visible(row) && !hiddenFrom(row.path) && row.region);
  const outsideModals = (row, region) => modals.filter(d => d.path !== row.path && !isAncestor(d.path, row.path)).reduce((rest, d) => rest.flatMap(r => subtract(r, d.region)), region ? [region] : []);

  // accessible-name: no name attribute, and no visible text rendered inside.
  // aria-labelledby names through the text of the referenced elements, rendered or not (accname 2.B).
  const byId = new Map();
  (function walk(box) { if (box.id && !byId.has(box.id)) byId.set(box.id, box); for (const child of box.children ?? []) walk(child); })(root);
  const hasText = box => box.text || (box.named === true) || (box.tag === 'img' && box.alt && box.alt !== 'dynamic') || (box.children ?? []).some(hasText);
  // Name from content: rendered, visible text leaves and images with a non-empty alt.
  // Generated text (::before/::after) is part of the name (Chromium); icon-font glyphs (Private Use Area) say nothing.
  const pua = /[\uE000-\uF8FF]|[\u{F0000}-\u{FFFFD}]|[\u{100000}-\u{10FFFD}]/gu;
  const generatedText = box => [box.generated?.before, box.generated?.after].filter(Boolean).join(' ');
  const generatedSays = box => generatedText(box).replace(pua, '').trim().length > 0;
  // An inline svg named by aria-label / aria-labelledby or its <title> child is part of the name too (Chromium).
  const speaks = row => (row.box.text || generatedSays(row.box) || (row.box.tag === 'img' && row.box.alt && row.box.alt !== 'dynamic') || (row.box.tag === 'svg' && nameOf(row.box) === true && !hiddenFrom(row.path))) && visible(row);
  const nameOf = box => {
    if (box.named === true) return true;
    if (box.labelledBy === 'dynamic') return 'dynamic';
    if (box.labelledBy?.some(id => byId.has(id) && hasText(byId.get(id)))) return true;
    return box.named;
  };
  // Hidden targets (visibility, or aria-hidden content) are not exposed and need no name.
  // Roles that require a name even when not focusable (WAI-ARIA 1.2 name required).
  const namedRoles = new Set(['img', 'dialog', 'alertdialog', 'progressbar', 'meter', 'tooltip', 'tree', 'treegrid', 'grid', 'table', 'radiogroup', 'listbox', 'menu', 'menubar', 'tablist', 'toolbar', 'region', 'form']);
  for (const target of geometry.filter(row => (control(row) || (row.box.role && namedRoles.has(roleOf(row.box)) && ['img', 'dialog', 'alertdialog', 'progressbar', 'meter', 'tooltip'].includes(roleOf(row.box)))) && visible(row) && nameOf(row.box) !== true && !hiddenFrom(row.path))) {
    const texts = geometry.filter(row => speaks(row) && (row.path === target.path || isAncestor(target.path, row.path)));
    let missing = [target.region];
    for (const text of texts) missing = missing.flatMap(region => subtract(region, text.region));
    // A dynamic name attribute may be empty: Unknown where no text names the target.
    if (nameOf(target.box) === 'dynamic') { for (const region of missing) report(unknowns, 'U_A11Y_NAME', 'unknown', `${target.box.label} is named only by a dynamic attribute, which may be empty`, target, region, { rule: 'accessible-name' }); continue; }
    const icon = [target, ...texts].some(row => generatedText(row.box) && !generatedSays(row.box)) || (generatedText(target.box) && !generatedSays(target.box));
    for (const region of missing) report(findings, icon ? 'E_A11Y_ICON_NAME' : 'E_A11Y_NAME', 'error', icon ? `${target.box.label} is named only by icon-font glyphs (generated Private Use Area characters), which say nothing` : `${target.box.label} has no accessible name here: no rendered text and no aria-label, aria-labelledby or title`, target, region, { rule: icon ? 'icon-font-name' : 'accessible-name' });
    // The name comes only from CSS generated content: a warning (it is easy to miss in translation and review).
    if (!missing.length && !texts.some(row => row.box.text || (row.box.tag === 'img' && row.box.alt) || row.box.tag === 'svg') && texts.length) report(warnings, 'W_A11Y_GENERATED_NAME', 'warning', `${target.box.label} is named only by CSS generated content (${JSON.stringify(texts.map(row => generatedText(row.box)).join(' '))})`, target, target.region, { rule: 'generated-name' });
  }

  // Color contrast (rules/contrast.mjs): the text and icon contrast over the DOM ancestors' backgrounds. The one
  // geometric question, whether another box may be painted behind the text, is answered here.
  const painted = placed.filter(row => seen(row) && visible(row));
  const behind = text => {
    // Text inside a scroll container has no position (it depends on the scroll offset), but it is clipped to that
    // container: only boxes over the container can be behind it. A painted box inside the same container has no
    // position either, so it may be.
    const bound = text.origin ? null : placed.filter(row => row.overflow === 'scroll' && row.origin && row.block && isAncestor(row.path, text.path)).at(-1);
    const others = text.origin
      ? painted.filter(row => !related(row.path, text.path) && text.block && overlap(text, row))
      : bound ? geometry.filter(row => seen(row) && visible(row) && !related(row.path, text.path) && (row.origin ? overlap(bound, row) : isAncestor(bound.path, row.path))) : [];
    return (!text.origin && !bound) || others.length > 0;
  };
  const contrastRules = createContrast({ report: { report, findings, warnings, unknowns }, options: { contrast, uaColors },
    tools: { visible, control, speaks, isAncestor, behind } });
  contrastRules.textContrast(geometry);
  contrastRules.iconContrast(geometry);

  // label-pointer: a label of a field with pointer-events: none: clicks on it pass through, so it no longer focuses or
  // toggles its field (a custom checkbox whose real input is hidden can then not be used with a pointer at all).
  {
    const labelBoxes = []; (function walk(box) { if (box.tag === 'label') labelBoxes.push(box); for (const child of box.children ?? []) walk(child); })(root);
    const ids = new Set(); (function walk(box) { if (box.id) ids.add(box.id); for (const child of box.children ?? []) walk(child); })(root);
    const wrapsField = label => { let found = false; (function walk(box) { if (box !== label && ['input', 'select', 'textarea'].includes(box.tag)) found = true; for (const child of box.children ?? []) walk(child); })(label); return found; };
    for (const label of labelBoxes.filter(l => (l.labelFor && l.labelFor !== 'dynamic' && ids.has(l.labelFor)) || wrapsField(l)))
      for (const row of geometry.filter(row => row.path === label.path && visible(row) && row.paint.pointerEvents === 'none'))
        if (!warnings.some(w => w.code === 'W_A11Y_LABEL_POINTER' && w.path === row.path))
          report(warnings, 'W_A11Y_LABEL_POINTER', 'warning', `${row.box.label} labels a field but has pointer-events: none: clicking it does not reach the field (a hidden custom checkbox cannot then be toggled with a pointer)`, row, row.region, { rule: 'label-pointer' });
  }

  // caret-hidden (rules/contrast.mjs).
  contrastRules.caretHidden(geometry);

  // occluded-target: a hit-testable box from a later paint layer covers a target.
  const layer = row => { for (let p = row.path; p; p = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '') { const r = everything.find(g => g.path === p); if (r && r.position !== 'static') return p; } return null; };
  // Stacking contexts (CSS 2 Appendix E): a box with an integer z-index, opacity below 1, or isolation: isolate paints
  // with its descendants as one layer of its parent context: negative z, then in-flow boxes, then z 0/auto layers
  // (tree order), then positive z. Two boxes compare inside their deepest common context, by the layers that hold them
  // there; inside one layer the tree-order rules below apply.
  const rowAt = path => everything.find(g => g.path === path);
  const parentPath = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
  // The page does not scroll for the user: overflow hidden / clip on html (both axes; it goes to the viewport) with a
  // body that does not clip. Measured with the wheel and PageDown in Chromium, Firefox and WebKit (html hidden or clip
  // never scrolls; a body that clips under a visible html does not either, but the layout leaves that Unknown).
  const rootRows = geometry.filter(row => row.path === root.path && row.box.documentRoot);
  const bodyRows = geometry.filter(row => row.box.tag === 'body' && parentPath(row.path) === root.path);
  const stillPage = rootRows.length > 0 && rootRows.every(row => ['hidden', 'clip'].includes(row.overflowY) && ['hidden', 'clip'].includes(row.overflowX))
    && bodyRows.every(row => row.overflowY === 'visible' && row.overflowX === 'visible');
  const stillWhy = stillPage ? `the page does not scroll (overflow: ${rootRows[0].overflowY} on ${rootRows[0].box.label})` : '';
  const inFixed = row => { for (let p = row.path; p; p = parentPath(p)) { const r = rowAt(p); if (r?.fixed || r?.sticky) return true; } return false; };
  // Also (measured in Chromium) position: fixed and sticky with z-index auto, a backdrop filter, and will-change naming
  // a property that would make one: a descendant's z-index does not escape them.
  const willStack = /(?:^|,\s*)(?:transform|translate|rotate|scale|opacity|filter|backdrop-filter|perspective|isolation|mix-blend-mode|clip-path|mask|contain)(?:\s*,|$)/;
  const createsContext = r => (r.zIndex !== null && r.zIndex !== undefined) || !opaqueValue(r.paint.opacity) || r.paint.isolation === 'isolate' || Boolean(r.paint.preserve3d) || (r.paint.transform ?? 'none') !== 'none'
    || r.position === 'fixed' || Boolean(r.sticky) || Boolean(r.paint.stacks) || (r.paint.backdropFilter ?? 'none') !== 'none' || (r.paint.filter ?? 'none') !== 'none' || willStack.test(r.paint.willChange ?? 'auto');
  const contexts = row => { const out = []; for (let p = row.path; p; p = parentPath(p)) { const r = p === row.path ? row : rowAt(p); if (r && createsContext(r)) out.unshift(r); } return out; };
  // The nearest positioned ancestor-or-self strictly inside `within` (a context path, or '' for the root).
  const layerIn = (row, within) => { for (let p = row.path; p && p !== within; p = parentPath(p)) { const r = rowAt(p); if (r && r.position !== 'static') return p; } return null; };
  const keyIn = (row, representative, within) => {
    if (representative) { const z = representative.zIndex ?? 0; return { tier: z < 0 ? 1 : z > 0 ? 4 : 3, z, path: representative.path, context: true }; }
    const l = layerIn(row, within);
    return l ? { tier: 3, z: 0, path: l } : { tier: 2, z: 0, path: row.path };
  };
  const paintsAbove = (cover, above, target, own) => {
    const ca = contexts(cover), cb = contexts(target);
    let k = 0; while (k < ca.length && k < cb.length && ca[k] === cb[k]) k++;
    const within = k ? ca[k - 1].path : '';
    const a = keyIn(cover, ca[k], within), b = keyIn(target, cb[k], within);
    if (a.context || b.context) return a.tier !== b.tier ? a.tier > b.tier : a.z !== b.z ? a.z > b.z : treeOrder(a.path, b.path) > 0;
    if (k) { // both in the same context: the tree-order rules, with layers taken inside it
      const la = layerIn(cover, within), lb = layerIn(target, within);
      if (!la) return !lb && treeOrder(cover.path, target.path) > 0;
      return !(lb && (isAncestor(la, lb) || la === lb || treeOrder(la, lb) < 0));
    }
    if (!above) return !own && treeOrder(cover.path, target.path) > 0;
    return !(own && (isAncestor(above, own) || above === own || treeOrder(above, own) < 0));
  };
  // Why a box makes a stacking context, for the message.
  const contextReasons = r => [
    ...(r.zIndex !== null && r.zIndex !== undefined ? [`z-index ${r.zIndex}`] : []), ...(r.position === 'fixed' ? ['position: fixed'] : []), ...(r.sticky ? ['position: sticky'] : []),
    ...((r.paint.transform ?? 'none') !== 'none' ? ['transform'] : []), ...(!opaqueValue(r.paint.opacity) ? [`opacity ${r.paint.opacity}`] : []), ...(r.paint.isolation === 'isolate' ? ['isolation: isolate'] : []),
    ...(r.paint.preserve3d ? ['transform-style: preserve-3d'] : []), ...((r.paint.backdropFilter ?? 'none') !== 'none' ? ['backdrop-filter'] : []), ...((r.paint.filter ?? 'none') !== 'none' ? [`filter: ${r.paint.filter}`] : []), ...(willStack.test(r.paint.willChange ?? 'auto') ? [`will-change: ${r.paint.willChange}`] : []),
  ];
  const occludedMessage = (target, cover) => {
    const base = `${target.box.label} is covered by ${cover.box.label}, which is painted later and receives the pointer`;
    if (invisible(cover)) return `${target.box.label} is covered by ${cover.box.label}, which is invisible (opacity 0) but still receives the pointer; give it pointer-events: none, or display: none while it is not shown`;
    // A z-index on the target (or a context between it and the one compared) orders it only inside that context.
    const ca = contexts(cover), cb = contexts(target);
    let k = 0; while (k < ca.length && k < cb.length && ca[k] === cb[k]) k++;
    const outer = cb[k], inner = outer ? [...cb.slice(k + 1), target].filter(r => r !== outer && Number.isInteger(r.zIndex)) : [];
    if (!inner.length) return base;
    const top = inner.reduce((a, b) => b.zIndex > a.zIndex ? b : a);
    return `${base}: the z-index ${top.zIndex} of ${top.box.label} orders it only inside the stacking context of ${outer.box.label} (${contextReasons(outer).join(', ')}), which paints below ${cover.box.label}`;
  };
  // Hit testing inside boxes that clip their overflow. A box's position is `origin`; inside an overflow: clip box it is
  // `clipOrigin` (exact, but parts may be cut off); inside a scroll container (hidden, auto, scroll) it follows the
  // scroll offset and is known only in the scroll-zero layout. What a clipping ancestor cuts off is not under the
  // pointer, so two boxes overlap where they meet inside the padding boxes of the ancestors that clip either of them
  // (pairwise on each clipped axis: open intervals with a common point pairwise have one in common). A fixed box escapes
  // the overflow of the ancestors above it (`clipsIt`).
  const clipsIt = (clipper, target) => isAncestor(clipper.path, target.path) && (!target.fixedFrom || clipper.path === target.fixedFrom || isAncestor(target.fixedFrom, clipper.path));
  const at = row => row.origin ?? row.clipOrigin ?? null;
  const located = row => at(row) && row.block ? (row.origin ? row : { ...row, origin: row.clipOrigin }) : null;
  const clippingRows = everything.filter(row => row.overflowClips);
  const paddingBox = c => ({ ...c, origin: { inline: sum(c.origin.inline, scalar(c.borders.left)), block: sum(c.origin.block, scalar(c.borders.top)) }, inline: diff(diff(c.inline, scalar(c.borders.left)), scalar(c.borders.right)), block: diff(diff(c.block, scalar(c.borders.top)), scalar(c.borders.bottom)) });
  const meetOn = (region, a, b, axes) => {
    if (axes.inline) { region = below(region, a.origin.inline, right(b)); region = below(region, b.origin.inline, right(a)); }
    if (axes.block) { region = below(region, a.origin.block, bottom(b)); region = below(region, b.origin.block, bottom(a)); }
    return region;
  };
  // Where a and b (located rows) overlap and both are under the pointer there: pieces of a region (a clipper may have a
  // row per viewport piece), or null when a clipping ancestor has no known position (then it is not decided).
  const visibleOverlap = (a, b) => {
    const base = overlap(a, b);
    if (!base) return [];
    const paths = [...new Set(clippingRows.filter(c => clipsIt(c, a) || clipsIt(c, b)).map(c => c.path))];
    let pieces = [{ region: base, boxes: [] }];
    for (const path of paths) {
      // (Only the rows of the viewport ranges the overlap is in: a range where the ancestor has no position but the
      // overlap does not reach leaves it decided.)
      const rows = clippingRows.filter(c => c.path === path && intersect(c.region, base));
      if (rows.some(c => !located(c))) return null;
      // Each row bounds the overlap only in its own region; where the ancestor does not clip (no row: overflow visible
      // in that viewport range), the piece stays as it was.
      pieces = pieces.flatMap(piece => [...rows.map(c => {
        const k = paddingBox(located(c)), axes = c.overflowClips;
        let region = intersect(piece.region, c.region);
        for (const axis of ['inline', 'block']) if (axes[axis]) region = below(region, scalar(0), k[axis]);
        region = meetOn(meetOn(region, a, k, axes), b, k, axes);
        for (const other of piece.boxes) region = meetOn(region, other.k, k, { inline: axes.inline && other.axes.inline, block: axes.block && other.axes.block });
        return region ? { region, boxes: [...piece.boxes, { k, axes }] } : null;
      }).filter(Boolean), ...rows.reduce((rest, c) => rest.flatMap(r => subtract(r, c.region)), [piece.region]).map(region => ({ region, boxes: piece.boxes }))]);
    }
    return pieces.map(piece => piece.region);
  };
  // The outermost scroll container with a known position that clips a box without one: the box is seen only inside it.
  // The scroll container with a known position that clips a box without one, per viewport range: the box is seen only
  // inside it. A located scroller has no scroller around it, so in each range there is at most one; it may be a
  // different box in another range (an outer box that scrolls only on narrow screens). Pieces of the box's region.
  const unlocatedScrollers = row => {
    if (at(row)) return [];
    const out = [];
    for (const c of clippingRows) {
      if (!c.scroller || !clipsIt(c, row) || !located(c)) continue;
      const region = intersect(row.region, c.region);
      if (region) out.push({ s: c, region });
    }
    return out;
  };
  const occlusionRows = everything.map(located).filter(Boolean);
  const targets = placed.filter(row => interactive(row) && visible(row) && !inertAt(row) && !userScrolled(row));
  // inert-shown: an inert control that nothing paints over looks clickable, but takes no click: the click
  // reaches whatever is under it. (An inert page behind a modal's backdrop is covered there, and not reported.)
  for (const target of placed.filter(row => interactive(row) && visible(row) && inertAt(row) && !row.box.pseudo)) {
    const own = layer(target);
    let rest = [target.region];
    for (const cover of placed) {
      // (An inert box still paints: over the control it hides it from sight, so it counts here.)
      if (related(cover.path, target.path) || !visible(cover) || !seen(cover) || !paintsAbove(cover, layer(cover), target, own)) continue;
      const region = overlap(target, cover);
      if (region) rest = rest.flatMap(piece => subtract(piece, region));
    }
    for (const piece of rest) report(warnings, 'W_A11Y_INERT_SHOWN', 'warning', `${target.box.label} is inert but shown with nothing over it: it looks clickable, yet takes no click or focus (the click reaches what is under it). Remove inert while it is shown, or hide it`, target, piece, { rule: 'inert-shown' });
  }
  // invisible-blocker: a box that paints nothing (opacity 0, or no background, border, text or replaced content) is the
  // top hit-test target over a control that nothing painted covers: the user sees the control, the click lands on
  // the invisible box. It replaces E_A11Y_OCCLUDED for that pair and region (a control, or a part of one, that covers
  // another stays E_A11Y_OCCLUDED: the click does reach a control).
  const replacedTags = new Set(['img', 'svg', 'iframe', 'video', 'canvas', 'object', 'embed', 'input', 'select', 'textarea', 'audio', 'picture', 'meter', 'progress']);
  // Why a box paints nothing of its own, or null when it paints something (a background, border, shadow, text,
  // generated text or replaced content). Its descendants are rows of their own.
  const paintsNothing = row => {
    if (!visible(row)) return 'visibility: hidden';
    if (invisible(row)) return 'opacity 0';
    if (row.paint.hiddenVisually) return 'it is clipped to nothing';
    if (row.painted || row.box.text || generatedText(row.box) || replacedTags.has(row.box.tag) || (row.box.tag === 'audio' && row.box.controls) || ((row.paint.boxShadow ?? 'none') !== 'none' && row.paint.boxShadow !== undefined)) return null;
    return 'no text, background, border or image';
  };
  // A descendant without a hit-test position (inside a box that scrolls, or not laid out at offset 0 yet) that paints:
  // it may fill the box, so the box is not known to be invisible (it stays an occlusion).
  const unplacedPaint = row => { const hit = new Set(hitPlaced.map(r => r.path)); return everything.some(d => isAncestor(row.path, d.path) && !hit.has(d.path) && !paintsNothing(d)); };
  const inControl = row => { for (let p = row.box.pseudo ? parentPath(row.path) : row.path; p; p = parentPath(p)) { const b = treeBoxes.get(p); if (b && interactive({ box: b })) return true; } return false; };
  // A cover that is part of a control and is stretched over the box that holds the target (a stretched link's ::after
  // over the buttons of its own card): the click reaches the control the card stands for, so the pair stays an occlusion.
  // The stretched box is the outermost positioned one between the cover and its control; it is stretched over the target
  // when its containing block (the nearest positioned ancestor) holds the target and is not the page itself. A fixed
  // box, or one placed against the page (an ad's transparent link over the viewport), is no part of the target's card.
  const ownStretch = (cover, target) => {
    let control = null;
    for (let p = cover.box.pseudo ? parentPath(cover.path) : cover.path; p; p = parentPath(p)) { const b = treeBoxes.get(p); if (b && interactive({ box: b })) { control = p; break; } }
    if (!control) return false;
    let stretched = null;
    for (let p = cover.path; p && (p === control || isAncestor(control, p)); p = parentPath(p)) { const r = rowAt(p); if (r && ['absolute', 'fixed'].includes(r.position)) stretched = r; }
    if (!stretched) return true;
    if (stretched.position === 'fixed') return false;
    for (let p = parentPath(stretched.path); p; p = parentPath(p)) {
      const r = rowAt(p);
      if (!r || r.position === 'static') continue;
      return !r.box.documentRoot && !['html', 'body'].includes(r.box.tag) && isAncestor(p, target.path);
    }
    return false;
  };
  // The topmost of boxes that all cover one target (paint order, as hit testing goes).
  const topmost = rows => rows.reduce((a, b) => paintsAbove(b, layer(b), a, layer(a)) ? b : a);
  const blockerMessage = (target, cover) => `${target.box.label} shows, but ${cover.box.label} ${invisible(cover) ? 'is invisible (opacity 0)' : 'paints nothing'} and lies over it, painted later: clicks land on ${cover.box.label}, which the user cannot see. Give ${cover.box.label} pointer-events: none, or display: none while it is not shown`;
  // Every (target, cover, region) pair: what the click-trap rule reads.
  const coverPairs = [];
  // The hit-testable boxes painted over a box, each with the region where it overlaps it.
  const coversOf = target => {
    const own = layer(target);
    return hitPlaced.filter(cover => !related(cover.path, target.path) && visible(cover) && cover.paint.pointerEvents !== 'none' && !inertAt(cover) && paintsAbove(cover, layer(cover), target, own))
      .map(cover => ({ cover, region: overlap(target, cover) })).filter(c => c.region);
  };
  const hitTargets = new Set(targets);
  // occluded-target and invisible-blocker: every located box (inside an overflow: clip box too, and at scroll offset 0
  // inside a scroll container), each cover counted only where both are under the pointer (visibleOverlap).
  for (const target of occlusionRows.filter(row => interactive(row) && visible(row) && !inertAt(row))) {
    const own = layer(target);
    // Every cover counts where it covers: one cover's region is not another's (the first found used to end the
    // search, which lost the region where only a later cover overlaps; found by the occlusion fuzz).
    let reported = [];
    // Paint order: stacking contexts by z-index (paintsAbove), then positioned layers after in-flow content in tree order;
    // two in-flow block boxes paint (and hit-test) in tree order, the later one on top.
    // (Where a clipping ancestor of either box has no known position, whether they meet under the pointer is not
    // decided: Unknown.)
    const covers = occlusionRows.filter(cover => !related(cover.path, target.path) && visible(cover) && cover.paint.pointerEvents !== 'none' && !inertAt(cover) && paintsAbove(cover, layer(cover), target, own))
      .flatMap(cover => {
        const pieces = visibleOverlap(target, cover);
        if (pieces === null) { report(unknowns, 'U_A11Y_SCROLLED_COVER', 'unknown', `${cover.box.label} may cover ${target.box.label}, but a box that clips one of them has no known position (it is inside a scroll container): whether it covers it is not checked`, target, overlap(target, cover), { rule: 'occluded-target', cover: cover.path }); return []; }
        return pieces.map(region => ({ cover, region }));
      });
    // (The click-trap rule reads the pairs of the hit-testable boxes: not those a user scrolls, at scroll offset 0.)
    if (hitTargets.has(target)) for (const c of coversOf(target)) coverPairs.push({ target, ...c });
    // Where something that paints covers the target, it is not seen as it is: the covers are occlusions there.
    const seenOver = covers.filter(c => !paintsNothing(c.cover)).map(c => c.region);
    const targetShows = !invisible(target);
    for (const { cover, region } of covers) {
      let fresh = [region];
      for (const done of reported) fresh = fresh.flatMap(piece => subtract(piece, done));
      for (const whole of fresh) {
        // The part where only boxes that paint nothing are over the target, and the rest.
        let ghost = targetShows ? [whole] : [];
        for (const r of seenOver) ghost = ghost.flatMap(piece => subtract(piece, r));
        let occluded = [whole];
        for (const g of ghost) occluded = occluded.flatMap(piece => subtract(piece, g));
        for (const piece of ghost) {
          const over = [...new Set(covers.filter(c => intersect(c.region, piece)).map(c => c.cover))];
          const top = topmost(over);
          if (!ownStretch(top, target) && !unplacedPaint(top)) { report(findings, 'E_A11Y_INVISIBLE_BLOCKER', 'error', blockerMessage(target, top), target, piece, { rule: 'invisible-blocker', cover: top.path, why: paintsNothing(top) }); continue; }
          occluded.push(piece);
        }
        for (const piece of occluded) {
          // The other boxes over the target in the same viewport range: removing this cover alone does not free it.
          const others = [...new Set(covers.filter(c => c.cover !== cover && intersect(c.region, piece)).map(c => c.cover))];
          const also = others.length ? `; ${others.map(c => c.box.label).join(', ')} ${others.length > 1 ? 'are' : 'is'} over it there too` : '';
          const still = stillPage && inFixed(cover) && !inFixed(target) ? `; ${stillWhy}, so scrolling cannot free it` : '';
          report(findings, 'E_A11Y_OCCLUDED', 'error', occludedMessage(target, cover) + also + still, target, piece, { rule: 'occluded-target', cover: cover.path, ...(others.length ? { alsoCoveredBy: others.map(c => c.path) } : {}) });
        }
      }
      reported.push(region);
    }
  }
  // A target inside a scroll container has no position here (it follows the scroll offset). Where a box that paints over
  // it and is not scrolled with it (outside the container, or a fixed box that escapes it) reaches into the container's
  // box, whether it covers the target is not decided here: Unknown, never a silent pass. The scroll-zero layout decides
  // it at the initial scroll offset (judged from there in the engine), and the Unknown stays for the other offsets.
  {
    const byScroller = new Map();
    for (const target of everything.filter(row => !at(row) && row.block && interactive(row) && visible(row) && !inertAt(row) && !hiddenFrom(row.path))) {
      for (const { s, region } of unlocatedScrollers(target)) {
        if (!byScroller.has(s.path)) byScroller.set(s.path, { s, targets: [] });
        byScroller.get(s.path).targets.push({ ...target, region });
      }
    }
    // (A scroller with a row per viewport piece: each piece's box.)
    for (const { s: first, targets: inside } of byScroller.values()) for (const s of clippingRows.filter(c => c.path === first.path && located(c))) {
      const port = paddingBox(located(s));
      for (const cover of occlusionRows) {
        if (cover.path === s.path || clipsIt(s, cover) || !visible(cover) || cover.paint.pointerEvents === 'none' || inertAt(cover)) continue;
        const candidates = inside.filter(target => !related(cover.path, target.path) && paintsAbove(cover, layer(cover), target, layer(target)));
        if (!candidates.length) continue;
        const pieces = visibleOverlap(port, cover);
        for (const region of pieces ?? [overlap(port, cover)].filter(Boolean)) {
          // Only the controls that exist in this piece's viewport range (one row per range: each path once).
          const under = [...new Map(candidates.filter(target => intersect(target.region, region)).map(target => [target.path, target])).values()];
          if (under.length) report(unknowns, 'U_A11Y_SCROLLED_COVER', 'unknown', `${cover.box.label} paints over part of ${s.box.label}, which scrolls (overflow: ${s.overflowValue}) the controls under it (${under.map(t => t.box.label).join(', ')}): whether it covers them is not checked at every scroll offset, as positions there depend on it. Keep the covering box off the scrolling area, or give the content room beside it`, s, region, { rule: 'occluded-target', cover: cover.path, targets: under.map(t => t.path) });
        }
      }
    }
  }

  // invisible-blocker, scrolled: a fixed box that paints nothing (an ad left at opacity 0) does not move as the page
  // scrolls, so controls in the flow pass under it: at those scroll offsets a click on them lands on the box, which the
  // user cannot see (a box that paints is seen, and scrolling on frees the control). Scroll offsets s run over
  // [0, page height − viewport height]; at s the control's viewport top is its top − s. Only controls below the box at
  // s = 0 (the pair at s = 0 is judged above), and only on a page the user can scroll. Measured in Chromium, Firefox and
  // WebKit with elementFromPoint at several scroll offsets (pointer-events: none on the box as the control).
  const scrolledPage = geometry.find(row => row.path === root.path && row.origin && row.block);
  if (!stillPage && block && viewportBlock && scrolledPage) {
    const ghostsFixed = hitPlaced.filter(c => c.fixed && visible(c) && c.paint.pointerEvents !== 'none' && !inertAt(c) && !unplacedPaint(c)
      && [c, ...everything.filter(d => isAncestor(c.path, d.path))].every(d => paintsNothing(d)));
    for (const target of ghostsFixed.length ? targets.filter(t => !inFixed(t) && !t.box.pseudo && !invisible(t)) : []) {
      const own = layer(target);
      for (const c of ghostsFixed) {
        if (related(c.path, target.path) || ownStretch(c, target) || !paintsAbove(c, layer(c), target, own)) continue;
        let r = intersect(target.region, c.region);
        r = below(r, c.origin.inline, right(target)); r = below(r, target.origin.inline, right(c));
        // A box with no area takes no click, and a control with none is not seen (as in overlap()).
        for (const size of [c.inline, c.block, target.inline, target.block]) r = below(r, scalar(0), size);
        // On screen, and below the control's place at s = 0; reached before the largest scroll offset.
        r = below(r, c.origin.block, viewportBlock); r = below(r, scalar(0), bottom(c));
        r = atMost(r, bottom(c), target.origin.block);
        r = below(r, target.origin.block, sum(bottom(c), diff(bottom(scrolledPage), viewportBlock)));
        if (!r) continue;
        const p = sample(r), from = number(evaluate(diff(target.origin.block, bottom(c)), p)), to = Math.min(number(evaluate(diff(bottom(target), c.origin.block), p)), number(evaluate(diff(bottom(scrolledPage), viewportBlock), p)));
        report(findings, 'E_A11Y_INVISIBLE_BLOCKER', 'error', `${target.box.label} scrolls under the fixed ${c.box.label}, which ${invisible(c) ? 'is invisible (opacity 0)' : 'paints nothing'} but takes the pointer: once the page is scrolled past ${Math.round(from)}px (to ${Math.round(to)}px, at the witness viewport), clicks on ${target.box.label} land on ${c.box.label}, which the user cannot see. Give ${c.box.label} pointer-events: none, or display: none while it is not shown`,
          target, r, { rule: 'invisible-blocker', cover: c.path, why: paintsNothing(c), scrolled: { from, to } });
      }
    }
  }

  // target-overlap: two interactive targets intersect.
  for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
    const a = targets[i], b = targets[j];
    if (related(a.path, b.path)) continue;
    const region = overlap(a, b);
    if (region) report(findings, 'E_A11Y_TARGET_OVERLAP', 'error', `${a.box.label} and ${b.box.label} overlap`, a, region, { rule: 'target-overlap', other: b.path });
  }

  // visual-order: siblings in flow, b after a in the DOM but entirely above a, or beside it on its left.
  const parent = path => path.slice(0, path.lastIndexOf('/'));
  const flow = placed.filter(row => row.position === 'static' && row.path.includes('/'));
  for (const a of flow) for (const b of flow) {
    if (parent(a.path) !== parent(b.path) || treeOrder(a.path, b.path) >= 0) continue;
    const both = intersect(a.region, b.region);
    if (!both) continue;
    const above = atMost(both, bottom(b), a.origin.block);
    let beside = below(below(both, b.origin.block, bottom(a)), a.origin.block, bottom(b));
    beside = atMost(beside, right(b), a.origin.inline);
    for (const region of [above, beside].filter(Boolean)) report(warnings, 'W_A11Y_ORDER', 'warning', `${b.box.label} comes after ${a.box.label} in the DOM but is placed before it`, b, region, { rule: 'visual-order', before: a.path });
  }

  // hidden-focusable: rendered, visible focusable elements under aria-hidden.
  const hidden = path => { let found = false; for (let p = path; p; p = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '') { const value = treeBoxes.get(p)?.ariaHidden; if (value === true) return true; if (value) found = 'dynamic'; } return found; };
  for (const row of geometry.filter(row => (row.box.focusable ?? row.box.tag === 'button') && visible(row))) {
    const under = hidden(row.path);
    if (!under) continue;
    if (under === 'dynamic' || row.box.focusable === 'dynamic') report(unknowns, 'U_A11Y_HIDDEN_FOCUSABLE', 'unknown', `${row.box.label}: a dynamic aria-hidden or tabindex decides whether it can take focus inside hidden content`, row, row.region, { rule: 'hidden-focusable' });
    else report(findings, 'E_A11Y_HIDDEN_FOCUSABLE', 'error', `${row.box.label} can take focus inside aria-hidden content`, row, row.region, { rule: 'hidden-focusable' });
  }

  // empty-heading: like accessible-name, for exposed headings.
  const level = row => /^h([1-6])$/.exec(row.box.tag)?.[1];
  const headings = geometry.filter(row => level(row) && visible(row) && !hiddenFrom(row.path));
  for (const head of headings.filter(row => nameOf(row.box) !== true)) {
    let missing = [head.region];
    for (const text of geometry.filter(row => row.box.text && visible(row) && (row.path === head.path || isAncestor(head.path, row.path)))) missing = missing.flatMap(region => subtract(region, text.region));
    const dynamic = nameOf(head.box) === 'dynamic';
    for (const region of missing) report(dynamic ? unknowns : findings, dynamic ? 'U_A11Y_EMPTY_HEADING' : 'E_A11Y_EMPTY_HEADING', dynamic ? 'unknown' : 'error',
      `${head.box.label} is an empty heading here`, head, region, { rule: 'empty-heading' });
  }

  // heading-order: b follows a with no rendered heading between them, and skips a level.
  const ordered = [...headings].sort((x, y) => treeOrder(x.path, y.path));
  for (let i = 0; i < ordered.length; i++) for (let j = i + 1; j < ordered.length; j++) {
    const a = ordered[i], b = ordered[j];
    if (a.path === b.path || Number(level(b)) <= Number(level(a)) + 1) continue;
    let pieces = [intersect(a.region, b.region)].filter(Boolean);
    for (const between of ordered.slice(i + 1, j)) if (between.path !== a.path && between.path !== b.path) pieces = pieces.flatMap(region => subtract(region, between.region));
    for (const region of pieces) report(warnings, 'W_A11Y_HEADING_ORDER', 'warning', `${b.box.label} (h${level(b)}) follows h${level(a)} ${a.box.label}, skipping a level`, b, region, { rule: 'heading-order', previous: a.path });
  }

  // nested-interactive: an interactive element rendered inside another.
  for (const inner of geometry.filter(interactive)) for (const outer of geometry.filter(row => interactive(row) && isAncestor(row.path, inner.path))) {
    const region = intersect(inner.region, outer.region);
    if (region) report(findings, 'E_A11Y_NESTED_INTERACTIVE', 'error', `${inner.box.label} is interactive inside ${outer.box.label}`, inner, region, { rule: 'nested-interactive', outer: outer.path });
  }

  // DOM-only facts hold at every width: duplicate ids, dangling references, positive tabindex.
  const all = [];
  (function walk(box) { all.push(box); for (const child of box.children ?? []) walk(child); })(root);
  const ids = new Map();
  for (const box of all) if (box.id) ids.set(box.id, [...(ids.get(box.id) ?? []), box]);
  const whole = box => ({ box, path: box.path });
  for (const [id, owners] of ids) if (owners.length > 1) report(findings, 'E_A11Y_DUPLICATE_ID', 'error', `id ${JSON.stringify(id)} is used by ${owners.length} elements`, whole(owners[1]), domain, { rule: 'duplicate-id', id, first: owners[0].path });
  for (const box of all) {
    if (box.labelledBy === 'dynamic' && box.references === undefined) report(unknowns, 'U_A11Y_REFERENCE', 'unknown', `${box.label}: a dynamic aria-labelledby may name a missing id`, whole(box), domain, { rule: 'aria-reference' });
    if (box.references === 'dynamic') { report(unknowns, 'U_A11Y_REFERENCE', 'unknown', `${box.label}: a dynamic aria reference may name a missing id`, whole(box), domain, { rule: 'aria-reference' }); continue; }
    for (const reference of box.references ?? []) if (!ids.has(reference)) report(findings, 'E_A11Y_REFERENCE', 'error', `${box.label} references the missing id ${JSON.stringify(reference)}`, whole(box), domain, { rule: 'aria-reference', reference });
    if (box.tabIndex > 0) report(warnings, 'W_A11Y_POSITIVE_TABINDEX', 'warning', `${box.label} has tabindex ${box.tabIndex}, which moves it ahead of the DOM focus order`, whole(box), domain, { rule: 'positive-tabindex' });
  }

  // multiple-main: two main elements render at the same viewport.
  const mains = geometry.filter(row => row.box.tag === 'main' && visible(row) && !hiddenFrom(row.path));
  for (let i = 0; i < mains.length; i++) for (let j = i + 1; j < mains.length; j++) {
    if (mains[i].path === mains[j].path) continue;
    const region = intersect(mains[i].region, mains[j].region);
    if (region) report(warnings, 'W_A11Y_MULTIPLE_MAIN', 'warning', `${mains[j].box.label} renders as a second main landmark`, mains[j], region, { rule: 'multiple-main', first: mains[i].path });
  }

  // scrollable-region-focusable: where content overflows a scroll container, keyboard users need a focusable way in.
  const focusable = row => (row.box.focusable === true || (row.box.focusable ?? row.box.tag === 'button') === true || row.box.tabIndex >= 0) && visible(row);
  const byPath = new Map(geometry.map(row => [row.path, row]));
  const scroller = path => { for (let p = path; p; p = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '') for (const row of geometry) if (row.path === p && row.overflow === 'scroll') return row; return null; };
  // Only overflow of the container's own content box is a proved scroll range; an item
  // overflowing its track inside it may still fit the container (Unknown).
  const overflowing = new Map();
  for (const entry of waived) {
    const container = scroller(entry.self ? entry.path : entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : entry.path);
    if (!container) continue;
    const definite = entry.self && entry.path === container.path;
    overflowing.set(container.path, [...(overflowing.get(container.path) ?? []), { region: entry.region, definite }]);
  }
  for (const [path, entries] of overflowing) {
    const container = byPath.get(path);
    if (focusable(container)) continue;
    const inner = geometry.filter(row => isAncestor(path, row.path) && focusable(row));
    for (const { region: start, definite } of entries) {
      let missing = [start];
      for (const row of inner) missing = missing.flatMap(region => subtract(region, row.region));
      for (const region of missing) report(definite ? findings : unknowns, definite ? 'E_A11Y_SCROLL_FOCUS' : 'U_A11Y_SCROLL_FOCUS', definite ? 'error' : 'unknown',
        definite ? `${container.box.label} scrolls here but neither it nor anything inside it can take focus` : `${container.box.label} may scroll here (an item overflows its track) and nothing inside it can take focus`, container, region, { rule: 'scrollable-region-focusable' });
    }
  }

  // page-clipped: overflow-x: hidden (or clip) on the document root turns horizontal page scrolling off, so whatever
  // lies past the viewport's right edge is cut off for good (SC 1.4.10 fails as loss of content instead of a
  // scrollbar). With hidden, focusing an element scrolls it into view, so only text is judged; with clip, controls too.
  const viewportRoot = geometry.find(row => row.path === root.path && row.box.documentRoot);
  const pageClips = viewportRoot && ['hidden', 'clip'].includes(String(viewportRoot.overflowX));
  if (pageClips) for (const row of placed.filter(row => ((row.box.text && !focusable(row)) || (viewportRoot.overflowX === 'clip' && (row.box.text || interactive(row)))) && visible(row) && !hiddenFrom(row.path) && !row.box.pseudo && !row.fixed)) {
    const cut = atMost(row.region, sum(domainWidth, scalar(1)), right(row));
    if (cut) report(findings, 'E_A11Y_PAGE_CLIPPED', 'error', `${row.box.label} reaches past the viewport's right edge, and overflow-x: ${viewportRoot.overflowX} on ${viewportRoot.box.label} turns horizontal scrolling off: the part past the edge can never be seen. Let it fit the viewport (min-width: 0, max-width: 100%, wrapping) instead of hiding the overflow`, row, cut, { rule: 'page-clipped' });
  }
  // reflow: no horizontal page scrolling at 320 CSS px (or narrower widths in the domain). With horizontal page
  // scrolling turned off the overflow is cut instead (page-clipped above).
  if (viewportMin !== undefined && viewportMin > 320) notes.push('reflow: the viewport domain starts above 320px, so SC 1.4.10 at 320 CSS px is not checked');
  for (const row of pageClips ? [] : placed) {
    const narrow = row.region && clip(row.region, diff(scalar(320), domainWidth));
    const failed = narrow && below(narrow, domainWidth, right(row));
    if (failed) report(findings, 'E_A11Y_REFLOW', 'error', `${row.box.label} makes the page scroll horizontally at 320 CSS px`, row, failed, { rule: 'reflow' });
  }

  // Inline targets (links in one line of measured text): the outer bounds hold every fragment, the
  // inner bounds are always covered. Covering the inner box occludes; touching only the outer is Unknown.
  for (const target of geometry.filter(row => row.inlineFlow && row.bounds && interactive(row) && visible(row) && !hiddenFrom(row.path)).flatMap(row => row.bounds.filter(piece => piece.outer).map(piece => ({ ...row, region: piece.region, bounds: piece })))) {
    const own = layer(target), inner = target.bounds.inner && { ...target, ...target.bounds.inner }, outer = { ...target, ...target.bounds.outer };
    // Where a box that paints is over the link, it is not seen as it is (an occlusion); elsewhere a cover that paints
    // nothing is an invisible blocker (see invisible-blocker above).
    const seenOver = hitPlaced.filter(c => !related(c.path, target.path) && c.path !== target.parentText && visible(c) && c.paint.pointerEvents !== 'none' && !paintsNothing(c) && paintsAbove(c, layer(c), target, own)).map(c => overlap(outer, c)).filter(Boolean);
    for (const cover of hitPlaced) {
      if (related(cover.path, target.path) || cover.path === target.parentText || !visible(cover)) continue;
      if (!paintsAbove(cover, layer(cover), target, own)) continue;
      if (cover.paint.pointerEvents !== 'none') {
        const sure = inner && overlap(inner, cover);
        let ghost = sure && paintsNothing(cover) && !ownStretch(cover, target) && !unplacedPaint(cover) && !invisible(target) ? [sure] : [];
        for (const r of seenOver) ghost = ghost.flatMap(piece => subtract(piece, r));
        let seenPart = sure ? [sure] : [];
        for (const g of ghost) seenPart = seenPart.flatMap(piece => subtract(piece, g));
        for (const piece of ghost) report(findings, 'E_A11Y_INVISIBLE_BLOCKER', 'error', blockerMessage(target, cover), target, piece, { rule: 'invisible-blocker', cover: cover.path, why: paintsNothing(cover) });
        for (const piece of seenPart) report(findings, 'E_A11Y_OCCLUDED', 'error', `${target.box.label} (inline) is covered by ${cover.box.label}, which is painted later and receives the pointer`, target, piece, { rule: 'occluded-target', cover: cover.path });
        let maybe = overlap(outer, cover);
        if (maybe && sure) maybe = subtract(maybe, sure);
        for (const region of [maybe].flat().filter(Boolean)) report(unknowns, 'U_A11Y_OCCLUDED', 'unknown', `${target.box.label} (inline) may be covered by ${cover.box.label}: its measured text bounds touch the cover`, target, region, { rule: 'occluded-target', cover: cover.path });
      }
      if (seen(cover) && focusable(target)) {
        let region = intersect(target.region, cover.region);
        region = atMost(region, cover.origin.inline, outer.origin.inline); region = atMost(region, cover.origin.block, outer.origin.block);
        region = atMost(region, right(outer), right(cover)); region = atMost(region, bottom(outer), bottom(cover));
        if (region) report(findings, 'E_A11Y_FOCUS_OBSCURED', 'error', `${target.box.label} (inline) is entirely hidden behind ${cover.box.label} when focused`, target, region, { rule: 'focus-obscured', cover: cover.path });
      }
    }
  }

  // hidden-overridden: [hidden] is only a UA display: none, so an author display rule shows the element again.
  for (const row of geometry.filter(row => row.box.hiddenAttr === true))
    report(warnings, 'W_A11Y_HIDDEN_OVERRIDDEN', 'warning', `${row.box.label} has the hidden attribute but renders: an author display rule overrides [hidden] { display: none }`, row, row.region, { rule: 'hidden-overridden' });

  // Where a focusable box is while focused: a :focus rule that moves it by its insets (stateGeometry) splits its region
  // into the focused origin there and the base origin elsewhere; an unmodeled move is { unknown: true }.
  // Its focused z-index (a :focus rule may restack it) comes along as `zIndex`.
  const focusedPieces = base => {
    const changed = (base.focusStates ?? []).filter(state => state.origin || state.originUnknown || state.zIndex !== undefined);
    if (!changed.length) return [{ region: base.region, origin: base.origin, inline: base.inline, block: base.block, zIndex: base.zIndex }];
    return [...changed.map(state => ({ region: intersect(base.region, state.region), origin: state.origin ?? base.origin, inline: state.inline ?? base.inline, block: state.block ?? base.block, unknown: state.originUnknown, zIndex: state.zIndex !== undefined ? state.zIndex : base.zIndex })),
      ...changed.reduce((rest, state) => rest.flatMap(r => subtract(r, state.region)), [base.region]).map(region => ({ region, origin: base.origin, inline: base.inline, block: base.block, zIndex: base.zIndex }))].filter(piece => piece.region);
  };
  const focusedRows = rows => rows.flatMap(base => focusedPieces(base).filter(piece => !piece.unknown && piece.origin).map(piece => ({ ...base, region: piece.region, origin: piece.origin, inline: piece.inline, block: piece.block, zIndex: piece.zIndex })));

  // focus-clipped: overflow: clip does not scroll a focused descendant into view (hidden does; measured), so a
  // focusable box entirely outside the clip edge (its padding box) on a clipped axis can never be seen focused.
  const clipPlaced = everything.filter(row => row.clipOrigin && row.block).map(row => ({ ...row, origin: row.clipOrigin }));
  for (const target of focusedRows(clipPlaced.filter(row => focusable(row) && !hiddenFrom(row.path) && !row.box.pseudo))) {
    for (const clipper of clipPlaced.filter(row => clipsIt(row, target) && (row.clipAxes?.inline || row.clipAxes?.block))) {
      const edges = { left: sum(clipper.origin.inline, scalar(clipper.borders.left)), right: diff(right(clipper), scalar(clipper.borders.right)), top: sum(clipper.origin.block, scalar(clipper.borders.top)), bottom: diff(bottom(clipper), scalar(clipper.borders.bottom)) };
      const base = intersect(target.region, clipper.region);
      const outside = [
        ...(clipper.clipAxes.inline ? [atMost(base, right(target), edges.left), atMost(base, edges.right, target.origin.inline)] : []),
        ...(clipper.clipAxes.block ? [atMost(base, bottom(target), edges.top), atMost(base, edges.bottom, target.origin.block)] : []),
      ].filter(Boolean);
      for (const region of outside) report(findings, 'E_A11Y_FOCUS_CLIPPED', 'error', `${target.box.label} lies outside ${clipper.box.label}, whose overflow: clip never scrolls it into view when focused`, target, region, { rule: 'focus-clipped', clipper: clipper.path });
      if (outside.length) break;
    }
  }

  // focus-ring-clipped: the focus outline is drawn outside the box (by its width plus outline-offset; the UA ring at
  // least 1px), and an ancestor with overflow: clip cuts what passes its padding edge: a control flush with
  // that edge shows a cut-off ring. (A hidden scroller gives its children no placed positions here, so it is not judged.)
  for (const target of clipPlaced.filter(row => focusable(row) && !hiddenFrom(row.path) && !row.box.pseudo && row.focusStates?.length)) {
    if (findings.some(f => f.code === 'E_A11Y_FOCUS_CLIPPED' && f.path === target.path)) continue;
    const paint = target.focusStates[0].paint, author = target.focusStates[0].authorOutline;
    if (author && ['none', 'hidden'].includes(paint.outlineStyle)) continue;
    const px = v => /^-?\d+(?:\.\d+)?px$/.test(String(v)) ? Number.parseFloat(v) : /^0$/.test(String(v)) ? 0 : null;
    const width = author ? ({ thin: 1, medium: 3, thick: 5 })[String(paint.outlineWidth)] ?? px(paint.outlineWidth) : 1;
    const offset = author ? px(paint.outlineOffset ?? '0') ?? 0 : 0;
    if (width === null || width + offset <= 0) continue;
    const reach = q(String(width + offset));
    const clipper = [...clipPlaced].reverse().find(row => clipsIt(row, target) && row.overflow === 'clip');
    if (!clipper) continue;
    const edges = { left: sum(clipper.origin.inline, scalar(clipper.borders.left)), right: diff(right(clipper), scalar(clipper.borders.right)), top: sum(clipper.origin.block, scalar(clipper.borders.top)), bottom: diff(bottom(clipper), scalar(clipper.borders.bottom)) };
    const base = intersect(target.region, clipper.region);
    if (!base) continue;
    // A side is cut where the ring passes the edge: target − reach < left edge, target + reach > right edge, ….
    const cut = [
      clip(base, diff(edges.left, diff(target.origin.inline, scalar(reach))), true),
      clip(base, diff(sum(right(target), scalar(reach)), edges.right), true),
      clip(base, diff(edges.top, diff(target.origin.block, scalar(reach))), true),
      clip(base, diff(sum(bottom(target), scalar(reach)), edges.bottom), true),
    ].find(Boolean);
    if (cut && !warnings.some(w => w.code === 'W_A11Y_FOCUS_RING_CLIPPED' && w.path === target.path))
      report(warnings, 'W_A11Y_FOCUS_RING_CLIPPED', 'warning', `${target.box.label}'s focus ring (${width + offset}px outside it) is cut off by ${clipper.box.label}'s overflow at its edge. Give the container padding, or draw the ring inside (a negative outline-offset)`, target, cut, { rule: 'focus-ring-clipped', clipper: clipper.path });
  }

  // focus-clipped-away (SC 2.4.7): the visually-hidden pattern (clip: rect(0 0 0 0) on an absolute box, clip-path:
  // inset(50%)) on a focusable box or an ancestor, with no :focus rule that lifts it: focused, nothing of it shows.
  for (const row of geometry.filter(row => row.focusStates && visible(row) && !hiddenFrom(row.path) && row.chain)) {
    const ancestorsClip = row.chain.slice(0, -1).some(layer => layer.clippedAway);
    for (const state of row.focusStates) {
      const region = intersect(row.region, state.region);
      if (region && (ancestorsClip || state.paint.clippedAway)) report(findings, 'E_A11Y_FOCUS_CLIPPED_AWAY', 'error', `${row.box.label} takes focus but is clipped away (visually hidden) even when focused; reveal it on :focus`, row, region, { rule: 'focus-clipped-away' });
    }
  }

  // focus-offscreen: a focusable box entirely before the viewport's start edge (left: -9999px and the like). Overflow
  // toward negative coordinates is not scrollable, so unless a :focus rule moves it back by its insets, the focused
  // element is never on screen (SC 2.4.7). The root sits at the host insets.
  // A :focus rule that moves the box by its insets (stateGeometry) places it at the focused origin instead.
  for (const base of placed.filter(row => focusable(row) && !hiddenFrom(row.path) && !row.box.pseudo)) {
    for (const piece of focusedPieces(base)) {
    if (piece.unknown) { report(unknowns, 'U_A11Y_FOCUS_POSITION', 'unknown', `${base.box.label}: where its :focus rule moves it is not modeled here`, base, piece.region, { rule: 'focus-offscreen' }); continue; }
    const target = { ...base, region: piece.region, origin: piece.origin, inline: piece.inline, block: piece.block };
    const before = atMost(target.region, right(target), scalar(-hostInset)), above = block ? atMost(target.region, bottom(target), scalar(-hostBlockInset)) : null;
    const outside = [...(before ? [before] : []), ...(above ? (before ? subtract(above, before) : [above]) : [])];
    for (const region of outside) report(findings, 'E_A11Y_FOCUS_OFFSCREEN', 'error', `${target.box.label} takes focus but lies entirely off screen (before the viewport's start edge), so the focused element is never visible`, target, region, { rule: 'focus-offscreen' });
    }
  }

  // focus-obscured: a later painted box contains a focusable box. focus-area: nothing to show focus on.
  for (const target of focusedRows(placed.filter(focusable))) {
    const own = layer(target);
    for (const cover of placed) {
      if (related(cover.path, target.path) || !visible(cover) || !seen(cover)) continue;
      // A zero-size box is reported by focus-area, not as obscured.
      const above = layer(cover);
      if (!paintsAbove(cover, above, target, own)) continue;
      let region = intersect(target.region, cover.region);
      region = below(below(region, scalar(0), target.inline), scalar(0), target.block);
      region = atMost(region, cover.origin.inline, target.origin.inline); region = atMost(region, cover.origin.block, target.origin.block);
      region = atMost(region, right(target), right(cover)); region = atMost(region, bottom(target), bottom(cover));
      if (region) { report(findings, 'E_A11Y_FOCUS_OBSCURED', 'error', `${target.box.label} is entirely hidden behind ${cover.box.label} when focused`, target, region, { rule: 'focus-obscured', cover: cover.path }); break; }
    }
    for (const size of [target.inline, target.block]) {
      const region = atMost(target.region, size, scalar(0));
      if (region) { report(findings, 'E_A11Y_FOCUS_AREA', 'error', `${target.box.label} can take focus but has no area to show it`, target, region, { rule: 'focus-area' }); break; }
    }
  }


  // rotated-cover: a box rotated by an arbitrary angle is somewhere inside its circumscribed rectangle. A target or text
  // under that rectangle, painted below it, may be covered (Unknown), and targets inside it have no position (Unknown).
  for (const rotated of everything.filter(row => row.rotatedBounds && visible(row))) {
    const bounds = { ...rotated, ...rotated.rotatedBounds };
    for (const target of placed.filter(row => (interactive(row) || row.box.text) && visible(row) && !hiddenFrom(row.path) && !related(row.path, rotated.path))) {
      if (!paintsAbove(rotated, layer(rotated), target, layer(target))) continue;
      let region = intersect(target.region, rotated.region);
      region = below(region, bounds.origin.inline, right(target)); region = below(region, target.origin.inline, right(bounds));
      region = below(region, bounds.origin.block, bottom(target)); region = below(region, target.origin.block, bottom(bounds));
      if (region) report(unknowns, 'U_A11Y_ROTATED_COVER', 'unknown', `${target.box.label} lies under the circumscribed rectangle of the rotated ${rotated.box.label}; whether it is covered is not decided`, target, region, { rule: 'occluded-target', cover: rotated.path });
    }
  }
  for (const row of geometry.filter(row => row.rotatedBy && interactive(row) && visible(row) && !hiddenFrom(row.path)))
    report(unknowns, 'U_A11Y_ROTATED', 'unknown', `${row.box.label} is inside a box rotated by an arbitrary angle; its target geometry is not modeled`, row, row.region, { rule: 'target-size' });

  // text-obscured: a text box entirely under a later painted, fully opaque box (an overlay or badge laid over it) can't
  // be read. Translucent covers (alpha or opacity below 1) are left to the contrast rules.
  const opaque = row => { const c = parseColor(row.paint.backgroundColor); return c && c.a >= 1 && row.paint.backgroundImage === 'none' && opaqueValue(row.paint.opacity ?? '1') && row.chain.every(layer => opaqueValue(layer.opacity ?? '1')); };
  for (const target of placed.filter(row => row.box.text && visible(row) && !hiddenFrom(row.path) && !row.box.pseudo)) {
    const own = layer(target);
    for (const cover of placed) {
      if (related(cover.path, target.path) || !visible(cover) || !cover.painted || !opaque(cover)) continue;
      if (!paintsAbove(cover, layer(cover), target, own)) continue;
      let region = intersect(target.region, cover.region);
      region = below(below(region, scalar(0), target.inline), scalar(0), target.block);
      region = atMost(region, cover.origin.inline, target.origin.inline); region = atMost(region, cover.origin.block, target.origin.block);
      region = atMost(region, right(target), right(cover)); region = atMost(region, bottom(target), bottom(cover));
      if (region) { report(findings, 'E_A11Y_TEXT_OBSCURED', 'error', `${target.box.label}'s text is entirely hidden behind ${cover.box.label}`, target, region, { rule: 'text-obscured', cover: cover.path }); break; }
    }
  }
  // text-start-obscured: an opaque later-painted box over the point where
  // its text starts (ltr, text-align start/left: the first glyph sits at the content box's left edge, in the middle
  // of the first line) hides its first characters, whatever the text's width (a badge or overlay laid on a heading).
  const scrollersOf = target => placed.filter(row => row.scroller && clipsIt(row, target) && row.path !== root?.path && !row.box.documentRoot);
  for (const target of placed.filter(row => row.box.text && visible(row) && !hiddenFrom(row.path) && !row.box.pseudo && row.content && ['start', 'left'].includes(String(row.textAlign)) && row.direction !== 'rtl' && /^\d+(?:\.\d+)?px$/.test(String(row.lineHeight)))) {
    const own = layer(target), half = Number(String(target.lineHeight).slice(0, -2)) / 2;
    const x = sum(target.origin.inline, scalar(target.content.left)), y = sum(sum(target.origin.block, scalar(target.content.top)), scalar(q(String(half))));
    for (const cover of placed) {
      if (related(cover.path, target.path) || !visible(cover) || !cover.painted || !opaque(cover)) continue;
      if (!paintsAbove(cover, layer(cover), target, own)) continue;
      let region = intersect(target.region, cover.region);
      region = below(below(region, scalar(0), target.inline), scalar(0), target.block);
      // The cover holds [x, x + 2] × [y − 1, y + 1].
      region = atMost(region, cover.origin.inline, x); region = atMost(region, sum(x, scalar(2)), right(cover));
      region = atMost(region, cover.origin.block, diff(y, scalar(1))); region = atMost(region, sum(y, scalar(1)), bottom(cover));
      // At scroll offset 0 a text start inside a scroll container is seen only within that container's box.
      if (scrollZero) for (const s of scrollersOf(target)) { region = atMost(region, s.origin.inline, x); region = atMost(region, sum(x, scalar(2)), right(s)); region = atMost(region, s.origin.block, diff(y, scalar(1))); region = atMost(region, sum(y, scalar(1)), bottom(s)); }
      if (region) {
        report(findings, 'E_A11Y_TEXT_START_OBSCURED', 'error', `the start of ${target.box.label}'s text is hidden behind ${cover.box.label} (it covers where the first line begins); move ${cover.box.label} off the text or give the text room (padding) beside it`, target, region, { rule: 'text-start-obscured', cover: cover.path });
        break;
      }
    }
  }

  // text-line-obscured: an opaque box over the part of a text's first line that its glyphs are sure to reach. On one
  // line the text is at least its shaped advance long (Chromium renders it within [advance, bound]); wrapped, greedy
  // breaking fills the first line to more than the content width less its longest word and a space (bounded by 0.5em).
  // A cover that overlaps that stretch of the first line by at least 1px on both axes hides glyphs (a close button laid
  // over the end of a notice's first line). Only measured text (a font contract), left-aligned ltr, px line-height.
  {
    const onePx = q(1);
    for (const target of placed.filter(row => row.box.text && visible(row) && !hiddenFrom(row.path) && !row.box.pseudo && row.content && row.box.contract?.textMetrics?.kind && ['start', 'left'].includes(String(row.textAlign)) && row.direction !== 'rtl' && /^\d+(?:\.\d+)?px$/.test(String(row.lineHeight)))) {
      if (findings.some(f => ['E_A11Y_TEXT_START_OBSCURED', 'E_A11Y_TEXT_OBSCURED'].includes(f.code) && f.path === target.path)) continue;
      const metrics = target.box.contract.textMetrics, lineHeight = q(String(target.lineHeight).slice(0, -2)), fontSize = px(target.paint.fontSize);
      const advance = metrics.kind === 'domain' ? null : metrics.width;
      if (advance === undefined || advance === null || fontSize === undefined) continue;
      const x = sum(target.origin.inline, scalar(target.content.left)), y = sum(target.origin.block, scalar(target.content.top));
      const oneLine = target.box.contract.maxInlineSize !== undefined ? q(String(target.box.contract.maxInlineSize)) : null;
      const word = metrics.minContent !== undefined ? q(String(Math.ceil(metrics.minContent * 1e6) / 1e6)) : null;
      for (const cover of placed) {
        if (related(cover.path, target.path) || !visible(cover) || !cover.painted || !opaque(cover)) continue;
        if (!paintsAbove(cover, layer(cover), target, layer(target))) continue;
        let base = intersect(target.region, cover.region);
        // The first line band [y, y + lineHeight] and the cover overlap by at least 1px.
        base = atMost(base, sum(cover.origin.block, scalar(onePx)), sum(y, scalar(lineHeight))); base = atMost(base, sum(y, scalar(onePx)), bottom(cover));
        base = atMost(base, sum(x, scalar(onePx)), right(cover));
        if (!base) continue;
        const pieces = [];
        // One line (the content holds the whole text): the glyphs reach x + advance.
        const single = oneLine === null ? null : atMost(base, scalar(oneLine), target.content.inline);
        // (rounded down to 6 decimals: a shorter reach is the conservative side)
        if (single) pieces.push(atMost(single, sum(cover.origin.inline, scalar(onePx)), sum(x, scalar(q(String(Math.floor(advance * 1e6) / 1e6))))));
        // Wrapped (narrower than one line): the first line reaches past x + content − longest word − 0.5em.
        if (oneLine !== null && word !== null) {
          const wrapped = atMost(base, sum(target.content.inline, scalar(onePx)), scalar(oneLine));
          if (wrapped) pieces.push(atMost(wrapped, sum(sum(cover.origin.inline, scalar(onePx)), sum(scalar(word), scalar(div(q(String(fontSize)), q(2))))), sum(x, target.content.inline)));
        }
        let region = pieces.find(Boolean);
        // At scroll offset 0, only the part of the first line inside its scroll containers' boxes is seen.
        if (region && scrollZero) for (const sc of scrollersOf(target)) { region = atMost(region, sc.origin.inline, right(cover)); region = atMost(region, cover.origin.inline, right(sc)); region = atMost(region, sc.origin.block, sum(y, scalar(lineHeight))); region = atMost(region, y, bottom(sc)); }
        if (region) { report(findings, 'E_A11Y_TEXT_LINE_OBSCURED', 'error', `${target.box.label}'s first line runs under ${cover.box.label} where its text is sure to reach: the words under it are hidden. Give the text room beside ${cover.box.label} (padding on that side)`, target, region, { rule: 'text-start-obscured', cover: cover.path }); break; }
      }
    }
  }

  // Text inside a scroll container has no position here (it depends on the scroll offset), so the cover rules above do
  // not see it. Where an opaque box outside the scroll container paints over part of it, whether that text is covered
  // is not checked: Unknown, never a silent pass (a carousel's arrow buttons over its scrolling slides).
  const sliver = div(q(1), q(64));
  // The same inside a box that clips its overflow without scrolling (overflow: clip): the text has an exact position, but
  // the rules above do not take what the clip cuts off from it. And a fixed box inside the container escapes its overflow
  // (it is not scrolled or clipped with the text): it counts as outside.
  for (const s of everything.filter(row => row.overflowClips && located(row) && row.path !== root?.path && !row.box.documentRoot).map(located)) {
    const texts = geometry.filter(row => clipsIt(s, row) && row.box.text && visible(row) && !hiddenFrom(row.path) && !row.origin);
    if (!texts.length) continue;
    const port = paddingBox(s);
    for (const cover of occlusionRows) {
      if (cover.path === s.path || isAncestor(cover.path, s.path) || clipsIt(s, cover) || !visible(cover) || !cover.painted || !opaque(cover)) continue;
      if (!paintsAbove(cover, layer(cover), s, layer(s))) continue;
      let region = intersect(s.region, cover.region);
      region = atMost(region, sum(s.origin.inline, scalar(sliver)), right(cover)); region = atMost(region, sum(cover.origin.inline, scalar(sliver)), right(s));
      region = atMost(region, sum(s.origin.block, scalar(sliver)), bottom(cover)); region = atMost(region, sum(cover.origin.block, scalar(sliver)), bottom(s));
      // Where the cover is under the pointer (its own clipping ancestors applied; Unknown kept where one has no
      // position), and only the viewport ranges in which the box holds the text.
      const visibleParts = region ? visibleOverlap(port, cover) : [];
      const pieces = !region ? [] : visibleParts === null ? [region] : visibleParts.map(piece => intersect(piece, region)).filter(Boolean);
      const hit = pieces.filter(piece => texts.some(t => intersect(t.region, piece)));
      for (const piece of hit) report(unknowns, 'U_A11Y_SCROLLED_COVER', 'unknown', s.scroller ? `${cover.box.label} paints over part of ${s.box.label}, a scroll container (overflow: ${s.overflowValue}): whether it covers the text inside is not checked (positions there depend on the scroll offset). Keep controls outside the scrolling area, or give the content room beside them` : `${cover.box.label} paints over part of ${s.box.label}, which clips its overflow (overflow: clip): whether it covers the text inside is not checked. Keep the covering box off it, or give the content room beside it`, s, piece, { rule: 'text-start-obscured', cover: cover.path });
      if (hit.length) break;
    }
  }

  // scroll-end-covered: positions at scroll offset 0 (scrollZero) give the whole scroll range of a vertical scroller:
  // scrolling by t moves its content up by t, up to the maximum, where the content's end (its last box's bottom plus the
  // scroller's padding) meets the bottom of the scrollport. A box at the end of the content that an opaque box outside
  // the scroller covers even there is covered at every offset: it can never be seen (a fixed action bar over the last
  // list item). (Content shorter than the scrollport does not scroll: covered at 0 is covered for good.)
  // The same on the inline axis (a carousel whose last slide stays under its next-arrow scrolled to the end). On each
  // axis the content must not overflow the other one (a scroll there would move the box out from under the cover).
  const axes = {
    block: { start: row => row.origin.block, size: row => row.block, end: bottom, pad: s => s.paddingBlockEnd, border: s => s.borders.bottom,
      crossStart: row => row.origin.inline, crossEnd: right, crossPad: s => s.paddingInlineEnd, crossBorder: s => s.borders.right },
    inline: { start: row => row.origin.inline, size: row => row.inline, end: right, pad: s => s.paddingInlineEnd, border: s => s.borders.right,
      crossStart: row => row.origin.block, crossEnd: bottom, crossPad: s => s.paddingBlockEnd, crossBorder: s => s.borders.bottom },
  };
  if (scrollZero) for (const s of placed.filter(row => row.overflow === 'scroll' && row.path !== root?.path && !row.box.documentRoot && ['auto', 'scroll'].includes(String(row.overflowValue)) && row.paddingBlockEnd !== undefined && row.paddingInlineEnd !== undefined && row.direction !== 'rtl')) {
    const inside = placed.filter(row => isAncestor(s.path, row.path) && row.origin && visible(row) && !hiddenFrom(row.path) && row.position !== 'fixed');
    for (const [axisName, a] of Object.entries(axes)) {
      const innerEnd = diff(a.end(s), scalar(a.border(s))), crossInnerEnd = diff(a.crossEnd(s), scalar(a.crossBorder(s)));
      for (const target of inside.filter(row => (row.box.text || focusable(row)) && !row.box.pseudo)) {
        let base = target.region;
        // Nothing overflows the other axis (it does not scroll there).
        let crossOk = target.region;
        for (const other of inside) { crossOk = atMost(crossOk, sum(a.crossEnd(other), scalar(a.crossPad(s))), crossInnerEnd); if (!crossOk) break; }
        if (!crossOk) continue;
        // A box anywhere in the content (not only its end): scrolled to the end, the content moves by its end minus the
        // scrollport's end, so a box whose start is at or past the cover's start at offset 0, with no more than the
        // cover's extent of content after its start, stays under a cover that reaches the scrollport's end at every
        // offset (and earlier offsets put it further in, or past the end).
        const middle = cover => {
          let r = atMost(atMost(atMost(crossOk, a.crossStart(cover), a.crossStart(target)), a.crossEnd(target), a.crossEnd(cover)), a.start(cover), a.start(target));
          if (r) r = atMost(r, innerEnd, a.end(cover));
          for (const other of inside) { if (!r) break; r = atMost(r, sum(a.end(other), scalar(a.pad(s))), sum(a.start(target), diff(innerEnd, a.start(cover)))); }
          return r;
        };
        // The target is the content's end on this axis.
        for (const other of inside) {
          if (!base) break;
          if (other !== target && !isAncestor(other.path, target.path)) base = atMost(base, a.end(other), a.end(target));
          if (base) base = atMost(base, sum(a.crossEnd(other), scalar(a.crossPad(s))), crossInnerEnd);
        }
        if (!base) {
          for (const cover of placed) {
            if (related(cover.path, s.path) || !visible(cover) || !cover.painted || !opaque(cover) || !cover.origin || !paintsAbove(cover, layer(cover), s, layer(s))) continue;
            const r = middle(cover);
            if (r) report(findings, 'E_A11Y_SCROLL_END_COVERED', 'error', `${target.box.label} is near the ${axisName === 'block' ? 'bottom' : 'end'} of ${s.box.label}'s scrolling content, and ${cover.box.label} covers it at every scroll offset, even scrolled to the ${axisName === 'block' ? 'bottom' : 'end'} (less content follows it than ${cover.box.label} covers): it can never be seen. Give ${s.box.label} a ${axisName === 'block' ? 'padding-bottom' : 'padding-inline-end'} at least as ${axisName === 'block' ? 'tall' : 'wide'} as ${cover.box.label}`, target, r, { rule: 'scroll-end-covered', cover: cover.path, coverBox: cover.box.label, scroller: s.box.label, axis: axisName, part: 'within' });
          }
          continue;
        }
        const contentEnd = sum(a.end(target), scalar(a.pad(s)));
        for (const cover of placed) {
          if (related(cover.path, s.path) || !visible(cover) || !cover.painted || !opaque(cover) || !cover.origin) continue;
          if (!paintsAbove(cover, layer(cover), s, layer(s))) continue;
          // The cover spans the target on the other axis.
          const region = atMost(atMost(base, a.crossStart(cover), a.crossStart(target)), a.crossEnd(target), a.crossEnd(cover));
          // No overflow: the target stays where it is.
          const still = region && atMost(atMost(atMost(region, contentEnd, innerEnd), a.start(cover), a.start(target)), a.end(target), a.end(cover));
          // Overflow: scrolled to the end, the target ends at innerEnd − padding.
          const lifted = diff(innerEnd, scalar(a.pad(s)));
          const scrolled = region && atMost(atMost(atMost(region, innerEnd, contentEnd), a.start(cover), diff(lifted, a.size(target))), lifted, a.end(cover));
          // Partly covered: the start of the first line of text (its first glyph) stays under a cover that reaches the
          // end of the scrollport, at the end of the scroll range and so at every offset (earlier offsets put the text
          // further into the cover or past the end): the text never shows its start. Block axis, ltr start-aligned text.
          if (!still && !scrolled && axisName === 'block' && target.box.text && target.content && /^\d+(?:\.\d+)?px$/.test(String(target.lineHeight)) && ['start', 'left'].includes(String(target.textAlign)) && target.direction !== 'rtl') {
            const half = scalar(div(q(String(target.lineHeight).slice(0, -2)), q(2))), x = sum(target.origin.inline, scalar(target.content.left));
            const coversStart = r0 => atMost(atMost(atMost(r0, cover.origin.inline, x), sum(x, scalar(sliver)), right(cover)), innerEnd, a.end(cover));
            const startAt = top => sum(sum(top, scalar(target.content.top)), half);
            const stillStart = coversStart(atMost(atMost(base, contentEnd, innerEnd), cover.origin.block, startAt(target.origin.block)));
            const scrolledStart = coversStart(atMost(atMost(base, innerEnd, contentEnd), cover.origin.block, startAt(diff(diff(innerEnd, scalar(a.pad(s))), target.block))));
            for (const r of [stillStart, scrolledStart].filter(Boolean))
              report(findings, 'E_A11Y_SCROLL_END_COVERED', 'error', `the start of ${target.box.label}'s text, at the bottom of ${s.box.label}'s scrolling content, stays under ${cover.box.label} at every scroll offset, even scrolled to the bottom: its first words can never be read. Give ${s.box.label} a padding-bottom at least as tall as ${cover.box.label}`, target, r, { rule: 'scroll-end-covered', cover: cover.path, coverBox: cover.box.label, scroller: s.box.label, axis: axisName, part: 'text-start' });
          }
          for (const r of [still, scrolled].filter(Boolean))
            report(findings, 'E_A11Y_SCROLL_END_COVERED', 'error', `${target.box.label} is at the ${axisName === 'block' ? 'bottom' : 'end'} of ${s.box.label}'s scrolling content, and ${cover.box.label} covers it at every scroll offset, even scrolled to the ${axisName === 'block' ? 'bottom' : 'end'}: it can never be seen. Give ${s.box.label} a ${axisName === 'block' ? 'padding-bottom' : 'padding-inline-end'} at least as ${axisName === 'block' ? 'tall' : 'wide'} as ${cover.box.label}`, target, r, { rule: 'scroll-end-covered', cover: cover.path, coverBox: cover.box.label, scroller: s.box.label, axis: axisName });
        }
      }
    }
  }

  // page-start-unreachable: the page scrolls only down and right from its top-left corner, so in-flow content laid out
  // above its top (or left of its left, ltr) is never seen: the usual cause is centering content that is taller than
  // the viewport (body { height: 100vh; display: flex; justify-content: center }, measured: the top of the content is
  // cut off and unreachable). Absolute boxes moved off on purpose (skip links, left: -9999px) are not in-flow.
  for (const target of geometry.filter(row => row.origin && (row.box.text || focusable(row)) && visible(row) && !hiddenFrom(row.path) && !row.box.pseudo && !row.paint?.hiddenVisually && ['static', 'relative'].includes(row.position) && !scrollersOf(row).length)) {
    if (geometry.some(a => isAncestor(a.path, target.path) && ['absolute', 'fixed', 'sticky'].includes(a.position))) continue;
    for (const [edge, region] of [['top', atMost(target.region, sum(target.origin.block, scalar(sliver)), scalar(0))], ...(target.direction !== 'rtl' ? [['left', atMost(target.region, sum(target.origin.inline, scalar(sliver)), scalar(0))]] : [])])
      if (region) report(findings, 'E_A11Y_PAGE_START_UNREACHABLE', 'error', `${target.box.label} starts above the ${edge} edge of the page, which never scrolls past it: that part of it can never be seen. Center tall content safely (justify-content: safe center, align-items: safe center, or margin: auto), or let the page grow (min-height instead of height)`, target, region, { rule: 'page-start-unreachable', edge });
  }

  // behind-background: a negative z-index layer is painted just above the background of the stacking context it
  // belongs to, and below the in-flow boxes inside that context, their backgrounds included (CSS 2.2 Appendix E;
  // measured: z-index: -1 text in a grid with background #eee is not seen). An opaque background of a box between that
  // context and the layer hides it. (The root's background is the canvas; with none, body's is, under every layer.)
  {
    const htmlRow = geometry.find(row => row.box.tag === 'html');
    const canvasBody = htmlRow && !htmlRow.painted;
    for (const target of geometry.filter(row => (row.box.text || focusable(row)) && visible(row) && !hiddenFrom(row.path) && !row.box.pseudo)) {
      const chain = contexts(target), at = chain.findLastIndex(r => (r.zIndex ?? 0) < 0 && r.zIndex !== null && r.zIndex !== undefined);
      if (at < 0) continue;
      const layerRow = chain[at], within = at > 0 ? chain[at - 1].path : '';
      for (let p = parentPath(layerRow.path); p && p !== within; p = parentPath(p)) {
        const a = rowAt(p);
        if (!a || !a.painted || !opaque(a) || a.box.tag === 'html' || (canvasBody && a.box.tag === 'body') || a.position !== 'static') continue;
        report(findings, 'E_A11Y_BEHIND_BACKGROUND', 'error', `${target.box.label} is in ${layerRow.box.label}'s z-index: ${layerRow.zIndex} layer, which is painted under the background of ${a.box.label} (a negative z-index goes below the boxes of its stacking context): it is not seen. Give ${a.box.label} isolation: isolate (or position: relative with z-index: 0) so the layer stays inside it, or drop the negative z-index`, target, target.region, { rule: 'behind-background', cover: a.box.label, layer: layerRow.box.label });
        break;
      }
    }
  }

  // scroll-start-unreachable: a scroll container scrolls its content only towards its end (offsets ≥ 0), so content
  // laid out before its start edge (above the top, or left of the left in ltr) is never scrolled into view (measured:
  // justify-content: center in an overflowing column flex puts the first item 20px above the top, and scrollHeight
  // leaves it out). The usual cause: center or end alignment of content that overflows (use safe center).
  if (scrollZero) for (const target of placed.filter(row => row.origin && (row.box.text || focusable(row)) && !row.box.pseudo && visible(row) && !hiddenFrom(row.path) && row.position !== 'fixed')) {
    const s = scrollersOf(target).filter(row => ['auto', 'scroll'].includes(String(row.overflowValue)) && row.direction !== 'rtl' && row.origin).at(-1);
    if (!s) continue;
    const top = sum(s.origin.block, scalar(s.borders.top)), left = sum(s.origin.inline, scalar(s.borders.left));
    for (const [edge, region] of [['top', atMost(target.region, sum(target.origin.block, scalar(sliver)), top)], ['left', atMost(target.region, sum(target.origin.inline, scalar(sliver)), left)]])
      if (region) report(findings, 'E_A11Y_SCROLL_START_UNREACHABLE', 'error', `${target.box.label} starts before the ${edge} edge of ${s.box.label}, a scroll container, which never scrolls back past its start: that part of it can never be seen. Align the overflowing content safely (justify-content: safe center, or margin: auto) instead of center or end`, target, region, { rule: 'scroll-start-unreachable', scroller: s.box.label, edge });
  }

  // focus-scrolled-under (SC 2.4.11): Chromium scrolls a keyboard-focused element only when it is not already inside
  // the scrollport shrunk by the viewport's scroll-padding (its box grown by its scroll-margin; measured). So if some
  // scroll position puts the element inside that area but entirely behind a position: fixed bar, Tab lands on it there
  // and nothing reveals it. Positions are scroll offsets s in [0, page height - viewport height]: the element's
  // viewport top y = top - s; the bar stays at its viewport place.
  const fixedBars = placed.filter(row => row.fixed && visible(row) && seen(row));
  // A sticky (top: 0) bar is stuck at the viewport top for s in [its page top, its parent's bottom − its height].
  const stickyBars = placed.filter(row => row.sticky && row.sticky.parent && visible(row) && seen(row));
  // autofocus: on load the browser focuses the first autofocus candidate that can take focus — one not rendered or
  // not visible there (display: none, visibility: hidden, aria-hidden is not a reason) is skipped for the next
  // (measured in Chromium). Where no candidate can, nothing takes focus (W_A11Y_AUTOFOCUS_HIDDEN); a later candidate
  // is ignored where an earlier one takes focus (W_A11Y_AUTOFOCUS_MULTIPLE).
  const autofocused = all.filter(box => box.autofocus === true && !box.pseudo);
  const shownAt = box => geometry.filter(row => row.path === box.path && visible(row)).map(row => row.region);
  let earlier = [];
  for (const [i, box] of autofocused.entries()) {
    const ignored = earlier.find(Boolean);
    if (i > 0 && ignored) report(warnings, 'W_A11Y_AUTOFOCUS_MULTIPLE', 'warning', `${box.label} has autofocus, but an earlier autofocus element (${autofocused[0].label}) takes focus here: only one autofocus applies`, whole(box), ignored, { rule: 'autofocus' });
    // Where this one takes focus and its bottom edge is below the viewport, the page opens scrolled to it (Chromium
    // scrolls it into view on load: minimally when partly visible, to the centre when wholly below; measured).
    if (block && viewportBlock) {
      let takes = shownAt(box);
      for (const region of earlier) takes = takes.flatMap(r => subtract(r, region));
      for (const row of placed.filter(row => row.path === box.path && visible(row))) for (const piece of takes) {
        const shared = intersect(piece, row.region), below = shared && clip(shared, diff(sum(row.origin.block, row.block), viewportBlock), true);
        if (below && !warnings.some(w => w.code === 'W_A11Y_AUTOFOCUS_SCROLLS' && w.path === box.path)) report(warnings, 'W_A11Y_AUTOFOCUS_SCROLLS', 'warning', `${box.label} has autofocus and ends below the viewport here: the page opens scrolled down to it, past what is above`, row, below, { rule: 'autofocus' });
      }
    }
    earlier = [...earlier, ...shownAt(box)];
  }
  if (autofocused.length) {
    let none = [domain];
    for (const region of earlier) none = none.flatMap(r => subtract(r, region));
    const at = none.find(Boolean);
    if (at) report(warnings, 'W_A11Y_AUTOFOCUS_HIDDEN', 'warning', `${autofocused.map(b => b.label).join(', ')} ${autofocused.length > 1 ? 'have' : 'has'} autofocus but ${autofocused.length > 1 ? 'none is' : 'it is not'} rendered and visible here, so nothing takes focus on load`, whole(autofocused[0]), at, { rule: 'autofocus' });
  }
  // bar-transparent: a sticky or fixed bar with text but no opaque background (transparent or translucent, no
  // background image): content scrolling under it shows through and runs into the bar's text.
  for (const bar of placed.filter(row => (row.fixed || row.sticky?.parent) && visible(row) && !row.box.pseudo)) {
    const color = parseColor(bar.paint.backgroundColor);
    if (bar.paint.backgroundImage !== 'none' || (color && color.a >= 1) || warnings.some(w => w.code === 'W_A11Y_BAR_TRANSPARENT' && w.path === bar.path)) continue;
    // Opaque descendants paint their own backdrop; only text over the bar's see-through part counts.
    const text = everything.filter(row => isAncestor(bar.path, row.path) && speaks(row) && !everything.some(b => b.path !== bar.path && (isAncestor(b.path, row.path) || b.path === row.path) && isAncestor(bar.path, b.path) && (parseColor(b.paint.backgroundColor)?.a ?? 0) >= 1));
    if (!text.length) continue;
    const scope = bar.sticky?.parent;
    const under = placed.some(c => c.path !== bar.path && !related(c.path, bar.path) && visible(c) && (c.painted || speaks(c)) && (!scope || isAncestor(scope, c.path)));
    if (under) report(warnings, 'W_A11Y_BAR_TRANSPARENT', 'warning', `${bar.box.label} is ${bar.fixed ? 'fixed' : 'sticky'} with ${color && color.a > 0 ? 'a translucent' : 'no'} background: the content scrolling under it shows through its text. Give it an opaque background`, bar, bar.region, { rule: 'bar-transparent' });
  }
  // bar-covered: a sticky or fixed bar with z-index auto is one more positioned layer, painted in tree order with the
  // others; a positioned (or stacking-context) box later in the tree with a background paints over it as the page
  // scrolls the box under the bar — cards that slide over the header. Its fix is a z-index on the bar.
  for (const bar of [...stickyBars, ...fixedBars]) {
    if (warnings.some(w => w.code === 'W_A11Y_BAR_COVERED' && w.path === bar.path)) continue;
    const scope = bar.sticky?.parent;
    const cover = placed.find(c => c.path !== bar.path && !related(c.path, bar.path) && treeOrder(c.path, bar.path) > 0 && visible(c) && c.painted && !c.fixed && !c.sticky
      && (c.position !== 'static' || createsContext(c)) && (!scope || isAncestor(scope, c.path)) && paintsAbove(c, layer(c), bar, layer(bar)));
    if (cover) report(warnings, 'W_A11Y_BAR_COVERED', 'warning', `${bar.box.label} is ${bar.fixed ? 'fixed' : 'sticky'} with z-index auto, and ${cover.box.label} later in the page is ${cover.position !== 'static' ? `position: ${cover.position}` : 'a stacking context'}: it paints over the bar as it scrolls under it. Give ${bar.box.label} a z-index`, bar, bar.region, { rule: 'bar-covered', cover: cover.box.label });
  }
  if ((fixedBars.length || stickyBars.length) && block && viewportBlock) {
    const length = value => value === undefined || value === 'auto' ? 0 : Number(String(value).replace(/px$/, ''));
    const rootRow = geometry.find(row => row.path === root.path && row.origin && row.block);
    const viewportPadding = ['html'].includes(root.tag) ? rootRow?.paint.scrollPadding : scrollPaddingDeclared ? null : { top: 'auto', bottom: 'auto' };
    if (!viewportPadding || !rootRow) report(unknowns, 'U_A11Y_SCROLL_PADDING', 'unknown', 'the viewport\'s scroll-padding is set outside the analyzed root, so where a focused element scrolls behind a fixed bar is unknown', whole(root), domain, { rule: 'focus-scrolled-under' });
    else {
      const obscured = new Set(findings.filter(d => d.code === 'E_A11Y_FOCUS_OBSCURED').map(d => d.path));
      const maxScroll = diff(bottom(rootRow), viewportBlock);
      const insideFixed = path => [...fixedBars, ...stickyBars].some(bar => isAncestor(bar.path, path) || bar.path === path);
      const stuck = stickyBars.flatMap(bar => placed.filter(p => p.path === bar.sticky.parent).map(parent => ({ ...bar, region: intersect(bar.region, parent.region), origin: { inline: bar.origin.inline, block: scalar(0) }, stickyFrom: bar.origin.block, stickyUntil: diff(bottom(parent), bar.block) })).filter(bar => bar.region));
      for (const target of focusedRows(placed.filter(row => focusable(row) && !hiddenFrom(row.path) && !row.box.pseudo && !insideFixed(row.path) && !obscured.has(row.path)))) {
        const margin = target.paint.scrollMargin ?? {}, own = layer(target);
        for (const bar of [...fixedBars, ...stuck]) {
          if (related(bar.path, target.path) || !paintsAbove(bar, layer(bar), target, own)) continue;
          let region = intersect(target.region, bar.region);
          // Stuck only for s ≥ its page top and s ≤ its parent's bottom − its height (s = target top − y).
          region = atMost(region, bar.origin.inline, target.origin.inline);
          region = atMost(region, right(target), right(bar));
          const lows = [bar.origin.block, scalar(length(viewportPadding.top) + length(margin.top)), diff(target.origin.block, maxScroll), ...(bar.stickyUntil ? [diff(target.origin.block, bar.stickyUntil)] : [])];
          const highs = [diff(bottom(bar), target.block), diff(sum(viewportBlock, scalar(-length(margin.bottom) - length(viewportPadding.bottom))), target.block), target.origin.block, ...(bar.stickyFrom ? [diff(target.origin.block, bar.stickyFrom)] : [])];
          for (const low of lows) for (const high of highs) region = atMost(region, low, high);
          if (!region) continue;
          report(findings, 'E_A11Y_FOCUS_SCROLLED_UNDER', 'error', `${target.box.label} can be focused while entirely behind the ${bar.sticky ? 'sticky' : 'fixed'} ${bar.box.label} (the page does not scroll it out); add scroll-padding to the viewport or scroll-margin to the element`, target, region, { rule: 'focus-scrolled-under', cover: bar.path });
          break;
        }
      }
    }
  }

  // visual-presentation (SC 1.4.8, AAA; only when an AAA level is asked): a text block that wraps (taller than one line)
  // and is justified, or whose line spacing is below 1.5 × its font size. line-height normal uses the font contract's
  // line height when there is one; otherwise it is noted, not judged.
  if (contrast === 'AAA' || targetLevel === 'AAA') {
    let normalSkipped = false;
    for (const row of placed.filter(row => row.box.text && visible(row) && row.block)) {
      const size = Number(String(row.fontSize).replace(/px$/, '')), value = String(row.lineHeight ?? 'normal');
      if (!(size > 0)) continue;
      const m = /^(\d+(?:\.\d+)?|\.\d+)(px|%|em)?$/.exec(value);
      const contractLine = row.box.contract?.font?.lineHeight;
      const ratio = m ? (m[2] === 'px' ? Number(m[1]) / size : m[2] === '%' ? Number(m[1]) / 100 : Number(m[1])) : value === 'normal' && contractLine ? contractLine / size : null;
      if (ratio === null) { normalSkipped = true; continue; }
      // Line length (SC 1.4.8: no more than 80 characters): measured text longer than that, in a box wider than 80 of its
      // average characters (its measured width over its length), has lines longer than 80 characters there (one long
      // line or wrapped ones).
      const measured = row.box.contract?.textMetrics;
      if (['content', 'lines'].includes(measured?.kind) && typeof measured.text === 'string' && [...measured.text].length > 80 && measured.width > 0) {
        const chars = [...measured.text].length, average = measured.width / chars;
        const long = below(row.region, scalar(Math.round(80 * average * 64) / 64), row.inline);
        if (long && !warnings.some(w => w.code === 'W_A11Y_LINE_LENGTH' && w.path === row.path)) report(warnings, 'W_A11Y_LINE_LENGTH', 'warning', `${row.box.label} has lines longer than 80 characters (its box is wider than 80 × its average character width, ${Math.round(80 * average)}px) (SC 1.4.8)`, row, long, { rule: 'visual-presentation' });
      }
      const wraps = below(row.region, scalar(ratio * size), row.block);
      if (!wraps) continue;
      if (row.textAlign === 'justify') report(warnings, 'W_A11Y_JUSTIFIED', 'warning', `${row.box.label} is justified text that wraps (SC 1.4.8)`, row, wraps, { rule: 'visual-presentation' });
      if (ratio < 1.5) report(warnings, 'W_A11Y_LINE_SPACING', 'warning', `${row.box.label} wraps with line spacing ${Math.round(ratio * 100) / 100} × its font size, below 1.5 (SC 1.4.8)`, row, wraps, { rule: 'visual-presentation' });
    }
    if (normalSkipped) notes.push('visual-presentation: text with line-height normal and no font contract is not checked for SC 1.4.8 line spacing');
  }

  // fixed-hides-content: a fixed bar that touches the viewport's top (bottom) edge and entirely covers content at scroll
  // position 0 (the largest scroll position) covers it at every scroll position: scrolling only moves the content
  // further behind it or out of the viewport, so it can never be read or reached (a fixed footer without page padding).
  // A sticky bar never does: at scroll 0 it is in flow beside the content, and scrolling back always uncovers it.
  if (fixedBars.length && block && viewportBlock) {
    const rootRow = geometry.find(row => row.path === root.path && row.origin && row.block);
    const insideFixed = path => fixedBars.some(bar => isAncestor(bar.path, path) || bar.path === path);
    const content = placed.filter(row => (row.box.text || interactive(row)) && visible(row) && !row.box.pseudo && !insideFixed(row.path) && row.inline && row.block);
    for (const target of rootRow ? content : []) {
      const own = layer(target), hidden = [];
      for (const bar of fixedBars) {
        if (related(bar.path, target.path) || !paintsAbove(bar, layer(bar), target, own)) continue;
        let base = intersect(target.region, bar.region);
        base = atMost(base, bar.origin.inline, target.origin.inline);
        base = atMost(base, right(target), right(bar));
        // At s = 0 under a bar at the top edge; at s = max(0, page - viewport) under a bar at the bottom edge.
        const covered = (region, shift) => { region = atMost(region, bar.origin.block, diff(target.origin.block, shift)); return atMost(region, diff(bottom(target), shift), bottom(bar)); };
        const top = covered(atMost(base, bar.origin.block, scalar(0)), scalar(0));
        const atBottom = atMost(base, viewportBlock, bottom(bar));
        const short = covered(atMost(atBottom, bottom(rootRow), viewportBlock), scalar(0));
        const tall = covered(atMost(atBottom, viewportBlock, bottom(rootRow)), diff(bottom(rootRow), viewportBlock));
        const regions = [top, short, tall].filter(Boolean);
        if (!regions.length) continue;
        for (const region of regions) report(findings, 'E_A11Y_FIXED_HIDES', 'error', `${target.box.label} stays entirely behind the fixed ${bar.box.label} at every scroll position; pad the page by the bar's size`, target, region, { rule: 'fixed-hides-content', cover: bar.path });
        hidden.push(...regions);
        break;
      }
      // A bar on the left edge spanning the viewport's height covers what lies within its width at every vertical
      // scroll, and scrolling right only moves content further left (a fixed sidebar laid over the page).
      for (const bar of hidden.length ? [] : fixedBars) {
        if (related(bar.path, target.path) || !paintsAbove(bar, layer(bar), target, own)) continue;
        let region = intersect(target.region, bar.region);
        region = atMost(region, bar.origin.inline, scalar(0)); region = atMost(region, bar.origin.block, scalar(0)); region = atMost(region, viewportBlock, bottom(bar));
        region = atMost(region, bar.origin.inline, target.origin.inline); region = atMost(region, right(target), right(bar));
        for (const piece of region ? hidden.reduce((rest, done) => rest.flatMap(r => subtract(r, done)), [region]) : []) {
          report(findings, 'E_A11Y_FIXED_HIDES', 'error', `${target.box.label} stays entirely behind the fixed ${bar.box.label}, which spans the viewport's height at its left edge; offset the page by the bar's width`, target, piece, { rule: 'fixed-hides-content', cover: bar.path });
          hidden.push(piece);
        }
      }
      // fixed-covers-part: a full-height bar on the left edge that covers part of a text or control's width (content
      // that runs under a fixed sidebar: a footer without the page's left offset) hides that part at every scroll
      // position, so the text is cut off for good. A full-height bar on the right edge does the same (entirely or in
      // part) where the page does not scroll sideways (scrolling right would move content out from under it).
      const viewportInline = domainWidth;
      for (const bar of fixedBars) {
        if (related(bar.path, target.path) || !paintsAbove(bar, layer(bar), target, own)) continue;
        let tall = intersect(target.region, bar.region);
        tall = atMost(tall, bar.origin.block, scalar(0)); tall = atMost(tall, viewportBlock, bottom(bar));
        if (!tall) continue;
        // Left edge: the bar starts at the viewport's left; the target starts left of the bar's right edge (by ≥ 1px)
        // and ends past it (entirely under it is fixed-hides-content).
        let left = atMost(tall, bar.origin.inline, scalar(0));
        left = atMost(left, sum(target.origin.inline, scalar(1)), right(bar)); left = below(left, right(bar), right(target));
        // Right edge: the bar ends at the viewport's right and the page is no wider than the viewport.
        let rightEdge = atMost(tall, viewportInline, right(bar)); rightEdge = atMost(rightEdge, right(rootRow), viewportInline);
        rightEdge = atMost(rightEdge, sum(bar.origin.inline, scalar(1)), right(target));
        const whole = atMost(rightEdge, bar.origin.inline, target.origin.inline), part = below(rightEdge, target.origin.inline, bar.origin.inline);
        for (const [region, entirely] of [[left, false], [whole, true], [part, false]]) for (const piece of region ? hidden.reduce((rest, done) => rest.flatMap(r => subtract(r, done)), [region]) : []) {
          if (entirely) report(findings, 'E_A11Y_FIXED_HIDES', 'error', `${target.box.label} stays entirely behind the fixed ${bar.box.label}, which spans the viewport's height at its right edge; offset the page by the bar's width`, target, piece, { rule: 'fixed-hides-content', cover: bar.path });
          else report(findings, 'E_A11Y_FIXED_HIDES_PART', 'error', `${target.box.label} runs under the fixed ${bar.box.label}, which spans the viewport's height at its ${region === left ? 'left' : 'right'} edge: the part under it is hidden at every scroll position (the text is cut off). Offset this content by the bar's width, as the rest of the page is`, target, piece, { rule: 'fixed-covers-part', cover: bar.path });
          hidden.push(piece);
        }
      }
      // A bar on the top edge that covers the top of the content at scroll 0 (a fixed header with no matching page
      // padding): scrolling only moves the content further up under it, so that slice is never seen. Likewise a bar
      // on the bottom edge and the end of the content at the largest scroll position.
      for (const bar of fixedBars) {
        if (related(bar.path, target.path) || !paintsAbove(bar, layer(bar), target, own)) continue;
        let across = intersect(target.region, bar.region);
        across = atMost(across, bar.origin.inline, target.origin.inline); across = atMost(across, right(target), right(bar));
        if (!across) continue;
        // Top edge, scroll 0: the content starts above the bar's bottom (by ≥ 1px) and ends below it.
        let top = atMost(across, bar.origin.block, scalar(0));
        top = atMost(top, sum(target.origin.block, scalar(1)), bottom(bar)); top = below(top, bottom(bar), bottom(target));
        // Bottom edge, at the largest scroll s (0 when the page is no taller than the viewport): in viewport
        // coordinates the content ends below the bar's top and starts above it.
        let edge = atMost(across, viewportBlock, bottom(bar));
        const at = (region, shift) => { region = atMost(region, sum(bar.origin.block, scalar(1)), diff(bottom(target), shift)); return below(region, diff(target.origin.block, shift), bar.origin.block); };
        const short = at(atMost(edge, bottom(rootRow), viewportBlock), scalar(0));
        const tall = at(atMost(edge, viewportBlock, bottom(rootRow)), diff(bottom(rootRow), viewportBlock));
        for (const [region, side] of [[top, 'top'], [short, 'bottom'], [tall, 'bottom']]) for (const piece of region ? hidden.reduce((rest, done) => rest.flatMap(r => subtract(r, done)), [region]) : []) {
          report(findings, 'E_A11Y_FIXED_HIDES_PART', 'error', `${target.box.label} runs under the fixed ${bar.box.label} at the viewport's ${side} edge: its ${side} part is hidden at every scroll position. Pad the page by the bar's height`, target, piece, { rule: 'fixed-covers-part', cover: bar.path });
          hidden.push(piece);
        }
      }
      // A bar on the top edge and one on the bottom edge that meet cover the whole viewport (short viewports: a phone
      // held sideways): wherever the content scrolls, it is behind one of them.
      for (const upper of fixedBars) for (const lower of fixedBars) {
        if (upper === lower || [upper, lower].some(bar => related(bar.path, target.path) || !paintsAbove(bar, layer(bar), target, own))) continue;
        let region = intersect(intersect(target.region, upper.region), lower.region);
        for (const bar of [upper, lower]) { region = atMost(region, bar.origin.inline, target.origin.inline); region = atMost(region, right(target), right(bar)); }
        region = atMost(region, upper.origin.block, scalar(0)); region = atMost(region, viewportBlock, bottom(lower)); region = atMost(region, lower.origin.block, bottom(upper));
        for (const piece of region ? hidden.reduce((rest, done) => rest.flatMap(r => subtract(r, done)), [region]) : []) {
          report(findings, 'E_A11Y_FIXED_HIDES', 'error', `${target.box.label} is behind the fixed ${upper.box.label} or ${lower.box.label} at every scroll position: together they cover the viewport`, target, piece, { rule: 'fixed-hides-content', cover: upper.path, also: lower.path });
          hidden.push(piece);
        }
      }
    }
  }
  // safe-area-target: on a viewport-fit=cover page, a control in a fixed (or sticky) box that reaches into the device's
  // safe area — under the notch or Dynamic Island, the status bar or the home indicator, or a landscape cutout. Content
  // in the flow scrolls out of those bands; a fixed control stays there. (The device's shape is not in any browser:
  // Chromium's safe-area override checks the env() values and positions; see docs/devices.md.)
  // Where a row is pinned to the viewport: the parts of its region where it, or the ancestor row that holds it there,
  // is fixed (or sticky). Rows of one path differ by region (position: fixed under a breakpoint only), so each
  // ancestor's rows are matched with the target's region, not taken from the first row of that path.
  const pinnedPieces = (target, test) => {
    const pieces = [];
    for (let p = target.path; p; p = parentPath(p)) for (const r of p === target.path ? [target] : everything.filter(g => g.path === p)) {
      if (!test(r)) continue;
      const piece = r === target ? target.region : intersect(target.region, r.region);
      if (piece) pieces.push(...pieces.reduce((rest, done) => rest.flatMap(x => subtract(x, done)), [piece]));
    }
    return pieces;
  };
  if (safeArea && block && viewportBlock) {
    const pinned = row => pinnedPieces(row, r => r.fixed || r.sticky);
    const bands = [
      ['top', safeArea.top, r => below(r.region, r.origin.block, scalar(safeArea.top))],
      ['bottom', safeArea.bottom, r => below(r.region, diff(viewportBlock, scalar(safeArea.bottom)), bottom(r))],
      ['left', safeArea.left, r => below(r.region, r.origin.inline, scalar(safeArea.left))],
      ['right', safeArea.right, r => below(r.region, diff(domainWidth, scalar(safeArea.right)), right(r))],
    ].filter(([, inset]) => inset > 0);
    for (const target of placed.filter(row => interactive(row) && visible(row) && !inertAt(row) && !hiddenFrom(row.path))) for (const piece of pinned(target)) {
      for (const [side, inset, under] of bands) {
        const region = under({ ...target, region: piece });
        if (region) report(warnings, 'W_A11Y_SAFE_AREA_TARGET', 'warning', `${target.box.label} is fixed into the device's ${side} safe area (${inset}px${side === 'top' ? ': the notch, Dynamic Island or status bar' : side === 'bottom' ? ': the home indicator' : ': a landscape cutout'}) on this viewport-fit=cover page: it may be hidden or its taps taken by the system. Offset it by env(safe-area-inset-${side})`, target, region, { rule: 'safe-area-target', side, inset });
      }
    }
  }
  // target-offscreen: a control in a fixed box does not scroll into view, so the part of it outside the viewport is
  // never shown: entirely outside, it cannot be used (E_A11Y_TARGET_OFFSCREEN); partly outside, it is cut off
  // (W_A11Y_TARGET_PARTLY_OFFSCREEN). Content in the flow scrolls into view (negative offsets in it: focus-offscreen).
  if (block && viewportBlock) {
    // (A control that a :focus rule moves, the skip link at top: -40px that slides in, is hidden until focused on
    // purpose: focus-offscreen checks that it does show then.)
    for (const target of placed.filter(row => interactive(row) && visible(row) && !inertAt(row) && !hiddenFrom(row.path) && !(row.focusStates ?? []).some(state => state.origin || state.originUnknown))) for (const piece of pinnedPieces(target, r => r.fixed)) {
      const zero = scalar(0);
      const entirely = [atMost(piece, right(target), zero), atMost(piece, domainWidth, target.origin.inline), atMost(piece, bottom(target), zero), atMost(piece, viewportBlock, target.origin.block)];
      const partly = [['top', below(piece, target.origin.block, zero)], ['left', below(piece, target.origin.inline, zero)], ['right', below(piece, domainWidth, right(target))], ['bottom', below(piece, viewportBlock, bottom(target))]];
      let done = [];
      for (const region of entirely.filter(Boolean)) {
        for (const piece of done.reduce((rest, d) => rest.flatMap(r => subtract(r, d)), [region])) report(findings, 'E_A11Y_TARGET_OFFSCREEN', 'error', `${target.box.label} is in a fixed box but lies entirely outside the viewport: it never scrolls into view and cannot be used`, target, piece, { rule: 'target-offscreen' });
        done.push(region);
      }
      for (const [side, region] of partly) {
        if (!region) continue;
        for (const piece of done.reduce((rest, d) => rest.flatMap(r => subtract(r, d)), [region])) report(warnings, 'W_A11Y_TARGET_PARTLY_OFFSCREEN', 'warning', `${target.box.label} is in a fixed box and reaches past the viewport's ${side} edge: that part never scrolls into view (it is cut off)`, target, piece, { rule: 'target-offscreen', side });
        done.push(region);
      }
    }
  }
  // hinge-target: on a dual-screen device, nothing under the hinge is shown or can be tapped.
  if (hinge && hinge.width > 0 && block) {
    const [left, top, right_, bottom_] = [scalar(hinge.left), scalar(hinge.top), scalar(hinge.left + hinge.width), scalar(hinge.top + hinge.height)];
    for (const target of placed.filter(row => interactive(row) && visible(row) && !inertAt(row) && !hiddenFrom(row.path))) {
      let region = below(target.region, target.origin.inline, right_);
      region = below(region, left, right(target));
      region = below(region, target.origin.block, bottom_);
      region = below(region, top, bottom(target));
      if (region) report(warnings, 'W_A11Y_HINGE_TARGET', 'warning', `${target.box.label} lies under the dual-screen hinge (x ${hinge.left}–${hinge.left + hinge.width}px): that part is not shown and takes no tap. Lay it out in one segment (the viewport-segments media query)`, target, region, { rule: 'hinge-target' });
    }
  }

  // pointer-disabled: keyboard can reach it, a pointer cannot.
  for (const row of geometry.filter(row => interactive(row) && visible(row) && !hiddenFrom(row.path) && row.paint.pointerEvents === 'none'))
    report(findings, 'E_A11Y_POINTER_DISABLED', 'error', `${row.box.label} cannot be clicked: pointer-events is none here`, row, row.region, { rule: 'pointer-disabled' });

  // small-text: a px font size below 12 (relative sizes are not resolved here).
  for (const row of geometry.filter(row => row.box.text && visible(row))) {
    const size = px(row.paint.fontSize);
    if (size !== undefined && size < 12) report(warnings, 'W_A11Y_SMALL_TEXT', 'warning', `${row.box.label} is set at ${size}px`, row, row.region, { rule: 'small-text', fontSize: size });
  }

  // image-alt: every rendered, exposed image needs an alt attribute.
  for (const row of geometry.filter(row => row.box.tag === 'img' && visible(row) && !hiddenFrom(row.path))) {
    if (row.box.alt === 'dynamic') report(unknowns, 'U_A11Y_IMAGE_ALT', 'unknown', `${row.box.label}: a dynamic alt may be missing`, row, row.region, { rule: 'image-alt' });
    else if (row.box.alt === undefined) report(findings, 'E_A11Y_IMAGE_ALT', 'error', `${row.box.label} has no alt; use alt="" if it is decorative`, row, row.region, { rule: 'image-alt' });
  }

  // form-label: aria-label/title/labelledby, a wrapping label, or label[for] with text (HTML-AAM).
  const labels = []; (function walk(box) { if (box.tag === 'label') labels.push(box); for (const child of box.children ?? []) walk(child); })(root);
  const ancestorsOf = path => { const out = []; for (let p = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''; p; p = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '') { const box = boxOf.get(p); if (box) out.push(box); } return out; };
  const boxOf = new Map(); (function walk(box) { boxOf.set(box.path, box); for (const child of box.children ?? []) walk(child); })(root);
  for (const row of geometry.filter(row => field(row.box) && visible(row) && !hiddenFrom(row.path) && !['submit', 'reset', 'button', 'image'].includes(row.box.inputType))) {
    const box = row.box;
    const name = nameOf(box);
    const wrapped = ancestorsOf(row.path).find(a => a.tag === 'label');
    const pointed = box.id ? labels.filter(l => l.labelFor === box.id) : [];
    const dynamic = name === 'dynamic' || box.inputType === 'dynamic' || labels.some(l => l.labelFor === 'dynamic');
    if (name === true) { if (box.nameSource === 'title' && !wrapped && !pointed.length) report(warnings, 'W_A11Y_TITLE_ONLY', 'warning', `${box.label} is named only by its title, which is not shown persistently`, row, row.region, { rule: 'title-only' }); continue; }
    // A label names its field only where the label's text renders and is visible (Chromium; unlike aria-labelledby).
    let missing = [row.region];
    for (const label of [wrapped, ...pointed].filter(Boolean)) for (const text of geometry.filter(t => speaks(t) && t.box !== box && (t.path === label.path || isAncestor(label.path, t.path)) && !isAncestor(box.path, t.path)))
      missing = missing.flatMap(region => subtract(region, text.region));
    for (const region of missing) {
      if (dynamic) report(unknowns, 'U_A11Y_LABEL', 'unknown', `${box.label}: a dynamic name, type or label[for] decides whether it is labelled`, row, region, { rule: 'form-label' });
      else if (box.placeholder) report(warnings, 'W_A11Y_PLACEHOLDER_LABEL', 'warning', `${box.label} is named only by its placeholder here, which disappears on input`, row, region, { rule: 'form-label' });
      else report(findings, 'E_A11Y_LABEL', 'error', `${box.label} has no label here: add a visible <label>, aria-label, aria-labelledby or title`, row, region, { rule: 'form-label' });
    }
  }
  // tabindex-removed (SC 2.1.1): a visible native control (button, link with href, field) with a negative tabindex is
  // shown and clickable but Tab skips it. Exempt: roving tabindex in a composite widget (arrow keys move inside it),
  // and a duplicate link whose href another focusable link already takes (a card's image link). A warning: a script
  // may focus it another way, which is not visible here.
  const composite = new Set(['toolbar', 'tablist', 'menu', 'menubar', 'listbox', 'grid', 'treegrid', 'tree', 'radiogroup']);
  const nativeControl = box => ['button', 'select', 'textarea'].includes(box.tag) || (box.tag === 'input' && box.inputType !== 'hidden') || (box.tag === 'a' && typeof box.href === 'string');
  for (const row of geometry.filter(row => nativeControl(row.box) && typeof row.box.tabIndex === 'number' && row.box.tabIndex < 0 && visible(row) && !hiddenFrom(row.path) && !row.box.pseudo)) {
    if (ancestorsOf(row.path).some(a => composite.has(roleOf(a)))) continue;
    if (row.box.tag === 'a' && row.box.href !== 'dynamic' && geometry.some(other => other.box.tag === 'a' && other.box.href === row.box.href && other.path !== row.path && !(other.box.tabIndex < 0) && visible(other))) continue;
    if (!warnings.some(w => w.code === 'W_A11Y_TABINDEX_REMOVED' && w.path === row.path))
      report(warnings, 'W_A11Y_TABINDEX_REMOVED', 'warning', `${row.box.label} is a visible ${row.box.tag === 'a' ? 'link' : 'control'} with tabindex ${row.box.tabIndex}: a pointer can use it, but Tab skips it. Drop the tabindex (or make it part of a composite widget with arrow-key navigation)`, row, row.region, { rule: 'tabindex-removed' });
  }
  // contents-focus (SC 2.1.1): a focusable element with display: contents has no box, so Chromium leaves it out of the
  // tab order (measured: a link, a button, tabindex=0), while its children draw it and a link or button stays in the
  // accessibility tree. Found as a focusable element with no geometry row whose descendants render there.
  const keyboardFocusable = box => box.focusable !== false && (box.tabIndex >= 0 || (nativeControl(box) && !(box.tabIndex < 0)));
  for (const box of [...boxOf.values()].filter(box => keyboardFocusable(box) && !box.pseudo && !hiddenFrom(box.path))) {
    let shown = geometry.filter(row => isAncestor(box.path, row.path) && visible(row)).map(row => row.region);
    for (const own of geometry.filter(row => row.path === box.path)) shown = shown.flatMap(r => subtract(r, own.region));
    const at = shown.find(Boolean);
    if (at && !findings.some(f => f.code === 'E_A11Y_CONTENTS_FOCUS' && f.path === box.path))
      report(findings, 'E_A11Y_CONTENTS_FOCUS', 'error', `${box.label} is a ${box.tag === 'a' ? 'link' : box.tag === 'button' ? 'button' : 'focusable element'} with display: contents: its children draw it, but it has no box, so Tab skips it and the keyboard cannot use it. Give it a box (display: block, or grid/flex) and move the layout to it`, { box, path: box.path }, at, { rule: 'contents-focus' });
  }
  // hidden-control (SC 2.1.1, 4.1.2): the custom checkbox pattern gone wrong — the field itself is display: none or
  // visibility: hidden (out of the tab order and the accessibility tree) while its label is shown. A pointer can toggle
  // it through the label; the keyboard and assistive technology cannot reach it. The visually hidden pattern (opacity
  // 0, clip) keeps the field focusable and is not a finding.
  for (const box of [...boxOf.values()].filter(box => field(box) && !box.pseudo && !hiddenFrom(box.path))) {
    const wrapped = ancestorsOf(box.path).find(a => a.tag === 'label');
    const pointed = box.id ? labels.filter(l => l.labelFor === box.id) : [];
    if (!wrapped && !pointed.length) continue;
    const operable = geometry.filter(row => row.path === box.path && visible(row)).map(row => row.region);
    for (const label of [wrapped, ...pointed].filter(Boolean)) {
      let shown = geometry.filter(t => visible(t) && !t.box.pseudo && (t.path === label.path || isAncestor(label.path, t.path)) && !isAncestor(box.path, t.path) && t.path !== box.path).map(t => t.region);
      for (const region of operable) shown = shown.flatMap(r => subtract(r, region));
      const at = shown.find(Boolean);
      if (at && !findings.some(f => f.code === 'E_A11Y_CONTROL_HIDDEN' && f.path === box.path))
        report(findings, 'E_A11Y_CONTROL_HIDDEN', 'error', `${box.label} is ${geometry.some(row => row.path === box.path) ? 'visibility: hidden' : 'display: none'} but its label ${label.label} is shown: a pointer toggles it through the label, the keyboard and screen readers cannot reach it. Hide it visually instead (opacity: 0 or a clip, keeping it focusable) and draw the focus on the label`, { box, path: box.path }, at, { rule: 'hidden-control', label: label.path });
    }
  }
  // select-indicator: a dropdown select with appearance: none loses the UA arrow; with no background-image on it and
  // nothing drawn beside it by its parent (a ::before/::after, an absolutely placed icon or an img sibling), nothing
  // tells a sighted user it opens a list (a cue, not a WCAG failure: a warning). Modeled selects are always
  // appearance: none, and multiple/size selects (list boxes, no arrow) stay Unknown at the adapter.
  for (const row of geometry.filter(row => row.box.tag === 'select' && !row.box.pseudo && visible(row) && !hiddenFrom(row.path))) {
    if (row.paint.backgroundImage !== 'none' || warnings.some(w => w.code === 'W_A11Y_SELECT_INDICATOR' && w.path === row.path)) continue;
    const parent = row.path.slice(0, row.path.lastIndexOf('/'));
    const drawn = everything.some(other => other.path !== row.path && other.path.slice(0, other.path.lastIndexOf('/')) === parent && visible(other) && intersect(other.region, row.region)
      && (other.box.pseudo || other.containingPath !== undefined || ['img', 'svg'].includes(other.box.tag)));
    if (!drawn) report(warnings, 'W_A11Y_SELECT_INDICATOR', 'warning', `${row.box.label} is appearance: none and nothing draws its arrow: it does not look like a dropdown. Draw an arrow (a background-image, or a ::after on its wrapper)`, row, row.region, { rule: 'select-indicator' });
  }
  // label-for: the id must name a labelable element (button, input other than hidden, select, textarea, output).
  const labelable = box => box && (['button', 'select', 'textarea', 'output'].includes(box.tag) || (box.tag === 'input' && box.inputType !== 'hidden'));
  for (const label of labels.filter(l => l.labelFor !== undefined)) {
    if (label.labelFor === 'dynamic') { report(unknowns, 'U_A11Y_LABEL_FOR', 'unknown', `${label.label}: a dynamic for= may name no field`, whole(label), domain, { rule: 'label-for' }); continue; }
    if (!labelable(byId.get(label.labelFor))) report(findings, 'E_A11Y_LABEL_FOR', 'error', `${label.label} is for ${JSON.stringify(label.labelFor)}, which is not a labelable element`, whole(label), domain, { rule: 'label-for', reference: label.labelFor });
  }

  // list-structure: list semantics follow the DOM (CSS display does not change it here).
  for (const row of geometry.filter(row => visible(row) && !hiddenFrom(row.path))) {
    const parentBox = boxOf.get(row.path.slice(0, row.path.lastIndexOf('/')));
    if (row.box.tag === 'li' && !['ul', 'ol'].includes(parentBox?.tag)) report(findings, 'E_A11Y_LIST', 'error', `${row.box.label} is a list item outside ul/ol`, row, row.region, { rule: 'list-structure' });
    if (['ul', 'ol'].includes(row.box.tag) && (row.box.children ?? []).some(child => child.tag !== 'li')) report(findings, 'E_A11Y_LIST', 'error', `${row.box.label} has a child that is not li`, row, row.region, { rule: 'list-structure' });
  }

  // radio-group: radios sharing a name should be grouped (fieldset, or role=radiogroup/group).
  const radios = geometry.filter(row => row.box.tag === 'input' && row.box.inputType === 'radio' && row.box.inputName && row.box.inputName !== 'dynamic' && visible(row) && !hiddenFrom(row.path));
  const grouped = row => ancestorsOf(row.path).some(a => a.tag === 'fieldset' || ['radiogroup', 'group'].includes(a.role));
  for (let i = 0; i < radios.length; i++) for (let j = i + 1; j < radios.length; j++) {
    const a = radios[i], b = radios[j];
    if (a.path === b.path || a.box.inputName !== b.box.inputName || (grouped(a) && grouped(b))) continue;
    const region = intersect(a.region, b.region);
    if (region) report(warnings, 'W_A11Y_RADIO_GROUP', 'warning', `radios named ${JSON.stringify(a.box.inputName)} are not grouped in a fieldset or radiogroup`, b, region, { rule: 'radio-group', name: a.box.inputName });
  }

  // landmark-name: navigation landmarks rendered together need names that tell them apart.
  const navs = geometry.filter(row => (row.box.tag === 'nav' || row.box.role === 'navigation') && visible(row) && !hiddenFrom(row.path));
  for (let i = 0; i < navs.length; i++) for (let j = i + 1; j < navs.length; j++) {
    const a = navs[i], b = navs[j];
    const same = typeof a.box.ariaLabel === 'string' && typeof b.box.ariaLabel === 'string' && a.box.ariaLabel !== 'dynamic' && b.box.ariaLabel !== 'dynamic' && normalize(a.box.ariaLabel) === normalize(b.box.ariaLabel);
    if (a.path === b.path || (nameOf(a.box) === true && nameOf(b.box) === true && !same)) continue;
    const region = intersect(a.region, b.region);
    if (region) report(warnings, 'W_A11Y_LANDMARK_NAME', 'warning', `${b.box.label} and ${a.box.label} are navigation landmarks without names to tell them apart`, b, region, { rule: 'landmark-name', other: a.path });
  }

  // role-valid / interactive-role-focusable.
  const ariaRoles = new Set([...widgetRoles, 'alert', 'alertdialog', 'application', 'article', 'banner', 'blockquote', 'caption', 'cell', 'code', 'columnheader', 'complementary', 'contentinfo', 'definition', 'deletion', 'dialog', 'directory', 'document', 'emphasis', 'feed', 'figure', 'form', 'generic', 'grid', 'group', 'heading', 'img', 'image', 'insertion', 'list', 'listbox', 'listitem', 'log', 'main', 'marquee', 'math', 'menu', 'menubar', 'meter', 'navigation', 'none', 'note', 'paragraph', 'presentation', 'progressbar', 'radiogroup', 'region', 'row', 'rowgroup', 'rowheader', 'scrollbar', 'search', 'separator', 'status', 'strong', 'subscript', 'superscript', 'table', 'tablist', 'tabpanel', 'term', 'time', 'timer', 'toolbar', 'tooltip', 'tree', 'treegrid']);
  for (const box of all) {
    if (box.role === 'dynamic') { report(unknowns, 'U_A11Y_ROLE', 'unknown', `${box.label}: a dynamic role decides its semantics`, whole(box), domain, { rule: 'role-valid' }); continue; }
    if (box.role && !ariaRoles.has(roleOf(box))) report(findings, 'E_A11Y_ROLE', 'error', `${box.label} has role ${JSON.stringify(roleOf(box))}, which is not a WAI-ARIA role`, whole(box), domain, { rule: 'role-valid', role: roleOf(box) });
  }
  // Items of a composite widget (option in a listbox, treeitem in a tree, gridcell in a grid, menuitem in a menu) get
  // focus from their owner: aria-activedescendant on a combobox or listbox, or a roving tabindex set by script
  // (WAI-ARIA APG). They need no tabindex of their own.
  const composites = { option: ['listbox'], treeitem: ['tree'], gridcell: ['grid', 'treegrid'], row: ['grid', 'treegrid'], menuitem: ['menu', 'menubar'], menuitemcheckbox: ['menu', 'menubar'], menuitemradio: ['menu', 'menubar'] };
  const ownedItem = row => { const owners = composites[roleOf(row.box)]; if (!owners) return false; for (let p = row.path; p.includes('/'); ) { p = p.slice(0, p.lastIndexOf('/')); const b = treeBoxes.get(p); if (b && owners.includes(roleOf(b))) return true; } return false; };
  for (const row of geometry.filter(row => widgetRoles.has(roleOf(row.box)) && visible(row) && !hiddenFrom(row.path) && !ownedItem(row)))
    if (!(row.box.focusable === true || row.box.tabIndex >= 0 || ['button', 'input', 'select', 'textarea'].includes(row.box.tag) || (row.box.tag === 'a' && row.box.focusable !== false)))
      report(findings, 'E_A11Y_ROLE_FOCUS', 'error', `${row.box.label} has role ${roleOf(row.box)} but cannot take focus; add tabindex="0"`, row, row.region, { rule: 'interactive-role-focusable' });

  // focus-area for inline content: an inline box with no text or image (and no horizontal edges, which
  // inline content requires) has no width.
  for (const row of geometry.filter(row => row.inlineFlow && focusable(row) && !hiddenFrom(row.path) && !hasText({ ...row.box, named: false })))
    report(findings, 'E_A11Y_FOCUS_AREA', 'error', `${row.box.label} can take focus but is an empty inline box with no area to show it`, row, row.region, { rule: 'focus-area' });

  // link-in-text-block: a link inside running text is told apart without color alone.
  for (const row of geometry.filter(row => row.inlineFlow && row.box.tag === 'a' && row.box.focusable !== false && visible(row) && !hiddenFrom(row.path))) {
    const leaf = row.chain.at(-2), own = row.chain.at(-1);
    const lines = value => String(value ?? 'none').split(/\s+/);
    if (lines(own.decoration).some(line => line !== 'none') && !lines(own.decoration).every(line => lines(leaf.decoration).includes(line))) continue;
    const link = parseColor(own.color), text = parseColor(leaf.color);
    if (!link || !text || String(own.color).toLowerCase() === 'canvastext') { report(unknowns, 'U_A11Y_LINK_IN_TEXT', 'unknown', `${row.box.label}: the link or text color is not a modeled color`, row, row.region, { rule: 'link-in-text-block' }); continue; }
    const backdropOf = backdrop(row.chain.slice(0, -1));
    if (backdropOf.unknown) { report(unknowns, 'U_A11Y_LINK_IN_TEXT', 'unknown', `${row.box.label}: ${backdropOf.unknown}`, row, row.region, { rule: 'link-in-text-block' }); continue; }
    const ratio = contrastRatio(over(link, backdropOf.bg), over(text, backdropOf.bg));
    if (ratio < 3) report(findings, 'E_A11Y_LINK_IN_TEXT', 'error', `${row.box.label} is told apart from the text only by color (${ratio.toFixed(2)}:1, below 3:1) and has no underline`, row, row.region, { rule: 'link-in-text-block', ratio });
  }

  // Tables: data cells need rendered headers; headers= must name th of the same table.
  const descendants = (box, test) => { const out = []; (function walk(b) { for (const child of b.children ?? []) { if (test(child)) out.push(child); if (child.tag !== 'table') walk(child); } })(box); return out; };
  const rowsFor = box => geometry.filter(row => row.box === box && visible(row));
  for (const tableBox of all.filter(box => box.tag === 'table' && !['presentation', 'none'].includes(roleOf(box)))) {
    const cells = descendants(tableBox, box => box.tag === 'td'), heads = descendants(tableBox, box => box.tag === 'th' || ['columnheader', 'rowheader'].includes(roleOf(box)));
    const tableRow = rowsFor(tableBox)[0] ?? { box: tableBox, path: tableBox.path };
    let missing = cells.flatMap(rowsFor).map(row => row.region);
    for (const head of heads) for (const row of rowsFor(head)) missing = missing.flatMap(region => subtract(region, row.region));
    for (const region of missing) report(heads.length ? findings : warnings, heads.length ? 'E_A11Y_TABLE_HEADERS' : 'W_A11Y_TABLE_HEADERS', heads.length ? 'error' : 'warning',
      heads.length ? `${tableBox.label} shows data cells here but none of its headers renders` : `${tableBox.label} has data cells and no th; mark headers, or role="presentation" for layout`, tableRow, region, { rule: 'table-headers' });
    const ids = new Set(heads.filter(head => head.tag === 'th' && head.id).map(head => head.id));
    for (const box of [...cells, ...heads]) {
      if (box.headers === 'dynamic') { report(unknowns, 'U_A11Y_TABLE_HEADERS_REF', 'unknown', `${box.label}: a dynamic headers= may name no th`, whole(box), domain, { rule: 'td-headers' }); continue; }
      for (const id of box.headers ?? []) if (!ids.has(id)) report(findings, 'E_A11Y_TABLE_HEADERS_REF', 'error', `${box.label} has headers=${JSON.stringify(id)}, which is not a th of this table`, whole(box), domain, { rule: 'td-headers', reference: id });
    }
  }

  // fieldset-name: a fieldset groups controls under a name (its legend, or aria-label/labelledby/title).
  for (const set of all.filter(box => box.tag === 'fieldset' && !hiddenFrom(box.path))) {
    if ((set.children ?? []).some(child => child.tag === 'legend') || nameOf(set) === true) continue;
    // Rendered where any descendant (or the fieldset itself) renders.
    const own = geometry.filter(row => row.path === set.path);
    for (const row of own.length ? own : geometry.filter(row => isAncestor(set.path, row.path) && visible(row) && !row.inlineFlow))
      report(warnings, 'W_A11Y_FIELDSET_NAME', 'warning', `${set.label} groups controls without a legend`, { box: set, path: set.path }, row.region, { rule: 'fieldset-name' });
  }

  // Text comparisons. A control's visible text: rendered, visible text rows in its subtree.
  const textRows = target => geometry.filter(row => row.box.text && visible(row) && (row.path === target.path || isAncestor(target.path, row.path)));
  for (const target of geometry.filter(row => control(row) && visible(row) && !hiddenFrom(row.path) && typeof row.box.ariaLabel === 'string')) {
    for (const text of textRows(target)) {
      const label = target.box.ariaLabel, words = text.box.textContent;
      if (label === 'dynamic' || words === 'dynamic') { const region = intersect(target.region, text.region); if (region) report(unknowns, 'U_A11Y_LABEL_IN_NAME', 'unknown', `${target.box.label}: a dynamic aria-label or text decides whether the name contains the visible text`, target, region, { rule: 'label-in-name' }); continue; }
      // Visible text of symbols only (⋯, ×, →) is an icon, not a text label: SC 2.5.3 does not apply to it.
      if (!words || normalize(label).includes(normalize(words)) || !/[\p{L}\p{N}]/u.test(words)) continue;
      const region = intersect(target.region, text.region);
      if (region) report(findings, 'E_A11Y_LABEL_IN_NAME', 'error', `${target.box.label} is named ${JSON.stringify(label)}, which does not contain its visible text ${JSON.stringify(words)}`, target, region, { rule: 'label-in-name', visible: words });
    }
  }
  // A link's name as a string: aria-label, else its static text content (undefined when it cannot be known).
  const linkName = box => {
    if (box.ariaLabel !== undefined) return box.ariaLabel === 'dynamic' ? undefined : normalize(box.ariaLabel);
    const parts = []; let known = true;
    (function walk(b) { if (b.textContent === 'dynamic') known = false; else if (b.textContent) parts.push(b.textContent); for (const child of [...(b.inline ?? []), ...(b.children ?? [])]) walk(child); })(box);
    return known ? normalize(parts.join(' ')) : undefined;
  };
  const links = geometry.filter(row => row.box.tag === 'a' && typeof row.box.href === 'string' && row.box.href !== 'dynamic' && visible(row) && !hiddenFrom(row.path));
  for (let i = 0; i < links.length; i++) for (let j = i + 1; j < links.length; j++) {
    const a = links[i], b = links[j], name = linkName(a.box);
    if (a.path === b.path || !name || name !== linkName(b.box) || a.box.href === b.box.href) continue;
    const region = intersect(a.region, b.region);
    if (region) report(warnings, 'W_A11Y_LINK_PURPOSE', 'warning', `${b.box.label} and ${a.box.label} are both named ${JSON.stringify(name)} but go to different places`, b, region, { rule: 'link-purpose', other: a.path });
  }
  const generic = /^(?:click here|here|read more|more|learn more|link|this|go|details|こちら|ここ|詳細|詳しくはこちら|もっと見る|続きを読む|クリック)$/;
  for (const row of links) { const name = linkName(row.box); if (name && generic.test(name)) report(warnings, 'W_A11Y_LINK_TEXT', 'warning', `${row.box.label} is named ${JSON.stringify(name)}, which does not say where it goes`, row, row.region, { rule: 'link-text' }); }

  // --- WAI-ARIA 1.2 structure and values ---
  const implicitRole = box => {
    const explicit = roleOf(box);
    if (explicit && ariaRoles.has(explicit)) return explicit;
    const t = box.tag;
    if (t === 'a') return box.focusable !== false ? 'link' : 'generic';
    if (/^h[1-6]$/.test(t)) return 'heading';
    if (t === 'input') return { checkbox: 'checkbox', radio: 'radio', button: 'button', submit: 'button', reset: 'button', image: 'button', range: 'slider', search: 'searchbox' }[box.inputType] ?? 'textbox';
    return { button: 'button', nav: 'navigation', main: 'main', aside: 'complementary', article: 'article', ul: 'list', ol: 'list', li: 'listitem', table: 'table', thead: 'rowgroup', tbody: 'rowgroup', tfoot: 'rowgroup', tr: 'row', th: 'columnheader', td: 'cell', img: box.alt === '' ? 'presentation' : 'img', select: 'combobox', textarea: 'textbox', p: 'paragraph', fieldset: 'group', output: 'status' }[t] ?? 'generic';
  };
  const transparent = role => ['generic', 'none', 'presentation'].includes(role);
  const requiredParent = { listitem: ['list', 'directory'], option: ['listbox', 'group'], tab: ['tablist'], menuitem: ['menu', 'menubar', 'group'], menuitemcheckbox: ['menu', 'menubar', 'group'], menuitemradio: ['menu', 'menubar', 'group'], treeitem: ['tree', 'group'], row: ['table', 'grid', 'treegrid', 'rowgroup'], cell: ['row'], gridcell: ['row'], columnheader: ['row'], rowheader: ['row'], rowgroup: ['table', 'grid', 'treegrid'] };
  const requiredChildren = { list: ['listitem'], listbox: ['option', 'group'], tablist: ['tab'], menu: ['menuitem', 'menuitemcheckbox', 'menuitemradio', 'group', 'separator'], menubar: ['menuitem', 'menuitemcheckbox', 'menuitemradio', 'group', 'separator'], tree: ['treeitem', 'group'], grid: ['row', 'rowgroup'], table: ['row', 'rowgroup', 'caption'], row: ['cell', 'gridcell', 'columnheader', 'rowheader'] };
  const parentRole = box => { for (const a of ancestorsOf(box.path)) { const r = implicitRole(a); if (!transparent(r)) return r; } return null; };
  const ownedChildren = box => (box.children ?? []).flatMap(child => transparent(implicitRole(child)) && child.tag !== 'caption' ? ownedChildren(child) : [child]);
  for (const box of all.filter(b => !hiddenFrom(b.path))) {
    const role = roleOf(box);
    if (!role || !ariaRoles.has(role)) continue;
    if (requiredParent[role] && !requiredParent[role].includes(parentRole(box))) report(findings, 'E_A11Y_ROLE_PARENT', 'error', `${box.label} has role ${role} outside ${requiredParent[role].join('/')}`, whole(box), domain, { rule: 'role-parent', role });
    if (requiredChildren[role]) for (const child of ownedChildren(box)) if (!requiredChildren[role].includes(implicitRole(child)) && child.tag !== 'caption')
      report(findings, 'E_A11Y_ROLE_CHILDREN', 'error', `${box.label} (role ${role}) owns ${child.label}, which is not ${requiredChildren[role].join('/')}`, whole(box), domain, { rule: 'role-children', child: child.path });
  }
  const requiredAttributes = { checkbox: ['aria-checked'], radio: ['aria-checked'], switch: ['aria-checked'], menuitemcheckbox: ['aria-checked'], menuitemradio: ['aria-checked'], slider: ['aria-valuenow'], scrollbar: ['aria-controls', 'aria-valuenow'], combobox: ['aria-expanded'], heading: ['aria-level'], meter: ['aria-valuenow'] };
  const nativeFor = { checkbox: b => b.tag === 'input' && b.inputType === 'checkbox', radio: b => b.tag === 'input' && b.inputType === 'radio', heading: b => /^h[1-6]$/.test(b.tag), slider: b => b.tag === 'input' && b.inputType === 'range', combobox: b => b.tag === 'select' };
  const ariaAttributes = new Set('activedescendant atomic autocomplete braillelabel brailleroledescription busy checked colcount colindex colindextext colspan controls current describedby description details disabled dropeffect errormessage expanded flowto grabbed haspopup hidden invalid keyshortcuts label labelledby level live modal multiline multiselectable orientation owns placeholder posinset pressed readonly relevant required roledescription rowcount rowindex rowindextext rowspan selected setsize sort valuemax valuemin valuenow valuetext'.split(' ').map(n => `aria-${n}`));
  const booleans = new Set(['aria-hidden', 'aria-disabled', 'aria-modal', 'aria-multiline', 'aria-multiselectable', 'aria-readonly', 'aria-required', 'aria-atomic', 'aria-busy']);
  // live-hidden (SC 4.1.3): a live region (role alert/status/log/timer/marquee, or aria-live polite/assertive) is in
  // the accessibility tree only where it is rendered and not aria-hidden: where it is display: none (itself or an
  // ancestor) or visibility: hidden, the messages written into it are not announced.
  for (const box of all.filter(box => !box.pseudo && (['alert', 'status', 'log', 'timer', 'marquee'].includes(roleOf(box)) || ['polite', 'assertive'].includes(String(box.aria?.['aria-live'] ?? '').trim().toLowerCase())))) {
    if (box.aria?.['aria-live'] === 'dynamic') continue;
    // Only where the page was laid out (the root has rows): a region with no rows at all was not analysed (Unknown
    // elsewhere), which is not the region being hidden.
    const rootRows = geometry.filter(row => row.path === root?.path);
    if (!rootRows.length && !hiddenFrom(box.path)) continue;
    let hidden = rootRows.length ? rootRows.map(row => row.region) : [domain];
    if (!hiddenFrom(box.path)) for (const row of geometry.filter(row => row.path === box.path && visible(row))) hidden = hidden.flatMap(region => subtract(region, row.region));
    const at = hidden.find(Boolean);
    if (at) report(warnings, 'W_A11Y_LIVE_HIDDEN', 'warning', `${box.label} is a live region (${roleOf(box) ?? `aria-live ${box.aria['aria-live']}`}) but is ${hiddenFrom(box.path) ? 'aria-hidden' : 'not rendered (display: none or visibility: hidden)'} here: what is written into it is not announced. Keep the region rendered and empty, and hide it visually if needed`, whole(box), at, { rule: 'live-hidden' });
  }
  const optionals = new Set(['aria-expanded', 'aria-selected']), tristates = new Set(['aria-checked', 'aria-pressed']);
  for (const box of all) {
    const role = roleOf(box), aria = box.aria ?? {};
    for (const attribute of requiredAttributes[role] ?? []) if (!(attribute in aria) && !nativeFor[role]?.(box)) report(findings, 'E_A11Y_ROLE_ATTR', 'error', `${box.label} has role ${role} without ${attribute}`, whole(box), domain, { rule: 'role-attr', attribute });
    for (const [attribute, raw] of Object.entries(aria)) {
      if (!ariaAttributes.has(attribute)) { report(findings, 'E_A11Y_ARIA_ATTR', 'error', `${box.label} has ${attribute}, which is not an ARIA attribute`, whole(box), domain, { rule: 'aria-attr', attribute }); continue; }
      if (raw === 'dynamic') { if (booleans.has(attribute) || optionals.has(attribute) || tristates.has(attribute)) report(unknowns, 'U_A11Y_ARIA_VALUE', 'unknown', `${box.label}: a dynamic ${attribute} may be invalid`, whole(box), domain, { rule: 'aria-value', attribute }); continue; }
      const v = raw.trim().toLowerCase();
      const ok = booleans.has(attribute) ? ['true', 'false'].includes(v) : optionals.has(attribute) ? ['true', 'false', 'undefined'].includes(v) : tristates.has(attribute) ? ['true', 'false', 'mixed', 'undefined'].includes(v) : true;
      if (!ok) report(findings, 'E_A11Y_ARIA_VALUE', 'error', `${box.label} has ${attribute}=${JSON.stringify(raw)}, not a valid value`, whole(box), domain, { rule: 'aria-value', attribute });
    }
    const global = ['aria-label', 'aria-labelledby', 'aria-describedby', 'aria-live', 'aria-owns', 'aria-controls'].some(a => a in aria) || (box.named === true && box.nameSource !== 'title');
    if (['none', 'presentation'].includes(role) && (box.focusable === true || box.tabIndex >= 0 || ['button', 'input', 'select', 'textarea'].includes(box.tag) || global))
      report(findings, 'E_A11Y_PRESENTATION_CONFLICT', 'error', `${box.label} has role ${role} but is focusable or labelled, so the role is ignored`, whole(box), domain, { rule: 'presentation-conflict' });
  }

  // --- content ---
  for (const head of geometry.filter(row => row.box.tag === 'th' && visible(row) && !hiddenFrom(row.path) && nameOf(row.box) !== true)) {
    let missing = [head.region];
    for (const text of geometry.filter(row => speaks(row) && (row.path === head.path || isAncestor(head.path, row.path)))) missing = missing.flatMap(region => subtract(region, text.region));
    for (const region of missing) report(findings, 'E_A11Y_EMPTY_TH', 'error', `${head.box.label} is an empty table header here`, head, region, { rule: 'empty-th' });
  }
  for (const row of geometry.filter(row => row.box.tag === 'img' && row.inlineFlow && typeof row.box.alt === 'string' && row.box.alt && row.box.alt !== 'dynamic')) {
    const leaf = treeBoxes.get(row.parentText);
    if (leaf?.textContent && leaf.textContent !== 'dynamic' && normalize(leaf.textContent) === normalize(row.box.alt)) report(warnings, 'W_A11Y_REDUNDANT_ALT', 'warning', `${row.box.label} has alt ${JSON.stringify(row.box.alt)}, which repeats the text beside it`, row, row.region, { rule: 'redundant-alt' });
  }
  // A block image whose next or previous rendered sibling is text with the same words (an image and its caption).
  for (const row of geometry.filter(row => row.box.tag === 'img' && !row.inlineFlow && typeof row.box.alt === 'string' && row.box.alt.trim() && row.box.alt !== 'dynamic' && visible(row))) {
    const parent = treeBoxes.get(row.path.slice(0, row.path.lastIndexOf('/')));
    const siblings = parent?.children ?? [], at = siblings.findIndex(child => child.path === row.path);
    const caption = [siblings[at - 1], siblings[at + 1]].find(sibling => sibling?.textContent && sibling.textContent !== 'dynamic' && normalize(sibling.textContent) === normalize(row.box.alt) && geometry.some(other => other.path === sibling.path && visible(other)));
    if (caption && !warnings.some(w => w.code === 'W_A11Y_REDUNDANT_ALT' && w.path === row.path)) report(warnings, 'W_A11Y_REDUNDANT_ALT', 'warning', `${row.box.label} has alt ${JSON.stringify(row.box.alt)}, which repeats the caption ${caption.label} beside it: screen readers read it twice (use alt="" when the caption says it)`, row, row.region, { rule: 'redundant-alt', caption: caption.path });
  }
  for (const row of geometry.filter(row => row.box.tag === 'input' && visible(row) && !hiddenFrom(row.path))) {
    if (row.box.inputType === 'button' && (row.box.value === undefined || (row.box.value !== 'dynamic' && !row.box.value.trim())) && nameOf(row.box) !== true) report(findings, 'E_A11Y_INPUT_BUTTON_NAME', 'error', `${row.box.label} is an input button without a value`, row, row.region, { rule: 'input-button-name' });
  }
  const fieldNames = new Set('name honorific-prefix given-name additional-name family-name honorific-suffix nickname username new-password current-password one-time-code organization-title organization street-address address-line1 address-line2 address-line3 address-level4 address-level3 address-level2 address-level1 country country-name postal-code cc-name cc-given-name cc-additional-name cc-family-name cc-number cc-exp cc-exp-month cc-exp-year cc-csc cc-type transaction-currency transaction-amount language bday bday-day bday-month bday-year sex url photo tel tel-country-code tel-national tel-area-code tel-local tel-local-prefix tel-local-suffix tel-extension email impp'.split(' '));
  const contactFields = new Set(['tel', 'tel-country-code', 'tel-national', 'tel-area-code', 'tel-local', 'tel-local-prefix', 'tel-local-suffix', 'tel-extension', 'email', 'impp']);
  const autofill = raw => {
    let t = raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (t.length === 1 && ['on', 'off'].includes(t[0])) return true;
    if (t.at(-1) === 'webauthn') t = t.slice(0, -1);
    if (t[0]?.startsWith('section-') && t[0].length > 8) t = t.slice(1);
    if (['shipping', 'billing'].includes(t[0])) t = t.slice(1);
    if (['home', 'work', 'mobile', 'fax', 'pager'].includes(t[0])) { t = t.slice(1); if (!contactFields.has(t[0])) return false; }
    return t.length === 1 && fieldNames.has(t[0]);
  };
  for (const box of all.filter(b => typeof b.autocomplete === 'string' && b.autocomplete !== 'dynamic' && ['input', 'select', 'textarea'].includes(b.tag)))
    if (!autofill(box.autocomplete)) report(findings, 'E_A11Y_AUTOCOMPLETE', 'error', `${box.label} has autocomplete=${JSON.stringify(box.autocomplete)}, outside the HTML autofill tokens`, whole(box), domain, { rule: 'autocomplete', value: box.autocomplete });
  for (const box of all.filter(b => b.scope !== undefined && b.scope !== 'dynamic'))
    if (box.tag !== 'th' || !['row', 'col', 'rowgroup', 'colgroup'].includes(box.scope.trim().toLowerCase())) report(findings, 'E_A11Y_SCOPE', 'error', `${box.label} has scope=${JSON.stringify(box.scope)}${box.tag !== 'th' ? ' on a non-header cell' : ''}`, whole(box), domain, { rule: 'scope' });

  // --- language ---
  if (root.tag === 'html' && (root.lang === undefined || !String(root.lang).trim())) report(findings, 'E_A11Y_HTML_LANG', 'error', `${root.label} has no lang attribute`, whole(root), domain, { rule: 'html-lang' });
  // --- forced colors ---
  // A control drawn only by its fill or shadow: in forced colors the fill becomes the system background and box-shadow
  // is not painted, so nothing shows where it is (unless the page styles @media (forced-colors: active) itself).
  if (!forcedColorsHandled) for (const row of geometry.filter(row => !row.box.pseudo && visible(row) && (['button', 'select', 'textarea'].includes(row.box.tag) || (row.box.tag === 'input' && !['hidden', 'checkbox', 'radio'].includes(row.box.inputType ?? 'text'))))) {
    const paint = row.paint ?? {};
    const noBorder = ['left', 'right', 'top', 'bottom'].every(side => !row.borders?.[side] || cmp(row.borders[side], q(0)) === 0);
    const noOutline = !paint.outlineStyle || paint.outlineStyle === 'none';
    const drawn = (paint.boxShadow && paint.boxShadow !== 'none') || (paint.backgroundColor && !['transparent', 'rgba(0, 0, 0, 0)', 'initial'].includes(String(paint.backgroundColor)));
    if (noBorder && noOutline && drawn && !warnings.some(w => w.code === 'W_A11Y_FORCED_COLORS' && w.path === row.path))
      report(warnings, 'W_A11Y_FORCED_COLORS', 'warning', `${row.box.label} has no border: only its ${paint.boxShadow && paint.boxShadow !== 'none' ? 'box-shadow' : 'background'} shows its edge, which forced colors (Windows high contrast) replace, so the control loses its outline. Give it a border (transparent is enough: forced colors paint it) or style @media (forced-colors: active)`, row, row.region, { rule: 'forced-colors' });
  }
  // Smooth scrolling of the whole page (html or body): browsers keep it under prefers-reduced-motion: reduce (measured),
  // so moving the page for every in-page jump needs a reduced-motion rule that sets it back to auto.
  if (!smoothReduced) for (const row of geometry.filter(row => ((row.box === root && root.tag === 'html') || (row.box.tag === 'body' && root.children?.includes(row.box)) || (row.box === root && root.tag === 'body')) && row.paint?.scrollBehavior === 'smooth')) {
    if (!warnings.some(w => w.code === 'W_A11Y_SMOOTH_SCROLL'))
      report(warnings, 'W_A11Y_SMOOTH_SCROLL', 'warning', `${row.box.label} has scroll-behavior: smooth with no prefers-reduced-motion: reduce rule: every jump to an #id animates the page, also for people who asked for less motion. Set it in @media (prefers-reduced-motion: no-preference), or back to auto under reduce`, row, row.region, { rule: 'motion' });
  }
  // --- zoom ---
  if (root.tag === 'html' && typeof root.metaViewport === 'string') {
    const settings = Object.fromEntries(root.metaViewport.split(/[,;]/).map(part => part.split('=').map(x => x.trim().toLowerCase())).filter(([key]) => key));
    const maximum = settings['maximum-scale'] !== undefined ? Number.parseFloat(settings['maximum-scale']) : null;
    const reasons = [...(['no', '0'].includes(settings['user-scalable']) ? ['user-scalable=no'] : []), ...(maximum !== null && Number.isFinite(maximum) && maximum < 2 ? [`maximum-scale=${settings['maximum-scale']}`] : [])];
    if (reasons.length) report(findings, 'E_A11Y_META_VIEWPORT', 'error', `The viewport meta tag disables zooming (${reasons.join(', ')}): text cannot be enlarged to 200% on touch devices`, whole(root), domain, { rule: 'meta-viewport', content: root.metaViewport });
  }
  // touch-action on the root or body applies to every gesture on the page: without pinch-zoom, the page cannot be zoomed.
  for (const row of geometry.filter(row => (row.box === root && root.tag === 'html') || (row.box.tag === 'body' && root.children?.includes(row.box)) || (row.box === root && root.tag === 'body'))) {
    const action = String(row.paint?.touchAction ?? 'auto');
    if (action !== 'auto' && action !== 'manipulation' && !/\bpinch-zoom\b/.test(action)) report(findings, 'E_A11Y_TOUCH_ZOOM', 'error', `${row.box.label} has touch-action: ${action}, which disables pinch-zoom for the whole page`, row, row.region, { rule: 'touch-zoom', value: action });
  }
  for (const box of all.filter(b => b.lang && b.lang !== '<dynamic>' && !languageTag.test(b.lang))) report(findings, 'E_A11Y_LANG_VALID', 'error', `${box.label} has lang=${JSON.stringify(box.lang)}, which is not a language tag`, whole(box), domain, { rule: 'lang-valid' });

  // --- page roots (html or body) ---
  const pageRoot = ['html', 'body'].includes(root.tag);
  const landmarkRole = box => { const r = implicitRole(box); if (['main', 'navigation', 'complementary', 'search', 'form', 'region', 'banner', 'contentinfo'].includes(r)) return r; if ((box.tag === 'header' || box.tag === 'footer') && !ancestorsOf(box.path).some(a => ['article', 'aside', 'main', 'nav', 'section'].includes(a.tag))) return box.tag === 'header' ? 'banner' : 'contentinfo'; if (box.tag === 'section' && nameOf(box) === true) return 'region'; return null; };
  if (pageRoot) {
    const h1s = geometry.filter(row => row.box.tag === 'h1' && visible(row) && !hiddenFrom(row.path));
    let noH1 = [domain];
    for (const row of h1s) noH1 = noH1.flatMap(region => subtract(region, row.region));
    for (const region of noH1) report(warnings, 'W_A11Y_PAGE_H1', 'warning', 'no h1 renders here', whole(root), region, { rule: 'page-h1' });
    for (const row of geometry.filter(row => row.box.text && visible(row) && !hiddenFrom(row.path))) {
      const inLandmark = [row.box, ...ancestorsOf(row.path)].some(b => landmarkRole(b));
      const skipLink = row.box.tag === 'a' && typeof row.box.href === 'string' && row.box.href.startsWith('#');
      if (!inLandmark && !skipLink) report(warnings, 'W_A11Y_REGION', 'warning', `${row.box.label} is content outside any landmark`, row, row.region, { rule: 'region' });
    }
    const ordered = [...all].sort((a, b) => treeOrder(a.path, b.path));
    const firstNav = ordered.find(b => landmarkRole(b) === 'navigation'), firstMain = ordered.find(b => landmarkRole(b) === 'main');
    if (firstNav && firstMain && treeOrder(firstNav.path, firstMain.path) < 0) {
      const firstFocusable = ordered.find(b => b.focusable === true || (b.tag === 'button' && b.focusable !== false));
      const target = firstFocusable?.href?.startsWith('#') ? byId.get(firstFocusable.href.slice(1)) : null;
      const skips = target && (target === firstMain || isAncestor(firstMain.path, target.path) || isAncestor(target.path, firstMain.path) || target.path === firstMain.path);
      if (!skips) report(warnings, 'W_A11Y_BYPASS', 'warning', 'navigation comes before main, and the first focusable element is not a skip link to it', whole(firstNav), domain, { rule: 'bypass' });
    }
  }
  // Landmarks: main and complementary at top level; one banner and one contentinfo at a time.
  for (const row of geometry.filter(row => ['main', 'complementary'].includes(landmarkRole(row.box)) && visible(row) && !hiddenFrom(row.path))) {
    const inside = ancestorsOf(row.path).find(a => landmarkRole(a));
    if (inside) report(warnings, 'W_A11Y_LANDMARK_TOP_LEVEL', 'warning', `${row.box.label} (${landmarkRole(row.box)}) is inside ${inside.label}; keep it at the top level`, row, row.region, { rule: 'landmark-top-level', parent: inside.path });
  }
  for (const kind of ['banner', 'contentinfo']) {
    const rows = geometry.filter(row => landmarkRole(row.box) === kind && visible(row) && !hiddenFrom(row.path));
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      if (rows[i].path === rows[j].path) continue;
      const region = intersect(rows[i].region, rows[j].region);
      if (region) report(warnings, 'W_A11Y_DUPLICATE_LANDMARK', 'warning', `${rows[j].box.label} is a second ${kind} landmark`, rows[j], region, { rule: 'duplicate-landmark', other: rows[i].path });
    }
  }

  // --- CSS that changes what the DOM says ---
  for (const row of geometry.filter(row => row.box.tag === 'p' && row.box.text && visible(row))) {
    const parentBox = boxOf.get(row.path.slice(0, row.path.lastIndexOf('/'))), siblings = parentBox?.children ?? [];
    const next = siblings[siblings.indexOf(row.box) + 1];
    if (next?.tag !== 'p') continue;
    for (const after of geometry.filter(r => r.box === next && visible(r))) {
      const region = intersect(row.region, after.region);
      if (!region) continue;
      const bold = weight(row.paint.fontWeight) >= 600 && weight(after.paint.fontWeight) < 600;
      const a = px(row.paint.fontSize), b = px(after.paint.fontSize), bigger = a !== undefined && b !== undefined && a >= b * 1.2;
      if (bold || bigger) report(warnings, 'W_A11Y_P_AS_HEADING', 'warning', `${row.box.label} is styled as a heading (${bold ? 'bold' : 'larger'}) but is a paragraph`, row, region, { rule: 'p-as-heading' });
    }
  }
  if (block) {
    const portrait = clip(domain, diff(height, domainWidth)), landscape = clip(domain, diff(domainWidth, height), true);
    const mains = geometry.filter(row => landmarkRole(row.box) === 'main' && !hiddenFrom(row.path));
    if (portrait && landscape && mains.length) {
      const shows = part => mains.some(row => intersect(row.region, part));
      for (const [name, part, other] of [['landscape', landscape, portrait], ['portrait', portrait, landscape]])
        if (!shows(part) && shows(other)) report(findings, 'E_A11Y_ORIENTATION', 'error', `the main content does not render in ${name} viewports`, whole(mains[0].box), part, { rule: 'orientation', missing: name });
    }
    // The rotation hack: main (or a box holding it) turned a quarter only in one orientation shows the page sideways
    // there, locking it to the other orientation.
    if (portrait && landscape && mains.length) {
      const ratio = v => { const [n, d = '1'] = v.split('/'); return Number(n) / Number(d); };
      const quarter = row => { const m = /^affine\(([^ ]+) ([^ ]+) ([^ ]+) ([^ ]+)/.exec(String(row.paint.transform)); return Boolean(m) && ratio(m[1]) === 0 && ratio(m[4]) === 0 && Math.abs(ratio(m[2])) === 1 && Math.abs(ratio(m[3])) === 1; };
      const holders = geometry.filter(row => mains.some(main => main.path === row.path || isAncestor(row.path, main.path)));
      for (const [name, part, other] of [['portrait', portrait, landscape], ['landscape', landscape, portrait]]) {
        const turned = holders.filter(row => quarter(row) && intersect(row.region, part));
        if (!turned.length || holders.some(row => row.box === turned[0].box && quarter(row) && intersect(row.region, other))) continue;
        for (const row of turned) report(findings, 'E_A11Y_ORIENTATION', 'error', `${row.box.label} is rotated a quarter turn only in ${name} viewports, which locks the content to the other orientation`, row, intersect(row.region, part), { rule: 'orientation', rotated: name });
      }
    }
  }

  // focus-visible: the focused state must look different. The UA :focus-visible ring applies unless an
  // author rule sets outline-style; then an outline, a box-shadow, or a color/background change must show.
  for (const row of geometry.filter(row => row.focusStates && visible(row) && !hiddenFrom(row.path))) {
    for (const state of row.focusStates) {
      const region = intersect(row.region, state.region);
      if (!region) continue;
      const f = state.paint, b = row.paint;
      const outline = !state.authorOutline || (!['none', 'hidden'].includes(f.outlineStyle) && !['0', '0px'].includes(String(f.outlineWidth)));
      const changed = (f.boxShadow !== 'none' && f.boxShadow !== b.boxShadow) || f.color !== b.color || f.backgroundColor !== b.backgroundColor || f.backgroundImage !== b.backgroundImage || f.decoration !== b.decoration;
      if (!outline && !changed) report(findings, 'E_A11Y_FOCUS_VISIBLE', 'error', `${row.box.label} shows no focus indicator: the outline is removed and nothing else changes on focus`, row, region, { rule: 'focus-visible' });
      // In forced colors the box-shadow is not painted and colours are the system ones for both states: a focus shown
      // only by them disappears (an underline change survives).
      if (!outline && changed && f.decoration === b.decoration && !forcedColorsHandled && !warnings.some(w => w.code === 'W_A11Y_FORCED_COLORS_FOCUS' && w.path === row.path))
        report(warnings, 'W_A11Y_FORCED_COLORS_FOCUS', 'warning', `${row.box.label} shows focus only by ${f.boxShadow !== 'none' && f.boxShadow !== b.boxShadow ? 'a box-shadow' : 'a colour change'} with the outline removed: forced colors (Windows high contrast) drop both, so the focus disappears. Keep an outline (outline: 2px solid transparent shows in forced colors) or style @media (forced-colors: active)`, row, region, { rule: 'forced-colors' });
      // focus-contrast (SC 1.4.11): an author outline that is the only indicator needs 3:1 against what it is drawn over
      // (the ancestors' backdrop; its own background as well when outline-offset is negative).
      if (state.authorOutline && outline && !changed && !['auto'].includes(f.outlineStyle)) {
        const offset = String(f.outlineOffset ?? '0'), inward = /^-/.test(offset);
        const raw = String(f.outlineColor ?? 'currentcolor').toLowerCase(), ink = raw === 'currentcolor' ? f.color : raw;
        const result = backdrop([...row.chain.slice(0, -1), ...(inward ? [{ ...row.chain.at(-1), color: ink }] : [{ color: ink, backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' }])]);
        if (result.unknown) report(unknowns, 'U_A11Y_FOCUS_CONTRAST', 'unknown', `${row.box.label}: ${result.unknown.replace('the text', 'the focus outline')}`, row, region, { rule: 'focus-contrast' });
        else {
          const ratio = contrastRatio(result.fg, result.bg);
          if (Math.abs(ratio - 3) < 1e-9) report(unknowns, 'U_A11Y_FOCUS_CONTRAST', 'unknown', `${row.box.label}: focus outline contrast at the 3:1 threshold within numeric error`, row, region, { rule: 'focus-contrast' });
          else if (ratio < 3) report(findings, 'E_A11Y_FOCUS_CONTRAST', 'error', `${row.box.label}'s focus outline has contrast ${ratio.toFixed(2)}:1 against its backdrop, below 3:1`, row, region, { rule: 'focus-contrast', ratio });
        }
        // focus-appearance (SC 2.4.13, AAA only): the indicator is at least a 2 CSS px thick perimeter.
        const thickness = { thin: 1, medium: 3, thick: 5 }[String(f.outlineWidth)] ?? (/^\d+(?:\.\d+)?px$/.test(String(f.outlineWidth)) ? parseFloat(f.outlineWidth) : null);
        if ((contrast === 'AAA' || targetLevel === 'AAA') && thickness !== null && thickness < 2) report(warnings, 'W_A11Y_FOCUS_APPEARANCE', 'warning', `${row.box.label}'s focus outline is ${thickness}px thick; SC 2.4.13 asks for at least 2px around it`, row, region, { rule: 'focus-appearance' });
      }
      // focus-transparent: at opacity 0 (itself when focused, or an ancestor) the box's own indicator is invisible.
      // A sibling may still show focus (input:focus + label), which is not checked: a warning.
      const zero = value => /^(?:0|0?\.0+|0%)$/.test(String(value).trim());
      if (zero(f.opacity) || row.chain.slice(0, -1).some(layer => zero(layer.opacity)))
        report(warnings, 'W_A11Y_FOCUS_TRANSPARENT', 'warning', `${row.box.label} stays at opacity 0 when focused, so its own focus indicator is invisible; another element must show where focus is`, row, region, { rule: 'focus-transparent' });
    }
  }

  // checked-indicator (SC 1.4.11, 1.4.1): a custom checkbox/radio (appearance: none) must look different when checked.
  // Nothing changing is an error; a change only of the fill needs 3:1 between the two fills. A ::before/::after generated
  // only in one state (:checked::before, absolutely positioned) is an indicator too.
  for (const row of geometry.filter(row => row.checkedStates && !row.uaControl && visible(row) && !hiddenFrom(row.path) && row.chain && !row.chain.some(layer => /^(?:0|0?\.0+|0%)$/.test(String(layer.opacity).trim())))) {
    const [checked, unchecked] = row.checkedStates;
    for (const on of checked) for (const off of unchecked) {
      const region = intersect(intersect(row.region, on.region), off.region);
      if (!region) continue;
      const a = on.paint, b = off.paint;
      if (on.markUnknown || off.markUnknown) { report(unknowns, 'U_A11Y_CHECKED_INDICATOR', 'unknown', `${row.box.label}: a :checked ::before/::after that is not absolutely positioned moves the layout`, row, region, { rule: 'checked-indicator' }); continue; }
      if (on.marks !== off.marks) continue; // a generated check mark (or one that goes away) is the indicator
      const others = a.backgroundImage !== b.backgroundImage || a.boxShadow !== b.boxShadow || a.color !== b.color || JSON.stringify(a.borderColors) !== JSON.stringify(b.borderColors) || a.outlineStyle !== b.outlineStyle || a.outlineColor !== b.outlineColor;
      if (others) continue;
      if (a.backgroundColor === b.backgroundColor) { report(findings, 'E_A11Y_CHECKED_INDICATOR', 'error', `${row.box.label} looks the same checked and unchecked`, row, region, { rule: 'checked-indicator' }); continue; }
      const fill = paint => backdrop([...row.chain.slice(0, -1), { ...row.chain.at(-1), backgroundColor: paint.backgroundColor, color: '#000' }]);
      const [x, y] = [fill(a), fill(b)];
      if (x.unknown || y.unknown) { report(unknowns, 'U_A11Y_CHECKED_INDICATOR', 'unknown', `${row.box.label}: ${(x.unknown ?? y.unknown).replace('the text', 'the box')}`, row, region, { rule: 'checked-indicator' }); continue; }
      const ratio = contrastRatio(x.bg, y.bg);
      if (Math.abs(ratio - 3) < 1e-9) report(unknowns, 'U_A11Y_CHECKED_INDICATOR', 'unknown', `${row.box.label}: checked and unchecked fills at 3:1 within numeric error`, row, region, { rule: 'checked-indicator' });
      else if (ratio < 3) report(findings, 'E_A11Y_CHECKED_INDICATOR', 'error', `${row.box.label}'s checked fill differs from the unchecked one by only ${ratio.toFixed(2)}:1 (3:1 needed)`, row, region, { rule: 'checked-indicator', ratio });
    }
  }

  // placeholder-contrast (SC 1.4.3): placeholder text is text; its color (opacity applies to it alone) over the field's
  // fill needs the text ratio. Shown only while the field is empty, but that is how it first appears.
  for (const row of geometry.filter(row => row.placeholderPaint && visible(row) && !hiddenFrom(row.path) && row.chain)) {
    const fill = backdrop([...row.chain.slice(0, -1), { ...row.chain.at(-1), color: '#000' }]);
    for (const state of row.placeholderPaint) {
      const region = intersect(row.region, state.region);
      if (!region) continue;
      const color = parseColor(state.color), alpha = /^(?:\d+(?:\.\d+)?|\.\d+)%?$/.test(String(state.opacity)) ? (String(state.opacity).endsWith('%') ? parseFloat(state.opacity) / 100 : Number(state.opacity)) : null;
      if (fill.unknown || !color || alpha === null) { report(unknowns, 'U_A11Y_PLACEHOLDER_CONTRAST', 'unknown', `${row.box.label}: ${fill.unknown ?? `placeholder color ${state.color} or opacity ${state.opacity} is not modeled`}`, row, region, { rule: 'placeholder-contrast' }); continue; }
      const ratio = contrastRatio(over({ ...color, a: color.a * alpha }, fill.bg), fill.bg);
      const required = large(row.paint) ? (contrast === 'AAA' ? 4.5 : 3) : (contrast === 'AAA' ? 7 : 4.5);
      if (Math.abs(ratio - required) < 1e-9) report(unknowns, 'U_A11Y_PLACEHOLDER_CONTRAST', 'unknown', `${row.box.label}: placeholder contrast at the ${required}:1 threshold within numeric error`, row, region, { rule: 'placeholder-contrast' });
      else if (ratio < required) report(findings, 'E_A11Y_PLACEHOLDER_CONTRAST', 'error', `${row.box.label}'s placeholder has contrast ${ratio.toFixed(2)}:1, below ${required}:1`, row, region, { rule: 'placeholder-contrast', ratio, required });
    }
  }

  // field-boundary (SC 1.4.11): a form field (text input, checkbox, radio, select, textarea) must be identifiable: its fill against the backdrop
  // around it, or at least one border side (1px or wider, composited over the fill), needs 3:1. Disabled fields are exempt.
  // Checkboxes and radios are checked models only with appearance: none, so their box is all there is to see.
  const textInput = box => box.tag === 'select' || box.tag === 'textarea' || (box.tag === 'input' && !['hidden', 'range', 'color', 'file', 'submit', 'reset', 'button', 'image'].includes(box.inputType));
  // A field at opacity 0 (itself or an ancestor) is deliberately invisible: another element draws it (custom checkboxes);
  // focus-transparent covers that pattern.
  const invisibleField = row => row.chain.some(layer => /^(?:0|0?\.0+|0%)$/.test(String(layer.opacity).trim()));
  for (const row of geometry.filter(row => textInput(row.box) && !row.uaControl && visible(row) && !hiddenFrom(row.path) && !row.box.nativeStates?.disabled && row.chain && !invisibleField(row))) {
    const clear = { color: '#000', backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' };
    const around = backdrop([...row.chain.slice(0, -1), clear]), fill = backdrop([...row.chain.slice(0, -1), { ...row.chain.at(-1), color: '#000' }]);
    if (around.unknown || fill.unknown) { report(unknowns, 'U_A11Y_FIELD_BOUNDARY', 'unknown', `${row.box.label}: ${(around.unknown ?? fill.unknown).replace('the text', 'the field')}`, row, row.region, { rule: 'field-boundary' }); continue; }
    const ratios = [contrastRatio(fill.bg, around.bg)];
    for (const side of ['top', 'right', 'bottom', 'left']) {
      const width = row.borders?.[side]; if (!width || number(width) < 1) continue;
      const raw = String(row.paint.borderColors?.[side] ?? 'currentcolor').toLowerCase(), color = parseColor(raw === 'currentcolor' ? row.paint.color : raw);
      if (!color) { ratios.push(NaN); continue; }
      ratios.push(contrastRatio(over(color, fill.bg), around.bg));
    }
    if (ratios.some(Number.isNaN)) { report(unknowns, 'U_A11Y_FIELD_BOUNDARY', 'unknown', `${row.box.label}: a border color is not a modeled color`, row, row.region, { rule: 'field-boundary' }); continue; }
    const best = Math.max(...ratios);
    if (Math.abs(best - 3) < 1e-9) report(unknowns, 'U_A11Y_FIELD_BOUNDARY', 'unknown', `${row.box.label}: its boundary contrast is at 3:1 within numeric error`, row, row.region, { rule: 'field-boundary' });
    else if (best < 3) report(findings, 'E_A11Y_FIELD_BOUNDARY', 'error', `${row.box.label} has no visible boundary: its fill and borders reach only ${best.toFixed(2)}:1 against the background (3:1 needed)`, row, row.region, { rule: 'field-boundary', ratio: best });
  }

  // hover-only (SC 2.1.1, 1.4.13): content a pointer can reveal must be revealed by focus as well.
  const shown = paint => paint.visibility === 'visible' && !/^(?:0|0?\.0+|0%)$/.test(String(paint.opacity));
  for (const row of geometry.filter(row => row.hoverStates && !hiddenFrom(row.path) && !shown(row.paint))) {
    for (const hover of row.hoverStates.filter(state => shown(state.paint))) {
      const revealed = intersect(row.region, hover.region);
      if (!revealed) continue;
      let hidden = [revealed];
      for (const focus of (row.focusStates ?? []).filter(state => shown(state.paint))) hidden = hidden.flatMap(region => subtract(region, focus.region));
      for (const region of hidden) report(findings, 'E_A11Y_HOVER_ONLY', 'error', `${row.box.label} appears on :hover but stays hidden when focused, so keyboard users cannot see it`, row, region, { rule: 'hover-only' });
    }
  }

  // state-contrast: a text control keeps the contrast minimum when hovered or focused.
  for (const row of geometry.filter(row => row.box.text && visible(row) && (row.hoverStates || row.focusStates))) {
    for (const [name, states] of [['hover', row.hoverStates ?? []], ['focus', row.focusStates ?? []]]) for (const state of states) {
      const region = intersect(row.region, state.region);
      if (!region || (state.paint.color === row.paint.color && state.paint.backgroundColor === row.paint.backgroundColor)) continue;
      const result = backdrop([...row.chain.slice(0, -1), state.paint]);
      if (result.unknown) { report(unknowns, 'U_A11Y_CONTRAST', 'unknown', `${row.box.label} (${name}): ${result.unknown}`, row, region, { rule: 'state-contrast' }); continue; }
      const ratio = contrastRatio(result.fg, result.bg), required = large(state.paint) ? (contrast === 'AAA' ? 4.5 : 3) : (contrast === 'AAA' ? 7 : 4.5);
      if (ratio < required) report(findings, 'E_A11Y_STATE_CONTRAST', 'error', `${row.box.label} has contrast ${ratio.toFixed(2)}:1 when ${name === 'hover' ? 'hovered' : 'focused'}, below ${required}:1`, row, region, { rule: 'state-contrast', state: name, ratio, required });
    }
  }

  // text-spacing, inline axis: a fixed single-line string grows by letter-spacing 0.12em per character
  // and word-spacing 0.16em per space; a clipping box narrower than that cuts it.
  for (const row of geometry.filter(row => row.box.contract?.font && row.box.contract.textMetrics?.kind === 'content' && row.box.contract.wrap === 'nowrap' && row.overflow === 'clip' && visible(row))) {
    const text = row.box.contract.textMetrics.text ?? '', size = row.box.contract.font.size;
    const extra = 0.12 * size * [...text].length + 0.16 * size * (text.match(/ /g) ?? []).length;
    const needed = Math.ceil((row.box.contract.minInlineSize + extra) * 64) / 64;
    const failed = below(row.region, row.content.inline, scalar(q(needed)));
    if (failed) report(findings, 'E_A11Y_TEXT_SPACING', 'error', `${row.box.label} clips its text with letter-spacing 0.12em and word-spacing 0.16em (needs ${needed}px)`, row, failed, { rule: 'text-spacing', axis: 'inline', required: needed });
  }

  // text-spacing: a font-measured leaf that clips must still fit its lines at line-height 1.5 × font size
  // (more letter/word spacing can only add lines, so this is a definite failure).
  for (const row of geometry.filter(row => row.box.contract?.font && row.overflow === 'clip' && row.contentBlockSize && visible(row))) {
    const font = row.box.contract.font, metrics = row.box.contract.textMetrics;
    const spaced = Math.max(font.lineHeight, 1.5 * font.size);
    // With a measured spaced profile (letter 0.12em, word 0.16em), the line count under all of SC 1.4.12.
    const steps = metrics?.kind === 'lines' ? (metrics.spacedProfile ?? metrics.profile) : [{ atLeastInlineSize: 0, lines: 1 }];
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].lines === null) continue;
      let region = clip(row.region, diff(row.content.inline, scalar(steps[i].atLeastInlineSize)));
      if (steps[i + 1]) region = below(region, row.content.inline, scalar(steps[i + 1].atLeastInlineSize));
      const failed = below(region, row.contentBlockSize, scalar(q(Math.round(steps[i].lines * spaced * 1e6) / 1e6)));
      if (failed) report(findings, 'E_A11Y_TEXT_SPACING', 'error', `${row.box.label} clips its ${steps[i].lines} line(s) when line-height is 1.5 × ${font.size}px (${steps[i].lines * spaced}px)`, row, failed, { rule: 'text-spacing', axis: 'block', lines: steps[i].lines, required: steps[i].lines * spaced });
    }
  }

  // Frames and media.
  for (const row of geometry.filter(row => visible(row) && !hiddenFrom(row.path) && ['iframe', 'video', 'audio'].includes(row.box.tag))) {
    const box = row.box;
    if (box.tag === 'iframe' && nameOf(box) !== true) report(nameOf(box) === 'dynamic' ? unknowns : findings, nameOf(box) === 'dynamic' ? 'U_A11Y_FRAME_TITLE' : 'E_A11Y_FRAME_TITLE', nameOf(box) === 'dynamic' ? 'unknown' : 'error', `${box.label} is a frame without a title`, row, row.region, { rule: 'frame-title' });
    if (box.tag === 'video') {
      const kinds = (box.children ?? []).filter(child => child.tag === 'track').map(child => child.trackKind);
      if (kinds.includes('dynamic')) report(unknowns, 'U_A11Y_VIDEO_CAPTION', 'unknown', `${box.label}: a dynamic track kind decides whether it has captions`, row, row.region, { rule: 'video-caption' });
      else if (!kinds.some(kind => ['captions', 'subtitles'].includes(kind))) report(findings, 'E_A11Y_VIDEO_CAPTION', 'error', `${box.label} has no captions track`, row, row.region, { rule: 'video-caption' });
    }
  }
  for (const box of all.filter(b => ['video', 'audio'].includes(b.tag) && b.autoplay && !b.muted && !hiddenFrom(b.path)))
    report(warnings, 'W_A11Y_AUTOPLAY_AUDIO', 'warning', `${box.label} plays automatically with sound; mute it or offer a control within 3 seconds`, whole(box), domain, { rule: 'autoplay-audio' });

  // target-size: SC 2.5.8 (AA, 24px, with the spacing exception) or SC 2.5.5 (AAA, 44px, no spacing exception).
  // Violations are collected per target, then the declared exceptions are applied.
  const violations = new Map(), undecided = new Map();
  const add = (map, target, entry) => map.set(target.path, [...(map.get(target.path) ?? []), entry]);
  const S = q(targetSize), radius = div(S, q(2));
  const center = row => ({ inline: sum(row.origin.inline, times(row.inline, q(1 / 2))), block: sum(row.origin.block, times(row.block, q(1 / 2))) });
  const undersized = row => { const narrow = below(row.region, row.inline, scalar(S)), wide = row.region && clip(row.region, diff(row.inline, scalar(S))); return [narrow, below(wide, row.block, scalar(S))].filter(Boolean); };
  // Inline targets (in a sentence) are exempt from SC 2.5.8 and 2.5.5.
  // A ::before/::after of the target that receives the pointer and contains its border box (the hit-area expansion,
  // inset: -10px) is the target's area where it holds.
  const parentOf = path => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const exposed = geometry.filter(row => interactive(row) && visible(row) && !hiddenFrom(row.path) && !row.inlineFlow).flatMap(row => {
    if (!row.origin) return [row];
    const pads = everything.filter(p => p.box.pseudo && parentOf(p.path) === row.path && p.origin && p.block && visible(p) && p.paint.pointerEvents !== 'none');
    let rest = [row.region]; const out = [];
    for (const pad of pads) {
      let holds = intersect(row.region, pad.region);
      holds = atMost(holds, pad.origin.inline, row.origin.inline); holds = atMost(holds, pad.origin.block, row.origin.block);
      holds = atMost(holds, right(row), right(pad)); holds = atMost(holds, bottom(row), bottom(pad));
      if (!holds) continue;
      for (const piece of rest.map(r => intersect(r, holds)).filter(Boolean)) out.push({ ...row, region: piece, origin: pad.origin, inline: pad.inline, block: pad.block, pad: pad.path });
      rest = rest.flatMap(r => subtract(r, holds));
    }
    return out.length ? [...out, ...rest.map(region => ({ ...row, region }))] : [row];
  }).flatMap((target, _, all) => {
    // Where a target painted later overlaps the enlarged area, hit testing gives it that part: the area left is not a
    // box, so the size there is not decided (Unknown), and is dropped from the enlarged piece.
    if (!target.pad) return [target];
    let rest = [target.region];
    for (const other of all) {
      if (other === target || related(other.path, target.path) || !other.origin) continue;
      let overlap = intersect(target.region, other.region);
      overlap = below(overlap, other.origin.inline, right(target)); overlap = below(overlap, target.origin.inline, right(other));
      overlap = below(overlap, other.origin.block, bottom(target)); overlap = below(overlap, target.origin.block, bottom(other));
      if (!overlap || !paintsAbove(other, layer(other), target, layer(target))) continue;
      add(undecided, target, { region: overlap, other, reason: `${other.box.label} is painted over part of its enlarged hit area` });
      rest = rest.flatMap(r => subtract(r, overlap));
    }
    return rest.map(region => ({ ...target, region }));
  });
  for (const target of exposed) {
    const small = undersized(target);
    if (!small.length) continue;
    if (targetLevel === 'AAA') { for (const region of small) add(violations, target, { region, other: null }); continue; }
    if (!target.origin) { for (const region of small) add(undecided, target, { region, other: null, reason: 'its position is not proved, so the spacing exception cannot be checked' }); continue; }
    const hits = [], doubtful = [];
    for (const other of exposed) {
      if (related(other.path, target.path)) continue;
      for (const piece of small) {
        const shared = intersect(piece, other.region);
        if (!shared) continue;
        if (!other.origin) { doubtful.push({ region: shared, other }); continue; }
        // The circle against the other target's box: offset to the nearest point of the box.
        const c = center(target), left = other.origin.inline, top = other.origin.block, r = right(other), b = bottom(other);
        const axis = (value, low, high) => [[clip(shared, diff(low, value), true), diff(low, value)], [atMost(clip(shared, diff(value, low)), value, high), scalar(0)], [clip(shared, diff(value, high), true), diff(value, high)]];
        for (const [xs, dx] of axis(c.inline, left, r)) if (xs) for (const [ys, dy] of axis(c.block, top, b)) {
          const part = ys && intersect(xs, ys);
          if (!part) continue;
          const reach = circleReach(part, dx, dy, radius);
          hits.push(...reach.yes.map(region => ({ region, other }))); doubtful.push(...reach.maybe.map(region => ({ region, other })));
        }
        // Two undersized circles meet when the centres are closer than the target size.
        for (const otherSmall of undersized(other)) {
          const both = intersect(shared, otherSmall);
          if (!both) continue;
          const d = center(other), reach = circleReach(both, diff(c.inline, d.inline), diff(c.block, d.block), S);
          hits.push(...reach.yes.map(region => ({ region, other }))); doubtful.push(...reach.maybe.map(region => ({ region, other })));
        }
      }
    }
    // Keep the largest proven pieces; undecided bands only matter where nothing is proven.
    // h ⊆ g exactly: no point of h violates a constraint of g (strictness included).
    const within = (h, g) => g.constraints.every(c => !clip(h, times(c.slack, q(-1)), !c.strict));
    const kept = hits.filter((h, i) => !hits.some((g, j) => j !== i && within(h.region, g.region) && (!within(g.region, h.region) || j < i)));
    for (const hit of kept) add(violations, target, hit);
    if (!kept.length) for (const piece of doubtful) add(undecided, target, { ...piece, reason: `its circle's distance to ${piece.other.box.label} is not decided here` });
  }
  // Exceptions: an equivalent control that renders and passes where the violation holds, or an essential presentation.
  const rowsOf = path => { const rows = exposed.filter(row => row.path === path); return rows.length ? rows : geometry.filter(row => row.path === path); };
  for (const target of new Set([...violations.keys(), ...undecided.keys()])) {
    const row = rowsOf(target)[0], box = row.box;
    // The user-agent control exception (SC 2.5.8 and 2.5.5): its size is the browser's, not the author's.
    if (row.uaControl) { for (const hit of [...(violations.get(target) ?? []), ...(undecided.get(target) ?? [])]) exempted.push({ code: 'E_A11Y_TARGET_SIZE', rule: 'target-size', box: box.label, path: target, ...ranges(hit.region), reason: 'user agent control: the browser sets its size' }); continue; }
    let pieces = violations.get(target) ?? [], doubtfulPieces = undecided.get(target) ?? [];
    const describe = hit => hit.other ? `its ${targetSize}px circle meets ${hit.other.box.label}` : targetLevel === 'AAA' ? `SC 2.5.5 allows no spacing exception` : '';
    if (box.essential === 'dynamic' || box.equivalent === 'dynamic') {
      for (const hit of [...pieces, ...doubtfulPieces]) report(unknowns, 'U_A11Y_TARGET_SIZE', 'unknown', `${box.label} is under ${targetSize}px and a dynamic exception attribute decides whether it applies`, row, hit.region, { rule: 'target-size' });
      continue;
    }
    if (box.essential) {
      for (const hit of [...pieces, ...doubtfulPieces]) exempted.push({ code: 'E_A11Y_TARGET_SIZE', rule: 'target-size', box: box.label, path: target, ...ranges(hit.region), reason: `essential: ${box.essential}` });
      continue;
    }
    if (box.equivalent) {
      // Where the equivalent renders, is visible and has no violation of its own.
      const equivalentBox = byId.get(box.equivalent);
      let passing = equivalentBox ? exposed.filter(other => other.box === equivalentBox).map(other => other.region) : [];
      for (const own of [...(violations.get(equivalentBox?.path) ?? []), ...(undecided.get(equivalentBox?.path) ?? [])]) passing = passing.flatMap(region => subtract(region, own.region));
      const excuse = list => list.flatMap(hit => {
        let rest = [hit.region];
        for (const region of passing) {
          const covered = intersect(hit.region, region);
          if (covered) exempted.push({ code: 'E_A11Y_TARGET_SIZE', rule: 'target-size', box: box.label, path: target, ...ranges(covered), reason: `equivalent: ${equivalentBox.label} meets the target size here`, equivalent: equivalentBox.path });
          rest = rest.flatMap(piece => subtract(piece, region));
        }
        return rest.map(region => ({ ...hit, region }));
      });
      pieces = excuse(pieces); doubtfulPieces = excuse(doubtfulPieces);
    }
    for (const hit of pieces) report(findings, 'E_A11Y_TARGET_SIZE', 'error', `${box.label} is under ${targetSize}px${describe(hit) ? ` and ${describe(hit)}` : ''}`, row, hit.region, { rule: 'target-size', required: targetSize, level: targetLevel, ...(hit.other ? { other: hit.other.path } : {}) });
    for (const hit of doubtfulPieces) report(unknowns, 'U_A11Y_TARGET_SIZE', 'unknown', `${box.label} is under ${targetSize}px and ${hit.reason}`, row, hit.region, { rule: 'target-size', ...(hit.other ? { other: hit.other.path } : {}) });
  }


  // clickable-look: a pointer cursor set on this element (not inherited) promises a click target;
  // without focus or an interactive role a keyboard cannot reach it (any click handler is outside the tree).
  for (const row of geometry.filter(row => row.paint.cursor === 'pointer' && row.chain?.at(-2)?.cursor !== 'pointer' && visible(row) && !hiddenFrom(row.path))) {
    const box = row.box;
    if (interactive(row) || box.focusable === true || box.focusable === 'dynamic' || box.tabIndex >= 0 || ['label', 'summary', 'option'].includes(box.tag) || ancestorsOf(row.path).some(a => interactive({ box: a }) || a.tag === 'label')) continue;
    report(warnings, 'W_A11Y_CLICK_LOOK', 'warning', `${box.label} has cursor: pointer but is neither focusable nor an interactive role; if it handles clicks, keyboard users cannot reach it`, row, row.region, { rule: 'clickable-look' });
  }
  // list-style-semantics: WebKit (VoiceOver) exposes a list without markers as no list, unless role=list (outside nav).
  for (const row of geometry.filter(row => ['ul', 'ol'].includes(row.box.tag) && visible(row) && !hiddenFrom(row.path) && row.box.role === undefined && !ancestorsOf(row.path).some(a => a.tag === 'nav'))) {
    const items = geometry.filter(item => item.box.tag === 'li' && item.path.slice(0, item.path.lastIndexOf('/')) === row.path && intersect(item.region, row.region));
    if (items.length && items.every(item => item.paint.listStyleType === 'none'))
      report(warnings, 'W_A11Y_LIST_STYLE', 'warning', `${row.box.label} has list-style-type: none; Safari/VoiceOver then drops its list semantics unless it has role="list"`, row, row.region, { rule: 'list-style-semantics' });
  }
  // motion: an animation longer than 5s (or infinite) needs a way to stop; prefers-reduced-motion: reduce should stop it.
  const seconds = value => { const m = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(m?s)$/.exec(String(value)); return m ? Number(m[1]) / (m[2] === 'ms' ? 1000 : 1) : null; };
  const lasting = a => a && a.playState !== 'paused' && seconds(a.duration) > 0 && (a.count === 'infinite' || seconds(a.duration) * Number(a.count) > 5);
  const running = a => a.playState !== 'paused' && seconds(a.duration) > 0 && a.count === 'infinite';
  for (const row of geometry.filter(row => (row.paint.animations ?? []).some(lasting) && visible(row) && !hiddenFrom(row.path))) {
    const a = row.paint.animations.find(lasting);
    const still = (row.reducedMotion ?? []).filter(s => (s.paint.animations ?? []).some(b => lasting(b) || running(b)));
    for (const s of still) report(warnings, 'W_A11Y_MOTION', 'warning', `${row.box.label} runs animation ${a.name} (${a.duration} × ${a.count}) and prefers-reduced-motion: reduce does not stop it; moving content over 5s needs a pause mechanism`, row, s.region, { rule: 'motion', animation: a });
  }
  // Checklist E4: a transition of a property that moves the box (its position, size or transform), over 5s, that
  // prefers-reduced-motion: reduce leaves running (SC 2.3.3). Colour and opacity fade without moving: not motion.
  const moving = property => /^(?:all|transform|translate|rotate|scale|inset(?:-.*)?|top|right|bottom|left|margin(?:-.*)?|padding(?:-.*)?|(?:min-|max-)?(?:width|height|inline-size|block-size)|offset(?:-.*)?|perspective|flex(?:-basis|-grow|-shrink)?|gap|row-gap|column-gap|grid-template-(?:rows|columns)|font-size|letter-spacing|line-height)$/.test(property);
  const longMove = t => moving(t.property) && seconds(t.duration) > 5;
  for (const row of geometry.filter(row => (row.paint.transitions ?? []).some(longMove) && visible(row) && !hiddenFrom(row.path))) {
    const t = row.paint.transitions.find(longMove);
    for (const s of (row.reducedMotion ?? []).filter(s => (s.paint.transitions ?? []).some(longMove)))
      report(warnings, 'W_A11Y_TRANSITION_MOTION', 'warning', `${row.box.label} transitions ${t.property} over ${t.duration} and prefers-reduced-motion: reduce does not shorten it; a change of state then moves the box for over 5s, also for people who asked for less motion. Set transition: none (or a short duration) under @media (prefers-reduced-motion: reduce)`, row, s.region, { rule: 'motion', transition: t });
  }
  // flash (SC 2.3.1): an animation whose frames swing the box's composited luminance by 0.1 or more (the darker side
  // below 0.8) is a pair of opposing changes per flash. Over three flashes in a second, on a box of at least the WCAG
  // small-safe area (21824 px², a quarter of 341 × 256), is an error. Frames give background-color and opacity.
  const flashSeconds = value => { const m = /^(\d+(?:\.\d+)?|\.\d+)(ms|s)$/.exec(String(value)); return m ? Number(m[1]) / (m[2] === 'ms' ? 1000 : 1) : null; };
  const constant = a => a && a.x.n === 0n && a.y.n === 0n ? number(a.b) : null;
  // Each animation of the list.
  for (const row of placed.filter(row => (row.paint.animations ?? []).length && visible(row) && !hiddenFrom(row.path) && row.chain)) for (const a of row.paint.animations.filter(a => keyframeFrames?.get(a.name)?.length)) {
    const duration = flashSeconds(a.duration), count = a.count === 'infinite' ? Infinity : Number(a.count);
    if (!(duration > 0) || a.playState === 'paused' || !(count > 0)) continue;
    const frames = keyframeFrames.get(a.name), own = row.chain.at(-1);
    const steps = [...(frames[0].offset > 0 ? [{ offset: 0, props: {} }] : []), ...frames, ...(frames.at(-1).offset < 1 ? [{ offset: 1, props: {} }] : [])];
    const behind = backdrop([...row.chain.slice(0, -1), { color: '#000', backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' }]);
    const shade = step => {
      const color = parseColor(step.props['background-color'] ?? own.backgroundColor), op = step.props.opacity ?? own.opacity ?? '1';
      const alpha = /^(?:\d+(?:\.\d+)?|\.\d+)%?$/.test(String(op)) ? (String(op).endsWith('%') ? parseFloat(op) / 100 : Number(op)) : null;
      return color && alpha !== null && !behind.unknown ? over({ ...color, a: color.a * Math.min(1, alpha) }, behind.bg) : null;
    };
    const colors = steps.map(shade), levels = colors.map(c => c && luminance(c));
    if (levels.some(level => level === null)) { report(unknowns, 'U_A11Y_FLASH', 'unknown', `${row.box.label}: the colors of animation ${a.name} are not modeled, so whether it flashes is unknown`, row, row.region, { rule: 'flash' }); continue; }
    // A general flash change (luminance) or a red flash change: a saturated red (R/(R+G+B) ≥ 0.8) on either side and
    // the (R − G − B) × 320 value (sRGB 0–1, negative as 0) moving by more than 20.
    const red = c => { const [r, g, b] = [c.r / 255, c.g / 255, c.b / 255]; return { saturated: r + g + b > 0 && r / (r + g + b) >= 0.8, value: Math.max(0, r - g - b) * 320 }; };
    const change = (i, j) => { const [x, y] = [levels[i], levels[j]], [p, q] = [red(colors[i]), red(colors[j])]; return (Math.abs(x - y) >= 0.1 && Math.min(x, y) < 0.8) || ((p.saturated || q.saturated) && Math.abs(p.value - q.value) > 20); };
    let changes = 0; for (let i = 1; i < levels.length; i++) if (change(i - 1, i)) changes++;
    // Repeating without alternate jumps from the last frame back to the first.
    const wraps = count > 1 && !/alternate/.test(String(a.direction)) && change(levels.length - 1, 0);
    const perIteration = changes + (wraps ? 1 : 0), perSecond = perIteration / duration / 2, total = (perIteration * Math.min(count, 1e9)) / 2;
    if (!(perSecond > 3) || !(total > 3)) continue;
    const width = constant(row.inline), heightValue = constant(row.block);
    if (width === null || heightValue === null) { report(unknowns, 'U_A11Y_FLASH', 'unknown', `${row.box.label} flashes ${perSecond.toFixed(1)} times a second; its area varies, so whether it passes the small-flash threshold is not decided`, row, row.region, { rule: 'flash' }); continue; }
    if (width * heightValue >= 21824) report(findings, 'E_A11Y_FLASH', 'error', `${row.box.label} flashes ${perSecond.toFixed(1)} times a second over ${width}×${heightValue}px (SC 2.3.1 allows three)`, row, row.region, { rule: 'flash', perSecond });
  }
  // blink: marquee and blink move or flash with no pause mechanism.
  for (const row of geometry.filter(row => ['marquee', 'blink'].includes(row.box.tag) && visible(row)))
    report(findings, 'E_A11Y_BLINK', 'error', `${row.box.label} is a <${row.box.tag}>, which moves or blinks without a way to pause it`, row, row.region, { rule: 'blink' });
  // definition-list: dl contains dt/dd groups (optionally wrapped in div); dt/dd live in dl.
  for (const row of geometry.filter(row => visible(row) && !hiddenFrom(row.path))) {
    const box = row.box, parentBox = boxOf.get(row.path.slice(0, row.path.lastIndexOf('/')));
    const grouped = child => ['dt', 'dd'].includes(child.tag);
    if (box.tag === 'dl' && box.role === undefined && (box.children ?? []).some(child => !grouped(child) && !['script', 'template'].includes(child.tag) && !(child.tag === 'div' && (child.children ?? []).every(grouped))))
      report(findings, 'E_A11Y_DL', 'error', `${box.label} has a child that is not dt, dd or a div of them`, row, row.region, { rule: 'definition-list' });
    if (['dt', 'dd'].includes(box.tag) && !(parentBox?.tag === 'dl' || (parentBox?.tag === 'div' && boxOf.get(parentBox.path.slice(0, parentBox.path.lastIndexOf('/')))?.tag === 'dl')))
      report(findings, 'E_A11Y_DL', 'error', `${box.label} is outside a dl`, row, row.region, { rule: 'definition-list' });
  }
  // accesskeys: one key, one element.
  const keyed = new Map();
  for (const box of treeBoxes.values()) if (box.accessKey && box.accessKey !== 'dynamic') keyed.set(box.accessKey, [...(keyed.get(box.accessKey) ?? []), box]);
  for (const [key, list] of keyed) for (const box of list.slice(1)) report(warnings, 'W_A11Y_ACCESSKEY', 'warning', `${box.label} repeats accesskey ${JSON.stringify(key)} of ${list[0].label}`, whole(box), domain, { rule: 'accesskeys', accessKey: key });
  // server-side-image-map: ismap sends pointer coordinates only.
  for (const row of geometry.filter(row => row.box.tag === 'img' && row.box.ismap && visible(row) && !hiddenFrom(row.path)))
    report(warnings, 'W_A11Y_ISMAP', 'warning', `${row.box.label} is a server-side image map (ismap); its regions cannot be reached by keyboard`, row, row.region, { rule: 'server-side-image-map' });
  // aria-hidden-body: Chromium ignores aria-hidden on body (measured: the content stays in the AX tree), so the
  // other rules keep it exposed; user agents that honor it hide the whole document.
  for (const box of treeBoxes.values()) if (box.tag === 'body' && box.ariaHidden === true) report(warnings, 'W_A11Y_ARIA_HIDDEN_BODY', 'warning', `${box.label} has aria-hidden="true"; Chromium ignores it, but user agents that honor it hide the whole document`, whole(box), domain, { rule: 'aria-hidden-body' });

  // input-image-alt: an image button is named by its alt (not a label or value).
  for (const row of geometry.filter(row => row.box.tag === 'input' && row.box.inputType === 'image' && visible(row) && !hiddenFrom(row.path) && nameOf(row.box) !== true)) {
    // HTML-AAM: aria-labelledby, aria-label, alt, value, title; otherwise the UA's "Submit" (not a description).
    if (row.box.value && row.box.value !== 'dynamic' && row.box.value.trim()) continue;
    if (row.box.alt === 'dynamic' || row.box.value === 'dynamic' || nameOf(row.box) === 'dynamic') report(unknowns, 'U_A11Y_INPUT_IMAGE_ALT', 'unknown', `${row.box.label}: a dynamic alt may be empty`, row, row.region, { rule: 'input-image-alt' });
    else if (!row.box.alt) report(findings, 'E_A11Y_INPUT_IMAGE_ALT', 'error', `${row.box.label} is an image button without alt text`, row, row.region, { rule: 'input-image-alt' });
  }
  // fragment-target: #id links go to an element that exists and renders where the link does (display: contents
  // targets render through their children). "#" and "#top" go to the top of the page.
  const rendersAt = box => geometry.filter(row => row.path === box.path || isAncestor(box.path, row.path));
  for (const row of geometry.filter(row => row.box.tag === 'a' && typeof row.box.href === 'string' && /^#./.test(row.box.href) && row.box.href !== '#top' && visible(row) && !hiddenFrom(row.path))) {
    let id; try { id = decodeURIComponent(row.box.href.slice(1)); } catch { id = row.box.href.slice(1); }
    const target = byId.get(id);
    if (!target) { report(findings, 'E_A11Y_FRAGMENT', 'error', `${row.box.label} links to #${id}, which no element has`, row, row.region, { rule: 'fragment-target', reference: id }); continue; }
    let missing = [row.region];
    for (const shown of rendersAt(target)) missing = missing.flatMap(region => subtract(region, shown.region));
    for (const region of missing) report(findings, 'E_A11Y_FRAGMENT', 'error', `${row.box.label} links to #${id}, which does not render here`, row, region, { rule: 'fragment-target', reference: id });
  }
  // fragment-under-bar: following #id scrolls the target's top (less its scroll-margin and the viewport's scroll-padding)
  // to the viewport top, as far as the page scrolls (s = top − padding − margin, within [0, page − viewport]). If a
  // fixed bar, or a sticky one stuck at that s, spans that line, the target starts behind it (a heading under a header).
  const jumpBars = placed.filter(row => (row.fixed || (row.sticky && row.sticky.parent)) && visible(row) && seen(row));
  const pageRow = geometry.find(row => row.path === root.path && row.origin && row.block);
  if (jumpBars.length && block && viewportBlock && pageRow) {
    const length = value => value === undefined || value === 'auto' ? 0 : Number(String(value).replace(/px$/, ''));
    const padding = root.tag === 'html' ? pageRow.paint.scrollPadding : scrollPaddingDeclared ? null : { top: 'auto' };
    const maxScroll = diff(bottom(pageRow), viewportBlock);
    for (const link of geometry.filter(row => row.box.tag === 'a' && typeof row.box.href === 'string' && /^#./.test(row.box.href) && row.box.href !== '#top' && visible(row) && !hiddenFrom(row.path))) {
      let id; try { id = decodeURIComponent(link.box.href.slice(1)); } catch { id = link.box.href.slice(1); }
      const box = byId.get(id);
      if (!box) continue;
      if (!padding) { report(unknowns, 'U_A11Y_SCROLL_PADDING', 'unknown', `${link.box.label}: the viewport's scroll-padding is set outside the analyzed root, so where #${id} lands is unknown`, link, link.region, { rule: 'fragment-under-bar' }); continue; }
      for (const target of placed.filter(row => row.path === box.path)) {
        const want = diff(target.origin.block, scalar(length(padding.top) + length(target.paint.scrollMargin?.top)));
        const base = intersect(link.region, target.region);
        // [region, s, y]: scrolled to the line; stopped at the top; stopped at the bottom.
        const cases = [[atMost(atMost(base, scalar(0), want), want, maxScroll), want, diff(target.origin.block, want)],
          [below(base, want, scalar(0)), scalar(0), target.origin.block],
          [atMost(below(base, maxScroll, want), scalar(0), maxScroll), maxScroll, diff(target.origin.block, maxScroll)]];
        let reported = false;
        for (const bar of jumpBars) {
          if (reported || related(bar.path, target.path) || related(bar.path, link.path)) continue;
          const parent = bar.sticky ? placed.find(p => p.path === bar.sticky.parent) : null;
          if (bar.sticky && !parent) continue;
          for (const [region0, scroll, y] of cases) {
            let region = intersect(region0, bar.region);
            region = below(region, bar.origin.inline, right(target)); region = below(region, target.origin.inline, right(bar));
            const top = bar.sticky ? scalar(0) : bar.origin.block, end = bar.sticky ? bar.block : bottom(bar);
            if (bar.sticky) { region = atMost(intersect(region, parent.region), bar.origin.block, scroll); region = atMost(region, scroll, diff(bottom(parent), bar.block)); }
            region = atMost(region, top, y); region = below(region, y, end);
            if (!region) continue;
            report(warnings, 'W_A11Y_FRAGMENT_UNDER_BAR', 'warning', `${link.box.label} jumps to #${id}, whose top lands behind the ${bar.sticky ? 'sticky' : 'fixed'} ${bar.box.label}; give it scroll-margin-top (or the viewport scroll-padding-top) of the bar's height`, link, region, { rule: 'fragment-under-bar', target: target.path, cover: bar.path });
            reported = true; break;
          }
        }
      }
    }
  }

  // state-mismatch: the announced state (aria-expanded, a tab's aria-selected) and what the CSS renders for the
  // controlled element (aria-controls) must agree, wherever the control itself shows.
  const treeDescendants = box => (box.children ?? []).concat(box.inline ?? []).flatMap(child => [child, ...treeDescendants(child)]);
  const renderedRows = box => geometry.filter(row => (row.path === box.path || isAncestor(box.path, row.path)) && visible(row) && !row.box.pseudo);
  for (const row of geometry.filter(row => row.box.aria && visible(row) && !hiddenFrom(row.path))) {
    const aria = row.box.aria, state = aria['aria-expanded'] ?? (roleOf(row.box) === 'tab' ? aria['aria-selected'] : undefined);
    const controls = aria['aria-controls'];
    if (!['true', 'false'].includes(state?.trim()) || !controls || controls === 'dynamic') continue;
    const what = aria['aria-expanded'] !== undefined ? 'aria-expanded' : 'aria-selected';
    for (const id of controls.trim().split(/\s+/)) {
      const target = byId.get(id);
      if (!target) continue; // aria-reference reports missing ids
      const rendered = renderedRows(target);
      let regions;
      if (state.trim() === 'true') { regions = [row.region]; for (const r of rendered) regions = regions.flatMap(region => subtract(region, r.region)); }
      else regions = rendered.map(r => intersect(row.region, r.region)).filter(Boolean);
      for (const region of regions) report(warnings, 'W_A11Y_STATE_MISMATCH', 'warning', state.trim() === 'true' ? `${row.box.label} has ${what}="true" but #${id} does not render here` : `${row.box.label} has ${what}="false" but #${id} renders here`, row, region, { rule: 'state-mismatch', controls: id });
    }
  }

  // error-message (SC 3.3.1): an invalid field points at a message that renders where the field does.
  for (const row of geometry.filter(row => row.box.aria?.['aria-invalid']?.trim() === 'true' && visible(row) && !hiddenFrom(row.path))) {
    const aria = row.box.aria, ids = [aria['aria-errormessage'], aria['aria-describedby']].filter(v => v && v !== 'dynamic').flatMap(v => v.trim().split(/\s+/));
    if (!ids.length) { if (aria['aria-errormessage'] !== 'dynamic' && aria['aria-describedby'] !== 'dynamic') report(warnings, 'W_A11Y_INVALID_NO_MESSAGE', 'warning', `${row.box.label} is aria-invalid="true" with no aria-errormessage or aria-describedby saying what is wrong`, row, row.region, { rule: 'error-message' }); continue; }
    if (!aria['aria-errormessage'] || aria['aria-errormessage'] === 'dynamic') continue;
    for (const id of aria['aria-errormessage'].trim().split(/\s+/)) {
      const target = byId.get(id);
      if (!target) continue;
      let missing = [row.region];
      for (const r of renderedRows(target)) missing = missing.flatMap(region => subtract(region, r.region));
      for (const region of missing) report(warnings, 'W_A11Y_ERROR_HIDDEN', 'warning', `${row.box.label} is aria-invalid="true" but its error message #${id} does not render here`, row, region, { rule: 'error-message', message: id });
    }
  }

  // modal-background: while an aria-modal dialog renders, focus can still Tab out to content that is not inert or
  // aria-hidden (a script may trap it; that is outside the tree, so a warning).
  for (const dialog of geometry.filter(row => ['dialog', 'alertdialog'].includes(roleOf(row.box)) && row.box.aria?.['aria-modal']?.trim() === 'true' && visible(row) && !hiddenFrom(row.path))) {
    const outside = placed.concat(geometry.filter(row => !row.origin)).filter(row => focusable(row) && !hiddenFrom(row.path) && !row.box.pseudo && row.path !== dialog.path && !isAncestor(dialog.path, row.path) && intersect(row.region, dialog.region));
    const seen = new Set();
    for (const row of outside) {
      if (seen.has(row.path)) continue; seen.add(row.path);
      report(warnings, 'W_A11Y_MODAL_BACKGROUND', 'warning', `${row.box.label} can take focus outside the modal ${dialog.box.label}; make the background inert (or aria-hidden and unfocusable)`, row, intersect(row.region, dialog.region), { rule: 'modal-background', dialog: dialog.path });
    }
  }

  // new-window (G201): a link that opens a new window or tab should say so in its name.
  const newWindowWords = /new (?:window|tab)|opens? in|external|別ウィンドウ|新しいウィンドウ|新しいタブ|別タブ|外部サイト/i;
  for (const row of geometry.filter(row => row.box.tag === 'a' && row.box.target === '_blank' && row.box.focusable !== false && visible(row) && !hiddenFrom(row.path))) {
    const name = [row.box.ariaLabel !== 'dynamic' ? row.box.ariaLabel : '', row.box.textContent !== 'dynamic' ? row.box.textContent : '', ...treeDescendants(row.box).map(b => [b.textContent, b.alt].filter(v => v && v !== 'dynamic').join(' '))].join(' ');
    if (row.box.ariaLabel === 'dynamic' || row.box.textContent === 'dynamic') continue;
    if (!newWindowWords.test(name)) report(warnings, 'W_A11Y_NEW_WINDOW', 'warning', `${row.box.label} opens in a new window or tab (target="_blank") but its name does not say so`, row, row.region, { rule: 'new-window' });
  }
  // form-submit (SC 3.2.2): a form with fields needs a way to submit that is not a change of context.
  for (const row of geometry.filter(row => row.box.tag === 'form' && visible(row) && !hiddenFrom(row.path))) {
    const inside = treeDescendants(row.box);
    const fields = inside.filter(b => ['input', 'select', 'textarea'].includes(b.tag) && !['hidden', 'submit', 'image', 'button', 'reset'].includes(b.inputType));
    const submit = inside.some(b => (b.tag === 'button' && !['button', 'reset'].includes(b.buttonType ?? 'submit')) || (b.tag === 'input' && ['submit', 'image', 'dynamic'].includes(b.inputType)));
    if (fields.length && !submit) report(warnings, 'W_A11Y_FORM_SUBMIT', 'warning', `${row.box.label} has fields but no submit button`, row, row.region, { rule: 'form-submit' });
  }

  // focus-semantics: a non-interactive element made focusable (tabindex >= 0) without a role is announced as a
  // generic group, so a keyboard user reaches a stop with no purpose. Scroll containers are exempt (they need focus).
  const nativeFocus = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary', 'audio', 'video', 'iframe', 'area', 'details']);
  for (const row of geometry) {
    const box = row.box, role = roleOf(box);
    if (!(box.tabIndex >= 0) || box.focusable === false || nativeFocus.has(box.tag) || box.role === 'dynamic' || row.overflow === 'scroll' || !visible(row)) continue;
    if (role && !['none', 'presentation', 'generic'].includes(role)) continue;
    report(warnings, 'W_A11Y_FOCUS_SEMANTICS', 'warning', `${box.label} takes focus (tabindex ${box.tabIndex}) but has no interactive role; give it a role or drop the tabindex`, row, row.region, { rule: 'focus-semantics' });
  }

  // native-aria-conflict: ARIA in HTML forbids aria-required/aria-disabled/aria-checked that contradict the native
  // attribute; Chromium announces the native state, so the ARIA one is silently wrong (measured).
  for (const box of treeBoxes.values()) {
    const aria = box.aria ?? {}, native = box.nativeStates ?? {};
    const conflicts = [['required', 'aria-required'], ['disabled', 'aria-disabled'], ['checked', 'aria-checked']].filter(([name, attr]) => {
      const value = aria[attr]?.trim();
      if (value === undefined || value === 'dynamic' || (name === 'checked' && !['checkbox', 'radio'].includes(box.inputType))) return false;
      // aria-required/aria-disabled "true" without the native attribute is allowed (it adds the state); a native
      // checkbox or radio always has its own checked state.
      return name === 'checked' ? (native.checked === true) !== (value === 'true') : native[name] === true && value === 'false';
    });
    for (const [name, attr] of conflicts) report(warnings, 'W_A11Y_NATIVE_ARIA_CONFLICT', 'warning', `${box.label} has ${attr}="${aria[attr].trim()}" but is ${native[name] ? '' : 'not '}${name} natively; the native state is announced`, whole(box), domain, { rule: 'native-aria-conflict', attribute: attr });
  }

  // page-main: a page needs a main landmark wherever it renders.
  if (['html', 'body'].includes(root.tag)) {
    let none = [domain];
    for (const row of geometry.filter(row => (row.box.tag === 'main' || roleOf(row.box) === 'main') && !hiddenFrom(row.path))) none = none.flatMap(region => subtract(region, row.region));
    for (const region of none) report(warnings, 'W_A11Y_NO_MAIN', 'warning', 'no main landmark renders here', whole(root), region, { rule: 'page-main' });
  }

  // color-only-state (SC 1.4.1): among three or more sibling text boxes of one tag, exactly one is set apart from all the
  // others only by its text or background color (same size, weight and decoration), and its text color contrasts with
  // theirs by less than 3:1 (G183's threshold): the difference (the current step, the selected tab) is not seen by
  // people who do not perceive the hue. aria-current and other states help screen readers, not this.
  {
    const groups = new Map();
    for (const row of placed.filter(row => row.box.text && visible(row) && !hiddenFrom(row.path) && !row.box.pseudo)) {
      const parent = row.path.slice(0, row.path.lastIndexOf('/')), key = `${parent}\u0000${row.box.tag}`;
      if (!groups.has(key)) groups.set(key, new Map());
      groups.get(key).set(row.path, row);
    }
    for (const members of groups.values()) {
      const rows = [...members.values()];
      if (rows.length < 3) continue;
      const look = row => JSON.stringify([row.paint.fontSize, row.paint.fontWeight, row.paint.decoration, row.paint.fontStyle ?? null]);
      const hue = row => JSON.stringify([row.paint.color, row.paint.backgroundColor]);
      if (new Set(rows.map(look)).size !== 1) continue;
      const counts = new Map(); for (const row of rows) counts.set(hue(row), (counts.get(hue(row)) ?? 0) + 1);
      if (counts.size !== 2) continue;
      const odd = rows.filter(row => counts.get(hue(row)) === 1);
      if (odd.length !== 1 || rows.length - 1 < 2) continue;
      const one = odd[0], other = rows.find(row => row !== one);
      const a = parseColor(String(one.paint.color)), b = parseColor(String(other.paint.color));
      if (!a || !b) continue;
      if (contrastRatio(a, b) >= 3) continue;
      report(warnings, 'W_A11Y_COLOR_ONLY_STATE', 'warning', `${one.box.label} is set apart from its ${rows.length - 1} siblings only by its color (contrast ${contrastRatio(a, b).toFixed(2)}:1 with theirs, below 3:1): people who do not perceive the hue cannot tell it apart. Add another cue (weight, an underline, an icon or a border)`, one, one.region, { rule: 'color-only-state' });
    }
  }
  // click-trap: a layer painted over the page covers its controls entirely, and neither the layer nor anything painted
  // above it offers a control that shows and can be operated: the page cannot be used and the layer cannot be left.
  // The layer of a cover (against one target) is its outermost positioned ancestor-or-self that does not contain the
  // target. Only covers that paint count (a cover that paints nothing is E_A11Y_INVISIBLE_BLOCKER), and only where the
  // target stays under the layer whatever the scroll position: both fixed, both scrolled with the page, or a fixed
  // layer over the whole viewport. A frame (iframe, object, embed) in the layer that paints may hold the way out: Unknown.
  {
    const isFrame = row => ['iframe', 'object', 'embed', 'frame'].includes(row.box.tag);
    const layerOf = (cover, target) => { let found = null; for (let p = cover.path; p && !isAncestor(p, target.path); p = parentPath(p)) { const r = rowAt(p); if (r && r.position !== 'static') found = r; } return found; };
    const meet = (as, bs) => as.flatMap(a => bs.map(b => intersect(a, b)).filter(Boolean));
    const minus = (as, bs) => bs.reduce((rest, b) => rest.flatMap(a => subtract(a, b)), as);
    const contains = (outer, inner, region) => {
      let r = atMost(region, outer.origin.inline, inner.origin.inline); r = atMost(r, right(inner), right(outer));
      r = atMost(r, outer.origin.block, inner.origin.block); return atMost(r, bottom(inner), bottom(outer));
    };
    const fillsViewport = (row, region) => {
      if (!viewportBlock) return null;
      let r = atMost(region, row.origin.inline, scalar(0)); r = atMost(r, domainWidth, right(row));
      r = atMost(r, row.origin.block, scalar(0)); return atMost(r, viewportBlock, bottom(row));
    };
    const pinnedFixed = row => pinnedPieces(row, r => r.fixed);
    // A fixed layer over a target in the flow: scrolling by s in [0, R] (R the page's scroll range) moves the target up
    // by s, so it stays under the layer when the page cannot scroll (R <= 0), or when the layer still holds it at s = R
    // (it does at s = 0: the pair is contained). Only where the page's scroll range is the root's (a body that clips or
    // scrolls of its own is not modelled: no finding there).
    const rangeKnown = scrolledPage && viewportBlock && bodyRows.every(row => row.overflowY === 'visible' && row.overflowX === 'visible');
    const outOfReach = (layerRow, target, region) => {
      if (!rangeKnown) return [];
      const range = diff(bottom(scrolledPage), viewportBlock);
      const still = atMost(region, bottom(scrolledPage), viewportBlock);
      const short = atMost(below(region, viewportBlock, bottom(scrolledPage)), sum(layerRow.origin.block, range), target.origin.block);
      return [still, short].filter(Boolean);
    };
    // Where the target stays under the layer at every scroll position.
    const stuck = (layerRow, target, region) => {
      if (stillPage) return [region];
      const lp = meet([region], pinnedFixed(layerRow)), tp = meet([region], pinnedFixed(target));
      const lf = minus([region], lp), tf = minus([region], tp);
      const caught = r => { const full = fillsViewport(layerRow, r), all = full ? [full] : []; return [...all, ...minus(outOfReach(layerRow, target, r), all)]; };
      return [...meet(lp, tp), ...meet(lf, tf), ...meet(lp, tf).flatMap(caught)];
    };
    const sized = (row, region) => below(below(region, scalar(0), row.inline), scalar(0), row.block);
    const onScreen = (row, region) => {
      if (!pinnedFixed(row).length) return region;
      let r = below(region, row.origin.inline, domainWidth); r = below(r, scalar(0), right(row)); r = below(r, scalar(0), bottom(row));
      return viewportBlock ? below(r, row.origin.block, viewportBlock) : r;
    };
    // Where a candidate is not clipped away by the boxes that hide its overflow (overflow: hidden or clip): it must
    // reach into each one's padding box. A box clips the descendants whose containing block it is or holds (an absolute
    // box escapes non-positioned clippers between it and its containing block; a fixed one escapes them all).
    const unclipped = (row, region) => {
      const transformed = c => (c.paint?.transform ?? 'none') !== 'none';
      const escapeOf = c => c.position === 'fixed' ? 'fixed' : c.position === 'absolute' ? 'abs' : null;
      let r = region, escape = escapeOf(row);
      for (let p = parentPath(row.path); p && r; p = parentPath(p)) {
        const c = rowAt(p);
        if (!c) continue;
        if (escape === 'fixed') { if (!transformed(c)) continue; escape = null; }
        else if (escape === 'abs' && (c.position !== 'static' || transformed(c))) escape = null;
        if (escape) continue;
        const at = c.origin ?? c.clipOrigin;
        if (c.overflow === 'clip' && !c.box.documentRoot && c.path !== root.path && c.box.tag !== 'body' && at && c.block) {
          const both = c.overflowValue !== 'clip', edge = side => scalar(c.borders?.[side] ?? q(0));
          if (both || c.clipAxes?.inline) { r = below(r, sum(at.inline, edge('left')), right(row)); r = below(r, row.origin.inline, diff(sum(at.inline, c.inline), edge('right'))); }
          if (both || c.clipAxes?.block) { r = below(r, sum(at.block, edge('top')), bottom(row)); r = below(r, row.origin.block, diff(sum(at.block, c.block), edge('bottom'))); }
        }
        escape = escapeOf(c);
      }
      return r;
    };
    const ownPointer = row => row.paint.cursor === 'pointer' && row.chain?.at(-2)?.cursor !== 'pointer';
    const takesFocus = row => interactive(row) || row.box.tabIndex >= 0 || row.box.focusable === true || row.box.focusable === 'dynamic';
    // Why a candidate is no way out whatever the viewport (empty: it may be one where it renders, uncovered).
    // Where a candidate shows: where it, or a descendant laid out there, paints (a descendant shown at some widths only
    // makes it seen there only).
    const shownWhere = row => meet([row.region], [row, ...everything.filter(d => isAncestor(row.path, d.path))].filter(d => d.region && !paintsNothing(d)).map(d => d.region));
    // dark: whether it paints nothing somewhere in its region (the reason is then listed).
    const staticWhy = (row, dark) => {
      const why = [];
      if (inertAt(row)) why.push('is inert');
      if (row.paint.pointerEvents === 'none') why.push('takes no pointer (pointer-events: none)');
      if (row.box.nativeStates?.disabled === true) why.push('is disabled');
      // A background-image the browser dropped (W_CSS_IMAGE_INVALID) is often the image the control was meant to show.
      const dropped = row.paint.droppedImage?.[0], lost = dropped ? `; its ${dropped.property} ${dropped.value} is dropped by the browser (W_CSS_IMAGE_INVALID)` : '';
      if (dark) { const reason = paintsNothing(row) ?? 'no text, background, border or image there'; why.push(reason === 'opacity 0' ? 'is invisible (opacity 0)' : reason === 'visibility: hidden' ? 'is hidden (visibility: hidden)' : reason === 'it is clipped to nothing' ? 'is clipped to nothing' : `paints nothing (${reason}${lost})`); }
      if (!isFrame(row) && !takesFocus(row)) why.push('cannot take focus and has no role (only cursor: pointer)');
      return why;
    };
    const byLayer = new Map();
    for (const pair of coverPairs) {
      const { target, cover } = pair;
      // A cover that paints nothing is an invisible blocker, unless a descendant without a position paints (a frame in a
      // clipping layer): then it may be seen, and its layer gets the trap analysis like a painted one.
      if ((paintsNothing(cover) && !unplacedPaint(cover)) || inControl(cover) || target.box.pseudo) continue;
      const layerRow = layerOf(cover, target);
      if (!layerRow || inControl(layerRow)) continue;
      const whole = contains(cover, target, pair.region);
      if (!whole) continue;
      const pieces = stuck(layerRow, target, whole);
      if (!pieces.length) continue;
      if (!byLayer.has(layerRow.path)) byLayer.set(layerRow.path, { layerRow, pieces: [], covered: new Map() });
      const entry = byLayer.get(layerRow.path);
      entry.pieces.push(...minus(pieces, entry.pieces));
      entry.covered.set(target.path, target);
    }
    // Candidates: controls, focusable boxes, boxes that look clickable, and frames.
    const candidate = (row, layerRow) => !row.box.pseudo && row.path !== layerRow.path && visible(row) && (interactive(row) || takesFocus(row) || ownPointer(row) || isFrame(row));
    const hitPaths = new Set(hitPlaced.map(row => row.path));
    // Judges one layer: where none of the candidates is a way out over the pieces, an error (or Unknown where a frame
    // or a candidate without a position may be one). how: { lead, leadMaybe } words the finding.
    const judge = ({ layerRow, pieces, covered }, candidates, unplaced, how) => {
      const exits = [], frames = [], failing = [];
      for (const row of candidates) {
        const shown = shownWhere(row), dark = minus([row.region], shown).length > 0;
        const hard = staticWhy(row, false), why = staticWhy(row, dark);
        // Every hit-testable cover takes the click where it covers the candidate, whether or not it paints (a
        // transparent link over the close button takes it).
        // (Every candidate, not only the controls: a painted div with tabindex=0 under a box of its own layer is covered too.)
        const over = coversOf(row).map(p => ({ cover: p.cover, region: contains(p.cover, row, p.region) })).filter(p => p.region);
        const placedAt = (() => { let r = sized(row, row.region); r = r && onScreen(row, r); r = r && unclipped(row, r); return r ? [r] : []; })();
        const where = meet(minus(placedAt, over.map(p => p.region)), shown);
        if (isFrame(row) && !hard.length) { frames.push({ row, where }); if (!dark) continue; }
        else if (!hard.length && where.length) exits.push({ row, where });
        const covers = [...new Map(over.filter(p => meet(placedAt, [p.region]).length).map(p => [p.cover.path, p.cover])).values()];
        const coveredWhy = covers.length ? `is covered by ${covers.map(c => `${c.box.label}${paintsNothing(c) ? ', which paints nothing' : ''}`).join(' and ')}` : '';
        failing.push({ box: row.box.label, path: row.path, why: why.length ? [...why, ...(coveredWhy ? [coveredWhy] : [])].join(' and ') : coveredWhy ? `${coveredWhy} (or has no size or is off-screen here)` : 'has no size or is off-screen here' });
      }
      const coveredRows = [...covered.values()].sort((a, b) => treeOrder(a.path, b.path));
      const labels = coveredRows.map(r => r.box.label);
      const named = `${labels.length} control${labels.length === 1 ? '' : 's'} of the page (${labels.slice(0, 5).join(', ')}${labels.length > 5 ? ', …' : ''})`;
      const reasons = failing.length ? failing.slice(0, 4).map(f => `${f.box} ${f.why}`).join('; ') + (failing.length > 4 ? `; and ${failing.length - 4} more` : '') : how.none;
      const extra = { rule: 'click-trap', covered: labels, exits: failing, ...how.extra };
      let trapped = pieces;
      for (const exit of exits) trapped = minus(trapped, exit.where);
      for (const { row, where } of frames) {
        const maybe = meet(trapped, where);
        for (const piece of maybe) report(unknowns, 'U_A11Y_CLICK_TRAP', 'unknown', `${how.lead(named)}, and nothing ${how.scope} that the analysis can see is a way out (${reasons}); but ${layerRow.box.label} shows ${row.box.label}, whose content is not analysed: the way out may be inside it`, layerRow, piece, { ...extra, frame: row.path });
        trapped = minus(trapped, where);
      }
      for (const row of unplaced) {
        const maybe = meet(trapped, [row.region]);
        for (const piece of maybe) report(unknowns, 'U_A11Y_CLICK_TRAP', 'unknown', `${how.lead(named)}, and nothing ${how.scope} that the analysis can place is a way out (${reasons}); but the position of ${row.box.label} is not known (it is inside a box that scrolls): it may be the way out`, layerRow, piece, { ...extra, unplaced: row.path });
        trapped = minus(trapped, [row.region]);
      }
      for (const piece of trapped) report(findings, 'E_A11Y_CLICK_TRAP', 'error', `${how.lead(named)} and ${how.scope === 'in it' ? 'offers' : 'there is'} no way out: ${reasons}. Give ${layerRow.box.label} a close button that shows and takes focus (a <button> with a name)${how.scope === 'in it' ? ' in or above the layer' : ''}, or do not show the layer`, layerRow, piece, extra);
    };
    for (const entry of byLayer.values()) {
      const { layerRow, covered } = entry;
      // In the layer, or painted above it where they overlap it.
      const inside = hitPlaced.filter(row => candidate(row, layerRow) && isAncestor(layerRow.path, row.path));
      // Candidates in the layer whose position is not known (inside a box that scrolls): one may be the way out.
      const unplaced = geometry.filter(row => candidate(row, layerRow) && isAncestor(layerRow.path, row.path) && !hitPaths.has(row.path) && row.region);
      const above = hitPlaced.filter(row => candidate(row, layerRow) && !related(row.path, layerRow.path) && !covered.has(row.path) && paintsAbove(row, layer(row), layerRow, layer(layerRow)) && overlap(row, layerRow))
        .map(row => ({ ...row, region: overlap(row, layerRow) }));
      const inFlow = [...covered.values()].some(t => !pinnedFixed(t).length);
      judge(entry, [...inside, ...above], unplaced, { lead: named => `${layerRow.box.label} covers ${named}${stillPage && inFlow ? ` (${stillWhy}: scrolling cannot free them)` : ''}`, scope: 'in it', none: 'it has no control, and none is painted above it', extra: {} });
    }
    // An inert page under a shown layer: the inert controls take no click or focus (as if covered), so the way out must
    // be a control outside the inert part (in the layer, or anywhere else on the page). The layers are the outermost
    // absolutely positioned or fixed boxes that are not inert, hold no inert control, and show something.
    // (An inert link loses its focus, so interactive() no longer counts it: its href still says it is one.)
    const inertShown = placed.filter(row => (interactive(row) || (row.box.tag === 'a' && row.box.href !== undefined)) && visible(row) && inertAt(row) && !row.box.pseudo);
    if (inertShown.length) {
      const outer = row => { for (let p = parentPath(row.path); p; p = parentPath(p)) { const r = rowAt(p); if (r && ['absolute', 'fixed'].includes(r.position)) return false; } return true; };
      const layers = hitPlaced.filter(row => ['absolute', 'fixed'].includes(row.position) && !inertAt(row) && visible(row) && outer(row) && !inertShown.some(t => related(t.path, row.path))
        && (shownWhere(row).length || unplacedPaint(row)));
      const covered = new Map(inertShown.sort((a, b) => treeOrder(a.path, b.path)).map(r => [r.path, r]));
      for (const layerRow of layers) {
        const pieces = minus(meet([layerRow.region], inertShown.map(r => r.region)), []);
        if (!pieces.length) continue;
        const candidates = hitPlaced.filter(row => candidate(row, layerRow) && !inertAt(row));
        const unplaced = geometry.filter(row => candidate(row, layerRow) && !inertAt(row) && !hitPaths.has(row.path) && row.region);
        const plural = covered.size === 1 ? 'is' : 'are';
        judge({ layerRow, pieces, covered }, candidates, unplaced, { lead: named => `${named} ${plural} inert (they take no click or focus) while ${layerRow.box.label} shows`, scope: 'outside the inert part', none: 'no control outside the inert part', extra: { inert: true } });
      }
    }
  }
  return { findings: dedupe(findings), warnings: dedupe(warnings), unknowns: dedupe(unknowns), exempted: dedupe(exempted), notes };
}

// Color contrast where the layout is Unknown (ADR-0016 M7): rules/contrast.mjs judges the style stage's rows; this adds
// where each warning holds (the ranges and, with a height, the exact region).
export function judgeContrastUnplaced({ rows }, { contrast = 'AA', defaultColors = null, ranges, block }) {
  return { warnings: unplacedContrast(rows, { contrast, uaColors: defaultColors, where: region => ({ ...ranges(region), ...(block ? { regionConstraints: serialize(region).constraints } : {}) }) }) };
}

function dedupe(rows) {
  const seen = new Set();
  return rows.filter(row => { const key = JSON.stringify([row.code, row.path, row.other, row.cover, row.before, row.previous, row.outer, row.reference, row.id, row.name, row.range, row.heightRange, row.side]); if (seen.has(key)) return false; seen.add(key); return true; });
}
