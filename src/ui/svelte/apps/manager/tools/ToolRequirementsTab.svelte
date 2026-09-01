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

  It is still a real `<input type="checkbox">` rather than the `ToggleCard` button used by the
  enable card on `Breakage`, and deliberately: the Foundry smoke drives both of these through
  `isChecked()`, which reads a checkbox and not `aria-pressed`.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { prerequisitePreview } from '../../../../../systems/characterPrerequisites.js';
  import ChecklistCardRow from '../ChecklistCardRow.svelte';
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
      <div class="manager-tool-editor-card-heading">
        <div data-tool-prerequisites-copy>
          <h3>
            {text(
              'FABRICATE.Admin.Manager.Tools.Editor.RequirePrerequisites',
              'Require prerequisites'
            )}
          </h3>
          <p>
            {text(
              'FABRICATE.Admin.Manager.Tools.Editor.CharacterPrerequisitesHint',
              'Gate who may wield this Tool. Prerequisites are defined in the crafting system editor; pick which ones apply.'
            )}
          </p>
        </div>
        <label
          class="manager-status-toggle manager-tool-setting-toggle"
          class:is-on={prerequisites.enabled}
          class:is-off={!prerequisites.enabled}
        >
          <input
            class="manager-tool-setting-toggle-input"
            type="checkbox"
            data-tool-prerequisites-enabled
            aria-label={text(
              'FABRICATE.Admin.Manager.Tools.Editor.TogglePrerequisites',
              'Enable character prerequisites'
            )}
            checked={prerequisites.enabled}
            onchange={(event) => patchPrerequisites({ enabled: event.currentTarget.checked })}
          />
          <span class="manager-status-toggle-track" aria-hidden="true"
            ><span class="manager-status-toggle-knob"></span></span
          >
        </label>
      </div>
      <fieldset disabled={!prerequisites.enabled} class="manager-tool-prerequisite-list">
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
            icon={option.icon || 'fas fa-user-shield'}
            checked={(prerequisites.ids || []).includes(option.id)}
            disabled={!prerequisites.enabled}
            onChange={(checked) => togglePrerequisite(option.id, checked)}
          />
        {/each}
      </fieldset>
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
        disabled={!prerequisites.enabled}
        dataGroup="tool-gate-mode"
        onChange={(gateMode) => patchPrerequisites({ gateMode })}
      />
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
      <div class="manager-tool-editor-card-heading">
        <div data-tool-bonus-copy>
          <h3>{text('FABRICATE.Admin.Manager.Tools.Editor.AddCheckBonus', 'Add a check bonus')}</h3>
          <p>
            {text(
              'FABRICATE.Admin.Manager.Tools.Editor.BonusToCheckHint',
              'What using this Tool adds to the crafting check, if anything.'
            )}
          </p>
        </div>
        <label
          class="manager-status-toggle manager-tool-setting-toggle"
          class:is-on={bonus.enabled}
          class:is-off={!bonus.enabled}
        >
          <input
            class="manager-tool-setting-toggle-input"
            type="checkbox"
            data-tool-bonus-enabled
            aria-label={text(
              'FABRICATE.Admin.Manager.Tools.Editor.ToggleBonus',
              'Enable Tool check bonus'
            )}
            checked={bonus.enabled}
            onchange={(event) => patchBonus({ enabled: event.currentTarget.checked })}
          />
          <span class="manager-status-toggle-track" aria-hidden="true"
            ><span class="manager-status-toggle-knob"></span></span
          >
        </label>
      </div>
      <label class="manager-tool-bonus-field">
        <span
          >{text('FABRICATE.Admin.Manager.Tools.Editor.BonusExpression', 'Bonus expression')}</span
        >
        <RollDataExpressionInput
          dataField="tool-bonus"
          value={bonus.expression || ''}
          placeholder="prof"
          disabled={!bonus.enabled}
          onChange={(expression) => patchBonus({ expression })}
        />
        <small
          >{text(
            'FABRICATE.Admin.Manager.Tools.Editor.BonusExpressionHint',
            'Enter a roll-data path without @, or a numeric or dice expression. Roll-data paths are stored with @ automatically.'
          )}</small
        >
      </label>
    </section>
  </ToolInheritCard>
</div>
