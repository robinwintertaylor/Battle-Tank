---
title: "Wireframe Tanks — test strategy"
tags: [wireframe-tanks, design, testing]
status: draft
created: 2026-10-01
---

# Wireframe Tanks — test strategy

**Author:** Tester. **Date:** 2026-10-01. **Stage:** Requirements and Design (merged). **Inputs:** `docs/IDEA_BRIEF.md`, `docs/RESEARCH_BRIEF.md`, `docs/PRODUCT_BRIEF.md`, `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md` and ADRs 0001–0008, `docs/THREAT_MODEL.md`, scope decision D-41.

This document says how we will prove Wireframe Tanks works before Robin decides to deploy it: what we test, at which level, with which tools, where the tests run, and when Verify can start and finish. It is sized for a small static game with no backend.

Section 10 traces every acceptance criterion, business rule, NFR and security requirement in `REQUIREMENTS.md` (commit `34cab00`) to its tests. `UX_SPEC.md` is still to come; the visual cues and accessibility details it sets will be keyed in when it lands.

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
| 6 | Requirements numbers change after this document | Section 10 is keyed to `REQUIREMENTS.md` at `34cab00`. I recheck it whenever that file changes and again before Verify. |

## 10. Traceability

Keyed to `REQUIREMENTS.md` at commit `34cab00`. Every acceptance criterion, business rule, NFR and security requirement maps to at least one test. Product-brief IDs are kept in the US rows so each test still traces back to the brief. The Analyst keeps `REQUIREMENTS.md` §12 at the summary level; this section is the detailed table, and the two are kept in step.

### 10.1 Test catalogue

Test ID prefixes: `UT` unit (Node, `node:test`), `E2E` end to end (Playwright), `BUILD` checks on the built `site/` in CI, `LINT` lint rules, `PERF` performance, `A11Y` accessibility, `MAN` manual, `SET` repository and account settings checked at the deploy gate.

**Unit test groups.** Each group is one test file over `core/` (or a pure helper), with one named test per acceptance criterion or business rule it covers, named after that ID (for example `AC-07.2 shell 3.1 u from centre does not hit`).

| ID | Covers |
|---|---|
| UT-PROJ | Camera transform, near-plane clipping, projection, aspect ratio (`camera.js`) |
| UT-SCENE | Scene building: what is in the segment list, horizon, culling (`scene.js`) |
| UT-MOVE | Player and enemy movement, key combinations as input snapshots |
| UT-COLL | Tank against obstacle, boundary and other tank (`collision.js`) |
| UT-SHELL | Firing, one shell per tank, player reload, range, removal |
| UT-HIT | Swept hit test, ownership, obstacle-before-tank, same-step destruction |
| UT-SPAWN | Enemy spawn distance and clearance, the 50-attempt fallback, player respawn point |
| UT-AI | Enemy state machine, grace period, fire conditions, 100-seed reachability run |
| UT-SCORE | Score, lives, respawn timers, game over, restart lockout, new-game reset |
| UT-FLOW | Screen state machine (§8.1), pause and auto-pause, input ignored per screen |
| UT-DIFF | Level formula, difficulty table lookup at spawn, monotonic table |
| UT-LOOP | Fixed step, refresh-rate independence, frame clamp (`loop.js` `advance`) |
| UT-DET | Same seed and inputs give an identical state log |
| UT-CONFIG | Constants and obstacle layout: 12 obstacles, clear radius, inside the boundary, every open area reachable |
| UT-HUD | Locator bearing, hit feedback duration and flash count, reduced-motion flag (`hud.js`) |
| UT-STORE | Best-score key, validation and storage errors, using a fake storage object |
| UT-INPUT | Key mapping table and auto-repeat filtering, if `input.js` keeps them in a pure function; otherwise covered by E2E-03 and E2E-04 only |

**End-to-end scenarios.** E2E-01 to E2E-12 are defined in section 3.2. New ones:

