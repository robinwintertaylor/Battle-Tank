# ADR 0004: Tank collection with one controller per tank

**Status:** Accepted by Robin at the design gate, 2026-10-01 (D-112). **Date:** 2026-10-01. **Author:** Architect.

## Context

The MVP has one enemy at a time (P5). Phase 2 adds more attackers and other enemy types (D-41). Product asked that the design not make those hard: entities in a collection, one AI instance per enemy, and nothing from Phase 2 built now.

## Options

1. **Hard-wired fields** (`state.player`, `state.enemy`). Least code today, but Phase 2 would mean touching the simulation, collision, rendering, HUD and tests.
2. **A full entity-component-system.** Very flexible, but far more machinery than two tanks and a few shells need.
3. **Plain arrays of plain objects:** `state.tanks` and `state.shells`, each tank with a `side`, a `kind` and a `control` record. The player is identified by `playerId`. Enemy behaviour is looked up from a registry by `kind`.

## Decision

Option 3. Every tank goes through the same movement, firing and collision code. Only its intent source differs: the keyboard for the player, and `AI[kind].think(...)` with that tank's own memory for an enemy. `rules.spawnEnemies` keeps live enemies at `CONFIG.maxEnemies`, which is 1. The registry holds one kind, `hunter`.

## Consequences

- Phase 2 "more attackers" becomes a config change plus balancing. "Different types" becomes a new registry entry with its model and tuning.
- The AI cannot accidentally get abilities the player lacks, because physics is shared.
- Loops over a collection of one look slightly over-general in the MVP. That is the intended cost.
- Nothing beyond one enemy and one kind is built now. Phase 2 work stays a change request until that phase starts.
