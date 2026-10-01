# Wireframe Tanks — deploy runbook

**Owner:** Engineer. **Status:** Draft. The mirror and CI sections apply now; the deploy section waits for Robin's deploy gate.

## 1. Shape

- **Source of truth:** the Buzz relay repo (`origin`). Work lands there by reviewed PR (SEC-12).
- **GitHub mirror:** `github.com/robinwintertaylor/wireframe-tanks`, public. It only receives one-way pushes from `scripts/mirror.js`. Nobody pushes to it by hand.
- **CI:** `.github/workflows/ci.yml` runs on every push to the mirror. It covers lint, typecheck, unit tests with the 90% `core/` coverage gate, the 500 KB size gate, `npm audit`, a gitleaks scan of the full history, and Playwright in Chromium, Firefox and WebKit.
- **Deploy:** `.github/workflows/deploy-pages.yml` publishes `site/` to Pages through OIDC (ADR 0007, SEC-8). It is **off**.

## 2. Prerequisites

| Item | Where | Notes |
|---|---|---|
| Node.js 22 or later (CI uses 24) | Mirror machine | `npm ci` installs the dev tools |
| gitleaks 8.30.1 | On `PATH` of the mirror machine | `scripts/mirror.js` refuses to push without it |
| Fine-grained token | `~/.config/wireframe-tanks/github-mirror-token` (override with `WT_MIRROR_TOKEN_FILE`) | This one repository only. Contents and Workflows set to read and write, nothing else. 90-day expiry (SEC-13). Never in the repo, Buzz, Cortex or logs. |
| Token file locked to Robin's account | Run once in `cmd` after saving it: `icacls "%USERPROFILE%\.config\wireframe-tanks\github-mirror-token" /inheritance:r /grant:r "%USERNAME%:F"` | Only Robin's Windows account can read it, and he can still overwrite it to rotate (SEC-13 as amended by Security) |
| GitHub account | Robin | 2FA on, ideally with a passkey (SEC-10) |

### Repository settings (Robin, once)

- Secret Protection and push protection on. Dependabot alerts and security updates on (SEC-5, SEC-15).
- Ruleset `protect-main` on the default branch: restrict deletions and block force pushes (SEC-11).
- Actions → General: workflow permissions set to read; approval required for first-time contributors (SEC-9).
- Pages: untouched until the deploy gate.

## 3. Mirror

```sh
node scripts/mirror.js                     # relay main to GitHub main
node scripts/mirror.js engineer/some-pr    # plus PR branches, so CI runs before merge
```

The script fetches `origin` and pushes only the relay's refs, never a local branch. It scans each ref with gitleaks before pushing (SEC-14) and never force-pushes `main`. PR branches may be force-updated, because they are rebased during review.

**Getting CI on a PR:** after `buzz pr open`, the Engineer mirrors the PR branch. CI results show on that commit at `github.com/robinwintertaylor/wireframe-tanks/actions`. Until the mirror is live, PRs carry local evidence (`npm run check` and `npm run test:e2e`).

**First push (SEC-14):** scan the full history with `gitleaks git --redact .` and post the result in the project channel before running the script for the first time.

**Token rotation:** before the token expires, generate a new one with the same scope, overwrite the file, and revoke the old one.

## 4. Deploy (off until Robin's deploy gate)

Turning it on, with Robin's explicit go-ahead in the thread:

1. Robin reviews `docs/` for anything he would not want public (SEC-16).
2. Settings → Pages: set Source to **GitHub Actions** and turn on **Enforce HTTPS** (SEC-23).
3. Settings → Environments → `github-pages`: deployment branches set to `main` only (SEC-9), and add Robin as a **required reviewer**, so nothing deploys without his approval. This is Security's condition for the mirror token having Workflows write (SEC-13 as amended).
4. Settings → Variables → Actions: add `PAGES_DEPLOY_ENABLED` = `true`.
5. Actions → Deploy to GitHub Pages → Run workflow on `main`. The job refuses to run unless CI succeeded on that exact commit.

The steps for the deploy dry run, smoke tests, rollback and monitoring are written for the Release-ready stage.
