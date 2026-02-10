#!/usr/bin/env bash
# setup.sh — Set up kiro-workflows in a target project directory
# Detects kiro-cli, copies/symlinks .kiro/, validates agent JSON files
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIRO_SRC="$SCRIPT_DIR/.kiro"

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS] [TARGET_DIR]

Set up kiro-workflows in a target project directory.

Arguments:
  TARGET_DIR    Directory to install .kiro/ into (default: current directory)

Options:
  --symlink     Create symlinks instead of copying files
  --force       Overwrite existing .kiro/ without prompting
  --help, -h    Show this help message

Examples:
  $(basename "$0")                    # Install to current directory
  $(basename "$0") ~/my-project       # Install to specific directory
  $(basename "$0") --symlink .        # Symlink instead of copy
  $(basename "$0") --force ~/proj     # Overwrite without prompting
EOF
}

# --- Parse arguments ---
SYMLINK=false
FORCE=false
TARGET_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --symlink)
      SYMLINK=true
      shift
      ;;
    --force)
      FORCE=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    -*)
      echo "ERROR: Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      if [[ -n "$TARGET_DIR" ]]; then
        echo "ERROR: Multiple target directories specified" >&2
        exit 1
      fi
      TARGET_DIR="$1"
      shift
      ;;
  esac
done

TARGET_DIR="${TARGET_DIR:-.}"

# --- Resolve target to absolute path ---
if [[ ! -d "$TARGET_DIR" ]]; then
  echo "ERROR: Target directory does not exist: $TARGET_DIR" >&2
  exit 1
fi
TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"
KIRO_DEST="$TARGET_DIR/.kiro"

# --- Detect kiro-cli ---
echo "==> Checking for kiro-cli..."
if command -v kiro-cli &>/dev/null; then
  echo "    ✓ kiro-cli found: $(command -v kiro-cli)"
elif command -v kiro &>/dev/null; then
  echo "    ✓ kiro found: $(command -v kiro)"
else
  echo "    ⚠ WARNING: kiro-cli is not installed."
  echo "    Install it to use these agent configurations with Kiro."
  echo "    Continuing anyway..."
fi

# --- Check source .kiro/ exists ---
if [[ ! -d "$KIRO_SRC" ]]; then
  echo "ERROR: Source .kiro/ directory not found at $KIRO_SRC" >&2
  exit 1
fi

# --- Handle existing .kiro/ ---
if [[ -e "$KIRO_DEST" ]]; then
  if [[ "$FORCE" == true ]]; then
    echo "==> Removing existing .kiro/ (--force)"
    rm -rf "$KIRO_DEST"
  else
    echo ""
    echo "    .kiro/ already exists at $TARGET_DIR"
    read -r -p "    Overwrite? [y/N] " response
    case "$response" in
      [yY][eE][sS]|[yY])
        echo "==> Removing existing .kiro/"
        rm -rf "$KIRO_DEST"
        ;;
      *)
        echo "    Aborted."
        exit 0
        ;;
    esac
  fi
fi

# --- Copy or symlink ---
if [[ "$SYMLINK" == true ]]; then
  echo "==> Symlinking .kiro/ → $KIRO_DEST"
  ln -s "$KIRO_SRC" "$KIRO_DEST"
else
  echo "==> Copying .kiro/ → $KIRO_DEST"
  # Copy, excluding .git and node_modules if present
  rsync -a --exclude='.git' --exclude='node_modules' "$KIRO_SRC/" "$KIRO_DEST/"
fi

# --- Verify the installation ---
echo "==> Verifying installation..."
if [[ -L "$KIRO_DEST" ]]; then
  # Symlinked — check link target exists
  if [[ -d "$KIRO_DEST" ]]; then
    echo "    ✓ Symlink valid"
  else
    echo "    ✗ Symlink broken!" >&2
    exit 1
  fi
else
  # Copied — check directories exist
  for dir in agents steering hooks settings; do
    if [[ -d "$KIRO_DEST/$dir" ]]; then
      echo "    ✓ $dir/"
    else
      echo "    ⚠ $dir/ not found (may be optional)"
    fi
  done
fi

