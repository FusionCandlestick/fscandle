// Transpile the TypeScript sources and unit tests to CommonJS for `node --test`.
//
// This is transpile-only and deliberately does not type-check: type checking
// runs once, in `npm run typecheck`, which covers src and tests. Keeping it out
// of this step is what makes the unit-test loop fast.

import { readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const OUT_DIR = '.test-build';

async function listTypeScript(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return listTypeScript(full);
      return entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') ? [full] : [];
    }),
  );
  return files.flat();
}

const entryPoints = [
  ...(await listTypeScript('src')),
  ...(await listTypeScript('tests/unit')),
  ...(await listTypeScript('tests/support')),
];

await rm(OUT_DIR, { recursive: true, force: true });
await build({
  entryPoints,
  outdir: OUT_DIR,
  outbase: '.',
  bundle: false,
  format: 'cjs',
  platform: 'node',
  target: 'es2017',
  // Use the project tsconfig so class-field semantics match `tsc` output.
  tsconfig: 'tsconfig.json',
  logLevel: 'warning',
});
// Marks the output as CommonJS, so Node does not read it as ESM.
await writeFile(path.join(OUT_DIR, 'package.json'), '{"type":"commonjs"}\n');
console.log(`transpiled ${entryPoints.length} files to ${OUT_DIR}/`);
