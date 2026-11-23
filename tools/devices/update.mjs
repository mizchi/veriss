// Rebuild packages/veriss/src/devices/devices.json: the screens in common use and the devices that have them.
//   node tools/devices/update.mjs [--month 2026-10] [--offline]
// Sources (each output entry says which it came from):
//   - StatCounter screen-resolution market share, monthly, Japan and worldwide, for mobile, tablet and desktop
//     (https://gs.statcounter.com/screen-resolution-stats). The CSVs are kept in tools/devices/statcounter/ so a
//     rebuild is reproducible; --offline reads them instead of fetching.
//   - Playwright's device descriptors (viewport with the browser's toolbars shown, screen, device scale factor, touch).
//   - tools/devices/curated.json: safe-area insets (notch, Dynamic Island, home indicator) and dual-screen hinges,
//     which no machine-readable source carries ('measured': {browser, fullscreen}, each false until the insets of that
//     mode are read in the iOS Simulator; tools/devices/measure-safe-area.mjs reads the browser mode in Mobile Safari).
// The output has no dependency on Playwright: packages/veriss/src does not import it.
import {mkdirSync, readFileSync, writeFileSync, existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {validatedCSV, shareOf as shareIn, safeAreaOf as curatedSafeAreaOf} from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const require = createRequire(import.meta.url);
const {devices} = require('playwright');
const playwrightVersion = require('playwright/package.json').version;
const curated = JSON.parse(readFileSync(join(here, 'curated.json'), 'utf8'));

const args = process.argv.slice(2);
const offline = args.includes('--offline');
const lastMonth = (() => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
const month = args.includes('--month') ? args[args.indexOf('--month') + 1] : lastMonth;
if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`--month must be YYYY-MM, got ${month}`);

const regions = {jp: {path: 'japan', code: 'JP', name: 'Japan'}, worldwide: {path: 'worldwide', code: 'ww', name: 'Worldwide'}};
const kinds = {mobile: 'Mobile', tablet: 'Tablet', desktop: 'Desktop'};
const csvDir = join(here, 'statcounter');
mkdirSync(csvDir, {recursive: true});

const statcounterURL = (region, kind) => {
  const r = regions[region], int = month.replace('-', '');
  const q = new URLSearchParams({device: kinds[kind], device_hidden: kind, statType_hidden: 'resolution', region_hidden: r.code, granularity: 'monthly', statType: 'Screen Resolution', region: r.name, fromInt: int, toInt: int, fromMonthYear: month, toMonthYear: month, csv: '1'});
  return `https://gs.statcounter.com/screen-resolution-stats/${kind}/${r.path}/chart.php?${q}`;
};
const resolutions = {};
for (const region of Object.keys(regions)) {
  resolutions[region] = {};
  for (const kind of Object.keys(kinds)) {
    const file = join(csvDir, `${region}-${kind}-${month}.csv`);
    const label = `${region} ${kind} ${month}`;
    if (!offline) {
      const response = await fetch(statcounterURL(region, kind), {headers: {'user-agent': 'veriss-device-update'}});
      if (!response.ok) throw new Error(`StatCounter ${label}: HTTP ${response.status}`);
      const text = await response.text();
      // Validate before replacing the cache: a failed fetch keeps the CSV already there.
      resolutions[region][kind] = validatedCSV(text, label);
      writeFileSync(file, text);
      continue;
    }
    if (!existsSync(file)) throw new Error(`missing ${file} (run without --offline)`);
    resolutions[region][kind] = validatedCSV(readFileSync(file, 'utf8'), label);
  }
}

// Device kind from the descriptor: Playwright has no field for it.
const kindOf = (name, d) => /^Desktop/.test(name) ? 'desktop' : /Galaxy Z (Fold|Flip)/.test(name) ? 'foldable' : /iPad|Tab |Nexus (7|10)|Kindle|PlayBook/.test(name) ? 'tablet' : d.isMobile ? 'phone' : 'desktop';
const shareOf = (kind, width, height) => Object.fromEntries(Object.keys(regions).map(region =>
  [region, shareIn(resolutions[region][kind === 'foldable' || kind === 'phone' ? 'mobile' : kind], width, height)]));
const safeAreaOf = name => curatedSafeAreaOf(curated, name);

const out = [];
for (const [name, d] of Object.entries(devices)) {
  if (/ landscape$/.test(name)) continue;
  const kind = kindOf(name, d);
  // Desktop descriptors are one 1280px window on a 1920px screen; desktop profiles come from the resolutions below.
  if (kind === 'desktop') continue;
  const landscape = devices[`${name} landscape`];
  const screen = d.screen ?? {width: d.viewport.width, height: d.viewport.height};
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  out.push({
    id, name, kind, source: 'playwright',
    dpr: d.deviceScaleFactor, touch: Boolean(d.hasTouch),
    screen: {width: screen.width, height: screen.height},
    // The visible height runs from the viewport with the browser's toolbars shown to the whole screen (scrolled, the
    // toolbars collapse); a check covers the range.
    portrait: {width: d.viewport.width, height: {min: d.viewport.height, max: Math.max(d.viewport.height, screen.height)}},
    ...(landscape ? {landscape: {width: landscape.viewport.width, height: {min: landscape.viewport.height, max: Math.max(landscape.viewport.height, screen.width)}}} : {}),
    screenShare: shareOf(kind, screen.width, screen.height),
    ...(kind === 'phone' && /^iPhone/.test(name) ? {safeArea: safeAreaOf(name)} : {}),
  });
}
for (const dual of curated.dualScreen) {
  out.push({id: dual.id, name: dual.name, kind: dual.kind, source: 'curated', measured: dual.measured, dpr: dual.dpr, touch: dual.touch,
    screen: {width: dual.single.width, height: dual.single.height},
    portrait: {width: dual.single.width, height: {min: dual.single.height, max: dual.single.height}},
    spanned: {width: dual.spanned.width, height: {min: dual.spanned.height, max: dual.spanned.height}, hinge: dual.spanned.hinge},
    screenShare: {jp: 0, worldwide: 0}, note: dual.source});
}
// Screens in use that no device above has: generic profiles, so the common sizes are all checked. A phone or tablet
// browser's toolbars take up to about 200px (unknown here), so the height is a range down to that.
for (const region of Object.keys(regions)) for (const kind of Object.keys(kinds)) for (const row of resolutions[region][kind]) {
  if (row.share < 1) continue;
  const devKind = kind === 'mobile' ? 'phone' : kind;
  const known = out.some(d => (d.kind === devKind || (devKind === 'phone' && d.kind === 'foldable')) && d.screen.width === row.width && d.screen.height === row.height);
  const id = `${devKind}-${row.width}x${row.height}`;
  if (known || out.some(d => d.id === id)) continue;
  const chrome = kind === 'desktop' ? {min: 120, max: 80} : {min: 200, max: 0};
  out.push({id, name: `${kinds[kind]} ${row.width}×${row.height}`, kind: devKind, source: 'statcounter',
    screen: {width: row.width, height: row.height},
    portrait: {width: row.width, height: {min: row.height - chrome.min, max: row.height - chrome.max}},
    screenShare: shareOf(devKind, row.width, row.height)});
}

// One profile per distinct screen, viewport, safe area and hinge: models that share all of them are one check, and the
// screen's share is counted once.
const profiles = [];
for (const d of out) {
  const key = JSON.stringify([d.kind, d.screen, d.portrait, d.landscape ?? null, d.safeArea ?? null, d.spanned ?? null]);
  const same = profiles.find(p => p.$key === key);
  if (same) { same.devices.push(d.name); continue; }
  const {name, ...rest} = d;
  profiles.push({$key: key, ...rest, devices: [name]});
}
for (const p of profiles) { delete p.$key; if (p.devices.length > 1) p.id = `${p.kind}-${p.screen.width}x${p.screen.height}${p.safeArea ? `-${p.safeArea.cutout}` : ''}`; }
const ids = new Set();
for (const p of profiles) { let id = p.id, n = 2; while (ids.has(id)) id = `${p.id}-${n++}`; p.id = id; ids.add(id); }

const data = {
  $comment: 'Generated by tools/devices/update.mjs; do not edit by hand (edit tools/devices/curated.json and rebuild).',
  month,
  sources: {
    statcounter: 'https://gs.statcounter.com/screen-resolution-stats (screen resolution market share, monthly; CSVs in tools/devices/statcounter/)',
    playwright: `playwright ${playwrightVersion} device descriptors`,
    curated: ['tools/devices/curated.json', ...curated.safeAreaSources],
  },
  resolutions,
  profiles: profiles.sort((a, b) => (b.screenShare.jp + b.screenShare.worldwide) - (a.screenShare.jp + a.screenShare.worldwide) || a.id.localeCompare(b.id)),
};
const target = join(root, 'packages', 'veriss', 'src', 'devices', 'devices.json');
mkdirSync(dirname(target), {recursive: true});
writeFileSync(target, JSON.stringify(data, null, 1) + '\n');
console.log(`${target}: ${profiles.length} profiles (${out.length} devices), month ${month}`);
