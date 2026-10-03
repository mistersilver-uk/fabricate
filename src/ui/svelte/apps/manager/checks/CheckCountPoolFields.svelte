<!-- Svelte 5 runes mode -->
<!--
  The structured pool a counting check rolls instead of a typed formula (issue 2006): die, base
  pool, success threshold and per-die test, explode, cancel, where bonuses land and the zero-pool
  rule, then the composed roll and its expected successes, then the additional-dice group (issue 2008).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `evaluation` | normalized evaluation | — | Every control writes `{ evaluation }` with one pool field changed. |
  | `thresholdMode` | `'meet'` \| `'exceed'` \| `null` | `null` | Under count it is the per-die test, edited only here, on every slot (issue 2067); `null` offers no test. |
  | `character` | `{ name, rollData, readStored }` \| `null` | `null` | The Preview-as actor the value fields and the actor line read. |
  | `modifiers` | `[{ id, name, icon }]` | `[]` | The applied modifiers, drawn as chips on the term they move. |
  | `placement` / `odds` | placement plan / odds model \| `null` | `null` | The preview's own placement and odds model; the reading is the odds panel's expected net. |

  Callbacks:
  - `onChange(patch)` — `{ evaluation }` or `{ thresholdMode }`.

  Invariants:
  - Each control writes one field. Steppers bound editing only: a stored value outside them shows
    as stored, and a `from` face is seeded, never written null —
    `tests/components/check-count-authoring-mounted.test.js`.
