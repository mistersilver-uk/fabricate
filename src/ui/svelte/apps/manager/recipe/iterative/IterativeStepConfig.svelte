<!-- Svelte 5 runes mode -->
<!-- ratchet-exempt(design-system): a composition of SegmentedControl, SetPicker, DataTable, SelectionCheckbox and CounterRuleList for one recipe step, shared by the single-step Working the recipe card and the multi-step Steps card rather than offered as a vocabulary member -->
<!--
  One recipe step's iterative configuration: its allowed actions, the Counters in this step it hides
  or locks, and Ends when, the success rules that must all hold and the failure rules any one of
  which ends it. Rules range over the recipe's Counter Instances only, so a rule naming another
  counter reads as not tracked in this step.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `config` | `Step.iterative` or `Recipe.iterative.step` | `null` | read through `normalizeStepIterative`'s defaults |
  | `instances` | `Recipe.iterative.counters` | `[]` | the Counter Instances the step can name |
  | `iterative` | the iterative route model | — | reads `library`, `counters` and `actions` |
  | `multi` | boolean | `false` | a multi-step recipe always shows its Counters in this step |
  | `stepNumber` | integer | `1` | the 1-based step the per-counter names say |
  | `disabled` | boolean | `false` | every control off |
  | `text` | the shell's localizer | — | `(key, fallback)` |

  Callbacks:
  - `onChange(config)` — the whole next config, which the caller writes to its step.

  Invariants:
  - A single step shows Counters in this step only while its hide or lock list is non-empty.
-->
<script>
  import Kicker from '../../../../components/Kicker.svelte';
  import CounterRuleList from '../../iterative/CounterRuleList.svelte';
  import IterativeStepActions from './IterativeStepActions.svelte';
  import IterativeStepCounters from './IterativeStepCounters.svelte';
  import { actionOptions, instanceSources, stepConfigOf } from './iterativeStepConfig.js';

  let {
    config: raw = null,
    instances = [],
    iterative,
    multi = false,
    stepNumber = 1,
    disabled = false,
    text = (_key, fallback) => fallback,
    onChange = () => {},
  } = $props();

  const config = $derived(stepConfigOf(raw));
  const libraryCounters = $derived(iterative?.counters ?? []);
  const sources = $derived(instanceSources(instances, libraryCounters));
  const library = $derived(iterative?.library ?? null);
  const options = $derived(
    actionOptions(
      library,
      sources,
      text('FABRICATE.Admin.Manager.Recipe.Iterative.ActionIdle', 'changes nothing here')
    )
  );
  const ruleActions = $derived(options.map(({ id, label }) => ({ id, label })));
  const showCounters = $derived(
    sources.length > 0 &&
      (multi || config.hiddenCounterIds.length > 0 || config.lockedCounterIds.length > 0)
  );

  const ENDS = [
    {
      key: 'success',
      icon: 'fas fa-flag-checkered',
      joiner: 'and',
      title: ['FABRICATE.Admin.Manager.Recipe.Iterative.EndSuccess', 'Success'],
      sub: ['FABRICATE.Admin.Manager.Recipe.Iterative.EndSuccessSub', 'when all of these hold'],
      list: ['FABRICATE.Admin.Manager.Recipe.Iterative.SuccessRulesLabel', 'Success rules'],
      empty: [
        'FABRICATE.Admin.Manager.Recipe.Iterative.SuccessEmpty',
        'No success rule. Without one, the step can never finish.',
      ],
    },
    {
      key: 'failure',
      icon: 'fas fa-heart-crack',
      joiner: 'or',
      title: ['FABRICATE.Admin.Manager.Recipe.Iterative.EndFailure', 'Failure'],
      sub: ['FABRICATE.Admin.Manager.Recipe.Iterative.EndFailureSub', 'when any of these holds'],
      list: ['FABRICATE.Admin.Manager.Recipe.Iterative.FailureRulesLabel', 'Failure rules'],
      empty: [
        'FABRICATE.Admin.Manager.Recipe.Iterative.FailureEmpty',
        'No failure rule. The step can only end in success.',
      ],
    },
  ];
  const say = ([key, fallback]) => text(key, fallback);
</script>

<div class="manager-iterative-step-config" data-iterative-step-config>
  <IterativeStepActions {config} {options} {disabled} {text} {onChange} />

  {#if showCounters}
    <IterativeStepCounters {config} {sources} {stepNumber} {disabled} {text} {onChange} />
  {/if}

  <div class="manager-iterative-step-ends" data-iterative-step-part="ends">
    <div>
      <Kicker>{text('FABRICATE.Admin.Manager.Recipe.Iterative.EndsHeading', 'Ends when')}</Kicker>
      <p class="manager-muted">
        {text(
          'FABRICATE.Admin.Manager.Recipe.Iterative.EndsNote',
          'Checked after every session. Success is checked first.'
        )}
      </p>
    </div>
    {#each ENDS as end (end.key)}
      <div class="manager-iterative-step-end" data-iterative-step-end={end.key}>
        <div class="manager-iterative-step-end-head">
          <i class={`${end.icon} is-${end.key}`} aria-hidden="true"></i>
          <Kicker as="span">{say(end.title)}</Kicker>
          <span class="manager-iterative-step-end-sub">{say(end.sub)}</span>
        </div>
        <CounterRuleList
          rules={config[end.key]}
          counterSources={sources}
          counterNames={libraryCounters}
          sourceScope="step"
          actions={ruleActions}
          combineControl={false}
          joiner={end.joiner}
          adderLabel={text('FABRICATE.Admin.Manager.Recipe.Iterative.AddCondition', 'Condition')}
          emptyText={say(end.empty)}
          ariaLabel={say(end.list)}
          {text}
          onChange={({ rules }) => onChange({ ...config, [end.key]: rules })}
        />
      </div>
    {/each}
  </div>
</div>

<style>
  .manager-iterative-step-config {
    display: grid;
    gap: var(--fab-space-4);
    min-width: 0;
  }

  .manager-iterative-step-ends,
  .manager-iterative-step-end {
    display: grid;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-iterative-step-end-head {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
  }

  .manager-iterative-step-end-head .is-success {
    color: var(--fab-success-text);
  }

  .manager-iterative-step-end-head .is-failure {
    color: var(--fab-danger-text);
  }

  .manager-iterative-step-end-sub {
    color: var(--fab-text-muted);
    font-size: 0.66rem;
  }
</style>
