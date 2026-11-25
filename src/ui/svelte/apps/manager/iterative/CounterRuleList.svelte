<!-- Svelte 5 runes mode -->
<!-- ratchet-exempt(design-system): a composition of RuleRow, Select, Stepper and SetPicker over C2's CounterRule, shared by the action editor and recipe authoring rather than offered as a vocabulary member -->
<!--
  The list of `CounterRule`s a Crafting Action's availability, an effect's workpiece rules and, in
  C6, a recipe step's rules share: one inline `RuleRow` per rule, and the dashed "Rule" adder. It is
  the only place `RuleRow` is used, and the only way `RuleSentence` is reached.

  Props (the contract C6 imports):
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `rules` / `combine` | `CounterRule[]` / `'all'` \| `'any'` | `[]` / `'all'` | the rules as drafted, and how they combine |
  | `counterSources` | `{ id, label }[]` | `[]` | the counter sources, a PROP: a caller narrows it, so it is never read from the store |
  | `actions` | `{ id, label }[]` | `[]` | the actions a Previous action rule may name |
  | `combineControl` | boolean | `true` | `false` hides the All/Any control, for a caller whose `combine` is set elsewhere |
  | `sourceScope` | `'library'` \| `'step'` | `'library'` | `'step'` words a rule whose counter is not among `counterSources` as "{Counter} isn't tracked in this step."; the rule still renders, with its stored id, and keeps its remove control |
  | `joiner` | `'and'` \| `'or'` | unset | with `combineControl={false}`, the localized word drawn above every rule after the first, as the prototype joins success rules with "and" and failure rules with "or" |
  | `adderLabel` | string | the "Rule" copy | overrides the adder button's label; C6 passes "Condition" |
  | `showFaults` | boolean | `true` | `false` hides each rule's mark, for a caller drawing them elsewhere |
  | `emptyText` / `ariaLabel` | strings | `''` | the line under an empty list, and the list's name |
  | `text` | the shell's localizer | — | `(key, fallback)` |
  | `onChange({ rules, combine })` | function | no-op | every edit, as the whole next list and combine |

  Invariants:
  - A rule's source is one `Select`: each counter (sub-line "counter"), Session number, then
    Previous action. A counter or Session number then takes an op and a value; Previous action takes
    a `SetPicker` of actions and has no "is not", because the rule carries only `actionIds`.
  - A rule that does not parse, or names a counter or action the lists lack, draws its mark, which
    describes its source.
  - Every edit starts from `rules` as passed, so a rule that is not an object is written back as it
    was, and removing a rule hands focus to the adder.
