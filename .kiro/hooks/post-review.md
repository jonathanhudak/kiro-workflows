# Post-Review Hook

After a code review is completed, extract patterns from reviewer feedback and update steering files if conventions need clarification.

## Trigger

Run after the reviewer agent completes.

## Actions

1. Check if reviewer flagged recurring issues
2. If a pattern appears 3+ times across reviews, add it to `steering/tech.md`
3. Log the review summary to `steering/learnings.md`
