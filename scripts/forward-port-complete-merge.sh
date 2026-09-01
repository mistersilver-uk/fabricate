#!/usr/bin/env bash
#
# Completing a CONFLICTED forward-port from a supplied resolution (issue #1439).
#
# `.github/workflows/forward-port.yml` merges `release` into `main` at step 8, and again inside the
# push retry when `main` moved mid-run. Until now a conflict there ended the job with a generic
# non-zero exit, and the only recovery was a human resolving the merge by hand and pushing the merge
# commit to `main` themselves — the sole remaining reason `main` cannot enforce a linear history.
#
# This script is invoked ONLY when that merge failed, from both call sites, so the handling cannot
# drift between them. It is the same one-script-two-call-sites shape (and the same reason)
# `scripts/forward-port-content-gate.sh` already uses. The merge itself deliberately stays INLINE in
# the workflow: `tests/forward-port-workflow.test.js` counts the implementations of the merge across
# the workflow directory, and moving it here would leave that assertion scanning an empty list.
#
# ── IT MAKES NO VERDICT ─────────────────────────────────────────────────────────────────────────
# This script establishes only what it needs in order to build a commit at all. Every accept/refuse
# decision about the resolution belongs to `scripts/forward-port-content-gate.sh`, which runs
# immediately afterwards under the same guard chain and whose refusal ends the job. One decision
# point, re-run on the retry path, with no second drifting copy of it here. In particular this script
# never pushes, never reads `ALLOW_CONTENT`, and never prints an override hint: a resolution is not
# an override, and its refusals must stay off the overridable branch.
#
# WHAT IT DOES, in order:
#
#   1. DISTINGUISHES A CONFLICT FROM A FAILURE. Unmerged index entries are what makes a failed merge
#      a *conflict*. Any other merge failure — an unreachable ref, a dirty tree, a broken repository
#      — exits with its own message and never consults the resolution inputs at all.
#   2. NAMES THE CONTENT THAT COULD NOT BE COMBINED, as an `::error::` list, then aborts the merge so
#      the working tree is not left half-merged.
#   3. REFUSES, ACTIONABLY, WHEN NO RESOLUTION WAS SUPPLIED — naming how to produce one.
#   4. RESOLVES THE RESOLUTION, fetching it by sha where the runner's clone does not already carry
#      it. A ref that does not resolve is UNVERIFIABLE (exit 2), not a refusal: nothing about it was
#      established, so there is nothing for an operator to vouch for.
#   5. RE-DERIVES THE MERGE COMMIT from the resolution's TREE, recording `origin/main` and
#      `origin/release` as its parents in that order.
#
# ── WHY THE COMMIT IS RE-DERIVED RATHER THAN PUSHED AS SUPPLIED ─────────────────────────────────
# The resolution already records both parents (the content gate refuses it otherwise), so taking it
# verbatim would be shorter. It is re-derived anyway, because the `chore:` subject is load-bearing: a
# human-authored merge carrying a `feat:` subject would make the `beta.yml` run this push triggers
# mint a version off a commit that changes nothing. The subject stays under the workflow's control
# and records the resolution's sha, so the pushed commit says where its tree came from.
#
# `git commit-tree` is chosen over driving the conflicted index (`git checkout <ref> -- .` then
# `git commit`) because the latter cannot express a DELETION present in the resolution, and because
# taking the tree object wholesale is exact rather than path-by-path.
#
# Environment:
#   RESOLUTION_REF     a commit in this repository whose tree is the resolved merge; empty means
#                      "no resolution was supplied", which is the fail-closed default
#   REASON             folded into the merge subject, exactly as the inline merge folds it
#
# Both are supplied by the calling step through `env:`, never interpolated into a shell body
# (githubactions:S7630).

set -euo pipefail

RESOLUTION_REF="${RESOLUTION_REF:-}"
REASON="${REASON:-}"

