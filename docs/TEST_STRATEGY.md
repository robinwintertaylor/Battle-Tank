---
title: "Wireframe Tanks — test strategy"
tags: [wireframe-tanks, design, testing]
status: draft
created: 2026-10-01
---

# Wireframe Tanks — test strategy

**Author:** Tester. **Date:** 2026-10-01. **Stage:** Requirements and Design (merged). **Inputs:** `docs/IDEA_BRIEF.md`, `docs/RESEARCH_BRIEF.md`, `docs/PRODUCT_BRIEF.md`, scope decision D-41.

This document says how we will prove Wireframe Tanks works before Robin decides to deploy it: what we test, at which level, with which tools, where the tests run, and when Verify can start and finish. It is sized for a small static game with no backend.

`REQUIREMENTS.md`, `UX_SPEC.md` and `ARCHITECTURE.md` are being written in parallel with this document. Until they land, the traceability table in section 10 is keyed to the product brief's feature IDs (M1–M12, S1–S5, C1–C4). Once the Analyst's numbered requirements are on `main`, I will add the requirement numbers to that table and break each row down to one test per acceptance criterion.

## 1. What we are testing

A single-page, desktop-browser, first-person wireframe tank game served as static files from GitHub Pages. There is no server, no account and no stored personal data. The game has two kinds of behaviour, and they need different kinds of tests:

| Part | Examples | Best tested by |
|---|---|---|
| Deterministic game logic | Projection maths, movement, collisions, shell flight, hits, scoring, lives, enemy AI states, difficulty levels, the fixed-timestep loop | Unit tests with no browser. Fast, exact, run on every commit. |
| Browser behaviour | Key handling, start, pause and game-over screens, focus loss, audio unlock, page weight, network calls, frame rate, the drawn picture | End-to-end tests in real browsers, plus a short manual pass. |

The aim is to push as much as possible into the first row. A unit test that says "a shell fired from here hits a tank there" is cheaper and more reliable than an end-to-end test that tries to aim a tank with key presses.

## 2. What I need from the design (testability requirements)

These shape the architecture, so I am asking for them now. They go to the Architect through the Manager, and they are in my own interest as much as anyone's: without them, half the tests below cannot be written.

| # | Need | Why |
|---|---|---|
| T1 | **Game logic is separate from drawing, audio and input.** The simulation is plain functions or modules that run in Node with no DOM or canvas. | Unit tests for maths, physics, AI and scoring without a browser. Research §5.4 and product brief §6 already ask for a small renderer interface. |
| T2 | **Injectable clock.** The loop takes elapsed time from the caller instead of reading it directly. | Lets a test run the simulation at 60 Hz and at 144 Hz and compare (M10), and test the clamp after a background tab (research §6). |
| T3 | **Seedable random numbers.** All randomness (spawn position, AI wander) goes through one seeded generator. | Repeatable tests and repeatable defect reports. |
| T4 | **The renderer takes a list of 3D or 2D line segments.** | Tests can check *what* is drawn (enemy visible, locator pointing the right way, hit flash shown) without comparing screenshots pixel by pixel. |
| T5 | **A read-only test hook in the page.** The page exposes a frozen snapshot of the game state (screen, score, lives, positions) and lets a test set the seed. It must not let a test change the game in ways a player cannot. **Resolved by ADR 0008:** Playwright sets `window.__WT_TEST__ = { seed }` with `page.addInitScript` before load, and the page then adds `snapshot()` and `events()`. Nothing is read from the URL, so SEC-20 holds. | End-to-end tests can assert "game over screen with score 300" without reading pixels off a canvas. |
| T6 | **Start, pause and game-over screens are HTML over the canvas**, not drawn on it, *if the Designer agrees.* | Text on a canvas is invisible to screen readers and to automated accessibility checks. This is the Designer's call; if the screens stay on the canvas, accessibility testing for them becomes manual (section 6). |

If the Architect chooses differently on any of these, I will adjust this strategy and say which tests move from automated to manual.

## 3. Test levels

### 3.1 Unit tests

