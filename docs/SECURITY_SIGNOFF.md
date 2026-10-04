---
title: "Wireframe Tanks — security sign-off"
tags: [wireframe-tanks, release, security]
status: active
created: 2026-10-04
---

# Wireframe Tanks — security sign-off

**Author:** Security. **Date:** 2026-10-04. **Against:** `main` at `731bb9b` (relay `origin/main` and GitHub mirror `main` are the same commit) plus `tester/t2-suite` at `208cf88` (3 commits ahead of `main`). **Basis:** `docs/THREAT_MODEL.md` section 4.

## Verdict

**Sign-off: conditional.** The code and CI controls are all in place and verified. The release can go to Robin's deploy gate. These Robin-owned items must be done at or before the gate; none is a code defect:

1. **SEC-10** (2FA): Robin confirms it. I cannot verify it.
2. **SEC-23** (Enforce HTTPS) and the `github-pages` environment (deployment branch `main`, Robin as required reviewer): not set yet, because Pages is untouched by design. They are runbook section 4 steps 2 and 3.
3. **SEC-5** (Dependabot): security updates are currently **disabled** on the GitHub repo. Turn them on (runbook section 2). Version updates come from `.github/dependabot.yml`, which is in the repo.
4. **SEC-16**: Robin reads `docs/` before publishing (see R6).
5. **`tester/t2-suite` must be merged to `main` before the deploy.** It is the branch that adds the build-output tests (BUILD-01 to BUILD-04) and the e2e CSP checks I rely on for SEC-1 and SEC-17 below. It changes no shipped code: `git diff 731bb9b 208cf88 -- site scripts` is empty, and the only config changes are a `test:build` CI step and script and a stricter e2e lint rule.

No Must is failing. No finding blocks release.

## How I checked

| Check | Where | Result |
|---|---|---|
| `npm run check` (lint, typecheck, 281 unit tests, `test:build` 8 tests, size) | worktree at `208cf88` | Pass. Coverage 100% lines on `core/`. `site/` is 121.3 KB. |
| `npm audit --omit=dev` and `npm audit --audit-level=high` | `208cf88` (same `package-lock.json` as `main`) | 0 vulnerabilities |
| `gitleaks git --redact` over full history | `208cf88`, gitleaks 8.30.1 | 52 commits, no leaks |
| GitHub CI runs | GitHub mirror | `main@731bb9b` success; `tester/t2-suite@208cf88` success (the two earlier runs on that branch failed and were fixed by `d58b88b` and `208cf88`) |
| Source grep of `site/` for `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `location.search/hash`, `http(s)://` | `main` | No hits, apart from the CSP meta tag itself |
| GitHub repo settings via read-only API | `robinwintertaylor/Battle-Tank` | See SEC-5, SEC-9, SEC-11, SEC-15 below |

I did not run the Playwright suite locally. I rely on the green GitHub CI run at `208cf88` for Chromium, Firefox and WebKit, where E2E-08 is skipped on Firefox in CI only because the runner has no audio device (`208cf88`).

