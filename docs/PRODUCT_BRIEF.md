---
title: "Wireframe Tanks — product brief"
tags: [wireframe-tanks, discovery, product]
status: scope approved by Robin 2026-10-01 (Cortex D-41)
created: 2026-09-30
---

# Wireframe Tanks — product brief

**Author:** Product. **Date:** 2026-09-30, updated 2026-10-01 with Robin's scope approval. **Inputs:** `docs/IDEA_BRIEF.md` (scope decision D-24), `docs/RESEARCH_BRIEF.md`.

**Scope approved.** On 2026-10-01 Robin approved the MVP exactly as written here, confirmed assumptions A1 and A2, and asked for a second phase once the MVP works (section 10). Cortex decision D-41.

This brief says what we build first and what we leave out. It is the reference for the Requirements stage and for accepting the finished game. Section references such as "research §5" point into the research brief.

## 1. Vision

A small, original tank duel in the vector-arcade style that anyone can open in a desktop browser and be playing within seconds: no install, no account, no cost.

## 2. Assumptions

| # | Assumption | Status |
|---|---|---|
| A1 | This is a free hobby project with no charging and no adverts. | **Confirmed** by Robin 2026-10-01, "for now". |
| A2 | The game is hosted as a static site on a free host. | **Confirmed** by Robin 2026-10-01: GitHub Pages, from a public GitHub repository on Robin's existing account. |
| A3 | Nothing is published without Robin's go-ahead. | Fixed by the playbook. |

Robin confirmed A1 "for now". If the project ever charges or carries adverts, the IP risk goes up (research §4), GitHub Pages' terms no longer fit (research §8), and this brief needs another look first.

## 3. Target users

**Primary: the casual desktop player.** Someone who follows a link, has five to ten minutes and a keyboard, and wants to be shooting something almost immediately. They may never have played a 1980s arcade game. They will leave if the page is slow to load, if the controls are not obvious, or if they cannot find the enemy.

**Secondary: the retro-arcade fan.** Someone who knows vector games and comes for the look and feel. They care about smooth motion, crisp lines and a fair difficulty curve. They are the most likely to replay for a higher score.

**Internal: Robin and the dev team.** The project is also a first full run of the team's process from idea to release-ready. That is a reason to keep the scope small enough to finish, and it is not a reason to add features.

## 4. Problem

The player wants a quick, satisfying arcade session in the browser. The existing options are either faithful copies of one specific 1980 game, which carry its name and artwork and the legal exposure that goes with them (research §3.2, §4), or larger games that need an install or an account.

The research brief's view, which I share, is that the market for free clones of that game is already served. So we are not building a clone. We are building our own small game in the same genre.

## 5. Value proposition

- **Instant:** one page, no install, no sign-up, playable seconds after the link opens.
- **Simple:** three controls (drive, turn, fire) shown on the start screen.
- **Our own:** original name, tank models, horizon, HUD and sounds.
- **Free and private:** no cost, no adverts, no tracking, no data leaving the browser.

## 6. Product decisions

These are the product choices the research brief asked for. Each one is logged in Cortex.

| # | Question | Decision | Why |
|---|---|---|---|
| P1 | See-through wireframe, or tanks that hide what is behind them? | **See-through wireframe.** | It is the look the genre's players expect, and it keeps the simplest rendering option open, with no runtime dependencies (research §5.3). Solid-looking tanks would add a renderer rewrite risk for a cosmetic gain. |
| P2 | Glow in the MVP? | **No.** Plain lines. | Glow is cosmetic, and the measured way of doing it uses most of a frame's time budget (research §5.2). It goes on the roadmap. |
| P3 | Simple controls, tread-style controls, or both? | **Simple only:** W/S drive, A/D turn, Space fires, with the arrow keys as an alternative for driving and turning. | A casual player must be able to play without reading instructions. Two control schemes double the design and test work. |
| P4 | How far does our look depart from the original? | **Fully original** tank shape, obstacles, horizon, HUD layout, lettering and sounds. | Research §4.2 rates copying those specific elements as medium to high risk, and the mitigation costs little. |
| P5 | How many enemies at once? | **One.** | It is enough for a duel, and it keeps the AI and the balancing small (research §7). |

