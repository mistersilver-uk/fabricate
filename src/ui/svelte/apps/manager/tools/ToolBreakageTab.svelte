<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import ToolRepairRequirements from './ToolRepairRequirements.svelte';

  let {
    tool = null,
    authority = 'toolSpecific',
    componentOptions = [],
    worldItems = [],
    itemTags = [],
    essenceOptions = [],
    currencyUnits = [],
    currencyEnabled = false,
    onPatch = () => {},
  } = $props();
  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
  function createBreakageConfigs(breakage = { mode: 'limitedUses', maxUses: null }) {
    return {
      limitedUses: breakage.mode === 'limitedUses' ? { ...breakage } : { mode: 'limitedUses', maxUses: null },
      breakageChance: breakage.mode === 'breakageChance' ? { ...breakage } : { mode: 'breakageChance', breakageChance: 0 },
      diceExpression: breakage.mode === 'diceExpression' ? { ...breakage } : { mode: 'diceExpression', formula: '1d20', threshold: 1 },
    };
  }
  let configs = $state(createBreakageConfigs());
  let cachedToolId = $state(Symbol('uncached-tool'));
  const immune = $derived(authority === 'checkDriven' && tool?.checkBreakable === false);
  const onBreak = $derived(tool?.onBreak || { mode: 'destroy' });

  $effect(() => {
    if (tool?.id === cachedToolId) return;
    configs = createBreakageConfigs(tool?.breakage);
    cachedToolId = tool?.id ?? null;
  });

  function changeMode(mode) {
    onPatch({ breakage: { ...configs[mode] } });
  }
  function patchBreakage(patch) {
    const mode = tool?.breakage?.mode || 'limitedUses';
    configs = { ...configs, [mode]: { ...configs[mode], ...patch } };
    onPatch({ breakage: configs[mode] });
  }
  function patchOnBreak(patch) {
    onPatch({ onBreak: { ...onBreak, ...patch } });
  }
  function setOnBreakMode(mode) {
    onPatch({ onBreak: mode === 'replaceWith' ? { mode, replacementTarget: onBreak.replacementTarget || null } : { mode } });
  }
  function setReplacement(type, value) {
    patchOnBreak({ replacementTarget: type === 'component' ? { type, componentId: value } : { type, itemUuid: value } });
  }
  function breakageModeLabel(mode) {
    return {
      limitedUses: text('FABRICATE.Admin.Manager.Tools.BreakageLimitedUses', 'Limited uses'),
      breakageChance: text('FABRICATE.Admin.Manager.Tools.BreakageChance', 'Breakage chance'),
      diceExpression: text('FABRICATE.Admin.Manager.Tools.BreakageDice', 'Dice expression'),
    }[mode];
  }
  function breakageModeDescription(mode) {
    return {
      limitedUses: text('FABRICATE.Admin.Manager.Tools.BreakageLimitedUsesHint', 'Break after a fixed number of uses.'),
      breakageChance: text('FABRICATE.Admin.Manager.Tools.BreakageChanceHint', 'Roll a percentage chance after each use.'),
      diceExpression: text('FABRICATE.Admin.Manager.Tools.BreakageDiceHint', 'Roll a formula against a break threshold.'),
    }[mode];
  }
  function breakageModeIcon(mode) {
    return {
      limitedUses: 'fas fa-hourglass-half',
      breakageChance: 'fas fa-percent',
      diceExpression: 'fas fa-dice-d20',
    }[mode];
  }
  function onBreakModeLabel(mode) {
    return {
      destroy: text('FABRICATE.Admin.Manager.Tools.OnBreakDestroy', 'Destroy item'),
      flagBroken: text('FABRICATE.Admin.Manager.Tools.OnBreakFlag', 'Mark as broken'),
      replaceWith: text('FABRICATE.Admin.Manager.Tools.OnBreakReplace', 'Replace with item'),
    }[mode];
  }
  function onBreakModeDescription(mode) {
    return {
      destroy: text('FABRICATE.Admin.Manager.Tools.OnBreakDestroyHint', "The Item is removed from the actor's inventory."),
      flagBroken: text('FABRICATE.Admin.Manager.Tools.OnBreakFlagHint', 'The Item remains but is flagged as broken.'),
      replaceWith: text('FABRICATE.Admin.Manager.Tools.OnBreakReplaceHint', 'The Item is replaced after it breaks.'),
    }[mode];
  }
  function onBreakModeIcon(mode) {
    return {
      destroy: 'fas fa-trash',
      flagBroken: 'fas fa-triangle-exclamation',
      replaceWith: 'fas fa-arrow-right-arrow-left',
    }[mode];
  }
