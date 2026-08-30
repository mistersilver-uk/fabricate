/**
 * designSystemPrimitives.js
 *
 * The machine-readable half of the `design-system` capability: one row per shared UI primitive,
 * keyed on the implementation path a diff names.
 *
 * `openspec/specs/design-system/spec.md` says the shared primitive set "MUST be the set enumerated
 * in this capability" and that a primitive enters it by "adding its entry to this capability". The
 * prose states the rule; it enumerates nothing. The vocabulary lives only in `library.html`, as
 * names inside its `div.spec-head > h4` blocks, which no gate and no script can consult. This
 * module is the enumeration those sentences point at.
 *
 * WHY THIS IS A MODULE IN `scripts/lib/` AND NOT A LIST IN `tests/`
 * -----------------------------------------------------------------
 * The dependency direction is fixed: tests already import from `scripts/lib/`, and nothing in
 * `scripts/` imports from `tests/`. `svelteComponentFiles.js` beside this file is the exact
 * precedent, and its docblock states the same rationale — two independent consumers must agree on
 * a set and are meaningless if they disagree. Here the consumers are `viewLabCases.js`, which
 * derives its broad-signal routing from the `evidence: 'broad'` rows, and the integrity properties
 * in `tests/design-system-primitives.test.js`.
 *
 * It is a `.js` module rather than JSON because every registry in this repository carries its
 * reason in prose beside the entry, and a reason is the whole value of a row like `FillBar` or
 * `ImagePathPicker` below.
 *
 * Pure and dependency-free — no imports at all, no I/O, no autorun — so it is safe to import from
 * `node --test` and from any script.
 *
 * ── ROW SHAPE ──────────────────────────────────────────────────────────────────────────────────
 *
 *   { path, library, status, evidence, why }
 *
 * `path`    Repository-relative POSIX path of the shipped implementation, exactly as a diff names
 *           it. Asserted to exist on disk.
 * `library` The name of this primitive's entry in `openspec/specs/design-system/library.html`,
 *           written as it appears there (`'<Stepper>'`), or `null`.
 * `status`  `'shipped'` for a member of the set; `'not-a-primitive'` for a file that lives in a
 *           primitive directory and is NOT a member. See {@link NOT_A_PRIMITIVE}.
 * `evidence` `'broad'` or `'targeted'`. See below — this is the field with consequences.
 * `why`     The judgement, in prose. For a `null` library, why the correspondence is not made; for
 *           a non-member, its callers named, or the fact that it has none.
 *
 * The two halves of the conformance question are the two ways a row can be incomplete:
 *
 *   |                | `library` set          | `library: null`           |
 *   |----------------|------------------------|---------------------------|
 *   | `path` set     | conformant             | shipped but undocumented  |
 *   | `path: null`   | specified, not built   | rejected by the gate      |
 *
 * No row carries `path: null` today: this module enumerates what SHIPS. The specified-but-unbuilt
 * quadrant belongs to the conformance gate that reads `library.html`, which is deliberately a
 * later change in this programme (issue 1378) — this one builds the machine-readable half it will
 * read.
 *
 * ── HOW `library` IS ASSIGNED, AND WHEN IT IS NULL ─────────────────────────────────────────────
 *
 * A name is recorded only when the library entry names the primitive AND the shipped file IS that
 * primitive today. A shipped file the library records as COLLAPSING INTO a primitive it is not yet
 * — the catalogue pickers at `library.html:764` are the live example — takes `null`, with the
 * target named in `why`. Guessing there would fill the "conformant" quadrant with work that has
 * not been done, which is the one thing a conformance manifest must never do.
 *
 * `tests/design-system-primitives.test.js` asserts only that a recorded name is SPELLED as
 * `library.html` spells it. That is a mirror guard against inventing a name, not the conformance
 * gate; the gate is the next change.
 *
 * ── `evidence`, AND WHY IT IS A JUDGEMENT RATHER THAN A LOCATION ───────────────────────────────
 *
 * `evidence` answers: can a change to this file be attributed to particular View Lab frames?
 *
 *   `'broad'`     No. It has enough consumers that any frame is arbitrary, so a change to it
 *                 publishes the representative pair (plus any `BROAD_SIGNAL_CASE_OVERRIDES` entry
 *                 naming a frame that renders its deliberate state).
 *   `'targeted'`  Yes. Its consumers are few and named, and the cases that render it claim it by
 *                 `sourceMatches`.
 *
 * It is NOT a synonym for location, and the ten `'targeted'` rows under `apps/manager/` are the
 * proof. `viewLabCases.js` records that the four bulk-edit chrome files are DELIBERATELY excluded
 * from the broad-signal set because they have exactly two consumers each, so targeted attribution
 * is "both possible and honest"; `BulkDeleteCard` is excluded separately, because
 * `scripts/ui-pr-screenshot-evidence.mjs` routes it to the four `*-bulk-delete-*` frames that
 * actually photograph it. Making either broad here would have the two registries disagree about
 * what evidence a change to one of them requires.
 *
 * The consequence runs the other way too, and it is the defect issue 1378 names. A `'targeted'`
 * row placed under `src/ui/svelte/components/` is swallowed by that directory leg of
 * `BROAD_SIGNAL_PATTERN` whatever judgement is recorded beside it — a directory cannot tell a
 * primitive from a component that merely lives there. Property (c) of the integrity test is what
 * reports that, by asserting each row's `evidence` against what the pattern actually matches.
 *
 * ── THE MEMBERSHIP BAR ─────────────────────────────────────────────────────────────────────────
 *
 * `spec.md:29` — two or more INDEPENDENT callers. An importer is any other file under `src/` that
 * imports the component by path. Five files under `src/ui/svelte/components/` fall below the bar
 * and are recorded in {@link NOT_A_PRIMITIVE} rather than omitted, because `spec.md:30` requires a
 * candidate with fewer to be "recorded as ruled out WITH ITS CALLERS NAMED — or with the fact that
 * it has none — so the absence is a decision rather than an oversight".
 *
 * ── WHAT THIS MODULE IS DELIBERATELY NOT ───────────────────────────────────────────────────────
 *
 * `SHARED_PRIMITIVES` in `tests/components/mounted-harness-primitive-allowlist.test.js` is NOT
 * derived from this manifest and must not become so. It answers a different question — can
 * omitting this file HANG a mounted tree — and three of its entries are on it at one caller, or
 * from a nested directory, for recorded reasons the two-caller predicate structurally cannot
 * express (`EssenceQuantityCard`, `InspectorActionButton`, `RowDisclosure`). Deriving it here
 * would silently drop those three, and a missing entry there does not fail a suite: it hangs it
 * and reports `# cancelled`.
 */

