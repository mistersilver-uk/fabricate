/**
 * NO RULE SENTENCE IS LOST WHEN THE HARNESS DOCUMENTS ARE SPLIT (issue #1661, phases 3-5). HOW IT
 * WORKS. `tests/fixtures/doc-split/*.pre-split.md` are byte copies of the three documents as they
 * stood before any split.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  missingSentences,
  multiset,
  sentencesOf,
  withoutCounts,
  withoutLinkTargets,
} from '../scripts/lib/docSentences.js';
import { TOTALS_DOCUMENT, totalsRegion } from '../scripts/view-lab-registry-totals.mjs';

const REPOSITORY_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = 'tests/fixtures/doc-split';

/** The pre-split documents, by the fixture that froze each one. Each floor sits just under the
 * fixture's sentence count, which fell when `sentencesOf` began joining hard wraps (issue #1661). */
const SOURCES = [
  { fixture: `${FIXTURES}/AGENTS.pre-split.md`, floor: 850 },
  { fixture: `${FIXTURES}/CLAUDE.pre-split.md`, floor: 42 },
  { fixture: `${FIXTURES}/CONTRIBUTING.pre-split.md`, floor: 900 },
];

/** Every file a sentence is allowed to have moved INTO, by explicit path. */
const DESTINATIONS = [
  'AGENTS.md',
  'CLAUDE.md',
  'CONTRIBUTING.md',
  // Phase 3: the smoke-harness narrative and the CI-workflow narrative, moved beside the code
  // they describe.
  'scripts/README.md',
  '.github/workflows/README.md',
  // Phase 4: the FoundryVTT notes and architecture pointers, moved whole.
  '.agents/docs/foundry-and-architecture.md',
  // Issue #1984: the detailed final-delivery procedure moved out of always-loaded guidance.
  '.agents/skills/fabricate-orchestrator/references/worktree-lifecycle.md',
];

/**
 * Sentences deliberately dropped, each naming the location that still carries them. Empty, because
 * nothing has moved yet.
 */
const DEDUPLICATED = [];

/** Pinned exactly, not as a ceiling: a ceiling banks a free slot on every entry that is retired. */
const DEDUPLICATED_COUNT = 0;

/** Sentences a move forced to change, where the only change is a link TARGET. */
const RETARGETED = [
  {
    before: 'See [Manager confirm-discard guard](#manager-confirm-discard-guard).',
    after:
      'See [Manager confirm-discard guard](.agents/docs/foundry-and-architecture.md#manager-confirm-discard-guard).',
  },
];

/** Pinned for the same reason as DEDUPLICATED_COUNT. */
const RETARGETED_COUNT = 1;

/** Sentences that state a View Lab registry case count, where the only change is that NUMBER. */
const RENUMBERED = [
  // Issue #1692 moved the walk into scripts/foundry-smoke/, leaving the runner at ~230 lines.
  'The main harness is `scripts/foundry-test-run.mjs` (~3700 lines).',
];

/** Pinned for the same reason as DEDUPLICATED_COUNT and RETARGETED_COUNT. */
const RENUMBERED_COUNT = 1;

/** The region the retired View Lab counts are generated into, read from the writer that owns it. */
const TOTALS_REGION_LINES = totalsRegion().split('\n');
const TOTALS_DELIMITERS = [TOTALS_REGION_LINES[0], TOTALS_REGION_LINES.at(-1)];

/**
 * Sentences a count LEFT rather than changed (issue #1937). A RENUMBERED entry keeps its number and
 * must be re-edited whenever the registry grows; these stopped quoting one, so `removed` names the
 * clause deleted from `before`, and `after` is `null` when the whole sentence was retired into the
 * generated region `derivedIn` carries.
 */
const DECOUNTED = [
  {
    before:
      'For a view covered by the canonical registry (`scripts/lib/viewLabCases.js`) — which is the normal case, at 379 cases across five windows — the **View Lab** is the producer, and it is what CI runs on every PR push: `node scripts/view-lab-screenshots.mjs apps` renders every case, or pass a comma-separated id list to render a subset, into `ui-screenshot-artifact/apps/`.',
    after:
      'For a view covered by the canonical registry (`scripts/lib/viewLabCases.js`) — which is the normal case — the **View Lab** is the producer, and it is what CI runs on every PR push: `node scripts/view-lab-screenshots.mjs apps` renders every case, or pass a comma-separated id list to render a subset, into `ui-screenshot-artifact/apps/`.',
    removed: ', at 379 cases across five windows',
    derivedIn: TOTALS_DOCUMENT,
  },
  {
    before:
      "Selection is targeted, and no single changed file selects the whole registry: a render file selects the cases whose `sourceMatches` claim it, a broad shared primitive or stylesheet selects a small representative set, and a change to one of the lab's OWN inputs (fixture world, capture driver, registry shared code) selects **surface coverage** — one frame of every route and tab the lab renders, 48 cases — rather than every state of every screen.",
    after:
      "Selection is targeted, and no single changed file selects the whole registry: a render file selects the cases whose `sourceMatches` claim it, a broad shared primitive or stylesheet selects a small representative set, and a change to one of the lab's OWN inputs (fixture world, capture driver, registry shared code) selects **surface coverage** — one frame of every route and tab the lab renders — rather than every state of every screen.",
    removed: ', 48 cases',
    derivedIn: TOTALS_DOCUMENT,
  },
  {
    before:
      'As of this writing the registry holds 379 cases: 148 `exact`, 8 `window`, 223 `beyond`.',
    after: null,
    removed:
      'As of this writing the registry holds 379 cases: 148 `exact`, 8 `window`, 223 `beyond`.',
    derivedIn: TOTALS_DOCUMENT,
  },
  {
    before:
      'By default a PR touching the case registry, `labActors.js`, `labRunStates.js`, or any other file the lab depends on selects **surface coverage**: one frame of every route and tab the lab renders — every manager route, every player tab, one per single-screen canvas window, plus the light-theme pair — which is 48 of the 379 publishable cases.',
    after:
      'By default a PR touching the case registry, `labActors.js`, `labRunStates.js`, or any other file the lab depends on selects **surface coverage**: one frame of every route and tab the lab renders — every manager route, every player tab, one per single-screen canvas window, plus the light-theme pair.',
    removed: ' — which is 48 of the 379 publishable cases',
    derivedIn: TOTALS_DOCUMENT,
  },
];