-->
<script>
  import { tick } from 'svelte';

  import Select from '../../../components/Select.svelte';
  import RuleRow from '../../../components/RuleRow.svelte';
  import SegmentedControl from '../../../components/SegmentedControl.svelte';
  import SetPicker from '../../../components/SetPicker.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import { interpolate } from '../checks/checksCopy.js';
  import { arrayOrEmpty, isPlainObject } from '../../../../../utils/scalars.js';

  import FaultLine from './FaultLine.svelte';
  import { counterOpOptions } from './iterativeEffectCopy.js';
  import { ruleFault } from './iterativeFieldFaults.js';

  let {
    rules = [],
    combine = 'all',
    counterSources = [],
    sourceScope = 'library',
    actions = [],
    combineControl = true,
    showFaults = true,
    joiner = '',
    adderLabel = '',
    emptyText = '',
    ariaLabel = '',
    text = (_key, fallback) => fallback,
    onChange = () => {},
    ...rest
  } = $props();

  const uid = $props.id();
  let root = $state(null);

  const GLYPHS = {
    counter: 'fas fa-gauge-simple-high',
    sessionCount: 'fas fa-hashtag',
    previousAction: 'fas fa-clock-rotate-left',
  };

  const list = $derived(arrayOrEmpty(rules).map((rule) => (isPlainObject(rule) ? rule : {})));
  const context = $derived({
    counterIds: new Set(counterSources.map((counter) => counter.id)),
    actionIds: new Set(actions.map((action) => action.id)),
  });

  const joinerWord = $derived(
    combineControl
      ? ''
      : joiner === 'and'
        ? text('FABRICATE.Admin.Manager.Iterative.JoinerAnd', 'and')
        : joiner === 'or'
          ? text('FABRICATE.Admin.Manager.Iterative.JoinerOr', 'or')
          : ''
  );
  const opOptions = $derived(counterOpOptions(text));
  const combineOptions = $derived([
    { value: 'all', label: text('FABRICATE.Admin.Manager.Iterative.CombineAll', 'All must hold') },
    { value: 'any', label: text('FABRICATE.Admin.Manager.Iterative.CombineAny', 'Any one') },
  ]);

  const sourceKey = (rule) =>
    rule.source === 'counter' ? `counter:${rule.counterId}` : (rule.source ?? '');

  function sourceOptions(rule) {
    const counterWord = text('FABRICATE.Admin.Manager.Iterative.SourceCounterHint', 'counter');
    const options = counterSources.map((counter) => ({
      value: `counter:${counter.id}`,
      label: counter.label,
      hint: counterWord,
    }));
    const missing = rule.source === 'counter' && !context.counterIds.has(rule.counterId);
    if (missing) {
      options.push({
        value: sourceKey(rule),
        label: String(rule.counterId ?? ''),
        hint: counterWord,
      });
    }
    return [
      ...options,
      {
        value: 'sessionCount',
        label: text('FABRICATE.Admin.Manager.Iterative.SourceSession', 'Session number'),
      },
      {
        value: 'previousAction',
        label: text('FABRICATE.Admin.Manager.Iterative.SourcePreviousAction', 'Previous action'),
      },
    ];
  }

  const comparison = (rule) => ({ op: rule.op ?? '>=', value: Number(rule.value ?? 0) });

  function ruleFromSource(rule, key) {
    if (key === 'previousAction') {
      return { source: 'previousAction', actionIds: arrayOrEmpty(rule.actionIds) };
    }
    if (key === 'sessionCount') return { source: 'sessionCount', ...comparison(rule) };
    return { source: 'counter', counterId: key.slice('counter:'.length), ...comparison(rule) };
  }

  /** The step-scope sentence for a rule whose counter is not a source, else `undefined`. */
  const untrackedSentence = (rule, fault) =>
    sourceScope === 'step' && fault.code === 'iterativeUnknownCounter'
      ? interpolate(
          text(
            'FABRICATE.Admin.Manager.Iterative.RuleCounterUntracked',
            "{counter} isn't tracked in this step."
          ),
          { counter: rule.counterId }
        )
      : undefined;

  const freshRule = () =>
    counterSources.length > 0
      ? { source: 'counter', counterId: counterSources[0].id, op: '>=', value: 0 }
      : { source: 'sessionCount', op: '>=', value: 1 };

  const emit = (nextRules, nextCombine = combine) =>
    onChange({ rules: nextRules, combine: nextCombine });
  async function replaceAt(index, next) {
    const held = arrayOrEmpty(rules);
    if (next !== null) {
      emit(held.map((rule, at) => (at === index ? next : rule)));
      return;
    }
    emit(held.filter((_, at) => at !== index));
    await tick();
    root?.querySelector('[data-counter-rules-add] [data-rule-row-preset]')?.focus();
  }

  function sourceName(rule) {
    if (rule.source === 'sessionCount')
      return text('FABRICATE.Admin.Manager.Iterative.SourceSession', 'Session number');
    if (rule.source === 'previousAction')
      return text('FABRICATE.Admin.Manager.Iterative.SourcePreviousAction', 'Previous action');
    const held = counterSources.find((counter) => counter.id === rule.counterId);
    return held?.label ?? String(rule.counterId ?? '');
  }

  const presets = $derived([
    {
      id: 'rule',
      label: adderLabel || text('FABRICATE.Admin.Manager.Iterative.AddRule', 'Rule'),
      icon: 'fas fa-plus',
      value: freshRule,
    },
  ]);

  const head = (rule) => ({
    glyph: GLYPHS[rule.source] ?? 'fas fa-sliders',
    title: text('FABRICATE.Admin.Manager.Iterative.RuleTitle', 'When'),
  });
  /** One rule's schema, its `source` step a snippet that knows the row's mark id. */
  const schemaFor = (rule, source) => ({
    head,
    steps: [
      { key: 'source', render: source },
      { key: 'predicate', render: predicateStep },
    ],
    labels: {
      remove: interpolate(
        text('FABRICATE.Admin.Manager.Iterative.RemoveRule', 'Remove {source} rule'),
        { source: sourceName(rule) }
      ),
    },
  });
  const faultIdOf = (index) => `${uid}-rule-${index}-fault`;
</script>