P1 and P2 are product choices about the look. The stack itself is still the Architect's decision at the design gate. One thing I ask of the design: keep drawing behind a small interface, as research §5.4 suggests, so a later change of look does not touch the game logic.

## 7. MVP scope

### In scope

A single-player game on one page, for desktop browsers with a keyboard:

1. A start screen that shows the controls and waits for a key press.
2. A first-person view of a flat arena in see-through wireframe, with fixed obstacles.
3. A player tank that drives, turns and fires, and that cannot pass through obstacles.
4. One enemy tank at a time that hunts the player and fires back.
5. A way to find the enemy when it is out of view.
6. Score, lives, game over and restart.

### Out of scope

| Item | Where it goes |
|---|---|
| More than one enemy at once | Phase 2 |
| More enemy types | Phase 2 |
| Multiplayer | Phase 2 |
| Touch and mobile | Roadmap, unscheduled |
| Gamepad | Roadmap, unscheduled |
| Glow and other visual effects | Roadmap, unscheduled |
| Tanks that hide what is behind them | Not planned (decision P1) |
| Tread-style controls | Not planned (decision P3) |
| Online leaderboard, accounts, any backend | Not planned. It would break the no-cost, no-backend scope. |
| Analytics or tracking | Not planned for the MVP |
| Music | Not planned |
| Settings screen, key remapping | Not planned |

## 8. Feature list (MoSCoW)

### Must have

The game is not releasable without these.

| ID | Feature | Note |
|---|---|---|
| M1 | Start screen with the controls shown, started by a key press | Browsers also need a key press before sound can play (research §6). |
| M2 | First-person see-through wireframe view of a flat arena with a horizon line | Decision P1. |
| M3 | Player movement: forward, reverse, turn left, turn right | Keys as in decision P3, read by physical key position so other keyboard layouts work (research §6). |
| M4 | Player fires a shell; one shell in flight at a time | |
| M5 | Fixed obstacles that block tanks and shells | Original shapes (decision P4). |
| M6 | One enemy tank that approaches, aims and fires | It must spawn clear of obstacles and must not fire for a short time after it appears (research §7). |
| M7 | Hits: a shell destroys the tank it hits; a new enemy appears after a kill | |
| M8 | Enemy locator: the player can always tell which way the enemy is | Without it a first-person player spins on the spot hunting for the enemy. The form (radar, edge arrow or other) is the Designer's call, and the layout must be our own. |
| M9 | Score for each kill, a fixed number of lives, game over screen with the final score, restart by key press | |
| M10 | The same game speed on any monitor refresh rate | Otherwise the game runs faster on a 144 Hz screen (research §6). |
| M11 | Original name and artwork: no use of the word "Battlezone" in the page title, URL, metadata or on-screen text, and no copied models, HUD, lettering or sounds | Research §4. The Tester checks this before release. |
| M12 | Runs as a static site with no backend and no network calls after the page loads | |

### Should have

Expected in the MVP. Each can be dropped if it puts the release at risk, and I will say so explicitly if that happens.

| ID | Feature | Note |
|---|---|---|
| S1 | Sound effects made in code: shot, explosion, enemy warning | No audio files, no copied sounds (research §6). |
| S2 | Mute key | Goes with S1. |
| S3 | Difficulty that rises with the score | Three numbers per level: turn rate, aim tolerance, reload time (research §7). |
| S4 | Pause key, and automatic pause when the tab loses focus | |
| S5 | Visible feedback when the player is hit | |

### Could have

Only if they are nearly free once the Musts and Shoulds are done.

| ID | Feature | Note |
|---|---|---|
| C1 | Best score kept in the browser between visits | Local storage only. No server. |
| C2 | Original horizon scenery | |
| C3 | Engine sound | |
| C4 | Explosion animation made of wireframe fragments | |

### Won't have in the MVP

Multiplayer, touch and mobile, gamepad, glow, solid-looking tanks, tread-style controls, further enemy types, more than one enemy at once, online leaderboard, accounts, analytics, music, settings screen.

