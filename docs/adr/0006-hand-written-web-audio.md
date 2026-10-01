# ADR 0006: Hand-written Web Audio sound effects

**Status:** Accepted by Robin at the design gate, 2026-10-01 (D-112). **Date:** 2026-10-01. **Author:** Architect.

## Context

Sound effects are a Should (S1): shot, explosion and an enemy warning, with an engine sound as a Could (C3). They must be our own (M11), with no audio files (research §6). The research brief left "hand-written Web Audio or ZzFX" to the Architect (question 9).

## Options

1. **ZzFX.** Under 1 KB, MIT licensed, and a compact way to describe many sounds. But it is third-party code in the artifact, which SEC-1 forbids ("every file is our own code").
2. **Hand-written Web Audio.** A few oscillators, a noise buffer and gain envelopes: perhaps 100 lines for four sounds.
3. **Recorded audio files.** Adds payload, and a sourcing question for originality.

## Decision

Option 2. `platform/audio.js` creates the `AudioContext` on the first key press, maps simulation events to sounds, and routes everything through one master gain for mute (S2).

## Consequences

- No third-party code and no asset files. The sounds are original by construction.
- We write and tune the envelopes ourselves, which may take a few extra hours if the sounds need work.
- Audio is browser glue, so it is covered by end-to-end checks (no sound before the first key press, mute works), not by unit tests.
