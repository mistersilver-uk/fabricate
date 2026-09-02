<!-- Svelte 5 runes mode -->
<!--
  THE SECOND TAB OF THE SYSTEM TOOL RULES EDITOR (issue 1373).

  == THE SAME CARD IDIOM AS `Breakage`, FOR THE SAME REASON ===================================
  `prerequisites` and `bonus` became WORLD-DEFAULT SECTIONS at `1.31.0`, so a crafting system
  either follows the world Tool's answer or sets its own — exactly as it does for breakage. This
  tab shipped as two unenclosed headings with a switch floating at the right margin and a flat
  list beneath, with no way to see or change inheritance at all. Both sections are now
  `ToolInheritCard`s, so the two tabs of this editor state the same model in the same shape.

  == THE SECTION'S OWN ENABLE SWITCH STAYS INSIDE THE CARD BODY ===============================
  It is a different question from inheritance and must not be confused with it. The header's
  switch decides WHOSE answer this system uses; the body's decides whether that answer requires
  anything at all. Putting the second one in the header — where the design puts the first — is
  what made the old heading read as though the margin switch governed the whole section.

  == BUT IT IS A ROW, NOT A SECOND CARD HEAD, AND OFF RENDERS NOTHING (issue 1373) ============
  It was written as `.manager-tool-editor-card-heading`: an `<h3>` over the card's OWN subtitle
  restated verbatim, with a switch at the right margin. Inside a card whose head is already a
  title, a state pill and a switch at the right margin, that is the same furniture twice one
  inch apart, and a GM reading `Character prerequisites` + `Overridden` above five greyed-out
  rows could not tell which of the two switches had greyed them.

  Off now renders the ANSWER instead of the disabled apparatus. `ToolInheritCard`'s docblock
  makes the argument for its inheriting face and it is the same one here: a control a GM can
  still reach, greyed, is furniture; a sentence saying what the section resolves to is a claim,
  and it is the same sentence the rail states one column over. The switch keeps
  `data-tool-prerequisites-enabled` / `data-tool-bonus-enabled`, which is what the Foundry
  smoke hit-tests and what `tool-studio-mounted.test.js` drives.

  It is still a real `<input type="checkbox">` rather than the `ToggleCard` button used by the
  enable card on `Breakage`, and deliberately: the Foundry smoke drives both of these through
  `isChecked()`, which reads a checkbox and not `aria-pressed`. `StatusToggle`'s `as="checkbox"`
  host (issue 1040) is that shape - a real `<input type="checkbox">` laid transparently over the
  track - so the switch is now the primitive's rather than this file's, and the smoke keeps the
  control it hit-tests.

  == FOUR PARITY REPAIRS FROM ISSUE 1373'S MAINTAINER ROUND ===================================
  1. THE SENTENCE WAS PRINTED TWICE, forty pixels apart: once as the card's `subtitle` and again
     as the paragraph under the body's own `<h3>`, from the SAME key. Deleting the second head
     removes one of the two printings; it does NOT by itself fix the other, because the row that
     replaced the head still had a description to write. `RequirePrerequisitesHint` and
     `AddCheckBonusHint` are that description: each states what its own SWITCH does, which is
     the question the control beside it actually asks, and neither restates the card.
  2. AND IT SENT A GM TO THE WRONG SCREEN. `Prerequisites are defined in the crafting system
     editor` is false at BOTH scopes: `prerequisiteOptions` is the WORLD character-prerequisite
     library (issue 1308) at every call site - `CraftingSystemManagerRoot` passes
     `selectedCharacterPrerequisites`, which reads `viewState.worldCharacterPrerequisites`, to
     the system editor and to the world entry alike - and that library is authored at
     `World > Rules & resources > Character prerequisites`.
  3. THE SLAB IS BROKEN INTO ITS DECISIONS. Card title, a second heading with its own switch, a
     checklist, an AND summary and two gate tiles ran together in one unbroken card. The second
     heading is gone (above); the checklist and the gate-mode pair are separate questions and
     now carry separate headings, both inside the enabled branch, since an off section states
     its answer and has no decisions to head.
  4. THE GATE-MODE PAIR HAS A VISIBLE ONE. Its `<legend>` was screen-reader-only, because
     `RadioCardGroup`'s `is-config-cards` face hides every legend, while every other group on
     these two screens carries a visible kicker.

  == TWO HEADINGS THE REFERENCE DOES NOT DRAW (issue 1373, maintainer round 5) ===============
  `WHICH PREREQUISITES` sat between the section header row and the list, and the reference goes
  from `proto:2326` straight to `proto:2328` with nothing between them — a heading over the only
  thing in the section, one line under a card head that has just said the same word twice.

  `WHEN PREREQUISITES FAIL` was the second. `proto:2334` is ONE muted sentence — "All selected
  prerequisites are required (AND). When a character fails them:" — with the two-column grid
  immediately beneath it at `proto:2336`. Ours split that into a standing statement plus an
  uppercase eyebrow, so one sentence became two headings. The grid's `<legend>` is
  screen-reader-only again, which is `RadioCardGroup`'s shipped `is-config-cards` contract: the
  group keeps its accessible name and paints no heading, because the sentence introduces it.

  == THE HEADING IDIOM IS THE CALLER'S ======================================================
  The system rules editor sets its section headings in sentence-case bold, which is what its
  design frame draws; the WORLD entry sets every card heading as an uppercase kicker, which is
  what ITS frame draws. Mounting this tab unchanged put two heading idioms on the world screen.
  `headingStyle` carries the caller's, defaults to the system editor's, and is threaded to
  `ToolInheritCard` rather than tested against a scope in here.

  IT IS OVERRIDDEN WHENEVER AN EYEBROW IS SET, which since the round below is always here: the
  eyebrow takes the uppercase treatment and the title takes the design's sentence-case sans, so
  a caller asking for `kicker` would otherwise stack two uppercase micro-labels. `headingStyle`
  is kept on the prop list because the Breakage tab's cards still answer it and because the
  two scopes are still free to disagree; it simply has one answer on THIS tab.

  == ONE CARD, ONE HEADING PER SECTION, THE TOGGLE ON THE HEADER ROW ==========================
  (Issue 1373, maintainer round 2, E3.) `proto:2322`-`2352` draws this whole tab as a SINGLE
  card at `padding: 15px; background: var(--bg2); border: 1px solid var(--border);
  border-radius: 12px`, holding two sections separated by `margin-top: 15px; padding-top: 14px;
  border-top: 1px solid var(--border)`. Each section is a header ROW - `display: flex;
  align-items: center; gap: 11px; margin-bottom: 9px` - whose text block is the eyebrow
  (`Prerequisites`), then the title (`Character prerequisites`), then the description, with the
  section's own switch on that same row. The system editor draws the identical anatomy
  (`proto:2860`, `proto:2886`).

  WHAT SHIPPED WAS TWO CARDS, EACH STATING ITS HEADING TWICE. An uppercase
  `CHARACTER PREREQUISITES` with a description, and then a bold `Require prerequisites` row with
  its OWN subtitle and its OWN switch, restating the same section one inch lower. Two headings
  for one section, in two boxes, with a lot of vertical air between them.

  AND THE EYEBROW AND THE TITLE WERE INVERTED. The design's eyebrow is the short WORD and its
  title is the SENTENCE; ours had the sentence, uppercased, as the only heading.

  == THE BONUS IS PICKED FROM THE WORLD MODIFIER LIBRARY (issue 1373, maintainer round 3) ====
  This tab shipped a free-text `Bonus expression` field, and the design has no such control at
  either scope. `proto:2353`-`2369` (world Tool entry) and `proto:2886`-`2905` (system Tool
  rules) both draw a `World modifiers` eyebrow with a hairline beside it, a single-select list
  of the world's modifier library, and a standing note saying what the check now gets.
  `proto:3797` is the library the list reads and `proto:4753` sets `bonus` to the chosen entry's
  expression.

  THE PERSISTED SHAPE DOES NOT MOVE. `bonus.expression` is still a string and still the only
  thing written; what went away is the ability to TYPE one. `proto:4750` marks a row selected by
  `r.bonus === m.expr`, so the SELECTION is resolved by expression while the radio's own value
  is the entry ID — two library entries may legitimately share an expression, and a duplicate
  `{#each}` key throws, whereas `normalizeModifierLibrary` guarantees unique ids. Where two
  entries DO share an expression the first of them is the one highlighted, which is the design's
  own answer and the only one the persisted shape can give: a stored expression does not name
  which entry produced it.

  OUR LIBRARY IS `characterLibraries.modifiers[]`, the same roster every activity's check
  selects over (`src/systems/modifierLibrary.js`), so no new library and no new persisted field
  were introduced. It is threaded as `modifierOptions` from both call sites explicitly, exactly
  as `prerequisiteOptions` is.

  THREE THINGS THE DESIGN DOES NOT ANSWER FOR OUR MODEL, decided here:

  1. NO THIRD LINE ON A ROW. The design's `MODS` entries carry an authored `note` and ours carry
     no such field. Inventing one on the persisted shape would make a library entry answer to
     this screen, and the two facts we DO hold that read like prose — `min`/`max` bounds and
     `isRollExpression` — are not notes and, worse, would be untrue here: picking a modifier
     copies its EXPRESSION and nothing else, so its bounds do not travel to the Tool bonus. A
     library row is therefore icon + label + expression and nothing else — which is also, and
     not by coincidence, why the list is drawn as rows (see the ruling below).
  2. AN EXPRESSION THE LIBRARY DOES NOT CONTAIN IS PRESERVED. A GM may have typed one under the
     old control. The design's own model simply highlights nothing in that case, which for us
     would read as "no bonus" over a record that has one, and the next save would drop it. It
     keeps its own row at the HEAD of the list instead — selected, showing the value, saying it
     did not come from the library — and picking any library entry replaces it.
  3. THE LIBRARY CAN BE EMPTY, and most worlds start that way. The sentence is the prerequisite
     list's own, one section up, with the route appended: `ToolInheritCard` renders a card's
     `subtitle` at WORLD scope only (at system scope the head is spent on the inherit row), so
     the empty line is the one place both scopes can be told where modifiers are authored.

  == A DELIBERATE DEVIATION: THE LIBRARY IS ROWS, NOT CARDS (round 4 ruling) ==================
  `proto:2361` draws each of these entries as an option CARD, and this list does not. That is a
  recorded deviation rather than drift, and it is recorded HERE because this is where a reader
  meets the divergence — an audit that reads the prototype would otherwise report it as a defect
  on every pass, which is exactly what happened to the first version of this section.

  THE PRECEDENT IS ONE SCREEN AWAY, IN THIS APP. The Checks Studio renders THIS SAME roster —
  `characterLibraries.modifiers[]` — as compact rows: icon, name, expression in mono, a bounds
  chip and a state control at the right end, in `checks/CraftingModifierCatalogueCard.svelte`.
  Directly beneath it on that same screen, `How they combine` IS a `RadioCardGroup`, because it
  is a closed four-option set of behaviours each of which needs a sentence to distinguish it.
  The app therefore already draws the distinction: LIBRARY ENTRIES GET ROWS, CLOSED MODE SETS
  GET CARDS. The Tool bonus is library entries, so it takes the row — literally the same
  component, `ModifierLibraryRow`, so a third modifier row cannot come into existence by copy.

  WHAT JUSTIFIES THE DESIGN'S CARD DOES NOT HOLD FOR OURS. A card earns its height with the
  description line under the name; the prototype's `MODS` carry an authored `note` and ours
  carry no such field, and the maintainer has declined to add one (see point 1 above). A card
  with nothing on its second line is a row with padding.

  TWO SUPPORTING FACTS, stated once. The library is UNBOUNDED and GM-authored — the design's own
  rail shows twelve — and a card stack costs about 50px an entry with no search above it, so the
  list is the tallest thing on the tab in any world that uses modifiers seriously. And issue 1458
  converged four selection popovers onto one shared picker for exactly this class of choice, so
  a bespoke presentation for a fifth would be reopening a question this repository has settled.

  == AND THE PREREQUISITE LIST IS THE SAME ROW (issue 1373, maintainer round 5) ==============
  `proto:4741` states the reference's prerequisite row as `display:flex; align-items:center;
  gap:11px; padding:10px 12px; border-radius:10px; background: bg1|surface-active; border: 1px
  solid (border|accent-border)` — and that is `proto:4752`'s BONUS row byte for byte. The
  reference draws ONE row for both lists on this tab; ours drew two, a bespoke `ChecklistCardRow`
  above and `ModifierLibraryRow` below, with different metrics, a different fill and a different
  selected treatment. Both lists are now that one component, and `ChecklistCardRow` — whose only
  caller this was — is removed rather than left standing for a fourth row to be copied from.

  THE CONTROL IS THE SEAM THE ROW ALREADY HAS. A CHECKBOX here, because several prerequisites
  apply at once and the AND sentence below says so; a radio below, because a Tool adds one
  modifier. The row took no contortion to carry it: `children` is the caller's, so the row never
  knew which control it was rendering.

  AND THE ROW'S TWO ANATOMIES ARE DECLARED VARIANTS OF IT (maintainer round 6). Round 5 shipped
  the bonus row's anatomy for both and recorded two deviations: `proto:2331` leads with the box
  where that shipped trailing, and `proto:2333` stacks the name over the expression where that
  set them on one line. The ruling is that both differences are real and load-bearing, and that
  the answer is neither two components nor one shape forced on both - it is `controlPlacement`
  and `textLayout`, two props on the one row, each defaulted to the shipped rendering so the
  bonus list below and the Checks Studio one screen away are byte-identical. This list is the
  only caller that opts in. The glyph follows the control rather than taking a prop of its own:
  `proto:2332` draws it bare here and `proto:2363` tiles it below, and the tile is what makes the
  glyph a row's leading anchor, which a row that leads with a control already has.

  WHAT IS NOT REPRODUCED is `proto:4754`'s click-the-selected-row-to-clear. A radio group cannot
  be un-checked by re-clicking it, and faking that on a `<label>` wrapping a real `<input>` is
  the nested-interaction trap this studio has already paid for; the section's own enable switch
  is the control that says "adds nothing", and it says it in a sentence rather than by absence.

  THE ENABLE SWITCH MOVES TO THE HEADER ROW WHEN, AND ONLY WHEN, THE CARD CANNOT INHERIT.
  At WORLD scope there is exactly one switch per section - the section's own enable - so it
  takes the header row and the design's anatomy is reproduced exactly. At SYSTEM scope the
  header row's control is already the INHERIT switch, which is a different question with the
  same appearance; putting the enable switch beside it would put two identical tracks one line
  apart with nothing to tell them apart, which is precisely the confusion this tab's docblock
  above records having fixed once already. So the system editor keeps its enable switch as the
  first row of the body, and gains the eyebrow, the title face, the one card and the rule
  between the sections. That divergence is the model's, not the design's: the prototype has no
  inheritance concept for these sections at all.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { prerequisitePreview } from '../../../../../systems/characterPrerequisites.js';
  import Field from '../../../components/Field.svelte';
  import SelectionCheckbox from '../../../components/SelectionCheckbox.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import RadioCardGroup from '../RadioCardGroup.svelte';
  import ModifierLibraryRow from '../ModifierLibraryRow.svelte';
  import ToolInheritCard from './ToolInheritCard.svelte';
  import { toolWorldDefaultFact } from './toolStudio.js';

  // The row that stands for an authored expression the library does not contain. It is a
  // RADIO VALUE, never a persisted id, and it is spelled so that no library entry can collide
  // with it: `normalizeModifierLibrary` trims an id but does not otherwise constrain it.
  const CUSTOM_BONUS_VALUE = 'fabricate:tool-bonus-custom';
  // The hand-typed row's sentence is a SIBLING of the row rather than a third line inside it,
  // so the radio has to name it explicitly or the explanation is announced by nothing. One
  // constant id is enough because at most one row can ever carry it.
  const CUSTOM_BONUS_HINT_ID = 'manager-tool-bonus-hand-typed-hint';
  // The glyph a character prerequisite with no icon of its own falls back to. `proto:2332` draws
  // this cell as a bare accent glyph and the library's own normalizer already defaults one, so
  // this only covers a caller that passes a raw record.
  const DEFAULT_PREREQUISITE_ICON = 'fas fa-users';

  let {
    tool = null,
    prerequisiteOptions = [],
    // The WORLD modifier library (`characterLibraries.modifiers[]`), normalized to
    // `{id, label, expression, isRollExpression, icon?, min?, max?}`. The design's `MODS`
    // (`proto:3797`). Passed explicitly by BOTH call sites — a declared-but-unpassed prop
    // subscribes its readers to the whole spread bundle, and an empty roster here is
    // indistinguishable on screen from a world that has authored none.
    modifierOptions = [],
    authority = 'toolSpecific',
    saving = false,
    member = false,
    inherited = {},
    worldDefaults = null,
    // `'title'` — the system editor's sentence-case bold — or `'kicker'`. See the file header.
    headingStyle = 'title',
    // ── ONE TRAILING LINE PER SECTION (issue 1373, maintainer round 2) ────────────────────
    // `{prerequisites?: string, bonus?: string}`, rendered at the foot of each section's own
    // card. It exists because the WORLD entry states how many crafting systems inherit each
    // default, and it was stating both OUTSIDE this component, stacked at the bottom of a
    // wrapper card: two identical sentences under two cards, neither beside the section it
    // counted, reading as a duplication fault rather than as two facts.
    //
    // A MAP RATHER THAN A SNIPPET, deliberately: the note is one sentence the caller has
    // already resolved, and a snippet would let a caller put arbitrary markup inside a card
    // whose whole point is that both scopes draw it the same way. An absent key renders
    // nothing, so the system editor is untouched.
    sectionNotes = {},
    onPatch = () => {},
    onToggleInherited = () => {},
  } = $props();
  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
  function formattedText(key, data, fallback) {
    const template = localize(key);
    if (template && template !== key) return localize(key, data);
    return Object.entries(data).reduce(
      (copy, [name, value]) => copy.replace(`{${name}}`, String(value)),
      fallback
    );
  }
  const prerequisites = $derived(
    tool?.prerequisites || { enabled: false, ids: [], gateMode: 'usability' }
  );
  const bonus = $derived(tool?.bonus || { enabled: false, expression: '' });
  function patchPrerequisites(patch) {
    onPatch({ prerequisites: { ...prerequisites, ...patch } });
  }
  function togglePrerequisite(id, checked) {
    const ids = prerequisites.ids || [];
    patchPrerequisites({
      ids: checked
        ? ids.includes(id)
          ? ids
          : [...ids, id]
        : ids.filter((candidate) => candidate !== id),
    });
  }
  function patchBonus(patch) {
    onPatch({ bonus: { ...bonus, ...patch } });
  }

  // ── THE BONUS PICK LIST ───────────────────────────────────────────────────────────────────
  const modifierLibrary = $derived(Array.isArray(modifierOptions) ? modifierOptions : []);
  // BY EXPRESSION, because that is what is persisted (`proto:4750`: `r.bonus === m.expr`). The
  // first match wins, exactly as the design's `.map` marks every row whose expression equals
  // the stored one and the radio then keeps one checked.
  const selectedModifier = $derived(
    bonus.expression
      ? (modifierLibrary.find((entry) => entry?.expression === bonus.expression) ?? null)
      : null
  );
  const bonusIsCustom = $derived(Boolean(bonus.expression) && !selectedModifier);
  const libraryChoices = $derived(
    modifierLibrary.map((entry) => ({
      value: entry.id,
      label: entry.label || entry.id,
      icon: entry.icon || '',
      expression: entry.expression,
      hint: '',
    }))
  );
  // FIRST, because it is the answer the record currently holds; below eight library rows it
  // would be the one thing on the screen a GM could not find.
  const bonusChoices = $derived(
    bonusIsCustom
      ? [
          {
            value: CUSTOM_BONUS_VALUE,
            label: text('FABRICATE.Admin.Manager.Tools.Editor.BonusCustom', 'Set by hand'),
            icon: 'fas fa-pen',
            expression: bonus.expression,
            hint: text(
              'FABRICATE.Admin.Manager.Tools.Editor.BonusCustomHint',
              'This expression is not one of the world modifiers. Pick one below to replace it.'
            ),
          },
          ...libraryChoices,
        ]
      : libraryChoices
  );
  const selectedBonusValue = $derived(
    bonusIsCustom ? CUSTOM_BONUS_VALUE : (selectedModifier?.id ?? '')
  );
  // `proto:4755`. Our stored expressions already carry the `@` a roll-data path needs, so the
  // design's `(/^[0-9]/.test(expr) ? '' : '@')` prefixing has no counterpart here: the value is
  // rendered exactly as it is persisted and exactly as the roll will read it.
  const bonusNote = $derived(
    bonus.expression
      ? formattedText(
          'FABRICATE.Admin.Manager.Tools.Editor.BonusApplied',
          { expression: bonus.expression },
          'Applied to the crafting check as {expression}.'
        )
      : text(
          'FABRICATE.Admin.Manager.Tools.Editor.BonusUnset',
          'Nothing is added to the check until you pick a modifier.'
        )
  );
  function chooseBonusModifier(value) {
    // The custom row is already the selected one, so re-selecting it is a no-op rather than a
    // write: it carries no library entry to read an expression off.
    if (value === CUSTOM_BONUS_VALUE) return;
    const modifier = modifierLibrary.find((entry) => entry?.id === value);
    patchBonus({ expression: modifier?.expression || '' });
  }

  /**
   * What one section resolves to while it INHERITS. See `ToolBreakageTab` for why the Tool's own
   * current value is a sound fallback for a world half that authored no defaults record.
   *
   * @param {string} section
   * @returns {object|undefined}
   */
  function inheritedFact(section) {
    return (
      toolWorldDefaultFact(section, worldDefaults, authority, text, formattedText) ??
      toolWorldDefaultFact(section, tool, authority, text, formattedText)
    );
  }

  const gateModeOptions = $derived([
    {
      value: 'usability',
      label: text('FABRICATE.Admin.Manager.Tools.Editor.GateUsability', 'Tool is unusable'),
      description: text(
        'FABRICATE.Admin.Manager.Tools.Editor.GateUsabilityHint',
        'The character cannot use this Tool for crafting, salvage, or gathering.'
      ),
      icon: 'fas fa-ban',
    },
    {
      value: 'bonus',
      label: text('FABRICATE.Admin.Manager.Tools.Editor.GateBonus', 'Bonus is withheld'),
      description: text(
        'FABRICATE.Admin.Manager.Tools.Editor.GateBonusHint',
        'The Tool still counts as present, but contributes no check bonus.'
      ),
      icon: 'fas fa-plus-minus',
    },
  ]);
</script>

<!-- ONE CARD. The two sections are `flush` inside it and the rule between them is drawn on the
     second one; see the file header for the design's own values. -->
<div class="manager-tool-requirements-card" data-tool-requirements-tab>
  {#snippet prerequisitesSwitch()}
    <StatusToggle
      as="checkbox"
      on={prerequisites.enabled}
      ariaLabel={text(
        'FABRICATE.Admin.Manager.Tools.Editor.TogglePrerequisites',
        'Enable character prerequisites'
      )}
      data-tool-prerequisites-enabled=""
      onChange={(checked) => patchPrerequisites({ enabled: checked })}
    />
  {/snippet}
  {#snippet bonusSwitch()}
    <StatusToggle
      as="checkbox"
      on={bonus.enabled}
      ariaLabel={text(
        'FABRICATE.Admin.Manager.Tools.Editor.ToggleBonus',
        'Enable Tool check bonus'
      )}
      data-tool-bonus-enabled=""
      onChange={(checked) => patchBonus({ enabled: checked })}
    />
  {/snippet}

  <ToolInheritCard
    section="prerequisites"
    flush
    {headingStyle}
    eyebrow={text('FABRICATE.Admin.Manager.Tools.Editor.PrerequisitesEyebrow', 'Prerequisites')}
    title={text(
      'FABRICATE.Admin.Manager.Tools.Editor.CharacterPrerequisites',
      'Character prerequisites'
    )}
    subtitle={text(
      'FABRICATE.Admin.Manager.Tools.Editor.CharacterPrerequisitesHint',
      'Gate who may wield this Tool. Pick from the character prerequisites defined under World, Rules and resources.'
    )}
    control={member ? undefined : prerequisitesSwitch}
    inheritable={member}
    {inherited}
    fact={inheritedFact('prerequisites')}
    hint
    disabled={saving}
    onToggle={onToggleInherited}
  >
    <section class="manager-tool-requirements-section">
      <!-- THE SUBORDINATE ROW SURVIVES AT SYSTEM SCOPE ONLY, because that is the only scope
           whose header row is already spent on a different question. See the file header. -->
      {#if member}
        <div class="manager-tool-setting-row">
          <div data-tool-prerequisites-copy>
            <strong
              >{text(
                'FABRICATE.Admin.Manager.Tools.Editor.RequirePrerequisites',
                'Require prerequisites'
              )}</strong
            >
            <small
              >{text(
                'FABRICATE.Admin.Manager.Tools.Editor.RequirePrerequisitesHint',
                'While this is off the Tool has no character gate and anyone may wield it.'
              )}</small
            >
          </div>
          {@render prerequisitesSwitch()}
        </div>
      {/if}
      <!-- ── THE LIST, AND NOTHING HEADING IT ────────────────────────────────────────────
           `proto:2326` closes the section header row and `proto:2328` opens the list: there is
           no eyebrow between them at either scope (`proto:2860` is the system twin). Ours put a
           `WHICH PREREQUISITES` micro-label there, which is a heading over the ONLY thing in the
           section, above a card head that has just said the same word twice.

           THE ROW IS `ModifierLibraryRow`, THE SAME ONE THE BONUS LIST BELOW DRAWS (round 5).
           `proto:4741` and `proto:4752` state the two rows with one identical string, so the
           reference draws one row where this tab drew two — a bespoke `ChecklistCardRow` here
           and the shared row one section down, with different metrics, a different fill and a
           different selected treatment. The control is exactly the seam the row already has: a
           CHECKBOX here, because several prerequisites apply at once, and a radio below,
           because one modifier does.

           IN THE REFERENCE'S OWN ANATOMY FOR THIS LIST (round 6), through the row's two declared
           variants rather than a second component: `controlPlacement="leading"` puts the box
           first (`proto:2331`) and takes the glyph's tile off with it (`proto:2332`), and
           `textLayout="stacked"` sets the name over the expression (`proto:2333`). Both default
           to the bonus row's face, so opting in here moves nothing anywhere else.

           `<Field as="fieldset">` is the group, for the reasons the bonus list records: a
           `<legend>` is only valid as a fieldset's first child and is what names the group, and
           `disabled` on a fieldset reaches every descendant control without a per-row prop. The
           legend is visually hidden because the card head above already names the section. -->
      {#if prerequisites.enabled}
        {#if prerequisiteOptions.length === 0}
          <p class="manager-muted" data-tool-prerequisite-empty>
            {text(
              'FABRICATE.Admin.Manager.Tools.Editor.NoPrerequisites',
              'No character prerequisites are defined in this world yet. They are defined under World, Rules and resources.'
            )}
          </p>
        {:else}
          <Field
            as="fieldset"
            class="manager-tool-prerequisite-list"
            disabled={saving}
            data-tool-prerequisite-list=""
          >
            <legend class="visually-hidden"
              >{text(
                'FABRICATE.Admin.Manager.Tools.Editor.CharacterPrerequisites',
                'Character prerequisites'
              )}</legend
            >
            {#each prerequisiteOptions as option (option.id)}
              <ModifierLibraryRow
                as="label"
                controlPlacement="leading"
                textLayout="stacked"
                icon={option.icon || DEFAULT_PREREQUISITE_ICON}
                label={option.name || option.label || option.id}
                expression={prerequisitePreview(option)}
                class={(prerequisites.ids || []).includes(option.id)
                  ? 'manager-tool-prerequisite-row is-active'
                  : 'manager-tool-prerequisite-row'}
                rowAttributes={{ 'data-tool-prerequisite-row': option.id }}
              >
                <!-- The manager's ONE selection control, in `contents` mode because the row host
                     is already a `<label>` and a nested label is invalid HTML and an ambiguous
                     click target. The input is NESTED rather than the row being converted into a
                     `role="checkbox"` wrapper, which is the trap the row's own header records. -->
                <SelectionCheckbox
                  size="sm"
                  wrapper="contents"
                  value={option.id}
                  checked={(prerequisites.ids || []).includes(option.id)}
                  onChange={(checked) => togglePrerequisite(option.id, checked)}
                />
              </ModifierLibraryRow>
            {/each}
          </Field>
        {/if}
        <!-- ── ONE SENTENCE, WHICH ALSO INTRODUCES THE PAIR BELOW IT ─────────────────────
             `proto:2334` is a single muted line — "All selected prerequisites are required (AND).
             When a character fails them:" — and `proto:2336` is the two-column grid immediately
             under it. Ours split that into a standing statement plus a second uppercase eyebrow,
             so the tab carried two headings the reference does not draw at all.

             `RadioCardGroup`'s own `<legend>` therefore goes back to screen-reader-only, which is
             the shipped `is-config-cards` contract: the group keeps its accessible name and
             paints no heading, because the sentence above it is the introduction. -->
        <p class="manager-tool-requirements-summary" data-tool-prerequisites-summary>
          {text(
            'FABRICATE.Admin.Manager.Tools.Editor.RequiredAll',
            'All selected prerequisites are required (AND). When a character fails them:'
          )}
        </p>
        <RadioCardGroup
          legend={text('FABRICATE.Admin.Manager.Tools.Editor.GateMode', 'When prerequisites fail')}
          options={gateModeOptions}
          selectedValue={prerequisites.gateMode}
          groupName="tool-gate-mode"
          columns={2}
          dataGroup="tool-gate-mode"
          onChange={(gateMode) => patchPrerequisites({ gateMode })}
        />
      {:else}
        <p class="manager-tool-requirements-summary" data-tool-prerequisites-off>
          {text(
            'FABRICATE.Admin.Manager.Tools.Editor.PreviewNoPrerequisites',
            'Any character may use it'
          )}
        </p>
      {/if}
      {#if sectionNotes.prerequisites}
        <p
          class="manager-muted manager-tool-requirements-note"
          data-tool-section-note="prerequisites"
        >
          {sectionNotes.prerequisites}
        </p>
      {/if}
    </section>
  </ToolInheritCard>

  <ToolInheritCard
    section="bonus"
    flush
    {headingStyle}
    eyebrow={text('FABRICATE.Admin.Manager.Tools.Editor.BonusEyebrow', 'Bonus')}
    title={text('FABRICATE.Admin.Manager.Tools.Editor.BonusToCheck', 'Bonus to the check')}
    subtitle={text(
      'FABRICATE.Admin.Manager.Tools.Editor.BonusToCheckHint',
      'What using this Tool adds to the crafting check, if anything.'
    )}
    control={member ? undefined : bonusSwitch}
    inheritable={member}
    {inherited}
    fact={inheritedFact('bonus')}
    disabled={saving}
    onToggle={onToggleInherited}
  >
    <section class="manager-tool-requirements-section">
      <!-- SAME SPLIT AS THE SECTION ABOVE, for the same reason. -->
      {#if member}
        <div class="manager-tool-setting-row">
          <div data-tool-bonus-copy>
            <strong
              >{text(
                'FABRICATE.Admin.Manager.Tools.Editor.AddCheckBonus',
                'Add a check bonus'
              )}</strong
            >
            <small
              >{text(
                'FABRICATE.Admin.Manager.Tools.Editor.AddCheckBonusHint',
                'While this is off the Tool contributes nothing to the roll.'
              )}</small
            >
          </div>
          {@render bonusSwitch()}
        </div>
      {/if}
      {#if bonus.enabled}
        <!-- ── WHICH WORLD MODIFIER ──────────────────────────────────────────────────────────
             The eyebrow is `manager-kicker`, the same treatment the prerequisite list's heading
             takes one section up, so the tab keeps one heading voice. The HAIRLINE beside it is
             the design's (`proto:2357`) and belongs to this eyebrow alone: it names the SOURCE
             of the rows rather than sub-heading a question, and it is also what separates the
             library from the enable row above it at system scope.

             THE LIST IS ROWS, NOT CARDS (maintainer round 4). See this file's header for the
             ruling and the precedent; the mechanics are here. `<Field as="fieldset">` is the
             group: a `<legend>` is only valid as a fieldset's first child and is what names a
             radio group, and `disabled` on a fieldset disables every descendant control, which
             is how `saving` reaches every row without a per-row prop. The legend is visually
             hidden because the eyebrow above already renders the heading — un-hiding it would
             have a screen reader announce `World modifiers` twice. -->
        <p class="manager-kicker manager-tool-bonus-kicker">
          {text('FABRICATE.Admin.Manager.Tools.Editor.WorldModifiers', 'World modifiers')}
        </p>
        {#if modifierLibrary.length === 0}
          <p class="manager-muted" data-tool-bonus-empty>
            {text(
              'FABRICATE.Admin.Manager.Tools.Editor.NoModifiers',
              'No modifiers are defined in this world yet. They are defined under World, Rules and resources.'
            )}
          </p>
        {/if}
        {#if bonusChoices.length > 0}
          <Field
            as="fieldset"
            class="manager-tool-bonus-list"
            disabled={saving}
            data-tool-bonus-list=""
          >
            <legend class="visually-hidden"
              >{text(
                'FABRICATE.Admin.Manager.Tools.Editor.WorldModifiers',
                'World modifiers'
              )}</legend
            >
            {#each bonusChoices as choice (choice.value)}
              <!-- THE CHECKS STUDIO'S MODIFIER ROW, with a radio where that screen puts its
                   eligibility toggle. A `<label>` host, so the whole row is the radio's hit
                   target and its accessible name; the input is NESTED in it rather than the
                   row being converted into one, which is the trap a `role="radio"` wrapper
                   would land. -->
              <ModifierLibraryRow
                as="label"
                icon={choice.icon}
                label={choice.label}
                expression={choice.expression}
                class={choice.value === selectedBonusValue
                  ? 'manager-tool-bonus-row is-active'
                  : 'manager-tool-bonus-row'}
                rowAttributes={{ 'data-tool-bonus-modifier': choice.value }}
              >
                <input
                  type="radio"
                  name="tool-bonus-modifier"
                  value={choice.value}
                  checked={choice.value === selectedBonusValue}
                  aria-describedby={choice.hint ? CUSTOM_BONUS_HINT_ID : undefined}
                  onchange={(event) => chooseBonusModifier(event.currentTarget.value)}
                />
              </ModifierLibraryRow>
              {#if choice.hint}
                <p
                  class="manager-muted manager-tool-bonus-hand-typed"
                  id={CUSTOM_BONUS_HINT_ID}
                  data-tool-bonus-custom-hint
                >
                  {choice.hint}
                </p>
              {/if}
            {/each}
          </Field>
        {/if}
        <p class="manager-tool-requirements-summary" data-tool-bonus-note>{bonusNote}</p>
      {:else}
        <p class="manager-tool-requirements-summary" data-tool-bonus-off>
          {text(
            'FABRICATE.Admin.Manager.Tools.Editor.PreviewNoBonus',
            'Adds nothing to the crafting check'
          )}
        </p>
      {/if}
      {#if sectionNotes.bonus}
        <p class="manager-muted manager-tool-requirements-note" data-tool-section-note="bonus">
          {sectionNotes.bonus}
        </p>
      {/if}
    </section>
  </ToolInheritCard>
</div>

<style>
  /* THE TAB IS THE CARD (issue 1373, maintainer round 2, E3). `proto:2322`: `padding: 15px;
     background: var(--bg2); border: 1px solid var(--border); border-radius: 12px`. 15 rounds to
     `--fab-space-4` on the 4px scale and the 12px radius is the design's exactly. The rung is
     `--fab-bg-1`: this repository's ramp is shifted one step against the design's, whose
     `--bg2` is our `--fab-bg-1` - the same mapping every other card on the world entry uses. */
  .manager-tool-requirements-card {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    min-width: 0;
    padding: var(--fab-space-4);
    border: 1px solid var(--fab-border);
    border-radius: 12px;
    background: var(--fab-bg-1);
  }

  /* THE HAIRLINE BETWEEN THE TWO SECTIONS, and NOT a gap: `proto:2349` states
     `margin-top: 15px; padding-top: 14px; border-top: 1px solid var(--border)` on the second
     header row, both of which round to `--fab-space-4`. It is written on the SECOND section
     rather than as a separate `<hr>` so a tab that ever renders one section draws no rule.

     `:global()` because `ToolInheritCard` writes the `<section>`, not this template - the
     scoped form would compile to a selector matching nothing. It is anchored on the card this
     file DOES write, so its reach is this tab and no other stack of rule cards. */
  .manager-tool-requirements-card > :global(.manager-tool-rule-card ~ .manager-tool-rule-card) {
    margin-top: var(--fab-space-4);
    padding-top: var(--fab-space-4);
    border-top: 1px solid var(--fab-border);
  }

  /* THE `World modifiers` EYEBROW AND ITS HAIRLINE (issue 1373, maintainer round 3).
     `proto:2355`-`2357` draws the eyebrow and, beside it, a `flex: 1; height: 1px;
     background: var(--border)` rule filling the remainder of the line. The eyebrow's own type
     stays `manager-kicker`'s, so this tab has one heading voice; only the rule is added, and it
     is on THIS eyebrow alone because it marks where the world's library begins rather than
     heading a question the way `Which prerequisites` does. `--fab-space-2` rounds the design's
     9px gap to the 4px scale's 8px rung. */
  .manager-tool-bonus-kicker {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;

    /* -- AND THE SAME TYPE AS THE CARD HEADS ABOVE IT (issue 1373, round 5) ---------------
       `proto:2356` states this eyebrow with the SAME string `proto:2324` states the two section
       eyebrows with — `font: 700 8.5px var(--sans); letter-spacing: .11em; text-transform:
       uppercase; color: var(--subtle)`. Once `ToolInheritCard` narrowed its head eyebrow to the
       reference, leaving this one on the shared `.manager-kicker`'s 0.72rem put two uppercase
       micro-labels at two sizes inside one card — a worse reading than the one before it, and
       one the reference does not draw at all.

       Narrowed HERE rather than on `.manager-kicker`, which is the same rule the card's own
       block records: the shared class has callers on every other manager screen. `margin: 0`
       because the section is a flex column whose gap is already the reference's own step, and
       the shared class adds 2px on top of it. */
    margin: 0;
    color: var(--fab-text-subtle);
    font-size: 8.5px;
    letter-spacing: 0.11em;
  }

  .manager-tool-bonus-kicker::after {
    flex: 1;
    height: 1px;
    background: var(--fab-border);
    content: '';
  }

  /* THE HAND-TYPED ROW'S SENTENCE, and it is a SIBLING of that row rather than a third line
     inside it. The modifier row is one line on both screens that draw it, and the Checks Studio
     states its own per-entry fault the same way — a paragraph after the row it qualifies. The
     radio names this paragraph through `aria-describedby`, so nothing is lost by it sitting
     outside the row.

     Only the WEIGHT is stated here: `manager-muted` already owns the colour, the size and the
     leading, and the 700 this resets is inherited from `.manager-field`, which the group's
     `<fieldset>` carries because a field's caption is a label. This is the field's VALUE, not
     its caption — the same distinction the sheet records for the world Tool entry's inputs. */
  .manager-tool-bonus-hand-typed {
    margin: 0;
    font-weight: 500;
  }

  /* The per-section trailing line. It is the last thing in the card and a claim about the
     section rather than a control, so it takes the muted micro size the world entry's other
     reach sentences already use.

     ITS OWN 4px TOP MARGIN IS GONE (issue 1373, round 5). The reference has no counterpart for
     this line at all — how many crafting systems inherit a world default is a fact about world
     scope the prototype has no concept of — so what it has to do is sit on the section's rhythm
     rather than invent a step. The section column is `--fab-space-2`, which is where the
     reference's own 8px and 9px gaps round to; a 4px margin on top of that made this one line
     half again as far from its section as every other line in it. */
  .manager-tool-requirements-note {
    margin: 0;
    font-size: 0.62rem;
  }
</style>
