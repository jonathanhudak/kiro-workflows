#!/usr/bin/env bash
# Tests for US-004: Verify reviewer, verifier, compound agent prompt improvements
set -euo pipefail

AGENTS_DIR="$(cd "$(dirname "$0")/.." && pwd)/.kiro/agents"
passed=0
failed=0

check() {
  local desc="$1" file="$2" pattern="$3"
  if jq -r '.prompt' "$AGENTS_DIR/$file" | grep -qi "$pattern"; then
    echo "✅ PASS: $desc"
    passed=$((passed + 1))
  else
    echo "❌ FAIL: $desc (pattern '$pattern' not found in $file prompt)"
    failed=$((failed + 1))
  fi
}

# Reviewer checks
check "reviewer has BLOCKING severity" reviewer.json "BLOCKING"
check "reviewer has SHOULD_FIX severity" reviewer.json "SHOULD_FIX"
check "reviewer has SUGGESTION severity" reviewer.json "SUGGESTION"
check "reviewer has structured output with file:line" reviewer.json "file:line"
check "reviewer has VERDICT output" reviewer.json "VERDICT"
check "reviewer references steering files" reviewer.json "structure.md"

# Verifier checks
check "verifier has STATUS: done" verifier.json "STATUS: done"
check "verifier has STATUS: retry" verifier.json "STATUS: retry"
check "verifier has Decision Framework" verifier.json "Decision Framework"
check "verifier has Approve criteria" verifier.json "Approve"
check "verifier has Reject criteria" verifier.json "Reject"
check "verifier mentions not fixing code" verifier.json "NOT fix the code"

# Compound checks
check "compound has YAML frontmatter delimiters" compound.json "^---"
check "compound has date field in frontmatter" compound.json "date: YYYY"
check "compound has tags field in frontmatter" compound.json "tags:"
check "compound has category field" compound.json "category:"
check "compound outputs to docs/learnings/" compound.json "docs/learnings/"
check "compound has YYYY-MM-DD slug filename" compound.json "YYYY-MM-DD.*slug"

# All files valid JSON
for f in reviewer.json verifier.json compound.json; do
  if jq . "$AGENTS_DIR/$f" >/dev/null 2>&1; then
    echo "✅ PASS: $f is valid JSON"
    passed=$((passed + 1))
  else
    echo "❌ FAIL: $f is not valid JSON"
    failed=$((failed + 1))
  fi
done

echo ""
echo "Results: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
