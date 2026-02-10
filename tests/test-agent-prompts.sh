#!/usr/bin/env bash
# Tests for US-003: Verify planner and developer agent prompts are enhanced
set -euo pipefail

AGENTS_DIR="$(cd "$(dirname "$0")/.." && pwd)/.kiro/agents"
PASS=0
FAIL=0

pass() { echo "✅ PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "❌ FAIL: $1"; FAIL=$((FAIL+1)); }

# Helper: check prompt contains a string
prompt_contains() {
  local file="$1" needle="$2" label="$3"
  if jq -r '.prompt' "$AGENTS_DIR/$file" | grep -qi "$needle"; then
    pass "$label"
  else
    fail "$label"
  fi
}

# Helper: check prompt length meets minimum
prompt_min_length() {
  local file="$1" min="$2" label="$3"
  local len
  len=$(jq -r '.prompt | length' "$AGENTS_DIR/$file")
  if [ "$len" -ge "$min" ]; then
    pass "$label ($len chars >= $min)"
  else
    fail "$label ($len chars < $min)"
  fi
}

# Planner prompt tests
prompt_min_length "planner.json" 1731 "planner.json prompt is at least 3x original (577*3=1731)"
prompt_contains "planner.json" "requirements.md" "planner.json mentions requirements.md output"
prompt_contains "planner.json" "design.md" "planner.json mentions design.md output"
prompt_contains "planner.json" "tasks.md" "planner.json mentions tasks.md output"
prompt_contains "planner.json" "EARS" "planner.json includes EARS notation"
prompt_contains "planner.json" "dependency" "planner.json includes dependency ordering"
prompt_contains "planner.json" "acceptance criteria" "planner.json includes acceptance criteria guidance"

# Developer prompt tests
prompt_contains "developer.json" "progress.md" "developer.json includes progress tracking"
prompt_contains "developer.json" "test" "developer.json includes test-writing requirements"
prompt_contains "developer.json" "commit" "developer.json includes commit discipline"
prompt_contains "developer.json" "error" "developer.json includes error handling patterns"

# Both must be valid JSON
jq . "$AGENTS_DIR/planner.json" > /dev/null 2>&1 && pass "planner.json is valid JSON" || fail "planner.json is invalid JSON"
jq . "$AGENTS_DIR/developer.json" > /dev/null 2>&1 && pass "developer.json is valid JSON" || fail "developer.json is invalid JSON"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