/** Pinned for the same reason as DEDUPLICATED_COUNT. */
const DECOUNTED_COUNT = 4;

/**
 * Historical policy sentences deliberately replaced, with both sides and the current destination
 * pinned so an ordinary lost instruction cannot hide in the exception (issues #1984, #1988).
 */
const APPROVING_ISSUES = new Set(['#1984', '#1988']);

const SUPERSEDED_POLICY = [
  {
    issue: '#1984',
    before:
      'Draft-head checks are preflight evidence only because some CI workflows may run only on the `ready_for_review` event.',
    after:
      'A successful full required check attempt remains authoritative for its exact remote head whether it started while the PR was draft or ready.',
    survivesIn: '.agents/skills/fabricate-orchestrator/references/worktree-lifecycle.md',
  },
  {
    issue: '#1984',
    before:
      'Draft checks are preflight only; on failure or a moved main/head, return the PR to draft and repeat the delivery loop.',
    after:
      'Keep a ready PR ready while rebasing, updating its branch, investigating a failed check, or routing a fix.',
    survivesIn: '.agents/skills/fabricate-orchestrator/references/worktree-lifecycle.md',
  },
  {
    issue: '#1984',
    before:
      'Delivery is only complete when the PR is ready and its exact-head checks are green; a green PR left in draft is unfinished work, not a cautious pause, because draft checks prove nothing about the workflows that run only on `ready_for_review`.',
    after:
      'Delivery is complete only when the PR is ready and one full required check attempt is successful for its exact remote head.',
    survivesIn: '.agents/skills/fabricate-orchestrator/references/worktree-lifecycle.md',
  },
  {
    issue: '#1984',
    before:
      'Choose one authoritative full exact-head attempt, normally the `ready_for_review` attempt, and require all full gates from that attempt rather than combining jobs from duplicates; metadata-only `edited` attempts never qualify.',
    after:
      'Choose one authoritative full attempt for the exact remote head and require every full gate from that attempt rather than combining successful jobs across duplicate attempts.',
    survivesIn: '.agents/skills/fabricate-orchestrator/references/worktree-lifecycle.md',
  },
  {
    issue: '#1984',
    before:
      'Treat draft checks as preflight only; a required workflow may be triggered by `ready_for_review` and must pass after the PR is undrafted.',
    after:
      'Follow the final-delivery procedure in `.agents/skills/fabricate-orchestrator/references/worktree-lifecycle.md`; readiness changes do not create check evidence.',
    survivesIn: 'AGENTS.md',
  },
  {
    issue: '#1984',
    before:
      "The ready transition is the driver's own step, so run it without asking: a green PR still sitting in draft has not had its deciding checks run, so it is unfinished, not safely parked.",
    after: 'Readiness changes do not change source and do not create check evidence.',
    survivesIn: '.agents/skills/fabricate-orchestrator/references/worktree-lifecycle.md',
  },
  {
    issue: '#1984',
    before:
      'On any failure, return the PR to draft before gathering evidence and routing fixes through the normal isolated implementation and review loops.',
    after:
      "If any check fails, gather evidence, reconcile the issue, and route fixes through isolated implementation and review lanes while preserving the PR's readiness state.",
    survivesIn: '.agents/skills/fabricate-orchestrator/references/worktree-lifecycle.md',
  },
  {
    issue: '#1984',
    before:
      'After fixes, repeat the rebase, validation, lease push, ready transition, and exact-head checks, repeating review only for a materially changed owned concern or unresolved finding.',
    after: 'Repeat rebase, local validation, explicit-lease push, and exact-head CI after a fix.',
    survivesIn: '.agents/skills/fabricate-orchestrator/references/worktree-lifecycle.md',
  },
  {
    issue: '#1984',
    before:
      "If main advanced, the head changed, or the PR returned to draft, repeat the mandatory delivery steps and apply step 4's material-change review rule.",
    after:
      'If main advanced or the PR head changed, repeat the mandatory delivery steps while keeping a ready PR ready, preserving approval when the resulting rebase is patch-equivalent and repeating review only when the material-change rule requires it.',
    survivesIn: '.agents/skills/fabricate-orchestrator/references/worktree-lifecycle.md',
  },
  {
    issue: '#1984',
    before:
      'Before maintainer handoff, the driver finalizes PR metadata, rebases onto fetched `origin/main`, reruns authoritative gates and commitlint, preserves valid approval across a patch-equivalent rebase or obtains fresh detached exact-target review when the owned concern materially changed or a finding remains unresolved, pushes only with an explicit expected-head lease, marks the PR ready, and requires all post-undraft exact-head checks including both SonarCloud checks.',
    after:
      'The maintainer handoff is valid only when current-main ancestry, exact remote-head identity, ready state, and every required exact-head check are mechanically true at the same time.',
    survivesIn: '.agents/skills/fabricate-orchestrator/references/worktree-lifecycle.md',
  },
  {
    issue: '#1984',
    before:
      'Mark the PR ready for review, then wait for every required GitHub Actions and external check triggered for that exact head.',
    after:
      'If the PR is still draft and reviewable, mark it ready, then wait for every required GitHub Actions and external check associated with that exact remote head.',
    survivesIn: '.agents/skills/fabricate-orchestrator/references/worktree-lifecycle.md',
  },
  // Issue #1988: a channel's tester groups each name their own secret, and CI builds a tag in its
  // own worktree with the workflow ref's publisher instead of checking the tag out.
  {
    issue: '#1988',
    before:
      '`--channel early-access` and `--channel public` are the private-patron and public targets; each private channel derives its tester URLs from its own path secret, and a channel that declares tester groups with no secret set refuses to publish.',
    after:
      '`--channel early-access` and `--channel public` are the private-patron and public targets; each tester group derives its tester URLs from its own path secret, and a channel with any declared group whose secret is unset refuses to publish before building.',
    survivesIn: 'AGENTS.md',
  },
  {
    issue: '#1988',
    before:
      'Every versioned zip carries `(fabricate-version, fabricate-source-sha, fabricate-build-profile)` metadata — pass `--source-sha` explicitly, since `GITHUB_SHA` is stale after a `git checkout <tag>`; manifest writes are conditional (`IfMatch`) and every write is read back.',
    after:
      'Every versioned zip carries `(fabricate-version, fabricate-source-sha, fabricate-build-profile)` metadata — pass `--source-sha` explicitly, since `GITHUB_SHA` names the workflow ref rather than the tag being built; manifest writes are conditional (`IfMatch`) and every write is read back.',
    survivesIn: 'AGENTS.md',
  },
  {
    issue: '#1988',
    before:
      '`release-s3.js` takes the commit explicitly via `--source-sha`, because `release-s3.yml` checks out the release tag before invoking the script, which leaves `GITHUB_SHA` naming the ref that triggered the run rather than the built commit — the workflow passes `--source-sha "$(git rev-parse HEAD)"`.',
    after:
      "`release-s3.js` takes the commit explicitly via `--source-sha`, because `release-s3.yml` builds the release tag in its own worktree while `GITHUB_SHA` names the ref that triggered the run rather than the built commit — the workflow passes the worktree's `HEAD` as `--source-sha` and the worktree itself as `--source-root`, and the script refuses a sha that worktree does not hold.",
    survivesIn: 'CONTRIBUTING.md',
  },
  {
    issue: '#1988',
    before:
      "The reusable publisher takes a release tag, derives its version, checks out that tagged commit, builds, and publishes to the requested channel's S3 targets from `release.s3.config.json`'s `channels` map (`beta` → the closed-tester group; `early-access` → the patron group; `public` → no tester group; a hotfix line is not declared, so its only target is its sources target).",
    after:
      "The reusable publisher takes a release tag, derives its version, builds that tagged commit, and publishes to the requested channel's S3 targets from `release.s3.config.json`'s `channels` map (`beta` → the closed-tester group; `early-access` → the two patron groups; `public` → no tester group; a hotfix line is not declared, so its only target is its sources target).",
    survivesIn: '.github/workflows/README.md',
  },
  {
    issue: '#1988',
    // Frozen before issue #1761 renamed the early-access secret; the rename entry it held retired
    // with this rewrite.
    before:
      'The tester feed lives at an unguessable path: `testers/<group>/<segment>/<moduleId>/…`, ' +
      'where `<segment>` comes from a per-channel repository **secret** (`S3_TESTER_PATH_SECRET` ' +
      'for beta, a separate `S3_EARLY_ACCESS_PATH_SECRET` for early access, referred to abstractly ' +
      'here — never paste the value) — never the committed config.',
    after:
      'The tester feed lives at an unguessable path: `testers/<group>/<segment>/<moduleId>/…`, ' +
      'where `<segment>` comes from a per-group repository **secret** (`S3_TESTER_PATH_SECRET` for ' +
      'beta, and `S3_APPRENTICE_PATH_SECRET` and `S3_GUILD_ARTISAN_PATH_SECRET` for the two ' +
      'early-access groups, referred to abstractly here — never paste the value) — never the ' +
      'committed config.',
    survivesIn: '.github/workflows/README.md',
  },
  {
    issue: '#1988',
    before:
      'Generate each once and set it before publishing; the publish **refuses to run** when a channel declares tester groups but its secret is unset, so the feed can never fall back to a guessable URL.',
    after:
      'Generate each once and set it before publishing; the publish **refuses to run**, before building, when any tester group a channel declares has its secret unset, so the feed can never fall back to a guessable URL.',
    survivesIn: '.github/workflows/README.md',
  },
];