# --- Validate agent JSON files ---
echo "==> Validating agent JSON files..."
VALIDATE_SCRIPT="$SCRIPT_DIR/validate-agents.sh"
if [[ -x "$VALIDATE_SCRIPT" ]]; then
  if "$VALIDATE_SCRIPT" "$KIRO_DEST/agents"; then
    echo "    ✓ All agent files valid"
  else
    echo "    ✗ Agent validation found errors (see above)" >&2
    exit 1
  fi
else
  echo "    ⚠ validate-agents.sh not found or not executable, skipping validation"
fi

# --- Codebase Analysis & Steering Generation ---
echo "==> Analyzing codebase at $TARGET_DIR..."

# --- Detect package.json ---
PKG_JSON="$TARGET_DIR/package.json"
HAS_PKG=false
PKG_NAME=""
PKG_FRAMEWORK=""
PKG_BUILD_CMD=""
PKG_TEST_CMD=""
PKG_LINT_CMD=""
PKG_DEV_CMD=""
PKG_DEPS=""
PKG_DEV_DEPS=""

if [[ -f "$PKG_JSON" ]]; then
  HAS_PKG=true
  echo "    ✓ Found package.json"

  if command -v jq &>/dev/null; then
    PKG_NAME=$(jq -r '.name // ""' "$PKG_JSON" 2>/dev/null)
    PKG_BUILD_CMD=$(jq -r '.scripts.build // ""' "$PKG_JSON" 2>/dev/null)
    PKG_TEST_CMD=$(jq -r '.scripts.test // ""' "$PKG_JSON" 2>/dev/null)
    PKG_LINT_CMD=$(jq -r '.scripts.lint // ""' "$PKG_JSON" 2>/dev/null)
    PKG_DEV_CMD=$(jq -r '.scripts.dev // .scripts.start // ""' "$PKG_JSON" 2>/dev/null)

    # Detect framework from dependencies
    PKG_DEPS=$(jq -r '.dependencies // {} | keys[]' "$PKG_JSON" 2>/dev/null || true)
    PKG_DEV_DEPS=$(jq -r '.devDependencies // {} | keys[]' "$PKG_JSON" 2>/dev/null || true)
    ALL_DEPS="$PKG_DEPS"$'\n'"$PKG_DEV_DEPS"

    # Framework detection
    if echo "$ALL_DEPS" | grep -q "^next$"; then
      PKG_FRAMEWORK="Next.js"
    elif echo "$ALL_DEPS" | grep -q "^react$"; then
      PKG_FRAMEWORK="React"
    elif echo "$ALL_DEPS" | grep -q "^vue$"; then
      PKG_FRAMEWORK="Vue"
    elif echo "$ALL_DEPS" | grep -q "^svelte$"; then
      PKG_FRAMEWORK="Svelte"
    elif echo "$ALL_DEPS" | grep -q "^express$"; then
      PKG_FRAMEWORK="Express"
    elif echo "$ALL_DEPS" | grep -q "^fastify$"; then
      PKG_FRAMEWORK="Fastify"
    elif echo "$ALL_DEPS" | grep -q "^hono$"; then
      PKG_FRAMEWORK="Hono"
    elif echo "$ALL_DEPS" | grep -q "^@angular/core$"; then
      PKG_FRAMEWORK="Angular"
    fi
  else
    echo "    ⚠ jq not installed — limited package.json parsing"
    # Fallback: grep for basic info
    PKG_NAME=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$PKG_JSON" | head -1 | sed 's/.*: *"//;s/"//') # shellcheck disable=SC2034
  fi
else
  echo "    ⚠ No package.json found — using generic templates"
fi

# --- Detect TypeScript ---
HAS_TS=false
TS_STRICT=""
TS_TARGET=""
TSCONFIG="$TARGET_DIR/tsconfig.json"
if [[ -f "$TSCONFIG" ]]; then
  HAS_TS=true
  echo "    ✓ Found tsconfig.json"
  if command -v jq &>/dev/null; then
    TS_STRICT=$(jq -r '.compilerOptions.strict // ""' "$TSCONFIG" 2>/dev/null)
    TS_TARGET=$(jq -r '.compilerOptions.target // ""' "$TSCONFIG" 2>/dev/null)
  fi
