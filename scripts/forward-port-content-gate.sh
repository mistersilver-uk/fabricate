#!/usr/bin/env bash
#
# The forward-port's content gate (issue #1418), in ONE place.
#
# `.github/workflows/forward-port.yml` needs this logic TWICE — at the first-pass gate and again in
# the push retry, which re-performs the merge against a freshly fetched `main` and is therefore a
# second merge no gate has seen. Both call sites are shell bodies inside a single workflow file, and
# GitHub Actions supports neither YAML anchors nor reuse of a step from inside another step's `run:`,
# so the only way to write this once is a script both bodies invoke. It is deliberately the whole
# gate rather than a helper: two copies of a safety-critical gate drift, and only one of them gets
# the fix. (It is also why SonarCloud's new-code duplication gate stays green — see the design note
# D8 in issue #1418.)
#
# WHAT IT ESTABLISHES, in order:
#
#   0. THE PREDICATE'S PRECONDITION. `git merge-tree --write-tree` must exist. See below.
#   1. OWN-MERGE GUARD. The forward-port's own merge commit must introduce nothing present in none of
#      its parents. This is the only check that looks at the merge the ruleset-bypassing push
#      actually lands, and it is NOT overridable: `allow_content` lets an operator vouch for content
#      that exists somewhere to be reviewed, and content invented by a conflict resolution was
#      reviewed nowhere at all.
#   1b. THE RESOLUTION CHECKS (issue #1439), inside that guard. A merge whose parents do not merge
#      cleanly embeds a human resolution, and used to be refused outright. It may now be COMPLETED
#      from a resolution the operator supplies, and every judgment about that resolution is made
#      here: that it is present in this repository, pinned to the exact origin/main and
#      origin/release this run is merging, the tree that would actually be pushed, confined to the
#      paths the automatic merge could not settle, free of unresolved differences and of lines
#      neither line contains, and productive of the outcome the operator declared. With no
#      resolution supplied it refuses exactly as it always has. None of these refusals is
#      overridable, because the guard is upstream of the `allow_content` branch, and a resolution is
#      not an override: everything below still applies to it in full.
#   2. FAST PATH. When the merge carries no file content onto `main`, no unreviewed content can reach
#      `main` and no API call is needed. The routine forward-port stays free, exactly as before.
#   3. CHANGE PROVENANCE. Otherwise, collect the range, the per-merge content statuses and the
#      per-commit pull-request associations, and let `forward-port-provenance.mjs` decide. Its exit
#      status decides this script's, which decides the job's.
#
# The range is `origin/main..origin/release`, NEVER `origin/main..HEAD`. By the time this runs, HEAD
# is the bot's own merge commit, which is by definition from no pull request; including it would
# guarantee a refusal. The range is stable before and after the merge and is recomputed here on the
# retry path against the freshly fetched `origin/main`.
#
# ── WHY A RE-MERGE AND NOT A COMBINED DIFF ──────────────────────────────────────────────────────
# "This merge introduced content present in none of its parents" was originally decided from
# `git diff-tree --cc -r --no-commit-id --name-only <merge>` being empty. That predicate CANNOT
# express the question. `--name-only` follows the `-c` FILE selection — "files modified from all
# parents" — and `--cc`'s hunk compression only ever affects PATCH output, so it never reaches the
# name list. Any clean three-way merge in which one file took hunks from both sides therefore lists
# that file, and a genuine evil merge of the same two parents lists exactly the same file. The two
# are indistinguishable. Measured on this repository: of the last 38 merges reachable from
# `origin/main`, 5 have a non-empty combined diff and every one of them invented nothing — two of
# them on `CHANGELOG.md`, which is the release path itself. The old predicate refused all five.
#
# The predicate below RE-MERGES a merge's two parents and compares the resulting tree with the tree
# the merge actually recorded. Tree identity is exact, cheap, and needs no path filtering: equal
# means the merge is precisely what an unattended three-way merge of its parents produces, so it
# added nothing of its own; unequal means it carries something neither parent has.
#
# Environment:
#   GH_TOKEN           the App installation token; `gh api` authenticates with it, never GITHUB_TOKEN
#   GITHUB_REPOSITORY  `<owner>/<name>`, supplied by the Actions runner to every step; an
#                      association naming any other repository is refused
#   ALLOW_CONTENT      "true" overrides a REFUSAL (verdict 1) only, after printing what it overrode
#   OVERRIDE_HINT      the caller-composed remedy clause, appended to a refusal and to nothing else
#   RESOLUTION_REF     a commit whose tree completes a CONFLICTED forward-port; empty means none was
#                      supplied, which is the fail-closed default
#   RESOLUTION_EFFECT  the outcome that resolution is declared to produce, and which is then
#                      established: `no-content-onto-main` or `content-onto-main`
#   ACCEPTED_BASES     comma-separated base refs a merged pull request may target (default: release)
#   PER_PAGE           association page size; a FULL page is treated as possibly truncated
#   MAX_COMMITS        the largest range shape this will decide
#
# ALLOW_CONTENT and OVERRIDE_HINT are supplied by the calling step through `env:`, never interpolated
# into a shell body (githubactions:S7630).

