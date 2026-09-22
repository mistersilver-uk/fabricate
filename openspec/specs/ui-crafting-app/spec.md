# UI Crafting App

## Crafting App (Player)

### Shared-store refresh routing

The unified window holds five shared read-model stores — `crafting`, `inventory`, `alchemy`, `journal` and `gathering` — and a crafting-data change refreshes them SELECTIVELY.

- Each store subscribes to the set of **invalidation domains** (`data-models/spec.md` § Invalidation Domains) it consumes, and refreshes only when a change names one of them.
  A subscription set is DERIVED from the one authored domain-to-consumer mapping; a surface MUST NOT restate it inline, because a second copy is exactly the drift the derivation exists to remove.
- The five stores' consumers are: `crafting`, `inventory` and `alchemy` consume all seven domains; `journal` consumes six and NOT `narrative`; `gathering` consumes five, excluding only `narrative` and `held-inventory`.
- `gathering`'s set is closed over the SYSTEM-VALIDITY GATE, and that is why it consumes two domains whose facts it renders nowhere.
  The gathering listing drops every environment of a system the validity gate reports blocked, for non-GM viewers only, and those blockers are produced from check configuration (`resolution-config`) and alchemy signature collisions (`materials-and-yield`).
  Omitting them leaves a GM authoring the missing formula while every player's tab keeps hiding the system — with a well-formed, correctly attributed change, so no fail-safe can catch it.
  `held-inventory` stays out because the gathering view owns an item subscription scoped to the selected actor, which is narrower.
- A change that names no domain refreshes every store.
- A change to an actor's held items belongs to the `held-inventory` domain and refreshes exactly that domain's consumers, filtered to actors this window reads from.
- The shell reloads the inventory listing through the store's bulk-run guard and MUST NOT call the store's direct load seam, on any of these paths.
- The selectable component-source ACTOR list is refreshed alongside the `crafting` store.
  It holds actors rather than a definition-derived read model, so it has no fact class of its own and is not a taxonomy store.

Which store a given change reaches is a claim about rendered behaviour, so it MUST be proved by MOUNTING the shell and driving one single-domain change per domain, with the expectation computed from the shipped domain-to-consumer mapping rather than restated as a second table.
A source-text guard cannot see it: the subscription sites sit within a few hundred characters of one another, so a windowed text match is satisfied by any of them.

### Actor and Sources

- A persistent app header appears above the tab content and replaces separate
  `Craft With` and `Using Components From` form controls.
- The left side of the header shows the currently selected crafting actor's
  image/avatar and name.
  The default and last-selection resolution order is the
  same as the crafting store selection behavior.
- Clicking the selected crafting actor image or name opens a searchable,
  scrollable dropdown of available crafting actors.
  Each row shows actor image
  and name.
- The right side of the header shows `Component Sources` and a row of selected
  component source actor images/avatars.
- Component source names are hidden by default and revealed on hover over each
  selected source avatar.
- Right-clicking a selected component source avatar removes that source.
- The selected crafting actor is always included as a component source and
  cannot be removed from component sources.
- Changing the selected crafting actor moves this required component source
  from the previous crafting actor to the newly selected crafting actor.
- An edit control beside the source avatars opens a searchable, scrollable
  dropdown of owned actors for selecting or deselecting component sources.
  Each
  row shows actor image and name.
- Persist last selections in client settings
- Actor/source selection is shared across both tabs (rendered above tab content)
- The Component Sources header is **owner-scoped** for a non-GM viewer: a non-GM
  can only craft from and into actors they own, because `CraftingEngine.craft`
  mutates Items directly with no GM relay.
- A GM sees all actors; a non-GM sees only owned actors in both the crafting-actor
  picker and the component-source picker.
- The selected crafting actor is force-included as a non-removable component
  source only when the viewer owns it; a non-owned acting actor forces nothing.
- Accessibility: each source avatar is a focusable button with an always-present
  `aria-label` (the actor name, with an "always included" suffix on the required
  actor); the name reveals on hover and focus; removal is available by a
  keyboard-reachable, visible control as well as right-click; the add/remove
  picker is an in-place popover.
- Persist the selected crafting actor in the `LAST_CRAFTING_ACTOR` client setting
  and the component-source ids in `fabricate.lastComponentSources`.

### Browse And Detail Phases

The player crafting read is TWO phases, because browsing and inspecting have different costs
and the browse half is the one that scales with the corpus.

- **The listing seam returns cheap summary rows.**
  `listCraftingForActor` answers `{ summaries, total, counts }`, where each summary is the
  canonical recipe summary (`data-models/spec.md` § Summary Projections) for the viewer's
  audience.
  Search, the favourite / craftable / system / category filters, the A–Z sort and pagination
  all run against those rows, so the page window is chosen before any expensive work.
- **Building the rows performs no exact craftability evaluation, at any corpus size.**
  A row's material verdict is the indexed availability projection over one per-pass inventory
  snapshot, and it is an UPPER BOUND: a positive answer means "looks makeable", never "you
  can make this".
  This MUST be asserted by an operation count rather than by review, and the count MUST be
  shown to be non-vacuous.
- **The detail seam hydrates ONE recipe.**
  `hydrateCraftingRecipe({ recipeId, actorId, componentSourceActorIds })` returns the exact
  rich model — per-set craftability, ingredient choices, the essence pool, checks, outcome
  tiers, duration, steps and progressive stages — or `null` when no such recipe exists or the
  viewer may not see it (`recipe-visibility/spec.md` § Per-Recipe Detail Hydration).
- **Only the selection is hydrated.**
  The player app hydrates the selected recipe, falling back to the first visible row when the
  player has selected nothing.
  A first page's exact-evaluation count is therefore bounded by the page size and MUST be
  independent of corpus size.
- **A hydrated model does not outlive its read pass.**
  It carries exact craftability derived from live actor inventory, so it MUST be discarded
  whenever the listing is refetched — which the app does on mount, on an actor change, after
  a craft, on a scene change, on a world-time tick and on a relevant inventory mutation.
- **Changing search, a filter or the page never re-hydrates an explicit selection.**
  Those are pure reads over the summary rows, and hydration is memoised per recipe for the
  life of the read pass, so a filter cannot re-hydrate a recipe already hydrated in it.
  The one exception is the no-selection fallback: with nothing explicitly selected the app
  shows the first visible row, and a filter that moves which row that is hydrates the new
  one — once, and only when the fallback row actually changes.
  That is bounded by the number of distinct rows a player's typing lands on, not by the
  corpus, and it is the cost of showing the top result rather than an empty inspector.
- **The row and the inspector may disagree about materials, and only in one direction.**
  The row's optimistic verdict can read "available" where exact evaluation refuses, because
  contended requirements are counted for every set that draws on them.
  It can never read unavailable for a recipe exact evaluation would allow.
  Exact validation immediately before consumption remains authoritative and is unchanged.

### Craft Execution

- The Crafting tab crafts through the existing `game.fabricate.craft` engine path
  (via the `craftRecipe` facade seam); the engine returns `{ success, cancelled?, results, message }`
  and does NOT throw, so a failed craft surfaces its message rather than an error.
  A dismissed interactive prompt returns `{ success: false, cancelled: true, results: null }`
  with zero mutation, and any phantom run created by that call is discarded — the same
  interactive/cancelled contract as salvage (see the path-agnostic §Interactive Roll Prompt).
- A non-GM crafts directly against owned actors; there is no GM relay for player
  crafting.
- Time-based countdowns are driven by world time only: a new `subscribeWorldTime`
  bridge refreshes calendar-aware durations and re-fetches the listing quietly when
  the GM advances the clock.

### Salvage Execution

The engine seam behind the player salvage surface (§Player Salvage Surface).
Stated as its own section, a sibling of §Craft Execution, because the outcome semantics are the engine's, not the presentation's.

- Salvage runs through the `salvageComponent` facade seam, which takes an **`actorId`** and never an actor uuid.
  The engine's `salvage` performs **no ownership check of its own** — it resolves the uuid and mutates that actor's Items directly — so the facade's actor resolution is the only ownership gate on this path.
  A uuid accepted from a UI would bypass it, and a stale or foreign one reaches the server and **throws** rather than returning a message.
- The seam **returns** rather than throwing for every ordinary failure (actor / system / component not found, feature disabled, salvage disabled, validation failure), so a failed salvage surfaces its message.
- **`cancelled` is distinct from `success: false`.**
  A dismissed roll prompt returns `{ success: false, cancelled: true, results: null }` with **guaranteed zero mutation** — no component consumed, no tool breakage — and discards a run created by that call.
  It is a user's choice, not a failure, and MUST NOT be reported as an error.
- There is a **third** outcome: a component with a time requirement returns `success` with **null results** and an explicit **`waiting: true`** flag.
  The run has STARTED and awarded nothing.
  Treating `success` as "done" would show a success state for a run that gave the player nothing, and the flag exists so no caller has to re-derive that from `results == null` — which is also what a no-result success looks like.
  The flag is additive and `success` is unchanged, and it is present only when a salvage run manager is available to arm the time gate: a runless salvage carrying a `timeRequirement` never returns `waiting`.
- A misconfigured required check (routed or progressive with no authored roll formula) returns `{ success: false, misconfigured: true }` with zero mutation and a GM-config message.
  Like a dismissed roll prompt, it **discards a run created by that call**, so a misconfigured abort never leaves a persisted `inProgress` salvage run; a reused pre-existing run is left untouched.
  The **salvage-configuration validation abort carries the same `misconfigured: true` discriminator**, and it is the branch that actually fires in a wired world: validation runs before the check does, so a GM-side config error (an unsupported salvage mode, a routed success tier routing nowhere, a `simple` mode with two success groups) never reaches the check's own misconfigured return.
  Without the flag there, a caller reads a broken config as a rolled failure and tells the player "nothing recovered" about a config only their GM can fix.
- The UI passes `interactive: true`; the default `false` keeps macros and automation silent (see the path-agnostic §Interactive Roll Prompt for the shared contract).

### Bulk Salvage Execution

One player gesture, N salvage attempts, one aggregated card.
The engine seam behind the Inventory tab's bulk panel, stated beside §Salvage Execution for the same reason that section is stated at all: the outcome semantics are the engine's, not the presentation's.

- Bulk salvage runs through the `salvageComponents` facade seam, which takes an **`actorId` per target** and never an actor uuid at any nesting level.
  The facade derives the uuid the service receives.
  `BulkSalvageService` performs no ownership check and `CraftingEngine.salvage` performs none either, so the facade's per-target actor resolution is the **only** ownership gate on this path.
  There is deliberately **no persisted-selection fallback**: a bulk run may span actors, so falling back to the last-selected actor would silently retarget a row whose own actor did not resolve, salvaging the wrong character's items with no error anywhere.
  A row naming no resolvable actor is refused as `notPermitted`, never redirected, and one refused row costs the player none of the others.
- Execution is **strictly sequential**, never concurrent.
  Tool breakage at item _k_ must be visible at item _k+1_; stack depletion is shared between rows resolving to the same owned documents; and each salvage run record is a read-modify-write actor `setFlag` with no compare-and-set anywhere in the run store.
  Safety against double-consumption comes from that sequencing plus each `salvage()` call's own availability check, which re-derives the owned documents at call time — **not** from the caller handing over a disjoint document set.
  A duplicate target is therefore reported rather than silently executed twice.
- The outcome vocabulary is `succeeded | failed | waiting | misconfigured | skipped | notPermitted | cancelled | error`, where `notPermitted` is the facade's own outcome and the rest are the service's.
  One item's failure never aborts the run: a thrown call becomes an `error` row and the run continues.
- Targets are classified **before** the engine is called, with a first-match `skipReason` of `bulkLimit`, `unknownSystem`, `featureDisabled`, `unknownComponent`, `salvageDisabled`, `duplicate`.
  That pre-flight is advisory only and the engine stays authoritative, so a target that passes it can still fail for a reason only the engine can see (not enough units, an unavailable tool, a time gate).
- The roll prompt is opened **once** for the whole run, and only when at least one runnable target has a usable check.
  A dismissed prompt returns `{ cancelled: true, items: [] }` **before the first `salvage()` call**, so zero mutation on cancel is structural rather than a rollback.
- A selection is bounded at **25 targets**, enforced at **selection** time so bulk salvage and bulk destroy inherit one bound.
  A cap applied to the salvage service alone would let a 40-row selection salvage 25 and destroy all 40, which puts the unbounded behaviour on the destructive path.
  The service keeps its own `bulkLimit` refusal as a defensive backstop that the selection bound makes unreachable through the UI.
