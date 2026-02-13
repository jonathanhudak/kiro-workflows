---
date: 2026-02-11
workflow: feature-dev
task: "Build production-ready Kiro CLI multi-agent workflow system"
tags: [kiro, shell-scripts, multi-agent, workflow-orchestration, cli-tooling]
---

## What Went Well

- **Incremental user-story approach**: Breaking the work into US-001 through US-013 kept each commit focused and testable. The progress.txt file tracked state cleanly across agent handoffs.
- **Shell script quality**: Both setup.sh (291 lines) and workflow-runner.sh (370 lines) are substantial, executable tools — not just stubs. They include codebase analysis, steering generation, and interactive workflow guidance.
- **Agent prompt improvement**: Drawing inspiration from antfarm agent files produced more battle-tested, detailed prompts across all 10 agents.
- **Example workflow**: A complete 7-step example (task → planner → developer → verifier → tester → reviewer → compound) gives users a concrete mental model.
- **Test coverage**: 5 test files covering setup, workflow-runner, progress tracking, examples, and README validation.

## What Was Harder Than Expected

- **Shellcheck compliance** (US-008): Shell scripts at this size accumulate quoting issues, unhandled edge cases, and portability concerns. Required a dedicated fix pass.
- **Hook format conversion** (US-006): Kiro hooks have specific JSON+markdown format requirements that aren't well-documented. Validating them required trial and error.
- **Steering file generation**: Dynamically reading package.json, tsconfig, and directory structure to produce meaningful steering content (not just template stubs) required careful string handling in bash.

## Patterns & Anti-Patterns

### Patterns
- **Progress file as shared state**: A simple text file (progress.txt) works well for multi-agent coordination when each agent appends status updates. No database needed.
- **Script + docs combo**: Each major script (setup.sh, workflow-runner.sh) paired with README sections and CONTRIBUTING.md instructions makes the tool self-documenting.
- **Validate early**: The validate-agents.sh pre-commit hook catches JSON errors before they propagate.

### Anti-Patterns
- **Monolithic shell scripts**: At 300+ lines, bash becomes hard to maintain. Consider splitting into sourced modules for future work.
- **Hardcoded paths**: References to ~/Projects/antfarm/ for inspiration are development-time dependencies that shouldn't leak into the distributed tool.

## Reusable Solutions

- **Codebase analysis in bash**: The setup.sh pattern of reading package.json with node -e, detecting TypeScript via tsconfig, and scanning directory structure is reusable for any project-aware CLI tool.
- **Interactive workflow stepper**: workflow-runner.sh's pattern of selecting workflow → iterating agents → tracking progress in markdown is a generic pattern for any multi-step CLI workflow.
- **Agent JSON validation**: Simple `node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))"` one-liner for validating agent files — portable and dependency-free.