set -euo pipefail

# Resolved from this script's OWN location rather than from the caller's working directory. The
# workflow invokes it from the repository root; the executed integration test invokes it from a
# throwaway repository somewhere else entirely. Both must reach the same verifier.
GATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERIFIER="${GATE_DIR}/forward-port-provenance.mjs"

RANGE="origin/main..origin/release"
RESOLUTION_REF="${RESOLUTION_REF:-}"
RESOLUTION_EFFECT="${RESOLUTION_EFFECT:-}"
ACCEPTED_BASES="${ACCEPTED_BASES:-release}"
PER_PAGE="${PER_PAGE:-100}"
MAX_COMMITS="${MAX_COMMITS:-200}"

# ── 0. THE PREDICATE'S PRECONDITION ─────────────────────────────────────────────────────────────
# `git merge-tree --write-tree` arrived in git 2.38. There is no older-git fallback worth having:
# the obvious one is the combined-diff predicate this replaces, which answers the wrong question
# (see the header). So a git that cannot run this refuses, loudly, rather than silently substituting
# a broken check on the one push that bypasses pull-request review.
GIT_VERSION="$(git --version)"
GIT_VERSION="${GIT_VERSION#git version }"
GIT_MAJOR="${GIT_VERSION%%.*}"
GIT_MINOR="${GIT_VERSION#*.}"
GIT_MINOR="${GIT_MINOR%%.*}"
if [[ ! "$GIT_MAJOR" =~ ^[0-9]+$ ]] || [[ ! "$GIT_MINOR" =~ ^[0-9]+$ ]]; then
  echo "::error::could not read a version number from '$(git --version)', so it cannot be established that this git supports 'git merge-tree --write-tree' (git 2.38+). The content gate refuses rather than run an unverified predicate."
  exit 2
fi
if [ "$GIT_MAJOR" -lt 2 ] || { [ "$GIT_MAJOR" -eq 2 ] && [ "$GIT_MINOR" -lt 38 ]; }; then
  echo "::error::git ${GIT_VERSION} is older than 2.38 and has no 'git merge-tree --write-tree', which is how this gate establishes that a merge introduced nothing of its own. There is no fallback: the predicate it would fall back to cannot tell a clean auto-merge from an evil merge. Upgrade git on the runner."
  exit 2
fi

if [[ ! "$PER_PAGE" =~ ^[0-9]+$ ]] || [ "$PER_PAGE" -lt 1 ] || [ "$PER_PAGE" -gt 100 ]; then
  echo "::error::PER_PAGE is '${PER_PAGE}'; it must be a whole number from 1 to 100. GitHub caps per_page at 100, so a larger value would silently be served as 100 while the verifier looked for a ${PER_PAGE}-entry page to recognise a possibly-truncated read — turning 'this may be incomplete' into a confident refusal of a commit whose pull request is on page 2."
  exit 2
fi
if [[ ! "$MAX_COMMITS" =~ ^[0-9]+$ ]] || [ "$MAX_COMMITS" -lt 1 ]; then
  echo "::error::MAX_COMMITS is '${MAX_COMMITS}'; it must be a whole number of at least 1."
  exit 2
fi