- A run may push older entries out of the 50-entry salvage history; the history is a convenience log, not an audit record.
- **Component complications are collected onto the aggregate card and relayed in BATCH, never per row.**
  Each row is its own resolution and fires its own complications, but the run posts one aggregate card and **zero** per-row complication messages, while still running every row's macro.
  The batch is keyed on the addressed `(craftingSystemId, actorUuid)` pair, which is the relay's unit because both are GM-side authorization inputs (`recipes-and-steps/spec.md` § Complication Macros).
  An ordinary run addresses one pair and relays **one** message; a run that spans actors or systems relays one per distinct pair, bounded above by the 25-target selection cap stated above.
  A per-row relay is what is forbidden: it would silently lose the tail of a long run to the GM-side rate limit, on a path the player never sees.
  Batching also fixes the relay ordering and reduces the de-duplication to one key per pair rather than one per row.
  The collection rides the BULK CARD model rather than a run record, because a bulk salvage is not one run: each row has its own.
- The aggregate card's complication block is a **flat fired-complications section on the posted chat card**, rendered by the one renderer all four card builders share and carrying every row's FIRED complications in run order, each attributed by component name because a bulk card lists many components.
  It is **not** a forecast and has no hidden state: the card is written after the run has committed, from the already-redacted player-visible set (`publicComplications`), so a `gmOnly` complication cannot reach it even when a GM is the acting user.
  The entries are deliberately **not** de-duplicated across rows: each row is its own resolution, and collapsing two rows that fired the same complication would under-report what happened.
  The pre-run **forecast** group card is a different surface on a different screen — see § Player Salvage Surface, _Bulk complication forecast_ — and the two must not be conflated: the forecast is drawn before the commit and hidden by it, while this section is written after the run has committed, so a chat card could not be "hidden after the run commits" in any case.
- A bulk row acts on the **selected** participation when its card is the inspected one, and on the primary otherwise — the same acting-participation rule §Player Salvage Surface states for a single salvage.
- The listing is **not** reloaded from document hooks while a run is in flight.
  Each item's own item CRUD would otherwise reload the listing under the open panel roughly once per item, since the change subscription's trailing debounce coalesces nothing across items that each take a roll, a message create and up to three flag writes.
  Suppression is a **drop**, not a defer, and is implemented by reading the flag at fire time inside the handler — never by unsubscribing and re-subscribing, since the subscription is registered once for the app's lifetime.
  That makes the terminal reload load-bearing, so clearing the flag, running **one** terminal full reload and removing the progress notification are a **single exit-path obligation** discharged on every path including a throw; a flag left set would make the inventory permanently deaf for that session with no error.

_Stated residual:_ three config-shaped engine branches — `CraftingSystem.features.salvage` off, `Component.salvage.enabled` off, and an unknown system — return a bare `success: false` and therefore classify as `failed` rather than `skipped`.
The service's pre-flight classifies exactly these three as `skipped` before the engine is reached, and the blocked-reason vocabulary puts `salvageDisabled` ahead of the misconfigured reasons, so in the designed flow those branches are unreachable and the player correctly reads "Skipped".
They are reachable only when a GM toggles the feature between the listing snapshot and the call, which yields the wrong word for a correct non-outcome, with zero mutation, self-correcting on the reload the run already performs.
Stretching `misconfigured` to cover them would put "tell your GM" on a deliberate GM decision.

### Bulk Destroy

Permanently deleting the selected components, as a peer of bulk salvage rather than an outcome of it.

- Bulk destroy runs through the `destroyComponents` facade seam under the same gate as §Bulk Salvage Execution — an `actorId` per target, never a uuid, no persisted-selection fallback, and an unresolvable actor refused as `notPermitted` rather than retargeted.
- It deletes **whole stacks** on the **target actor** only.
  That is what destroying a thing means; the gesture carries no quantity control; and salvage's one-unit-at-a-time rule comes from the GM-authored `salvage.ingredientQuantity`, for which destroy has no analogue and which destroy never reads.
  A listing row's sources may span actors while the document matcher takes one actor, so the count the panel shows and the count the confirmation names are the **target actor's** units (see `data-models` requirement 17).
- It is **not** gated on `CraftingSystem.features.salvage` or a component's `salvage.enabled`, and it posts **no chat card**.
  A player can already delete their own owned Items from the Foundry sheet, so this adds ergonomics rather than capability, and a blocked-for-salvage row is often exactly the row a player wants gone; a result card reports what an activity produced, and this produces nothing.
- It reports the units **actually deleted**, derived from the documents the delete returned rather than from the ids requested.
  A `preDeleteItem` hook returning false drops individual ids silently while the rest of the batch deletes, so a vetoed row is **reported to the player rather than counted as destroyed**.
  A stale id — one whose document went away between the panel snapshot and the confirm — is a distinct story from a veto and is reported as such: it was never submitted, so no hook refused it.
- The confirmation names **both** the row count and the unit count, so the whole-stack rule is legible before the fact.
  The target set is resolved **once, before the dialog opens**, and the facade executes against that snapshot without re-prompting; the listing reloads on world-time, scene and source changes, any of which can fire while the modal stands.
- An active run referencing destroyed documents is **not** cleaned up — run maintenance prunes deleted _content_, not deleted _documents_ — so such a run fails when it resumes.

### Interactive Roll Prompt (path-agnostic)

A check-bearing execution accepts a per-call `interactive` flag (default `false`, keeping macros/API silent).
When `true`, the shared system-agnostic dialog (`src/ui/svelte/apps/crafting/rollPrompt.js`, `promptCheckRoll`/`buildInteractiveRollOptions`) prompts the player to roll; a dismissed prompt yields `{ success: false, cancelled: true, results: null }` with guaranteed zero mutation, distinct from `success: false`.
This is the PR #497 per-call-flag decision, consumed uniformly by the crafting store, salvage (inventory) store, alchemy store, gathering view, and the Journal Trigger Next Step path; `CraftingEngine.craft` discards any phantom run created by a cancelled interactive call.

