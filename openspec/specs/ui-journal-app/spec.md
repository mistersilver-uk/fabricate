# UI Journal App

## Purpose

Define the player Journal, the unified Fabricate window's home for monitoring crafting, gathering and salvage runs.
Sibling UI surfaces and the cross-cutting UI rules are indexed by the Surface Map in `ui-integration/spec.md`.

## Journal App (Player)

The **Journal** is the unified player-facing home for monitoring runs.
It is a tab in the unified Fabricate window (`Crafting`, `Alchemy`, `Gathering`, `Journal`, `Inventory`), rendered beneath the shared Actor selection top bar, and reads the selected player-character's existing crafting, gathering, and salvage runs through one UI-safe projection (the `RunModel` / `StepModel` shapes defined in `data-models/spec.md` _Run Journal Projection_).

Scope:

- The Journal does NOT consume the `narrative` invalidation domain: stage purpose comes from permitted presentation captured when armed, never a live description lookup.
  An edit that changes only prose therefore MUST NOT rebuild it — see `ui-crafting-app/spec.md` _Shared-store refresh routing_ and `data-models/spec.md` § Invalidation Domains.
- The Journal monitors active and historical runs, advances crafting runs, and collects eligible versioned gathering runs.
- It never CREATES runs; run creation stays in the Crafting, Alchemy, and Gathering flows.
- It is the unified player home for the per-activity run views described in `ui-crafting-app/spec.md` and `ui-gathering-app/spec.md` — the Crafting tab _Run Summary_, the Alchemy tab _Active Runs and History_, and the Gathering App _Active Runs_ / _History_.
  Those per-activity sections remain authoritative for their own tab, and the Journal cross-references rather than replaces them.

### Navigation and Active-Run Count Badge

- The `Journal` nav tab uses the `fa-book-open` icon and the `FABRICATE.App.Nav.Journal` label.
- The nav entry carries a live **active-run count badge** showing the number of active (non-terminal) runs for the selected actor (`JournalListing.counts.active`).
- The badge is hidden when the count is zero.
- The badge stays fresh even while the Journal tab is closed: the shell re-fetches the listing on world-time advance and scene change, so another open tab still shows an accurate count.
- The badge count and the Journal listing MUST reflect the currently-persisted runs for the selected actor regardless of which client created or advanced them.
  A run started or advanced by another user — including via the primary-GM world-time timed resume — MUST become visible to a GM viewing that actor after the actor document syncs, without a full app reload.
  Per-client run-manager caches MUST NOT serve stale runs: they are invalidated when the selected actor's run-container flags change on any client, so this cross-client freshness holds and the "badge stays fresh on world-time advance" guarantee above continues to hold across clients.

### Run Monitoring

