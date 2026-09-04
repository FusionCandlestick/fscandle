# Release Process

## Preflight

1. Confirm the release branch is clean.
2. Run `npm run release:check`.
3. Run the browser regression suite in
   [fscandle-web](https://github.com/FusionCandlestick/fscandle-web)
   (`npm run test:e2e`, `npm run test:perf:browser`) against the engine commit
   being released.
4. Re-run `node tests/performance/reference-comparison.mjs` if a release makes
   a claim about size or speed against KLineCharts or Lightweight Charts. The
   numbers come from that harness; a claim written down anywhere else is a copy
   with a date on it.
5. Update `CHANGELOG.md`.

## Versioning

The project is pre-1.0.

```bash
git tag v0.1.0
```

## Publishing to npm

The package is `fscandle` (public, unscoped). `prepare` builds `dist/` on
`npm publish`, so only the `files` allowlist ships.

```bash
npm login
npm publish --dry-run   # inspect the tarball
npm publish
```

Before the first publish: confirm the GitHub repository name matches
`repository.url`, and that `README.md`, the `files` list, and the public API in
`src/index.ts` are current.

## Release Claims

Allowed for v0.1:

- custom K-line Canvas engine
- multi-pane and multi-axis charting
- built-in indicators and drawing tools
- generic datafeed contracts
- `ChartPrimitive` extension surface
- documented reference gaps

Not allowed yet:

- parity with KLineCharts
- parity with Lightweight Charts
- benchmarked production performance guarantee
- complete indicator catalogue
