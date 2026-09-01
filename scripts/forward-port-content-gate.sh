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
#   1. OWN-MERGE GUARD. The forward-port's own merge commit must introduce nothing present in none of
#      its parents. This is the only check that looks at the merge the ruleset-bypassing push
#      actually lands, and it is NOT overridable: `allow_content` lets an operator vouch for content
#      that exists somewhere to be reviewed, and content invented by a conflict resolution was
#      reviewed nowhere at all.
#   2. FAST PATH. When the merge carries no file content onto `main`, no unreviewed content can reach
#      `main` and no API call is needed. The routine forward-port stays free, exactly as before.
#   3. CHANGE PROVENANCE. Otherwise, collect the range, the per-merge combined diffs and the
#      per-commit pull-request associations, and let `scripts/forward-port-provenance.mjs` decide.
#      Its exit status decides this script's, which decides the job's.
#
# The range is `origin/main..origin/release`, NEVER `origin/main..HEAD`. By the time this runs, HEAD
# is the bot's own merge commit, which is by definition from no pull request; including it would
# guarantee a refusal. The range is stable before and after the merge and is recomputed here on the
# retry path against the freshly fetched `origin/main`.
#
# `--no-commit-id` on `git diff-tree --cc` is MANDATORY, not tidiness. Without it the command prints
# the commit id as a header line, so an "is the output empty" check reads that sha as a changed
# filename and concludes the merge carries content — refusing EVERY merge, including the ordinary
# `--no-ff` promote merges the content-free rule exists to admit. A gate that always refuses is as
# broken as one that never does, and much harder to notice in a path that rarely runs.
#
# Environment (all supplied by the calling step through `env:`, never interpolated into a shell body
# — githubactions:S7630):
#   GH_TOKEN           the App installation token; `gh api` authenticates with it, never GITHUB_TOKEN
#   GITHUB_REPOSITORY  `<owner>/<name>`; an association naming any other repository is refused
#   ALLOW_CONTENT      "true" overrides a refusal, after printing the refusal it overrode
#   OVERRIDE_HINT      the caller-composed remedy clause appended to a refusal
#   ACCEPTED_BASES     comma-separated base refs a merged pull request may target (default: release)
#   PER_PAGE           association page size; a FULL page is treated as possibly truncated
#   MAX_COMMITS        the largest range shape this will decide

set -euo pipefail

RANGE="origin/main..origin/release"
ACCEPTED_BASES="${ACCEPTED_BASES:-release}"
PER_PAGE="${PER_PAGE:-100}"
MAX_COMMITS="${MAX_COMMITS:-200}"

# ── 1. OWN-MERGE GUARD ──────────────────────────────────────────────────────────────────────────
OWN_MERGE=$(git diff-tree --cc -r --no-commit-id --name-only HEAD)
if [ -n "$OWN_MERGE" ]; then
  echo "::error::the forward-port's own merge commit introduces content present in none of its parents, so that content has been reviewed nowhere:"
  echo "$OWN_MERGE"
  echo "::error::allow_content does NOT override this. An operator can only vouch for content that exists somewhere to be reviewed; a conflict resolution's own invention exists nowhere else."
  exit 1
fi

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
mkdir -p "$WORK/diffs" "$WORK/pulls"

# `%H %P` is the same topology `git rev-list --parents` prints, plus the author and subject a
# refusal message names. The tabs keep a subject containing spaces intact.
git log --format='%H %P%x09%an%x09%s' "$RANGE" >"$WORK/commits.txt"

while IFS= read -r SHA; do
  [ -n "$SHA" ] || continue
  git diff-tree --cc -r --no-commit-id --name-only "$SHA" >"$WORK/diffs/$SHA.txt"
  # A failed read is NOT swallowed and NOT treated as "no association": `gh api` writes the API's
  # error payload to the file, and the verifier reports it as unverifiable (exit 2) with the
  # rate-limit and permissions cases named apart.
  if ! gh api "repos/${GITHUB_REPOSITORY}/commits/${SHA}/pulls?per_page=${PER_PAGE}" >"$WORK/pulls/$SHA.json"; then
    echo "::warning::the pull-request association read for ${SHA} did not succeed; the verifier will report this forward-port as unverifiable rather than unaccounted."
  fi
done < <(git rev-list "$RANGE")

# ── 4. DECIDE ───────────────────────────────────────────────────────────────────────────────────
# `set +e` around the invocation is load-bearing: under `set -e` a refusal would abort the script
# before its exit status could be read, and the override branch below would become unreachable.
set +e
node scripts/forward-port-provenance.mjs "$WORK/commits.txt" "$WORK/diffs" "$WORK/pulls" "--repository=${GITHUB_REPOSITORY}" "--accepted-bases=${ACCEPTED_BASES}" "--per-page=${PER_PAGE}" "--max-commits=${MAX_COMMITS}"
VERDICT=$?
set -e

if [ "$VERDICT" -eq 0 ]; then
  echo "Content gate passed: every commit this forward-port carries is attributable to a reviewed pull request against the release line, or is a merge introducing nothing of its own."
  exit 0
fi

if [ "${ALLOW_CONTENT:-false}" = "true" ]; then
  echo "::warning::allow_content was set, so the content gate is overridden. The refusal it overrode is printed above (verifier exit ${VERDICT}), and the forward-port carries these file changes onto main:"
  echo "$CONTENT"
  exit 0
fi

echo "::error::this forward-port would carry file content onto main that it could not attribute to a reviewed pull request against the release line (verifier exit ${VERDICT}). ${OVERRIDE_HINT:-}"
exit "$VERDICT"