-->
<script>
  import { extremeFace } from '../../../../../systems/countEvaluation.js';
  import Select from '../../../components/Select.svelte';
  import SegmentedControl from '../../../components/SegmentedControl.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import { localize } from '../../../util/foundryBridge.js';
  import CheckAdditionalDiceFields from './CheckAdditionalDiceFields.svelte';
  import CheckCountInputField from './CheckCountInputField.svelte';
  import CheckCountInset from './CheckCountInset.svelte';
  import {
    COUNT_DESTINATION_OPTIONS,
    COUNT_REPEAT_OPTIONS,
    countTestOptions,
  } from './countPoolOptions.js';

  let {
    evaluation,
    thresholdMode = null,
    character = null,
    modifiers = [],
    placement = null,
    odds = null,
    onChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const pool = $derived(evaluation.pool);
  const under = $derived(evaluation.direction === 'under');
  const best = $derived(extremeFace(pool.die, evaluation.direction));
  const worst = $derived(extremeFace(pool.die, under ? 'over' : 'under'));

  function emitPool(patch) {
    onChange({ evaluation: { ...evaluation, pool: { ...pool, ...patch } } });
  }

  const DIES = [4, 6, 8, 10, 12, 20, 100];
  const dieOptions = $derived(
    [...new Set([...DIES, pool.die])]
      .toSorted((a, b) => a - b)
      .map((die) => ({ value: String(die), label: `d${die}` }))
  );

  const TEST_OPTIONS = $derived(countTestOptions(under));
  // Spelled out, so each hook a test or capture names is greppable in source.
  const FACE_HOOKS = {
    explode: 'data-check-count-explode-face',
    cancel: 'data-check-count-cancel-face',
  };

  // Off / the extreme face / From a face: three peer choices, the Validation target on the active one.
  function faceOptions(rule, extremeKey, extremeFallback, face, target) {
    const active = faceChoice(rule);
    const options = [
      { value: 'off', labelKey: 'FABRICATE.Admin.Manager.Checks.Count.FaceOff', fallback: 'Off' },
      { value: 'extreme', fallback: text(extremeKey, extremeFallback).replace('{face}', face) },
      {
        value: 'from',
        labelKey: 'FABRICATE.Admin.Manager.Checks.Count.FaceFrom',
        fallback: 'From a face',
      },
    ];
    return options.map((option) =>
      option.value === active ? { ...option, validationTarget: target } : option
    );
  }
  const faceChoice = (rule) => {
    if (!rule.enabled) return 'off';
    return rule.faces.kind === 'from' ? 'from' : 'extreme';
  };
  function chooseFace(key, extremeKind, seed, choice) {
    const rule = pool[key];
    if (choice === 'off') return emitPool({ [key]: { ...rule, enabled: false } });
    if (choice === 'extreme') {
      return emitPool({
        [key]: { ...rule, enabled: true, faces: { ...rule.faces, kind: extremeKind } },
      });
    }
    const value = rule.faces.value ?? seed;
    emitPool({ [key]: { ...rule, enabled: true, faces: { kind: 'from', value } } });
  }
  function setFace(key, next) {
    if (next === null) return;
    emitPool({ [key]: { ...pool[key], faces: { kind: 'from', value: next } } });
  }
  const sideWord = (above) =>
    above
      ? text('FABRICATE.Admin.Manager.Checks.Count.OrAbove', 'or above')
      : text('FABRICATE.Admin.Manager.Checks.Count.OrUnder', 'or under');

  const labels = $derived({
    base: text('FABRICATE.Admin.Manager.Checks.Count.BaseTitle', 'Base pool'),
    threshold: text('FABRICATE.Admin.Manager.Checks.Count.SuccessOnTitle', 'Success on'),
    explodeFace: text('FABRICATE.Admin.Manager.Checks.Count.ExplodeFace', 'Explode from face'),
    cancelFace: text('FABRICATE.Admin.Manager.Checks.Count.CancelFace', 'Cancel from face'),
    zero: text(
      'FABRICATE.Admin.Manager.Checks.Count.ZeroLabel',
      'A pool reduced to zero fails automatically'
    ),
  });
</script>

{#snippet row(title, hint, body, attr)}
  <div class="manager-checks-count-row" {...{ [attr]: '' }}>
    <div class="manager-checks-count-row-copy">
      <p class="manager-checks-count-row-title">{title}</p>
      {#if hint}<p class="manager-checks-count-row-hint">{hint}</p>{/if}
    </div>
    <div class="manager-checks-count-row-controls">{@render body()}</div>
  </div>
{/snippet}

{#snippet faceStepper(key, label, target, above)}
  <span class="manager-checks-count-face">
    <span class="manager-checks-count-stepper">
      <Stepper
        fill
        allowUnset
        placeholder="—"
        min={1}
        max={pool.die}
        value={pool[key].faces.value}
        {...stepperLabels(label)}
        inputProps={{ [FACE_HOOKS[key]]: '', 'data-validation-target': target }}
        onChange={(next) => setFace(key, next)}
      />
    </span>
    <span class="manager-checks-count-side">{sideWord(above)}</span>
  </span>
{/snippet}

{#snippet dieBody()}
  <span class="manager-checks-count-die">
    <Select
      size="inline"
      mono
      icon="fas fa-dice"
      value={String(pool.die)}
      options={dieOptions}
      ariaLabel={text('FABRICATE.Admin.Manager.Checks.Count.Die', 'Die')}
      triggerProps={{ 'data-check-count-die': '' }}
      onChange={(next) => emitPool({ die: Number(next) })}
    />
  </span>
{/snippet}

{#snippet baseBody()}
  <CheckCountInputField
    field="base"
    value={pool.base}
    min={0}
    max={20}
    label={labels.base}
    sourceLabel={text('FABRICATE.Admin.Manager.Checks.Count.BaseSource', 'Base pool source')}
    validationTarget="checks-count-base"
    {character}
    onChange={(next) => emitPool({ base: next })}
  />
{/snippet}

{#snippet thresholdBody()}
  <div class="manager-checks-count-stack">
    <div class="manager-checks-count-line">
      <CheckCountInputField
        field="threshold"
        value={pool.threshold}
        min={1}
        max={pool.die}
        label={labels.threshold}
        sourceLabel={text(
          'FABRICATE.Admin.Manager.Checks.Count.ThresholdSource',
          'Threshold source'
        )}
        validationTarget="checks-count-threshold"
        {character}
        onChange={(next) => emitPool({ threshold: next })}
      />
    </div>
    {#if thresholdMode !== null}
      <span class="manager-checks-count-mode">
        <SegmentedControl
          fill
          density="field"
          options={TEST_OPTIONS}
          value={thresholdMode === 'exceed' ? 'exceed' : 'meet'}
          groupName="check-count-test"
          ariaLabel={text('FABRICATE.Admin.Manager.Checks.Count.TestTitle', 'Per-die test')}
          data-check-count-test
          optionDataAttr="data-check-count-test-option"
          onChange={(next) => onChange({ thresholdMode: next })}
        />
      </span>
    {/if}
  </div>
{/snippet}

{#snippet explodeBody()}
  <span class="manager-checks-count-faces">
    <SegmentedControl
      fill
      density="field"
      options={faceOptions(
        pool.explode,
        'FABRICATE.Admin.Manager.Checks.Count.ExplodeBest',
        'Best face ({face})',
        best,
        'checks-count-explode'
      )}
      value={faceChoice(pool.explode)}
      groupName="check-count-explode"
      ariaLabel={text('FABRICATE.Admin.Manager.Checks.Count.ExplodeTitle', 'Explode')}
      data-check-count-explode
      optionDataAttr="data-check-count-explode-option"
      onChange={(next) => chooseFace('explode', 'best', best, next)}
    />
  </span>
  {#if faceChoice(pool.explode) === 'from'}
    {@render faceStepper('explode', labels.explodeFace, 'checks-count-explode-face', !under)}
  {/if}
  {#if pool.explode.enabled}
    <span class="manager-checks-count-repeat">
      <SegmentedControl
        fill
        density="field"
        options={COUNT_REPEAT_OPTIONS}
        value={pool.explode.once ? 'once' : 'keeps'}
        groupName="check-count-explode-repeat"
        ariaLabel={text('FABRICATE.Admin.Manager.Checks.Count.RepeatTitle', 'Explode repeat')}
        data-check-count-explode-repeat
        optionDataAttr="data-check-count-explode-repeat-option"
        onChange={(next) => emitPool({ explode: { ...pool.explode, once: next === 'once' } })}
      />
    </span>
  {/if}
{/snippet}

{#snippet cancelBody()}
  <span class="manager-checks-count-faces">
    <SegmentedControl
      fill
      density="field"
      options={faceOptions(
        pool.cancel,
        'FABRICATE.Admin.Manager.Checks.Count.CancelWorst',
        'Worst face ({face})',
        worst,
        'checks-count-cancel'
      )}
      value={faceChoice(pool.cancel)}
      groupName="check-count-cancel"
      ariaLabel={text('FABRICATE.Admin.Manager.Checks.Count.CancelTitle', 'Cancel')}
      data-check-count-cancel
      optionDataAttr="data-check-count-cancel-option"
      onChange={(next) => chooseFace('cancel', 'worst', worst, next)}
    />
  </span>
  {#if faceChoice(pool.cancel) === 'from'}
    {@render faceStepper('cancel', labels.cancelFace, 'checks-count-cancel-face', under)}
  {/if}
{/snippet}

{#snippet destinationBody()}
  <span class="manager-checks-count-faces">
    <SegmentedControl
      fill
      density="field"
      options={COUNT_DESTINATION_OPTIONS}
      value={pool.modifierDestination}
      groupName="check-count-destination"
      ariaLabel={text(
        'FABRICATE.Admin.Manager.Checks.Count.DestinationTitle',
        'Modifiers and bonuses'
      )}
      data-check-count-destination
      optionDataAttr="data-check-count-destination-option"
      onChange={(next) => emitPool({ modifierDestination: next })}
    />
  </span>
{/snippet}

{#snippet zeroBody()}
  <span class="manager-checks-count-zero">
    <span class="manager-checks-count-zero-label">{labels.zero}</span>
    <StatusToggle
      on={pool.zeroPoolFails}
      ariaLabel={labels.zero}
      data-check-count-zero-pool=""
      onclick={() => emitPool({ zeroPoolFails: !pool.zeroPoolFails })}
    />
  </span>
{/snippet}

<div class="manager-checks-count-fields" data-check-count-fields>
  {@render row(
    text('FABRICATE.Admin.Manager.Checks.Count.Die', 'Die'),
    '',
    dieBody,
    'data-check-count-row-die'
  )}
  {@render row(
    labels.base,
    text('FABRICATE.Admin.Manager.Checks.Count.BaseHint', 'How many dice are rolled.'),
    baseBody,
    'data-check-count-row-base'
  )}
  {@render row(
    labels.threshold,
    text('FABRICATE.Admin.Manager.Checks.Count.SuccessOnHint', 'What each die must roll to count.'),
    thresholdBody,
    'data-check-count-row-threshold'
  )}
  {@render row(
    text('FABRICATE.Admin.Manager.Checks.Count.ExplodeTitle', 'Explode'),
    text(
      'FABRICATE.Admin.Manager.Checks.Count.ExplodeHint',
      'A die showing this face is rolled again and both count.'
    ),
    explodeBody,
    'data-check-count-row-explode'
  )}
  {@render row(
    text('FABRICATE.Admin.Manager.Checks.Count.CancelTitle', 'Cancel'),
    text(
      'FABRICATE.Admin.Manager.Checks.Count.CancelHint',
      'A die showing this face removes one success.'
    ),
    cancelBody,
    'data-check-count-row-cancel'
  )}
  {@render row(
    text('FABRICATE.Admin.Manager.Checks.Count.DestinationTitle', 'Modifiers and bonuses'),
    text('FABRICATE.Admin.Manager.Checks.Count.DestinationHint', 'Where a +N lands on this roll.'),
    destinationBody,
    'data-check-count-row-destination'
  )}
  {@render row(
    text('FABRICATE.Admin.Manager.Checks.Count.ZeroTitle', 'Zero pool'),
    '',
    zeroBody,
    'data-check-count-row-zero'
  )}
</div>

<CheckCountInset {evaluation} {thresholdMode} {character} {modifiers} {placement} {odds} />

<CheckAdditionalDiceFields
  additionalDice={pool.additionalDice}
  {character}
  onChange={(next) => emitPool({ additionalDice: next })}
/>

<style>
  /* The prototype's settings rows: a 150px label-and-hint column, controls beside it, ruled off. */
  .manager-checks-count-row {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    gap: var(--fab-space-3);
    align-items: start;
    padding: var(--fab-space-3) 0;
    border-top: 1px solid var(--fab-border);
  }

  .manager-checks-count-row:first-child {
    padding-top: 0;
    border-top: 0;
  }

  .manager-checks-count-row-title {
    margin: 0;
    padding-top: var(--fab-space-2);
    color: var(--fab-text);
    font-size: 11.5px;
    font-weight: 600;
  }

  .manager-checks-count-row-hint {
    margin: var(--fab-space-2xs) 0 0;
    color: var(--fab-text-subtle);
    font-size: 10px;
    line-height: 1.45;
  }

  .manager-checks-count-row-controls,
  .manager-checks-count-line,
  .manager-checks-count-face,
  .manager-checks-count-zero {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-checks-count-line {
    align-items: flex-start;
  }

  .manager-checks-count-stack {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-checks-count-mode {
    width: 230px;
    max-width: 100%;
  }

  .manager-checks-count-faces {
    width: 330px;
    max-width: 100%;
  }

  .manager-checks-count-repeat {
    width: 220px;
    max-width: 100%;
  }

  .manager-checks-count-die {
    width: 120px;
  }

  /* The Difficulty card's stepper rung: two 26px adjuncts round the value, at the field height. */
  .manager-checks-count-stepper {
    --fab-stepper-fill-height: 30px;

    width: 96px;
  }

  .manager-checks-count-side {
    color: var(--fab-text-muted);
    font-size: 10.5px;
    font-weight: 500;
  }

  .manager-checks-count-zero {
    flex: 1 1 auto;
    flex-wrap: nowrap;
  }

  .manager-checks-count-zero-label {
    flex: 1 1 auto;
    color: var(--fab-text-secondary);
    font-size: 11.5px;
    font-weight: 500;
  }
</style>
