#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKLOG_FILE="$REPO_ROOT/BACKLOG.md"

usage() {
  cat <<'EOF'
Usage:
  .claude/run-pipeline-headless.sh
  .claude/run-pipeline-headless.sh <task-id>
  .claude/run-pipeline-headless.sh <task-id> [<task-id> ...]
  .claude/run-pipeline-headless.sh <count>
  .claude/run-pipeline-headless.sh --count <count>

Modes:
  - no args: pick and run the next ready task
  - one task ID: run that task
  - multiple task IDs: run those tasks in parallel
  - count: pick the next <count> ready tasks and run them in parallel

Rules:
  - task IDs and task count are mutually exclusive
  - count must be a positive integer
EOF
}

is_positive_integer() {
  [[ "$1" =~ ^[1-9][0-9]*$ ]]
}

sanitize_slug() {
  local value="$1"
  value="$(printf '%s' "$value" | tr -cs 'A-Za-z0-9._-' '-')"
  value="${value##-}"
  value="${value%%-}"
  if [ -z "$value" ]; then
    value="task"
  fi
  printf '%s' "$value"
}

select_next_ready_tasks() {
  local limit="$1"
  awk -v limit="$limit" '
    /^### / {
      current = ""
      if (match($0, /^### ([^ ]+) - /, parts)) {
        current = parts[1]
      }
      next
    }

    current != "" && /^- Status:/ {
      if ($0 ~ /`todo`/) {
        print current
        count++
        if (count >= limit) {
          exit
        }
      }
      current = ""
    }
  ' "$BACKLOG_FILE"
}

run_single_task_pipeline() {
  local task="$1"
  local output_dir="${2:-.claude}"
  local existing_branch="${3:-}"
  local review_result
  local docs_result
  local branch
  local task_slug

  task_slug="$(sanitize_slug "$task")"
  mkdir -p "$output_dir"

  echo "=== FABRICATE AGENT PIPELINE ==="
  echo "Task: $task"
  echo ""

  # Step 1: Orchestrator plans
  echo "--- PLANNING ---"
  claude -p \
    "Use the orchestrator agent to read BACKLOG.md, select task '$task', \
     write a plan to PLAN.md, and output the plan summary." \
    --allowedTools "Read,Write,Bash(git log *),Bash(git diff *)" \
    --dangerously-skip-permissions \
    > "$output_dir/pipeline-plan.txt"

  cat "$output_dir/pipeline-plan.txt"

  # Step 2: Implementer executes
  echo ""
  echo "--- IMPLEMENTING ---"
  claude -p \
    "Use the implementer agent to read PLAN.md and implement the task. \
     Run npm test when complete. Output a summary of changes made." \
    --allowedTools "Read,Write,Edit,Bash(npm *),Bash(git diff *)" \
    --dangerously-skip-permissions \
    > "$output_dir/pipeline-impl.txt"

  cat "$output_dir/pipeline-impl.txt"

  # Step 3: Reviewer validates
  echo ""
  echo "--- REVIEWING ---"
  review_result="$(claude -p \
    "Use the reviewer agent to review all changes since the last commit. \
     Output exactly one of: APPROVED, NEEDS_CHANGES, or BLOCKED, \
     followed by your reasoning." \
    --allowedTools "Read,Bash(npm test),Bash(git diff *),Bash(git log *)" \
    --dangerously-skip-permissions)"

  echo "$review_result"

  # Step 4: Act on review outcome
  if echo "$review_result" | grep -q "NEEDS_CHANGES"; then
    echo ""
    echo "⚠️  NEEDS CHANGES — running implementer again with review feedback"
    claude -p \
      "Use the implementer agent to address these review comments: \
       $(printf '%s' "$review_result"). Then run npm test." \
      --allowedTools "Read,Write,Edit,Bash(npm *),Bash(git diff *)" \
      --dangerously-skip-permissions

    # Re-run reviewer after fixes
    review_result="$(claude -p \
      "Use the reviewer agent to review all changes since the last commit. \
       Output exactly one of: APPROVED, NEEDS_CHANGES, or BLOCKED, \
       followed by your reasoning." \
      --allowedTools "Read,Bash(npm test),Bash(git diff *),Bash(git log *)" \
      --dangerously-skip-permissions)"

    echo "$review_result"
  fi

  if echo "$review_result" | grep -q "BLOCKED"; then
    echo ""
    echo "🚫 BLOCKED — requires human review"
    return 1
  fi

  if ! echo "$review_result" | grep -q "APPROVED"; then
    echo ""
    echo "🚫 Unexpected review result — requires human review"
    return 1
  fi

  # Step 5: Docs writer updates documentation
  echo ""
  echo "--- WRITING DOCS ---"
  docs_result="$(claude -p \
    "Use the docs-writer agent to update documentation for the changes \
     made in this task. Read git diff to understand what changed, update \
     JSDoc in any modified src/ files, update the relevant pages under \
     docs/, and append an entry to CHANGELOG.md. \
     Output a structured summary starting with DOCS COMPLETE." \
    --allowedTools "Read,Write,Edit,Bash(git diff *),Bash(git log *),Grep,Glob" \
    --dangerously-skip-permissions)"

  echo "$docs_result"

  if ! echo "$docs_result" | grep -q "DOCS COMPLETE"; then
    echo ""
    echo "⚠️  Docs writer did not confirm completion — flagging for human review"
    echo "DOCS_INCOMPLETE: $task" >> "$output_dir/pipeline-warnings.txt"
    # Non-fatal — continue to commit.
  fi

  # Step 6: Commit everything to a branch
  echo ""
  echo "--- COMMITTING ---"
  if [ -n "$existing_branch" ]; then
    branch="$existing_branch"
    if [ "$(git branch --show-current)" != "$branch" ]; then
      git checkout "$branch"
    fi
  else
    branch="agent/$(date +%Y%m%d-%H%M%S)-$task_slug"
    git checkout -b "$branch"
  fi

  git add -A
  if git diff --cached --quiet; then
    echo "⚠️  No changes to commit for task $task"
  else
    git commit -m "feat: $task (automated agent pipeline)"
  fi
  echo ""
  echo "✅ Branch ready: $branch"
  echo "   Review and merge when satisfied:"
  echo "   gh pr create --head $branch --title '$task'"
}

