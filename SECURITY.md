# Security Policy

## Supported versions

FusionCandlestick is a 0.x preview. Only the latest `main` and the most recent
`0.1.x` tag receive fixes; older previews do not.

| Version | Supported |
| --- | --- |
| 0.1.x | yes |
| < 0.1 | no |

## Reporting a vulnerability

Report privately — do not open a public issue.

- Use GitHub's **Report a vulnerability** button under the repository's Security
  tab (private vulnerability reporting), or
- email the maintainer listed in [`.github/CODEOWNERS`](.github/CODEOWNERS).

Please include the affected version or commit, reproduction steps, and what an
attacker gains. Expect an acknowledgement within about a week; this is a
single-maintainer project, not a staffed security team.

## Scope

This package is a browser charting library. It renders data the host
application supplies and persists chart state in `localStorage`. Realistic
issues include: unsafe handling of untrusted symbol/overlay text, prototype
pollution through option or persisted-state merging, and denial of service in
the renderer or data store from crafted input.

Out of scope: vulnerabilities in the host application, in the demo routes'
mock data, or in the read-only upstream clones under `references/`, which are
untracked local study material and are neither published nor executed.

## Dependency policy

`npm run audit:ci` fails the build on high or critical advisories in production
dependencies, and runs as part of `release:check` and CI.