| ID | Scenario | Covers |
|---|---|---|
| E2E-13 | **Sub-path hosting.** Serve `site/` under `/wireframe-tanks/` and rerun E2E-01, E2E-02, E2E-09 and E2E-11 there. Every request the page makes must stay under that sub-path, and none may 404. | NFR-07 |
| E2E-14 | **Reduced motion.** With `prefers-reduced-motion: reduce` emulated and a fixed seed, get the player hit and check through the snapshot that no camera shake or other non-essential motion is applied during the hit effect. Then repeat without the setting to show the check can fail. | NFR-16, AC-14.3 |
| E2E-15 | **Playable muted.** Mute before starting and play a seeded game. For every `shot`, `tank-hit`, `player-hit` and `enemy-spawned` event, the visual cue named in `UX_SPEC.md` for it must be present in the snapshot within the same frame. | NFR-17 |
| E2E-16 | **Privacy and storage.** After a full game: no cookies in the browser context and `document.cookie` is empty; `localStorage` holds no key except `wireframe-tanks:best-score`; `sessionStorage` is empty; no IndexedDB database, Cache Storage entry or service worker exists. | NFR-19, SEC-21 |
| E2E-17 | **Throttled load.** Chromium only, because network throttling needs its DevTools protocol: 10 Mbit/s, 40 ms latency, empty cache. The Start screen must accept a key within 2 s of navigation. | NFR-20 |
| E2E-18 | **Resize.** Resize the window between two aspect ratios mid-game. The canvas fills the area, the horizon stays level, and the projection is not stretched. | AC-02.5 |

**Build, lint and settings checks.**

| ID | Check | Covers |
|---|---|---|
| BUILD-01 | **Deployed artifact allowlist.** List every file in the Pages artifact. Fail on anything outside `site/`'s runtime files: no `docs/`, tests, `package.json`, lockfile, dotfiles, source maps or development config. Also fail on any local path (`C:\Users`, `/home/`, `/Users/`) in a shipped file. | NFR-12, SEC-16 |
| BUILD-02 | **Own code only.** No `http:` or `https:` URL to another origin in any shipped file. No `<script>` without `src`, no `style` attribute or `<style>` element, and no `on…=` handler in shipped HTML. No audio or font files. | SEC-1, SEC-18, NFR-06, NFR-11, AC-11.4 |
| BUILD-03 | **CSP.** The built `index.html` has the SEC-17 `<meta http-equiv="Content-Security-Policy">` as the first child of `<head>`, and it is at least as strict as the SEC-17 baseline. It also has `<meta name="referrer" content="no-referrer">`. | SEC-17, SEC-20 |
| BUILD-04 | **Name search.** A case-insensitive search for "battlezone" across every file in the artifact finds nothing. | NFR-10 |
| LINT-01 | ESLint bans `eval`, `new Function`, string timers and HTML sinks; DOM text goes through `textContent`. | SEC-19 |
| LINT-02 | ESLint bans browser globals and `Math.random` in `core/` (ARCHITECTURE.md §7). | NFR-21, NFR-23 |
| LINT-03 | The end-to-end suite may not use the mouse: `page.mouse`, `click`, `dblclick`, `hover` and `tap` are banned in `tests/e2e/`. Every scenario therefore proves keyboard-only play. | NFR-13 |
| SET-01 | Settings and workflow checklist at the deploy gate, done with Security: lockfile and `npm ci`, install scripts off, Dependabot and audit gate, Actions pinned to SHAs, least-privilege permissions, OIDC deploy, environment restricted to `main`, 2FA, ruleset, one-way mirror and its token, history and CI secret scans, HTTPS. Each item is recorded as seen, with a link or screenshot. | SEC-3 to SEC-16, SEC-23 |

**Performance, accessibility and manual checks** are as in sections 3.3 to 3.5: PERF-SIZE, PERF-FPS, PERF-SMOKE, PERF-HZ, A11Y-01 (axe on HTML screens and page basics), A11Y-CONTRAST, A11Y-FLASH, MAN-IP, MAN-KEYS, MAN-EXPLORE and MAN-PLAY.

### 10.2 User stories