## Each Must, confirmed

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| SEC-1 | Zero runtime dependencies; no CDN, font or third-party script | **Met** | `package.json` has only `devDependencies`. `site/` holds only our own files. `test/build/site.test.js` BUILD-01 (artifact is runtime files only) and BUILD-02 (no URL to another origin, no audio/font/image files) pass on `208cf88`. On `main` alone this rests on the source grep and a manual read of `site/index.html`. |
| SEC-2 | Dev dependencies minimal and justified | **Met** | Six dev dependencies: `@axe-core/playwright`, `@eslint/js`, `@playwright/test`, `@types/node`, `eslint`, `typescript`. All are listed in `ARCHITECTURE.md` section 8. No dependency was added since design. |
| SEC-3 | Lockfile committed, `npm ci`, exact versions | **Met** | `package-lock.json` committed. `.npmrc` has `save-exact=true`. Every `package.json` version is exact. CI uses `npm ci --ignore-scripts`. |
| SEC-5 | Dependabot for npm and Actions; `npm audit` gates | **Met in code, setting pending** | `.github/dependabot.yml` covers `npm` and `github-actions`, weekly, grouped. `ci.yml` gates on `npm audit --audit-level=high --omit=dev`, plus a critical gate on dev dependencies and a report-only full audit. **GitHub-side:** `dependabot_security_updates` is `disabled`. Condition 3 above. |
| SEC-6 | Every Action pinned to a 40-character SHA | **Met** | Every `uses:` line in `ci.yml` and `deploy-pages.yml` (`checkout`, `setup-node`, `upload-artifact`, `configure-pages`, `upload-pages-artifact`, `deploy-pages`) is a full SHA with a version comment. The gitleaks binary is downloaded with a pinned version and a SHA-256 check. |
| SEC-7 | `permissions: contents: read` at top; deploy job alone gets `pages: write` and `id-token: write` | **Met** | Top-level `contents: read` in both files. Only the `deploy` job has `pages: write` and `id-token: write`. The `build` job adds `actions: read` only, to read CI run status. |
| SEC-8 | Official Pages OIDC flow; no stored deploy secret | **Met** | `configure-pages`, `upload-pages-artifact`, `deploy-pages`. GitHub reports 0 repository secrets. |
| SEC-9 | Deploy only from `main` via a `main`-only environment; no `pull_request_target` | **Met in code, environment pending** | `deploy-pages.yml` is `workflow_dispatch` only, requires `github.ref == 'refs/heads/main'`, requires `PAGES_DEPLOY_ENABLED == 'true'` (not set), and refuses to run unless CI succeeded on that exact commit. No `pull_request_target` anywhere. Repo workflow permissions are `read`, and Actions cannot approve PRs. **Pending:** the `github-pages` environment does not exist yet, so the `main`-only branch rule and the Robin-as-reviewer gate are not in force. They are runbook section 4 step 3. |
| SEC-11 | Ruleset on `main` blocks force push and deletion | **Met** | Ruleset `protect-main`, `active`, on the default branch, rules `deletion` and `non_fast_forward`, no bypass actors. |
| SEC-12 | Relay is the source of truth; mirror is one-way | **Met** | GitHub `main` is `731bb9b`, identical to relay `origin/main`. `scripts/mirror.js` pushes only `refs/remotes/origin/*` and never force-pushes `main`. One lapse is on record: PR #1 was merged on GitHub on 2026-10-02. It was reconciled and the runbook now says what to do (section 3). See R5. |
| SEC-13 | Mirror credential: fine-grained, one repo, expiring, held outside the repo | **Met by design; token not inspected** | `mirror.js` reads the token from `~/.config/wireframe-tanks/github-mirror-token` (outside the repo, never printed). The runbook specifies one repo, 90-day expiry and a file ACL. As amended: the token has Workflows write, so the Pages environment must have Robin as required reviewer (condition 2). I did not read the token and cannot see its scope. Robin or the Engineer confirms scope and expiry. |
| SEC-14 | Secret scan of full history before first public push | **Met** | The GitHub repo was created on 2026-10-01 and is public. `mirror.js` runs `gitleaks` on each ref before every push. I re-ran the scan today: 52 commits, no leaks. |
| SEC-15 | Secret scan in CI; GitHub secret scanning and push protection on | **Met** | `ci.yml` job `secret-scan` scans full history (`fetch-depth: 0`, `--exit-code 1`). GitHub reports `secret_scanning: enabled` and `secret_scanning_push_protection: enabled`. |
| SEC-17 | CSP meta tag first in `<head>`, with the SEC-17 policy | **Met** | `site/index.html` has the CSP as the first child of `<head>` and carries exactly the SEC-17 policy (`connect-src 'none'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`). Unit-level: BUILD-03 on `208cf88`. Browser-level: `scaffold-smoke.spec.js` asserts it is first, and `__cspViolations` is asserted empty in `d5-playable`, `t2-controls` and `t2-play` specs. |
| SEC-18 | No inline script, handler or `style` attribute | **Met** | Read `site/index.html`: one `<script type="module" src>`, one stylesheet link, no `on*=`, no `style=`. BUILD-02 on `208cf88` asserts it. |
| SEC-19 | No eval or HTML sinks; lint enforces | **Met** | `eslint.config.js` sets `no-eval`, `no-implied-eval`, `no-new-func`, and restricts `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` and `writeln`, plus all network globals and dynamic `import()`. Lint passes in CI. Source grep found no sinks. |
| SEC-23 | Enforce HTTPS | **Pending at the deploy gate** | Pages is not enabled yet (the Pages API returns 404), as intended. Runbook section 4 step 2. GitHub Pages `*.github.io` serves HTTPS and the setting is one click. Condition 2. |