## 9. Success metrics

The MVP has no analytics, so there are no live usage numbers. Success is measured by testing before release, plus one informal play test.

| # | Metric | Target | How it is measured |
|---|---|---|---|
| 1 | Must-have features accepted | 12 of 12 | Product accepts each against the Analyst's acceptance criteria. |
| 2 | Time from opening the page to the first shot, for a new player | Under 30 seconds, with no instructions beyond the start screen | Play test with someone who has not seen the game. |
| 3 | Smoothness | 60 frames per second in normal play on current Chrome, Firefox and Edge on a mid-range laptop | Tester. Safari is tested if a Mac is available, and the result is reported either way. |
| 4 | Page weight | Under 500 KB in total, and zero network requests after load | Tester. The research brief expects a few hundred kilobytes (§8). |
| 5 | A full game is playable | Start, play, game over and restart with no page reload and no console errors | Tester. |
| 6 | IP guidance followed | Zero uses of "Battlezone" in the title, URL, metadata and on-screen text | Tester, with a text search of the built site. |
| 7 | It is fun enough to replay | At least one play tester starts a second game unprompted | Play test. This is a small sample and only an indication. |
| 8 | Defects at release | No open critical or high defects | Test report. |

The targets for metrics 2, 3 and 4 are my judgement of what "instant and smooth" means for this player. They are not drawn from measured data.

## 10. Roadmap beyond the MVP

### Phase 2: expand the game

Robin approved a second phase on 2026-10-01, to start **once the MVP works**. It is approved in direction only. Its detailed scope will be set in a new product brief update and a scope gate with Robin when Phase 2 starts. Robin named the items below and added "etc.", so the list may grow.

| Order | Item | Why this order |
|---|---|---|
| 2.1 | Multiple attackers at once | Builds directly on the MVP enemy, with no new infrastructure. |
| 2.2 | Different enemy types | Adds variety to the single-player game, with no new infrastructure. |
| 2.3 | Multiplayer | The largest step. GitHub Pages serves only static files, so multiplayer needs a game server, its own hosting research, and Robin's decision on any cost. It also brings new security work. |

**What this means for the MVP:** nothing in Phase 2 is MVP scope, and none of it is built early. The one thing I ask of the design is not to rule it out: the MVP has one enemy at a time (decision P5), but the design should not make a second enemy impossible to add.

### Later, unscheduled

Candidates for Phase 2 or after. None of it is committed.

| Item | Note |
|---|---|
| Polish: glow, best score, horizon scenery, explosion effects (whatever was not finished from Could) | Cheap, and it improves the game every player already has. |
| Gamepad | Small addition. One existing browser clone already combines gamepad and keyboard (research §6). |
| Touch and mobile | Opens the game to phone users. It needs new controls and a layout redesign. |

## 11. Risks to the product

| # | Risk | Response |
|---|---|---|
| 1 | Scope creep towards "just like the original": more enemy types, scenery, effects | This brief is the scope. Anything outside section 8 comes to me and the Manager as a change request. |
| 2 | The game resembles the 1980 original closely enough to draw a takedown request | M11, decision P4, and a check by the Tester before release (research §4, §9). |
| 3 | The game is playable but not fun: the enemy is too easy or too hard | S3 gives three numbers to tune. Metric 7 is the check. |
| 4 | A later wish for solid-looking tanks or glow forces a renderer change | Decisions P1 and P2 are explicit. The design should keep drawing behind a small interface. |
| 5 | Phase 2 items leak into the MVP because they are already approved in direction | Phase 2 starts only once the MVP works. Until then, multiple attackers, enemy types and multiplayer are change requests like anything else outside section 8. |

## 12. Open questions

**For Robin:** none. Both questions from the scope gate are answered (A1, A2).

**For the Requirements stage**

1. Analyst: how many lives, and what score per kill? I suggest three lives and leave the numbers to the requirements.
2. Designer: the form of the enemy locator (M8) and the HUD layout, both original.
3. Analyst and Designer: the arena edge. Either the arena is bounded or it wraps around; it must not let the player drive away from the fight forever.
