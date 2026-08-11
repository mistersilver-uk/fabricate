<!-- Svelte 5 runes mode -->
<!--
  The Checks Studio's OUTCOME PREVIEW readout (issue 1097).

  It renders values that are already on the runner's own result object and it renders
  nothing else. There is no parallel model of what a tier means here: the simulator drove
  `runFormulaPassFail` / `runFormulaProgressive` / `runFormulaRouted` and this panel reads
  what came back, so a readout that disagreed with a real craft would require the engine
  to disagree with itself.

  The frame this reproduces is `crafting-roll--simulator-rolled.png`: a `Medallion` die
  face, the TERSE breakdown line (`d20 9 +10 · Sera Vane` — not the full resolved formula,
  which is the `THIS CHECK` digest's row), the total against the DC with its margin, the
  matched band card with its success/failure disposition, and a "What happens" list of
  `IconFactRow`s.

  ## Four states that are not the readout, and each says why

  - **No formula.** Nothing to roll.
  - **Dynamic DC.** The engine resolves that DC by RUNNING the linked macro; a preview
    must not, so it previews against the static fallback and states that it did. See
    `checkPreview.js` for why this is a safety property rather than a limitation.
  - **Unresolved roll data.** `Roll.parse`'s own `missing: "0"` turns an `@` key the
    previewed actor lacks into a plausible WRONG total, and "renders only values present
    on the result" does not catch that, because the wrong number IS on the result. The
    signal is `resolveCheckFormulaDisplay`'s `resolved === false`.
  - **No check.** The mode rolls nothing at all.
-->
<script>
  import IconFactRow from '../IconFactRow.svelte';
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
  // The FIRST rolled face, which is what the medallion shows. A preview formula is one
  // die group by the time it reaches here in every enumerable case, and a multi-group
  // formula still has a first group — the breakdown line beside it carries the rest.
  const face = $derived(result?.data?.diceGroups?.[0]?.results?.[0] ?? null);
  const marginLabel = $derived.by(() => {
    if (!Number.isFinite(preview?.margin)) return '';
    const margin = preview.margin;
    return `${text('FABRICATE.Admin.Manager.Checks.Simulator.VsDc', 'vs DC {dc}').replace(
      '{dc}',
      String(preview.dc)
    )} · ${margin >= 0 ? `+${margin}` : String(margin)}`;
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
    <button
      type="button"
      class="manager-button is-primary manager-checks-simulator-roll"
      data-checks-simulator-roll
      disabled={preview.rolling === true}
      onclick={() => onRoll()}
    >
      <i class="fas fa-dice-d20" aria-hidden="true"></i>
      <span
        >{rolled
          ? text('FABRICATE.Admin.Manager.Checks.Simulator.RollAgain', 'Roll again')
          : text('FABRICATE.Admin.Manager.Checks.Simulator.Roll', 'Roll a test check')}</span
      >
    </button>

    {#if preview.dynamicDc}
      <p class="manager-muted" data-checks-simulator-note="dynamic-dc">
        {text(
          'FABRICATE.Admin.Manager.Checks.Simulator.DynamicDc',
          'This check takes its DC from a macro at craft time. The preview never runs that macro, so it reads against the static fallback DC instead.'
        )}
      </p>
    {/if}

    {#if preview.resolved === false}
      <p class="manager-muted" data-checks-simulator-note="unresolved">
        {text(
          'FABRICATE.Admin.Manager.Checks.Simulator.Unresolved',
          'This formula does not reduce to a number for the selected actor, so the total below is not what a real roll would produce.'
        )}
      </p>
    {/if}

    {#if rolled}
      <div class="manager-checks-simulator-readout" data-checks-simulator-readout>
        <span class="manager-checks-simulator-face" data-checks-simulator-face>
          <Medallion icon="fas fa-dice-d20" size={44} glyph={16} />
          <small>{face ?? ''}</small>
        </span>
        <span class="manager-checks-simulator-numbers">
          <small data-checks-simulator-breakdown>{preview.breakdown}</small>
          <strong data-checks-simulator-total>{preview.total}</strong>
          {#if marginLabel}
            <small data-checks-simulator-margin>{marginLabel}</small>
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
    {:else}
      <p class="manager-muted" data-checks-simulator-state="pre-roll">
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

  /* The Foundry `<button>` reset this rail's other actions already carry: the host sheet
     centres button content and pins a fixed height, which would crop the icon+label pair. */
  .manager-checks-simulator-roll {
    justify-content: center;
    width: 100%;
    height: auto;
    min-height: 32px;
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

  .manager-checks-simulator-face small {
    position: absolute;
    color: var(--fab-text);
    font-family: var(--fab-font-mono);
    font-size: 0.95rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
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

  /* The matched band card. It mixes into an OPAQUE base for the reason the band ramp
     records: `--fab-surface-raised` is translucent in every theme, so a mix into it
     behaves as an OPACITY ramp and drops the label below WCAG AA. */
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