/** Pinned exactly: every entry excuses one historical sentence. */
const SUPERSEDED_POLICY_COUNT = 17;

/**
 * Sentences a deliberate rename forced to change, where the only edit is an identifier (issue
 * #1761).
 */
const RENAMED = [
  {
    before:
      "Cite code by symbol name and file path only — for example `_playerListingFields` in `src/systems/GatheringListingBuilder.js`, locatable with `grep -n` — never by line number; `npm run validate:agents` rejects `file.js:NNN`-style citations because they rot silently as code moves.",
    after:
      "Cite code by symbol name and file path only — for example `_playerListingFields` in `src/ui/presenters/GatheringListingBuilder.js`, locatable with `grep -n` — never by line number; `npm run validate:agents` rejects `file.js:NNN`-style citations because they rot silently as code moves.",
    identifiers: [['src/ui/presenters/GatheringListingBuilder.js', 'src/systems/GatheringListingBuilder.js']],
  },
  {
    before:
      "**Player listing counts are a separate, engine-owned surface.** The player-facing listing is produced by `GatheringEngine.listForActor` — a thin delegator to the engine's injected `GatheringListingBuilder` collaborator, whose `_buildEnvironmentListing` in `src/systems/GatheringListingBuilder.js` does the construction — not the admin store.",
    after:
      "**Player listing counts are a separate, engine-owned surface.** The player-facing listing is produced by `GatheringEngine.listForActor` — a thin delegator to the engine's injected `GatheringListingBuilder` collaborator, whose `_buildEnvironmentListing` in `src/ui/presenters/GatheringListingBuilder.js` does the construction — not the admin store.",
    identifiers: [['src/ui/presenters/GatheringListingBuilder.js', 'src/systems/GatheringListingBuilder.js']],
  },
  // Issue #1674 moved the world Item projection out of the manager shell into its services module.
  {
    before:
      '`getWorldItemOptions` in `src/ui/SvelteCraftingSystemManagerApp.svelte.js` is `Array.from(game.items.contents)`, the world Item collection alone, and a `Compendium.` address is never in it.',
    after:
      '`getWorldItemOptions` in `src/ui/managerServices.js` is `Array.from(game.items.contents)`, the world Item collection alone, and a `Compendium.` address is never in it.',
    identifiers: [['src/ui/managerServices.js', 'src/ui/SvelteCraftingSystemManagerApp.svelte.js']],
  },
  // Issue #1671 moved the cases into one file per surface, so these three sentences name the directory.
  {
    before: 'Cases live in `scripts/lib/viewLabCases.js`.',
    after: 'Cases live in `scripts/lib/view-lab-cases/`.',
    identifiers: [['scripts/lib/view-lab-cases/', 'scripts/lib/viewLabCases.js']],
  },
  {
    before:
      'A patch to `scripts/lib/viewLabCases.js` selects only the case literals its hunks fall inside.',
    after:
      'A patch to `scripts/lib/view-lab-cases/` selects only the case literals its hunks fall inside.',
    identifiers: [['scripts/lib/view-lab-cases/', 'scripts/lib/viewLabCases.js']],
  },
  {
    before:
      "**Adding a new editor kind:** (1) add a `confirmDiscardDirty{Kind}Draft()` helper in `adminStore.js` using the shared `_confirmDiscardDirtyDraft` factory; (2) export it on the store API; (3) add a `confirm{Kind}RouteExit(nextView)` function in `CraftingSystemManagerRoot.svelte` and chain it through `confirmRouteExit`; (4) wire the editor's Back / Cancel button to a handler that runs `afterTruthyResult(confirmRouteExit(nextView), () => { activeView = ... })` — never call `store.cancel{Kind}Draft?.()` directly, that bypasses the prompt; (5) add a stub for the new helper to the `confirmDiscardDirty{Kind}Draft` stub block in the store fixture of `tests/components/manager-mounted.test.js` (locate it with `grep -n confirmDiscardDirty`).",
    after:
      "**Adding a new editor kind:** (1) add a `confirmDiscardDirty{Kind}Draft()` helper in `adminStore.js` using the shared `_confirmDiscardDirtyDraft` factory; (2) export it on the store API; (3) add a `confirm{Kind}RouteExit(nextView)` function in `CraftingSystemManagerRoot.svelte` and chain it through `confirmRouteExit`; (4) wire the editor's Back / Cancel button to a handler that runs `afterTruthyResult(confirmRouteExit(nextView), () => { activeView = ... })` — never call `store.cancel{Kind}Draft?.()` directly, that bypasses the prompt; (5) add a stub for the new helper to the `confirmDiscardDirty{Kind}Draft` stub block in the store fixture of `tests/helpers/manager/managerStoreFake.js` (locate it with `grep -n confirmDiscardDirty`).",
    identifiers: [['tests/helpers/manager/managerStoreFake.js', 'tests/components/manager-mounted.test.js']],
  },
  // Issue #1692 moved the smoke walk out of the runner, so these four sentences name its new home.
  {
    before:
      '**Workflow rule:** Whenever editing manager UI markup (env browser row, env-edit view, CompositionList, header actions, Travel tabs, etc.), grep `scripts/foundry-test-run.mjs` for the changed classes / text BEFORE declaring the change done.',
    after:
      '**Workflow rule:** Whenever editing manager UI markup (env browser row, env-edit view, CompositionList, header actions, Travel tabs, etc.), grep `scripts/foundry-smoke/` for the changed classes / text BEFORE declaring the change done.',
    identifiers: [['scripts/foundry-smoke/', 'scripts/foundry-test-run.mjs']],
  },
  {
    before:
      '`exerciseManagerEnvironmentPointerTargets` in `scripts/foundry-test-run.mjs` and the env-edit checks in the same file pin many selectors by class, child index (`.nth(N)`), and visible button text.',
    after:
      '`exerciseManagerEnvironmentPointerTargets` in `scripts/foundry-smoke/pageOps/pageLifecycle.mjs` and the env-edit checks in the same file pin many selectors by class, child index (`.nth(N)`), and visible button text.',
    identifiers: [['scripts/foundry-smoke/pageOps/pageLifecycle.mjs', 'scripts/foundry-test-run.mjs']],
  },
  {
    before:
      'The smoke harness Phase D0 (`screenshot-manager` step in `scripts/foundry-test-run.mjs`) pins many selectors by class, `.nth(N)` index, and visible button text.',
    after:
      'The smoke harness Phase D0 (`screenshot-manager` step in `scripts/foundry-smoke/scenarios/`) pins many selectors by class, `.nth(N)` index, and visible button text.',
    identifiers: [['scripts/foundry-smoke/scenarios/', 'scripts/foundry-test-run.mjs']],
  },
  {
    before:
      'The evidence must DEMONSTRATE the change, not merely clear the gate: at least one published frame must show the changed state itself, and when that state is not reachable by the existing capture walk in `scripts/foundry-test-run.mjs` or by a registry case, the branch adds one that reaches it rather than publishing an unrelated frame.',
    after:
      'The evidence must DEMONSTRATE the change, not merely clear the gate: at least one published frame must show the changed state itself, and when that state is not reachable by the existing capture walk in `scripts/foundry-smoke/scenarios/` or by a registry case, the branch adds one that reaches it rather than publishing an unrelated frame.',
    identifiers: [['scripts/foundry-smoke/scenarios/', 'scripts/foundry-test-run.mjs']],
  },

  // Issue 1715 moved the module entry's Foundry edge into `src/bootstrap/`; each of these eleven
  // sentences cites one code anchor that moved with it. The migration-gate entry renames a symbol
  // and its file together, which is one anchor rather than two.
  {
    before:
      "`_resolveCraftingActor` / `_resolveCraftingSources` (`src/main.js`) are the whole gate, which is exactly why every player-facing facade (`craftRecipe`, `salvageComponent`, `listInventoryForActor`, the alchemy pair) takes an **`actorId`** and resolves it, and **never accepts an actor uuid**.",
    after:
      "`_resolveCraftingActor` / `_resolveCraftingSources` (`src/bootstrap/craftingFacade.js`) are the whole gate, which is exactly why every player-facing facade (`craftRecipe`, `salvageComponent`, `listInventoryForActor`, the alchemy pair) takes an **`actorId`** and resolves it, and **never accepts an actor uuid**.",
    identifiers: [["src/bootstrap/craftingFacade.js", "src/main.js"]],
  },
  {
    before:
      "`applyComplicationDelivery` (`src/main.js`) is the correct pattern; the blind-run gather relay carried the defect and #1288 removed it — `isGatheringActorSelectableByUser` (`src/config/preferencesCleanup.js`) now reads the passed user only, and denies rather than throwing on a nullish user (`Document#testUserPermission` reads `user.isGM` as its first statement) or slipping through on a user-id STRING (`getUserLevel` reads `user.id`, so a string falls through to `ownership.default`).",
    after:
      "`applyComplicationDelivery` (`src/bootstrap/socketRouter.js`) is the correct pattern; the blind-run gather relay carried the defect and #1288 removed it — `isGatheringActorSelectableByUser` (`src/config/preferencesCleanup.js`) now reads the passed user only, and denies rather than throwing on a nullish user (`Document#testUserPermission` reads `user.isGM` as its first statement) or slipping through on a user-id STRING (`getUserLevel` reads `user.id`, so a string falls through to `ownership.default`).",
    identifiers: [["src/bootstrap/socketRouter.js", "src/main.js"]],
  },
  {
    before:
      "**The player salvage order key is derived INDEPENDENTLY at two sites, and they must produce the identical string or the captured order silently reads empty.** The inventory store WRITES the order under `progressiveOrderKey({ scope: 'salvage', id })` (via `salvageOrderId` in `inventoryStore.svelte.js`), and `CraftingEngine.salvage` READS it back through the injected `getPlayerResultOrder` (wired to `_readPlayerResultOrder` in `src/main.js`) at capture time — two separate derivations of the same key.",
    after:
      "**The player salvage order key is derived INDEPENDENTLY at two sites, and they must produce the identical string or the captured order silently reads empty.** The inventory store WRITES the order under `progressiveOrderKey({ scope: 'salvage', id })` (via `salvageOrderId` in `inventoryStore.svelte.js`), and `CraftingEngine.salvage` READS it back through the injected `getPlayerResultOrder` (wired to `_readPlayerResultOrder` in `src/bootstrap/composeServices.js`) at capture time — two separate derivations of the same key.",
    identifiers: [["src/bootstrap/composeServices.js", "src/main.js"]],
  },
  {
    before:
      "Both hooks fire synchronously, inside the still-`await`ed `game.settings.set`: `ClientSettings#set` → `#setWorld` → `Setting#update`/`create` → `ClientDatabaseBackend#_handleUpdateDocuments` (or `#_handleCreateDocuments` on the first write) calls `Hooks.callAll('updateSetting', …)` / `Hooks.callAll('createSetting', …)` before the write's promise resolves (`client/data/client-backend.mjs`, identical on 13.351 and 14.367), which is why `src/main.js` registers one handler on both hooks rather than choosing between them.",
    after:
      "Both hooks fire synchronously, inside the still-`await`ed `game.settings.set`: `ClientSettings#set` → `#setWorld` → `Setting#update`/`create` → `ClientDatabaseBackend#_handleUpdateDocuments` (or `#_handleCreateDocuments` on the first write) calls `Hooks.callAll('updateSetting', …)` / `Hooks.callAll('createSetting', …)` before the write's promise resolves (`client/data/client-backend.mjs`, identical on 13.351 and 14.367), which is why `src/bootstrap/hooks.js` registers one handler on both hooks rather than choosing between them.",
    identifiers: [["src/bootstrap/hooks.js", "src/main.js"]],
  },
  {
    before:
      "`SalvageRunManager.processWorldTime` and `CraftingRunManager.processWorldTime` were the unguarded case (#656, fixed): both now take an injected `isPrimaryGM` collaborator, defaulting fail-open to `() => true` so unit fixtures still resume, with the real `activeGM` check wired at construction in `src/main.js`.",
    after:
      "`SalvageRunManager.processWorldTime` and `CraftingRunManager.processWorldTime` were the unguarded case (#656, fixed): both now take an injected `isPrimaryGM` collaborator, defaulting fail-open to `() => true` so unit fixtures still resume, with the real `activeGM` check wired at construction in `src/bootstrap/composeServices.js`.",
    identifiers: [["src/bootstrap/composeServices.js", "src/main.js"]],
  },
  {
    before:
      "**Membership is an explicit allowlist, so READ it — never infer it from a module's kind or its name.** That incident does **not** generalize to \"builders are in the harness graph\": its sibling `InventoryListingBuilder` is copied by **no** harness (its only importer is `src/main.js`), so the hazard does not apply to it at all — issue 675's delta inherited the opposite belief from this note and planned around a constraint that did not bind.",
    after:
      "**Membership is an explicit allowlist, so READ it — never infer it from a module's kind or its name.** That incident does **not** generalize to \"builders are in the harness graph\": its sibling `InventoryListingBuilder` is copied by **no** harness (its only importer is `src/bootstrap/craftingFacade.js`), so the hazard does not apply to it at all — issue 675's delta inherited the opposite belief from this note and planned around a constraint that did not bind.",
    identifiers: [["src/bootstrap/craftingFacade.js", "src/main.js"]],
  },
  {
    before:
      "`createJournalCommandsForFabricate` in `src/main.js` therefore emits `options ?? {}`; targeted replies supply `{ recipients: [senderId] }` rather than relying on a recipient field inside a broadcast payload.",
    after:
      "`createJournalCommandsForFabricate` in `src/bootstrap/journalOperations.js` therefore emits `options ?? {}`; targeted replies supply `{ recipients: [senderId] }` rather than relying on a recipient field inside a broadcast payload.",
    identifiers: [["src/bootstrap/journalOperations.js", "src/main.js"]],
  },
  {
    before:
      "Initial crafting check descriptors are redacted in `createCraftingJournalOperations` in `src/main.js` before transport, independently of the post-commit roll-handoff entitlement check.",
    after:
      "Initial crafting check descriptors are redacted in `createCraftingJournalOperations` in `src/bootstrap/journalOperations.js` before transport, independently of the post-commit roll-handoff entitlement check.",
    identifiers: [["src/bootstrap/journalOperations.js", "src/main.js"]],
  },
  {
    before:
      "The service stays Foundry-free and unit-testable: the `senseSceneRegions` collaborator (`(travelActorUuid) => Iterable<sceneRegionUuid>`) is injected (default `() => []`); the real implementation is wired in `src/main.js`.",
    after:
      "The service stays Foundry-free and unit-testable: the `senseSceneRegions` collaborator (`(travelActorUuid) => Iterable<sceneRegionUuid>`) is injected (default `() => []`); the real implementation is wired in `src/bootstrap/composeServices.js`.",
    identifiers: [["src/bootstrap/composeServices.js", "src/main.js"]],
  },
  {
    before:
      "Key files: `GatheringLocationService.js`, `src/main.js` (`senseSceneRegions` injection), `src/canvas/regionHitTest.js`, `foundryBridge.js`, `adminStore.js`, `GatheringView.svelte` / `src/ui/SvelteFabricateApp.svelte.js`.",
    after:
      "Key files: `GatheringLocationService.js`, `src/bootstrap/composeServices.js` (`senseSceneRegions` injection), `src/canvas/regionHitTest.js`, `foundryBridge.js`, `adminStore.js`, `GatheringView.svelte` / `src/ui/SvelteFabricateApp.svelte.js`.",
    identifiers: [["src/bootstrap/composeServices.js", "src/main.js"]],
  },
  {
    before:
      "The gate is `_runMigrations` in `src/main.js`, which early-returns unless `game.users?.activeGM?.id === game.user?.id`, so exactly one client runs the pass and no player or assistant races the setting writes.",
    after:
      "The gate is `runMigrations` in `src/bootstrap/migrations.js`, which early-returns unless `game.users?.activeGM?.id === game.user?.id`, so exactly one client runs the pass and no player or assistant races the setting writes.",
    identifiers: [["`runMigrations` in `src/bootstrap/migrations.js`", "`_runMigrations` in `src/main.js`"]],
  },
  // Four cites written as a bare `main.js` rather than `src/main.js`, repointed with the rest.
  {
    before:
      "The gate applies to actor `setFlag` / `_persist` broadcast document writes too, not only `craft()` / award side effects — `SalvageRunManager.processWorldTime` and `CraftingRunManager.processWorldTime` resume matured timed runs and persist a broadcast `setFlag`, so both carry the `isPrimaryGM` seam wired in `main.js` (issue 656).",
    after:
      "The gate applies to actor `setFlag` / `_persist` broadcast document writes too, not only `craft()` / award side effects — `SalvageRunManager.processWorldTime` and `CraftingRunManager.processWorldTime` resume matured timed runs and persist a broadcast `setFlag`, so both carry the `isPrimaryGM` seam wired in `src/bootstrap/composeServices.js` (issue 656).",
    identifiers: [["`src/bootstrap/composeServices.js`", "`main.js`"]],
  },
  {
    before:
      "See `buildCompendiumImportContextOption` (`src/ui/compendiumDirectoryContext.js`) and its `main.js` wiring.",
    after:
      "See `buildCompendiumImportContextOption` (`src/ui/compendiumDirectoryContext.js`) and its `src/bootstrap/hooks.js` wiring.",
    identifiers: [["`src/bootstrap/hooks.js`", "`main.js`"]],
  },
  {
    before:
      "**The player-path ownership gate lives in the `main.js` FACADE, not in `CraftingEngine`.** `CraftingEngine.craft` / `salvage` contain **no ownership check at all** — they resolve the actor uuid they are handed and mutate that actor's Items directly.",
    after:
      "**The player-path ownership gate lives in the `src/bootstrap/craftingFacade.js` facade, not in `CraftingEngine`.** `CraftingEngine.craft` / `salvage` contain **no ownership check at all** — they resolve the actor uuid they are handed and mutate that actor's Items directly.",
    identifiers: [["`src/bootstrap/craftingFacade.js` facade", "`main.js` FACADE"]],
  },
  {
    before:
      "The interactable socket layer does this: `handleInteractableSocketMessage` (`src/canvas/interactableSocketBridge.js`) takes `{ senderId, isSenderGM }` from `main.js` and gates the visual write/delete edges (GM-only), the behaviour-update edge (non-GM restricted to `system.node`), and activation (requester must be the sender) — see issue 593.",
    after:
      "The interactable socket layer does this: `handleInteractableSocketMessage` (`src/canvas/interactableSocketBridge.js`) takes `{ senderId, isSenderGM }` from `src/bootstrap/socketRouter.js` and gates the visual write/delete edges (GM-only), the behaviour-update edge (non-GM restricted to `system.node`), and activation (requester must be the sender) — see issue 593.",
    identifiers: [["`src/bootstrap/socketRouter.js`", "`main.js`"]],
  },
  {
    before:
      "See `forgetLearnedRecipes` (`src/systems/RecipeVisibilityService.js`) and `deleteRemovedActiveRunFlags` (`src/config/flags.js`) for the worked precedents; the party pool instead lives in a world setting, so its `decrement` re-`set`s the whole map with no `-=` key.",
    after:
      "See `forgetLearnedRecipes` (`src/systems/RecipeVisibilityService.js`) and `writeAcknowledgedRunContainer` (`src/systems/runHistoryEvidence.js`) for the worked precedents; the party pool instead lives in a world setting, so its `decrement` re-`set`s the whole map with no `-=` key.",
    identifiers: [
      [
        '`writeAcknowledgedRunContainer` (`src/systems/runHistoryEvidence.js`)',
        '`deleteRemovedActiveRunFlags` (`src/config/flags.js`)',
      ],
    ],
  },
];

