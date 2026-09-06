<!-- Svelte 5 runes mode -->
<!--
  THE FIRST TAB OF THE SYSTEM TOOL RULES EDITOR (issue 1373).

  == IT IS BUILT OUT OF INHERIT/OVERRIDE, BECAUSE THE MODEL IS =================================
  `breakage` and `onBreak` are WORLD-DEFAULT SECTIONS: the world Tool authors an answer and each
  crafting system either follows it or sets its own. The screen shipped with no way to see or
  change that at all — two bare headings on the page background, permanently in the override
  state — while the rules list one route away already advertised `Inherits world defaults`,
  offered `What it would inherit here`, and routed here. Each section is now a
  `ToolInheritCard`: a card carrying the state pill, the world default, the switch, and either
  the world value read only or this system's own controls.

  == THE TAB ALSO OPENS AND CLOSES THE SYSTEM'S RELATIONSHIP WITH THE TOOL =====================
  `Enabled in <System>` opens it and `Stop using this Tool here` closes it, exactly as the design
  draws them. Neither is a breakage control; both are what this tab IS — this Tool, in this
  system — and the design puts them at the two ends of it. The remove callout is the SYSTEM
  scope's counterpart to the world entry's `Delete`, and the difference is the whole point: this
  one takes away one system's rules and leaves the world Tool and every other system untouched.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { toolBreakageChanceColor } from '../../../util/chanceColorScale.js';
  import ChanceSlider from '../../../components/ChanceSlider.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import ArmedDangerButton from '../ArmedDangerButton.svelte';
  import Chip from '../Chip.svelte';
  import RadioCardGroup from '../RadioCardGroup.svelte';
  import ToolInheritCard from './ToolInheritCard.svelte';
  import ToolRepairRequirements from './ToolRepairRequirements.svelte';
  import ToolReplacementTarget from './ToolReplacementTarget.svelte';
  import ToolSystemScopeCards from './ToolSystemScopeCards.svelte';
  import {
    toolBreakageChanceBand,
    toolBreakageChoice,
    toolWorldDefaultFact,
  } from './toolStudio.js';

  let {
    tool = null,
    authority = 'toolSpecific',
    componentOptions = [],
    itemTags = [],
    essenceOptions = [],
    currencyUnits = [],
    currencyEnabled = false,
    managedItems = [],
    systemName = '',
    // WHERE THE BREAKAGE AUTHORITY ABOVE CAME FROM. The card states the world default and, when
    // this system has departed from it, says so — which is what the design's own mode card
    // draws and what the rules LIST one route away already chips. `authority` alone is the
    // RESOLVED token and cannot tell "chose it" from "inherited it" (issue 1373).
    breakageSource = 'default',
    worldAuthority = '',
    persisted = true,
    saving = false,
    // The world membership facts this tab reads to draw its inherit affordances. `member` is
    // `false` for a pre-migration in-system Tool the world catalogue has no record of, and the
    // cards then render exactly as they did before: their controls, with no switch and no pill,
    // because there is no world half to inherit from.
    member = false,
    inherited = {},
    worldDefaults = null,
    onPatch = () => {},
    onToggleEnabled = () => {},
    onToggleInherited = () => {},
    onRemoveFromSystem = () => {},
  } = $props();

  // The armed state of the `Remove from system` control. Local, because arming is a UI state
  // that must not survive a re-render caused by anything other than this control.
  let removeArmed = $state(false);
  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
  // `limitedUses` SEEDS AT 1, NEVER AT NULL. A null `maxUses` is the UNLIMITED answer
  // (`toolBreakageChoice`), so a config that carried it would make "pick Limited uses" land the
  // GM back on the option they just left — silently, because the stepper used to draw the null
  // as `1` while every reading surface said `Unlimited uses` (issue 1373).
  function createBreakageConfigs(breakage = { mode: 'limitedUses', maxUses: null }) {
    return {
      unlimited: { mode: 'limitedUses', maxUses: null },
      limitedUses:
        breakage.mode === 'limitedUses' && breakage.maxUses != null
          ? { ...breakage }
          : { mode: 'limitedUses', maxUses: 1 },
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

  function authorityLabel(mode) {
    return mode === 'checkDriven'
      ? text('FABRICATE.Admin.Manager.Tools.AuthorityCheckDriven', 'Check-driven')
      : text('FABRICATE.Admin.Manager.Tools.AuthorityToolSpecific', 'Tool-specific');
  }

  function formattedText(key, data, fallback) {
    const template = localize(key);
    if (template && template !== key) return localize(key, data);
    return Object.entries(data).reduce(
      (copy, [name, value]) => copy.replace(`{${name}}`, String(value)),
      fallback
    );
  }

  // WHERE THE MODE CAME FROM, in the design's own words. `default` means this system follows
  // the world's answer and the line names it, which is exactly the `World default` chip the
  // rules list wears; anything else means this system departed from it and the line says so.
  const authoritySourceLine = $derived(
    breakageSource === 'default'
      ? formattedText(
          'FABRICATE.Admin.Manager.Tools.Editor.AuthorityFromWorld',
          { mode: authorityLabel(worldAuthority || authority) },
          'World default · {mode} ·'
        )
      : formattedText(
          'FABRICATE.Admin.Manager.Tools.Editor.AuthorityOverriddenHere',
          { system: systemName },
          'Overridden for {system} ·'
        )
  );

  /**
   * What one section resolves to while it INHERITS.
   *
   * The world defaults record is preferred and the Tool's own current value is the fallback,
   * which is not a guess: the editor keeps the in-system record equal to the world value for as
   * long as the switch is on (`CraftingSystemManagerRoot#setFocusedToolSectionInherited`), so
   * for an entity whose world half authored no defaults record the two are the same answer.
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

  $effect(() => {
    if (tool?.id === cachedToolId) return;
    configs = createBreakageConfigs(tool?.breakage);
    cachedToolId = tool?.id ?? null;
  });

  function changeMode(choice) {
    onPatch({ breakage: { ...configs[choice] } });
  }
  function patchBreakage(patch) {
    const choice = breakageChoice;
    configs = { ...configs, [choice]: { ...configs[choice], ...patch } };
    onPatch({ breakage: configs[choice] });
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
  // WHAT THIS TOOL ACTUALLY AUTHORS, resolved once and read by the radio group, by the stepper
  // gate and by nothing else. See `toolBreakageChoice`.
  const breakageChoice = $derived(toolBreakageChoice(tool, authority));

  // FOUR OPTIONS, AND `unlimited` LEADS THEM (issue 1373). It is the model's default and the
  // only one of the four that names an ABSENCE of a mechanic, so it opens the set the way
  // `Immune` opens the check-driven pair below. The label is the exact string the rail, the
  // player preview and the library row already print for this state, so the four surfaces read
  // as one answer rather than as four opinions.
  const breakageModeOptions = $derived(
    ['unlimited', 'limitedUses', 'breakageChance', 'diceExpression'].map((mode) => ({
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
  const replacementComponentId = $derived(String(onBreak.replacementTarget?.componentId || ''));
  // THE BAND BESIDE THE SLIDER (issue 1373, maintainer round 2). The design states what the
  // percentage MEANS next to the number, and the ramp the chip is tinted from is the one the
  // track already runs through, so the two never disagree.
  const chanceBand = $derived(toolBreakageChanceBand(tool?.breakage?.breakageChance ?? 0, text));
  function breakageModeLabel(mode) {
    return {
      unlimited: text('FABRICATE.Admin.Manager.Tools.SummaryUnlimitedUses', 'Unlimited uses'),
      limitedUses: text('FABRICATE.Admin.Manager.Tools.BreakageLimitedUses', 'Limited uses'),
      breakageChance: text('FABRICATE.Admin.Manager.Tools.BreakageChance', 'Breakage chance'),
      diceExpression: text('FABRICATE.Admin.Manager.Tools.BreakageDice', 'Dice expression'),
    }[mode];
  }
  function breakageModeDescription(mode) {
    return {
      unlimited: text(
        'FABRICATE.Admin.Manager.Tools.BreakageUnlimitedHint',
        'It is never used up, so it never breaks.'
      ),
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
      unlimited: 'fas fa-infinity',
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
  <ToolSystemScopeCards
    {tool}
    {managedItems}
    {systemName}
    {persisted}
    {member}
    {onPatch}
    {onToggleEnabled}
  />

  <!--
    THE BREAKAGE MODE, AS A READ-ONLY STATEMENT OF WHERE IT CAME FROM (issue 1373).

    It used to end in a `System-wide` LOCK CHIP and to drop the world half of the sentence
    entirely — while the rules LIST one route away chipped the very same setting `World default`.
    Two screens a click apart said different things about one value, and the padlock claimed a
    permanence the setting does not have: it is a system-level choice, changed on the Tool Rules
    screen, not a thing a GM may not change. The design states its provenance on the right
    instead — `World default · Tool-specific`, or `Overridden for <System>` — and closes with
    where to change it.
  -->
  <section class="manager-tool-authority-readonly" data-tool-breakage-authority-explanation>
    <span class="manager-tool-authority-icon"
      ><i class="fas fa-sliders" aria-hidden="true"></i></span
    >
    <div data-tool-authority-copy>
      <p class="manager-kicker">
        {text('FABRICATE.Admin.Manager.Tools.AuthorityKicker', 'Breakage mode')}
      </p>
      <h3>
        {authority === 'checkDriven'
          ? text('FABRICATE.Admin.Manager.Tools.AuthorityCheckDriven', 'Check-driven')
          : text('FABRICATE.Admin.Manager.Tools.AuthorityToolSpecific', 'Tool-specific')}
      </h3>
    </div>
    <p class="manager-tool-authority-source" data-tool-authority-source={breakageSource}>
      {authoritySourceLine}
      {text(
        'FABRICATE.Admin.Manager.Tools.Editor.AuthorityExplanation',
        'Set for every Tool on the Tool Rules screen.'
      )}
    </p>
  </section>

  <ToolInheritCard
    section="breakage"
    title={authority === 'toolSpecific'
      ? text('FABRICATE.Admin.Manager.Tools.Editor.HowThisToolBreaks', 'How this Tool breaks')
      : text('FABRICATE.Admin.Manager.Tools.Editor.CanThisToolBreak', 'Can this Tool break?')}
    subtitle={authority === 'toolSpecific'
      ? text(
          'FABRICATE.Admin.Manager.Tools.Editor.HowThisToolBreaksHint',
          'Each Tool tracks its own breakage. Pick the method for this one.'
        )
      : text(
          'FABRICATE.Admin.Manager.Tools.Editor.CanThisToolBreakHint',
          'The crafting check decides whether a breakable Tool breaks.'
        )}
    inheritable={member}
    {inherited}
    fact={inheritedFact('breakage')}
    hint
    disabled={saving}
    onToggle={onToggleInherited}
  >
    {#if authority === 'toolSpecific'}
      <RadioCardGroup
        legend={text('FABRICATE.Admin.Manager.Tools.BreakageTitle', 'Breakage mechanic')}
        options={breakageModeOptions}
        selectedValue={breakageChoice}
        groupName="tool-breakage-mode"
        columns={2}
        dataGroup="tool-breakage-mode"
        optionDataAttr="data-tool-breakage-choice"
        onChange={changeMode}
      />
      <!-- The rule below the choices separates them from the CONFIGURATION of the chosen one.
           `unlimited` configures nothing, so drawing it there would close the card on a line
           with nothing under it (issue 1373). -->
      {#if breakageChoice !== 'unlimited'}
        <hr class="manager-tool-breakage-config-divider" data-tool-breakage-config-divider />
      {/if}
      {#if breakageChoice === 'limitedUses'}
        <div class="manager-tool-breakage-config" data-tool-limited-uses-stepper>
          <div data-tool-limited-uses-copy>
            <p class="manager-tool-breakage-config-title">
              {text('FABRICATE.Admin.Manager.Tools.Editor.UsesPerCopy', 'Uses per copy')}
            </p>
            <small
              >{text(
                'FABRICATE.Admin.Manager.Tools.Editor.UsesPerCopyHint',
                'A fresh copy starts with this many uses.'
              )}</small
            >
          </div>
          <!-- NO `?? 1` FALLBACK. This block renders only while `breakageChoice` is
               `limitedUses`, which is exactly the case a non-null `maxUses` defines, so the
               fallback that used to sit here could only ever fire for the UNLIMITED state —
               and drew it as `1`, against a rail, a player preview and a library row all
               reading `Unlimited uses` (issue 1373). -->
          <Stepper
            value={tool.breakage.maxUses}
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
      {:else if breakageChoice === 'breakageChance'}
        <section class="manager-tool-breakage-chance-card" data-tool-breakage-chance>
          <div class="manager-tool-breakage-chance-head">
            <div>
              <p class="manager-tool-breakage-config-title">
                {text('FABRICATE.Admin.Manager.Tools.BreakageChancePerUse', 'Break chance per use')}
              </p>
              <p>
                {text(
                  'FABRICATE.Admin.Manager.Tools.BreakageChanceControlHint',
                  'Each time the Tool is used, this percentage is its chance to break.'
                )}
              </p>
            </div>
            <!-- THE PLAIN-LANGUAGE BAND, on the design's own five cuts. It is a claim about the
                 number, not a control, so it is stated beside the copy the slider labels rather
                 than beside the slider itself. -->
            <Chip tone={chanceBand.tone} data-tool-breakage-chance-band={chanceBand.tone}
              >{chanceBand.label}</Chip
            >
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
      {:else if breakageChoice === 'diceExpression'}
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
          ><!-- `<div>`, not `<label>`: see the NAMING contract in `Stepper.svelte`. The old
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
              {...stepperLabels(
                text('FABRICATE.Admin.Manager.Tools.BreakageThreshold', 'Break below')
              )}
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
  </ToolInheritCard>

  <ToolInheritCard
    section="onBreak"
    title={text('FABRICATE.Admin.Manager.Tools.Editor.WhenItBreaks', 'When it breaks')}
    subtitle={text(
      'FABRICATE.Admin.Manager.Tools.Editor.WhenItBreaksHint',
      'Every Tool has an on-break action. It runs the moment breakage is triggered.'
    )}
    inheritable={member}
    {inherited}
    fact={inheritedFact('onBreak')}
    disabled={saving}
    onToggle={onToggleInherited}
  >
    <!-- STILL A `<fieldset disabled>`, and that is the immune state's whole mechanism: it
         removes every on-break radio from interaction in one attribute rather than passing
         `disabled` down three controls. The `Always fires` badge that used to caption its
         legend is GONE — the design uses that slot for the inheritance pill, which the card
         above now carries, and `Always fires` was never news. -->
    <fieldset
      class="manager-tool-on-break fab-stack"
      data-gap="3"
      data-tool-on-break-controls
      disabled={immune}
    >
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
        <!--
          THE SHARED CARD (issue 1373, maintainer round 2). This was a bare picker under two
          headings: no drop target, no source line, and no way to clear a choice. `Choose
          component` was also a HEADING as well as the button's own label, so the card said it
          twice. Both scopes render `ToolReplacementTarget` now, so a GM meets the same control
          on the world default and on the system override.

          `sourceText` NAMES THIS SYSTEM, which is the fact system scope has and world scope does
          not: the Component produced here is this system's, and the same world default resolves
          to a different Component list in the next system to inherit it.
        -->
        <ToolReplacementTarget
          {componentOptions}
          componentId={replacementComponentId}
          disabled={immune}
          sourceText={systemName
            ? formattedText(
                'FABRICATE.Admin.Manager.Tools.Editor.ReplacementSourceSystem',
                { system: systemName },
                'A managed Component in {system}'
              )
            : ''}
          onChoose={setReplacement}
          onClear={() => patchOnBreak({ replacementTarget: null })}
        />
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
  </ToolInheritCard>

  <!--
    THE SYSTEM SCOPE'S DESTRUCTIVE ACTION, AND IT IS NOT `Delete` (issue 1373).

    The header used to carry a bare `Delete` here. On a screen whose subject is one world Tool
    adopted by many crafting systems, `Delete` names no scope at all: it reads as deleting the
    Tool, and a GM who wanted to stop using it in THIS system had no way to tell. The design puts
    `Delete` on the world entry, which is the record it destroys, and gives system scope this —
    an explained callout that says exactly which half goes and which half does not.

    It renders only for a Tool this system holds a MEMBERSHIP record for. For a pre-migration
    in-system Tool with no world half there is no membership to remove, and offering to remove
    one would be an action with nothing behind it.
  -->
  {#if member}
    <section class="manager-tool-remove-callout" data-tool-remove-from-system>
      <span class="manager-tool-remove-icon" aria-hidden="true"
        ><i class="fas fa-right-from-bracket"></i></span
      >
      <div class="manager-tool-remove-copy">
        <h3>
          {text('FABRICATE.Admin.Manager.Tools.Editor.StopUsingHere', 'Stop using this Tool here')}
        </h3>
        <p>
          {formattedText(
            'FABRICATE.Admin.Manager.Tools.Editor.StopUsingHereHint',
            { system: systemName },
            'Removes the rules in {system} only. The world Tool and every other system are untouched.'
          )}
        </p>
      </div>
      <!-- NO `idleIcon`. The callout already leads with that exact glyph one column to the
           left, and the design's own button is label-only and compact — a second copy of the
           section's own mark inside its action reads as decoration and made the control the
           loudest thing in a callout whose point is that it is NOT the destructive one
           (issue 1373). -->
      <ArmedDangerButton
        token="tool-remove-from-system"
        armed={removeArmed}
        idleLabel={text(
          'FABRICATE.Admin.Manager.Tools.Editor.RemoveFromSystem',
          'Remove from system'
        )}
        armedLabel={text('FABRICATE.Admin.Manager.Scoped.Membership.RemoveConfirm', 'Confirm?')}
        idleIcon=""
        idleAriaLabel={formattedText(
          'FABRICATE.Admin.Manager.Tools.Editor.RemoveFromSystemLabel',
          { system: systemName },
          'Remove this Tool from {system}'
        )}
        armedAriaLabel={formattedText(
          'FABRICATE.Admin.Manager.Tools.Editor.RemoveFromSystemConfirm',
          { system: systemName },
          'Confirm removing this Tool from {system}'
        )}
        busy={saving}
        busyLabel={text('FABRICATE.Admin.Manager.Scoped.Membership.Removing', 'Removing…')}
        onArm={() => (removeArmed = true)}
        onDisarm={() => (removeArmed = false)}
        onConfirm={() => {
          removeArmed = false;
          onRemoveFromSystem();
        }}
      />
    </section>
  {/if}
</div>

<style>
  /* THE TWO CONFIGURATION LABELS ARE TITLES, NOT EYEBROWS (issue 1373). `proto:2645` states
     `Uses per copy` and `proto:2656` states `Break chance per use` with one string:
     `font: 600 11.5px var(--sans); color: var(--text)` - sentence case, the body ink, one
     weight below an eyebrow's 700 and no tracking or casing at all. Both were drawn as
     `.manager-kicker`, which is the uppercase micro-label the reference reserves for a SECTION
     HEAD; neither of these heads a section. Each names the control on its own row, in the same
     voice as the sentence beneath it, which is why the fix is to remove the class rather than
     to narrow it. 11.5px is 0.72rem against the 16px root.

     `margin: 0` because the shared class carried a 2px bottom margin the reference does not
     draw: `proto:2645` sets the note directly under the title with no step between them, and
     the break-chance card's own note states its `--fab-space-1` a few rules below. */
  .manager-tool-breakage-config-title {
    margin: 0;
    color: var(--fab-text);
    font-size: 0.72rem;
    font-weight: 600;
  }

  /* THE BREAK-CHANCE CARD'S HEAD (issue 1373, maintainer round 2).

     The design puts the plain-language band on the same line as the label the slider carries
     (`proto:2144-2146`: `display:flex; align-items:center; gap:12px; margin-bottom:11px`), so a
     GM reads `Break chance per use / Rarely breaks` as one statement. `12` is `--fab-space-3`
     exactly; the `11px` bottom margin is the card's own grid `gap` and is not restated.

     THE HINT RULE IS RESTATED HERE because the shipped
     `.manager-tool-breakage-chance-card > div > p:last-child` addressed the copy block as the
     card's DIRECT child, and the head is now that child — so the shipped rule matches nothing
     rather than conflicting, and the treatment has to be re-declared at the new depth. Written
     in this file rather than in `styles/fabricate.css` because this template writes both
     elements, so the scoping hash reaches them. */
  .manager-tool-breakage-chance-head {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    min-width: 0;
  }

  .manager-tool-breakage-chance-head > div {
    flex: 1 1 auto;
    min-width: 0;
  }

  .manager-tool-breakage-chance-head > div > p:last-child {
    margin: var(--fab-space-1) 0 0;
    color: var(--fab-text-muted);
    font-size: 0.68rem;
  }
</style>
