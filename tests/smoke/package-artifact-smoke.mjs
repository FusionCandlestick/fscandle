// Verifies the published artifact, not the sources: run it after `npm run build:library`.
// The source contract smoke test reads src/ and package.json, so it cannot see whether
// the dist/ bundle a consumer actually installs is loadable and correctly annotated.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

const entryFiles = Object.values(manifest.exports).flatMap(entry => Object.values(entry));
for (const file of [manifest.main, manifest.module, manifest.types, ...entryFiles]) {
  assert.ok(existsSync(resolve(root, file)), `missing build artifact: ${file}`);
}

// The React entry ships a component with hooks. esbuild strips directives while
// bundling, so without this the entry loses its React Server Components client
// boundary and `fscandle/react` fails to compile in a Next.js App Router
// server component.
for (const file of ['dist/react.js', 'dist/react.cjs']) {
  const source = readFileSync(resolve(root, file), 'utf8');
  assert.match(source, /^["']use client["']/, `${file} must start with the "use client" directive`);
}

// The core entry must stay importable without a DOM: consumers create the chart
// inside an effect, so module evaluation itself may not touch window/document.
const esm = await import(resolve(root, 'dist/index.js'));
const cjs = require(resolve(root, 'dist/index.cjs'));
for (const [label, namespace] of [['esm', esm], ['cjs', cjs]]) {
  assert.equal(typeof namespace.createChart, 'function', `${label} entry must export createChart`);
  assert.ok(Object.keys(namespace).length > 10, `${label} entry exports look truncated`);
}

const datafeed = await import(resolve(root, 'dist/datafeed.js'));
['bindMarketDataFeed', 'createPollingDataFeed', 'createWebSocketDataFeed'].forEach(name =>
  assert.equal(typeof datafeed[name], 'function', `datafeed entry must export ${name}`),
);

// react/react-dom stay peer dependencies, so they must not be inlined into the bundle.
assert.equal(manifest.dependencies?.react, undefined);
assert.ok(manifest.peerDependencies?.react, 'react must be declared as a peer dependency');

console.log('package artifact smoke checks passed');
