// Measure the safe-area insets of the iPhones in tools/devices/curated.json in the iOS Simulator (needs Xcode):
//   node tools/devices/measure-safe-area.mjs [--write] [--models "iPhone 16 Pro,iPhone 17"]
// For each model: boot a simulator of that device type, open a viewport-fit=cover page in Mobile Safari, and read
// env(safe-area-inset-*) back through a local HTTP server, in portrait and (after rotating the Simulator window) in
// landscape. With --write, the measured values replace the curated ones of that model (split out of its group, so the
// other models of the group keep theirs) and 'measured.browser' becomes true.
// What Safari reports is the 'browser' mode. The 'fullscreen' mode (a full-screen web view: an in-app browser, a
// home-screen web app) gets the window's insets; Safari's portrait top inset is 0 because its own bars are above the
// page, so the curated portrait 'top' stays as published and 'measured.fullscreen' stays false unless measured in a
// web view (this script does not).
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isReportFor, recordMeasurement} from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, 'curated.json');
const curated = JSON.parse(readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
const only = args.includes('--models') ? args[args.indexOf('--models') + 1].split(',').map(s => s.trim()) : null;
const simctl = (...a) => execFileSync('xcrun', ['simctl', ...a], {encoding: 'utf8'});
try { simctl('help'); } catch { console.error('xcrun simctl is not available: install Xcode and its iOS Simulator runtime'); process.exit(1); }

const types = JSON.parse(simctl('list', 'devicetypes', '-j')).devicetypes;
const runtime = JSON.parse(simctl('list', 'runtimes', '-j')).runtimes.filter(r => r.isAvailable && /^iOS/.test(r.name)).at(-1);
if (!runtime) { console.error('no available iOS runtime'); process.exit(1); }

let onReport;
const server = createServer((req, res) => {
  if (req.method === 'POST') { let body = ''; req.on('data', c => body += c); req.on('end', () => { res.end('ok'); let report; try { report = JSON.parse(body); } catch { return; } onReport?.(report); }); return; }
  res.setHeader('content-type', 'text/html');
  res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}#p{position:fixed;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}</style><div id="p"></div><script>
    const send = () => { const s = getComputedStyle(document.getElementById('p')); fetch('/', {method: 'POST', body: JSON.stringify({orientation: innerWidth > innerHeight ? 'landscape' : 'portrait', top: parseFloat(s.paddingTop), right: parseFloat(s.paddingRight), bottom: parseFloat(s.paddingBottom), left: parseFloat(s.paddingLeft), width: innerWidth, height: innerHeight})}); };
    addEventListener('load', () => setTimeout(send, 1500)); addEventListener('resize', () => setTimeout(send, 1500));
  </script>`);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
// The next report of the given orientation (a late resize report of the other one is ignored), within 60s.
const next = orientation => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { onReport = null; reject(new Error(`no ${orientation} report within 60s`)); }, 60000);
  onReport = report => { if (!isReportFor(report, orientation)) return; clearTimeout(timer); onReport = null; resolve(report); };
});
const rotate = () => execFileSync('osascript', ['-e', 'tell application "Simulator" to activate', '-e', 'tell application "System Events" to keystroke (ASCII character 29) using command down']);

// A snapshot of the models: --write splits groups while the loop runs.
for (const model of curated.safeAreas.flatMap(group => group.models)) {
  if (only && !only.includes(model)) continue;
  const type = types.find(t => t.name === model);
  if (!type) { console.log(`${model}: no simulator device type`); continue; }
  const udid = simctl('create', `veriss-${model}`, type.identifier, runtime.identifier).trim();
  try {
    simctl('boot', udid);
    execFileSync('open', ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', udid]);
    const portrait = next('portrait'); simctl('openurl', udid, url); const p = await portrait;
    const landscape = next('landscape'); rotate(); const l = await landscape;
    console.log(`${model}: portrait ${JSON.stringify(p)} landscape ${JSON.stringify(l)}`);
    if (args.includes('--write')) recordMeasurement(curated, model, p, l, `${runtime.name}, Mobile Safari`);
  } finally {
    try { simctl('shutdown', udid); } catch {}
    simctl('delete', udid);
  }
}
server.close();
if (args.includes('--write')) { writeFileSync(file, JSON.stringify(curated, null, 2) + '\n'); console.log('updated', file, '(rebuild with node tools/devices/update.mjs)'); }
