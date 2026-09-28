<!-- Svelte 5 runes mode -->
<!--
  The Checks Studio's OUTCOME PREVIEW readout. It renders values already on the runner's own
  result object and nothing else, so a readout that disagreed with a real craft would need the
  engine to disagree with itself: a `Medallion` die face, the TERSE breakdown line, the total
  against its target with its margin, the matched band card and a "What happens" list.

  Five states are not the readout, each saying why: no formula; a dynamic DC, which the engine
  resolves by running the linked macro and a preview must not, so it previews the static fallback
  and says so; unresolved roll data, where `Roll.parse`'s `missing: "0"` turns an `@` key the
  actor lacks into a plausible wrong total, the signal being `resolved === false`; abstaining,
  where the check reads a value it cannot resolve, so Roll is disabled and no target or margin is
  shown; and no check.
-->
<script>
  import IconFactRow from '../IconFactRow.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import Medallion from '../../../components/Medallion.svelte';
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

  const result = $derived(preview?.result ?? null);
  const rolled = $derived(Boolean(result));
  const facts = $derived(Array.isArray(preview?.facts) ? preview.facts : []);
  // The FIRST rolled face, the breakdown line beside it carrying the rest.
  const face = $derived(result?.data?.diceGroups?.[0]?.results?.[0] ?? null);
  const marginLabel = $derived(Number.isFinite(preview?.margin) ? preview.gradeLabel : '');
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
  };
  const dynamicNote = $derived(DYNAMIC_NOTES[preview?.dynamicNote] ?? null);
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
    <!-- THE STUDIO'S BUTTON PRIMITIVE, not a hand-written class string: a bare
             `manager-button is-primary` matches no rule stating a type size, so the label lands on
             Foundry's inherited app base while every other button reads at the primitive's size —
             the drift `ManagerButton` exists to end, and one a remembered class string cannot be
             checked for. A CONVERSION, not a wrapper: the element below is already the button. -->
    <ManagerButton
      role="primary"
      class="manager-checks-simulator-roll"
      data-checks-simulator-roll
      disabled={preview.rolling === true || Boolean(abstain)}
      onclick={() => onRoll()}
    >
      <i class="fas fa-dice-d20" aria-hidden="true"></i>
      <span
        >{rolled
          ? text('FABRICATE.Admin.Manager.Checks.Simulator.RollAgain', 'Roll again')
          : text('FABRICATE.Admin.Manager.Checks.Simulator.Roll', 'Roll a test check')}</span
      >
    </ManagerButton>

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

    <!-- An abstention's hint above is the whole state: no total, target or margin. -->
    {#if rolled && !abstain}
      <div
        class="manager-checks-simulator-readout"
        data-checks-simulator-readout
        data-checks-simulator-direction={preview.direction}
      >
        <!-- The rolled face, ON the medallion: the digit is the subject and the glyph behind it the
                     tile's art, so an absolutely-positioned child with no offsets would sit at its STATIC
                     position, right of the tile. `inset: 0` is what makes "on the medallion" true. -->
        <span class="manager-checks-simulator-face" data-checks-simulator-face>
          <Medallion icon="" size={44} />
          <small data-checks-simulator-face-value>
            <strong>{face ?? ''}</strong>
            <span>{preview.dieLabel}</span>
          </small>
        </span>
        <span class="manager-checks-simulator-numbers">
          <small data-checks-simulator-breakdown>{preview.breakdown}</small>
          <strong data-checks-simulator-total>{preview.total}</strong>
          {#if marginLabel}
            <small data-checks-simulator-margin data-checks-simulator-target={preview.target}
              >{marginLabel}</small
            >
          {/if}
        </span>
      </div>

      {#if preview.bandName || preview.bandDetail}
        <div
          class={`manager-checks-simulator-band ${preview.bandSuccess ? 'is-success' : 'is-failure'}`}
          data-checks-simulator-band={preview.bandSuccess ? 'success' : 'failure'}
        >
          <i
            class={preview.bandSuccess ? 'fas fa-circle-check' : 'fas fa-circle-xmark'}
            aria-hidden="true"
          ></i>
          <span>
            <strong data-checks-simulator-band-name>{preview.bandName}</strong>
            <small>{preview.bandDetail}</small>
          </span>
        </div>
      {/if}

      {#if facts.length > 0}
        <p class="manager-kicker" data-checks-simulator-facts-heading>
          {text('FABRICATE.Admin.Manager.Checks.Simulator.WhatHappens', 'What happens')}
        </p>
        <div class="manager-checks-flag-list">
          {#each facts as fact (fact.id)}
            <IconFactRow
              icon={fact.icon}
              dataAttr="data-checks-simulator-fact"
              dataValue={fact.id}
              title={fact.title}
              subtitle={fact.subtitle}
            />
          {/each}
        </div>
      {/if}
    {:else if !abstain}
      <p class="manager-muted manager-checks-simulator-hint" data-checks-simulator-state="pre-roll">
        {text(
          'FABRICATE.Admin.Manager.Checks.Simulator.Hint',
          'Roll a test check to see exactly which outcome a record lands on and what it costs the character.'
        )}
      </p>
    {/if}
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

  .manager-checks-simulator-readout {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    min-width: 0;
  }

  .manager-checks-simulator-face {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
  }

  /* The digit is the SUBJECT of this tile, so the medallion renders no competing glyph: an icon
       and a numeral centred on one square overlap into an unreadable blob. */
  .manager-checks-simulator-face small {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 1px;
    align-items: center;
    justify-content: center;
    font-family: var(--fab-font-mono);
    line-height: 1;
  }

  .manager-checks-simulator-face small strong {
    color: var(--fab-text);
    font-size: 1rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .manager-checks-simulator-face small span {
    color: var(--fab-text-muted);
    font-size: 0.55rem;
  }

  .manager-checks-simulator-numbers {
    display: grid;
    min-width: 0;
  }

  .manager-checks-simulator-numbers small {
    overflow: hidden;
    color: var(--fab-text-muted);
    font-family: var(--fab-font-mono);
    font-size: 0.66rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-checks-simulator-numbers strong {
    color: var(--fab-text);
    font-family: var(--fab-font-mono);
    font-size: 1.1rem;
    font-variant-numeric: tabular-nums;
  }

  /* The matched band card mixes into an OPAQUE base for the reason the band ramp records: a
       translucent token makes the mix an OPACITY ramp and drops the label below WCAG AA. */
  .manager-checks-simulator-band {
    display: flex;
    gap: var(--fab-space-2);
    align-items: flex-start;
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: color-mix(in srgb, var(--fab-success) 14%, var(--fab-bg-0));
  }

  .manager-checks-simulator-band.is-failure {
    background: color-mix(in srgb, var(--fab-danger) 14%, var(--fab-bg-0));
  }

  .manager-checks-simulator-band > i {
    margin-top: 2px;
    color: var(--fab-success);
    font-size: 0.8rem;
  }

  .manager-checks-simulator-band.is-failure > i {
    color: var(--fab-danger);
  }

  .manager-checks-simulator-band span {
    display: grid;
    min-width: 0;
  }

  .manager-checks-simulator-band strong {
    color: var(--fab-text);
    font-size: 0.78rem;
  }

  .manager-checks-simulator-band small {
    color: var(--fab-text-muted);
    font-size: 0.66rem;
    line-height: 1.4;
  }
</style>
