# Architecture decision records

One file per significant decision. Each record states the context, the real options, the choice and what it costs. Records are never edited to change a decision: a new record supersedes the old one, and the old one's status says so. Every record is also logged in Cortex (project `wireframe-tanks`).

| ADR | Title | Status |
|---|---|---|
| [0001](0001-canvas-2d-renderer.md) | Canvas 2D renderer behind a line-segment interface | Accepted |
| [0002](0002-plain-javascript-no-build.md) | Plain JavaScript modules, no build step | Accepted |
| [0003](0003-fixed-timestep-deterministic-simulation.md) | Fixed-timestep, deterministic simulation | Accepted |
| [0004](0004-entity-collection-and-controllers.md) | Tank collection with one controller per tank | Accepted |
| [0005](0005-html-screens-canvas-play.md) | HTML screens over a canvas for play | Accepted |
| [0006](0006-hand-written-web-audio.md) | Hand-written Web Audio sound effects | Accepted |
| [0007](0007-github-pages-from-site-folder.md) | Publish only `site/` to GitHub Pages | Accepted |
| [0008](0008-test-hook-without-url.md) | Test hook switched on without the URL | Accepted |

All eight were accepted when Robin approved the design on 2026-10-01 (Cortex D-112).
