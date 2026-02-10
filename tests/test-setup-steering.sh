#!/usr/bin/env bash
# Test setup.sh codebase analysis and steering generation
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETUP_SH="$SCRIPT_DIR/../setup.sh"
PASS=0
FAIL=0

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1" >&2; FAIL=$((FAIL + 1)); }

cleanup() { rm -rf "$TMPDIR_TEST"; }

# --- Create mock project with package.json ---
echo "==> Test 1: Node.js project with package.json"
TMPDIR_TEST=$(mktemp -d)
trap cleanup EXIT

mkdir -p "$TMPDIR_TEST/project1/src/components" "$TMPDIR_TEST/project1/tests"
cat > "$TMPDIR_TEST/project1/package.json" <<'EOF'
{
  "name": "my-app",
  "scripts": {
    "build": "tsc -b",
    "test": "vitest run",
    "lint": "eslint src/",
    "dev": "next dev"
  },
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
EOF
cat > "$TMPDIR_TEST/project1/tsconfig.json" <<'EOF'
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022"
  }
}
EOF
touch "$TMPDIR_TEST/project1/README.md"

bash "$SETUP_SH" --force "$TMPDIR_TEST/project1" > /dev/null 2>&1

# Check tech.md
TECH="$TMPDIR_TEST/project1/.kiro/steering/tech.md"
if [[ -f "$TECH" ]]; then
  pass "tech.md generated"
else
  fail "tech.md not generated"
fi

if grep -q "TypeScript" "$TECH" 2>/dev/null; then
  pass "tech.md detects TypeScript"
else
  fail "tech.md does not mention TypeScript"
fi

if grep -q "Next.js" "$TECH" 2>/dev/null; then
  pass "tech.md detects Next.js framework"
else
  fail "tech.md does not detect Next.js"
fi

if grep -q "tsc -b" "$TECH" 2>/dev/null; then
  pass "tech.md has build command from package.json"
else
  fail "tech.md missing build command"
fi

if grep -q "vitest run" "$TECH" 2>/dev/null; then
  pass "tech.md has test command from package.json"
else
  fail "tech.md missing test command"
fi

if grep -q "strict" "$TECH" 2>/dev/null; then
  pass "tech.md detects strict mode"
else
  fail "tech.md missing strict mode"
fi

# Check structure.md
STRUCT="$TMPDIR_TEST/project1/.kiro/steering/structure.md"
if [[ -f "$STRUCT" ]]; then
  pass "structure.md generated"
else
  fail "structure.md not generated"
fi

if grep -q "src" "$STRUCT" 2>/dev/null; then
  pass "structure.md contains src directory"
else
  fail "structure.md missing src directory"
fi

if grep -q "README.md" "$STRUCT" 2>/dev/null; then
  pass "structure.md lists README.md as key file"
else
  fail "structure.md missing README.md key file"
fi

if grep -q "package.json" "$STRUCT" 2>/dev/null; then
  pass "structure.md lists package.json as key file"
else
  fail "structure.md missing package.json key file"
fi

# Check workflows.md
WF="$TMPDIR_TEST/project1/.kiro/steering/workflows.md"
if [[ -f "$WF" ]]; then
  pass "workflows.md generated"
else
  fail "workflows.md not generated"
fi

if grep -q "npm run build" "$WF" 2>/dev/null; then
  pass "workflows.md has npm build command"
else
  fail "workflows.md missing build command"
fi

if grep -q "npm test" "$WF" 2>/dev/null; then
  pass "workflows.md has npm test command"
else
  fail "workflows.md missing test command"
fi

# Check product.md and learnings.md are templates (not overwritten)
if grep -q "Customize" "$TMPDIR_TEST/project1/.kiro/steering/product.md" 2>/dev/null; then
  pass "product.md left as template"
else
  fail "product.md was overwritten"
fi

if grep -q "compound agent" "$TMPDIR_TEST/project1/.kiro/steering/learnings.md" 2>/dev/null; then
  pass "learnings.md left as template"
else
  fail "learnings.md was overwritten"
fi

# --- Test 2: Project without package.json ---
echo ""
echo "==> Test 2: Project without package.json (fallback)"
mkdir -p "$TMPDIR_TEST/project2/lib"
touch "$TMPDIR_TEST/project2/Makefile"

bash "$SETUP_SH" --force "$TMPDIR_TEST/project2" > /dev/null 2>&1

TECH2="$TMPDIR_TEST/project2/.kiro/steering/tech.md"
if [[ -f "$TECH2" ]]; then
  pass "tech.md generated without package.json"
else
  fail "tech.md not generated without package.json"
fi

if grep -q "Unknown" "$TECH2" 2>/dev/null; then
  pass "tech.md falls back to Unknown language"
else
  fail "tech.md did not fallback for unknown project"
fi

STRUCT2="$TMPDIR_TEST/project2/.kiro/steering/structure.md"
if [[ -f "$STRUCT2" ]]; then
  pass "structure.md generated without package.json"
else
  fail "structure.md not generated without package.json"
fi

if grep -q "lib" "$STRUCT2" 2>/dev/null; then
  pass "structure.md contains lib directory"
else
  fail "structure.md missing lib directory"
fi

# --- Test 3: Steering files are valid markdown ---
echo ""
echo "==> Test 3: Steering files are valid markdown"
for f in tech.md structure.md workflows.md; do
  if head -1 "$TMPDIR_TEST/project1/.kiro/steering/$f" | grep -q "^#"; then
    pass "$f starts with markdown heading"
  else
    fail "$f does not start with markdown heading"
  fi
done

# --- Summary ---
echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
