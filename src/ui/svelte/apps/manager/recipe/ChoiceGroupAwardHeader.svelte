<!-- Svelte 5 runes mode -->
<!--
  A result-side choice group's header, read left to right as one sentence: how many it awards, N
  under up to N, the repeats setting under up to N by roll, then who chooses; under a roll, the
  selection expression on a second line; and a help line restating the cell, which describes the
  group. A setting the cell cannot use is absent, never inert, and no pill restates a value.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `group` | a choice group's draft `Result` | `{}` | Read for its chooser, strategy, N, repeats and selection; written through `resultGroupEdits.js`. |
  | `class` | class string | `''` | Appended to the root's own. |

  Callbacks:
  - `onChange(group)` — the whole next group.

  Rest spread:
  - `{...rest}` lands on the root, written after `class`.

  Invariants:
  - The repeats button's slot is as wide as its wider word, so toggling it moves nothing after it.
-->
<script module>
  // Minted per instance: the help line's and the selection caption's ids, and the chooser's radios.
  let headerSeq = 0;
</script>

<script>
  import Button from '../../../components/Button.svelte';
  import SegmentedControl from '../../../components/SegmentedControl.svelte';
  import Select from '../../../components/Select.svelte';
  import { localizeOr } from '../../../util/localizeOr.js';
  import RollDataExpressionInput from '../RollDataExpressionInput.svelte';
  import PickerRowAmount from './PickerRowAmount.svelte';
  import {
    MIN_AWARD_COUNT,
    chooserOf,
    strategyOf,
    withChooser,
    withCount,
    withRepeats,
    withSelection,
    withStrategy,
  } from './resultGroupEdits.js';
  import { resultAmountInvalid } from './resultRows.js';

  let { group = {}, class: className = '', onChange = () => {}, ...rest } = $props();

  headerSeq += 1;
  const instance = headerSeq;
  // An edit that changes nothing, a re-picked strategy, emits nothing.
  const emit = (next) => next !== group && onChange(next);
  const helpId = `fabricate-award-help-${instance}`;
  const selectionId = `fabricate-award-selection-${instance}`;

  const chooser = $derived(chooserOf(group));
  const strategy = $derived(strategyOf(group));
  const upTo = $derived(strategy === 'upTo');
  const rolled = $derived(chooser === 'rolled');
  const repeats = $derived(rolled && upTo && group?.withReplacement === true);
  const count = $derived(group?.awardCountFormula || group?.awardCount || MIN_AWARD_COUNT);

  const strategies = $derived([
    {
      value: 'anyOne',
      label: localizeOr('FABRICATE.Admin.Manager.Recipe.ChoiceGroup.AnyOneOf', 'Any one of'),
    },
    {
      value: 'upTo',
      label: localizeOr('FABRICATE.Admin.Manager.Recipe.ChoiceGroup.UpToOf', 'Up to N of'),
    },
  ]);
  const CHOOSERS = [
    {
      value: 'playerChooses',
      labelKey: 'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.PlayerChooses',
      fallback: 'Player chooses',
    },
    {
      value: 'rolled',
      labelKey: 'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.Rolled',
      fallback: 'Rolled',
    },
  ];

  // The help line, one literal key per cell, so the prose never restates a setting the cell lacks.
  const HELP = {
    'playerChooses:anyOne': [
      'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.HelpPlayerAnyOne',
      'The player picks one of these when the result is awarded.',
    ],
    'playerChooses:upTo': [
      'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.HelpPlayerUpTo',
      'The player picks up to {count} of these when the result is awarded.',
    ],
    'rolled:anyOne': [
      'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.HelpRolledAnyOne',
      'The selection roll decides which one is awarded.',
    ],
    'rolled:upTo': [
      'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.HelpRolledUpTo',
      'Awards up to {count} of these, rolling the selection once per award, and none twice.',
    ],
    'rolled:repeats': [
      'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.HelpRolledRepeats',
      'Awards {count} of these, rolling the selection once per award, so the same one may come up twice.',
    ],
  };
  const help = $derived.by(() => {
    const [key, fallback] = HELP[repeats ? 'rolled:repeats' : `${chooser}:${strategy}`];
    return localizeOr(key, fallback, { count });
  });

  const countValue = $derived({
    // The amount slot toggles a counted kind only; N is counted.
    kind: 'component',
    quantity: group?.awardCount ?? MIN_AWARD_COUNT,
    quantityFormula: group?.awardCountFormula,
  });
  const countInvalid = $derived(
    resultAmountInvalid({ quantityFormula: group?.awardCountFormula }, localizeOr).amount ?? ''
  );
  const selectionInvalid = $derived(
    resultAmountInvalid({ quantityFormula: group?.selectionFormula }, localizeOr).amount ?? ''
  );
