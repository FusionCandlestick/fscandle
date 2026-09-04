import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defineConfig } from 'tsup';

// Entry bundles that must carry the React Server Components client boundary.
// esbuild drops `"use client"` while bundling, so it is re-applied to the entry
// files after the build. Without it, importing `fusion-candlestick/react` from a
// Next.js App Router server component fails to compile.
const CLIENT_ENTRIES = ['react.js', 'react.cjs'];

export default defineConfig({
  entry: ['src/index.ts', 'src/react.ts', 'src/datafeed.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  minify: true,
  outDir: 'dist',
  tsconfig: 'tsconfig.build.json',
  // Keep peer/runtime deps out of the bundle so the consumer's bundler can
  // tree-shake and dedupe them. `technicalindicators` alone is ~6 MB on disk.
  external: ['react', 'react-dom', 'technicalindicators'],
  async onSuccess() {
    for (const entry of CLIENT_ENTRIES) {
      const file = path.join('dist', entry);
      const source = await readFile(file, 'utf8');
      if (source.startsWith('"use client"')) continue;
      await writeFile(file, `"use client";\n${source}`);
    }
  },
});
