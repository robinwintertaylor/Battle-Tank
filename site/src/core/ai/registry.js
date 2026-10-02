// Maps an enemy `kind` to its controller (ADR 0004, ARCHITECTURE.md 5.4).
// The MVP registers one kind. A Phase 2 kind is a new entry here with its
// own model and tuning, and needs no change to sim.js.

import * as hunter from './hunter.js';

/** @typedef {import('../world.js').Tank} Tank */
/** @typedef {import('../sim.js').Intent} Intent */
/** @typedef {import('../sim.js').AiView} AiView */
/** @typedef {{ createMemory: () => object, think: (memory: any, tank: Tank, view: AiView, rng: { rng: number }) => Intent }} Controller */

/** @type {Readonly<Record<string, Controller>>} */
export const AI = Object.freeze({ hunter });
