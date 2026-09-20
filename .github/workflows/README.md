# CI workflows

The narrative for every workflow in this directory, moved here from `CONTRIBUTING.md` so it sits beside the YAML it describes (issue #1661).

## Conventional Commits gate

Job: `lint-commits` in `.github/workflows/ci.yml`

Runs on every pull request.
Validates all commits in the PR using `commitlint` and checks that the PR title itself also follows the Conventional Commits format.

## Foundry integration workflow

File: `.github/workflows/foundry-integration.yml`

Runs:

- As a reusable workflow (`workflow_call`) invoked by the release pipeline — `beta.yml` and `release.yml` — with `require_credentials: true`.
- On manual trigger via `workflow_dispatch`.

It has no `push` or `schedule` trigger; the release workflows call it, and that is the only automatic path.
The `require_credentials` input is load-bearing: with it unset the job SKIPS green when `FOUNDRY_USERNAME` / `FOUNDRY_PASSWORD` are absent, so a release publish must pass `require_credentials: true` or it could ship on a build whose smoke test silently never ran.
If the smoke test fails, the workflow opens (or comments on an existing) GitHub Issue labelled `foundry-smoke-failure`.
Requires two repository secrets: `FOUNDRY_USERNAME` and `FOUNDRY_PASSWORD`.

## Beta workflow

File: `.github/workflows/beta.yml`

Trigger: push to `main`.

`main` is the prerelease line, so `semantic-release` computes a `-beta.N` version for the pushed commit.
The `-beta.N` suffix is a **privacy mechanism, not a `!` breaking-change scheme**: because a stable version does not compare as newer than its own prereleases under Foundry's version check, publishing the eventual public `v1.5.0` never offers an update to a client sitting on `1.5.0-beta.N` — the **Version scheme** requirement.
Do not "clean up" the preid into anything Foundry orders above its GA, or the whole private cohort is offered the public build on its next update check.

Steps:

1. Run unit tests (`npm test`) and build.
2. Run the Foundry integration smoke test (via the reusable workflow, with `require_credentials: true` so the job fails rather than skipping green when Foundry credentials are unset).
3. Run `semantic-release` to determine the version bump and inject a `-beta.N` version into the built `dist/module.json`.
On `main` the config OMITS `@semantic-release/github` (see the allowlist in the Release pipeline section), so NO GitHub release object is created — that omission is what keeps the private beta channel private — and the config's `successCmd` writes `next_version`/`next_tag` to `$GITHUB_OUTPUT` as the version signal instead.
That write fires on every `success` lifecycle, including the addChannel phase, which reports a tag it did not mint, so a `Classify what this run minted` step runs immediately afterwards and only forwards a tag absent from a pre-run snapshot (issue #1864).
4. When `next_version` is non-empty, call `.github/workflows/release-s3.yml` with `channel: beta`, `tag: <next_tag>`, `dry_run: false`, and `overwrite: false`.
When `next_version` is empty (a push with no releasing commits), skip S3 publishing without failing the run.
The job's `next_version` and `next_tag` outputs are the classifier's, not `semantic-release`'s own, so they are also empty when `success` fired without minting anything, and that case is a `::notice::`, not a publish.

## Release workflow (early-access producer)

File: `.github/workflows/release.yml`

Trigger: push to `release` or to a hotfix line (`[0-9]+.[0-9]+.x`).

This is the **sole producer of the private early-access channel**.
`semantic-release` mints the STABLE version for the pushed commit and — because the github plugin IS loaded here with `draftRelease: true` — drafts its GitHub release with the zip and `module.json` as assets.
Nothing is made public: the release is a DRAFT and only a private channel receives the artefact.

- On `release` the channel is `early-access`.
- On a hotfix line the channel is that line's own name (`${{ github.ref_name }}`), NEVER `early-access` — a hotfix must not be offered to patrons.
A hotfix line is semantic-release's `'maintenance'` branch *type*; in our vocabulary it is always a **hotfix line**, and its channel keeps **no cohort** (it exists only so a hotfix can be published, guarded, and promoted, with CI and smoke but no soak).

A `workflow_dispatch(tag)` re-entry point exists because a push run can mint the tag and draft but then fail the S3 publish; without re-entry the channel would never carry the version and the promotion's guard would refuse it forever.

**A run that mints nothing publishes nothing (issue #1864).**
`semantic-release`'s `success` lifecycle also fires when its addChannel phase re-adds an already-released version to a newly-cut line's channel, and that case mints no new tag.
Cutting a hotfix line from a published version's tag used to trip exactly this: pushing the freshly cut branch reported the base version "published to its channel" before any fix had landed.
A `Snapshot the tags that exist before this run` step, placed after the tag fetch and before `semantic-release`, records `git tag --list`.
A `Classify what this run minted` step right after `semantic-release` compares `$next_tag` against that snapshot and only forwards it, as the job's `next_version`/`next_tag` outputs, when it is absent from the snapshot.
`publish-s3`, `verify-publish` and `forward-port` all read those outputs, so a run that minted nothing publishes nothing, skips every one of those jobs, and states the case as a `::notice::` instead of reporting a publish.

**It also schedules the forward-port.**
A final `forward-port` job calls the shared `.github/workflows/forward-port.yml`, gated on `if: always() && github.ref_name == 'release' && needs.verify-publish.result == 'success'`.
Every conjunct is load-bearing.
`always()` is required because `semantic-release` is *skipped* on the `workflow_dispatch(tag)` re-entry path and a skipped `need` fails the implicit `success()`; because `always()` disables that wrapping entirely, the `verify-publish` conjunct is the only thing preventing a forward-port after a **failed** publish.
`github.ref_name == 'release'` is the hotfix exclusion — a hotfix leaves its line by cherry-pick, never a release-into-`main` merge.
A job-level `if:` is safe here (unlike in `promote-to-public.yml`) because nothing in this workflow depends on this job's result.

The job passes an `expected_tag`, and it is not decoration.
This run's gate is on *its own* publish, but the merge acts on `origin/release`'s **current tip**, and on the re-entry path those differ: republishing an older tag successfully satisfies the gate while a newer commit on `release` still has a failing publish, and merging that tip would number `main` above a version no channel advertises.
When `expected_tag` does not point at `origin/release`'s tip the callee **skips and reports success**, printing both the expected tag and the tags actually found.
Nothing is stranded by that skip: the merge takes `origin/release`'s whole tip rather than one tag, and the re-run no-op compares branches rather than tags, so the next successful release-line publish carries everything the skipped run would have.

## The forward-port workflow

File: `.github/workflows/forward-port.yml`

One implementation, three entry points (`workflow_call` and `workflow_dispatch` in one file, with **job-level** `concurrency` so it survives being called):

1. `release.yml` calls it after `verify-publish`, on the `release` line only — the scheduling point that keeps the prerelease line numbered above what is published.
2. `promote-to-public.yml` job 2 calls it as a **confirming backstop**; `release` is normally already an ancestor of `main` by then, so it takes the ancestry no-op.
3. A manual `workflow_dispatch` is the standing recovery lever, and the only thing that can unjam a prerelease line that has already fallen below a published stable version — **without promoting anything to `public`**.

It merges `origin/release` into `main` with `--no-ff` (never a squash: `release` carries semantic-release's tags and notes) under a `chore:` subject (which must not be a releasing Conventional Commit type), and pushes as the ruleset-bypass App installation token — never `GITHUB_TOKEN`, which is neither the bypass actor nor able to trigger the downstream `beta.yml` run.
Two guards short-circuit it, both through step **outputs** and neither ever failing the job: `git merge-base --is-ancestor origin/release origin/main` (already forward-ported) and `git tag --points-at origin/release` (the `expected_tag` check above).
A guard that failed the job would turn a legitimate no-op into a red release run, which is exactly what the `enabled` no-op design exists to avoid.

The `enabled` input, not a job-level `if:`, is how a caller no-ops it.
`promote-to-public.yml` job 4's `if:` requires `needs.forward-port.result == 'success'`, and a *skipped* job reports `skipped` — so job 2 carries no job-level `if:` and passes `enabled: ${{ inputs.source_channel == 'early-access' }}` instead.
Every step after the skip notice is gated so it evaluates false when `enabled` is false, under either value of `dry_run`; `tests/forward-port-workflow.test.js` *evaluates* those conditions rather than string-matching them, because a hotfix promotion that silently merged `release` into `main` would be the repository's worst automated write.

A dispatched forward-port defaults to `dry_run: true` (it is a hand-run lever pointed at `main`); a called one defaults to `false` (its caller states its intent).

### The content gate — a verification, not a question

The gate used to print the diff and ask a human to "confirm that every file listed above was authored through a reviewed pull request", then re-run with `allow_content: true`.
That was an unverified human assertion, and it was the exception to this repository's own standard — `scripts/lib/promoteGuards.js` insists enforcement "MUST be a verification performed by the promotion, never an assumption".
It also rested on a premise a hotfix falsifies by definition: `release` is **not** content-empty by construction once a fix has landed on it, and shipping v1.9.1 and v1.9.2 produced both of that premise's failure modes on the same day.

The gate now establishes the answer itself.
`scripts/forward-port-content-gate.sh` owns it, and both call sites invoke that one script: the first-pass gate step, and the push retry, which re-performs the merge against a freshly fetched `main` and is therefore a second merge no gate has otherwise seen.
It runs four checks, in this order.

**First, git must be able to answer the question.**
The predicate below needs `git merge-tree --write-tree`, which arrived in git 2.38, so the gate asserts that version and refuses if it is not met.
There is deliberately no fallback: the obvious one is the predicate described immediately below, which answers a different question.

**Second, the forward-port's own merge must introduce nothing.**
Its two parents are re-merged with `git merge-tree --write-tree`, and the resulting tree must be *identical* to the tree the merge recorded.
Equal means the merge is precisely what an unattended three-way merge of its parents produces, so it invented nothing; unequal means it carries something neither parent has, and the refusal prints exactly that difference.
A re-merge that *conflicts* is also a refusal — the recorded merge necessarily embeds a human resolution — and so is a parent count other than two, because there is then no two-parent re-merge to compare against.
A HEAD that is not a merge at all is **not** a refusal: on the retry path `git merge --no-ff` reports "Already up to date." and creates no commit, and failing a run for having had nothing to do would be a non-overridable jam.
This is the only check that looks at the merge the ruleset-bypassing push actually lands, and `allow_content` does **not** override it: an operator can only vouch for content that exists somewhere to be reviewed, and content invented by a conflict resolution exists nowhere else.

**Why not the combined diff.**
This check was originally `git diff-tree --cc -r --no-commit-id --name-only HEAD` being empty, and that command cannot express the question.
`--name-only` follows the `-c` *file* selection — "files modified from all parents" — and `--cc`'s hunk compression only ever affects *patch* output, so it never reaches the name list.
A clean auto-merge in which one file took hunks from both sides, and a genuine evil merge of the same two parents, print exactly the same thing.
Of the last 38 merges reachable from `origin/main`, five have a non-empty combined diff and every one of them invented nothing — two on `CHANGELOG.md`, which is the release path itself.
Since "both lines touched a common file" is the ordinary reason a forward-port exists at all, that predicate refused the routine case, non-overridably, on a branch that forbids landing the merge by pull request.

**Third, the fast path.**
`git diff --stat origin/main` empty means the merge carries no file content onto `main`, so no unreviewed content can reach it and no API call is made.
The routine forward-port is unchanged and free.

**Fourth, change provenance.**
Otherwise the script collects the range `origin/main..origin/release` (never `origin/main..HEAD` — by then `HEAD` is the bot's own merge commit, which comes from no pull request, so including it would guarantee a refusal), the per-commit merge-content verdicts, and each commit's associated pull requests, and hands them to `scripts/forward-port-provenance.mjs`.
The evidence loop is driven by the same commit listing the verifier is given, so the set of commits decided and the set collected cannot diverge.
The API read authenticates as the App installation token, never `GITHUB_TOKEN`; the job holds only `contents: read`.
A commit is accounted for when either rule holds:

- **pull-request authored** — associated with a **merged** pull request whose base is `release`.
Merged-ness is read from `merged_at`, because the REST payload carries no `merged` boolean and reports `state: "closed"` for a merged pull request and an abandoned one alike.
Being reviewed against a *different* line does not count: that review was never a review for landing on this one.
- **content-free merge** — two parents whose re-merge reproduces the merge's own tree exactly, so it introduces nothing beyond what its parents already carry.
This rule is a requirement rather than a loophole: `promote-to-early-access.yml` merges each beta tag into `release` with `--no-ff` under the App token, and that merge is associated with no pull request at all, so a gate demanding one would red every routine release.
A merge that fails this rule is not refused outright — a merge commit closing a reviewed pull request based on `release` *was* reviewed, its resolution included — so it falls to the rule above, and a refusal then names both halves of why it was not accounted for.

Anything else is refused by sha, with its subject, its author, and which rule it failed.

Every unverifiable state — an unreadable evidence file, an API error, a rate limit, a page that may be truncated, an association naming another repository, a range above 200 commits, a `per_page` above the 100 GitHub honours, a git too old for the predicate — exits 2 and refuses, because an absence of evidence is not an absence of unreviewed content.
`allow_content` does **not** apply to any of them, and the override hint is not printed under them either: there is no established refusal to vouch for, and telling a reader to override a state that established nothing is how an absence of evidence gets accepted as an absence of unreviewed content.
The first-run failure most likely to reach this branch is the release-bot App installation missing **Pull requests: Read**, which is a 403 and a configuration fault no retry fixes.

**Known limitation.**
The rule catches content introduced by a *resolution*.
It does not catch an additive semantic duplicate: two sides independently adding the same test in different places merge cleanly, the re-merge reproduces the tree exactly, and every hunk is attributable to one parent.
That is the v1.9.1 shape, and it is handled by the process rule below rather than by the gate.

**Land on `release` first; never squash onto `main` first.**
When a release-line fix reaches `main` first as a squash, identical content carries a different SHA, the forward-port's `git merge origin/release` conflicts, and the auto-resolution can silently duplicate whole hunks — which is exactly what happened in v1.9.1 and needed a hand-resolved repair PR.
Land the fix on `release` through its own reviewed pull request and let the forward-port carry it to `main`.

**When the gate refuses.**
Read the named commits.
The ordinary remedy is to give them the provenance they lack — open a pull request **based on `release`** carrying that content and merge it with a merge commit — and then re-run the forward-port, which will pass without any override.
`allow_content: true` survives as a last-resort override on `forward-port.yml`'s own dispatch, and it still prints the refusal it overrode; it is not the ordinary path, and it applies only to a refusal — never to a run that could not complete its verification.
From a promotion, that means dispatching `.github/workflows/forward-port.yml` manually (with `dry_run: false`) and then re-running the promotion, which then takes the already-forward-ported no-op.

`allow_content` is settable only on `forward-port.yml`'s own dispatch, and deliberately so: `promote-to-public.yml`'s inputs are `version` / `source_channel` / `dry_run` only, and it will not grow a content override.
That is the same composition the `override_hint` inputs carry into the failure message, so the message and this manual never disagree.

### Recovering a conflicted forward-port

`git merge --no-ff origin/release` can conflict, and until this existed the only recovery was a human resolving it by hand and pushing the merge to `main` — the one manual push `main`'s ruleset still has to allow.
The workflow now completes the merge itself from a resolution you supply.

**Is it a conflict, or a failure?**
`scripts/forward-port-complete-merge.sh` runs only when the merge fails, and says which it was.
A conflict prints `the forward-port's merge of origin/release into main CONFLICTED` followed by one `::error::` line per path that could not be combined.
Anything else prints `left no conflicting paths behind` and stops: an unreachable ref or an unreadable repository is not something a resolution fixes, so the resolution inputs are never consulted on that path.

**Produce the resolution.**
In a local clone, `git fetch origin main release`, `git checkout -B resolve origin/main`, `git merge --no-ff origin/release`, resolve the paths the job named, and `git commit`.
Do **not** push it to `main`.
Push the branch and **open a pull request against `main`** — this is required, not optional.
Its tree is exactly what `main` will look like afterwards, so `main`'s own CI runs on the resolved result and the pull request shows the whole forward-port diff.
It is also the only place a human sees the two things the gate cannot: a resolution that silently dropped what the release line was bringing back, and a duplication of content both lines already carry.
Do not merge that pull request; it exists to be read.
Then dispatch `.github/workflows/forward-port.yml` with `resolution_ref` set to the resolution's sha and `resolution_effect` set to its outcome.
Both inputs are required together, and both are dispatch-only — no caller can supply them.

**Choosing `resolution_effect`.**
It states the outcome the completed forward-port must produce, and the gate then establishes it rather than believing it.
Use `no-content-onto-main` when `main` already carries everything `release` has and the conflict is a squash collision — the completed merge must leave `main`'s content byte-identical.
Use `content-onto-main` when the forward-port genuinely brings content back, as a hotfix bring-back does.
The wrong one is refused with the difference printed, because a tree that differs from `main`'s falsifies the first claim and a tree identical to it falsifies the second.
A value that is neither is refused too: an unrecognised statement is one nothing checks.

**Rehearse it.**
`workflow_dispatch` defaults to `dry_run: true`, and a dry run performs the merge, completes it from your resolution, and runs the entire content gate including every check of the resolution — stopping only before the push.
It reports the exact commit it would push.
So the first use of this path on a real conflict is itself a full rehearsal whose blast radius is a red job.

**A moved `main` invalidates the resolution.**
The resolution is pinned to the exact `origin/main` and `origin/release` it was produced against, and is refused rather than reapplied if either has moved.
Without that pin, a run whose push was rejected would re-merge against the newer `main` and take the stale tree verbatim, silently deleting whatever `main` gained in the meantime.
The remedy is always to recompute the resolution against the current `origin/main` and dispatch again.
For the same reason a conflicted forward-port has no retry: the retry exists because `main` moved, which is exactly what invalidates the resolution.

**A resolution is not an override.**
`scripts/forward-port-content-gate.sh` still applies in full: the completed merge reaches the same provenance verification as any other, and `allow_content` overrides none of the resolution's own refusals — they live in the own-merge guard, upstream of it.
What the checks do establish is that the resolution reached no further than the conflict, invented no line neither side contains, left no unresolved difference behind, and produced the outcome you declared.
What they do not establish is that it kept everything `release` was bringing back, or that it did not duplicate content both sides already had — the latter only where the declaration is `no-content-onto-main`.
That is what the pull request above is for.

### The `release` branch ruleset

The gate above establishes that content reaching `main` was reviewed.
The ruleset is what makes that establishable at all: `release` carried **zero** rules until this was added, so a fix could be — and was — pushed straight to it, and nothing recorded that it had ever been reviewed.

The ruleset targets `refs/heads/release` with `enforcement: active` and the rules `pull_request`, `required_status_checks`, `non_fast_forward` and `deletion`.
It deliberately does **not** use `required_linear_history`: that forbids the merge-commit shape a hotfix bring-back needs.
Merge-method availability is a repository-wide setting rather than a per-branch rule, so "merge commit, never squash" is a process rule here, not an enforced one.

**The App bypass is mandatory.**
`promote-to-early-access.yml` pushes to `release` directly with the release-bot App token, and its own comment anticipates this: "It is the ruleset bypass actor, so a future ruleset on `release` still lets it push."
Without a `bypass_actors` entry naming that App installation with `bypass_mode: always`, the next prerelease promotion jams.
The bypass opens no hole: that same workflow already refuses a beta tag whose commit is not an ancestor of `origin/main`, so everything it carries was reviewed on `main` first.

**Preconditions, in order.**
Confirm the App holds **Pull requests: Read** (the content gate's association read returns 403 without it, and the gate then fails closed), and confirm the `bypass_actors` entry is present, *before* setting `enforcement: active`.

**Rollback.**
`gh api --method DELETE repos/mistersilver-uk/fabricate/rulesets/<release-ruleset-id>`.

### What a change landing on the release line may reference

A change landing on the release line must be self-contained ON THAT LINE.
Being byte-identical to its counterpart on the prerelease line is not sufficient, because a file can be internally valid there and still depend on other content the release line does not carry.

The gate that catches this is `scripts/validate-agent-bindings.mjs`, which resolves every backticked repository path in the agent skills and in the root documents, this file included, and fails when one does not exist.
A paragraph copied verbatim from the prerelease line can therefore cite a path that arrived with later work and is absent from the release line, and the copy is refused even though its own text was reviewed and merged.

Prefer prose that cites nothing, or cite only paths you have confirmed exist on the release line.

## Prerelease promotion (promote to early access)

File: `.github/workflows/promote-to-early-access.yml`

Trigger: `workflow_dispatch(beta_tag)`.

This is the **prerelease promotion**: it does the MERGE ONLY of a tested beta commit onto `release`, which then triggers `release.yml` to mint the stable version and publish early access.
It is a `git merge --no-ff` (**never a squash** — squashing collapses the Conventional Commit types semantic-release reads and mis-computes the version, per the **Version authority and promotion mechanics** requirement).
Before merging it verifies the tag's shape, that it exists, that its commit is an ancestor of `origin/main`, and that **every** private `beta` target — the channel manifest AND every tester manifest — already advertises that version.
Ancestry alone is not enough: the tag is pushed before the beta publish job, so a tag whose publish failed is still an ancestor of `main` yet leaves a stale head, which later turns a hotfix into a cohort defection (the **Registry lead prohibition** requirement).

**The forward-port deliberately does NOT live here.**
This workflow merges onto `release` and returns; it mints nothing.
The stable tag is created asynchronously afterwards, by the `release.yml` run this push triggers.
A forward-port here would push `main` *before* that tag exists, so the `beta.yml` run that push triggers would compute another version on the **old** line and publish it — re-arming the exact defect on the next cycle.
It would also forward-port even when the mint or the early-access publish subsequently failed, advancing `main` past a version no channel carries.
The seam is `release.yml`, after `verify-publish`, because that is where "a stable version was minted **and** published" is an established fact.

## Public promotion

File: `.github/workflows/promote-to-public.yml` (task 3.5, replacing the retired `promote-release.yml`).

Trigger: `workflow_dispatch` with `version`, `source_channel` (default `early-access`), and `dry_run`.

This is the **release promotion**: it moves an already-minted stable version to `public` and the registry, minting nothing.
The promotion is **TOLD** its `source_channel` (a hotfix promotes with `source_channel: <its line>`); it never infers "EA head != version, therefore hotfix", because that guess fails open.
It is a four-job `needs:` chain, and the ordering is the whole point of the **Promotion-gated public availability** requirement — everything that can fail runs before the one step that cannot be undone:

1. **guard** — verifies the `source_channel`, asserts the source channel advertises `version` across every private target, and performs the registry-lead read against every private target of `beta` and `early-access`.
A lagging private head hard-fails the promotion **before** the registry POST, naming the remedy: advance that channel first.
For a lagging `beta` head the remedy leads with the **forward-port** — bring the release line back into the prerelease line whenever the prerelease line is itself numbered below the version being promoted, which is the case whenever that head is a prerelease of a version at or below the released one.
No amount of new work on `main` can raise it in that state, because every version `main` mints stays on the same line; only after the forward-port does the next prerelease number above the released version.
Otherwise (the prerelease line is already numbered above it) push the feature work to `main` so `beta.yml` mints a newer beta.
There is no bare-stable catch-up in either case, which would defect the cohort.
Before that read, guard also diagnoses **tester-configuration drift** (issue #1872): it fetches `origin/release`'s `release.s3.config.json` and compares `early-access`'s tester group name and secret env-var name against the dispatch ref's own, logging a `::warning::` naming both sides when they disagree, because `early-access` is published only from `release` while this job may run from a different ref.
When an absent-head refusal lands on an `early-access` target while that drift exists, the refusal's message is extended with the remedy: publish the current `early-access` head under the new prefix with a `release-s3.yml` dispatch from the ref carrying the new configuration, or land the rotation on `release`.
2. **forward-port** — a **confirming backstop**, not the forward-port's scheduling point.
It calls the shared `.github/workflows/forward-port.yml`, and because the forward-port is now performed at the *prerelease* promotion, `release` is normally already an ancestor of `main` by the time a release promotion runs, so this job takes the callee's ancestry no-op.
It still performs the merge if it has not happened, which is what the **Version authority and promotion mechanics** requirement obliges a release promotion to do.
It carries **no job-level `if:`** (a skipped job would report `skipped` and fail job 4's strict `if:`); the hotfix no-op runs through the callee's `enabled` input instead, and its `dry_run` is forwarded from the promotion's own input.
3. **publish** — re-stages the `public` targets from the built `dist` (promotion is a **re-publish, never an S3 copy** — copying a private artefact would bake the secret cohort URL into the public build and sidegrade public installers onto the private feed).
It captures `release.s3.config.json` from the workflow ref before checking out `v$VERSION`, for the reason `release-s3.yml` does below (deployment configuration comes from the ref, never from the tag), and refuses by name when that tag's `release-s3.js` predates `--config`.
4. **readback-preflight-undraft-register** — reads back every written manifest, downloads the release assets to confirm both exist, **aggregates the notes of any superseded stable draft** strictly between the current public version and this one on the same line (without this the public changelog silently loses a whole feature set; the consumed drafts are left drafted as the record), builds and validates the registry payload (its `manifest` is CONSTRUCTED as the version-pinned `releases/download/v<version>/module.json`, never copied from the artefact), then performs the two irreversible steps LAST: `gh release edit --draft=false --latest` and the registry POST.

Under `dry_run: true` all four jobs RUN and every mutating step no-ops and prints its plan — the un-draft and the POST included — so a dry run never publishes anything.

One thing a reader will file as a bug but must not "fix": the early-access draft's zip bakes the **public latest-release** manifest URL, not the early-access one.
That is deliberate and harmless — a private draft is excluded from GitHub's "latest", and baking the public URL is exactly what makes the un-draft a clean flip to public with no manifest rewrite (the **Self-contained distribution targets** requirement).

## S3 publish workflow

File: `.github/workflows/release-s3.yml`

Triggers:

- Manual `workflow_dispatch`, with `tag`, `channel`, `check_heads`, `dry_run`, and `overwrite` inputs.
- Reusable `workflow_call` from `beta.yml` and `release.yml` (and the promotion workflows), using the same inputs.

The reusable publisher takes a release tag, derives its version, checks out that tagged commit, builds, and publishes to the requested channel's S3 targets from `release.s3.config.json`'s `channels` map (`beta` → the closed-tester group; `early-access` → the patron group; `public` → no tester group; a hotfix line is not declared, so its only target is its sources target).
Since the #1763 rotation the early-access tester group is declared as `guild-artisan-2026` (previously `patrons-2026`), and the beta group as `closed-beta-2026`; the map's declared names are what the publisher reads.
The bytes come from the tag, but that `channels` map does not: the workflow captures `release.s3.config.json` from the **workflow ref** (`git show "$GITHUB_SHA":…`) before the tag checkout and passes it as `--config`, because a tester group's identity is deployment configuration rather than a property of the released bytes.
Reading it from the tag made a rotation impossible to apply to an already-minted version, so the new prefix could never be populated (issue #1872); a tag whose `release-s3.js` predates `--config` is refused by name instead of silently publishing under its own configuration.
Before writing anything it runs the monotonic-head guard per target: a publish that would move a head to a version Foundry considers older fails closed and names the remedy — a higher version, not a downgrade override (the **Monotonic channel heads** requirement).
The stall the guard catches is a **double-digit rollover in the part glued to the prerelease suffix** (`1.5.0-beta.10` vs `1.5.0-beta.9` compares fine, but `1.4.10-beta.1` vs `1.4.9-beta.1` string-compares `"10-beta"` below `"9-beta"`); its remedy is a version bump that **keeps** the prerelease identifier (`1.5.0-beta.1`), never a bare stable version, which would level the head with the registry and defect the cohort.
A pure-stable channel like `public` can never stall this way.

**Cohorts get tester URLs, never the sources URL.**
The sources target is what the tooling reads; on a private channel nothing installs from it, and a cohort is only ever given an unguessable tester URL.
That separation is what makes the bucket policy safe — denying the derivable sources path locks out anonymous readers without defecting any cohort, because no cohort is pinned to it (the **Channel isolation** requirement).

**Tester path secret (rotation freezes a cohort, not a lockout).**
The tester feed lives at an unguessable path: `testers/<group>/<segment>/<moduleId>/…`, where `<segment>` comes from a per-channel repository **secret** (`S3_TESTER_PATH_SECRET` for beta, a separate `S3_GUILD_ARTISAN_PATH_SECRET` for early access, referred to abstractly here — never paste the value) — never the committed config.
Generate each once and set it before publishing; the publish **refuses to run** when a channel declares tester groups but its secret is unset, so the feed can never fall back to a guessable URL.
Treat rotation as a **cohort migration, not hygiene**: it starts a new segment for future publishes, and the superseded segment keeps serving its last pre-rotation manifest, because the publisher only ever writes the current segment and nothing in the release path deletes, prunes, or expires an old one.
No update is ever offered to that superseded cohort and no error is surfaced — it silently stops receiving updates rather than failing.
Rotation is not a lockout: every artefact already published to the superseded segment stays reachable to anyone holding its URL, including a lapsed patron.
Deliberately deleting a superseded segment, by contrast, makes its manifest URL genuinely unreachable and returns a 404 to `checkPackage` — Foundry's own internal, server-side setup route, not documented client API — which suppresses that 404 and shows the client only an offer to switch to the public registry.
This module never deletes a tester segment, for exactly that reason.
After rotating a secret, uninstall and reinstall the affected cohort from the new manifest URL, because it will never be offered an update on its own.
`release-s3.js` withholds all S3 keys and install URLs from CI logs (they print only on local/`--dry-run` runs); GitHub also masks the secret value.
A version already minted before the rotation is never republished automatically, so its own new prefix stays empty until someone back-fills it: dispatch `release-s3.yml` from the ref that carries the new configuration with `tag=<that version's tag>` and `channel=early-access`, which republishes the same bytes under the new segment because the workflow reads its tester-group identity from the dispatch ref rather than from the tag (issue #1872).

**`--overwrite`.**
The one legitimate use is re-staging a zip whose manifest never advertised the version (a failed first publish), so no client can already be pinned to it.
Automatic calls publish only a newly-minted tag and never overwrite an existing versioned zip.
Note that `isNewerVersion('1.3.0', '1.3.0-rc.85') === false`, so the first public `v1.3.0` is not offered to any client still installed from a legacy `-rc.N` prerelease — that is expected, and those clients rejoin the public line through Foundry's manifest-rewrite offer.
For the same reason, **do not delete the 179 existing `v*-rc.*` prereleases**: each one's assets bake `releases/download/v<ver>/module.json`, so deleting a prerelease 404s every client installed from it.

## Screenshot publishing infrastructure

`npm run screenshots:ui:publish` uploads UI-PR screenshots to S3 under `pr-screenshots/<pr-number>/` and embeds the public object URLs in the PR body.
Publishing now runs only locally (via the AWS default provider chain) — the workflow that published from CI has been removed; `pr-screenshots-cleanup.yml` still deletes the objects afterwards and authenticates via GitHub OIDC.
That cleanup uses a **dedicated, least-privilege IAM role** — deliberately separate from the module-release role, so a screenshot workflow can never write or overwrite real release artifacts.

Repository variables (role ARNs and bucket names are not secrets):

- `AWS_SCREENSHOTS_ROLE_TO_ASSUME` — ARN of the dedicated screenshot role (below).
- `AWS_REGION`, `S3_RELEASE_BUCKET`, `RELEASE_BASE_URL` — shared with the release workflow.

**IAM role trust policy** (`GitHubFabricatePrScreenshotsRole`) — only the PR-screenshots-cleanup workflow in this repo may assume it:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Federated": "arn:aws:iam::088545273404:oidc-provider/token.actions.githubusercontent.com" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:repository": "mistersilver-uk/fabricate",
          "token.actions.githubusercontent.com:ref": "refs/heads/main",
          "token.actions.githubusercontent.com:workflow": ["PR screenshots cleanup"]
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": [
            "repo:mistersilver-uk/fabricate:ref:refs/heads/main",
            "repo:mistersilver-uk/fabricate:pull_request"
          ]
        }
      }
    }
  ]
}
```

Do not use `token.actions.githubusercontent.com:job_workflow_ref` for this job.
GitHub emits that claim for reusable workflow jobs, while the screenshot cleanup workflow here is a normal repository workflow.
The cleanup workflow uses `pull_request_target`, so its default `sub` is the pull-request subject (`repo:mistersilver-uk/fabricate:pull_request`) rather than the branch subject.

**IAM role permission policy** (`PublishPrScreenshots`) — `pr-screenshots/*` only, including delete for cleanup:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListPrScreenshots",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::fabricate-modules-088545273404-eu-west-2-an",
      "Condition": { "StringLike": { "s3:prefix": "pr-screenshots/*" } }
    },
    {
      "Sid": "WritePrScreenshots",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::fabricate-modules-088545273404-eu-west-2-an/pr-screenshots/*"
    }
  ]
}
```

**Bucket policy** — add public read for `pr-screenshots/*` so GitHub can render the images (alongside the existing `modules/*` / `testers/*` grant):

```json
{
  "Sid": "PublicReadPrScreenshots",
  "Effect": "Allow",
  "Principal": "*",
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::fabricate-modules-088545273404-eu-west-2-an/pr-screenshots/*"
}
```

**Cleanup** — `screenshots:ui:clean` removes only local temp files (the S3 objects must stay live while the PR is open).
The `pr-screenshots-cleanup.yml` workflow runs `screenshots:ui:clean -- --pr <n> --s3` automatically when a PR closes (merged or not) to delete that PR's S3 objects.
A bucket **lifecycle rule** expiring the `pr-screenshots/` prefix after N days is the backstop so nothing accumulates even if the cleanup workflow is skipped or fails.
(Set N comfortably above how long PRs stay open, or the images break while a PR is still under review.)

These objects are public-read by URL (the accepted tradeoff for inline GitHub rendering of a private repo's screenshots).
The required `check-screenshots` gate fails closed until a maintainer publishes the screenshots manually or applies the `screenshots-exempt` label, and it now also fails closed when the automatically published frames belong to a stale head or match none of the PR's changed views.
