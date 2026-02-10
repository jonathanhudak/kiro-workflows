#!/usr/bin/env bash
# Tests for validate-agents.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VALIDATE="$SCRIPT_DIR/validate-agents.sh"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

passed=0
failed=0

assert_exit() {
  local desc="$1" expected="$2"
  shift 2
  if "$@" >/dev/null 2>&1; then actual=0; else actual=$?; fi
  if [ "$actual" -eq "$expected" ]; then
    echo "✅ PASS: $desc"
    passed=$((passed + 1))
  else
    echo "❌ FAIL: $desc (expected exit $expected, got $actual)"
    failed=$((failed + 1))
  fi
}

assert_output_contains() {
  local desc="$1" pattern="$2"
  shift 2
  output=$("$@" 2>&1 || true)
  if echo "$output" | grep -q "$pattern"; then
    echo "✅ PASS: $desc"
    passed=$((passed + 1))
  else
    echo "❌ FAIL: $desc (output missing '$pattern')"
    echo "   Got: $output"
    failed=$((failed + 1))
  fi
}

# Test 1: Valid agents pass
assert_exit "Valid agents directory exits 0" 0 bash "$VALIDATE" "$SCRIPT_DIR/.kiro/agents"

# Test 2: Invalid JSON detected
mkdir -p "$TMPDIR/bad-json"
echo "not json{{{" > "$TMPDIR/bad-json/broken.json"
assert_exit "Invalid JSON exits non-zero" 1 bash "$VALIDATE" "$TMPDIR/bad-json"
assert_output_contains "Invalid JSON reports filename" "broken.json" bash "$VALIDATE" "$TMPDIR/bad-json"

# Test 3: Missing required field
mkdir -p "$TMPDIR/missing-field"
cat > "$TMPDIR/missing-field/incomplete.json" <<'EOF'
{"name": "test", "description": "test"}
EOF
assert_exit "Missing fields exits non-zero" 1 bash "$VALIDATE" "$TMPDIR/missing-field"
assert_output_contains "Missing field reported" "missing required field" bash "$VALIDATE" "$TMPDIR/missing-field"

# Test 4: Invalid tool name
mkdir -p "$TMPDIR/bad-tool"
cat > "$TMPDIR/bad-tool/badtool.json" <<'EOF'
{"name":"t","description":"t","prompt":"t","tools":["invalid_tool"],"allowedTools":["invalid_tool"],"resources":[]}
EOF
assert_exit "Invalid tool exits non-zero" 1 bash "$VALIDATE" "$TMPDIR/bad-tool"
assert_output_contains "Invalid tool reported" "invalid tool" bash "$VALIDATE" "$TMPDIR/bad-tool"

# Test 5: Valid minimal agent
mkdir -p "$TMPDIR/valid"
cat > "$TMPDIR/valid/good.json" <<'EOF'
{"name":"g","description":"g","prompt":"g","tools":["fs_read"],"allowedTools":["fs_read"],"resources":[]}
EOF
assert_exit "Valid minimal agent exits 0" 0 bash "$VALIDATE" "$TMPDIR/valid"

# Test 6: Non-existent directory
assert_exit "Non-existent directory exits non-zero" 1 bash "$VALIDATE" "$TMPDIR/nope"

# Test 7: allowedTools not subset of tools
mkdir -p "$TMPDIR/subset"
cat > "$TMPDIR/subset/bad.json" <<'EOF'
{"name":"t","description":"t","prompt":"t","tools":["fs_read"],"allowedTools":["fs_read","fs_write"],"resources":[]}
EOF
assert_exit "allowedTools superset exits non-zero" 1 bash "$VALIDATE" "$TMPDIR/subset"
assert_output_contains "allowedTools superset reported" "not in tools" bash "$VALIDATE" "$TMPDIR/subset"

echo ""
echo "Results: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