| AC | Pri | Unit | End to end | Other |
|---|---|---|---|---|
| AC-01.1 Start screen content | Must | | E2E-01 | A11Y-01 |
| AC-01.2 Accepted key starts a game | Must | UT-FLOW | E2E-02 | |
| AC-01.3 Modifier, Tab and F-keys do not start | Must | UT-FLOW | E2E-02 | |
| AC-01.4 No sound before first key | Must | | E2E-08 | |
| AC-02.1 First-person view with horizon | Must | UT-PROJ, UT-SCENE | E2E-02 | |
| AC-02.2 See-through lines | Must | UT-SCENE | | MAN-EXPLORE |
| AC-02.3 Nothing behind is drawn | Must | UT-PROJ | | |
| AC-02.4 Near-plane clipping | Must | UT-PROJ | | |
| AC-02.5 Resize without stretching | Must | UT-PROJ | E2E-18 | |
| AC-03.1 to AC-03.3 Forward, reverse, turn rates | Must | UT-MOVE | E2E-03 | |
| AC-03.4 Drive and turn together | Must | UT-MOVE | E2E-03 | MAN-KEYS |
| AC-03.5 Opposite keys cancel | Must | UT-MOVE | | |
| AC-03.6 Non-QWERTY layout | Must | UT-INPUT | E2E-03 | MAN-KEYS |
| AC-03.7 No page scroll | Must | | E2E-03 | |
| AC-03.8 Held keys released on blur | Must | | E2E-07 | |
| AC-04.1 Shell created, 80 u/s | Must | UT-SHELL | E2E-04 | |
| AC-04.2 One shell in flight, nothing queued | Must | UT-SHELL | E2E-04 | |
| AC-04.3 Holding Space fires once | Must | UT-INPUT | E2E-04 | |
| AC-04.4 Range 200 u | Must | UT-SHELL | | |
| AC-04.5 0.5 s player reload | Must | UT-SHELL | | |
| AC-05.1 12 obstacles, fixed layout | Must | UT-CONFIG | E2E-05 | |
| AC-05.2 No overlap with obstacles | Must | UT-COLL | | |
| AC-05.3 Shells stop at obstacles | Must | UT-HIT | | |
| AC-05.4 Boundary holds tanks | Must | UT-COLL | | |
| AC-05.5 Shells removed at boundary | Must | UT-SHELL | | |
| AC-05.6 Spawn clear radius | Must | UT-CONFIG | | |
| AC-05.7 Edge is visible | Must | UT-SCENE | | MAN-EXPLORE |
| AC-06.1 Spawn distance and clearance | Must | UT-SPAWN | | |
| AC-06.2 Grace period | Must | UT-AI | | |
| AC-06.3 Fires when conditions hold | Must | UT-AI | E2E-05 | |
| AC-06.4 No fire outside aim tolerance | Must | UT-AI | | |
| AC-06.5 Reaches a firing position in 95 of 100 seeds | Must | UT-AI | | |
| AC-06.6 One enemy shell in flight | Must | UT-SHELL | | |
| AC-06.7 Deterministic enemy | Must | UT-AI, UT-DET | | |
| AC-07.1 Hit within 3 u | Must | UT-HIT | E2E-05 | |
| AC-07.2 Miss at 3.1 u | Must | UT-HIT | | |
| AC-07.3 Swept hit test | Must | UT-HIT | | |
| AC-07.4 New enemy after 1.5 s | Must | UT-SPAWN | E2E-05 | |
| AC-07.5 No self-hits | Must | UT-HIT | | |
| AC-07.6 Enemy shell kills player | Must | UT-HIT | E2E-06 | |
| AC-08.1 Bearing within ±5° | Must | UT-HUD | E2E-02 | |
| AC-08.2 Behind is distinguishable | Must | UT-HUD | | A11Y-CONTRAST |
| AC-08.3 No enemy shown during respawn | Must | UT-HUD | | |
| AC-08.4 Updates in the same frame | Must | UT-HUD | | |
| AC-09.1 Score 0, lives 3 | Must | UT-SCORE | E2E-02 | |
| AC-09.2 +100 per kill | Must | UT-SCORE | E2E-05 | |
| AC-09.3 Death, respawn after 2.0 s | Must | UT-SCORE, UT-SPAWN | E2E-06 | |
| AC-09.4 Game over after last life | Must | UT-SCORE, UT-FLOW | E2E-06 | |
| AC-09.5 1.0 s restart lockout | Must | UT-FLOW | E2E-06 | |
| AC-09.6 Restart without reload | Must | UT-SCORE | E2E-06 | |
| AC-09.7 Same-step destruction | Must | UT-HIT, UT-SCORE | | |
| AC-10.1 Pause freezes everything | Should | UT-FLOW | E2E-07 | |
| AC-10.2 Resume from the same state | Should | UT-FLOW | E2E-07 | |
| AC-10.3 Auto-pause on hide or blur | Should | | E2E-07 | |
| AC-10.4 No auto-resume | Should | | E2E-07 | |
| AC-10.5 Paused screen says how to resume | Should | | E2E-07 | A11Y-01 |
| AC-10.6 Game keys do nothing while paused | Should | UT-FLOW | E2E-07 | |
| AC-11.1 to AC-11.3 Shot, explosion, warning sounds | Should | | E2E-08 | |
| AC-11.4 No audio files | Should | | | BUILD-02 |
| AC-12.1, AC-12.2 Mute toggles on every screen | Should | | E2E-08 | |
| AC-12.3 Mute shown on screen | Should | UT-HUD | E2E-08 | |
| AC-13.1 to AC-13.3 Level thresholds and cap | Should | UT-DIFF | | |
| AC-13.4 Level fixed at spawn | Should | UT-DIFF | | |
| AC-13.5 Table never gets easier | Should | UT-CONFIG | | |
| AC-14.1 Hit effect, 0.75 s | Should | UT-HUD | E2E-06 | |
| AC-14.2 At most three flashes a second | Should | UT-HUD | | A11Y-FLASH |
| AC-14.3 Reduced motion | Should | UT-HUD | E2E-14 | |
| AC-15.1 Best score stored under the key | Could | UT-STORE | E2E-16 | |
| AC-15.2 Best score on game-over screen | Could | | E2E-06 | |
| AC-15.3 Invalid stored value treated as 0 | Could | UT-STORE | | |
| AC-15.4 Storage errors tolerated | Could | UT-STORE | | |
| AC-16.1, AC-16.2 Horizon scenery | Could | UT-SCENE | | MAN-IP |
| AC-17.1, AC-17.2 Engine sound | Could | | E2E-08 | |
| AC-18.1 Explosion fragments within 2.0 s | Could | UT-SCENE | | |
| AC-18.2 Explosion flash limit | Could | UT-HUD | | A11Y-FLASH |

