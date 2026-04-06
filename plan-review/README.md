# plan-review

Claude Code plugin that automatically reviews plans against project directives and codebase structure.

## What it does

When you write or edit a plan file (`~/.claude/plans/*.md`), this plugin:

1. **Detects** the plan file change via a PostToolUse hook
2. **Assesses** plan complexity (line count, task count)
3. **Selects strategy** based on complexity:
   - Trivial: Sequential review (direct execution)
   - Standard: 2 parallel subagents
   - Complex: 4 parallel subagents
   - Massive: Team mode with 4 reviewers
4. **Reviews** the plan against 5 axes:
   - Directive compliance (CLAUDE.md, AGENTS.md, rules)
   - Project structure alignment (file paths, naming, tech stack)
   - Completeness & critical gaps (missing steps, tests, verification)
   - Risk assessment (data integrity, breaking changes, performance, compatibility)
   - Security assessment (auth/authz, input validation, secrets, data exposure, OWASP patterns)
5. **Aggregates** results and scores (0-120 scale, lower is better)
6. **Auto-fixes** minor issues (score ≤5) and requests approval for major ones

## Complexity Tiers

| Tier | Condition | Strategy | Agents |
|------|-----------|----------|--------|
| Massive | tasks >20 OR lines >500 | Team mode | 4 members |
| Complex | tasks >10 OR lines >200 | Subagent parallel | 4 agents |
| Trivial | tasks ≤3 AND lines ≤50 | Sequential | 0 (direct) |
| Standard | everything else | Subagent parallel | 2 agents |

Evaluated top-to-bottom, first match applies.

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