/**
 * The manager's own primitive directory, as a diff names it. Primitives sit DIRECTLY under it,
 * mixed in with feature views, which is why the manager's set has to be named rather than globbed.
 *
 * Module-private: the paths themselves are the manifest's interface, and a second exported way to
 * ask where a primitive lives is a way for two callers to disagree.
 */
const MANAGER_PRIMITIVE_DIRECTORY = 'src/ui/svelte/apps/manager/';

/**
 * Order two strings by code point, ascending.
 *
 * Explicit rather than `sort()`'s default, which is not "sort strings" but "stringify, then order
 * by code point" — the same result here, reached by an implicit conversion SonarCloud flags as a
 * bug (`javascript:S2871`). `localeCompare` is deliberately NOT used: it is locale-dependent, so
 * two machines could order `EmptyState` and `EditorValidationSurface` differently and produce two
 * different `BROAD_SIGNAL_PATTERN` sources for the same manifest. This mirrors
 * `svelteComponentFiles.js`, which sorts the same way for the same reason.
 *
 * @param {string} left
 * @param {string} right
 * @returns {number} negative, zero or positive per the `Array#sort` contract
 */
function byCodePoint(left, right) {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/**
 * The shipped shared primitive set: every file that meets the capability's two-caller bar and sits
 * in one of the two primitive directories.
 *
 * Authored alphabetically for reading. Nothing may DEPEND on that order — every derivation below
 * sorts explicitly, because an authoring order that happens to be sorted is a coincidence and the
 * first hand-added row appended in the wrong place would silently change what the derivation emits.
 *
 * @type {readonly {path: string, library: string|null, status: string, evidence: string, why: string}[]}
 */
export const DESIGN_SYSTEM_PRIMITIVES = Object.freeze([
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
    library: null,
    status: 'shipped',
    evidence: 'broad',
    why: 'The two-step arm-then-confirm destructive control (4 callers). `library.html:570` specifies `danger` as one of six ROLES on the single button primitive and `library.html:1815` records a bespoke destructive panel as a surface Foundry already owns, so the arm is a carve-out neither entry claims by name.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/BulkDeleteCard.svelte',
    library: null,
    status: 'shipped',
    evidence: 'targeted',
    why: 'The shared bulk-DELETE card (3 callers, issue 1132). `library.html:1058` specifies `<SelectionBar>` and `<BulkEditPanel>` for this surface and names no delete card. Targeted because it renders in all three studios but is photographed only by the four `*-bulk-delete-*` frames, which `ui-pr-screenshot-evidence.mjs` routes it to; the bulk-EDIT frames do not contain it.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte',
    library: '<BulkEditPanel>',
    status: 'shipped',
    evidence: 'targeted',
    why: 'The bulk panel shell (3 callers, issue 1010). `library.html:1058` names it and calls this "the largest uncovered surface in the corpus". Targeted: exactly two studios consume it and both claim it by `sourceMatches`.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/BulkEditSection.svelte',
    library: null,
    status: 'shipped',
    evidence: 'targeted',
    why: 'A section inside the bulk panel (3 callers, issue 1010). `library.html:1058` specifies the PANEL, not its internal sectioning. Targeted for the same reason as its shell.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/BulkEditSelect.svelte',
    library: null,
    status: 'shipped',
    evidence: 'targeted',
    why: "The bulk panel's leave-unchanged select (2 callers, issue 1010). `library.html:646` specifies `<Select>` as one shell shared with text, number and search, and records the leave-unchanged clear state on `<TintPicker>` rather than on the field shell. Targeted for the same reason as its shell.",
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
    library: '<SelectionBar>',
    status: 'shipped',
    evidence: 'targeted',
    why: 'The bulk selection toolbar (3 callers, issue 1010). Named at `library.html:1058`. Targeted for the same reason as its shell.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/Callout.svelte',
    library: '<Callout>',
    status: 'shipped',
    evidence: 'broad',
    why: 'Named at `library.html:911`. 7 callers across the manager, so no frame is a non-arbitrary choice.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/Chip.svelte',
    library: '<IconChip>',
    status: 'shipped',
    evidence: 'broad',
    why: 'The highest-traffic primitive in the codebase at 67 callers. `library.html:858` groups `<Kicker> <IconChip> <StatBox>` as the mark vocabulary and this is the icon chip. Broad by an enormous margin — attributing a chip change to one window would be a lie about where it lands.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/ComplicationSummaryRow.svelte',
    library: null,
    status: 'shipped',
    evidence: 'targeted',
    why: 'The complication summary row (5 callers, reaching the player crafting and inventory apps as well as the component editor). `library.html:1429` names component complications among the rows `<SortableList>` "opens in place", so this row is specified as a STATE of that primitive rather than as an entry of its own. Targeted: three complication frames claim it, led by `manager-component-complications-collapsed`.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/EditorTabs.svelte',
    library: '<TabBar>',
    status: 'shipped',
    evidence: 'targeted',
    why: 'The editor tab strip (3 callers — the system, environment and recipe-item editors each wrap it). `library.html:1008` specifies `<PageHeader> <TabBar>` and states that a studio never puts its tabs in a side rail. Targeted: one frame per wrapping editor claims it.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/EditorValidationSurface.svelte',
    library: null,
    status: 'shipped',
    evidence: 'broad',
    why: 'The editor validation surface (2 callers). `library.html:1084` splits validation into `<ValidationList>` and `<ValidationSummary>` and records the shipped component as having three callers; this one component covers both roles and has two, so the correspondence is not established and is left for the conformance change to adjudicate rather than guessed at here.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/EmptyState.svelte',
    library: '<Empty>',
    status: 'shipped',
    evidence: 'broad',
    why: 'Named at `library.html:911`. 43 callers, second only to `Chip`. Carries a `BROAD_SIGNAL_CASE_OVERRIDES` entry because both representative frames are POPULATED states, so the dashed panel it draws appears in neither.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/ExplainerCard.svelte',
    library: null,
    status: 'shipped',
    evidence: 'broad',
    why: 'The explainer card (3 callers). `library.html:911` groups `<Callout> <Notice> <InfoStrip> <Empty>` under one head and carries no prose distinguishing `<Notice>` from `<InfoStrip>`, so which of the two this card is cannot be read off the library.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/IconFactRow.svelte',
    library: null,
    status: 'shipped',
    evidence: 'broad',
    why: 'The labelled icon-and-fact row (5 callers). `<StatBox>` (`library.html:858`) is the nearest mark, but a stat box is a boxed value and this is a row of label-plus-fact, so the correspondence is not made.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/InlineVocabularyAdd.svelte',
    library: null,
    status: 'shipped',
    evidence: 'targeted',
    why: 'The inline vocabulary add field (2 callers, `VocabularyPanel.svelte` and `ImportFolderMappingModal.svelte`). No `library.html` entry names it. Targeted: `manager-tags-categories-normal` claims it.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/ItemDropZone.svelte',
    library: '<LinkField>',
    status: 'shipped',
    evidence: 'broad',
    why: '`library.html:747` — "How a Fabricate record points at a game-world document. Three states in one component." 6 callers spread across the checks, component, essence, recipe-item and tool editors, which is why no single frame is the honest evidence.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/ManagerModal.svelte',
    library: '<Modal>',
    status: 'shipped',
    evidence: 'broad',
    why: '`library.html:1104` and `:1137` name it and its two callers — the import folder-mapping step and the import report — and `:1137` records that ruling it out as single-caller was wrong.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/RadioCardGroup.svelte',
    library: '<OptionCards>',
    status: 'shipped',
    evidence: 'broad',
    why: '`library.html:626` — "A radio group with room to explain itself." 9 callers.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/ResolutionModeCard.svelte',
    library: null,
    status: 'shipped',
    evidence: 'targeted',
    why: 'The resolution-mode chooser card (2 callers, `CraftingSettingsView.svelte` and `GatheringEconomyView.svelte`). `library.html:1606` defers the modes themselves to the resolution-modes capability and specifies no card for choosing one. Targeted: `manager-system-edit-normal` claims it.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/RollDataExpressionInput.svelte',
    library: '<ExprInput>',
    status: 'shipped',
    evidence: 'broad',
    why: '`library.html:1510` and `:1516` — cursor insertion and an actor resolver are behaviour nothing else owns, which is why it is a primitive where `<Bounds>` and `<Currency>` are compositions.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/SearchablePopover.svelte',
    library: '<SearchPopover>',
    status: 'shipped',
    evidence: 'broad',
    why: '`library.html:764` — "One panel for picking anything from a catalogue". 16 callers. Carries a two-entry `BROAD_SIGNAL_CASE_OVERRIDES` entry because its two modes render different chrome and neither representative frame opens a popover at all.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    library: '<Segmented>',
    status: 'shipped',
    evidence: 'broad',
    why: '`library.html:613` — two to four named options, exactly one chosen, rendered as a radio group. 11 callers.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/SubjectModifierPicker.svelte',
    library: null,
    status: 'shipped',
    evidence: 'targeted',
    why: 'The subject-and-modifier picker (2 callers, `ComponentEditView.svelte` and `GatheringTaskEditView.svelte`). `library.html:1406` specifies `<RuleRow>` and `<RuleSentence>` as the condition editor behind "triggers, gates and modifiers", so this picker is specified as part of that editor rather than as an entry of its own. Targeted: one modifier-pick frame per caller claims it.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/ToggleCard.svelte',
    library: null,
    status: 'shipped',
    evidence: 'broad',
    why: "A titled card wrapping a binary control (7 callers). `<Toggle>` (`library.html:595`) is the bare control and `<Card>` (`:941`) is the container, so a card-plus-toggle is a COMPOSITION of two entries under `spec.md:28` rather than an entry itself. Recorded here because it SHIPS with seven callers; whether the set should contain it is the conformance change's question.",
  }),
  Object.freeze({
    path: 'src/ui/svelte/components/ChanceSlider.svelte',
    library: null,
    status: 'shipped',
    evidence: 'broad',
    why: 'A single-value percentage slider (4 callers). `<RangeBar>` (`library.html:714`) specifies a TILED strip of spans whose dividers are dragged, which is `ThresholdBandStrip`, not this.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/components/CollapsibleGroupHeader.svelte',
    library: null,
    status: 'shipped',
    evidence: 'broad',
    why: 'The category-group header of a grouped browser list (2 callers). `<ListRow>` (`library.html:1033`) specifies the ROW; the group header above a run of rows is not one of the four entries under that head.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/components/EssenceSourceSelector.svelte',
    library: null,
    status: 'shipped',
    evidence: 'broad',
    why: 'The essence source picker (2 callers). `library.html:764` names essences among the catalogues its four existing pickers COLLAPSE INTO `<SearchPopover>`; this file is one of those pickers and is not that panel today, so recording the name would fill the conformant quadrant with work not done.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/components/FillBar.svelte',
    library: null,
    status: 'shipped',
    evidence: 'broad',
    why: 'The product\'s one horizontal fill bar (2 callers). `library.html:872` splits the instrument into `<Meter>`, `<BandedBar>` and `<StageBars>` and states that merging them leaves one component unable to carry a correct accessible role, "which is why the shipped fill leaf renders none" — this is that leaf, so it corresponds to no single entry by the library\'s own account.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/components/IconPicker.svelte',
    library: null,
    status: 'shipped',
    evidence: 'broad',
    why: 'The shared icon picker (8 callers, issue 1269). `library.html:764` names icons FIRST among the catalogues collapsing into `<SearchPopover>`; same reasoning as `EssenceSourceSelector`. Carries a `BROAD_SIGNAL_CASE_OVERRIDES` entry because everything it presents exists only in the open popover and neither representative frame opens one.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/components/ManagerButton.svelte',
    library: '<Button>',
    status: 'shipped',
    evidence: 'broad',
    why: '`library.html:570` — one component, six roles, two sizes, each role naming a VERB. The shipped `role` prop is that closed set, made required-shaped precisely because the CSS-convention version drifted. 50 callers, the most of anything under `components/`.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/components/ManagerColorPopover.svelte',
    library: '<TintPicker>',
    status: 'shipped',
    evidence: 'broad',
    why: '`library.html:797`. 4 callers. The tint swatch panel; its sibling `ManagerColorPicker.svelte` is the single-caller trigger and is recorded in `NOT_A_PRIMITIVE`.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/components/Medallion.svelte',
    library: null,
    status: 'shipped',
    evidence: 'broad',
    why: "The flat identity tile for recipe rows and inspectors (13 callers). `<Avatar>` (`library.html:1225`) is a person mark in a rail; this renders a record's linked image with a glyph fallback, so the correspondence is not made.",
  }),
  Object.freeze({
    path: 'src/ui/svelte/components/ModifierPillSelect.svelte',
    library: null,
    status: 'shipped',
    evidence: 'broad',
    why: 'A dropdown-plus-removable-pills multi-select (2 callers, issue 770). `<SetPicker>` (`library.html:1333`) specifies editing membership of a set too large to render inline, and states it never dumps the whole set into its panel — this control renders every unselected option in a listbox, so it is not that primitive.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/components/Pagination.svelte',
    library: '<Pagination>',
    status: 'shipped',
    evidence: 'broad',
    why: 'Named at `library.html:1196`. 22 callers across every browse surface in the manager.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/components/SelectionCheckbox.svelte',
    library: '<Checkbox>',
    status: 'shipped',
    evidence: 'broad',
    why: '`library.html:689` — "The box a gate list and a selection header both use", including the tri-state a some-rows-selected header needs. 8 callers.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/components/StatusPill.svelte',
    library: null,
    status: 'shipped',
    evidence: 'broad',
    why: "The row and inspector state pill, six tones (13 callers). The library's mark vocabulary (`library.html:835`, `:858`) specifies marks that carry KIND; this pill carries STATE, and `library.html:348` states that colouring a chip background by kind would double-code kind against state — so it is deliberately not one of those marks.",
  }),
  Object.freeze({
    path: 'src/ui/svelte/components/Stepper.svelte',
    library: '<Stepper>',
    status: 'shipped',
    evidence: 'broad',
    why: '`library.html:551` — "The most-used control in the app", and 23 callers here agree. Carries a `BROAD_SIGNAL_CASE_OVERRIDES` entry naming the gathering economy actor frame, which is the only published frame that renders filled steppers, disabled steppers and a rolled-max placeholder at once.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/components/ThresholdBandStrip.svelte',
    library: '<RangeBar>',
    status: 'shipped',
    evidence: 'broad',
    why: '`library.html:714` — a tiled strip of spans whose dividers are dragged, "outcome tiers against a DC", which is exactly this. Exactly 2 callers, `checks/CraftingCheckEditor.svelte` and `checks/SimpleCraftingCheckEditor.svelte`, and it carries a two-entry `BROAD_SIGNAL_CASE_OVERRIDES` entry because those are its two modes and each renders chrome the other does not.',
  }),
]);

