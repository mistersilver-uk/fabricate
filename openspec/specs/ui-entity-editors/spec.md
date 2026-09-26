# UI Entity Editors

## Purpose

Define the GM Manager's per-entity editors: the recipe editor, the component studio and the step editor.
Sibling UI surfaces and the cross-cutting UI rules are indexed by the Surface Map in `ui-integration/spec.md`.

## Recipe Editor

Scoped to a single crafting system.

The Manager recipe-edit view is a **five-tab editor** — Overview, Ingredients, Results, Tools, Validation — over a controlled local draft.
Every edit stages into that draft and commits in one `updateRecipe` call on Save (through the `allowIncomplete` authoring path, which gates on structural validity only); the `enabled` toggle is the single immediate exception, because enabling validates against the persisted recipe.
The shared header carries an `Unsaved` chip, `Back to recipes`, `Delete recipe` and `Save`, and every route exit runs the Manager confirm-discard guard.
A recipe whose ingredients or results are still empty is a persistable _incomplete shell_: it stays non-craftable (the engine gates on completeness) and the browse row shows the derived authoring-state pill for a recipe the activation check would refuse — `Incomplete` while it is on, `Can't enable` while it is off.

### Resolution-mode banner

Every tab is headed by a **resolution-mode banner** naming the crafting system's `resolutionMode`, describing what it means, and offering a chip that routes to Crafting Settings.
Resolution mode is a property of the **system**, never of a recipe: the banner reports it and offers no per-recipe control, because the mode dictates the editor's whole shape (one ingredient set or many, tier routing, the alchemy result slots) from outside the recipe.
Its copy and icons come from the canonical `resolutionModeOptions` list that System Settings and Crafting Settings already render, so no second, drifting table exists.

### Context rail

The editor's right-hand column is the shell's existing `manager-inspector` aside (not a second nested grid), and it is **always present** on `recipe-edit`.

Its top section is **mode-conditional**, driven by the system's canonical `visibilityMode` through the `craftingEffect(mode)` matrix — the same single source of truth the crafting nav and Crafting Settings consume:

| `visibilityMode`    | `craftingEffect`   | Rail top section                                                                                                              |
| ------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `restricted`        | `showAccess`       | **Who can craft this** — the players and characters granted this recipe, plus a **Manage access** deep-link to the Access tab |
| `item`, `knowledge` | `showBooksScrolls` | **Appears in** — the books/scrolls that teach this recipe, plus an **Open Books & Scrolls** deep-link                         |
| `global`            | neither            | No section: a globally-visible system grants no per-recipe access and uses no books                                           |

The rail is **read-only in every mode**.
Authoring lives on the owning screen: the Access tab owns `recipe.access`, and Books & Scrolls owns book membership.

Below the mode-conditional section, in every mode, the rail carries the recipe's **Category** selector, the **Recipe mode** (Simple / Complex) segmented control when the system's resolution mode permits multiple ingredient sets, the **Step mode** (Single / Multi-step) segmented control, and a **Validation** mini-list showing either an _All clear_ pill or the failing readiness checks with a deep-link into the Validation tab.

### Access rosters (restricted mode)

The rail's access rows are **resolved in the admin store** and handed to the rail as display rows; the rail never resolves an id itself.
Three rules govern that resolution, and each exists because the naive alternative silently misreports who can craft a recipe:

- **A character's controlling players are a SET, not one user.**
  The runtime predicate grants access to any viewer whose **assigned character** is that actor **OR** who holds Foundry `OWNER` on it — a union, not a fallback chain.
  Each resolved character therefore carries `controlledBy: Array<{ id, name, avatar, assigned }>` (assigned-first, then name-sorted), never a singular "played by" field.
- **`ownership.default >= OWNER` reaches the whole table.**
  When it does, the character carries `sharedWithAllPlayers: true` and the rail renders **"Shared with all players"** — a distinct string, never "Played by ⟨one name⟩", which would tell the GM that one player got the recipe when in fact everyone did.
  With no controllers at all, the rail renders **no** sub-line rather than inventing an attribution.
- **GMs are filtered before ownership is tested.**
  `Document#testUserPermission` short-circuits every GM (Assistant GMs included) to `OWNER`, so the roster is derived from Foundry's non-GM `game.users.players` roster first.
  The same roster now backs the Access tab's grantable **Players** list, which previously offered GMs as targets even though granting one had no effect.

Granted **character** ids resolve over **every world actor**, not the player-character roster: the runtime predicate applies no type filter, so a grant naming a non-player-character actor is still honoured by the engine and must still be displayed.
An id that no longer resolves (a deleted actor or user) is **dropped from display and never persisted away** — rendering the rail must not mutate the grant.
The rosters re-project on user CRUD and on actor CRUD, with `updateActor` key-filtered to `ownership` / `name` / `img` changes so an ordinary HP update does not re-project.

### Base Form

- Name (implemented in Manager)
- Description (implemented in Manager)
- Category (always includes reserved `General`) — implemented, in the context rail
- Locked toggle — see `### Locked`

In Manager, the recipe-edit identity card additionally edits a player-facing image (via the FilePicker) and an `enabled` on/off toggle alongside Name and Description.
The editor header shows the recipe's image, its name, and a `⟨category⟩ · ⟨resolution mode⟩` sub-line.

The Overview tab additionally offers an optional **Minimum success tier** dropdown, shown only when the selected system runs a `routedByCheck` check whose routed `type` is `fixed`.
Its options are that fixed check's success outcome tiers ranked ascending by `start`, preceded by a default `No override (use final tier)` entry, and it authors the recipe's `minSuccessOutcomeId`.
Selecting a tier makes a craft that rolls below it fail outright (see `resolution-modes/spec.md`); the control is hidden for relative-type checks and for non-`routedByCheck` systems.
Note: alchemy `checkMode: tiered` dispatches through the same routed-check runner but the engine forces `minOutcomeId: null` on that path, so a `minSuccessOutcomeId` carried on an alchemy tiered brew is inert at runtime — matching this control's hiding for alchemy (a value the GM cannot edit or clear here is also one the runtime ignores; see `resolution-modes/spec.md`).

### Visibility Form

Per-recipe visibility is authored on the **Access tab** (`recipe.access = { characterIds, playerIds }`), gated by the system's `visibilityMode: 'restricted'`.
The recipe editor itself carries **no** per-recipe visibility editor: the legacy `recipe.visibility { restricted, allowedUserIds }` card (gated on the superseded `recipeVisibility.listMode`) is retired, and `access` is read-forward-seeded from `visibility.allowedUserIds` for legacy systems.
The recipe editor's context rail shows a **read-only** summary of the grant plus a deep-link to the Access tab.

If the system's visibility mode consumes an item or teaches by knowledge (`item` / `knowledge`):

- The recipe's context rail lists **every** book/scroll that teaches it, because recipe↔book membership is **many-to-many** (`RecipeItemDefinition.recipeIds`, projected onto the recipe row as `recipe.recipeItemIds`).
  There is no book/scroll `kind` — `RecipeItemDefinition` manages every recipe item regardless of Foundry item type.
- Each row previews that book's name/image/source status (falling back to the legacy scalar `recipe.recipeItemId` only while the system's membership-basis marker is unset), offers Open item, and offers a per-book **remove**, which removes the recipe from **that** book's membership only and does **not** delete the shared definition.
  A multi-row selection can remove membership the same way from the recipe browser's bulk edit panel.
  A row whose definition's `originItemUuid` no longer resolves shows a missing/stale state and retains the link.
- **Adding** a recipe to a book is authored from the book's side (Books & Scrolls → the recipe-item editor stages `recipeIds` and persists on Save), or, for a multi-row selection, from the recipe browser's bulk edit panel.
  The recipe EDITOR still carries no drop zone and no "link another" affordance: a second SINGLE-recipe authoring path for the same many-to-many is duplication, not a capability.
  The bulk panel is admitted because it expresses an operation neither surface can — one membership change applied across a whole selection — rather than a second way to do what the Contents tab already does.
- Membership changes apply immediately (through `setRecipeBookMembership`), independently of the recipe draft's Save.

Owned copies match by UUID or resolved source UUID of the linked recipe item definition.
If the required linkage is missing, show a validation warning.

### Locked

`recipe.locked` is persisted and engine-honoured (`guardCraftStart` refuses a locked craft), and the Overview tab is where it is written.

