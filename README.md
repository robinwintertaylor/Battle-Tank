# Wireframe Tanks

A browser-based, first-person 3D wireframe tank game: drive around an arena and shoot AI tanks.

MVP scope: single-player, desktop keyboard controls, static site with no backend. See [docs/IDEA_BRIEF.md](docs/IDEA_BRIEF.md).

## Status

Build. Plain JavaScript modules on a 2D canvas, with no build step ([ARCHITECTURE.md](docs/ARCHITECTURE.md)).

## Develop

Needs Node.js 22 or later.

```sh
npm ci                        # install scripts are off (.npmrc)
npm run check                 # lint, typecheck, unit tests with coverage, size gate
npx playwright install        # once, for the end-to-end tests
npm run test:e2e              # Playwright in Chromium, Firefox and WebKit
npm run serve                 # play at http://127.0.0.1:8080/Battle-Tank/
npm run hooks                 # optional: run `npm run check` before every push
```

Only `site/` is published. CI and the GitHub mirror are described in [DEPLOY_RUNBOOK.md](docs/DEPLOY_RUNBOOK.md).

## Documents

Stage artifacts live in `docs/` and are versioned with the code.

| Document | Stage | Owner |
|---|---|---|
| [IDEA_BRIEF.md](docs/IDEA_BRIEF.md) | Intake | Manager |
| [RESEARCH_BRIEF.md](docs/RESEARCH_BRIEF.md) | Discovery | Researcher |
| [PRODUCT_BRIEF.md](docs/PRODUCT_BRIEF.md) | Discovery | Product |

## Clone

```sh
git clone https://romisoch.communities.buzz.xyz/git/f252120da9fb96be4f38d651e50a55ec32aef1dbbedb3affe9890828da8e819d/wireframe-tanks
```

Access needs a Buzz identity that is a member of the project's home channel.

## Licence

[MIT](LICENSE).
