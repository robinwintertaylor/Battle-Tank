# ADR 0001: Canvas 2D renderer behind a line-segment interface

**Status:** Proposed. **Date:** 2026-10-01. **Author:** Architect.

## Context

The game is a see-through wireframe with plain lines and no glow (product decisions P1, P2, D-37). Shipped code must have no runtime dependencies (SEC-1). The research spike drew about 1,000 segments in 2.3 ms mean at 1280×720 in Chrome, against a 16.7 ms frame (research §5.2). Our scene needs about 600 segments. Product and the Tester both ask for drawing to sit behind a small interface (product brief §6, T4).

## Options

1. **Canvas 2D with our own projection.** No payload, any line width, and the projection is plain, testable maths. Hidden-line removal and glow are hard, but neither is in scope.
2. **Raw WebGL.** Fast and good at glow, but lines are one pixel wide, so wide lines need hand-built quads, shaders and buffers. More low-level code to own.
3. **Three.js.** Easy hidden lines and post-processing, but up to 185 KB gzipped, wide lines need an addon, and it is a runtime dependency, which SEC-1 rules out.

## Decision

Option 1. `render/scene.js` and `render/camera.js` turn game state into projected 2D segments with plain arithmetic. `render/canvas-renderer.js` is the only module that touches the canvas, and it strokes each colour as one path. No `shadowBlur`.

## Consequences

- Zero payload and nothing third-party in the artifact.
- Projection, clipping, culling and "what is visible" are unit-testable in Node.
- Solid-looking tanks or glow would need a new `canvas-renderer.js` (WebGL), but no change to game logic or scene building.
- We own the projection and near-plane clipping code. It is about a page long and is the first thing the unit tests cover.
- Firefox and Safari performance is unmeasured. The segment budget has a 3× margin (`ARCHITECTURE.md` §6.1), and the spike is re-run in each browser early in Build.