**Scope:** everything in the simulation, through its public functions.

- Projection and clipping: a point straight ahead projects to the centre of the screen; a point behind the camera is clipped, not drawn mirrored; segments crossing the near plane are cut correctly.
- Movement: forward, reverse and turning rates per step; a tank cannot enter an obstacle; arena edge behaviour (bounded or wrap, whichever the Analyst and Designer choose).
- Shells: one player shell in flight at a time (M4); shells stop at obstacles (M5); range or lifetime limit.
- Hits: a shell hitting a tank destroys it (M7); a shell does not hit the tank that fired it; near misses just outside the hit radius do not count.
- Scoring and lives: points per kill, lives lost per hit, game over at zero lives, restart resets score and lives (M9). Exact numbers come from the Analyst's business rules.
- Enemy AI: each state of the state machine (spawn, approach, aim, fire, evade) as a function of positions and time; spawns clear of obstacles; no firing during the grace period after spawning (M6); fires only within the aim tolerance.
- Difficulty: the three numbers per level (turn rate, aim tolerance, reload time) change at the score thresholds the Analyst sets (S3).
- Loop timing (M10): running the same inputs for 10 simulated seconds at 60 Hz and at 144 Hz frame intervals ends in the same state; a 5-second gap (background tab) is clamped and does not teleport anything.

**Tool:** Node's built-in `node:test` runner and its built-in coverage (ADR 0002: no build step). It runs headless in CI in seconds and adds no dependency.

**Target:** at least 90% line coverage of the simulation modules, and every business rule in `REQUIREMENTS.md` covered by at least one named test. Coverage of drawing, audio and input glue is not targeted; the end-to-end tests cover those.

### 3.2 End-to-end tests

**Scope:** the real built site, served locally the same way GitHub Pages will serve it, driven by keyboard events.

**Tool:** Playwright. It drives Chromium, Firefox and WebKit from one test suite, can record every network request, and has an accessibility plugin (`@axe-core/playwright`).

**Browsers:**

| Browser | Where | Notes |
|---|---|---|
| Chromium | CI, every push | Stands in for Chrome and Edge. |
| Firefox | CI, every push | |
| WebKit | CI, every push | Playwright's WebKit is close to Safari but is not Safari. Real Safari is checked manually if a Mac is available, and the report says either way (product brief §9, metric 3). |
| Chrome, Edge and Firefox, installed versions | Manual pass in Verify | On a mid-range Windows laptop. |

**Planned scenarios** (to be numbered against the requirements):

1. Page loads with the start screen, the controls listed, and no console errors (M1).
2. A key press starts the game; the canvas is drawing and the HUD shows score, lives and the enemy locator (M1, M2, M8).
3. W, S, A and D, and the arrow keys, move and turn the player; keys are read by `KeyboardEvent.code`, so the test sends physical key codes, including with a non-QWERTY layout emulated (M3).
4. Space fires; holding or mashing Space never puts a second player shell in flight (M4).
5. With a fixed seed, a scripted run destroys the enemy, the score goes up, and a new enemy appears (M6, M7, M9).
6. The player loses all lives, the game-over screen shows the final score, and a key press restarts with score and lives reset, without reloading the page (M9, metric 5).
7. The pause key pauses and resumes; switching tab or window pauses automatically (S4).
8. The mute key silences and restores sound; no audio plays before the first key press (S1, S2, research §6).
9. **No network calls after load:** every request is recorded from page open to the end of a full game; after the `load` event the count must be zero (M12, metric 4).
10. **No "Battlezone":** the page title, every `<meta>` tag, the URL path and all visible text on every screen contain no case-insensitive match for "battlezone" (M11, metric 6).
11. No uncaught errors or console errors during any of the above, in all three browsers.
12. **Test hook is inert for players** (ADR 0008): with no `window.__WT_TEST__` set, the page exposes no `snapshot` or `events` function. With it set, mutating the object returned by `snapshot()` throws or has no effect on the game.