# Decide whether ONE merge commit introduced content its parents do not carry, by re-merging its two
# parents and comparing the resulting tree with the tree the merge actually recorded.
#
# Prints exactly one verdict token, plus a detail token where one exists:
#
#   content-free            the re-merge reproduces the merge's tree exactly, so it added nothing
#   carries-content <tree>  the re-merge succeeded and produced a DIFFERENT tree; <tree> is the
#                           re-merged one, so `git diff <tree> <commit>^{tree}` is precisely the
#                           content this merge invented
#   remerge-conflicted      the parents do not merge cleanly, so the recorded merge embeds a human
#                           resolution — content that is in neither parent
#   parent-count <n>        not a two-parent merge, so there is no two-parent re-merge to compare
#                           against; an octopus merge has no such re-merge, and a single-parent
#                           commit is not a merge at all
#
# Only `content-free` establishes anything. What the other three mean for the run is decided by the
# caller, because it differs: the forward-port's OWN merge has no pull request by construction and
# so has nothing else to fall back on, while a merge inside the range can still be accounted for by
# a merged pull request based on the release line.
merge_content_status() {
  local commit="$1"
  local topology parents remerge_output remerge_status remerged_tree actual_tree

  topology="$(git rev-list --parents -n 1 "$commit")"
  # Word-splitting is the point: `<sha> <parent>…` is exactly a positional list. `set --` inside a
  # function sets the FUNCTION's positional parameters, so the script's own are untouched.
  # shellcheck disable=SC2086
  set -- $topology
  parents=$(($# - 1))
  if [ "$parents" -ne 2 ]; then
    printf 'parent-count %s\n' "$parents"
    return 0
  fi

  remerge_output="$(git merge-tree --write-tree "${commit}^1" "${commit}^2" 2>/dev/null)" &&
    remerge_status=0 || remerge_status=$?
  if [ "$remerge_status" -ne 0 ]; then
    printf 'remerge-conflicted\n'
    return 0
  fi

  remerged_tree="${remerge_output%%$'\n'*}"
  actual_tree="$(git rev-parse "${commit}^{tree}")"
  if [ "$remerged_tree" = "$actual_tree" ]; then
    printf 'content-free\n'
  else
    printf 'carries-content %s\n' "$remerged_tree"
  fi
}

# ── THE RESOLUTION CHECKS ───────────────────────────────────────────────────────────────────────
# A conflicted forward-port is completed from a resolution supplied by a human (issue #1439), and
# every judgment about that resolution lives HERE, inside the own-merge guard, rather than in
# `scripts/forward-port-complete-merge.sh`, which only builds the commit. One decision point, re-run
# on the retry path, and — because the guard is upstream of the `allow_content` branch —
# structurally unreachable by the override, exactly as the own-merge refusal already is.
#
# ── THE PERMITTED-PATH SET IS THE HEART OF IT ───────────────────────────────────────────────────
# A resolution may alter only what the automatic merge did not settle by copying one side verbatim.
# That set is a union of two, and BOTH halves are load-bearing; each was measured against a real
# conflict rather than assumed:
#
#   * COMPOSED paths — those where the re-merged tree's blob equals NEITHER parent's blob at that
#     path, so the automatic merge composed something of its own there. This is wider than the
#     conflicted set: on the v1.9.1 bring-back (5448ca6a) git auto-merged a test file by APPENDING
#     release's copy of a test beside main's identical one, with no conflict and no marker, and the
#     correct resolution had to delete that duplicate. A permitted set built from the conflicted
#     paths alone refuses that resolution, and the only alternative it leaves — shipping the
#     duplicate — is then refused by the declared-outcome check instead, so the recovery path could
#     not complete one of its own motivating cases.
#   * CONFLICTED paths — the stage entries `git merge-tree --write-tree` prints. USUALLY a subset of
#     the composed set, because a conflicted blob carries markers and so differs from both parents.
#     Not always: on a modify/delete conflict git leaves the modifying side's blob in the tree
#     unchanged and reports the path as conflicted, so the path is not composed at all, and a
#     resolution accepting the deletion would be refused without this half.
#
# A path present in only one parent, or copied verbatim from one side, is in neither half and stays
# refused — which is the point. Content the automatic merge settled was settled without a human, so
# a resolution altering it was reviewed nowhere.

# The blob oid a tree-ish records at one path, or empty when it records none there.
#
# Read through `git ls-tree` rather than `git show <tree-ish>:<path>` deliberately. The colon form is
# rewritten by MSYS path conversion on the Windows hosts this repository's executed tests run on, and
# an absent path is an ERROR in either form — which `set -euo pipefail` would turn into a silent
# mid-check death on exactly the modify/delete resolutions this branch exists to complete.
resolution_blob_oid() {
  git ls-tree "$1" -- "$2" | awk '{print $3}'
}

# One path's blob as a sorted, unique set of its non-blank lines. An absent blob is the EMPTY set.
resolution_blob_lines() {
  local oid
  oid="$(resolution_blob_oid "$1" "$2")"
  [ -n "$oid" ] || return 0
  git cat-file blob "$oid" | grep -v '^[[:space:]]*$' | LC_ALL=C sort -u || true
}

# The union described above, one path per line, sorted and unique.
resolution_permitted_paths() {
  local conflict_tree="$1" main_commit="$2" release_commit="$3" stage_paths="$4"
  {
    LC_ALL=C comm -12 \
      <(git diff --name-only "${main_commit}^{tree}" "$conflict_tree" | LC_ALL=C sort -u) \
      <(git diff --name-only "${release_commit}^{tree}" "$conflict_tree" | LC_ALL=C sort -u)
    printf '%s\n' "$stage_paths"
  } | sed '/^$/d' | LC_ALL=C sort -u
}

# Print one `::error::` line per entry of a newline-separated list, safely for paths with spaces.
resolution_list() {
  local entry
  while IFS= read -r entry; do
    [ -n "$entry" ] || continue
    echo "::error::  ${entry}"
  done <<<"$1"
}

# Decide a supplied resolution. Returns 0 to accept, 1 to REFUSE, 2 for UNVERIFIABLE.
#
# Every check fails closed, each names what failed and the remedy, and each prints the difference it
# found. None of them reads the allow_content override or prints its hint: a resolution is not an
# override, and a refusal here is not the kind of thing an operator can vouch for.
verify_resolution() {
  local resolution p1 p2 head_sha head_tree conflict_tree merge_tree_output merge_tree_status
  local stage_paths permitted changed reached_beyond path oid markers invented

  if [ -z "$RESOLUTION_REF" ]; then
    echo "::error::the forward-port's own merge commit cannot be established to introduce nothing of its own (${OWN_MERGE}), so it is refused. A conflicted re-merge means the merge embeds a human resolution, and a parent count other than two means there is no two-parent re-merge to compare it against."
    echo "::error::allow_content does NOT override this. An operator can only vouch for content that exists somewhere to be reviewed; a conflict resolution's own invention exists nowhere else."
    echo "::error::A conflicted forward-port is completed by SUPPLYING that resolution instead: dispatch this workflow with resolution_ref naming a commit whose parents are exactly the current origin/main and origin/release, and resolution_effect naming the outcome it is expected to produce. Every check of it is made here, and none of them is overridable."
    return 1
  fi

  p1="$(git rev-parse origin/main)"
  p2="$(git rev-parse origin/release)"
  head_sha="$(git rev-parse HEAD)"

  # ── A0. THE DECLARED OUTCOME IS ONE OF THE TWO THINGS IT MAY BE ───────────────────────────────
  # Checked FIRST, and A8 below carries a refusing catch-all on the same value, because A8 is a
  # two-arm `case`: a typo matching neither arm would skip it entirely and leave the resolution
  # unconstrained on the one check that reads the operator's declaration. Fail-open by omission.
  case "$RESOLUTION_EFFECT" in
  no-content-onto-main | content-onto-main) ;;
  *)
    echo "::error::resolution_effect is '${RESOLUTION_EFFECT:-(empty)}', which names no outcome this can establish. It must be exactly 'no-content-onto-main' (the completed forward-port leaves main's content unchanged, which is the squash-collision case) or 'content-onto-main' (it carries content onto main, which is the hotfix bring-back case). Both resolution inputs are required together, and neither has a usable default: the fail-closed default is no resolution path at all."
    return 1
    ;;
  esac

  # ── A1. THE RESOLUTION IS PRESENT IN THIS REPOSITORY ──────────────────────────────────────────
  if ! resolution="$(git rev-parse --verify --quiet "${RESOLUTION_REF}^{commit}")"; then
    echo "::error::resolution_ref '${RESOLUTION_REF}' does not resolve to a commit in this repository, so nothing about the resolution could be read at all. That is UNVERIFIABLE rather than refused, and no override applies to it, because there is no established refusal to vouch for. Push the resolution to this repository — as a branch, never to main — and dispatch again with its sha."
    return 2
  fi

  # ── A2. THE RESOLUTION IS PINNED TO THE STATE IT RESOLVED ─────────────────────────────────────
  # The load-bearing check of the whole design. The push-retry path re-fetches origin/main and
  # re-performs the merge; without this pin a retry after main moved would take the stale
  # resolution's tree VERBATIM and silently delete whatever main gained in the meantime — on the one
  # push that bypasses pull-request review. Comparing the whole topology line pins the parent COUNT
  # and their ORDER in a single comparison.
  if [ "$(git rev-list --parents -n 1 "$resolution")" != "${resolution} ${p1} ${p2}" ]; then
    echo "::error::the supplied resolution was not produced against the state this run is merging, so applying it would silently discard whatever the other line gained in the meantime. It is refused rather than reapplied."
    echo "::error::  resolution ${resolution} records parents: $(git rev-list --parents -n 1 "$resolution" | cut -d' ' -f2-)"
    echo "::error::  this run requires exactly:               ${p1} ${p2}   (origin/main then origin/release)"
    echo "::error::The remedy is to recompute the resolution against the CURRENT origin/main and dispatch again. If this is the push retry, note that a conflicted forward-port has no retry at all: the retry exists because main moved, and a moved main is precisely what invalidates a pinned resolution."
    return 1
  fi

  # ── A3. THE MERGE THIS RUN WOULD PUSH IS THE ONE BEING CHECKED ────────────────────────────────
  # A2 is the only check establishing anything about the resolution's own provenance; A3 and A4
  # check the output of the completion script this same change authors, so each must be able to fail
  # on its own rather than only through that script.
  if [ "$(git rev-list --parents -n 1 HEAD)" != "${head_sha} ${p1} ${p2}" ]; then
    echo "::error::HEAD is not the merge this run is supposed to be pushing: its parents are not exactly origin/main then origin/release, so the commit that would land is not the one every other check here is about."
    echo "::error::  HEAD ${head_sha} records parents: $(git rev-list --parents -n 1 HEAD | cut -d' ' -f2-)"
    echo "::error::  this run requires exactly:       ${p1} ${p2}   (origin/main then origin/release)"
    return 1
  fi

  # ── A4. THE PUSHED TREE IS THE REVIEWED TREE ──────────────────────────────────────────────────
  head_tree="$(git rev-parse "HEAD^{tree}")"
  if [ "$head_tree" != "$(git rev-parse "${resolution}^{tree}")" ]; then
    echo "::error::the tree this run would push is not the resolution's tree, so what would land on main is something the runner produced rather than the content that was reviewed. This is the difference:"
    git diff --stat "${resolution}^{tree}" "$head_tree"
    echo "::error::The remedy is to re-run the forward-port so the merge is rebuilt from the resolution's tree, and to review any local modification the runner may have made to the working tree."
    return 1
  fi

  # ── THE RE-MERGE THE REMAINING CHECKS ARE MEASURED AGAINST ────────────────────────────────────
  # `git merge-tree --write-tree` EXITS 1 on conflict, which is the expected outcome here, so its
  # status is captured exactly as merge_content_status captures it. Left uncaptured, `set -e` would
  # end the script mid-check with no message at all.
  merge_tree_output="$(git merge-tree --write-tree "$p1" "$p2")" && merge_tree_status=0 ||
    merge_tree_status=$?
  if [ "$merge_tree_status" -eq 0 ]; then
    echo "::error::origin/main and origin/release merge CLEANLY, so there was no conflict for a resolution to resolve — yet HEAD records a merge that does not reproduce from its parents. Nothing here can be established, so this is unverifiable. Re-run the forward-port with no resolution inputs."
    return 2
  fi
  if [ "$merge_tree_status" -ne 1 ]; then
    echo "::error::'git merge-tree --write-tree' exited ${merge_tree_status}, which is neither a clean merge nor a conflict, so the set of paths a resolution may alter could not be established. That is unverifiable rather than a refusal."
    return 2
  fi
  conflict_tree="${merge_tree_output%%$'\n'*}"

  # The conflicted paths are the stage entries printed after the tree oid, one per line as
  # `<mode> <object> <stage>` TAB `<path>`.
  stage_paths="$(printf '%s\n' "$merge_tree_output" |
    awk -F'\t' '$1 ~ /^[0-7]{6} [0-9a-f]{40,64} [123]$/ { print $2 }' | LC_ALL=C sort -u)"
  permitted="$(resolution_permitted_paths "$conflict_tree" "$p1" "$p2" "$stage_paths")"

  # ── A5. THE RESOLUTION REACHED NO FURTHER THAN THE CONFLICT ───────────────────────────────────
  changed="$(git diff --name-only "$conflict_tree" "$head_tree" | sed '/^$/d' | LC_ALL=C sort -u)"
  reached_beyond="$(LC_ALL=C comm -23 <(printf '%s\n' "$changed" | sed '/^$/d') \
    <(printf '%s\n' "$permitted" | sed '/^$/d'))"
  if [ -n "$reached_beyond" ]; then
    echo "::error::the resolution alters content the two lines could be combined on automatically, and that content has been reviewed nowhere. A resolution is confined to what could not be combined:"
    resolution_list "$reached_beyond"
    echo "::error::The only paths it may alter are those the automatic merge composed or could not settle:"
    resolution_list "$permitted"
    echo "::error::The remedy is to recompute the resolution, changing nothing outside that set, and dispatch again."
    return 1
  fi

  # ── A6. NO UNRESOLVED DIFFERENCE SURVIVES ─────────────────────────────────────────────────────
  # Anchored to git's actual marker form — a seven-character run at column 0 followed by a space or
  # the end of the line — rather than to a substring, because prose about conflicts (this
  # repository's own contributing guide included) legitimately contains those characters.
  # A path the resolution DELETED has no blob to read. That is a resolution this design intends to
  # support, so it is skipped rather than allowed to end the check under `set -euo pipefail`.
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    oid="$(resolution_blob_oid HEAD "$path")"
    [ -n "$oid" ] || continue
    markers="$(git cat-file blob "$oid" | grep -c -E '^(<{7}|\|{7}|={7}|>{7})( |$)' || true)"
    if [ "${markers:-0}" -gt 0 ]; then
      echo "::error::${path} still carries ${markers} line(s) marking a difference that was never resolved, so a partially-resolved file would land on main. Finish resolving it, recompute the resolution, and dispatch again."
      return 1
    fi
  done <<<"$permitted"

  # ── A7. NO LINE WAS TYPED THAT NEITHER SIDE CONTAINS ──────────────────────────────────────────
  # Exactly that, and nothing more. It establishes nothing about duplication, reordering or deletion,
  # nor about an invented line that also appears elsewhere in the same file — a duplicate is by
  # definition made of lines both sides already have. It is cheap, and it does catch genuinely
  # invented text inside a conflicted hunk, which is why it stays.
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    [ -n "$(resolution_blob_oid HEAD "$path")" ] || continue
    invented="$(LC_ALL=C comm -23 <(resolution_blob_lines HEAD "$path") \
      <({
        resolution_blob_lines "$p1" "$path"
        resolution_blob_lines "$p2" "$path"
      } | LC_ALL=C sort -u) | sed -n '1,20p')"
    if [ -n "$invented" ]; then
      echo "::error::${path} contains lines present in neither origin/main's nor origin/release's version of it, so that content has been reviewed nowhere:"
      resolution_list "$invented"
      echo "::error::A resolution may only choose between what the two lines already contain. If the correct resolution genuinely requires a line neither line has, this path cannot complete it: land that line on the release line through a reviewed pull request first, and forward-port afterwards."
      return 1
    fi
  done <<<"$permitted"

  # ── A8. THE DECLARED OUTCOME HOLDS ────────────────────────────────────────────────────────────
  # The one place the operator makes a claim, and the claim is CHECKED rather than believed. It is
  # what catches the v1.9.1 duplication shape: git appended release's copy of a test beside main's
  # identical one with no marker, so it is present in a parent (A7 passes it) and inside the
  # permitted set (A5 passes it) — but the operator declared "main already carries this", and a tree
  # that is not main's falsifies that declaration.
  #
  # KNOWN LIMITATION, stated rather than smoothed over: this binds only under
  # `no-content-onto-main`. Under `content-onto-main` — the ordinary declaration for a hotfix
  # bring-back — a duplication landing inside a permitted path passes every check here. The
  # resolution's own pull request against main is where a human sees that, which is why the runbook
  # requires one.
  case "$RESOLUTION_EFFECT" in
  no-content-onto-main)
    if [ "$head_tree" != "$(git rev-parse "${p1}^{tree}")" ]; then
      echo "::error::the resolution was declared 'no-content-onto-main', but the completed forward-port's tree is not origin/main's tree, so it WOULD change main's content. This is the difference it would carry:"
      git diff --stat "${p1}^{tree}" "$head_tree"
      echo "::error::Either the resolution is wrong or the declaration is. If this content is meant to reach main, declare 'content-onto-main' and it will be decided on its change provenance like any other forward-port content."
      return 1
    fi
    ;;
  content-onto-main)
    if [ "$head_tree" = "$(git rev-parse "${p1}^{tree}")" ]; then
      echo "::error::the resolution was declared 'content-onto-main', but the completed forward-port's tree is identical to origin/main's, so it would carry nothing at all. Either the resolution dropped what the release line was supposed to bring back, or the declaration should be 'no-content-onto-main'."
      return 1
    fi
    ;;
  *)
    echo "::error::resolution_effect '${RESOLUTION_EFFECT:-(empty)}' names no outcome this can establish, so the resolution would be unconstrained on the only check that reads the operator's declaration. Refused."
    return 1
    ;;
  esac

  echo "::notice::the supplied resolution ${resolution} is accounted for: it is pinned to this run's origin/main and origin/release, its tree is the one that would be pushed, it alters nothing outside what the automatic merge could not settle, it leaves no unresolved difference behind, it introduces no line neither line contains, and its declared outcome '${RESOLUTION_EFFECT}' holds. Every other obligation of a forward-port still applies below."
  return 0
}

