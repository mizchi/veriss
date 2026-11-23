// The pure parts of tools/devices/update.mjs and tools/devices/measure-safe-area.mjs (the latter needs the iOS
// Simulator, so only its bookkeeping is tested here).
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCSV, validatedCSV, shareOf, safeAreaOf, isReportFor, recordMeasurement} from '../tools/devices/lib.mjs';

test('validatedCSV: rows from a StatCounter CSV; an unexpected body throws before anything is written', () => {
  const csv = '"Screen Resolution","Market Share Perc. (2026-10)"\n"390x844",12.5\n"1280x800",7.96\n"800x1280",7.88\n';
  assert.deepEqual(parseCSV(csv)[0], {width: 390, height: 844, share: 12.5});
  assert.equal(validatedCSV(csv, 'ww tablet').length, 3);
  assert.throws(() => validatedCSV('<html>rate limited</html>', 'ww tablet'), /no rows/);
});

test('shareOf: the exact width×height first, the rotated one only as a fallback', () => {
  const list = [{width: 1280, height: 800, share: 7.96}, {width: 800, height: 1280, share: 7.88}, {width: 390, height: 844, share: 12}];
  assert.equal(shareOf(list, 800, 1280), 7.88);
  assert.equal(shareOf(list, 1280, 800), 7.96);
  assert.equal(shareOf(list, 844, 390), 12);
  assert.equal(shareOf(list, 1, 2), 0);
});

const curated = () => ({safeAreas: [
  {screen: '393x852', models: ['iPhone 14 Pro', 'iPhone 15 Pro'], cutout: 'dynamic-island', portrait: {top: 59, bottom: 34}, landscape: {side: 59, bottom: 21}, measured: {browser: false, fullscreen: false}},
  {screen: '402x874', models: ['iPhone 17'], cutout: 'dynamic-island', portrait: {top: 62, bottom: 34}, landscape: {side: 62, bottom: 20}, measured: {browser: false, fullscreen: false}},
]});

test('safeAreaOf: browser and fullscreen insets with their own provenance', () => {
  const c = curated();
  c.safeAreas[0].measured.browser = true;
  const s = safeAreaOf(c, 'iPhone 15 Pro');
  assert.deepEqual(s.measured, {browser: true, fullscreen: false});
  assert.deepEqual(s.browser.portrait, {top: 0, right: 0, bottom: 34, left: 0});
  assert.deepEqual(s.fullscreen.portrait, {top: 59, right: 0, bottom: 34, left: 0});
  assert.deepEqual(s.fullscreen.landscape, {top: 0, right: 59, bottom: 21, left: 59});
  assert.equal(safeAreaOf(c, 'iPhone Air'), null);
  // The provenance is a copy: the profile does not share it with curated.json.
  s.measured.browser = false;
  assert.equal(c.safeAreas[0].measured.browser, true);
});

test('isReportFor: only a report of the expected orientation (a late portrait resize is not the landscape one)', () => {
  assert.equal(isReportFor({orientation: 'portrait', top: 0}, 'portrait'), true);
  assert.equal(isReportFor({orientation: 'portrait', top: 0}, 'landscape'), false);
  assert.equal(isReportFor(null, 'portrait'), false);
});

test('recordMeasurement: one model of a group is split out; the other models keep their published values', () => {
  const c = curated();
  recordMeasurement(c, 'iPhone 15 Pro', {orientation: 'portrait', top: 0, bottom: 33, left: 0, right: 0}, {orientation: 'landscape', top: 0, bottom: 20, left: 0, right: 58}, 'iOS 26.0, Mobile Safari');
  const [rest, own] = c.safeAreas;
  assert.deepEqual(rest.models, ['iPhone 14 Pro']);
  assert.deepEqual(rest.measured, {browser: false, fullscreen: false});
  assert.deepEqual([rest.portrait, rest.landscape], [{top: 59, bottom: 34}, {side: 59, bottom: 21}]);
  assert.deepEqual(own.models, ['iPhone 15 Pro']);
  // Safari reports the browser mode only: the fullscreen portrait top stays the published figure, unmeasured.
  assert.deepEqual(own.measured, {browser: true, fullscreen: false});
  assert.deepEqual([own.portrait, own.landscape], [{top: 59, bottom: 33}, {side: 58, bottom: 20}]);
  assert.deepEqual(own.measuredWith, {browser: 'iOS 26.0, Mobile Safari'});
  assert.equal(c.safeAreas.length, 3);
  // A group of one model is updated in place.
  recordMeasurement(c, 'iPhone 17', {orientation: 'portrait', top: 0, bottom: 34, left: 0, right: 0}, {orientation: 'landscape', top: 0, bottom: 20, left: 62, right: 62}, 'iOS 26.0, Mobile Safari');
  assert.equal(c.safeAreas.length, 3);
  assert.deepEqual(c.safeAreas.find(g => g.models.includes('iPhone 17')).measured, {browser: true, fullscreen: false});
  assert.throws(() => recordMeasurement(c, 'iPhone Air', {}, {}, ''), /iPhone Air/);
});

test('recordMeasurement clears a fullscreen measurement when the shared insets it covered change', () => {
  const curated = {safeAreas: [{models: ['A'], portrait: {top: 59, bottom: 34}, landscape: {side: 59, bottom: 21}, measured: {browser: true, fullscreen: true}, measuredWith: {browser: 'x', fullscreen: 'y'}}]};
  // Unchanged values: the fullscreen measurement still holds.
  recordMeasurement(curated, 'A', {bottom: 34}, {left: 59, right: 59, bottom: 21}, 'z');
  assert.equal(curated.safeAreas[0].measured.fullscreen, true);
  // A changed bottom inset: the fullscreen values no longer reflect a fullscreen measurement.
  recordMeasurement(curated, 'A', {bottom: 30}, {left: 59, right: 59, bottom: 21}, 'z');
  assert.equal(curated.safeAreas[0].measured.fullscreen, false);
  assert.equal(curated.safeAreas[0].measured.browser, true);
});
