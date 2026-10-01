---
title: "Wireframe Tanks — UX spec"
tags: [wireframe-tanks, requirements, design, ux, accessibility]
status: active
created: 2026-10-01
---

# Wireframe Tanks — UX spec

**Author:** Designer. **Date:** 2026-10-01. **Stage:** Requirements and Design (merged).
**Inputs:** `docs/PRODUCT_BRIEF.md` (at `260b20a`), `docs/RESEARCH_BRIEF.md`, `docs/ARCHITECTURE.md` and ADRs (at `e5e4cec`), `docs/TEST_STRATEGY.md`, `docs/THREAT_MODEL.md`.
**Mockup:** `docs/ux/mockup.html`. Open it in a browser and switch screens with the URL hash (`#start`, `#play`, `#model`, `#play-left`, `#reloading`, `#hit`, `#paused`, `#gameover`, `#unsupported`, `#error`). It is a design reference only and is never shipped. Rendered screenshots of every screen at 1280 × 720 are in `docs/ux/screens/`.

`REQUIREMENTS.md` is being written in parallel. Until it lands, this spec refers to the product brief IDs (M1–M12, S1–S5, C1–C4). Game numbers (lives, points, speeds, grace period, respawn time) belong to the Analyst and live in `config.js`; where this spec shows a number in braces, such as `{lives}`, it is a value from there.

## 1. Design decisions

| # | Question | Decision | Why |
|---|---|---|---|
| UX-D1 | T6 / ADR 0005: screens in HTML or on the canvas? | **HTML over the canvas** for the start, pause, game-over, error and "keyboard needed" screens. Play view and HUD on the canvas. | Real text, focus order and automated axe checks for every screen with words on it. The HUD is a handful of short readouts, so the live region in §9 carries its meaning to assistive technology. |
| UX-D2 | Enemy locator form (M8) | **Bearing tape** along the bottom centre, plus an **edge chevron** when the enemy is out of view. | The tape answers "which way and how far" in one glance, and the chevron points at the turn. A circular radar is the original game's device, so we avoid it (§7.6). |
| UX-D3 | Arena edge | **Bounded**, shown by a low fence of posts and a rail. | It agrees with Architect §5.5. Wrapping is invisible in first person and makes the locator lie about distance. |
| UX-D4 | Lettering | **System monospace font** for HTML and canvas `fillText`. No vector lettering, no web fonts. | Original by construction, zero bytes, legible, and it satisfies SEC-1. |
| UX-D5 | Colour | **Cyan world, amber enemy, near-white HUD on near-black.** | Avoids the original's green-and-red overlay look. Cyan against amber differs in hue for the common colour-vision types, and the enemy also differs in shape (§8.3). |
| UX-D6 | Field of view | **40° vertical** (about 66° horizontal at 16:9). | It shows the enemy at a readable size at 50 m and gives enough side view to steer round obstacles. Architect's projection uses vertical FOV (§5.1); the value goes in `config.js`. |
| UX-D7 | Accidental restart | **Input lockout of 1 s** when the game-over screen opens. | A player hammering Space when they die must not skip their final score. |

## 2. Users and journeys

Personas come from product brief §3: the **casual desktop player** (primary) and the **retro-arcade fan** (secondary).

### J1 — First-time casual player: link to first shot in under 30 seconds (metric 2)

```mermaid
journey
  title First visit
  section Arrive
    Open link, page appears: 5: Player
    Read the controls on the start screen: 4: Player
  section Play
    Press Enter, drop into the arena: 5: Player
    See amber diamond on the bearing tape: 4: Player
    Turn towards it until it is in the bracket: 4: Player
    Fire with Space: 5: Player
  section End
    Lose last life, read final score: 3: Player
    Press Enter to play again: 5: Player
```

What must be true: the controls are on the start screen (M1), the first enemy is findable without spinning (M8), and the first shot needs no reading beyond the start screen.

### J2 — Retro fan chasing a score

Plays several games in a row. Needs restart without a page reload (metric 5), a visible best score (C1), and a difficulty rise they can feel (S3). Wants crisp motion, so the HUD stays out of the centre of the view.

### J3 — Interrupted player

Switches tab or gets a call. The game pauses itself on blur (S4) and shows the pause screen on return, so nothing happens while they are away. Resume puts them back exactly where they were.

### J4 — Player who needs quiet or less motion

Presses M to mute (S2) and sees the state in the HUD. With `prefers-reduced-motion: reduce` set, the hit shake and the warning pulse are replaced by static cues (§9).

### J5 — Player with a non-QWERTY keyboard

Keys are read by physical position (`KeyboardEvent.code`), so on AZERTY the drive keys sit where W A S D are on QWERTY. The start screen shows the QWERTY letters plus the arrow keys, which are the same everywhere.

## 3. Information architecture

One page, no navigation, no URLs per screen (SEC-20: the game reads nothing from the URL).

