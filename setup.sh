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

echo ""
echo "Done! .kiro/ installed to $TARGET_DIR"
echo "Run 'kiro-cli' in that directory to start using the agents."
