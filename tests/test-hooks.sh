#!/usr/bin/env bash
# Tests for hook format validation
set -euo pipefail

PASS=0
FAIL=0
HOOKS_DIR=".kiro/hooks"

pass() { PASS=$((PASS + 1)); echo "  PASS: $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $1"; }

echo "=== Hook Format Tests ==="

# Test 1: hooks directory exists
[ -d "$HOOKS_DIR" ] && pass "hooks directory exists" || fail "hooks directory exists"

# Test 2: post-merge.md exists
[ -f "$HOOKS_DIR/post-merge.md" ] && pass "post-merge.md exists" || fail "post-merge.md exists"

# Test 3: post-review.md exists
[ -f "$HOOKS_DIR/post-review.md" ] && pass "post-review.md exists" || fail "post-review.md exists"

# Test 4: pre-commit.md exists
[ -f "$HOOKS_DIR/pre-commit.md" ] && pass "pre-commit.md exists" || fail "pre-commit.md exists"

# Test 5-7: All hooks have required sections
for hook in post-merge.md post-review.md pre-commit.md; do
  has_all=true
  for section in "## Trigger" "## Agent" "## Action" "## Context"; do
    if ! grep -q "^$section" "$HOOKS_DIR/$hook"; then
      has_all=false
    fi
  done
  $has_all && pass "$hook has all required sections" || fail "$hook has all required sections"
done

# Test 8: post-merge triggers on git-merge
grep -q "event: git-merge" "$HOOKS_DIR/post-merge.md" && pass "post-merge triggers on git-merge" || fail "post-merge triggers on git-merge"

# Test 9: post-review triggers on agent-complete
grep -q "event: agent-complete" "$HOOKS_DIR/post-review.md" && pass "post-review triggers on agent-complete" || fail "post-review triggers on agent-complete"

# Test 10: pre-commit triggers on git-commit
grep -q "event: git-commit" "$HOOKS_DIR/pre-commit.md" && pass "pre-commit triggers on git-commit" || fail "pre-commit triggers on git-commit"

# Test 11: post-merge references compound agent
grep -q "agent: compound" "$HOOKS_DIR/post-merge.md" && pass "post-merge references compound agent" || fail "post-merge references compound agent"

# Test 12: post-review references compound agent
grep -q "agent: compound" "$HOOKS_DIR/post-review.md" && pass "post-review references compound agent" || fail "post-review references compound agent"

# Test 13: pre-commit references validate-agents.sh
grep -q "validate-agents.sh" "$HOOKS_DIR/pre-commit.md" && pass "pre-commit references validate-agents.sh" || fail "pre-commit references validate-agents.sh"

# Test 14: All hooks have timeout
for hook in post-merge.md post-review.md pre-commit.md; do
  grep -q "timeout:" "$HOOKS_DIR/$hook" && pass "$hook has timeout" || fail "$hook has timeout"
done

# Test 17: validate-hooks.sh passes
if bash tests/validate-hooks.sh >/dev/null 2>&1; then
  pass "validate-hooks.sh passes on all hooks"
else
  fail "validate-hooks.sh passes on all hooks"
fi

# Test 18: validate-hooks.sh catches bad format
TMPDIR=$(mktemp -d)
echo "# Bad hook\nNo sections here" > "$TMPDIR/bad.md"
if bash tests/validate-hooks.sh "$TMPDIR" >/dev/null 2>&1; then
  fail "validate-hooks.sh rejects bad format"
else
  pass "validate-hooks.sh rejects bad format"
fi
rm -rf "$TMPDIR"

# Test 19: Consistent format - all hooks start with "# Hook:"
all_start=true
for hook in "$HOOKS_DIR"/*.md; do
  if ! head -1 "$hook" | grep -q "^# Hook:"; then
    all_start=false
  fi
done
$all_start && pass "all hooks start with '# Hook:' header" || fail "all hooks start with '# Hook:' header"

echo ""
echo "Results: $PASS passed, $FAIL failed out of $((PASS + FAIL)) tests"
[ "$FAIL" -eq 0 ] || exit 1