fi

# --- Detect other config files ---
HAS_RUST=false
[[ -f "$TARGET_DIR/Cargo.toml" ]] && HAS_RUST=true
HAS_PYTHON=false
[[ -f "$TARGET_DIR/pyproject.toml" || -f "$TARGET_DIR/setup.py" || -f "$TARGET_DIR/requirements.txt" ]] && HAS_PYTHON=true
HAS_GO=false
[[ -f "$TARGET_DIR/go.mod" ]] && HAS_GO=true

# --- Determine language ---
LANG="Unknown"
if [[ "$HAS_TS" == true ]]; then
  LANG="TypeScript / Node.js"
elif [[ "$HAS_PKG" == true ]]; then
  LANG="JavaScript / Node.js"
elif [[ "$HAS_RUST" == true ]]; then
  LANG="Rust"
elif [[ "$HAS_PYTHON" == true ]]; then
  LANG="Python"
elif [[ "$HAS_GO" == true ]]; then
  LANG="Go"
fi

# --- Generate directory structure ---
echo "==> Generating steering files..."

# Build directory tree (max 3 levels, exclude common noise)
DIR_TREE=$(cd "$TARGET_DIR" && find . -maxdepth 3 -type d \
  ! -path './.git*' \
  ! -path './node_modules*' \
  ! -path './dist*' \
  ! -path './build*' \
  ! -path './.next*' \
  ! -path './target*' \
  ! -path './__pycache__*' \
  ! -path './.kiro*' \
  ! -path './coverage*' \
  ! -path './.turbo*' \
  2>/dev/null | sort | sed 's|^\./||' | head -50)

# Identify key files
KEY_FILES=""
for f in README.md package.json Cargo.toml go.mod pyproject.toml setup.py Makefile Dockerfile docker-compose.yml .env.example; do
  [[ -f "$TARGET_DIR/$f" ]] && KEY_FILES="$KEY_FILES\n- \`$f\`"
done

# --- Write structure.md ---
cat > "$KIRO_DEST/steering/structure.md" <<STRUCT_EOF
# Project Structure

<!-- Auto-generated by setup.sh from codebase analysis -->

## Directory Layout