A locked recipe stays **visible** to players but only a GM can craft it, a distinct concept that carries its own copy and its own hooks.

The lock write path is **never gated**, in either direction, in explicit contrast with the enable toggle: a GM locks a recipe precisely while it is unfinished, so an enable-blocking validation issue must not also block locking it.
The change persists immediately (like `enabled`), outside the recipe draft's Save.

### Recipe crafting-check modifier control (issue 1055)

The Overview tab's per-recipe crafting-check modifier control (`RecipeOverviewTab.svelte`) is shown **only** under the system's `bySubject` combination rule — rendered "By recipe" on this activity — and only when the WORLD modifier library resolves non-empty for that system (issue 1308).
`bySubject` is the one rule that defers the selection to the recipe author, so it is the only rule under which this tab has anything to say about check modifiers.
Under `addAll`, `highest` and `playerPicks` the tab is **silent** — no control and no banner: a control the engine will ignore is worse than no control, and a banner explaining its absence would appear on every recipe of every system that never chose `bySubject`.

Under `bySubject` with a catalogue, exactly one of two mutually exclusive dispositions renders, in this priority order:

1. **Inert banner** — shown when the system's active check applies no check modifiers, for one of TWO causes: `noCheck` (this resolution mode rolls no crafting check at all) or `noFormula` (a check slot exists but has no authored roll formula).
The third cause, `noPlaceholder`, is REMOVED together with the roll-formula placeholder it named: the resolved scalar is appended to whatever the GM authored, so "a formula is authored but never references it" is not a reachable state.
`noCheck` and `noFormula` remain, and their copy states the real remaining cause **without naming any placeholder**, because a GM told to reference one would be told to do something that does nothing.
The control gains no new state.
   The control is replaced entirely — nothing authored here could change a roll — and the banner names which cause applies from the recipe's point of view (distinct copy from the Checks card's equivalent notice).
   The banner wins the priority order precisely BECAUSE the rule delegates here: the system asked this recipe to pick, and its picks would reach no roll.
2. **Controls** — the grid renders a picker cell for the eligible-id subset.
   There is **no combination-rule select**: a recipe chooses WHICH modifiers apply, never HOW they combine.

The per-recipe select-row grid's worst case is **three** cells — Category, the picker cell, and _at most one_ of Check tier / Minimum success tier — because the picker cell hosts its own tri-state select (**Inherit system default** / **Custom set** / **No modifiers**) rather than adding a further grid cell.
Check tier and Minimum success tier are mutually exclusive by construction and never render together: `resolveRecipeFixedOutcomeTierOptions` offers a minimum tier only for `routedByCheck` + `fixed`, while `resolveRecipeCheckTierOptions` under that same mode offers tiers only when the routed type is **not** `fixed`.
Selecting **Custom set** seeds the pill row from the recipe's own eligible ids (falling back to the system default set, so "customize" starts from what the recipe was inheriting), TRUNCATED to `craftingCheck.maxModifierPicks` so the seed never shows picks the engine would not roll; selecting **No modifiers** writes an authored empty `modifierIds` array (nothing is appended to that recipe's check roll); selecting **Inherit system default** drops the `modifierIds` key.
Clearing the LAST selected pill under **Custom set** posts an authored empty array (`{ modifierIds: [] }`), never `null` — posting `null` would silently become _Inherit_, which is the pre-1055 defect this control replaces (a GM could not express "this recipe gets no check modifiers" at all).
Under **Inherit system default** the pill row is replaced by a read-only line naming the inherited set through the active language's list formatting (or stating that the system default set is empty, so no check modifier applies to this recipe).

**Pick cap disclosure.** When the system's cap is bounded, the picker states it in words beneath the pills ("This system lets a recipe pick one check modifier." at a cap of 1, otherwise "…up to N check modifiers."), and adds an at-cap clause once the recipe has picked that many.
An unbounded (absent) cap renders no sentence at all, because there is nothing to disclose.
The add-menu button is disabled at the cap and an add is refused a second time in the toggle handler, which is what holds when the cap is lowered on the Checks studio while this editor is open — but neither is the invariant: `resolveEligibleModifierIds` truncates on read, so a cap lowered below what a recipe already picked is honoured whatever is on disk, and the recipe's stored picks survive intact.

A legacy `craftingModifier.policy` left on disk by a pre-1055 world is CARRIED FORWARD untouched by every writer on this tab.
This surface no longer authors a rule and must not silently delete one either — dropping a key while editing a neighbouring one is data loss disguised as a set edit — and the key is inert regardless, because the resolver never reads it.

The inert banner reuses the resolution-mode banner's chrome (`RecipeModeBanner`, prop-ified with a `tone` and a `dataAttr` name so it can render alongside its sibling on one tab without colliding) rather than inventing a second visual language for "this is set elsewhere".
It renders full-bleed below the grid, replacing the control the grid would otherwise hold, rather than squeezing into a single grid cell.

