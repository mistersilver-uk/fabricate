<!-- Svelte 5 runes mode -->
<!--
  One component's salvage check override: a preset Select over the system's own tiers, a Custom…
  Stepper and Manage presets. It edits `dcOverride` under a fixed target and `adjustmentOverride`
  under a character value, clears only that field for System default, and never rewrites the other;
  a kept dormant value is named in a callout. A check graded against one number shows what its
  player sees.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `config` | the active salvage check sub-object \| `null` | `null` | Supplies `evaluation`, `thresholdMode`, `type` and `dc`; absent reads as a roll-high fixed DC. |
  | `dcOverride` / `adjustmentOverride` | number \| `null` | `null` | The component's two persisted overrides, both passed so the dormant one can be named. |
  | `tiers` / `dcMode` / `systemDc` | `simple.tiers` / `'static'` \| `'dynamic'` / number | `[]` / `'static'` / `0` | The preset source in every resolution mode, and the system default's number where `config` has no `dc`. |
  | `previewActors` / `resolvePreviewCharacter(id)` | `[{ id, name, img }]` / `{ name, rollData }` \| `null` | `[]` / `() => null` | The Preview-as roster and lookup for the Player sees line. |
  | `instanceId` / `disabled` | string / boolean | `''` / `false` | The id stem for the title, and the whole control's disabled state. |

  Callbacks:
  - `onChange(patch)` — `{ dcOverride }` or `{ adjustmentOverride }`, only ever the active field.
  - `onManagePresets()` — open the salvage check's tiers on the Checks screen.

  Invariants:
  - Custom… is transient UI state, not draft data; the caller keys this component per component.
  - `tests/components/component-edit-salvage-override-mounted.test.js` pins every state.
-->
<script>
  import Callout from '../../../components/Callout.svelte';
  import Field from '../../../components/Field.svelte';
  import Kicker from '../../../components/Kicker.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import Select from '../../../components/Select.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import { localize } from '../../../util/foundryBridge.js';
  import { normalizeCheckEvaluation } from '../../../../../systems/normalize/checkEvaluation.js';
  import {
    MULTIPLIER_STOPS,
    formatCheckAdjustment,
    parseCheckAdjustment,
  } from '../checks/checkAdjustmentLabel.js';
  import { interpolate, underComparisonPhrase } from '../checks/checksCopy.js';
  import { buildSalvageDcSelectOptions } from './componentEditSelectOptions.js';
  import OverridePlayerSees from './OverridePlayerSees.svelte';
  import { keptOverride, overrideInvalidForKind } from './overridePlayerSees.js';
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
    previewActors = [],
    resolvePreviewCharacter = () => null,
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
  const field = $derived(salvageOverrideField(evaluation));
  const activeValue = $derived(attribute ? adjustmentOverride : dcOverride);
  const cmp = $derived(underComparisonPhrase(config?.thresholdMode, text));
  const titleId = $derived(`${instanceId}-salvage-dc-title`);
  const invalidId = $derived(`${instanceId}-salvage-dc-invalid`);
  // A kind switch can leave a kept override invalid with no re-typing to catch it (issue 2078).
  const invalidOverride = $derived(overrideInvalidForKind({ attribute, kind, adjustmentOverride }));
  // The sub-object salvage rolls owns the default, so the Select and the line name one number.
  const systemDefaultDc = $derived(Number(config?.dc ?? systemDc));

  const options = $derived(
    buildSalvageDcSelectOptions(tiers, dcMode, systemDefaultDc, text, evaluation)
  );
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
      : text('FABRICATE.Admin.Manager.Component.SalvageEditor.DcOverride', 'Salvage DC override');
  });

  const hint = $derived.by(() => {
    if (!attribute && !under) {
      return text(
        'FABRICATE.Admin.Manager.Component.SalvageEditor.DcOverrideHint',
        'Replaces the system DC for this component.'
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

  // The dormant field is kept, never edited or cleared from here; the callout says so.
  const keptNotice = $derived.by(() => {
    const kept = keptOverride({ attribute, dcOverride, adjustmentOverride });
    if (!kept) return '';
    return kept.field === 'dcOverride'
      ? interpolate(
          text(
            'FABRICATE.Admin.Manager.Component.SalvageEditor.OverrideKeptDc',
            'A DC override of {dc} is kept on this component. This system does not read it, so it is not shown for editing.'
          ),
          { dc: kept.value }
        )
      : interpolate(
          text(
            'FABRICATE.Admin.Manager.Component.SalvageEditor.OverrideKeptAdjustment',
            'A difficulty adjustment override of {adjustment} is kept on this component. This system does not read it, so it is not shown for editing.'
          ),
          { adjustment: formatCheckAdjustment(kind, kept.value) }
        );
  });
</script>

<Field
  as="div"
  class="manager-salvage-dc-card"
  data-salvage-dc-override=""
  data-salvage-override-field={field}
>
  <!-- Frame 23-24's order: the kicker, then the controls, then the hint beneath them. -->
  <div class="manager-salvage-dc-copy">
    <span id={titleId} class="manager-salvage-dc-title"><Kicker as="span">{title}</Kicker></span>
    <div class="manager-salvage-dc-controls">
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
              inputProps={{
                'data-salvage-adjustment-custom': '',
                'aria-invalid': invalidOverride ? 'true' : undefined,
                'aria-describedby': invalidOverride ? invalidId : undefined,
              }}
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
    </div>
    <span class="manager-salvage-dc-note" data-salvage-override-hint>{hint}</span>
    {#if invalidOverride}
      <p
        class="manager-muted manager-salvage-dc-invalid"
        id={invalidId}
        data-salvage-override-invalid
      >
        <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
        {text(
          'FABRICATE.Admin.Manager.Component.SalvageEditor.OverrideInvalidForKind',
          'This override does not suit its kind: an added adjustment must be a finite number and a multiplier must be above zero.'
        )}
      </p>
    {/if}
  </div>
  {#if keptNotice}
    <!-- A Callout, not a Notice: the kept value is a standing fact about the record (library routing rule). -->
    <Callout text={keptNotice} dataAttr="data-salvage-override-kept" />
  {/if}
  <OverridePlayerSees
    subject={text('FABRICATE.Admin.Manager.Checks.PlayerSees.SalvageSubject', 'Salvage check')}
    {evaluation}
    thresholdMode={config?.thresholdMode}
    type={config?.type ?? null}
    {dcOverride}
    {adjustmentOverride}
    anchorDc={systemDefaultDc}
    actors={previewActors}
    resolveCharacter={resolvePreviewCharacter}
  />
</Field>

<style>
  .manager-salvage-dc-controls {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-3);
    align-items: center;
    min-width: 0;
  }

  .manager-salvage-dc-invalid {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    color: var(--fab-danger-text);
  }

  /* Edge-marks the Custom… stepper the same way an invalid formula is marked elsewhere: two
     selectors deep to reach the stepper's own border, which the plain input never draws. */
  :global(.manager-salvage-dc-controls .fab-stepper:has(input[aria-invalid='true'])) {
    border-color: var(--fab-danger-border);
  }
</style>