- **The companion path opens the SAME dialog, on the EXECUTING GM's client.**
A Standalone Check Roll published to a companion (`companion-api/spec.md`) opens this dialog and no other — never the subject player's client, and never a relayed one.
Its chat flavor and its dialog titles are built from the caller's own `label`, defaulted to a **localized activity noun** so that no flavor can render `undefined` and none can render a doubled "check check".
Its bulk prompt's item count is the caller's **whole batch**, not the usable subset, so a batch in which some formulas cannot roll still reads as the number of things the player queued.
A dismissal is reported to the caller as `cancelled` with **zero mutation**, which is the property that capability exists to preserve.
- **Crafting-only "Check modifier" group.**
When — and only when — the caller supplies `rollOptions.modifierChoice`, the dialog renders one extra control between the formula block and the situational-bonus input: a fieldset legended "Check modifier" holding one input per eligible modifier, each showing that modifier's icon, its label, and a signed value chip (`+3` / `0` / `-2`).
The **input type follows the descriptor's `maxPicks`**, which is clamped into `[1, options.length]`: at 1 it is the pick-one **radio** group it has always been, and above 1 it is a **checkbox** group whose legend states the bound in words ("Pick up to 3").
The two are not interchangeable — a radio group that permitted several picks and a checkbox group that permitted one would each lie about the control — so the type is chosen from the bound rather than fixed.
The best legal selection is pre-checked, and the confirmed choice returns the checked ids as `chosenModifierIds` (falling back to the descriptor's `defaultSelectedIds` when the field is absent, as on the headless no-`DialogV2` path; a legacy single `chosenModifierId` is still honoured).
Above 1, the dialog disables the unchecked inputs once `maxPicks` are ticked and releases them again when one is cleared.
That is a UI affordance only: `evaluateCheckRoll` re-imposes the same cap on the returned selection, since a UI control's constraint is never the invariant.
A descriptor carrying no usable `maxPicks` renders — and is reduced as — a single pick, so a descriptor built before the field existed cannot silently widen.
This group is only the presentation of the crafting-check `playerPicks` combination rule: which modifiers are eligible, when the group is offered at all, the pre-selection and its tie-break, and how the picks SUM into the appended modifier term are normative in `resolution-modes/spec.md` §Check Source, not here.
**CRAFTING and SALVAGE supply a `modifierChoice`** under `playerPicks` (issue 1095), and their dialogs render the modifier fieldset on the same terms; the pre-1095 claim that salvage never passes one retired with the crafting-only catalogue.
**GATHERING supplies none**: it threads the modifier context and resolves a `playerPicks` selection deterministically, and its roll-time prompt is deferred to issue 683 with the rest of the seam (`resolution-modes/spec.md` §Check Source is normative).
A roll under any other combination rule passes none — including `bySubject`, whose selection was already made at authoring time — so no `modifierChoice`, no fieldset.
The dialog's formula line ends in a trailing `+ (modifier)[Modifiers]` slot while the choice is unanswered.
- **Pre-resolved roll decisions.**
A caller MAY supply a `rollDecision` (`{ bonus, rollMode, advantage }` — the prompt's own return shape minus `confirmed`).
The evaluator then treats it as an already-answered choice and **never opens the modal**, running the identical downstream code: the check-modifier append, the advantage transform, the situational-bonus append, the formula-validity net and the effective roll mode.
With no decision supplied every existing path builds a byte-identical options bag, so single-item salvage, crafting, alchemy and gathering are unchanged.
A decision carries **no `confirmed` key** and MUST NOT be read as a cancellation; only an explicit `confirmed === false` is one.
A decision supplied without a prompt function must still apply, or the base formula rolls and the player's answer is silently discarded.
Only the salvage runners attach a decision today — one gate (`CraftingEngine._salvageRollOptions`) serving all three salvage check paths, so a fourth salvage runner cannot ship without it — because putting the attachment in the shared prompt module would advertise pre-resolved-roll support the crafting and gathering paths do not wire.
- **The bulk prompt.**
A bulk run answers **one** prompt whose answer applies to every roll in the batch, and the dialog's own note says so.
It shows **no formula and no DC** — a batch has no single subject — and instead shows a subject strip of thumbnails with an overflow count, the situational-bonus input and the roll-mode picker.
Advantage is offered only when **every** usable-check subject's **authored** formula carries a plain `1d20`, computed from the crafting system rather than from the listing projection, which carries no formula at all.
It is all-or-nothing across those subjects: offering advantage only some rolls could honour would be a lie about the rest of the batch.
The prompt is not shown at all when no selected item has a usable check, and dismissal returns the same not-confirmed shape the single-item prompt returns.

### Result Chat Cards

- Crafting and salvage share one card format (built by `buildResultCard`): the subject, recovered/produced results, consumed/forfeited items, broken tools, and failure reason.
- The card appends the **rolled check total** as its own row, mirroring the salvage summary's "with a roll of N" rule: rendered only for a finite value and omitted for a no-check guaranteed craft/salvage (`rollValue` null).
  The total is the RAW roll (`checkResult.data.total`), not the progressive awarding value, so a forced crit shows the natural roll rather than the `MAX_SAFE_INTEGER`/`0` award sentinel.
- **A ROLLED result amount states its roll beside the produced line** on the crafting and salvage card, in the same `{formula} = {total}` shape and the same treatment the card's rolled-check-total row uses, so the run that says what was produced also says what produced it.
  An EMPTY AWARD — a total of zero or less, which creates no item — is stated as its own row naming what produced nothing, never omitted, because a player who watched the dice fall is owed the outcome.
  The card reads the roll the award recorded and never re-rolls it.
  The evaluated rolls are carried in the message's `rolls`, which is what sounds the dice and animates Dice So Nice; the custom card content survives that, and neither card is ever whispered, so carrying them hides it from nobody.
  The gathering card states no roll — it has its own builder and its own row shape — and the run journal is where a gathered amount's roll is read.
- The card is posted only on resolved success or rolled failure — never on cancelled, misconfigured, or time-gated outcomes.
- Posting is gated by `features.chatOutput` (default on); `ChatMessage.create` failures are non-fatal (logged only), so a chat error never aborts the craft/salvage.
- Gathering posts its own result card under the same `features.chatOutput` toggle.
- **A bulk salvage run posts ONE aggregate card**, and the per-item cards are suppressed.
  Suppression is a `salvage()` option gating **both** poster call sites — the rolled-failure path and the success path — because a missed thread would post the aggregate card plus one stray per-item card for every failed row.
  The card carries N subjects, each with its own roll value, tier step, outcome and message, plus recovered / consumed / broken-tool lists aggregated by name, and it reuses the shared card markup atoms rather than a second copy of them.
  A subject appears iff **its own** system's `features.chatOutput` is true, and nothing is posted at all when no subject qualifies — not an empty card.
  Per-roll dice posts are deliberately **not** suppressed, since they are the Dice So Nice trigger, so N items produce N dice messages plus one aggregate card.
  A subject's roll total, tier step and broken-tool evidence reach the card only through the salvage **run record**, so a runless call correctly contributes no tool section and no tier step; the raw roll total is preferred over the top-level value for the same reason the single card prefers it, and because the top-level value is threaded only on the success return.
- **Message visibility is applied to the message data BEFORE creation.**
  A message's legacy roll-mode CREATE OPTION is honoured only for a message carrying rolls, and the aggregate card carries none — so passing the option to `create` maps nothing and posts a blind run's whole result table publicly.
  **One capability probe selects the applier AND the token vocabulary together**, because the two Foundry generations have disjoint vocabularies and crossing them fails in both directions: a legacy token handed to the newer applier throws, and a newer token handed to the older applier silently posts public.
  The translation reuses core's own legacy map so the card cannot drift from the dice messages beside it, and a token with **no** entry in that map is passed through **unchanged** rather than defaulted — defaulting to public would silently downgrade a client default outside the legacy vocabulary, which is the exact leak this edge exists to close.
  The **speaker is set before** visibility is applied, because the in-character branch reads it unguarded.
  It is the single target's actor for a one-actor run and an explicit alias naming the acting user for a multi-actor run, never inferred — an inferred speaker falls through to the controlled tokens on the canvas, so a GM with an unrelated NPC selected would have the card attributed to that NPC.
  A blind run's card is whispered **and** blind, so its own author sees hidden content; that is correct, the in-panel report is their feedback channel, and the blind flag must not be dropped to "fix" it.
  The card is created with **`author`**, not the legacy `user` key the single-salvage poster still passes.

#### The GM-only complication card

Posted to the elected GM alone when a resolution's fired complications reach them over the
complication relay (`recipes-and-steps/spec.md` § Complication Macros).
It is built by `buildGmComplicationCardContent`, not by the shared complications renderer the
four player-facing cards draw: that renderer's row is three player-safe strings on one line,
and this one additionally says why the complication fired, marks the acting client's
unverifiable claim as a claim while doing so, reports the GM-side effect roll, and reports a
macro that was skipped or threw — none of which may ever reach a player surface.

- **A row is a VERTICAL STACK of labelled sections, never a run of columns.**
  In source order: a head line carrying the complication's name with its severity eyebrow at
  the right; a muted context line naming the component that carried it and, for a `visible`
  complication, that the player saw it too; the GM's authored description; then **Why it
  fired**; then **What happens**; then **Needs your attention**.
  A section with nothing to say is OMITTED rather than drawn empty — an empty "What happens"
  heading reads as a consequence that failed to render, and a complication that only narrates
  legitimately has none.
  The stack is what the row is FOR: its content is several independent statements about one
  complication, and the previous single-line treatment hung them off the `<li>` as flex
  siblings, which rendered a five-letter severity down three lines inside a 140px grid track.
- **Every rule the GM row adds is reached through the card's `--gm` block modifier**, which no
  player-facing card emits, so the player complication row and its two shipped rules cannot
  move.
  The structural half is asserted in `tests/component-complications-fire.test.js` and the
  RENDERED half — that the runs stack, that each heading sits above its own facts, and that
  the severity stays on one line flush right at chat width — in the engine-backed gate in
  `tests/crafting-chat-card.test.js`, against a negative control with the modifier stripped.
- **"Why it fired" is re-derived on the GM client, never relayed.**
  The clause set, the `match` mode and the roll-condition toggle come from the GM's own copy of
  the `craftingSystems` world setting, exactly like every other disclosure decision this card
  takes; the acting client contributes only the claimed bucket, which is asked no more than
  which of the GM's own stage clauses it satisfies.
  Relaying the acting client's `matchedConditions` is refused: it would be a fourth
  client-supplied claim on a payload specified as addressing-only, which
  `resolution-modes/spec.md` § Progressive Awarding turns down by name.
- **The reason is SOUND, not complete, and never guessed.**
  Every reason named genuinely contributed to that firing.
  A clause that may also have contributed but cannot be confirmed from the GM side is omitted
  rather than asserted, and a firing whose deciding clause cannot be named at all says so in
  one sentence rather than offering the most likely candidate.
  Three cases reach that admission and all are real: a `checkTrigger` this side cannot
  evaluate, a `rollCondition` whose dice this side never saw, and a claimed bucket no enabled
  stage clause reads.
- **A claimed outcome is worded as a REPORT; an authored condition is stated flat.**
  The stage bucket is the acting client's unverifiable claim, so each of its four sentences
  attributes it — "their game reports the roll falling short here" — rather than asserting it.
  The attribution lives in the sentence's own grammar rather than behind a separate label,
  because a "Reported by the acting client" prefix is a phrase a GM has to translate and
  discharges the same obligation less readably.
  A condition the GM authored is re-read from their own record and is therefore stated flat.
- **The consequence roll leads with its TOTAL, under the name the GM gave it.**
  `Acid damage: 10 (2d6)`, from `effectRoll.label` with the field's own name as the fallback.
  It is a consequence with no target and nothing to miss, so a `formula = total` form read as
  though it were the check the complication fired on.
  A `gmOnly` complication's roll happens on the GM client and states the formula it rolled; a
  `visible` one's happened on the acting client and reaches this card as a claimed number, so
  it states its provenance where the formula would otherwise sit.
- **The card carries NO stage position and no "needed N, rolled M" line**, though both would
  read well.
  `resolution-modes/spec.md` § Progressive Awarding rules the position off this surface: its
  referent is the acting client's ordered list, which this card does not draw and the GM has no
  view of.
  The threshold and the check total fail the same test and one more — neither is re-derivable
  GM-side, because a progressive threshold is a function of the ordered list, that order is the
  PLAYER's per-user preference and is never exported, and a threshold computed from the GM's
  authored order would be wrong exactly when the player reordered.
  Carrying them would make them the fourth and fifth client-supplied claims on an
  addressing-only payload.
  "Why it fired" therefore states the outcome in words rather than in numbers.

### Deferred (this iteration)

- No learn affordance renders on the Crafting tab; recipe learning is wired only through the Inventory surface (see `ui-system-studio/spec.md` §Books & Scrolls Surface and the Inventory learn path, `game.fabricate.learnRecipeFromInventory`).
- The Alchemy tab and the Journal cross-link remain out of scope for the player
  Crafting tab.

### Top-Level Tabs

The player app is a single shared window with a full-height left navigation rail.

- The player app carries five **Core** tabs, in this order: Crafting (always present), Alchemy (conditional — shown when at least one crafting system uses the alchemy resolution mode, `resolutionMode === "alchemy"`), Gathering, Journal, Inventory.
- Alchemy is the only conditional Core entry.
- Any tabs contributed by registered **player navigation providers** are appended after the Core tabs, grouped by surface in registration order and within a surface in the provider's own array order (see `ui-extension-points/spec.md` §Player Navigation Extension).
- A provider tab is rendered through the same rail control as a Core tab and is addressed by a namespaced route key, so a provider tab id can never collide with a Core tab id and Core never enumerates the ids it accepts.

- The one-tab rule governs the **Crafting / Alchemy pair only**, not the rail as a whole: if only one of those two tab types exists, show that one without a tab bar for the pair.
- If both exist, show the tab bar and default to last-used or Crafting.

### Crafting Tab

#### Player Crafting Projection

- The Crafting tab reads a redaction-safe `RecipeListingModel` listing built by
  the `CraftingListingBuilder` (the crafting analogue of the gathering listing
  builder).
- The builder is a one-directional, read-only collaborator over the existing
  crafting backend (`RecipeManager`, `RecipeVisibilityService`,
  `ResolutionModeService`, `CraftingSystemManager`); it never mutates state and
  never imports Foundry globals.
- GM and player viewers resolve through the one code path, so a GM bypass is
  honoured everywhere the visibility service honours it.
- Only recipes the visibility service marks `access.visible === true` are
  projected; everything else is filtered out upstream.
- Each `RecipeListingModel` carries `modeToken` plus a localized `modeLabel`
  (resolved through the resolution-mode label keys — the raw `simple` token is
  never surfaced to the UI), `browseStatus`, per-set `ingredientSets[].craftability`,
  an optional `check` descriptor, `outcomeTiers`, a presentation-only `duration`,
  and `result`.
  `result` reflects the recipe's PRODUCT STEP (see the Multi-Step Recipe Presentation
  section below), and a `simple` multi-step model additionally carries a `steps[]`
  per-step requirement projection (empty for single-step recipes and outside `simple`
  mode).
  Each model also carries `stepCount`, the number of steps `Recipe.getExecutionSteps()`
  resolves, which is the field a detail body branches on to tell a multi-step recipe from
  a single-step one outside `simple` mode, where `steps[]` is empty either way (issue
  1907).
  `stepCount` counts AUTHORED structure and is independent of `features.multiStepRecipes`,
  so a collapsed feature-off chain still reports its real count — unlike the Journal run
  model's `multiStep`, which follows the enabled feature (`data-models` CraftingRun
  requirements).
  A Discovery-Mode teaser reports `stepCount: 0`, redacted exactly as `steps: []` is, so a
  redacted recipe never leaks how many steps it runs.
  `duration` is separate from the terminal `result` projection and never changes
  persisted recipe or run data.
- The `check` descriptor's `dc` is resolved per-recipe, not per-system: the
  recipe's selected difficulty tier (`recipe.checkTierId` → the matching
  `craftingCheck.*` slot's `tiers[].dc`) wins, falling back to the slot's static
  `dc`; both the tier DC and a finite static DC are truncated to an integer.
  For the tier and integer-static cases this matches
  `CraftingEngine._resolveSimpleCheckDc` (the rolled DC) and the GM manager's
  `_buildRecipeCheckSummary`, so the player card, the roll prompt, and the GM
  recipe row report one number.
- A slot with a `rollFormula` but no finite static `dc` reports `dc: null` (no DC
  chip) rather than the `15` the engine and GM row fall back to.
  This is a deliberate display-only divergence: the listing must not surface a DC
  chip where none is authored.
- A routed **fixed** check (routedByCheck fixed / alchemy tiered fixed) has no
  meaningful DC and reports `dc: null` (it matches by value range; per-recipe
  difficulty there is `minSuccessOutcomeId`, not a DC tier).
- A **dynamic** (macro-resolved) DC reports `dc: null` at browse time: it is
  resolved at craft time and the read-only listing builder never executes the
  macro.
  The DC chip is suppressed rather than showing a static number the macro would
  override.
- Each `RecipeListingModel` also carries `category` (the normalized category token;
  `general` for the reserved/default bucket) and a `categoryLabel` display string.
- The label rule is exact: the reserved `general` token is localized to
  `FABRICATE.Common.General` and is never shown as a bare token, while a custom
  category token is surfaced verbatim as its own label (GM free-text; no prettify
  or title-casing).
- `category`/`categoryLabel` ride on the shared `base` projection, so they are
  present on Discovery-Mode teaser models too (category is GM-authored grouping
  metadata, not a redacted spoiler field).
- The listing exposes `counts.available` / `counts.total` for header summaries.

##### Multi-Step Recipe Presentation

- The player recipe listing projects a recipe's ingredient sets, per-set craftability, and Craft-button craftability from the recipe's **first execution step** (`Recipe.getExecutionSteps()[0]`), not the raw top-level `ingredientSets`.
  Because an explicit multi-step recipe holds its sets on `steps[]` and leaves the top-level arrays empty, a stepped recipe therefore surfaces its first step's required materials and evaluates craftability against them (over the **union** of recipe-level and step-level tool ids), rather than degrading to an empty `missingMaterials` banner.
  A single-step recipe is unaffected: its implicit step shares the top-level arrays.
- When a recipe resolves to more than one execution step in `simple` mode, the `RecipeListingModel` carries a `steps[]` array.
  Each entry surfaces the step's label (author name or 1-based position, never its id), its required materials with per-step craftability (Have / Need / Missing), and the components that step produces.
  Each entry also carries its effective authored `duration` when the step is timed.
  The `simple`-mode detail body renders these as an ordered list of per-step requirement blocks — a static preview of the whole recipe, not a live run-progress tracker.
  Each block renders inputs only; intermediate step yields are not shown.
  A single-step recipe, and any recipe outside `simple` mode, carries `steps: []` and renders no per-step block list; what its PRODUCES row resolves against is governed by the product-step rule below rather than by this projection (issue 1907).
  A Discovery-Mode teaser surfaces no step data (`steps: []`), redacted exactly as `result` and `outcomeTiers` are.
- Only the **active** execution step's requirement block is interactive; every other step stays a read-only preview, consistent with the static-preview contract above.
  The active step is derived the way the engine derives it — the recipe's active run's `currentStepIndex` (`0` when there is no active run) indexed into `Recipe.getExecutionSteps()` — and is baked onto the projected model as `activeStepId` / `activeStepIndex`, so the rendered rail and the executing engine resolve the same step from the same reads.
  Without this, a player whose run is parked at a later step edits a step-0 rail that drives a later step's craft: group ids are randomly generated and so survive a step mismatch by luck, but item references are not step-scoped and would actively steer the wrong step's consumption.
  A projection that renders no step list at all (a single-step recipe, or any non-`simple` mode) is covered by the same rule, because its displayed step is read-only whenever it is not the active step.