/**
 * Files that sit in a primitive directory and are NOT members of the set.
 *
 * Recorded rather than omitted because `spec.md:30` requires it: a candidate below the two-caller
 * bar is "recorded as ruled out WITH ITS CALLERS NAMED — or with the fact that it has none — so
 * the absence is a decision rather than an oversight, and so a later reader can re-test the count
 * rather than re-derive it".
 *
 * These rows carry `evidence: 'broad'` truthfully rather than aspirationally: all five live under
 * `src/ui/svelte/components/`, so `BROAD_SIGNAL_PATTERN`'s directory leg matches them today
 * whatever anyone thinks of them. That is the point issue 1378 makes — a directory cannot tell a
 * primitive from a component that merely lives there — and it is why the integrity test runs its
 * per-row clauses over THESE rows too. The disk clause in particular is live here: two of the five
 * name files nothing imports.
 *
 * @type {readonly {path: string, library: string|null, status: string, evidence: string, why: string}[]}
 */
export const NOT_A_PRIMITIVE = Object.freeze([
  Object.freeze({
    path: 'src/ui/svelte/components/ActorSelectTopBar.svelte',
    library: null,
    status: 'not-a-primitive',
    evidence: 'broad',
    why: 'ONE caller, `src/ui/svelte/apps/FabricateAppRoot.svelte`. At 594 lines it is a screen region rather than a primitive; `<AppTitleBar>` (`library.html:960`) specifies the strip above the page header and nav rail, and whether this is an implementation of it has not been adjudicated.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/components/DropZone.svelte',
    library: null,
    status: 'not-a-primitive',
    evidence: 'broad',
    why: 'ZERO callers — dead code. Nothing under `src/` imports it. (`ItemDropZone.svelte` under `apps/manager/` is a different file with six callers and is the shipped link field; a basename search that does not anchor on the path separator will conflate the two and report six callers here.)',
  }),
  Object.freeze({
    path: 'src/ui/svelte/components/ImagePathPicker.svelte',
    library: '<ArtPathPicker>',
    status: 'not-a-primitive',
    evidence: 'broad',
    why: 'ZERO callers — dead code, and the one row where the library and the tree disagree in the interesting direction: `library.html:797` specifies `<ArtPathPicker>`, and a file implementing it ships, and nothing imports it. Specified and built is not the same as shipped.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/components/ManagerColorPicker.svelte',
    library: null,
    status: 'not-a-primitive',
    evidence: 'broad',
    why: 'ONE caller, `src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte`. The `<TintPicker>` entry is carried by its sibling `ManagerColorPopover.svelte`, which has four.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/components/RowDisclosure.svelte',
    library: '<RowDisclosure>',
    status: 'not-a-primitive',
    evidence: 'broad',
    why: 'ONE caller, `src/ui/svelte/apps/manager/ComplicationSummaryRow.svelte`. Named at `library.html:941`, so it is specified and shipped and still below the entry bar. It is separately on `SHARED_PRIMITIVES` in `tests/components/mounted-harness-primitive-allowlist.test.js:83` for a reason the caller count cannot express — omitting it there HANGS a mounted tree — which is why that list is not derived from this manifest.',
  }),
]);

