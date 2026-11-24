// Module resolution on the file system for the styled-components evaluation (options.resolveModule): relative
// specifiers only, with the extensions and index files TypeScript and bundlers try. Packages are not read.
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const isFile = p => { try { return statSync(p).isFile(); } catch { return false; } };

export function nodeModuleResolver({ extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs'] } = {}) {
  return (specifier, importer) => {
    if (!/^\.{1,2}\//.test(specifier)) return null;
    const base = resolve(dirname(importer), specifier);
    const candidates = [base, ...extensions.map(e => base + e), ...extensions.map(e => resolve(base, `index${e}`))];
    const file = candidates.find(isFile);
    return file ? { file, source: readFileSync(file, 'utf8') } : null;
  };
}
