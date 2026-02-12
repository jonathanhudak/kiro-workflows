#!/usr/bin/env bash
# Tests for US-010: workflow-runner.sh progress tracking
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNNER="${REPO_DIR}/workflow-runner.sh"
PASS=0
FAIL=0

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1 — $2"; FAIL=$((FAIL + 1)); }

# ── Setup temp dir to avoid polluting repo ──────────────────────────────────
TMPDIR_TEST=$(mktemp -d)
trap 'rm -rf "$TMPDIR_TEST"' EXIT

# Create a minimal .kiro dir for testing
setup_test_env() {
  rm -rf "$TMPDIR_TEST/project"
  mkdir -p "$TMPDIR_TEST/project/.kiro/agents"
  # Copy agent JSONs so the runner doesn't complain
  cp "$REPO_DIR/.kiro/agents/"*.json "$TMPDIR_TEST/project/.kiro/agents/" 2>/dev/null || true
  # Copy the runner into the temp project
  cp "$RUNNER" "$TMPDIR_TEST/project/workflow-runner.sh"
  chmod +x "$TMPDIR_TEST/project/workflow-runner.sh"
}

echo "── Progress Tracking Tests ──"

# Test 1: --status flag exists in help
output=$(bash "$RUNNER" --help 2>&1)
if echo "$output" | grep -q -- '--status'; then
  pass "--status flag documented in help"
else
  fail "--status flag documented in help" "not found in help output"
fi

# Test 2: --status without progress file shows no-progress message
setup_test_env
output=$(cd "$TMPDIR_TEST/project" && bash workflow-runner.sh --status 2>&1) || true
if echo "$output" | grep -qi 'no progress\|no workflow'; then
  pass "--status with no progress.md shows appropriate message"
else
  fail "--status with no progress.md shows appropriate message" "got: $output"
fi

# Test 3: init_progress creates progress.md with correct structure
setup_test_env
# Source just the functions we need by running a workflow with immediate quit
(cd "$TMPDIR_TEST/project" && echo "1" | bash workflow-runner.sh --from 1 2>&1 <<< $'1\nq') || true
PROGRESS="$TMPDIR_TEST/project/.kiro/progress.md"
if [ -f "$PROGRESS" ]; then
  pass "progress.md is created when starting a workflow"
else
  fail "progress.md is created when starting a workflow" "file not found"
fi

# Test 4: progress.md contains workflow type
if [ -f "$PROGRESS" ] && grep -q '^\*\*Workflow:\*\*' "$PROGRESS"; then
  pass "progress.md includes workflow type"
else
  fail "progress.md includes workflow type" "Workflow field not found"
fi

# Test 5: progress.md contains start timestamp
if [ -f "$PROGRESS" ] && grep -q '^\*\*Started:\*\*.*T.*Z' "$PROGRESS"; then
  pass "progress.md includes start timestamp (ISO format)"
else
  fail "progress.md includes start timestamp (ISO format)" "Started field not found"
fi

# Test 6: progress.md contains Status field
if [ -f "$PROGRESS" ] && grep -q '^\*\*Status:\*\*' "$PROGRESS"; then
  pass "progress.md includes Status field"
else
  fail "progress.md includes Status field" "not found"
fi

# Test 7: All steps start as pending
if [ -f "$PROGRESS" ]; then
  pending_count=$(grep -c '— pending' "$PROGRESS" || true)
  if [ "$pending_count" -ge 1 ]; then
    pass "Steps initialized as pending"
  else
    fail "Steps initialized as pending" "no pending steps found"
  fi
else
  fail "Steps initialized as pending" "progress.md not found"
fi

# Test 8: progress.md has Total Steps
if [ -f "$PROGRESS" ] && grep -q '^\*\*Total Steps:\*\*' "$PROGRESS"; then
  pass "progress.md includes Total Steps"
else
  fail "progress.md includes Total Steps" "not found"
fi

# Test 9: Completing a step marks it done
setup_test_env
# Select workflow 1, press enter to complete step 1, then quit
(cd "$TMPDIR_TEST/project" && bash workflow-runner.sh 2>&1 <<< $'1\n\nq') || true
PROGRESS="$TMPDIR_TEST/project/.kiro/progress.md"
if [ -f "$PROGRESS" ] && grep -q '— done' "$PROGRESS"; then
  pass "Completed step is marked as done"