/** Pinned for the same reason as DEDUPLICATED_COUNT. */
const RENAMED_COUNT = 26;

/** Every sentence of the post-split set, as one multiset. */
function survivingSentences() {
  const all = [];
  for (const destination of DESTINATIONS) {
    const absolute = path.join(REPOSITORY_ROOT, destination);
    assert.ok(existsSync(absolute), `DESTINATIONS names ${destination}, which is not in the checkout`);
    all.push(...sentencesOf(readFileSync(absolute, 'utf8')));
  }
  return multiset(all);
}

test('the frozen fixtures are the documents they claim to be', () => {
  // A checker fed an empty or unreadable OLD passes trivially, which is the commonest way a
  // migration gate is green on arrival.
  for (const { fixture, floor } of SOURCES) {
    const absolute = path.join(REPOSITORY_ROOT, fixture);
    assert.ok(existsSync(absolute), `${fixture} is missing; it is the only record of the old text`);
    const count = sentencesOf(readFileSync(absolute, 'utf8')).length;
    assert.ok(
      count >= floor,
      `${fixture} yields ${count} sentences, under its floor of ${floor}. Either it has been ` +
        'truncated, or the normaliser has stopped recognising rule text — both make every ' +
        'assertion below pass over a smaller corpus than the one that matters.'
    );
  }
});

