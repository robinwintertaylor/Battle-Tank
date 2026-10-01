# ADR 0002: Plain JavaScript modules, no build step

**Status:** Proposed. **Date:** 2026-10-01. **Author:** Architect.

## Context

The research brief left "TypeScript with a build step, or plain JavaScript with none" to the Architect (research §10, question 8). The game is a few thousand lines at most, ships to GitHub Pages as static files, and must stay under 500 KB. Every dev dependency is supply-chain surface (threat model T1, SEC-2).

## Options

1. **TypeScript with Vite.** Strong types and a fast dev server; one browser clone uses it. It adds a compiler and a bundler to the toolchain, and what is served differs from what is in the repo.
2. **Plain JavaScript with no tooling at all.** Smallest surface, but no type checking for the vector and angle maths, which is where the bugs will be.
3. **Plain JavaScript ES modules, typed with JSDoc and checked by `tsc --noEmit`.** The browser runs the files as written, and type errors are still caught in CI.

## Decision

Option 3. Source lives in `site/src/` as ES2022 modules and is published unchanged. `jsconfig.json` turns on `checkJs` and `strict`. Unit tests use Node's built-in `node:test` runner and coverage. The full dev dependency list is `typescript`, `eslint`, `@eslint/js`, `@playwright/test` and `@axe-core/playwright` (`ARCHITECTURE.md` §8).

## Consequences

- What is tested is byte-for-byte what is served. No source maps and no build output to inspect.
- The supply chain is five dev packages, and none of them can inject code into the artifact, because nothing transforms it.
- No minification. Expected size is under 150 KB before gzip, well inside the budget.
- JSDoc types are wordier than TypeScript syntax.
- Several module files mean several requests at load. Over HTTP/2 on Pages that is acceptable, and all of them finish before `load` because every import is static.