else
  fail "Completed step is marked as done" "no done status found"
fi

# Test 10: Done step has timestamp
if [ -f "$PROGRESS" ] && grep '— done' "$PROGRESS" | grep -q 'T.*Z'; then
  pass "Done step includes timestamp"
else
  fail "Done step includes timestamp" "no timestamp on done step"
fi

# Test 11: Skipping a step marks it skipped
setup_test_env
# Select workflow 1, skip step 1, then quit
(cd "$TMPDIR_TEST/project" && bash workflow-runner.sh 2>&1 <<< $'1\ns\nq') || true
PROGRESS="$TMPDIR_TEST/project/.kiro/progress.md"
if [ -f "$PROGRESS" ] && grep -q '— skipped' "$PROGRESS"; then
  pass "Skipped step is marked as skipped"
else
  fail "Skipped step is marked as skipped" "no skipped status found"
fi

# Test 12: In-progress state transitions to done
setup_test_env
# Complete first two steps then quit
(cd "$TMPDIR_TEST/project" && bash workflow-runner.sh 2>&1 <<< $'1\n\n\nq') || true
PROGRESS="$TMPDIR_TEST/project/.kiro/progress.md"
if [ -f "$PROGRESS" ]; then
  # Should have no in-progress remaining (all should be done or pending)
  in_progress_count=$(grep -c '— in-progress' "$PROGRESS" || true)
  done_count=$(grep -c '— done' "$PROGRESS" || true)
  if [ "$done_count" -ge 2 ] && [ "$in_progress_count" -eq 0 ]; then
    pass "Steps transition: in-progress → done (no lingering in-progress)"
  else
    fail "Steps transition: in-progress → done" "done=$done_count, in-progress=$in_progress_count"
  fi
else
  fail "Steps transition: in-progress → done" "progress.md not found"
fi

# Test 13: Completing all steps marks workflow as done
setup_test_env
# Select workflow 1 (6 steps), complete all
(cd "$TMPDIR_TEST/project" && bash workflow-runner.sh 2>&1 <<< $'1\n\n\n\n\n\n') || true
PROGRESS="$TMPDIR_TEST/project/.kiro/progress.md"
if [ -f "$PROGRESS" ] && grep -q '^\*\*Status:\*\* done' "$PROGRESS"; then
  pass "Completing all steps marks workflow status as done"
else
  fail "Completing all steps marks workflow status as done" "status not 'done'"
fi

# Test 14: Completed workflow has end timestamp
if [ -f "$PROGRESS" ] && grep -q '^\*\*Completed:\*\*.*T.*Z' "$PROGRESS"; then
  pass "Completed workflow has end timestamp"
else
  fail "Completed workflow has end timestamp" "Completed field not found"
fi

# Test 15: --status reads existing progress.md
setup_test_env
# First create progress by starting and quitting
(cd "$TMPDIR_TEST/project" && bash workflow-runner.sh 2>&1 <<< $'1\n\nq') || true
# Now check --status
output=$(cd "$TMPDIR_TEST/project" && bash workflow-runner.sh --status 2>&1) || true
if echo "$output" | grep -q 'Feature Development\|Workflow:'; then
  pass "--status shows workflow info from existing progress.md"
else
  fail "--status shows workflow info from existing progress.md" "got: $output"
fi

# Test 16: --status shows step counts
if echo "$output" | grep -qi 'complete\|step\|done'; then
  pass "--status shows completion info"
else
  fail "--status shows completion info" "no completion info in output"
fi

# Test 17: Progress summary shown during workflow execution
setup_test_env
output=$(cd "$TMPDIR_TEST/project" && bash workflow-runner.sh 2>&1 <<< $'1\nq') || true
if echo "$output" | grep -qi 'progress\|pending\|step'; then
  pass "Progress summary shown during workflow execution"
else
  fail "Progress summary shown during workflow execution" "no progress summary visible"
fi

echo ""
echo "── Results: ${PASS} passed, ${FAIL} failed ──"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
