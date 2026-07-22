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
  <section class="manager-tool-editor-card">
    <div class="manager-tool-editor-card-heading">
      <div><p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.Editor.Prerequisites', 'Prerequisites')}</p><h3>{text('FABRICATE.Admin.Manager.Tools.Editor.SharedPrerequisites', 'Shared character prerequisites')}</h3></div>
      <label class="manager-toggle-field"><input type="checkbox" data-tool-prerequisites-enabled checked={prerequisites.enabled} onchange={(event) => patchPrerequisites({ enabled: event.currentTarget.checked })} /><span>{prerequisites.enabled ? text('FABRICATE.Admin.Manager.StatusOn', 'On') : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}</span></label>
    </div>
    <fieldset disabled={!prerequisites.enabled} class="manager-tool-prerequisite-list">
      <legend>{text('FABRICATE.Admin.Manager.Tools.Editor.RequiredAll', 'All selected prerequisites are required (AND)')}</legend>
      {#if prerequisiteOptions.length === 0}<p class="manager-muted">{text('FABRICATE.Admin.Manager.Tools.Editor.NoPrerequisites', 'No shared prerequisites are defined for this system.')}</p>{/if}
      {#each prerequisiteOptions as option (option.id)}
        <label><input type="checkbox" value={option.id} checked={(prerequisites.ids || []).includes(option.id)} onchange={(event) => togglePrerequisite(option.id, event.currentTarget.checked)} /><span><strong>{option.name || option.label || option.id}</strong>{#if option.expression}<small>{option.expression}</small>{/if}</span></label>
      {/each}
    </fieldset>
    <fieldset disabled={!prerequisites.enabled} class="manager-tool-segments">
      <legend>{text('FABRICATE.Admin.Manager.Tools.Editor.GateMode', 'When prerequisites fail')}</legend>
      <label class:is-selected={prerequisites.gateMode === 'usability'}><input type="radio" name="tool-gate-mode" value="usability" checked={prerequisites.gateMode === 'usability'} onchange={() => patchPrerequisites({ gateMode: 'usability' })} /><span>{text('FABRICATE.Admin.Manager.Tools.Editor.GateUsability', 'Tool is unusable')}</span></label>
      <label class:is-selected={prerequisites.gateMode === 'bonus'}><input type="radio" name="tool-gate-mode" value="bonus" checked={prerequisites.gateMode === 'bonus'} onchange={() => patchPrerequisites({ gateMode: 'bonus' })} /><span>{text('FABRICATE.Admin.Manager.Tools.Editor.GateBonus', 'Bonus is withheld')}</span></label>
    </fieldset>
  </section>

  <section class="manager-tool-editor-card">
    <div class="manager-tool-editor-card-heading">
      <div><p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.Editor.Bonus', 'Bonus')}</p><h3>{text('FABRICATE.Admin.Manager.Tools.Editor.ToolBonus', 'Tool check bonus')}</h3></div>
      <label class="manager-toggle-field"><input type="checkbox" data-tool-bonus-enabled checked={bonus.enabled} onchange={(event) => patchBonus({ enabled: event.currentTarget.checked })} /><span>{bonus.enabled ? text('FABRICATE.Admin.Manager.StatusOn', 'On') : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}</span></label>
    </div>
    <fieldset disabled={!bonus.enabled}>
      <label><span>{text('FABRICATE.Admin.Manager.Tools.Editor.BonusExpression', 'Bonus expression')}</span><input data-tool-bonus-expression value={bonus.expression || ''} placeholder="+1" oninput={(event) => patchBonus({ expression: event.currentTarget.value })} /></label>
      <div class="manager-tool-bonus-presets" aria-label={text('FABRICATE.Admin.Manager.Tools.Editor.BonusPresets', 'Bonus presets')}>
        {#each ['+1', '+2', '1d4'] as preset}<button type="button" class="manager-chip is-neutral" data-tool-bonus-preset={preset} onclick={() => patchBonus({ expression: preset })}>{preset}</button>{/each}
      </div>
    </fieldset>
  </section>
</div>
