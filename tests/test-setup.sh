#!/usr/bin/env bash
# test-setup.sh — Tests for setup.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
SETUP="$REPO_DIR/setup.sh"
PASS=0
FAIL=0

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }

cleanup() {
  [[ -n "${TMPDIR_TEST:-}" ]] && rm -rf "$TMPDIR_TEST"
}
trap cleanup EXIT

TMPDIR_TEST="$(mktemp -d)"

echo "=== Testing setup.sh ==="

# Test 1: --help shows usage
echo ""
echo "--- --help flag ---"
OUTPUT="$("$SETUP" --help 2>&1)" || true
if echo "$OUTPUT" | grep -q "Usage:"; then
  pass "--help shows usage"
else
  fail "--help shows usage"
fi

# Test 2: setup.sh is executable
echo ""
echo "--- Executable ---"
if [[ -x "$SETUP" ]]; then
  pass "setup.sh is executable"
else
  fail "setup.sh is executable"
fi

# Test 3: Copy mode — copies .kiro/ to target
echo ""
echo "--- Copy mode ---"
TARGET1="$TMPDIR_TEST/copy-test"
mkdir -p "$TARGET1"
OUTPUT="$("$SETUP" --force "$TARGET1" 2>&1)" || true
if echo "$OUTPUT" | grep -q "Done!"; then
  pass "Copy mode runs successfully"
else
  fail "Copy mode runs successfully"
  echo "    Output: $OUTPUT"
fi
if [[ -d "$TARGET1/.kiro/agents" ]]; then
  pass "Copy mode creates .kiro/agents/"
else
  fail "Copy mode creates .kiro/agents/"
fi
if [[ -d "$TARGET1/.kiro/steering" ]]; then
  pass "Copy mode creates .kiro/steering/"
else
  fail "Copy mode creates .kiro/steering/"
fi
if [[ -d "$TARGET1/.kiro/hooks" ]]; then
  pass "Copy mode creates .kiro/hooks/"
else
  fail "Copy mode creates .kiro/hooks/"
fi
if [[ -d "$TARGET1/.kiro/settings" ]]; then
  pass "Copy mode creates .kiro/settings/"
else
  fail "Copy mode creates .kiro/settings/"
fi
if [[ -f "$TARGET1/.kiro/agents/developer.json" && ! -L "$TARGET1/.kiro/agents/developer.json" ]]; then
  pass "Copied files are regular files (not symlinks)"
else
  fail "Copied files are regular files (not symlinks)"
fi

# Test 4: Symlink mode
echo ""
echo "--- Symlink mode ---"
TARGET2="$TMPDIR_TEST/symlink-test"
mkdir -p "$TARGET2"
OUTPUT="$("$SETUP" --symlink --force "$TARGET2" 2>&1)" || true
if echo "$OUTPUT" | grep -q "Done!"; then
  pass "Symlink mode runs successfully"
else
  fail "Symlink mode runs successfully"
fi
if [[ -L "$TARGET2/.kiro" ]]; then
  pass "Symlink mode creates symlink"
else
  fail "Symlink mode creates symlink"
fi
if [[ -d "$TARGET2/.kiro/agents" ]]; then
  pass "Symlink points to valid directory"
else
  fail "Symlink points to valid directory"
fi

# Test 5: --force overwrites existing
echo ""
echo "--- Force overwrite ---"
TARGET3="$TMPDIR_TEST/force-test"
mkdir -p "$TARGET3/.kiro"
echo "old" > "$TARGET3/.kiro/marker.txt"
OUTPUT="$("$SETUP" --force "$TARGET3" 2>&1)" || true
if [[ ! -f "$TARGET3/.kiro/marker.txt" ]]; then
  pass "--force removes old .kiro/ and replaces it"
else
  fail "--force removes old .kiro/ and replaces it"
fi

# Test 6: Invalid target directory
echo ""
echo "--- Error handling ---"
OUTPUT="$("$SETUP" /nonexistent/path 2>&1)" || true
if echo "$OUTPUT" | grep -q "ERROR"; then
  pass "Errors on nonexistent target directory"
else
  fail "Errors on nonexistent target directory"
fi

# Test 7: Unknown option
OUTPUT="$("$SETUP" --badopt 2>&1)" || true
if echo "$OUTPUT" | grep -q "ERROR"; then
  pass "Errors on unknown option"
else
  fail "Errors on unknown option"
fi

# Test 8: Kiro-cli detection
echo ""
echo "--- Detection ---"
OUTPUT="$("$SETUP" --force "$TARGET1" 2>&1)" || true
if echo "$OUTPUT" | grep -qE "(kiro-cli found|kiro found|WARNING.*not installed)"; then
  pass "Detects kiro-cli presence or warns"
else
  fail "Detects kiro-cli presence or warns"
fi

# Test 9: Validates agents after copy
if echo "$OUTPUT" | grep -qE "(agent.*valid|Validating)"; then
  pass "Runs agent validation after copy"
else
  fail "Runs agent validation after copy"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
