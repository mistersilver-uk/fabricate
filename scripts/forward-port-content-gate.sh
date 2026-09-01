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
