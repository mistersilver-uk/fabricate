<!-- Svelte 5 runes mode -->
<!--
  One cell of the recipe Overview's Counters table: the counter and its fault lines, Start as a
  fixed number or a formula, Min and Max as steppers or read-only bounds, Target, Player sees, or
  remove. Each fault line has an id, and the control it marks is `aria-invalid` and described by it.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `row` | a `counterInstanceRows` row | — | the instance and its faults |
  | `column` | `'counter'` \| `'start'` \| `'min'` \| `'max'` \| `'target'` \| `'visible'` \| `'remove'` | — | the cell drawn |
  | `idPrefix` | string | — | unique per row; fault line `i` is `${idPrefix}-fault-${i}` |
  | `systemName` | string | `''` | the system the unknown-counter sentence names |
  | `disabled` | boolean | `false` | every control off |
  | `text` | the shell's localizer | — | `(key, fallback)` |

  Callbacks:
  - `onChange(next)` — the instance as edited; `onRemove()`; `onCreateCounter()`.
-->
<script>
  import Button from '../../../../components/Button.svelte';
  import Chip from '../../../../components/Chip.svelte';
  import IconButton from '../../../../components/IconButton.svelte';
  import PickerRowAmount from '../../../../components/PickerRowAmount.svelte';
  import StatusToggle from '../../../../components/StatusToggle.svelte';
  import Stepper from '../../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../../components/stepperLabels.js';
  import { evaluateIterativeExpression } from '../../../../../../systems/iterative/expression.js';
  import { fill } from '../../../../../../utils/fillPlaceholders.js';
  import FaultLine from '../../iterative/FaultLine.svelte';
  import { faultSentence } from '../../iterative/iterativeFieldFaults.js';
  import { counterFaultSentence } from './counterInstanceCopy.js';

  let {
    row,
    column,
    idPrefix,
    systemName = '',
    disabled = false,
    text = (_key, fallback) => fallback,
    onChange = () => {},
    onRemove = () => {},
    onCreateCounter = () => {},
  } = $props();

  const START_PLACEHOLDER = '40 + 2 * @abilities.con.mod';
  const refuseRoll = () => {
    throw new Error('dice are not rolled while authoring');
  };

  const named = (key, fallback) => fill(text(key, fallback), { counter: row.label });
  const instance = $derived(row.instance ?? {});
  const faultId = (index) => `${idPrefix}-fault-${index}`;
  const validationTarget = $derived(`iterative-counter-${row.counterId}`);
  /** `aria-invalid`, `aria-describedby` and the Validation focus target for `control` while a fault marks it. */
  function marks(control) {
    const ids = row.faults.flatMap((fault, index) =>
      fault.control === control ? [faultId(index)] : []
    );
    return ids.length
      ? {
          'aria-invalid': 'true',
          'aria-describedby': ids.join(' '),
          'data-validation-target': validationTarget,
        }
      : {};
  }

  function resolveStart(expression) {
    const outcome = evaluateIterativeExpression(expression, {
      profile: 'start',
      roots: {},
      rollData: {},
      rollDie: refuseRoll,
    });
    return outcome.ok ? outcome.value : null;
  }

  /** The instance with `field` set to `value`, or without it when `value` is absent. */
  function withField(field, value) {
    const next = { ...instance };
    if (value === null || value === undefined) delete next[field];
    else next[field] = value;
    return next;
  }

  function changeStart(patch) {
    if ('quantity' in patch) onChange({ ...instance, start: patch.quantity });
    else onChange(withField('startFormula', patch.quantityFormula));
  }

  const startName = $derived(
    named('FABRICATE.Admin.Manager.Recipe.Iterative.StartName', '{counter} start')
  );
  const targetLabels = $derived(
    stepperLabels(named('FABRICATE.Admin.Manager.Recipe.Iterative.TargetName', '{counter} target'))
  );
  const formulaInvalid = $derived(
    row.formulaFaults.length ? faultSentence(row.formulaFaults[0], text) : ''
  );
  const boundName = (field) =>
    field === 'min'
      ? named('FABRICATE.Admin.Manager.Recipe.Iterative.MinName', '{counter} min')
      : named('FABRICATE.Admin.Manager.Recipe.Iterative.MaxName', '{counter} max');

  /** A read-only bound's name: global with its value, or no limit. */
  function lockedName(field) {
    if (row.limit === 'none') {
      return field === 'min'
        ? named('FABRICATE.Admin.Manager.Recipe.Iterative.MinNoLimit', '{counter} min, no limit')
        : named('FABRICATE.Admin.Manager.Recipe.Iterative.MaxNoLimit', '{counter} max, no limit');
    }
    const bound = row.bounds[field];
    const value = bound ?? text('FABRICATE.Admin.Manager.Recipe.Iterative.BoundNone', 'none');
    const template =
      field === 'min'
        ? text('FABRICATE.Admin.Manager.Recipe.Iterative.MinGlobal', '{counter} min, global {n}')
        : text('FABRICATE.Admin.Manager.Recipe.Iterative.MaxGlobal', '{counter} max, global {n}');
    return fill(template, { counter: row.label, n: value });
  }

  const lockedTitle = $derived(
    row.limit === 'none'
      ? named(
          'FABRICATE.Admin.Manager.Recipe.Iterative.NoLimitTitle',
          '{counter} has no limits. Change them in Counters.'
        )
      : named(
          'FABRICATE.Admin.Manager.Recipe.Iterative.GlobalTitle',
          '{counter} uses global limits. Change them in Counters.'
        )
  );
