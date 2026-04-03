# plan-review

Claude Code plugin that automatically reviews plans against project directives and codebase structure.

## What it does

When you write or edit a plan file (`~/.claude/plans/*.md`), this plugin:

1. **Detects** the plan file change via a PostToolUse hook
2. **Triggers** the `plan-review` skill automatically
3. **Reviews** the plan against 4 axes:
   - Directive compliance (CLAUDE.md, AGENTS.md, rules)
   - Project structure alignment (file paths, naming, tech stack)
   - Completeness & critical gaps (missing steps, tests, verification)
   - Risk assessment (security, data integrity, breaking changes)
4. **Scores** issues (0-100 scale, lower is better)
5. **Auto-fixes** minor issues (score contribution ≤5) and requests approval for major ones

## Debounce

- Max 2 automatic reviews per session
- Stops if last review score ≤ 20 (plan is good enough)
- Manual invocation (`/plan-review`) bypasses debounce limits

## Installation

### Local installation

```bash
# Copy plugin to Claude Code plugins directory
cp -r plan-review/ ~/.claude/plugins/plan-review/

# Register in settings.json (enabledPlugins)
# Or use: claude plugin marketplace add ~/.claude/plugins/plan-review
```

### Manual invocation

```
/plan-review
```

## Plugin structure

```
plan-review/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── hooks/
│   ├── hooks.json               # PostToolUse hook definition
│   └── detect-plan-write.mjs    # Plan file write detection script
├── skills/
│   └── plan-review/
│       ├── SKILL.md             # Review skill definition
│       └── review-prompt.md     # 4-axis review prompt template
├── README.md
└── LICENSE
```

## License

MIT