How E2E-08 observes sound: the end-to-end test cannot listen to the speakers. An init script wraps `AudioContext` so the test can count started sources and read the master gain, and the snapshot's `muted` flag and the event log say what should have played. Whether each sound is pleasant and original is a MAN-IP judgement.

### 10.3 Business rules

Every business rule has at least one named unit test: BR-01 UT-INPUT and E2E-03/04; BR-02, BR-03 UT-MOVE; BR-04 UT-COLL; BR-05 UT-COLL, UT-SHELL; BR-06 UT-CONFIG; BR-07, BR-08 UT-SHELL; BR-09, BR-10, BR-21 UT-HIT; BR-11, BR-12, BR-13 UT-SCORE; BR-14 UT-SPAWN; BR-15, BR-16 UT-AI; BR-17 UT-DIFF; BR-18, BR-19, BR-20, BR-22 UT-FLOW; BR-23 E2E-08. NFR-24 requires a test named after each BR.

### 10.4 Non-functional requirements

| NFR | Pri | Tests |
|---|---|---|
| NFR-01 Frame rate | Must | PERF-FPS (manual, stated hardware), PERF-SMOKE (CI) |
| NFR-02 Same speed at any refresh rate | Must | UT-LOOP (30, 60 and 144 Hz), PERF-HZ |
| NFR-03 No catch-up jump | Must | UT-LOOP |
| NFR-04 Page weight | Must | PERF-SIZE (file total and bytes transferred) |
| NFR-05 No network calls after load | Must | E2E-09 |
| NFR-06 Static site | Must | BUILD-01, BUILD-02 |
| NFR-07 Sub-path hosting | Must | **E2E-13** |
| NFR-08 Browser support | Must | E2E suite in Chromium, Firefox, WebKit; manual pass in Chrome, Edge, Firefox |
| NFR-09 No console errors or CSP violations | Must | E2E-11 |
| NFR-10 No "battlezone" | Must | E2E-10, BUILD-04 |
| NFR-11 Original assets | Must | MAN-IP, BUILD-02 |
| NFR-12 Deployed artifact | Must | **BUILD-01** |
| NFR-13 Keyboard only | Must | LINT-03 over the whole E2E suite |
| NFR-14 No harmful flashing | Must | UT-HUD, A11Y-FLASH |
| NFR-15 Contrast | Must | A11Y-CONTRAST |
| NFR-16 Reduced motion | Should | **E2E-14**, UT-HUD |
| NFR-17 Sound is never the only cue | Must | **E2E-15** |
| NFR-18 Page basics and axe | Must | A11Y-01 |
| NFR-19 Privacy | Must | **E2E-16** |
| NFR-20 Load time | Should | E2E-17 |
| NFR-21 Determinism | Must | UT-DET, LINT-02 |
| NFR-22 Test hook | Must | E2E-12 |
| NFR-23 Logic runs in Node | Must | The whole UT suite runs under Node with no DOM; LINT-02 |
| NFR-24 Coverage | Must | Coverage gate in CI (90% lines of `core/`), and the BR naming check in 10.3 |

