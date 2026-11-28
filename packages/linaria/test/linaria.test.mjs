import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {analyzeLinaria} from '../src/index.mjs';
import {lint} from 'veriss-adapter-core';

const fixture = name => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
const cli = fileURLToPath(new URL('../bin/veriss-linaria.mjs', import.meta.url));
const options = {pageCSS: '*{box-sizing:border-box;margin:0}', viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, sourceLines: true};

test('analyzeLinaria: a css`` class wider than its track is an error on its line, in the state that applies it', () => {
  const source = readFileSync(fixture('Wide.tsx'), 'utf8');
  const found = lint(analyzeLinaria(source, options), {file: 'Wide.tsx', source}).filter(m => m.severity === 'error');
  assert.ok(found.some(m => m.code === 'E_LAYOUT_ITEM_SIZE' && m.line === 12 && /compact=false/.test(JSON.stringify(m))), JSON.stringify(found));
});

test('veriss-linaria CLI: .tsx with an error exits 1, a clean .js exits 0', () => {
  let status = 0, out = '';
  try { out = execFileSync('node', [cli, '--viewport', '320-800', '--height', '600-900', fixture('Wide.tsx')], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}); } catch (error) { status = error.status; out = error.stdout; }
  assert.equal(status, 1);
  assert.match(out, /Wide\.tsx:12\s+error\s+E_LAYOUT_ITEM_SIZE/);
  assert.match(execFileSync('node', [cli, fixture('Card.js')], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}), /0 error\(s\)/);
});
