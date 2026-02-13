#!/bin/bash
# Tests for US-013: README.md contains all required sections
set -euo pipefail
PASS=0; FAIL=0
check() {
  if eval "$2" >/dev/null 2>&1; then ((PASS++)); echo "✓ $1"
  else ((FAIL++)); echo "✗ $1"; fi
}
README="$(dirname "$0")/../README.md"

check "README exists" "test -f '$README'"
check "Has setup.sh usage section" "grep -q '### \`setup.sh\`' '$README'"
check "Has setup.sh examples" "grep -q '\./setup.sh /path/to' '$README'"
check "Has --symlink flag" "grep -q '\-\-symlink' '$README'"
check "Has --force flag" "grep -q '\-\-force' '$README'"
check "Has workflow-runner.sh usage section" "grep -q '### \`workflow-runner.sh\`' '$README'"
check "Has --run flag" "grep -q '\-\-run' '$README'"
check "Has --from flag" "grep -q '\-\-from' '$README'"
check "Has --status flag" "grep -q '\-\-status' '$README'"
check "Has --list flag" "grep -q '\-\-list' '$README'"
check "Quick Start uses setup.sh" "grep -A20 'Quick Start' '$README' | grep -q 'setup.sh'"
check "Links to examples/" "grep -q '\[examples/\]' '$README'"
check "Links to CONTRIBUTING.md" "grep -q '\[CONTRIBUTING.md\]' '$README'"
check "Agent table has planner" "grep -q 'planner.*Feature planner' '$README'"
check "Agent table has developer" "grep -q 'developer.*Implementation agent' '$README'"
check "Agent table has compound" "grep -q 'compound.*Learnings extractor' '$README'"
check "Has progress tracking section" "grep -q 'progress.md' '$README'"
check "Has Hooks section" "grep -q '## Hooks' '$README'"
check "Has MCP section" "grep -q '## MCP Configuration' '$README'"
check "No broken markdown links" "! grep -P '\[.*\]\(\s*\)' '$README'"

echo ""
echo "Results: $PASS passed, $FAIL failed out of $((PASS+FAIL))"
test "$FAIL" -eq 0