Must items not in the table are Robin's: **SEC-10** (2FA) cannot be verified by me and stays open (condition 1).

### Shoulds

| ID | Status | Evidence |
|---|---|---|
| SEC-4 | Met | `.npmrc` has `ignore-scripts=true`. CI uses `npm ci --ignore-scripts`, and Playwright browsers are a separate explicit step. |
| SEC-16 | Open, Robin's call | See R6. |
| SEC-20 | Met | `<meta name="referrer" content="no-referrer">` is set. The code never reads `location.search` or `location.hash`. The test hook is a `window` object set by Playwright and not a URL parameter (ADR 0008, `test-hook.js` accepts only a plain object). |
| SEC-21 | Met | Key is `wireframe-tanks:best-score` (`core/best-score.js`). Unit test `SEC-21`. |
| SEC-22 | Met | Parsed with `^[0-9]{1,8}$` and a 10,000,000 cap. Every storage call is in `try/catch`, including reaching `localStorage`. Unit tests cover bad values and throwing storage. |

## Residual risks

Updated from the threat model's R1 to R4. Severity is for a free, no-backend hobby game.

| # | Risk | Severity | Note |
|---|---|---|---|
| R1 | Supply-chain compromise of a dev tool before advisories catch it | **Medium** | Unchanged. Mitigated by zero runtime dependencies, exact versions, `--ignore-scripts`, SHA-pinned Actions and a clean audit today. Dependabot security updates are not yet on (condition 3). |
| R5 | Every agent shares Robin's GitHub account, so GitHub cannot tell agents apart, and `protect-main` blocks force pushes but not merges. A PR merged on GitHub (PR #1, 2026-10-02) bypassed relay review once. | **Medium to low** | The control is procedural: "GitHub is write-only for the mirror" (runbook section 3). Detection is built in, because `mirror.js` refuses to push when GitHub is ahead. A PR-required rule would break the mirror's own push, so it is not added. The sensitive step is the deploy: the `github-pages` environment reviewer rule (condition 2) puts Robin between any GitHub-side change and publication. |
| R6 | `docs/` goes public with local paths (`C:\Users\Robin\...`, in more than ten files, mostly `TEST_STRATEGY.md` and `REQUIREMENTS.md`), Buzz and Cortex IDs, and the trademark analysis. Commit author emails are `<pubkey>@romisoch.communities.buzz.xyz`. | **Low** | None of this is a secret and the repo is already public with this content. History is permanent. Robin accepts it at the gate (SEC-16). The site artifact itself carries none of it (BUILD-01 "no local path in any shipped file" passes). |
| R7 | Mirror token with Workflows write could, if stolen, push a workflow to GitHub | **Low** with the environment reviewer rule, **Medium** without it | Contained by the 90-day expiry, the file ACL, and Robin as required reviewer on `github-pages`. Without that reviewer rule, a pushed workflow could deploy. This is why condition 2 matters. |
| R8 | Playwright and Chromium/Firefox/WebKit are downloaded at CI time and are not covered by `npm ci`'s lockfile integrity | **Low** | Dev-time only. Nothing from them enters `site/`. |
| R2 | Game can be framed (no `frame-ancestors` on Pages) | **Low** | Accepted, unchanged. |
| R3 | Shared `<user>.github.io` origin | **Low** | Accepted, unchanged. Namespaced and validated storage. |
| R4 | Players can edit their own best score | **Low** | Accepted, unchanged. |

T7, T11 and T12 stay accepted as in the threat model.

## Re-sign-off triggers

Any of these voids this sign-off until I re-review: a runtime dependency; a relaxed CSP; a new workflow or a change to `deploy-pages.yml`; a custom domain; any request to a third party; a change to the mirror credential. Phase 2 work (multiplayer, leaderboard, accounts, adverts) needs a new threat model first (`THREAT_MODEL.md` section 7).
