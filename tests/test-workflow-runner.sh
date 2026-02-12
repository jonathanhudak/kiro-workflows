#!/usr/bin/env bash
set -euo pipefail

# Tests for workflow-runner.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER="${SCRIPT_DIR}/../workflow-runner.sh"

PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ✗ $1"; echo "    $2"; }

echo "Testing workflow-runner.sh"
echo "========================="

# ── Existence and permissions ───────────────────────────────────────────────

echo ""
echo "Basics:"

if [ -f "$RUNNER" ]; then
  pass "workflow-runner.sh exists"
else
  fail "workflow-runner.sh exists" "File not found"
fi

if [ -x "$RUNNER" ]; then
  pass "workflow-runner.sh is executable"
else
  fail "workflow-runner.sh is executable" "Not executable"
fi

# ── Help output ─────────────────────────────────────────────────────────────

echo ""
echo "Help output:"

HELP_OUTPUT=$("$RUNNER" --help 2>&1)

if echo "$HELP_OUTPUT" | grep -q "USAGE"; then
  pass "--help shows USAGE section"
else
  fail "--help shows USAGE section" "No USAGE found"
fi

if echo "$HELP_OUTPUT" | grep -q "\-\-from"; then
  pass "--help mentions --from flag"
else
  fail "--help mentions --from flag" "No --from in help"
fi

if echo "$HELP_OUTPUT" | grep -q "\-\-run"; then
  pass "--help mentions --run flag"
else
  fail "--help mentions --run flag" "No --run in help"
fi

if echo "$HELP_OUTPUT" | grep -q "\-\-list"; then
  pass "--help mentions --list flag"
else
  fail "--help mentions --list flag" "No --list in help"
fi

if echo "$HELP_OUTPUT" | grep -q "Feature Development"; then
  pass "--help shows Feature Development workflow"
else
  fail "--help shows Feature Development workflow" "Missing workflow"
fi

if echo "$HELP_OUTPUT" | grep -q "Bug Fix"; then
  pass "--help shows Bug Fix workflow"
else
  fail "--help shows Bug Fix workflow" "Missing workflow"
fi

if echo "$HELP_OUTPUT" | grep -q "Security Audit"; then
  pass "--help shows Security Audit workflow"
else
  fail "--help shows Security Audit workflow" "Missing workflow"
fi

# ── List output ─────────────────────────────────────────────────────────────

echo ""
echo "List output:"

LIST_OUTPUT=$("$RUNNER" --list 2>&1)

if echo "$LIST_OUTPUT" | grep -q "Feature Development"; then
  pass "--list shows Feature Development"
else
  fail "--list shows Feature Development" "Missing"
fi

if echo "$LIST_OUTPUT" | grep -q "Bug Fix"; then
  pass "--list shows Bug Fix"
else
  fail "--list shows Bug Fix" "Missing"
fi

if echo "$LIST_OUTPUT" | grep -q "Security Audit"; then
  pass "--list shows Security Audit"
else
  fail "--list shows Security Audit" "Missing"
fi

# Check step ordering for Feature Development
if echo "$LIST_OUTPUT" | grep -q "planner"; then
  pass "--list shows planner agent"
else
  fail "--list shows planner agent" "Missing"
fi

if echo "$LIST_OUTPUT" | grep -q "compound"; then
  pass "--list shows compound agent (last step)"
else
  fail "--list shows compound agent (last step)" "Missing"
fi

# Check agent descriptions appear
if echo "$LIST_OUTPUT" | grep -q "Analyzes requirements"; then
  pass "--list shows agent descriptions"
else
  fail "--list shows agent descriptions" "Missing descriptions"
fi

# ── Step ordering (Feature Dev) ─────────────────────────────────────────────

echo ""
echo "Step ordering:"

# Feature dev order: planner → developer → verifier → tester → reviewer → compound
FEATURE_STEPS=$(echo "$LIST_OUTPUT" | sed -n '/Feature Development/,/Bug Fix/p')

PLANNER_LINE=$(echo "$FEATURE_STEPS" | grep -n "planner" | head -1 | cut -d: -f1)
DEVELOPER_LINE=$(echo "$FEATURE_STEPS" | grep -n "developer" | head -1 | cut -d: -f1)
COMPOUND_LINE=$(echo "$FEATURE_STEPS" | grep -n "compound" | head -1 | cut -d: -f1)