run_parallel_task_pipelines() {
  local -a tasks=("$@")
  local timestamp
  local worktree_root
  local index=0
  local failures=0
  local -a pids=()
  local -a task_refs=()
  local -a branch_refs=()
  local -a log_refs=()

  timestamp="$(date +%Y%m%d-%H%M%S)"
  worktree_root="$REPO_ROOT/.claude/worktrees/$timestamp"
  mkdir -p "$worktree_root"

  echo "=== FABRICATE AGENT PIPELINE ==="
  echo "Mode: parallel (${#tasks[@]} tasks)"
  echo "Worktree root: $worktree_root"
  echo ""

  for task in "${tasks[@]}"; do
    local slug
    local branch
    local branch_base
    local worktree_path
    local log_file
    local suffix=1

    index=$((index + 1))
    slug="$(sanitize_slug "$task")"
    branch_base="agent/${timestamp}-${slug}"
    branch="$branch_base"

    while git show-ref --verify --quiet "refs/heads/$branch"; do
      branch="${branch_base}-${suffix}"
      suffix=$((suffix + 1))
    done

    worktree_path="$worktree_root/${index}-${slug}"
    git worktree add -b "$branch" "$worktree_path" HEAD >/dev/null
    mkdir -p "$worktree_path/.claude"
    log_file="$worktree_path/.claude/pipeline.log"

    (
      cd "$worktree_path"
      run_single_task_pipeline "$task" ".claude" "$branch"
    ) > "$log_file" 2>&1 &

    pids+=("$!")
    task_refs+=("$task")
    branch_refs+=("$branch")
    log_refs+=("$log_file")

    echo "Started: task $task on $branch"
    echo "  Log: $log_file"
  done

  echo ""
  for i in "${!pids[@]}"; do
    if wait "${pids[$i]}"; then
      echo "✅ Completed: ${task_refs[$i]} (${branch_refs[$i]})"
      echo "  Log: ${log_refs[$i]}"
    else
      echo "❌ Failed: ${task_refs[$i]} (${branch_refs[$i]})"
      echo "  Log: ${log_refs[$i]}"
      failures=1
    fi
  done

  if [ "$failures" -ne 0 ]; then
    return 1
  fi
}

cd "$REPO_ROOT"

task_count=""
declare -a requested_task_ids=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    -n|--count)
      if [ -n "$task_count" ]; then
        echo "Error: --count can only be provided once." >&2
        usage >&2
        exit 1
      fi
      shift
      if [ "$#" -eq 0 ]; then
        echo "Error: --count requires a value." >&2
        usage >&2
        exit 1
      fi
      if ! is_positive_integer "$1"; then
        echo "Error: count must be a positive integer." >&2
        usage >&2
        exit 1
      fi
      task_count="$1"
      ;;
    *)
      requested_task_ids+=("$1")
      ;;
  esac
  shift
done

if [ -n "$task_count" ] && [ "${#requested_task_ids[@]}" -gt 0 ]; then
  echo "Error: task count and task IDs are mutually exclusive." >&2
  usage >&2
  exit 1
fi

if [ -z "$task_count" ] && [ "${#requested_task_ids[@]}" -eq 1 ] && is_positive_integer "${requested_task_ids[0]}"; then
  task_count="${requested_task_ids[0]}"
  requested_task_ids=()
fi

if [ -z "$task_count" ] && [ "${#requested_task_ids[@]}" -gt 1 ]; then
  for task_id in "${requested_task_ids[@]}"; do
    if is_positive_integer "$task_id"; then
      echo "Error: task count and task IDs are mutually exclusive." >&2
      usage >&2
      exit 1
    fi
  done
fi

if [ -z "$task_count" ] && [ "${#requested_task_ids[@]}" -eq 0 ]; then
  task_count=1
fi

declare -a selected_tasks=()

if [ -n "$task_count" ]; then
  if [ ! -f "$BACKLOG_FILE" ]; then
    echo "Error: BACKLOG.md not found at $BACKLOG_FILE" >&2
    exit 1
  fi
  mapfile -t selected_tasks < <(select_next_ready_tasks "$task_count")
  if [ "${#selected_tasks[@]}" -eq 0 ]; then
    echo "Error: no ready tasks found in BACKLOG.md." >&2
    exit 1
  fi
  if [ "${#selected_tasks[@]}" -lt "$task_count" ]; then
    echo "Error: requested $task_count ready task(s), found ${#selected_tasks[@]}." >&2
    exit 1
  fi
else
  selected_tasks=("${requested_task_ids[@]}")
fi

if [ "${#selected_tasks[@]}" -eq 1 ]; then
  run_single_task_pipeline "${selected_tasks[0]}" ".claude"
else
  run_parallel_task_pipelines "${selected_tasks[@]}"
fi
