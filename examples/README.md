# Examples

Sample workflow runs showing expected input/output for each agent at every step.

## Available Examples

### [feature-dev-workflow](./feature-dev-workflow/)

A complete **Feature Development** workflow run for adding a user settings page to a Next.js application. This example walks through all 6 agents in order:

1. **Planner** → Produces requirements.md, design.md, tasks.md
2. **Developer** → Implements the feature, writes code
3. **Verifier** → Checks acceptance criteria, decides pass/fail
4. **Tester** → Writes comprehensive tests
5. **Reviewer** → Reviews code for correctness, security, performance
6. **Compound** → Extracts reusable learnings

## How to Follow Along

1. Read `00-task-description.md` — the original feature request
2. Follow each numbered file in order (01 through 06)
3. Each file shows the output that agent would produce
4. Notice how outputs are consistent across steps — the developer implements what the planner specified, the verifier checks what was planned, etc.

## Using These as Templates

When running your own workflows, you can reference these examples to understand:

- What format each agent expects for output
- How much detail to include in task descriptions
- How agents reference each other's work
- What a passing vs. failing verification looks like
