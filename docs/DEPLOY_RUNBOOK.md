# Wireframe Tanks — deploy runbook

**Owner:** Engineer. **Status:** Release-ready. The mirror and CI sections apply now; turning on the deploy (section 4) waits for Robin's deploy gate.

## 1. Shape

- **Source of truth:** the Buzz relay repo (`origin`). Work lands there by reviewed PR (SEC-12).
- **GitHub mirror:** `github.com/robinwintertaylor/Battle-Tank`, public. Pages will serve it at `robinwintertaylor.github.io/Battle-Tank/`; `scripts/serve.js` uses the same `/Battle-Tank/` path locally, and every URL in `site/` is relative. The game is still called Wireframe Tanks on screen. It only receives one-way pushes from `scripts/mirror.js`. Nobody pushes to it by hand.
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

**Getting CI on a PR:** after `buzz pr open`, the Engineer mirrors the PR branch. CI results show on that commit at `github.com/robinwintertaylor/Battle-Tank/actions`. Until the mirror is live, PRs carry local evidence (`npm run check` and `npm run test:e2e`).

**GitHub is write-only for the mirror.** No agent opens, merges, closes or comments on PRs on GitHub, and nobody pushes to it except `scripts/mirror.js` run by the Engineer. PRs, reviews and merges happen only on the relay. Every agent shares Robin's GitHub account, so GitHub settings can't tell agents apart: this rule is what keeps it a mirror. `protect-main` blocks force pushes but not PR merges. A PR-required rule would also block the mirror's own fast-forward pushes, so we don't add one.

**If GitHub `main` gets ahead of the relay** (for example, a PR merged on GitHub, as happened with PR #1 on 2026-10-02): `mirror.js` will refuse to push `main` until they match. Don't reset GitHub `main`; `protect-main` rejects it anyway. Once the change is approved on the relay, fast-forward relay `main` to the GitHub commit (`git fetch <github-url> main` then `git merge --ff-only FETCH_HEAD` and push to `origin`), and put any review fixes in a follow-up PR on top.

**First push (SEC-14):** scan the full history with `gitleaks git --redact .` and post the result in the project channel before running the script for the first time.

**Token rotation:** before the token expires, generate a new one with the same scope, overwrite the file, and revoke the old one.

## 4. Deploy (off until Robin's deploy gate)

Turning it on, with Robin's explicit go-ahead in the thread:

1. Robin reviews `docs/` for anything he would not want public (SEC-16).
2. Settings → Pages: set Source to **GitHub Actions** and turn on **Enforce HTTPS** (SEC-23).
3. Settings → Environments → `github-pages`: deployment branches set to `main` only (SEC-9), and add Robin as a **required reviewer**, so nothing deploys without his approval. This is Security's condition for the mirror token having Workflows write (SEC-13 as amended).
4. Settings → Variables → Actions: add `PAGES_DEPLOY_ENABLED` = `true`.
5. Actions → Deploy to GitHub Pages → Run workflow on `main`. The job refuses to run unless CI succeeded on that exact commit.

## 5. Dry run, smoke tests

The game is a folder of static files, so there is no database, no server and no migration. The only deploy is "publish `site/`". Pages is off, so the dry run rehearses everything up to the publish step without touching GitHub settings.

### Dry run (done 2026-10-04, non-production, local)

Mirrors what `deploy-pages.yml` does: package `site/` as the artifact, unpack it as the Pages host would, serve it under `/Battle-Tank/`, and smoke it.

```sh
npm ci && npm run check                      # the gates CI runs
tar -cf artifact.tar -C site .               # what upload-pages-artifact packs
mkdir pkg && tar -xf artifact.tar -C pkg     # what the Pages host unpacks
# serve pkg/ under /Battle-Tank/ (scripts/serve.js with its root set to pkg), then:
node scripts/smoke.js http://127.0.0.1:8080/Battle-Tank/
```

Result on `main` at `731bb9b`: `npm run check` passes, `site/` is 121.3 KB of 500 KB, and the smoke test fetched all 25 assets with no failures. As a negative control, deleting `src/core/sim.js` from the unpacked copy made the smoke test fail with a 404 for that file.

**Not covered by the dry run:** the Actions deploy job itself (`configure-pages`, `deploy-pages`, the required-reviewer approval and the CI-on-this-commit check). Those can only run once Pages is on, so the first real deploy is the proof. It is low risk: the job only publishes a static folder, and it needs Robin's approval.

### Smoke tests

`npm run smoke -- <base-url>` (default `http://127.0.0.1:8080/Battle-Tank/`) checks, for any served copy of the site:

- The home page returns 200 as `text/html`, has the title Wireframe Tanks and a CSP meta tag, never mentions the forbidden name (NFR-10) and loads nothing from another origin.
- Every script, module import and stylesheet it reaches returns 200 with the right content type.
- A missing file returns 404.

After a live deploy, also do this by hand once in a real browser:

1. Open `https://robinwintertaylor.github.io/Battle-Tank/`. Enter starts a game; W/S/A/D move the tank; Space fires; P pauses; M mutes.
2. The browser console shows no errors and no blocked requests.
3. Plain HTTP redirects to HTTPS (SEC-23).

The full Playwright suite already ran against the same files in CI on Chromium, Firefox and WebKit. Firefox audio-resume is not covered in CI (no audio device on the runner); covered on Chromium and manually, so check sound on Firefox in step 1.

## 6. Rollback

Nothing is stored server-side, so a rollback is a redeploy of an earlier version.

1. **Bad release, fix quickly:** on the relay, revert the bad commit with a reviewed PR, mirror it, wait for CI to pass on the new `main` commit, then run Deploy to GitHub Pages again. The deploy job refuses any commit without a green CI run, so the revert has to pass CI first.
2. **Take the site down now:** Settings → Pages → Unpublish site (or set the variable `PAGES_DEPLOY_ENABLED` to `false` to stop further deploys; this does not unpublish what is live). Re-publish by running the deploy workflow.
3. **Bad mirror push:** `protect-main` blocks force pushes to GitHub `main`, so fix forward with a revert commit on the relay and mirror it.
4. **Leaked secret:** revoke and rotate the mirror token first (section 3), then deal with the history.

Rollback is complete when the smoke test passes against the live URL and the revert commit is the Pages deployment shown under Settings → Pages.

## 7. Monitoring

The site is static and collects nothing (no analytics, no storage beyond the best score in the player's own browser), so there is no server logging or metrics to run. What we watch:

| What | How | Who |
|---|---|---|
| Site is up and correct | `npm run smoke -- https://robinwintertaylor.github.io/Battle-Tank/` after every deploy, and now and then | Engineer |
| CI and deploy failures | GitHub emails Robin on failed workflow runs; the Actions tab shows every run | Robin, Engineer |
| Vulnerable dependencies | Dependabot alerts and updates (SEC-15), plus `npm audit` in CI | Engineer |
| Leaked secrets | Secret Protection and push protection (SEC-5), plus gitleaks over the full history in CI | Engineer |
| Mirror token expiry | The token expires after 90 days. Rotate it before then (section 3). | Robin |
| Hosting status | githubstatus.com if the site is unreachable | Engineer |

Health check: there is no health endpoint. The smoke test is the health check.

## 8. Contacts and open items

- Pages is not enabled and nothing has been deployed. Section 4 waits for Robin's go-ahead.
- Known limitation for the release report: Firefox audio-resume is not covered in CI (no audio device on the runner); covered on Chromium and manually.
