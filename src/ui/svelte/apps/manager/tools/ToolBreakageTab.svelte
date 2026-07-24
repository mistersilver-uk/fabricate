<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Stepper from '../../../components/Stepper.svelte';
  import ItemDropZone from '../ItemDropZone.svelte';
  import RadioCardGroup from '../RadioCardGroup.svelte';
  import SearchablePopover from '../SearchablePopover.svelte';
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
    onReplacementItemDrop = () => {},
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
  let replacementTypeChoice = $state('component');
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
  const breakageModeOptions = $derived(['limitedUses', 'breakageChance', 'diceExpression'].map((mode) => ({
    value: mode,
    label: breakageModeLabel(mode),
    description: breakageModeDescription(mode),
    icon: breakageModeIcon(mode),
  })));
  const breakabilityOptions = $derived([
    {
      value: 'breakable',
      label: text('FABRICATE.Admin.Manager.Tools.SummaryBreakable', 'Breakable'),
      description: text('FABRICATE.Admin.Manager.Tools.BreakageBreakableHint', 'The active check may break this Tool.'),
      icon: 'fas fa-hammer',
    },
    {
      value: 'immune',
      label: text('FABRICATE.Admin.Manager.Tools.SummaryImmune', 'Immune'),
      description: text('FABRICATE.Admin.Manager.Tools.BreakageImmuneHint', 'This Tool ignores check-driven breakage.'),
      icon: 'fas fa-shield',
    },
  ]);
  const onBreakOptions = $derived(['destroy', 'flagBroken', 'replaceWith'].map((mode) => ({
    value: mode,
    label: onBreakModeLabel(mode),
    description: onBreakModeDescription(mode),
    icon: onBreakModeIcon(mode),
  })));
  const replacementTypeOptions = $derived([
    {
      value: 'component',
      label: text('FABRICATE.Admin.Manager.Tools.Editor.ReplacementComponent', 'Managed Component'),
      description: text('FABRICATE.Admin.Manager.Tools.Editor.ReplacementComponentHint', 'Replace with a Component managed by this crafting system.'),
      icon: 'fas fa-cube',
    },
    {
      value: 'item',
      label: text('FABRICATE.Admin.Manager.Tools.Editor.ReplacementItem', 'Direct Item'),
      description: text('FABRICATE.Admin.Manager.Tools.Editor.ReplacementItemHint', 'Replace with a dropped world or compendium Item.'),
      icon: 'fas fa-box',
    },
  ]);
  const componentPickerOptions = $derived(componentOptions.map((option) => ({
    id: option.id,
    label: option.name,
    img: option.img,
  })));
  const selectedComponent = $derived(
    componentOptions.find((option) => option.id === onBreak.replacementTarget?.componentId)
  );
  const replacementItem = $derived.by(() => {
    if (onBreak.replacementTarget?.type !== 'item' || !onBreak.replacementTarget.itemUuid) return null;
    const uuid = onBreak.replacementTarget.itemUuid;
    const resolved = worldItems.find((item) => item.uuid === uuid);
    return resolved || { uuid, name: uuid, img: 'icons/svg/item-bag.svg' };
  });
  function breakageModeLabel(mode) {
    return {
      limitedUses: text('FABRICATE.Admin.Manager.Tools.BreakageLimitedUses', 'Limited uses'),
      breakageChance: text('FABRICATE.Admin.Manager.Tools.BreakageChance', 'Breakage chance'),
      diceExpression: text('FABRICATE.Admin.Manager.Tools.BreakageDice', 'Dice expression'),
    }[mode];
  }
  function breakageModeDescription(mode) {
    return {
      limitedUses: text('FABRICATE.Admin.Manager.Tools.BreakageLimitedUsesHint', 'A fixed number of uses, then it breaks.'),
      breakageChance: text('FABRICATE.Admin.Manager.Tools.BreakageChanceHint', 'A % chance to break each use.'),
      diceExpression: text('FABRICATE.Admin.Manager.Tools.BreakageDiceHint', 'Roll a separate breakage check.'),
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
      destroy: text('FABRICATE.Admin.Manager.Tools.OnBreakDestroy', 'Destroy the item'),
      flagBroken: text('FABRICATE.Admin.Manager.Tools.OnBreakFlag', 'Mark as broken'),
      replaceWith: text('FABRICATE.Admin.Manager.Tools.OnBreakReplace', 'Replace with item'),
    }[mode];
  }
  function onBreakModeDescription(mode) {
    return {
      destroy: text('FABRICATE.Admin.Manager.Tools.OnBreakDestroyHint', 'The tool is consumed and removed.'),
      flagBroken: text('FABRICATE.Admin.Manager.Tools.OnBreakFlagHint', 'Sets a broken flag; appends " (Broken)".'),
      replaceWith: text('FABRICATE.Admin.Manager.Tools.OnBreakReplaceHint', 'Swap it for another item.'),
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
    <div><p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.AuthorityKicker', 'System breakage')}</p><h3>{authority === 'checkDriven' ? text('FABRICATE.Admin.Manager.Tools.AuthorityCheckDriven', 'Check-driven') : text('FABRICATE.Admin.Manager.Tools.AuthorityToolSpecific', 'Tool-specific')}</h3><p>{text('FABRICATE.Admin.Manager.Tools.Editor.AuthorityExplanation', 'Set for every Tool from the Tools library.')}</p></div>
    <span class="manager-chip is-neutral"><i class="fas fa-lock" aria-hidden="true"></i><span>{text('FABRICATE.Admin.Manager.Tools.Editor.SystemSetting', 'System-wide')}</span></span>
  </section>

  <section class="manager-tool-breakage-method">
    <div class="manager-tool-section-heading" data-tool-breakage-method-heading>
      <div>
        <h3><i class="fas fa-heart-crack" aria-hidden="true"></i>{authority === 'toolSpecific' ? text('FABRICATE.Admin.Manager.Tools.Editor.HowThisToolBreaks', 'How this Tool breaks') : text('FABRICATE.Admin.Manager.Tools.Editor.CanThisToolBreak', 'Can this Tool break?')}</h3>
        <p>{authority === 'toolSpecific' ? text('FABRICATE.Admin.Manager.Tools.Editor.HowThisToolBreaksHint', 'Each Tool tracks its own breakage. Pick the method for this one.') : text('FABRICATE.Admin.Manager.Tools.Editor.CanThisToolBreakHint', 'The crafting check decides whether a breakable Tool breaks.')}</p>
      </div>
    </div>
    {#if authority === 'toolSpecific'}
      <RadioCardGroup
        legend={text('FABRICATE.Admin.Manager.Tools.BreakageTitle', 'Breakage mechanic')}
        options={breakageModeOptions}
        selectedValue={tool?.breakage?.mode}
        groupName="tool-breakage-mode"
        columns={3}
        dataGroup="tool-breakage-mode"
        optionDataAttr="data-tool-breakage-choice"
        onChange={changeMode}
      />
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
      <RadioCardGroup
        legend={text('FABRICATE.Admin.Manager.Tools.BreakageTitle', 'Breakage mechanic')}
        options={breakabilityOptions}
        selectedValue={tool?.checkBreakable === false ? 'immune' : 'breakable'}
        groupName="tool-check-breakable"
        columns={2}
        dataGroup="tool-breakability"
        optionDataAttr="data-tool-breakability-choice"
        onChange={(value) => onPatch({ checkBreakable: value === 'breakable' })}
      />
    {/if}
  </section>

  <fieldset class="manager-tool-on-break" data-tool-on-break-controls disabled={immune}>
    <legend><span>{text('FABRICATE.Admin.Manager.Tools.Editor.WhenItBreaks', 'When it breaks')}</span><small>{immune ? text('FABRICATE.Admin.Manager.Tools.Editor.InactiveWhileImmune', 'Inactive while Immune') : text('FABRICATE.Admin.Manager.Tools.Editor.AlwaysFires', 'Always fires')}</small></legend>
    <p>{text('FABRICATE.Admin.Manager.Tools.Editor.WhenItBreaksHint', 'Every Tool has an on-break action. It runs the moment breakage is triggered.')}</p>
    {#if immune}<p class="manager-tool-info-strip"><i class="fas fa-shield" aria-hidden="true"></i>{text('FABRICATE.Admin.Manager.Tools.Editor.ImmuneHint', 'Immune Tools never run an on-break action.')}</p>{/if}
    <RadioCardGroup
      legend={text('FABRICATE.Admin.Manager.Tools.OnBreakTitle', 'On-break action')}
      options={onBreakOptions}
      selectedValue={onBreak.mode}
      groupName="tool-on-break"
      columns={3}
      disabled={immune}
      dataGroup="tool-on-break"
      optionDataAttr="data-tool-on-break-choice"
      onChange={setOnBreakMode}
    />
    {#if onBreak.mode === 'replaceWith'}
      <div class="manager-tool-replacement-stack" data-tool-replacement-target>
        <RadioCardGroup
          legend={text('FABRICATE.Admin.Manager.Tools.Editor.ReplacementType', 'Replacement target type')}
          options={replacementTypeOptions}
          selectedValue={replacementTypeChoice}
          groupName="tool-replacement-type"
          columns={2}
          dataGroup="tool-replacement-type"
          onChange={setReplacementType}
        />
        {#if replacementTypeChoice === 'component'}
          <SearchablePopover
            options={componentPickerOptions}
            value={selectedComponent?.id || ''}
            triggerClass="manager-button manager-tool-replacement-component-trigger"
            triggerIcon="fas fa-cube"
            triggerImg={selectedComponent?.img || ''}
            triggerLabel={selectedComponent?.name || text('FABRICATE.Admin.Manager.Tools.Editor.ChooseComponent', 'Choose component')}
            triggerAriaLabel={text('FABRICATE.Admin.Manager.Tools.Editor.ChooseComponent', 'Choose component')}
            dialogAriaLabel={text('FABRICATE.Admin.Manager.Tools.Editor.ChooseComponent', 'Choose component')}
            searchPlaceholder={text('FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder', 'Search components...')}
            onChoose={(value) => setReplacement('component', value)}
          />
        {:else}
          <ItemDropZone
            kind="tool-replacement"
            item={replacementItem}
            title={text('FABRICATE.Admin.Manager.Tools.Editor.ReplacementDropTitle', 'Drop a replacement Item here')}
            hint={text('FABRICATE.Admin.Manager.Tools.Editor.ReplacementDropHint', 'Drop a world or compendium Item to replace the current target.')}
            onDrop={onReplacementItemDrop}
            unlinkLabel={text('FABRICATE.Admin.Manager.Tools.Editor.ClearReplacement', 'Clear replacement Item')}
            onUnlink={replacementItem ? () => setReplacement('item', '') : null}
          />
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
