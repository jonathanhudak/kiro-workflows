#!/usr/bin/env bash
# Validate Kiro hook files have required sections
set -euo pipefail

HOOKS_DIR="${1:-.kiro/hooks}"
ERRORS=0

if [ ! -d "$HOOKS_DIR" ]; then
  echo "FAIL: Hooks directory not found: $HOOKS_DIR"
  exit 1
fi

HOOK_COUNT=0

for hook in "$HOOKS_DIR"/*.md; do
  [ -f "$hook" ] || continue
  HOOK_COUNT=$((HOOK_COUNT + 1))
  name=$(basename "$hook")

  # Required sections
  for section in "## Trigger" "## Agent" "## Action" "## Context"; do
    if ! grep -q "^$section" "$hook"; then
      echo "FAIL: $name missing required section: $section"
      ERRORS=$((ERRORS + 1))
    fi
  done

  # Trigger must have event field
  if ! grep -q "event:" "$hook"; then
    echo "FAIL: $name missing 'event:' in Trigger section"
    ERRORS=$((ERRORS + 1))
  fi

  # Trigger must have when field
  if ! grep -q "when:" "$hook"; then
    echo "FAIL: $name missing 'when:' in Trigger section"
    ERRORS=$((ERRORS + 1))
  fi

  # Agent section must have agent field
  if ! grep -q "^agent:" "$hook" || ! grep -q "agent:" "$hook"; then
    echo "FAIL: $name missing 'agent:' in Agent section"
    ERRORS=$((ERRORS + 1))
  fi

  # Action must have description
  if ! grep -q "description:" "$hook"; then
    echo "FAIL: $name missing 'description:' in Action section"
    ERRORS=$((ERRORS + 1))
  fi

  # Action must have steps
  if ! grep -q "steps:" "$hook"; then
    echo "FAIL: $name missing 'steps:' in Action section"
    ERRORS=$((ERRORS + 1))
  fi

  echo "OK: $name"
done

if [ "$HOOK_COUNT" -eq 0 ]; then
  echo "FAIL: No hook files found in $HOOKS_DIR"
  exit 1
fi

if [ "$ERRORS" -gt 0 ]; then
  echo "FAILED: $ERRORS errors in $HOOK_COUNT hooks"
  exit 1
fi

echo "PASSED: All $HOOK_COUNT hooks valid"
