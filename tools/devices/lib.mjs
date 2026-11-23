// The pure parts of tools/devices/update.mjs and tools/devices/measure-safe-area.mjs (tested in
// tests/device-tools.test.mjs): reading StatCounter CSVs, looking up a screen's share, the safe areas a profile carries,
// and recording a Simulator measurement in curated.json.

export const parseCSV = text => text.trim().split('\n').slice(1).map(line => line.match(/^"(\d+)x(\d+)",([\d.]+)$/)).filter(Boolean)
  .map(([, w, h, share]) => ({width: Number(w), height: Number(h), share: Number(share)}));

/** The rows of a StatCounter CSV; throws when there are none (an error page, a changed format). */
export function validatedCSV(text, label) {
  const rows = parseCSV(text);
  if (!rows.length) throw new Error(`StatCounter ${label}: no rows (the CSV format may have changed)`);
  return rows;
}

/** The share of a width×height screen: the exact row first, the rotated one only when the exact one is missing. */
export function shareOf(list, width, height) {
  const row = list.find(r => r.width === width && r.height === height) ?? list.find(r => r.width === height && r.height === width);
  return row ? row.share : 0;
}

/**
 * The safe areas of a model from curated.json, or null when it has none there.
 * browser: Safari shows its own bars at the top in portrait, so only the home indicator reaches the page there;
 * fullscreen: a viewport-fit=cover page in a full-screen web view (an in-app browser, a home-screen web app) gets every
 * inset. In landscape the cutout may be on either side. `measured` says, per mode, whether the insets were read in the
 * iOS Simulator (browser: Mobile Safari; fullscreen: a full-screen web view) or are published figures.
 */
export function safeAreaOf(curated, name) {
  const group = curated.safeAreas.find(g => g.models.includes(name));
  if (!group) return null;
  const {portrait: p, landscape: l} = group;
  return {cutout: group.cutout, measured: {browser: group.measured.browser === true, fullscreen: group.measured.fullscreen === true},
    browser: {portrait: {top: 0, right: 0, bottom: p.bottom, left: 0}, landscape: {top: 0, right: l.side, bottom: l.bottom, left: l.side}},
    fullscreen: {portrait: {top: p.top, right: 0, bottom: p.bottom, left: 0}, landscape: {top: 0, right: l.side, bottom: l.bottom, left: l.side}}};
}

/** Whether a report posted by the measuring page is the one awaited (its orientation). */
export const isReportFor = (report, orientation) => Boolean(report) && typeof report === 'object' && report.orientation === orientation;

/**
 * Record Mobile Safari's insets for one model (portrait and landscape reports). A model that shares its group with
 * others is split out into a group of its own (inserted after it), so the others keep their values and provenance.
 * Safari reports the browser mode only: the fullscreen portrait top stays as published, and measured.fullscreen is
 * left as it was.
 */
export function recordMeasurement(curated, model, portrait, landscape, measuredWith) {
  const index = curated.safeAreas.findIndex(g => g.models.includes(model));
  if (index < 0) throw new Error(`${model}: not in curated.json safeAreas`);
  let group = curated.safeAreas[index];
  if (group.models.length > 1) {
    const own = structuredClone(group);
    own.models = [model];
    group.models = group.models.filter(m => m !== model);
    curated.safeAreas.splice(index + 1, 0, own);
    group = own;
  }
  group.portrait.bottom = portrait.bottom;
  group.landscape = {side: Math.max(landscape.left, landscape.right), bottom: landscape.bottom};
  group.measured = {...group.measured, browser: true};
  group.measuredWith = {...group.measuredWith, browser: measuredWith};
  return group;
}
