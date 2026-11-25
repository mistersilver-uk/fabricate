<!-- Svelte 5 runes mode -->
<!--
  The open body of one effect in the Crafting Action editor: its description, when it applies, its
  workpiece rules and the counter change it makes.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `effect` | the staged effect | — | read, and written only through `change` |
  | `rolls` | boolean | `false` | whether the action rolls the check; without it tiers, success and the value compare are hidden and the workpiece rules stay |
  | `counters` / `actions` | `{ id, label }[]` | `[]` | the counters it may change and rules may read, and the actions a rule may name |
  | `tiers` | `{ id, name }[]` | `[]` | the routed check's outcomes, worst first |
  | `faults` | `{ code, reason? }[]` | `[]` | this effect's marks, drawn only while `open` |
  | `open` | boolean | `false` | marks live in the row while the effect is collapsed, so each shows once |
  | `text` | the shell's localizer | — | `(key, fallback)` |
  | `change(update)` | function | no-op | runs `update(effect)` against the staged copy |

  Invariants:
  - One All/Any choice combines the check conditions and the workpiece rules.
  - An emptied key is dropped, so a saved effect carries only the conditions it has.
-->
<script>
  import Button from '../../../components/Button.svelte';
  import Chip from '../../../components/Chip.svelte';
  import Field from '../../../components/Field.svelte';
  import IconButton from '../../../components/IconButton.svelte';
  import SegmentedControl from '../../../components/SegmentedControl.svelte';
  import Select from '../../../components/Select.svelte';
  import SelectionCheckbox from '../../../components/SelectionCheckbox.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import { arrayOrEmpty } from '../../../../../utils/scalars.js';
  import { bandToneFor } from '../checks/checkBandModel.js';

  import ActionExpressionField from './ActionExpressionField.svelte';
  import CounterRuleList from './CounterRuleList.svelte';
  import FaultLine from './FaultLine.svelte';
  import { counterOpOptions, effectOpOptions, whenFootnote } from './iterativeEffectCopy.js';
  import { isAmountFault } from './iterativeFieldFaults.js';

  let {
    effect,
    rolls = false,
    counters = [],
    actions = [],
    tiers = [],
    faults = [],
    open = false,
    text = (_key, fallback) => fallback,
    change = () => {},
  } = $props();

  const CHIP_TONES = {
    danger: 'danger',
    warning: 'warning',
    success: 'positive',
    info: 'info',
    accent: 'accent',
  };

  const when = $derived(effect.when ?? {});
  const combine = $derived(when.combine ?? 'all');
  const ticked = $derived(arrayOrEmpty(when.checkOutcomeIds));
  const success = $derived(
    typeof when.success === 'boolean' ? (when.success ? 'yes' : 'no') : 'any'
  );
  const compare = $derived(when.value ?? null);
  const counterIds = $derived(new Set(counters.map((counter) => counter.id)));

  const combineOptions = $derived([
    { value: 'all', label: text('FABRICATE.Admin.Manager.Iterative.CombineAll', 'All must hold') },
    { value: 'any', label: text('FABRICATE.Admin.Manager.Iterative.CombineAny', 'Any one') },
  ]);
  const successOptions = $derived([
    { value: 'any', label: text('FABRICATE.Admin.Manager.Iterative.SuccessEither', 'Either') },
    { value: 'yes', label: text('FABRICATE.Admin.Manager.Iterative.SuccessYes', 'Succeeded') },
    { value: 'no', label: text('FABRICATE.Admin.Manager.Iterative.SuccessNo', 'Failed') },
  ]);
  const counterOptions = $derived.by(() => {
    const options = counters.map((counter) => ({ value: counter.id, label: counter.label }));
    const id = effect.target?.counterId;
    return typeof id === 'string' && !counterIds.has(id)
      ? [...options, { value: id, label: id }]
      : options;
  });

  /** Writes `key` of `when`, creating it, and drops the key when `value` is empty. */
  function setWhen(key, value) {
    change((entry) => {
      entry.when = { combine: 'all', ...entry.when };
      if (value === undefined || (Array.isArray(value) && value.length === 0))
        delete entry.when[key];
      else entry.when[key] = value;
    });
  }

  const toggleTier = (id, on) =>
    setWhen('checkOutcomeIds', on ? [...ticked, id] : ticked.filter((held) => held !== id));

  const setSuccess = (next) => setWhen('success', next === 'any' ? undefined : next === 'yes');

  function setDescription(value) {
    change((entry) => {
      if (value.trim() === '') delete entry.description;
      else entry.description = value;
    });
  }