**Five-mode active-check-formula table.** WHICH `craftingCheck` sub-config the active resolution mode actually rolls — the precondition for every disposition above — is resolved by `resolveActiveCraftingCheckFormula(system)` (`checkModifierResolver.js`, which replaced the crafting-only `craftingModifierResolver.js` in issue 1095), which maps `resolutionMode` (and, for `alchemy`, the system's `alchemy.checkMode`) to that sub-config:

| Resolution mode       | Check config                 | Notes                                                        |
|------------------------|-------------------------------|---------------------------------------------------------------|
| `simple`               | `craftingCheck.simple`        | optional                                                       |
| `routedByIngredients`  | `craftingCheck.simple`        | optional; shares the simple slot                               |
| `routedByCheck`        | `craftingCheck.routed`        | required                                                       |
| `progressive`          | `craftingCheck.progressive`   | required                                                       |
| `alchemy`              | per `alchemy.checkMode`       | `none` → no check, `simple` → `simple`, `tiered` → `routed`   |

A library selection can be inert for THREE DISTINCT reasons this selector distinguishes rather than collapsing into one boolean: the mode rolls no check slot at all (`noCheck`), a slot exists but carries no authored roll formula (`noFormula`), or the mode rolls a check that cannot take modifiers yet (`noModifierSupport`, reachable only on gathering `d100`) — each renders its own remedy-specific copy, both on this tab and on the Checks card.
The third cause is REMOVED with the placeholder, together with the remedy-specific copy it drove on both surfaces.
The selector reports `rollFormula` and `checkUsable` POST-shim, so a stored formula whose only content was the retired placeholder reports `noFormula` rather than reporting usable.
**Checks studio — Validation, the retired-placeholder readiness split.** `checksReadiness.js` derives `hasRollFormula` from the POST-shim formula, not the raw field, so the Validation route cannot tick "Has a roll formula" green for a check `checkUsable` reports as unusable — the invariant `resolution-modes/spec.md` states, on the one surface a GM consults to find out whether a check works.
A typed retired placeholder raises one of TWO mutually exclusive issues, and the split is on the STRIP OUTCOME `planRetiredPlaceholderStrip` reports — the same decider `checkUsable` and the `1.21.0` migration reduce — never on the placement classifier alone, because the two disagree and the tab and the migration would then give the GM opposite instructions about one formula:

- `retiredPlaceholderInFormula` (**warning**) when the shim STRIPS the placement.
The removal is lossless, so whatever the GM authored around the placeholder still rolls and the modifiers still apply; only what they believe about WHY is wrong, and the copy says the placeholder is ignored and removed before the roll and to delete it.
- `retiredPlaceholderBreaksFormula` (**critical**) when the shim REFUSES the placement — every non-additive placement, AND every additive one whose residue would be structurally incomplete (`1d20 * -@craftingmod`, `1d20 - @craftingmod -`, `@craftingmod +`, all of which the placement classifier calls additive).
The WHOLE formula is discarded and the check does not roll at all, so the copy says it must be rewritten by hand — echoing the migration notice's untouched-count sentence, which is what this GM already read.
Telling them to "delete the placeholder" would be actively wrong: deleting it out of `1d20 * @craftingmod` leaves a dangling `1d20 *`, and out of `max(@craftingmod, 2)` leaves `max(, 2)`.

A placeholder-ONLY formula (`@craftingmod`) is the one place the warning copy's "the check still rolls" is not literally true: it is STRIPPED — losslessly, to nothing — so it takes the warning, and the separate `hasRollFormula` tick is what reports that there is now no formula to roll.
The two issues are about the placeholder; the tick is about the formula, and they are not merged, because "delete the placeholder" and "author a formula" are different instructions.
The critical case is asserted over the shared refusal corpus rather than a sampled list, because a hand-picked list of non-additive shapes is exactly what let a classifier-driven split ship.

Both predicates also inspect the legacy `routed.rollExpression` alias, and that branch is DEFENSIVE, not load-bearing — it is described that way because describing it as load-bearing was wrong.
`rollExpression` is a READ alias that both `CraftingSystemManager._normalizeRoutedCraftingCheck` and `checks/checkDraftClone.js`'s `cloneRoutedCheck` fold into `rollFormula`, and neither emits the key, so no draft this tab is ever handed carries a live one; the `1.21.0` migration sweeps the alias because it reads the raw SETTING, which is a different input.
It is kept here because `evaluateCheckReadiness` is a pure evaluator over a plain check object with no normalizer of its own, and a placeholder reaching it through the alias must not be the one thing the tab stays silent about.
Both strings NAME `@craftingmod` explicitly rather than saying "a retired placeholder", which is unidentifiable in a formula carrying several `@` tokens.
That is not in tension with the inert-cause copy: those two strings must not name a placeholder because they would be telling a GM to ADD one, and there is none to add.

The catalogue card renders in **every** crafting activity route, including alchemy: it is no longer gated on a single "check usable" boolean, because that gate made two of the three inert causes AS THEY STOOD AT ISSUE 1055 (`noCheck` / `noFormula` / `noPlaceholder`) unreachable on the surfaces it hid the card from entirely.
That historical triple is not the live one: `noPlaceholder` retired with the placeholder at issue 1094 and `noModifierSupport` was added at issue 1096, so the live set is again THREE and is stated below.

**Checks studio — combination rule and pick cap.** `CraftingModifierCatalogueCard.svelte` authors everything the SYSTEM owns here, and the system owns all of it: there is no authority axis and no per-recipe rule override.
It renders the **Combination rule** as one `RadioCardGroup` of four options in `MODIFIER_POLICIES` order — **Add all**, **Highest**, **By recipe / By component / By gathering task** (`bySubject`, labelled from the activity), **Player picks** — so the two selecting rules sit adjacent and the 2x2 grid reads them as a pair.
`MODIFIER_POLICIES` remains the source of that list and its order, and `normalizeModifierPolicy` validates the selection; neither is re-declared as a local literal, and the latter is what makes a world still carrying the pre-1095 `byRecipe` select the right card.
The 2x2 grid MUST reflow to 1x4 under the container query rather than overflow the real ~700–760px pane: the card declares itself a container (`container-type: inline-size`), so the shipped `@container (max-width: 620px)` rule for `.is-config-cards` measures the CARD rather than the whole manager shell.

**NO ACTIVITY AUTHORS AN ENTRY (issue 1117).** The card renders each entry READ-ONLY on all three — identity, expression, a signed bounds chip (`-1 to +6`) and a `Rolls dice` chip on a roll-shaped one — with ONE deep link to the surface that does author it, World › Rules & Resources › Modifiers (issue 1311; it was System settings › Modifiers until the library moved to world scope).
Crafting used to carry an entry editor here, which made the Checks screen a second editor for a system-level library and made salvage and gathering second-class states of that asymmetry; two editors for one array is how two screens come to disagree about which wrote last.
**Read-only applies to the ENTRIES alone**: the per-entry eligibility control and the combination-rule grid stay fully editable on all three activities, because deciding which entries apply and how they combine is exactly what each activity owns.
The Checks saver carries no library half at all, so the removal is structural rather than a hidden control.

**The eligibility control carries SIX labels over four rules, not one word and not eight**: three selected words — `Applied` (`addAll`), `Considered` (`highest`), `Selectable` (BOTH `playerPicks` AND `bySubject`) — and one NOT-selected word to answer each (`Not applied`, `Not considered`, `Not selectable`).
A single off word is the negation of ONE on word and of no other, so a row reading "Selectable" when on and "Not applied" when off states the two ends of two different sentences.
**`bySubject` SHARES `playerPicks`'s pair rather than owning a fourth**, and that is a requirement rather than an economy: the shipped `By recipe` rule description reads "from the modifiers you mark **selectable**", so a row wearing any other word makes the sentence beside it untrue about its own control.
One word per KIND of rule is the rule — unconditional, entered into a maximum, or offered to whoever the rule defers to — and the two deferring rules differ in WHO is offered the entry, never in whether it is offered.
The GLYPH and the TONE stay constant across every off reading, deliberately: the not-selected state has to read as one state at a glance, and it is the WORD that completes the sentence the rule started.
**Where the state word is drawn TWICE — once in an operable control and once as a badge beside it — exactly ONE of the two is in the accessibility tree, and it is the operable one**: it carries the WHOLE accessible name, the entry's label and the state word, in its own `aria-label`, and the badge beside it is presentational and `aria-hidden`.
Leaving both in the tree reads the state twice, and a badge that merely supplied `aria-labelledby` would still be a second copy of the same words.
One of the two, never both.
This is stated as a rule about ROLES rather than about two component names, because both names it used to carry have moved: the badge was a `StatusPill`, which issue 1506 retired into `Chip`, and the catalogue card's own pair was collapsed by issue 1373 into a single `aria-pressed` toggle button carrying the whole name — the rule's own limit case, where the badge IS the control and there is nothing beside it to hide.
`SubjectModifierPicker.svelte` still draws the pair, as a `SelectionCheckbox` beside an `aria-hidden` span, and cites this requirement for it.
The checkbox is `aria-describedby` the ACTIVE RULE's eligibility sentence, which is what makes "Applied" mean something to a reader who never sees the rule grid.
The two are adjacent and are NEVER nested — an interactive control inside an interactive pill lands invalid DOM.
The not-selected state differs by more than colour: the checkbox is unchecked and the pill's word AND glyph both change, so the distinction survives a monochrome render.

**Issue 1096 REVERSED this section's name, and the reversal is the requirement.** It was labelled "Check modifiers" on all three activities as a recorded deviation from the prototype; the studio's five-section strip now names the section **"Modifiers"**, and the two cards inside it are **"Named modifiers"** (the read-only library with the eligibility control) and **"How they combine"** (the rule grid and the pick cap).
The disambiguation that name was carrying is not lost, because it moved to where the two concepts can actually be confused: a drop row and an event still head their references "Character modifiers", the one authoring surface is still plain "Modifiers", and the surviving "Check modifiers" heading names a SUBJECT's pick — its one consumer is the gathering task editor, where a task's check-modifier pick sits on the same screen as its drop rows' character modifiers.
A Checks route needs no such qualifier: the route is already named for the activity whose check it authors.
The **gathering section additionally renders the dormancy notice** naming issue 683.

Beneath it, a **Maximum picks** stepper authors `maxModifierPicks`.
It renders **only** under a rule `policyDefersSelection` admits (`bySubject`, `playerPicks`), asked of the resolver live against the radio group the GM is clicking rather than re-derived from a local membership test or projected from the last persisted rule.
Its **empty field is a real value — unlimited — not a blank to be defaulted**: the value shown is `resolveMaxModifierPicks`'s answer rendered back (`Infinity` → empty), so a stored `0`, `-2` or `"three"` displays as unlimited exactly as the engine treats it, and clearing the field persists `maxModifierPicks: null` VERBATIM rather than omitting the key, because omitting it would leave the old bound in place.
An accompanying hint states "empty means no limit" and is the input's accessible description, since a blank number field cannot state it; the hint is keyed by rule AND by activity, because the cap bounds the SUBJECT AUTHOR at authoring time under `bySubject` and the PLAYER at roll time under `playerPicks`, and one sentence covering both would say nothing specific about either.

The **eligibility intro** copy is keyed by rule for the same reason, in SIX readings: one each for `addAll`, `highest` and `playerPicks`, and one per ACTIVITY for `bySubject`, because the record doing the picking is a recipe, a component or a gathering task and a sentence covering all three could name none of them.
There is no longer a **"Default modifiers"** sub-heading and no standing intro string above the rows: issue 1095 replaced the separate default-modifier pill row with a per-row eligibility control, so the rows ARE the default set and a heading naming a control that no longer exists was pointing at nothing.
The intro sits **ABOVE the rows it governs**, not below the rule grid.
It states what switching an entry on MEANS under the rule the GM just chose, so it belongs where that switching happens; below the grid it landed far under the controls it explains and read as a footnote about the pick cap.
The rule grid re-renders it the moment the rule changes, so its position cannot leave it describing a rule the GM is about to change.
The **empty-library state is ONE sentence on all three activities** (issue 1117): it names World › Rules & Resources › Modifiers, because no activity here has an add button and "Add one" would be an instruction this screen cannot carry out.

### The system Modifiers library — the ONE authoring surface (issue 1117)

`SystemEditView.svelte`'s settings-list section, internally keyed `'modifiers'` and hooked `data-system-modifiers`, is renamed **Modifiers** and is the ONLY surface that adds, edits, reorders, seeds or deletes a modifier.

**It is NOT gated on the gathering feature.** The old gate was correct while the library only fed d100 drop rows; the same library now carries every CHECK modifier, so gating the only authoring surface on an unrelated feature flag would make a crafting or salvage check modifier unauthorable.
The Character Prerequisites card's **Copy to Modifiers** action loses the same gate for the same reason.

It keeps every convention the settings-list cards already have and the Checks card never had — add, update, delete, whole-section collapse, accessible **Move up / Move down** reorder, opt-in preset seeding, and the row-level **Copy to prerequisites** cross-list copy — and it ABSORBS the check-only fields the Checks card used to own:

- a paired absence-preserving `min` / `max` `Stepper` set with an `Unbounded` placeholder, on its OWN row after the expression input so the row reflows to two lines at a narrow pane rather than compressing the expression field, plus a hint stating that empty is not zero;
- a PLAIN `RollDataExpressionInput` (`sigil={false}`), adopted from the retired Checks editor because this is now the one surface that authors an expression.
  It renders no `@` affix, strips nothing for display and re-prepends nothing on write: the stored expression is shown and written byte for byte.
  The affix was correct while an expression was always a roll-data path, and dice retired that premise — a cap that prepends `@` to whatever is typed turns `1d4` into `@1d4`, and an adaptive cap that appears only for a bare path restructures the field as the GM types.
  The leading `@` is therefore the GM's to write, and the surface teaches it: the placeholder reads `@abilities.med.mod` and a hint states that a number or dice expression takes no sigil.
  No stored value changes — the affix only ever supplied the sigil on write, so a persisted path already carries it.
  The summary row reads the stored expression back verbatim for the same reason;
- the two BLOCKING bounds faults, reported on the COLLAPSED row and named by cause (`inverted` / `unsafe`), because an entry that contributes nothing is a fault a GM scanning the list must be able to see;
- a **roll-shaped expression** note on the open editor, stating that EVERY activity may use it: a gathering drop row applies its rolled result, and a check appends the dice to its roll formula so the roll is made once and shows on the card, and that where modifiers compete — `highest`, or `playerPicks` — such an entry is ranked by its average.
  An entry whose expression transforms its dice total (`cs`, `cf`, `even`, `odd`, `df`, `sf` or `ms`, judged by `classifyModifierExpression` with character paths taken as zero) carries the transformed variant of the note instead: where modifiers compete it has no comparable average, so entries with an ordinary average are chosen ahead of it.
  It is a NOTE, not a warning, and it raises no readiness issue of its own: the blocking `modifierRollExpression` is RETIRED, because there is nothing left to report about an entry that rolls.
  A transformed entry that a check ranks is reported on that check's Modifiers readiness instead, as the non-blocking `modifierAverageUnavailable` (`ui-system-studio`).

The summary row keeps its `@`-stripped inline expression and its `Roll` chip, and gains the signed bounds chip.
The Checks screens' read-only modifier cards deep-link here, expanding the section and scrolling it into view; the link goes through the same route-exit guard every other manager navigation does, so leaving a dirty Checks draft still prompts.

### Subject check-modifier picker — salvage and gathering (issue 1095)

`SubjectModifierPicker.svelte` is the ONE authoring surface for the two NEW `bySubject` subjects, `Component.salvage.checkModifierIds` and `GatheringTask.checkModifierIds`.
It is one component with two hosts — `ComponentEditView` (the component's Salvage tab) and `GatheringTaskEditView` (the task card) — rather than two copies, because the pick's semantics are subtle in exactly the way a copy gets wrong, and because the two hosts disagreeing about them is a defect no screen shows.
The recipe's equivalent control (`RecipeOverviewTab`) is deliberately NOT converted onto it; the mismatch is named in the component's own header and is a behaviour decision about the recipe surface, not a refactor.

- **It renders under the activity's `bySubject` rule and a NON-EMPTY system catalogue, and nothing else gates it.**
Each host asks its OWN activity's rule (salvage's from `salvageCraftingCheck`, gathering's from `gatheringCraftingCheck`), never another activity's, because the catalogue is shared and the SELECTION is not.
The salvage host's gate is its own rather than nested inside the DC-override's `simple || routed` one: `progressive` salvage honours the pick at roll time, so nesting made the control unreachable in a mode whose roll reads it.
An empty catalogue draws NOTHING at all — a control whose menu could only ever be empty.
- **Three states, and the two absent-vs-empty ones are different rolls.** An ABSENT pick INHERITS the activity's `defaultModifierIds`; an AUTHORED EMPTY array is a real pick of zero and appends no term; an authored non-empty array is the pick.
The authoredness toggle is the only place a GM moves between the first two: switching it ON emits `[]` and switching it OFF emits `null` (gathering's host patches `undefined`, which is what makes its normalizer drop the key).
Turning it ON deliberately does NOT seed from the activity's default set — a record turning the switch on has stated that it picks its own, and seeding would author picks the GM never made.
This is the one axis on which it differs from `RecipeOverviewTab`'s `changeModifierSetMode`, which does seed.
- **Under inheritance the inherited entries are NAMED, not merely announced.**
The pill row has nothing to author, so it is hidden and the note lists the activity's default set, resolved against the catalogue and dropping unknown ids exactly as the resolver drops them — so the line cannot promise a modifier the roll would not apply.
The names are joined by `formatList` (the active language's list conventions) and interpolated into a **`{list}` placeholder** on the sentence; a hand-joined `', '` tail is wrong in English before it is wrong in any other language, and a runtime value concatenated onto a localized string takes the list's position in the sentence away from the translator.
- **An EMPTY inherited set is its own reading, not a blank.** It states that the activity's default set is empty and that no check modifier applies to this record.
That distinction is domain-level rather than cosmetic: "inheriting these two" and "inheriting nothing" are two different rolls, and a picker that rendered a bare label for both would tell the GM the same thing about each.
- **It NAMES THE SUBJECT.** Every sentence is keyed by which record is being edited — a COMPONENT (its salvage check) or a gathering TASK — from the same shape of vocabulary map `CraftingModifierCatalogueCard`'s `SUBJECT_COPY` uses, so the two surfaces name one subject one way.
The internal noun for the abstraction the two share never reaches a screen.
The inherit sentences name the ACTIVITY's check rather than "the system", because the default set is per-activity and a GM reading "the system default set" on the Salvage tab would look for it on the wrong screen.
- **The cap is stated STANDING**, not only once the add button has already gone dead, with an at-cap clause appended when it is reached.
It is read through `resolveMaxModifierPicks`, so a stored `0`, `-2` or `"three"` shows no cap at all — the picker bounds exactly what the engine bounds.
A cap of exactly **1 takes its own singular sentence**, never "up to 1 check modifiers", the same pair `RecipeOverviewTab` uses; every other bounded cap interpolates the number into a `{count}` placeholder whose fallback substitutes the count itself, so an unlocalized build reads a number rather than a raw brace.
- **The accessible control is the `SelectionCheckbox` and it carries the whole accessible name; the visible sentence beside it is `aria-hidden`.** One of the two, never both — the same rule the eligibility pill above follows, for the same reason.

### Tools tab

The recipe editor's Tools tab authors Tool references only.
Recipe-wide Tools are available in every resolution mode, and explicit multi-step recipes may author additional Tool references per step.
Named ingredient sets receive their own Tool card only when the Crafting System uses `routedByIngredients`; unnamed sets and every other resolution mode expose no per-set Tool authoring.
The per-set card reuses the Results tab's result-set outer card, header, and static-label hierarchy.
A row and the add-a-tool picker both resolve the Tool's name and image through the single precedence in `data-models/spec.md` `## Tool` requirement 13, so an item-sourced Tool renders its own snapshot rather than a placeholder.
Rows contain Tool identity and removal only: Recipe data exposes no breakage, consumption, prerequisite, or bonus policy control because those behaviors belong to Tool Studio and Crafting System check settings.

### Ingredients tab

#### The requirement row

ONE row shape authors every requirement, on every surface that authors one: the recipe editor's ingredient list, the Tool Breakage tab's repair set, and the world Tool entry's copy of that same set.
Its anatomy is the kind FIRST and the value second:

```text
[plate] [kind select] [name field] [quantity] [or…] [remove]
```

- **Each kind carries its own tint, on every glyph the row draws for its subject.**
The plate, the named pill's mark and each suggestion's take one colour per kind — component, tag, essence and currency are four distinct hues — so a mixed list reads as one list with four marks in it.
The tint is on the MARK and never on the tile or the pill, which would make four rows of four kinds read as four differently-coloured cards.
- **No row carries a `REQUIRED` badge.**
A choice group states OR in its own `ANY ONE OF` pill, so every row OUTSIDE a group is AND-required by position and a per-row badge restates what the absence of the group already says.
- **The kind is the shared select,** rendered through `components/Select.svelte` at its `inline` rung and never a native `<select>` (issue 1510), carrying the kinds the adders offer plus whichever kind the row already IS, so an authored requirement always reads back as what it is even where its kind is no longer offered.
Changing it CLEARS the row's value, because an id belonging to the old kind means nothing to the new one and the new kind's own editor could neither see nor clear it.
- **The name field has two faces.**
Named, it is a pill carrying the subject's image or icon, its name and a real clear BUTTON.
Unnamed, it is an inline search field with its suggestions rendered BENEATH it, in the row — never a popover opened over it.
- **A suggestion starts where the query starts.**
The panel sits directly under the field it completes, so each suggestion's glyph and label are left-aligned against the typed text above them; a suggestion centred in its panel is not continuing what the GM typed.
This is a declaration the row has to make rather than a default it can rely on: Foundry styles every `button` on the page as a centred flex box, so a suggestion row that names no justification of its own inherits that centring, and `text-align` cannot undo it because the row is a flex container rather than a text one.
- **Losing focus commits NOTHING; Enter commits.**
The DOM fires `change` on a text input on blur as well as on Enter, so a field that committed on `change` committed the raw query the moment a GM clicked a suggestion — and unmounted that suggestion before its own click could run, so the click did nothing and the pill showed the blur handler's value.
Tabbing to a suggestion fails identically, which is why suppressing the pointer path alone is half a fix.
- **What Enter commits is the top suggestion, not the typed string.**
A requirement names a catalogue ENTRY by id rather than carrying a free name, so a query matching nothing commits nothing rather than authoring an unresolvable id.
- **An empty catalogue DEGRADES the field rather than blocking it.**
The input still renders and is still typeable, and its own placeholder says there is nothing to name yet.
A world with no components and no essences is the state every world starts in, so it is a first-class face of this control rather than an error.

A TAG row is one line.
It reads as the sentence it writes — the policy word, the chosen tag chips each with their own remove, then `+ Tag` — with the any-of / all-of control that sets that word beside it, through the shared segmented-control primitive.
There is no second full-width line, no separate match-controls row and no bordered empty state: an unfilled tag row already says `Any of` with nothing after it.
The any-of / all-of control is in the TAG family, edged and lit in the same hue the row's own border, the tag chips and the `+ Tag` pill already carry — a neutral track would put the one control that is about tags in a different family from every value it applies to.
It is also the SHORTEST control in the row, and that is a requirement rather than a detail: it is the only thing a tag row carries that the other three kinds do not, so a taller one would be the row's tallest item and would raise every tag row above its siblings.
An unfilled tag row is therefore level with the component row beside it, and asks for less room than one.
The row is rendered at two widths — a recipe tab's full-width column and a Tool inspector's narrower one — and narrower still than either the whole row does not fit on one line.
What must hold there is that the tag ARM stays whole: the policy word, the chips and `+ Tag` on one line together, with a WHOLE trailing control moving down rather than the arm shredding into one chip per line.

#### Adding a requirement, and adding an alternative

Every adder creates a row carrying its KIND and no value; the row's own field names it.
No adder chooses a subject, so none can dedupe against a requirement the set already holds — a GM who names one component twice is told so by the Validation tab, which is where a check the adder cannot make belongs.

A requirement's alternatives (`IngredientGroup.options`, satisfied by ANY one of them) are added through a single **"or…" popover** per bare requirement, replacing the loose per-row and footer add-buttons.
It is a single flat **"Accept instead"** list of the four real ingredient match types — Component, Tag, Essence, and Currency, in that order — each appended to that requirement as a new OR alternative for the row's own field to fill in.
A requirement that already holds two or more alternatives renders that choice as four explicit dashed adders at the foot of its box instead, worded `alt component` / `alt tag` / `alt essence` / `alt currency`: inside a choice group every one of them appends an ALTERNATIVE, and `Add component` beside `Add cost` is two verbs for one act.
Essence is a first-class ingredient match type, so "component OR essence" is a genuine alternative; the old two-heading Accept-instead / Require-as-well split is retired.

The menu is a COMPACT PANEL OF KINDS rather than a picker of records, and its scale says so: a fixed 150px panel inset on its own frame, headed by an uppercase **"Accept instead"** eyebrow, over four entries that read from their own left edge.
The header is what lets each entry be one word.
The verb belongs to the panel, so an entry states only the kind it appends — `Component`, `Tag`, `Essence`, `Currency` — and never repeats "Add", "alternative" or a synonym for the row's own vocabulary.
The width is stated by the caller and not left to the shared picker's own floor, which is sized for lists of world components and actors and is wide enough that the panel overflowed the application window.

Each entry's glyph carries its KIND'S OWN TINT, and it is the same declaration that inks the row's plate and its named pill rather than a second table of colours.
One table per kind — glyph, tint and one-word name — is what keeps the menu, the row's kind select and the row's plate from naming the same four kinds three different ways; two of them had already drifted to different glyphs for a component and for a tag.

Both of the requirement row's in-row affordances — the `or…` trigger and a tag arm's `+ Tag` — are DASHED OUTLINES with no fill, because each is an affordance for adding standing among controls and chips that are values.
They are drawn at their own two scales: `or…` is a control among controls, level with the quantity stepper beside it, while `+ Tag` is a chip among chips.
Neither may be rendered through the shared chip primitive: that component declares its own border, ink and fill in a scoped block, which the runtime injects UNLAYERED while `styles/fabricate.css` is imported at `layer(modules)`, so a sheet rule naming any of those three properties for such a control is emitted, matches, and is discarded — leaving both affordances painted as the default filled neutral chip with nothing reporting it.

Currency and Essence appear only when the system can honour them, so the menu never offers a choice the system cannot satisfy.
Currency-cost affordances — the set-level "Add cost" button, the requirement-level "Add cost" button, and the "or…" popover's Currency choice — render only when the system's currency feature is **enabled** (`requirements.currency.enabled === true`) AND the world configures units, not merely when units exist.
Unit presence alone is not authorisation, and since issue 1278 it is emphatically not: the ladder is WORLD scope, so a world with a fully authored ladder still has systems that do not charge for anything, and the participation toggle is the only thing that says which do.
Essence appears when the system enables essences.
An essence alternative may repeat across groups, so it is gated on the system HAVING essences (not on system-minus-already-required).
A currency requirement persisted while currency was enabled remains **visible** when the feature is later disabled, but renders read-only (its unit and amount as static text, flagged inactive) rather than being silently hidden.
The per-option `tagMatch` (any / all) control is retained on every tag alternative, and renders through the shared segmented-control primitive rather than a hand-rolled toggle-button pair.
The set-level **"Add essence"** control is retained and appends a single-option essence GROUP (an AND-required requirement), the only way to author a fresh essence-only requirement.
The add-new essence OFFER — withholding a DISABLED essence, while keeping an already-authored one reachable — is applied where an essence is actually CHOSEN, which is the row's own field.
An adder that names nothing cannot leak a disabled essence, so the adders gate on the system HAVING essences and the field narrows the list.

Multi-set authoring is gated by **`Recipe.complex`** plus the mode's structural constraints (`simple` and `progressive` are one set to one group; alchemy forces a single set) — never by `resolutionMode` alone.

### Duration

Duration unit controls are steppers whose **primary control is a real, typeable number input**, with the −/+ buttons as adjuncts and a clamp at zero.
A click-only stepper is a keyboard regression.

### Step Structure UI

Step mode (Single / Multi-step) is authored from the context rail's segmented control, and is offered when the system enables multi-step recipes — or whenever the recipe already has steps, so a multi-step recipe can always be reverted.

If multistep is enabled:

- Step list with add/remove/reorder (drag and drop), on the Overview tab
- One-step editor per step

If multistep is disabled:

- Show implicit single-step editors at the recipe level

## Component Studio

The GM component surfaces: the component browser and the component editor.

### Requirements

1. The GM component browser groups and filters by `Component.category`.
   Tags are edited in the component editor and, for a multi-row selection, in the browser's bulk edit panel; they must not be rendered as row chips, and rows show a single-line description, mirroring the Recipe Studio.
2. The GM component editor is a single scrolling column with no right rail.
   Back sits beside Save in the header.
   Source actions (replace by drop, unlink, open item sheet, copy UUID) are reachable from the identity strip; the component's progressive difficulty is authored in the body.
3. Source actions commit immediately and are never staged into the editor draft.
   Replacing or unlinking a component's source item restamps durable component identity and saves; carrying source fields through the draft's update path would skip that restamping.
4. The component salvage panel derives its presentation from `salvageResolutionMode` plus salvage-check enablement, gated by `features.salvage` and `component.salvage.enabled`.
   The persisted `routed` token is displayed as "Routed by check".
5. The result-group editor remains reachable when salvage is disabled.
   Disabling salvage collapses the mode, DC, routing, and reorder chrome only.
   The per-component enable control is disabled, with a visible explanation, until at least one result group exists; since the add-group control lives in the result-group editor, collapsing that editor would make enabling unreachable.
   The disabled-state copy distinguishes "no result groups authored yet" from "authored but disabled".
6. The salvage check DC control offers the system's authored check tiers, a system-default option storing `null`, and a `Custom…` option exposing an arbitrary integer.
   A persisted override matching no tier selects `Custom…` and is displayed and round-tripped unchanged.
   A "Manage presets" link routes to the system's Checks screen.
7. The component browser's category group headers obey the shared GM-library group-header rule specified under Recipe Studio: the header pairs what the group renders with the category's total across the filtered rows (`25 of 282 components`) whenever the two differ, reports one number for a wholly-shown group, and localizes both singulars.
8. The component browser preserves the identical view-state across an editor round-trip specified under Recipe Studio, including its **essence** filter alongside category, page, sort, group-by-category, page size, and per-category collapse state; opening a component editor and returning restores exactly what the GM left.
   A genuine crafting-system switch resets category + essence + page + collapse, while keeping sort, group-by-category, and page size as cross-system preferences.
9. The GM component browser supports multi-select bulk editing.
   Each row carries a selection control at its TRAILING edge, after the essence chips and the Edit action, rendered through the shared selection-control primitive.
   A selection toolbar sits directly above the list carrying a tri-state control over the CURRENTLY RENDERED rows, a selected-count readout, a "Select all {N} results" action over ALL filtered rows, and a Clear action.
   The rendered-rows control and the results action are distinct operations and must not be conflated; a collapsed category's rows are not rendered and are never selected by the former.
   The selection is scoped to the selected crafting system, survives an editor round-trip exactly as the browser's other view-state does, is cleared by a crafting-system switch, and never retains an id that no longer resolves to a component.
10. While the selection is non-empty, the component browser's right inspector rail renders the bulk edit panel IN PLACE OF the single-component inspector, from the first selected row.
    The panel stages changes without writing: category (single-valued, overwriting, left unchanged until a row is chosen and un-staged by choosing it again or by the group's Clear), tags (tri-state rows over the system's tag vocabulary cycling leave -> add -> remove -> leave, with the staged run painted above them), essences (one quantity control per system essence, shown only when the system enables essences, with OVERWRITE semantics), and the component progressive DC (shown under the same condition as the single-component control and the row badge).
    **The panel's anatomy is the world Component catalogue's bulk panel's** (issue 1371, maintainer ruling M23): a `Bulk edit` head whose action reads `Clear`, a hero naming the system the staged changes are written to, a standing note saying what cannot be bulk-edited, and each of the category, tag and essence axes drawn as an INLINE staging inset — a search well over a fixed window of rows, each row stating how many of the SELECTED components already carry its value as `n/N`, and a pager — rather than as a select, a flat chip run or a card grid.
    The essence rows read as unchanged while the axis is UNSTAGED and read the number the write will set — zero included — once it is staged, because the write replaces the whole map and a row reading "unchanged" beside a staged neighbour would state a consequence the store does not perform.
    The inset offers no `Inherit from world` row and the panel no salvage axis, because the bulk write primitive carries neither verb.
    **AND A STAGED ESSENCE AXIS WRITES AN OVERRIDE, WHICH IS WHAT MAKES THE PANEL'S OWN SENTENCE TRUE** (issue 1371, revision 19).
    The panel says what a GM changes here is this system's own rules, and for one revision that was false of the essence axis on the commonest pair there is: the write landed on the in-system row, the apply counted it, and the read union then answered the world map over it, so nothing the GM had just staged resolved anywhere.
    Recording that in a spec did not make it a usable surface — the escape hatch was the rules editor's switch, one component at a time, over a card that is LOCKED while the section inherits, so the GM's first instinct showed the world's values and no trace of their write.
    Every system-scope writer of the map therefore flips the pair's `inherit.essences` to `false` FIRST and writes the values second, on the rules editor's own flag-before-values order (`data-models/spec.md` `### Component scope` requirement 2a).
    The flag write is per PAIR and not per batch, so a refused pair costs that pair its ESSENCE AXIS ALONE — every other axis it staged still lands on it, and the rest of the cohort lands whole — and a pair the world corpus holds no membership record for is written unchanged because nothing shadows it.
    Dropping a refused pair from the WHOLE edit was revision 19's reading, and it let a setting refusal that had nothing to say about categories take a cohort's category change with it; `data-models/spec.md` `### Component scope` requirement 2a states the rule this now follows, and the count of refused pairs is reported beside the updated count because neither answers the other's question.
    The tags note states that world tags are shown on each record and that the system's own list is what the rows change; it never asserts the unconsumed merge (`ui-world-scope/spec.md` `## GM World Component Screens` requirement 1).
    An axis whose staged value cannot be distinguished from its unstaged value — an all-zero essence map, a zero DC — carries a visible staged indicator that also unstages it, so a destructive edit is never indistinguishable from no edit.
    The panel states permanently that applying essences overwrites the values on every selected component, and additionally warns when the staged overwrite would in fact change or remove authored essence values on at least one selected component.
    One action applies every staged axis to every selected component; it names the number of components it will affect and is inert until at least one axis is staged — reading `Stage a change to apply to N components` while inert, `Apply <axes> to N components` for one or two staged axes, and `Edit N components` for more.
    Applying persists through a single set-apply write, then clears the selection and the staged changes, returning the rail to the single-component inspector.
    The set delete specified at requirement 11 is the panel's other exit and ends the same way, so the panel has exactly two terminal actions and both return the rail to the single-component inspector.
11. The component browser's bulk edit panel offers a set DELETE — the in-system remove, worded `Remove N components from {system}…` — rendered INSIDE the panel shell's pinned dock under the primary action with its consequence note beneath it (issue 1371, maintainer ruling M23; the reference's foot and the world Component catalogue's bulk panel both pin it there), on the danger treatment so it never reads as a second way of applying the staged edit.
    The set delete exists because the panel swap at requirement 10 otherwise removes the only delete affordance at exactly the moment the GM has selected the rows they want removed; unlink and copy-source-UUID stay inspector-only, because neither is destructive.
    The delete states its impact BEFORE it is armed and recomputes it when the selection changes: the control's label carries how many components will be removed, and the note states that their rules are dropped in this system only with their catalogue entries and every other system untouched, then how many recipes will be rewritten, and how many of those recipes will be left with no ingredient sets or no results and clamped to disabled.
    It refuses per record on the store's own resolution: a selection this system holds none of reads an uncounted `Remove from {system}…`, arms to `Cannot remove`, and writes nothing, with the note saying why.
    The strip behind those numbers retains a result group that ARRIVED empty and drops only one it emptied itself, so a non-terminal step's deliberately empty group and the reserved `role: 'failure'` group both survive a component delete and neither inflates the disabled count (issue 1907).
    The two recipe numbers are counts of DISTINCT recipes, so neither exceeds what the cascade will touch: a recipe naming two selected components is rewritten once, never counted once per component.
    The disabled number counts only recipes going from enabled to disabled, because it warns about craftability the GM is about to lose rather than restating what was already off, and it is worded as that transition rather than as the resulting state, so its exclusion of already-disabled recipes cannot read as an undercount.
    A recipe number of zero is omitted rather than stated as zero; the scope sentence always renders, because the note is what the armed confirmation is paired with and a control stating nothing has lost that pairing.
    The note is programmatically associated with the armed control rather than merely adjacent to it, and arming — which changes the control's label and accessible name while it holds focus — is announced; a refused or no-op write that leaves the panel mounted is announced through the same region after focus is returned to the control.
    Deletion is WARNED, not BLOCKED: no component is refused and no set member is skipped on account of the recipes referencing it, matching the essence rule under Essences Tab.
    The set delete uses the two-step armed confirmation rather than a modal dialog, paired with the impact statement above; the armed token is dropped whenever the selection changes at all, because an arm is a statement about a specific set.
    The set write persists through a single crafting-system write and a single recipes write regardless of set size, then clears the selection and returns the rail to the single-component inspector.
    Because that exit unmounts the panel, the completion message is the surviving on-screen feedback and reports what happened — components deleted, recipes rewritten, and, when non-zero, recipes disabled — while a write that deleted nothing reports no success and leaves the selection intact.
    The keyboard is returned to the studio's toolbar and that same sentence is then announced through the manager's live region, per Emptying a bulk selection above.
    The single-component delete states the same arithmetic in its confirmation, from the same computation, so the two forms cannot report different numbers for the same component, worded in the FUTURE and gated on its own count so the commonest single delete of all — referenced by no recipe — states neither nought.
12. The component editor carries a **Complications** authoring section (`data-models/spec.md` § Component requirements 19-25), authoring the component's `complications` list.
    Each complication authors its name, severity, audience, description, the activities it applies to, how its conditions combine, the condition set, and the two optional effects — a dice expression rolled to chat, and a script macro.
    Editing one marks the component draft dirty and survives Save and reload, on the component draft's OWN signature rather than on the salvage draft's, because `complications` is a top-level field and a component with salvage disabled must still be able to author one.
    The macro picker's options are the system's already-filtered script-macro list rather than a new projection, and a dropped macro that is not a script macro is REJECTED at the drop with a stated reason rather than stored to fail later.
    The section mints client-side complication ids through an INJECTED mint with a Foundry `randomID` fallback, and never through `Math.random()`.
13. **The Complications section has its own visibility gate: it renders only when the SYSTEM resolves at least one activity progressively.**
    A complication has no moment to fire in a system with no progressive resolution anywhere, and offering a GM a consequence that can never happen is worse than offering none.
    The gate is ONE predicate owned by the section, not a prop a host could forget to compute.
    Within the section an activity the system does not resolve progressively is still AUTHORABLE and is annotated as such: the complication is stored and will not fire, and saying so at authoring time is the point of the annotation.
    A check-trigger option is labelled by its OWNING activity, because a trigger id names a trigger in exactly one activity's id space (`data-models/spec.md` § Component requirement 24) and two identically-named triggers would otherwise be indistinguishable.
14. **The trigger sentence is one localization unit.**
    The one-line summary of when a complication fires and what it does — _"When the award is missed or 1d20 = 1 · rolls 2d6, runs Shrapnel Burst"_ — is generated by a SINGLE shared builder and rendered in three places: the authoring row, the Component Studio's read-only salvage strip, and the Recipe Studio's stage strip.
    Three call sites joining clauses by hand is three chances to disagree about the conjunction, the operator glyph and the no-trigger case.
    Every clause, the `and` / `or` conjunction, the effect tail and the never-fires sentence are their own localized strings, and the comparator glyph comes from the shared operator table rather than a restated map.
    The row clips the sentence rather than wrapping it, so it MUST carry the full sentence as a title, or a longer localized form is invisible past roughly sixty characters.
15. **The section states what a complication fires ON, and discloses what it does not cover.**
    Its copy says a complication fires when the component is PRODUCED as a stage of a progressive result — a progressive craft, salvage or gathering — and that it does NOT fire when the component is itself salvaged or spent.
    That second case is real and is deferred to issue 1287, so the copy discloses it rather than letting a GM author a complication for a moment this build never reaches.
    The copy says nothing about a player's ability to read world data: `visibility: 'gmOnly'` is a DISCLOSURE guarantee rather than a confidentiality one (`data-models/spec.md` § Component requirement 23), and the place to state that limit is the specification and the field documentation, not a line of editor chrome that would read as a warning about this component.
16. **Both GM read-only complication strips read the UNREDACTED authored list.**
    The Component Studio's progressive salvage rows and the Recipe Studio's progressive stage cards each render a read-only complication strip for the component the ROW REFERENCES — never the component being edited — fed by the same component projection the row's read-only difficulty badge reads.
    They MUST NOT be fed from the PLAYER forecast projection: that projection filters to `visibility: 'visible'` and the authored default is `gmOnly`, so a GM strip fed from it would list nothing for exactly the complications a GM authors by default.
    Each strip is filtered to the ACTIVITY its surface represents, because a complication enabled only for crafting says nothing about a salvage stage and listing it there would tell the GM a yield carries a consequence it does not.
    **Neither strip may relax the joined stage-row rule the two studios share**, because that join is deliberate and a change there re-shapes every progressive stage row in BOTH.
    The Component Studio's salvage strip is therefore a SIBLING of the row — a tucked, indented, left-ruled band that is simply the stage list's next child, marked as presentational so a screen reader does not count one more stage than the award loop spends down.
    The Recipe Studio's strip sits INSIDE the stage card, and does so through a wrapper that participates in layout ONLY when the strip has something to draw, plus an additive alignment rule scoped to rows that actually draw one.
    Both routes satisfy the same requirement: a stage row in a system that authors no complication renders exactly as it did before this feature.

## Step Editor

Per step controls:

- Step name and description
- Time requirement — the inline per-step duration editor renders only when the system's time requirements are enabled (`requirements.time.enabled`, default on); when disabled the step shows a read-only duration chip instead of the editor
- Currency requirement (when enabled)
- Ingredient set editor

Ingredient set editor supports:

- Add/remove ingredient sets
- Ingredient group editor per set:
  - Add/remove groups
  - Add/remove OR options within a group
  - Item placeholder options that match one or more configured system tags
- Essence options authored as OR alternatives within a group (when the system enables essences); the set-level add appends a single-option essence group

Required tools are **not** authored in the Ingredients tab.
_Catalyst_ is a retired concept — Tools replaced it, and Tool references are authored on the editor's **Tools** tab at recipe and step scope.
When the system uses `routedByIngredients`, each named ingredient set also receives a Tool card on that tab.
Persisted per-set `IngredientSet.toolIds` round-trip unchanged but remain inert and hidden for unnamed sets and every other resolution mode.

Result editor changes by mode.
The UI must expose required data fields from `resolution-modes/spec.md`, but mode logic itself is defined in `resolution-modes/spec.md`.

### Simple UI

- One ingredient set
- Ingredient-group editor within that set (including OR options)
- One result group editor

### Routed UI

The routing basis is the system **mode**, not a per-recipe provider: the recipe inspector carries NO result-selection provider selector (it was removed in the routed split — the basis is derived from `routedByIngredients` / `routedByCheck`).

- `routedByIngredients` UI:
  - Ingredient sets map to result groups via `resultGroupId`.
  - Validation enforces deterministic mapping for all satisfiable sets.
  - The crafting check is optional (no provider toggle, no check requirement surfaced here) and is authored via the shared simple pass/fail editor (`SimpleCraftingCheckEditor`, bound to `craftingCheck.simple`).
  - `routedByIngredients` recipes offer the per-recipe "Check tier" (DC-tier) dropdown sourced from `craftingCheck.simple.tiers` when the simple check uses static `dcMode`; they do NOT get the `minSuccessOutcomeId` minimum-success-tier control (which is `routedByCheck + fixed` only).
- `routedByCheck` UI:
  - Routes by the system crafting-check outcome (the system requires an authored `craftingCheck.routed.rollFormula`).
  - Result groups carry the routed-check outcome tier assignment (`checkOutcomeIds`); the outcome also routes by normalized match to `ResultGroup.name`.
    The `checkOutcomeIds` assignment picker offers **success tiers only** (`success === true`), matching the success-only routing rule (a failure tier never routes and awards nothing).
  - A step with exactly one result group needs no outcome/tier mapping (the single-group exemption): it is produced on any non-failure outcome.
- Validation and helper copy must reserve failure keywords, including compatibility aliases such as former miss/event terms, and forbid them as result-group names.

### Alchemy check-mode selector (issue 554)

- At the **top of the `checks-crafting` route's The roll section**, shown only when `resolutionMode === "alchemy"`: a native check-editor radio group (`manager-checks-type-options`) for `alchemy.checkMode`, rendered ABOVE the per-mode editor.
  It offers `simple` and `tiered` ONLY.
  `none` remains a persisted value — it is what the rail's Active switch writes when the GM turns the check off — but it is not a mode the selector offers, because the on/off decision belongs to the Active switch and the selector answers only what SHAPE the check is.
- Selecting a mode STAGES it on the studio's draft rather than persisting on click: it swaps the editor below immediately, marks Crafting dirty, and is applied by the shared `Save checks` (through `store.setAlchemyCheckMode`, which spreads the nested `alchemy` block so `learnOnCraft`/`consumeOnFail`/`showAttemptHistoryToPlayers` are preserved).
  Discarding the studio's drafts restores it.
  The staged mode and the check formula staged beside it are saved together, so turning the check on and authoring its formula in one visit persists both.
- The selector is NOT rendered on the Crafting Settings page; that page keeps only the Recipe resolution, Recipe visibility, and (when salvage is on) Salvage resolution cards.
- The three behaviour flags the selector preserves (`learnOnCraft`, `consumeOnFail`, `showAttemptHistoryToPlayers`) are themselves authored by the **Alchemy behaviour-flag controls**, which since issue 1096 live on a DIFFERENT SECTION of the same route (**On failure**) and are never on screen with the selector; see that requirement for the sanctioned authoring path.

### Alchemy behaviour-flag controls (issue 713)

- On the **On failure** section of the `checks-crafting` route (shown only when `resolutionMode === "alchemy"`, regardless of `checkMode`): three live-persisting toggle cards editing the system-level alchemy behaviour flags — `learnOnCraft` (default `false`), `consumeOnFail` (default `true`), and `showAttemptHistoryToPlayers` (default `true`).
- Each toggle reflects the stored value (including a stored non-default value) and persists through `store.saveAlchemyConfig`, which spreads the nested `alchemy` block so `checkMode` and the other two flags are preserved.
  Because `saveAlchemyConfig` rewrites all three flags from its argument, the caller sends the current projected values with only the toggled field overridden.
- The controls' semantics are defined by `resolution-modes/spec.md` (consume-on-fail) and `recipe-visibility/spec.md` (learn-on-craft, attempt history); this requirement covers only the authoring surface.
  The failure-consumption toggles of §Crafting Check Controls are the distinct, non-alchemy `craftingCheck.consumption` policy and are NOT shown in alchemy mode.

### Checks studio per-mode behaviour (issue 554)

Which of the five sections renders in each mode.
Crafting: `simple` and `routedByIngredients` render all five with Outcomes as the two-outcome statement; `routedByCheck` renders all five with the band strip and the tier rows; `progressive` renders all five with Outcomes as the `awardMode` selector; `alchemy` follows its `checkMode`, and `none` takes the shared switched-off panel.
Salvage follows the same three-mode pattern.
Gathering: `progressive` and `routed` render all five; `d100` renders Modifiers with the `noModifierSupport` inert notice, the check-modifier and character-modifier disambiguation copy and the dormancy notice, and renders the remaining inapplicable sections as `EmptyState`s naming the mode.

- alchemy + `simple` → the simple pass/fail editor rendered below the selector, with a LIVE Active switch: simple is OPTIONAL, and turning it off stages `checkMode: "none"`.
- alchemy + `tiered` → the routed editor below the selector, with the LOCKED always-on reading of the switch and the requiredHint (ungated by `checksEnabled`).
  Tiered cannot be disabled because it routes result groups by outcome tier and so cannot resolve without a roll.
- alchemy + `none` → the shared switched-off panel with its "Turn this check on" action, and a live Active switch reading off.
  Turning it back on stages `checkMode: "simple"`.
- The Crafting checks help copy describes simple/tiered and the off state.

### Alchemy Recipe UI (GM Editor)

- Removes the `resultSelection.provider` selector and the Complex/multi-set toggle (retired, issue 554).
  Ingredient-set vs result-group rendering is derived from `alchemy.checkMode`, not the single `complex` flag; the ingredient set is ALWAYS single.
  - **None** → single ingredient set + single result set.
  - **Simple** → a labeled "On success" result set + a reserved, static-labeled ("On a failed check", warning/danger accent), undeletable, empty-by-default failure result set (synthesized in the derived view, persisted on first edit; `Recipe.validate` tolerates its absence).
    No "add result set" beyond the two.
  - **Tiered** → result groups with routed outcome-tier assignment (reusing the `routedByCheck` UI; `routingProvider === "check"`).
- Shows alchemy-only signature collision diagnostics spanning all recipes in the system.
- Save remains blocked until all collisions are resolved.

### Progressive UI

- Ordered results editor
- Read-only difficulty badge per result item.
  The badge deep-links to the component editor's Difficulty card, and never edits in place: `component.difficulty` is a **Component** property consumed by progressive recipes, progressive salvage, progressive gathering and the system-validation blocker, so an inline editor here would write across an aggregate boundary (or make "Save recipe" silently persist a Component change).
  A component with no authored difficulty reads as unset, not as `0`.
- Drag reorder controls
- **Keyboard reorder controls** alongside them: per-row Move up / Move down buttons, disabled at the ends, whose accessible name names the result they move, with the new position announced through an `aria-live="polite"` region.
  Result order is load-bearing in progressive mode (the award loop spends the check budget down the list), so a drag-only reorder is an accessibility gap, not a convenience one.
- A **reorder-permission toggle card** at the END of the progressive block, after the result sets — never directly beneath the roll-budget info strip.
  The card is info-toned, defaults **on**, and writes `Recipe.allowPlayerResultReorder`.
  Placement is a requirement, not a preference: the strip and the card are both info-toned, so adjacency renders them as one undifferentiated block, and the resulting reading order (strip = how this list is spent, list = the thing, card = who may reorder it) states the policy after the thing it governs.
  The strip's copy is NOT folded into the card's sub-line, because the strip states an invariant true of every progressive recipe while the card states a conditional the GM can switch off.
- The **salvage editor** renders the same toggle card, gated on `salvageResolutionMode === 'progressive'`, writing `Component.salvage.allowPlayerResultReorder`.
- The progressive **salvage** result list shows **ordinals** and a **read-only difficulty badge** per row.
  These are required alongside the salvage toggle card and not severable from it: progressive salvage spends the roll down the list, so without them the card would govern an order the GM cannot see, and a card reading "players may reorder the stages" above a list of bare selects asserts a model the surface contradicts.
  The badge is read-only because the difficulty belongs to the **result** component, whose own editor owns its save lifecycle.
- A progressive result row — recipe or salvage — renders **no quantity control**, because `resolution-modes` normalizes every awarded progressive entry to a single item; the GM expresses "more of X" by listing X again and ordering the list.
  The `simple` and `routed` salvage rows KEEP their quantity, which those modes award as authored.
- A salvage result row picks its component through a **searchable popover whose trigger carries the component's image and its name**, not a native `<select>`.
  The image is required: a `<select>` can only present a text list, on a surface where every other component is shown with its art.
  The trigger is ONE control over both facts, and an art-less component falls back to a glyph rather than emitting an image element with no source.
  The popover is portaled to the manager host so it escapes the editor panel's `overflow: hidden`.
