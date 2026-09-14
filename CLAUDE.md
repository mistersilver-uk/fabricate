# Fabricate Claude Notes

Read `AGENTS.md` first for repo-wide rules.
It now carries the workflow, routing, skills and OpenSpec rules this file used to restate; what stays here is the Claude- and Windows-specific detail with no other home.

## Agentic workflow (run this by default)

Merged into `AGENTS.md`'s "Default Agentic Workflow" section and its subsections (issue #1661).

## Skills

Each subagent reads its own skill by path on demand — they are not invocable as `/slash` commands in the main loop.

## Git & PR mechanics

Before any multi-PR or git-history operation — stacking PRs, rebasing a branch after its base merges, force-pushing, or rewording commits — read the stacked-PR guidance in `.agents/skills/fabricate-orchestrator/SKILL.md` and the commit/PR-title rules in `AGENTS.md` first.
This applies in the main loop, not just to spawned sub-agents.
Key traps they cover:

- **Squash-merge breaks descendants.** Squashing a base re-lands its commits on `main` under a new SHA, so every child still carrying the originals conflicts the moment its base merges.
Restack bottom-up: after each base merges, `git rebase --onto origin/main <old-base-tip> <child>` (derive `<old-base-tip>` from the child's own history — do NOT guess a SHA), force-push with `--force-with-lease` (it protects against clobbering a concurrent maintainer push), and let CI re-run before merging. `git rebase --update-refs` restacks a whole local chain and moves the intermediate branch refs in one pass.
- **Commits AND the PR title are linted** against Conventional Commits — every commit on the branch, not just the tip.
Use one valid type (`feat`/`fix`/`docs`/`refactor`/`test`/… — `i18n:` is not valid; use `feat(i18n):`), a lowercase subject, and remember to fix the PR title too.

## Windows/MSYS gotchas

- MSYS path conversion mangles a `git` argument that looks like a path with a colon: `git show origin/main:<path>` has its colon and slashes rewritten, so the ref fails to resolve.
Prefix such commands with `MSYS2_ARG_CONV_EXCL='*'` to disable the rewrite.
- Docker Compose in many worktrees exhausts Docker's address pool, and the failure surfaces as a generic compose-up error rather than a pool message.
The Foundry smoke now uses a per-worktree-stable container identity (`scripts/lib/foundryRunIdentity.js`), so tear a disposed worktree down with `npm run test:foundry:down -- --clean` to reclaim its container and network at the source; `docker network prune -f` remains a safe fallback for accumulated worktree compose networks (it only frees networks with no attached container).
