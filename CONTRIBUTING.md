# Contributing to Kiro Workflows

This guide covers how to add new agents, create workflows, write steering files, and configure hooks.

## Agent JSON Schema

Agent files live in `.kiro/agents/` and follow this schema:

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique agent identifier (lowercase, no spaces) |
| `description` | string | One-line summary of the agent's role |
| `prompt` | string | The full system prompt — this is the agent's brain |
| `tools` | string[] | Tools the agent can use |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `allowedTools` | string[] | Subset of `tools` — restricts which tools are actually enabled. If omitted, all `tools` are allowed |
| `resources` | string[] | File URIs the agent should read for context (e.g., `"file://.kiro/steering/tech.md"`) |

### Available Tools

- `fs_read` — Read files
- `fs_write` — Write/create files
- `fs_list` — List directory contents
- `execute_bash` — Run shell commands
- `use_mcp` — Use MCP servers defined in `.kiro/settings/mcp.json`

### Example Agent File

```json
{
  "name": "my-agent",
  "description": "Does a specific thing well",
  "prompt": "You are a specialist in X. Your job is to...\n\n## Process\n1. First...\n2. Then...\n\n## Output\nProduce...",
  "tools": ["fs_read", "fs_write", "execute_bash"],
  "allowedTools": ["fs_read", "fs_write", "execute_bash"],
  "resources": [
    "file://.kiro/steering/tech.md",
    "file://.kiro/steering/structure.md"
  ]
}
```

## Adding a New Agent

### Step 1: Create the Agent JSON

Create `.kiro/agents/<name>.json` with all required fields.

### Step 2: Write the Prompt

The prompt is the most important part. A good prompt:

- **States the role clearly** in the first sentence
- **Describes the process** step by step — what should the agent do first, second, third?
- **Specifies outputs** — what files or artifacts should the agent produce?
- **Sets principles** — what trade-offs should the agent make?

#### Good vs Bad Prompts

**❌ Bad: Vague and generic**
```
You are a code reviewer. Review the code and find bugs.
```

**✅ Good: Specific process with clear expectations**
```
You are a senior code reviewer specializing in TypeScript. Your job is to
review pull requests for correctness, maintainability, and adherence to
project conventions.

## Process
1. Read the diff. Understand what changed and why.
2. Check steering files for project conventions.
3. For each file changed:
   - Verify the logic is correct for all edge cases
   - Check error handling: are failures caught and reported?
   - Look for security issues: injection, auth bypass, data leaks
   - Assess naming and readability
4. Check test coverage: are new paths tested?

## Output
Produce a review.md with:
- Summary (2-3 sentences)
- Issues found (severity: critical/warning/nit)
- Suggestions (optional improvements)
- Verdict: APPROVE, REQUEST_CHANGES, or NEEDS_DISCUSSION

## Principles
- Be specific. "This could be better" is useless. Say what and how.
- Distinguish critical issues from nits. Not everything is a blocker.
- Praise good patterns — positive reinforcement matters.
```

### Step 3: Add to a Workflow

Edit `.kiro/steering/workflows.md` and add your agent to an existing workflow sequence or create a new one. Agents in a workflow execute in order, passing context through specs, files, and git history.

### Step 4: Test the Agent

1. Run `./validate-agents.sh` to check JSON validity
2. Load the agent in Kiro CLI and give it a small task
3. Check that it reads the right steering files and produces expected output

## Creating a New Workflow

Workflows are agent sequences defined in `.kiro/steering/workflows.md`.

### Step 1: Define the Purpose

What problem does this workflow solve? Feature development, bug fixing, security audit, documentation, refactoring?

### Step 2: Choose the Agent Sequence

Each agent should have a clear hand-off point. The output of one agent becomes the input context for the next.

```
agent-a → agent-b → agent-c → compound
```

**Always end with `compound`** — it extracts learnings that improve future runs.

### Step 3: Document in workflows.md

Add a new section with:
- The agent sequence
- Step-by-step instructions for running it
- What each agent expects as input and produces as output

### Step 4: Add an Example

Create `examples/<workflow-name>/` with a sample run showing:
- The initial input/request
- Each agent's output
- The final result

## Steering Files

Steering files in `.kiro/steering/` provide persistent project context that agents read on every run.

| File | Purpose |
|------|---------|
| `product.md` | Product context — what the project does, who it's for |
| `tech.md` | Tech stack, dependencies, coding conventions |
| `structure.md` | Project directory layout and key files |
| `workflows.md` | Available workflows and how to run them |
| `learnings.md` | Insights from past workflow runs (updated by compound agent) |

### Conventions

- Keep each file focused on one concern
- Use headers and bullet points — agents parse these as structured context
- Update `structure.md` when you add significant new files or directories
- Let the compound agent update `learnings.md` — don't edit it manually unless correcting errors

### Adding a New Steering File

1. Create `.kiro/steering/<name>.md`
2. Add `"file://.kiro/steering/<name>.md"` to the `resources` array of agents that need it
3. Document its purpose in this file

## Hooks

Hooks in `.kiro/hooks/` trigger automated actions on git events.

### Hook Format

```markdown
# Hook: <name>

## Trigger

\```yaml
event: <git-event>        # git-commit, git-push, git-merge
when: <timing>            # before, after
\```

## Agent

\```yaml
agent: <agent-name|none>  # Which agent to run, or "none" for script-only
timeout: <seconds>        # Max execution time
\```

## Action

\```yaml
description: <what this hook does>
steps:
  - action: <action-type>       # run-script, run-agent
    command: <shell command>     # For run-script
    fail_on_error: <boolean>    # Block the git operation on failure?
    message: "<error message>"  # Shown when hook fails
\```

## Context

<Explanation of why this hook exists and what it validates.>
```

### Adding a New Hook

1. Create `.kiro/hooks/<event>-<name>.md` following the format above
2. If it runs a script, create the script and make it executable (`chmod +x`)
3. Test the hook manually before relying on it

## Validation

Before committing, run:

```bash
./validate-agents.sh
```

This checks all agent JSON files for:
- Valid JSON syntax
- Required fields (`name`, `description`, `prompt`, `tools`)
- Valid tool names
- `allowedTools` is a subset of `tools`

## Project Structure

```
.kiro/
├── agents/          # Agent definitions (JSON)
├── hooks/           # Git hook definitions (Markdown)
├── settings/        # MCP and other settings
│   └── mcp.json
└── steering/        # Project context files (Markdown)
    ├── learnings.md
    ├── product.md
    ├── structure.md
    ├── tech.md
    └── workflows.md
examples/            # Sample workflow runs
setup.sh             # Project setup script
workflow-runner.sh   # Interactive workflow runner
```