| Layer | Contents |
|---|---|
| Canvas (always present) | Play view (world, enemy, shells) and HUD |
| HTML overlay (one at a time) | Start, Pause, Game over, Keyboard needed, Error |
| Live region (visually hidden) | Short announcements of state changes (§9) |
| `<noscript>` | "JavaScript needed" message |

## 4. Screen flow

```mermaid
stateDiagram-v2
  [*] --> Loading
  Loading --> Unsupported: no fine pointer / window under 640x400
  Loading --> Start: modules ready
  Unsupported --> Start: Play anyway
  Start --> Playing: Start game / Enter
  Playing --> Paused: P, Esc, tab hidden, window blur, window too small
  Paused --> Playing: Resume / P / Esc
  Paused --> Start: Quit to title
  Playing --> PlayerHit: enemy shell hits, lives left > 0
  PlayerHit --> Playing: respawn delay ends
  Playing --> Destroyed: enemy shell hits, last life
  Destroyed --> GameOver: after 1.5 s
  GameOver --> Playing: Play again / Enter (after 1 s lockout)
  GameOver --> Start: Title screen / Esc
  Playing --> Error: uncaught error
  Paused --> Error: uncaught error
  Error --> [*]: Reload
```

### 4.1 Keys by state

| Key (`code`) | Start | Playing | Paused | Game over |
|---|---|---|---|---|
| `Enter` | Start game | — | Activates focused button | Play again (after lockout) |
| `Space` | Activates focused button (Start game) | Fire | Activates focused button | Activates focused button (after lockout) |
| `KeyW` / `ArrowUp` | — | Drive forward | — | — |
| `KeyS` / `ArrowDown` | — | Reverse | — | — |
| `KeyA` / `ArrowLeft` | — | Turn left | — | — |
| `KeyD` / `ArrowRight` | — | Turn right | — | — |
| `KeyP` | — | Pause | Resume | — |
| `Escape` | — | Pause | Resume | Title screen |
| `KeyM` | Toggle sound | Toggle sound | Toggle sound | Toggle sound |
| `Tab` | Moves focus between buttons (browser default) | — | Moves focus | Moves focus |

- While playing, the game calls `preventDefault` on Space and the arrow keys so the page never scrolls. In the overlays it does not, so buttons and Tab behave normally.
- Fire on Space follows the Analyst's rule (press or hold). The visuals in §6.3 work for either.
- The mute state lasts for the session. It is not stored (nothing beyond the best score goes to `localStorage`).

## 5. Wireframes

The mockup renders all of these at 1280 × 720. ASCII versions are below for review without a browser.

### 5.1 Loading and start (M1)

`index.html` contains the start overlay as static HTML, so it appears with the first paint. Until `main.js` is ready, the button is disabled and reads "Loading…". Then it reads "Start game" and takes focus.

```text
+------------------------------------------------------------------+
|                (dimmed arena drawn behind, no HUD)               |
|                                                                  |
|                        WIREFRAME TANKS                           |
|          One tank. One rival. Find it before it finds you.       |
|                                                                  |
|                 Drive   [W] [S]  or  [↑] [↓]                     |
|                 Turn    [A] [D]  or  [←] [→]                     |
|                 Fire    [Space]                                  |
|                 Pause   [P]  or  [Esc]                           |
|                 Sound   [M]                                      |
|                                                                  |
|                       [  Start game  ]   <- focused              |
|                        or press [Enter]                          |
|                       Best score 12000   <- only if one exists   |
+------------------------------------------------------------------+
```

The background is the arena at the start position, drawn once and dimmed by the overlay. Under reduced motion it stays still; otherwise the camera may turn slowly (one revolution per 60 s).

### 5.2 Playing — HUD layout (M2, M4, M8, M9)

```text
+------------------------------------------------------------------+
| SCORE 3000                                          BEST 12000   |
| LIVES 3 /\ /\ /\                           P PAUSE   M SOUND ON  |
|                                                                  |
|        ____                                                      |
| <      |  |   ___/‾‾‾‾\___        ( · )        ___/‾‾‾‾‾\___     |  <- horizon line and ridge
| ^      |  |    X              [enemy, amber]                     |
| edge   |__|                                                      |
| chevron                                                          |
| (only if enemy                                                   |
|  out of view)                                                    |
|              |----+----+----|  ◆  |----+----+----|               |  <- bearing tape
|                              ^                                   |
|                            49 m                                  |
+------------------------------------------------------------------+
```

| Element | Position | Notes |
|---|---|---|
| Score | Top left, 24 px in, baseline 36 px | Label `SCORE` in dim, value in HUD colour, 20 px |
| Lives | Under score, baseline 62 px | Number plus one outline triangle per life. The number means the count never depends on reading the icons. |
| Best score (C1) | Top right | Hidden when there is no stored best score or storage fails. Never shows "BEST 0". |
| Key hints | Under best score | `P PAUSE   M SOUND ON` / `M SOUND OFF`. Doubles as the mute indicator. |
| Crosshair | Exact centre | §6.3 |
| Bearing tape | Bottom centre, 56 px above the bottom edge | §6.4 |
| Edge chevron | Left or right edge, vertical centre | §6.5 |
| Banner | Centre, 32% from top | Transient messages (§6.6) |

