# Foundry Smoke Lifecycle

## Purpose

Use this procedure when a per-worktree Foundry smoke environment may be running, stale, or left behind by an interrupted command.
It protects the bound data directory, preserves the extracted Foundry application cache, and distinguishes infrastructure recovery from product results.

The runtime identity is derived from the worktree root by `scripts/lib/foundryRunIdentity.js`.
The launcher and phase orchestration live in `scripts/foundry-test-run.mjs`, and the container definition lives in `docker-compose.foundry.yml`.

## Stop before replacing bound data

Before rebuilding, deleting, or replacing the per-worktree setup-data directory, resolve the worktree's exact compose project and container identity and inspect its state.
If that container is running, stop it and wait for the stop operation to complete.
Do not remove the container merely to prepare data: stopping preserves the container and its cached extracted Foundry application for the next start.

If the stop fails or its final state cannot be proved stopped, abort before any setup-data mutation.
Never continue on the assumption that a timeout means the container stopped.
Do not target a fixed historical container name or a container belonging to another worktree.

The required order is:

1. resolve the current worktree identity;
2. inspect the matching container;
3. stop it when running;
4. prove it is stopped;
5. replace or prepare the bound data;
6. start or reuse the stopped container; and
7. prove a clean join and setup state before fixtures run.

## Interrupted-run recovery

Give container stop, startup, browser join, world setup, and teardown independent bounded timeouts so a failure names the phase that exhausted its budget.
After an interruption:

1. terminate the active browser or runner process using the harness-owned teardown path;
2. stop the exact per-worktree container before touching its bound data;
3. clear only run-scoped browser, result, and setup state that the harness owns;
4. preserve the extracted application cache and unrelated user-owned files;
5. restart and prove the expected login, world join, module activation, and fixture setup markers; and
6. begin fixture or screenshot work only after that clean proof.

A stale page, prior authenticated browser, or container in a running state is not clean-join evidence.
A later phase cannot repair an unproved setup phase.

## Result classification

Classify the first failed lifecycle step before interpreting later failures.
A stop, setup-data, startup, join, or fixture-setup failure is harness infrastructure until an application surface has loaded and violated a product expectation.
A run with failed steps, non-waived console errors, a degraded result, renderer crash, stale source head, or mismatched run identity is not clean evidence.

Screenshot files left by an interrupted or failed run are diagnostic artifacts.
They are not publishable evidence until the generic provenance checks in `../../fabricate-ux-designer/references/visual-evidence-and-reuse.md` bind every collected view to one successful, non-degraded exact-head run.

## Capture only after the head has settled

Collected evidence is bound to one exact head SHA, so the capture is the LAST step of a delivery loop, never an early one.
The order is: fetch `origin/main`, rebase, run the authoritative gates, commit every fix, push, and only then capture.

Three orderings waste a full run and each has cost one.
Committing a fix after the run that demonstrates it moves the head, and `screenshots:ui:collect` then refuses the evidence as stale for the requested head — the run proving the fix must come after the commit containing it.
Publishing with a `--head-sha` that was never pushed writes object paths and PR-body links for a commit GitHub cannot resolve, and the check API rejects it with `No commit found for SHA`.
Rebasing after a capture — including the mandatory rebase when `origin/main` moves — rewrites every SHA and discards the run.

Fetch `origin/main` immediately before starting a capture, not after.
A long capture races any merge to `main`, and a merge that touches files the branch also changes forces a rebase that invalidates the frames mid-flight.
When that happens, stop the run and tear the harness down rather than letting it finish: `npm run test:foundry:down -- --clean` reclaims the worktree's container and network at the source.

## Local and CI behavior

Local smoke runs benefit from the stable per-worktree identity and cache-preserving stop/restart path.
Recovery MAY reuse that stopped container and extracted application cache only after setup data has been safely prepared and a clean join/setup has been proved.

CI uses its own isolated worktree and derived container identity.
It follows the same stop-before-data-replacement ordering and aborts on an unproved stop.
CI isolation does not make replacing a live bind mount safe, and it does not permit a provider-specific fallback.

Neither environment removes the container as routine recovery.
Removal is a separate cleanup decision owned by the workflow driver after results and meaningful state have been accounted for.
