<!--
  THE SECOND TAB OF THE SYSTEM TOOL RULES EDITOR: `prerequisites` and `bonus`, which are
  WORLD-DEFAULT SECTIONS, so a crafting system either follows the world Tool's answer or sets its
  own. Both are `ToolInheritCard`s, so this tab and `Breakage` state the same model in one shape.

  THE SECTION'S OWN ENABLE SWITCH STAYS INSIDE THE CARD BODY, because it asks a different question
  from inheritance: the header's switch decides WHOSE answer this system uses, and the body's
  decides whether that answer requires anything at all. It is a ROW rather than a second card head,
  and OFF renders the ANSWER rather than a greyed-out apparatus. It keeps
  `data-tool-prerequisites-enabled` / `data-tool-bonus-enabled`, which the Foundry smoke hit-tests,
  and stays a real `<input type="checkbox">` through `StatusToggle`'s `as="checkbox"` host, because
  the smoke drives it with `isChecked()` rather than reading `aria-pressed`. IT MOVES TO THE HEADER
  ROW WHEN, AND ONLY WHEN, THE CARD CANNOT INHERIT: at SYSTEM scope the header's control is already
  the INHERIT switch, a different question with the same appearance, and two identical tracks one
  line apart is the confusion this tab exists to have fixed.

  THE BONUS IS PICKED FROM THE WORLD MODIFIER LIBRARY, the same roster every activity's check
  selects over, rather than typed. THE PERSISTED SHAPE DOES NOT MOVE: `bonus.expression` is still
  the only thing written, so the SELECTION resolves by expression while the radio's value is the
  entry ID, because two entries may share an expression and a duplicate `{#each}` key throws. Three
  things the design does not answer for our model are decided here: a library row is icon + label +
  expression and NO third line, because picking a modifier copies its expression alone; an
  expression the library does not contain KEEPS ITS OWN ROW, selected and marked, because
  highlighting nothing would read as "no bonus" over a record that has one; and an EMPTY library
  says where modifiers are authored.

  A DELIBERATE DEVIATION: THE LIBRARY IS ROWS, NOT CARDS. The precedent is one screen away — the
  Checks Studio draws this same roster as compact rows and reserves `RadioCardGroup` for its closed
  mode set — and a card earns its height with a description line our entries do not carry. The
  prerequisite list is literally the same `ModifierLibraryRow`, with a CHECKBOX here and a radio
  below; `controlPlacement` and `textLayout` are the two declared variants carrying the reference's
  two anatomies without a second component. What is NOT reproduced is
  click-the-selected-row-to-clear, because a radio group cannot be un-checked by re-clicking and
  faking it on a `<label>` is the nested-interaction trap this studio has paid for.

  THE HEADING IDIOM IS THE CALLER'S, because the system rules editor sets its section headings in
  sentence-case bold and the WORLD entry sets every card heading as an uppercase kicker. Supplying
  an eyebrow overrides it, so the eyebrow takes the uppercase treatment and the title the sans.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { prerequisitePreview } from '../../../../../systems/characterPrerequisites.js';
  import Callout from '../Callout.svelte';
  import Field from '../../../components/Field.svelte';
  import SelectionCheckbox from '../../../components/SelectionCheckbox.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import RadioCardGroup from '../../../components/RadioCardGroup.svelte';
  import ModifierLibraryRow from '../ModifierLibraryRow.svelte';
  import ToolInheritCard from './ToolInheritCard.svelte';
  import { toolWorldDefaultFact } from './toolStudio.js';

  // The row standing for an authored expression the library does not contain: a RADIO VALUE, never
  // a persisted id, spelled so no library entry can collide with it.
  const CUSTOM_BONUS_VALUE = 'fabricate:tool-bonus-custom';
  // The hand-typed row's sentence is a SIBLING of the row, so the radio names it explicitly. One
  // constant id is enough, because at most one row can carry it.
  const CUSTOM_BONUS_HINT_ID = 'manager-tool-bonus-hand-typed-hint';
  // The fallback glyph for a prerequisite with no icon; the normalizer defaults one, so this only
  // covers a caller passing a raw record.
  const DEFAULT_PREREQUISITE_ICON = 'fas fa-users';

  let {
    tool = null,
    prerequisiteOptions = [],
    // The WORLD modifier library, passed explicitly by BOTH call sites: a declared-but-unpassed
    // prop subscribes its readers to the whole spread bundle, and an empty roster is
    // indistinguishable on screen from a world that has authored none.
    modifierOptions = [],
    authority = 'toolSpecific',
    saving = false,
    member = false,
    inherited = {},
    worldDefaults = null,
    // `'title'` — the system editor's sentence-case bold — or `'kicker'`. See the file header.
    headingStyle = 'title',
    // ONE TRAILING LINE PER SECTION, at the foot of its own card: stating both outside this
    // component put two identical sentences under two cards, neither beside the section it
    // counted. A MAP rather than a snippet, and an absent key renders nothing.
    sectionNotes = {},
    // THE CARD'S OPENING INFO STRIP, the only element distinguishing the SYSTEM editor's card from
    // the world entry's. A CALLER'S SENTENCE, because it states a fact about SCOPE.
    intro = '',
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

  const modifierLibrary = $derived(Array.isArray(modifierOptions) ? modifierOptions : []);
  // BY EXPRESSION, because that is what is persisted; the first match wins.
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
  // Our stored expressions already carry the `@` a roll-data path needs, so the value renders
  // exactly as persisted and exactly as the roll reads it.
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

  <!-- `Callout` is the manager's standing-statement primitive and already draws exactly this. -->
  {#if intro}
    <!-- NEUTRAL, per `openspec/specs/ui-integration/spec.md` → "Standing statements". -->
    <Callout tone="neutral" text={intro} dataAttr="data-tool-requirements-intro" />
  {/if}

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
    <!-- THE CONTROL HALF of the validation row action. The `prerequisites` check is about this
         SECTION rather than one field, so the section is the destination; it is not natively
         focusable, hence the tabindex and the attribute telling Foundry it has focus. -->
    <section
      class="manager-tool-requirements-section fab-stack"
      data-gap="2"
      data-validation-target="tool-prerequisites"
      tabindex="-1"
      data-keyboard-focus="true"
    >
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
      <!-- THE LIST, AND NOTHING HEADING IT: the reference opens it with no eyebrow at either scope,
           where a `Which prerequisites` micro-label headed the ONLY thing in the section. THE ROW
           IS `ModifierLibraryRow`, THE SAME ONE THE BONUS LIST BELOW DRAWS, through the row's two
           declared variants — `controlPlacement="leading"` and `textLayout="stacked"`, both
           defaulting to the bonus row's face. `<Field as="fieldset">` is the group, because a
           `<legend>` is only valid as its first child and `disabled` reaches every descendant. -->
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
                     is already a `<label>`. The input is NESTED rather than the row becoming a
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
        <!-- ONE SENTENCE, WHICH ALSO INTRODUCES THE PAIR BELOW IT, where a standing statement plus
             an uppercase eyebrow made two headings the reference does not draw. `RadioCardGroup`'s
             `<legend>` is therefore screen-reader-only, its shipped `is-config-cards` contract. -->
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
    <!-- THE CONTROL HALF, for the `bonus` check (issue 1517). Same shape and same reason as the
         prerequisites section above; `toolStudio.js` addresses it as `tool-bonus`. -->
    <section
      class="manager-tool-requirements-section fab-stack"
      data-gap="2"
      data-validation-target="tool-bonus"
      tabindex="-1"
      data-keyboard-focus="true"
    >
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
        <!-- WHICH WORLD MODIFIER. The eyebrow is `manager-kicker`, so the tab keeps one heading
             voice, and its HAIRLINE belongs to it alone: it names the SOURCE of the rows rather
             than sub-heading a question. THE LIST IS ROWS, NOT CARDS — see the header. -->
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
                   eligibility toggle. A `<label>` host, so the whole row is the hit target, and
                   the input is NESTED rather than the row becoming a `role="radio"` wrapper. -->
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
  /* THE TAB IS THE CARD. THE FILL IS NOT DECLARED HERE: `styles/fabricate.css` is imported at
     `layer(modules)` while a component's scoped block is injected UNLAYERED, which beats layered
     at ANY specificity, so a `background` here discarded the surface ladder's rule silently. The
     ladder owns the rung; this block keeps the geometry, which is the tab's own. */
  .manager-tool-requirements-card {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    min-width: 0;
    padding: var(--fab-space-4);
    border: 1px solid var(--fab-border);
    border-radius: 12px;
  }

  /* THE HAIRLINE BETWEEN THE TWO SECTIONS, and NOT a gap, written on the SECOND section so a tab
     rendering one draws no rule. `:global()` because `ToolInheritCard` writes the `<section>`. */
  /* The card is a flex column with NO gap of its own — the hairline carries that rhythm — so the
     strip states its own step or there is none. `:global()` because `Callout` writes it. */
  .manager-tool-requirements-card > :global(.manager-callout) {
    margin-bottom: var(--fab-space-3);
  }

  .manager-tool-requirements-card > :global(.manager-tool-rule-card ~ .manager-tool-rule-card) {
    margin-top: var(--fab-space-4);
    padding-top: var(--fab-space-4);
    border-top: 1px solid var(--fab-border);
  }

  /* THE `World modifiers` EYEBROW AND ITS HAIRLINE. The eyebrow's type stays `manager-kicker`'s,
     so this tab has one heading voice; only the rule is added, on THIS eyebrow alone, because it
     marks where the world's library begins rather than heading a question the way
     `Which prerequisites` does. `margin: 0` stays, because the section's own flex gap is already
     the reference's step and the shared class adds to it. */
  .manager-tool-bonus-kicker {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    margin: 0;
  }

  .manager-tool-bonus-kicker::after {
    flex: 1;
    height: 1px;
    background: var(--fab-border);
    content: '';
  }

  /* THE HAND-TYPED ROW'S SENTENCE, a SIBLING of that row rather than a third line inside it, as
     the Checks Studio states its own per-entry fault; the radio names it through
     `aria-describedby`. Only the WEIGHT is stated here, resetting the 700 inherited from
     `.manager-field`: this is the field's VALUE, not its caption. */
  .manager-tool-bonus-hand-typed {
    margin: 0;
    font-weight: 500;
  }

  /* The per-section trailing line: the last thing in the card and a claim rather than a control,
     so it takes the muted micro size the world entry's other reach sentences use. It states NO
     top margin of its own, sitting on the section column's rhythm rather than inventing a step. */
  .manager-tool-requirements-note {
    margin: 0;
    font-size: 0.62rem;
  }
</style>