\`\`\`
${DIR_TREE:-"(no directories found)"}
\`\`\`

## Key Files
$(echo -e "${KEY_FILES:-"- (none detected)"}")

## Conventions

- Review the directory layout above for naming patterns
- Check existing files for code style before adding new ones
STRUCT_EOF
echo "    ✓ Generated structure.md"

# --- Write tech.md ---
BUILD_LINE="- Build: \`npm run build\`"
TEST_LINE="- Test: \`npm test\`"
LINT_LINE="- Lint: \`npm run lint\`"
DEV_LINE=""

if [[ "$HAS_PKG" == true ]]; then
  if [[ -n "$PKG_BUILD_CMD" ]]; then
    BUILD_LINE="- Build: \`npm run build\` → \`$PKG_BUILD_CMD\`"
  else
    BUILD_LINE="- Build: _(no build script in package.json)_"
  fi
  if [[ -n "$PKG_TEST_CMD" ]]; then
    TEST_LINE="- Test: \`npm test\` → \`$PKG_TEST_CMD\`"
  else
    TEST_LINE="- Test: _(no test script in package.json)_"
  fi
  if [[ -n "$PKG_LINT_CMD" ]]; then
    LINT_LINE="- Lint: \`npm run lint\` → \`$PKG_LINT_CMD\`"
  else
    LINT_LINE="- Lint: _(no lint script in package.json)_"
  fi
  if [[ -n "$PKG_DEV_CMD" ]]; then
    DEV_LINE="- Dev: \`npm run dev\` → \`$PKG_DEV_CMD\`"
  fi
elif [[ "$HAS_RUST" == true ]]; then
  BUILD_LINE="- Build: \`cargo build\`"
  TEST_LINE="- Test: \`cargo test\`"
  LINT_LINE="- Lint: \`cargo clippy\`"
elif [[ "$HAS_GO" == true ]]; then
  BUILD_LINE="- Build: \`go build ./...\`"
  TEST_LINE="- Test: \`go test ./...\`"
  LINT_LINE="- Lint: \`golangci-lint run\`"
elif [[ "$HAS_PYTHON" == true ]]; then
  BUILD_LINE="- Build: _(Python — no compile step)_"
  TEST_LINE="- Test: \`pytest\`"
  LINT_LINE="- Lint: \`ruff check .\`"
fi

FRAMEWORK_LINE=""
[[ -n "$PKG_FRAMEWORK" ]] && FRAMEWORK_LINE="- Framework: $PKG_FRAMEWORK"

TS_LINE=""
if [[ "$HAS_TS" == true ]]; then
  TS_LINE="- TypeScript: yes"
  [[ "$TS_STRICT" == "true" ]] && TS_LINE="$TS_LINE (strict mode)"
  [[ -n "$TS_TARGET" ]] && TS_LINE="$TS_LINE, target: $TS_TARGET"
fi

cat > "$KIRO_DEST/steering/tech.md" <<TECH_EOF
# Tech Stack

<!-- Auto-generated by setup.sh from codebase analysis -->

## Languages & Frameworks

- Primary: $LANG
${FRAMEWORK_LINE}
${TS_LINE}

## Build & Test

${BUILD_LINE}
${TEST_LINE}
${LINT_LINE}
${DEV_LINE}

## Patterns

- Follow existing code conventions found in the codebase
- Check the project's linter/formatter config for style rules
- Handle errors at boundaries; prefer typed/structured errors
TECH_EOF
echo "    ✓ Generated tech.md"

# --- Write workflows.md with correct commands ---
WF_BUILD="npm run build"
WF_TEST="npm test"
if [[ "$HAS_RUST" == true ]]; then
  WF_BUILD="cargo build"
  WF_TEST="cargo test"
elif [[ "$HAS_GO" == true ]]; then
  WF_BUILD="go build ./..."
  WF_TEST="go test ./..."
elif [[ "$HAS_PYTHON" == true ]]; then
  WF_BUILD="# no build step"
  WF_TEST="pytest"
elif [[ "$HAS_PKG" == true ]]; then
  [[ -z "$PKG_BUILD_CMD" ]] && WF_BUILD="# no build script configured"
  [[ -z "$PKG_TEST_CMD" ]] && WF_TEST="# no test script configured"
fi

cat > "$KIRO_DEST/steering/workflows.md" <<WF_EOF
# Multi-Agent Workflows

This project uses specialized agents for different phases of development. Each agent has a focused role and passes context to the next via specs, docs, and code.

## Workflow: Feature Development

\`\`\`
planner → developer → verifier → tester → reviewer → compound
\`\`\`

**How to run:**
1. Start with \`planner\` — describe the feature, get a spec
2. Switch to \`developer\` — implement tasks from the spec
3. Switch to \`verifier\` — validate acceptance criteria
4. Switch to \`tester\` — write/run tests
5. Switch to \`reviewer\` — review the full changeset
6. Switch to \`compound\` — extract learnings

## Workflow: Bug Fix

\`\`\`
triager → investigator → developer → verifier → reviewer → compound
\`\`\`

## Workflow: Security Audit

\`\`\`
scanner → triager → fixer → verifier → tester → reviewer → compound
\`\`\`

## Build & Test Commands

\`\`\`bash
# Build
${WF_BUILD}

# Test
${WF_TEST}
\`\`\`

## Context Passing

Agents share context through:
- **Specs** in \`.kiro/specs/\` — requirements, design, tasks
- **Steering files** — persistent project knowledge
- **Git history** — recent commits and diffs
- **Learnings** — insights from past workflows

## Tips

- Let each agent finish before moving to the next
- Review agent output before proceeding — catch issues early
- The compound step is non-optional — always extract learnings
- Update steering files when you notice agents making repeated mistakes
WF_EOF
echo "    ✓ Generated workflows.md"

# --- Leave product.md and learnings.md as templates ---
echo "    ✓ product.md and learnings.md left as templates (customize manually)"

echo ""
echo "Done! .kiro/ installed to $TARGET_DIR"
echo "Steering files generated from codebase analysis."
echo "Run 'kiro-cli' in that directory to start using the agents."
