#!/usr/bin/env bash
# Validates .kiro/settings/mcp.json structure
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
MCP_FILE="$REPO_ROOT/.kiro/settings/mcp.json"
ERRORS=0

fail() { echo "FAIL: $1"; ERRORS=$((ERRORS + 1)); }
pass() { echo "PASS: $1"; }

# 1. File exists
if [[ -f "$MCP_FILE" ]]; then
  pass "mcp.json exists"
else
  fail "mcp.json not found at $MCP_FILE"
  exit 1
fi

# 2. Valid JSON
if jq empty "$MCP_FILE" 2>/dev/null; then
  pass "mcp.json is valid JSON"
else
  fail "mcp.json is not valid JSON"
  exit 1
fi

# 3. Has mcpServers key
if jq -e '.mcpServers' "$MCP_FILE" >/dev/null 2>&1; then
  pass "mcpServers key exists"
else
  fail "missing mcpServers key"
fi

# 4. Required servers exist
for server in filesystem git github; do
  if jq -e ".mcpServers.${server}" "$MCP_FILE" >/dev/null 2>&1; then
    pass "server '$server' exists"
  else
    fail "server '$server' missing"
  fi
done

# 5. Each server has required fields
for server in filesystem git github; do
  for field in name command args; do
    if jq -e ".mcpServers.${server}.${field}" "$MCP_FILE" >/dev/null 2>&1; then
      pass "server '$server' has field '$field'"
    else
      fail "server '$server' missing field '$field'"
    fi
  done
done

# 6. name field matches key
for server in filesystem git github; do
  name=$(jq -r ".mcpServers.${server}.name" "$MCP_FILE")
  if [[ "$name" == "$server" ]]; then
    pass "server '$server' name matches key"
  else
    fail "server '$server' name is '$name', expected '$server'"
  fi
done

echo ""
if [[ $ERRORS -eq 0 ]]; then
  echo "All MCP validation checks passed!"
  exit 0
else
  echo "$ERRORS check(s) failed"
  exit 1
fi
