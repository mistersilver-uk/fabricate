# UI System Studio

## Purpose

Define the GM Manager's system-scope studio screens, where a GM authors a crafting system's settings, checks, items, essences, tools, recipes, books, access, knowledge, environments and gathering events, and reviews its overview and validation.
Sibling UI surfaces and the cross-cutting UI rules are indexed by the Surface Map in `ui-integration/spec.md`.

## Systems Tab

Display list + detail editor for crafting systems.

### Base Fields

- Name
- Description
- Recipe resolution mode (`simple`, `routedByIngredients`, `routedByCheck`, `progressive`, `alchemy`)
- Salvage resolution mode

Recipe resolution mode and salvage resolution mode remain system fields, but their editor cards moved to the Crafting group's Settings page (`crafting-settings`).
They are no longer edited on the System Overview page.
Changing recipe resolution mode is destructive and must follow `destructive-changes-and-migrations/spec.md` confirmation/cleanup rules.

### Salvage Resolution Mode Card

The Salvage resolution mode card renders after the Recipe Visibility card (which itself sits below the recipe resolution-mode card) on the Crafting group's Settings page, and only when `features.salvage === true`.
The card offers `simple` (the default), `progressive`, and `routed` (display name "Routed by check").
Salvage has exactly one ingredient, so ingredient-set routing is meaningless and `alchemy` does not apply: neither is offered.
`simple` returns one result group with an optional pass/fail salvage check.

The card SHALL render with the system's persisted `salvageResolutionMode` selected, defaulting to `simple` when the value is `simple` or absent.
Persistence happens only on an explicit GM selection through `setSalvageResolutionMode`.

Changing salvage resolution mode is non-destructive for recipes and runs (it deletes none), but switching into `simple` mode drops surplus result groups on incompatible components via the normalizer's success-first retain-one clamp (see `data-models/spec.md` Component Requirement 5) and reversibly disables salvage on components that still cannot satisfy the new mode.
A switch into `simple` that drops a component's surplus success groups SHALL emit a `ui.notifications.warn` naming the affected component(s).
The confirmation/warn copy is salvage-accurate — it discloses the group deletion and is not the recipe-deletion warning.

In `simple` salvage mode the component salvage editor is capped at one success result group: the Add group affordance is removed and a required visible hint ("Simple mode uses a single result group") is shown, matching the recipe editor's `data-recipe-result-simple` single-group treatment.
The cap counts success groups (`role !== 'failure'`) and does not filter, blank, or destroy a legacy reserved failure group's stored data.
Routed keeps its multi-group list and Add group; progressive is unchanged.

### Feature Toggles

- Gathering: persists `features.gathering` and makes the selected system's gated `Environments` tab reachable when enabled.
- Salvage (`features.salvage`): GM toggle, default on — an absent key defaults true, a present key must be exactly true; gates the salvage subsystem (the `checks-salvage` route, resolution-mode card, component editor, validation, runtime, and player salvage panel).
- Chat output (`features.chatOutput`): GM toggle, default on; hint "Posts a summary chat card after crafting and gathering attempts." — gates the crafting, salvage, and gathering result chat cards.

### Feature Controls

- Category list editor for custom categories only; reserved `General` is always present and not removable
- The Tags & Categories screen renders the three independent vocabularies — recipe categories, component categories, and component tags — simultaneously through the shared vocabulary shell, never as tabs.
  The two category vocabularies draw as a 2-up grid and the tag vocabulary full width beneath them, each in a panel whose head states an icon, a title and a subline, and whose sort control names a key and a direction.
  That sort key and direction ride the panel's lifted browser state, so both survive the route trip.
  Each panel has its own search plus a shown-count chip, a live-validated add form (tone-graded info / success / danger hints as the GM types: lowercase-normalization preview for tags, `General` reserved, duplicate detection, ready-to-add), and a redesigned row carrying a per-category icon, `#`-prefixed tag names, a "Built-in fallback" subtitle on the locked General row, an `N references` / `Unused` / `Locked` badge, and an inline delete-confirm strip for the destructive cascade.
  The locked General row and the persisted per-category icon are SYSTEM-scope differences carried as panel data, not as a second shell: the world vocabulary route renders neither, and a recipe or component category may carry a persisted per-category icon edited inline from its row.
  A panel's `kind` — `recipeCategories`, `componentCategories` or `componentTags` — is the SCREEN's vocabulary id for one panel on both routes.
  It is neither the system's persisted field name (`categories`, `componentCategories`, `itemTags`) nor a row's own `kind` (`category`, `component-category`, `tag`), which is the same screen-name-versus-domain-noun ruling `ui-world-scope/spec.md` `## GM World Scoped Entity Routes` requirement 5 makes.
- The screen states no total across the three vocabularies: its inspector rail is retired (issue 1915), and the left rail's own `Tags & Categories` badge sums the three panels' entry counts, each category panel's counting its reserved `General` row as `ui-world-scope/spec.md` `## GM World Vocabulary Route` requirement 5 says it does.
  A tag's reference count includes the recipe tag-placeholder ingredients that name it, not only the components carrying it.
  **Known defect, recorded rather than implied correct (issue 1191):** every reference count on this screen is taken over the recipe and component cohorts as the two library searches currently filter them, not over the system's roster.
  A recipe or component that an active library search excludes therefore contributes nothing, so a vocabulary entry can read `Unused` while the system still references it — and an `Unused` row deletes in **one click**, because the confirm strip's copy reassigns references and is skipped for a zero-reference row.
  The intended contract is that `Unused` means unused _in this system_; issue 1081 preserved the existing cohort deliberately rather than change a rendered number under a performance heading.
  As of issue 1462, leaving the recipe or component library clears that library's search term (see **GM Recipe Library**), so a search can no longer be carried into this screen and left applied there.
  The clear republishes both cohorts this screen counts before the destination route renders, so the wrong counts are not shown even for one frame.
  The cohort choice itself is unchanged and issue 1191 stays open against it: a consumer reading this projection from outside the manager's route scope would still be counting the filtered cohort.
  **Known defect, recorded rather than implied correct (issue 1397, folded into issue 1915):** two entries of one system vocabulary that differ only in case collapse to a single row, because the row builders de-duplicate on the normalized key the row id is derived from.
  That row carries a `title` naming every spelling it stands for, and the disclosure is pointer-only: it reaches neither the keyboard nor a screen reader, which is why it is a last resort rather than the repair.
  Deleting the row removes every spelling that collapses to its key and reassigns their records by the same cascade, so no orphaned spelling returns as an `Unused` row on the next render.
  The storage rule itself stays case-preserving, and reconciling it is issue 1411's.
- Item tag list editor
- Essences toggle (`features.essences`)
- Property macros toggle (`features.propertyMacros`)
- Effect transfer toggle (`features.effectTransfer`)
- Time requirements toggle (`requirements.time.enabled`): GM toggle, default on — an absent key defaults true, a present key must be exactly `false` to disable.
  It renders as a tile in the System Settings Optional features section (beside the currency toggle) and gates the recipe Duration surfaces (the single-step Duration card and the per-step duration editor) and the application of recipe/step durations at craft time.
- Currency requirements toggle (`requirements.currency.enabled`) — the system's ONLY currency control; the unit profile is world scope and is authored under World > Currency
- Multi-step recipes toggle (`features.multiStepRecipes`)
- Gathering toggle (`features.gathering`)
- Salvage toggle (`features.salvage`, default on)
- Chat output toggle (`features.chatOutput`, default on)

### GM Checks Studio

`Checks` is an EXPANDABLE left-rail group whose children are Crafting / Salvage / Gathering / Validation; salvage and gathering appear only under their feature flags.
Each activity child carries an issue-count badge derived from `evaluateCheckReadiness`; the parent badge sums the three ACTIVITY children only, and Validation's badge is that same total restated and is never added to it.
The rail's badge column carries THREE distinguishable things and they must not be confusable: a record-count numeral (`Gathering 69`), an issue badge in a distinct pill treatment with an accessible name naming the unit ("1 issue"), and a per-activity DIRTY marker distinguished from the issue badge by shape and accessible name, not by colour alone.
The shipped Essences rail item and the `.manager-rail-toggle` collapse control both survive; a collapsed rail renders the group's parent icon with its issue badge and expands on activation.
`checks` is retained as a redirect to the first available child so existing deep links and every View Lab `expectView` assertion have a defined answer.
`CHECKS_VIEWS` values ARE the `data-manager-view` strings the root renders, not nav-item ids.

Each activity route renders FIVE sections — The roll / Outcomes / Triggers / Modifiers / On failure — each with a count badge and a warning dot fed from the same readiness evaluation that feeds the rail badge and the Validation route, so the three can never disagree.
The warning dot carries a text accessible name, and a section carrying both a count and an issue renders both; a count of zero renders unbadged, because five sections each wearing a `0` is chrome rather than information.
The dot is EXPLAINED IN THE PANEL: the open section renders the shared `Callout` for each of its own issues, carrying the same sentence the Validation route renders for that issue id from one exported copy map, toned `warning` for an issue that blocks enabling and `info` for one that does not.
A dot whose only explanation is on another route is a signal with no legend, and two surfaces describing one issue from two copies of the sentence is how they come to describe it differently.
When ranking leaves an entry out — `highest` over two or more eligible entries, or `playerPicks` whose pick cap is below the number of eligible entries — Modifiers readiness emits one non-blocking warning naming every eligible transformed-quantity entry whose average cannot be compared; the entry remains selectable and rollable, and the warning never becomes `modifierExpressionInvalid`.
The section strip is a real ARIA tablist driven by Arrow, Home and End, and only the SELECTED tab carries `aria-controls`, because only the selected section's panel is in the document.
It renders through the ONE editor tab strip primitive, which draws both of its marks and offers that selected-tab-only mode; this route owns the section-to-tab mapping, its `checks-section-*` and `data-checks-*` hooks and the issue count's localized unit, and nothing about how a mark looks.
Outcomes renders in EVERY mode and hosts that mode's own outcome model: the two-outcome pass/fail statement on `simple`, the `awardMode` selector on `progressive`, the band strip plus the tier rows on `routed`.
Its count badge is emitted only where there is a tier list to count, so `simple` and `progressive` render it unbadged.
Modifiers renders in every mode too, INCLUDING the two that roll nothing — gathering `d100` and alchemy `none` — because the modifier card is the one owned path for reporting that a selection reaches no roll, and hiding the section it lives in would take that report away from the two states that need it.
Any section that cannot apply renders the shared `EmptyState` naming the mode, preserving the shipped d100 explanation rather than blanking the route.

A check that is switched off — the route has a LIVE Active toggle and it is not on — collapses the strip to a single section and renders the shared `EmptyState` with a "Turn this check on" action; its right rail keeps the documentation/quickstart pair, the activation card and an `OFF` digest.
"Switched off" is not `optional && !enabled`: `optional` does not mean the same thing per activity (on gathering it is `mode === 'd100'`, the one mode with no toggle at all), so the predicate is stated per activity and gathering `d100` is INERT rather than off.
Alchemy `checkMode: "none"` is the opposite case and is OFF, not inert: it is what the Active switch writes when the GM turns an alchemy check off, so it takes this same collapsed panel and its "Turn this check on" action.

The right rail is an INDEPENDENTLY SCROLLABLE container in the SIDE-COLUMN STATE ONLY, never a pinned column that clips.
On an activity route it carries, in order: the documentation/quickstart pair, the activation control, a "Preview as" panel, an outcome-preview simulator, a per-outcome odds histogram, and a "This check" digest whose status chip reads `OK` / `OFF` / a count pill.
Where the resolution mode denies the GM the choice, the activation control renders a LOCKED READING of the switch — the same track and knob, a padlock and the hint — not the hint alone: removing the control removed the state with it, and "this mode requires the check" does not say which way the switch is set.
The locked reading is always ON, because every mode that hides the switch rolls its check.

**Every Active switch STAGES.** Flipping one marks its activity dirty, enables the shared `Save checks`, is guarded by the route-exit prompt, and is restored by Discard; nothing is written on the click itself.
This holds for all four activities, so one affordance does not mean two different things depending on the route in view.
Crafting (non-alchemy), salvage and gathering stage their check's `enabled` flag; an ALCHEMY crafting check stages `alchemy.checkMode` instead (`simple` on, `none` off), because that is the value its engine path dispatches on and `craftingCheck.enabled` is ignored for alchemy.
Each activity's save writes its Active flag before its slot draft and ANDs both answers, and each slot write is guarded on that slot's own dirty flag so a switch-only save does not rewrite an untouched formula block.
The reading is derived from the MODE rather than from the persisted `enabled` flag, since a mandatory check runs whatever that flag says; it reads on for every locked mode except alchemy `none`, which rolls nothing.
The Preview-as panel carries an ACTOR selector and a RECORD selector, and both are real controls with a simulator behind them.
"Preview as" offers UNFILTERED `game.actors` — the Studio is GM-only and a GM's `Document#isOwner` is true for every actor, so the player-side "assigned character OR owner" union would hide actors a GM can legitimately preview against — plus an explicit "No actor" option, under which every `@` key resolves to `0` and the panel renders the unresolved warning rather than a total.
The RECORD is the same selection the Outcomes section's band strip is drawn against: a check's own default DC first, then every authored recipe tier.
In PROGRESSIVE mode the record selector is replaced by the progressive preview sandbox's ordered-difficulty field, because a record's whole contribution is a DC and a progressive check has none.

#### Outcome-preview simulator

The simulator DRIVES THE SAME RUNNERS the engines drive and reimplements no resolution: tier matching, forced outcomes and tier stepping have exactly one implementation, which is `src/systems/checkRoll.js`.
A preview that disagreed with the engine about which tier a roll lands on would be worse than no preview at all.
It rolls with a NULL interactive-roll bag, so it posts no chat message, shows no prompt and mutates nothing: all three runners spread `rollOptions` and `{...null}` is `{}`, the chat post is gated on `options?.interactive`, and `allowInteractive: false` bypasses Foundry's manual-fulfilment resolver.

**It NEVER executes a DC macro.**
For `dcMode: 'dynamic'` it resolves the STATIC fallback DC and renders a stated "resolved by macro at craft time, not previewed" note.
The engine reaches a dynamic DC by calling `MacroExecutor.run`, which compiles `macro.command` into an `AsyncFunction` and executes it with the current user's authority, guarded only by `typeof command === 'string'` — which is NOT a script-type check, because Foundry declares `type` with `initial: CONST.MACRO_TYPES.CHAT` and `command` as `required: true, blank: true` on both types, and the shipped `ItemDropZone documentType="Macro"` accepts any Macro.
A DC macro that creates a `ChatMessage`, updates an Actor or writes a flag must not be able to do so from a preview button.