- The view resolves the selected actor through the shared Actor selection top bar and shows a no-actor empty state when none is selected.
- Active runs and history are shown across all three run types (crafting, gathering, salvage) in one unified surface.
Active rows retain title, run type, status pill, crafting progress and a time-remaining/countdown where a `timeGate` exists.
The crafting progress reading MUST NOT be conditioned on that gate: a run whose current stage has not begun holds no gate, and its rail reads completed stages over total with the current stage at zero, because between the stages of a multi-step run the rail is the only thing on the row that says how far through the run is.
A countdown MUST NOT be shown for a stage with no deadline, because the matured-wait wording would then describe a clock that has not started.
A run with fewer than two stages renders no rail: gathering and salvage project no steps at all, and a lone track on a single-stage craft asserts a 0% where progress has no meaning.
The rail's accessible value MUST state what its tracks DRAW — completed stages over total where it is the stage rail, the clock fraction where a gate runs — never a clock fraction of zero beside filled tracks.
- Active status pills reflect the projection's `derivedStatus`, with pause taking precedence over time-gate readiness (see `data-models/spec.md`).
The player-facing badge vocabulary is `Ready`, `In progress` and `Paused`: `waiting` and `inProgress` present as ONE badge, `In progress`, with one word, one tone and one glyph, because an unpaused active craft is in progress whether it is counting world time down or sitting between stages.
`derivedStatus` keeps both values, because the projection still distinguishes where the clock is; what merges is what the player is shown.
The distinction a player can act on is carried BESIDE the badge by the attention vocabulary and BENEATH it by the progress rail, never by the badge itself.
Finished rows MUST show a labeled right-side outcome icon instead of an aggregate result quantity or below-title status chip.
Succeeded, failed and cancelled remain distinct; absent or unrecognized terminal status shows localized Outcome unknown, and settlement or recovery evidence takes precedence over a terminal success face.
- The layout has a browse zone and a selected-detail zone.
Active and Finished lists scroll independently, with their sort controls and pagers outside the scrolling bodies; the detail scrolls independently.
At content widths at or below 960px, stack Active, Finished and detail while preserving access to every control.
The stacked layout MUST remain usable at the real 1024px minimum application-window width; the container breakpoint describes inner content rather than the outer window.
- One shared search and kind filter covers crafting, gathering, salvage and alchemy.
Active status filters are mutually exclusive All, Ready, In progress and Paused, and MUST use the same words as the badges, so that no tab names a badge the player is never shown and no badge names a tab that does not exist.
The In progress tab selects BOTH merged statuses and counts them together; every active run MUST be reachable from exactly one tab, which a tab vocabulary omitting `inProgress` did not satisfy.
Status counts use the selected kind cohort before search, active-status filtering, paging or selection.
- Each list defaults to four rows per page and retains existing page-size and sorting choices.
Both pagers MUST use the shared compact single-row presentation with independently named region and navigation landmarks, accessible page-size choice and at least 24px interactive targets.
At the populated wide layout, all four default Active and all four default Finished entries MUST fit visibly in their panes without undersizing shared primitives.
Finished rows MUST be 44px border-box with a 24px-square dismiss control.
Both pane allocations and footer bounds MUST remain stable across full, short-last, empty and restored pages at 1240×880 and the supported 1024×880 stacked layout.
EmptyState MUST fill each allocated list body.
Filtering and removal clamp its page independently.
Selection is keyed by actor UUID, run type and run ID and remains selected when its row leaves the visible page or filter; fallback occurs only after actual removal or dismissal.
- Selected detail MUST use the active-current, active-browsed, ordinary-history or recovery composition below rather than a universal section order.
Readable permitted identity, known mode and terminal status/closed timestamp remain in the header; internal identifiers MUST NOT become an expanded Run record section.
Compact This run retains Started, Closed when known, and known nonzero pause duration.
One untitled neutral bottom callout provides guidance appropriate to that composition.
Finished is the Journal's sole history browser, including full pagination; there is no duplicate Recent Results column or separate View full history control.
- Current-stage choices and shared essence allocation remain editable only when the run permits them.
Browsing past or future stages never changes the executable stage and exposes no editable controls.
Historical authored requirements, actual spending, actual rolls and actual awards remain distinct evidence.
Journal result items MUST use the dense ListRow image/name/quantity form for current previews, browsed past and future stages, historical receipts, outcome tiers and rarity scales.
Only entitled projected names and images are displayed; unknown quantities remain Not recorded, and preview headings never imply inventory awards.
- Dismissal hides only a terminal record for the current user, persisted by actor UUID, run type and run ID.
It does not delete actor history, and another user retains independent visibility.
The same user's clients refresh on the first setting creation as well as later setting updates.
- Loading, error/retry, no-actor, empty and filtered-empty states remain explicit; an empty filter result does not erase selected detail.
Filtered-empty copy MUST say No matching active runs or No matching finished runs rather than claiming the actor has never had runs.
- All countdowns and timestamps are world-time based.
- **Single-step recipes suppress redundant step chrome.**
  A run whose projection reports `multiStep: false` (see `data-models/spec.md`) omits redundant stage navigation and Step X of Y labels.
  The current-stage requirements compose the shared slot and essence controls, with an accessible crafting-progress label where a progress bar is rendered.
  Single-step and multi-step active crafting guidance use their corresponding check or no-check explanation; terminal and recovery guidance take precedence over either active explanation.

