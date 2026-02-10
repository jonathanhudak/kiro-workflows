# Kiro Workflows

Multi-agent development workflows for [Kiro CLI](https://kiro.dev/cli/), inspired by [antfarm](https://github.com/snarktank/antfarm).

One command runs the full pipeline — planning, implementation, verification, testing, review, and learnings extraction. The [Ralph loop](https://github.com/snarktank/ralph) runs under the hood.

<img src="https://raw.githubusercontent.com/snarktank/ralph/main/ralph.webp" alt="Ralph" width="80">

## Quick Start

```bash
# Install
npm install -g kiro-workflows

# Initialize agents + steering in your project
cd /your/project
kiro-workflow init

# Customize steering for your codebase
# (edit .kiro/steering/structure.md, tech.md, product.md)

# Run a workflow
kiro-workflow run feature-dev "Add user authentication with OAuth2"
```

That's it. The library handles everything: breaking the task into stories, implementing them one by one in fresh agent sessions, verifying each story against acceptance criteria, retrying with feedback on failure, and extracting learnings when done.

## How It Works

```
kiro-workflow run feature-dev "Add OAuth2"
    │
    ├── 1. Planner agent breaks task into stories
    │      (each small enough for one agent session)
    │
    ├── 2. Ralph Loop (for each story):
    │      ├── Developer agent implements (fresh session)
    │      ├── Verifier agent checks acceptance criteria
    │      ├── FAIL? → retry with feedback (up to 3x)
    │      └── PASS? → next story
    │
    ├── 3. Tester agent runs test suite
    ├── 4. Reviewer agent reviews all changes
    └── 5. Compound agent extracts learnings
           → updates .kiro/steering/learnings.md
```

Each agent runs in a **fresh session with clean context**. Memory persists only through git history and steering files — the Ralph pattern.

## Commands

```bash
kiro-workflow run <workflow> "<task>"   # Run a complete workflow
kiro-workflow init                      # Set up .kiro/ in your project
kiro-workflow list                      # Show available workflows
kiro-workflow status                    # Check recent run progress
```

### Options

```bash
--acp            # Use ACP protocol (persistent process, faster)
--max-iter <n>   # Max iterations (default: 15)
--no-verify      # Skip verification after each story
--verbose        # Detailed output
```

## Workflows

### `feature-dev`
Plan, implement, test, and review a new feature.
```
planner → developer (loop) → tester → reviewer → compound
```

### `bug-fix`
Triage, investigate, fix, and verify a bug.
```
triager → investigator → developer (loop) → reviewer → compound
```

### `security-audit`
Scan, prioritize, fix, and test security issues.
```
scanner → triager → fixer (loop) → tester → reviewer → compound
```

## Agents

10 specialized agents live in `.kiro/agents/`:

| Agent | Role |
|-------|------|
| **planner** | Breaks features into stories with acceptance criteria |
| **developer** | Implements code from specs |
| **reviewer** | Reviews for quality, patterns, security |
| **verifier** | Validates acceptance criteria pass |
| **tester** | Writes and runs test suites |
| **triager** | Classifies severity, prioritizes |
| **investigator** | Root-cause analysis |
| **scanner** | Security vulnerability detection |
| **fixer** | Security remediation |
| **compound** | Extracts learnings from completed work |

## Steering Files

Steering files in `.kiro/steering/` give agents persistent project context:

| File | Purpose |
|------|---------|
| `structure.md` | Codebase architecture and directory layout |
| `tech.md` | Tech stack, patterns, build/test commands |
| `product.md` | Business context and requirements |
| `workflows.md` | How the multi-agent pipeline operates |
| `learnings.md` | Auto-updated insights from past runs |

`kiro-workflow init` copies templates. Customize them for your project.

## The Learnings Loop

The **compound agent** runs after every workflow and:
1. Reviews git diff and commit history
2. Identifies what worked, what didn't, surprises
3. Appends to `.kiro/steering/learnings.md` with date + tags
4. Future runs load these learnings automatically

Each workflow makes the next one smarter.

## ACP Support

Kiro CLI implements the [Agent Client Protocol](https://kiro.dev/docs/cli/acp/) — JSON-RPC 2.0 over stdin/stdout. Enable ACP mode for faster agent switching:

```bash
kiro-workflow run feature-dev "Add OAuth2" --acp
```

ACP keeps a single persistent `kiro-cli acp` process running. Each story still gets a fresh session (Ralph pattern), but agent switching and session creation are faster.

## Programmatic API

```typescript
import { WorkflowOrchestrator } from "kiro-workflows";

const wf = new WorkflowOrchestrator({
  projectDir: "/path/to/project",
  maxIterations: 20,
  verifyEach: true,
  useAcp: true,
});

const result = await wf.run("feature-dev", "Add user authentication");
console.log(result.status); // "done"
console.log(result.stories); // [{id, title, status}, ...]
```

## Customization

### Add project-specific steering

```markdown
<!-- .kiro/steering/api-standards.md -->
# API Standards
- REST with JSON:API spec
- All endpoints require authentication
- Rate limiting: 100 req/min per user
```

### Configure MCP servers

```json
// .kiro/settings/mcp.json
{
  "mcpServers": {
    "database": {
      "command": "mcp-server-postgres",
      "args": ["--host", "localhost"]
    }
  }
}
```

### Add custom agents

Drop a JSON file in `.kiro/agents/`:
```json
{
  "name": "db-specialist",
  "description": "Database migration and query optimization expert",
  "prompt": "You are a database specialist...",
  "tools": ["fs_read", "fs_write", "execute_bash"],
  "resources": ["file://.kiro/steering/tech.md"]
}
```

## Compared to Antfarm

| | Antfarm (OpenClaw) | Kiro Workflows |
|---|---|---|
| **Runtime** | OpenClaw daemon + SQLite + cron | Kiro CLI (terminal) |
| **Orchestration** | Autonomous cron polling | CLI-driven with embedded Ralph loop |
| **Agent sessions** | Fresh per cron tick | Fresh per story (same pattern) |
| **Learnings** | `docs/learnings/*.md` | `.kiro/steering/learnings.md` |
| **Auth** | N/A (local) | AWS IAM Identity Center |
| **Use case** | Personal projects | Enterprise / work projects |

## Prerequisites

- [Kiro CLI](https://kiro.dev/cli/) installed (`curl -fsSL https://cli.kiro.dev/install | bash`)
- Node.js 18+
- Git
- jq (optional, for setup.sh steering generation)

## License

MIT
