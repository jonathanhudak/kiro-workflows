# Post-Merge Hook

After a branch is merged, run the compound agent to extract learnings from the full workflow.

## Trigger

Run after `git merge` or PR merge.

## Actions

1. Switch to compound agent
2. Review the full diff and commit history
3. Extract learnings and append to `steering/learnings.md`
4. Check if any steering files need updates based on new patterns