#### Active current and browsed stages

The current-stage order MUST be identity/actions and applicable notices, progress/navigation, stage purpose/name, Produces above Consumes, current TIME/CHECK summaries, This run, and guidance.
An ingredient-route comparison MUST use visible RadioCardGroup choices showing each route's output through dense ListRow and its shortage or unresolved-selection consequence, including alternatives not selected.
A route label MUST be human-readable: an unnamed authored set takes its ordinal position, never its raw id.
A supplied material MUST NOT be painted short solely because another requirement blocks the whole plan; execution and candidate feasibility still respect the canonical shared-stock ledger.
Known physical shortage MUST disable execution — including the begin control at an unstarted stage's own start boundary — while keeping permitted selection repair available.
Automatic blockers MUST spend nothing and retain the completion preference.
An unavailable authority reason MUST remain visibly adjacent to disabled controls, and the stage and guidance MUST NOT invite execution while that reason applies.
No check, Nothing to roll and It simply completes require affirmative disclosed no-check configuration; protected or indeterminate configuration MUST say unavailable without removing owner actions.
A check-driven primary action MUST say Roll check.
A stage that has not started MUST offer its own begin control instead of the resolve action, stating that beginning locks the choices, consumes the listed materials and starts the clock, and MUST NOT offer the roll at all.
Its TIME card MUST say that its clock has NOT STARTED rather than fall through to the None used when a wait has MATURED, because those are opposite facts and the control beside them offers to start the clock.
The begin control MUST stay visible and reasoned even while its route remains unchosen; it MUST render DISABLED with a distinct choice-vs-materials reason rather than vanish and hand back an enabled resolve action the command would refuse, and the same disabled-while-unchosen rule applies to the resolve action itself on an untimed stage, which has no separate start boundary to withhold the begin control instead.
A started stage's materials surface MUST read as already consumed and MUST NOT be editable.
It MUST render that stage's recorded start-time consumption receipt — the items actually consumed with their recorded quantities, and the recorded per-carrier essence contributions — on one footing, whether a fixed component, a tag match or an essence carrier supplied them.
It MUST NOT render the live held-against-needed requirement probe there, because the stage has already emptied the inventory that probe reads.
The receipt MUST NOT be synthesised from the authored requirement snapshot, and a quantity the record does not carry MUST read as not recorded rather than borrow the requirement's own number.
A route nobody has chosen yet MUST be asked for rather than reported as a selected material that is no longer available; the repair sentence belongs to a route that vanished.

Past/future browsing MUST retain progress/navigation but omit separate TIME/CHECK summaries and current countdowns.
The browsed stage MUST pair its own inert Consumed/Produced or Will consume/Will produce evidence, including route or outcome-ladder output within that pairing, followed by This run and looking-back/ahead guidance.
Future input previews MUST enumerate every entitled authored requirement kind, option and route without selecting, consuming or persisting intent.
Future output copy MUST identify a future-stage preview rather than the current stage.
Past stages use recorded checks and routes; future choices open only when the stage becomes current.

#### Waiting on the player rather than on the clock

An unstarted stage has no countdown, so its run status alone reads the same whether it needs a choice, needs stock or needs nothing.
A run whose current stage cannot proceed until the viewer chooses (`awaitingChoice`, see `data-models/spec.md`) MUST therefore be distinguishable at a glance on the Active list row, on the opened run's header, and in the run's single state notice.
So MUST a stage that is waiting only for the player to BEGIN it: it owes nothing and is refused by nothing, so under the merged badge it otherwise reads exactly like a run counting world time down, while the act it needs is an irreversible click.
That signal is reported from the projection's own begin predicate (`actions.atStageStart` with `actions.beginStep`), so it can never invite a click the command refuses, and it is ranked UNDER the blocked states, because a stage that cannot be begun must not advertise that it can be.
That signal is carried BESIDE the run's status rather than in place of it, because what the clock is doing and what the player owes are two different facts.
Waiting on a choice MUST read as guidance and MUST NOT raise a refusal: an unbegun stage is ordinary play, exactly as `stageNotStarted` is.
Waiting on MATERIALS MUST read differently from waiting on a choice on every one of those surfaces, because one is fixed by choosing and the other by acquiring.

