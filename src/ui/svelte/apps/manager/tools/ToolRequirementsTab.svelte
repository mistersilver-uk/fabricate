<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { prerequisitePreview } from '../../../../../systems/characterPrerequisites.js';
  import { displayRollDataExpression } from '../../../../../systems/characterModifierPrerequisiteCopy.js';
  import ChecklistCardRow from '../ChecklistCardRow.svelte';
  import RadioCardGroup from '../RadioCardGroup.svelte';
  import RollDataExpressionInput from '../RollDataExpressionInput.svelte';

  let { tool = null, prerequisiteOptions = [], onPatch = () => {} } = $props();
  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
  const prerequisites = $derived(tool?.prerequisites || { enabled: false, ids: [], gateMode: 'usability' });
  const bonus = $derived(tool?.bonus || { enabled: false, expression: '' });
  function patchPrerequisites(patch) {
    onPatch({ prerequisites: { ...prerequisites, ...patch } });
  }
  function togglePrerequisite(id, checked) {
    const ids = prerequisites.ids || [];
    patchPrerequisites({
      ids: checked
        ? (ids.includes(id) ? ids : [...ids, id])
        : ids.filter((candidate) => candidate !== id),
    });
  }
  function patchBonus(patch) {
    onPatch({ bonus: { ...bonus, ...patch } });
  }
  const gateModeOptions = $derived([
    {
      value: 'usability',
      label: text('FABRICATE.Admin.Manager.Tools.Editor.GateUsability', 'Tool is unusable'),
      description: text('FABRICATE.Admin.Manager.Tools.Editor.GateUsabilityHint', 'The character cannot use this Tool for crafting, salvage, or gathering.'),
      icon: 'fas fa-ban',
    },
    {
      value: 'bonus',
      label: text('FABRICATE.Admin.Manager.Tools.Editor.GateBonus', 'Bonus is withheld'),
      description: text('FABRICATE.Admin.Manager.Tools.Editor.GateBonusHint', 'The Tool still counts as present, but contributes no check bonus.'),
      icon: 'fas fa-plus-minus',
    },
  ]);
  const bonusPresets = ['@prof', '@abilities.str.mod', '@abilities.dex.mod', '1d4'];
</script>

<div class="manager-tool-tab-stack" data-tool-requirements-tab>
  <section class="manager-tool-requirements-section">
    <div class="manager-tool-editor-card-heading">
      <div><p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.Editor.Prerequisites', 'Prerequisites')}</p><h3>{text('FABRICATE.Admin.Manager.Tools.Editor.CharacterPrerequisites', 'Character prerequisites')}</h3><p>{text('FABRICATE.Admin.Manager.Tools.Editor.CharacterPrerequisitesHint', 'Gate who may wield this Tool. Prerequisites are defined in the crafting system editor; pick which ones apply.')}</p></div>
      <label class="manager-status-toggle manager-tool-setting-toggle" class:is-on={prerequisites.enabled} class:is-off={!prerequisites.enabled}>
        <input class="manager-tool-setting-toggle-input" type="checkbox" data-tool-prerequisites-enabled aria-label={text('FABRICATE.Admin.Manager.Tools.Editor.TogglePrerequisites', 'Enable character prerequisites')} checked={prerequisites.enabled} onchange={(event) => patchPrerequisites({ enabled: event.currentTarget.checked })} />
        <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
      </label>
    </div>
    <fieldset disabled={!prerequisites.enabled} class="manager-tool-prerequisite-list">
      {#if prerequisiteOptions.length === 0}<p class="manager-muted">{text('FABRICATE.Admin.Manager.Tools.Editor.NoPrerequisites', 'No shared prerequisites are defined for this system.')}</p>{/if}
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
    <p class="manager-tool-requirements-summary">{text('FABRICATE.Admin.Manager.Tools.Editor.RequiredAll', 'All selected prerequisites are required (AND)')}</p>
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

  <hr data-tool-requirements-divider />

  <section class="manager-tool-requirements-section">
    <div class="manager-tool-editor-card-heading">
      <div><p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.Editor.Bonus', 'Bonus')}</p><h3>{text('FABRICATE.Admin.Manager.Tools.Editor.BonusToCheck', 'Bonus to the check')}</h3><p>{text('FABRICATE.Admin.Manager.Tools.Editor.BonusToCheckHint', 'What using this Tool adds to the crafting check, if anything.')}</p></div>
      <label class="manager-status-toggle manager-tool-setting-toggle" class:is-on={bonus.enabled} class:is-off={!bonus.enabled}>
        <input class="manager-tool-setting-toggle-input" type="checkbox" data-tool-bonus-enabled aria-label={text('FABRICATE.Admin.Manager.Tools.Editor.ToggleBonus', 'Enable Tool check bonus')} checked={bonus.enabled} onchange={(event) => patchBonus({ enabled: event.currentTarget.checked })} />
        <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
      </label>
    </div>
    <fieldset disabled={!bonus.enabled}>
      <label><span>{text('FABRICATE.Admin.Manager.Tools.Editor.BonusExpression', 'Bonus expression')}</span><RollDataExpressionInput dataField="tool-bonus" value={bonus.expression || ''} placeholder="prof" disabled={!bonus.enabled} onChange={(expression) => patchBonus({ expression })} /></label>
      <div class="manager-tool-bonus-presets" aria-label={text('FABRICATE.Admin.Manager.Tools.Editor.BonusPresets', 'Bonus presets')}>
        {#each bonusPresets as preset (preset)}<button type="button" class="manager-chip is-neutral" data-tool-bonus-preset={preset} onclick={() => patchBonus({ expression: preset })}>{displayRollDataExpression(preset)}</button>{/each}
      </div>
    </fieldset>
  </section>
</div>