if [ -n "$PLANNER_LINE" ] && [ -n "$DEVELOPER_LINE" ] && [ "$PLANNER_LINE" -lt "$DEVELOPER_LINE" ]; then
  pass "planner comes before developer in Feature Dev"
else
  fail "planner comes before developer in Feature Dev" "Wrong order"
fi

if [ -n "$DEVELOPER_LINE" ] && [ -n "$COMPOUND_LINE" ] && [ "$DEVELOPER_LINE" -lt "$COMPOUND_LINE" ]; then
  pass "developer comes before compound in Feature Dev"
else
  fail "developer comes before compound in Feature Dev" "Wrong order"
fi

# Bug fix order: triager → investigator → developer
BUG_STEPS=$(echo "$LIST_OUTPUT" | sed -n '/Bug Fix/,/Security Audit/p')

TRIAGER_LINE=$(echo "$BUG_STEPS" | grep -n "triager" | head -1 | cut -d: -f1)
INVESTIGATOR_LINE=$(echo "$BUG_STEPS" | grep -n "investigator" | head -1 | cut -d: -f1)

if [ -n "$TRIAGER_LINE" ] && [ -n "$INVESTIGATOR_LINE" ] && [ "$TRIAGER_LINE" -lt "$INVESTIGATOR_LINE" ]; then
  pass "triager comes before investigator in Bug Fix"
else
  fail "triager comes before investigator in Bug Fix" "Wrong order"
fi

# ── Invalid input handling ──────────────────────────────────────────────────

echo ""
echo "Error handling:"

ERR_OUTPUT=$("$RUNNER" --unknown 2>&1 || true)
if echo "$ERR_OUTPUT" | grep -qi "unknown"; then
  pass "rejects unknown options"
else
  fail "rejects unknown options" "Got: $ERR_OUTPUT"
fi

ERR_OUTPUT=$("$RUNNER" --from 2>&1 || true)
if echo "$ERR_OUTPUT" | grep -qi "error\|requires"; then
  pass "--from without value shows error"
else
  fail "--from without value shows error" "Got: $ERR_OUTPUT"
fi

ERR_OUTPUT=$("$RUNNER" --from abc 2>&1 || true)
if echo "$ERR_OUTPUT" | grep -qi "error\|requires\|integer"; then
  pass "--from with non-numeric shows error"
else
  fail "--from with non-numeric shows error" "Got: $ERR_OUTPUT"
fi

# ── Workflow selection (invalid) ────────────────────────────────────────────

echo ""
echo "Workflow selection:"

ERR_OUTPUT=$(echo "9" | "$RUNNER" 2>&1 || true)
if echo "$ERR_OUTPUT" | grep -qi "invalid"; then
  pass "invalid workflow choice shows error"
else
  fail "invalid workflow choice shows error" "Got: $ERR_OUTPUT"
fi

# ── Menu output for valid selection ─────────────────────────────────────────

echo ""
echo "Interactive menu:"

MENU_OUTPUT=$(echo "1" | "$RUNNER" --from 999 2>&1 || true)

if echo "$MENU_OUTPUT" | grep -q "Feature Development"; then
  pass "shows Feature Development in menu"
else
  fail "shows Feature Development in menu" "Missing"
fi

if echo "$MENU_OUTPUT" | grep -q "Bug Fix"; then
  pass "shows Bug Fix in menu"
else
  fail "shows Bug Fix in menu" "Missing"
fi

# ── kiro-cli command format ─────────────────────────────────────────────────

echo ""
echo "Command format:"

# The list output should reference agent names that match kiro-cli --agent format
for agent in planner developer verifier tester reviewer compound triager investigator scanner fixer; do
  if [ -f "${SCRIPT_DIR}/../.kiro/agents/${agent}.json" ]; then
    pass "agent ${agent} has matching JSON file"
  else
    fail "agent ${agent} has matching JSON file" "Missing .kiro/agents/${agent}.json"
  fi
done

# ── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "========================="
TOTAL=$((PASS + FAIL))
echo "Results: ${PASS}/${TOTAL} passed"

if [ "$FAIL" -gt 0 ]; then
  echo "${FAIL} FAILED"
  exit 1
else
  echo "All tests passed!"
  exit 0
fi