Nothing is drawn in a band of ±60 px around the horizon except the crosshair, so the world stays readable where the action is.

### 5.3 Player hit, lives left (S5)

```text
+==================================================================+  <- alert-colour frame, 400 ms, once
||                                                                ||
||                  HIT · 2 LIVES LEFT                            ||  <- banner, alert colour
||                                                                ||
||                         ( · )                                  ||
||          view shakes for 250 ms (off with reduced motion)      ||
+==================================================================+
```

Then the respawn delay (Analyst's number). The banner stays for the whole delay. When play resumes the banner clears.

### 5.4 Last life lost

Same frame and shake, banner `DESTROYED`. After 1.5 s the game-over overlay opens.

### 5.5 Paused (S4)

```text
+------------------------------------------------------------------+
|           (frozen frame with HUD, under a dark overlay)          |
|                             PAUSED                               |
|                       [   Resume   ]  <- focused                 |
|                       [ Quit to title ]                          |
|                 Press P or Esc to resume                         |
+------------------------------------------------------------------+
```

When the pause was caused by the window being too small, a line is added above the buttons: "Make the window larger to keep playing." Resume stays disabled until the window is big enough again.

### 5.6 Game over (M9)

```text
+------------------------------------------------------------------+
|                           GAME OVER                              |
|                             14000                                |
|                        New best score    <- only when true (C1)  |
|              [ Play again ]  [ Title screen ]                    |
|                        or press [Enter]                          |
+------------------------------------------------------------------+
```

For the first 1 s (UX-D7) both buttons are disabled and key presses are ignored. Then "Play again" takes focus.

### 5.7 Keyboard needed

Shown instead of the start screen when `matchMedia('(any-pointer: fine)')` is false or the window is under 640 × 400. It is advice, not a block.

```text
                         Keyboard needed
   Wireframe Tanks is played with a keyboard on a screen at least
   640 × 400 pixels. Touch controls are not available yet.
                         [ Play anyway ]
```

### 5.8 Error

Shown by the global error handler (Architect §6.5). No stack trace or technical detail on screen; that goes to the console.

```text
                       Something went wrong
       The game stopped unexpectedly. Reload the page to play again.
                           [ Reload ]
```

### 5.9 No JavaScript

`<noscript>`: "Wireframe Tanks needs JavaScript. Turn it on and reload the page."

## 6. HUD components

All HUD geometry is in CSS pixels, built by `hud.js` as 2D segments and text items.

### 6.1 Score and lives

- Plain integers, no leading zeros, no thousands separator (scores stay short).
- On a kill, the score updates at once. The `+{points}` banner (§6.6) explains the jump.

### 6.2 Best score (C1)

Read once at start. Updated on the game-over screen when beaten. Hidden on any storage error (SEC-22) with no message to the player.

### 6.3 Crosshair (M4)

| State | Drawing |
|---|---|
| Ready to fire | Four arcs of a 36 px circle with 0.25 rad gaps at 0°, 90°, 180°, 270°, 2 px, HUD colour, plus a 5 px filled centre dot |
| Shell in flight or reloading | Same circle dashed (3 on, 5 off), HUD-dim colour, no centre dot |

The change is shape (dashed, no dot) as well as colour, so it reads without colour vision.

### 6.4 Bearing tape (M8)

- **Size:** width `min(480 px, 60% of viewport width)`, centred. Baseline 2 px, HUD-dim.
- **Scale:** left end is −180° (directly behind, turning left), centre is straight ahead, right end is +180°. Ticks every 45°: 20 px tall at 0°, ±90° and ±180°, 12 px otherwise.
- **View bracket:** two 28 px vertical lines in HUD colour at ± half the horizontal field of view, so the player can see when the enemy will be on screen.
- **Heading notch:** a small upward caret under the centre.
- **Enemy marker:** filled amber diamond, 14 × 18 px, at `x = centre + (relativeBearing / 180°) × halfWidth`. Directly behind (±180°) it sits at the end on the side the AI is moving towards; if that is unknown, the right end.
- **Range:** under the caret, `{n} m`, rounded to the nearest metre, 14 px, HUD colour.
- **No enemy (after a kill, before the next spawn):** no marker, range reads `SCANNING`.
- **Enemy warning (S1):** while the enemy is in its aim state, an amber ring (2 px, 13 px radius) is drawn round the marker. It pulses (visible 250 ms, hidden 250 ms, 2 Hz) unless reduced motion is set, in which case it is steady.
- **Phase 2 note:** with more than one enemy, each gets a marker and the range shows the nearest. Not built now.

### 6.5 Edge chevron (M8)

When `|relativeBearing|` is more than half the horizontal FOV, an amber chevron (14 × 44 px, 4 px stroke) is drawn 28 px from the left or right edge at vertical centre, pointing outwards on the shorter turning side. It disappears as soon as the enemy is inside the view.

### 6.6 Banner messages

| Trigger | Text | Colour | Duration |
|---|---|---|---|
| Enemy destroyed | `+{points}` | HUD | 1000 ms |
| Player hit, lives left | `HIT · {n} LIVES LEFT` (`HIT · 1 LIFE LEFT` for one) | Alert | Respawn delay |
| Last life lost | `DESTROYED` | Alert | 1500 ms |
| Difficulty step (S3) | none | — | The rising difficulty is felt, not announced, to keep the HUD quiet |

28 px, letter-spacing 0.1 em, centred. One banner at a time; a newer one replaces an older one.

### 6.7 Debug overlay

Architect's debug overlay (frame time, segment count) draws top centre, in HUD-dim at 12 px, so it never covers the score or the locator. It is a developer tool, so it is exempt from this spec's copy rules.

## 7. Line art (M2, M5, M6, M11, P4)

### 7.1 Conventions

- Model space in metres: **+x right, +y up, +z forward** (the way the model faces). The origin is on the ground at the model's centre.
- Yaw: positive yaw turns clockwise seen from above (from +z towards +x). A world point is `(ox + x·cos θ + z·sin θ, y, oz − x·sin θ + z·cos θ)`.
- Shells fly at 1.6 m, the barrel height. Eye height is 2.2 m.
- Edges are index pairs into `vertices`.

### 7.2 Models for `models.js`

Exported from `docs/ux/mockup.html` (rounded to 1 mm). The mockup builds them from a few helpers; these literal lists are what `models.js` should contain.

```js
  // Enemy tank, "hex hull": chamfered six-sided hull with sloped sides, wedge turret,
  // twin short barrels, whip antenna. 6 m long, 3.6 m wide, 3.4 m to the antenna tip. 33 edges.
  tank: {
    vertices: [[-1,0.3,3],[1,0.3,3],[1.8,0.3,1.6],[1.8,0.3,-2.8],[-1.8,0.3,-2.8],[-1.8,0.3,1.6],[-0.85,1.2,2.55],[0.85,1.2,2.55],[1.53,1.2,1.36],[1.53,1.2,-2.38],[-1.53,1.2,-2.38],[-1.53,1.2,1.36],[-1,1.2,-1.4],[1,1.2,-1.4],[1,1.2,0.8],[-1,1.2,0.8],[-0.6,2,-1.2],[0.6,2,-1.2],[0.6,2,0.2],[-0.6,2,0.2],[-0.3,1.6,0.5],[-0.3,1.6,3.8],[0.3,1.6,0.5],[0.3,1.6,3.8],[-0.5,2,-1],[-0.5,3.4,-1.3]],
    edges: [[0,1],[6,7],[0,6],[1,2],[7,8],[1,7],[2,3],[8,9],[2,8],[3,4],[9,10],[3,9],[4,5],[10,11],[4,10],[5,0],[11,6],[5,11],[12,13],[16,17],[12,16],[13,14],[17,18],[13,17],[14,15],[18,19],[14,18],[15,12],[19,16],[15,19],[20,21],[22,23],[24,25]],
  },
  // Hexagonal pillar, 2.5 m radius, 7 m tall. 18 edges.
  pillar: {
    vertices: [[2.165,0,1.25],[0,0,2.5],[-2.165,0,1.25],[-2.165,0,-1.25],[0,0,-2.5],[2.165,0,-1.25],[2.165,7,1.25],[0,7,2.5],[-2.165,7,1.25],[-2.165,7,-1.25],[0,7,-2.5],[2.165,7,-1.25]],
    edges: [[0,1],[6,7],[0,6],[1,2],[7,8],[1,7],[2,3],[8,9],[2,8],[3,4],[9,10],[3,9],[4,5],[10,11],[4,10],[5,0],[11,6],[5,11]],
  },
  // Long wall slab, 12 x 3 x 1 m, with two panel joints on each long face. 16 edges.
  wall: {
    vertices: [[-6,0,-0.5],[6,0,-0.5],[6,0,0.5],[-6,0,0.5],[-6,3,-0.5],[6,3,-0.5],[6,3,0.5],[-6,3,0.5],[-2,0,-0.5],[-2,3,-0.5],[2,0,-0.5],[2,3,-0.5],[-2,0,0.5],[-2,3,0.5],[2,0,0.5],[2,3,0.5]],
    edges: [[0,1],[4,5],[0,4],[1,2],[5,6],[1,5],[2,3],[6,7],[2,6],[3,0],[7,4],[3,7],[8,9],[10,11],[12,13],[14,15]],
  },
  // Tank trap ("hedgehog"): three crossed beams, about 2.9 m tall. 12 edges.
  hedgehog: {
    vertices: [[-1.796,0.003,0.175],[-1.796,0.003,-0.175],[1.796,2.877,-0.175],[1.796,2.877,0.175],[0.744,0.006,-1.646],[1.048,0.006,-1.472],[-0.744,2.874,1.646],[-1.048,2.874,1.472],[1.048,0.006,1.472],[0.744,0.006,1.646],[-1.048,2.874,-1.472],[-0.744,2.874,-1.646]],
    edges: [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[8,9],[9,10],[10,11],[11,8]],
  },
  // Shell: elongated octahedron, 0.6 m across, nose 0.6 m forward. Placed at y = 1.6. 12 edges.
  shell: {
    vertices: [[0.3,0,0],[-0.3,0,0],[0,0.3,0],[0,-0.3,0],[0,0,0.6],[0,0,-0.3]],
    edges: [[0,2],[0,3],[0,4],[0,5],[1,2],[1,3],[1,4],[1,5],[2,4],[4,3],[3,5],[5,2]],
  },
```

The player's own tank is never seen in first person, so it has no model. The lives icon (§5.2) is a plain triangle, not a tank silhouette.

### 7.3 Footprints for collision

Suggestions for the Analyst and Architect, taken from the art. The numbers belong in `config.js`.

| Model | Footprint |
|---|---|
| Tank | Circle, 2.2 m radius (the hull corners poke out slightly; that is fine for play) |
| Pillar | Circle, 2.5 m radius |
| Wall | Rotated rectangle, 12 × 1 m |
| Hedgehog | Circle, 1.9 m radius |

### 7.4 Arena, horizon and scenery

- **Horizon line (M2):** one full-width line at eye level, horizon colour.
- **Fence (UX-D3):** a post every 25 m along the arena boundary, 1.5 m tall, joined by a rail at 1.5 m. World colour. With a 200 m half-size arena that is 64 posts; scene culling keeps the drawn count low.
- **Ridge (C2, Could):** a distant line of flat-topped mesas at infinity, so it turns with the view but never gets closer. Points are `[bearing° clockwise from +z, elevation° above the horizon]`, joined in order:

```js
  ridge: [[0,0],[12,0],[14,2.2],[24,2.2],[26,0],[60,0],[63,1.4],[66,1.7],[70,1.4],[73,0],[140,0],[143,3],[150,3],[152,2],[160,2],[162,0],[220,0],[224,1.8],[236,1.8],[240,0],[300,0],[302,1.2],[318,1.2],[320,0],[345,0],[347,2.6],[352,2.6],[354,0],[360,0]],
```

  Screen position: `x = w/2 + f·tan(bearing − yaw)` for points within ±80° of the view direction, `y = h/2 − f·tan(elevation)`.

### 7.5 Enemy states in the art

| State | Drawing |
|---|---|
| Spawn grace period (M6) | Enemy drawn **dashed** (6 on, 4 off) in amber: visibly "not yet armed". Needs one extra stroke style in the renderer palette (`enemyGrace`). |
| Normal | Solid amber, 2 px |
| Destroyed | Disappears at once. With C4, its edges fly apart as fragments for 800 ms, fading out, no flashing. |

### 7.6 Originality checklist (M11, P4)

Tester can use this list for the pre-release IP check. Our design must **not** contain:

- the word "Battlezone" anywhere (title, metadata, copy, file names, comments in shipped files);
- pyramids or cubes as obstacles;
- a volcano, crescent moon or jagged mountain range on the horizon;
- a circular radar with a sweep at the top of the screen;
- a cracked-glass effect when the player is hit;
- the text messages "ENEMY IN RANGE", "ENEMY TO LEFT", "ENEMY TO RIGHT" or "ENEMY TO REAR";
- a red band across the top of the screen or a green-on-black colour scheme;
- a tank with a single long barrel and a radar dish;
- lettering copied from the original or any vector font derived from it.

## 8. Design tokens

Tokens live as CSS custom properties in `styles.css`. The canvas palette is read from the same properties once at start-up (`getComputedStyle(document.documentElement)`), so there is one source of truth (Architect §6.7).

### 8.1 Colour

Contrast measured against `--wt-color-bg` with the WCAG relative-luminance formula.

| Token | Value | Use | Contrast on bg |
|---|---|---|---|
| `--wt-color-bg` | `#070A12` | Page and canvas background | — |
| `--wt-color-overlay` | `rgba(7, 10, 18, 0.88)` | Behind HTML overlays | — |
| `--wt-color-world` | `#3FC9DB` | Obstacles, fence, player shells, primary button fill | 10.0:1 |
| `--wt-color-horizon` | `#2F9FB0` | Horizon line and ridge | 6.3:1 |
| `--wt-color-enemy` | `#FFB547` | Enemy tank, enemy shells, locator marker, chevron | 11.3:1 |
| `--wt-color-text` | `#E3F6F8` | HUD values, crosshair, overlay text | 17.7:1 |
| `--wt-color-text-dim` | `#8FB3BC` | HUD labels, hints, tape baseline, reloading crosshair | 8.8:1 |
| `--wt-color-alert` | `#FF6B81` | Hit frame, HIT and DESTROYED banners | 7.2:1 |
| `--wt-color-focus` | `#FFE066` | Keyboard focus ring | 15.2:1 |

- Button text `#070A12` on `--wt-color-world`: 10.0:1.
- Worst-case text over the overlay (overlay on top of an amber line): text 14.6:1, dim text 7.3:1, alert 6.0:1.
- Every pair passes 4.5:1 for text and 3:1 for graphics (WCAG 1.4.3, 1.4.11).

### 8.2 Canvas palette mapping

| Palette key | Token | Line width |
|---|---|---|
| `background` | `--wt-color-bg` | — |
| `horizon` | `--wt-color-horizon` | 1.5 px |
| `world` | `--wt-color-world` | 1.5 px |
| `playerShell` | `--wt-color-world` | 1.5 px |
| `enemy`, `enemyShell` | `--wt-color-enemy` | 2 px |
| `enemyGrace` | `--wt-color-enemy`, dashed 6/4 | 2 px |
| `hud` | `--wt-color-text` | 2 px |
| `hudDim` | `--wt-color-text-dim` | 2 px |
| `alert` | `--wt-color-alert` | 10 px (hit frame) |

Line widths are CSS pixels; the renderer scales the canvas by `devicePixelRatio` so lines stay crisp on high-density screens.

### 8.3 Colour and colour vision

The enemy differs from the world in hue (amber against cyan), in line weight (2 px against 1.5 px) and in shape. Luminance alone barely separates them (1.1:1), so colour is never the only cue: the locator marker, chevron and crosshair states all change shape too.

### 8.4 Type

| Token | Value | Use |
|---|---|---|
| `--wt-font` | `ui-monospace, "Cascadia Mono", Consolas, Menlo, "DejaVu Sans Mono", monospace` | Everything |
| `--wt-text-sm` | `0.875rem` (14 px) | Hints, HUD labels, range |
| `--wt-text-md` | `1rem` (16 px) | Body text in overlays |
| `--wt-text-lg` | `1.25rem` (20 px) | Buttons, HUD values |
| `--wt-text-xl` | `1.75rem` (28 px) | Overlay headings, banners |
| `--wt-text-title` | `clamp(2rem, 6vw, 3.5rem)` | Game title, final score |

HTML text uses `rem`, so browser text zoom works. Canvas text uses fixed pixel sizes from the same scale. Headings and HUD labels are upper case with 0.05–0.12 em letter-spacing; sentences are in sentence case.

### 8.5 Spacing

4 px base: `--wt-space-1` 4, `-2` 8, `-3` 12, `-4` 16, `-6` 24, `-8` 32, `-12` 48 px. HUD safe margin is 24 px from the left and right edges and 16 px from the top.

### 8.6 Motion

| Token | Value | Use | Reduced motion |
|---|---|---|---|
| `--wt-duration-hit-frame` | 400 ms | Alert frame, shown once | Unchanged (not motion) |
| `--wt-duration-shake` | 250 ms, 6 px | View shake on hit | Off |
| `--wt-duration-points` | 1000 ms | `+{points}` banner | Unchanged |
| `--wt-duration-destroyed` | 1500 ms | Before game over opens | Unchanged |
| `--wt-duration-lockout` | 1000 ms | Game-over input lockout | Unchanged |
| `--wt-duration-pulse` | 500 ms period | Enemy warning ring | Steady ring |
| `--wt-duration-attract` | 60 s per turn | Start screen camera | Still |

## 9. Accessibility (WCAG 2.2 AA)

A real-time first-person shooter cannot be played without sight, and the scope does not ask for that. What we can and must do is make every screen with words on it fully accessible, make the game playable by keyboard alone, and keep the visuals safe and legible. Each requirement has an ID for the Tester's A11Y tests.

| ID | Requirement | WCAG | How it is checked |
|---|---|---|---|
| A11Y-1 | Start, pause, game-over, keyboard-needed and error screens are HTML with a heading, real buttons and no axe serious or critical violations. | 1.3.1, 4.1.2 | axe via Playwright |
| A11Y-2 | `<html lang="en-GB">`; `<title>Wireframe Tanks</title>`. | 3.1.1, 2.4.2 | E2E |
| A11Y-3 | Everything works by keyboard: starting, playing, pausing, resuming, quitting, restarting, muting. No mouse needed. | 2.1.1 | E2E keyboard-only run |
| A11Y-4 | When an overlay opens, focus moves to its primary button. When it closes, focus returns to the game container (`tabindex="-1"`). Focus never lands on a hidden element. | 2.4.3 | E2E |
| A11Y-5 | Visible focus ring: 3 px `--wt-color-focus` outline, 3 px offset, on every button. | 2.4.7, 2.4.11 | axe + manual |
| A11Y-6 | Buttons are at least 44 × 44 CSS px. | 2.5.8 (24 px minimum; we exceed it) | E2E bounding box |
| A11Y-7 | Text contrast at least 4.5:1, HUD graphics at least 3:1 (tokens in §8.1). | 1.4.3, 1.4.11 | Token check + screenshot spot check |
| A11Y-8 | No colour-only cues: crosshair state, enemy, locator and mute state each have a shape or text difference. | 1.4.1 | Manual, greyscale screenshot |
| A11Y-9 | Nothing flashes more than 3 times per second. The hit frame shows once per hit; the warning ring pulses at 2 Hz at most. | 2.3.1 | Manual + code review |
| A11Y-10 | With `prefers-reduced-motion: reduce`: no shake, no pulsing, no start-screen camera turn. | 2.3.3 (AAA, adopted as good practice) | E2E with emulated media |
| A11Y-11 | Pause is always available (P, Esc) and automatic on tab hide or window blur. | 2.2.2 | E2E |
| A11Y-12 | Single-key controls (W, A, S, D, P, M, Space) act only while the game page has focus and never while focus is in a text field (there are none). | 2.1.4 | Code review |
| A11Y-13 | A visually hidden `role="status"` (`aria-live="polite"`) region announces state changes only: "Game started. {lives} lives.", "Enemy destroyed. Score {score}.", "Hit. {n} lives left.", "Paused.", "Game over. Final score {score}." It never updates per frame. | 4.1.3 | E2E reads the region text |
| A11Y-14 | Canvas has `role="img"` and `aria-label="Wireframe Tanks game view"`. | 1.1.1 | axe |
| A11Y-15 | Overlay text reflows without horizontal scrolling down to 320 CSS px wide and at 200% text zoom. | 1.4.4, 1.4.10 | E2E at 320 px viewport |
| A11Y-16 | Every sound (S1) has a visual equivalent: shot (shell appears), explosion (enemy disappears, `+{points}`), enemy warning (locator ring). Sound can be muted with M. | 1.4.2 | Manual |
| A11Y-17 | Error messages say what happened and what to do, in plain words, with no codes. | 3.3.1 | Manual |

## 10. Component inventory and states

| Component | Layer | States |
|---|---|---|
| Start overlay | HTML | Loading (button disabled, "Loading…"); ready (button "Start game", focused); with/without best score |
| Pause overlay | HTML | Normal; window too small (message, Resume disabled) |
| Game-over overlay | HTML | Lockout (buttons disabled, 1 s); ready (Play again focused); new best / not new best |
| Keyboard-needed overlay | HTML | One state |
| Error overlay | HTML | One state |
| `<noscript>` message | HTML | One state |
| Live region | HTML | Empty; last announcement |
| Game view | Canvas | Attract (behind start, dimmed); playing; frozen (behind pause, game over) |
| Score readout | Canvas | Value |
| Lives readout | Canvas | 1–{lives} |
| Best score | Canvas | Shown; hidden (none stored or storage error) |
| Key hints / mute indicator | Canvas | Sound on; sound off |
| Crosshair | Canvas | Ready; reloading |
| Bearing tape | Canvas | Enemy in view; enemy out of view; enemy behind; no enemy (SCANNING); warning ring |
| Edge chevron | Canvas | Hidden; left; right |
| Banner | Canvas | Hidden; points; hit; destroyed |
| Hit frame | Canvas | Hidden; shown (400 ms) |
| Enemy tank | Canvas | Grace (dashed); armed; destroyed (C4 fragments) |

Empty, loading and error states for the whole app: loading is §5.1, empty is "no enemy" on the tape and "no best score" (hidden), errors are §5.7–5.9 plus storage failure (silent, §6.2).

## 11. Copy

**Voice:** short, plain, calm. British English. No exclamation marks, no jokes in error messages, no jargon. HUD labels and headings in upper case; sentences in sentence case. Every string below is the full list; anything else needs a Designer review. Strings are set with `textContent` (SEC-19).

| ID | Where | Text |
|---|---|---|
| `title` | `<title>`, start heading | Wireframe Tanks (heading styled upper case with CSS) |
| `meta.description` | `<meta name="description">` | A free first-person wireframe tank duel that runs in your browser. |
| `start.tagline` | Start | One tank. One rival. Find it before it finds you. |
| `start.keys.*` | Start | Drive / Turn / Fire / Pause / Sound, with the keys in §5.1 |
| `start.button.loading` | Start | Loading… |
| `start.button` | Start | Start game |
| `start.hint` | Start | or press Enter |
| `start.best` | Start | Best score {score} |
| `hud.score` | HUD | SCORE |
| `hud.lives` | HUD | LIVES |
| `hud.best` | HUD | BEST {score} |
| `hud.hints.on` / `.off` | HUD | P PAUSE   M SOUND ON / P PAUSE   M SOUND OFF |
| `hud.range` | HUD | {n} m |
| `hud.scanning` | HUD | SCANNING |
| `banner.points` | HUD | +{points} |
| `banner.hit` | HUD | HIT · {n} LIVES LEFT / HIT · 1 LIFE LEFT |
| `banner.destroyed` | HUD | DESTROYED |
| `pause.heading` | Pause | PAUSED |
| `pause.resume` | Pause | Resume |
| `pause.quit` | Pause | Quit to title |
| `pause.hint` | Pause | Press P or Esc to resume |
| `pause.small` | Pause | Make the window larger to keep playing. |
| `over.heading` | Game over | GAME OVER |
| `over.best` | Game over | New best score |
| `over.again` | Game over | Play again |
| `over.title` | Game over | Title screen |
| `over.hint` | Game over | or press Enter |
| `kbd.heading` | Keyboard needed | Keyboard needed |
| `kbd.body` | Keyboard needed | Wireframe Tanks is played with a keyboard on a screen at least 640 × 400 pixels. Touch controls are not available yet. |
| `kbd.button` | Keyboard needed | Play anyway |
| `error.heading` | Error | Something went wrong |
| `error.body` | Error | The game stopped unexpectedly. Reload the page to play again. |
| `error.button` | Error | Reload |
| `noscript` | `<noscript>` | Wireframe Tanks needs JavaScript. Turn it on and reload the page. |
| `live.*` | Live region | See A11Y-13 |

## 12. Audio cues (S1, S2, C3)

Sound design is the Developer's, synthesised by hand (ADR 0006). The UX rules:

| Event | Sound | Visual pair |
|---|---|---|
| Player fires | Short low thump | Shell leaves the centre; crosshair goes to reloading |
| Enemy fires | Higher, thinner thump, panned towards the enemy's bearing | Enemy shell visible if in view |
| Enemy enters aim state (warning) | Two short rising blips, at most once per aim | Ring on the locator marker |
| Enemy spawns | One soft ping | Marker appears on the tape |
| Enemy destroyed | Noise burst falling in pitch | Enemy disappears, `+{points}` |
| Player hit | Low crunch | Alert frame, banner |
| Engine (C3) | Quiet hum, pitch follows speed | — |

All sounds start only after the first key press or click (research §6). Master volume stays moderate; nothing is louder than the explosion.

## 13. Dependencies on other lanes

| For | Item |
|---|---|
| Analyst | Numbers for `{lives}`, `{points}`, the respawn delay, the spawn grace period and the arena size (the fence and mockup assume a 200 m half-size). Fire on press or hold: the UX works with either. Arena: bounded (UX-D3). |
| Architect | ADR 0005 can move to Accepted (UX-D1). Add `enemyGrace` (dashed) and per-key line widths to the palette (§8.2). Vertical FOV 40° in `config.js` (UX-D6). Read tokens from CSS at start-up (§8). The live region and the "window too small" pause are small additions to `screens.js` and `main.js`. |
| Tester | A11Y-1 to A11Y-17 for the A11Y tests; the originality checklist in §7.6 for the M11 check. |
| Product | Review against the brief and sign off. |

## 14. Traceability to the product brief

| Brief ID | Spec sections |
|---|---|
| M1 Start screen | §5.1, §11 |
| M2 Wireframe arena, horizon | §7.2, §7.4 |
| M3 Movement controls | §4.1, J5 |
| M4 Fire, one shell | §6.3 |
| M5 Obstacles | §7.2, §7.3 |
| M6 Enemy, grace period | §7.2, §7.5 |
| M7 Hits, new enemy | §6.4 (SCANNING), §6.6, §7.5 |
| M8 Enemy locator | UX-D2, §6.4, §6.5 |
| M9 Score, lives, game over, restart | §5.2, §5.6, §6.1, UX-D7 |
| M10 Same speed at any refresh rate | No UX change (Architect ADR 0003) |
| M11 Original name and art | UX-D4, UX-D5, §7.6, §11 |
| M12 No network calls | System font only (UX-D4); no images, fonts or audio files |
| S1 Sound effects | §12, A11Y-16 |
| S2 Mute | §4.1, §5.2 hints, §11 |
| S3 Rising difficulty | §6.6 (not announced) |
| S4 Pause, auto-pause | §4, §5.5, A11Y-11 |
| S5 Hit feedback | §5.3, §8.6, A11Y-9 |
| C1 Best score | §5.1, §5.6, §6.2 |
| C2 Horizon scenery | §7.4 ridge |
| C3 Engine sound | §12 |
| C4 Explosion fragments | §7.5 |
