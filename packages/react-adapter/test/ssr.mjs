// The real thing, for fidelity checks: StyleX's own compiler (atomic classes and CSS), esbuild's JSX transform,
// and react-dom/server's markup. Linaria is compiled by its own build (wyw-in-js).
import {createRequire} from 'node:module';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {transform, build} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';

const require = createRequire(import.meta.url);
const plugin = require('@stylexjs/babel-plugin');
const babel = createRequire(require.resolve('@stylexjs/babel-plugin'))('@babel/core');
const dir = mkdtempSync(join(fileURLToPath(new URL('.', import.meta.url)), '.ssr-'));
let n = 0;

export function compileStylex(source, filename = 'Component.jsx') {
  const out = babel.transformSync(source, {filename, parserOpts: {plugins: ['jsx']}, plugins: [[plugin, {dev: false, runtimeInjection: false, treeshakeCompensation: true, unstable_moduleResolution: {type: 'commonJS'}}]]});
  return {code: out.code, css: plugin.processStylexRules(out.metadata.stylex, false)};
}

// Linaria's own build (wyw-in-js): it evaluates the templates' interpolations from the module, writes each class's
// CSS and replaces css`` with the class name and styled`` with @linaria/react's runtime component.
export async function compileLinaria(source, filename = 'Component.jsx') {
  const {transform: wyw, TransformCacheCollection} = await import('@wyw-in-js/transform');
  const file = join(dir, filename);
  writeFileSync(file, source);
  const asyncResolve = async (what, importer) => require.resolve(what, {paths: [importer.replace(/[\\/][^\\/]*$/, ''), fileURLToPath(new URL('.', import.meta.url))]});
  const result = await wyw({options: {filename: file, root: fileURLToPath(new URL('..', import.meta.url)), pluginOptions: {babelOptions: {plugins: [require.resolve('@babel/plugin-syntax-jsx', {paths: [require.resolve('@wyw-in-js/transform')]})]}}}, cache: new TransformCacheCollection()}, source, asyncResolve);
  return {code: result.code, css: result.cssText};
}

export async function render(code, props) {
  const {code: js} = await transform(code, {loader: 'jsx', jsx: 'automatic', format: 'esm'});
  const file = join(dir, `c${n++}.mjs`);
  writeFileSync(file, js.replace(/from ['"](@linaria\/(?:core|react))['"]/g, (m, name) => `from '${pathToFileURL(require.resolve(name)).href}'`).replace(/from ['"]@stylexjs\/stylex['"]/, `from '${pathToFileURL(require.resolve('@stylexjs/stylex')).href}'`).replace(/from ['"]react(\/jsx-runtime)?['"]/g, (m, sub) => `from '${pathToFileURL(require.resolve(`react${sub ?? ''}`)).href}'`));
  const Component = (await import(pathToFileURL(file).href)).default;
  return renderToStaticMarkup(createElement(Component, props));
}

// styled-components' own runtime: the component rendered inside a ThemeProvider, its CSS collected by ServerStyleSheet.
export async function renderStyled(source, props, theme = {}) {
  const {code: js} = await transform(source, {loader: 'jsx', jsx: 'automatic', format: 'esm'});
  const file = join(dir, `s${n++}.mjs`);
  // the ESM build (the package's "module"): its default export is styled
  const sc = pathToFileURL(join(require.resolve('styled-components'), '..', 'styled-components.esm.js')).href;
  writeFileSync(file, js.replace(/from ['"]styled-components['"]/g, `from '${sc}'`).replace(/from ['"]react(\/jsx-runtime)?['"]/g, (m, sub) => `from '${pathToFileURL(require.resolve(`react${sub ?? ''}`)).href}'`));
  const Component = (await import(pathToFileURL(file).href)).default;
  const {ServerStyleSheet, ThemeProvider} = await import(sc);
  const sheet = new ServerStyleSheet();
  try {
    const html = renderToStaticMarkup(sheet.collectStyles(createElement(ThemeProvider, {theme}, createElement(Component, props))));
    const css = sheet.getStyleTags().replace(/<\/?style[^>]*>/g, '');
    return {html, css};
  } finally { sheet.seal(); }
}

// A component split over modules (styled.ts, tokens): bundled by esbuild first, react and styled-components external.
export async function renderStyledFile(entry, props, theme = {}) {
  const out = await build({entryPoints: [entry], bundle: true, write: false, format: 'esm', jsx: 'automatic', external: ['react', 'react/jsx-runtime', 'styled-components'], logLevel: 'silent'});
  return renderStyledModule(out.outputFiles[0].text, props, theme);
}

async function renderStyledModule(js, props, theme) {
  const file = join(dir, `b${n++}.mjs`);
  const sc = pathToFileURL(join(require.resolve('styled-components'), '..', 'styled-components.esm.js')).href;
  writeFileSync(file, js.replace(/from ['"]styled-components['"]/g, `from '${sc}'`).replace(/from ['"]react(\/jsx-runtime)?['"]/g, (m, sub) => `from '${pathToFileURL(require.resolve(`react${sub ?? ''}`)).href}'`));
  const Component = (await import(pathToFileURL(file).href)).default;
  const {ServerStyleSheet, ThemeProvider} = await import(sc);
  const sheet = new ServerStyleSheet();
  try {
    const html = renderToStaticMarkup(sheet.collectStyles(createElement(ThemeProvider, {theme}, createElement(Component, props))));
    return {html, css: sheet.getStyleTags().replace(/<\/?style[^>]*>/g, '')};
  } finally { sheet.seal(); }
}
