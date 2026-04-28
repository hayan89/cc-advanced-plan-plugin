# plan-review

Claude Code plugin that automatically reviews plans against project directives and codebase structure.

## What it does

When you write or edit a plan file (`~/.claude/plans/*.md`), this plugin:

1. **Detects** the plan file change via a PostToolUse hook
2. **Dispatches** Phase 1~5 each as an independent leaf in parallel (5 leaves total). Team mode is used when available; otherwise falls back to 5 parallel subagents.
3. **Reviews** the plan against 5 axes:
   - Directive compliance (CLAUDE.md, AGENTS.md, rules)
   - Project structure alignment (file paths, naming, tech stack)
   - Completeness & critical gaps (missing steps, tests, verification)
   - Risk assessment (data integrity, breaking changes, performance, compatibility)
   - Security assessment (auth/authz, input validation, secrets, data exposure, OWASP patterns)
4. **Empirical delegation (Phase 6):** invokes `debug-verify` from the main session to verify data-dependent assumptions in the plan.
5. **Aggregates** results and scores (max 130, lower is better)
6. **Requests user approval** for fixes via AskUserQuestion (single-candidate gate or multi-candidate selection)

## Dispatch Strategy

Single unified strategy — no complexity routing.

| Mode | When | Agents |
|------|------|--------|
| Team mode | TeamCreate available | 5 members (`reviewer-phase-1` ~ `reviewer-phase-5`) |
| Subagent 5x parallel | TeamCreate unavailable / fails | 5 parallel `Agent` calls |

Phase 6 (Empirical Delegation) is always executed in the main session, never delegated to a subagent or team member.

## Debounce

- Max 2 automatic reviews per session
- Stops if last review score ≤ 24 (plan is good enough)
- Manual invocation (`/plan-review`) bypasses debounce limits

## Installation

### Local installation

```bash
cp -r plan-review/ ~/.claude/plugins/plan-review/
```

### Manual invocation

```
/plan-review
```

## Plugin structure

```
plan-review/
├── .claude-plugin/
│   └── plugin.json
├── hooks/
│   ├── hooks.json
│   └── detect-plan-write.mjs
├── skills/
│   └── plan-review/
│       ├── SKILL.md
│       ├── aggregation.md
│       └── phases/
│           ├── common-context.md
│           ├── phase-1-directive.md
│           ├── phase-2-structure.md
│           ├── phase-3-completeness.md
│           ├── phase-4-risk.md
│           └── phase-5-security.md
├── README.md
└── LICENSE
```

## License

MIT
