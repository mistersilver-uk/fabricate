<!-- Svelte 5 runes mode -->
<!--
  One component's salvage check override: a preset Select over the system's own tiers, a Custom…
  Stepper and Manage presets. It edits `dcOverride` under a fixed target and `adjustmentOverride`
  under a character value, clears only that field for System default, and never rewrites the other;
  a kept dormant value is named in a notice. A roll-high fixed DC keeps the legacy card as it was.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `config` | the active salvage check sub-object \| `null` | `null` | Supplies `evaluation` and `thresholdMode`; absent reads as a roll-high fixed DC. |
  | `dcOverride` / `adjustmentOverride` | number \| `null` | `null` | The component's two persisted overrides, both passed so the dormant one can be named. |
  | `tiers` / `dcMode` / `systemDc` | `simple.tiers` / `'static'` \| `'dynamic'` / number | `[]` / `'static'` / `0` | The preset source in every resolution mode, and the system default's number. |
  | `previewCharacter` | `{ name, rollData }` \| `null` | `null` | Whom the Player sees line resolves a character value for; without one it names the expression. |
  | `instanceId` / `disabled` | string / boolean | `''` / `false` | The id stem for the title, and the whole control's disabled state. |

  Callbacks:
  - `onChange(patch)` — `{ dcOverride }` or `{ adjustmentOverride }`, only ever the active field.
  - `onManagePresets()` — open the salvage check's tiers on the Checks screen.

  Invariants:
  - Custom… is transient UI state, not draft data; the caller keys this component per component.
  - `tests/components/component-edit-salvage-override-mounted.test.js` pins every state.
