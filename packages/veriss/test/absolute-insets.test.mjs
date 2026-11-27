import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// Both insets of an axis on an absolute box: an auto size fills the containing block between them (inset: 0
// overlays); with an explicit size the end inset is ignored.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const rect = (overlay, card = '') => {
  const report = analyzeHTML('<html lang="en"><body><main class="page"><div class="card"><div class="o"></div></div></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page,.card{${g}}.card{position:relative;height:200px;${card}}.o{position:absolute;${overlay}}`, viewport: {min: 400, max: 400, height: {min: 600, max: 600}}});
  assert.equal(report.status, 'verified', JSON.stringify(report.diagnostics.map(d => d.message)));
  const n = t => { const [a, b = '1'] = String(t ?? '0').split('/'); return Number(a) / Number(b); };
  const r = report.sizes.find(s => s.box === '.o').rect, v = x => n(x.constant) + 400 * n(x.coefficient) + 600 * n(x.heightCoefficient);
  return [v(r.inlineStart), v(r.blockStart), v(r.inlineSize), v(r.blockSize)];
};

test('inset: 0 fills the containing block; insets with an auto size leave the gaps', () => {
  assert.deepEqual(rect('inset:0'), [0, 0, 400, 200]);
  assert.deepEqual(rect('top:10px;bottom:20px;left:5%;right:15px'), [20, 10, 400 - 20 - 15, 170]);
  // content-box: the padding is inside the filled width.
  assert.deepEqual(rect('inset:0;box-sizing:content-box;padding:0 10px'), [0, 0, 400, 200]);
  // Over-constrained: width wins, right (ltr) and bottom are ignored.
  assert.deepEqual(rect('inset:0;width:100px;height:50px'), [0, 0, 100, 50]);
});

test('a stretched link (::after inset: 0 over the card) covers the other controls in the card', () => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const run = fix => analyzeHTML('<html lang="en"><body><main class="page"><article class="card"><a class="l" href="/item" aria-label="Item"></a><button class="b" aria-label="Save"></button></article></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}.page{background:#fff}.card{${g};position:relative;grid-auto-rows:40px;row-gap:8px;background:#fff}.l{display:block;height:40px}.l::after{content:"";position:absolute;inset:0}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:40px;background:#246}${fix}`, viewport: {min: 320, max: 800, height: {min: 480, max: 900}}, accessibility: true});
  assert.deepEqual(run('').diagnostics.filter(d => d.code === 'E_A11Y_OCCLUDED').map(d => d.box), ['.b']);
  assert.equal(run('.l::after{pointer-events:none}').status, 'verified');
});

