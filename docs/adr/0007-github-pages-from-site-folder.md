# ADR 0007: Publish only `site/` to GitHub Pages

**Status:** Accepted by Robin at the design gate, 2026-10-01 (D-112). **Date:** 2026-10-01. **Author:** Architect.

## Context

Robin chose a public GitHub repository with GitHub Pages (D-41). The Buzz relay stays the source of truth and GitHub is a one-way mirror (SEC-12). Deploys must use GitHub's OIDC flow with no stored secret (SEC-8). The repository also holds docs, tests and scripts that players do not need.

## Options

1. **Pages "deploy from a branch", serving the repository root.** No workflow needed, but every file in the repository is served, including `docs/` and the tests, and nothing gates publishing on a test run.
2. **Pages "deploy from a branch", serving a `/docs` folder.** Clashes with our use of `docs/` for stage artifacts.
3. **GitHub Actions: test, then `upload-pages-artifact` with `site/`, then `deploy-pages`.** Only the game is served, the deploy follows a green test run, and it uses OIDC.

## Decision

Option 3. The published artifact is the committed `site/` folder, unchanged. All URLs in it are relative, because the site lives under `/wireframe-tanks/`. The Engineer owns the workflow, the mirror and `DEPLOY_RUNBOOK.md`. Creating the public repository and the first deploy both wait for Robin's go-ahead.

## Consequences

- What was tested is exactly what is served, and nothing else is.
- Deploying depends on Actions running on the mirror. Until the mirror exists, PRs on the relay carry local test evidence.
- Rollback is a revert and a redeploy, or re-running an earlier deploy job.
