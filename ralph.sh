#!/bin/bash
# ralph.sh — The Ralph Loop for Kiro CLI
# Autonomous agent loop that runs kiro-cli repeatedly until all stories are complete.
# Each iteration is a fresh instance with clean context.
# Memory persists via git history, progress.txt, and prd.json.
#
# Based on: https://github.com/snarktank/ralph
# Adapted for: Kiro CLI custom agents

set -euo pipefail

# Configuration
MAX_ITERATIONS="${1:-10}"
MAX_RETRIES=3
PRD_FILE="prd.json"
PROGRESS_FILE="progress.txt"
KIRO_AGENT="${KIRO_AGENT:-developer}"
VERIFY_AGENT="${KIRO_VERIFY_AGENT:-verifier}"
COMPOUND_AGENT="${KIRO_COMPOUND_AGENT:-compound}"
VERIFY_EACH="${KIRO_VERIFY_EACH:-true}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[ralph]${NC} $1"; }
success() { echo -e "${GREEN}[ralph]${NC} $1"; }
warn() { echo -e "${YELLOW}[ralph]${NC} $1"; }
error() { echo -e "${RED}[ralph]${NC} $1"; }

# Check prerequisites
check_prereqs() {
    if ! command -v kiro-cli &> /dev/null; then
        error "kiro-cli not found. Install: curl -fsSL https://cli.kiro.dev/install | bash"
        exit 1
    fi
    if ! command -v jq &> /dev/null; then
        error "jq not found. Install: brew install jq"
        exit 1
    fi
    if [ ! -f "$PRD_FILE" ]; then
        error "No $PRD_FILE found. Create one first:"
        echo "  kiro-cli --agent planner \"Plan: <your feature description>\""
        echo "  # Then save the stories output as prd.json"
        exit 1
    fi
    if ! git rev-parse --is-inside-work-tree &> /dev/null 2>&1; then
        error "Not in a git repository. Initialize one first."
        exit 1
    fi
}

# Get the next incomplete story from prd.json
get_next_story() {
    jq -r '
        .stories[] | select(.passes == false or .passes == null) | 
        @json
    ' "$PRD_FILE" | head -1
}

# Count stories
count_total() { jq '.stories | length' "$PRD_FILE"; }
count_done() { jq '[.stories[] | select(.passes == true)] | length' "$PRD_FILE"; }
count_remaining() { jq '[.stories[] | select(.passes == false or .passes == null)] | length' "$PRD_FILE"; }

# Mark a story as complete
mark_story_done() {
    local story_id="$1"
    local tmp=$(mktemp)
    jq --arg id "$story_id" '
        .stories = [.stories[] | if .id == $id then .passes = true else . end]
    ' "$PRD_FILE" > "$tmp" && mv "$tmp" "$PRD_FILE"
}

# Build the prompt for the developer agent
build_prompt() {
    local story="$1"
    local feedback="${2:-}"
    local iteration="$3"
    
    local story_id=$(echo "$story" | jq -r '.id')
    local story_title=$(echo "$story" | jq -r '.title')
    local story_desc=$(echo "$story" | jq -r '.description')
    local criteria=$(echo "$story" | jq -r '.acceptance_criteria // .acceptanceCriteria // [] | .[]' 2>/dev/null || echo "")
    
    local total=$(count_total)
    local done=$(count_done)
    local remaining=$(count_remaining)
    
    cat <<EOF
You are implementing a single story in iteration $iteration. Focus ONLY on this story.

## Current Story: $story_title
ID: $story_id
Description: $story_desc

### Acceptance Criteria:
$criteria

### Progress: $done/$total stories complete, $remaining remaining

### Progress Log (from previous iterations):
$(cat "$PROGRESS_FILE" 2>/dev/null || echo "(no previous progress)")

$(if [ -n "$feedback" ]; then echo "### VERIFY FEEDBACK (fix these issues):"; echo "$feedback"; fi)

## Instructions:
1. Read the codebase to understand current state
2. Implement ONLY this story
3. Run quality checks (build, lint, test)
4. If checks pass, commit your changes with message: "feat($story_id): $story_title"
5. If checks fail, fix them before committing

Do NOT work on other stories. Do NOT refactor unrelated code.
After completing the work, append a brief summary to progress.txt.
EOF
}

