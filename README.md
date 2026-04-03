# plan-review

Claude Code plugin that automatically reviews implementation plans against project directives and codebase structure.

## Features

- **Automatic detection** — PostToolUse hook triggers review when plan files (`~/.claude/plans/*.md`) are created or edited
- **4-axis review** — Validates plans across directive compliance, project structure alignment, completeness, and risk assessment
- **Complexity-based parallel dispatch** — Automatically selects sequential, 2x/4x subagent parallel, or team mode based on plan complexity
- **Scoring system** — Issues scored 0-100 (lower is better), with auto-fix for minor issues and approval gates for major ones
- **Smart debounce** — Max 2 automatic reviews per session, skips if plan already passes

## Installation

```bash
claude plugin add --from https://github.com/hayan89/cc-advanced-plan-plugin
```

Or install manually:

```bash
cp -r plan-review/ ~/.claude/plugins/plan-review/
```

## Usage

### Automatic

Write or edit a plan file in `~/.claude/plans/` and the review triggers automatically.

### Manual

```
/plan-review
```

## How It Works

1. Hook detects plan file write/edit
2. `plan-review` skill executes 4-phase review:
   - **Phase 1:** Directive Compliance — checks against CLAUDE.md, AGENTS.md, rules
   - **Phase 2:** Project Structure — validates file paths, naming, tech stack, utility reuse
   - **Phase 3:** Completeness — finds missing steps, undefined behavior, dependency order issues
   - **Phase 4:** Risk Assessment — flags security, data integrity, and breaking change risks
3. Scores issues and decides action:
   - **PASS** (score <= 20): Plan is good
   - **NEEDS_REVISION** (21-50): Auto-fixes minor issues, requests approval for major ones
   - **MAJOR_ISSUES** (>50): Alerts user to critical problems

## Project Structure

```
.
├── plan-review/
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── hooks/
│   │   ├── hooks.json
│   │   └── detect-plan-write.mjs
│   ├── skills/
│   │   └── plan-review/
│   │       ├── SKILL.md
│   │       ├── aggregation.md
│   │       └── phases/
│   │           ├── common-context.md
│   │           ├── phase-1-directive.md
│   │           ├── phase-2-structure.md
│   │           ├── phase-3-completeness.md
│   │           └── phase-4-risk.md
│   ├── README.md
│   └── LICENSE
├── docs/
├── LICENSE
└── README.md
```

## License

MIT