test('every sentence of the pre-split documents still exists somewhere', () => {
  const before = multiset(SOURCES.flatMap(({ fixture }) => sentencesOf(readFileSync(path.join(REPOSITORY_ROOT, fixture), 'utf8'))));
  const after = survivingSentences();
  const allowed = new Set([
    ...DEDUPLICATED.map(({ sentence }) => sentence),
    ...RETARGETED.map(({ before }) => before),
    ...RENAMED.map(({ before }) => before),
    ...RENUMBERED,
    ...DECOUNTED.map(({ before }) => before),
    ...SUPERSEDED_POLICY.map(({ before }) => before),
  ]);
  const lost = missingSentences(before, after).filter(({ sentence }) => !allowed.has(sentence));

  assert.deepEqual(
    lost.map(({ sentence, before: was, after: now }) => `(${was} -> ${now}) ${sentence}`),
    [],
    'these sentences were in the harness documents before the split and are not in the files ' +
      'DESTINATIONS names. Move them, or — if one is a genuine duplicate that now lives in one ' +
      'place — add it to DEDUPLICATED with the file that still carries it, and raise ' +
      'DEDUPLICATED_COUNT in the same commit. If only a registry case count changed, add it to ' +
      'RENUMBERED and raise RENUMBERED_COUNT instead; if a count clause LEFT the sentence because ' +
      'the number is generated now, DECOUNTED and DECOUNTED_COUNT; if only a renamed identifier ' +
      'changed, RENAMED and RENAMED_COUNT.'
  );
});

