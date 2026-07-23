<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Stepper from '../../../components/Stepper.svelte';
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
  let replacementTypeChoice = $state(tool?.onBreak?.replacementTarget?.type || 'component');
  const immune = $derived(authority === 'checkDriven' && tool?.checkBreakable === false);
  const onBreak = $derived(tool?.onBreak || { mode: 'destroy' });

  $effect(() => {
    if (tool?.id === cachedToolId) return;
    configs = createBreakageConfigs(tool?.breakage);
    replacementTypeChoice = tool?.onBreak?.replacementTarget?.type || 'component';
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
  function setReplacementType(type) {
    replacementTypeChoice = type;
    setReplacement(type, '');
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
  <section class="manager-tool-authority-readonly" data-tool-breakage-authority-explanation>
    <span class="manager-tool-authority-icon"><i class="fas fa-sliders" aria-hidden="true"></i></span>
    <div><p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.AuthorityKicker', 'System breakage')}</p><h3>{authority === 'checkDriven' ? text('FABRICATE.Admin.Manager.Tools.AuthorityCheckDriven', 'Check-driven') : text('FABRICATE.Admin.Manager.Tools.AuthorityToolSpecific', 'Tool-specific')}</h3><p>{text('FABRICATE.Admin.Manager.Tools.Editor.AuthorityExplanation', 'Set for every Tool from the Tools library. Each Tool keeps its own settings for both models.')}</p></div>
    <span class="manager-chip is-neutral"><i class="fas fa-lock" aria-hidden="true"></i>{text('FABRICATE.Admin.Manager.Tools.Editor.SystemSetting', 'System setting')}</span>
  </section>

  <section class="manager-tool-breakage-method">
    <div class="manager-tool-section-heading" data-tool-breakage-method-heading>
      <div><p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.Editor.BreakageKicker', 'Breakage')}</p><h3>{authority === 'toolSpecific' ? text('FABRICATE.Admin.Manager.Tools.Editor.HowThisToolBreaks', 'How this Tool breaks') : text('FABRICATE.Admin.Manager.Tools.Editor.CanThisToolBreak', 'Can this Tool break?')}</h3></div>
      <p>{authority === 'toolSpecific' ? text('FABRICATE.Admin.Manager.Tools.Editor.HowThisToolBreaksHint', 'Each Tool tracks its own breakage. Pick the method for this one.') : text('FABRICATE.Admin.Manager.Tools.Editor.CanThisToolBreakHint', 'The crafting check decides whether a breakable Tool breaks.')}</p>
    </div>
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
        <div class="manager-tool-breakage-config" data-tool-limited-uses-stepper>
          <div><p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.Editor.UsesPerCopy', 'Uses per copy')}</p><small>{text('FABRICATE.Admin.Manager.Tools.Editor.UsesPerCopyHint', 'A fresh copy starts with this many uses.')}</small></div>
          <Stepper
            value={tool.breakage.maxUses ?? 1}
            min={1}
            ariaLabel={text('FABRICATE.Admin.Manager.Tools.BreakageMaxUses', 'Maximum uses')}
            decrementLabel={text('FABRICATE.Admin.Manager.Tools.Editor.DecreaseUses', 'Decrease uses')}
            incrementLabel={text('FABRICATE.Admin.Manager.Tools.Editor.IncreaseUses', 'Increase uses')}
            inputProps={{ 'data-tool-max-uses': '' }}
            onChange={(maxUses) => patchBreakage({ maxUses })}
          />
        </div>
        <aside class="manager-tool-info-strip" data-tool-limited-uses-info><i class="fas fa-circle-info" aria-hidden="true"></i><p>{text('FABRICATE.Admin.Manager.Tools.Editor.PerCopyInfo', 'Each copy tracks its own remaining uses. A character inventory, not this archetype, records that remaining count.')}</p></aside>
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

  <fieldset class="manager-tool-on-break" data-tool-on-break-controls disabled={immune}>
    <legend><span>{text('FABRICATE.Admin.Manager.Tools.Editor.WhenItBreaks', 'When it breaks')}</span><small>{immune ? text('FABRICATE.Admin.Manager.Tools.Editor.InactiveWhileImmune', 'Inactive while Immune') : text('FABRICATE.Admin.Manager.Tools.Editor.AlwaysFires', 'Always fires')}</small></legend>
    <p>{text('FABRICATE.Admin.Manager.Tools.Editor.WhenItBreaksHint', 'Every Tool has an on-break action. It runs the moment breakage is triggered.')}</p>
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
        <label><span>{text('FABRICATE.Admin.Manager.Tools.Editor.ReplacementType', 'Replacement target type')}</span><select data-tool-replacement-type value={replacementTypeChoice} onchange={(event) => setReplacementType(event.currentTarget.value)}><option value="component">{text('FABRICATE.Admin.Manager.Tools.Editor.ReplacementComponent', 'Managed Component')}</option><option value="item">{text('FABRICATE.Admin.Manager.Tools.Editor.ReplacementItem', 'Direct Item')}</option></select></label>
        {#if replacementTypeChoice === 'component'}
          <label><span>{text('FABRICATE.Admin.Manager.Tools.Editor.ReplacementComponent', 'Managed Component')}</span><select data-tool-replacement-picker value={onBreak.replacementTarget?.type === 'component' ? onBreak.replacementTarget.componentId : ''} onchange={(event) => setReplacement('component', event.currentTarget.value)}><option value="">{text('FABRICATE.Admin.Manager.Tools.Editor.ChooseComponent', 'Choose component')}</option>{#each componentOptions as option (option.id)}<option value={option.id}>{option.name}</option>{/each}</select></label>
        {:else}
          <label><span>{text('FABRICATE.Admin.Manager.Tools.Editor.ReplacementItem', 'Direct Item')}</span><select data-tool-replacement-picker value={onBreak.replacementTarget?.type === 'item' ? onBreak.replacementTarget.itemUuid : ''} onchange={(event) => setReplacement('item', event.currentTarget.value)}><option value="">{text('FABRICATE.Admin.Manager.Tools.SelectItem', 'Select an Item')}</option>{#each worldItems as item (item.uuid)}<option value={item.uuid}>{item.name}</option>{/each}</select></label>
        {/if}
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
