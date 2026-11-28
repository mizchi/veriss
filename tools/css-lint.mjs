#!/usr/bin/env node
// css-lint: the static CSS×DOM checks as a linter for components (every adapter of the workspace).
//   node tools/css-lint.mjs [options] <file.svelte|file.vue|file.jsx|file.tsx>...
// The options and output are runLint's (packages/adapter-core/src/cli.mjs, docs/component-lint.md).
// Exit status 1 when any error is reported.
import {runLint} from '../packages/adapter-core/src/cli.mjs';

const adapters = {
  '.svelte': async () => (await import('../packages/svelte-adapter/src/index.mjs')).analyzeSvelte,
  '.vue': async () => (await import('../packages/vue-adapter/src/index.mjs')).analyzeVue,
  '.jsx': async () => (await import('../packages/react-adapter/src/index.mjs')).analyzeReact,
  '.tsx': async () => (await import('../packages/react-adapter/src/index.mjs')).analyzeReact,
};
process.exit(await runLint({argv: process.argv.slice(2), adapters, name: 'css-lint'}));
