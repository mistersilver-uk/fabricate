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
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { prerequisitePreview } from '../../../../../systems/characterPrerequisites.js';
  import ChecklistCardRow from '../ChecklistCardRow.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import RadioCardGroup from '../RadioCardGroup.svelte';
  import RollDataExpressionInput from '../RollDataExpressionInput.svelte';
  import ToolInheritCard from './ToolInheritCard.svelte';
  import { toolWorldDefaultFact } from './toolStudio.js';

  let {
    tool = null,
    prerequisiteOptions = [],
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

<div class="manager-tool-tab-stack" data-tool-requirements-tab>
  <ToolInheritCard
    section="prerequisites"
    {headingStyle}
    title={text(
      'FABRICATE.Admin.Manager.Tools.Editor.CharacterPrerequisites',
      'Character prerequisites'
    )}
    subtitle={text(
      'FABRICATE.Admin.Manager.Tools.Editor.CharacterPrerequisitesHint',
      'Gate who may wield this Tool. Pick from the character prerequisites defined under World, Rules and resources.'
    )}
    inheritable={member}
    {inherited}
    fact={inheritedFact('prerequisites')}
    hint
    disabled={saving}
    onToggle={onToggleInherited}
  >
    <section class="manager-tool-requirements-section">
      <!-- THE ROW STATES WHAT THE SWITCH BESIDE IT DOES. It used to be a second card head
           reprinting the card's own subtitle, from the SAME key, one inch below it: the head is
           gone and the copy is the switch's own. -->
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
      </div>
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
    {headingStyle}
    title={text('FABRICATE.Admin.Manager.Tools.Editor.BonusToCheck', 'Bonus to the check')}
    subtitle={text(
      'FABRICATE.Admin.Manager.Tools.Editor.BonusToCheckHint',
      'What using this Tool adds to the crafting check, if anything.'
    )}
    inheritable={member}
    {inherited}
    fact={inheritedFact('bonus')}
    disabled={saving}
    onToggle={onToggleInherited}
  >
    <section class="manager-tool-requirements-section">
      <!-- SAME REPAIR AS THE CARD ABOVE: the second head is gone, and the row that replaced it
           states what its switch does rather than reprinting the card's subtitle from the same
           key. -->
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
      </div>
      {#if bonus.enabled}
        <label class="manager-tool-bonus-field">
          <span
            >{text(
              'FABRICATE.Admin.Manager.Tools.Editor.BonusExpression',
              'Bonus expression'
            )}</span
          >
          <RollDataExpressionInput
            dataField="tool-bonus"
            value={bonus.expression || ''}
            placeholder="prof"
            onChange={(expression) => patchBonus({ expression })}
          />
          <small
            >{text(
              'FABRICATE.Admin.Manager.Tools.Editor.BonusExpressionHint',
              'Enter a roll-data path without @, or a numeric or dice expression. Roll-data paths are stored with @ automatically.'
            )}</small
          >
        </label>
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
  /* The per-section trailing line. It is the last thing in the card and a claim about the
     section rather than a control, so it takes the muted micro size the world entry's other
     reach sentences already use. `--fab-space-1` is the design's own 4px rule gap. */
  .manager-tool-requirements-note {
    margin: var(--fab-space-1) 0 0;
    font-size: 0.62rem;
  }
</style>
