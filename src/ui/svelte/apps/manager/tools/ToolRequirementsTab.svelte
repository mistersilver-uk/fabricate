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
     library row is therefore icon + label + expression, and the description slot is left for
     the one row that has a real sentence to say (below).
  2. AN EXPRESSION THE LIBRARY DOES NOT CONTAIN IS PRESERVED. A GM may have typed one under the
     old control. The design's own model simply highlights nothing in that case, which for us
     would read as "no bonus" over a record that has one, and the next save would drop it. It
     keeps its own row at the HEAD of the list instead — selected, showing the value, saying it
     did not come from the library — and picking any library entry replaces it.
  3. THE LIBRARY CAN BE EMPTY, and most worlds start that way. The sentence is the prerequisite
     list's own, one section up, with the route appended: `ToolInheritCard` renders a card's
     `subtitle` at WORLD scope only (at system scope the head is spent on the inherit row), so
     the empty line is the one place both scopes can be told where modifiers are authored.

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
  import ChecklistCardRow from '../ChecklistCardRow.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import RadioCardGroup from '../RadioCardGroup.svelte';
  import ToolInheritCard from './ToolInheritCard.svelte';
  import { toolWorldDefaultFact } from './toolStudio.js';

  // The row that stands for an authored expression the library does not contain. It is a
  // RADIO VALUE, never a persisted id, and it is spelled so that no library entry can collide
  // with it: `normalizeModifierLibrary` trims an id but does not otherwise constrain it.
  const CUSTOM_BONUS_VALUE = 'fabricate:tool-bonus-custom';
  /** What a modifier row shows when the library entry has no expression yet. */
  const NO_EXPRESSION = '—';

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
      icon: entry.icon || 'fa-solid fa-dice-d20',
      meta: entry.expression || NO_EXPRESSION,
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
            meta: bonus.expression,
            description: text(
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
      <!-- ── WHICH PREREQUISITES APPLY ────────────────────────────────────────────────────
           A HEADING OF ITS OWN, because it is a different question from the switch above it and
           from the failure mode below it; the three ran together in one unbroken slab. It sits
           inside the enabled branch: with the section off there are no decisions to head. -->
      {#if prerequisites.enabled}
        <p class="manager-kicker">
          {text('FABRICATE.Admin.Manager.Tools.Editor.WhichPrerequisites', 'Which prerequisites')}
        </p>
        <div class="manager-tool-prerequisite-list" data-tool-prerequisite-list>
          {#if prerequisiteOptions.length === 0}<p class="manager-muted">
              {text(
                'FABRICATE.Admin.Manager.Tools.Editor.NoPrerequisites',
                'No character prerequisites are defined in this world yet.'
              )}
            </p>{/if}
          {#each prerequisiteOptions as option (option.id)}
            <ChecklistCardRow
              value={option.id}
              title={option.name || option.label || option.id}
              detail={prerequisitePreview(option)}
              icon={option.icon || 'fas fa-users'}
              checked={(prerequisites.ids || []).includes(option.id)}
              onChange={(checked) => togglePrerequisite(option.id, checked)}
            />
          {/each}
        </div>
        <p class="manager-tool-requirements-summary">
          {text(
            'FABRICATE.Admin.Manager.Tools.Editor.RequiredAll',
            'All selected prerequisites are required (AND)'
          )}
        </p>
        <!-- ── AND WHAT FAILING THEM DOES ───────────────────────────────────────────────────
             `legendVisible` un-hides the fieldset's OWN `<legend>` rather than printing a kicker
             beside it: a visible heading that is not the group's accessible name is a heading a
             screen reader announces twice. -->
        <RadioCardGroup
          legendVisible
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

             `RadioCardGroup`'s own `<legend>` stays visually hidden, which is the shipped
             `is-config-cards` contract — the host renders the heading, the fieldset keeps the
             accessible name. Its geometry is taken AS GIVEN by maintainer ruling (see that
             component's header); the only thing this caller adds is the inline expression. -->
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
          <RadioCardGroup
            legend={text('FABRICATE.Admin.Manager.Tools.Editor.WorldModifiers', 'World modifiers')}
            options={bonusChoices}
            selectedValue={selectedBonusValue}
            groupName="tool-bonus-modifier"
            columns={1}
            dataGroup="tool-bonus-modifier"
            optionDataAttr="data-tool-bonus-modifier"
            disabled={saving}
            onChange={chooseBonusModifier}
          />
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
  }

  .manager-tool-bonus-kicker::after {
    flex: 1;
    height: 1px;
    background: var(--fab-border);
    content: '';
  }

  /* The per-section trailing line. It is the last thing in the card and a claim about the
     section rather than a control, so it takes the muted micro size the world entry's other
     reach sentences already use. `--fab-space-1` is the design's own 4px rule gap. */
  .manager-tool-requirements-note {
    margin: var(--fab-space-1) 0 0;
    font-size: 0.62rem;
  }
</style>
