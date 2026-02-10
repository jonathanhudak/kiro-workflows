# The Story Loop Pattern

The critical pattern that makes multi-agent workflows actually work (ported from antfarm).

## The Problem

Without a feedback loop, a developer agent blasts through all tasks with no quality gate. Bugs compound, each task builds on a broken foundation, and by the end the whole thing is a mess.

## The Solution: Loop + Verify Each

```
planner creates stories (structured tasks with acceptance criteria)
  ↓
FOR EACH story:
  ├── developer implements the story
  ├── verifier checks acceptance criteria
  ├── IF FAIL:
  │   ├── inject verify_feedback into developer context
  │   └── developer retries (up to max_retries)
  ├── IF PASS:
  │   └── advance to next story
  └── IF MAX RETRIES EXCEEDED:
      └── fail the run (or escalate)
  ↓
AFTER all stories complete:
  tester → reviewer → compound
```

## Key Elements

### Stories (from planner output)

```json
[
  {
    "id": "setup-auth",
    "title": "Set up OAuth2 provider integration",
    "description": "Configure OAuth2 with Google provider...",
    "acceptance_criteria": [
      "OAuth2 callback endpoint exists and handles tokens",
      "User session is created after successful auth",
      "Invalid tokens return 401"
    ]
  }
]
```

### Verify Feedback (injected on retry)

When verification fails, the developer gets:
```
VERIFY FEEDBACK (retry 1/3):
❌ FAIL: User session is created after successful auth
  - Session cookie is set but expires immediately (maxAge=0)
  - Need to set appropriate session duration

✅ PASS: OAuth2 callback endpoint exists
✅ PASS: Invalid tokens return 401
```

### Fresh Session Per Story

Each story gets a fresh agent session to prevent context pollution. The developer sees:
- The overall task context
- The current story details
- Completed stories summary (what's done)
- Remaining stories count
- Any verify feedback (if retrying)
- Progress log

## Kiro CLI Implementation

Since Kiro doesn't have built-in loop orchestration, `workflow-runner.sh` implements this:

```bash
# Pseudocode for the story loop
stories=$(kiro-cli --agent planner "$task" | extract_stories)

for story in $stories; do
  retries=0
  while [ $retries -lt $max_retries ]; do
    # Developer implements
    kiro-cli --agent developer "Implement: $story. Feedback: $feedback"
    
    # Verifier checks
    result=$(kiro-cli --agent verifier "Verify: $story")
    
    if [ "$result" = "PASS" ]; then
      break
    else
      feedback="$result"
      retries=$((retries + 1))
    fi
  done
done

# Post-loop pipeline
kiro-cli --agent tester "Run test suite"
kiro-cli --agent reviewer "Review all changes"
kiro-cli --agent compound "Extract learnings"
```

## Why This Matters

- **Quality compounds**: Each story verified before the next starts
- **Fast feedback**: Catch issues early, not after 7 stories
- **Context isolation**: Fresh session prevents hallucination drift
- **Retry with knowledge**: Developer knows exactly what failed
- **Progress tracking**: Clear visibility into where we are
