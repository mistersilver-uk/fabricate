/**
 * How often `styles/fabricate.css` writes one selector into more than one rule (issue 1501).
 *
 * THIS IS A DESCRIPTION OF DELIBERATE AUTHORING, NOT A DEFECT COUNT, and that is the whole reason
 * it lives here rather than in `design-system-known-debt.json`. Every row in that table is
 * something `openspec/specs/design-system/spec.md` already prohibits. Nothing in this one is: the
 * sheet's repetition is almost entirely a selector appearing in one comma-separated LIST and again
 * in a DIFFERENT list — shared-list authoring, three instances of it carrying a comment saying so —
 * and `stylelint`'s `no-duplicate-selectors` is enabled on the sheet and green, because its default
 * `disallowInList: false` is exactly what makes those two facts compatible. Issue 1501 measured the
 * population of repeated full selector LISTS, the only population a merge could act on, and found
 * it EMPTY. So this table exists to say what the shape of the sheet is, and to make a change to
 * that shape an edit somebody signed rather than a drift nobody saw.
 *
 * ── AN EXACT PIN, NOT A CEILING ─────────────────────────────────────────────────────────
 * `assertRatchet` reds on a SHRINK and on a VANISHED key just as loudly as on growth, and that is
 * the behaviour wanted here rather than a side effect tolerated. A row leaving this table means a
 * shared selector list was split or a rule deleted, which moves declarations through the cascade;
 * a row arriving means a list was widened or a rule copied. Both are edits a reviewer should see,
 * and neither is wrong on its face. The remedy for either is the same: re-derive the table and say
 * in the pull request which rule moved and why.
 *
 * ── WHAT THE KEY IS ─────────────────────────────────────────────────────────────────────
 * `<at-context chain> | <normalised selector>`, with `(top level)` for a rule under no at-rule at
 * all, and the chain joined by ` >> ` when a rule is nested. The at-context is part of the key
 * because two rules under different conditions are never the same rule: the same selector inside
 * a `@container` and at the top level is two different pieces of authoring, and merging them is
 * not a thing that can be done. Keyed on the selector ALONE the sheet holds 206 repeated selectors
 * rather than these 112, and both figures are published so a reader can tell which produced a pin.
 *
 * ── WHY THE TABLE IS FILTERED TO count >= 2 ─────────────────────────────────────────────
 * Unfiltered, the sheet holds 3,042 `(at-context, selector)` keys, of which 2,930 appear exactly
 * once. `assertRatchet` compares the observed tally against the baseline key by key, so an
 * unfiltered table would report every singleton as new debt the first time anybody added a rule,
 * and the gate's output would be unreadable on the day it mattered. The filter is applied on BOTH
 * sides — the gate tallies only repeated selectors too — so a selector falling to one appearance
 * is a VANISHED row rather than a silent pass.
 *
 * ── WHERE THE NUMBERS COME FROM ─────────────────────────────────────────────────────────
 * MEASURED over this branch's own head, rebased onto the merged main at 75dd8bf9 (which carries
 * issue 1371's fix adding one rule to the sheet), by `the sheet's cross-list selector repetition
 * does not move` in `design-system-debt-ratchets.test.js`, over
 * `scripts/lib/stylesheetSelectorCensus.js`, which is the same implementation the census report is
 * printed from. The sheet holds 2,561 rules at that head, 112 repeated keys and 229 appearances
 * between them; five keys appear three times and none appears four or more.
 *
 * ISSUE 1517 PHASE 3 RE-KEYED NO ROW AND MOVED THE THREE CONTEXTUAL FIGURES, by adding ONE rule
 * of six selectors and deleting none. The rule paints `[data-validation-focused]`, the transient
 * mark a validation row's focus action stamps on the control it lands on, and it is written FLAT
 * over the module focus pair's own element list — `a`, `button`, `input`, `select`, `textarea`
 * each as `.fabricate <el>[data-validation-focused]`, plus `.fabricate [tabindex][…]` — because a
 * single `.fabricate [data-validation-focused]` selector is (0,2,0) and would lose outright to the
 * (0,2,1) and (0,3,0) `:focus` reset above it, painting nothing at all. So the six selectors are
 * the point of the rule rather than a stylistic expansion of it.
 *
 * All six are singletons in both keyings — measured — because no other rule in the sheet names
 * `[data-validation-focused]` at all, so the repeated table is untouched and `pinnedTotal` stays
 * 243 across 119 rows. The rule count rises by one and the key and singleton counts each rise by
 * six, which is the plain shape: one added rule, six added keys, none of them shared.
 *
 * ISSUE 1517 PHASE 6 RE-KEYED NO ROW AND MOVED THE THREE CONTEXTUAL FIGURES DOWNWARD, which is
 * the mirror of Phase 3 above: it deletes EIGHT rule blocks of twelve selectors and adds none.
 * The blocks are the environment editor Validation tab own family — its issue list, its check
 * list, its check rows and their two satisfied/unsatisfied glyph re-tones, its issue row and
 * that row title — plus the dead `manager-environment-layer` family that shared three of those
 * selector lists and was the reason a dead family survived a dead-rule sweep at all. The tab was
 * converted onto `EditorValidationSurface`, so every class the blocks named stopped being
 * emitted, and `styles-dead-classes.test.js` named all eight before the deletion.
 *
 * All twelve are singletons in both keyings, measured rather than assumed, because no rule
 * outside that family names any of those classes: the rule count falls by eight, the key and
 * singleton counts each fall by twelve, and `pinnedTotal` STAYS 243 across 119 rows. Re-derived
 * by running the census, not predicted from the diff.
 *
 * ISSUE 1517's REVIEW ROUND SPLIT ONE OF PHASE 3'S OWN SELECTOR LISTS, AND MOVED ONE FIGURE.
 * The six-selector mark rule is now two rules — the five TYPED selectors keeping the repaint's
 * outward `outline-offset: 2px`, and the `[tabindex]` one taking `-2px` — because a `[tabindex]`
 * destination is a card or a section spanning the full width of `.manager-editor-tab-panel`,
 * which is `overflow: auto` with no left padding, so an outward ring had its left arm clipped
 * away. Measured at pixel level in Chromium, both ways, in `validation-focus.test.js`.
 *
 * A SPLIT ADDS A RULE WITHOUT ADDING A KEY, which is the shape issue 1509 phases 1 and 3 recorded
 * six times over: both halves were already their own keys and each still appears exactly once. So
 * the rule count alone rises by one and the key and singleton counts do not move, while
 * `pinnedTotal` is untouched. Re-derived by running the census.
 *
 * RESTACKED ONTO ISSUE 1515 (PR 1634) BEFORE MERGE, and the three contextual figures were
 * RE-DERIVED at the restacked head rather than carried over: the sheet holds 2,565 rules, 3,046
 * keys and 2,934 singletons, with the repeated table exactly as issue 1515 left it — 112 rows and
 * a `pinnedTotal` of 229 — because none of the three entries above touches a repeated key. The
 * per-phase movements the three entries describe were measured on the pre-restack base and are
 * kept as the record of what each phase did; the figures the gate asserts are the ones here.
 *
 * ISSUE 1515 DELETED TWO ROWS, which is a shape none of the entries below took: every one of them
 * left the repeated table alone. `.fabricate-manager .manager-section-header` was written twice at
 * the top level — once as a list member beside `.fabricate-filter-bar.manager-toolbar` for the
 * shared padding and rule line, and once alone for its own flex row — and a third time inside the
 * 680px `@container`, which is a different at-context and was always a singleton. All three go,
 * because the class has no emitter left: the six manager views that drew a SECOND page header
 * under the shell's own now draw none, and a rule that went on painting one would be a standing
 * invitation to write it again.
 *
 * THE SECOND ROW IS THE CONSEQUENCE OF THE FIRST, and it is the reason this file asks for the
 * reason rather than the number. Removing one member from a two-member list left
 * `.fabricate-filter-bar.manager-toolbar` stated ALONE in two rules — which is the duplicate
 * `stylelint`'s `no-duplicate-selectors` rejects, where two DIFFERING lists were allowed by design
 * and are what almost every row in this table is. So the two rules are MERGED, at the earlier
 * position and in declaration order, and the toolbar's own row vanishes with the header's. One
 * THREE RULES ARRIVE with the deleted headers' consequences, and every one is a singleton in both
 * keyings: the page eyebrow's wrapper margin, the `systems`/`access` route row template — three
 * children against the shared three-track default would have handed the growing track to the
 * PAGER, which is the failure issues 643 and 676 recorded when they deleted the same header from
 * two other routes — and the validation surface's counts-rail inset, which the deleted section
 * header used to supply. Net: the sheet holds two rules MORE, the keyed population rises by two
 * with three more singletons, and the repeated table loses two whole rows. Re-derived by running
 * the gate rather than predicted.
 *
 * ISSUE 1515 PHASE 5 MOVED THE THREE CONTEXTUAL FIGURES AND NONE OF THE REPEATED ONES, and it is
 * the first entry here whose rule and selector counts move by DIFFERENT amounts. The Tools list's
 * hand-rolled enable switch adopts `StatusToggle`, so its five-rule skin under
 * `.manager-tools-enabled-toggle` is deleted — the box, the track, the knob and the two `is-on`
 * repaints — and the sixth selector goes from a SHARED LIST: the switch's `:focus-visible` leg
 * stood beside `.manager-tools-select-target:focus-visible`, and only the switch's half leaves,
 * because the primitive's family already writes that exact ring. So SIX selectors go while FIVE
 * rules do: the rule count falls to 2,580, the key and singleton counts each fall by six to 3,056
 * and 2,939, and the repeated table is untouched with `pinnedTotal` staying 239 across 117 rows.
 *
 * ISSUE 1515 PHASE 6 MOVED THE THREE CONTEXTUAL FIGURES BY DIFFERENT AMOUNTS AGAIN, AND STILL
 * NONE OF THE REPEATED ONES. Four rules go and one arrives: the recipes blocked-enable flash was
 * a bespoke floating toast with its own glyph, message and dismiss rules, and it is a `<Notice>`
 * in the page's flow now, so what the sheet keeps is the SLOT's conditional inset and nothing
 * else. Two MORE selectors leave without taking a rule with them, and they are the interesting
 * pair: the composite-search-field focus reset and its inset ring are each written over a list
 * whose other member is the add-a-member search, and only the parties search's half leaves,
 * because `ManagerSearchField`'s own family already declares both halves around the control it
 * owns. So SIX selectors go while THREE rules do net: the rule count falls to 2,577 and the key
 * and singleton counts each fall by five to 3,051 and 2,934, with the repeated table untouched
 * and `pinnedTotal` staying 239 across 117 rows.
 *
 * ISSUE 1515 PHASE 7 IS THE FIRST ENTRY HERE THAT MOVES THE REPEATED TABLE, and it moves it
 * DOWNWARDS by three whole rows. The availability pill family's per-facet colour mappings -
 * `.manager-availability-pill.is-realm`, `.is-weather` and `.is-timeOfDay` - were each written
 * TWICE at the top level: once alone, to declare the facet's `--fab-chip-color`, and once as a
 * member of the six-selector list that mixed that property into a fill and an edge. Nothing emits
 * any of the three any more, so both halves go, which is why each is a VANISHED row rather than a
 * shrunken one. `.is-tag`, `.is-modifier` and `.is-biome` survive in the list, because all three
 * classes are still emitted elsewhere in the tree.
 *
 * The three CONTEXTUAL figures move in three different directions, and that is worth stating
 * because a reader expecting them to track the rule count will find they do not. FIVE rules are
 * deleted - the three facet one-liners plus the currency sub-unit pill's own skin and its glyph
 * colour - so the rule count falls to 2,572. But SIX selectors also ARRIVE, in four surviving
 * lists: the condition picker's trigger and the danger tag's remove control each take a name
 * outside the retiring family while the primitive that keeps the family goes on emitting the old
 * one, so each of those two rules and each of their two `:hover, :focus-visible` twins gains a
 * leg. Every arriving selector is a singleton in both keyings. Net: the key count RISES by one to
 * 3,052 and the singleton count rises by four to 2,938, while `pinnedTotal` falls to 233 across
 * 114 rows. Re-derived by running the census twice, not subtracted.
 *
 * RE-DERIVED BY RUNNING THE CENSUS RATHER THAN SUBTRACTED. Two of the six selectors leaving are
 * list members, which is the shape that CAN move the repeated table, and here it does not: each
 * names a class only its own row's rules select, so both were singletons in both keyings.
 *
 * THAT LAST FIGURE IS RE-DERIVED RATHER THAN PREDICTED, and the phase's own plan expected it to
 * move. It does not: every one of the six is a singleton in both keyings, because a per-screen
 * skin over a shared control is by construction shared with nothing — which is also exactly why
 * the four `> span` members had to be deleted rather than re-rooted. They select the primitive's
 * own track and knob at (0,2,1) and (0,2,2) against the family's (0,2,0), so leaving them would
 * have re-skinned a shared switch from one caller's block with every gate green.
 *
 * ISSUE 1515 PHASE 9 MOVES THE THREE CONTEXTUAL FIGURES AND RE-KEYS ONE REPEATED ROW, and the two
 * halves are unrelated to one another. RE-KEYED: the rail's premium chip stops riding the
 * record-count vehicle, so `.fabricate-manager .manager-nav-button .manager-nav-count.manager-nav-premium`
 * becomes `.fabricate-manager .manager-nav-premium`. Both of its appearances re-key in the same
 * commit — the rule that owns the chip's scale, and the gold pair it shares with the title-bar
 * badge — so the row keeps its count of 2 and `pinnedTotal` stays 229 across 112 rows. MOVED: one
 * rule ARRIVES, `.manager-nav-planned`, the vehicle the planned-view "Soon" word takes now that it
 * is off the count class, and the collapsed-rail hide gains TWO selectors so that it names that
 * word and the chip itself rather than reaching them through the class they used to borrow. All
 * three are new singletons in both keyings, so the rule count rises by one to 2,571 while the key
 * and singleton counts each rise by three, to 3,052 and 2,940. That is the two shapes recorded
 * below arriving together: a whole block, and selectors joining an existing group. Re-derived by
 * running the census twice, not subtracted.
 *
 * ISSUE 1515 PHASE 8 MOVES THE REPEATED TABLE DOWN AGAIN, BY TWO ROWS, AND ONE OF THEM VANISHES
 * FOR A REASON NO EARLIER ENTRY HERE HAS: a stylelint rule made the merge compulsory.
 * `.manager-availability-pill.is-tag` was written twice at the top level, once alone for the
 * facet's `--fab-chip-color` and once as a member of the three-selector list that mixed it into a
 * fill and an edge, exactly as the three facets phase 7 removed were; nothing emits it and both
 * halves go. `.is-modifier` is the other shape entirely. It is still emitted, by the one component
 * that keeps the family, but the sweep took its two SIBLINGS out of that three-selector list and
 * left the list stating the one selector its own one-liner already stated — the duplicate
 * `no-duplicate-selectors` rejects. So the two rules are MERGED at the earlier position, with
 * `--fab-chip-color` set on the same element and the two `color-mix` declarations carried
 * verbatim, and a selector that appeared twice now appears once.
 *
 * The three CONTEXTUAL figures move by three different amounts again. FOUR rules are deleted —
 * the tag one-liner, the declared-and-never-emitted `.manager-availability-picker`, and one of the
 * merged pair — and ONE arrives: the pill's leading-glyph rule is SPLIT out of the list it shared
 * with the dead menu option's, because a dead selector sitting beside a live one is invisible to
 * `deadRuleBlocks`, which calls a block dead only when EVERY selector in it is. Net: the rule
 * count falls by two to 2,570, the key count falls by three to 3,049 as `.is-tag`, `.is-biome` and
 * `-picker` leave, the singleton count falls by one to 2,937 — it loses those last two and gains
 * `.is-modifier`, now written once — and `pinnedTotal` falls to 229 across 112 rows. The
 * re-rooting itself moves NONE of them: every one of the eleven surviving selectors is renamed
 * from `.fabricate-manager` to `.fabricate-pill-select` one for one.
 *
 * ISSUE 1511 MOVED THE THREE CONTEXTUAL FIGURES AND NONE OF THE REPEATED ONES, and it is the
 * first change to move them by deleting an APPLICATION ROOT'S element theme rather than a
 * primitive's or an area's copy of one. The player app's last native select converted, so
 * `.fabricate-app select:focus-visible`, `.fabricate-app select` and `.fabricate-app select
 * option` had no carrier left and were deleted outright: three rules, three selectors, every one
 * of them a singleton in both keyings, because no other rule shares a list with any of them. The
 * rule count falls by three and the key and singleton counts each fall by three, while
 * `pinnedTotal` STAYS 229 across 112 rows. The change adds no sheet rule at all — the two width
 * treatments the conversion needs live in the callers' own scoped blocks — so there is nothing on
 * the other side of the ledger to net against. Re-derived by running the census, not predicted.
 *
 * ISSUE 1520 MOVED THE THREE CONTEXTUAL FIGURES AND NONE OF THE REPEATED ONES, by deleting eight
 * rule blocks and adding one. Deleted: the per-area Foundry-core focus-ring copies carried by the
 * interactable browser, the interactable config sheet and the interactables manager — a reset and
 * a ring apiece, five selectors each — and, from the roll-prompt dialog, its three-selector reset
 * and its two-selector `button, input` ring. Thirty-five selectors, every one a singleton in both
 * keyings, because each names a root no other rule shares a list with. Added: the one-selector
 * `.fabricate.fabricate-app-window` rule the same change split the player window's drag-resize
 * floor onto, so it could adopt `.fabricate-app` on three 420-560px windows without inflating
 * them — also a new singleton. Net: the rule count falls by seven, and the key and singleton
 * counts each fall by thirty-four. The repeated table is untouched and `pinnedTotal` stays 243
 * across 119 rows. The dialog's `select:focus-visible` ring SURVIVES the sweep, and is not a
 * repeated key either: it paints an inset `box-shadow` where the module ring paints an outset
 * `outline`, which is a variant rather than a copy.
 *
 * ISSUE 1520 PHASE 5 MOVED THE THREE CONTEXTUAL FIGURES AGAIN AND STILL NONE OF THE REPEATED
 * ONES, and this time by the largest single deletion of the change. The Manage Interactables
 * panel's whole `fab-im-*` element family — 28 rules, 29 selectors — left `styles/fabricate.css`
 * for the root's own scoped block, because those rules were the only thing keeping the window's
 * appearance rooted at an application class. Every one is a singleton in both keyings, measured:
 * each names a `.fabricate-interactables-manager` descendant no other rule shares a list with. So
 * the rule count falls by twenty-eight, the key and singleton counts each fall by twenty-nine, and
 * `pinnedTotal` STAYS 243 across 119 rows.
 *
 * That last figure is the one worth stating rather than assuming: deleting twenty-nine selector
 * lines from this gate's only corpus is exactly the shape that could have moved the repeated
 * table, and it did not, because a private per-window family is by construction not shared with
 * anything. It is re-derived by running the census, not predicted.
 *
 * ISSUE 1509 PHASE 4 IS THE FIRST OF THIS CHANGE'S PHASES TO RE-KEY A ROW, AND IT RE-KEYS EXACTLY
 * ONE. Rooting `ToggleCard` at `fabricate-toggle-card` rewrites the leading compound of ten
 * selectors and rooting `ItemDropZone` at `fabricate-link-field` rewrites fifteen more, and of
 * those twenty-five exactly one is a repeated key: `.manager-item-drop-zone-copy small`, which the
 * sheet writes once as a list member beside its `strong` sibling and once as a sole selector to
 * give it a colour, a size and a leading. Both appearances re-root together, in the same commit,
 * so the row keeps its count of 2 and `pinnedTotal` stays 243 across 119 rows. Nothing is added,
 * split or deleted: the rule count stands at 2,619, the keyed and singleton figures at 3,123 and
 * 3,004, and the phase writes no new rule at all — both families declare NO focus pair and NO font
 * floor, and both refusals are asserted rather than merely absent.
 *
 * ISSUE 1509 PHASE 3 RE-KEYED NO ROW AND MOVED ONE CONTEXTUAL FIGURE, WHICH IS A SHAPE NEITHER
 * EARLIER PHASE TOOK. Rooting `RadioCardGroup` rewrites the leading compound of 32 selectors, and
 * not one of them is a repeated key — measured — so the repeated table is untouched and
 * `pinnedTotal` stays 243 across 119 rows. What moves is the RULE COUNT alone, by six: six
 * selector LISTS were SPLIT, each of them pairing a `manager-resolution-option` radio member that
 * re-roots with a `manager-tool-bonus-row` one that must not. A split adds a rule without adding
 * a key, because both members were already their own keys and each keeps exactly one appearance
 * — so unlike phases 1 and 2 the key and singleton counts do not move at all, and 3,123 / 3,004
 * stand. Phase 1 recorded that shape once as one third of its own change; here it is the whole of
 * it, six times over, and the phase adds no rule of its own: the family's focus pair already
 * existed and is re-rooted in place rather than written.
 *
 * ISSUE 1509 PHASE 1 RE-KEYED NO ROW AND MOVED THE THREE CONTEXTUAL FIGURES, which is issue 1508
 * phase 3's shape again. Rooting `EditorTabs` rewrites the leading compound of eight selectors, and
 * NOT ONE of them is a repeated key — measured — so the repeated table is untouched and
 * `pinnedTotal` stays 243 across 119 rows. What moves is three RULES: the strip and repaint halves
 * of the strip's new focus pair, and one half of a SPLIT. The split is the active count re-tone,
 * whose two-member list paired a caller's `manager-environment-tab-button` leg with the primitive's
 * own `manager-editor-tab-button` leg; a selector list's specificity is per member and only the
 * second leg re-roots, so the rule is written as two adjacent rules with byte-identical
 * declarations. That adds a RULE without adding a KEY — both members were already their own keys —
 * which is the mirror image of the selector-leaving-a-group shape recorded above. The third new key
 * is `.fabricate-tabs button`, a fifth selector joining the existing four-member font floor group
 * rather than a rule of its own. So the rule count rises by three and the key and singleton counts
 * rise by three as well: two from the pair, one from the floor member, none from the split.
 *
 * ISSUE 1508 RE-KEYED THREE ROWS AND MOVED THE THREE CONTEXTUAL FIGURES, and it did the two
 * things separately. RE-KEYED: rooting `Field` at the class it emits rewrites the leading compound
 * of its whole family, so the three rows whose members re-root together —
 * `.fabricate-manager .manager-field input:not(…)`, `… select` and `… textarea` — become
 * `.fabricate-field.manager-field …`. Each row keeps its count of 2, because both members of each
 * pair re-rooted in the same commit, so `pinnedTotal` does not move and stays 243 across 119 rows.
 * MOVED: the same change ADDS six rules carrying fourteen selectors — the two-member font floor,
 * `Field`'s seven-leg element-typed chrome rule, and the strip and repaint halves of both new
 * families' focus pairs — every one of them a new singleton in both keyings, so the key count and
 * the singleton count each rise by fourteen and the rule count by six, while the repeated table is
 * untouched.
 *
 * ISSUE 1508 PHASE 2 RE-KEYED TWO MORE ROWS AND MOVED NOTHING ELSE, which is the shape a pure
 * re-root takes. Rooting `ManagerToolbar` and `InspectorCard` at the classes they emit rewrites
 * the leading compound of both families, so `.fabricate-manager .manager-inspector-card` becomes
 * `.fabricate-card.manager-inspector-card` and `.fabricate-manager .manager-toolbar` becomes
 * `.fabricate-filter-bar.manager-toolbar`. Each row keeps its count of 2 because both members of
 * each pair re-rooted in the same commit, and unlike phase 1 this phase ADDS no rule at all —
 * neither family owns a control, so neither declares a font floor or a focus pair — so the rule,
 * key and singleton counts are all unchanged and `pinnedTotal` stays 243 across 119 rows.
 *
 * ISSUE 1508 PHASE 3 RE-KEYED NO ROW AND MOVED THE THREE CONTEXTUAL FIGURES, which is the third
 * shape this change takes. Rooting `StatusToggle` and `ChanceSlider` rewrites the leading compound
 * of forty selectors, and NOT ONE of them is a repeated key — measured, and the reason is that
 * neither family shares a selector list with another family — so the repeated table is untouched
 * and `pinnedTotal` stays 243 across 119 rows. What moves is the four rules the phase ADDS:
 * `StatusToggle`'s (0,1,0) font floor at its own root, the strip half of its checkbox host's pair
 * (`.fabricate-toggle .manager-tool-setting-toggle-input:focus`, whose repaint is the `:has()`
 * ring that already existed), and `ChanceSlider`'s own strip and repaint. Each is a new singleton
 * in both keyings, and the slider's font floor is a fifth new SELECTOR joining the existing
 * two-member floor group rather than a rule of its own — so the rule count rises by four while the
 * key and singleton counts each rise by five.
 *
 * ISSUE 1506 MOVED THE THREE CONTEXTUAL FIGURES A THIRD TIME, by adding one rule:
 * `.fabricate-manager .manager-recipe-name-row .manager-chip` gives the row's status pills
 * `flex: 0 0 auto`, so `truncate`'s `overflow: hidden` cannot zero their automatic minimum
 * size and squeeze them for room the name should give up first. The selector is a new
 * singleton in both keyings, so the rule, key and singleton counts each rise by one and the
 * repeated table is untouched.
 *
 * ISSUE 1506 MOVED TWO OF THE THREE CONTEXTUAL FIGURES A SECOND TIME, AND NOT THE RULE COUNT, by
 * deleting one SELECTOR out of a five-selector group: `.fabricate-manager .manager-recipe-thumb`,
 * whose two raw `<img>` call sites became the shared art tile. The rule and its four other
 * selectors — all owned by other geometry sweeps — stay, so the RULE count is unchanged at 2,599
 * while the key count and the singleton count each fall by one. That is the shape a selector
 * leaving a group takes, as against a whole block leaving, and the two are recorded separately
 * because only one of them moves the rule count. The gate cannot see this one on its own:
 * `deadRuleBlocks` treats a block as dead only when EVERY selector in the group is dead, so the
 * check with teeth is `git grep -n 'manager-recipe-thumb'` returning nothing across `styles/` and
 * `src/`, which the pull request quotes.
 *
 * ISSUE 1506 ALSO MOVED THE THREE CONTEXTUAL FIGURES AND NONE OF THE REPEATED ONES, by deleting one
 * rule block: the Tool player preview's `[data-tool-player-preview] .fab-status-pill.is-subtle`,
 * which selected the status pill this change retires into the shared chip. It was a singleton
 * key, so the rule count falls by one and the key and singleton counts fall with it, and the
 * repeated table is untouched — the same shape as the deletion issue 1505 recorded above. The
 * rule had never rendered, for the reason its own comment recorded: the sheet is imported at
 * `layer(modules)` and the primitive's scoped block is unlayered, so it lost at every
 * specificity.
 *
 * ISSUE 1505 MOVED THE THREE CONTEXTUAL FIGURES AND NONE OF THE REPEATED ONES, by deleting
 * three rule blocks the shared `Callout` made redundant: the Checks studio's
 * `[data-failure-salvage-note]` override and its glyph rule, whose whole content the primitive
 * converged onto, and `.manager-recipe-info-strip`, whose two call sites became callouts. All
 * three were singleton keys, so the rule count falls by three, the key count and the singleton
 * count fall with it, and the repeated table is untouched — a deletion of unique authoring
 * rather than a repetition being paid down.
 *
 * ISSUE 1504 MOVED FOUR OF THESE SIX FIGURES, through three edits that partly cancel. The
 * `.fabricate-select*` family arrived — 32 new rules writing 33 new keys, every one a
 * singleton, so it moved the contextual figures and left the repeated ones alone. Then the two
 * scoped-catalogue toolbar select rules were NARROWED onto the one route that still renders a
 * native select there, which SPLIT the type rule's two-member list: its `input` leg merges into
 * a rule that already existed, and its `select` leg merges with the geometry rule under the
 * narrowed selector. Two rows therefore VANISH and the appearance total drops by four, while the
 * key total is unchanged and the singleton count rises by two: a list being split rather than a
 * defect being counted. That narrowing removed one rule and issue 1371's own `is-size-38` rung
 * was SPLIT in the same pass — its scoped-catalogue member had to name the converted trigger
 * rather than a `select` element — which adds one back, so the rule total is where the family
 * lift left it. Issue 1371's separately merged fix (9cca54f6) added one more rule and one more
 * singleton key beneath all three of these edits.
 *
 * A COMMIT SHA IS NOT THE ANCHOR, deliberately. An earlier draft of this docblock cited the
 * coordinator head it was first measured at; a rebase then added a rule to the sheet, the three
 * contextual figures went stale, and no gate could see it because none of them is pinned. The
 * figures a reader can check are the ones this branch's own tree produces.
 *
 * Issue 1503 moved it by exactly three rows and six appearances, from the 124 keys / 253
 * appearances issue 1501's Phase A left:
 * `.fabricate-icon-picker-popover .essence-icon-picker-option`,
 * `.fabricate-source-picker-popover .essence-source-picker-grid` and
 * `.fabricate-source-picker-popover .essence-source-picker-option` each fell to ONE appearance
 * when the callers' panel, list and row blocks were deleted in favour of the shared primitive's.
 * Those 124 / 253 in turn came from the 126 keys / 257 appearances issue 1501's own base held, by
 * two rows and four appearances: `.fabricate-app select:focus-visible`, whose list membership went
 * when the app and manager focus pair collapsed onto `.fabricate`, and
 * `.fabricate-manager .manager-tool-on-break`, one of whose two rules was deleted when its
 * declarations were adopted by `.fab-stack`. Everything else separating those figures from an
 * earlier reading of this table is the base's: issue 1371's catalogue, entry and system-rules
 * screens added seven repeated keys and rebuilt two rules out of existence, all of it beneath
 * both branches and neither one's conversion.
 *
 * ── WHY THE ROWS ARE JSON AND NOT ARRAYS IN THIS MODULE ─────────────────────────────────
 * The reason `design-system-known-debt.js` records for its own table: SonarCloud's copy-paste
 * detector normalises string literals, so a long run of quoted-string lines matches any other such
 * run by SHAPE whatever the strings say. `.json` is not indexed by the JavaScript analyser at all.
 * The rows are OBJECTS rather than the `'<key> | <count>'` strings that table uses, which is the
 * one place the two files deliberately differ: a row that is already `{key, count}` needs no
 * parser, so there is no second copy of `knownDebt`'s split-from-the-right to drift from the
 * first.
 */
