#!/usr/bin/env bash
# validate-agents.sh — Validates all Kiro agent JSON files in .kiro/agents/
set -euo pipefail

AGENTS_DIR="${1:-.kiro/agents}"
VALID_TOOLS=("fs_read" "fs_write" "fs_list" "execute_bash" "use_mcp")
REQUIRED_FIELDS=("name" "description" "prompt" "tools" "allowedTools" "resources")

errors=0

if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required but not installed" >&2
  exit 1
fi

if [ ! -d "$AGENTS_DIR" ]; then
  echo "ERROR: Directory $AGENTS_DIR not found" >&2
  exit 1
fi

json_files=("$AGENTS_DIR"/*.json)
if [ ${#json_files[@]} -eq 0 ] || [ ! -e "${json_files[0]}" ]; then
  echo "ERROR: No JSON files found in $AGENTS_DIR" >&2
  exit 1
fi

for file in "${json_files[@]}"; do
  filename=$(basename "$file")

  # Check valid JSON
  if ! jq . "$file" >/dev/null 2>&1; then
    echo "FAIL: $filename — invalid JSON"
    errors=$((errors + 1))
    continue
  fi

  # Check required fields
  for field in "${REQUIRED_FIELDS[@]}"; do
    if [ "$(jq "has(\"$field\")" "$file")" != "true" ]; then
      echo "FAIL: $filename — missing required field '$field'"
      errors=$((errors + 1))
    fi
  done

  # Check tools and allowedTools only reference valid tool names
  for tool_field in tools allowedTools; do
    if [ "$(jq "has(\"$tool_field\")" "$file")" = "true" ]; then
      while IFS= read -r tool; do
        valid=false
        for vt in "${VALID_TOOLS[@]}"; do
          if [ "$tool" = "$vt" ]; then valid=true; break; fi
        done
        if [ "$valid" = false ]; then
          echo "FAIL: $filename — invalid tool '$tool' in $tool_field"
          errors=$((errors + 1))
        fi
      done < <(jq -r ".${tool_field}[]" "$file" 2>/dev/null)
    fi
  done

  # Check allowedTools is subset of tools
  if [ "$(jq 'has("tools") and has("allowedTools")' "$file")" = "true" ]; then
    while IFS= read -r tool; do
      if [ "$(jq --arg t "$tool" '.tools | index($t) != null' "$file")" != "true" ]; then
        echo "FAIL: $filename — allowedTools contains '$tool' not in tools"
        errors=$((errors + 1))
      fi
    done < <(jq -r '.allowedTools[]' "$file" 2>/dev/null)
  fi

  if [ $errors -eq 0 ] 2>/dev/null; then
    echo "OK: $filename"
  fi
done

if [ $errors -gt 0 ]; then
  echo ""
  echo "RESULT: $errors error(s) found"
  exit 1
else
  echo ""
  echo "RESULT: All agent files valid"
  exit 0
fi
