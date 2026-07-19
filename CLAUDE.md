# Fabricate Claude Notes

Read `AGENTS.md` first for repo-wide rules.

## Agentic workflow (run this by default)

For non-trivial work, run the **Default Agentic Workflow** in `AGENTS.md` — the
`plan → plan-review → implement → review → docs` state machine — without waiting to be asked.
At each gate, spawn the roles matched by that file's auto-spawn routing table using the Agent
tool: the `subagent_type` for each routing token is listed in the **Agent Roles & Bindings**
table in `AGENTS.md` (e.g. `fabricate_orchestrator` → `fabricate-orchestrator`).
These
subagents are registered in `.claude/agents/`; for the read-only `fabricate_pr_explorer` role,
use the built-in `Explore` agent.
Run plan-review reviewers in parallel, honor the 3-revision
caps, and surface any `BLOCKED` verdict to the user.

## Skills

Shared project skills live in `skills/` (the canonical persona definition for each role lives in
`skills/<role>/SKILL.md`).
Each subagent reads its own skill by path on demand — they are not
invocable as `/slash` commands in the main loop.
Use those shared skills instead of creating
provider-local copies or provider-specific mirrors; see the bindings table in `AGENTS.md`.

## Git & PR mechanics

Before any multi-PR or git-history operation — stacking PRs, rebasing a branch after its base
merges, force-pushing, or rewording commits — read the stacked-PR guidance in
`skills/fabricate-orchestrator/SKILL.md` and the commit/PR-title rules in `AGENTS.md` first.
This
applies in the main loop, not just to spawned sub-agents.
Key traps they cover:

- **Squash-merge breaks descendants.** Squashing a base re-lands its commits on `main` under a new
  SHA, so every child still carrying the originals conflicts the moment its base merges.
Restack
  bottom-up: after each base merges, `git rebase --onto origin/main <old-base-tip> <child>`
  (derive `<old-base-tip>` from the child's own history — do NOT guess a SHA), force-push with
  `--force-with-lease` (it protects against clobbering a concurrent maintainer push), and let CI
  re-run before merging. `git rebase --update-refs` restacks a whole local chain and moves the
  intermediate branch refs in one pass.
- **Commits AND the PR title are linted** against Conventional Commits — every commit on the
  branch, not just the tip.
Use one valid type (`feat`/`fix`/`docs`/`refactor`/`test`/… — `i18n:`
  is not valid; use `feat(i18n):`), a lowercase subject, and remember to fix the PR title too.

## Windows/MSYS gotchas

- MSYS path conversion mangles a `git` argument that looks like a path with a colon: `git show origin/main:<path>` has its colon and slashes rewritten, so the ref fails to resolve.
Prefix such commands with `MSYS2_ARG_CONV_EXCL='*'` to disable the rewrite.
- Docker Compose in many worktrees exhausts Docker's address pool, and the failure surfaces as a generic compose-up error rather than a pool message.
Run `docker network prune -f` to clear the accumulated worktree compose networks.

## OpenSpec

For non-trivial work, use the OpenSpec workflow:

- canonical specs: `openspec/specs/*/spec.md` — the only versioned spec source of truth
- per-change delta: a managed `openspec-delta` block in the work's GitHub issue
  (proposal, design, tasks, spec deltas, roster, acceptance), not versioned files.
  Append it to an existing issue (preserving the reporter's text) or create one from the
  `OpenSpec Change Delta` issue template for prompt-driven work.
See `openspec/README.md`.
- implementation makes the canonical spec changes the delta requires under `openspec/specs/`;
  post-implementation and docs reviewers reconcile the `openspec/specs/` diff against the issue delta.