**Spike early in Build (ADR 0008 depends on it):** confirm in Chromium, Firefox and WebKit that (a) `page.addInitScript` still runs with the shipped CSP `<meta>` tag in place, without `bypassCSP`, and (b) `page.clock` drives `requestAnimationFrame`, so time-dependent scenarios can fast-forward deterministically. If (a) fails, end-to-end tests use `bypassCSP` and the CSP check (SEC-17) runs in its own context without it. If (b) fails, long scenarios such as losing all lives run in real time with longer timeouts.

### 3.3 Performance tests

| Check | Target | How | Where |
|---|---|---|---|
| Page weight | Under 500 KB total transfer (metric 4) | Script sums the size of every file in the built site, and Playwright sums the bytes actually transferred on load. Either over budget fails the build. | CI, every push |
| Frame time | 60 fps in normal play (metric 3) | Playwright runs a scripted 60-second game and records frame intervals from `requestAnimationFrame`. Pass: median ≤ 16.7 ms and at most 1% of frames over 33 ms. | **Manual run on a mid-range laptop** in Verify, in Chrome, Firefox and Edge. |
| Frame time smoke test | No large regressions | Same script in CI with a looser threshold (median under 25 ms). | CI, every push |
| Refresh-rate independence | Same game speed at any refresh rate (M10) | Unit test in 3.1, plus a manual check on a 120 Hz or 144 Hz monitor if one is available. | CI and manual |
| Canvas 2D in other browsers | Research risk 4 | Re-run `docs/research/canvas2d_bench.html` in Firefox and Edge early in Build. | Manual, once |

Frame rate in CI is unreliable: shared runners have no GPU and vary in load. That is why the real 60 fps verdict comes from a manual run on stated hardware, and CI only catches large regressions. The test report will name the machine, browser versions and monitor refresh rate for every performance result.

### 3.4 Accessibility tests

A first-person action game cannot be fully accessible to every player, and the scope does not ask for that. What we can and should test:

- **Automated:** axe-core through Playwright on the start, pause and game-over screens. Zero serious or critical violations. This depends on T6.
- **Keyboard only:** the whole game, including starting, pausing, muting and restarting, works with no mouse.
- **Contrast:** HUD and screen text meet WCAG 2.2 AA contrast against the background (4.5:1 for normal text, 3:1 for large text and for graphical objects such as the crosshair and locator). Checked against the Designer's colour tokens, then on screen.
- **Page basics:** a meaningful `<title>`, a `lang` attribute, and the canvas labelled for assistive technology.
- **Motion and flashing:** the hit feedback (S5) and any explosion (C4) must not flash more than three times a second (WCAG 2.3.1).

The Designer sets the accessibility requirements in `UX_SPEC.md`; I will key these checks to them when it lands.

### 3.5 Manual and exploratory testing

Some things are better judged by a person:

- One exploratory session per build that reaches Verify, time-boxed to one hour, with notes in the test report.
- **Keyboard ghosting** (research risk 7): drive, turn and fire at once on at least two real keyboards, including a laptop keyboard.
- **IP look-alike review** (M11, product brief risk 2): compare our tank models, horizon, HUD layout, lettering and sounds against screenshots of the 1980 original and confirm none is a copy. I record the comparison in the test report. This is a reasonableness check, not legal advice.
- **Play test** (metrics 2 and 7): someone who has not seen the game opens it, and I time how long it takes to fire a first shot and note whether they start a second game unprompted. Product owns the verdict; I run the session and record the result.

## 4. Test environments

| Environment | What | Used for |
|---|---|---|
| Developer machine | Local static server on the built site | Unit tests and Playwright while building |
| CI | The pipeline the Engineer sets up. Assumed to be GitHub Actions on the public GitHub repository chosen at the scope gate (D-41). | All automated tests on every push and pull request |
| Reference laptop | A mid-range Windows laptop with installed Chrome, Firefox and Edge. Hardware is recorded in the test report. | Manual performance, keyboard and exploratory tests |
| Mac with Safari | Only if one is available | Safari check. If none is available, the report says Safari was not tested. |
| GitHub Pages preview | Only after Robin approves deploy | A smoke test of the live site: run scenarios 1, 2, 9 and 10 against the deployed URL. |

