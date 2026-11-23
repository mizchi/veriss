// Random configurations inside L1 (a seeded generator, so a failing case can be replayed by its seed).
// xorshift32. A small seed gives tiny first outputs (seed 1..200 made every Flex configuration a single item and every
// Grid one column): the seed is scrambled and the first outputs dropped.
export function rng(seed) {
  let s = (Math.imul(seed >>> 0, 0x9e3779b1) ^ 0x5bd1e995) >>> 0 || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 2 ** 32; };
  for (let i = 0; i < 8; i++) next();
  return next;
}
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const int = (r, a, b) => a + Math.floor(r() * (b - a + 1));
export function randomGrid(seed) {
  const r = rng(seed), nc = int(r, 1, 4), nr = int(r, 1, 3);
  const columns = Array.from({ length: nc }, () => r() < 0.5 ? { px: int(r, 0, 12) * 10 } : { fr: pick(r, [1, 1, 2, 3, 0.5]) });
  const rows = Array.from({ length: nr }, () => ({ px: int(r, 1, 8) * 10 }));
  // Disjoint areas (the engine reports an undeclared overlap instead of laying it out; overlap itself is valid CSS).
  const taken = [], items = [];
  for (let tries = int(r, 1, 6); tries > 0; tries--) {
    const ca = int(r, 1, nc), cb = int(r, ca + 1, nc + 1), ra = int(r, 1, nr), rb = int(r, ra + 1, nr + 1);
    if (taken.some(([a, b, c, d]) => ca < b && a < cb && ra < d && c < rb)) continue;
    taken.push([ca, cb, ra, rb]);
    const justify = pick(r, ['stretch', 'start', 'center', 'end']), align = pick(r, ['stretch', 'start', 'center', 'end']);
    items.push({ column: [ca, cb], row: [ra, rb], justify, align,
      width: justify === 'stretch' && r() < 0.6 ? 'auto' : int(r, 1, 6) * 10, height: align === 'stretch' && r() < 0.6 ? 'auto' : int(r, 1, 4) * 10 });
  }
  return { display: 'grid', columns, rows, columnGap: pick(r, [0, 4, 10]), rowGap: pick(r, [0, 5]), items };
}
export function randomFlex(seed) {
  const r = rng(seed), n = int(r, 1, 5);
  const items = Array.from({ length: n }, () => {
    const basis = int(r, 0, 20) * 10, align = pick(r, [undefined, 'stretch', 'flex-start', 'center', 'flex-end']);
    return { basis, grow: pick(r, [0, 0, 1, 2, 0.5]), shrink: pick(r, [0, 1, 1, 2]), min: r() < 0.4 ? Math.min(basis, int(r, 0, 10) * 10) : 0,
      ...(align ? { align } : {}), height: align && align !== 'stretch' ? int(r, 1, 6) * 10 : 'auto' };
  });
  return { display: 'flex', height: 60, gap: pick(r, [0, 8, 10]), justify: pick(r, ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly']),
    alignItems: 'stretch', items };
}