# ── 1. A CONFLICT, OR SOME OTHER FAILURE? ───────────────────────────────────────────────────────
# Unmerged index entries are the definition of the former. Treating every failed merge as a conflict
# would send an unreachable ref or a dirty tree down the resolution path, where the operator would be
# asked to resolve a conflict that never happened.
UNMERGED="$(git ls-files --unmerged)"
if [ -z "$UNMERGED" ]; then
  echo "::error::the forward-port's merge of origin/release into main FAILED, and it left no conflicting paths behind — so this is NOT a conflict and no resolution can complete it. git's own message is above; the usual causes are an unreachable ref, a working tree the merge refused to overwrite, and a repository the runner could not read. A resolution is not the remedy here."
  exit 1
fi

# ── 2. NAME WHAT COULD NOT BE COMBINED ──────────────────────────────────────────────────────────
echo "::error::the forward-port's merge of origin/release into main CONFLICTED. These paths could not be combined automatically:"
printf '%s\n' "$UNMERGED" | cut -f2 | sort -u | while IFS= read -r CONFLICTED_PATH; do
  echo "::error::  ${CONFLICTED_PATH}"
done

git merge --abort

# ── 3. NO RESOLUTION SUPPLIED ───────────────────────────────────────────────────────────────────
if [ -z "$RESOLUTION_REF" ]; then
  echo "::error::no resolution was supplied, so this conflicted forward-port cannot be completed. To produce one: merge the two refs this job named (origin/main and origin/release) in a local clone, resolve the paths above, commit the merge, and push it as a BRANCH — never to main. Then dispatch this workflow again with resolution_ref set to that commit and resolution_effect set to the outcome it is expected to produce. A resolution is not an override: the content gate still applies to it in full."
  exit 1
fi

# ── 4. RESOLVE THE RESOLUTION ───────────────────────────────────────────────────────────────────
# The runner's clone carries `main` and `release` and nothing else, so a resolution pushed as a
# branch is fetched by sha here. A ref that still does not resolve establishes NOTHING about the
# resolution, so it is reported as unverifiable rather than as a refusal.
if ! RESOLUTION="$(git rev-parse --verify --quiet "${RESOLUTION_REF}^{commit}")"; then
  if git fetch --quiet origin "$RESOLUTION_REF"; then
    RESOLUTION="$(git rev-parse --verify --quiet 'FETCH_HEAD^{commit}')" || RESOLUTION=""
  else
    RESOLUTION=""
  fi
fi
if [ -z "$RESOLUTION" ]; then
  echo "::error::resolution_ref '${RESOLUTION_REF}' does not resolve to a commit in this repository, and fetching it by sha did not produce one either. That is UNVERIFIABLE rather than refused: nothing about the resolution was established, so no override applies to it. Push the resolution commit to this repository — as a branch, never to main — and dispatch again with its sha."
  exit 2
fi

# Record what this script resolved, under a ref of our own, so the gate that runs next decides on the
# SAME commit rather than re-resolving independently. Without it, a `resolution_ref` given as a branch
# name resolves here (the fetch leaves it in FETCH_HEAD) but not in the gate, whose clone has only
# `main` and `release` — so the job would complete the merge from a resolution and then, one step
# later, report that the very same ref does not resolve. It also removes any possibility of the two
# scripts resolving different commits.
git update-ref refs/fabricate/resolution "$RESOLUTION"

# ── 5. RE-DERIVE THE MERGE ──────────────────────────────────────────────────────────────────────
COMPLETED="$(git commit-tree "${RESOLUTION}^{tree}" -p origin/main -p origin/release -m "chore: forward-port release into main (${REASON}), completed from conflict resolution ${RESOLUTION}")"
git reset --hard "$COMPLETED"

echo "::notice::the conflicted forward-port was completed from resolution ${RESOLUTION}, recording origin/main and origin/release as its parents in that order. Nothing has been verified yet: the content gate runs next and decides this run."