</script>

<div class="manager-iterative-effect-body" data-iterative-effect-body={effect.id}>
  <Field as="label">
    <span
      >{text('FABRICATE.Admin.Manager.Iterative.EffectDescription', 'Description')}
      <span class="manager-iterative-optional"
        >{text(
          'FABRICATE.Admin.Manager.Iterative.EffectDescriptionHint',
          '· optional, shown to players'
        )}</span
      ></span
    >
    <textarea
      rows="2"
      data-iterative-effect-description
      value={effect.description ?? ''}
      oninput={(event) => setDescription(event.currentTarget.value)}></textarea>
  </Field>

  <div class="manager-iterative-when" data-iterative-effect-when>
    <div class="manager-iterative-subheading">
      {text('FABRICATE.Admin.Manager.Iterative.AppliesWhen', 'Applies when')}
    </div>
    <SegmentedControl
      options={combineOptions}
      value={combine}
      ariaLabel={text('FABRICATE.Admin.Manager.Iterative.AppliesWhen', 'Applies when')}
      optionDataAttr="data-iterative-effect-combine"
      onChange={(next) => setWhen('combine', next)}
    />
    {#if rolls}
      <div class="manager-iterative-when-line">
        <span class="manager-iterative-word"
          >{text('FABRICATE.Admin.Manager.Iterative.OutcomeAnyOf', 'Outcome is any of')}</span
        >
        {#each tiers as tier, position (tier.id)}
          <SelectionCheckbox
            checked={ticked.includes(tier.id)}
            ariaLabel={tier.name}
            data-iterative-effect-tier={tier.id}
            onChange={(on) => toggleTier(tier.id, on)}
          >
            {#snippet label()}
              <Chip tone={CHIP_TONES[bandToneFor(position, tiers.length)] ?? 'neutral'}
                >{tier.name}</Chip
              >
            {/snippet}
          </SelectionCheckbox>
        {/each}
        {#if ticked.length === 0}
          <span class="manager-iterative-note"
            >{text(
              'FABRICATE.Admin.Manager.Iterative.OutcomeNone',
              'None ticked: any outcome'
            )}</span
          >
        {/if}
      </div>
      <div class="manager-iterative-when-line">
        <span class="manager-iterative-word"
          >{text('FABRICATE.Admin.Manager.Iterative.CheckResult', 'Check')}</span
        >
        <SegmentedControl
          options={successOptions}
          value={success}
          ariaLabel={text('FABRICATE.Admin.Manager.Iterative.CheckResult', 'Check')}
          optionDataAttr="data-iterative-effect-success"
          onChange={setSuccess}
        />
      </div>
      <div class="manager-iterative-when-line">
        <span class="manager-iterative-word"
          >{text('FABRICATE.Admin.Manager.Iterative.CheckTotal', 'Check total')}</span
        >
        {#if compare}
          <Select
            size="inline"
            ariaLabel={text('FABRICATE.Admin.Manager.Iterative.CompareOpLabel', 'Total comparison')}
            value={compare.op ?? null}
            options={counterOpOptions(text)}
            triggerProps={{ 'data-iterative-effect-compare-op': '' }}
            onChange={(op) => setWhen('value', { ...compare, op })}
          />
          {@const names = stepperLabels(
            text('FABRICATE.Admin.Manager.Iterative.CompareValueLabel', 'Compared value')
          )}
          <Stepper
            value={compare.value ?? null}
            ariaLabel={names.ariaLabel}
            decrementLabel={names.decrementLabel}
            incrementLabel={names.incrementLabel}
            inputProps={{ 'data-iterative-effect-compare-value': '' }}
            onChange={(value) => setWhen('value', { ...compare, value })}
          />
          <IconButton
            role="ghost"
            size="24"
            icon="fas fa-xmark"
            data-iterative-effect-compare-clear=""
            ariaLabel={text(
              'FABRICATE.Admin.Manager.Iterative.CompareClear',
              'Remove value compare'
            )}
            onclick={() => setWhen('value', undefined)}
          />
        {:else}
          <Button
            role="dashed"
            icon="fas fa-plus"
            data-iterative-effect-compare-add
            onclick={() => setWhen('value', { op: '>=', value: 0 })}
          >
            {text('FABRICATE.Admin.Manager.Iterative.CompareValue', 'Compare value')}
          </Button>
        {/if}
      </div>
    {:else}
      <p class="manager-iterative-note" data-iterative-effect-no-check>
        {text(
          'FABRICATE.Admin.Manager.Iterative.EffectNoCheck',
          'This action rolls no check, so its effects always apply.'
        )}
      </p>
    {/if}
    <div class="manager-iterative-subheading">
      {text('FABRICATE.Admin.Manager.Iterative.WorkpieceRules', 'Workpiece rules')}
    </div>
    <CounterRuleList
      rules={arrayOrEmpty(when.rules)}
      {combine}
      counterSources={counters}
      {actions}
      {text}
      combineControl={false}
      showFaults={open}
      ariaLabel={text('FABRICATE.Admin.Manager.Iterative.WorkpieceRules', 'Workpiece rules')}
      data-iterative-effect-rules
      onChange={({ rules }) => setWhen('rules', rules)}
    />
    <p class="manager-iterative-note" data-iterative-effect-footnote>
      {whenFootnote(combine, text)}
    </p>
  </div>

  <div class="manager-iterative-effect-line" data-iterative-effect-line>
    <div class="manager-iterative-subheading">
      {text('FABRICATE.Admin.Manager.Iterative.EffectHeading', 'Effect')}
    </div>
    <div class="manager-iterative-when-line">
      <SegmentedControl
        options={effectOpOptions(text)}
        value={effect.op}
        ariaLabel={text('FABRICATE.Admin.Manager.Iterative.EffectOpLabel', 'Operation')}
        optionDataAttr="data-iterative-effect-op"
        onChange={(next) =>
          change((entry) => {
            entry.op = next;
          })}
      />
      <Select
        size="inline"
        ariaLabel={text(
          'FABRICATE.Admin.Manager.Iterative.EffectCounterLabel',
          'Counter to change'
        )}
        value={effect.target?.counterId ?? null}
        options={counterOptions}
        triggerProps={{ 'data-iterative-effect-counter': '' }}
        onChange={(next) =>
          change((entry) => {
            entry.target = { kind: 'counter', counterId: next };
          })}
      />
      <span class="manager-iterative-word">
        {effect.op === 'set'
          ? text('FABRICATE.Admin.Manager.Iterative.EffectTo', 'to')
          : text('FABRICATE.Admin.Manager.Iterative.EffectBy', 'by')}
      </span>
      <ActionExpressionField
        value={String(effect.amount ?? '')}
        profile="effect"
        {counters}
        {text}
        faults={open ? faults.filter(isAmountFault) : []}
        kind="effect"
        ariaLabel={text('FABRICATE.Admin.Manager.Iterative.EffectAmountLabel', 'Effect value')}
        onChange={(next) =>
          change((entry) => {
            entry.amount = next;
          })}
      />
    </div>
    {#if open}<FaultLine
        faults={faults.filter((fault) => !isAmountFault(fault) && fault.field !== 'rule')}
        {text}
      />{/if}
  </div>
</div>

<style>
  .manager-iterative-effect-body,
  .manager-iterative-when,
  .manager-iterative-effect-line {
    display: grid;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-iterative-effect-body {
    padding: var(--fab-space-3);
    gap: var(--fab-space-3);
  }

  .manager-iterative-when-line {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--fab-space-2);
  }

  .manager-iterative-subheading {
    color: var(--fab-text-secondary);
    font-size: 0.72rem;
    font-weight: 600;
  }

  .manager-iterative-word {
    align-self: center;
    color: var(--fab-text-secondary);
    font-size: 0.72rem;
  }

  .manager-iterative-optional {
    color: var(--fab-text-subtle);
  }
</style>