import { readFileSync } from 'node:fs';

/**
 * The table, read once at module load.
 *
 * The file is data with no imports and no cycles, so there is nothing to defer: a parse failure
 * here is a broken checkout rather than a test outcome.
 */
const TABLE = JSON.parse(
  readFileSync(new URL('selector-repetition-baseline.json', import.meta.url), 'utf8')
);

/** Reject a row `assertRatchet` would misread — a missing key, or a count below two. */
function checkedRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(
      'selector-repetition-baseline.json holds no `rows` array. A gate reading a missing table ' +
        'ratchets against an empty baseline, which reports every live repetition as new debt.'
    );
  }
  return Object.freeze(
    rows.map((row) => {
      if (typeof row?.key !== 'string' || !Number.isInteger(row?.count) || row.count < 2) {
        throw new Error(
          `selector-repetition-baseline.json row ${JSON.stringify(row)} is malformed. Every row ` +
            'is a `{ "key": string, "count": integer >= 2 }` object; a count of one is a selector ' +
            'that is not repeated at all and does not belong in a repetition table.'
        );
      }
      return Object.freeze({ key: row.key, count: row.count });
    })
  );
}

/**
 * Every repeated `(at-context, selector)` of `styles/fabricate.css`, with how often it appears.
 *
 * @see the file docblock for the keying, the filter and the measurement.
 */
export const SELECTOR_REPETITION_BASELINE = checkedRows(TABLE.rows);

/**
 * The SUM of the counts, not the number of rows.
 *
 * `assertRatchet` asserts exactly that and throws before any comparison if the two disagree, so
 * this is the one figure a reviewer can check against the issue without reading the table. At the
 * measured commit it is 229 across 112 rows.
 */
export const SELECTOR_REPETITION_TOTAL = TABLE.pinnedTotal;