# ── 1. OWN-MERGE GUARD ──────────────────────────────────────────────────────────────────────────
OWN_MERGE="$(merge_content_status HEAD)"
case "$OWN_MERGE" in
content-free) ;;
"parent-count 0" | "parent-count 1")
  # `git merge --no-ff` reports "Already up to date." and creates NO commit when the freshly fetched
  # origin/main already contains origin/release — which the retry path can genuinely reach. HEAD is
  # then whatever was already there, this run merged nothing, and there is no own merge to guard.
  # Failing here would fail a run, non-overridably, for having had nothing to do.
  echo "::notice::HEAD is not a merge commit (${OWN_MERGE}), so this run created no merge of its own to guard."
  ;;
"carries-content "*)
  echo "::error::the forward-port's own merge commit introduces content present in none of its parents, so that content has been reviewed nowhere. Re-merging its two parents produces a different tree, and this is the difference:"
  git diff --stat "${OWN_MERGE#carries-content }" "HEAD^{tree}"
  echo "::error::allow_content does NOT override this. An operator can only vouch for content that exists somewhere to be reviewed; a conflict resolution's own invention exists nowhere else."
  exit 1
  ;;
remerge-conflicted)
  # The seam a conflicted forward-port's recovery attaches to. With no resolution supplied this
  # refuses exactly as the catch-all below always has; with one supplied, every check of it is made
  # here and any of them can refuse. The resolution is NOT waved through: it is verified by
  # post-merge assertions of its own, or it is refused.
  verify_resolution && RESOLUTION_VERDICT=0 || RESOLUTION_VERDICT=$?
  if [ "$RESOLUTION_VERDICT" -ne 0 ]; then
    exit "$RESOLUTION_VERDICT"
  fi
  ;;
