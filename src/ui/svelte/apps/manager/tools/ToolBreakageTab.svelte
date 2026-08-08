<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { toolBreakageChanceColor } from '../../../util/chanceColorScale.js';
  import ChanceSlider from '../../../components/ChanceSlider.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import Chip from '../Chip.svelte';
  import RadioCardGroup from '../RadioCardGroup.svelte';
  import SearchablePopover from '../SearchablePopover.svelte';
  import ToolRepairRequirements from './ToolRepairRequirements.svelte';

  let {
    tool = null,
    authority = 'toolSpecific',
    componentOptions = [],
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
      limitedUses:
        breakage.mode === 'limitedUses' ? { ...breakage } : { mode: 'limitedUses', maxUses: null },
      breakageChance:
        breakage.mode === 'breakageChance'
          ? { ...breakage }
          : { mode: 'breakageChance', breakageChance: 0 },
      diceExpression:
        breakage.mode === 'diceExpression'
          ? { ...breakage }
          : { mode: 'diceExpression', formula: '1d20', threshold: 1 },
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
    const retainedTarget =
      onBreak.replacementTarget?.type === 'component' ? onBreak.replacementTarget : null;
    onPatch({
      onBreak: mode === 'replaceWith' ? { mode, replacementTarget: retainedTarget } : { mode },
    });
  }
  function setReplacement(componentId) {
    patchOnBreak({ replacementTarget: { type: 'component', componentId } });
  }
  const breakageModeOptions = $derived(
    ['limitedUses', 'breakageChance', 'diceExpression'].map((mode) => ({
      value: mode,
      label: breakageModeLabel(mode),
      description: breakageModeDescription(mode),
      icon: breakageModeIcon(mode),
    }))
  );
  const breakabilityOptions = $derived([
    {
      value: 'breakable',
      label: text('FABRICATE.Admin.Manager.Tools.SummaryBreakable', 'Breakable'),
      description: text(
        'FABRICATE.Admin.Manager.Tools.BreakageBreakableHint',
        'The active check may break this Tool.'
      ),
      icon: 'fas fa-hammer',
    },
    {
      value: 'immune',
      label: text('FABRICATE.Admin.Manager.Tools.SummaryImmune', 'Immune'),
      description: text(
        'FABRICATE.Admin.Manager.Tools.BreakageImmuneHint',
        'This Tool ignores check-driven breakage.'
      ),
      icon: 'fas fa-shield',
    },
  ]);
  const onBreakOptions = $derived(
    ['destroy', 'flagBroken', 'replaceWith'].map((mode) => ({
      value: mode,
      label: onBreakModeLabel(mode),
      description: onBreakModeDescription(mode),
      icon: onBreakModeIcon(mode),
    }))
  );
  const componentPickerOptions = $derived(
    componentOptions.map((option) => ({
      id: option.id,
      label: option.name,
      img: option.img,
    }))
  );
  const selectedComponent = $derived(
    componentOptions.find((option) => option.id === onBreak.replacementTarget?.componentId)
  );
  function breakageModeLabel(mode) {
    return {
      limitedUses: text('FABRICATE.Admin.Manager.Tools.BreakageLimitedUses', 'Limited uses'),
      breakageChance: text('FABRICATE.Admin.Manager.Tools.BreakageChance', 'Breakage chance'),
      diceExpression: text('FABRICATE.Admin.Manager.Tools.BreakageDice', 'Dice expression'),
    }[mode];
  }
  function breakageModeDescription(mode) {
    return {
      limitedUses: text(
        'FABRICATE.Admin.Manager.Tools.BreakageLimitedUsesHint',
        'A fixed number of uses, then it breaks.'
      ),
      breakageChance: text(
        'FABRICATE.Admin.Manager.Tools.BreakageChanceHint',
        'A % chance to break each use.'
      ),
      diceExpression: text(
        'FABRICATE.Admin.Manager.Tools.BreakageDiceHint',
        'Roll a separate breakage check.'
      ),
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
      replaceWith: text('FABRICATE.Admin.Manager.Tools.OnBreakReplace', 'Replace with component'),
    }[mode];
  }
  function onBreakModeDescription(mode) {
    return {
      destroy: text(
        'FABRICATE.Admin.Manager.Tools.OnBreakDestroyHint',
        'The tool is consumed and removed.'
      ),
      flagBroken: text(
        'FABRICATE.Admin.Manager.Tools.OnBreakFlagHint',
        'Sets a broken flag; appends " (Broken)".'
      ),
      replaceWith: text(
        'FABRICATE.Admin.Manager.Tools.OnBreakReplaceHint',
        'Replace it with a managed Component that can participate in repair routes.'
      ),
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
    <span class="manager-tool-authority-icon"
      ><i class="fas fa-sliders" aria-hidden="true"></i></span
    >
    <div data-tool-authority-copy>
      <p class="manager-kicker">
        {text('FABRICATE.Admin.Manager.Tools.AuthorityKicker', 'System breakage')}
      </p>
      <h3>
        {authority === 'checkDriven'
          ? text('FABRICATE.Admin.Manager.Tools.AuthorityCheckDriven', 'Check-driven')
          : text('FABRICATE.Admin.Manager.Tools.AuthorityToolSpecific', 'Tool-specific')}
      </h3>
      <p>
        {text(
          'FABRICATE.Admin.Manager.Tools.Editor.AuthorityExplanation',
          'Set for every Tool from the Tools library.'
        )}
      </p>
    </div>
    <Chip tone="neutral" icon="fas fa-lock"
      ><span>{text('FABRICATE.Admin.Manager.Tools.Editor.SystemSetting', 'System-wide')}</span
      ></Chip
    >
  </section>

  <section class="manager-tool-breakage-method">
    <div class="manager-tool-section-heading" data-tool-breakage-method-heading>
      <div>
        <h3>
          <i class="fas fa-heart-crack" aria-hidden="true"></i>{authority === 'toolSpecific'
            ? text('FABRICATE.Admin.Manager.Tools.Editor.HowThisToolBreaks', 'How this Tool breaks')
            : text('FABRICATE.Admin.Manager.Tools.Editor.CanThisToolBreak', 'Can this Tool break?')}
        </h3>
        <p>
          {authority === 'toolSpecific'
            ? text(
                'FABRICATE.Admin.Manager.Tools.Editor.HowThisToolBreaksHint',
                'Each Tool tracks its own breakage. Pick the method for this one.'
              )
            : text(
                'FABRICATE.Admin.Manager.Tools.Editor.CanThisToolBreakHint',
                'The crafting check decides whether a breakable Tool breaks.'
              )}
        </p>
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
      <hr class="manager-tool-breakage-config-divider" data-tool-breakage-config-divider />
      {#if tool?.breakage?.mode === 'limitedUses'}
        <div class="manager-tool-breakage-config" data-tool-limited-uses-stepper>
          <div data-tool-limited-uses-copy>
            <p class="manager-kicker">
              {text('FABRICATE.Admin.Manager.Tools.Editor.UsesPerCopy', 'Uses per copy')}
            </p>
            <small
              >{text(
                'FABRICATE.Admin.Manager.Tools.Editor.UsesPerCopyHint',
                'A fresh copy starts with this many uses.'
              )}</small
            >
          </div>
          <Stepper
            value={tool.breakage.maxUses ?? 1}
            min={1}
            ariaLabel={text('FABRICATE.Admin.Manager.Tools.BreakageMaxUses', 'Maximum uses')}
            decrementLabel={text(
              'FABRICATE.Admin.Manager.Tools.Editor.DecreaseUses',
              'Decrease uses'
            )}
            incrementLabel={text(
              'FABRICATE.Admin.Manager.Tools.Editor.IncreaseUses',
              'Increase uses'
            )}
            inputProps={{ 'data-tool-max-uses': '' }}
            onChange={(maxUses) => patchBreakage({ maxUses })}
          />
        </div>
        <aside class="manager-tool-info-strip" data-tool-limited-uses-info>
          <i class="fas fa-circle-info" aria-hidden="true"></i>
          <p>
            {text(
              'FABRICATE.Admin.Manager.Tools.Editor.PerCopyInfo',
              'Each copy tracks its own remaining uses. A character inventory, not this archetype, records that remaining count.'
            )}
          </p>
        </aside>
      {:else if tool?.breakage?.mode === 'breakageChance'}
        <section class="manager-tool-breakage-chance-card" data-tool-breakage-chance>
          <div>
            <p class="manager-kicker">
              {text('FABRICATE.Admin.Manager.Tools.BreakageChancePerUse', 'Break chance per use')}
            </p>
            <p>
              {text(
                'FABRICATE.Admin.Manager.Tools.BreakageChanceControlHint',
                'Each time the Tool is used, this percentage is its chance to break.'
              )}
            </p>
          </div>
          <ChanceSlider
            value={tool.breakage.breakageChance ?? 0}
            numberLabel={text(
              'FABRICATE.Admin.Manager.Tools.BreakageChancePercent',
              'Break chance percent'
            )}
            rangeLabel={text('FABRICATE.Admin.Manager.Tools.BreakageChance', 'Breakage chance')}
            resolveColor={toolBreakageChanceColor}
            trackGradient="var(--fab-tool-breakage-chance-track-gradient)"
            controlClass="manager-tool-breakage-chance-control"
            numberInputProps={{ 'data-tool-breakage-chance-input': '' }}
            rangeInputProps={{ 'data-tool-breakage-chance-range': '' }}
            onChange={(breakageChance) => patchBreakage({ breakageChance })}
          />
        </section>
      {:else}
        <div class="manager-tool-inline-fields">
          <label class="manager-recipe-field"
            ><span class="manager-recipe-micro-label"
              >{text('FABRICATE.Admin.Manager.Tools.BreakageFormula', 'Formula')}</span
            ><input
              class="manager-recipe-name-input"
              data-tool-breakage-formula
              value={tool?.breakage?.formula || ''}
              oninput={(event) => patchBreakage({ formula: event.currentTarget.value })}
            /></label
          ><!-- `<div>`, not `<label>`: an implicit label binds to its FIRST labelable
               descendant, and a Stepper's is the `−` button, so clicking "Break below"
               would decrement the threshold. The name comes from `ariaLabel`. The old
               `manager-recipe-name-input` class is DROPPED rather than pushed through
               `inputProps` — it is the bare-field box treatment, and the stepper brings
               its own. -->
          <div class="manager-recipe-field">
            <span class="manager-recipe-micro-label"
              >{text('FABRICATE.Admin.Manager.Tools.BreakageThreshold', 'Break below')}</span
            >
            <Stepper
              value={tool?.breakage?.threshold ?? 0}
              step={1}
              fill
              ariaLabel={text('FABRICATE.Admin.Manager.Tools.BreakageThreshold', 'Break below')}
              decrementLabel={localize('FABRICATE.Common.Stepper.Decrease', {
                label: text('FABRICATE.Admin.Manager.Tools.BreakageThreshold', 'Break below'),
              })}
              incrementLabel={localize('FABRICATE.Common.Stepper.Increase', {
                label: text('FABRICATE.Admin.Manager.Tools.BreakageThreshold', 'Break below'),
              })}
              inputProps={{ 'data-tool-breakage-threshold': '' }}
              onChange={(threshold) => patchBreakage({ threshold })}
            />
          </div>
        </div>
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
    <legend data-tool-on-break-legend
      ><span>{text('FABRICATE.Admin.Manager.Tools.Editor.WhenItBreaks', 'When it breaks')}</span
      ><small
        >{immune
          ? text(
              'FABRICATE.Admin.Manager.Tools.Editor.InactiveWhileImmune',
              'Inactive while Immune'
            )
          : text('FABRICATE.Admin.Manager.Tools.Editor.AlwaysFires', 'Always fires')}</small
      ></legend
    >
    <p>
      {text(
        'FABRICATE.Admin.Manager.Tools.Editor.WhenItBreaksHint',
        'Every Tool has an on-break action. It runs the moment breakage is triggered.'
      )}
    </p>
    {#if immune}<p class="manager-tool-info-strip">
        <i class="fas fa-shield" aria-hidden="true"></i>{text(
          'FABRICATE.Admin.Manager.Tools.Editor.ImmuneHint',
          'Immune Tools never run an on-break action.'
        )}
      </p>{/if}
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
    <hr class="manager-tool-on-break-divider" data-tool-on-break-divider />
    {#if onBreak.mode === 'replaceWith'}
      <section
        class="manager-tool-repair manager-tool-replacement-card"
        data-tool-replacement-target
      >
        <div>
          <p class="manager-kicker">
            {text(
              'FABRICATE.Admin.Manager.Tools.Editor.ReplacementComponent',
              'Replacement component'
            )}
          </p>
          <h3>
            {text('FABRICATE.Admin.Manager.Tools.Editor.ChooseComponent', 'Choose component')}
          </h3>
          <p>
            {text(
              'FABRICATE.Admin.Manager.Tools.Editor.ReplacementComponentHint',
              'Choose the managed Component produced when this Tool breaks.'
            )}
          </p>
        </div>
        <SearchablePopover
          options={componentPickerOptions}
          value={selectedComponent?.id || ''}
          triggerClass="manager-button manager-tool-replacement-component-trigger"
          triggerIcon="fas fa-cube"
          triggerImg={selectedComponent?.img || ''}
          triggerLabel={selectedComponent?.name ||
            text('FABRICATE.Admin.Manager.Tools.Editor.ChooseComponent', 'Choose component')}
          valueClass="manager-tool-replacement-component-name"
          triggerAriaLabel={text(
            'FABRICATE.Admin.Manager.Tools.Editor.ChooseComponent',
            'Choose component'
          )}
          dialogAriaLabel={text(
            'FABRICATE.Admin.Manager.Tools.Editor.ChooseComponent',
            'Choose component'
          )}
          searchPlaceholder={text(
            'FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder',
            'Search components...'
          )}
          onChoose={setReplacement}
        />
      </section>
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
