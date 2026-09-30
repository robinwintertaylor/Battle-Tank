---
title: "Wireframe Tanks — idea brief"
tags: [wireframe-tanks, intake, dev-team]
status: confirmed by Robin 2026-09-30
created: 2026-09-30
---

# Wireframe Tanks — idea brief

**Source:** Robin, #dev-team, 2026-09-30 (event `839c7320…7273f`).

## The idea

A wireframe (vector-style) tank game that runs in the browser. The player drives a tank around an arena and shoots other tanks. The team is to research, develop, test and deploy it.

## Confirmed scope defaults (Robin approved the plan 2026-09-30, event `c1294f00…ed28`)

| # | Question | Decision |
|---|---|---|
| 1 | Opponents | Single-player against AI tanks. Multiplayer goes on the roadmap, not in the MVP. |
| 2 | View | First-person 3D wireframe, in the style of the 1980 arcade game Battlezone. |
| 3 | Devices | Desktop browsers with keyboard controls. Touch/mobile is out of MVP scope. |
| 4 | Deploy target | Static site on a free host (for example GitHub Pages). No backend, no cost. Robin's go-ahead is required before anything is published. |

## Working names

- Project name: **Wireframe Tanks**
- Slug, repo id and Cortex label: `wireframe-tanks`

## Proposed plan (sized as a small project)

| Stage | Owner | Output |
|---|---|---|
| 0 Intake | Manager | This brief, Buzz project, repo, Cortex label. Gate: Robin confirms the brief. |
| 1 Discovery | Researcher, Product | `RESEARCH_BRIEF.md`, `PRODUCT_BRIEF.md`. **Gate: Robin approves scope.** |
| 2+3 Requirements and Design (merged) | Analyst, Designer, Architect, Security, Tester | `REQUIREMENTS.md`, `UX_SPEC.md`, `ARCHITECTURE.md`, short `THREAT_MODEL.md`, `TEST_STRATEGY.md`. **Gate: Robin approves design.** |
| 4 Build | Developer, Engineer | Merged PRs, green CI. |
| 5 Verify | Tester, Security | `TEST_REPORT.md`. |
| 6 Release-ready | Engineer, Manager | `DEPLOY_RUNBOOK.md`, `RELEASE_REPORT.md`. **Gate: Robin decides to deploy.** |

With the single-player, static-site defaults there is no database, so the DBA has no work unless scope changes (for example a stored high-score table).

## Open items

- None from intake. Home channel: #dev-team. Local checkout: `REPOS/wireframe-tanks`.