*)
  echo "::error::the forward-port's own merge commit cannot be established to introduce nothing of its own (${OWN_MERGE}), so it is refused. A conflicted re-merge means the merge embeds a human resolution, and a parent count other than two means there is no two-parent re-merge to compare it against."
  echo "::error::allow_content does NOT override this. An operator can only vouch for content that exists somewhere to be reviewed; a conflict resolution's own invention exists nowhere else."
  exit 1
  ;;
esac

# ── 2. FAST PATH ────────────────────────────────────────────────────────────────────────────────
CONTENT=$(git diff --stat origin/main)
if [ -z "$CONTENT" ]; then
  echo "Content gate passed: this forward-port carries no file changes onto main."
  exit 0
fi

echo "origin/release carries content origin/main does not, so this forward-port would push file changes to main:"
echo "$CONTENT"
echo "Establishing mechanically that every commit it carries was reviewed against the release line."

RANGE_SIZE=$(git rev-list --count "$RANGE")
if [ "$RANGE_SIZE" -gt "$MAX_COMMITS" ]; then
  echo "::error::the forward-port range ${RANGE} carries ${RANGE_SIZE} commits, above the ${MAX_COMMITS}-commit cap. That is an unexpected shape for this operation, so it is reported as unverifiable rather than verified one commit at a time."
  exit 2
