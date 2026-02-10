#!/usr/bin/env bash
# Tests for US-004: Enhanced reviewer, verifier, and compound agent prompts
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
AGENTS_DIR="$SCRIPT_DIR/.kiro/agents"

passed=0
failed=0

assert() {
  local desc="$1" result="$2"
  if [ "$result" = "true" ]; then
    echo "✅ PASS: $desc"
    passed=$((passed + 1))
  else
    echo "❌ FAIL: $desc"
    failed=$((failed + 1))
  fi
}

# All 3 files must be valid JSON
for f in reviewer.json verifier.json compound.json; do
  if jq empty "$AGENTS_DIR/$f" 2>/dev/null; then
    assert "$f is valid JSON" "true"
  else
    assert "$f is valid JSON" "false"
  fi
done

# reviewer.json: structured output with severity levels
reviewer_prompt=$(jq -r .prompt "$AGENTS_DIR/reviewer.json")
assert "reviewer has blocking severity (🔴)" "$(echo "$reviewer_prompt" | grep -q '🔴' && echo true || echo false)"
assert "reviewer has suggestion severity (🟢)" "$(echo "$reviewer_prompt" | grep -q '🟢' && echo true || echo false)"
assert "reviewer has APPROVE/REQUEST_CHANGES decision" "$(echo "$reviewer_prompt" | grep -q 'REQUEST_CHANGES' && echo true || echo false)"
assert "reviewer references steering files" "$(jq '.resources | length > 0' "$AGENTS_DIR/reviewer.json")"

# verifier.json: approve/reject with STATUS output
verifier_prompt=$(jq -r .prompt "$AGENTS_DIR/verifier.json")
assert "verifier has STATUS: done" "$(echo "$verifier_prompt" | grep -q 'STATUS: done' && echo true || echo false)"
assert "verifier has STATUS: retry" "$(echo "$verifier_prompt" | grep -q 'STATUS: retry' && echo true || echo false)"
assert "verifier has decision criteria section" "$(echo "$verifier_prompt" | grep -q 'Decision Framework' && echo true || echo false)"
assert "verifier has ISSUES output" "$(echo "$verifier_prompt" | grep -q 'ISSUES:' && echo true || echo false)"

# compound.json: learning file format with frontmatter
compound_prompt=$(jq -r .prompt "$AGENTS_DIR/compound.json")
assert "compound has YAML frontmatter format" "$(echo "$compound_prompt" | grep -q 'frontmatter' && echo true || echo false)"
assert "compound outputs to docs/learnings/" "$(echo "$compound_prompt" | grep -q 'docs/learnings/' && echo true || echo false)"
assert "compound has category field" "$(echo "$compound_prompt" | grep -q 'category:' && echo true || echo false)"
assert "compound has tags field" "$(echo "$compound_prompt" | grep -q 'tags:' && echo true || echo false)"

# All agents have required fields
for f in reviewer.json verifier.json compound.json; do
  for field in name description prompt tools allowedTools resources; do
    has=$(jq "has(\"$field\")" "$AGENTS_DIR/$f")
    assert "$f has $field" "$has"
  done
done

echo ""
echo "Results: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
