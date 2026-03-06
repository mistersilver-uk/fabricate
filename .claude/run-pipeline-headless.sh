#!/bin/bash
set -e

TASK=${1:-"next"}  # Pass a task ID or let orchestrator pick

echo "=== FABRICATE AGENT PIPELINE ==="
echo "Task: $TASK"
echo ""

# Step 1: Orchestrator plans
echo "--- PLANNING ---"
claude -p \
  "Use the orchestrator agent to read BACKLOG.md, select task '$TASK', \
   write a plan to PLAN.md, and output the plan summary." \
  --allowedTools "Read,Write,Bash(git log *),Bash(git diff *)" \
  --dangerously-skip-permissions \
  > .claude/pipeline-plan.txt

cat .claude/pipeline-plan.txt

# Step 2: Implementer executes
echo ""
echo "--- IMPLEMENTING ---"
claude -p \
  "Use the implementer agent to read PLAN.md and implement the task. \
   Run npm test when complete. Output a summary of changes made." \
  --allowedTools "Read,Write,Edit,Bash(npm *),Bash(git diff *)" \
  --dangerously-skip-permissions \
  > .claude/pipeline-impl.txt

cat .claude/pipeline-impl.txt

# Step 3: Reviewer validates
echo ""
echo "--- REVIEWING ---"
REVIEW_RESULT=$(claude -p \
  "Use the reviewer agent to review all changes since the last commit. \
   Output exactly one of: APPROVED, NEEDS_CHANGES, or BLOCKED, \
   followed by your reasoning." \
  --allowedTools "Read,Bash(npm test),Bash(git diff *),Bash(git log *)" \
  --dangerously-skip-permissions)

echo "$REVIEW_RESULT"

# Step 4: Act on review outcome
if echo "$REVIEW_RESULT" | grep -q "NEEDS_CHANGES"; then
  echo ""
  echo "⚠️  NEEDS CHANGES — running implementer again with review feedback"
  claude -p \
    "Use the implementer agent to address these review comments: \
     $(echo $REVIEW_RESULT). Then run npm test." \
    --allowedTools "Read,Write,Edit,Bash(npm *),Bash(git diff *)" \
    --dangerously-skip-permissions

  # Re-run reviewer after fixes
  REVIEW_RESULT=$(claude -p \
    "Use the reviewer agent to review all changes since the last commit. \
     Output exactly one of: APPROVED, NEEDS_CHANGES, or BLOCKED, \
     followed by your reasoning." \
    --allowedTools "Read,Bash(npm test),Bash(git diff *),Bash(git log *)" \
    --dangerously-skip-permissions)

  echo "$REVIEW_RESULT"
fi

if echo "$REVIEW_RESULT" | grep -q "BLOCKED"; then
  echo ""
  echo "🚫 BLOCKED — requires human review"
  exit 1
fi

if echo "$REVIEW_RESULT" | grep -q "APPROVED"; then

  # Step 5: Docs writer updates documentation
  echo ""
  echo "--- WRITING DOCS ---"
  DOCS_RESULT=$(claude -p \
    "Use the docs-writer agent to update documentation for the changes \
     made in this task. Read git diff to understand what changed, update \
     JSDoc in any modified src/ files, update the relevant pages under \
     docs/, and append an entry to CHANGELOG.md. \
     Output a structured summary starting with DOCS COMPLETE." \
    --allowedTools "Read,Write,Edit,Bash(git diff *),Bash(git log *),Grep,Glob" \
    --dangerously-skip-permissions)

  echo "$DOCS_RESULT"

  if ! echo "$DOCS_RESULT" | grep -q "DOCS COMPLETE"; then
    echo ""
    echo "⚠️  Docs writer did not confirm completion — flagging for human review"
    echo "DOCS_INCOMPLETE: $TASK" >> .claude/pipeline-warnings.txt
    # Non-fatal — we still commit, but leave a warning
  fi

  # Step 6: Commit everything to a branch
  echo ""
  echo "--- COMMITTING ---"
  BRANCH="agent/$(date +%Y%m%d-%H%M%S)-$TASK"
  git checkout -b "$BRANCH"
  git add -A
  git commit -m "feat: $TASK (automated agent pipeline)"
  echo ""
  echo "✅ Branch ready: $BRANCH"
  echo "   Review and merge when satisfied:"
  echo "   gh pr create --head $BRANCH --title '$TASK'"

else
  echo ""
  echo "🚫 Unexpected review result — requires human review"
  exit 1
fi