The site is served the same way in every environment: built files from a plain static server with no special headers beyond what GitHub Pages provides. If Security's threat model adds a Content Security Policy through a `<meta>` tag, scenario 11 also fails on any CSP violation in the console.

## 5. How CI runs the tests

Proposed for the Engineer, who owns the pipeline:

1. Install exact dependency versions from the lockfile (if there is one).
2. Lint.
3. Unit tests with coverage. Fails under the coverage target.
4. Build the site.
5. Page weight check on the build output.
6. Playwright end-to-end tests against the built site in Chromium, Firefox and WebKit, including the network, "Battlezone" and axe checks and the frame-time smoke test.
7. On failure, keep the Playwright trace, screenshots and console log as build artifacts so the defect report can link to them.

All steps must pass before a pull request merges. Target run time is under 10 minutes; if it grows past that, WebKit and Firefox move to a nightly run and Chromium stays on every push.

## 6. Defects

- Every defect is a Buzz issue on the `wireframe-tanks` repository, assigned through the Manager.
- Each one has: what I did (steps from a fresh page load), what I expected (citing the requirement number), what happened, the evidence (test name, CI run, trace, screenshot or console log), the browser and version, and the seed if the test hook was used.
- Fixes are retested by me, and the test that found the defect stays in the suite as a regression test.

**Severity:**

| Severity | Meaning | Examples |
|---|---|---|
| Critical | The game cannot be played, or a release rule is broken | Blank page, crash on start, a network call after load, "Battlezone" in the title |
| High | A Must feature does not work or is badly wrong | Enemy never fires, game over never comes, the game runs at double speed on 144 Hz |
| Medium | A Should feature fails, or a Must feature works with a noticeable flaw | Mute does not work, a tank clips through an obstacle edge |
| Low | Cosmetic or minor | Misaligned HUD text, a typo |

## 7. Entry criteria for Verify

Verify starts when all of these are true:

1. Robin has approved the design.
2. Every Must and Should requirement in scope is implemented and merged to `main`, or Product has explicitly dropped it.
3. CI is green on the commit under test, with the unit and end-to-end suites in place.
4. The test hook (T5) and fixed seed (T3) work in the built site, or the Architect has recorded why not.
5. The built site meets the page weight budget.

## 8. Exit criteria (Tester sign-off)

I sign off only when all of these are true, and the test report shows the evidence for each:

1. Every Must requirement has passed its tests in Chromium, Firefox and WebKit in CI, and in the manual pass on installed Chrome, Firefox and Edge.
2. Every Should requirement has passed, or Product has recorded a decision to drop it.
3. No open Critical or High defects (product brief metric 8). Any open Medium or Low defect has a recorded decision from Product to accept it.
4. Zero network requests after load, and page weight under 500 KB.
5. Zero matches for "battlezone" in the built site's title, metadata, URL and on-screen text, and the IP look-alike review is recorded with no copied element found.
6. 60 fps on the reference laptop under the frame-time rule in 3.3, with the hardware and browser versions stated.
7. No serious or critical axe violations, keyboard-only play works, and the contrast checks pass.
8. A full game (start, play, game over, restart) completes with no page reload and no console errors.
9. The unit test coverage target is met.
10. The traceability table has no requirement without a passing test.

If a criterion cannot be met, I do not sign off. I report which one and why, and the go/no-go call goes to the Manager and Robin.

## 9. Risks to testing

| # | Risk | Response |
|---|---|---|
| 1 | Game logic is tangled with drawing, so it cannot be unit tested | Testability requirements T1–T4 in section 2, raised now at Design. |
| 2 | Frame rate in CI is noisy | Real verdict from a manual run on stated hardware; CI only catches large regressions (3.3). |
| 3 | End-to-end tests that aim and shoot with key presses are flaky | Fixed seed and test hook (T3, T5), so the scenario is the same every run; precise hit logic is tested at unit level instead. |
| 4 | No Mac available, so Safari is untested | WebKit in CI as a proxy, and the report says plainly that Safari was not tested. |
| 5 | Screens drawn on the canvas cannot be checked for accessibility automatically | T6, or manual checks recorded in the report. |
| 6 | Requirements numbers change after this document | I update section 10 when `REQUIREMENTS.md` lands and again before Verify. |

