# Kiro Workflows

Multi-agent development workflows for [Kiro CLI](https://kiro.dev/cli/), inspired by [antfarm](https://github.com/snarktank/antfarm).

Structured spec-driven pipelines for feature development, bug fixes, and security audits — using Kiro's custom agents, steering files, and hooks.

### Built on the Ralph Loop

<img src="https://raw.githubusercontent.com/snarktank/ralph/main/ralph.webp" alt="Ralph" width="100">

Each agent runs in a fresh session with clean context. Memory persists through git history and progress files — the same autonomous loop pattern from [Ralph](https://github.com/snarktank/ralph), scaled to multi-agent workflows with Kiro CLI.

## Quick Start

```bash
# Install Kiro CLI
curl -fsSL https://cli.kiro.dev/install | bash

# Clone into your project
git clone https://github.com/jonathanhudak/kiro-workflows.git
cp -r kiro-workflows/.kiro /path/to/your/project/.kiro

# Or install globally
cp -r kiro-workflows/.kiro ~/.kiro
```

## What's Included

### Agents (`.kiro/agents/`)

| Agent | Role | Workflow |
|-------|------|----------|
| `planner` | Break down features into specs & tasks | feature-dev |
| `developer` | Implement code from task specs | feature-dev, bug-fix |
| `reviewer` | Review code for quality, patterns, security | all |
| `verifier` | Run tests, verify acceptance criteria | all |
| `tester` | Write and run test suites | feature-dev, security-audit |
| `triager` | Classify and prioritize bugs | bug-fix |
| `investigator` | Root-cause analysis | bug-fix |
| `scanner` | Security vulnerability scanning | security-audit |
| `fixer` | Apply security fixes | security-audit |
| `compound` | Extract learnings from completed work | all |

### Steering Files (`.kiro/steering/`)

- `structure.md` — Codebase architecture and conventions
- `tech.md` — Tech stack, patterns, dependencies
- `product.md` — Business context and requirements
- `workflows.md` — How multi-agent workflows operate
- `learnings.md` — Accumulated insights from past runs (auto-updated by compound agent)

### Hooks (`.kiro/hooks/`)

- `post-review.md` — After code review, extract patterns
- `post-merge.md` — After merge, run compound learnings extraction

## Workflows

### Feature Development

```
planner → developer → verifier → tester → reviewer → compound
```

1. **Planner** creates spec (requirements → design → tasks)
2. **Developer** implements each task
3. **Verifier** checks acceptance criteria
4. **Tester** writes/runs test suite
5. **Reviewer** reviews the diff
6. **Compound** extracts learnings → updates `steering/learnings.md`

### Bug Fix

```
triager → investigator → developer → verifier → reviewer → compound
```

1. **Triager** classifies severity, identifies affected area
2. **Investigator** performs root-cause analysis
3. **Developer** implements fix
4. **Verifier** confirms fix + no regressions
5. **Reviewer** reviews the change
6. **Compound** extracts learnings

### Security Audit

```
scanner → triager → fixer → verifier → tester → reviewer → compound
```

1. **Scanner** identifies vulnerabilities
2. **Triager** prioritizes by severity/exploitability
3. **Fixer** applies remediation
4. **Verifier** confirms fixes
5. **Tester** runs security test suite
6. **Reviewer** reviews all changes
7. **Compound** extracts learnings

## Usage

### The Ralph Loop (autonomous)

```bash
# 1. Plan — create prd.json from a feature description
kiro-cli --agent planner "Plan: Add user authentication with OAuth2"
# Save the stories output as prd.json (see prd.json.example for format)

# 2. Run the Ralph loop — autonomous implementation with verification
./ralph.sh 10  # max 10 iterations

# Ralph will:
#   - Pick the next incomplete story from prd.json
#   - Spawn a fresh developer agent to implement it
#   - Spawn a verifier agent to check acceptance criteria
#   - If FAIL: retry with feedback (up to 3 retries)
#   - If PASS: mark story done, move to next
#   - After all stories: run compound agent for learnings
```

### Manual agent switching

```bash
# Switch to a specific agent
kiro-cli /agent planner
kiro-cli /agent reviewer

# Or run with a specific agent
kiro-cli --agent planner "Plan the user authentication feature"
kiro-cli --agent developer "Implement task 1 from the auth spec"
kiro-cli --agent reviewer "Review the changes in this branch"
kiro-cli --agent compound "Extract learnings from the auth feature work"
```

### Environment variables

```bash
KIRO_AGENT=developer          # Default implementation agent
KIRO_VERIFY_AGENT=verifier    # Verification agent
KIRO_COMPOUND_AGENT=compound  # Learnings extraction agent
KIRO_VERIFY_EACH=true         # Verify after each story (recommended)
```

## Learnings System

The **compound agent** runs after each workflow and:

1. Reviews git history and work artifacts
2. Extracts patterns, mistakes, and insights
3. Appends to `.kiro/steering/learnings.md` with metadata
4. Future agent sessions automatically load relevant learnings via steering

This creates a feedback loop — each workflow makes the next one better.

## Customization

### Add project-specific steering

Create additional files in `.kiro/steering/`:
```markdown
<!-- .kiro/steering/api-standards.md -->
# API Standards
- Use REST with JSON:API spec
- All endpoints require authentication
- Rate limiting: 100 req/min per user
```

### Add MCP servers

Configure in `.kiro/settings/mcp.json`:
```json
{
  "mcpServers": {
    "database": {
      "command": "mcp-server-postgres",
      "args": ["--host", "localhost"]
    }
  }
}
```

## Differences from Antfarm

| Feature | Antfarm (OpenClaw) | Kiro Workflows |
|---------|-------------------|----------------|
| Orchestration | SQLite + cron polling | Manual agent switching / specs |
| Agent communication | Shared DB state | Steering files + specs |
| Autonomy | Fully autonomous | Human-in-the-loop |
| Learnings | `docs/learnings/*.md` | `steering/learnings.md` |
| Auth | N/A (local) | AWS IAM Identity Center |
| Platform | OpenClaw daemon | Kiro CLI (terminal) |

## License

MIT