- The step block that renders the recomputed craftability the detail is handed is the **displayed** step (`displayedStepId`, the step the model's top-level `ingredientSets` were projected from), never the active step: the two differ while a run is parked past the first step, and every block other than the displayed one renders its own step's baked craftability, so each block always states its own requirements, consumption plan and tools.
- A step's requirement block is also read-only while its **time gate is armed** — an in-progress timed step whose availability time has not been reached.
  That step's consumption is already committed, so offering a selection would misrepresent what the craft will spend.
- The projection is presentation-only and is never the enforcement point: the engine remains authoritative and drops any player allocation whose step does not match the step it actually resolved, because the displayed index can move between render and click (a time gate maturing on a world-time tick, or another owner advancing the run).
- A fully revealed timed implicit recipe projects its positive authored
  `timeRequirement` as `RecipeListingModel.duration`.
  For a fully revealed `simple` recipe with more than one execution step, each
  `steps[]` entry projects that step's positive authored requirement as `duration`,
  and `RecipeListingModel.duration` is the field-wise sum of the five authored
  fields (`minutes`, `hours`, `days`, `months`, and `years`).
  The projection preserves authored units and does not perform calendar-dependent
  conversion.
  Missing, non-positive, and instant durations project as `null`.
- When `requirements.time.enabled === false`, recipe and step durations project as
  `null`, because crafting resolves immediately even when preserved authoring still
  contains time requirements.
  A Discovery-Mode teaser always exposes `duration: null` and `steps: []`, so timing
  cannot leak through either the aggregate or a step.
- Every PRODUCT read on the listing resolves against ONE step, the **product step**: the recipe's **terminal** execution step once it resolves more than one, and its only step otherwise.
  A multi-step recipe's PRODUCES is therefore its final product rather than an earlier step's intermediate output, and a legally empty non-terminal result group (issue 1907) never drives a product surface.
  The rule is single-sourced (`CraftingListingBuilder._productStep`) and is shared by the top-level expected output (`result`) and the `routedByCheck` outcome-tier table, which must not disagree about what the recipe makes (issue 1907).
  Single-step recipes are unaffected (their only step is both first and terminal).
  `routedByCheck` continues to emit an empty top-level `result`, because its output is per outcome tier rather than one row.
  Outside `simple` mode a recipe with more than one execution step resolves `result` against the product step's own FIRST authored ingredient set rather than `defaultSet`, because `IngredientSet.resultGroupId` is step-scoped and the first step's default set cannot route against the terminal step's groups (issue 1907).
  A single-step recipe outside `simple` keeps resolving `defaultSet`, which is the one case where the player's chosen route rather than the step decides the row.
  That first authored set is a REPRESENTATIVE headline only: a product step routing several sets to different groups shows the first set's group in the one PRODUCES row, while the per-set product grid beneath it stays exact (issue 1907).
  The `routedByIngredients` detail body follows the same rule: on a recipe with more than one execution step it renders the projected product-step `result` instead of the selected set's products, and swaps its routing hint for one saying the chosen option decides what THIS STEP consumes while PRODUCES is the recipe's final product (issue 1907).
- The crafting-check descriptor is not surfaced (the projection yields `null`) when the mode's check is optional, has no authored roll formula, and checks are not enabled (`craftingCheck.enabled !== true` and `features.craftingChecks !== true`).
  A mandatory-by-mode check, an authored formula, or an enabled-but-unformulated check still surface (the last keeps the "no roll formula configured" GM misconfiguration note).

##### Progressive Stage List

This section governs **every ordered-stage surface**, not crafting alone: the progressive recipe body and the progressive **salvage** body in the Inventory tab's salvage panel (§Player Salvage Surface) render the same component under the same invariants.
Where a requirement says "recipe", read it as "the progressive subject" — a recipe or a salvageable component.
The salvage deltas are stated at the end of this section; everything else applies identically to both.

- A progressive recipe's detail body renders an **ordered stage list**, replacing the generic input/output table: a progressive output is not a flat set, because one roll is spent down the list and the order decides what the player receives.
- The stage list is built from the **authored** result group and deliberately bypasses the award loop.
  Browsing has no roll, so routing it through the award loop yields a zero budget, awards nothing, and renders an empty output list.
- Each row carries: its **ordinal** (the row's position, not the stage's identity), the component **name** and **image**, a **read-only difficulty**, and the **cumulative threshold** at which the stage is reached.
- The cumulative threshold is the player's decision input: per-stage difficulty alone forces the player to do the arithmetic and redo it after every move.
- The threshold is **derived from the award mode**, not a running sum of difficulties.
  A running sum is correct only for `equal`; `exceed` gates on a strict comparison and sits one above each cumulative sum, and `partial` awards a tail result whenever any budget remains, making its final stage reachable _below_ its cumulative sum.
- A stage the award loop skips (an invalid or absent difficulty) is reached at **no** budget, so its threshold is **omitted** rather than shown as zero or as a running total.
  Such a stage must not advance the cumulative total for later stages.
- The displayed threshold and the awarded result MUST agree with the award loop for every award mode and every budget.
- Stages are shown in the **player's** order (see `resolution-modes` §Player Reorder), reconciled against the authored list.
- When the permission is true the rows are reorderable by **drag** and by **keyboard**: per-row Move up / Move down buttons, disabled at the ends, whose accessible name names the stage they move, with the new position announced through an `aria-live="polite"` region.
  Drag is a mouse-only enhancement — HTML5 drag does not fire on touch, so the move buttons are the only touch path and must meet the touch-target size.
- The announcement names the stage that MOVED, read before the move is applied, and is a single localized string carrying name, position and total (never assembled from fragments).
- Reorder writes are **debounced** and committed on settle, not per intermediate move, because each write is a replicated document write.
- The key a debounced reorder write commits the **Player Result Order** under is captured when the reorder is **scheduled**, never re-derived when the write flushes.
  A subject change between the gesture and the commit would otherwise write the reordered stages under a key naming a **different** recipe or participation, silently — the player reorders one subject's stages and another subject's preference moves.
- If a write **fails**, the rows revert to the last persisted order and the revert is announced through the **same** `aria-live` region.
  A notification alone is insufficient: the writes are optimistic, so the row has already moved and already announced, and a keyboard user reordering by chevron may never see a toast — leaving the player believing an order that was never stored.
- When the permission is `false` the rows keep their ordinal and difficulty but **drop the grip glyph** (the grip is the affordance signal), use a default cursor, attach **no** drag handlers, and show one muted line explaining that the GM set the order.
  No live region is rendered in this state, because nothing can change.
  Identical rows minus working affordances are not acceptable: a player must not be able to grab a row and have nothing happen.
- A Discovery-Mode teaser MUST NOT surface any stage data (see §Browse Status): the stage list is redacted exactly as `result` and `outcomeTiers` are.

**Optional per-caller extensions.**
The extension set is exactly four, all **opt-in and default-off**: an optional per-stage **state chip**, an optional **fixed-state note** overriding the explanation shown when reordering is unavailable, an optional **stacked row layout**, and an optional per-stage **complication strip**.
**All four ship.**
The strip's opt-in is a **tense token** — `off` by default, else `forecast` or `resolved` — and never a caller-supplied snippet, and that spelling is normative rather than incidental: a snippet is defined in the CALLER, so two bodies passing "the same" strip would be two copies of its markup, which is exactly the duplication this shared section exists to prevent.
A token is sufficient because nothing about the strip varies per caller except the tense, and the tense is the one thing the row data cannot say for itself: an un-fired complication looks identical before a roll and after one that spared it.
(The per-stage **quantity** opt-in was deleted, not defaulted off: no stage renders a quantity on either surface, consistent with the "result entries carry no quantity" rule.)
A caller that passes none MUST get the crafting rendering unchanged; the presence of the DATA is never the switch, only the caller's opt-in.
This exists so a second consumer can add rendering without re-skinning the first.
The fixed-state note is overridable because `canReorder: false` has **two** causes the component cannot distinguish: the GM pinned the order (the permission is off), or the player's order has already been **spent** by a resolved roll.
Defaulting to the GM reason keeps the crafting rendering unchanged, since there it is the only cause; a caller with a second cause MUST supply the note, or the surface asserts something untrue about the roll that just happened.
The GM reason takes precedence where both apply — it stays true whether or not a roll has since been spent.
The set is enumerated deliberately: a future extension is added to this list, so "not listed" means "not supported", not "not yet noticed".

The **stacked row layout** exists because the default inline row lays every part on one line and lets only the name flex, so the name absorbs every other part's width.
In a narrow column (the player inspector's 300px) that measures a **zero-width name** and overflows the trailing controls out of the panel — the row does not degrade gracefully, it fails.
Stacked, the reorder controls **lead** the row and the stage's identity is a flexible **column** (the name in one wrapping text flow, its number beneath), so the name wraps instead of being crushed.
Every progressive surface, stacked rows included, shows **both** the component's progressive DC ("DC N") and the cumulative threshold ("Reach ≥N"), per the issue #675 ruling and matching `resolution-modes` §Progressive Mode Semantics.
The "DC N" value is `component.difficulty`, which the GM authors via the stepper titled "This component's Progressive DC"; the **check-level** DC remains nonexistent (the projection resolves it to null, and a component's `dcOverride` does not shift these thresholds).

**The per-stage complication strip.**

`ProgressiveStageList.svelte` takes it as `complications`, the tense token named above, and BOTH shipped bodies pass it: the crafting body passes `forecast` always, and the salvage body passes `resolved` once its run has resolved and `forecast` before that.
Crafting can pass nothing else, because the fired record lives on the salvage run record and the immediate crafting path writes none.
It is stated here, in the same section that owns the extension contract, because the projection the strip reads (`forecastComplications`) is shared with the GM authoring surface that fills it, and a strip specified anywhere else would be specified away from the enumeration rule it has to obey.

The strip renders a component's complications inside its own stage row, and it is a DEFAULT-OFF extension of this shared section rather than a second body: a surface that passes nothing renders exactly as it did before the strip existed, and both bodies pass it so neither gets a private copy of the treatment.

**The data is published on the stage row, and the strip MUST NOT re-derive any of it.**
Both progressive read-models attach the player projection to the stage rows they already publish — `InventoryListingBuilder._buildSalvage` for salvage and `CraftingListingBuilder._buildProgressiveStages` for crafting — through the one shared `attachStageComplications` helper, so the audience filter, the activity gate and the could-never-fire exclusion are all decided builder-side against the same records the engine fires from.
A component that authors no player-visible complication for that activity leaves the stage row carrying no such key at all, and the row is byte-identical to the one published before this feature existed; the presence of the DATA is still never the switch, only the caller's opt-in.
The projection is attached TO the row rather than published beside it because the player's reorder is applied downstream of the builder, and a parallel list keyed by result id would desynchronise at exactly that point.
Marking the fired tense onto an already-attached list is the paired `markFiredStageComplications`, which only ever MARKS what the forecast already published and can therefore never surface a record the forecast withheld.

- The strip has **two tenses**, and one filter cannot serve both.
  Before any roll it is a **forecast** — the `visibility: 'visible'` complications this component COULD fire in this activity, read from the player forecast projection, with no roll and no run.
  After a resolution it additionally marks which of them **fired**.
- The forecast EXCLUDES a complication that provably cannot fire — one with no enabled clause, and one whose only enabled clause names a check trigger the projected activity's check block does not own — so a count of what could go wrong is not a lie.
- The fired state is read from the resolution's recorded fired list and is **never re-derived from a stage's missed state**: `match` and the condition roll mean a short stage need not have fired anything, so deriving "fired" from "missed" asserts something untrue about the roll.
- Under the runless invariant — no run record — **no strip claims fired**, matching the surrounding rule that a body with no run must not invent one and claim every stage fell short.
- The fired badge lands on the OCCURRENCE the fired record names, and on none of that component's other occurrences, because the record is keyed per stage result id while a row's state chip reconciles per component id.
- Neither projection may carry `when`, `rollCondition`, `effectRoll` or `macroUuid`: a player must not be shown the trigger, and the macro is not theirs to know about.
- A stage with several applicable complications renders the FIRST in fire order plus a "+N more" affordance.
  The inspector column is 300px wide — the documented reason the stacked layout exists — and an unbounded list turns one row into several prose paragraphs.
- A stage that is both awarded AND fired renders its success state chip **and** the fired band together, the band reading as a consequence of the award rather than a contradiction of it.
- The strip is a full-bleed band INSIDE the row, so the row becomes a column with today's line wrapped.
  **That row-structure flip is gated on the strip rendering CONTENT for that stage, not on the extension being passed.**
  Both bodies pass it, so a presence gate would re-skin every progressive stage row in every world — including the overwhelming majority that author no complications at all — which is precisely the failure this section's opt-in rule exists to prevent.
- The band is explicitly NOT draggable.
  Pre-roll, which is the forecast state the strip exists for, the salvage list is reorderable and the row is a drag source, so a mousedown-drag inside the prose would start a drag rather than a text selection.
- The strip's placement is deliberately ASYMMETRIC between the player and GM surfaces and MUST NOT be "unified": it is a band inside the row on the player side, while on the GM side the Component Studio's salvage strip is a tucked sibling OUTSIDE the row and the Recipe Studio's sits inside the stage card (`ui-entity-editors/spec.md` §Component Studio requirement 16).
- **The tense is carried by the row's BADGE and the band's TONE, and never by the severity tile.**
  Severity is one vocabulary across all six complication call sites, and a tile recoloured by tense would make one control say two things — a `severe` complication that has not fired and a `minor` one that has would be indistinguishable at a glance, which is the opposite of what a severity ramp is for.
  The band's own fill and top rule change with the tense; the tile does not.
- **The badge's copy is tensed, and a resolved stage does not still forecast.**
  Before a resolution the badge reads in the future tense ("this can go wrong"); after one, a complication that did NOT fire reads a past-tense negative.
  A row that still says "this can go wrong" beneath a spent roll asserts something that is no longer true, and the player has no way to tell it from a row that is genuinely still pending.
  The design prototype does say it — its `fired` flag is derived from a stage being short, so a recovered stage keeps its forecast copy — and this rule deliberately overrides it.
- **The player row renders the authored DESCRIPTION, and it WRAPS.**
  The GM strips clip their generated trigger sentence to one line so the row height cannot move under a long authored condition, and that is right for a GM reading a list of things they wrote.
  It is wrong here: the description is the whole of what this surface discloses, and an ellipsis at roughly sixty characters in a 300px column removes the disclosure the strip exists to make.
  It wraps, clamped to a bounded number of lines so the row height stays predictable, with the full string still reachable.
- **The band is not a drag source and carries no destructive or navigational control.**
  Pre-roll the salvage list is reorderable and the row IS a drag source, so a mousedown inside the prose would start a drag rather than a text selection.
  It also carries no per-complication link: a complication belongs to the component the row already names, and a player has nowhere to be sent.
- **The progressive CRAFTING surface is forecast-only.** The fired record is defined on the salvage run record, and crafting has no run record on the immediate path; inventing a second carrier for it is out of scope here.

**Progressive salvage deltas.**

- The award mode is **salvage's own** (`system.salvageCraftingCheck.progressive.awardMode`), authored independently of the recipe's.
  Deriving salvage thresholds from the crafting award mode violates the agreement requirement above invisibly, because both blocks normally exist and are normally authored.
- The permission is `Component.salvage.allowPlayerResultReorder` (default true; only an explicit `false` pins the authored order), not the recipe's.
- The player's order is stored under the `salvage:<systemId>:<componentId>` key (see `resolution-modes` §Which user's order is read).
- A pending debounced write MUST be **flushed before a salvage run starts**, and a **rejected** write MUST abort the run: an unflushed write is captured stale onto the run record, and a rejected one leaves the player looking at an order that was reverted.
- Salvage renders **no exclude affordance**: reorder is the whole of the feature.
  That holds for the complication surfaces too: no player progressive surface offers a per-stage exclude toggle, an excluded-results list or a hidden-result note.
  Exclusion would contradict the reconciliation guarantee that a result is never dropped, so the vocabulary is not built rather than built and disabled.
- The panel MUST state the mode and the flow **rule** as two separate statements: naming the mode ("progressive, ordered") does not tell a player that the roll **stops** at the first result it cannot reach, and stopping is the entire reason the order is worth arranging.
  Neither is a duplicate of the other, and collapsing them loses the mechanic rather than a repetition.
- Where reordering is permitted, the surface MUST offer a **reset** to the GM's authored order.
  An order the player can rearrange is one they can get lost in, and the authored order is the only one they cannot reconstruct from what is on screen.
  Reset persists **no preference** (an empty order), never the currently-authored ids: an empty order follows a later GM re-author, whereas pinning today's ids would silently outlive the GM changing them.
  It is offered only when the rendered order actually **differs** from the authored one — a stored order can name the authored sequence exactly, so a reset offered on the mere presence of stored state does nothing when pressed.

##### Browse Status

- Each projected recipe carries exactly one `browseStatus` from the vocabulary:
  `available`, `locked`, `unknown`, `exhausted`, `missingMaterials`, `discovery`.
- `discovery` is the Discovery-Mode redacted state for an undiscovered recipe (a
  player-facing "Undiscovered" badge).
- `incomplete` is intentionally NOT a player badge: a recipe is either visible
  (and projected) or filtered out, so a player never sees an "incomplete"
  authoring state.
- Status precedence (highest first): Discovery-Mode teaser → `discovery`, locked →
  `locked`, unlearned knowledge → `unknown`, recipe-item uses exhausted →
  `exhausted`, materials missing → `missingMaterials`, otherwise `available`.

##### Discovery-Mode Redaction

- When `listMode === 'teaser'` and an undiscovered recipe is shown to a non-GM
  viewer (`access.reason === 'teaser'`), the builder redacts every field named in
  `teaserState.hiddenFields` (default `['ingredients', 'results', 'description']`).
- A redacted recipe surfaces only a generic name/image and the `discovery` status;
  no ingredient, result, or check detail is computed or leaked.
- A GM bypasses redaction and sees the full recipe.
- The "exhausted" status uses the read-only
  `RecipeVisibilityService.isKnowledgeItemExhausted` probe, which agrees with what
  the engine would refuse to consume (item-limited knowledge owned but every
  matching item at its `maxUses` cap); owning no matching item is `unknown`, not
  `exhausted`.

##### Per-Set Craftability

- Each ingredient set carries its own `craftability`, evaluated against just that
  set rather than the recipe-wide satisfiable set.
- A set's craftability folds in its essence requirements, its **per-set** Tool
  requirements (Tools are per-set, not recipe-global), and the actor-bound
  currency probe, reusing the recipe manager's `evaluateCraftability` per-set pass.
- A set's craftability also carries an `essencePool` describing the shared essence
  funding for that set: `requirements` (per essence group — `groupId`, `essenceId`,
  name, icon, `colorToken`, `need`, `delivered`, `owned`, `satisfied`), `carriers`
  (per held item — `itemKey`, `componentId`, name, image, `ownedUnits`,
  `allocatedUnits`, `perUnit`), the resolved `allocation`, its `totals`, and the
  `suggested` allocation.
- `carriers[].ownedUnits` is the units remaining AFTER the set's non-essence
  consumption plan has claimed, derived from the resolver's own ledger.
  No UI or helper re-reads the item's stack count at the configured
  stack-quantity path to compute it: that field is game-system-specific and can
  be absent or `NaN`, and a raw stack count would offer the player units the
  craft cannot spend.
- `requirements[].delivered` and `requirements[].owned` are named apart
  deliberately.
  `delivered` is the essence amount the resolved allocation supplies to that
  requirement — the tile's numerator — while `owned` is the essence amount held
  across every matching carrier.
  In this projection and the rail it feeds, neither is reported as the
  component/tag `have`, which is not net of plan and would read off a different
  denominator in a rail whose invariant is that the tiles show what the craft
  consumes.
  The session shopping aggregation is the one deliberate exception, for a reason
  that does not apply here (see §Shopping List Panel).
  An essence requirement's own ingredient state carries `delivered` for the same
  reason and by the same rule.
  The key is renamed rather than aliased: leaving it named `have` while changing
  what it means would re-create the ambiguity inside a single array, where a
  component/tag entry's `have` and an essence entry's would answer different
  questions under one name.
- `essencePool` is `null` when the crafting system has essences disabled, matching
  the existing per-set essence-state projection.
- A currency requirement's projected state SHALL carry its cost and an affordability verdict.
- No surface SHALL report a have/need ratio for a currency requirement.
  The occurrence quantity is not the price, and a coin balance is not an item count; reporting "have 0, need 1" for a hundred-gold cost states neither the price nor the shortfall.
  The state may still carry the sibling `have`/`need` keys for shape consistency with the option-choice projection, but nothing renders them.
- When currency is enabled for the system but cannot be resolved, the projected state SHALL carry the reason.
  A currency option refused for a configuration reason MUST NOT present as an affordability shortfall.

##### Check Descriptor

- The `check` descriptor is optional for `simple` and `routedByIngredients` modes
  and mandatory for `routedByCheck` and `progressive` modes.
- It is `null` when the system configures no check block for the recipe's mode.
- `usable` is derived from an authored, non-empty `rollFormula` — NOT the legacy
  `enabled` flag.

##### Outcome Tiers

- `outcomeTiers` is populated ONLY for `routedByCheck` mode and is `null` for
  every other mode.
- Each tier carries its `awardedResults`, resolved through the resolution-mode
  service so success-only routing, the single-result-group exemption, and the
  `checkOutcomeIds → name-match → unrouted` precedence are honoured identically to
  a real attempt.
- The tier table resolves against the recipe's **product step**, the same step the
  headline PRODUCES row reads, so a `routedByCheck` recipe with more than one execution
  step lists what its terminal step awards rather than what its first step awards (issue
  1907).
- A failure tier (`success === false`) never routes and awards nothing (empty
  `awardedResults`).

#### Recipe List

- A search box plus the favourites-only, craftable-only, crafting-system, and
  category filter controls narrow the list.
- Each row shows a neutral category badge for non-`general` categories, in both the
  normal and the uncraftable row layouts.
- The badge is suppressed for `general` recipes so the default bucket is not tagged
  with a redundant "General" chip; its text is the localized/verbatim `categoryLabel`,
  never the raw token.
- A single-level category filter dropdown sits above the crafting-system filter.
- The category dropdown is client-local browse state with an "All categories"
  default; its options are the distinct categories present in the player's visible
  recipes, sorted non-`general` A→Z with "General" pinned last.
- Category grouping headers and nested/expandable category folders are explicitly
  deferred follow-ups; this first cut ships the badge and filter only.
- Row status badges from `recipe-visibility/spec.md` evaluation, drawn from the `browseStatus`
  vocabulary:
  - Available
  - Locked
  - Unknown or missing knowledge
  - Exhausted recipe item uses
  - Missing materials
  - Undiscovered (Discovery-Mode teaser-redacted recipe)

#### Recipe Detail

- The detail body is keyed on the recipe's `modeToken` (simple,
  routedByIngredients, routedByCheck, progressive), so each resolution mode renders
  its own body (ingredient sets, routed-by-check outcome-tier table, progressive
  body, etc.).
- Show the `modeLabel` rather than the raw mode token.
- Before crafting begins, the detail header visibly shows a fully revealed timed
  implicit recipe as localized `Duration: <value>`.
  A fully revealed `simple` multi-step recipe instead shows the aggregate once as
  localized `Total duration: <value>`, while every timed ordered step shows its
  compact duration in a non-shrinking clock chip at the end of the label row.
  Instant recipes and steps, time-feature-disabled systems, and Discovery-Mode
  teasers show no duration value.
- Show an ingredient-set selector when the recipe has more than one set; the
  detail reflects the chosen set's per-set craftability.
- Show the `check` descriptor (DC / skill / roll formula) when present, marking it
  optional or mandatory per mode and unusable when no roll formula is authored.
- Show the outcome-tier table for `routedByCheck` recipes, with each tier's
  awarded results (success tiers only).
- Show blocking reasons when not craftable (derived from `browseStatus`).
- Essence requirements use the GM-authored `EssenceDefinition.icon` after canonical icon normalization for legacy set-level requirements, first-class essence ingredient tiles, and essence choices within mixed alternatives.
  Missing or unusable icons use `DEFAULT_ESSENCE_ICON`.
  An essence's authored `EssenceDefinition.colorToken` additionally tints its glyph and its pool bar through the shared `--fab-tag-*` palette, and a `null` or unrecognized token falls back to the theme accent — which is what every essence renders as today, so an unauthored system is unchanged.
  The tint is scoped to the glyph and the bar; label text keeps the standard body/muted text colours, so an authored colour can never reduce label contrast.
  Non-essence images and the existing accessible labels and selection semantics remain unchanged.
- A component or tag requirement tile treats Foundry's generic `icons/svg/item-bag.svg` sentinel as "no image" and renders the tile's fallback glyph, never the bag itself.
  The sentinel reaches a tile two ways — a tag requirement with nothing matching in inventory has no item to read an image from, and a matched item may carry the bag literal as its own `img` — and both resolve to the glyph.
  It never falls back to `DEFAULT_RECIPE_IMAGE`: the blueprint is the _recipe's_ fallback (see `data-models` §Recipe requirement 16) and is not a material's fallback.
  The recipe-image chokepoints and the tool-state image path keep their existing fallbacks unchanged.
- (No learn action on the Crafting tab: recipe learning is wired through the Inventory surface only — see `ui-system-studio/spec.md` §Books & Scrolls Surface.)

##### Requirement Rail

- A set's fixed, choice and essence requirements render in ONE rail of uniform slot tiles, replacing the separate image grid, the stacked alternatives picker, and the essence list.
  Three disconnected surfaces cannot tell a player which requirement still needs attention, which is the whole job of this area.
- Every slot carries one of three states — **met**, **partial**, **short** — because a two-state surface renders an untouched choice and a genuinely unaffordable one identically, and marks a half-filled essence as an error.
  A fixed requirement is met at or above its need and short below it; an unchosen choice slot is **partial** (a to-do, never an error); a chosen choice slot is met or short on its own numbers; an essence requirement is short at zero delivered, partial while partly delivered, and met when fully delivered.
  A fixed CURRENCY requirement is the one exception to the ratio rule: it is binary by construction, so its state comes from its affordability verdict rather than from comparing a have against a need.
- A currency requirement tile renders its cost in place of a have/need pip.
- A currency configuration reason renders once per rail, not per tile: the reason belongs to the world's configuration rather than to any one requirement, so repeating it per tile would assert it as a property of each.
- At most ONE chooser is open at a time; the open slot is the rail's single point of interaction.
- Focus auto-advances to the first unsatisfied slot until the player opens a slot themselves, after which the player's choice sticks.
  The remembered slot is re-validated on every read against the live slot list, falling back to the first unsatisfied slot and then to the first slot, so changing set, step or recipe can never leave a stale or absent chooser open.
  Clicking the open slot's tile again closes the chooser instead of reopening it, and the closed choice is remembered the same scoped way: it stays closed until the player opens a slot again (including re-clicking the same tile), while changing set, step or recipe re-derives the default open slot as before.
- Auto-advance never steals focus, and it announces through its **own** live region rather than the progressive stage list's reorder region, because a progressive recipe renders both surfaces at once.
- The rail is a **disclosure**, not a tablist: fixed slots are not selectable, so tab semantics would promise a selection the surface does not offer.
  A choice or essence slot is a `<button>` carrying `aria-expanded` and `aria-controls` over the whole tile column, and the panel it opens is labelled back at its tile.
  That panel is itself an exposed named `role="region"`, because `aria-labelledby` on a roleless element exposes nothing to assistive technology.
  A fixed slot is `role="img"` with a label, because an `aria-label` on a non-focusable span exposes nothing.
- Open state is drawn as an accent-soft fill plus a caption line, never as an accent ring: the app already paints an accent ring for `:focus-visible`, so a ring would make "focused" and "open" indistinguishable to a keyboard user.
  Open state and satisfaction are independent, so the open treatment sits on top of the status border rather than replacing it.
- "Pick for me" fills the set's unmade choices and suggests an essence allocation.
  It lives in the rail header, scoped to the rail, rather than in the app footer: the rail renders inside step and routed bodies while Craft sits in a fixed footer outside the scrolling body.
  On an infeasible inventory it returns the best partial suggestion and an honest shortfall rather than throwing or looping.
- Every rail control is keyboard-operable and named for assistive technology, and bar transitions honour `prefers-reduced-motion`.

##### Essence Pool and Consumption Plan

- A set's essence requirements are funded from one shared, player-editable **essence pool**, scoped to a single ingredient set on a single step, because that is the granularity at which the engine consumes.
- Each carrier row offers a keyboard-operable stepper allocating units of one held item to the pool, and the allocation the player sees is exactly what the craft consumes.
- A carrier's allocatable maximum is its `ownedUnits` — the units left AFTER the set's non-essence plan has claimed — never the raw stack quantity, so the stepper cannot allocate the player into an infeasible state.
- A requirement's ratio reports `delivered / need` as essence amounts, so a satisfied requirement reads exactly `need / need` rather than the whole matching inventory.
  Unit-granular overshoot is visible in the per-carrier allocation, never in a requirement's ratio.
- The **consumption-plan panel** states what the craft will spend before it is spent: one row per planned item with the quantity that item contributes, plus a pending line naming the requirements still to choose.
  That "still to choose" list is joined with the platform list formatter rather than an authored separator key, so the join is correct in every locale.
- Legacy set-level essence requirements (`IngredientSet.essences`) are threshold-only and never consumed, so they cannot enter the pool.
  They keep their existing requirement-row presentation.

#### Shopping List Panel

- Session-scoped aggregation of materials needed for queued recipes.
- Shown only on the Crafting tab.
- Essence shortages from first-class ingredient states and legacy set-level essence states retain the first nonblank GM-authored icon across aggregation.
  Later blank values do not erase it.
  Render-time canonical normalization uses `DEFAULT_ESSENCE_ICON` when the retained value is missing or unusable, without changing need/have totals.
- The aggregation shops an essence requirement against the amount **held**, not the amount the plan delivers: `RecipeManager.evaluateShoppingRequirement` deliberately restates an essence state's `owned` as the `have` it aggregates on.
  This is the one place `owned` is reported as `have` (see §Per-Set Craftability), because `delivered` is capped at `need` and a shortage shopped against it would always read satisfied.
- The aggregation SHALL evaluate against the selected crafting actor, not against the component-source actors alone.
  The currency affordance probe is actor-bound, so an aggregation that supplies no crafting actor reports every currency requirement as missing regardless of the actor's balance.
- A currency requirement's affordability verdict is scoped to a **single craft of a single recipe**, because that is the only question the affordance probe answers.
  The aggregation SHALL NOT report an affirmative verdict for an aggregate that exceeds one craft's cost; such a row stays visible, states how many times the cost recurs, and presents no affordability verdict.
  A negative verdict is exempt and SHALL stand for any aggregate, because an actor who cannot pay for one craft cannot pay for more.
- A currency row that presents no affordability verdict — whether because the world's configuration refused it or because the aggregate was never established — SHALL NOT count toward the missing-components total.
  That total names components the player can go and acquire, and neither row is one.

#### Right Rail (Run Summary or Shopping List)

- The right rail is a single keyed body that shows exactly one of two panels for
  the current selection.
- It shows the **Run Summary** when the selection has an active or just-completed
  crafting run — in this iteration, a craft outcome recorded for the selection in
  session state and not yet dismissed; otherwise it shows the **Shopping List**.
- The Run Summary is **self-contained**: it surfaces the latest outcome and hosts
  the multi-step **advance** action for the same recipe (advancing the active step
  of a progressive run, time-gated), plus a keyboard- and pointer-accessible Back
  affordance that returns the rail to the Shopping List without losing the recorded
  outcome.
- Advancing re-invokes the craft seam for the same recipe and ingredient set (it
  carries no separate run id; the engine advances the active step).
- The unified player-facing Journal screen (see _Journal App_) is the cross-activity
  home for monitoring and advancing these runs; a direct cross-link from the Run
  Summary into the Journal is a deferred follow-up.

### Alchemy Tab

The player Alchemy tab is an IMPLEMENTED route (it replaced the earlier `{:else}` "Coming soon" placeholder in `FabricateAppRoot.svelte`).
Its content mounts inside `.fabricate-app-content` — the shell's 84px nav rail is NOT part of this grid — so the content is a **three-column** layout `known . workbench . inventory` mirroring the Crafting/Gathering views.
The sides are compressible (`minmax(230px,280px)` each) with a floored, growable centre (`minmax(340px,1fr)`) so the 340px workbench floor coexists with the 1024px minimum window; its named container stacks at the shared `@container fabricate-alchemy (max-width: 960px)` breakpoint with the **workbench leading** the stacked order.
It uses `--fab-*` design tokens only (no hex — see the theme-colour contract).

The additional component-sources bar (`ComponentSourcesBar`) renders in the shared top bar on the alchemy tab (`ActorSelectTopBar` `showSourcesBar` includes `activeTab === "alchemy"`), so a player can pull components from other actors; the discipline block (system name + Switch) sits ABOVE the "Known recipes" heading, stacked (name on its own line, Switch below).

The a11y contract: the status pill is `aria-live="polite"`; the bench chip body is a focusable `role="button"` (Enter/Space add one; Shift+Enter removes one), the chip `−` (remove-one) and `×` (remove-all) are real focusable `<button>`s that `stopPropagation` so they never also add, and the palette `+` add is a real focusable `<button>` (drag is mouse-only, so the keyboard add is the required parity affordance); unavailable inventory rows carry the `disabled` attribute; the drop zone has an accessible name/role plus a non-color dragover cue (a thicker dashed border); chooser cards and "Switch discipline" are real buttons; on Switch, focus moves to the chooser heading; the ready-state `brewpulse` animation honors `prefers-reduced-motion`.

#### Alchemy System Selector

- Shown only when multiple alchemy-mode systems exist; a chooser card per system carries `N known . M total` and an Enter action, and a "Switch discipline" button (shown only with more than one system) returns to the chooser and resets the per-selection workbench state.
- `N known` counts REVEALED recipes (per `recipe-visibility`), threading `componentSourceActors` into the summary so it matches the panel for item/Manual modes, not learned-only.
- Auto-enters if exactly one alchemy system is available.
- Persisted in the `fabricate.lastAlchemySystem` client setting.

#### Component Palette

- Grid of all components in selected alchemy system owned by component source actor(s).
- A name-search input filters the list, with a distinct filtered-empty "no matches" state separate from the onboarding "no components owned" state.
- Shows: image, name, available quantity (inventory minus workbench count), and — when the system has essences enabled and the component carries essences — the component's essence icons + per-unit counts.
- A visible per-row `fa-grip-*` drag handle (`aria-hidden`, inside the row button) signals draggability; drag stays mouse-only while the row's `+` add stays keyboard-reachable.
- Zero-quantity components remain visible but visually distinguished.
- Left-click: add one to workbench.
- Drag-drop from external sources remains supported.

#### The Workbench

- Session-scoped working set displayed as compact grid with quantity badges (e.g., "Iron Ore x3"); a placed component's essence icons + counts show on its chip.
- Each unique component appears once; adding increments the badge count.
- Chip interactions: the chip body adds one (left-click / Enter / Space); a right-click, Shift+Enter, or the focus/hover `−` control removes one; the `×` control removes all (delete the key).
  The `−` and `×` `stopPropagation` so they never also add.
- Supports: add from palette, add/remove/remove-all on a chip, clear all, submit.
- Submit triggers signature matching per existing Signature Resolution rules in `resolution-modes/spec.md`.
- The Produces preview surfaces the result component's essence icons + counts when essences are enabled.
- Drives the **five-mode status model** (`empty` / `assembling` / `ready` / `untried` / `no-reaction`, per `resolution-modes`) governing the status pill, Produces panel, and Brew button; client mode is advisory and fails safe to `untried` for any non-concrete signature (the engine is authoritative on brew).
- A brew-in-flight busy/disabled guard on Brew prevents double-submit (mirrors CraftingView's `busy` guard).

#### Discovered Recipes Panel

- Always visible on the left, with an onboarding zero-revealed empty state when nothing has been revealed and a distinct filtered "no matches" state when a search hides every revealed recipe.
- Shows recipes the viewer has **REVEALED** (per `recipe-visibility` — learned-by-brew ∪ the mode's reveal source), not learned-only (GM sees all, consistent with GM-sees-all).
- Searchable by recipe name.
- Selecting a revealed recipe **auto-loads** its signature onto the bench (a selection side effect, not a per-recipe button), scoped to recipes reducible to a concrete plain-component multiset.
- The "Craftable only" filter is DEFERRED this iteration.
- The non-revealed-recipe **count** (`valid − revealed`, never names/results/signatures) is shown in a footer.
- Visibility and learning semantics defined in `recipe-visibility/spec.md`.

#### Active Runs and History (cross-reference reconciliation)

- The alchemy tab does NOT host runs or history.
  Run monitoring remains a Journal concern (see _Journal App_); the tab's internal fizzle dead-end memory is not run history.
- The unified Journal screen surfaces alchemy runs alongside crafting, gathering, and salvage runs; an alchemy run is redacted there for a viewer who has not discovered its recipe.
- Forward-compat: the active station-tool chip stays in `ActorSelectTopBar` this iteration (the alchemy tab has no header/context bar yet); it migrates to an alchemy header bar if/when one is added.

#### Excluded from Alchemy Tab

- Shopping list
- Recipe browse list
- Favourites

### Alchemy Attempt Feedback

- Must not leak hidden recipe metadata on invalid combinations or failed attempts.
- An untried bench and a remembered-fizzle bench are distinguished ONLY by the per-character dead-end memory: an untried set reads `untried` (no confirmation that a reaction exists), and only a remembered fizzle reads `no-reaction`.
  A fizzle brew runs no check and shows no roll animation.
- No-signature attempts are shown as failed attempts with specific feedback and ingredient consumption per `alchemy.consumeOnFail`.
- If a matched attempt cannot route to a valid result group, show a misconfiguration error state (GM fix required) rather than a normal player-failure outcome.

### Learn Flow

- Confirmation dialogue when learn consumes item.
- Success/failure notifications with actionable reasons.
- Refresh list/detail state after completion.
- The learning flow is invoked from the Inventory surface (the book detail's learn affordances → `game.fabricate.learnRecipeFromInventory`); the former item-sheet header learn control was removed (issue #511, `ItemSheetRecipeLearnControl.js` deleted).

### Inventory Tab

The player's owned crafting materials: what they carry, where it came from, and what it is for.
It shares the selected character and the component-source actors with the Crafting tab, so both agree on what the player owns.

- **Layout.**
  Two responsive columns — filters + item grid on the left, an item inspector on the right — reflowing to **stacked** below the container breakpoint.
  The window is resizable, so a fixed column count is not the contract: the grid is responsive and its column count is an expression of the available width.
- **Filter chips.**
  A chip row in this fixed order: **All · Components · Essences · Tools · Books & Scrolls**.
  Each chip carries an icon and a live count computed over the search-filtered set, so a chip's badge reflects what selecting it would show.
  **Components** lists component cards only: a card present **solely** because it is a registered Tool appears under **Tools** and NOT under **Components**, while a component that is also a tool appears under **both**.
- **Sort.**
  Name / Quantity / **Type**.
- **Card contract.**
  Each item card is a **square thumbnail** carrying every at-a-glance signal, with the item name beneath.
  Every overlay sits **inside** the thumbnail's bounds and above it — not hanging off the card frame:
  - a **quantity pip**;
  - **corner badges**: a **recycle** badge when the item is salvageable, and a **wrench** badge when it is a registered tool.
    These two flags are **orthogonal** — a component can be both, and a broken salvageable tool is a common case — so they MUST NOT share one slot.
  - **essence pips**: one chip per essence the component carries, rendering the essence's **own authored icon**.
    Essences are GM-authored per system with their own icon; a fixed icon set, or a hue keyed on an essence's name, silently mis-renders any essence the GM named differently.
    The chip exists so the glyph reads against arbitrary artwork.
- **Row kinds, and what "owned" means.**
  The listing projects component rows, essence rows, Books & Scrolls rows, **and tool rows**.
  A **tool row** is emitted for an owned document that resolves to a first-class library Tool of a system and to **no component of that same system**.
  Tool identity resolves through the shared WIDE tool presence matcher defined in `data-models/spec.md` `## Tool` requirement 12 — durable `roles[systemId].toolId`, then the Tool's own source references, then its snapshot-name fallback — and **never** through `tool.componentId`.
  It MUST be the wide presence matcher rather than the narrow durable-identity gate, so the inventory and the crafting tool gate can never disagree about what the player is carrying.
  A component-only projection lists nothing at all for an owned item-sourced Tool, which carries `componentId: null` by construction; that was the shipped 1.8.0 behaviour, and it made every Tool authored in the Tool Studio invisible to its owner (issue 1119).
  A system with Tools and **zero** Components still lists its owned tools.
  A tool row's name, image and description resolve by the single precedence in `data-models/spec.md` `## Tool` requirement 13, with the generic `icons/svg/item-bag.svg` sentinel projected as **no image** so an unarted tool inherits the same default artwork an unarted component shows.
  A tool is never consumed, produced, salvaged or essence-bearing **in its tool role**, so a tool-only row carries no salvage surface, no essences, no used-by and no produced-by.
- **One card per unified physical stack.**
  The listing renders **one card per unified physical stack**, not one per crafting system.
  A physical document that backs a component in **N crafting systems** appears **once**, with its quantity counted **once** — a per-system card duplicated the same stack and let the player read N× the true count, and salvaging one card silently consumed the sibling's documents.
  The projection **aggregates then collapses**: each system contributes today's within-system aggregate of a component across every owned document and source actor (a **participation**), then participations whose **contributing-document identity sets intersect** collapse into one card, and `totalQuantity` / `sources` are computed over the **union** of the card's contributing documents **deduped by identity** (a document participating in two systems counts its stack quantity once) and summed per source actor.
  Document identity for this dedup and join is **`item.uuid` alone** — never a compendium/duplicate-source union: `_stats.compendiumSource` and the transitive `_stats.duplicateSource` are shared across **distinct** documents (Foundry stamps a fresh `duplicateSource` on every drag-to-actor), so keying on them would merge two genuinely-owned stacks and undercount real holdings (`getItemIdentityReferences` is the codebase's precedent for excluding `duplicateSource` from identity; see `data-models/spec.md` for the `roles`-map component identity these participations resolve through).
  This **adds** cross-system unification and does **not** disturb today's same-component aggregation: distinct documents (across stacks or source actors) that resolve to the **same** component still aggregate into one summed card, and distinct documents that resolve to **different** components — even when they share a compendium/duplicate-source template — stay **distinct** cards.
  The card's at-a-glance signals (salvageable, tool, essence pips) are the **union** across participations, essence pips **deduped by essence id**.
  `broken` is a **singular** physical property of the document(s), never per system.
  Essence rows (synthetic per-system aggregates keyed `essence:<systemId>:<essenceId>`) and Books & Scrolls rows are legitimately distinct per system and are **NOT** collapsed by this behaviour.
  A Tool contributes a **participation** on the same terms as a component, so a document that is **both** a managed component and a registered Tool (a whetstone) yields exactly **one** card — its component card, badged as a tool — and exactly **one** `systems[]` entry for that system, never two.
  Within one system a tool match on a document already backed by a component participation **folds into** that participation rather than emitting its own; across systems the ordinary contributing-document intersection applies.
  This is the common case rather than an edge one, because `_normalizeSystem` derives source references onto component-linked tools on every load, so both kinds resolve here.
  The primary participation is biased **component before tool**, so a mixed card keeps its component identity, key, salvage surface, essences and produced-by.
  A tool-only card is keyed `tool:<systemId>:<toolId>`; keying it by `componentId` would collide across every item-sourced tool in one system at `null`.
- **Broken treatment.**
  `broken` is a **read-only** verdict, and no engine path un-breaks a tool.
  It has **two** sources, and reading only the second reports almost every broken tool a player can actually see as intact:

  - the persisted **`flags.fabricate.toolBroken`** past fact — the authoritative presence-gate disqualifier, written by the `flagBroken` on-break action for **every** breakage mode and requiring no roll to know.
    This is the source that matters most: `flagBroken` is the only on-break mode that leaves a broken item in the player's inventory at all (`destroy` and `replaceWith` remove it), and a chance- or formula-broken tool carries this flag with **no usage counter** whatsoever.
  - a **projection** of usage exhaustion, which only `limitedUses` supports (the other modes decide at attempt time by a roll).
    Exhaustion is evaluated against **the Tool the owned document resolves to**, never a Tool found by `componentId`, which is unreachable for an item-sourced Tool and merely lucky for a component-linked one (two Tools may name one component).
    It MUST NOT be applied under the `checkDriven` tool-breakage authority: usage still accrues there, but the active check decides breakage and per-tool modes are ignored, so projecting exhaustion would report a perfectly usable tool broken permanently.

A broken item dims its artwork, takes a danger wash and a danger card border, and its **"Broken" pip REPLACES the quantity pip** — they are one slot, not two.
There is **no repair affordance** anywhere; the treatment states why the tool is unusable and offers no action.
Brokenness is about **usability, not salvageability**, and MUST NOT gate the salvage surface.

- **Inspector system selector.**
  When a card participates in **more than one** crafting system, the inspector presents a **system selector** as the **first** element of the detail header, above the `Info | Salvage` control, scoping the **whole body** (name, image, description, tags, tier, essences, used-by, required-for, produced-by, and the salvage surface) to the **selected participation** — the reported case is an essence in one system and an elemental tag in the other.
  The selector is a native **`<select>` drop-down** — a labeled VALUE choice ("pick which system's data this body shows"), **not** content-tab navigation and **not** a segmented toggle.
  A drop-down is what scales: a physical item can be registered in more than two or three systems, and a segmented control would grow too wide and wrap; a native select is a11y-clean by construction (a labeled listbox), so it needs no bespoke radiogroup/roving-tabindex ARIA.
  The label is associated with the control (`<label for>`), each option reads as the system **name** first with a plain-text affordance suffix (`<name> — Salvageable, Tool`) — deliberately **not** `<option label>`, whose present value REPLACES the visible option text — and the initially-selected option is the salvageable-biased primary.
  Display name and image are the **primary** (default-selected) participation's component name/image, biased to a **salvageable** participation first so clicking the union recycle badge never opens a primary with no Salvage tab.
  With exactly one participation the selector is **absent** and the surface is byte-identical to a single-system card — no selector node, no chrome, no layout shift.
- **Inspector Info order.**
  Broken banner → description → essences → **Sources** (hidden for books) → **Contributing** (essence rows only, gated `isEssence`) → Used by → **Required for** (tool rows only, gated `isTool`, spanning recipe / salvage / gathering kinds) → Produced by (gated `!isEssence`).
  Sources and Contributing are physical facts of the stack and stay card-scoped; every other Info leaf scopes to the selected participation.
  For a **tool-only** card the type chip reads **Tool**, and **Used by** and **Produced by** are OMITTED rather than rendered empty: a tool is neither consumed nor produced in that role, and "Not used by any known recipe" beneath a hammer several recipes require reads as a defect rather than as an empty state.
  A **Required for** entry is indexed against BOTH the Tool's own id and, when present, its linked component id, so the disclosure survives `componentId: null` on an item-sourced Tool (issue 1119).
- **Used-by reverse index composition.**
  The inspector's **Used by** list MUST include every component reachable through an ingredient's matcher, not only components a recipe names directly.
  Each ingredient option's `match` is expanded through the match-handler registry (`getMatchHandler(match).expandToComponentIds` against that option's own system components), so a direct component reference expands to its own id and a tag matcher expands to every component carrying the tags.
  Entries are deduplicated per component and per source, so a component consumed both directly and via a tag lists the recipe once.
  Essence-type options continue to feed the separate essence contributor channel and add no component used-by entries.

#### Player Salvage Surface

The player's route to salvage.

- Salvage lives **inline in the inspector**; it is never a modal.
- **The acting participation is the selected one, never the primary default.**
  On a card that participates in more than one system the salvage action resolves the acting `(systemId, componentId, targetActorId)` from the **selected** participation (the system selector's current choice) across the view handler, the store, the success-ribbon gate, and the panel — none falls back to the primary.
  Each participation salvages against **its own** contributing documents, so the depleted / "None remaining" / disabled-action basis is the selected participation's **own** owned quantity, not the card's cross-system union (a system-B salvage on a divergent-roles card cannot consume documents system B does not back).
  The panel **names the acting system** when the card spans more than one.
  The progressive stage-order preference is keyed per **`(systemId, componentId)`** (`salvage:<systemId>:<componentId>`): component ids are not globally unique (copy-import preserves them), so a component-id-only key collided across systems the moment the collapse surfaced two participations of one card, and the store's write key must match the engine's capture key exactly or the captured order silently reads empty.
  That matching obligation is salvage's alone, because crafting reads its order live at resolve time (`resolution-modes` §Which user's order is read); **when** the key is captured is governed for both surfaces by §Progressive Stage List.
- An **`Info | Salvage`** control appears when the item is salvageable — **including when it is broken**, since brokenness does not gate salvageability.
  When the item is not salvageable, **no tab bar renders at all**: a hidden tab reads as "this isn't salvageable", which is wrong and unfixable by the player.
- The body dispatches on the pair **`(mode, checkUsable)`** against **`system.salvageCraftingCheck`** — salvage's own check block, NOT `system.craftingCheck`, which is the recipe block.
  Both normally exist and are normally authored, so reading the wrong one renders plausibly while showing the player a formula and a DC the engine will never use.
- A check is **usable** iff its mode's roll formula is authored and **non-blank**; that is the only gate the engine applies, and the panel and the engine now derive it from one shared resolver rather than each testing the formula their own way (see `resolution-modes/spec.md` §Check Source).
  "No check" and "pass/fail" are therefore **one `simple` mode at two usability states**, not two modes.
- A routed or progressive salvage with **no authored formula** renders a GM-config state, not its authored tiers or stages: the engine aborts such an attempt with zero mutation, so showing the contract would put it under an action that always fails.
- **Simple multi-group misconfigured state.** A stored-but-not-yet-re-normalized `simple`-mode component with more than one success result group is misconfigured (the engine only ever awards the first group).
  The builder projects it with `misconfigured: true` and a `misconfiguredReason` discriminator (`'simpleMultiGroup' | 'routedNoFormula' | 'progressiveNoFormula'`); the misconfigured body dispatches on that discriminator — not a binary mode dispatch — so the Simple case renders Simple-specific copy ("more than one salvage result group; Simple mode uses a single group — fix it in the component editor"), and the mode banner is suppressed when misconfigured so a green recycle banner never sits above a "this is broken" body.
  The GM-facing inventory renders this cue; the non-GM visibility gate retains the hard-hide for a still-invalid stored config (justified: the config self-heals on the next system normalize, and the GM gets the cue in two surfaces — the manager overview critical and this body).
  Both surfaces show the working salvage panel once the config re-normalizes to a single success group.
- **`dcOverride` shifts the simple DC and routed RELATIVE thresholds only.**
  A relative outcome carries a DC **delta**, so its effective threshold is `baseDc + delta` and an override moves it.
  A **fixed** outcome carries an absolute, non-overlapping `[start, end]` segment of the roll range, matches on `start <= total <= end`, and never reads a DC at all — so a **routed + fixed** salvage renders its authored ranges **verbatim** and shows **no DC**.
- The action is **one-shot for every mode**: it rolls AND commits in a single gesture.
  The roll prompt IS the roll step; there is no separate confirm, no reroll, and no pre-roll dice box.
  The label names the gesture — with no usable check it is a plain salvage, with one it is a roll.
- The roll summary is **read-only** and renders only **after** resolution.
  It never renders a hardcoded formula: the formula is system-authored, and the prompt has already displayed the resolved one.
- A **cancelled** prompt returns to the pre-roll state with zero mutation and **no notification**.
- A **time-gated** salvage (`success` with null results) shows a **waiting** state carrying the engine's message, **not** a success state.
- The success ribbon stays **pinned to the salvaged row** until dismissed or another item is selected — **including when its last copy was consumed and the row leaves the listing**.
  Otherwise the selection falls through to another item and the ribbon renders against the wrong component; with single-copy components this is the common case.
- **Result-driven tab routing.** A newly-arrived salvage result actively opens or reopens the Salvage tab in one ordered effect keyed on a NEW result reference — so it survives roll-dialog remounts, a manual Info click is not yanked back, a changed item key resets to Info, and the result branch wins when both fire.
- **Required-tool disclosure before the attempt.** When the component's `salvage.toolIds` resolve to any library Tools, the panel renders a **Required tools** section (after the banner, before the roll summary) listing each tool's display name and image with an **available / unavailable** `Chip` treatment on the chip's DEFAULT density (`tone="positive"` / `tone="danger"`, an icon plus a localized label — two signals, never colour alone) mirroring the crafting recipe detail's tools group.
  It was a `StatusPill` treatment until issue 1506 retired that component into the chip; the two signals, the tones and the mirroring are unchanged, and only the vehicle is.
  The tool availability is computed builder-side against the **target salvage actor** (`salvage.targetActorId`, the first owned source) — the same single actor the engine validates and the store salvages — **not** the party aggregate the crafting recipe surface uses, so a tool held only by a non-target party member reads unavailable exactly as the engine will enforce it.
  Disclosure is independent of resolution mode **and** of the misconfigured state: a prerequisite is worth disclosing in every state.
  A present-but-broken tool reads unavailable; the panel renders availability only, with no distinct repair cue.
- **Tool-blocked action.** The pre-roll action is **disabled when any required tool is unavailable**, so the one-shot roll is never spent on an attempt the engine will reject for a missing tool.
  In that state the footer note **supersedes** the one-shot cost note and instead explains why the button is off; the disabled action may reference the note via `aria-describedby`.
  The engine's `_validateTools` remains the server-side authority — this disable is a UX affordance mirroring crafting's `canCraft`.
- **Depleted-stack honesty.** After the last copy is consumed the store reconciles the held row to `totalQuantity` 0, the header reads "None remaining", the ribbon's "Salvage again" is replaced by a nothing-left note, and the pre-roll action disables on depletion or an unavailable required tool (`disabled = busy || misconfigured || waiting || depleted || !toolsAvailable`).
  The "Salvage again" inline reset is the dismissal gesture the "until dismissed" rule alludes to.
- **Rolled-total summary.** The read-only post-roll summary appends the rolled total in mono ("with a roll of N"), omitted when `rollValue` is null for a no-check salvage.
- **Post-roll reconciliation.** The routed body marks the matched tier with a "Your roll" pill from `salvageRun.checkResult.data.outcomeId`, and the store threads `awardedComponentIds` from `salvageRun.createdResults` for per-stage recovered state; both are null/empty on a runless (no-check) salvage.
- **Complication disclosure.**
  The panel's progressive body renders the per-stage complication strip defined in §Progressive Stage List, in its forecast tense before a roll and with the fired marks after one.
  The projection it reads is attached per stage to `salvage.stages[]` and filtered against salvage's OWN progressive check block, so the ids the forecast filters on are the ids the firing will match against.
  The fired marks arrive on the store's own `salvageResult`, scoped to the acting `(systemId, componentId)`: that result outlives a selection change, and an unscoped read would badge a DIFFERENT component's stages the moment the salvaged row was released while the result stood.
  The projection is published only for a progressive salvage, because every other mode resolves without an ordered stage list and so can fire nothing.
  The audience rules in the rest of this bullet are normative for every projection a player surface may read and for the strip that renders it.
  A `gmOnly` complication appears in NO player surface, in no engine return this panel reads and in no salvage run record, **including when a GM is the acting user** — the projection is keyed on the AUDIENCE, never on the acting user's role (`data-models/spec.md` § Component requirement 23).
  A complication whose condition roll did not pass, on a stage that fell short, renders as NOT fired; a runless progressive salvage renders every strip in the not-fired treatment.
  Each occurrence is marked on its own: a component staged twice whose complication fired on both entries renders BOTH strips fired, and one that fired on neither renders neither, because the resolution produces one fired record per firing and the marks follow the records one for one.
  A component whose only complication is `gmOnly` therefore renders in both GM read-only strips and in neither player surface.
- **Bulk selection unit.**
  The bulk gesture's unit is the **acting participation**, one unit per row, with no per-row quantity control; a run may span crafting systems and source actors (see §Bulk Salvage Execution).
  Brokenness does **not** block a row from a bulk queue — brokenness is about usability, not salvageability (see §Inventory Tab), and the prototype's "repair before salvaging" would block something Fabricate permits while naming a remedy Fabricate has no action for.
  A broken but salvageable row therefore stays in the **queue**, carrying its own danger treatment beside its **certainty** chip (Guaranteed / Possible).
  Certainty, not resolution mode: `simple` / `routed` / `progressive` is authoring vocabulary a player surface never uses, and the queue row already derives certainty from the row's own yield preview.
  The blocked-reason set and its first-match precedence are `essence`, `recipeItem`, `salvageDisabled`, the three `misconfiguredReason` values (`simpleMultiGroup` / `routedNoFormula` / `progressiveNoFormula`), `toolsUnavailable`, `depleted`.
  These are the already-normative ids rather than a second vocabulary, and a `toolsUnavailable` row names the missing tools.
- **Bulk complication forecast.**
  The bulk panel renders a pre-run **"What could go wrong"** block above the queue, titled by a count of what could fire and drawn from the player **forecast** projection.
  It is drawn in the panel's PRE-COMMIT state only: the forecast is what a player weighs before spending the one gesture that rolls the whole batch, so it is read before the commit control rather than found under it.
  The block reads that projection **off the queued entry the inventory store publishes** — the same `attachStageComplications` output the single-item panel's stage rows carry, flattened per entry into ordered rows — and re-derives no part of it.
  The rule that decides what a player may be shown has one owner, and a panel computing any of it a second time is how a `gmOnly` consequence eventually reaches a player; reading the same projection as the stage bands is also what keeps the two screens from disagreeing.
  `BulkSalvageService.forecast(targets)` is a second, service-side projection of the same rule, published for a caller with no store to read; it is **not** what this block reads.
  Being a second projection of the SAME rule is binding: it is one entry per stage occurrence too, with no dedupe of its own, and its `count` counts the same things this block's count counts.
  Only RUNNABLE rows carry a forecast — a blocked row never enters the run, so it can promise neither a yield nor a complication — which is what makes the block inherit the selection cap and every blocked reason by construction rather than through a second filter.
  A stage no budget can reach contributes nothing, on the yield preview's own rule: a null threshold marks a stage the award loop skips at every budget, and a forecast that listed it would promise a consequence the run cannot deliver.
  Within a group there is one row per STAGE OCCURRENCE that carries the complication, not one per distinct complication: a component staged twice is two rows at two positions, because a complication is both evaluated AND fired per result entry.
  Each of those two rows is a consequence the run can actually deliver, independently of the other, so the rows are the forecast's real unit rather than a repetition of one warning.
  The headline count is a count of the rows the block actually DRAWS, deliberately rather than a de-duplicated tally.
  That count therefore equals the number of firings this queued entry could produce — it is the same unit the firing rule uses (`resolution-modes/spec.md` § Once per result entry, never once per component), not an approximation of it — and a number in a section eyebrow that disagreed with the rows beneath it would be worse than no number at all.
  It is a **group card** rather than a flat bulk row because each complication's text is multi-line prose and a bulk row's note does not wrap.
  It is **hidden once the run commits**, because the fired record is then reported on the aggregate chat card instead (§ Bulk Salvage Execution) and a stale forecast beside a committed outcome reads as a second, contradicting report.
  The forecast excludes a complication that provably cannot fire, on the same rule § Progressive Stage List states, so the count is not a lie; and it never shows a `gmOnly` complication, on the same audience rule every other player surface obeys.
  There is **one group card per QUEUED ENTRY** — the component being salvaged — and not one per complication-bearing result component: the queue is what the player selected and what the run acts on, so a block grouped any other way could not be read against the queue directly above it.
  The rows inside a group are that entry's stages' player-visible complications, in the **player's stored order**, and each row's position badge is its position in that ORDER rather than its index among the rows — a stage that authors no complication leaves a gap, which is what makes the number readable against the ordered list on the single-item panel.
  Each row states its position, the result it hangs off and that result's DC in **one localized string** in the row's own metadata slot, never as a separate ordinal tile beside the severity tile: an ordinal tile plus a severity tile plus a wrapping name is three leading boxes in the 300px column the stacked stage layout exists to protect.
  **Every** group card states whose order its positions are numbered against, in **three** states, and it is a per-card statement rather than a heading over the block: a bulk selection can hold one row whose order the GM pinned beside another the player has rearranged, and one heading cannot be true for both.
  The states are the **player's own** (the rendered order came from their stored preference and differs from the authored one), **arrangeable** (the GM's authored order, which this player may replace), and the **GM's** (the authored order, pinned by `allowPlayerResultReorder: false`).
  The player's state MUST say the order is **remembered** — it persists and is re-read on every later salvage of that component, and that persistence is the whole reason arranging it is worth a gesture.
  The arrangeable state MUST name the GM as the order's author AND name the affordance that replaces it: naming only the GM would assert a fixity this player does not have, and naming only the player would be a false claim about their own arrangement.
  The GM's state states authorship and nothing more — it is neither an error nor a refusal being announced.
  All three MUST come from the projection rather than be inferred in the panel from the reorder permission and the player-order flag together, which would be the block re-deriving the projection it exists to render.
  A row with no ordered stage list at all (a `simple` or `routed` row) has **no** provenance — no order exists for anyone to own — and publishes no forecast either, so no card renders that case.
  The block renders the **same shared complication row** as the per-stage strip, in the same player variant: they are one meaning on two screens, and the six-call-site scaffold exists so the second one costs props rather than a component.
  It renders **no excluded-results note**, on the § Progressive Salvage Deltas rule that no player progressive surface builds any part of the exclusion vocabulary.
- **Bulk yield preview.**
  The preview is a **best case of one unit per row**, computed from each entry's **own** salvage projection and never from the inspected card's stage order, which is scoped to one participation.
  A no-check `simple` row's results are **guaranteed**; a checked `simple` row's same results are **possible**.
  A `routed` row's quantity is the maximum over **success** outcomes only.
  A routed **failure** outcome awards nothing at all: `salvage()` returns at its rolled-failure branch — consuming per the failure policy and posting the failure card — _before_ result groups are resolved, and result-group resolution is that branch's only call site.
  The per-outcome result list the panel reads is a **display projection, not an award**, so a `success: false` tier contributes 0 and so does a success tier with no `outcomeRouting` entry.
  The guaranteed floor is therefore **0** whenever any authored tier is a failure tier — routed salvage clamps a below-lowest total to the lowest tier, making a failing lowest tier reachable — and **0 in general for `routed + fixed`**, where a total outside every authored range matches nothing.
  "Always something, more on a success" is authored as **two success tiers**, which this rule handles.
  A `progressive` row contributes one per stage, always **possible** and never guaranteed, omitting entirely any stage whose threshold is unreachable at every budget; a component all of whose stages are unreachable is still salvageable and simply contributes no preview rows.
  Aggregate quantities and guaranteed floors are summed **independently per component name**, because two rows can yield the same component at different certainties and the "up to" affix is only correct under independent sums.

### Run Guardrails

Before start/resume and before each step action, UI must invoke guard checks defined in `recipe-visibility/spec.md`.
