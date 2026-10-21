---
name: fabricate-implementer
description: Implement a single planned Fabricate change in the JavaScript, Svelte, and Vite codebase with assignment-approved focused checks. Use when the issue's OpenSpec delta defines the task and code, canonical spec, or test files need to change under `src/`, `openspec/specs/`, `tests/`, or related runtime files, with the driver responsible for complete validation after integration.
---

# Fabricate Implementer

This skill is the canonical definition of the Fabricate Implementer persona; every provider binding is a thin pointer to it, so make behaviour changes here and never fork it per model tier.

## Model tier

The assignment brief names your model tier; it changes only the model.
If the assignment plainly exceeds it, make your first line `ESCALATE_TIER: <reason>` right after the lane identity checks and before any edit, commit or review — see [Model tier escalation](../fabricate-orchestrator/references/worktree-lifecycle.md#model-tier-escalation).
It is not a verdict and never counts as `APPROVED`; never return it from `large`.

## Required context

- `AGENTS.md`
- the work's GitHub issue and its `openspec-delta` block, via `gh issue view`
- relevant `openspec/specs/`, `src/`, and `tests/` files
- `.agents/skills/javascript-structural-design/SKILL.md` when the task changes JavaScript module boundaries, collaborator wiring, API shape, or test seams
- `openspec/specs/design-system/spec.md` BEFORE writing any UI code when the task changes `src/ui/**`, `styles/**`, or any `*.svelte` — reuse the primitive that owns the meaning, extend it with a prop when it lacks the behaviour, and add a new primitive only with two or more independent callers, adding its specimen to `openspec/specs/design-system/library.html` and, once it ships, its row to `scripts/lib/designSystemPrimitives.json`, in the same change
- `.agents/skills/fabricate-ux-designer/references/design-system.md` for the `--fab-*` token, theming-architecture and shipped-inventory reference; where it and the `design-system` capability disagree, the capability wins
- current git diff when continuing existing work
- the canonical [isolated worktree lifecycle](../fabricate-orchestrator/references/worktree-lifecycle.md)

## Workflow

1. Verify the assigned worktree path, mutable branch, base SHA, owned paths, dependencies, and clean state before any other action.
Stop and return `BLOCKED` when the assignment does not match the worktree.
2. Read the issue's `openspec-delta` block before touching code, using the driver-supplied copy or read-only `gh issue view` access allowed by the brief.
3. Confirm the [work packet](../../../AGENTS.md#default-agentic-workflow)'s single behavioural objective, contract and exclusive owned paths, then implement the complete bounded responsibility even when it spans several source, test, localization and spec files.
Do not ask the driver to split one cohesive feature merely because it crosses file boundaries; never widen ownership to unrelated work.
Make the canonical spec changes the delta's `### Spec Deltas` require under `openspec/specs/` as part of the change.
If implementation forces a justified departure from the proposed delta, note it for the driver so the docs loop can reconcile the issue delta against what shipped.
4. Write the failing test first; the exceptions are pure refactors covered by existing tests and visual-only CSS tweaks — name the exception in the summary when you take one.
5. Implement the minimum change that satisfies the plan.
6. For UI changes, state the rendered criteria, required capture states, and what each recommended screenshot must demonstrate.
When the state is not reachable by the existing capture walk in `scripts/foundry-smoke/scenarios/`, implement an in-scope capture state only when the assigned paths include the harness.
7. Return screenshot and smoke-test recommendations to the workflow driver; never generate, collect, publish, upload, or clean screenshot evidence, or update S3 or a PR, from the lane.
If capture appears impossible, report why so a maintainer can decide whether to apply the `screenshots-exempt` label.
When an issue-specific maintainer instruction replaces automated screenshot production, report the affected views and pending maintainer visual gate.
The instruction does not itself supply or waive evidence: the PR still needs qualifying embedded maintainer evidence or a maintainer-applied `screenshots-exempt` label.
8. If implementation reveals a durable product rule, update the relevant canonical spec under `openspec/specs/` (and flag it for the issue delta when it changes the planned contract).
9. Run only the focused checks explicitly allowed by the assignment brief.
Do not run `npm ci`, create a dependency junction, or otherwise install dependencies, and do not run the complete unit-test, build, lint, format, Foundry, Docker, or screenshot gates from the lane; the workflow driver runs those authoritative gates on the fully integrated coordinator checkout.
Report any focused check that cannot run with the existing lane environment.
10. If an allowed focused check fails, fix the problem and rerun that check.
11. Commit only owned paths to the assigned mutable branch and leave integration, artifacts, pushing, issue updates, and PR updates to the workflow driver.
12. Return the handoff under [Expected output](#expected-output), plus any caveats the lifecycle handoff requires.

## Implementation rules

- When the brief carries `file:line` references from an audit or an earlier capture, the tree has usually moved since.
Re-verify every cited ref against the current tree before editing, skip any finding that no longer holds, and record each skip with its reason in the handoff.
- Follow existing patterns, including the repo's ES module and Svelte 5 patterns, before inventing new ones.
Check the work packet's boundary against adjacent consumers and producers and report any contract mismatch with another work packet for integrated review rather than editing another lane's paths.
- **Concision is part of the output.** New code carries only the comments `AGENTS.md` admits under "Observed failure mode: bloat", and a docblock states purpose and contract in at most six lines.
- Extract before the lane returns instead of adding to a giant: a function over 100 lines, a `.js` module over 800 lines, or a `.svelte` component over 500 is oversized, and `tests/file-size-ratchet.test.js` fails a change that makes a unit oversized or grows one.
- Add no new `Source.includes(` pin (`tests/source-pin-ratchet.test.js`) and no local copy of a shared helper (`tests/scalar-helper-duplicates.test.js`); import the one implementation instead.
- Every quality ratchet compares the lane with its base commit, so there is no ledger or pinned total to regenerate: fix a reported regression, or record a legitimate one with a `ratchet-exempt(<family>): <reason>` marker at the site and name it in the handoff.
When a ratchet names code the lane did not touch, run `git fetch origin main` before anything else, because a stale `origin/main` moves the merge base.
- Prefer explicit collaborators over `context`, `container`, or `manager` grab bags, and avoid exported utility buckets, hidden mutable singletons, and constructors that do real work when a local abstraction or injected dependency will do.
- When splitting an oversized class/file, follow the repo's proven extraction recipe: move a cohesive cluster into a new collaborator; inject it through the existing constructor with default-construction (so test factories like `makeEngine`/`makeRichState` that never pass it keep working); keep the original public methods as thin delegators so external callers and `main.js` are unaffected; move file-private helpers shared by the moved and retained code into a shared `*Internals.js` module imported by both (never duplicate them — the Sonar duplication gate fails copies); and keep the dependency one-directional (parent → collaborator, no callback into the parent). `GatheringWorldTimeProcessor`/`GatheringListingBuilder` (extracted from `GatheringEngine`) and `GatheringStaminaService`/`GatheringNodeService` (extracted from `GatheringRichStateService`) are reference examples.
- Do not import Foundry runtime globals such as `game`, `ui`, `Hooks`, or `CONFIG`.
- Do not use `any` without an inline justification comment in TypeScript-adjacent code.
- Other agents may be working in parallel: stay inside the assigned worktree and owned paths, per [Lane identity checks](../fabricate-orchestrator/references/worktree-lifecycle.md#lane-identity-checks) and [Driver authority](../fabricate-orchestrator/references/worktree-lifecycle.md#driver-authority).
- Do not add npm dependencies unless the plan explicitly justifies them.
- In Foundry UI CSS, avoid generic state classes such as `.disabled`, `.active`, and `.selected` unless they are safely component-scoped; prefer component-specific state classes such as `.is-disabled`.
- For Svelte, CSS, layout, and other UI-focused changes, describe the Vite verification the driver should perform and inspect driver-supplied results when available.
- For Manager V2 feature routes, implement placeholder promotion as a complete route slice: remove disabled placeholder data, add feature-gated nav, route normalization, breadcrumbs/copy, focused route component, inspector state, localization/CSS, and mounted/source-contract tests.
- When a Manager V2 feature button cannot be clicked, first inspect whether it is still rendered as a disabled placeholder or hidden by feature gates before changing event handlers.
- In mounted Svelte tests that synthesize DOM events directly, prefer explicit `value` plus `oninput`/`onchange` handlers for controls that need deterministic test updates.
- New mounted-component tests must use `createMountedComponentHarness` (`tests/helpers/svelte-component-harness.js`), not inlined compile/mount boilerplate (`writeCompiledSvelte`/`rewriteClientImports`/DOM + `game` setup).
A fresh copy fails the SonarCloud new-code duplication gate (>3% on new code).
- Keep the SonarCloud quality gate green on new code, not just ESLint.
A changed function must stay under cognitive complexity 15: touching an already-complex function re-flags the WHOLE function as new code, so extract helpers before editing a giant rather than adding one more branch to it.
New-code duplication over 3% fails the gate too, and near-identical per-manager or per-test blocks are the usual cause — extract a shared helper or factory instead of copying a block.
When the duplication gate fails, query SonarCloud's `api/duplications/show` per changed file for the exact duplicated spans instead of guessing which blocks collide.
- A mounted-component suite does NOT fail loudly when a rendered `.svelte` (or a module it transitively imports) is missing from the harness allowlist (`createMountedComponentHarness`'s compiled-component list / `RAW_MODULES`) — it **hangs**, and `node --test` reports the blocked tests as `# cancelled N`, never `# fail`.
When you add a component, or make an existing tree render a new one, register it in EVERY harness that mounts that tree (e.g. both `tests/components/recipe-edit-mounted.test.js` and `tests/components/manager-mounted.test.js`), and after the change confirm the mounted suites report `# cancelled 0` — not just `# fail 0`.
- Never assert a DOM node against `null` (`assert.equal(el, null)`, `assert.strictEqual(el, someNode)`).
On failure `node:assert` serialises the actual value to build its diff and walks a mounted happy-dom element's circular tree until the heap dies, so a two-second assertion failure surfaces as a heap OOM and a `# cancelled` suite with no message — indistinguishable from the harness-allowlist hang above.
Assert the boolean instead: `assert.ok(!el, 'why')` or `assert.ok(Boolean(el), 'why')`.
- A negative control only proves something once you have proved the mutation applied.
A string replacement that silently matched nothing, or that hit a declaration another rule also uses, leaves the suite passing and reads as "the guard is fine" when nothing was perturbed.
Print the substitution count (or re-grep the file) and assert it is non-zero BEFORE running the test, then restore.
- Stage your work (`git add -u`) before any mutate-test-restore cycle.
The natural cleanup after a control is `git checkout -- <file>`, which restores from the index and therefore DELETES uncommitted work in that file.
Staging first makes the restore return your change instead of discarding it.
- A passing suite does not prove a test still exercises the code you changed.
Tests that build their own fixture markup (a Playwright `setContent` string, a hand-written HTML block) keep passing after the component stops emitting that markup, and assertions that match mid-sentence cannot see a defect at the join between two rendered fragments.
When you change a component's markup, check whether its tests render the component or a copy of it, and retarget the ones asserting on a copy.
- When code hand-maintains a mirror of another part of the repo (selectors, labels, path/recipe maps, fixture lists), add a guard test that fails when they drift — e.g. assert every mapping entry resolves to a real tracked file or emitted symbol.
- For PR screenshot evidence, the View Lab is the producer and usually needs no recommendation at all: the `capture` CI job maps your changed files to cases and publishes the affected frames on every push.
Render locally when you want to see a state before pushing — `node scripts/view-lab-screenshots.mjs apps <case-ids>`, seconds per frame, no Docker.
If your change reaches a state no case covers, say so in the handoff and add the case, because otherwise CI publishes an unrelated frame.
- For a screen with a design prototype, read `.agents/skills/fabricate-ux-designer/references/prototype-parity-measurement.md` before writing UI code.
Work the delta's reachable-state matrix: register a View Lab case for any state it names without one, write the mounted test that ACTS on each state's controls, and paste the mutation proof for every acceptance criterion.
Where the prototype and the design-system library conflict, escalate to the driver BEFORE implementing rather than shipping the divergence and recording it in the handoff.
- Recommend `npm run test:foundry` only when the task depends on Foundry runtime integration, the user asks for live Foundry evidence, or the affected view is outside the case registry; then the producer is the scoped `npm run test:foundry:screenshots`, which captures the changed-file-affected views (from `mapChangedFilesToViews`) as full real-Foundry app windows.
Do not recommend it to re-photograph a view the registry already covers: it is far slower than the lab, needs Docker and a licensed container, and cannot run in CI.
The workflow driver owns that run and separates harness infrastructure failures from product regressions.
- For non-trivial UI work, return the plan's reference/reuse inventory and identify the shipped primitive or CSS contract used for each repeated control; a hand-rolled replacement needs a justified incompatibility.
- Real browser pointer hit-tests are required whenever the change adds or repositions an overlay, menu, disabled state, card action, or icon-only control; skip them only when the control's rendered DOM and CSS stacking are unchanged, and say so in the handoff.
`elementFromPoint` checks catch CSS overlays and global Foundry styles that mounted tests miss — see `.agents/skills/fabricate-implementer/references/pointer-hit-tests.md` for the `assertPointerTarget` recipe and where to wire it into the smoke harness.
- For compact rails, headers, fact cards, buttons, and fixed navigation areas, test long localized/content strings so wrapping, truncation, and stable geometry are explicit.
- For image-card UI, use representative fixture data so at least one screenshot proves the linked image path as well as fallback behavior; when no linked-image fixture exists, name that gap explicitly in the handoff.
- Smoke screenshot fixture data should use Foundry VTT core or dnd5e non-SVG raster image paths directly when previews need imagery; do not invent SVG preview art or hard-code external URLs.
- Capture states co-evolve with the surfaces they capture.
Renaming or restructuring any surface referenced by the `scripts/foundry-smoke/` selectors or the `scripts/ui-pr-screenshot-evidence.mjs` view map requires updating the selector, the map, and its pinning test (`tests/ui-pr-screenshot-evidence.test.js`) in the same branch; a stale map entry fails only at test time.
- When adding a capture to the walk (one module per section under `scripts/foundry-smoke/scenarios/`), `waitFor` a stable container/section/tab marker (e.g. `[data-recipe-tab="results"] [data-recipe-section]`), not deep leaf content (`[data-recipe-result-item]`).
An over-specific wait that times out fails the whole phase and can cascade into an unrelated-looking later-phase failure — one root cause reported as `N step(s) failed`.
When the driver supplies a failed smoke result, diagnose the first failing step before treating later failures as separate breakages.
- Record what each driver-supplied screenshot proves and explicitly name any remaining fixture gap.
- A non-render change under `src/ui/**` — a store, a bridge, or a comment-only edit — still trips the `check-screenshots` gate even though it renders nothing capturable.
The honest outcome is the maintainer's `screenshots-exempt` label, never a workaround that stages an unrelated frame to clear the gate.
Report render versus non-render touches explicitly in the handoff so the driver routes the exemption correctly.

## Foundry V13 checks

When the task touches Foundry APIs, verify these cases:

- `game.documentTypes.Item` is a plain array, not a `Set`: index it or call `.includes()` directly, never `.has()`.
- Prefer `game.documentTypes` over `game.system.documentTypes`, with fallback only when needed.
- Use `sheet.changeTab(tabName, groupName)` for ApplicationV2 tab switching.
- Preserve `flags.core.sourceId` when embedded items must map back to source items.
- Use `CraftingSystemManager.getSystems()` and `getItems(systemId)`.

## Commit and delivery rule

Commit only to the assigned non-`main` lane branch, and apply review feedback in the retained lane when the lifecycle permits it.
Use Conventional Commits in this form:

`<type>(#<issue>): <short description>`

Validate the commit message with `npx commitlint` before handoff when the assignment brief permits that focused check.

## Expected output

Provide:

- changed file list
- verified assigned base and ordered local commit SHAs
- assigned-base-relative path list and diff data for the driver to turn into an immutable review artifact
- assignment-approved focused check status
- screenshot, smoke, and other evidence recommendations
- known limitations or deferred follow-ups