### 10.5 Security requirements

| SEC | Level | Tests |
|---|---|---|
| SEC-1 No runtime dependencies or third-party assets | Must | BUILD-02, E2E-09 |
| SEC-2 Dev dependencies limited and listed | Must | PR review by Security; SET-01 compares `package.json` to ARCHITECTURE.md |
| SEC-3 to SEC-16 Supply chain, CI, repository and account | per §7 | SET-01 |
| SEC-17 CSP | Must | BUILD-03, E2E-11 (zero violations) |
| SEC-18 No inline script or style | Must | BUILD-02 |
| SEC-19 No eval or HTML sinks | Must | LINT-01 |
| SEC-20 No-referrer, nothing read from the URL | Should | BUILD-03, E2E-12; code review |
| SEC-21 Namespaced best-score key | Should | UT-STORE, E2E-16 |
| SEC-22 Stored value validated | Should | UT-STORE |
| SEC-23 HTTPS on Pages | Must | SET-01; smoke test of the live URL after Robin's deploy go-ahead |

### 10.6 Notes for the design

- **Event log for end-to-end tests.** ARCHITECTURE.md §4 clears `state.events` at the start of every step. For E2E-08 and E2E-15 the test hook's `events()` must return every event since load (or a bounded recent history, for example the last 1,000), each with its simulation time, not only the current step's. Otherwise a test that polls between frames misses events. This is a detail of `test-hook.js`, not a change to the simulation.
- **Visual cues per sound (E2E-15).** The test needs `UX_SPEC.md` to name the visual cue for each sound event.
- **Shake flag (E2E-14).** If reduced motion is honoured in `hud.js` or `scene.js`, the snapshot should carry the camera or shake offset in use, so the test can see it is zero.

## 11. Deliverables from me

| When | What |
|---|---|
| Now (Design) | This strategy. |
| Done (`34cab00`) | Traceability from every requirement to its tests (section 10). |
| When `UX_SPEC.md` lands | Visual cues per sound for E2E-15, accessibility checks keyed to the Designer's requirements. |
| Build | The Playwright suite and the performance and "Battlezone" checks, alongside the Developer's unit tests and the Engineer's CI. |
| Verify | Test execution, defects as Buzz issues, retests. |
| End of Verify | `docs/TEST_REPORT.md`: coverage, results, open defects with severity, and a go/no-go recommendation. |