test('every deduplication claim names a place that really carries the sentence', () => {
  assert.equal(
    DEDUPLICATED.length,
    DEDUPLICATED_COUNT,
    'the deduplication allowlist changed size. Growing it means deliberately dropping one ' +
      'statement of a rule, which needs its own justification in review; shrinking it means ' +
      'lowering this number in the same commit.'
  );

  for (const { sentence, survivesIn } of DEDUPLICATED) {
    assert.ok(
      DESTINATIONS.includes(survivesIn),
      `${survivesIn} is not in DESTINATIONS, so nothing checks it`
    );
    const text = sentencesOf(readFileSync(path.join(REPOSITORY_ROOT, survivesIn), 'utf8'));
    assert.ok(
      text.includes(sentence),
      `DEDUPLICATED says this sentence survives in ${survivesIn}, and it does not:\n  ${sentence}`
    );
  }
});

test('every superseded policy mapping names its frozen source and current replacement', () => {
  assert.equal(
    SUPERSEDED_POLICY.length,
    SUPERSEDED_POLICY_COUNT,
    'the superseded-policy allowlist changed size; each entry excuses exactly one historical sentence'
  );

  const frozen = multiset(
    SOURCES.flatMap(({ fixture }) =>
      sentencesOf(readFileSync(path.join(REPOSITORY_ROOT, fixture), 'utf8'))
    )
  );
  for (const { issue, before, after, survivesIn } of SUPERSEDED_POLICY) {
    assert.ok(APPROVING_ISSUES.has(issue), `superseded policy entry names ${issue}, not an approving issue`);
    assert.ok((frozen.get(before) ?? 0) > 0, `superseded sentence is absent from the frozen corpus:\n  ${before}`);
    assert.ok(DESTINATIONS.includes(survivesIn), `${survivesIn} is not in DESTINATIONS`);
    const current = sentencesOf(readFileSync(path.join(REPOSITORY_ROOT, survivesIn), 'utf8'));
    assert.ok(current.includes(after), `replacement is absent from ${survivesIn}:\n  ${after}`);
    assert.equal(
      survivingSentences().get(before) ?? 0,
      0,
      `superseded sentence still exists in current guidance:\n  ${before}`
    );
  }
});

