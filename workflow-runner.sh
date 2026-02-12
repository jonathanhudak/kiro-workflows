#!/usr/bin/env bash
set -euo pipefail

# workflow-runner.sh — Guide users through multi-agent workflows step-by-step
# Part of kiro-workflows: https://github.com/jonathanhudak/kiro-workflows

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIRO_DIR="${SCRIPT_DIR}/.kiro"
PROGRESS_FILE="${KIRO_DIR}/progress.md"

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# ── Workflow definitions ────────────────────────────────────────────────────
# Format: "agent1:agent2:agent3:..."
WORKFLOW_FEATURE_DEV="planner:developer:verifier:tester:reviewer:compound"
WORKFLOW_BUG_FIX="triager:investigator:developer:verifier:reviewer:compound"
WORKFLOW_SECURITY_AUDIT="scanner:triager:fixer:verifier:tester:reviewer:compound"

# Agent descriptions (bash 3 compatible — no associative arrays)
get_agent_desc() {
  case "$1" in
    planner)      echo "Analyzes requirements and creates specs (requirements.md, design.md, tasks.md)" ;;
    developer)    echo "Implements tasks from the spec with tests and progress tracking" ;;
    verifier)     echo "Validates acceptance criteria — approves or requests changes" ;;
    tester)       echo "Writes and runs tests: unit, integration, edge cases" ;;
    reviewer)     echo "Reviews the full changeset with severity-rated feedback" ;;
    compound)     echo "Extracts learnings and insights from the workflow run" ;;
    triager)      echo "Classifies and prioritizes issues (P0-P3) with effort estimates" ;;
    investigator) echo "Root-cause analysis using git bisect, logs, and hypothesis tracking" ;;
    scanner)      echo "Security scanning: dependency audit, secret detection, license check" ;;
    fixer)        echo "Applies fixes with documentation, CWE references, and regression tests" ;;
    *)            echo "No description" ;;
  esac
}

# ── Helpers ─────────────────────────────────────────────────────────────────

usage() {
  cat <<EOF
${BOLD}workflow-runner.sh${RESET} — Step through multi-agent Kiro workflows

${BOLD}USAGE${RESET}
  ./workflow-runner.sh [OPTIONS]

${BOLD}OPTIONS${RESET}
  --help          Show this help message
  --from <step>   Start from a specific step number (1-based)
  --run           Execute kiro-cli commands directly (not just display them)
  --list          List available workflows and their agents

${BOLD}AVAILABLE WORKFLOWS${RESET}
  1) Feature Development  planner → developer → verifier → tester → reviewer → compound
  2) Bug Fix              triager → investigator → developer → verifier → reviewer → compound
  3) Security Audit       scanner → triager → fixer → verifier → tester → reviewer → compound

${BOLD}EXAMPLES${RESET}
  ./workflow-runner.sh                    # Interactive workflow selection
  ./workflow-runner.sh --from 3           # Resume from step 3
  ./workflow-runner.sh --run              # Execute kiro-cli commands automatically
  ./workflow-runner.sh --list             # Show workflows and agents
EOF
}

list_workflows() {
  echo -e "${BOLD}Available Workflows${RESET}"
  echo ""
  echo -e "${CYAN}1) Feature Development${RESET}"
  print_workflow_steps "$WORKFLOW_FEATURE_DEV" "   "
  echo ""
  echo -e "${CYAN}2) Bug Fix${RESET}"
  print_workflow_steps "$WORKFLOW_BUG_FIX" "   "
  echo ""
  echo -e "${CYAN}3) Security Audit${RESET}"
  print_workflow_steps "$WORKFLOW_SECURITY_AUDIT" "   "
}

print_workflow_steps() {
  local agents_str="$1"
  local indent="${2:-}"
  IFS=':' read -ra agents <<< "$agents_str"
  local step=1
  for agent in "${agents[@]}"; do
    local desc
    desc="$(get_agent_desc "$agent")"
    echo -e "${indent}${DIM}${step}.${RESET} ${BOLD}${agent}${RESET} — ${desc}"
    step=$((step + 1))
  done
}

select_workflow() {
  echo -e "${BOLD}Select a workflow:${RESET}"
  echo ""
  echo -e "  ${CYAN}1)${RESET} Feature Development"
  echo -e "  ${CYAN}2)${RESET} Bug Fix"
  echo -e "  ${CYAN}3)${RESET} Security Audit"
  echo ""
  read -rp "Enter choice [1-3]: " choice

  case "$choice" in
    1) SELECTED_WORKFLOW="$WORKFLOW_FEATURE_DEV"; SELECTED_NAME="Feature Development" ;;
    2) SELECTED_WORKFLOW="$WORKFLOW_BUG_FIX"; SELECTED_NAME="Bug Fix" ;;
    3) SELECTED_WORKFLOW="$WORKFLOW_SECURITY_AUDIT"; SELECTED_NAME="Security Audit" ;;
    *)
      echo -e "${RED}Invalid selection: $choice${RESET}" >&2
      return 1
      ;;
  esac
}

