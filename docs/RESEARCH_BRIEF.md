---
title: "Wireframe Tanks — research brief"
tags: [wireframe-tanks, discovery, research]
status: active
created: 2026-09-30
---

# Wireframe Tanks — research brief

**Author:** Researcher. **Date:** 2026-09-30. **Input:** `docs/IDEA_BRIEF.md` (scope decision D-24).

Every claim carries a source number in square brackets, listed in [Sources](#sources). Anything marked **Opinion** is my judgement, and anything marked **Unknown** I could not establish. I am not a lawyer, and section 2 is not legal advice.

## 1. Question

Before anyone builds: can we make a first-person 3D wireframe tank game for desktop browsers, as a free static site, without legal or technical surprises? That breaks into six questions:

1. What prior art exists, and what does it tell us?
2. What is the IP risk of copying Battlezone's look or name?
3. Which rendering approach fits best?
4. How should we handle the game loop, input and audio?
5. What enemy AI is simple enough for the MVP?
6. Which free static host should we use?

## 2. Recommendation

1. **Rendering:** Canvas 2D with our own perspective projection, and no runtime dependencies. The spike in section 5 shows it has ample headroom for a scene of this size.
2. **Glow:** do not use Canvas `shadowBlur` for the vector glow. It cost about 10 ms per frame in the spike, which is most of a 60 fps frame budget. Ship the MVP with plain lines and treat glow as a later enhancement.
3. **IP:** keep the name "Wireframe Tanks". Do not use the word "Battlezone" in the title, URL, page metadata or marketing. Design our own tank models, horizon, HUD and sounds instead of reproducing the original's. Copy no data from the original ROM.
4. **Loop, input, audio:** `requestAnimationFrame` with a fixed simulation timestep, `KeyboardEvent.code` for keys, and sounds synthesised with the Web Audio API so the repo holds no audio files.
5. **Enemy AI:** a small state machine per enemy (spawn, approach, aim, fire, evade) built on seek and obstacle-avoidance steering.
6. **Hosting:** GitHub Pages, if Robin is happy for the source to be public on GitHub. Cloudflare Pages is the fallback. Nothing is published without Robin's go-ahead.

The stack choice itself belongs to the Architect at the design gate. Items 1, 2, 4 and 5 are my input to that decision.

## 3. Prior art

### 3.1 The original

- Battlezone was released by Atari in November 1980. It uses wireframe vector graphics on a black-and-white vector monitor, with a coloured overlay that tints the bottom four fifths green and the top fifth red. [1]
- The player drives with two joysticks, one per tank tread. [1]
- Enemies are slow tanks, fast missiles and supertanks, with saucers for bonus points. Obstacles are indestructible geometric solids such as pyramids and blocks. The horizon has mountains, an erupting volcano and a crescent moon. A radar shows enemy positions. [1]
- The original hardware refreshes the display at about 41.7 Hz. [2]
- Wikipedia lists Stellar 7 (1983), Robot Tank (1983), 3D Tank Duel (1984), Spectre (1991) and BZFlag as games it inspired. [1]

### 3.2 Browser clones

| Project | Rendering | Notes |
|---|---|---|
| `adamsilverstein/battlezone` [3] | Canvas 2D, TypeScript, Vite, Web Audio | No runtime dependencies. Shapes, font, mountains, constants and sounds are generated from the original ROM source. MIT code. README says "Battlezone is a trademark of its respective owner". |
| `atomic14/tanks-web` (Tanks! Mayhem) [4] | Plain JavaScript and WebGL, no build step | Draws dark solid faces first, then edges as wide lines with additive blending for glow. Each line is expanded into a quad. Uses Planck.js for physics. |
| `Aeonovyli/bzo` [5] | Three.js, Node.js, WebSockets | Multiplayer. |
| `SebastienBellanger/battlezone` [5] | HTML5, CoffeeScript | Playable online. |
| `061375/Battlezone` [5] | JavaScript, custom engine | |

What this tells us:

- A faithful version has been built with Canvas 2D and no runtime dependencies [3], so the simplest option is proven in practice.
- The WebGL clone needed extra work to get wide glowing lines: each line is expanded into a quad. [4]
- **Opinion:** the market for free Battlezone clones is already served. Our game's value is as a team exercise and as its own small game, so it should not be pitched as "Battlezone in the browser".

## 4. IP risk

### 4.1 Facts

**Ownership and trademark**

- Rebellion bought the Battlezone franchise from Atari's bankruptcy in 2013. [1]
- Rebellion sells a current product, Battlezone Gold Edition, on PC, PlayStation 4, Xbox One and Nintendo Switch. Its site states that "the Rebellion and Battlezone name and logo are trademarks of Rebellion and may be registered trademarks in certain countries". [6]
- The US trademark BATTLEZONE, registration 5353103, was registered on 12 December 2017 and is live. A maintenance declaration was accepted on 15 May 2024. It covers computer and video game software (class 9), clothing (class 25) and online game services (class 41). The USPTO record lists the owners as Jason Kingsley and Christopher Kingsley, United Kingdom. [7]
- **Unknown:** whether there are UK or EU registrations. I did not search UKIPO or EUIPO.

**Enforcement history**

- In December 2011, Atari had *Vector Tanks* and *Vector Tanks Extreme* removed from Apple's App Store, citing copyright infringement. The developer said Atari was issuing claims against anything with "even a passing resemblance to an Atari classic". [8][9]
- The author of *Tanks! Mayhem* says his game was removed from the US App Store in 2011 after Atari complained that "a game where you drive a tank around shooting other tanks infringed their copyright". [4]
- Both actions were platform takedowns by the previous owner. **Unknown:** whether Rebellion has enforced against any clone. I found no example, and several clones that use the name are public on GitHub today. [3][5]

**Copyright law on game clones (United States)**

- In *Tetris v. Xio* (D.N.J. 2012) the court held that rules and mechanics are not protected, but the visual expression is. Xio copied the look closely enough that the games were nearly indistinguishable, and it lost. [10]
- In *Atari v. Philips* (7th Cir. 1982) the court held that the maze-chase idea and its standard elements were free to use, but the distinctive character designs were protected. [11]
- UK copyright in artistic works lasts 70 years after the author's death, so a 1980 work is still in copyright. [12]
- **Unknown:** how a UK court would treat a Battlezone-style game. I found no UK case on point, and Robin is in the UK.

### 4.2 Assessment (opinion)

| Element | Risk | Reasoning |
|---|---|---|
| Using the name "Battlezone" in the title, URL or marketing | **High. Avoid.** | It is a live registered mark for video games, with a current product on sale. [6][7] |
| The idea: first-person tank combat against AI tanks | Low | Ideas and mechanics are not protected. [10][11] |
| The general style: green wireframe vectors on black | Low | **Opinion:** this is the look of a whole era of vector hardware, not of one game. I have no case that says so directly. |
| Copying the specific tank models, the volcano-and-moon horizon, the HUD layout, the font or the sounds | **Medium to high. Avoid.** | This is the specific expression that *Tetris v. Xio* protected. [10] A ROM-derived clone [3] takes this risk, and we should not. |
| Describing the game as "inspired by 1980s vector arcade games" | Low | **Opinion:** this is descriptive and avoids the mark. |

**Opinion:** with an original name and original art, the realistic worst case for a free, non-commercial hobby site is a takedown request to the host, not a lawsuit. The 2011 cases show that a takedown can happen on resemblance alone. [8] The mitigation is cheap: make our models and HUD visibly our own.

## 5. Rendering options

### 5.1 Facts

- **WebGL lines are one pixel wide.** Three.js documents that WebGL and WebGPU ignore `linewidth` and "always render line primitives with a width of one pixel". [13]
- **Wide lines in Three.js need an addon.** `LineSegments2` supports arbitrary widths and must be imported from `three/addons/lines/`. [14]
- **Three.js size and licence.** Version 0.186.1 is 736 KB minified and 185 KB gzipped for the whole package, with no dependencies. [15] It is MIT licensed. [16] **Unknown:** how much tree-shaking would remove for our use.
- **Canvas 2D is sufficient in practice.** A full clone runs on it with no runtime dependencies. [3]

### 5.2 Spike: is Canvas 2D fast enough?

I measured it. The test rotates a camera, projects random 3D line segments with near-plane clipping, and strokes them as one batched path on a 1280×720 canvas. It ran for 200 frames per case in headless Chrome 153, on a Ryzen 7 7730U with integrated Radeon graphics. [17]

| Segments drawn per frame | Plain lines, mean (p95) | With `shadowBlur` glow, mean (p95) |
|---|---|---|
| 256 | 0.7 ms (1.1 ms) | 9.8 ms (14.0 ms) |
| 1,042 | 2.3 ms (2.8 ms) | 12.9 ms (16.1 ms) |
| 5,056 | 14.3 ms (21.3 ms) | 35.5 ms (43.9 ms) |

A 60 fps frame allows 16.7 ms. So:

- Plain lines are cheap. About 1,000 visible segments cost 2.3 ms, which is 14% of the budget.
- `shadowBlur` adds roughly 10 ms whatever the segment count. At 1,042 segments its p95 is 16.1 ms, which leaves no room for game logic.
- Plain lines break the budget at about 5,000 visible segments.

**Limits of the spike:**

- One machine and one browser. Firefox and Safari are not measured.
- Each frame forces a one-pixel read-back to stop the clock honestly. That may push Chrome onto a slower rendering path, so these numbers are more likely pessimistic than optimistic.
- The scene is random segments, not game models. **Opinion:** a Battlezone-style scene needs a few hundred segments, based on the simple models and handful of objects in the original [1]. I did not count the original's vectors.

### 5.3 Options compared

| | Canvas 2D, own projection | Raw WebGL | Three.js |
|---|---|---|---|
| Fit for pure wireframe | Good. Lines with any width are native. | Lines are 1 px, so wide lines mean building quads ourselves. [4][13] | Lines are 1 px unless we use the `LineSegments2` addon. [13][14] |
| Payload | None | None | Up to 185 KB gzipped [15] |
| Licence | Web standard | Web standard | MIT [16] |
| Code we write | Projection, clipping, drawing. The spike does this in about 20 lines. [17] | Shaders, buffers, projection, line quads | Scene setup, addon wiring |
| Hiding lines behind solid objects | Hard. Needs our own depth sorting. | Easy: draw dark faces first, then edges. [4] | Easy |
| Glow | `shadowBlur` is too slow [17]. Other methods untested. | Additive blending, proven. [4] | Post-processing available |
| Testability | Projection maths is plain functions, testable without a browser | Needs a GL context | Needs a GL context |
| Risk | Low | Medium: more low-level code | Low to medium: dependency upgrades, larger payload |

### 5.4 Reasoning

Canvas 2D wins on every row that matters for the approved scope. The two rows it loses are hidden lines and glow.

- **Hidden lines:** a see-through wireframe needs none. **Opinion:** that look is acceptable for the MVP and is what players expect from the genre. If Product wants solid-looking tanks that hide what is behind them, that changes the answer to WebGL or Three.js.
- **Glow:** it is cosmetic. I recommend leaving it out of the MVP.

The main thing to get right is to keep rendering behind a small interface (a list of 3D segments in, pixels out). Then a later move to WebGL replaces one module and leaves game logic alone.

## 6. Game loop, input and audio

**Loop**

- `requestAnimationFrame` fires at the display's refresh rate, which may be 60, 75, 120 or 144 Hz. MDN warns that animation must use the timestamp, or it "will run faster on high refresh-rate screens". [18]
- It pauses in background tabs. [18] So the loop must clamp the elapsed time when the tab returns, or the game will jump.
- The standard fix is a fixed simulation step with an accumulator, and rendering decoupled from it. [19]
- **Recommendation:** fixed 60 Hz simulation step, render on every animation frame. This also makes the simulation deterministic, which helps the Tester.

**Input**

- `KeyboardEvent.code` gives the physical key regardless of layout. MDN recommends it for games and uses WASD as the example, so the same keys work on AZERTY. [20]
- MDN currently flags `code` as "limited availability", not Baseline. [20] **Unknown:** which browser causes that flag. The Tester should confirm it on the desktop browsers we target.
- The original used two tread levers. [1] **Opinion:** offer simple controls (W/S to drive, A/D to turn, Space to fire) as the default. Tread-style controls are a design question for Product and Designer.
- A gamepad is possible: one clone merges gamepad and keyboard input. [3] It is outside the approved scope.

**Audio**

- Browsers block audio until the user interacts with the page. An `AudioContext` created earlier starts `suspended` and must be resumed from a user gesture such as a click. [21]
- **Consequence:** the game needs a "press a key to start" screen. That is a requirement for the Analyst and Designer.
- Sounds can be synthesised in code with the Web Audio API, with no audio files. ZzFX does this in under 1 KB and is MIT licensed. [22] One clone synthesises all its sounds with Web Audio. [3]
- **Recommendation:** synthesise our own effects (engine hum, shot, explosion, radar ping). It keeps the repo free of audio assets and of any copied sounds. Writing a few oscillators by hand or using ZzFX is the Architect's call.

## 7. Enemy AI

**Facts**

- The original scales enemy behaviour by score. While the enemy is ahead, tanks appear in front of the player, "move uncertainly, and take bad shots". Once the player leads by 7,000 points, the enemy "spawns in any direction and moves with full aggression". [2]
- A newly spawned enemy cannot fire for two seconds. [2]
- The original's spawn code does not check for collisions, so tanks can spawn inside obstacles. [2] We should check.
- Reynolds' steering behaviours give standard building blocks: seek, flee, pursuit, arrival, obstacle avoidance and wander. [23]

**Recommendation**

A state machine per enemy, with steering for movement:

| State | Behaviour |
|---|---|
| Spawn | Appear at a set distance, clear of obstacles. No firing for a short grace period. |
| Approach | Seek the player, with obstacle avoidance. |
| Aim | Turn to face the player. Fire when the aim error is inside a tolerance. |
| Evade | After firing, or when the player is aiming at it, turn away or sidestep for a short time. |

Difficulty is then three numbers per level: turn rate, aim tolerance and reload time. **Opinion:** this is enough for an MVP with one enemy at a time, and it is easy to unit test because each state is a plain function of positions and time. Pathfinding is unnecessary in an open arena with a few obstacles.

## 8. Free static hosting

| | GitHub Pages | Cloudflare Pages | Netlify |
|---|---|---|---|
| Cost | Free | Free | Free, credit-based |
| Bandwidth | 100 GB per month, soft limit [24] | Reported as unlimited [26], not confirmed in Cloudflare's own docs | 300 credits per month. Bandwidth costs 20 credits per GB and each production deploy costs 15. [27] |
| Size limits | 1 GB site [24] | 20,000 files, 25 MiB per file [25] | Not checked |
| Builds | 10 per hour, soft limit [24] | 500 per month [25] | Paid from the same credits [27] |
| Conditions | Free accounts get Pages on public repositories only. [28] Must not be used to run an online business. [24] | None found | None found |

Points to note:

- Netlify's 300 credits cover 15 GB of bandwidth with no deploys, or 20 deploys with no traffic. [27] That is tight for a team that deploys often. **Not recommended.**
- GitHub Pages needs the code in a **public** GitHub repository on a free account. [28] Our repository is on the Buzz relay, so this means a GitHub mirror.
- Our site will be a few hundred kilobytes, so none of the size limits matter.

**Recommendation:** GitHub Pages if a public GitHub mirror is acceptable, because it is the option named in the idea brief and the simplest to run. Otherwise Cloudflare Pages, which can deploy without the source being public. The Engineer should confirm Cloudflare's bandwidth terms before relying on them.

## 9. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | Takedown request because the game resembles Battlezone | Low | Medium: site removed | Original name, models, HUD and sounds. No use of the mark. Section 4. |
| 2 | Someone uses "Battlezone" in the page title, README or metadata | Medium | Medium | Make it a written requirement, and have the Tester check it before release. |
| 3 | Product wants solid-looking tanks or glow, which Canvas 2D does poorly | Medium | Medium: renderer rewrite | Decide at the scope gate. Keep the renderer behind a small interface. |
| 4 | Canvas 2D is slower on Firefox or Safari than in my Chrome spike | Low | Low | Re-run `docs/research/canvas2d_bench.html` in each target browser early in Build. |
| 5 | No sound on first load because of autoplay rules | Certain unless handled | Low | Start screen that needs a key press. [21] |
| 6 | Game speed varies with monitor refresh rate | Certain unless handled | Medium | Fixed timestep. [18][19] |
| 7 | Keyboard ghosting: some keyboards drop a third simultaneous key | **Unknown**, not researched | Low | Tester to try drive + turn + fire together on real keyboards. |

## 10. Open questions

**For Robin**

1. Is a public GitHub mirror of the source acceptable? It decides between GitHub Pages and Cloudflare Pages.
2. Is this strictly a free hobby project? Any plan to charge or carry adverts raises the IP risk and breaks GitHub Pages' terms. [24]
3. Do you want the UK and EU trademark registers checked, or a lawyer's view, before release? I would not spend money on this for a free hobby game.

**For Product**

4. See-through wireframe, or tanks that hide what is behind them? This is the one product choice that changes the rendering recommendation.
5. Is glow wanted in the MVP?
6. Simple controls, tread-style controls, or both?
7. How far should our look depart from the original? I recommend our own tank shape, horizon and HUD layout.

**For the Architect**

8. TypeScript with a build step, or plain JavaScript with none? Both are proven by existing clones. [3][4]
9. Hand-written Web Audio or ZzFX?

## Sources

1. Wikipedia, "Battlezone (1980 video game)". https://en.wikipedia.org/wiki/Battlezone_(1980_video_game)
2. 6502disassembly.com, Battlezone disassembly notes. https://6502disassembly.com/va-battlezone/
3. `adamsilverstein/battlezone` README. https://github.com/adamsilverstein/battlezone
4. atomic14, "Tanks! Mayhem is back: 16 years later, in your browser", 24 July 2026. https://www.atomic14.com/2026/07/24/tanks-mayhem-is-back
5. GitHub repositories found by search; I read only the search summaries: https://github.com/Aeonovyli/bzo, https://github.com/SebastienBellanger/battlezone, https://github.com/061375/Battlezone
6. Rebellion, Battlezone Gold Edition site, footer. https://battlezone.com/en
7. USPTO TSDR, serial 87109701. https://tsdr.uspto.gov/statusview/sn87109701
8. Game Developer, "Atari cracks down on indie's Battlezone look-alike", 3 January 2012. https://www.gamedeveloper.com/business/atari-cracks-down-on-indie-s-i-battlezone-i-look-alike
9. Pocket Gamer, "Atari takes legal action against Battlezone-inspired Vector Tanks iPhone games", 4 January 2012. https://www.pocketgamer.com/vector-tanks/atari-takes-legal-action-against-battlezone-inspired-vector-tanks-iphone-games-a/
10. Wikipedia, "Tetris Holding, LLC v. Xio Interactive, Inc." https://en.wikipedia.org/wiki/Tetris_Holding,_LLC_v._Xio_Interactive,_Inc. Opinion text: https://www.govinfo.gov/content/pkg/USCOURTS-njd-3_09-cv-06115/pdf/USCOURTS-njd-3_09-cv-06115-0.pdf (I read the summary, not the full opinion.)
11. Wikipedia, "Atari, Inc. v. North American Philips Consumer Electronics Corp." https://en.wikipedia.org/wiki/Atari,_Inc._v._North_American_Philips_Consumer_Electronics_Corp.
12. UK Intellectual Property Office, "Copyright notice: duration of copyright (term)". https://www.gov.uk/government/publications/copyright-notice-duration-of-copyright-term/copyright-notice-duration-of-copyright-term
13. Three.js docs, `LineBasicMaterial`. https://threejs.org/docs/pages/LineBasicMaterial.html
14. Three.js docs, `LineSegments2`. https://threejs.org/docs/pages/LineSegments2.html
15. Bundlephobia, `three` 0.186.1. https://bundlephobia.com/api/size?package=three
16. Three.js licence. https://raw.githubusercontent.com/mrdoob/three.js/dev/LICENSE
17. Spike in this repo: `docs/research/canvas2d_bench.html`, results in `docs/research/canvas2d_bench_result.json`. Run on 2026-09-30.
18. MDN, `Window.requestAnimationFrame()`. https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
19. Glenn Fiedler, "Fix Your Timestep!". https://gafferongames.com/post/fix_your_timestep/
20. MDN, `KeyboardEvent.code`. https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code
21. MDN, "Web Audio API best practices". https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
22. ZzFX. https://github.com/KilledByAPixel/ZzFX
23. Craig Reynolds, "Steering Behaviors For Autonomous Characters", 1999. https://www.red3d.com/cwr/steer/gdc99/
24. GitHub Docs, "GitHub Pages limits". https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
25. Cloudflare Docs, "Pages limits". https://developers.cloudflare.com/pages/platform/limits/
26. Secondary source for Cloudflare's unlimited bandwidth: https://pressless.io/blog/host-website-free-2026 (search summary only)
27. Netlify pricing. https://www.netlify.com/pricing/
28. GitHub Docs, "GitHub's plans". https://docs.github.com/en/get-started/learning-about-github/githubs-plans
