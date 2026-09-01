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
    title={text(
      'FABRICATE.Admin.Manager.Tools.Editor.CharacterPrerequisites',
      'Character prerequisites'
    )}
    subtitle={text(
      'FABRICATE.Admin.Manager.Tools.Editor.CharacterPrerequisitesHint',
      'Gate who may wield this Tool. Prerequisites are defined in the crafting system editor; pick which ones apply.'
    )}
    inheritable={member}
    {inherited}
    fact={inheritedFact('prerequisites')}
    hint
    disabled={saving}
    onToggle={onToggleInherited}
  >
    <section class="manager-tool-requirements-section">
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
              'FABRICATE.Admin.Manager.Tools.Editor.CharacterPrerequisitesHint',
              'Gate who may wield this Tool. Prerequisites are defined in the crafting system editor; pick which ones apply.'
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
      {#if prerequisites.enabled}
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
    </section>
  </ToolInheritCard>

  <ToolInheritCard
    section="bonus"
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
              'FABRICATE.Admin.Manager.Tools.Editor.BonusToCheckHint',
              'What using this Tool adds to the crafting check, if anything.'
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
    </section>
  </ToolInheritCard>
</div>