build_kiro_command() {
  local agent="$1"
  echo "kiro-cli --agent ${agent}"
}

init_progress() {
  local workflow_name="$1"
  local total_steps="$2"
  mkdir -p "$(dirname "$PROGRESS_FILE")"
  cat > "$PROGRESS_FILE" <<EOF
# Workflow Progress

**Workflow:** ${workflow_name}
**Started:** $(date -u +"%Y-%m-%dT%H:%M:%SZ")
**Total Steps:** ${total_steps}

## Steps

EOF
}

log_step_progress() {
  local step_num="$1"
  local agent="$2"
  local status="$3"
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  echo "- [${status}] Step ${step_num}: **${agent}** (${timestamp})" >> "$PROGRESS_FILE"
}

run_workflow() {
  local agents_str="$1"
  local workflow_name="$2"
  local start_from="$3"
  local auto_run="$4"

  IFS=':' read -ra agents <<< "$agents_str"
  local total=${#agents[@]}

  echo ""
  echo -e "${BOLD}━━━ ${CYAN}${workflow_name}${RESET}${BOLD} ━━━${RESET}"
  echo -e "${DIM}${total} steps total${RESET}"

  if [ "$start_from" -gt 1 ]; then
    echo -e "${YELLOW}Resuming from step ${start_from}${RESET}"
  fi
  echo ""

  # Initialize progress file (only if starting from step 1)
  if [ "$start_from" -eq 1 ]; then
    init_progress "$workflow_name" "$total"
  fi

  local step=1
  for agent in "${agents[@]}"; do
    if [ "$step" -lt "$start_from" ]; then
      step=$((step + 1))
      continue
    fi

    local desc
    desc="$(get_agent_desc "$agent")"
    local cmd
    cmd=$(build_kiro_command "$agent")

    echo -e "${BOLD}Step ${step}/${total}: ${GREEN}${agent}${RESET}"
    echo -e "${DIM}${desc}${RESET}"
    echo -e "${BLUE}  \$ ${cmd}${RESET}"
    echo ""

    if [ "$auto_run" = "true" ]; then
      echo -e "${YELLOW}Running...${RESET}"
      log_step_progress "$step" "$agent" "x"
      if $cmd; then
        log_step_progress "$step" "$agent" "✓"
        echo -e "${GREEN}✓ Step ${step} complete${RESET}"
      else
        log_step_progress "$step" "$agent" "✗"
        echo -e "${RED}✗ Step ${step} failed${RESET}" >&2
        echo -e "${YELLOW}Fix the issue and resume with: ./workflow-runner.sh --from ${step}${RESET}"
        return 1
      fi
    else
      read -rp "$(echo -e "${CYAN}[Enter]${RESET} proceed, ${CYAN}[s]${RESET}kip, ${CYAN}[q]${RESET}uit: ")" action
      case "$action" in
        s|S)
          echo -e "${DIM}Skipped${RESET}"
          log_step_progress "$step" "$agent" "skipped"
          ;;
        q|Q)
          echo -e "${YELLOW}Stopped at step ${step}. Resume with: ./workflow-runner.sh --from ${step}${RESET}"
          log_step_progress "$step" "$agent" "stopped"
          return 0
          ;;
        *)
          echo -e "${BLUE}  \$ ${cmd}${RESET}"
          log_step_progress "$step" "$agent" "✓"
          echo -e "${GREEN}✓ Step ${step} noted as complete${RESET}"
          ;;
      esac
    fi

    echo ""
    step=$((step + 1))
  done

  echo -e "${GREEN}${BOLD}━━━ Workflow Complete ━━━${RESET}"
  echo -e "${DIM}Progress saved to ${PROGRESS_FILE}${RESET}"
}

# ── Main ────────────────────────────────────────────────────────────────────

START_FROM=1
AUTO_RUN="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --from)
      if [[ -z "${2:-}" ]] || ! [[ "$2" =~ ^[0-9]+$ ]]; then
        echo -e "${RED}Error: --from requires a positive integer${RESET}" >&2
        exit 1
      fi
      START_FROM="$2"
      shift 2
      ;;
    --run)
      AUTO_RUN="true"
      shift
      ;;
    --list)
      list_workflows
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${RESET}" >&2
      echo "Run ./workflow-runner.sh --help for usage"
      exit 1
      ;;
  esac
done

# Verify .kiro directory exists
if [ ! -d "$KIRO_DIR" ]; then
  echo -e "${RED}Error: .kiro/ directory not found at ${KIRO_DIR}${RESET}" >&2
  echo "Run setup.sh first to initialize the project."
  exit 1
fi

# Select and run workflow
select_workflow
run_workflow "$SELECTED_WORKFLOW" "$SELECTED_NAME" "$START_FROM" "$AUTO_RUN"
