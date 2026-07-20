# Isolated Worktree Lifecycle

## Purpose

Use isolated Git worktrees for spawned agents so independent workstreams can run concurrently without sharing a mutable checkout.
The workflow driver owns the coordinator checkout and integrates every accepted lane.

## Driver authority

The workflow driver alone may:

- mutate the coordinator checkout or integration branch;
- create, remove, or prune agent worktrees;
- update GitHub issue or PR state and managed blocks;
- push branches or open and update PRs;
- choose integration order, cherry-pick lane commits, and record commit mappings;
- run authoritative final gates; and
- delete lane branches after verified integration.

Spawned agents never edit the coordinator checkout or another agent's lane.
They never push, open or update a PR, mutate an issue or PR body, remove a worktree, or delete a branch.
They return local commits, findings, or recommended managed-block text to the driver.

## Repository layout

Use `.worktrees/<issue>/` as the repository-local root for lanes associated with an issue.
Keep driver-owned immutable review artifacts in `.worktrees/<issue>/artifacts/`, which is a sibling of agent worktrees rather than content inside a detached review checkout.
Use a distinct directory for every lane, including every revision and every detached review target.

The coordinator checkout is not a lane.
It stays on the non-protected integration branch that the driver will push and use for the PR.

## Before planning and plan review

Before creating read-only planning or plan-review lanes, the driver:

1. verifies the coordinator branch is not `main`, `release`, or a hotfix line;
2. requires a clean coordinator worktree, including tracked and meaningful untracked state;
3. commits the complete shared baseline so every assignment has an immutable base SHA;
4. derives a preliminary roster mechanically from the current request and proposed affected paths; and
5. creates each planner or plan reviewer in a detached worktree pinned to that immutable baseline.

An approved delta is not required for this read-only phase because its purpose is to produce and review the delta.
When the proposed paths or signals change, the driver recomputes the preliminary roster and creates fresh detached review lanes at the current planning target.

## Before mutable implementation fan-out

Before creating any mutable lane, the driver:

1. requires an approved issue delta and its final resolved roster;
2. requires a clean coordinator worktree and committed integration `HEAD`;
3. resolves the dependency order from the approved delta;
4. gives every mutable path exactly one owner for the current revision; and
5. identifies lockfiles and shared configuration as single-owner paths.

Mutable lanes may run in parallel only when their owned paths are disjoint and none depends on output that has not integrated.
Start dependent work only after its prerequisite commits are integrated and assign the new integration `HEAD` as its base.

## Assignment brief

Every lane brief records:

- the absolute worktree path;
- the GitHub issue number;
- the role, workflow stage, and revision number;
- the assigned base SHA;
- the expected mutable branch or detached target SHA;
- the exclusively owned paths;
- dependencies and whether each dependency is already integrated;
- the expected commit range;
- the focused checks the lane may run; and
- the required handoff fields.

For mutable lanes, use `agent/<issue>-<stage>-<role>-r<revision>` as the branch name.
The expected commit range begins at the assigned base and ends at the lane `HEAD`.

## Lane identity checks

Before acting, every spawned agent verifies:

```sh
git rev-parse --show-toplevel
git branch --show-current
git rev-parse HEAD
git status --short
```

The top-level path must equal the assigned absolute worktree path.
A mutable lane must be on the assigned branch and at the assigned base before its first edit.
A read-only lane must be detached at the assigned target SHA.
Every lane must start clean.
An identity mismatch or unexpected existing change is `BLOCKED` and returns to the driver without editing.

## Mutable lane handoff

A mutable agent edits only its owned paths and commits those changes locally.
It may run only the focused checks allowed by its brief.
It returns:

- the verified base SHA;
- ordered new commit SHAs;
- `git diff <assigned-base>...HEAD --name-only`;
- a full base-relative diff artifact or the exact command output requested by the driver;
- focused check results;
- tracked and meaningful untracked status; and
- caveats, deviations, or recommended issue text.

The lane stays available until the driver has integrated and verified its commits or explicitly preserves it for investigation.

## Read-only lanes and artifacts

Create planners and reviewers in detached worktrees pinned to the exact commit they must evaluate.
Create a fresh detached lane whenever the integration commit changes, even for the same reviewer and stage.
Never reuse a detached checkout after the evaluated commit changes.

The driver writes the immutable base-relative diff to `.worktrees/<issue>/artifacts/` before review and supplies its path in the brief.
The reviewer treats the assigned base, target SHA, artifact, issue delta, and working tree as its complete review target rather than inspecting an ambient active branch.
Read-only agents return findings or verdicts and never commit.

## Feedback revisions

Reuse a retained mutable lane when ownership is unchanged, the same lane remains available and clean, and its dependency context is still current.
The agent adds local commits and returns only the new ordered commit SHAs for that revision.

Create a fresh revision lane from the current integration `HEAD` when ownership changes, the prior lane or agent is unavailable, or a conflict or stale dependency requires refreshed context.
Use the next revision suffix in its branch and directory name.

## Integration checks

Before integrating each lane, the driver mechanically verifies:

1. the coordinator checkout is clean;
2. the lane has no unexpected tracked or meaningful untracked changes;
3. `git rev-list --reverse <assigned-base>..HEAD` equals the returned ordered commit list;
4. `git diff --name-only <assigned-base>...HEAD` contains only owned paths;
5. all declared dependencies already exist on the integration branch; and
6. no returned source commit has already been recorded as integrated.

The driver cherry-picks in declared dependency order and records every `<source SHA> -> <integrated SHA>` mapping immediately after it lands.
The mapping is workflow state and must survive until cleanup is complete.

If a cherry-pick conflicts, the driver runs `git cherry-pick --abort`, leaves both the coordinator and source lane otherwise unchanged, and routes resolution through a fresh revision lane based on the new integration `HEAD`.
The driver never resolves a conflict by editing another agent's lane.

Integrate domain and canonical-spec reconciliation before assigning dependent documentation work.
After both domain and documentation outputs integrate, their read-only cross-reviews may run concurrently against the same integration commit.

## Validation ownership

Agents may run focused checks in their own lanes when the brief permits them.
The driver serializes dependency installation, the complete unit-test suite, build, complete lint and format checks, Foundry or Docker smoke tests, and screenshot generation to avoid shared resource contention.
Acceptance results are authoritative only when run from the fully integrated coordinator branch.

CI does not create agent worktrees.
It runs the repository's unchanged gates against the pushed integrated commit.
`npm run validate:agents` invokes the same dependency-free validator with identical behavior in local development and CI; neither environment uses a provider-specific fallback.

## Guarded cleanup

After acceptance, the driver inspects each lane's tracked, untracked, and ignored state and proves every returned source commit is integrated.
Known generated content such as lane-local dependency installs may be discarded only after confirming that no meaningful untracked work is mixed with it.
Dirty, unintegrated, blocked, interrupted, or ambiguous lanes are preserved and reported.

For a clean integrated lane, the driver:

1. verifies every source-to-integrated mapping;
2. compares each source commit with its mapped integrated commit using stable patch identity or an equivalent mechanical patch comparison;
3. removes the worktree only after the comparisons succeed;
4. uses forced worktree removal only when integration equivalence is proven and no meaningful untracked work exists;
5. deletes the lane branch with `git branch -D` only after the mapping and patch-equivalence checks succeed; and
6. runs `git worktree prune` after eligible lanes are removed.

Use of `git branch -D` is intentional because a cherry-picked source commit is not an ancestor of the integration branch.
Never force-delete an unverified lane branch.