{#snippet sourceStep(rule, change, describedBy = '')}
  <Select
    size="inline"
    ariaLabel={text('FABRICATE.Admin.Manager.Iterative.RuleSourceLabel', 'Rule source')}
    value={sourceKey(rule)}
    options={sourceOptions(rule)}
    invalid={Boolean(ruleFault(rule, context))}
    ariaDescribedBy={describedBy}
    triggerProps={{ 'data-counter-rule-source': '' }}
    onChange={(key) => change(ruleFromSource(rule, key))}
  />
{/snippet}

{#snippet predicateStep(rule, change)}
  {#if rule.source === 'previousAction'}
    <SetPicker
      value={arrayOrEmpty(rule.actionIds)}
      options={actions.map((action) => ({ id: action.id, label: action.label }))}
      ariaLabel={text('FABRICATE.Admin.Manager.Iterative.RuleActionsLabel', 'Previous action is')}
      searchLabel={text('FABRICATE.Admin.Manager.Iterative.RuleActionsSearch', 'Search actions')}
      emptyLabel={text('FABRICATE.Admin.Manager.Iterative.RuleActionsEmpty', 'No actions yet.')}
      addLabel={text('FABRICATE.Admin.Manager.Iterative.RuleActionsAdd', 'Choose actions')}
      addProps={{ 'data-counter-rule-actions': '' }}
      onChange={(next) => change({ source: 'previousAction', actionIds: next })}
    />
  {:else}
    <Select
      size="inline"
      ariaLabel={text('FABRICATE.Admin.Manager.Iterative.RuleOpLabel', 'Comparison')}
      value={rule.op ?? null}
      options={opOptions}
      triggerProps={{ 'data-counter-rule-op': '' }}
      onChange={(op) => change({ ...rule, op })}
    />
    {@const names = stepperLabels(
      text('FABRICATE.Admin.Manager.Iterative.RuleValueLabel', 'Rule value')
    )}
    <Stepper
      value={rule.value ?? null}
      ariaLabel={names.ariaLabel}
      decrementLabel={names.decrementLabel}
      incrementLabel={names.incrementLabel}
      inputProps={{ 'data-counter-rule-value': '' }}
      onChange={(value) => change({ ...rule, value })}
    />
  {/if}
{/snippet}

<div class="manager-iterative-rules" bind:this={root} data-counter-rules {...rest}>
  {#if combineControl && list.length > 1}
    <SegmentedControl
      options={combineOptions}
      value={combine}
      ariaLabel={text('FABRICATE.Admin.Manager.Iterative.CombineLabel', 'Rules combine')}
      optionDataAttr="data-counter-rules-combine"
      onChange={(next) => emit(arrayOrEmpty(rules), next)}
    />
  {/if}
  {#if list.length === 0 && emptyText}
    <p class="manager-iterative-rules-empty" data-counter-rules-empty>{emptyText}</p>
  {/if}
  {#if list.length > 0}
    <div class="manager-iterative-rules-list" role="list" aria-label={ariaLabel || undefined}>
      {#each list as rule, index (index)}
        {@const fault = ruleFault(rule, context)}
        {#snippet describedSource(value, change)}
          {@render sourceStep(value, change, showFaults && fault ? faultIdOf(index) : '')}
        {/snippet}
        <div class="manager-iterative-rules-item" role="listitem">
          {#if joinerWord && index > 0}
            <span class="manager-iterative-rules-joiner" data-counter-rules-joiner={joiner}
              >{joinerWord}</span
            >
          {/if}
          <RuleRow
            schema={schemaFor(rule, describedSource)}
            value={rule}
            data-counter-rule={index}
            onChange={(next) => replaceAt(index, next)}
          />
          <FaultLine
            faults={showFaults && fault ? [fault] : []}
            id={faultIdOf(index)}
            sentence={(held) => untrackedSentence(rule, held)}
            {text}
          />
        </div>
      {/each}
    </div>
  {/if}
  <RuleRow
    schema={{}}
    value={null}
    {presets}
    data-counter-rules-add
    onChange={(next) => emit([...arrayOrEmpty(rules), next])}
  />
</div>

<style>
  .manager-iterative-rules,
  .manager-iterative-rules-list,
  .manager-iterative-rules-item {
    display: grid;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-iterative-rules-joiner {
    color: var(--fab-text-subtle);
    font-size: 0.66rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .manager-iterative-rules-empty {
    margin: 0;
    color: var(--fab-text-subtle);
    font-size: 0.66rem;
    line-height: 1.5;
  }
</style>
