# Harness Plugin Guide

Shared defaults: `/home/hyunseung/AGENTS.md`.

- This repository owns `plan-review/`, `debug-verify/`, and `data-grounding/`. Use their README, skills, hooks, and plugin manifests as the contract.
- Keep metadata, versions, triggers, debounce, budgets, and documented behavior consistent. Review hooks must not grant permission to mutate user resources.
- Preserve unrelated changes; avoid hardcoded environments, secrets, or fixture-specific outcomes.
- Syntax-check changed hooks with `node --check` and parse changed JSON manifests. Documentation-only work needs path checks and `git diff --check`.
- Use task branches and PRs into `main`.
