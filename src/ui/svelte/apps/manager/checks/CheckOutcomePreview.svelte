<!-- Svelte 5 runes mode -->
<!--
  The Checks Studio's OUTCOME PREVIEW readout. It renders values already on the runner's own
  result object and nothing else, so a readout that disagreed with a real craft would need the
  engine to disagree with itself. The rolled readout is the prototype's, announced politely as one
  region: a `Medallion` holding the rolled number, the terse breakdown, the total against its
  target line, a success-counting roll's tiles, the toned result card with its one note, and the
  "What happens" rows. `checkReadoutModel.js` builds every string it shows.

  Five states are not the readout, each saying why: no formula; a dynamic DC, which the engine
  resolves by running the linked macro and a preview must not, so it previews the static fallback
  and says so; unresolved roll data, where `Roll.parse`'s `missing: "0"` turns an `@` key the
  actor lacks into a plausible wrong total, the signal being `resolved === false`; abstaining,
  where the check reads a value it cannot resolve, so Roll is disabled and no target or margin is
  shown; and no check.
-->
<script>
  import IconFactRow from '../IconFactRow.svelte';
  import DiceTiles from '../../../components/DiceTiles.svelte';
  import Kicker from '../../../components/Kicker.svelte';
  import Button from '../../../components/Button.svelte';
  import Medallion from '../../../components/Medallion.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { localize } from '../../../util/foundryBridge.js';

  let {
    /** The readout view-model built by the route. */
    preview = null,
    onRoll = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const rolled = $derived(Boolean(preview?.result));
  const rows = $derived(Array.isArray(preview?.rows) ? preview.rows : []);
  const count = $derived(preview?.count ?? null);
  const card = $derived(preview?.card ?? null);
  const abstain = $derived(preview?.abstain ?? null);
  const DYNAMIC_NOTES = {
    'dynamic-dc': [
      'FABRICATE.Admin.Manager.Checks.Simulator.DynamicDc',
      'This check takes its DC from a macro at craft time. The preview never runs that macro, so it reads against the static fallback DC instead.',
    ],
    'dynamic-target': [
      'FABRICATE.Admin.Manager.Checks.Simulator.DynamicTarget',
      "This check's target comes from a macro at craft time. The preview never runs that macro, so it reads against the adjusted character value instead.",
    ],
    'dynamic-required': [
      'FABRICATE.Admin.Manager.Checks.Simulator.DynamicRequired',
      'This check takes its successes needed from a macro at craft time. The preview never runs that macro, so it reads against the successes needed set here instead.',
    ],
  };
  const dynamicNote = $derived(DYNAMIC_NOTES[preview?.dynamicNote] ?? null);

  const uid = $props.id();
  const extra = $derived(preview?.additionalDice ?? null);
  const extraLimit = $derived(extra?.limit ?? 0);
  const extraTitle = $derived(
    text('FABRICATE.Admin.Manager.Checks.Simulator.AdditionalDice.Title', 'Additional dice')
  );
  // Clamped whenever its bound moves, so the count shown and the count rolled agree.
  let additionalDice = $state(0);
  $effect.pre(() => {
    if (additionalDice > extraLimit) additionalDice = extraLimit;
  });
</script>

<div class="manager-checks-simulator" data-checks-simulator-panel>
  {#if !preview || preview.kind === null}
    <p class="manager-muted" data-checks-simulator-state="no-check">
      {text(
        'FABRICATE.Admin.Manager.Checks.Simulator.NoCheck',
        'This activity resolves without a roll, so there is nothing to preview.'
      )}
    </p>
  {:else if !preview.hasFormula}
    <p class="manager-muted" data-checks-simulator-state="no-formula">
      {text(
        'FABRICATE.Admin.Manager.Checks.Simulator.NoFormula',
        'Give this check a roll formula to preview an outcome.'
      )}
    </p>
  {:else}
    {#if extra}
      <div class="manager-checks-simulator-extra" data-checks-preview-additional-dice-field>
        <div class="manager-checks-simulator-extra-row">
          <span class="manager-checks-simulator-extra-title">{extraTitle}</span>
          <Stepper
            density="comfortable"
            min={0}
            max={extraLimit}
            value={additionalDice}
            disabled={extraLimit === 0}
            ariaLabel={extraTitle}
            decrementLabel={text(
              'FABRICATE.Admin.Manager.Checks.Simulator.AdditionalDice.Fewer',
              'Fewer additional dice'
            )}
            incrementLabel={text(
              'FABRICATE.Admin.Manager.Checks.Simulator.AdditionalDice.More',
              'More additional dice'
            )}
            inputProps={{
              'data-checks-preview-additional-dice': '',
              'aria-describedby': `${uid}-additional-dice-note`,
            }}
            onChange={(next) => (additionalDice = next)}
          />
        </div>
        <p
          class="manager-muted"
          id={`${uid}-additional-dice-note`}
          data-checks-preview-additional-dice-note={extra.note.kind}
        >
          {extra.note.text}
        </p>
      </div>
    {/if}

    <!-- THE STUDIO'S BUTTON PRIMITIVE, not a hand-written class string: a bare
             `fabricate-button is-primary` matches no rule stating a type size, so the label lands on
             Foundry's inherited app base while every other button reads at the primitive's size —
             the drift `Button` exists to end, and one a remembered class string cannot be
             checked for. A CONVERSION, not a wrapper: the element below is already the button. -->
    <Button
      role="primary"
      class="manager-checks-simulator-roll"
      data-checks-simulator-roll
      disabled={Boolean(abstain)}
      aria-disabled={preview.rolling === true ? 'true' : undefined}
      onclick={() => onRoll(additionalDice)}
    >
      <i class="fas fa-dice-d20" aria-hidden="true"></i>
      <span>{preview.rollLabel}</span>
    </Button>

    {#if dynamicNote}
      <p class="manager-muted" data-checks-simulator-note={preview.dynamicNote}>
        {text(dynamicNote[0], dynamicNote[1])}
      </p>
    {/if}

    {#if abstain}
      <p
        class="manager-muted manager-checks-simulator-hint"
        data-checks-simulator-state={abstain.reason}
      >
        {abstain.hint}
      </p>
    {:else if preview.resolved === false}
      <p class="manager-muted" data-checks-simulator-note="unresolved">
        {text(
          'FABRICATE.Admin.Manager.Checks.Simulator.Unresolved',
          'This formula does not reduce to a number for the selected actor, so the total below is not what a real roll would produce.'
        )}
      </p>
    {/if}

    <!-- One polite region from before the first roll, so a roll's arrival is announced: the
         waiting hint, then the readout. An abstention's hint above is the whole state instead. -->
    <div class="manager-checks-simulator-live" aria-live="polite" data-checks-simulator-live>
      {#if rolled && !abstain}
        <div
          class="manager-checks-simulator-readout"
          data-checks-simulator-readout
          data-checks-simulator-direction={preview.direction}
          data-checks-simulator-product={preview.product}
          data-checks-simulator-botch={count?.botch ? '' : undefined}
        >
          <div class="manager-checks-simulator-head">
            {#if preview.medallion}
              <!-- The number is the SUBJECT of this tile, so the medallion renders no glyph. -->
              <span class="manager-checks-simulator-medallion" data-checks-simulator-medallion>
                <Medallion icon="" size={38} />
                <span class="manager-checks-simulator-medallion-value">
                  <strong>{preview.medallion.value}</strong>
                  <small data-checks-simulator-medallion-caption>{preview.medallion.caption}</small>
                </span>
              </span>
            {/if}
            <span class="manager-checks-simulator-numbers">
              <small data-checks-simulator-breakdown>{preview.breakdown}</small>
              <span class="manager-checks-simulator-total-line">
                <strong data-checks-simulator-total={preview.totalValue ?? ''}
                  >{preview.total}</strong
                >
                {#if preview.targetLine}
                  <small
                    data-checks-simulator-margin={preview.marginKind}
                    data-checks-simulator-target={preview.target ?? ''}>{preview.targetLine}</small
                  >
                {/if}
              </span>
            </span>
          </div>

          {#if count && !count.zeroPool}
            <DiceTiles
              model={count.dice}
              legend
              faceDataAttr="data-checks-simulator-face"
              marksDataAttr="data-checks-simulator-face-marks"
              legendDataAttr="data-checks-simulator-legend"
            />
          {/if}

          {#if card}
            <div
              class={`manager-checks-simulator-band is-${card.tone}`}
              data-checks-simulator-band={card.tone === 'success' ? 'success' : 'failure'}
            >
              <div class="manager-checks-simulator-band-head">
                <Medallion icon={card.icon} size={30} glyph={12} ink={card.tone} />
                <span class="manager-checks-simulator-band-text">
                  <strong data-checks-simulator-band-name>{card.title}</strong>
                  <small data-checks-simulator-band-detail>{card.detail}</small>
                </span>
              </div>
              {#if preview.note}
                <p
                  class="manager-checks-simulator-note"
                  data-checks-simulator-note={preview.note.kind}
                >
                  <i class="fas fa-bolt" aria-hidden="true"></i>
                  <span>{preview.note.text}</span>
                </p>
              {/if}
            </div>
          {/if}

          {#if rows.length > 0}
            <div class="manager-checks-simulator-facts">
              <Kicker data-checks-simulator-facts-heading="">
                {text('FABRICATE.Admin.Manager.Checks.Simulator.WhatHappens', 'What happens')}
              </Kicker>
              <div class="manager-checks-flag-list">
                {#each rows as row (row.id)}
                  <IconFactRow
                    icon={row.icon}
                    density="line"
                    tone={row.tone}
                    data-checks-simulator-fact={row.id || true}
                    metaAttr="data-checks-simulator-fact-meta"
                    title={row.label}
                    subtitle={row.meta}
                  />
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {:else if !abstain}
        <p
          class="manager-muted manager-checks-simulator-hint"
          data-checks-simulator-state="pre-roll"
        >
          {preview.waitingHint}
        </p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .manager-checks-simulator {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* The waiting hint under Roll: centred in its own space, as the prototype draws it. */
  .manager-checks-simulator-hint {
    padding: var(--fab-space-4) var(--fab-space-2);
    text-align: center;
  }

  /* The prototype's 5px under the stepper row snaps to 6, and its 10px row gap to 12. */
  .manager-checks-simulator-extra {
    display: grid;
    gap: var(--fab-space-chip);
  }

  .manager-checks-simulator-extra-row {
    display: flex;
    gap: var(--fab-space-3);
    align-items: center;
  }

  .manager-checks-simulator-extra-title {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--fab-text-secondary);
    font-size: 11px;
    font-weight: 500;
  }

  .manager-checks-simulator-live {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* While abstaining it holds nothing, and an empty column must not add the panel's gap. */
  .manager-checks-simulator-live:empty {
    display: none;
  }

  /* The prototype's 12px under Roll is the panel's gap plus this. */
  .manager-checks-simulator-readout {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    min-width: 0;
    margin-top: var(--fab-space-1);
  }

  .manager-checks-simulator-head {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    min-width: 0;
  }

  .manager-checks-simulator-medallion {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
  }

  .manager-checks-simulator-medallion-value {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    align-items: center;
    justify-content: center;
  }

  .manager-checks-simulator-medallion-value strong {
    color: var(--fab-text);
    font-family: var(--fab-font-mono);
    font-size: 19px;
    font-weight: 500;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .manager-checks-simulator-medallion-value small {
    color: var(--fab-text-subtle);
    font-size: 8px;
    font-weight: 500;
    line-height: normal;
  }

  .manager-checks-simulator-numbers {
    display: grid;
    flex: 1;
    min-width: 0;
  }

  /* The breakdown and target line wrap rather than truncate, as the prototype's do. */
  .manager-checks-simulator-numbers [data-checks-simulator-breakdown] {
    margin-bottom: var(--fab-space-1);
    color: var(--fab-text-subtle);
    font-family: var(--fab-font-mono);
    font-size: 9.5px;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  .manager-checks-simulator-total-line {
    display: flex;
    gap: var(--fab-space-chip);
    align-items: baseline;
    min-width: 0;
  }

  .manager-checks-simulator-total-line strong {
    color: var(--fab-text);
    font-family: var(--fab-font-mono);
    font-size: 22px;
    font-weight: 500;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .manager-checks-simulator-total-line small {
    min-width: 0;
    color: var(--fab-text-muted);
    font-family: var(--fab-font-mono);
    font-size: 10px;
    font-weight: 500;
  }

  /* The result card, toned by the graded result on its family's own tokens, as `Notice` is. */
  .manager-checks-simulator-band {
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-success-border);
    border-radius: 9px;
    background: var(--fab-success-soft);
  }

  .manager-checks-simulator-band.is-danger {
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
  }

  .manager-checks-simulator-band-head {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
  }

  .manager-checks-simulator-band-text {
    display: grid;
    flex: 1;
    gap: var(--fab-space-2xs);
    min-width: 0;
  }

  /* The serif face names the outcome, per the design system's type rule. */
  .manager-checks-simulator-band-text strong {
    color: var(--fab-success-text);
    font-family: var(--fab-font-serif);
    font-size: 13.5px;
    font-weight: 600;
    line-height: normal;
  }

  .manager-checks-simulator-band.is-danger .manager-checks-simulator-band-text strong {
    color: var(--fab-danger-text);
  }

  .manager-checks-simulator-band-text small {
    color: var(--fab-text-muted);
    font-size: 10.5px;
    line-height: 1.45;
  }

  /* The card's one note, recessed a rung below the card; the prototype's `--bg1` is `--fab-bg-0`. */
  .manager-checks-simulator-note {
    display: flex;
    gap: var(--fab-space-2);
    margin: var(--fab-space-2) 0 0;
    padding: var(--fab-space-2);
    border-radius: 9px;
    background: var(--fab-bg-0);
    color: var(--fab-text-secondary);
    font-size: 10px;
    font-weight: 500;
    line-height: 1.45;
  }

  .manager-checks-simulator-note i {
    margin-top: var(--fab-space-2xs);
    color: var(--fab-warning-text);
    font-size: 9px;
  }

  /* The prototype's 5px row gap snaps to 6; the shared list keeps its own gap everywhere else. */
  [data-checks-simulator-panel] .manager-checks-flag-list {
    gap: var(--fab-space-chip);
  }
</style>
