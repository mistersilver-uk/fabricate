# Visual Evidence and Reuse

## Purpose

Use this procedure for non-trivial UI planning, implementation, and review.
It turns supplied references into a control-by-control contract, makes reuse decisions explicit before implementation, and keeps visual evidence tied to the exact candidate that produced it.

## Open every supplied reference

Before claiming parity or visual approval, open every supplied prototype, screenshot, defect matrix, named shipped sibling, and named CSS record.
A list of filenames or links is not inspection.
If an artifact cannot be opened, record it as unavailable and keep the affected visual decision and approval pending.

For each artifact, record:

- its stable identity, such as filename, URL, issue attachment, component path, selector, or named CSS block;
- its intrinsic pixel dimensions when it is an image, and its viewport or window dimensions when it is a rendered prototype or application capture;
- the Fabricate route, component, control, and state that provide the equivalent rendered surface;
- which controls or states the artifact is authoritative for;
- which controls or states another artifact overrides; and
- every expected deviation with its reason.

Authority is assigned per control and state, never once for an entire artifact.
A shipped sibling can govern selection treatment while a prototype governs layout and a defect matrix governs a disabled state.
When two references disagree, resolve the disagreement explicitly in the comparison instead of applying a global “mock wins” or “shipped UI wins” rule.

Use a comparison shaped like this:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Artifact identity and dimensions | Equivalent rendered state | Control or state | Authority | Expected deviation |
|---|---|---|---|---|
| `inventory-selected.png`, 1280×800 | Inventory, component selected | Card selection | Prototype | None |
| `src/ui/svelte/apps/manager/RecipesBrowserView.svelte`, 1024×640 window | Manager recipe browser, selected row | Row selection | Shipped sibling | Preserve its single selection signal |
| Defect matrix row “long title” | Same route with long localized content | Title and actions | Defect matrix | Wrap title without moving actions |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

## Reference surfaces and reuse inventory

Every non-trivial UI delta MUST contain a `Reference surfaces / reuse inventory` section before plan approval.
The inventory names:

- analogous shipped routes and components;
- the canonical primitives and global CSS contracts those surfaces use;
- the states each reusable surface already survives;
- the primitive or shared shell selected for the new work; and
- each deliberate non-reuse or extraction gap, with a concrete reason.

“This is a different manager surface” is not a reuse analysis.
If the new surface represents the same control or state, reuse the shipped primitive or explain the incompatible behavior that prevents it.
Read relevant comments in `styles/fabricate.css`; those comments often record corrections made after a prototype reached real Foundry.
Consult the shipped primitive inventory in `design-system.md` rather than copying its illustrative markup.

When multiple components hand-maintain the same shell or class family, prefer extracting one shared implementation.
Matching duplicated scoped CSS values by hand only postpones drift.
An extraction performed during a redesign must adopt the approved target visuals; moving old markup verbatim proves structural equivalence, not visual correctness.

## Rendered comparison

Compare the exact reference matrix against rendered output, not source declarations alone.
For every authoritative control and state, verify:

- the state is reachable with representative data;
- the visual treatment changes perceptibly when the state changes;
- layout, spacing, typography, alignment, scroll containment, and controls match the assigned authority;
- long names, missing art, empty collections, combined flags, and disabled or error states do not invalidate the design;
- sibling surfaces using the same primitive remain consistent; and
- CSS overrides work in real Foundry when host styling or pointer geometry can affect the result.

A token name in the source is not proof that its effect is visible.
A gate fixture copied from the implementation is not an independent visual oracle.
Author comparison expectations from the reference matrix, canonical UI spec, and shipped sibling behavior.

## Evidence provenance

Every collected automated screenshot view MUST bind to one successful, non-degraded run.
Before accepting or publishing a view, prove:

- the run summary reports success and is not degraded;
- summary and capture manifest identify the same run;
- the run used the exact requested source head;
- the requested target labels include the view;
- the PNG is bound to that view and capture record;
- the manifest-declared dimensions equal the decoded PNG dimensions; and
- any view-specific rules also pass.

Ordinary views use this generic provenance contract.
Tool Studio or another surface with stricter parity dimensions, stress frames, or state requirements retains those additional checks.
Do not weaken a view-specific rule merely because the generic provenance contract passes.

## Maintainer-directed manual visual testing

An explicit issue-specific maintainer decision MAY replace the automated screenshot producer for that change.
Record the decision, the affected views, and the fact that agent visual approval is pending maintainer evidence.
Do not run the replaced producer merely to satisfy habit.

The instruction replaces production, not the evidence gate.
It does not satisfy or waive `check-screenshots`.
The PR still requires qualifying maintainer-provided evidence embedded in its `Screenshots (if applicable)` section or a maintainer-applied `screenshots-exempt` label.
An agent must not apply that label.
Visual approval remains pending until the supplied evidence can be compared against the reference matrix.

The manual-test candidate handoff follows `../../fabricate-orchestrator/references/worktree-lifecycle.md`.
Evidence from another branch, SHA, checkout, or launch surface does not prove the requested candidate.

## Lessons encoded by this procedure

- The already-migrated side wins only for the controls and states where the comparison assigns it authority.
- A shipped sibling's CSS comments can be the durable record of prototype defects.
- A style declaration that renders as a no-op is a failed visual change.
- Hand-rolled copies of `Medallion`, `StatusPill`, `DropZone`, `RollResultBox`, `CraftButton`, or `CraftingThumb` are drift risks when the same behavior is required.
- Borrowing vocabulary and classes from the wrong neighboring feature can be internally consistent and still visually wrong.
- Prototype fixtures are not authority for states they never represent.