# Build the verify prompt
build_verify_prompt() {
    local story="$1"
    
    local story_id=$(echo "$story" | jq -r '.id')
    local story_title=$(echo "$story" | jq -r '.title')
    local criteria=$(echo "$story" | jq -r '.acceptance_criteria // .acceptanceCriteria // [] | .[]' 2>/dev/null || echo "")
    
    cat <<EOF
Verify that the following story has been correctly implemented.

## Story: $story_title
ID: $story_id

### Acceptance Criteria:
$criteria

## Instructions:
1. Check each acceptance criterion
2. Run the test suite
3. Check the build succeeds
4. Review the git diff for this story's commits

## Output Format:
Start your response with exactly one of:
- PASS: All criteria met
- FAIL: [list what failed]

Then provide details for each criterion:
- ✅ PASS: [criterion] — [evidence]
- ❌ FAIL: [criterion] — [what's wrong and how to fix]
EOF
}

# Run one iteration of the loop
run_iteration() {
    local iteration="$1"
    local story="$2"
    local feedback="${3:-}"
    
    local story_id=$(echo "$story" | jq -r '.id')
    local story_title=$(echo "$story" | jq -r '.title')
    
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "Iteration $iteration/$MAX_ITERATIONS"
    log "Story: $story_title ($story_id)"
    log "Progress: $(count_done)/$(count_total) complete"
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Build and run developer prompt (fresh session each time)
    local prompt=$(build_prompt "$story" "$feedback" "$iteration")
    
    log "Running $KIRO_AGENT agent..."
    echo "$prompt" | kiro-cli --agent "$KIRO_AGENT" 2>&1 | tee "/tmp/ralph-dev-output.txt"
    
    # Verify if enabled
    if [ "$VERIFY_EACH" = "true" ]; then
        log "Running $VERIFY_AGENT agent..."
        local verify_prompt=$(build_verify_prompt "$story")
        local verify_output=$(echo "$verify_prompt" | kiro-cli --agent "$VERIFY_AGENT" 2>&1 | tee "/tmp/ralph-verify-output.txt")
        
        if echo "$verify_output" | head -5 | grep -q "^PASS"; then
            success "✅ Story verified: $story_title"
            mark_story_done "$story_id"
            
            # Append to progress
            echo "" >> "$PROGRESS_FILE"
            echo "## [$story_id] $story_title — DONE (iteration $iteration)" >> "$PROGRESS_FILE"
            echo "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$PROGRESS_FILE"
            
            git add -A && git commit -m "ralph: mark $story_id complete" --allow-empty 2>/dev/null || true
            return 0
        else
            warn "❌ Verification failed for: $story_title"
            # Return the feedback for retry
            echo "$verify_output" > /tmp/ralph-feedback.txt
            return 1
        fi
    else
        # No verification, just mark done
        mark_story_done "$story_id"
        git add -A && git commit -m "ralph: mark $story_id complete" --allow-empty 2>/dev/null || true
        return 0
    fi
}

# Main loop
main() {
    check_prereqs
    
    local branch_name=$(jq -r '.branchName // "feature/ralph"' "$PRD_FILE")
    
    # Create or switch to feature branch
    if git show-ref --verify --quiet "refs/heads/$branch_name" 2>/dev/null; then
        git checkout "$branch_name"
    else
        git checkout -b "$branch_name"
    fi
    
    # Initialize progress file
    if [ ! -f "$PROGRESS_FILE" ]; then
        echo "# Ralph Progress Log" > "$PROGRESS_FILE"
        echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$PROGRESS_FILE"
        echo "PRD: $(jq -r '.title // .name // "unnamed"' "$PRD_FILE")" >> "$PROGRESS_FILE"
        git add "$PROGRESS_FILE" && git commit -m "ralph: initialize progress" 2>/dev/null || true
    fi
    
    log "🐿️ Ralph loop starting"
    log "PRD: $(jq -r '.title // .name // "unnamed"' "$PRD_FILE")"
    log "Stories: $(count_done)/$(count_total) complete"
    log "Max iterations: $MAX_ITERATIONS"
    echo ""
    
    local iteration=0
    local feedback=""
    local retries=0
    
    while [ $iteration -lt $MAX_ITERATIONS ]; do
        iteration=$((iteration + 1))
        
        # Get next story
        local story=$(get_next_story)
        if [ -z "$story" ]; then
            success "🎉 All stories complete!"
            break
        fi
        
        # Run iteration
        if run_iteration "$iteration" "$story" "$feedback"; then
            feedback=""
            retries=0
        else
            retries=$((retries + 1))
            feedback=$(cat /tmp/ralph-feedback.txt 2>/dev/null || echo "Verification failed")
            
            if [ $retries -ge $MAX_RETRIES ]; then
                error "Max retries ($MAX_RETRIES) exceeded for story: $(echo "$story" | jq -r '.title')"
                error "Moving on to next story..."
                feedback=""
                retries=0
                # Don't mark as done — leave it for manual intervention
            else
                warn "Retry $retries/$MAX_RETRIES with feedback..."
                iteration=$((iteration - 1))  # Don't count retries as iterations
            fi
        fi
    done
    
    # Final summary
    echo ""
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "Ralph loop complete"
    log "Stories: $(count_done)/$(count_total) complete"
    log "Iterations used: $iteration/$MAX_ITERATIONS"
    
    local remaining=$(count_remaining)
    if [ "$remaining" -eq 0 ]; then
        success "All stories implemented! ✅"
        
        # Run compound agent for learnings
        log "Running compound agent for learnings extraction..."
        kiro-cli --agent "$COMPOUND_AGENT" "Extract learnings from this workflow run. Review git log, progress.txt, and all changes."
        
        success "Done! Branch '$branch_name' is ready for review."
    else
        warn "$remaining stories remain incomplete."
        warn "Run again: ./ralph.sh $((MAX_ITERATIONS - iteration + remaining * 2))"
    fi
    
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

main "$@"