</script>

<div
  class={['manager-recipe-award-header', className].filter(Boolean).join(' ')}
  role="group"
  aria-label={localizeOr(
    'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.Settings',
    'How this choice group awards'
  )}
  aria-describedby={helpId}
  data-recipe-group-header
  {...rest}
>
  <div class="manager-recipe-award-line">
    <Select
      class="manager-recipe-award-strategy"
      size="inline"
      value={strategy}
      options={strategies}
      ariaLabel={localizeOr(
        'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.StrategyLabel',
        'How many it awards'
      )}
      triggerProps={{ 'data-recipe-group-strategy': '' }}
      onChange={(next) => emit(withStrategy(group, next))}
    />
    {#if upTo}
      <span class="manager-recipe-option-controls manager-recipe-award-count">
        <PickerRowAmount
          value={countValue}
          rollable
          invalid={countInvalid}
          amount={{
            min: MIN_AWARD_COUNT,
            ariaLabel: localizeOr(
              'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.CountLabel',
              'How many it awards at most'
            ),
            modeAriaLabel: localizeOr(
              'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.CountModeLabel',
              'Fixed or rolled count'
            ),
            formulaAriaLabel: localizeOr(
              'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.CountFormulaLabel',
              'Rolled count'
            ),
            inputProps: { 'data-recipe-group-count': '' },
          }}
          onChange={(patch) => onChange(withCount(group, patch))}
        />
      </span>
      {#if rolled}
        <Button
          class="manager-recipe-award-repeats"
          data-recipe-group-repeats={repeats ? 'repeats' : 'unique'}
          title={repeats
            ? localizeOr(
                'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.UniqueHint',
                'Award each alternative at most once.'
              )
            : localizeOr(
                'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.RepeatsHint',
                'Let the same alternative be awarded more than once.'
              )}
          onclick={() => onChange(withRepeats(group, !repeats))}
        >
          <span class="manager-recipe-award-repeats-words">
            <span class:is-shown={!repeats} aria-hidden={repeats ? 'true' : undefined}
              >{localizeOr('FABRICATE.Admin.Manager.Recipe.ChoiceGroup.Unique', 'Unique')}</span
            >
            <span class:is-shown={repeats} aria-hidden={repeats ? undefined : 'true'}
              >{localizeOr(
                'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.RepeatsAllowed',
                'Repeats allowed'
              )}</span
            >
          </span>
        </Button>
      {/if}
    {/if}
    <span class="manager-recipe-award-spacer" aria-hidden="true"></span>
    <SegmentedControl
      options={CHOOSERS}
      value={chooser}
      density="inline"
      groupName={`award-chooser-${instance}`}
      ariaLabel={localizeOr(
        'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.ChooserLabel',
        'Who chooses'
      )}
      optionDataAttr="data-recipe-group-chooser"
      onChange={(next) => onChange(withChooser(group, next))}
    />
  </div>
  {#if rolled}
    <div class="manager-recipe-award-line">
      <span class="manager-recipe-award-caption" id={selectionId}
        >{localizeOr('FABRICATE.Admin.Manager.Recipe.ChoiceGroup.Selection', 'Selection')}</span
      >
      <span class="manager-recipe-option-controls">
        <RollDataExpressionInput
          sigil={false}
          value={group?.selectionFormula ?? ''}
          placeholder="1d20"
          inputAttrs={{
            'data-recipe-option-formula': '',
            'data-recipe-group-selection': '',
            'aria-labelledby': selectionId,
            title: localizeOr(
              'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.SelectionHint',
              'Rolled against the crafting character once per award; its total picks the alternative whose range holds it.'
            ),
            ...(selectionInvalid && {
              'aria-invalid': 'true',
              'aria-describedby': `${selectionId}-problem`,
            }),
          }}
          onChange={(formula) => onChange(withSelection(group, formula))}
        />
        {#if selectionInvalid}
          <span id={`${selectionId}-problem`} class="manager-recipe-option-invalid"
            >{selectionInvalid}</span
          >
        {/if}
      </span>
    </div>
  {/if}
  <p class="manager-muted manager-recipe-award-help" id={helpId} data-recipe-group-help>{help}</p>
</div>

<style>
  .manager-recipe-award-repeats-words {
    display: inline-grid;
  }

  .manager-recipe-award-repeats-words > span {
    grid-area: 1 / 1;
    visibility: hidden;
  }

  .manager-recipe-award-repeats-words > .is-shown {
    visibility: visible;
  }
</style>
