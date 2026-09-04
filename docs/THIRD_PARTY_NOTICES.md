# Third-Party Notices

FusionCandlestick redistributes, or depends at runtime on, the following
third-party software. Each component remains under its own license; nothing in
this file or in the FusionCandlestick license alters those terms.

Development-only tooling (build, lint, test, and the Next.js showcase app) is not
listed here because it is not part of the distributed package.

---

## technicalindicators

- Version: 3.1.0
- License: MIT
- Copyright (c) 2016 Anand Aravindan
- Homepage: https://github.com/anandanand84/technicalindicators
- Used by: built-in indicator templates (`src/plugins/Indicator.ts`). Declared as
  a runtime dependency and left external to the published bundle.

```
The MIT License (MIT)

Copyright (c) 2016 Anand Aravindan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Reference baselines (not redistributed)

KLineCharts and Lightweight Charts are consulted only as design references for
comparison in the showcase app. Neither library is a dependency of the published
package and no code from either is included.