It renders only values present on the returned result, never a parallel model: the rolled die face on a `Medallion`, the TERSE breakdown line (`d20 9 +10 · Sera Vane` — the full resolved formula is the `THIS CHECK` digest's row), the total against the DC with its margin, the matched band card with its disposition, and a "What happens" list of icon fact rows including tier-step and minimum-tier evidence.
It surfaces `resolved === false` — the signal `resolveCheckFormulaDisplay` already produces by re-resolving with `missing: 'NaN'` — as a stated "does not reduce to a number for this actor" warning, because `Roll.parse`'s own `missing: "0"` silently turns an unresolved `@` key into a plausible WRONG total, and "renders only values present on the result" does not catch that, since the wrong number IS on the result.
It treats `Actor#getRollData()`'s live `system` object as read-only and clones before any local augmentation.
A rolled readout describes ONE (formula, actor, record) tuple and is DROPPED when any of the three changes, because a total no current configuration produces must not stay on screen.

#### Per-outcome odds histogram

The histogram ENUMERATES the faces of the formula's single die group and buckets each one through the SAME classifier `runFormulaRouted` uses, extracted as `classifyCheckTotal` so resolution and preview cannot drift; a pass/fail check buckets through the same forced-outcome resolution plus the comparison, and a progressive check through the same `resolveProgressiveAward` loop the engines award through.
There is no sampling and no `Math.random`.
The per-face dice bag is produced by the EXISTING `rolledDiceGroups` code path, not hand-shaped, because `resolveForcedOutcome` and `applyTierStepTriggers` both read `data.diceGroups` and a bag missing `results` makes every natural-20 trigger invisible to the histogram while still matching a hand-computed distribution for a trigger-free check.

**Its predicate is a POSITIVE WHITELIST over `Roll.parse`, not a string scan:** exactly one die term with `modifiers.length === 0`, `number === 1`, an integer `faces >= 1` and a NUMERIC denomination, with every remaining term deterministic and no `StringTerm` present.
A string scan admits formulas face enumeration cannot describe — `2d6` is one die group with a triangular distribution, `1d6x` has unbounded support, `1d20r1` reweights, `1d20min2` clamps, `cs`/`cf`/`ms` change what `total` means, `1d(1d4)` leaves `number`/`faces` undefined, and `1df`/`1dc` are non-numeric denominations.

**Three properties of `Roll.parse` are load-bearing and are stated rather than assumed.**
(1) **It throws.** The compiled peggy grammar raises a `SyntaxError` and `Roll.parse` does not `try`, so every intermediate keystroke of a mid-edit formula (`1d20 +`, `1d20 + (`, `max(1d20,`) throws out of any predicate built on it; the call is WRAPPED and a thrown parse is a not-enumerable OUTCOME, never an escaped exception.
(2) **`missing: "0"` blinds it.** `Roll.parse` runs `replaceFormulaData(formula, data, { missing: "0" })` first, so an unresolved `@` key becomes the literal `0` and parses cleanly — the unresolved-roll-data refusal is therefore read from `resolveCheckFormulaDisplay`'s `resolved === false`, not from the parse.
(3) **Determinism must recurse, and a `StringTerm` lies.** `RollParser.flattenTree` only recurses into `node.class === "Node"`, so a parenthetical, function or pool term is pushed whole and `Roll.parse('1d20 + (2d6)')` yields exactly one top-level die term with hidden randomness inside; a top-level class scan would call it enumerable and draw a histogram that lies.
Determinism is therefore judged by Foundry's own recursive `term.isDeterministic` — but `StringTerm#isDeterministic` returns `true` for an unresolvable string that then throws at evaluate, so a `StringTerm` is refused explicitly, and it is told apart from a `ParentheticalTerm` (which also carries a string `term`) by the fields only a parenthetical has.

**Every refusal carries a discriminated reason code** — `parse-threw`, `no-dice`, `multiple-die-groups`, `die-modifiers`, `non-unit-count`, `non-integer-faces`, `non-numeric-denomination`, `non-deterministic-remainder`, `string-term`, `unresolved-roll-data` — so a refuse-everything predicate is distinguishable from a correct one and the panel can say WHY rather than only that it abstained.
`non-numeric-denomination` is stated separately from `non-integer-faces` because a `FateDie` reports `faces: 3` and a `Coin` reports `faces: 2`: both are integers, and calling either "not an integer" would be a false statement in the panel.
A formula whose only die sits inside a parenthetical, function or pool term refuses as `non-deterministic-remainder` rather than `no-dice`, which is reserved for a formula that really is all arithmetic.
Anything outside the shape renders a stated note rather than an approximation: a histogram that lies is worse than one that abstains.
The caption is COMPUTED from the enumerated space, never hard-coded — a `1d12` check reads "all 12 faces".

**The histogram, the `avg` annotation and the simulator MUST describe ONE formula, and it is the formula the RUNNER rolls.**
The preview arg-builder hands the runner an AUTHORED formula plus a check-modifier context, and the runner appends the resolved scalar itself — so a derivation that describes the roll without that context describes a formula nothing rolls.
The append therefore has ONE implementation and ONE composition (`resolveRolledFormula`: the retired-placeholder shim, then the modifier append), which the runner, the display resolver and the enumerator all ASK FOR rather than rebuild.
A second composition is free to drift, and drift here is a histogram spanning `1..20` beside a readout rolling `5..24`, for the same check, at the same moment.
It is applied exactly ONCE: the appended formula is then resolved for display with the context omitted, exactly as the runner does, so the scalar cannot land twice.

The TOOL bonus is appended ABOVE the runner — by the engine on a real craft and by the preview arg-builder on a preview — and the runner appends none of its own, so the preview matches the engine's shape and the enumerator layers only the modifier on top.
The SITUATIONAL bonus is unreachable from a preview at all: it lives behind `interactive === true`, and a null roll-options bag spreads to `{}`.
Because a system with an empty catalogue resolves a ZERO scalar and makes the append a no-op, this rule MUST be exercised with a non-empty catalogue and a non-zero resolved scalar or it is graded vacuously.
Progressive checks bucket by AWARD COUNT and OMIT a count no face can reach, while an award of nothing is listed wherever it is reachable.

##### The progressive preview sandbox

A progressive check awards by spending its rolled value down an ORDERED list of result difficulties, so its histogram cannot be drawn without one — and that order is SANDBOX STATE ON THE CHECK, at `progressive.preview.difficulties`, typed by the GM for one experiment.
It is NOT derived from a recipe's `resultGroups[].results[].componentId` → `system.components[].difficulty` chain, and it is not a player's stored order or a GM's configured values.
The Studio's subject is the CHECK: the simulator previews what a check DOES, not what some recipe will do with it, which is also why a Preview-as record supplies a DC rather than an outcome and why the record selector is replaced by this field in progressive mode — a record has nothing to offer a check with no DC.
It does not have to be plausible; it has to show the correct behaviour, which it does because the enumerator spends it through the same `resolveProgressiveAward` loop crafting, salvage and gathering all award through.

Five properties are load-bearing.
It is PERSISTED on the check block, so a GM's experiment survives a reload, which means every allowlist rebuild the block passes through MUST emit it or the next save drops it silently.
NO ENGINE PATH READS IT: deleting the key changes no runtime behaviour, because it is scratch and not configuration.
READINESS NEVER VALIDATES IT: it raises no readiness issue, badges no section dot and blocks no enable, and a nonsensical or negative order is the GM's business rather than a validation target.
EXPORT STRIPS IT, for the reason `import-export` states.
And it is ABSENCE-PRESERVING and ORDER-PRESERVING: an absent list means no experiment has been run and is not the same as an authored empty one, the order IS the datum and nothing sorts it, and an entry that does not reduce to a finite number is not STORED — a persisted `NaN` round-trips through JSON as `null` and reads back as a perfectly finite `0`, which would silently make the experiment mean something else after a reload.
The field itself keeps the GM's raw text while they type rather than echoing the stored numbers back, so a separator or a half-typed word is never rewritten under the cursor.

An empty sandbox renders its own stated sentence NAMING THE FIELD that fills it, and that sentence is not one of the enumerability refusal codes: those all say the formula cannot be charted, and this one says the opposite — the formula is fine and the experiment has not been typed yet.
Bars render through `FillBar`, flat.

The View Lab's `Roll` double carries a `parse` static whose term shape is derived from RECORDED real-Foundry output, because the lab's `Roll` otherwise exposes only `replaceFormulaData` and `validate` and every render of the histogram panel would throw — and one bad case fails the capture job whole, publishing nothing.
A capture job that fails whole now surfaces as a FAILED evidence gate rather than as silent stale evidence: the gate reds instead of passing on the previous head's frames, so the bad case is visible as the failure it is.
The panel additionally guards a missing or throwing `Roll.parse` as a not-enumerable result rather than a throw.

An `avg N` annotation on the formula field renders the deterministic magnitude average (`reduceRollExpression`) of the free-text formula with character paths taken as zero, set in the mono face and referenced by the formula input's `aria-describedby`.
When a die or pool carries `cs`, `cf`, `even`, `odd`, `df`, `sf` or `ms`, the annotation renders visible `avg —`, stamps `data-check-formula-average-withheld="die-modifiers"`, and exposes, in visually hidden text that needs no hover, a localized explanation that the average is withheld because the die modifier transforms the total.
Malformed or irreducible input omits the annotation.
Magnitude expressions remain deliberately LOOSER than the histogram's predicate — the annotation answers for multi-group and magnitude-modified formulas the histogram abstains from — because it is an annotation on a field the GM is typing in rather than a claim about a distribution.
Its responsive behaviour reuses the SHIPPED `fabricate-manager` container ladder and introduces no new breakpoint: `styles/fabricate.css` already declares that container with blocks at 1320 / 1120 / 960 / 900 / 831 / 680, and `.fabricate-manager .manager-inspector` already carries `overflow-y: auto; max-height: 100%`.
At the existing 1320 breakpoint and below, the odds histogram and the simulator readout become collapsed disclosures, headers and counts retained.
At the existing 1120 breakpoint and below, the shipped rule already restacks `.manager-body` to one column with `grid-auto-rows: max-content` and hands scrolling to the body; the rail's own `overflow-y` / `max-height` is LEFT ALONE there, because that block unsets neither and a `max-content` track cannot be squeezed.
The constraint is instead that `grid-auto-rows: max-content` MUST NOT be defeated and no `.manager-body` child may carry a definite height — that is the measured regression recorded above that block (issue 643: rail 225px, main 200px, inspector 179px, `.manager-table-scroll` squeezed to 24px), caused by zero-min-content children under implicit `auto` rows.
At the 1024x640 declared floor the layout is therefore STACKED, not a side rail, and every panel is reachable by scrolling `.manager-body`.
That requires the studio's own workspace to restack there too, and a container query adds NO specificity — so an override inside one that ties with a base rule declared later in the sheet loses on source order and is dead.
The workspace's column track is therefore set through a custom property the base rule reads and never declares, which cannot tie whichever order the two are read in; a source-text assertion cannot tell a dead rule from a live one, so this is pinned by measuring the rendered grid at the floor.

The Validation route renders the documentation pair and the "All checks" summary ONLY — no activation toggle, no Preview-as, no simulator, no histogram, no This-check digest — and renders no section strip.
Validation renders through the shared `EditorValidationSurface`, selecting an issue deep-links to the owning activity AND section, and the issue-id to section map is proven exhaustive against the frozen `CHECK_READINESS_ISSUE_IDS` registry `evaluateCheckReadiness` pushes from — never a hand-copied list.
A deep link is an EVENT with its own identity, not a standing instruction: the route carries a request nonce the section strip latches on, so the same section requested twice is two requests and the second still lands.
Latching on the section VALUE strands the repeat — leave the requested section, ask for it again, and the request equals the latch and is swallowed — and not latching at all drags the strip back to the standing request the instant the GM clicks anything else.

The draft model lives ABOVE the route: one dirty set across the four activities, one plural `Save checks` that persists every dirty activity, one system-wide `Unsaved` chip plus the per-activity rail markers, drafts preserved across Checks child routes, and a discard confirmation on leaving a dirty Checks route for a non-Checks route.
That confirmation is `confirmDiscardDirtyChecksDraft`, built on the shared `_confirmDiscardDirtyDraft(contentKey, contentFallback, replacements)` helper seven of the nine existing draft prompts use, which returns `'save' | 'discard' | 'cancel'` by construction; it takes the three-way "save and continue / discard / cancel" shape the system-details variant uses, and it NAMES which activities are dirty.
The rail badges, the section dots and the Validation counters read the LIVE draft and are a draft PREVIEW; the ENABLE gate reads COMMITTED state, and the Validation hero renders the unsaved condition explicitly rather than claiming "Ready to enable" for state that is not persisted.

The readiness mode an activity is evaluated under is derived from the SLOT `checkModifierResolver` resolves — the sub-config the engine actually rolls — and never from a second mapping over the authored resolution mode.
The evaluator branches on `'routed'`, which no subsystem's authored mode ever is, so passing the raw mode through skipped every outcome-tier rule for the one mode that has them; and a second mapping beside the resolver's disagreed with it for alchemy at `checkMode: 'tiered'`, so the rail badge evaluated the unused SIMPLE draft under ROUTED rules.
The slot also chooses which draft is edited, marked dirty and saved, so the check being evaluated and the rules it is evaluated under are one decision.
A slot of `null` — a mode that rolls NO check, which is alchemy `none` and gathering `d100` — is its own readiness mode, evaluating only whether an authored check-modifier selection reaches a roll; it must never report a missing roll formula, because the route renders no formula field with which to clear it.
The evaluator REFUSES a mode outside its own vocabulary rather than defaulting to `simple`, since a default is what made the mismatch silent.

A Validation group with no ticks and no issues states "No issues detected." rather than rendering a heading over nothing; the group is never dropped, because absence reads as "this subsystem was not evaluated".

A `Save checks` that does not land BLOCKS the route exit it was raised for, matching the shipped essence and system-details guards: every dirty activity is still attempted, the answer is the conjunction, and a failed activity keeps its draft dirty.

A check is usable iff its mode carries an authored `rollFormula`; the legacy check-source/macro layer (`macroUuid` / `successMacroUuid` / `failureMacroUuid` / `checkSource` / `builtIn`) was removed by migration 1.8.0 and is not authored.

- Enable checks (the on/off toggle for the optional simple-mode check)
- Roll formula, DC, and tier controls per mode (`simple` / `routed` / `progressive`)
- The simple-mode dynamic-DC macro (`craftingCheck.simple.macroUuid`) — the one surviving check-adjacent macro (it only computes the DC)
- Failure consumption policy — two live-persisting toggles on the **On failure** section of the non-alchemy `checks-crafting` route, editing `craftingCheck.consumption.consumeIngredientsOnFail` (default `true`; whether a recipe's ingredients are consumed on a failed crafting check) and `craftingCheck.consumption.breakToolsOnFail` (default `false`; whether required tools break on a failed check — the 1.7.0 rename of `consumeCatalystsOnFail`).
  The engine applies this policy on every failed crafting check; it is NOT shown in alchemy mode, where consumption is governed by the distinct `alchemy.consumeOnFail` flag.
  A versioned stage spends its materials when it STARTS, so `consumeIngredientsOnFail: false` is honoured there by returning what the stage spent — its ingredients and its settled currency — when the check fails.
  Whether materials are spent at stage start and whether a failed check keeps them are separate rules, and the second one is this control's.
  Salvage failure consumption is a separate, independently-defaulted policy read from `salvageCraftingCheck.consumption` (`consumeComponentOnFail`, default `true`; `breakToolsOnFail`, default `false`) that this crafting control does not change.
- Optional routed outcomes reference list (for GM guidance only; not a routing map)
- Progressive settings (`awardMode`) (progressive only)

For a `routedByCheck` system whose routed check `type` is `fixed`, the tier `CraftingCheckEditor` hides the DC field and the meet/exceed comparison, because fixed tiers match by explicit value range rather than against a DC.
The DC-hiding note applies to `routedByCheck + fixed` in the `CraftingCheckEditor` only; the DC and comparison stay shown for relative-type `routedByCheck` and for the salvage/gathering check editors.
`routedByIngredients` no longer renders the tier `CraftingCheckEditor` at all — it authors its optional pass/fail check via the shared `SimpleCraftingCheckEditor` (bound to `craftingCheck.simple`), which shows the DC, the meet/exceed comparison, the static/dynamic DC source, and the recipe DC tiers.

Mode semantics are defined in `resolution-modes/spec.md`.
There is no check-wide tier-stepping toggle: stepping is authored per trigger in the `CheckTriggers` editor below, and the retired routed `natStepping` card has been removed from the crafting and salvage editors.

#### Check Trigger Controls

All three check editors (simple, routed, and progressive) ALWAYS render a single unified `CheckTriggers` editor (issue 419 recombine) — one trigger list per check, replacing the former separate per-die crit table and tool-breakage trigger card.
Each trigger pairs an expressive dice-matching condition with three effects (issue 975): an outcome segmented control, a routed tier-step row, and (under `checkDriven` authority) a break-tools pill.

- The outcome control forces the check to Automatic success / Automatic failure / No effect (relabelled Award all / Award none / No effect on a progressive editor, reusing the existing award keys), and is disabled + pinned to No effect for an `outcomeTier` condition.
  It is a three-segment button group, not a `<select>` — it is rendered through the shared `SegmentedControl` primitive with a per-option `variant` tinting the active segment success/neutral/danger.
  The `outcomeTier` pin is carried on the segment's radio INPUT (`disabled`), not merely as a dimmed class, so the pinned segments are genuinely non-interactive.
  Outcome forcing applies under BOTH authorities.
- The per-trigger break-tools pill (and the routed per-tier `outcome.breakTools` column) renders ONLY under `checkDriven` authority (`showBreakTools={checkDriven}`); under `toolSpecific` it is hidden and a check never breaks tools.
- There is no free-text trigger label, no per-block enable toggle, and no natural-1 auto-seed; an empty trigger list is inert and the GM adds triggers explicitly.
  Condition types are `rollTotal`, `progressiveValue` (progressive editors only), `diceGroup` aggregate, and `outcomeTier` (routed editors only); dice groups are labelled from the formula, with duplicate `NdS` groups disambiguated (`#1` / `#2`).
- This authority gate applies per subsystem: crafting honours the system authority; salvage is gated on `features.salvage` identically to gathering — its checks tab hides when the feature is off and `salvageBreakageAuthority` falls back to `toolSpecific` (consistent with the gate acknowledged at lines 163 and 960); gathering exposes the per-trigger break-tools control only when `features.gathering === true`, otherwise it stays `toolSpecific`.
- **The tier-step effect gets its OWN row inside the trigger card**, below the outcome/break row rather than as a third field in it: at the pinned 1280x820 manager geometry the outcome control and the break pill already spend most of the trigger card's width, and a four-segment control plus an operand does not fit what is left.
  The row renders on **routed** check editors only (there are no tiers to step on a simple or progressive check) and is explicitly **not** gated on tool-breakage authority the way the break pill is — stepping is not a breakage concept.
  This is a control that routed **gathering** checks and **fixed**-type routed checks have never had: the retired toggle was relative crafting/salvage only, so those screens gain an effect they previously could not author at all.
- The row carries a four-segment `SegmentedControl` (No step / Step up / Step down / Target tier) and a **stable operand slot** at one pinned width whose contents swap by mode — a shared stepper clamped at a minimum of 1 for `up`/`down`, the shared `Select` at its `inline` rung for `target`, and an inert disabled placeholder for `none` — so changing mode never moves the control out from under the GM's pointer in a wrapping row.
  The stepper and the `Select` trigger both FILL the pinned slot rather than sizing to their own content, and that direction is the requirement: the 160px pin and the no-movement guarantee are unchanged, so each primitive is made to fill the existing slot rather than the slot being re-measured to the primitive.
  The guarantee that holds across a mode swap is POSITION and WIDTH, not height: each mode renders its box at the same 160px width in the same place, so nothing under the GM's pointer moves horizontally and no row rewraps, but the three rendered boxes are NOT the same height — the stepper's filled height is 36px, the inert placeholder's disabled input is 32px (the studio's own field height), and the `target` select's `inline` rung is 30px — and the row's `align-items: flex-end` keeps their bottom edges level rather than their tops.
  It is deliberately not a claim about the operand's whole appearance — the stepper keeps its own 8px radius and soft surface fill, the `Select` trigger takes the `inline` rung's 7px radius on `--fab-bg-2`, and the inert placeholder keeps the manager's field background, because a layout-context rule may take a SIZE from its slot but must not restyle the primitive's border, radius or fill (see line 88).
  An operand sized to its own content would break the size half outright: it stands as a narrower island beside the modes that fill the slot, and a trigger that hugs its VALUE re-measures every time the GM chooses a longer tier name, which is the movement the pin exists to prevent.
  Every rendered `SegmentedControl` takes a radio `name` unique per CONTROL, not per trigger: a trigger card renders two of them, and a shared group name would make choosing a tier-step mode uncheck the outcome radio.
- **The `target` select never displays a tier it has not persisted.**
  `tierId` defaults to `null`, and a control whose value matches no option must not read as a tier the check has not persisted, so the `Select` takes a `placeholder` ("Choose a tier…") that renders as its trigger's value while `tierId` is `null` — placeholder text on the trigger, with no row for it in the list to choose — and renders a dangling id as an appended disabled "Missing tier" option with the primitive's `invalid` treatment on the trigger, its danger border and soft fill.
  A dangling target is reachable by ordinary authoring, not only by import: the relative↔fixed type switch swaps the whole tier list and dangles every authored `tierId` at once.
- When the check has no named outcome tiers, the `target` branch shows its own muted guidance cue rather than hiding the control — a GM authoring top-down configures triggers before tiers, and hiding it would make an authored target invisible.
  It carries a hook and a lang key distinct from the `outcomeTier` condition's no-tiers cue, because a trigger that is both `outcomeTier`-conditioned and `target`-stepping on a tier-less check would otherwise render two identically-hooked nodes in one card.
- Two readiness rules back the control, both `warning` severity and both reported only once at least one trigger sets `target`: `danglingTierStepTarget` (the target names no tier on the active list, including "no tier chosen at all") and `multipleTierStepTargets` (two or more triggers set a target; if more than one matches, the lowest-ranked wins).
  The second is guidance rather than breakage — it is a static authoring count that cannot know which conditions will match or whether a roll will be forced.
  Both are satisfied by a single paired check entry (`tierStepTargetsResolve`), because to a GM they assert one thing: the targets on this check name exactly one existing tier.

### Requirements Controls

- Time toggle in the Optional features section, bound to `requirements.time.enabled` (default on).
  It renders always (like the currency toggle).
  When time requirements are enabled the recipe Duration card (single-step) and the per-step duration editor are authorable and their durations apply at craft time; when disabled, both editors are hidden and a step's `timeRequirement` no longer arms a timed run (the craft resolves immediately).
  Existing authored durations are preserved while the toggle is off (they render as read-only chips where a step summary is shown) and re-apply when it is turned back on.
- Currency toggle in the Optional features section, bound to `requirements.currency.enabled`, rendered as a `manager-feature-tile` with `data-feature-key="currency"` and the stable hook `data-system-currency-toggle`.
  It renders always (independent of which optional feature flags exist on the system), so the section is never empty.
- **The toggle is the ONLY currency control on System Settings.**
  The units card and every strategy, provider, macro, unit and sub-unit control moved to the World > Currency route, because the coin ladder is world scope (`data-models/spec.md` -> CurrencyConfig): a world runs exactly one Foundry game system, so two crafting systems cannot meaningfully disagree about how to read the same actor's purse.
  The System Settings tab therefore renders no currency configuration at all, whether the toggle is on or off, and the `data-system-currency-*` hooks that backed those controls were renamed `data-world-currency-*` and now live on the World route.
  `data-system-currency-toggle` is the one hook that stayed.
- What the toggle governs is unchanged: it gates the recipe currency-cost authoring affordances, the player display of a currency option, and engine consideration of currency for THAT system.
  It does not gate the World > Currency route, and it authors nothing about the ladder.

If `features.gathering === false`:

- the `Environments` tab is hidden
- the player-facing `Gathering` directory button is hidden when no other system enables gathering
- gathering environments for that system are not shown in runtime player flows

### Recipe Visibility Controls

The selected system's recipe visibility is authored on the Crafting group's **Settings** page (`crafting-settings`), in a **Recipe Visibility** section rendered below the resolution-mode card.
It is no longer on the System Overview page, and it authors the flat `visibilityMode` enum rather than the legacy `listMode` + `knowledge.mode` pair.

- A single radio-card selector (the shared `RadioCardGroup` primitive, rendered directly with `configCards` stated at the call site) offers exactly four mutually-exclusive options: `global`, `restricted`, `item`, and `knowledge`.
  The `ResolutionModeCard` wrapper this control used to reach that primitive through was removed at issue 1509; the control, its four options and its `is-config-cards` face are unchanged.
  Each option carries a label and description; exactly one mode is active for the whole system.
- **Alchemy relabel (reveal-not-gate).** When `resolutionMode === "alchemy"` the card keys a `$derived` option set that renders the `restricted` option as "Manual (GM-granted access)" and rewords the item/knowledge/global descriptions from _gating_ to _reveal_ language (per `recipe-visibility`), because brewing is never gated by visibility.
  A non-alchemy system renders "Restricted" with gating language.
  The STORED enum value is unchanged in both (`restricted` stays `restricted` — no new enum value and no migration), so the Access tab (shown for `visibilityMode === "restricted"`) stays reachable to author the per-recipe grant.
- Selecting an option live-applies it through `setVisibilityMode(mode)`, which persists `visibilityMode` and refreshes; the change is non-destructive (migrates no recipes) and there is no separate save action.
- A `CraftingEffectPanel` beside the selector summarizes the active mode's effect (from the projected `craftingEffect(visibilityMode)` matrix): whether the Access tab, Books & Scrolls, limited-use, and learning-limits surfaces are shown.
- Per-recipe-item use and learn caps are NOT authored here — each recipe item's caps live on its own Books & Scrolls item page (see Books & Scrolls Surface).
- Legacy note: the standalone `SystemRecipeVisibilityCard` that authored `listMode` / `knowledge.mode` / `dragDropEnabled` through `saveVisibilityConfig` is retired from the rendered UI; those legacy fields are now derived and read-only fallbacks (the runtime still honours `knowledge.learn.dragDropEnabled` where present).

### Recipe Item Definition Controls

The GM admin must expose a recipe-item management surface for the selected crafting system.

Capabilities:

- Add recipe item definitions from world or compendium Items by drag/drop only
- Remove recipe item definitions
- Show source-linked name and image preview
- Warn when a recipe item definition's source item no longer resolves

Tool creation, Tool source replacement, and Recipe Item source replacement use the same drag-only Item drop-zone primitive.
It resolves the UUID from Foundry V13 Document drag data through awaited `fromUuid` before mutating state, accepts only a resolved `Item` document, and rejects missing, malformed, Folder, Actor, and compendium-index-only results without changing the current source or draft.
The drop zone has no click-to-browse action, picker, shortcut list, select control, button role, or keyboard-operability claim.
Existing Component identity replacement surfaces are not Item-source drop zones and retain their Component-specific interaction contract.

Recipe item definitions are distinct from components:

- adding a recipe item definition must not add or require a component entry
- selecting a recipe item for knowledge gating must not require importing that item into the component library

When `visibilityMode === "global"` (or a legacy `listMode === "global"`), no per-recipe player allow-list controls are shown.
Visibility and learning semantics are defined in `recipe-visibility/spec.md`.

## System Overview

The manager exposes a GM-only **System Overview** page as the first navigation-rail item,
immediately before `Components`.
It is an always-available implemented route for any selected system —
not an experimental-gated feature and not a disabled placeholder.
The whole crafting-manager admin is GM-scoped, so the page and its banner are GM-only by construction.

The System Overview page is a full-width tabbed shell mirroring the environment editor's full-width tab pattern.
A full-width tab bar (`role="tablist"`, with `role="tab"` buttons and badge support) sits above a bounded, scrollable workspace.
The page has two tabs: **Settings** (the system settings form, the default-selected tab) and **Validation** (the kind-grouped validation issue list).
The shared right inspector is skipped for this full-width page, exactly as it is for the environment editor.
Selecting a different system, or opening the page from the rail, resets the active tab to Settings.

The renamed rail item uses the validation clipboard icon (`fas fa-clipboard-check`).
There is no separate standalone Overview rail item; the validation list lives on the Validation tab.
The rail item SHALL surface a count badge with the number of open critical-plus-warning issues when greater than zero.

### Settings Tab

The default-selected Settings tab renders the system settings form (identity, optional features, and character modifiers) unchanged.
The currency configuration is no longer part of it: only the Currency participation toggle remains, in the Optional features section, and the ladder is authored under World > Currency.
It writes through the existing admin-store persistence and confirmation flows.
Recipe resolution mode, salvage resolution mode, and the Recipe Visibility card moved to the Crafting group's Settings page (`crafting-settings`); the System Overview Settings tab no longer renders them.

The identity card's **Save details** control SHALL be preceded (in DOM order) by an `Unsaved` chip (`.manager-chip.is-warning`, `FABRICATE.Admin.Manager.SystemEdit.Dirty`) shown whenever the Name or Description input differs from the persisted `selectedSystem.name` / `selectedSystem.description`, and cleared when the values match — naturally, after Save persists and the projection re-publishes.
The Name / Description inputs SHALL seed from the persisted system on system-identity change only, so a two-phase or otherwise unrelated `viewState` re-publish of the same system does not overwrite un-saved edits.
As a consequence, a concurrent external edit to the same open system is not merged into the open form and is overwritten on Save (last-writer-wins), matching the manager's staged-draft model for recipes, components, and essences.
The identity sub-form (Name + Description only) SHALL participate in the Manager confirm-discard route-exit chain as a `system-details` kind, evaluated after the tools tail of the cascade: navigating away from, or switching systems on, a dirty details form prompts the standard three-way Save / Discard / Keep-editing dialog — Save persists the pending name and description before navigating, Discard reverts the inputs and proceeds, Keep-editing stays.
A navigation that re-enters the System Overview page on the same system (the validation-blocker link, or re-selecting the already-selected system) SHALL NOT prompt, because the form stays mounted and its pending edit survives.
The optional-features toggles (the Currency participation toggle included) and the character-modifier / prerequisite cards on the same tab live-apply through the store and stage no draft, so they do not participate in this guard.

The Settings tab additionally renders a **Character prerequisites** card (`CharacterPrerequisitesCard`, issue 544) — the WORLD library of reusable pass/fail conditions the GM attaches to a book/scroll to gate who may learn its recipes and to a Tool to gate who may wield it (behaviour in `recipe-visibility` and `data-models` -> Tool).
Since issue 1308 it edits a world record on a page framed as settings for the SELECTED crafting system, which is the one place in the Manager where those two scopes meet.
That is a deliberate interim state, and it is made honest in place rather than left implicit: the card header SHALL carry a neutral scope chip reading "every system" — the World rail's own wording, so the two surfaces say one thing — the hint SHALL state that the library is shared by every crafting system, and delete SHALL confirm, naming the cross-system reach, because an unconfirmed one-click delete whose blast radius is every system is not a recoverable mistake.
The **Modifiers** card on the same tab SHALL carry the identical treatment, for the identical reason.
Both chips go away when the follow-up change relocates the two editors to their own World route.
It is an accordion list (one entry expanded at a time): each collapsed row shows the entry name and a live `@path op value` preview, and the expanded body edits the name, then the property `path` (rendered with a leading `@` affordance), an operator dropdown (the nine `CharacterPrerequisite.op` tokens), and a `value` field that is hidden for the valueless operators (`is true` / `is false` / `exists`).
Add, delete, and an opt-in **Seed presets** action (enabled only for `dnd5e` / `pf2e` worlds, disabled with an explanatory tooltip otherwise) mirror the gathering character-modifier card's affordances.
Each control live-applies through the admin store (`addCharacterPrerequisite` / `updateCharacterPrerequisite` / `deleteCharacterPrerequisite` / `seedCharacterPrerequisitePresetsForSystem`), staging no dirty draft.
Since issue 1308 none of those actions takes a crafting-system id and none may early-return on an unselected system: the library they write is world scope, so a system-scoped guard would silently drop the edit.

### Settings-List Ergonomics

Three Manager library lists — **Character modifiers** and **Character prerequisites** on System Settings, and **Currency units** on the World > Currency route — share a set of ergonomic affordances (issue 768).
The Currency-units list moved out of System Settings with the rest of the currency editor (issue 1278), and the shared contract follows it: the ergonomics are a property of the list, not of the page it sits on.
All three now edit WORLD records (issue 1308 moved the other two's data, though not yet their editors), so the shared contract additionally covers SCOPE DISCLOSURE: a list editing a world record from a system-framed page SHALL say so on its header and in its delete confirmation, and one editing it from a World route needs neither, because the route already said it.

The Character-modifiers list SHALL render as a compact summary-row accordion mirroring the Character-prerequisites card: each collapsed row is one line — a chevron, the modifier's icon, its label, and its expression shown inline with the leading `@` sigil stripped for a cleaner read — with the row actions (copy, delete) to the right; activating the summary expands the row to the editor (Icon, Label, Expression).
The Character-modifier editor SHALL edit its `icon` with the shared pop-over `IconPicker` (the same control the Currency-unit and Character-prerequisite editors use), not a raw icon-class text input; a modifier with no explicit icon falls back to `fa-solid fa-user`.
The editor's Expression field keeps the raw stored value (including any leading `@`); only the collapsed summary strips the sigil for display.

Each of the two SYSTEM SETTINGS list cards SHALL render a whole-section collapse toggle in its header: a `<button aria-expanded aria-controls>` with a chevron affordance that hides or reveals the section body (the list and its controls) while leaving the card header visible.
The collapse state is session-local (in-memory) — preserved across store refreshes and never persisted — and is one collapse Set for the page, reset when a different system is selected.
The World Currency card SHALL NOT render one.
A collapse toggle earns its place by yielding space to the siblings below it; as a whole route the currency card has no siblings, so the same control would only hide the page and leave a bare header row.
It is distinct from the Character-prerequisites card's per-item accordion (which opens one entry at a time); a section may be collapsed independently of which entry, if any, is open.

Each Character-modifier row SHALL offer a row-level **Copy to prerequisites** action, and — only when `features.gathering` is enabled — each Character-prerequisite row SHALL offer a **Copy to modifiers** action.
A copy adds a fresh entry into the destination store via that store's normalizing add op (never a shared mutation, and never carrying the source `id`), mapping `label`↔`name` and `icon`↔`icon` cleanly and transforming the roll `expression`↔`path` by stripping or re-adding a single leading `@` (faithful for a bare `@path`; a compound roll formula yields a path the GM must correct).
The pass/fail `op`/`value` and the roll math have no counterpart on the other side and are dropped; the copy defaults a new prerequisite to the `gte` operator with a null value.
On copy the destination card SHALL open the new entry in edit mode and a polite `aria-live` region SHALL announce that the name and icon were copied and the condition still needs setting, so the dropped logic is a visible gap rather than a silent loss.

Each row of all three lists SHALL offer keyboard-accessible **Move up** / **Move down** chevron `<button>`s, disabled at the ends, that reorder the list by one position through a single index-based store op (`reorderGatheringCharacterModifier` / `reorderCharacterPrerequisite` / `reorderCurrencyUnit`), with the new position announced through a polite `aria-live` region.
No new persisted field backs the order: array order IS the persisted order, so each op rewrites the list array in place and saves through that list's existing whole-payload path (the gathering config for modifiers, `updateSystem` for prerequisites, and the world `currencyConfig` setting through `CurrencyConfigStore` for currency units), and the order-preserving normalizers round-trip it.
`reorderCurrencyUnit(fromIndex, toIndex)` takes NO `systemId`: there is exactly one world ladder to reorder, so the parameter the per-system era carried has been removed rather than defaulted.
The provider-managed (read-only) currency-unit list carries no reorder controls, because the selected provider owns its denomination order.

### Validation Tab

The Validation tab renders the derived system-validation report
(`evaluateSystemValidation`, defined in `data-models`) for the selected system.
The report is a computed view assembled by the admin store from the system's recipes, environments, and components;
nothing is persisted on the `CraftingSystem`.
The tab header keeps the "Review every validation issue…" copy and the `critical / warning / notes` summary badges.
The tab also carries danger and warning badges in the tab bar reflecting the open critical and warning counts.

Issues are grouped by their `kind` —
`system` (system blockers), `recipe`, `environment`, `task`, `event`, and `salvage` —
with the `system` blockers surfaced first.
Each issue renders one row carrying a severity chip
(`.manager-chip.is-danger` for `critical`, `.manager-chip.is-warning` for `warning`, `.manager-chip.is-neutral` for `info`),
the offending entity's name, and the issue message.

Every non-`system` row deep-links to the editor that owns the entity,
reusing the manager's existing selection helpers
(recipe issues open the recipe editor, environment/task/event issues open the environment editor,
and salvage issues open the component editor).
The `system` kind is the overview itself and carries no deep-link button.
When there are no issues, the Validation tab shows an empty "ready to use" state.

When the report's `blocksSystem` is true,
the Validation tab renders a full-width `role="note"` callout explaining that players cannot see or use any of the system's recipes until the blocker is resolved.

### System-Blocker Banner

When the selected system's report has `blocksSystem === true`,
the System Overview page's Settings tab SHALL render a full-width `role="note"` callout
(reusing the `manager-environment-comp-callout` treatment) above the identity card.
The banner is GM-only, explains that the system is blocked from player visibility, and links to the Validation tab.
Activating the banner link switches the page to the Validation tab in place.
It is not shown when `blocksSystem` is false.

## Item Sheets

Fabricate no longer adds an item-sheet header learn control.
The former control (`ItemSheetRecipeLearnControl.js`) was removed (issue #511); manual recipe learning is wired exclusively through the player **Inventory** surface — the book detail's learn affordances call `game.fabricate.learnRecipeFromInventory`, gated by `InventoryListingBuilder` (see §Books & Scrolls learning and `recipe-visibility/spec.md`).
The learning flow itself (confirmation prompt, `consumeOnLearn` / `destroyWhenSpent` item removal, per-actor `learnedRecipes` write) is unchanged; only its invocation surface moved.

## Items Tab

Capabilities:

- Add managed items from world or compendium.
- Bulk-add managed items by dropping a Folder or a whole compendium onto the import zone.
  Folder
  drops are accepted from both the world Items directory and a compendium directory, and expand to
  every contained Item including nested subfolders; a compendium folder's items are resolved from
  the pack index entries.
- Folder-aware categorization on bulk import: a folder drop, an in-pack-folder drop, or a
  whole-compendium drop that contains at least one item-bearing folder opens a mapping step before
  the import commits.
  The step lists each detected folder (the dropped folder plus every nested subfolder) with its item
  count, and lets the GM assign a category and/or tags per folder, inline-create a category (reusing
  the shared vocabulary model), or skip a folder.
  Tags are assigned from the existing vocabulary only; a new tag is created in the Tags & Categories
  screen, not inline at import.
  Category assignment is single-valued and OVERWRITES the imported default; tag assignment is additive
  (union).
  A "match-by-name" toggle, ON by default, pre-fills each folder's row when the folder name matches an
  existing category (case-insensitive) and/or tag (lowercased), applying each axis independently.
  The primary action imports the non-skipped folders' items and applies each folder's mapping to that
  freshly imported component set; the item count updates live as folders are skipped, and a skipped
  folder's items are not imported.
  A single-item drop is unchanged, a folderless drop falls back to the one-shot import, and a
  compendium-directory folder that groups packs (not items) is skipped with a notice.
- Remove managed items.
- Edit managed item tags (if enabled).
- Edit managed item essences (if enabled).
- Edit managed item difficulty: the component editor's body exposes an editable
  progressive-difficulty stepper, titled "This component's Progressive DC".
  It is shown when the system is progressive on any axis that reads component difficulty — crafting resolution mode, salvage resolution mode, or the system's gathering economy resolution mode.
  The read-only badge on the components-browser row and the browser's bulk-edit progressive-DC section obey the same condition, so all three appear together.
  It accepts an integer from 0 to 35; zero clears the value.
  The stepper is staged into the component editor's draft and persisted with the rest of the edit on Save (not written on change), contributing to the editor's dirty state and unsaved-changes guard.
- Replace associated source item by drag/drop.

Component import warnings:

- When a single component import or replace-source operation falls back because the dropped Item's recorded canonical source UUID no longer resolves, the GM manager UI warns that the original source link is broken and that Fabricate used the live dropped Item UUID instead, naming the affected item and UUIDs.
- When a folder or compendium pack import falls back for one or more Items, the GM manager UI emits one summary warning with the number of affected Items, rather than one warning per Item.

## Essences Tab

Only shown when essences are enabled.

**IDENTITY IS NOT AUTHORED AT SYSTEM SCOPE.**
An essence's name, glyph, colour and description belong to its WORLD record, which every crafting system holding the essence resolves the same one of, so the system-scope Essence Rules editor renders no control that writes them — see `ui-world-scope/spec.md` `## GM World Essence Screens` requirement 10.
The identity capabilities below are the WORLD essence entry editor's, and the system-scope route reaches them only through that editor.
The one surface at system scope that still authors identity is a CREATE draft, whose in-system record is the only record there is and which therefore has no shared definition to contradict.

Capabilities:

- Browse, create, duplicate when supported, and delete essence definitions; edit an essence's PER-SYSTEM rules in the system-scope editor and its SHARED identity in the world essence entry editor.
- Set a FontAwesome icon for an essence (or fall-back to the default, `fas fa-mortar-pestle`)
- Set an optional colour for an essence, chosen from the shared token palette with custom hex entry disabled.
  The palette is the whole vocabulary because a free hex cannot be guaranteed legible across all seven themes; leaving the colour unset is a first-class state that renders the essence in the theme accent.
  The editor renders that palette INLINE and offers an explicit No-colour cell, so unset is reachable from the palette itself rather than only through a separate Clear control.
  Colour names are localized under the shared `FABRICATE.Admin.Manager.Colour.Token.*` namespace, because the same palette also serves the environments biome picker and the character-modifier picker.
- Set optional source component identity by picker/drag-drop only when effect transfer is enabled.
  The source component may in turn expose a source item UUID.
- Set an optional essence property macro by dropping a Macro, only when `features.propertyMacros === true`.
  The drop is refused when the macro's own type is not `script`, and the refusal is reported on the editing surface.
- In Manager, the Essences left-nav item is a real route, not a disabled placeholder, whenever the selected system has `features.essences === true`.
- Manager shows component usage evidence for essence definitions and shows source-link state only when `features.effectTransfer === true`.
- Manager states component usage and recipe usage as two SEPARATE counts, because they answer different questions: components CARRY an essence and recipes REQUIRE it, and deleting the essence strips it from every carrier and rewrites every referencing recipe.
- Manager does not allow inline editing on the browse essences page, with one exception.
  The row's enable/disable toggle is a distinct localized named hit target, mirroring the Tools Tab's row switch; activating it neither selects the row nor opens the editor.
  Every other row edit still opens the dedicated edit essence view.
- An essence's colour is carried by its tinted medallion and by every chip that spells the essence's own name, and is NOT restated as a colour-token display name anywhere it stands beside such a tile.
  A maintained display name per theme colour is upkeep with no reader on a row, a grid card, an inspector hero, or a live-preview identity block.
  The editor's palette caption is the one exception and keeps its name: there the name labels the swatch the GM is choosing, and the No-colour cell has no tile to speak for it.
- The essence library offers a list and a grid presentation of the same rows.
  The grid card carries the same state vocabulary as the list row — the Disabled marker, the capability markers and the usage counts — because a presentation toggle must not silently remove state.
  Its usage counts AGREE WITH THEIR NUMBER: each has a singular sibling key, so a card carrying one component reads `1 component` rather than `1 components`, and the same pair serves the inspector's usage row.
  In the grid card the capability markers sit in a header row beside the medallion rather than beside the usage counts, so the icon and what it can do read together; in the list row they stay in the trailing cluster and are NOT moved.
  Row actions are list-only; grid selection routes through the inspector.
- The grid card lays out as a FIXED vertical stack — a header pairing the medallion with the capability markers, then the name, then the description, then the usage counts — and every growable part states its own ceiling so the same element lands at the same vertical offset in every card and every card in a row is the same height.
  The name truncates to one line with an ellipsis and keeps its full text as a title; the description keeps a fixed line clamp AND reserves that height even when it is shorter, so the usage counts beneath it are always at the same offset; and neither the name row nor the capability run wraps.
  That equality is also structural rather than incidental: the grid stretches its cards, and the card carries NO margin, because Foundry core gives every `<li>` a bottom margin and exempts the last child, and a stretched grid sizes an item's margin box to its row — so the last card in the list would otherwise silently take its siblings' margin as extra height.
  Equal height within a row does not cover a name that wraps, because every card in that row grows with it, which is why the name and description are bounded above.
- An essence's linked active-effect source and linked property macro are presented exactly as the Tool Studio presents a linked Item: ONE card, carrying the linked document's image, its name, an instructional sub-line, and its actions as a grouped icon pair.
  The card is itself the drop target, so no second drop prompt renders beneath it — a card and a zone side by side state the same affordance twice.
  A sub-line states what the GM can do with the card; it never restates the card's own title or the raw uuid, which is what a copy-uuid action is for.
  The essence source's UNLINKED state keeps the drop-or-pick control, because an essence source is an in-system managed component and the pick half is the only route to that list.
  The presentation toggle renders through the shared segmented control's icon-only variant, because a list glyph and a grid glyph ARE the two layouts, while the status filter beside it keeps its words.
- A browser row that leads with the 40px medallion states selection as the accent ring alone and drops the inset left bar, which would otherwise bite into the medallion; the essence row is one of them, and on its grid card a left bar is not even the correct axis.
- A browser that supports bulk selection states the ticked-row treatment through the one shared rule every such browser joins, so the state looks identical in every studio.
  A studio that writes the ticked class without joining that rule renders a ticked row indistinguishable from an unticked one, which is a defect rather than an omission.
- The essence library's search, filters, sort, presentation and page position survive a round trip through the essence editor.
- The essence library initially inspects the first adopted member in the rendered sorted, filtered and paginated list when its selected id is empty or no longer names a current member.
  A valid adopted-member selection survives sorting, filtering, paging and an editor round trip even while its row is temporarily absent from the rendered page.
  Empty results select nothing, and rows shown only through `All world essences` are never automatically selected.
- Manager essence icon editing uses a pop-over icon picker instead of requiring raw icon class entry.
  The editor's icon control is one column: the preview tile fills that column's width and the picker and its reset sit inside the same edge, so no control overhangs the tile it belongs to.
  The tile's glyph is sized for the tile rather than inheriting the shared row-medallion glyph size, which reads as a speck at editor scale.
- The System Essence Rules toolbar carries ONE filter — the membership pair — beside the search field, and no status segment and no source-state select.
  Both were removed because the row already states its own enabled state as a pill and its own source breakage in the summary line, the search box reads the source name, and the sort key groups by enabled-ness; a second and a third way to narrow a six-row list is chrome the reference does not draw.
  The presentation toggle is NOT a filter and stays, because it is the only route to the grid above.
- Manager hides source columns, source inspector sections, source warnings, and source edit controls unless `features.effectTransfer === true`.
  The essence editor's behaviour tab — `Essence rules` in the system-scope editor, `On craft` in a create draft — gates its Active effect source section on `features.effectTransfer` and its macro section on `features.propertyMacros`.
  With BOTH off the tab renders an explanatory empty state naming the two settings, never an empty tab.
- A disabled essence's On-craft sections and behaviour list render the SUPPRESSION rather than omitting the behaviour.
  Each configured section keeps its linked card and states that nothing it carries reaches a crafted result, because suppression is a state on the section rather than a removal.
- Manager allows essence deletion regardless of component usage: deletion is WARNED, not BLOCKED, because the cascade strips the essence from every carrying component and rewrites every referencing recipe.
  No delete is refused, and no set member is skipped, on account of the components carrying the essence, and the browser row shows the component count plainly with no delete-blocked marker.
  Both delete forms state their impact before the GM commits.
  The single delete's confirmation states how many components the essence is removed from and how many recipes are rewritten, worded in the FUTURE because the essence still exists as the GM reads it.
  Each consequence figure is gated on its own count, so the commonest single delete of all — carried by no component and required by no recipe — states neither nought.
- A set delete states its impact before it is armed, and recomputes it when the selection changes.
  The statement reports how many essence definitions will be deleted, how many components carry one or more of the SELECTED essences, and how many recipes will be rewritten.
  The component number is counted over the whole selection as a DISTINCT-carrier union: a component carrying two selected essences counts once, because the cascade strips it in one pass, so the copy says "one or more of the selected essences" rather than a per-essence sum.
  The two carrier numbers are counts of DISTINCT carriers, so neither exceeds what the cascade will touch.
  A carrier number of zero is omitted rather than stated as zero; the essence count always renders, because the impact statement is what the armed confirmation is paired with and a card stating nothing has lost that pairing.
- The set delete uses the two-step armed confirmation rather than a modal dialog.
  This is a deliberate exception to the reserved-for-bulk-actions dialog rule, taken on an explicit maintainer decision, and it is paired with the impact statement above.
- Manager source-state language is `linked`, `missing`, `stale`, and `none`; stale source evidence must remain readable until the GM clears or repairs it.
- A disabled essence is withheld from every ADD-NEW offer list and from nothing else.
  Wherever it is already referenced — a component quantity, a recipe ingredient option — it stays rendered, marked, and clearable, because the surface that authored a value must remain the surface that can remove it.
  Residual, recorded: the component bulk-edit panel's essences axis is a whole-map replacement, so applying that axis over a selection still rewrites every carrier's map from the staged grid.

## Tools Tab

The selected-system `Tools` rail item is a top-level entry rendered between `Essences` and `Gathering` (see Manager Shell).
It manages the system's single canonical Tool library (`system.tools`).

The Tools surface is a Tool Studio with a top-level library route and a focused `tool-edit` route.
There is no Tool Kind field, filter, selector, pill, icon taxonomy, or persisted Kind value on either route.

The library uses the Manager three-column shell at `210px | 1fr | 340px`.
It owns the sole system-breakage-authority card above search, with self-describing `toolSpecific` and `checkDriven` options; changing authority persists live and never erases the inactive per-Tool settings.
The center library accepts no Item drop.
Creating a Tool from an Item is a WORLD-scope act and its drop zone lives on the World Tools Catalogue, because a Tool's identity is one world record that every crafting system adopts rather than a per-system copy.
That zone rejects non-Items and snapshots the source Item's name, image and description.
A drop whose source Item is already named by a world Tool - through any of that record's source references - resolves to that record and opens it rather than creating a second one, and states which record it landed on and whether that record is disabled at world scope.
A drop no world Tool names creates one with a durable id of its own that references the source Item by uuid, so one game-world Item is one world record.
Each Tool row shows its linked image, display name, enabled state, breakage summary, and validation state.
The right inspector presents the selected Tool's identity and description followed by four headed card sections for breakage mode, on-break action, character prerequisites, and check bonus.
The Tool editor's own rail states five regions in a fixed order: how the Tool behaves, its effective rules, how players see one copy of it, a per-actor preview, and what requires it in this system.
The player region shows the Tool's art, its remaining-uses pill and a preview-only `Show as broken` switch whose sentence states what the authored on-break action does to a character's copy; nothing about that switch is stored.
The per-actor preview evaluates the Tool's selected character prerequisites against a chosen actor's prepared roll data through the same AND-semantics helper the crafting engine gates on, and states the gate mode's consequence — unusable, or usable with the check bonus withheld.
The required-for region lists this system's recipes and gathering tasks that reference the Tool, each with its kind, and states its empty case rather than rendering an empty region.
The row and inspector derive `Ready` or `Needs attention` from the canonical `Tool.validate()` result rather than from enabled state or a UI-only approximation; the inspector also exposes the validation issue count.
Both surfaces pair localized text and an icon with their status colour, so the state is neither colour-only nor an internal validation token.
When Tools exist and the current selection is absent or stale, the library selects the first MEMBER row of the rendered page exactly once, reading the membership filter, search term, sort key, sort direction and page slice the GM is actually looking at rather than the unsorted authored array.
It skips unadopted world rows, so a deliberate selection of one is never snapped away from the `Add {tool} to {system}` action that is its only purpose.
A valid current selection is preserved and an empty library emits no selection.
The result list scrolls independently above a full-width pagination footer that remains outside the scrolling region, and that footer's bar renders only for a multi-page result set, so a single page draws no pagination band.

**The membership segment selects the list's COHORT, and the zero state is a fact about that cohort rather than about the system's own Tool array.**
`In this system` lists the Tools this crafting system has adopted.
`All world tools` widens the same list with every world Tool this system holds no rules record for, each drawn as a non-member row whose only action is `Add to system`.
`Overriding` narrows it to the members whose world join reports an overridden section.
The `No Tools yet` panel and its two routes render only when the SELECTED cohort is empty, never when the system's own array is.
A system that has adopted nothing while the world holds Tools is exactly the state that panel's own primary route — `Show the {count} world Tools you can add` — exists to leave, so gating the panel on the system's array makes both that button and the segment beside it change a filter whose result the panel then hides.
That widened cohort is the only route on this screen to a Tool the GM has not adopted, and therefore the only thing the inspector's `Add {tool} to {system}` action can act on: with it unreachable, a GM cannot adopt a world Tool into a system from this screen at all.
A cohort that is non-empty before the search term and empty after it is the FILTERED state, not the zero state.
The foot pager's presence follows the selected cohort, on the same cohort the list draws.

Each row exposes selection through a keyboard-focusable identity target with explicit selected semantics and Enter/Space activation.
Selection, Edit, and enabled toggle are distinct localized named hit targets.
Activating Edit or the toggle does not select or open through the row handler.
The enabled toggle persists live through the same immediate path as Recipe enabling, updating both the focused draft and its baseline without marking an otherwise-clean editor dirty; a newly-created, not-yet-persisted Tool cannot be enabled through this path.

The editor uses `210px | 1fr | 320px` and exposes exactly three tabs: Breakage, Requirements, and Validation.
It authors a crafting system's RULES for a Tool and never that Tool's identity, so it has no Overview tab: the linked Item, the shared display name, the art and the description are the world Tool's, and its header states that in one sentence — `Rules in {system} · identity comes from the world Tool`.
The header owns Back to Tool Rules, a World Tool route to the world record, Save rules, and the dirty-state affordance; there is no footer save bar and no bare `Delete`.
Both navigations render as the same secondary treatment, because they are the same kind of verb — leaving this screen for another — and `Save rules` is the only primary in the cluster.
The World Tool route renders only when the world catalogue actually holds a record for the Tool, because a pre-migration in-system Tool has no world half to open.
The body includes a live behavior preview, while the inspector summarizes identity, effective rules, the player-facing copy, a per-actor preview, and what requires the Tool in this system.

Breakage opens with the two per-system facts that are not rules — `Enabled in {system}` and the per-system display-label OVERRIDE — and closes with `Stop using this Tool here`.
The label field states that it overrides the world Tool name in this crafting system only and that blank falls back to it.
The removal callout names the consequence in full — the rules in this system go, the world Tool and every other system are untouched — and its control is the shared armed destructive button rather than a second confirmation dialog.
Removal is TWO writes and both are required: the in-system record is deleted, because while `data-models/spec.md` `## CraftingSystem` requirement 36 holds it is the row the read union answers with, and the world membership record and its overrides go with it.

**The editor DISPLAYS from the read union and SAVES only the sections the membership record marks OVERRIDING.**
Its draft is seeded from `data-models/spec.md` `## Scoped Entity Definitions` requirement 15's read union rather than from the raw in-system array, so every card and every effective-rules row states the value a craft will actually take.
Reading the raw array gave this one screen a second answer to a question the union already answers: `breakage` only appeared to inherit because adoption copied the world value onto the record, and `prerequisites` and `bonus` — which have no such copy — stated the in-system empty over an authored world value, so the rail read `No check bonus` while every craft added the world bonus.
The save is therefore SECTION-AWARE: a section the membership record marks INHERITING is restored from the live in-system record and never persisted from the draft, and every other key — identity, the display-label override, `enabled`, `checkBreakable`, `requirement`, `repairRequirements` — is written from the draft unchanged.
Persisting the draft whole would write the world's answer for an inheriting section onto the in-system record, silently converting that section into an override that stops tracking its world default; the pill, the record's validity and every automated check would all still read correct, so this rule is a correctness rule rather than a presentational one.

Each of the four world-default sections — `breakage`, `onBreak`, `prerequisites` and `bonus` — is drawn as a bordered card whose head states the section, whether this system INHERITS the world Tool's answer or OVERRIDES it, what the world's answer is, and the shared scoped inherit switch that moves between the two.
While a section inherits, the card renders the resolved world value read-only rather than disabled controls, and the switch writes NOTHING to the in-system record in that direction: the union already answers an inheriting section from the world default, so the pill is true without a second write, and making one would mint an override-shaped value under a switch that says there is none.
Flipping a section to OVERRIDING seeds the in-system record from the value that was on screen — the resolved one — so the GM's first keystroke edits the inherited value rather than an older local one the record happened to retain.
A section whose resolved value is absent seeds nothing.
That head's pill states `Inheriting` in the informational colour family and `Overridden` in the warning family, and the Tool Rules list inspector states the same two words the same way, so one model is not read through two vocabularies one click apart.
A Tool the world catalogue has no record of renders no switch, no pill and no removal callout: there is no parent to inherit from and no membership to remove, and its save writes every section from the draft.
Disabled preview rules are titled `No prerequisites to use` and `No check bonus`.
Breakage authors the retained `limitedUses`, `breakageChance`, or `diceExpression` tool-specific configuration, the separate check-driven Breakable/Immune state (`checkBreakable`), and the `destroy`, `flagBroken`, or `replaceWith` action.
The tool-specific mode set the editor PRESENTS is four choices, not three: `Unlimited uses` leads them as a first-class option rather than as an unset state.
`limitedUses` with a null `maxUses` IS the unlimited answer — the rail, the player preview and the library row all already print `Unlimited uses` for it — so a set that omitted it left the state authorable only by absence, and a stepper that defaulted the null to `1` silently converted it.
Picking `Limited uses` therefore seeds `maxUses` at 1 rather than at null, or the choice would return the GM to the option they just left; picking `Unlimited uses` writes the null back; and the stepper renders the stored value with no fallback, because the only case a fallback could fire for is the one the fourth choice now owns.
Each of the four retains its own configuration while another is selected, and `Unlimited uses` configures nothing, so the editor draws neither a configuration block nor the rule that would separate one.
Percentage authoring uses the shared synchronized number-and-range slider primitive also used by Gathering drop chances; Tool breakage supplies its own accessible labels and continuously interpolates across a green, yellow, amber, then red risk scale as the chance increases.
Changing authority or check-driven immunity does not clear the inactive tool-specific configuration or on-break values.
When `checkBreakable` is false under check-driven authority, on-break controls are actually disabled and removed from interaction while their retained values and the explanation remain readable; opacity or `pointer-events` alone is insufficient.

`flagBroken` authors zero or more Recipe-compatible repair `IngredientGroup`s with the shared AND-groups/OR-options interaction model and Component, Tag, Essence, and Currency match types.
`replaceWith` authors exactly one managed Component target through a full-width shared searchable popover card.
The Tool Studio does not create or edit direct Item targets; legacy direct Item discriminators remain readable and executable at runtime until the GM deliberately replaces them with a managed Component target.
Requirements selects ids from the WORLD character-prerequisite library (issue 1308), the `bonus | usability` gate mode, and the enabled check bonus without embedding prerequisite definitions in the Tool.
Its empty state SHALL say the library is empty for the WORLD rather than for this system, and a Tool save SHALL preserve the selected ids: `upsertTool` derives the same Valid Id Basis `_normalizeSystem` does, so a save on a world whose library cannot be vouched for prunes nothing rather than silently clearing the gate.
The check bonus is PICKED from the world modifier library and never typed: the section offers a single-select list of `characterLibraries.modifiers[]` and writes the chosen entry's expression to `bonus.expression`, which stays a string.
Selection is resolved BY EXPRESSION rather than by entry id, because a stored expression does not record which entry produced it, so where two entries carry the same expression the first is the selected one.
An expression the library does not contain keeps its own row at the head of the list, selected and labelled as set by hand, so a value authored under the retired free-text field is neither highlighted as nothing nor dropped on the next save.
An empty library states the same absence sentence the prerequisite list states, naming where modifiers are authored, and renders no list frame around nothing.
Both scopes — the world Tool entry and the system Tool rules editor — render that one section from one component.
At SYSTEM scope the Requirements card opens with an informational strip naming the crafting system whose rules these are and saying that each section follows the world Tool until this screen overrides it, which is the one element distinguishing the two scopes' otherwise identical card.
The world Tool entry has no such scope to name and draws no strip; the sentence is resolved by the caller rather than composed inside the shared section.
Validation uses the Recipe editor's grouped summary-and-checklist surface, lists every failing model check under stable Breakage and Requirements headings, exposes the first failure for focus, and reports an all-clear state that is not color-only.
It carries NO identity check: a missing game-world Item is the world Tool's defect and no control on this screen can clear it, so it is stated as a routed notice naming the world Tool and it never counts toward the blocking total or the tab badge.
The domain still refuses the save, and the notice says so rather than implying the record can be saved as it stands.

Leaving a dirty `tool-edit` route through Back, rail or breadcrumb navigation, a system-scope change, another Tool selection, or application close invokes the standard DialogV2 Save / Discard / Keep editing guard.
Save proceeds only after successful validation and persistence.
Invalid or failed Save keeps the same Tool mounted, opens Validation, and focuses or exposes the first failing check.
The Validation tab projects domain failures onto stable localized categories and never renders raw field paths, exception messages, adapter details, or other internal error text.
Save, delete, and enabled-toggle failures likewise emit only their localized operation-specific message; raw caught errors may remain internal state for control flow but never become notification copy.
Discard restores the baseline before navigation, while Keep editing preserves the draft and focus.
Re-entering the same Tool does not prompt.
Stopping use of the Tool in this system is armed at its own control rather than confirmed by a separate DialogV2; successful removal returns to the library without a second dirty prompt.
`Delete`, which destroys the Tool itself, belongs to the world Tool entry.

Every uppercase eyebrow on these two routes takes its type from the manager's one shared kicker class, and no component on them restates that type in its own scoped block.
The same holds for a card's surface fill, which comes from the route's surface ladder in the global sheet.
Both are correctness rules rather than tidiness: the global sheet is imported at `layer(modules)` while a component's scoped block is injected unlayered, so a local declaration silently discards the shared rule for that property at any specificity, and the shared value can then be corrected without the screen moving.
The two breakage configuration labels — `Uses per copy` and `Break chance per use` — are NOT eyebrows and carry no kicker: each names the control on its own row and is drawn as a sentence-case title in the body ink.

Tabs expose `tablist`, `tab`, and `tabpanel` relationships with selected/error state that is not color-only.
Item creation/drop targets and every icon-only unlink, remove, and menu control have button semantics and localized accessible names.
The Tool editor's sole identity/action header spans the complete Tool shell above the rail, editor, and preview.
Tool routes suppress the generic system status ribbon, generic edit heading, rail scope card, and rail-collapse control so they do not precede the Tool content.
At product-root widths of `832px` and wider, the library preserves `210px | minmax(0, 1fr) | 340px` and the editor preserves `210px | minmax(0, 1fr) | 320px`; center workspace and inspector own vertical scrolling with `min-width: 0` and `min-height: 0`.
Only below `832px` do rail, main, and inspector stack in reading order with max-content rows, the body becoming the single vertical scroller while the bounded rail remains independently scrollable and main/inspector overflow becomes visible.
At `680px` and below, header actions and tab/action clusters wrap without overlap, and Back, World Tool, Save, validation state, replacement controls, and repair-row actions remain visible and reachable.

## Recipes Tab

The recipe **library** for the selected crafting system: a filter bar, collapsible category groups, rich card rows, and a persistent inspector in the shared manager inspector column.

The library renders **one** page header, and the shell owns it (breadcrumb, screen title, subtitle, Create).
The library does not render a page header of its own.

Rows are **cards, not table columns**.
A card row has no columns, so the list is a real list (`ul` / `li`, `role="list"`), not a table/row/cell structure with column headers.
Each row shows the recipe's image medallion (the recipe's own image, resolved through `resolveRecipeImage`, falling back to `DEFAULT_RECIPE_IMAGE` — never a containing book's artwork), its name, its authoring-state pills, a one-line description, an I/O readout, a check pill, a lock toggle, a keyboard-reachable on/off toggle, an `Edit` pencil, and a bulk-selection control.

The row's on/off toggle carries **no On/Off text**.
The track colour is the state, its `aria-label` names the state for assistive tech, and the `Disabled` pill states it in words — a third copy on every row only crowds the description out.
The label is retained on every other `manager-status-toggle` in the manager, where the switch has no pill beside it.

The row's `Edit` pencil is a **borderless ghost icon** that takes a background on hover.
Delete and Duplicate are preserved capabilities, but they are inspector-only rather than row actions: three bordered buttons beside a bordered lock, a switch and a pill make the row read as a toolbar rather than as a recipe.

Row authoring-state pills — at most one authoring state applies to a row:

- `Disabled` — the GM has switched the recipe off.
- `Locked` — the recipe stays visible to players, but only a GM can craft it.
- `Can't enable` — the activation check would refuse to enable this recipe **and** it is currently off.
  The activation check is the full completeness contract plus the alchemy signature scan, so an incomplete shell, a structurally broken recipe, a dangling essence or tag reference, an unmet resolution-mode requirement and an alchemy signature conflict all qualify.
  The pill, the bulk panel's pre-flight count and the write read that ONE predicate, so no two surfaces can disagree about whether a given recipe is currently enableable.
- `Incomplete` — the same activation blocker on a recipe that is already ON: unfinished or conflicting work a GM should still resolve, but nothing is being refused, because the activation check runs only on a transition into the enabled state.
  `Can't enable` and `Incomplete` read ONE predicate and differ only in whether the recipe is currently off.

The **I/O readout** always shows the ingredient count (`N in`).
It shows an output item count (`N out`) **only** in the `simple` and `progressive` resolution modes.
In `routedByIngredients`, `routedByCheck` and `alchemy` the results are tier- or set-keyed, so a single "outputs" number does not exist; those modes show the **result-group count** with a routing glyph instead, labelled as groups.
The readout is a phrase, not a numeric, and stays in the UI face — the mono face marks a number, it does not decorate a readout.

The **check pill** resolves the recipe's `checkTierId` against the system check's tiers and shows that tier's DC, falling back to the check's static default DC.
It shows a dynamic-DC pill when the check resolves its DC through a macro and a progressive pill for a progressive system.
A check is **usable** only when an authored `rollFormula` exists, which is not the same as "checks enabled", and the two check-less states are distinct and must not be conflated:

- **`By ingredients`** (neutral) — a `routedByIngredients` system with no usable check.
  Results route off the ingredient set that was used, so the recipe resolves with no roll; this is a working configuration.
- **`No check`** (warning) — every other mode with no usable check.
  The system cannot roll for this recipe, and a GM must be able to **scan** a library for that, which is why it is a warning that names the condition rather than an em dash.

The **filter bar** has three rows.
Row one carries every filter — a name/description search, a status filter (all / on / off), a lock filter (all / unlocked / locked) and a category filter (bare, named by its `aria-label`).
Row two carries the two view controls, separated by a rule: the group-by-category switch and the sort key (name, needs attention, check DC, ingredients, results) plus its direction.
Each view control is titled by an uppercase micro-label that **precedes** it and does not wrap.
Row three carries the active-filter chips and the count.

Every non-default filter surfaces a clearable active-filter chip.
The **count** is quiet right-aligned metadata — not a chip — and reports the page **window** (`1–5 of 12`), because a bare shown/total never tells the GM which page they are on.

Category group headers are `aria-expanded` / `aria-controls` buttons and default to **expanded**, the status and lock filters default to **all**, and the pager's default page size exceeds a typical system's recipe count.
These defaults are load-bearing: a default that hid rows would leave the GM staring at an empty library.
A group header is a tight left cluster — chevron, folder, name, count — not a full-width bar with the count flung to the far edge, which reads as a table header.

The library's view-state — current page, category / status / lock filters, sort key and direction, group-by-category toggle, page size, and per-category collapse state — is **preserved across an editor round-trip**: opening a recipe editor and returning to the library restores the exact page, filters, sort, grouping, and collapsed groups the GM left, rather than resetting them to defaults.
The name/description search term is preserved across that round-trip **and across that round-trip only**.
Navigating out of the library's scope — to any route other than the library and its own detail editor — clears the term, so a filter can never stay applied on a screen that renders no search box for it.
The scope is derived from the same browser↔detail-editor map the manager already uses for a crafting-system scope change, so it cannot drift from it.
This applies identically to the Component Studio's library; the Access surface is its own scope and clears on entry, and it renders its own search box so the cleared term is visible there.
Knowledge, Essences, Tools, Environments, Gathering and Systems keep their own in-screen search, which no other surface reads, so it is unaffected; so is the crafting graph's search, which is scoped to a tab rather than a route.
Returning to the library from outside its scope therefore restores page, filters, sort, grouping and collapse but not the search term, because the search term is the only one of them that was cleared on the way out.
It is cleared because its effect is not confined to the library — an active term also changes counts on screens that render no search box for it, and those controls do not.
A genuine **crafting-system switch** (selecting a different system) resets the vocabulary-scoped filters (category) and the page and collapse position, because a category names a vocabulary the next system does not share, while keeping sort, group-by-category, page size, and the status / lock filters as cross-system preferences; the search term is cleared on a system switch.
When the restored page no longer exists because rows were added or removed while editing, the page index is **clamped** to the last valid page; a restored filter that now matches nothing shows the filtered-empty state with its Clear-filters control rather than being silently dropped.

When "Group by category" is **on**, both GM libraries order the list **category-major before pagination**, so each category occupies a contiguous run of rows across page boundaries — a category larger than the page fills consecutive pages before the next begins, rather than showing an interleaved alphabetical slice on every page.
Category order is the browser's existing group order — components pin the reserved catch-all (`general`) **last**, recipes order it **plain-alphabetically** — with each browser sharing **one** comparator between its group order and its category-major sort, so "page order == rendered group order" is structural.
That category order is **independent of the active sort direction**; only rows **within** a category honour the active sort key and direction.
The non-grouped view is unchanged.

Both GM libraries group the **page**, not the filtered list, so a group header reports **two** numbers whenever they differ: what the group renders, and the category's total across the **filtered** rows (`25 of 282 recipes`).
This holds when a category spans a page boundary — its header reads `N of M` on each page it appears on, `N` being the rows it renders on that page.
Either number alone is a false statement — a count of the page says a 282-strong category holds 25, and a count of the filtered list puts `12 recipes` above the three rows page 2 renders.
A group shown **whole** reports one number (`25 recipes`), never `25 of 25`.
The total counts the filtered rows, so an active search / status / lock / category / essence filter is always respected; a total over the raw roster would be a third wrong number.
Both singulars are localized — `1 recipe` and `1 of 282 recipes`, never `1 recipes`.
The Component Studio's library follows the identical rule.

The category **filter's** own option counts are the one number on this screen deliberately taken over the **unfiltered roster** rather than the filtered rows, and that is a different question rather than a fourth wrong answer.
The filter offers what the GM could switch to, so an option whose count fell to zero as they typed in the search box would withdraw the escape route from an empty result.
Sharing one derivation between it and the group totals is a correctness regression, not a cleanup — the two cohorts must stay distinct even when they are served from one fetch.

Because both libraries page, **expensive per-entity work is scoped to what is on screen**: the rendered page plus the selected entity.
A recipe's execution structure, requirements preview, completeness verdict and authoring body, and a component's linked source document — its resolved description fallback and its `Missing` badge — are prepared for the page's rows and the selected row, never for every definition the filter matched.
What is prepared for the **whole filtered cohort** is everything a GM can act on without the row being on screen: the filter fields, the category totals above, every sort key, and the bulk selection.
The two lists must not be confused in either direction, and each direction fails differently.
A sort key demoted to the page tier renders **name order under the label of the key the GM chose**, silently and with no empty state to notice — so `enableBlocked`, the check DC, the ingredient and result counts and a component's salvage result-group count are all cohort-scoped facts.
A count taken over the page instead of the cohort states that a 282-strong category holds 25, which the `N of M` rule above exists to prevent.
Bulk actions operate on selected ids and cohorts, so `select all N results` selects the whole filtered cohort and an Apply reaches rows the GM has never scrolled to.
Enabling a recipe still refuses exactly the recipes the row pills mark, because the refusal predicate is cohort-scoped like the pills that read it.

Scoping is a matter of WHEN the work happens and never of what the surface reports: a paged library's counts, order, chips, selection and every rendered value are identical to those an unpaged one would show.
The selected entity's inspector stays fully detailed and current, and a GM who never leaves page 1 pays for page 1.
Where the page-scoped work is asynchronous — a component's linked source document is a real document fetch — the row and the inspector first render the stored reading and then **correct in place** as each resolution lands: a component's description settles to its source document's prose, and its source pill settles from the accent origin label it derives from the uuid's shape alone (`Compendium` or `Items Directory`) to the amber `Missing` for a document that has been deleted.
The correction must actually reach every surface reading that entity, and rows keep their identity across it, so nothing remounts and scroll position, focus, the bulk selection and an open inspector or editor all survive.

The **blocked-enable flash**: enabling a recipe is gated — an incomplete recipe, or one whose signature conflicts, is refused.
The refusal renders as an in-window, dismissible `role="alert"` flash inside the library, and the store **suppresses** its Foundry notification whenever the library claims that message, so the same error is never reported twice (once in-window and once in a toast behind a maximised manager window).
The flash **floats** over the list rather than sitting in flow above it: an in-flow banner shoves every row down the page as it appears, moving the row the GM just clicked out from under the cursor.

The **lock toggle** gives `recipe.locked` a real write path from the row.
Unlike enable, locking is **never gated**, in either direction: a GM locks a recipe precisely while it is unfinished, so refusing the write on incompleteness would make the control useless exactly when it is wanted.

The **inspector** is one column on the panel background, not a stack of bordered cards.
Section headings are uppercase micro-labels sitting directly on the panel — `Selected recipe`, `Requires`, `Produces` — not `<h3>` titles inside nested `manager-inspector-card` boxes, and there is no invented "Recipe details" heading over the stat grid.
Only the things that are objects keep a box: the 2×2 stat grid (Ingredients / Results / Steps / Crafting check) and the Requires / Produces flow rows.

The hero chip row carries exactly two chips on one line: the category and a status pill (a dot plus `On`/`Off`, naming the state exactly as the row's switch does).
There is no chip for the _absence_ of a state — the retired `Unlocked` chip named a non-state and forced the row to wrap; `Locked`, `Incomplete` and `Can't enable` are shown only when true.
The flavour text is shown whole, in the one surface with room for it.

The **Produces** list shows every produced group, **toned by role**.
The result-group pill carries the GM-authored group name (Fabricate's outcome tiers are authored, so the name is the recipe's — never a crit/success/fail vocabulary the model does not have); its tone is the role the group plays, success-soft or danger-soft.
The reserved `role: 'failure'` group — the failure output for plain `simple` resolution mode and alchemy-Simple checkMode alike — is **rendered** (danger-bordered), not filtered out, so a simple or alchemy recipe's failure output is visible.
**The routed clause is CONDITIONAL, not absolute (issue 1098).**
In a routed mode the list renders a failure-toned row for a result group assigned to a failure-marked outcome tier **when the system's `craftingCheck.failureResultPolicy` permits results on failure**, and renders none when it does not — matching what the engine will actually do.
The successful-craft-makes-nothing warning still keys on the SUCCESS rows only: a recipe whose only group is a failure output still makes nothing when the craft succeeds, and says so.
When the empty group belongs to a non-terminal step of a multi-step recipe, both this inspector pager and the recipe editor's result-group card render a neutral note that the step only advances the craft, without danger styling; the terminal-step and single-step cases keep the danger panel (issue 1907).
The neutral tone additionally requires the step to DECLARE a result group: a step carrying none at all is an incomplete shell (`stepMissingResultGroup`), so the inspector keeps the danger note there rather than reporting an authored intent the recipe does not have (issue 1907).

## The On-failure section

Each activity route's fifth section renders the `failureResultPolicy` `RadioCardGroup`, whose `perRecord` card copy is **per activity** — "Decided per recipe" / "Decided per salvageable item" / "Decided per gathering task", from the same record-noun vocabulary the Difficulty card reads.
Crafting adds `consumeIngredientsOnFail` and `breakToolsOnFail`; the alchemy branch renders the policy beside its own behaviour flags, because alchemy `simple` is one of the two crafting modes where the reserved failure group is a live award.
Salvage renders `consumeComponentOnFail` and `breakToolsOnFail`, persisted since 1.7.0 and reachable from no editor before this; **gathering renders NEITHER**, because it has no consumption block, renders the **dormancy notice naming issue 683**, and cross-references `task.failureOutcome` read-only.
Where the policy is inert — `routedByIngredients`, `progressive`, gathering `d100` — the section renders a **stated inert note naming the reason** rather than a control that does nothing, and the control itself stays selectable, because the policy is persisted per ACTIVITY rather than per mode and switching modes must not reset it.
The prototype's sentence "Applies to every resolution mode" is therefore **recorded as NON-ADOPTED** and is not rendered: the requirement above makes the policy inert on three of the modes.

## Routed result-group authoring is policy-conditional

The recipe result-authoring control's outcome-tier options are drawn from the system's routed tier list **filtered to `success === true` when the failure-result policy forbids failure results, and unfiltered when it permits them** — a swap between two functions the codebase already has, not a new derivation.
`recipeReadiness`'s routed-check validation reads the SAME set, so the picker and the readiness warnings can never disagree about which tiers are assignable.
The companion "are any tiers defined at all" signal keeps its meaning and gains a third empty hint for "tiers exist, some are failure tiers, but the policy does not permit failure results", which names allowing failure results as a remedy alongside marking a tier as a Success.
The per-component salvage `outcomeRouting` select is policy-conditional on the same terms — it was unfiltered and therefore offered dead options.
**`minSuccessOutcomeId` is unaffected**: it names a minimum SUCCESS tier and its picker keeps reading the success-filtered set under every policy value.
**An authored `ResultGroup.checkOutcomeIds` entry naming a failure-marked tier is NEVER stripped on a policy change or a tier `success` flip** — the strip keys on tier-id existence, so the assignment persists on disk, stops being offered and stops routing, and routes again when the policy permits.
The successful-craft-makes-nothing warning still keys on the success rows: a recipe whose only group is the failure group still makes nothing when the craft succeeds, and says so.

The inspector's primary action is **`Edit recipe`** — the accent-filled, full-width, loudest control on the panel, and the point of the inspector.
`Duplicate recipe` is its secondary above it; `Delete recipe` is demoted to a ghost danger link below it, so the panel's loudest action is never destroying the recipe.
The inspector column stays at the shell's shared 300px; it is not widened per view.

Actions:

- Create
- Edit
- Duplicate
- Delete

In Manager, the recipes browser header offers a single primary `Create recipe` action (no crafting-system import/export on the recipes header); creating a recipe follows a create-then-edit model — `store.createRecipe` persists a new identity-only _incomplete shell_ in the selected system via `RecipeManager.createRecipe({ craftingSystemId }, { allowIncomplete: true })` (it saves because persistence gates on structural validity only, not completeness) and the manager immediately opens the recipe-edit view on it.
The new shell carries the default recipe name and image until edited, and the browse row surfaces a derived authoring-state pill — `Incomplete` while the shell is on, `Can't enable` while it is off — until the activation check would accept it (see the row authoring-state pills above; missing ingredient sets and result groups are the commonest, not the only, reason it would not).
The recipe browse row `Edit` action opens that same dedicated recipe-edit view rather than editing inline, and that Edit action is available regardless of the recipe's `locked` state.
The recipe-edit view is the **five-tab editor** specified in `ui-entity-editors/spec.md` `## Recipe Editor` — Overview, Ingredients, Results, Tools and Validation — over a controlled local draft in the central `manager-main`, with the GM manager's right-hand context inspector panel (the global `manager-inspector` aside) carrying that editor's context rail.
Ingredients, essences, tools, steps and results are all authored there; none of them is deferred, and there is no _Catalyst_ concept in the editor (Tools replaced it).
Identity edits track a dirty state surfaced by a header dirty chip, persist via `store.updateRecipe` → `RecipeManager.updateRecipe(recipeId, updates, { allowIncomplete: true })` (so an identity-only save is not blocked by the shell's still-empty ingredients/results), and a dirty draft prompts a discard confirmation on route exit.
The recipe-edit header follows the standard editor convention shared with the gathering-task, gathering-event, and environment editors: an `Unsaved` chip (when dirty), `Back to recipes`, `Delete recipe` (danger, enabled whenever a recipe is selected), and `Save`.
The context rail is **always present** on `recipe-edit`, and what its top section carries is decided by the system's canonical `visibilityMode` through `craftingEffect` (see `ui-entity-editors/spec.md` `### Context rail`): the read-only access roster in `restricted`, the read-only Books & Scrolls "Appears in" summary in `item` / `knowledge`, and no top section at all in `global`.
It is **not** gated on the superseded `knowledge.mode`.
The layout collapses to a single column at the Manager container's narrow breakpoint (`@container fabricate-manager (max-width: 960px)`), mirroring the environment editor.
The recipe editor carries **no** per-recipe visibility editor: the legacy `recipe.visibility { restricted, allowedUserIds }` card is retired (see `ui-entity-editors/spec.md` `### Visibility Form`), and the canonical `recipe.access` grant is authored on the Access tab.
The `recipe == null` form of this view shows a `Select a recipe` empty state.

Recipe browse row quick-actions render in a single non-wrapping action group, consistent with the environment and gathering-task browse rows.
That group is the `Edit` pencil alone: `Duplicate` and `Delete` are inspector-only, because three ghost icons on every row read as a toolbar and truncated the description.

**Recipe Studio — bulk selection.**

The GM recipe browser supports multi-select bulk editing.
Each row carries a selection control at its TRAILING edge, as the LAST cell of the row's action cluster after the `Edit` pencil, rendered through the shared selection-control primitive.
It is appended to that cluster rather than prepended: the cluster's column track list gains the selection track at its END, and the column header's explicit `grid-column` placements survive an append while a prepend would shift every one of them by a track.
A selection toolbar sits directly above the list carrying a tri-state control over the CURRENTLY RENDERED rows, a selected-count readout, a `Select all {N} results` action over ALL filtered rows, and a Clear action, rendered through the shared bulk-selection toolbar primitive.
The rendered-rows control and the results action are distinct operations and are never conflated; a collapsed category's rows are not rendered and are never selected by the former.
The selection is scoped to the selected crafting system, survives an editor round-trip exactly as the browser's other view state does, is cleared by a crafting-system switch, and never retains an id that no longer resolves to a recipe.

**Recipe Studio — bulk edit.**

While the selection is non-empty, the recipe browser's inspector rail renders the bulk edit panel IN PLACE OF the single-recipe inspector.
The panel stages changes without writing: category (single-valued, overwriting, with an explicit leave-unchanged option), status (leave unchanged / enable / disable), lock (leave unchanged / lock / unlock), check tier, and recipe-book membership.
The recipe-book axis is a search-and-pick control over the system's AUTHORED recipe items — never a vocabulary derived from the items the selected recipes already belong to, which would make an item holding no recipes unreachable as an add target.
Picking one shows how many of the selected recipes it holds and offers add and remove, each labelled with the number of recipes it would actually affect and each unavailable when that number is zero.
The held count is resolved on the same basis every other membership reader uses (see `## Books & Scrolls Surface`), so a system on the legacy basis reports its real membership rather than reporting none and making removal unavailable.
Staging accumulates across recipe items rather than being limited to the one on screen: each staged item appears in a list stating its operation, the number of recipes it affects, and its own control to leave that item unchanged.
This axis deliberately differs from the Component Studio's tag axis, which is a run of tri-state controls; the divergence is in the staged axis only, and both panels render the same shared bulk-edit chrome.
The check tier axis carries THREE distinct instructions and never collapses two of them: leave the recipe's tier alone, clear it to the system's default DC, and set a named tier.
Where the system's crafting check carries no recipe-level tier — a progressive system, a dynamically resolved DC, a fixed-type routed check whose per-recipe difficulty is its minimum success tier instead, a resolution mode that rolls no crafting check at all, or a check with no tiers authored — the panel states which of those it is in place of the control rather than hiding it.
A well-formed system whose mode rolls no check is told exactly that, and is never told its resolution mode is unrecognised.
That is not the same fact as the system having no usable check at all, which the row's own check pill already reports, and the two are never conflated.
When Enable is staged, the panel states before applying how many selected recipes cannot currently be enabled and will stay off, read from the SAME activation predicate as the row's `Can't enable` pill, so the pilled rows and the counted rows are one set by construction.
The write applies that same predicate but evaluates it per recipe in batch order, and alchemy signature uniqueness is order-dependent: two selected recipes that collide only with each other both read as enableable, and the write enables the first and refuses the second.
The pre-flight count is therefore a LOWER BOUND on what a batch may refuse and is worded as one; the post-apply report is the authority.
One action applies every staged axis to every selected recipe; it names the number of recipes it will affect and is inert until at least one axis is staged, including a removal-only book draft.
Applying persists through a single set-apply write — at most one `recipes` world write and at most one `craftingSystems` world write, and none for an axis that changed nothing — applies every ungated axis to a recipe whose enable is refused, reports the number of recipes changed, the number of enables refused, and the recipe-item memberships added and removed, then clears the selection and the staged changes, returning the rail to the single-recipe inspector.
The membership figures count MEMBERSHIP EDGES — one per recipe added to or removed from an item — not the number of items whose membership changed, and they exclude the basis-carry-across the first membership write performs.
Every part of that report composes; none replaces another, so a batch that moved membership still reports any enables the activation gate refused.
The set delete specified below is the panel's other exit and ends the same way, so the panel has exactly two terminal actions and both return the rail to the single-recipe inspector.

**Recipe Studio — set delete.**

The recipe browser's bulk edit panel offers a set DELETE, rendered below the panel shell rather than inside it, so a destructive action never reads as a second way of applying the staged edit.
The set delete exists because the panel swap above otherwise removes the only delete affordance at exactly the moment the GM has selected the rows they want removed; Edit and Duplicate stay inspector-only, because neither is destructive and neither has an impact worth stating.

The delete states its impact BEFORE it is armed and recomputes it when the selection changes: how many recipes will be deleted, how many recipe items will no longer contain them, and how many characters will lose the learned knowledge.
The recipe figure is the number of selected ids that RESOLVE to a recipe, not the size of the selection, because a stale id must not inflate the stated count above what the write performs.
The recipe-item figure counts DISTINCT RECIPE ITEMS — two selected recipes in one recipe item is one recipe item — expressly unlike the bulk-edit membership figures above, which count MEMBERSHIP EDGES.
It is basis-aware and may therefore exceed the number of definitions the write actually rewrites: on a system resolving membership through the legacy per-recipe scalar the item genuinely stops containing the recipe, and nothing is rewritten because nothing dangles.
The character figure is a DISTINCT union of the actors the deleting client may write, resolved through the same scope the deletion cascade uses, so the two sides count the same set by construction.
Its FRESHNESS is bounded rather than instantaneous: the count is read from a cached learned-knowledge index, rebuilt whenever the studio's data is re-read and whenever an actor write has marked it stale, not re-derived on every render.
A character who learns one of the selected recipes at the instant the card is on screen and untouched is therefore not necessarily counted until the card next recomputes, and the number the write performs is recomputed at write time regardless.
The cascade may also clear learned entries the figure did not count, because the clean-up it runs removes every entry naming a recipe that no longer exists — so a world carrying pre-existing orphans has them swept too, and the figure is the number this delete makes forgotten rather than the total number of entries the pass touches.
A consequence figure of zero is omitted rather than stated as zero; the recipe count always renders, because the impact statement is what the armed confirmation is paired with and a card stating nothing has lost that pairing.
Each consequence figure is gated on ITS OWN count, on the card and in the single-recipe confirmation alike, so the commonest single delete of all — in one recipe item, learned by nobody — states neither nought.
Both consequence statements are worded in the FUTURE and carry no pronoun standing for the recipes, because the recipe count, the recipe-item count and the character count vary independently and a statement agreeing with a count it does not branch on reads wrong on ordinary selections.
One countable noun names the recipe-item figure across the card, the confirmation, the completion message and the control's accessible name; `recipe item` remains the canonical noun of this specification, and the surface may use the `Books & Scrolls` display name provided it uses it everywhere in the interaction.
The card additionally carries a standing, always-rendered sentence that deleting is permanent and a recreated recipe is a new recipe, and qualifies the character figure with the fact that a character does not get their learn slot back — a property rather than a count, which no numbered row can carry and which a GM reading "will forget" would otherwise reasonably read as re-teachable.

Deletion is WARNED, not BLOCKED: no recipe is refused and no set member is skipped on account of the recipe items containing it or the characters who have learned it.
The set delete uses the two-step armed confirmation rather than a modal dialog, paired with the impact statement above; the armed token is dropped whenever the selection changes at all, because an arm is a statement about a specific set, while a staged bulk edit survives a selection change that leaves the selection non-empty.
The set write persists through AT MOST one recipes write and AT MOST one crafting-system write regardless of set size, in that order, followed by one actor-flag clean-up for the whole set rather than one per recipe.
The crafting-system write and the crafting-systems change signal are both skipped when the prune rewrote no definition, which on a legacy-basis system is every time; the recipes change signal is emitted for the delete itself.
The actor-flag clean-up is one clean-up, not one write pass: it clears the run store and the learned-recipe store, each over the actors the deleting client may write.
On success it clears the selection and returns the rail to the single-recipe inspector; because that exit unmounts the panel, the completion message is the surviving feedback and reports every non-zero outcome — recipes deleted, recipe items that no longer contain them, and characters who forgot them.
The keyboard is returned to the studio's toolbar and that same sentence is then announced through the manager's live region, per Emptying a bulk selection above.
The recipe-item figure it reports is the one the impact statement promised, not the number of definitions the write rewrote, so a legacy-basis delete does not report having done less than it stated.
A write that deleted nothing reports no success, leaves the selection intact and returns the control to its idle face rather than leaving it in progress, and tells the GM that nothing was deleted — whether the write failed or simply reached nothing, which a concurrent client deleting the same recipes between the statement and the click produces without any failure at all.
Focus is returned to the re-enabled control — because confirming disables the control and so moves focus to the document body — and that outcome is then announced through the card's own live region, in that order; disarming without confirming is announced through the same region, since it changes the control's accessible name while it holds focus.
The single-recipe delete states the same arithmetic in its confirmation, from the same computation, so the two forms cannot report different numbers for the same recipe.

## Books & Scrolls Surface

`Books & Scrolls` is the `Crafting` group's recipe-item management surface, available whenever a crafting system is selected (the `Crafting` group is unconditional as of issue 745).
It is a display name only: the surface manages every recipe item in the selected system regardless of the item's Foundry item type (book, scroll, ring, wand, gem, note), and `recipe item` remains the canonical noun.

The surface lists every recipe item in the selected system (from `selectedSystem.recipeItemDefinitions`), and for each item shows its identity (image and name), the recipes it contains (its canonical `recipeIds[]` membership) as a count plus the linked recipe names, and that item's OWN use/learn caps (read from `item.caps`) as read-only chips: a use-cap chip (craft charges) and a learn-cap chip.

Each item's member recipes, its derived `Book` / `Scroll` / `Incomplete` type, and its "learned by" count are resolved against the selected system's **whole recipe roster**, never against the recipe library's search-filtered rows.
These are membership facts about the item, so an active search in another library must not be able to empty a book, retype it as `Incomplete`, or drop its learned-by count to zero.
The GM recipe browser's own row list and its shown/total counts remain filtered, per **GM Recipe Library**; the two cohorts are distinct.
The rule this states generally: a search-filtered collection may be used as a **cohort** — to list, or to count — but never as a **resolution table** for stored ids, because a filtered lookup does not return a different number, it returns a false statement.

Which basis resolves membership is recorded on the system, not inferred per read.
A system carries a monotonic `membershipResolvesByRecipeIds` marker: it is set by the first write to any definition's `recipeIds` and is never cleared, and on load it is set for any system that does not already carry it and has at least one definition with a non-empty `recipeIds`, so an existing marker is preserved rather than recomputed.
The write that first sets it seeds every definition in the system from the legacy scalars in the same write, so switching basis carries existing membership across rather than discarding it.
While the marker is unset, membership resolves through the recipe's legacy reverse ref — `recipe.recipeItemId` against a definition id, or, only when that scalar is ABSENT, `recipe.linkedRecipeItemUuid` against a definition `originItemUuid`; once set, only `recipeIds` resolves it, so an empty `recipeIds` array means "this book has no members" rather than "this system has not migrated".
Every GM surface resolves membership through the same implementation as the player-facing runtime and the delete impact statement, so the recipe browser's book column, the Books & Scrolls contents, and "n books & scrolls will lose them" cannot name different books for one recipe.
Re-deriving the basis per read — "any definition has a non-empty `recipeIds`" — is forbidden: it flips in both directions, so the first membership write to a legacy system would orphan every scalar-only member, and emptying the last array would revert the whole system and resurrect phantom memberships on player-facing reads.

Membership is authored on the item's **Contents** tab (writing the definition's `recipeIds`) or, for a multi-row selection, on the recipe browser's bulk edit panel — never on the recipe editor.
The caps are per recipe item, not a shared system-wide rule, so two recipe items in one system may show different chips (a one-recipe scroll beside a three-recipe tome).
When the selected system has no recipe items, the surface shows an empty state.

Selecting a row opens the `ItemPageInspector` aside; its quick-limit toggle is the sole remaining live-apply caller of `store.updateRecipeItemCaps` (the patch merges and normalizes onto the recipe item definition), and that toggle stages no dirty draft.
Editing a recipe item opens the full-window `recipe-item-edit` route — a tabbed editor (`RecipeItemEditorTabs`: Overview / Contents / Limits / Validation) over a root-held staged draft plus its last-persisted baseline.
That draft **is** part of the Manager confirm-discard route-exit chain (the `recipe-item-edit` row of `ROUTE_EXIT_GUARDS`), so navigating away with unsaved edits prompts to discard.
The one exception is recorded under Manager Shell's Crafting route-exit guard rule: the read-time reconciliation there invokes no guard, so a cross-client `visibilityMode` edit that removes `Books & Scrolls` while this draft is open can redirect away from it with no prompt.
The learn cap authors `caps.learn.limitRecipes` / `maxRecipes` / `destroyWhenSpent` and `caps.learn.consumeOnLearn`; `consumeOnLearn` is hidden while the learn cap is enabled (the learn cap's `destroyWhenSpent` supersedes it).
The surface reads configuration only (recipe-item definitions plus the recipes referencing each item) and never reads per-item-instance runtime flags, so the admin store stays Foundry-free.

The item's Limits authoring surface (`RecipeItemLimitsTab`), in knowledge mode inside the `limitLearning` detail block, renders (issue 544) a **Limit applies** control and **Recipes allowed** stepper on one line, then a two-column line of searchable typeahead pickers: **Required Knowledge** (left, authoring `caps.learn.prerequisiteIds` — recipes the reader must already know) and **Learning prerequisites** (right, authoring `caps.learn.characterPrerequisiteIds`).
Each column is an uppercase label, a hint, a search input (typeahead) that filters the candidate options by name, and a wrap row of removable pills below it for the selected entries; the Learning prerequisites pill carries the option's `@path op value` preview as its title.
Both pickers sit **inside** the `limitLearning` block, so they hide when Limited learning is off — matching the runtime rule that neither gate is enforced when the toggle is off.
When there are no options (no candidate recipes / no `characterPrerequisites` library yet), the column shows an inline muted empty note in place of the search input (Learning prerequisites steers the GM to add them in System Settings first) rather than a detached paragraph.

The recipe-item editor's right rail's **"How players see it"** section renders the ACTUAL player book detail component (`InventoryDetail`) fed a synthetic row built by the pure, import-free `buildRecipeItemPreviewRow` helper (issue 544) — rather than a bespoke re-implementation — so the preview can never drift from what players see (mirroring the shared-`recipeItemAccessBadge` no-drift precedent).
The synthetic row mirrors the exact shape `InventoryListingBuilder._buildRecipeItemRows` emits (mode → `learnable`/`craftable`, applicability-suppressed caps, `requirements` kept only when learnable + Limited learning, `blocked`/`reason` folded onto each recipe), so the embedded detail renders the real access badge, description, "Needs: &lt;name&gt;" requirement chips (with met/unmet state), and per-recipe Learn/Craft affordances.
Because the GM preview has no actor, the **"Effective rules"** list's "Needs: &lt;name&gt;" rows (one per requirement, only when Limited learning is on; the character-prerequisite row's sub is the `@path op value` preview) each carry a GM-only **"Satisfied?"** toggle (`manager-status-toggle`, defaulting to satisfied so the preview opens unlocked).
Flipping a requirement's toggle drives that requirement's synthetic `met` state, which flows to the embedded `InventoryDetail` live — its requirement chip flips met/unmet and its Learn buttons enable/disable — letting the GM preview exactly what a player in any qualification state would see.
The toggle is an authoring experiment control only; it is never persisted.
In the player app, the **book detail** renders the "Needs: &lt;name&gt;" chip row full-width below the header from the row's `requirements` array (surfaced by `InventoryListingBuilder`), reflecting the acting actor's met/unmet state per requirement (success ramp + check glyph when met, danger ramp + lock glyph when unmet); a blocked recipe's Learn button is disabled (the enumeration is not repeated per recipe).

`InventoryDetail` is a thin **router** over three states (empty | book | component) and remains the entry point the preview renders; the book branch routes to `InventoryBookDetail`.
The no-drift guarantee is unchanged by that split — the preview still renders the real player component rather than a re-implementation.
The component branch owns the salvage surface, and the preview never **renders** it, because a book is never salvageable.
(Note this is a rendering property, not a module-graph one: the router imports both branches statically.)

## Access Surface

`Access` is the `Crafting` group's per-recipe grant surface for the `restricted` visibility mode (`AccessTabView` / `GrantAccessInspector`).
It is a Crafting nav sub-item that appears **only** while `visibilityMode === "restricted"` (`craftingEffect.showAccess`); the other modes do not list it.
It authors the canonical `Recipe.access = { characterIds, playerIds }` grant, replacing the legacy `visibility.allowedUserIds` player list.

The list (`AccessTabView`) shows the selected system's recipes with a search box, a Category filter, and an Access filter (`all` / granted / no-access); each row shows the recipe's **own** icon — resolved through the shared `resolveRecipeImage` helper, per `data-models/spec.md` `## Recipe` requirement 16, never a containing book's artwork — plus its name, category, and a grant chip (`N char · N player`, or a danger `No access` chip when no character or player is granted).
Selecting a row opens the `GrantAccessInspector` for that recipe, whose header thumbnail resolves the same way.

The inspector authors the grant through **two independent rosters** — Characters and Players — each with its own search box and pager:

- The **Characters** roster is the player-character actor roster (`adminStore.getPcRoster` → `services.getPlayerCharacterActors`); toggling a character grants or revokes its actor id in `access.characterIds`.
  A granted character makes the recipe visible to any viewer who **controls** that actor (assigned character or Foundry `OWNER` permission — see `recipe-visibility/spec.md`), not to a fixed user.
- The **Players** roster reuses the world-users projection; toggling a player grants or revokes its user id in `access.playerIds`, making the recipe visible to that user directly.
- Each toggle persists the **full** `{ characterIds, playerIds }` snapshot via `adminStore.saveRecipeAccess` (live-apply, no dirty draft), so searching or paging never loses a grant.

Grant state is read from `recipe.access`, and the surface stages no dirty draft, so it is not part of the Manager confirm-discard route-exit chain.

## Knowledge Surface

`Knowledge` is the `Crafting` group's per-character **runtime** knowledge audit: which owned copies of the selected system's recipe items each character carries, and which recipes each character has learned.
It is the play-state counterpart to the Books & Scrolls Surface (which authors recipe items) and the Access Surface (which grants visibility), and it operates on per-character **owned copies**, never on definitions.
It audits **world actors only**; the knowledge state of an unlinked-token synthetic actor is out of scope.
"Surface" rather than "Tab" is deliberate: `Tab` in this spec names top-level manager tabs, which Knowledge is not.

**Membership gate.** The rail entry is shown when `craftingEffect(visibilityMode).showBooksScrolls` is true **OR** the selected system's `resolutionMode === "alchemy"`, and is absent otherwise.
That gate is deliberately wider than Books & Scrolls': `learnRecipeOnCraft` writes `learnedRecipes` under **every** visibility mode, and under `global` + alchemy those entries are the sole reveal source, so a `showBooksScrolls`-only gate would leave the GM no lever at all in that documented discovery-only configuration.
Two consequences follow and are stated rather than discovered: under `global` + alchemy the Recipe items tab is legitimately empty and the Learned recipes tab carries everything; under `restricted` + alchemy the rail shows Access **and** Knowledge but **not** Books & Scrolls.
The entry carries **no count badge** — the count would require the tab-gated projection, which is a no-op precisely while the rail is rendered, and the sibling Access entry is count-less for the same reason.

**Layout and roster.** Three panes: rail, searchable character roster, detail pane.
At Manager container widths of 832px and wider the three panes sit side by side and each fills the content area's full height, the rail's panel included, with the roster list and the detail pane's tab panel owning vertical scrolling; the shared 1120px restack does not apply to this surface.
Below 832px the panes stack in reading order as max-content rows, the body becomes the single vertical scroller, and the rail is a bounded, independently scrollable strip above the roster.
The roster is **player characters only** — the same player-character predicate the Access Surface roster applies — with no show-NPCs toggle; an NPC's knowledge state stays reachable through the GM Knowledge Reset API.
The two rosters share the predicate, not the accessor: Access projects each actor into a display record, while this surface enumerates the LIVE actor documents, because the projection reads each actor's owned items and flags.
Each roster row carries the actor's portrait, name and an "N item(s) · M learned" meta line, with a dimmed "Nothing tracked" row for a character carrying neither.

**Default tab.** The surface opens on Recipe items, except when the selected system has **zero recipe item definitions**, in which case it opens on Learned recipes.
The rule keys on the definition count, never on the selected character's row counts, so the tab does not shift as the GM moves down the roster; and it is resolved **once on surface entry**, never as a live derivation over that count — a GM authoring the system's first recipe item elsewhere would otherwise flip the count and yank the open tab.
Each crafting-system switch while the surface stays open re-resolves the default tab against the newly selected system's own definition count, and the open surface lands on that tab, because the prior resolution named a tab for a system the surface no longer shows.
A re-publish for the same system — a hook-driven refresh or a row action — never re-applies the default, so a tab the GM picked stays open until the system changes.

**Projected owned-copy row fields.** Identity (image, name, quantity), the Book / Scroll / Incomplete type derived from the recipe count, the contained-recipe count, `timesUsed` and `maxUses`, the derived remaining charges, `spent`, `inert`, `canExpend`, the resolved `learnScope`, and `matchTier` — the GM diagnostic tier from recipe-item matching.
`matchTier` is a **provenance** label, not an ambiguity report: its `duplicate` value names the weakest link (the copy reached its definition only through `_stats.duplicateSource`, the tier the bulk auto-learn gate refuses) and is reachable from a single definition, so the surface MUST NOT present it as a duplicate, conflicting, or ambiguous match.

**Rendering rules.**

- The uses chip has exactly three states: unlimited (info tone, "Unlimited"), remaining, and spent.
`remaining === null` means UNLIMITED and MUST render as "Unlimited", never "0 left".
`timesUsed` is shown before `maxUses` so a post-hoc cap change stays legible.
- `inert` renders as a **second, independent** chip whenever the flag is set, and is never folded into the uses chip.
That yields five renderable combinations, including **inert-but-not-spent** — the visible form of the "nothing ever clears `inert`" gap.
- Expend is **disabled** for a spent copy and for an uncapped copy (which would write nothing), and is **not** gated on `inert`: an inert-but-not-spent copy still has charges the runtime will spend, so disabling it there would apply a gate the engine does not.
**Known gap, recorded not fixed** (the sibling of "nothing ever clears `inert`"): "uncapped" is read from `limitUses` alone here, while the Unlimited chip is read from the derived remaining charges, and cap resolution passes `maxUses` through unnormalized.
A copy with `limitUses: true` and a `maxUses` that is not a finite number greater than zero therefore renders the **Unlimited** chip — correctly, by the fail-open convention — while Expend stays **enabled** and the engine core still increments a `timesUsed` that can never reach exhaustion.
That state is unreachable through the Books & Scrolls authoring UI and arises only from imported or hand-edited data, which is why it is recorded rather than gated: adding a `maxUses` test to the affordance alone would diverge the surface from `_applyRecipeItemUse`, and the real fix is to decide whether cap resolution normalizes `maxUses` or the engine treats that shape as uncapped on both axes.
A follow-up owns that decision.
- Delete deletes the **whole document** even for a stacked copy, behind a `services.confirmDialog` naming the quantity when `quantity > 1`.
- A spent row is muted by **colour on its name only**, never by a group `opacity`.
The chips are the row's only status signal, and compositing them through a group dim drops them below the 4.5:1 floor their 10px text needs; the disabled action button already carries its own reduced opacity, so the mute MUST NOT reach the action cluster either.
- `matchTier` earns a chip only for the actionable `duplicate` tier, which additionally carries a title naming the consequence (bulk auto-learn refuses that link).
The other tiers are diagnostic rather than actionable and are carried in the row's title, so the narrowest pane is not given a bare fourth chip on every row.
- Expend does **not** move focus: the row survives, so its own button keeps focus and a keyboard GM can walk a multi-use copy without re-tabbing.
Only the destructive actions, whose row unmounts, move focus to the owning tab panel.
- A learned row states its source on ONE line, resolved by a ladder over the entry: a still-owned source copy's name, else the member recipe-item DEFINITION name, else the trailing segment of the dangling uuid, and — for an entry with **no** `sourceItemUuid` — a GM grant or "Learned by crafting".
The grant rungs are consulted **only** inside the no-uuid branch: an entry that carries a uuid has real book provenance, and that provenance wins over any grant field beside it.
Inside that branch the discriminant is `granted === true`, **not** the presence of a label, so a grant with no usable label is still rendered as a grant.
The two grant states carry **distinct** kind values — a labelled `granted` and a label-less one — rather than one kind with an empty name, because the kind is the row's addressable test and capture hook, and collapsing them would leave the label-less state, which is the common one, unaddressable.
Each of the resulting kinds MUST have its own render arm: with the grant kinds falling through to the book rung's "Learned from {source}", a labelled grant would name a book that does not exist and a label-less one would render a dangling "Learned from " — the first a worse falsehood than the "Learned by crafting" it replaced.
- The row's leading meta icon is derived from that same kind.
A grant MUST NOT be decorated with the book glyph the book rungs carry: the line's whole content is that no book was involved, and the glyph would otherwise leave one muted word as the only difference between a grant and a craft.
The grant glyph MUST NOT be an award, medal or trophy, which would re-narrow a general GM grant to one caller's reward use case.
- **`granted` and `grantedBy` are UNTRUSTED at display.** The flag they live on is public, so a module that never passed Fabricate's write-side validation can set them to anything.
The surface MUST test `granted === true` strictly rather than for truth, MUST test `typeof grantedBy === 'string'` strictly rather than coercing (`String({})` renders "[object Object]", and an array survives the entry-boundary reader's nested-record test), and MUST clamp the label to the contract's maximum label length with a visible ellipsis, measured and cut in **code points** — a UTF-16 cut can split a surrogate pair and render the remnant as tofu.
The bound is **inclusive** of the ellipsis, so the rendered label never exceeds the length the write path refuses past; a contract-legal label renders verbatim.
This is a clamp, not a re-clamp: the write path _refuses_ an over-length label rather than truncating one, so nothing has clamped this value before.
Both tests and the clamp belong in the **projection's ladder**, not in the component, so no unclamped foreign text is ever published onto a row.
- The label MUST be rendered through text interpolation only — never `{@html}`, never into an `href`, and never into a `title` — and it MUST NOT be substituted into its translated sentence through any mechanism that interprets `$` patterns in the replacement.
Both `String.prototype.replace` and Foundry's `Localization#format` do: a label of `` $` ``, `$&`, `$'` or `$1` then rewrites the GM's audit line instead of appearing in it, while passing every type test, every length clamp and the framework's own escaping.
That is not a scripting hole — it is foreign text deciding what an audit line says, which is precisely what these rules exist to prevent.
Splitting the translated sentence on its placeholder and rendering the label as its own text node between the fragments satisfies this; so does a replacer function with the replacement's `$` escaped.
The requirement is on the property, not the mechanism.
- These display rules are scoped to **the entries the surface's own enumeration reaches**.
**Recorded gap, not fixed here:** that enumeration reads the learned-recipe flag map's top level rather than the shared entry-boundary reader, so a recipe id containing a `.` surfaces its first segment, resolves to no recipe, and is counted into `orphanCount` — presenting a real, non-orphaned entry as a phantom orphan and pointing the GM at the all-systems reset grain, which this section names as the orphan roll-up's only lever.
The gap is **pre-existing and independent of granting**: the same flag is written by the book-learn path and read by the same raw enumeration, so a dotted id already surfaces this way for a book-learned entry, and a dotted id cannot be newly minted because recipe-id intake refuses one.
Routing the enumeration through the shared reader changes the orphan and other-system roll-ups for every world already carrying such an id, so it is owned by a follow-up rather than made contingent on any one writer.
- A learned row whose erase will free no budget states WHY as a single icon-led clause appended to its source line, rather than a banner promise the erase cannot keep.
It MUST NOT be a second sub-label: the previous pairing stated one fact twice, because a source line reading "(copy no longer owned)" was itself the cause of a separate "Frees no slot".
The clause is cause-SPECIFIC and MUST NOT collapse to one string, because the condition is the full four-condition rule in Knowledge Reset / Erase: a still-owned source copy whose definition carries no learn cap frees nothing, so a clause claiming there is no owned copy would be false for that row.

**Confirmation affordance.** The two high-frequency row actions (Delete a copy, Erase a memory) use an inline two-step arm rather than a modal: the first click arms the control, the second executes.
It is a real focusable `button`, its icon swaps as well as its label so the state survives greyscale, its `aria-label` carries the full consequence sentence, and `data-armed` is the test hook.
The armed token is keyed on the **target document id**, never a row index, because the projection re-publishes asynchronously from actor and item hooks.
Exactly one armed token exists at a time, and it is dropped on: character selection change, tab switch, roster search-query change, any executed action (including Expend, which clears the token but deliberately leaves focus alone), `Escape`, `blur`, arming a different row, and any projection publish that no longer contains the armed id.
There is no auto-disarm timer.
`services.confirmDialog` is retained for the heavyweight cases: a stacked delete and both reset grains.
For the stacked delete the dialog is **additional to** the arm, never a substitute for it: the Delete control is the same armed button on every row regardless of quantity, and the dialog is raised by the store action the armed second click invokes, so the sequence is arm, confirm, dialog.
Branching the control itself on quantity is forbidden — it would make an armed row's affordance depend on a projected field that a re-publish can change underneath the GM.
Any consumer describing this to a GM MUST describe three steps, not a dialog replacing the arm.

**Per-character reset.** The detail header offers **both** grains — "this system" and "all systems" — routed through the GM Knowledge Reset API with and without a `systemId`, each behind a `confirmDialog`.
Both are required: reset-one-system deliberately leaves orphan learned keys in place, so only the all-systems grain can clear them and give the surfaced orphan roll-up a reachable lever.
The dialog body is where the erase-versus-reset discovery-progress asymmetry is disclosed.

**Disclosure placement — one idea per strip, never a banner stack.**
The Recipe items tab carries one persistent info banner naming what its two row actions do — expending a use spends one charge as if the character read the item, and deleting removes the copy from their pack entirely.
It is not a restatement of the page subtitle two rows above it.
The party-pool ordering hazard renders as a **conditional** warning band, raised only when the selected character owns a `learnScope: "total"` copy that is the source of a still-learned entry; a permanent band for a conditional hazard is noise.
The Learned recipes tab's band states the general rule without promising slot recovery, and the per-row no-refund clause carries the per-row truth.

**Refresh and reference contract.** The projection MUST NOT join the shared admin-store `refresh()`, which ~40 mutation paths invoke and which has no cheap invalidation signature for a whole-world actors-by-items scan.
It is computed by a separate refresh gated on a `knowledgeActive` flag, so it is a total no-op while the surface is closed, and while the surface is open the externally-driven actor/item hooks coalesce into one refresh through the existing microtask scheduler.
Each store action awaits its seam call and then re-runs the knowledge refresh, never the shared `refresh()`.
The result is published as a top-level `viewState.knowledge` and is **always a new object**; it MUST NOT hang off `selectedSystem`, which would force a `selectedSystem` reference rebuild on every knowledge publish and let a late second-phase publish clobber freshly projected rows.
A crafting-system switch never leaves the previous system's rows published.
While the surface is open, the switch drops the cached snapshot and publishes the cleared projection before the shared `refresh()` runs, then reads the snapshot once for the newly selected system after it.
A read superseded by a later read, a later switch, or the GM leaving or re-entering the surface is discarded: it neither publishes nor writes the cached snapshot.
While the surface is closed, the switch reads nothing and publishes nothing.
A knowledge reset confirmed after a switch still resets the system that was selected when the GM asked for it.
While the surface is open and holds no snapshot for the selected system, it publishes a loading projection: `viewState.knowledge.loading` is true from the moment the surface is entered, or a switch clears the cached snapshot, until the next read of the selected system settles.
Only the latest read settles the loading and error state, whether it resolves or rejects, so a superseded read changes neither.
A read that rejects while the surface holds no snapshot publishes an error projection: `viewState.knowledge.error` is true until a later read of the selected system resolves, and entering the surface or a switch replaces it with the loading projection at once.
The rejection still propagates to the caller.
`loading` and `error` are never both true.
A hook-driven or post-action re-read of a surface that already holds a snapshot publishes neither state, so a populated surface does not blank while it refreshes, and a failed re-read keeps the last published rows.

**Loading and error states.** While the projection is loading, the surface root carries `aria-busy="true"`.
The roster pane renders a compact no-state panel stating that player characters are loading, in place of its empty and no-match panels, and the detail pane renders a no-state panel stating that character knowledge is loading, in place of its select-a-character prompt.
While the projection is in error, the detail pane renders a danger-toned notice with `role="status"` and a polite live region, stating that character knowledge could not be loaded, with a line telling the GM how to try again, and the roster pane renders its search field and nothing beneath it.
In neither state does a pane say "No player characters", report that no character matches the search, or ask the GM to select a character, because each of those claims describes a finished read.
Each pane nests the shared primitive inside its own tinted wrapper rather than adopting the player views' view-state composition, per the design system's rule for a pane inside a tinted container.

## Recipe Dependency Graph

The graph route itself is still planned (#442) — the rail item remains a disabled `Soon` placeholder behind `fabricate.experimentalFeatures`, per the Manager Shell navigation contract above.
What is specified here is the DATA contract the store already publishes and any implementation of that route MUST honour, because the bound below is a product decision about what a GM is shown, not an implementation detail of whichever view eventually renders it.

**The graph is bounded by default.** The default bound is **500 nodes and 2,000 edges**.
The recipe dependency relation is producer x consumer through shared components, so one component produced by P recipes and consumed by C recipes contributes P x C edges; an unscoped graph over a system with thousands of recipes is therefore quadratic in recipes and cannot be laid out or drawn on the main thread.
The bound is enforced during construction, not by discarding a completed graph: node selection precedes edge derivation and edge derivation stops at the budget, so the bound bounds work rather than only output.

**Supported query scopes.**

- `all` — the whole system, complete when the system fits inside the bound.
- `recipe` — a selected recipe plus a hop radius over the dependency relation (default 2 hops).
- `component` — a selected component's producers and consumers, interleaved so that a neighbourhood truncated at the node bound still shows dependencies rather than one side of them.
- `cohort` — an explicit recipe id set, which is how a search or category filter is applied, resolved BEFORE the bound is spent so the bound never discards the recipes the GM searched for.

**An unscoped system over the bound returns no graph and says so.**
It MUST NOT return an arbitrary 500-recipe slice.
There is no comprehensible 500-recipe subset of an unscoped 10,000-recipe corpus, and a rendered slice would be read as the system.
The query instead reports that a scope is required, together with the true recipe count, so the GM can scope the question or ask for the full graph explicitly.

**Disclosure is mandatory and is carried in the data.**
Every graph result carries a bound descriptor stating the scope, the budgets in force, the system's total recipe count, the candidate node count where it is exactly knowable, whether the result is complete, and which budget stopped it.
A view rendering a result whose bound is not complete MUST state plainly that it is showing a bounded neighbourhood rather than the whole system.
Filtering or laying out a graph carries the descriptor through unchanged: neither operation can make an incomplete graph complete.

**The full graph stays available on explicit request only.**
An explicit unbounded request lifts both budgets; it is never the default, and it does not make the result complete by assertion — the descriptor still reports what was produced.

**Indexes are retained, not rebuilt per interaction.**
The producer/consumer relation is indexed once per recipe revision, keyed on the revision token `RecipeManager` mints for the selected system, and re-queried for every filter or search interaction.
A definition change advances the token and rebuilds; nothing else does.
The index stores the relation THROUGH components and expands neighbours on demand rather than materialising recipe-to-recipe adjacency, because that materialisation is the same producer x consumer product the bound exists to prevent.

## Environments Tab

Only shown when `features.gathering === true` for the selected crafting system.

Current GM editor behavior:

- The tab is hidden when the selected system does not enable gathering.
- The admin shell falls back to a visible tab when system or feature changes make `Environments` unavailable.
- The tab loads the selected system's environment list from the gathering environment store.
- Environment list and draft records are cloned before exposure to the Svelte view.
- The selected draft can edit environment name, description, enabled state, `selectionMode`, and optional `sceneUuid`.
- The selected draft can edit a player-facing environment image independent of any linked scene.
- The selected draft can edit gathering composition tags: multiple `biomes` and multiple `dangerTags`.
  Geography is no longer a composition tag and the legacy single-`region` selector has been removed; geography is authored as realm membership (see the realm multi-select below).
- When `gatheringRealmSettings.enabled` is `true`, the environment editor surfaces a multi-select **realm** chip control (`includedRealmIds`) mirroring the biome selector, sourced from the system's `GatheringRealm` records.
  When the toggle is off the realm control is hidden entirely.
  When the toggle is on but the world has no realms yet, the control shows a muted empty line pointing the GM to create realms under World > Travel first, and says they are shared by every crafting system.
- The selected draft can edit risk display/evidence and risk-to-danger matching evidence where supported.
- The selected system's Gathering Settings tab configures d100 reward selection, event selection, limits, and event outcome through `gatheringConfig.systems[systemId].rules`.
- The selected system's Gathering Settings tab configures per-system `Times of day` and `Weather conditions` matching settings with enable toggles, current value selectors, add controls, label/icon-editable value pills, and selected-system cleanup on deletion.
- The Environments editor shows current global weather and time of day as context, not as environment browse filters.
- Settings is the only primary GM UI surface for current global weather and current global time of day.
  Environment authoring may expose inherited condition evidence and future provider override evidence, but must not be the primary condition mutation surface.
- The Environments editor exposes Gathering Task and event library rows for the selected crafting system, including per-environment automatic/manual composition controls.
- In automatic composition, task and event tabs show Included, Excluded, and Non-matching record sections; excluding a record writes the matching `disabled*Ids` list and Restore clears it.
  Non-matching rows offer **Force add**, which writes the matching `forced*Ids` list and composes the record against the filter; it is the `warning`-role control above, and automatic composition is the only mode that offers it.
- In manual composition, task and event tabs show only Included in this environment and Available to add.
  Removing an included manual task or event clears `enabled*Ids`, ignores stale `disabled*Ids` and `forced*Ids`, and returns the record to Available to add according to its candidate, non-matching, or library-disabled state.
- Manual Available to add rows present Add for matching AND for enabled non-matching records — manual composition has no match filter, so it has no force add — and a disabled library note for library-disabled records.
- When the Manager Gathering `Environments` browser has no environments, its empty state keeps `Environments` selected, keeps `Create environment` available, and guides GMs to prepare Gathering Tasks plus encounter/event options before composing environments.
- Gathering Task and event row overrides stay inside expandable rows so the default environment workspace remains scannable.
  Collapsed rows show default-vs-override chips, enabled state, matching evidence, dirty/validation markers, and an explicit expand/collapse control.
- Expanded override panels contain per-environment override fields only; Gathering Task fields remain edited in their library surface.
- Expanded override rows are keyboard reachable, preserve focus on save/error where practical, and stack without horizontal clipping in narrow Manager widths.
- Gathering Task authoring includes identity, image, description, enabled state, task-level time/weather availability gates, search/pagination for ordered d100 drop rows, unresolved drop-zone rows, inline chance/quantity controls, modifier summaries, selected-drop inspector editing, and final chance preview.
  D100 row selection is controlled by selected-system Gathering Rules, not Gathering Task authoring.
- Gathering Task authoring may also include node count, depletion timing, respawn policy, stamina cost, attempt limits, risk overrides, encounter hooks, natural expression providers, and macro providers where the selected economy/features use them.
- Reusable event authoring includes name, image, description, enabled state, danger/match tags, d100 drop rate, and modifier provider evidence.
- The selected-system inspector exposes the WORLD character modifier library for gathering (issue 1308; per-system until then), with add/edit/delete controls, opt-in preset seeding when supported by the active Foundry system, and stale-reference evidence for rows that still point at deleted modifiers.
  The inspector projection is an explicit allowlist, so neither library may be projected off the crafting system any more: a field omitted there is invisible to the UI, and one projected from the system would show a stale copy the corpus no longer carries.
- D100 drop row and event editors expose character modifier references with modifier selection, `+`/`-` operator, optional min/max bounds, per-row override fields, and clear GM-facing evidence without leaking expression or macro internals to non-GM blind history.
- The settings/tag area can edit gathering vocabularies for biomes and danger.
  The legacy `regions` vocabulary dimension has been removed (geography is not a composition tag); geography is authored as `GatheringRealm` records under World > Travel > Realms.
  Weather and time-of-day vocabulary editing lives in the Gathering Settings tab condition panels.
- The editor keeps core environment identity separate from task/node authoring.
- The editor allows environments to exist without a linked scene.
  Scene link controls are optional access/evidence controls, not the identity of the environment.
- The editor should group rich gathering authoring into Overview, Location, Conditions, Tasks / Nodes, Results, Risk / Encounters, Economy, Visibility, and Advanced sections or equivalent groupings.
- Conditions authoring shows which task availability, yield, risk, stamina, or difficulty modifiers are active.
- Tasks / Nodes authoring exposes task identity, enabled state, current node count, max node count, depletion timing, respawn policy, next respawn evidence, and manual restock controls when node economy is enabled.
- Manual restock controls are GM-only and show whether they affect current count, max count, or both.
- Economy authoring shows the selected gathering economy mode and exposes only relevant controls as primary: time requirement for `time`, node controls for `nodes`, stamina cost/regeneration for `stamina`, and combined controls for `hybrid`.
- Economy authoring exposes a Gathering resolution mode card above the Limitation mode card.
  It offers `d100` (the only currently implemented gathering resolution; selectable and the default),
  `progressive`, and `routed` (display name "Routed by check").
  `progressive` and `routed` are modelled but unimplemented and SHALL render disabled with a "Coming soon" affordance;
  clicking a disabled option persists nothing.
  The selection persists on the system gathering economy block as `economy.resolutionMode`.
- Stamina authoring exposes system-level stamina configuration, including max/current provider strategy, regeneration mode, regeneration rule, manual adjustment permissions, and task stamina costs.
- GM controls allow authorized GMs to manually set an actor's current gathering stamina and, when Fabricate owns the maximum, maximum gathering stamina.
- Risk / Encounters authoring exposes environment risk, task risk overrides, encounter table links, trigger hooks, and player-facing risk copy.
- Encounter controls are optional and must not require every gathering task to have an encounter table.
- Attempt limit authoring exposes limit scope, max attempts, time window, recharge policy, probabilistic recharge settings, manual recharge controls, and current counter/recharge evidence.
- Blind environment authoring allows multiple tasks, hide-by-default behavior, blind task-selection strategy, progressive reveal toggle, reveal scope, reveal triggers, manual reveal, and reset/revoke reveal controls.
- Developer/API configuration should expose hook enablement notes, chat message settings, provider diagnostics, and integration-safe identifiers for environments, tasks, nodes, stamina, attempt limits, encounters, and reveal states.
- Chat message controls should allow GMs to choose which gathering lifecycle events produce chat messages and whether GM diagnostics are whispered/restricted.
- The editor evidence column should preview the player-facing environment card, task availability, modified yields/costs, risk, encounter hooks, stamina cost, and validation.
- The selected draft can add, select, duplicate, delete, and reorder tasks.
- The selected task can edit `name`, `description`, `img`, `enabled`, and `resolutionMode`.
- The selected task can add, rename, delete, and reorder result groups.
- The selected task can add, edit, delete, and reorder component-based results within a result group.
- Editable result fields are `componentId` and `quantity`.
- The selected task can add, edit, and delete catalysts.
- Editable catalyst fields are `componentId`, `degradesOnUse`, `destroyWhenExhausted`, and nullable `maxUses`.
- Catalyst `maxUses` is validation- and runtime-relevant only when `degradesOnUse === true`; when degradation is disabled, `maxUses` is ignored.
- The selected task can enable, edit, and clear a visibility gate.
- Visibility-gate authoring is formula-only: it uses a `formula` and a `threshold` field, with no provider select and no macro UUID field.
- Incomplete visibility input is local UI state only and must not be sent to the environment store until both fields are present.
  Clearing visibility calls the store only when a committed visibility gate exists.
- The selected routed task can edit `resultSelection.provider` as `macroOutcome` or `rollTableOutcome`.
- Routed `macroOutcome` authoring uses available script macro options for `macroUuid`.
- Routed `rollTableOutcome` authoring uses a UUID text input for `rollTableUuid`.
- The selected progressive task can edit `progressive.awardMode` as `equal`, `partial`, or `exceed`.
- Progressive check authoring is formula-only: it uses a `formula` and an optional `threshold` field, with no provider select and no macro UUID field.
- Progressive difficulty is displayed from the selected managed component difficulty; result-level inline difficulty is not persisted.
- Managed item options are prepared by the admin store/root and passed into the environments tab; the tab does not perform Foundry lookups.
- Task, result-group, result, catalyst, visibility, result-selection, progressive, check, time-requirement, and failure-outcome mutations preserve other nested task configuration.
- Dirty state is tracked for the selected draft, and save/cancel affordances are visible.
- Creating a new environment persists a disabled draft shell with one disabled placeholder task for validation compatibility.
  New draft placeholder result groups receive immediate IDs so they can be edited before save/reload.
  This shell is not a configured player-visible gathering path until configured and enabled by the GM.
- Duplicate, delete, and reorder actions use gathering environment store methods.
- Delete requires confirmation and cleans referenced active and historical gathering runs through the store.
- Store-owned task/result/catalyst/visibility/result-selection/progressive/check/time-requirement/failure-outcome callbacks are delegated through the admin store and remain inside the environment draft save/cancel flow.
- The selected-task time-requirement editor supports clearing `timeRequirement` for immediate resolution and editing minutes, hours, days, months, and years for timed tasks.
- The selected-task failure-outcome editor supports clearing to default failure feedback plus text and macro custom outcomes, with failure-outcome `mode` switching (`text`/`macro`) clearing stale fields from the prior selection.
- Save-blocking validation exposes a localized summary, inline field-addressable errors, `aria-invalid`, `aria-describedby`, keyboard focus to the first invalid field after failed save, and persistent stale-reference warnings.
- Validation identifies invalid node counts, invalid respawn policies, invalid stamina formulas/providers, invalid condition modifiers, invalid encounter table links, invalid attempt-limit settings, and risk values outside supported vocabulary.
- Narrow-window layout behavior is implemented with app/container-width rules so list/editor panes and advanced controls remain reachable in resized Foundry windows.

Validation rules from `gathering-and-harvesting/spec.md` must be enforced before save.

The environments editor must block save when:

- `selectionMode === "blind"` and multiple tasks can be selected without valid blind-selection/redaction configuration
- `selectionMode === "targeted"` and the environment has zero tasks
- a task is missing required routed or progressive fields
- a task's result groups violate reserved failure keyword rules

## Gathering Event Library

When `features.gathering === true`, Manager must expose reusable event library authoring as a dedicated route or as a nested reusable library surface inside gathering tasks or gathering settings.

Event library authoring must support:

- create, edit, duplicate, delete, enable/disable, search/filter, and usage evidence
- deletion confirmation when events are used by environments or tasks
- rows showing name, image, description summary, enabled state, danger tags, biome/weather/time matching tags, drop rate, and modifier provider evidence (geography is no longer a matching tag — the region picker, filter, and per-row region chips were removed from the task and event editors and browsers)
- validation for drop rate, tag vocabulary values, provider configuration, and unsafe deletion
- composition surfaces that attach or toggle matched reusable events without editing reusable event definitions inline

Player-facing event copy is framed as a neutral encounter (a travelling merchant as readily as an eruption) rather than danger-first, while the danger axis itself is retained:

- Timing and locality copy reads as a neutral encounter (for example "When & where it happens" rather than danger/hazard framing).
- An environment's player-facing event presence reads neutrally (for example "This area has events in store." and "The events here are hidden until you gather.").
- Event-outcome copy uses event terminology (for example "If an event occurs, your gather still succeeds." / "…the gather fails.") rather than risk/hazard terminology.
- Copy that legitimately describes the danger axis (for example "Danger tags let environments opt in…") is retained.
  The d100 result-group validation copy still reserves the failure aliases (including the former miss/`hazard` terms) as forbidden result-group names — this is the failure-keyword concept, not the Gathering Event concept.