-->
<script>
  import Field from '../../../components/Field.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import Notice from '../../../components/Notice.svelte';
  import Select from '../../../components/Select.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import { localize } from '../../../util/foundryBridge.js';
  import { normalizeCheckEvaluation } from '../../../../../systems/normalize/checkEvaluation.js';
  import {
    resolveCheckTarget,
    selectTargetAdjustment,
  } from '../../../../../systems/checkTarget.js';
  import {
    MULTIPLIER_STOPS,
    formatCheckAdjustment,
    parseCheckAdjustment,
  } from '../checks/checkAdjustmentLabel.js';
  import { interpolate, underComparisonPhrase } from '../checks/checksCopy.js';
  import { buildSalvageDcSelectOptions } from './componentEditSelectOptions.js';
  import {
    SALVAGE_DC_CUSTOM,
    resolveSalvageDcSelection,
    salvageDcOverrideForSelection,
    salvageOverrideField,
  } from './salvageDcPresets.js';

  let {
    config = null,
    dcOverride = null,
    adjustmentOverride = null,
    tiers = [],
    dcMode = 'static',
    systemDc = 0,
    previewCharacter = null,
    instanceId = '',
    disabled = false,
    onChange = () => {},
    onManagePresets = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const evaluation = $derived(normalizeCheckEvaluation(config?.evaluation));
  const attribute = $derived(evaluation.target.source === 'attribute');
  const under = $derived(evaluation.direction === 'under');
  const kind = $derived(evaluation.target.adjustmentKind);
  // The roll-high fixed DC is the legacy card, byte for byte: no hint, notice or Player sees.
  const legacy = $derived(!attribute && !under);
  const field = $derived(salvageOverrideField(evaluation));
  const activeValue = $derived(attribute ? adjustmentOverride : dcOverride);
  const cmp = $derived(underComparisonPhrase(config?.thresholdMode, text));
  const titleId = $derived(`${instanceId}-salvage-dc-title`);

  const options = $derived(buildSalvageDcSelectOptions(tiers, dcMode, systemDc, text, evaluation));
  // Custom… and System default both persist null, so the GM's choice of Custom… is staged here.
  let customSelected = $state(false);
  const selection = $derived(
    customSelected ? SALVAGE_DC_CUSTOM : resolveSalvageDcSelection(activeValue, tiers, evaluation)
  );

  function choose(next) {
    customSelected = next === SALVAGE_DC_CUSTOM;
    onChange({ [field]: salvageDcOverrideForSelection(next, activeValue, evaluation) });
  }

  function typeValue(next) {
    onChange({ [field]: Number.isFinite(next) ? next : null });
  }

  const formatAdjustment = (value) => formatCheckAdjustment(kind, value);
  const parseAdjustment = (value) => parseCheckAdjustment(kind, value);

  const title = $derived.by(() => {
    if (attribute)
      return text(
        'FABRICATE.Admin.Manager.Component.SalvageEditor.OverrideAdjustment',
        'Difficulty adjustment override'
      );
    return under
      ? text('FABRICATE.Admin.Manager.Component.SalvageEditor.OverrideTarget', 'Target override')
      : text('FABRICATE.Admin.Manager.Component.SalvageEditor.DcOverride', 'Salvage check DC');
  });

  const hint = $derived.by(() => {
    if (legacy) {
      return text(
        'FABRICATE.Admin.Manager.Component.SalvageEditor.DcOverrideHint',
        'Preset tiers come from this system’s Checks screen.'
      );
    }
    if (!attribute) {
      return interpolate(
        text(
          'FABRICATE.Admin.Manager.Component.SalvageEditor.OverrideTargetHint',
          'Replaces the system target for this component. The total must stay {cmp} it.'
        ),
        { cmp }
      );
    }
    return kind === 'multiply'
      ? text(
          'FABRICATE.Admin.Manager.Component.SalvageEditor.OverrideMultiplyHint',
          'Adjusts the character value this component is salvaged against. Multiplied, rounded down.'
        )
      : text(
          'FABRICATE.Admin.Manager.Component.SalvageEditor.OverrideAddHint',
          'Adjusts the character value this component is salvaged against. Added to the value.'
        );
  });

  const customLabel = $derived(
    attribute
      ? text(
          'FABRICATE.Admin.Manager.Component.SalvageEditor.AdjustmentCustomLabel',
          'Custom salvage adjustment'
        )
      : text('FABRICATE.Admin.Manager.Component.SalvageEditor.DcCustomLabel', 'Custom salvage DC')
  );

  const isSet = (value) => ![null, undefined, ''].includes(value) && Number.isFinite(Number(value));

  // The dormant field is kept, never edited or cleared from here; the notice says so.
  const keptNotice = $derived.by(() => {
    if (legacy) return '';
    if (attribute && isSet(dcOverride)) {
      return interpolate(
        text(
          'FABRICATE.Admin.Manager.Component.SalvageEditor.OverrideKeptDc',
          'A DC override of {dc} is kept on this component. This system does not read it, so it is not shown for editing.'
        ),
        { dc: dcOverride }
      );
    }
    if (!attribute && isSet(adjustmentOverride)) {
      return interpolate(
        text(
          'FABRICATE.Admin.Manager.Component.SalvageEditor.OverrideKeptAdjustment',
          'A difficulty adjustment override of {adjustment} is kept on this component. This system does not read it, so it is not shown for editing.'
        ),
        { adjustment: formatCheckAdjustment(kind, adjustmentOverride) }
      );
    }
    return '';
  });

  function characterSource(resolved, adjustment) {
    const value = interpolate(
      text(
        'FABRICATE.Admin.Manager.Checks.Evaluation.ScaleSourceValue',
        '{actor} {expression} {value}'
      ),
      {
        actor: previewCharacter.name,
        expression: evaluation.target.expression.trim(),
        value: resolved,
      }
    );
    return [value, formatCheckAdjustment(kind, adjustment)].filter(Boolean).join(', ');
  }

  function attributePlayerLine() {
    const adjustment = selectTargetAdjustment(evaluation, adjustmentOverride);
    const expression = evaluation.target.expression.trim();
    if (!previewCharacter) {
      const source = [expression, formatCheckAdjustment(kind, adjustment)]
        .filter(Boolean)
        .join(', ');
      return under
        ? interpolate(
            text(
              'FABRICATE.Admin.Manager.Component.SalvageEditor.PlayerSeesUnderNoCharacter',
              'Salvage check · stay {cmp} the character value ({source})'
            ),
            { cmp, source }
          )
        : interpolate(
            text(
              'FABRICATE.Admin.Manager.Component.SalvageEditor.PlayerSeesOverNoCharacter',
              'Salvage check · reach the character value ({source})'
            ),
            { source }
          );
    }
    const base = resolveCheckTarget({ evaluation, rollData: previewCharacter.rollData ?? {} });
    const resolved = resolveCheckTarget({
      evaluation,
      rollData: previewCharacter.rollData ?? {},
      adjustment,
    });
    if (!base.ok || !resolved.ok) {
      return interpolate(
        text(
          'FABRICATE.Admin.Manager.Checks.Evaluation.ValueUnresolved',
          '{actor} has no value at {path}. The check cannot resolve for them.'
        ),
        { actor: previewCharacter.name, path: expression }
      );
    }
    const source = characterSource(base.target, adjustment);
    return under
      ? interpolate(
          text(
            'FABRICATE.Admin.Manager.Component.SalvageEditor.PlayerSeesUnder',
            'Salvage check · stay {cmp} {target} ({source})'
          ),
          {
            cmp,
            target: resolved.target,
            source,
          }
        )
      : interpolate(
          text(
            'FABRICATE.Admin.Manager.Component.SalvageEditor.PlayerSeesOver',
            'Salvage check · reach {target} ({source})'
          ),
          {
            target: resolved.target,
            source,
          }
        );
  }

  // What a player is shown for this component; empty where a macro supplies the number.
  const playerLine = $derived.by(() => {
    if (legacy || dcMode === 'dynamic') return '';
    if (attribute) return attributePlayerLine();
    const dc = isSet(dcOverride) ? Math.trunc(Number(dcOverride)) : Number(config?.dc ?? systemDc);
    return interpolate(
      text(
        'FABRICATE.Admin.Manager.Component.SalvageEditor.PlayerSeesFixed',
        'Salvage check · stay {cmp} {dc}'
      ),
      { cmp, dc }
    );
  });
</script>

<Field
  as="div"
  class="manager-salvage-dc-card"
  data-salvage-dc-override=""
  data-salvage-override-field={field}
>
  <div class="manager-salvage-dc-copy">
    <span id={titleId} class="manager-salvage-dc-title">{title}</span>
    <span class="manager-salvage-dc-note" data-salvage-override-hint>{hint}</span>
  </div>
  <!-- Presets are the SYSTEM'S authored salvage check tiers (decision 7), never a hard-coded list. -->
  <Select
    size="toolbar"
    class="manager-salvage-dc-select"
    value={selection}
    {options}
    ariaLabelledBy={titleId}
    {disabled}
    triggerData={{ 'data-salvage-dc-preset': '' }}
    onChange={choose}
  />
  {#if selection === SALVAGE_DC_CUSTOM}
    <!-- `allowUnset`: a cleared field is the system default. A DC floors at 0, so one `−` click on
         the blank field cannot commit -1; an adjustment is formatted and may be negative. -->
    {#if attribute}
      {#key kind}
        <Stepper
          value={adjustmentOverride}
          allowUnset
          fill
          {disabled}
          formatValue={formatAdjustment}
          parseValue={parseAdjustment}
          stops={kind === 'multiply' ? MULTIPLIER_STOPS : []}
          {...stepperLabels(customLabel)}
          inputProps={{ 'data-salvage-adjustment-custom': '' }}
          onChange={typeValue}
        />
      {/key}
    {:else}
      <Stepper
        value={dcOverride}
        allowUnset
        step={1}
        min={0}
        fill
        {disabled}
        {...stepperLabels(customLabel)}
        inputProps={{ 'data-salvage-dc-custom': '' }}
        onChange={typeValue}
      />
    {/if}
  {/if}
  <!-- Kept by decision 7: with no authored tiers, the common case, this is the way forward. -->
  <ManagerButton
    class="manager-salvage-manage-presets"
    data-salvage-manage-presets
    onclick={() => onManagePresets()}
    {disabled}
  >
    <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
    <span
      >{text(
        'FABRICATE.Admin.Manager.Component.SalvageEditor.ManagePresets',
        'Manage presets'
      )}</span
    >
  </ManagerButton>
  {#if keptNotice}
    <div class="manager-salvage-override-row">
      <Notice tone="info" title={keptNotice} dataAttr="data-salvage-override-kept" />
    </div>
  {/if}
  {#if playerLine}
    <div class="manager-salvage-override-row manager-salvage-player-sees">
      <span class="manager-salvage-player-sees-label">
        {text('FABRICATE.Admin.Manager.Component.SalvageEditor.PlayerSees', 'Player sees')}
      </span>
      <p class="manager-salvage-player-sees-line" data-salvage-player-sees>
        <i class="fas fa-dice" aria-hidden="true"></i>
        <span>{playerLine}</span>
      </p>
    </div>
  {/if}
</Field>

<style>
  .manager-salvage-override-row {
    flex: 1 1 100%;
    min-width: 0;
  }

  .manager-salvage-player-sees {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    padding-top: var(--fab-space-3);
    border-top: 1px solid var(--fab-border);
  }

  .manager-salvage-player-sees-label {
    color: var(--fab-text-subtle);
    font-weight: 700;
    font-size: 0.53rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .manager-salvage-player-sees-line {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    margin: 0;
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-1);
    color: var(--fab-text-secondary);
    font-weight: 500;
    font-size: 0.72rem;
  }

  .manager-salvage-player-sees-line i {
    color: var(--fab-accent);
    font-size: 0.69rem;
  }
</style>
