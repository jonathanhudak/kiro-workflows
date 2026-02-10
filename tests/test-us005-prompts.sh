#!/usr/bin/env bash
# Tests for US-005: Improved tester, scanner, fixer, triager, investigator prompts
set -uo pipefail

AGENTS_DIR=".kiro/agents"
PASS=0
FAIL=0

check() {
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "✅ $desc"
    ((PASS++))
  else
    echo "❌ $desc"
    ((FAIL++))
  fi
}

# JSON validity
for agent in tester scanner fixer triager investigator; do
  check "$agent.json is valid JSON" jq empty "$AGENTS_DIR/$agent.json"
done

# Prompt length >= 2x original (originals were all < 1200 chars, so require >= 2400)
for agent in tester scanner fixer triager investigator; do
  len=$(jq -r '.prompt | length' "$AGENTS_DIR/$agent.json")
  check "$agent.json prompt >= 2400 chars (got $len)" test "$len" -ge 2400
done

# Each has structured output format section
for agent in tester scanner fixer triager investigator; do
  check "$agent.json has structured output format" jq -e '.prompt | test("Structured Output Format")' "$AGENTS_DIR/$agent.json"
done

# scanner.json references specific scanning tools
check "scanner references npm audit" jq -e '.prompt | test("npm audit")' "$AGENTS_DIR/scanner.json"
check "scanner references grep for secrets" jq -e '.prompt | test("grep.*AKIA|grep.*secret|Secret Detection")' "$AGENTS_DIR/scanner.json"
check "scanner references license-checker" jq -e '.prompt | test("license-checker")' "$AGENTS_DIR/scanner.json"

# tester.json has test naming conventions
check "tester has naming conventions" jq -e '.prompt | test("Naming Convention|naming convention|Test File Naming")' "$AGENTS_DIR/tester.json"
check "tester has coverage expectations" jq -e '.prompt | test("Coverage Expectation|coverage")' "$AGENTS_DIR/tester.json"
check "tester has test structure template" jq -e '.prompt | test("Test Structure Template|describe|Arrange")' "$AGENTS_DIR/tester.json"

# fixer.json has fix documentation template and regression test requirements
check "fixer has fix documentation template" jq -e '.prompt | test("Fix Documentation Template|Documentation Template")' "$AGENTS_DIR/fixer.json"
check "fixer has regression test requirements" jq -e '.prompt | test("[Rr]egression [Tt]est")' "$AGENTS_DIR/fixer.json"

# triager.json has structured triage output and escalation criteria
check "triager has escalation criteria" jq -e '.prompt | test("Escalation Criteria|escalation criteria|Escalate")' "$AGENTS_DIR/triager.json"
check "triager has priority classification table" jq -e '.prompt | test("P0|P1|P2|P3")' "$AGENTS_DIR/triager.json"

# investigator.json has git bisect and log analysis
check "investigator has git bisect guidance" jq -e '.prompt | test("git bisect")' "$AGENTS_DIR/investigator.json"
check "investigator has log analysis steps" jq -e '.prompt | test("[Ll]og [Aa]nalysis|Log Analysis|Examining logs|log")' "$AGENTS_DIR/investigator.json"
check "investigator has investigation methodology" jq -e '.prompt | test("Investigation Methodology|Methodology|Phase 1")' "$AGENTS_DIR/investigator.json"

# Required fields present
for agent in tester scanner fixer triager investigator; do
  check "$agent.json has all required fields" jq -e '.name and .description and .prompt and .tools and .allowedTools and .resources' "$AGENTS_DIR/$agent.json"
done

echo ""
echo "Results: $PASS passed, $FAIL failed out of $((PASS + FAIL)) tests"
[ "$FAIL" -eq 0 ] || exit 1
