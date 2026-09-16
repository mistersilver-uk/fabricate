<!-- Svelte 5 runes mode -->
<!--
  The Checks Studio's OUTCOME PREVIEW readout. It renders values already on the runner's own
  result object and nothing else: the simulator drove the engine's runners and this panel reads
  what came back, so a readout that disagreed with a real craft would need the engine to
  disagree with itself. It shows a `Medallion` die face, the TERSE breakdown line, the total
  against the DC with its margin, the matched band card and a "What happens" list.

  FOUR STATES THAT ARE NOT THE READOUT, each saying why: NO FORMULA (nothing to roll); DYNAMIC
  DC (the engine resolves that DC by RUNNING the linked macro and a preview must not, so it
  previews against the static fallback and states so — see `checkPreview.js` for why that is a
  safety property); UNRESOLVED ROLL DATA (`Roll.parse`'s own `missing: "0"` turns an `@` key the
  actor lacks into a plausible WRONG total, which "renders only values present on the result"
  cannot catch because the wrong number IS on the result, so the signal is
  `resolveCheckFormulaDisplay`'s `resolved === false`); and NO CHECK.
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
  // The FIRST rolled face, which is what the medallion shows; the breakdown line beside it
  // carries the rest of a multi-group formula.
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
    <!-- THE STUDIO'S BUTTON PRIMITIVE, not a hand-written class string: a bare
         `manager-button is-primary` matches no rule stating a type size, so the label lands on
         Foundry's inherited app base while every other button in the studio reads at the
         primitive's own size — exactly the drift `ManagerButton` exists to end and exactly the
         drift a remembered class string cannot be checked for.

         It is a CONVERSION, not a wrapper: the element below is already the button. Its Foundry
         `<button>` reset moved to the sheet's Checks Studio block with it, a scoped rule naming a
         class this component no longer emits matching nothing. -->
    <ManagerButton
      role="primary"
      class="manager-checks-simulator-roll"
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
    </ManagerButton>

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
        <!-- The rolled face, ON the medallion: the digit is the subject and the die glyph behind it
             is the tile's own art, so the number is LAYERED over the tile. An absolutely-positioned
             child with no offsets would sit at its STATIC position, to the right of the tile and
             under the breakdown line, so `inset: 0` is what makes "on the medallion" true. -->
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

  /* The digit is the SUBJECT of this tile, so the medallion renders no competing glyph: an
     icon and a numeral centred on the same square overlap into an unreadable blob, which is
     why the caption sits below the number rather than an icon beside it. */
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
     translucent surface token makes the mix behave as an OPACITY ramp and drops the label
     below WCAG AA. */
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