</script>

<div class="manager-tool-tab-stack" data-tool-breakage-tab>
  <section class="manager-tool-editor-card manager-tool-authority-readonly">
    <div><p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.AuthorityKicker', 'System breakage')}</p><h3>{authority === 'checkDriven' ? text('FABRICATE.Admin.Manager.Tools.AuthorityCheckDriven', 'Check-driven') : text('FABRICATE.Admin.Manager.Tools.AuthorityToolSpecific', 'Tool-specific')}</h3></div>
    <span class="manager-chip is-neutral"><i class="fas fa-lock" aria-hidden="true"></i>{text('FABRICATE.Admin.Manager.Tools.Editor.SystemSetting', 'System setting')}</span>
  </section>

  <section class="manager-tool-editor-card">
    <h3>{text('FABRICATE.Admin.Manager.Tools.BreakageTitle', 'Breakage mechanic')}</h3>
    {#if authority === 'toolSpecific'}
      <div class="manager-tool-choice-grid" role="radiogroup" aria-label={text('FABRICATE.Admin.Manager.Tools.BreakageTitle', 'Breakage mechanic')}>
        {#each ['limitedUses', 'breakageChance', 'diceExpression'] as mode (mode)}
          <label class="manager-tool-choice-card" class:is-selected={tool?.breakage?.mode === mode} data-tool-breakage-choice={mode}>
            <input type="radio" name="tool-breakage-mode" value={mode} checked={tool?.breakage?.mode === mode} onchange={() => changeMode(mode)} />
            <span class="manager-tool-choice-icon" data-tool-choice-icon><i class={breakageModeIcon(mode)} aria-hidden="true"></i></span>
            <span class="manager-tool-choice-copy">
              <strong data-tool-choice-title>{breakageModeLabel(mode)}</strong>
              <small data-tool-choice-description>{breakageModeDescription(mode)}</small>
            </span>
          </label>
        {/each}
      </div>
      {#if tool?.breakage?.mode === 'limitedUses'}
        <label><span>{text('FABRICATE.Admin.Manager.Tools.BreakageMaxUses', 'Maximum uses')}</span><input data-tool-max-uses type="number" min="1" value={tool.breakage.maxUses ?? ''} placeholder={text('FABRICATE.Admin.Manager.Tools.BreakageMaxUsesHint', 'Blank = unlimited')} oninput={(event) => patchBreakage({ maxUses: event.currentTarget.value === '' ? null : Number(event.currentTarget.value) })} /></label>
      {:else if tool?.breakage?.mode === 'breakageChance'}
        <label><span>{text('FABRICATE.Admin.Manager.Tools.BreakageChancePercent', 'Break chance (%)')}</span><input data-tool-breakage-chance type="number" min="0" max="100" value={tool.breakage.breakageChance ?? 0} oninput={(event) => patchBreakage({ breakageChance: Number(event.currentTarget.value) })} /></label>
      {:else}
        <div class="manager-tool-inline-fields"><label><span>{text('FABRICATE.Admin.Manager.Tools.BreakageFormula', 'Formula')}</span><input data-tool-breakage-formula value={tool?.breakage?.formula || ''} oninput={(event) => patchBreakage({ formula: event.currentTarget.value })} /></label><label><span>{text('FABRICATE.Admin.Manager.Tools.BreakageThreshold', 'Break below')}</span><input data-tool-breakage-threshold type="number" value={tool?.breakage?.threshold ?? 0} oninput={(event) => patchBreakage({ threshold: Number(event.currentTarget.value) })} /></label></div>
      {/if}
    {:else}
      <div class="manager-tool-choice-grid is-two-up" role="radiogroup" aria-label={text('FABRICATE.Admin.Manager.Tools.BreakageTitle', 'Breakage mechanic')}>
        <label class="manager-tool-choice-card" class:is-selected={tool?.checkBreakable !== false} data-tool-breakability-choice="breakable">
          <input type="radio" name="tool-check-breakable" value="breakable" checked={tool?.checkBreakable !== false} onchange={() => onPatch({ checkBreakable: true })} />
          <span class="manager-tool-choice-icon" data-tool-choice-icon><i class="fas fa-hammer" aria-hidden="true"></i></span>
          <span class="manager-tool-choice-copy">
            <strong data-tool-choice-title>{text('FABRICATE.Admin.Manager.Tools.SummaryBreakable', 'Breakable')}</strong>
            <small data-tool-choice-description>{text('FABRICATE.Admin.Manager.Tools.BreakageBreakableHint', 'The active check may break this Tool.')}</small>
          </span>
        </label>
        <label class="manager-tool-choice-card" class:is-selected={tool?.checkBreakable === false} data-tool-breakability-choice="immune">
          <input type="radio" name="tool-check-breakable" value="immune" checked={tool?.checkBreakable === false} onchange={() => onPatch({ checkBreakable: false })} />
          <span class="manager-tool-choice-icon" data-tool-choice-icon><i class="fas fa-shield" aria-hidden="true"></i></span>
          <span class="manager-tool-choice-copy">
            <strong data-tool-choice-title>{text('FABRICATE.Admin.Manager.Tools.SummaryImmune', 'Immune')}</strong>
            <small data-tool-choice-description>{text('FABRICATE.Admin.Manager.Tools.BreakageImmuneHint', 'This Tool ignores check-driven breakage.')}</small>
          </span>
        </label>
      </div>
    {/if}
  </section>

  <fieldset class="manager-tool-editor-card manager-tool-on-break" data-tool-on-break-controls disabled={immune}>
    <legend>{text('FABRICATE.Admin.Manager.Tools.OnBreakTitle', 'On-break action')}</legend>
    {#if immune}<p class="manager-tool-info-strip"><i class="fas fa-shield" aria-hidden="true"></i>{text('FABRICATE.Admin.Manager.Tools.Editor.ImmuneHint', 'Immune Tools never run an on-break action.')}</p>{/if}
    <div class="manager-tool-choice-grid" role="radiogroup" aria-label={text('FABRICATE.Admin.Manager.Tools.OnBreakTitle', 'On-break action')}>
      {#each ['destroy', 'flagBroken', 'replaceWith'] as action (action)}
        <label class="manager-tool-choice-card" class:is-selected={onBreak.mode === action} data-tool-on-break-choice={action}>
          <input type="radio" name="tool-on-break" value={action} checked={onBreak.mode === action} disabled={immune} onchange={() => setOnBreakMode(action)} />
          <span class="manager-tool-choice-icon" data-tool-choice-icon><i class={onBreakModeIcon(action)} aria-hidden="true"></i></span>
          <span class="manager-tool-choice-copy">
            <strong data-tool-choice-title>{onBreakModeLabel(action)}</strong>
            <small data-tool-choice-description>{onBreakModeDescription(action)}</small>
          </span>
        </label>
      {/each}
    </div>
    {#if onBreak.mode === 'replaceWith'}
      <div class="manager-tool-replacement-grid" data-tool-replacement-target>
        <label><span>{text('FABRICATE.Admin.Manager.Tools.Editor.ReplacementComponent', 'Managed Component')}</span><select value={onBreak.replacementTarget?.type === 'component' ? onBreak.replacementTarget.componentId : ''} onchange={(event) => setReplacement('component', event.currentTarget.value)}><option value="">{text('FABRICATE.Admin.Manager.Tools.Editor.ChooseComponent', 'Choose component')}</option>{#each componentOptions as option (option.id)}<option value={option.id}>{option.name}</option>{/each}</select></label>
        <span>{text('FABRICATE.Admin.Manager.Tools.Editor.Or', 'or')}</span>
        <label><span>{text('FABRICATE.Admin.Manager.Tools.Editor.ReplacementItem', 'Direct Item')}</span><select value={onBreak.replacementTarget?.type === 'item' ? onBreak.replacementTarget.itemUuid : ''} onchange={(event) => setReplacement('item', event.currentTarget.value)}><option value="">{text('FABRICATE.Admin.Manager.Tools.SelectItem', 'Select an Item')}</option>{#each worldItems as item (item.uuid)}<option value={item.uuid}>{item.name}</option>{/each}</select></label>
      </div>
    {/if}
    {#if onBreak.mode === 'flagBroken'}
      <ToolRepairRequirements
        groups={tool?.repairRequirements || []}
        {componentOptions}
        {itemTags}
        {essenceOptions}
        {currencyUnits}
        {currencyEnabled}
        disabled={immune}
        onChange={(repairRequirements) => onPatch({ repairRequirements })}
      />
    {/if}
  </fieldset>
</div>
