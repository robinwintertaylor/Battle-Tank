# Build spike T1: Playwright under the CSP, page.clock and pointer media queries

This is throwaway evidence for `docs/TEST_STRATEGY.md` §3.2.1. It is not part of the shipped game or the test suite.

```sh
npm i -D @playwright/test@1.63.0
npx playwright test
```

- `site/index.html` carries the SEC-17 CSP meta tag unchanged.
- `tests/spike.spec.js` covers questions (a) to (d).
- `tests/wk-clock.spec.js` measures how much wall time `runFor` and `fastForward` take in each engine.