test('every retarget claim really is a retarget and nothing more', () => {
  assert.equal(
    RETARGETED.length,
    RETARGETED_COUNT,
    'the retarget allowlist changed size. Each entry excuses one sentence from the subset ' +
      'assertion, so growing it needs its own justification in review.'
  );

  const surviving = survivingSentences();
  for (const { before, after } of RETARGETED) {
    // 1. The replacement must actually be somewhere, or the sentence is simply gone.
    assert.ok(
      (surviving.get(after) ?? 0) > 0,
      `RETARGETED claims this replaced a sentence and it is in no destination:\n  ${after}`
    );
    // 2. THE ONLY DIFFERENCE MAY BE THE LINK TARGET.
    assert.equal(
      withoutLinkTargets(after),
      withoutLinkTargets(before),
      'a RETARGETED entry changed more than a link target, so it is a rewrite, not a retarget'
    );
    // 3. And it must not be stale: an entry whose `before` still exists excuses nothing.
    assert.equal(
      surviving.get(before) ?? 0,
      0,
      `RETARGETED still lists this sentence, which is present after all — remove the entry:\n  ${before}`
    );
  }
});

test('every renumbering claim really is a renumbering and nothing more', () => {
  assert.equal(
    RENUMBERED.length,
    RENUMBERED_COUNT,
    'the renumbering allowlist changed size. Each entry excuses one sentence from the subset ' +
      'assertion, so growing it needs its own justification in review.'
  );

  const surviving = survivingSentences();
  for (const sentence of RENUMBERED) {
    // 1. It must not be stale: an entry whose text still exists excuses nothing.
    assert.equal(
      surviving.get(sentence) ?? 0,
      0,
      `RENUMBERED still lists this sentence, which is present after all — remove the entry:\n  ${sentence}`
    );
    // 2. Exactly one surviving sentence may match once digits are ignored.
    const target = withoutCounts(sentence);
    const matches = [...surviving.keys()].filter((candidate) => withoutCounts(candidate) === target);
    assert.equal(
      matches.length,
      1,
      `RENUMBERED entry does not match exactly one surviving sentence once digits are ignored ` +
        `(found ${matches.length}):\n  ${sentence}`
    );
  }
});