</script>

{#snippet bound(field)}
  {#if row.limit === 'global' || row.limit === 'none'}
    <Chip
      mono
      icon={row.limit === 'none' ? 'fas fa-infinity' : 'fas fa-globe'}
      ariaLabel={lockedName(field)}
      title={lockedTitle}
      data-iterative-counter-bound={field}>{row.bounds[field] ?? '—'}</Chip
    >
  {:else}
    {@const labels = stepperLabels(boundName(field))}
    <Stepper
      value={instance[field] ?? null}
      allowUnset
      placeholder={row.defaults[field] === null ? '' : String(row.defaults[field])}
      {disabled}
      ariaLabel={labels.ariaLabel}
      decrementLabel={labels.decrementLabel}
      incrementLabel={labels.incrementLabel}
      inputProps={{ [`data-iterative-counter-${field}`]: row.key, ...marks(field) }}
      onChange={(next) => onChange(withField(field, next))}
    />
  {/if}
{/snippet}

{#if column === 'counter'}
  <div class="manager-counter-instance-name">
    <span class="manager-counter-instance-label" class:is-unknown={!row.known}>{row.label}</span>
    {#each row.faults as fault, index (index)}
      <FaultLine
        faults={[fault]}
        id={faultId(index)}
        sentence={() => counterFaultSentence(fault, { row, systemName, text })}
        {text}
      />
    {/each}
    {#if !row.known}
      <Button
        role="ghost"
        size="24"
        data-iterative-counter-create={row.key}
        data-validation-target={validationTarget}
        onclick={onCreateCounter}
        >{text('FABRICATE.Admin.Manager.Recipe.Iterative.CreateCounter', 'Create counter')}</Button
      >
    {/if}
  </div>
{:else if column === 'start'}
  <PickerRowAmount
    value={{ kind: 'counter', quantity: instance.start, quantityFormula: instance.startFormula }}
    name={row.label}
    {disabled}
    invalid={formulaInvalid}
    formula={{
      resolve: resolveStart,
      unresolvedLabel: text(
        'FABRICATE.Admin.Manager.Recipe.Iterative.StartUnresolved',
        'Rolls when the step starts'
      ),
      placeholder: START_PLACEHOLDER,
      hint: text(
        'FABRICATE.Admin.Manager.Recipe.Iterative.StartHint',
        'A number, dice, or character data such as @abilities.con.mod. Dice roll once, when the step starts.'
      ),
    }}
    amount={{
      ...stepperLabels(startName),
      fixedLabel: text('FABRICATE.Admin.Manager.Recipe.AmountFixed', 'Fixed'),
      rolledLabel: text('FABRICATE.Admin.Manager.Recipe.Iterative.StartFormula', 'Formula'),
      modeAriaLabel: named(
        'FABRICATE.Admin.Manager.Recipe.Iterative.StartMode',
        'How {counter} starts'
      ),
      formulaAriaLabel: named(
        'FABRICATE.Admin.Manager.Recipe.Iterative.StartFormulaName',
        '{counter} start formula'
      ),
      inputProps: { 'data-iterative-counter-start': row.key, ...marks('start') },
    }}
    onChange={changeStart}
  />
{:else if column === 'min' || column === 'max'}
  {@render bound(column)}
{:else if column === 'target'}
  <Stepper
    value={instance.target ?? null}
    allowUnset
    {disabled}
    ariaLabel={targetLabels.ariaLabel}
    decrementLabel={targetLabels.decrementLabel}
    incrementLabel={targetLabels.incrementLabel}
    inputProps={{ 'data-iterative-counter-target': row.key, ...marks('target') }}
    onChange={(next) => onChange(withField('target', next))}
  />
{:else if column === 'visible'}
  <StatusToggle
    on={instance.visible !== false}
    {disabled}
    ariaLabel={named(
      'FABRICATE.Admin.Manager.Recipe.Iterative.ShownToPlayers',
      '{counter} shown to players'
    )}
    data-iterative-counter-visible={row.key}
    onclick={() => onChange({ ...instance, visible: instance.visible === false })}
  />
{:else if column === 'remove'}
  <IconButton
    role="danger"
    size="24"
    icon="fas fa-xmark"
    {disabled}
    ariaLabel={named(
      'FABRICATE.Admin.Manager.Recipe.Iterative.RemoveCounter',
      'Remove {counter} from this recipe'
    )}
    data-iterative-counter-remove={row.key}
    onclick={onRemove}
  />
{/if}

<style>
  .manager-counter-instance-name {
    display: grid;
    gap: var(--fab-space-1);
    justify-items: start;
    min-width: 0;
  }

  /* As tall as the row's steppers, so the name centres on their line while faults stack under it. */
  .manager-counter-instance-label {
    display: flex;
    align-items: center;
    min-height: 26px;
    color: var(--fab-text);
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .manager-counter-instance-label.is-unknown {
    color: var(--fab-danger-text);
  }
</style>
