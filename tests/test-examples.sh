#!/usr/bin/env bash
# Tests for US-011: examples directory validation
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ✗ $1"; }

echo "Testing: examples directory"

# Directory structure
[ -d "$REPO_ROOT/examples" ] && pass "examples/ directory exists" || fail "examples/ directory exists"
[ -d "$REPO_ROOT/examples/feature-dev-workflow" ] && pass "feature-dev-workflow/ directory exists" || fail "feature-dev-workflow/ directory exists"

# Top-level README
[ -f "$REPO_ROOT/examples/README.md" ] && pass "examples/README.md exists" || fail "examples/README.md exists"

# Task description
[ -f "$REPO_ROOT/examples/feature-dev-workflow/00-task-description.md" ] && pass "00-task-description.md exists" || fail "00-task-description.md exists"

# All 6 agent outputs
echo ""
echo "Testing: agent output files"

# Planner (3 output files)
[ -f "$REPO_ROOT/examples/feature-dev-workflow/01-planner-output-requirements.md" ] && pass "planner requirements exists" || fail "planner requirements exists"
[ -f "$REPO_ROOT/examples/feature-dev-workflow/01-planner-output-design.md" ] && pass "planner design exists" || fail "planner design exists"
[ -f "$REPO_ROOT/examples/feature-dev-workflow/01-planner-output-tasks.md" ] && pass "planner tasks exists" || fail "planner tasks exists"

# Developer
[ -f "$REPO_ROOT/examples/feature-dev-workflow/02-developer-output.md" ] && pass "developer output exists" || fail "developer output exists"

# Verifier
[ -f "$REPO_ROOT/examples/feature-dev-workflow/03-verifier-output.md" ] && pass "verifier output exists" || fail "verifier output exists"

# Tester
[ -f "$REPO_ROOT/examples/feature-dev-workflow/04-tester-output.md" ] && pass "tester output exists" || fail "tester output exists"

# Reviewer
[ -f "$REPO_ROOT/examples/feature-dev-workflow/05-reviewer-output.md" ] && pass "reviewer output exists" || fail "reviewer output exists"

# Compound
[ -f "$REPO_ROOT/examples/feature-dev-workflow/06-compound-output.md" ] && pass "compound output exists" || fail "compound output exists"

# Content validation
echo ""
echo "Testing: content consistency"

# Planner output has structured sections
grep -q "## Functional Requirements" "$REPO_ROOT/examples/feature-dev-workflow/01-planner-output-requirements.md" && pass "planner has Functional Requirements section" || fail "planner has Functional Requirements section"
grep -q "## Architecture" "$REPO_ROOT/examples/feature-dev-workflow/01-planner-output-design.md" && pass "planner has Architecture section" || fail "planner has Architecture section"
grep -q "## Task Breakdown" "$REPO_ROOT/examples/feature-dev-workflow/01-planner-output-tasks.md" && pass "planner has Task Breakdown section" || fail "planner has Task Breakdown section"

# Developer references planner's tasks
grep -q "Task 1" "$REPO_ROOT/examples/feature-dev-workflow/02-developer-output.md" && pass "developer references planner tasks" || fail "developer references planner tasks"

# Verifier has STATUS line
grep -q "^STATUS: done" "$REPO_ROOT/examples/feature-dev-workflow/03-verifier-output.md" && pass "verifier has STATUS: done" || fail "verifier has STATUS: done"

# Verifier references acceptance criteria
grep -q "Acceptance Criteria" "$REPO_ROOT/examples/feature-dev-workflow/03-verifier-output.md" && pass "verifier checks acceptance criteria" || fail "verifier checks acceptance criteria"

# Tester has test counts
grep -q "Total" "$REPO_ROOT/examples/feature-dev-workflow/04-tester-output.md" && pass "tester has test summary" || fail "tester has test summary"

# Reviewer has VERDICT
grep -q "VERDICT" "$REPO_ROOT/examples/feature-dev-workflow/05-reviewer-output.md" && pass "reviewer has VERDICT" || fail "reviewer has VERDICT"

# Reviewer uses severity levels
grep -q "SHOULD_FIX" "$REPO_ROOT/examples/feature-dev-workflow/05-reviewer-output.md" && pass "reviewer uses severity levels" || fail "reviewer uses severity levels"

# Compound has YAML frontmatter
head -1 "$REPO_ROOT/examples/feature-dev-workflow/06-compound-output.md" | grep -q "^---" && pass "compound has YAML frontmatter" || fail "compound has YAML frontmatter"
grep -q "category:" "$REPO_ROOT/examples/feature-dev-workflow/06-compound-output.md" && pass "compound has category field" || fail "compound has category field"

# Cross-consistency: all files mention "settings" or "Settings"
echo ""
echo "Testing: cross-file consistency"
ALL_CONSISTENT=true
for f in "$REPO_ROOT"/examples/feature-dev-workflow/*.md; do
  if ! grep -qi "settings" "$f"; then
    fail "$(basename "$f") mentions settings topic"
    ALL_CONSISTENT=false
  fi
done
$ALL_CONSISTENT && pass "all files reference the settings feature consistently"

# README explains the example
grep -q "feature-dev-workflow" "$REPO_ROOT/examples/README.md" && pass "README references the example" || fail "README references the example"
grep -q "Planner\|planner" "$REPO_ROOT/examples/README.md" && pass "README mentions planner agent" || fail "README mentions planner agent"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