fi

# ── 3. COLLECT THE EVIDENCE ─────────────────────────────────────────────────────────────────────
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/merges" "$WORK/pulls"

# `%H %P` is the same topology `git rev-list --parents` prints, plus the author and subject a
# refusal message names. The tabs keep a subject containing spaces intact.
git log --format='%H %P%x09%an%x09%s' "$RANGE" >"$WORK/commits.txt"

# The evidence loop is driven by commits.txt ITSELF, never by a second git invocation over the same
# range. Two invocations agree today, and their failure directions are not symmetric: a commit in
# commits.txt with no evidence fails closed, while a commit the verifier never sees — because it was
# in the second listing and not in commits.txt — is silently never decided at all. One list, written
# once and read twice, cannot diverge.
while IFS= read -r LINE; do
  [ -n "$LINE" ] || continue
  SHA="${LINE%% *}"
  merge_content_status "$SHA" >"$WORK/merges/$SHA.txt"
  # A failed read is NOT swallowed and NOT treated as "no association". `gh` USUALLY writes the
  # API's own error payload to the file, and the verifier reports that as unverifiable (exit 2) with
  # the rate-limit and permissions cases named apart — so it is KEPT when it is there, because it is
  # the more useful diagnosis by far. It is not always there: a failure before any response, or a
  # partial write, can leave the file empty or holding a bare `[]`, and either would read as "this
  # commit has no pull request" — the substitution this whole gate exists to refuse. So the file is
  # replaced only when what it holds could be mistaken for an answer.
  # `</dev/null` keeps `gh` off this loop's stdin.
  if ! gh api "repos/${GITHUB_REPOSITORY}/commits/${SHA}/pulls?per_page=${PER_PAGE}" >"$WORK/pulls/$SHA.json" </dev/null; then
    echo "::warning::the pull-request association read for ${SHA} did not succeed; the verifier will report this forward-port as unverifiable rather than unaccounted."
    case "$(cat "$WORK/pulls/$SHA.json")" in
    *'"message"'*) ;;
    *) printf '{"message":"the association read for %s exited non-zero and left no error payload behind; gh reported the reason on this job log"}\n' "$SHA" >"$WORK/pulls/$SHA.json" ;;
    esac
  fi
