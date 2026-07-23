<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';

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
    const ids = new Set(prerequisites.ids || []);
    if (checked) ids.add(id); else ids.delete(id);
    patchPrerequisites({ ids: [...ids] });
  }
  function patchBonus(patch) {
    onPatch({ bonus: { ...bonus, ...patch } });
  }
</script>

<div class="manager-tool-tab-stack" data-tool-requirements-tab>
  <section class="manager-tool-requirements-section">
    <div class="manager-tool-editor-card-heading">
      <div><p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.Editor.Prerequisites', 'Prerequisites')}</p><h3>{text('FABRICATE.Admin.Manager.Tools.Editor.CharacterPrerequisites', 'Character prerequisites')}</h3><p>{text('FABRICATE.Admin.Manager.Tools.Editor.CharacterPrerequisitesHint', 'Gate who may wield this Tool. Prerequisites are defined in the crafting system editor; pick which ones apply.')}</p></div>
      <label class="manager-toggle-field"><input type="checkbox" data-tool-prerequisites-enabled checked={prerequisites.enabled} onchange={(event) => patchPrerequisites({ enabled: event.currentTarget.checked })} /><span>{prerequisites.enabled ? text('FABRICATE.Admin.Manager.StatusOn', 'On') : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}</span></label>
    </div>
    <fieldset disabled={!prerequisites.enabled} class="manager-tool-prerequisite-list">
      {#if prerequisiteOptions.length === 0}<p class="manager-muted">{text('FABRICATE.Admin.Manager.Tools.Editor.NoPrerequisites', 'No shared prerequisites are defined for this system.')}</p>{/if}
      {#each prerequisiteOptions as option (option.id)}
        <label data-tool-prerequisite-row><span class="manager-tool-prerequisite-check"><input type="checkbox" value={option.id} checked={(prerequisites.ids || []).includes(option.id)} onchange={(event) => togglePrerequisite(option.id, event.currentTarget.checked)} /><i class="fas fa-check" aria-hidden="true"></i></span><span><strong>{option.name || option.label || option.id}</strong>{#if option.expression}<small>{option.expression}</small>{/if}</span></label>
      {/each}
    </fieldset>
    <p class="manager-tool-requirements-summary">{text('FABRICATE.Admin.Manager.Tools.Editor.RequiredAll', 'All selected prerequisites are required (AND)')}</p>
    <fieldset disabled={!prerequisites.enabled} class="manager-tool-segments">
      <legend>{text('FABRICATE.Admin.Manager.Tools.Editor.GateMode', 'When prerequisites fail')}</legend>
      <label class:is-selected={prerequisites.gateMode === 'usability'}><input type="radio" name="tool-gate-mode" value="usability" checked={prerequisites.gateMode === 'usability'} onchange={() => patchPrerequisites({ gateMode: 'usability' })} /><span>{text('FABRICATE.Admin.Manager.Tools.Editor.GateUsability', 'Tool is unusable')}</span></label>
      <label class:is-selected={prerequisites.gateMode === 'bonus'}><input type="radio" name="tool-gate-mode" value="bonus" checked={prerequisites.gateMode === 'bonus'} onchange={() => patchPrerequisites({ gateMode: 'bonus' })} /><span>{text('FABRICATE.Admin.Manager.Tools.Editor.GateBonus', 'Bonus is withheld')}</span></label>
    </fieldset>
  </section>

  <hr data-tool-requirements-divider />

  <section class="manager-tool-requirements-section">
    <div class="manager-tool-editor-card-heading">
      <div><p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.Editor.Bonus', 'Bonus')}</p><h3>{text('FABRICATE.Admin.Manager.Tools.Editor.BonusToCheck', 'Bonus to the check')}</h3><p>{text('FABRICATE.Admin.Manager.Tools.Editor.BonusToCheckHint', 'What using this Tool adds to the crafting check, if anything.')}</p></div>
      <label class="manager-toggle-field"><input type="checkbox" data-tool-bonus-enabled checked={bonus.enabled} onchange={(event) => patchBonus({ enabled: event.currentTarget.checked })} /><span>{bonus.enabled ? text('FABRICATE.Admin.Manager.StatusOn', 'On') : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}</span></label>
    </div>
    <fieldset disabled={!bonus.enabled}>
      <label><span>{text('FABRICATE.Admin.Manager.Tools.Editor.BonusExpression', 'Bonus expression')}</span><input data-tool-bonus-expression value={bonus.expression || ''} placeholder="+1" oninput={(event) => patchBonus({ expression: event.currentTarget.value })} /></label>
      <div class="manager-tool-bonus-presets" aria-label={text('FABRICATE.Admin.Manager.Tools.Editor.BonusPresets', 'Bonus presets')}>
        {#each ['@prof', '@abilities.str.mod', '@abilities.dex.mod', '1d4'] as preset}<button type="button" class="manager-chip is-neutral" data-tool-bonus-preset={preset} onclick={() => patchBonus({ expression: preset })}>{preset}</button>{/each}
      </div>
    </fieldset>
  </section>
</div>
