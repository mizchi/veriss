import {q, div} from './linear.mjs';
import {scalar, sum, diff, times} from './region.mjs';
import {px} from './css.mjs';

/** Fixed coefficients only; no evaluation, variable products or intrinsic sizing. */
export function insetLength(text, basis) {
  const atom = value => {
    // env(safe-area-inset-*): the device's inset (the safeArea option; 0 without viewport-fit=cover, as browsers report).
    if (/^env\(\s*safe-area-inset-(?:top|right|bottom|left)\s*(?:,[^()]*)?\)$/.test(value)) return scalar(px(value));
    if (!/^[+-]?(?:\d+(?:\.\d{1,20})?)(?:px|%)$/.test(value) && value !== '0') throw new Error(`Unsupported positioned length: ${text}`);
    value=value.replace(/^\+/,'');
    return value.endsWith('%') ? times(basis, div(q(value.slice(0, -1)), q(100))) : scalar(q(value.replace(/px$/, '')));
  };
  if (!text.startsWith('calc(')) return atom(text);
  const terms = /^calc\(((?:[^()]|\([^()]*\))+)\)$/.exec(text)?.[1].trim().split(/\s+([+-])\s+/);
  if (!terms || terms.length > 31) throw new Error(`Unsupported positioned calc: ${text}`);
  let result = atom(terms[0]);
  for (let i = 1; i < terms.length; i += 2) result = terms[i] === '+' ? sum(result, atom(terms[i + 1])) : diff(result, atom(terms[i + 1]));
  return result;
}

/** A px margin (negative too) of an absolutely positioned box; auto and % margins are not modeled. */
export const absoluteMarginText = value => value === undefined || /^(?:0|-?\d+(?:\.\d{1,20})?px)$/.test(String(value));
const marginLength = (style, key) => {
  const value = style[key];
  if (value === undefined || ['0', '0px'].includes(String(value))) return scalar(0);
  if (!absoluteMarginText(value)) throw new Error(`Unsupported margin on an absolutely positioned box: ${key}: ${value}`);
  return scalar(q(String(value).slice(0, -2)));
};

// staticPosition: where the box sits on an axis whose insets are both auto (relative to the containing block), when known.
// A px margin moves the margin box off the inset (CSS 2 §10.3.7, §10.6.4): the border box starts at the start inset plus
// the start margin, or ends at the end inset less the end margin. (On a static axis the margins are Unknown upstream.)
export function absoluteOrigin(style, containing, size, staticPosition) {
  const coordinate = (start, end, basis, dimension, axis) => {
    if (style[start] === 'auto' && style[end] === 'auto' && staticPosition?.[axis]) return staticPosition[axis];
    if ((style[start] === 'auto') === (style[end] === 'auto')) throw new Error('Absolute positioning requires exactly one inset per axis');
    return style[start] !== 'auto' ? sum(insetLength(style[start], basis), marginLength(style, `margin-${start}`)) : diff(diff(diff(basis, insetLength(style[end], basis)), marginLength(style, `margin-${end}`)), dimension);
  };
  return {inline: coordinate('left', 'right', containing.inline, size.inline, 'inline'), block: coordinate('top', 'bottom', containing.block, size.block, 'block')};
}
