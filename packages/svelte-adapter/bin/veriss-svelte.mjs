#!/usr/bin/env node
// veriss-svelte [options] <file.svelte>...: the component linter (docs/component-lint.md) for Svelte 5 components.
// Exit status 1 when any error is reported, 2 on a usage error.
import {runLint} from 'veriss-adapter-core/cli';

const adapters = {'.svelte': async () => (await import('../src/index.mjs')).analyzeSvelte};
process.exit(await runLint({argv: process.argv.slice(2), adapters, name: 'veriss-svelte'}));