#### Ordinary closed history

Ordinary history MUST NOT show active progress, StageNav, editable materials, primary/pause/cancel/preference controls, countdowns, the TIME/CHECK pair, expanded Run record, or a titled What to expect card.
Typed recorded evidence, never localized mode text or subsequently edited configuration, selects the history branch.
Checked successful single-stage history MUST show Final check once, recorded materials/choices, actual Crafted, This run and closed guidance.
Confirmed no-check history uses Resolution instead; missing check evidence is Not recorded, never proof of No check.
A failed checked single-stage verdict owns its actual roll without a duplicate summary; failed no-check history may retain Resolution after its verdict.
Salvage results use Recovered and gathering results use Brought back instead of Crafted.
Materials used, Crafted and Tools used MUST use the same dense ListRow anatomy in four equal grid columns at both supported widths, with long names ellipsized and their complete text accessible.
Tools used MUST appear once for the attempted stages, including matching transient history, and MUST group only recorded actor-qualified physical Item identity.
Each occurrence MUST retain its stage association, recorded quantity and affirmative broken, virtual, spared and immune evidence; repeated use MUST NOT be summed or described as consumed tools, and absent breakage evidence MUST NOT be called intact.
Virtual and ambiguous identities MUST remain separate occurrence cards, and omitted tool evidence MUST NOT assert that no tools were used.

Multiple attempted stages MUST appear together under How each stage went with per-stage checks and paired actual consumed/produced evidence, without duplicate run-level Crafted or Final check.
An attempt requires completed/failed status or actual check/effect evidence; a preinitialized next stage or started timestamp alone does not establish execution.
Cancellation MUST NOT use a failed verdict or mark unexecuted stages successful.
Before any attempt, cancellation shows timing and cancellation guidance only; after one completed stage it shows compact prior effects, and after multiple stages it shows their ordered recaps.
Earlier awards/spending and known legacy refunds remain visible without implying a rollback of versioned effects.

Direct gathering history MUST show Resolution/No roll and actual Brought back once.
D100 history MUST preserve its recorded rolls, effective high-roll thresholds and cleared/missed outcomes in one historical scale, without duplicate Final check or Received lists.
An explicit shared root roll MUST retain one cut; legacy row-only rolls MUST render per row without a global cut, and equal row values MUST NOT establish sharing.
Each field and row MUST retain its known evidence independently: raw roll, effective roll when different, threshold, outcome and attributable actual quantity, including zero.
Unknown outcomes MUST remain neutral rather than missed; missing quantities MUST NOT hide known quantities on neighboring rows.
Actual receipts not uniquely attributed to a selected row MUST appear once below the scale, excluding receipts already represented by row quantities.
Unknown per-row award attribution MUST NOT erase known check evidence: retain those outcomes with Not recorded amounts and show the unattributed actual award once with an explanation.
Routed gathering success shows Final check, Brought back and How the check landed; routed failure shows its verdict and actual outcome log without repeating the log's roll in the verdict.
The full OutcomeLadder remains an active preview; its native selection bands and highest-matching/lowest-relative-fallback rule MUST be stated truthfully rather than adopting prototype low-roll semantics.

A matching just-resolved notice may temporarily own a single-record summary and receipts; reselecting clears it and restores ordinary history.
Its evidence band MUST be withheld entirely when it owns no rows — a multi-stage run's rows belong to its stage cards — rather than rendered empty, because an empty band still occupies its own line and unbalances the notice it sits in.
Stage recaps and d100 scales remain visible, and an unrelated notice MUST NOT suppress the selected account.
Successful positive awards use: "A closed run.
Its results are already in your inventory; the entry stays here as a record."
Failed final checks use: "This run failed its final check.
Failed runs are kept so you can see what was attempted and when."
Confirmed failed-no-output uses: "This run could not meet what it needed, so nothing was produced.
Failed runs are kept so you can see what was attempted and when."
Confirmed empty and zero-only successful receipts MUST state no items were awarded, while unknown quantities remain missing evidence; a zero row stays visible and never proves a positive award.
Cancellation guidance names recorded position or cancellation before resolution, forfeited time, no resume, retained prior spending and dismissal.
Truthful variants cover actual failure awards, legacy refunds, redaction and missing evidence.

