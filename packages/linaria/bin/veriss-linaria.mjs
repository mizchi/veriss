#!/usr/bin/env node
// veriss-linaria [options] <file.js|file.jsx|file.ts|file.tsx>...: the component linter (docs/component-lint.md) for React
// components styled with Linaria (css`` and styled.tag``), through veriss-react.
// Exit status 1 when any error is reported, 2 on a usage error.
import {runLint} from 'veriss-adapter-core/cli';

const analyze = async () => (await import('../src/index.mjs')).analyzeLinaria;
const adapters = {'.js': analyze, '.jsx': analyze, '.ts': analyze, '.tsx': analyze};
process.exit(await runLint({argv: process.argv.slice(2), adapters, name: 'veriss-linaria'}));
