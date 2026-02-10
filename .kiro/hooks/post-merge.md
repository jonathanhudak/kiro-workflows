# Hook: post-merge

## Trigger

```yaml
event: git-merge
when: after
branches:
  - main
  - master
  - develop
```

## Agent

```yaml
agent: compound
timeout: 300
```

## Action

```yaml
description: Extract learnings from the completed workflow after a branch merge
steps:
  - action: invoke-agent
    agent: compound
    input: |
      A branch was just merged. Review the full diff and commit history
      for the merged branch. Extract learnings and write them to
      docs/learnings/ following your standard format.
  - action: update-steering
    description: Check if steering files need updates based on new patterns
    files:
      - .kiro/steering/learnings.md
      - .kiro/steering/tech.md
```

## Context

The compound agent will:

1. Read the git log for the merged branch
2. Review the full diff and all changed files
3. Identify technical, process, and quality learnings
4. Write a structured learning file to `docs/learnings/YYYY-MM-DD-<slug>.md`
5. Update steering files if new conventions or patterns emerged
