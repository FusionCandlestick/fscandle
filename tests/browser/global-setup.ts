// Bundle the sources the browser tests load: the public entry point, and a small
// page that mounts the React component. Built fresh for every run.

import path from 'node:path';
import { build } from 'esbuild';

import { ARTIFACTS } from './harness';

export default async function globalSetup(): Promise<void> {
  const shared = {
    bundle: true,
    format: 'iife' as const,
    platform: 'browser' as const,
    target: 'es2020',
    jsx: 'automatic' as const,
    define: { 'process.env.NODE_ENV': '"development"' },
    logLevel: 'warning' as const,
  };
  await build({
    ...shared,
    entryPoints: [path.resolve('src/index.ts')],
    globalName: 'fscandle',
    outfile: path.join(ARTIFACTS, 'fscandle.js'),
  });
  await build({
    ...shared,
    entryPoints: [path.resolve('tests/browser/react-entry.tsx')],
    outfile: path.join(ARTIFACTS, 'react.js'),
  });
}
