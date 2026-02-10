# Hook: post-review

## Trigger

```yaml
event: agent-complete
when: after
agent: reviewer
```

## Agent

```yaml
agent: compound
timeout: 180
```

## Action

```yaml
description: Extract patterns from reviewer feedback and update steering if needed
steps:
  - action: invoke-agent
    agent: compound
    input: |
      The reviewer agent just completed a code review. Analyze the review
      output for recurring patterns. If any issue appears 3+ times across
      reviews, add it to steering/tech.md as a convention. Log the review
      summary to steering/learnings.md.
  - action: conditional-update
    condition: recurring-pattern-count >= 3
    files:
      - .kiro/steering/tech.md
  - action: append-log
    file: .kiro/steering/learnings.md
    content: Review summary from latest run
```

## Context

This hook closes the feedback loop between code review and project conventions.
When the reviewer catches the same issue repeatedly, it becomes a steering rule
so future development avoids it entirely.
