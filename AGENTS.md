# Newworld Harness Plugin Repository Guide

## Scope And Sources Of Truth

- This repository publishes the `plan-review`, `debug-verify`, and `data-grounding` Claude Code plugins.
- Use the root and plugin `README.md` files for behavior, each plugin's `skills/*/SKILL.md` for workflow contracts, and `.claude-plugin/*.json` plus `hooks/hooks.json` for registration metadata.
- Keep marketplace versions, plugin metadata, hook commands, skill names, and documented behavior consistent across affected files.

## Working Rules

- Preserve unrelated changes and keep edits scoped to the owning plugin.
- Keep evidence collection read-only unless an owning workflow and the user explicitly authorize a mutation. Do not turn review or verification hooks into an implicit permission grant.
- Do not hardcode project paths, user data, secrets, fixture-specific outcomes, or environment-specific tool endpoints.
- Changes to hooks or skills can alter every installed session. Review trigger matching, debounce behavior, tool budgets, and failure handling before release.

## Validation

- Run `node --check` on every changed `.mjs` hook.
- Parse every changed JSON manifest with Node and compare names, versions, sources, and hook paths against files that exist in the repository.
- For documentation-only changes, verify referenced paths and commands, then run `git diff --check`.

## Model-Based Work Delegation

- When the main agent runs on the designated highest-tier model
  (currently GPT-6 Astra), reserve its work for planning, analysis,
  review, debugging/root-cause diagnosis, architecture, design,
  coordination, and final acceptance.
- Delegate all other execution work—including implementation,
  file edits, refactoring, test creation/execution, builds, and
  routine operational commands—to sub-agents using the designated
  second-tier model: currently gpt-5.6-sol with xhigh reasoning.
- Explicitly select the worker model and reasoning effort.
  Do not let workers inherit the highest-tier model by default.
- Give each worker clear scope, file ownership, acceptance criteria,
  and required verification. Provide only the context it needs.
- The main agent must review the resulting diff and verification
  evidence before declaring completion. Delegate review fixes back
  to the worker; do not duplicate the implementation.
- Reuse workers for related tasks. Parallelize only independent work.
  Workers must preserve other agents' and users' changes.
- Treat these model names as the configured role mapping, not as
  an inferred live price ranking. Do not silently substitute models.
- If delegation or the designated worker model is unavailable,
  report the limitation instead of silently doing execution work
  on the highest-tier model.
- Follow higher-priority instructions and existing authorization
  boundaries; delegation does not expand permission.