#### Recovery precedence

Recovery takes precedence over ordinary closed success or failure, and retains confirmed, uncertain and unstarted distinctions without claiming every planned result reached inventory.
Versioned gathering awards MUST come from an applied createGatheredResults receipt rather than the terminal record's pre-effect plan.
An uncertain effect MUST NOT replay or trigger automatic rollback; guidance directs manual reconciliation under the authority contract.

### Run-Type-Aware Actions Panel

Versioned crafting and gathering actions use the shared RunActionBar and the projection's authoritative action availability.
It exposes pause/resume, manual execution, cancellation and an eligible completion preference with visible disabled reasons and busy state.
Arming cancellation replaces the sibling actions with confirm/keep controls in the bar.
The completion switch is visible on an actively counting-down stage without a player check even when unresolved materials block automatic execution.
Its displayed choices are Ask me (`manual`) and Complete (`worldTime`); the run-level preference survives automatic blockers and never grants permission to spend editable materials automatically.
The clock remains read-only; pausing a run never changes world time.

### Authority Reasons and Recovery

The authority ledger is provisioned automatically (`data-models/spec.md` _Authority Ledger and Recovery Boundary_), so no surface exposes a manual setup action and no player is ever asked to arrange one.
Every authority refusal MUST instead be reported as a readable localized reason drawn from one shared vocabulary, so a refusal never surfaces as `undefined`, as a raw reason code, or as silence.
A refusal reports the result's own message when it has one, then its localized reason, then the caller's generic failure text.
An unmapped reason MUST fall through to that generic rather than render its own slug.
Every surface that can mint a refusal reason keeps that vocabulary as its single home, including the module edges that report an absent command service, so the drift guard that re-derives the vocabulary can see every code a player may read.
An AVAILABILITY answer MUST fail CLOSED on a code it cannot word: `available: false` means the operation will be refused whatever the code says, so an unmappable reason renders the generic sentence and never restores an available presentation.

#### A failed check is an outcome, not a refusal

A `success: false` result is one of two different things, and no player surface may conflate them.
A REFUSAL is the authority declining to act: no check ran, nothing was spent, and it takes the refusal chain above.
A resolved FAILURE is the stage having run to a failed check, which is the system working as designed.
The two are told apart by the `disposition` the stage's own outcome mints — `failed` or `produced-on-failure` — because only a stage that ran can carry one; a run's `status` MUST NOT be used, since a refusal about an already-failed run carries the same word.

A resolved failure MUST be reported in its own words, which state that the check failed and assert NOTHING about what the attempt consumed.
The generic craft-failure text promises that nothing was consumed, and that promise is false whenever the recipe's `consumeIngredientsOnFail` or `breakToolsOnFail` policy spent something; the chat card is the surface that itemises it.
It MUST NOT be recorded as a command error on the Journal run, whose own history already records the outcome.
The Alchemy workbench banner MUST give it a distinct non-success state rather than the no-reaction fizzle, because the bench did react.

The player Crafting tab MUST refresh its listing after a resolved failure and record the outcome for the run summary, exactly as it does after a success.
A failed check can move the actor's inventory and the recipe's craftability, so returning early left both stale on screen and dropped the only record the run summary renders.

Any surface that offers to start or change a versioned run MUST NOT present it as available while the authority is unavailable.
In particular the player Crafting detail header MUST NOT read Ready to craft when the authority refuses; it shows the authority's reason in the recipe's own blocking callout and withholds the status chip.
The recipe's OWN blocking reason leads that callout and the authority's follows it, because the recipe's is the cause the player can act on while a transient authority state usually is not.
The authority's line MUST also state its consequence for the primary craft action, which stays enabled on an otherwise craftable recipe: availability is a cache, and a stale refusal that disabled the only call to action would leave the player no way to clear it.

