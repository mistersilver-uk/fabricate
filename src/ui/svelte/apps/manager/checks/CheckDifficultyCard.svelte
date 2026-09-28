<!-- Svelte 5 runes mode -->
<!--
  DIFFICULTY — the number the roll is measured against, and where it comes from. ITS OWN CARD
  because the formula card answers "what is rolled" and this answers "what is it measured
  against"; the second question inside the first card reads as part of the formula.

  `showDcSource` IS A MODEL FACT, NOT A PREFERENCE: the static/dynamic chooser writes `dcMode`
  and `macroUuid`, which only the SIMPLE check slot carries, so a routed check gets the same card
  with `BASE DC` and `COMPARISON` alone rather than a chooser that cannot choose. The record noun
  is a PROP, hard-coding one activity's word being how a gathering screen talks about recipes.

  The target source (issue 2005) is a fixed DC or a character value that difficulty adjusts. Every
  switch writes only its own field, so the inactive source's DC, expression and adjustments survive
  a round trip. `character` is the Preview-as actor, `{ name, rollData }`.
-->
<script>
  import { normalizeCheckEvaluation } from '../../../../../systems/normalize/checkEvaluation.js';
  import { localize } from '../../../util/foundryBridge.js';
  import RollDataExpressionInput from '../RollDataExpressionInput.svelte';
  import {
    MULTIPLIER_STOPS,
    formatCheckAdjustment,
    parseCheckAdjustment,
  } from './checkAdjustmentLabel.js';
  import { interpolate, underComparisonPhrase } from './checksCopy.js';
  import { targetValueStatus } from './checkTargetStatus.js';
  import RadioCardGroup from '../../../components/RadioCardGroup.svelte';
  import SegmentedControl from '../../../components/SegmentedControl.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';

  let {
    dc = 15,
    thresholdMode = 'meet',
    dcMode = 'static',
    showDcSource = false,
    recordNoun = 'recipe',
    evaluation = null,
    character = null,
    onChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  /**
   * A sentence with `{record}` filled in, resolved BEFORE it reaches `RadioCardGroup`: that
   * primitive takes no interpolation data, so a placeholder handed to it as a KEY renders the
   * literal braces in every world that HAS the key — the fallback path looking right and the
   * localized path not.
   */
  function sentence(key, fallback) {
    return interpolate(text(key, fallback), { record: recordNoun });
  }

  const comparison = $derived(thresholdMode === 'exceed' ? 'exceed' : 'meet');
  const resolvedDcMode = $derived(dcMode === 'dynamic' ? 'dynamic' : 'static');
  const normalized = $derived(normalizeCheckEvaluation(evaluation));
  const under = $derived(normalized.direction === 'under');
  const attribute = $derived(normalized.target.source === 'attribute');
  const adjustmentKind = $derived(normalized.target.adjustmentKind);

  const cmp = $derived(underComparisonPhrase(comparison, text));

  function emitEvaluation(patch) {
    onChange({ evaluation: { ...normalized, ...patch } });
  }

  function emitTarget(patch) {
    emitEvaluation({ target: { ...normalized.target, ...patch } });
  }

  const SOURCE_OPTIONS = [
    {
      value: 'fixed',
      icon: 'fas fa-hashtag',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Evaluation.SourceFixed',
      fallback: 'Fixed difficulty',
      descKey: 'FABRICATE.Admin.Manager.Checks.Evaluation.SourceFixedDesc',
      descFallback: 'The same number for every character, set here and per recipe tier.',
    },
    {
      value: 'attribute',
      icon: 'fas fa-user',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Evaluation.SourceAttribute',
      fallback: 'Character value',
      descKey: 'FABRICATE.Admin.Manager.Checks.Evaluation.SourceAttributeDesc',
      descFallback:
        'Read from the crafting character. Difficulty adjusts it rather than replacing it.',
    },
  ];

  const KIND_OPTIONS = [
    {
      value: 'add',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Evaluation.KindAdd',
      fallback: 'Add a number',
    },
    {
      value: 'multiply',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Evaluation.KindMultiply',
      fallback: 'Multiply, rounded down',
    },
  ];

  const lead = $derived.by(() => {
    if (attribute) {
      return under
        ? text(
            'FABRICATE.Admin.Manager.Checks.Evaluation.LeadAttributeUnder',
            'The character value the roll must stay {cmp}, and how difficulty adjusts it.'
          ).replaceAll('{cmp}', cmp)
        : text(
            'FABRICATE.Admin.Manager.Checks.Evaluation.LeadAttributeOver',
            'The character value the roll must reach, and how difficulty adjusts it.'
          );
    }
    if (under) {
      return text(
        'FABRICATE.Admin.Manager.Checks.Evaluation.LeadFixedUnder',
        'The number the roll must stay {cmp}, and where that number comes from.'
      ).replaceAll('{cmp}', cmp);
    }
    return text(
      'FABRICATE.Admin.Manager.Checks.Crafting.DifficultyLead',
      'The number the roll is measured against, and where that number comes from.'
    );
  });

  // The two icons are literally what the DC is: an authored number, or a script FILE that
  // returns one — the thing dropped on the card below being a Macro document.
  const DC_MODE_OPTIONS = $derived([
    {
      value: 'static',
      icon: 'fas fa-hashtag',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.DcStatic',
      fallback: 'Static',
      description: attribute
        ? text(
            'FABRICATE.Admin.Manager.Checks.Evaluation.AdjustmentStaticDesc',
            'A base adjustment here, with one per recipe tier.'
          )
        : sentence(
            'FABRICATE.Admin.Manager.Checks.Crafting.DcStaticDesc',
            'A fixed DC for every {record}, with optional named difficulty tiers.'
          ),
    },
    {
      value: 'dynamic',
      icon: 'fas fa-file-code',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.DcDynamic',
      fallback: 'Dynamic',
      description: dynamicDescription(),
    },
  ]);

  function dynamicDescription() {
    if (!attribute) {
      return sentence(
        'FABRICATE.Admin.Manager.Checks.Crafting.DcDynamicDesc',
        'A macro computes the DC from the ingredients, the {record} and the actor.'
      );
    }
    return under
      ? text(
          'FABRICATE.Admin.Manager.Checks.Evaluation.AdjustmentDynamicUnderDesc',
          'A macro receives the computed target and returns the one to roll under.'
        )
      : text(
          'FABRICATE.Admin.Manager.Checks.Evaluation.AdjustmentDynamicOverDesc',
          'A macro receives the computed target and returns the one to reach.'
        );
  }

  const dcLabel = $derived.by(() => {
    if (attribute) {
      return text('FABRICATE.Admin.Manager.Checks.Evaluation.BaseAdjustment', 'Base adjustment');
    }
    return under
      ? text('FABRICATE.Admin.Manager.Checks.Evaluation.Target', 'Target')
      : text('FABRICATE.Admin.Manager.Checks.Crafting.BaseDc', 'Base DC');
  });

  const COMPARISON_OVER = [
    {
      value: 'meet',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ThresholdMeet',
      fallback: 'Meet or exceed',
    },
    {
      value: 'exceed',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ThresholdExceed',
      fallback: 'Strictly exceed',
    },
  ];
  const COMPARISON_UNDER = [
    {
      value: 'meet',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Evaluation.ComparisonUnderMeet',
      fallback: 'At or under',
    },
    {
      value: 'exceed',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Evaluation.ComparisonUnderExceed',
      fallback: 'Strictly under',
    },
  ];
  const COMPARISON_OPTIONS = $derived(under ? COMPARISON_UNDER : COMPARISON_OVER);

  // What the character value resolves to for the Preview-as actor, never read as zero.
  const expression = $derived(normalized.target.expression);
  const resolution = $derived(targetValueStatus(expression, character, text));
  const uid = $props.id();
  const hintId = `${uid}-target-expression-hint`;
  const resolutionId = `${uid}-target-resolution`;

  const formatAdjustment = (value) => formatCheckAdjustment(adjustmentKind, value);
  const parseAdjustment = (value) => parseCheckAdjustment(adjustmentKind, value);
</script>

<InspectorCard class="manager-checks-card" data-check-difficulty-card="">
  <div class="manager-checks-card-head">
    <div>
      <h3 class="manager-checks-card-title">
        {text('FABRICATE.Admin.Manager.Checks.Crafting.DifficultyTitle', 'Difficulty')}
      </h3>
      <p class="manager-checks-card-description">
        {lead}
      </p>
    </div>
  </div>
  <div class="manager-checks-card-body">
    <RadioCardGroup
      legendKey="FABRICATE.Admin.Manager.Checks.Evaluation.SourceTitle"
      legend="What the roll is measured against"
      legendVisible
      options={SOURCE_OPTIONS}
      selectedValue={normalized.target.source}
      groupName="check-target-source"
      columns={2}
      optionDataAttr="data-check-target-source-option"
      onChange={(next) => {
        if (next !== normalized.target.source) emitTarget({ source: next });
      }}
    />

    {#if showDcSource}
      <!-- The target source leads the card, ruled off from the choice it governs. -->
      <div class="manager-checks-difficulty-rule" aria-hidden="true"></div>
      <RadioCardGroup
        legendKey={attribute
          ? 'FABRICATE.Admin.Manager.Checks.Evaluation.AdjustmentSourceTitle'
          : 'FABRICATE.Admin.Manager.Checks.Evaluation.NumberSourceTitle'}
        legend={attribute ? 'How the adjustment is set' : 'How the number is set'}
        legendVisible
        options={DC_MODE_OPTIONS}
        selectedValue={resolvedDcMode}
        groupName="check-dc-mode"
        columns={2}
        optionDataAttr="data-dc-mode-option"
        onChange={(next) => {
          if (next !== resolvedDcMode) onChange({ dcMode: next });
        }}
      />
    {/if}

    {#if attribute}
      <div class="manager-checks-difficulty-fields" data-check-attribute-fields>
        <div class="manager-checks-difficulty-field is-expression">
          <span class="manager-checks-difficulty-label">
            {text('FABRICATE.Admin.Manager.Checks.Evaluation.SourceAttribute', 'Character value')}
          </span>
          <RollDataExpressionInput
            sigil={false}
            dataField="check-target-expression"
            inputAttrs={{
              'data-check-target-expression': '',
              'data-validation-target': 'checks-target-expression',
              'aria-label': text(
                'FABRICATE.Admin.Manager.Checks.Evaluation.SourceAttribute',
                'Character value'
              ),
              'aria-describedby': resolution ? `${hintId} ${resolutionId}` : hintId,
            }}
            value={expression}
            placeholder="@skills.craft.value"
            onChange={(next) => emitTarget({ expression: next })}
          />
          <!-- The path syntax stays the field's description for assistive tech; the prototype
               draws only the live reading beneath the field. -->
          <small class="visually-hidden" id={hintId} data-check-target-expression-hint>
            {text(
              'FABRICATE.Admin.Manager.Checks.Evaluation.ValueHint',
              'A character path with its leading @, or arithmetic on paths without dice, such as @skills.craft.value - 2.'
            )}
          </small>
          {#if resolution}
            <small
              class="manager-muted"
              id={resolutionId}
              data-check-target-resolution={resolution.tone}>{resolution.text}</small
            >
          {/if}
        </div>
        <div class="manager-checks-difficulty-field is-comparison">
          <span class="manager-checks-difficulty-label">
            {text('FABRICATE.Admin.Manager.Checks.Evaluation.KindTitle', 'Difficulty adjustment')}
          </span>
          <SegmentedControl
            fill
            density="field"
            options={KIND_OPTIONS}
            value={adjustmentKind}
            groupName="check-adjustment-kind"
            ariaLabel={text(
              'FABRICATE.Admin.Manager.Checks.Evaluation.KindTitle',
              'Difficulty adjustment'
            )}
            dataAttr="data-check-adjustment-kind"
            optionDataAttr="data-check-adjustment-kind-option"
            onChange={(next) => emitTarget({ adjustmentKind: next })}
          />
        </div>
      </div>
    {/if}

    <!-- The two number fields under the chooser. `<div>`s rather than `<label>`s: see the NAMING
         contract in `Stepper.svelte` — both controls carry their own accessible name, and a
         wrapping label would give the stepper two. -->
    <div class="manager-checks-difficulty-fields">
      <div class="manager-checks-difficulty-field is-dc">
        <span class="manager-checks-difficulty-label">{dcLabel}</span>
        {#if attribute}
          <!-- Keyed by kind, so a switch re-reads the kept value through the other formatter. -->
          {#key adjustmentKind}
            <Stepper
              fill
              allowUnset
              value={normalized.target.baseAdjustment}
              placeholder="—"
              formatValue={formatAdjustment}
              parseValue={parseAdjustment}
              stops={adjustmentKind === 'multiply' ? MULTIPLIER_STOPS : []}
              {...stepperLabels(dcLabel)}
              inputProps={{ 'data-check-base-adjustment': '' }}
              onChange={(next) => emitTarget({ baseAdjustment: next })}
            />
          {/key}
        {:else}
          <!-- `fill` so the stepper takes the field's track and the shared height rather than
               sitting in it as a narrower inline island. `min={0}`: a check DC below zero is not a
               DC, and the live `−` adjunct would otherwise reach -1. -->
          <Stepper
            fill
            min={0}
            value={dc ?? 15}
            {...stepperLabels(dcLabel)}
            inputProps={{ 'data-check-dc': '' }}
            onChange={(next) => onChange({ dc: next })}
          />
        {/if}
      </div>
      <div class="manager-checks-difficulty-field is-comparison">
        <span class="manager-checks-difficulty-label">
          {text('FABRICATE.Admin.Manager.Checks.Crafting.ThresholdComparison', 'Comparison')}
        </span>
        <!-- A SEGMENTED CONTROL rather than a `<select>`: two options is not a list to open, both
             readings are on screen at once, and the one in force is lit. -->
        <SegmentedControl
          fill
          density="field"
          options={COMPARISON_OPTIONS}
          value={comparison}
          groupName="check-threshold-mode"
          ariaLabel={text(
            'FABRICATE.Admin.Manager.Checks.Crafting.ThresholdComparison',
            'Comparison'
          )}
          dataAttr="data-threshold-mode"
          optionDataAttr="data-threshold-mode-option"
          onChange={(next) => onChange({ thresholdMode: next })}
        />
      </div>
    </div>
  </div>
</InspectorCard>

<style>
  /* The rule between the two option-card groups, on the gap the fields below keep from a chooser. */
  .manager-checks-difficulty-rule {
    margin: var(--fab-space-3) 0;
    border-top: 1px solid var(--fab-border);
  }

  /* Each group's visible name takes the card's micro-label style. */
  .manager-checks-card-body :global(.manager-resolution-mode-legend) {
    color: var(--fab-text-subtle);
    font-size: 8.5px;
    letter-spacing: 0.08em;
  }

  /* The character value and its adjustment kind share one row: the path takes the room, the kind
     a fixed column. */
  .manager-checks-difficulty-fields[data-check-attribute-fields] {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    align-items: start;
  }

  .manager-checks-difficulty-fields[data-check-attribute-fields]
    + .manager-checks-difficulty-fields {
    margin-top: var(--fab-space-3);
  }

  [data-check-attribute-fields] small {
    font-size: 10px;
    font-weight: 500;
    line-height: 1.45;
  }

  [data-check-target-resolution='muted'] {
    color: var(--fab-text-subtle);
  }

  [data-check-target-resolution='resolved'] {
    color: var(--fab-text-secondary);
  }

  [data-check-target-resolution='unresolved'] {
    color: var(--fab-danger-text);
  }
</style>