done <"$WORK/commits.txt"

# ── 4. DECIDE ───────────────────────────────────────────────────────────────────────────────────
# `set +e` around the invocation is load-bearing: under `set -e` a refusal would abort the script
# before its exit status could be read, and the override branch below would become unreachable.
set +e
node "$VERIFIER" "$WORK/commits.txt" "$WORK/merges" "$WORK/pulls" "--repository=${GITHUB_REPOSITORY}" "--accepted-bases=${ACCEPTED_BASES}" "--per-page=${PER_PAGE}" "--max-commits=${MAX_COMMITS}"
VERDICT=$?
set -e

if [ "$VERDICT" -eq 0 ]; then
  echo "Content gate passed: every commit this forward-port carries is attributable to a reviewed pull request against the release line, or is a merge introducing nothing of its own."
  exit 0
fi

# The override is bounded to verdict 1 — a REFUSAL, in which the verifier established what the
# content is and could not attribute it. Every other non-zero verdict is the UNVERIFIABLE class: a
# 403 from the release-bot App installation missing `Pull requests: Read` (the single most likely
# first-run failure of this whole feature), a rate-limited read, an unreadable evidence file, an
# association naming another repository, a possibly-truncated page, a range above the cap — or
# `node` missing from the runner, which exits 127. Offering `allow_content` there would ask an
# operator to vouch for content nothing has described to them, and printing OVERRIDE_HINT there
# would tell them to do it: an absence of evidence accepted as an absence of unreviewed content,
# which is the one substitution this change exists to remove. So both live inside this branch.
if [ "$VERDICT" -eq 1 ]; then
  if [ "${ALLOW_CONTENT:-false}" = "true" ]; then
    echo "::warning::allow_content was set, so the content gate's refusal is overridden. The refusal it overrode is printed above, and the forward-port carries these file changes onto main:"
    echo "$CONTENT"
    exit 0
  fi
  echo "::error::this forward-port would carry file content onto main that it could not attribute to a reviewed pull request against the release line. ${OVERRIDE_HINT:-}"
  exit 1
fi

echo "::error::the content gate could not COMPLETE its verification (verifier exit ${VERDICT}), so nothing about this forward-port's change provenance was established — neither that it is clear nor that it is unaccounted. allow_content does not apply: there is no established refusal to vouch for. The verifier's message above names the class; the usual causes are the release-bot App installation missing its 'Pull requests: Read' permission (a 403, a configuration fault no retry fixes), a rate-limited read (transient — re-run), and a runner with no 'node' on PATH (exit 127)."
exit "$VERDICT"