/**
 * The ruled-out register, mirroring `spec.md:586-597` and `library.html:1802-1818`.
 *
 * Part of the specification, not commentary: `spec.md:588` requires declined candidates to be
 * recorded with the reasoning that declined them "so that the absence of a primitive is legible as
 * a decision", and `spec.md:599` says a re-proposal must address the recorded reasoning and,
 * absent new evidence, use the composition instead.
 *
 * `verdict` is `'composition'` (it decomposes entirely into members already in the set),
 * `'out-of-scope'` (declined for a product reason rather than a structural one) or `'foundry-owns'`
 * (Foundry already provides the surface). `replacement` is the composition or the API to use.
 *
 * The library's two aggregate wells are deliberately NOT rows here. "Five more" (`:1815`) names
 * five candidates in a sentence without individual reasoning, and "Graph canvas" (`:1816`) is a
 * zero-caller placeholder behind an experimental flag that "re-enters the set with the work that
 * ships it" — neither is a declined candidate with its own recorded judgement, and inventing rows
 * for them would put words in the register that the specification does not contain.
 *
 * @type {readonly {name: string, verdict: string, replacement: string|null, why: string}[]}
 */
export const RULED_OUT = Object.freeze([
  Object.freeze({
    name: '<MemberRow>',
    verdict: 'composition',
    replacement: 'ListRow + `leading`',
    why: 'List row geometry with a portrait in the leading cell — structurally identical to the inline-title row already declined.',
  }),
  Object.freeze({
    name: '<ActorPicker>',
    verdict: 'composition',
    replacement: 'trigger + SearchPopover',
    why: 'A pill trigger that opens the popover — which already counted it as one of its four callers.',
  }),
  Object.freeze({
    name: '<AddButton>',
    verdict: 'composition',
    replacement: 'Button role=dashed',
    why: 'Dashed is a role on the button that owns the meaning. "Sits in flow with its collection" is a usage rule, not a boundary.',
  }),
  Object.freeze({
    name: '<RailCard>',
    verdict: 'composition',
    replacement: 'Well + Kicker + Button',
    why: 'A composition that also smuggled back the 34px button size the set retires by name.',
  }),
  Object.freeze({
    name: '<FeatureCard>',
    verdict: 'composition',
    replacement: 'OptionCards, non-interactive',
    why: 'Two ABSENT props on an identical shape is a props difference, not a distinction.',
  }),
  Object.freeze({
    name: '<BoundsInput>',
    verdict: 'composition',
    replacement: 'two Steppers',
    why: '"Two steppers with a rule between", by its own spec.',
  }),
  Object.freeze({
    name: '<CurrencyInput>',
    verdict: 'composition',
    replacement: 'Stepper + Select',
    why: 'A composition, and wrong about the domain: it assumed a flat world-scoped coin ladder where the model defines a per-system acyclic denomination DAG.',
  }),
  Object.freeze({
    name: '<PremiumPanel>',
    verdict: 'out-of-scope',
    replacement: null,
    why: 'A screen, not a primitive. Its one original claim is copy — a product decision — and binding copy to a component makes the offer untranslatable against a codebase where every primitive takes pre-localized strings. Canon also forbids any premium signal in the player window.',
  }),
  Object.freeze({
    name: '<Toast>',
    verdict: 'foundry-owns',
    replacement: 'ui.notifications',
    why: 'Foundry owns transient feedback and renders its own toasts over the module window regardless.',
  }),
  Object.freeze({
    name: 'Destructive panel',
    verdict: 'foundry-owns',
    replacement: 'confirmDialog',
    why: 'Canon makes the dialog the default for manager confirmations; the arm is the carve-out.',
  }),
]);

