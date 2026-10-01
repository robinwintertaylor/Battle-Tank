# ADR 0008: Test hook switched on without the URL

**Status:** Proposed. **Date:** 2026-10-01. **Author:** Architect.

## Context

The Tester needs a read-only view of the game state, and a way to fix the seed, for end-to-end tests (T5). The test strategy suggests a `?test` query string as one way to do it. Security's SEC-20 says the game reads nothing from the URL in the MVP. Both are reasonable, and the design should satisfy both.

## Options

1. **`?test&seed=…` in the URL.** Simple, but it breaks SEC-20 and puts a code path for URL input into the shipped game.
2. **A separate test build.** Breaks "what is tested is what is served" (ADR 0002, ADR 0007).
3. **A global set before the page's scripts run.** Playwright's `page.addInitScript` sets `window.__WT_TEST__ = { seed }`. If `main.js` finds that object at start-up, it uses the seed and adds read-only `snapshot()` and `events()` functions to it. Otherwise nothing is exposed.

## Decision

Option 3. `snapshot()` returns a deep-frozen copy of the state, so a test cannot change the game through it. The only input is the seed, which only changes which random game is played.

## Consequences

- SEC-20 holds: there is no URL parsing anywhere.
- The served files are the tested files. There is no test build.
- A player could set the same global from the browser's developer tools. That gives them nothing they could not already do there.
- If the Tester later needs to drive time, Playwright's clock control is the first option to try, not a write method on the hook.
