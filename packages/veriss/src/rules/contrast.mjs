// Color contrast (ADR-0016 M7): the text against the backgrounds of its DOM ancestors (SC 1.4.3, and the fallback
// while a background image is not shown), an icon that is a control's only content (SC 1.4.11), and a caret that is
// not seen. A row is one box in one state: {box, path, region, paint, chain}, where chain is the paint facts of its
// ancestors and itself (paintFacts), outermost first. The rows come from the layout (geometry) or, where the layout is
// Unknown, from the style stage; whether another box lies behind the text is the one geometric question, and the
// caller answers it (behind).
//   report:  report(list, code, severity, message, row, region, extra) and the lists findings, warnings, unknowns
//   options: contrast ('AA' | 'AAA'), uaColors (the caller-stated UA canvas and text colors, or null)
//   tools:   visible(row), control(row), speaks(row), isAncestor(a, b), behind(text): whether a box that is not an
//            ancestor may be painted behind the text (its chain has a positioned layer above the opaque backdrop)
import { backdrop as backdropOf, contrastRatio, parseColor } from '../color/index.mjs';

const px = value => { const m = /^(\d+(?:\.\d+)?)px$/.exec(String(value)); return m ? Number(m[1]) : undefined; };
const weight = value => value === 'bold' ? 700 : /^\d+$/.test(String(value)) ? Number(value) : 400;
// Large text: at least 18pt (24px), or 14pt (56/3 px) bold. An unknown size is not large (the stricter ratio).
export const large = facts => { const size = px(facts.fontSize); return size !== undefined && (size >= 24 || (size >= 56 / 3 && weight(facts.fontWeight) >= 700)); };