Recovery details MUST distinguish confirmed receipts, an uncertain applying effect and unstarted effects without treating planned amounts as received awards.
They MUST explain that a retained claim can block other runs until the active GM manually records a disposition through `reconcileJournalRunAuthority({ claimId, disposition })`.
Automatic provisioning MUST NOT clear a retained claim; reconciliation remains manual and follows the separate non-replayable recovery contract in `data-models/spec.md`.

### Legacy Run Actions

Legacy actions retain the projection's `manualAdvance` contract:

- **Crafting (`manualAdvance: true`)** shows a primary advance button.
  It uses the shared check-aware primary copy: Roll check for a disclosed check, Brew for alchemy, otherwise Complete stage or Complete on the final stage.
  The left run card's matured countdown reads Ready to finish on the final stage rather than Ready to continue.
  It is DISABLED until the active step's time gate has matured — readiness is derived from `timeGate.availableAt <= worldTime` (race-free), NOT from the run's persisted status — and while an advance is in flight.
  Triggering invokes the crafting advance contract in `recipes-and-steps/spec.md` (_Run Progression — Player-Initiated Advance_); the final-step variant is copy-only and re-enters the same advance flow.
- **Legacy gathering / salvage (`manualAdvance: false`)** show an explanatory "resolves automatically when world time advances" line plus the time-remaining box, and offer no trigger button, because those matured runs auto-resolve on world time.

### World-Time Disclosure

The player Journal header MUST paint one shared surface behind the actor area and world clock, without a second translucent fill under the actor area.
The clock MUST retain the WorldClockChip info treatment and canonical geometry.
Every gathering identity without an entitled task image MUST use `icons/containers/bags/pouch-leather-brown-green.webp`; disclosed task imagery and explicit GM secret previews MUST retain their entitled image when present.

The Journal shows a read-only WorldClockChip using the existing calendar formatter and fallback.
The shared clock identifies the time domain; all detail countdowns and compact This run timestamps MUST use that same world-time domain.

### Crafting / Alchemy Viewer Redaction

Runs of recipes the viewer cannot see are redacted, mirroring the gathering blind-run redaction (`ui-gathering-app/spec.md` _Rich Gathering Disclosure_):

- A crafting or alchemy run whose recipe is undiscovered or knowledge-gated for the viewer, or whose recipe no longer resolves, is shown with a generic localized title (`FABRICATE.App.Journal.Redacted.Title`), a default image, and no recipe id, steps, results, or failure detail.
- GM viewers and globally-visible recipes are never redacted.
- The redaction is enforced in the projection (`data-models/spec.md` _Run Journal Projection_), so no hidden crafting/alchemy recipe identity reaches a non-GM viewer through the Journal.
- **Redaction hides IDENTITY ONLY and is never an authorization gate** (issue 966).
A redacted crafting run retains its manual-advance compatibility signal and the owner actions its lifecycle permits, subject to the same authority, pause, execution/recovery and unsupported-version refusals as a visible run.
Legacy crafting requires manual advancement: its world-time processing only flips a matured `waitingTime` step to `inProgress`.
Versioned checks and automatic blockers also require owner actions, so redaction must not suppress those affordances.
Alchemy makes that the DEFAULT case: brewing is never gated by visibility, and discovery lands at FINISH, so an undiscovered timed brew could never reach the FINISH that would have revealed it.
- Because a redacted model carries no `recipeId`, `Fabricate#advanceCraftingRun` resolves the recipe from the PERSISTED RUN rather than from its caller.
The client-supplied `recipeId` is ignored; trusting it also allowed advancing one run while naming another run's recipe.
- The initial versioned secret-check prompt MUST remain generic, omitting protected subject names, artwork, formula, DC and modifier details before any reply leaves the GM.
Secret evaluation uses GM private posting and a sanitized response without player roll-data handoff.
A non-secret evaluated-roll handoff MUST separately recheck the initiating viewer's entitlement after commit; this cannot substitute for initial-prompt redaction.