## 10. Traceability (skeleton)

Keyed to the product brief until the Analyst's numbers land. The **REQ** column will hold the requirement numbers from `REQUIREMENTS.md`, and the test IDs will be split into one per acceptance criterion. Test ID prefixes: `UT` unit, `E2E` end to end, `PERF` performance, `A11Y` accessibility, `MAN` manual.

| Feature | REQ | Unit | End to end | Other | Status |
|---|---|---|---|---|---|
| M1 Start screen, controls shown, key press starts | TBD | | E2E-01, E2E-02 | A11Y-01 | Not started |
| M2 First-person wireframe view with horizon | TBD | UT-PROJ | E2E-02 | MAN-IP | Not started |
| M3 Forward, reverse, turn; physical keys | TBD | UT-MOVE | E2E-03 | MAN-KEYS | Not started |
| M4 Fire; one shell in flight | TBD | UT-SHELL | E2E-04 | | Not started |
| M5 Obstacles block tanks and shells | TBD | UT-MOVE, UT-SHELL | | | Not started |
| M6 Enemy approaches, aims, fires; safe spawn; grace period | TBD | UT-AI | E2E-05 | | Not started |
| M7 Hits destroy; new enemy after a kill | TBD | UT-HIT | E2E-05 | | Not started |
| M8 Enemy locator | TBD | UT-LOC | E2E-02 | A11Y-CONTRAST | Not started |
| M9 Score, lives, game over, restart | TBD | UT-SCORE | E2E-05, E2E-06 | | Not started |
| M10 Same speed at any refresh rate | TBD | UT-LOOP | | PERF-HZ | Not started |
| M11 No "Battlezone"; original art and sound | TBD | | E2E-10 | MAN-IP | Not started |
| M12 Static, no network calls after load | TBD | | E2E-09 | | Not started |
| S1 Synthesised sound effects | TBD | | E2E-08 | MAN-IP | Not started |
| S2 Mute key | TBD | | E2E-08 | | Not started |
| S3 Difficulty rises with score | TBD | UT-DIFF | | | Not started |
| S4 Pause key; auto-pause on focus loss | TBD | UT-LOOP | E2E-07 | | Not started |
| S5 Visible hit feedback | TBD | | E2E-05 | A11Y-FLASH | Not started |
| C1 Best score in local storage | TBD | UT-SCORE | E2E-06 | | If built |
| C2 Horizon scenery | TBD | | | MAN-IP | If built |
| C3 Engine sound | TBD | | | MAN-IP | If built |
| C4 Wireframe explosion | TBD | | | A11Y-FLASH | If built |
| NFR 60 fps | TBD | | | PERF-FPS | Not started |
| NFR page weight under 500 KB | TBD | | | PERF-SIZE | Not started |
| NFR no console errors | TBD | | E2E-11 | | Not started |
| NFR accessibility (from `UX_SPEC.md`) | TBD | | | A11Y-01 to A11Y-n | Not started |
| Security requirements (from `THREAT_MODEL.md`) | TBD | | E2E-11 (CSP) | | Not started |

The Analyst and I will keep this table in step: every requirement needs at least one test, and every test traces back to a requirement.

## 11. Deliverables from me

| When | What |
|---|---|
| Now (Design) | This strategy. |
| When `REQUIREMENTS.md` lands | Numbered test cases per acceptance criterion, and the filled-in traceability table. |
| Build | The Playwright suite and the performance and "Battlezone" checks, alongside the Developer's unit tests and the Engineer's CI. |
| Verify | Test execution, defects as Buzz issues, retests. |
| End of Verify | `docs/TEST_REPORT.md`: coverage, results, open defects with severity, and a go/no-go recommendation. |