export function createContrast({ report: { report, findings, warnings, unknowns }, options: { contrast = 'AA', uaColors = null }, tools: { visible, control, speaks, isAncestor, behind } }) {
  // A filter on the box or an ancestor repaints its colors (brightness, invert, a drop shadow behind the glyphs): not modeled.
  // A rule the analysis cannot read (paintUnmodeled) or a filter may repaint the box or an ancestor: not judged.
  const backdrop = chain => chain.some(layer => layer?.paintUnmodeled) ? { unknown: 'a rule the analysis cannot read (its selector) may repaint it or an ancestor' } : chain.some(layer => (layer?.filter ?? 'none') !== 'none') ? { unknown: 'a filter on it or an ancestor changes the painted colors, which is not modeled' } : backdropOf(chain, uaColors);
  const [normal, big] = contrast === 'AAA' ? [7, 4.5] : [4.5, 3];
  // text-contrast over the DOM ancestors' backgrounds.
  function textContrast(rows) {
    // Visually hidden text (sr-only) is not seen: SC 1.4.3 does not apply to it.
    for (const text of rows.filter(row => row.box.text && visible(row) && !row.paint?.hiddenVisually)) {
      const result = backdrop(text.chain);
      // image-fallback-contrast: text over a url() background image is read against the background colors underneath
      // while the image is loading, blocked or failed. Without the images (gradients always paint, so a layer with
      // one stays Unknown), that fallback must meet the ratio too.
      const images = text.chain.filter(layer => layer.backgroundImage !== 'none');
      if (result.unknown && images.length && images.every(layer => /^url\(/i.test(String(layer.backgroundImage).trim()) && !/gradient\(/i.test(String(layer.backgroundImage)))) {
        const fallback = backdrop(text.chain.map(layer => layer.backgroundImage === 'none' ? layer : { ...layer, backgroundImage: 'none' }));
        const positioned = !fallback.unknown && text.chain.slice(fallback.opaqueAt + 1).some(layer => layer.position !== 'static');
        if (!fallback.unknown && !positioned) {
          const ratio = contrastRatio(fallback.fg, fallback.bg), required = large(text.chain.at(-1)) ? big : normal;
          if (ratio < required && Math.abs(ratio - required) >= 1e-9) report(warnings, 'W_A11Y_IMAGE_FALLBACK_CONTRAST', 'warning', `${text.box.label} is drawn over a background image; while the image is not shown (loading, blocked, failed) it has contrast ${ratio.toFixed(2)}:1 against the background color, below ${required}:1. Give the image's box a background-color that works with the text`, text, text.region, { rule: 'image-fallback-contrast', ratio, required });
        }
      }
      if (result.unknown) { report(unknowns, 'U_A11Y_CONTRAST', 'unknown', `${text.box.label}: ${result.unknown}`, text, text.region, { rule: 'text-contrast' }); continue; }
      // A positioned box above the opaque backdrop lets other boxes show through behind the text.
      const positionedAbove = text.chain.slice(result.opaqueAt + 1).some(layer => layer.position !== 'static');
      if (positionedAbove && behind(text)) { report(unknowns, 'U_A11Y_CONTRAST', 'unknown', `${text.box.label} is positioned without an opaque background of its own; the boxes behind it are not its ancestors`, text, text.region, { rule: 'text-contrast' }); continue; }
      const ratio = contrastRatio(result.fg, result.bg), required = large(text.chain.at(-1)) ? big : normal;
      // Floating-point luminance: a ratio within numeric error of the threshold is not decided (ADR-0007).
      if (Math.abs(ratio - required) < 1e-9) { report(unknowns, 'U_A11Y_CONTRAST', 'unknown', `${text.box.label} has contrast ${ratio}:1, at the ${required}:1 threshold within numeric error`, text, text.region, { rule: 'text-contrast', ratio, required }); continue; }
      if (ratio < required) report(findings, 'E_A11Y_CONTRAST', 'error', `${text.box.label} has contrast ${ratio.toFixed(2)}:1, below ${required}:1`, text, text.region,
        { rule: 'text-contrast', ratio, required, foreground: result.fg, background: result.bg });
    }
  }
  // icon-contrast (SC 1.4.11): the svg icon of a control with no visible text is the only thing that says what it is;
  // its drawn color (fill, else stroke) needs 3:1 against what lies behind it.
  function iconContrast(rows) {
    for (const icon of rows.filter(row => row.box.tag === 'svg' && visible(row) && row.chain?.at(-1)?.iconPaint !== undefined)) {
      const owner = rows.find(row => control(row) && isAncestor(row.path, icon.path));
      if (!owner || rows.some(row => row.box.tag !== 'svg' && speaks(row) && (row.path === owner.path || isAncestor(owner.path, row.path)))) continue;
      const paint = icon.chain.at(-1).iconPaint;
      if (paint === 'none') continue;
      if (paint === 'dynamic') { report(unknowns, 'U_A11Y_CONTRAST', 'unknown', `${icon.box.label}: its shapes are not drawn in one opaque color (several colors, an opacity, or a style attribute on a shape), which is not modeled`, icon, icon.region, { rule: 'icon-contrast' }); continue; }
      const result = backdrop([...icon.chain.slice(0, -1), { ...icon.chain.at(-1), color: paint }]);
      if (result.unknown) { report(unknowns, 'U_A11Y_CONTRAST', 'unknown', `${icon.box.label}: ${result.unknown.replace('the text', 'the icon')}`, icon, icon.region, { rule: 'icon-contrast' }); continue; }
      const ratio = contrastRatio(result.fg, result.bg);
      if (Math.abs(ratio - 3) < 1e-9) { report(unknowns, 'U_A11Y_CONTRAST', 'unknown', `${icon.box.label} has contrast ${ratio}:1, at the 3:1 threshold within numeric error`, icon, icon.region, { rule: 'icon-contrast' }); continue; }
      if (ratio < 3 && !findings.some(f => f.code === 'E_A11Y_ICON_CONTRAST' && f.path === icon.path))
        report(findings, 'E_A11Y_ICON_CONTRAST', 'error', `${icon.box.label} is the only content of ${owner.box.label} and is drawn in ${paint} at contrast ${ratio.toFixed(2)}:1 against its background, below the 3:1 for graphics (SC 1.4.11)`, icon, icon.region, { rule: 'icon-contrast', ratio, required: 3, foreground: result.fg, background: result.bg, control: owner.box.label });
    }
  }
  // caret-hidden: a text field whose caret is transparent, or painted in the field's own background color, does not
  // show where typing goes (the caret is the focus indicator inside a field).
  function caretHidden(rows) {
    const textEntry = box => box.tag === 'textarea' || (box.tag === 'input' && ['text', 'email', 'search', 'password', 'tel', 'url', 'number', undefined].includes(box.inputType));
    // A field that is not seen (opacity 0 on it or an ancestor, or visually hidden) shows no caret anyway: a select
    // widget's hidden input that only takes key presses hides its caret on purpose.
    const unseen = row => row.paint?.hiddenVisually || (row.chain ?? []).some(layer => /^(?:0|0?\.0+|0%)$/.test(String(layer?.opacity ?? '1').trim()));
    for (const row of rows.filter(row => textEntry(row.box) && visible(row) && !unseen(row) && row.chain?.at(-1)?.caretColor && row.chain.at(-1).caretColor !== 'auto')) {
      const layer = row.chain.at(-1), caret = parseColor(String(layer.caretColor).toLowerCase() === 'currentcolor' ? layer.color : layer.caretColor), bg = parseColor(layer.backgroundColor);
      if (!caret) continue;
      const same = bg && bg.a >= 1 && caret.a >= 1 && caret.r === bg.r && caret.g === bg.g && caret.b === bg.b;
      if ((caret.a === 0 || same) && !warnings.some(w => w.code === 'W_A11Y_CARET_HIDDEN' && w.path === row.path))
        report(warnings, 'W_A11Y_CARET_HIDDEN', 'warning', `${row.box.label} is a text field with caret-color: ${layer.caretColor}${same ? `, its own background color` : ''}: the caret that shows where typing goes is not seen. Leave caret-color auto (or give it a visible color)`, row, row.region, { rule: 'caret-hidden' });
    }
  }
  return { textContrast, iconContrast, caretHidden };
}

// Where the layout is Unknown (ADR-0016 M7). The rows come from the style stage: each box in each state of its style,
// with its ancestors' paint chain and no geometry. Nothing then shows that no other box lies behind the text (a
// negative margin, a grid area shared with it, a transform), so a ratio below the requirement is a warning that says
// so, never an error, and what cannot be decided is not reported (the analysis is Unknown already). A positioned box
// above the opaque backdrop is not decided either. The icon contrast needs the control's name from the geometric rows,
// so it waits for the layout; the hidden caret reads the field's own colors and runs as it is.
// where(region): the fields that say where a warning holds (its viewport ranges).
const unplacedCodes = { E_A11Y_CONTRAST: 'W_A11Y_CONTRAST_UNPLACED', W_A11Y_IMAGE_FALLBACK_CONTRAST: 'W_A11Y_IMAGE_FALLBACK_CONTRAST' };
export function unplacedContrast(rows, { contrast = 'AA', uaColors = null, where }) {
  const findings = [], warnings = [], unknowns = [];
  const report = (list, code, severity, message, row, region, extra) => {
    if (list === unknowns) return;
    const caveat = code in unplacedCodes;
    warnings.push({ code: unplacedCodes[code] ?? code, severity: 'warning', box: row.box.label, path: row.path, source: row.box.source, ...where(region), ...extra,
      message: caveat ? `${message}, against its ancestors' backgrounds: the layout is Unknown, so a box that is not an ancestor may lie behind it` : message });
  };
  const isAncestor = (a, b) => b.startsWith(a + '/');
  const rules = createContrast({ report: { report, findings, warnings, unknowns }, options: { contrast, uaColors },
    tools: { visible: row => row.paint.visibility === 'visible', control: () => false, speaks: () => false, isAncestor, behind: () => true } });
  rules.textContrast(rows);
  rules.caretHidden(rows);
  return warnings;
}
