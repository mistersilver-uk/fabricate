<!-- Svelte 5 runes mode -->
<!-- ratchet-exempt(design-system): a composition of Field, RollDataExpressionInput and FaultLine with the iterative expression profiles, shared by the Costs and Effects cards rather than offered as a vocabulary member -->
<!--
  One amount of a Crafting Action: a `RollDataExpressionInput` in a `Field`, with the roots its C3
  profile admits always listed as tokens, a reading only for a constant, and the marks under it.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | string | `''` | the expression as typed |
  | `profile` | `'cost'` \| `'effect'` | `'cost'` | the C3 field profile; `@check.value` is offered only to `effect` |
  | `counters` | `{ id, label }[]` | `[]` | each is offered as `@counter.<id>` |
  | `faults` | `{ code, reason? }[]` | `[]` | this amount's marks |
  | `ariaLabel` / `kind` | strings | `''` / `'cost'` | the input's name, and the value of its `data-iterative-amount` hook |
  | `text` | the shell's localizer | — | `(key, fallback)` |
  | `onChange(next)` | function | no-op | every keystroke |

  Invariants:
  - The reading calls `evaluateIterativeExpression` with no state and no dice, so only a constant
    resolves; anything else that parses reads "Resolves each attempt", and one that does not parse
    draws no reading, only its mark.
-->
<script>
  import Field from '../../../components/Field.svelte';
  import RollDataExpressionInput from '../../../components/RollDataExpressionInput.svelte';
  import { evaluateIterativeExpression } from '../../../../../systems/iterative/expression.js';

  import FaultLine from './FaultLine.svelte';
  import { isWarningFault } from './iterativeFieldFaults.js';

  let {
    value = '',
    profile = 'cost',
    counters = [],
    faults = [],
    ariaLabel = '',
    kind = 'cost',
    text = (_key, fallback) => fallback,
    onChange = () => {},
  } = $props();

  const uid = $props.id();
  const faultId = `${uid}-fault`;
  const refuseRoll = () => {
    throw new Error('dice are not rolled while authoring');
  };
  const noRoots = { counters: new Map(), min: new Map(), max: new Map(), target: new Map() };

  const tokens = $derived([
    ...(profile === 'effect' ? ['@check.value'] : []),
    '@sessionCount',
    ...counters.map((counter) => `@counter.${counter.id}`),
  ]);
  const blocking = $derived(faults.some((fault) => !isWarningFault(fault)));
  const unparsed = $derived(faults.some((fault) => fault.code === 'iterativeInvalidExpression'));

  function resolve(expression) {
    const outcome = evaluateIterativeExpression(expression, {
      profile,
      roots: noRoots,
      rollData: {},
      rollDie: refuseRoll,
    });
    return outcome.ok ? outcome.value : null;
  }
</script>

<div class="manager-iterative-amount">
  <Field as="div" size={30} invalid={blocking}>
    <RollDataExpressionInput
      data-iterative-amount={kind}
      aria-label={ariaLabel}
      aria-invalid={blocking ? 'true' : undefined}
      aria-describedby={faults.length > 0 ? faultId : undefined}
      {value}
      {tokens}
      tokensLabel={text('FABRICATE.Admin.Manager.Iterative.AmountTokens', 'Insert a value')}
      resolve={unparsed ? undefined : resolve}
      unresolvedLabel={text(
        'FABRICATE.Admin.Manager.Iterative.AmountUnresolved',
        'Resolves each attempt'
      )}
      {onChange}
    />
  </Field>
  <FaultLine {faults} id={faultId} {text} />
</div>

<style>
  /* Capped, so a long amount does not push its counter and toggle off the line. */
  .manager-iterative-amount {
    display: grid;
    flex: 0 1 18rem;
    gap: var(--fab-space-1);
    min-width: 0;
  }
</style>
