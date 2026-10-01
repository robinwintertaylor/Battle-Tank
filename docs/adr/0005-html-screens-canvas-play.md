# ADR 0005: HTML screens over a canvas for play

**Status:** Proposed, subject to the Designer's answer in `UX_SPEC.md`. **Date:** 2026-10-01. **Author:** Architect.

## Context

The start, pause and game-over screens carry the controls, the final score and the restart prompt. Text drawn on a canvas is invisible to screen readers and to automated accessibility checks, so the Tester asked for these screens in HTML (T6). The Manager asked the Designer to answer, and the Architect to follow that answer.

## Options

1. **Everything on the canvas.** One drawing path and one look, but the screens can only be checked for accessibility by hand.
2. **Screens as HTML overlays over the canvas; play and HUD on the canvas.** Real text, focus order, `lang`, and automated axe checks for the screens. Two drawing paths to keep visually consistent.
3. **HUD in HTML as well.** More text available to assistive technology, but the HUD changes every frame, and DOM updates at 60 Hz cost more than canvas text.

## Decision

Option 2, unless `UX_SPEC.md` says otherwise. `platform/screens.js` shows and hides overlay elements and writes their text with `textContent` only (SEC-19). The canvas keeps drawing underneath. The HUD stays on the canvas.

## Consequences

- The Tester's axe checks on the screens can be automated.
- The "no Battlezone" text check can read those screens from the DOM.
- Styling lives in `styles.css`, so the CSP needs no `'unsafe-inline'` (SEC-18).
- If the Designer chooses option 1, only `screens.js` and `hud.js` change, and the Tester moves those checks to manual. This ADR would then be superseded.
