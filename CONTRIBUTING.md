# Contributing to FusionCandlestick

Thanks for looking at this project. It is a 0.x preview: the engine works, but
the public API is not frozen and the internal architecture is still moving.

This repository is the **engine** (`fscandle`). The marketing site and
playground are a separate repository,
[fscandle-web](https://github.com/FusionCandlestick/fscandle-web); browser,
gesture, and screenshot regression tests live there.

## Setup

```bash
npm install
```

Node 22 is required (`engines` pins `>=22 <23`).

## Before opening a pull request

```bash
npm run release:check                 # lint, typecheck, unit, smoke, perf, stability, audit, bundle build, artifact smoke
npx playwright install chromium       # first time only — the stability probe drives a headless browser
```

`release:check` is the same gate CI runs. It must pass. Lint currently reports
warnings but zero errors — do not add new errors, and prefer removing warnings
in files you already touch.

## What to know before changing things

- **Public API.** `src/index.ts`, `src/react.ts`, and `src/datafeed.ts` are the
  three published entries. Adding or renaming an export means updating
  [`docs/api.md`](docs/api.md) and, usually, the source contract smoke test in
  `tests/smoke/source-contract-smoke.mjs`.
- **The React entry must stay a client boundary.** `dist/react.js` and
  `dist/react.cjs` need the `"use client"` directive, which `tsup.config.ts`
  re-applies after bundling because esbuild strips it. `npm run test:package`
  guards this; do not "clean up" that step.
- **The reference engines are study material**, never a dependency. Nothing in
  `src/`, `tests/`, or CI may import from them. See
  [`docs/THIRD_PARTY_NOTICES.md`](docs/THIRD_PARTY_NOTICES.md).
- **Docs are part of the change.** If a capability lands, the release checklist
  and `CHANGELOG.md` should stop describing the old state. Several stale claims
  have already had to be corrected; do not add more.

## Commits and pull requests

Keep unrelated changes in separate commits — in particular, never mix a bulk
file move or vendored-tree change with source edits, because it makes the diff
unreviewable. Fill in the pull request template, including the verification
checkboxes.

## Reporting problems

Use the issue templates. Security issues go through
[`SECURITY.md`](SECURITY.md) instead of the public tracker.