test('every decount claim really is a decount and nothing more', () => {
  assert.equal(
    DECOUNTED.length,
    DECOUNTED_COUNT,
    'the decount allowlist changed size. Each entry excuses one sentence from the subset ' +
      'assertion, so growing it needs its own justification in review.'
  );

  const surviving = survivingSentences();
  for (const { before, after, removed, derivedIn } of DECOUNTED) {
    // 1. A clause with no number in it is an ordinary deletion wearing a decount's name.
    assert.ok(/\d/u.test(removed), `DECOUNTED names a clause that states no count:\n  ${removed}`);
    // 2. It must not be stale: an entry whose `before` still exists excuses nothing.
    assert.equal(
      surviving.get(before) ?? 0,
      0,
      `DECOUNTED still lists this sentence, which is present after all — remove the entry:\n  ${before}`
    );
    // 3. The count must still be somewhere, which is the region that generates it.
    assert.ok(
      DESTINATIONS.includes(derivedIn),
      `${derivedIn} is not in DESTINATIONS, so nothing checks it`
    );
    const derived = readFileSync(path.join(REPOSITORY_ROOT, derivedIn), 'utf8');
    for (const delimiter of TOTALS_DELIMITERS) {
      assert.ok(
        derived.includes(delimiter),
        `DECOUNTED derives this count in ${derivedIn}, which has no ${delimiter}`
      );
    }
    // 4. A retired sentence is done here; otherwise ONLY the named clause may have gone.
    if (after === null) continue;
    assert.equal(
      before.replace(removed, '').replaceAll(/\s+/gu, ' ').trim(),
      after,
      'a DECOUNTED entry changed more than the clause it names, so it is a rewrite'
    );
    assert.ok(
      (surviving.get(after) ?? 0) > 0,
      `DECOUNTED claims this replaced a sentence and it is in no destination:\n  ${after}`
    );
  }
});

test('every rename claim really is a rename and nothing more', () => {
  assert.equal(
    RENAMED.length,
    RENAMED_COUNT,
    'the rename allowlist changed size. Each entry excuses one sentence from the subset ' +
      'assertion, so growing it needs its own justification in review.'
  );

  const surviving = survivingSentences();
  for (const { before, after, identifiers } of RENAMED) {
    // 1. The replacement must actually be somewhere, or the sentence is simply gone.
    assert.ok(
      (surviving.get(after) ?? 0) > 0,
      `RENAMED claims this replaced a sentence and it is in no destination:
  ${after}`
    );
    // 2. It must not be stale: an entry whose `before` still exists excuses nothing.
    assert.equal(
      surviving.get(before) ?? 0,
      0,
      `RENAMED still lists this sentence, which is present after all — remove the entry:
  ${before}`
    );
    // 3. The only difference may be the one named identifier, and the substitution must really
    //    fire: a pair matching nothing would leave the equality below comparing a sentence to
    //    itself, and five pairs under one entry would excuse a rewrite as a rename.
    assert.equal(identifiers.length, 1, `RENAMED entry names ${identifiers.length} pairs, not one`);
    let restored = after;
    for (const [renamed, original] of identifiers) {
      assert.ok(restored.includes(renamed), `RENAMED entry does not contain ${renamed}`);
      restored = restored.replaceAll(renamed, original);
    }
    assert.equal(
      restored,
      before,
      'a RENAMED entry changed more than the identifiers it names, so it is a rewrite'
    );
  }
});

test('the comparator catches deletion, reordering and rewording', () => {
  // A gate that has only ever been watched to report nothing is not known to work.
  const original = ['Never import them directly.', 'Read the token through `.document`.', 'Do not conflate the two.'];
  const before = multiset(original);

  // 1. Unchanged is clean.
  assert.deepEqual(missingSentences(before, multiset(original)), []);

  // 2. Reordering is NOT a loss. A move legitimately changes order.
  assert.deepEqual(missingSentences(before, multiset([...original].reverse())), []);

  // 3. Deletion is caught, and names the sentence.
  const deleted = missingSentences(before, multiset(original.slice(1)));
  assert.deepEqual(deleted.map(({ sentence }) => sentence), ['Never import them directly.']);

  // 4. REWORDING is caught. Same rule, different words: the sentence that went is reported and the
  //    replacement is not credited for it.
  const reworded = missingSentences(
    before,
    multiset(['Never import these directly.', ...original.slice(1)])
  );
  assert.deepEqual(reworded.map(({ sentence }) => sentence), ['Never import them directly.']);

  // 5. A DUPLICATE that collapses to one is caught — the set comparison this replaces would not.
  const twice = multiset([...original, original[0]]);
  const collapsed = missingSentences(twice, multiset(original));
  assert.deepEqual(collapsed, [{ sentence: 'Never import them directly.', before: 2, after: 1 }]);
});

test('normalisation forgives formatting and nothing else', () => {
  // What a move legitimately changes: a bullet becomes a paragraph, a heading level shifts, a
  // blockquote is unwrapped, indentation moves. None of those is a lost rule.
  const asBullet = sentencesOf('- Never import them directly.');
  assert.deepEqual(sentencesOf('Never import them directly.'), asBullet);
  assert.deepEqual(sentencesOf('### Never import them directly.'), asBullet);
  assert.deepEqual(sentencesOf('> Never import them directly.'), asBullet);
  assert.deepEqual(sentencesOf('  1. Never   import them  directly.'), asBullet);

  // What it must NOT forgive.
  assert.notDeepEqual(sentencesOf('never import them directly.'), asBullet);
  assert.notDeepEqual(sentencesOf('Never import them directly'), asBullet);

  // Structure carries no rule and is dropped, so a table reflow or a fence move is not a loss.
  assert.deepEqual(sentencesOf('| a | b |\n| --- | --- |\n---\n<!-- x -->\n[ref]: https://e.com\n'), []);
  assert.deepEqual(sentencesOf('```js\nconst a = 1;\n```\n'), []);
});
