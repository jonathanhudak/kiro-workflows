# Hook: pre-commit

## Trigger

```yaml
event: git-commit
when: before
```

## Agent

```yaml
agent: none
timeout: 30
```

## Action

```yaml
description: Validate agent JSON files before allowing a commit
steps:
  - action: run-script
    command: ./tests/validate-agents.sh
    fail_on_error: true
    message: "Agent validation failed. Fix agent JSON files before committing."
```

## Context

Prevents commits that break agent definitions. Runs `validate-agents.sh` which
checks all `.kiro/agents/*.json` files for:

- Valid JSON syntax
- Required fields (name, description, prompt, tools)
- Valid tool names
- allowedTools is a subset of tools