/**
 * The shipped primitive paths carrying a given evidence judgement, in code-point order.
 *
 * SORTED EXPLICITLY. Callers derive regular expression sources from this, and a derivation whose
 * output depends on the manifest's authoring order is a derivation that changes the day someone
 * appends a row instead of inserting it alphabetically.
 *
 * Covers {@link DESIGN_SYSTEM_PRIMITIVES} only, never {@link NOT_A_PRIMITIVE}: a non-member must
 * not be able to widen the broad-signal set by being listed. The integrity test asserts the
 * evidence judgement of the non-member rows separately.
 *
 * @param {string} evidence `'broad'` or `'targeted'`
 * @returns {string[]} repository-relative POSIX paths
 */
export function primitivePathsByEvidence(evidence) {
  return DESIGN_SYSTEM_PRIMITIVES.filter((row) => row.evidence === evidence)
    .map((row) => row.path)
    .sort(byCodePoint);
}

/**
 * The basenames, extension stripped, of the manager's own primitives carrying a given evidence
 * judgement — in code-point order.
 *
 * The manager's primitives sit DIRECTLY under `apps/manager/`, mixed in with feature views, so
 * they cannot be selected by a directory glob the way `components/` can: a glob there would
 * swallow `RecipesBrowserView.svelte` too. Consumers therefore need the names, and this is where
 * they come from.
 *
 * @param {string} evidence `'broad'` or `'targeted'`
 * @returns {string[]} component basenames without the `.svelte` extension
 */
export function managerPrimitiveNamesByEvidence(evidence) {
  return primitivePathsByEvidence(evidence)
    .filter((path) => path.startsWith(MANAGER_PRIMITIVE_DIRECTORY) && path.endsWith('.svelte'))
    .map((path) => path.slice(MANAGER_PRIMITIVE_DIRECTORY.length, -'.svelte'.length));
}