// No inline inset (left and right auto): the static position. In a grid container that is the containing block it is
// the padding edge (css-grid-1 §9.4: padding-left does not move it); in a block container that is the containing block
// it is the content edge (its padding-left, or padding-right in rtl). Measured in Chromium, Firefox and WebKit.
test('left and right auto: the static position in a grid and in a block containing block', () => {
  assert.deepEqual(rect('top:0;width:50px;height:20px', 'padding-left:10px'), [0, 0, 50, 20]);
  assert.deepEqual(rect('top:0;width:50px;height:20px', 'display:block;padding:0 0 0 12px'), [12, 0, 50, 20]);
  assert.deepEqual(rect('top:0;width:50px;height:20px', 'display:block;direction:rtl;padding:0 12px 0 0'), [338, 0, 50, 20]);
  assert.deepEqual(rect('bottom:0;width:50%;height:20px', 'display:block;padding-left:12px'), [12, 180, 200, 20]);
  const status = (overlay, card) => analyzeHTML('<html lang="en"><body><main class="page"><div class="card"><div class="o"></div></div></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page,.card{${g}}.card{position:relative;height:200px;${card}}.o{position:absolute;${overlay}}`, viewport: {min: 400, max: 400, height: {min: 600, max: 600}}}).status;
  // An inline-level box sits on a line (text-align: center puts it at 206); a % padding is of another box's width;
  // flex static positions follow the container's alignment.
  assert.equal(status('top:0;width:50px;height:20px;display:inline-block', 'display:block;padding-left:12px;text-align:center'), 'unknown');
  assert.equal(status('top:0;width:50px;height:20px;display:inline', 'display:block;padding-left:12px;text-align:center'), 'unknown');
  assert.equal(status('top:0;width:50px;height:20px', 'display:block;padding-left:10%'), 'unknown');
  assert.equal(status('top:0;width:50px;height:20px', 'display:flex;justify-content:center'), 'unknown');
  // A margin on an absolute box is not modeled (the browsers put it at 17: the padding plus the margin).
  assert.equal(status('top:0;width:50px;height:20px;margin-left:5px', 'display:block;padding-left:12px'), 'unknown');
  // The block axis in a block container depends on the boxes before it.
  assert.equal(status('left:0;width:50px;height:20px', 'display:block'), 'unknown');
});

// An auto height on an absolute box is its content's, not its containing block's (CSS 2 §10.6.4; measured in
// Chromium, Firefox and WebKit), raised to its min-height and capped by its max-height.
test('an absolute box with an auto height is as tall as its content', () => {
  const html = '<html lang="en"><body><main class="page"><div class="card"><div class="o"><div class="k1"></div><div class="k2"></div></div></div></main></body></html>';
  const run = o => analyzeHTML(html, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page,.card{${g}}.card{position:relative;height:200px}.o{position:absolute;${g};${o}}.k1{height:30px}.k2{height:12px}`, viewport: {min: 400, max: 400, height: {min: 600, max: 600}}});
  const at = o => { const r = run(o); assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message))); const s = r.sizes.find(s => s.box === '.o').rect; return [s.blockStart.constant, s.blockSize.constant]; };
  assert.deepEqual(at('top:0;width:50px'), ['0', '42']);
  assert.deepEqual(at('bottom:0;width:50px'), ['158', '42']);
  assert.deepEqual(at('top:0;width:50px;padding:3px 0'), ['0', '48']);
  // Raised to min-height, capped by max-height (the content stays 42px; measured in three browsers).
  assert.deepEqual(at('top:0;width:50px;min-height:60px'), ['0', '60']);
  // (Its 42px content overflows the 20px box: reported, so only the box's height is read here.)
  const capped = run('top:0;width:50px;max-height:20px;overflow:hidden');
  assert.notEqual(capped.status, 'unknown');
  assert.deepEqual(capped.sizes.filter(s => s.box === '.o').map(s => s.blockSize.constant), ['20']);
  assert.deepEqual(at('bottom:5px;width:50px;min-height:60px'), ['135', '60']);
  assert.deepEqual(at('top:0;width:50px;min-height:30px'), ['0', '42']);
  // min-height wins over a smaller max-height (raised to 100px, not capped to 50px; measured in three browsers), and
  // a max-height alone still caps.
  assert.deepEqual(at('top:0;width:50px;min-height:100px;max-height:50px'), ['0', '100']);
  assert.deepEqual(at('top:0;width:50px;min-height:30px;max-height:50px'), ['0', '42']);
  assert.deepEqual(run('top:0;width:50px;min-height:30px;max-height:35px;overflow:hidden').sizes.filter(s => s.box === '.o').map(s => s.blockSize.constant), ['35']);
});

// A scroll lock (body { position: fixed; left: 0; right: 0 }) leaves top auto: the body sits at its static position,
// the html's content edge (its padding-top; html with no margin or border is at the viewport's origin at scroll 0).
// Measured in Chromium, Firefox and WebKit for a grid and a block html, with and without padding.
test('a fixed body with auto top sits at the html content edge', () => {
  const at = html => {
    const r = analyzeHTML('<html lang="en"><body><div class="k"></div></body></html>', {name: 'P', css: `*{margin:0;box-sizing:border-box}${html}body{position:fixed;left:0;right:0;${g}}.k{height:30px}`, viewport: {min: 400, max: 400, height: {min: 600, max: 600}}, accessibility: true});
    assert.notEqual(r.status, 'unknown', JSON.stringify(r.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message)));
    const s = r.sizes.find(s => s.box.startsWith('body') && s.rect).rect;
    return [s.inlineStart.constant, s.blockStart.constant, s.blockSize.constant];
  };
  assert.deepEqual(at(`html{${g}}`), ['0', '0', '30']);
  assert.deepEqual(at(`html{${g};padding:5px 0 0 7px}`), ['0', '5', '30']);
  assert.deepEqual(at('html{display:block;padding:5px 0 0 7px}'), ['0', '5', '30']);
});

// An absolute or fixed box with one inline inset and an auto width shrinks to fit (CSS 2 §10.3.7): its max-content
// width, clamped by min-width and max-width, where that fits the room the inset leaves (measured in Chromium, Firefox
// and WebKit at 1280px). Where it may not fit, Unknown.
test('an auto width on an absolute or fixed box with one inline inset shrinks to fit its content', () => {
  const width = (box, kids, vp = 1280) => {
    const r = analyzeHTML(`<html lang="en"><body><div class="o">${kids}<div class="i"></div></div></body></html>`, {name: 'P', css: `*{margin:0;box-sizing:border-box}html,body{${g}}body{position:relative;height:300px}.o{${box}}.k{width:var(--w);height:10px}.i{position:absolute;right:0;top:-24px;width:20px;height:20px}`, viewport: {min: vp, max: vp, height: {min: 720, max: 720}}, accessibility: true});
    if (r.status === 'unknown') return ['unknown', r.diagnostics.find(d => d.severity === 'unknown')?.message];
    const s = r.sizes.find(s => s.box === '.o').rect;
    return [s.inlineStart.constant, s.inlineStart.coefficient, s.inlineSize.constant];
  };
  assert.deepEqual(width('position:fixed;top:24px;right:24px;min-width:180px;max-width:320px', ''), ['-204', '1', '180']);
  assert.deepEqual(width('position:fixed;top:24px;right:24px', '<div class="k" style="--w:120px"></div>'), ['-144', '1', '120']);
  assert.deepEqual(width('position:fixed;top:24px;right:24px;max-width:320px', '<div class="k" style="--w:500px"></div>'), ['-344', '1', '320']);
  assert.deepEqual(width('position:fixed;top:24px;left:10px;padding:0 5px;box-sizing:content-box;min-width:50px', '<div class="k" style="--w:20px"></div>'), ['10', '0', '60']);
  // The width becomes a border-box length, but the block axis keeps the declared box-sizing: a content-box height
  // with padding is outer height + padding (40px), as are its min- and max-height (measured in three browsers).
  const tall = (box, kids = '<div class="k" style="--w:20px"></div>') => {
    const r = analyzeHTML(`<html lang="en"><body><div class="o">${kids}</div></body></html>`, {name: 'P', css: `*{margin:0;box-sizing:border-box}html,body{${g}}body{position:relative;height:300px}.o{${box}}.k{width:var(--w);height:10px}`, viewport: {min: 1280, max: 1280, height: {min: 720, max: 720}}, accessibility: true});
    assert.equal(r.status === 'unknown', false, JSON.stringify(r.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message)));
    const s = r.sizes.find(s => s.box === '.o').rect;
    return [s.inlineSize.constant, s.blockSize.constant];
  };
  assert.deepEqual(tall('position:absolute;top:0;left:10px;height:20px;padding:10px;box-sizing:content-box'), ['40', '40']);
  assert.deepEqual(tall('position:absolute;top:0;left:10px;min-height:30px;padding:10px;box-sizing:content-box'), ['40', '50']);
  assert.deepEqual(tall('position:fixed;top:0;right:10px;height:20px;padding:10px;box-sizing:content-box;border:2px solid #000'), ['44', '44']);
  assert.deepEqual(tall('position:absolute;top:0;left:10px;height:20px;padding:10px'), ['40', '20']);
  // 1300px of content in a 1280px viewport may not fit: Unknown.
  assert.equal(width('position:fixed;top:24px;right:24px', '<div class="k" style="--w:1300px"></div>')[0], 'unknown');
});

test('a shrink-to-fit width that is an exact decimal beyond a double is kept, not Unknown', () => {
  const r = analyzeHTML('<html lang="en"><body><div class="o"><div class="k"></div></div></body></html>', {name: 'P', css: `*{margin:0;box-sizing:border-box}html,body{${g}}body{position:relative;height:300px}.o{position:absolute;top:0;left:0}.k{width:20.30000000000000001px;height:10px}`, viewport: {min: 400, max: 400, height: {min: 600, max: 600}}});
  assert.notEqual(r.status, 'unknown', JSON.stringify(r.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message)));
  assert.equal(r.sizes.find(s => s.box === '.o' && s.rect).rect.inlineSize.constant, '2030000000000000001/100000000000000000');
});

// px margins (negative too) on an absolute box move its margin box off the inset: the border box starts at the inset
// plus the start margin, ends at the inset less the end margin, and an auto size between both insets loses both
// margins (CSS 2 §10.3.7 / §10.6.4). The centring idiom top: 50%; left: 50%; margin: -h/2 0 0 -w/2. Measured in
// Chromium, Firefox and WebKit (the same rectangles in all three).
test('px margins on an absolute box offset it from its insets', () => {
  assert.deepEqual(rect('top:50%;left:50%;width:100px;height:60px;margin:-30px 0 0 -50px'), [150, 70, 100, 60]);
  assert.deepEqual(rect('right:10px;bottom:20px;width:100px;height:60px;margin:5px 7px 11px 13px'), [283, 109, 100, 60]);
  assert.deepEqual(rect('top:10%;left:25%;width:100px;height:60px;margin:4px 0 0 6px'), [106, 24, 100, 60]);
  assert.deepEqual(rect('top:20px;left:30px;width:50%;height:25%;margin:-10px 0 0 -20px'), [10, 10, 200, 50]);
  assert.deepEqual(rect('top:10px;left:10px;width:100px;height:60px;margin:10px 20px 30px 40px'), [50, 20, 100, 60]);
  assert.deepEqual(rect('inset:0;margin:10px 20px 30px 40px'), [40, 10, 340, 160]);
  assert.deepEqual(rect('inset:0;width:100px;height:50px;margin:10px 20px 30px 40px'), [40, 10, 100, 50]);
  assert.deepEqual(rect('inset:0;width:100px;height:50px;margin:10px 20px 30px 40px', 'direction:rtl'), [280, 10, 100, 50]);
  assert.deepEqual(rect('inset:0;margin:10px 20px;padding:5px;box-sizing:content-box'), [20, 10, 360, 180]);
  assert.deepEqual(rect('top:5px;left:5px;right:15px;height:20px;margin:0 -4px', 'padding:8px;border:3px solid #000'), [4, 8, 382, 20]);
});

// Over-constrained on the inline axis, the ignored inset follows the containing block's direction, not the box's own
// (CSS 2 §10.3.7): an rtl box in an ltr containing block keeps left, an ltr box in an rtl one keeps right.
test('the retained inset of an over-constrained absolute box follows its containing block', () => {
  assert.deepEqual(rect('direction:rtl;inset:0;width:100px;height:50px;margin:10px 20px 30px 40px'), [40, 10, 100, 50]);
  assert.deepEqual(rect('direction:rtl;inset:0;width:100px;height:50px'), [0, 0, 100, 50]);
  assert.deepEqual(rect('direction:ltr;inset:0;width:100px;height:50px;margin:10px 20px 30px 40px', 'direction:rtl'), [280, 10, 100, 50]);
  // The viewport's direction is body's (else html's): where they differ it is not read, and the over-constrained
  // fixed box is not placed by a guess.
  const fixed = html => analyzeHTML('<html lang="en"><body><main class="page"><div class="o"></div></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}${html}.o{position:fixed;inset:0;width:100px;height:50px}`, viewport: {min: 400, max: 400, height: {min: 600, max: 600}}});
  // (A fixed box is Unknown for the layout verdict anyway: modeled for the accessibility and integrity checks only.)
  const unknowns = html => fixed(html).diagnostics.filter(d => d.severity === 'unknown').map(d => d.message).join(' | ');
  assert.doesNotMatch(unknowns(''), /containing block's direction/);
  assert.match(unknowns('html{direction:rtl}body{direction:ltr}'), /\.o: .*containing block's direction/);
});

test('margins on an absolute box that are not modeled stay Unknown and name the box', () => {
  const run = (overlay, card = '') => analyzeHTML('<html lang="en"><body><main class="page"><div class="card"><div class="o"></div></div></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page,.card{${g}}.card{position:relative;height:200px;${card}}.o{position:absolute;${overlay}}`, viewport: {min: 400, max: 400, height: {min: 600, max: 600}}});
  for (const overlay of [
    'top:0;left:0;width:100px;height:60px;margin:auto', // auto margins (centring between both insets) are not modeled
    'inset:0;width:100px;height:60px;margin:auto',
    'top:0;width:100px;height:60px;margin-left:5px', // the static position on the inline axis
    'top:0;left:0;height:60px;margin-left:5px', // a shrink-to-fit width
  ]) {
    const report = run(overlay);
    assert.equal(report.status, 'unknown', overlay);
    const messages = report.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message).join(' | ');
    assert.doesNotMatch(messages, /Reset native block margins|Only known zero inline margins/, overlay);
    assert.match(messages, /\.o/, overlay);
  }
  // A % margin (of the containing block's width) is not read at all (Unknown before the box is laid out).
  assert.equal(run('top:0;left:0;width:100px;height:60px;margin-left:10%').status, 'unknown');
  // A margin that pulls the box out of its containing block is reported like an inset that does.
  assert.deepEqual([...new Set(run('top:0;left:0;width:50%;height:25%;margin:-10px 0 0 -20px').diagnostics.map(d => d.code))], ['E_LAYOUT_ABSOLUTE_START']);
});

// A replaced element (an img with width/height attributes) between both insets keeps its own size rather than filling
// the containing block (CSS 2 §10.3.8 / §10.6.5); that is not modeled, so it is Unknown instead of a filled rectangle.
// An explicit size keeps the over-constrained rule (end inset ignored).
test('a replaced element between both insets with an auto size is Unknown, not stretched', () => {
  const img = overlay => analyzeHTML('<html lang="en"><body><main class="page"><div class="card"><img class="o" alt="" src="a.png" width="100" height="60"></div></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page,.card{${g}}.card{position:relative;height:200px}.o{display:block;position:absolute;${overlay}}`, viewport: {min: 400, max: 400, height: {min: 600, max: 600}}});
  for (const overlay of ['inset:0;margin:10px', 'inset:0', 'top:0;bottom:0;left:0;width:100px', 'left:0;right:0;top:0;height:60px']) {
    const report = img(overlay);
    assert.equal(report.status, 'unknown', overlay);
    assert.match(report.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message).join(' | '), /\.o: .*replaced/, overlay);
  }
  assert.equal(img('inset:0;width:100px;height:60px;margin:10px').status, 'verified');
});

// When the containing block's direction is not known (html and body disagree), a max-width or min-width can
// over-constrain an auto width between both inline insets as an explicit width does: Unknown, not the box's own
// direction. A display: none box is never laid out, so it is not held to that.
test('an unknown containing-block direction is Unknown for a clamped auto width, and ignored for display: none', () => {
  const page = (html, overlay) => analyzeHTML('<html lang="en"><body><main class="page"><div class="o"></div></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}${html}.o{position:absolute;${overlay}}`, viewport: {min: 400, max: 400, height: {min: 600, max: 600}}});
  const unknowns = r => r.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message).join(' | ');
  for (const overlay of ['inset:0;max-width:100px;height:50px;margin:0 20px 0 40px', 'left:0;right:0;top:0;min-width:500px;height:50px']) {
    const mixed = page('body{direction:rtl}', overlay);
    assert.equal(mixed.status, 'unknown', overlay);
    assert.match(unknowns(mixed), /\.o: .*containing block's direction/, overlay);
  }
  // Both agree: the clamped box keeps the start inset of that direction.
  assert.equal(page('', 'inset:0;max-width:100px;height:50px;margin:0 20px 0 40px').status, 'verified');
  const hidden = page('html{direction:rtl}body{direction:ltr}', 'display:none;inset:0;width:100px;height:50px');
  assert.doesNotMatch(unknowns(hidden), /containing block's direction/);
  assert.equal(hidden.status, 'verified');
});

// A box whose inset geometry is left undecided (Unknown) by the layout is still read by the style-only walk: the
// contrast rule warns on low-contrast text inside it, and the walk does not stop at it.
test('an undecided absolute box keeps its style checks', () => {
  const run = (html, overlay) => analyzeHTML('<html lang="en"><body><main class="page"><div class="o"><p class="t">Low contrast text</p></div></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}${html}.page{background:#fff}.o{position:absolute;background:#fff;${overlay}}.t{color:#777;font-size:16px}`, viewport: {min: 400, max: 400, height: {min: 600, max: 600}}, accessibility: true});
  const unplaced = r => (r.accessibility?.warnings ?? []).filter(w => w.code === 'W_A11Y_CONTRAST_UNPLACED').map(w => w.box);
  const mixed = run('body{direction:rtl}', 'inset:0;max-width:100px;height:50px');
  assert.equal(mixed.status, 'unknown');
  assert.match(mixed.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message).join(' | '), /\.o: .*containing block's direction/);
  assert.ok(unplaced(mixed).some(b => /\.t/.test(b)), JSON.stringify(mixed.accessibility?.warnings?.map(w => w.code)));
});

// The same for an absolute grid child whose static position an alignment moves (Unknown in the layout).
test('an absolute grid child with an aligned static position keeps its style checks', () => {
  const r = analyzeHTML('<html lang="en"><body><main class="page"><div class="grid"><div class="o"><p class="t">Low contrast text</p></div></div></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}.page{background:#fff}.grid{display:grid;position:relative;height:200px;align-items:end;background:#fff}.o{position:absolute;width:100px;background:#fff}.t{color:#777;font-size:16px}`, viewport: {min: 400, max: 400, height: {min: 600, max: 600}}, accessibility: true});
  assert.equal(r.status, 'unknown');
  assert.match(r.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message).join(' | '), /static position that is not modeled/);
  assert.ok((r.accessibility?.warnings ?? []).some(w => w.code === 'W_A11Y_CONTRAST_UNPLACED' && /\.t/.test(w.box)), JSON.stringify(r.accessibility?.warnings?.map(w => w.code)));
});

// The ad idiom: a fixed overlay with a box centred in it by negative margins; the accessibility checks see the overlay.
// (The translate centres the painted box only: its layout box still reaches past the overlay, E_LAYOUT_ABSOLUTE_END,
// which the margins do not; the accessibility verdicts are the same.)
test('a box centred by negative margins in a fixed overlay keeps the accessibility verdicts', () => {
  const css = m => `body{margin:0} .p{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:44px} .go{display:block;width:44px;height:44px;background:#246;border:0;padding:0} .ov{position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9;background:#000} .bx{position:absolute;top:50%;left:50%;width:300px;height:250px;${m};background:#ffe}`;
  const codes = m => { const r = analyzeHTML('<body><div class=p><button class=go aria-label=Go></button></div><div class=ov><div class=bx></div></div></body>', {name: 'P', css: css(m), viewport: {min: 375, max: 375, height: {min: 667, max: 667}}, accessibility: true}); return [r.status, [...new Set([...r.diagnostics, ...(r.accessibility?.warnings ?? [])].filter(d => d.severity !== 'info' && /_A11Y_/.test(d.code)).map(d => d.code))].sort()]; };
  const transformed = codes('transform:translate(-50%,-50%)');
  assert.equal(transformed[0], 'violated');
  assert.deepEqual(codes('margin:-125px 0 0 -150px'), transformed);
});
