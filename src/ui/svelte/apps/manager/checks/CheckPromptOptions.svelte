<!-- Svelte 5 runes mode -->
<!--
  `In the roll prompt`: what a player may change before the dice are rolled, rendered once inside
  the Formula card as a group named by its title. The situational-bonus offer is a display flag only; `allowsSituationalModifier`
  stays the runtime's authority gate. `extra` is the slot later prompt options extend. A counting
  check passes its `destination`, `pool` or `threshold`, and the offer's help follows it (issue 2006).
  Below the offer sits the check's advantage rule (issue 2007): the mode, extra dice, bonus
  expression and disadvantage offer when summing, the offer and its dice when counting. Each control
  writes the whole normalized `advantage` record through `onAdvantageChange`, one key changed.
-->
<script>
  import { normalizeCheckAdvantage } from '../../../../../systems/normalize/checkAdvantage.js';
  import { findKeepGroup } from '../../../../../utils/craftingCheckExpression.js';
  import SegmentedControl from '../../../components/SegmentedControl.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import Field from '../../../components/Field.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import {
    advantageModeNote,
    bonusExpressionHelp,
    countAdvantageHint,
    disadvantageHint,
    keepWords,
    parseKeepTotal,
  } from './checkAdvantageCopy.js';

  let {
    offer = true,
    direction = 'over',
    destination = null,
    counting = false,
    advantage = null,
    rollFormula = '',
    extra = undefined,
    onChange = () => {},
    onAdvantageChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const uid = $props.id();
  const titleId = `${uid}-prompt-options-title`;
  const offered = $derived(offer !== false);
  const title = $derived(
    text('FABRICATE.Admin.Manager.Checks.Evaluation.OfferBonus', 'Offer a situational bonus')
  );
  const hint = $derived.by(() => {
    if (!offered) {
      return text(
        'FABRICATE.Admin.Manager.Checks.Evaluation.OfferBonusOff',
        'The prompt shows no bonus field.'
      );
    }
    if (destination === 'pool') {
      return text(
        'FABRICATE.Admin.Manager.Checks.Count.OfferPool',
        'The player can type a flat or rolled bonus, such as +2 or 1d4. It adds that many dice.'
      );
    }
    if (destination === 'threshold') {
      return text(
        'FABRICATE.Admin.Manager.Checks.Count.OfferThreshold',
        'The player can type a flat or rolled bonus, such as +2 or 1d4. It moves the threshold by that much.'
      );
    }
    return direction === 'under'
      ? text(
          'FABRICATE.Admin.Manager.Checks.Evaluation.OfferBonusUnder',
          'The player can type a flat or rolled bonus, such as +2 or 1d4. It raises the target.'
        )
      : text(
          'FABRICATE.Admin.Manager.Checks.Evaluation.OfferBonusOver',
          'The player can type a flat or rolled bonus, such as +2 or 1d4. It adds to the total.'
        );
  });

  const rule = $derived(normalizeCheckAdvantage(advantage));
  const under = $derived(direction === 'under');
  const group = $derived(findKeepGroup(rollFormula));
  const copy = $derived({ rule, group, under, text });
  const bonusHelp = $derived(bonusExpressionHelp(rule.bonusExpression, text));
  const bonusHelpId = `${uid}-advantage-bonus-help`;
  const modeTitle = $derived(
    text('FABRICATE.Admin.Manager.Checks.Advantage.ModeTitle', 'Advantage and disadvantage')
  );
  const MODE_OPTIONS = [
    { value: 'off', labelKey: 'FABRICATE.Admin.Manager.Checks.Advantage.ModeOff', fallback: 'Off' },
    {
      value: 'keep',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Advantage.ModeKeep',
      fallback: 'Roll extra, keep one',
    },
    {
      value: 'bonus',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Advantage.ModeBonus',
      fallback: 'Bonus die',
    },
  ];
  const modeOptions = $derived(
    MODE_OPTIONS.map((option) =>
      option.value === rule.mode ? { ...option, validationTarget: 'checks-advantage-mode' } : option
    )
  );
  const disadvantageTitle = $derived(
    text('FABRICATE.Admin.Manager.Checks.Advantage.OfferDisadvantage', 'Also offer disadvantage')
  );
  const countTitle = $derived(
    text('FABRICATE.Admin.Manager.Checks.Advantage.CountOffer', 'Offer advantage and disadvantage')
  );
  const countDiceTitle = $derived(
    text('FABRICATE.Admin.Manager.Checks.Advantage.CountDice', 'Dice added or removed')
  );
  const keepLabel = $derived(
    group.ok
      ? text('FABRICATE.Admin.Manager.Checks.Advantage.KeepLabel', 'Dice rolled for {die}').replace(
          '{die}',
          `d${group.faces}`
        )
      : ''
  );

  function writeAdvantage(key, next) {
    if (rule[key] === next) return;
    onAdvantageChange({ ...rule, [key]: next });
  }

  const formatKeep = (extraDice) => {
    const words = keepWords(group, extraDice);
    return `${words.total}${words.die}`;
  };
</script>

<div
  class="manager-checks-prompt-options"
  role="group"
  aria-labelledby={titleId}
  data-check-prompt-options
>
  <div class="manager-checks-prompt-options-head">
    <p class="manager-checks-prompt-options-title" id={titleId}>
      {text('FABRICATE.Admin.Manager.Checks.Evaluation.PromptTitle', 'In the roll prompt')}
    </p>
    <p class="manager-checks-prompt-options-hint">
      {text(
        'FABRICATE.Admin.Manager.Checks.Evaluation.PromptLead',
        'What the player can change before the dice are rolled.'
      )}
    </p>
  </div>
  <!-- A switch row inside the group rather than a nested card: the group is the one frame. -->
  <div class="manager-checks-prompt-options-row">
    <div class="manager-checks-prompt-options-copy">
      <p class="manager-checks-prompt-options-label">{title}</p>
      <p class="manager-checks-prompt-options-hint">{hint}</p>
    </div>
    <StatusToggle
      on={offered}
      ariaLabel={title}
      data-check-offer-situational-bonus=""
      onclick={() => onChange(!offered)}
    />
  </div>
  <div
    class="manager-checks-prompt-options-advantage"
    data-check-advantage={counting ? 'count' : 'sum'}
  >
    {#if counting}
      <div class="manager-checks-prompt-options-line">
        <div class="manager-checks-prompt-options-copy">
          <p class="manager-checks-prompt-options-label">{countTitle}</p>
          <p class="manager-checks-prompt-options-hint" data-check-advantage-count-hint>
            {countAdvantageHint(rule, text)}
          </p>
        </div>
        <StatusToggle
          on={rule.countEnabled}
          ariaLabel={countTitle}
          data-check-advantage-count=""
          onclick={() => writeAdvantage('countEnabled', !rule.countEnabled)}
        />
      </div>
      {#if rule.countEnabled}
        <div class="manager-checks-prompt-options-line">
          <span class="manager-checks-prompt-options-label is-sub is-grow">{countDiceTitle}</span>
          <span class="manager-checks-prompt-options-stepper">
            <Stepper
              fill
              min={1}
              max={5}
              value={rule.countDice}
              ariaLabel={countDiceTitle}
              decrementLabel={text(
                'FABRICATE.Admin.Manager.Checks.Advantage.CountDecrease',
                'Decrease dice added or removed'
              )}
              incrementLabel={text(
                'FABRICATE.Admin.Manager.Checks.Advantage.CountIncrease',
                'Increase dice added or removed'
              )}
              inputProps={{ 'data-check-advantage-count-dice': '' }}
              onChange={(next) => writeAdvantage('countDice', next)}
            />
          </span>
        </div>
      {/if}
    {:else}
      <div class="manager-checks-difficulty-field" data-check-advantage-mode-field>
        <span class="manager-checks-difficulty-label">{modeTitle}</span>
        <SegmentedControl
          fill
          density="field"
          options={modeOptions}
          value={rule.mode}
          groupName={`${uid}-advantage-mode`}
          ariaLabel={modeTitle}
          dataAttr="data-check-advantage-mode"
          optionDataAttr="data-check-advantage-mode-option"
          onChange={(next) => writeAdvantage('mode', next)}
        />
        <p class="manager-checks-prompt-options-hint is-note" data-check-advantage-note>
          {advantageModeNote(copy)}
        </p>
      </div>
      {#if rule.mode === 'keep' && group.ok}
        <div class="manager-checks-prompt-options-line">
          <span class="manager-checks-prompt-options-label is-sub is-grow">{keepLabel}</span>
          <span class="manager-checks-prompt-options-stepper">
            {#key `${group.number}d${group.faces}`}
              <Stepper
                fill
                min={1}
                max={4}
                value={rule.extraDice}
                formatValue={formatKeep}
                parseValue={(input) => parseKeepTotal(input, group)}
                ariaLabel={keepLabel}
                decrementLabel={text(
                  'FABRICATE.Admin.Manager.Checks.Advantage.KeepDecrease',
                  'Decrease dice rolled with advantage'
                )}
                incrementLabel={text(
                  'FABRICATE.Admin.Manager.Checks.Advantage.KeepIncrease',
                  'Increase dice rolled with advantage'
                )}
                inputProps={{ 'data-check-advantage-extra': '' }}
                onChange={(next) => writeAdvantage('extraDice', next)}
              />
            {/key}
          </span>
        </div>
      {/if}
      {#if rule.mode === 'bonus'}
        <Field as="label" class="manager-checks-difficulty-field">
          <span class="manager-checks-difficulty-label">
            {text('FABRICATE.Admin.Manager.Checks.Advantage.BonusTitle', 'Bonus expression')}
          </span>
          <input
            type="text"
            class="manager-checks-prompt-options-expression"
            data-check-advantage-bonus
            data-validation-target="checks-advantage-bonus"
            aria-invalid={bonusHelp.invalid ? 'true' : 'false'}
            aria-describedby={bonusHelpId}
            placeholder="1d6"
            value={rule.bonusExpression}
            oninput={(event) => writeAdvantage('bonusExpression', event.currentTarget.value)}
          />
        </Field>
        <p
          class="manager-checks-prompt-options-hint is-help"
          class:is-danger={bonusHelp.invalid}
          id={bonusHelpId}
          data-check-advantage-bonus-help
        >
          {bonusHelp.text}
        </p>
      {/if}
      {#if rule.mode !== 'off'}
        <div class="manager-checks-prompt-options-line">
          <div class="manager-checks-prompt-options-copy">
            <p class="manager-checks-prompt-options-label is-sub">{disadvantageTitle}</p>
            <p class="manager-checks-prompt-options-hint" data-check-advantage-disadvantage-hint>
              {disadvantageHint(copy)}
            </p>
          </div>
          <StatusToggle
            on={rule.offerDisadvantage}
            ariaLabel={disadvantageTitle}
            data-check-advantage-disadvantage=""
            onclick={() => writeAdvantage('offerDisadvantage', !rule.offerDisadvantage)}
          />
        </div>
      {/if}
    {/if}
  </div>
  {@render extra?.()}
</div>

<style>
  .manager-checks-prompt-options {
    margin-top: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-1);
  }

  .manager-checks-prompt-options-head {
    padding: var(--fab-space-2) var(--fab-space-3) 0;
  }

  .manager-checks-prompt-options-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    padding: var(--fab-space-2) var(--fab-space-3);
  }

  .manager-checks-prompt-options-copy {
    flex: 1 1 auto;
    min-width: 0;
  }

  .manager-checks-prompt-options-title,
  .manager-checks-prompt-options-label {
    margin: 0;
    font-size: 11.5px;
  }

  .manager-checks-prompt-options-title {
    color: var(--fab-text);
    font-weight: 600;
  }

  .manager-checks-prompt-options-label {
    color: var(--fab-text-secondary);
    font-weight: 500;
  }

  .manager-checks-prompt-options-hint {
    margin: var(--fab-space-2xs) 0 0;
    color: var(--fab-text-subtle);
    font-size: 10px;
    line-height: 1.45;
  }

  /* The prototype's advantage block: ruled off below the bonus offer, one column of rows. */
  .manager-checks-prompt-options-advantage {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2) var(--fab-space-3) var(--fab-space-3);
    border-top: 1px solid var(--fab-border);
  }

  .manager-checks-prompt-options-line {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
  }

  .manager-checks-prompt-options-label.is-sub {
    font-size: 11px;
  }

  .manager-checks-prompt-options-label.is-grow {
    flex: 1 1 auto;
    min-width: 0;
  }

  .manager-checks-prompt-options-hint.is-note {
    margin: 0;
  }

  .manager-checks-prompt-options-hint.is-help {
    margin: calc(-1 * var(--fab-space-1)) 0 0;
  }

  .manager-checks-prompt-options-hint.is-danger {
    color: var(--fab-danger-text);
  }

  /* The Difficulty card's stepper rung: two 26px adjuncts round the value, at the field height. */
  .manager-checks-prompt-options-stepper {
    --fab-stepper-fill-height: 30px;

    flex: 0 0 auto;
    width: 96px;
  }

  .manager-checks-prompt-options-expression {
    width: 300px;
    max-width: 100%;
    height: 30px;
    padding: 0 var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 7px;
    background: var(--fab-bg-1);
    color: var(--fab-text);
    font-family: var(--fab-font-mono);
    font-size: 12px;
    font-weight: 500;
  }

  .manager-checks-prompt-options-expression[aria-invalid='true'] {
    border-color: var(--fab-danger-border);
  }
</style>
