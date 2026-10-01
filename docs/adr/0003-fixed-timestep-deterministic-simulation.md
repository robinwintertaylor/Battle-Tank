# ADR 0003: Fixed-timestep, deterministic simulation

**Status:** Proposed. **Date:** 2026-10-01. **Author:** Architect.

## Context

`requestAnimationFrame` fires at the display's refresh rate, so a game that moves things once per frame runs faster at 144 Hz (M10, research §6). It also pauses in background tabs and comes back with a large gap. The Tester needs the game logic to run in Node, with an injectable clock and seeded randomness (T1, T2, T3).

## Options

1. **Variable timestep** (move by `speed × elapsed`). Simple, but collisions and AI then depend on frame timing, so results differ between machines and tests cannot compare states exactly.
2. **Fixed timestep with an accumulator**, rendering every animation frame with interpolation (research source 19).
3. **Fixed timestep driven by `setInterval`.** Decoupled from the display, but timers drift, are throttled in background tabs, and are not synchronised with painting.

## Decision

Option 2, at 60 steps per second. Elapsed time per frame is clamped to 250 ms, and at most five steps run per frame. The simulation (`core/sim.js`) is a pure function of state and input with no clock: each call is one step. The accumulator maths is the pure function `advance()` in `platform/loop.js`. All randomness comes from a seeded generator whose state lives in the game state. `core/` may not use `Date`, `performance` or `Math.random`, and lint enforces that.

## Consequences

- The game runs at the same speed at any refresh rate, and that is testable in Node.
- The same seed and the same inputs give the same game, so defects can be replayed exactly.
- Positions are interpolated for drawing, so tanks and shells keep their previous position. A little extra state.
- On a machine too slow to run five steps per frame, the game slows down instead of freezing.
- A deterministic `core/` that runs in Node is also an option for a Phase 2 server.
