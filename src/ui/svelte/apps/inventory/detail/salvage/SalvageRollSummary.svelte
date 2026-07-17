<!-- Svelte 5 runes mode -->
<!--
  SalvageRollSummary is the READ-ONLY post-roll strip. It renders only AFTER the
  attempt resolves — there is no live or interactive dice box before the roll,
  because `promptCheckRoll` IS the roll step (it collects the situational bonus,
  the roll mode and the advantage disposition, then posts to chat).

  It reports only what the engine actually returned: the outcome, the engine's own
  message, and the materials awarded. It NEVER renders a formula: the formula is
  system-authored, the prompt already displayed the (optionally @-resolved) one,
  and inventing "d20 + 6" here would print a number no world necessarily uses.

  Built on the crafting tab's RollResultBox spec (the house post-roll box) rather
  than a fourth private one: same box, same head-plus-message-plus-awards
  structure, same 12px muted prose. Two deliberate departures from what shipped
  first: the message is NOT mono — the brief's mono rule covers numbers that read
  as data, and what the engine returns here is a prose sentence, which set bold in
  a mono face in a 300px column reads as a stack trace — and the success ramp is
  NOT repeated on this box, because the panel's ribbon already carries green and
  two stacked green boxes make neither one mean anything.
-->
<script>
  import { localize } from '../../../../util/foundryBridge.js';
  import CraftingThumb from '../../../crafting/CraftingThumb.svelte';

  let { result = null } = $props();

  const state = $derived(result?.state ?? null);
  const message = $derived(String(result?.message ?? '').trim());
  const awarded = $derived(Array.isArray(result?.awarded) ? result.awarded : []);
  // The rolled total, present only when a roll actually happened. A no-check
  // "Guaranteed" salvage has none (null), so the roll phrase is omitted rather than
  // printing "with a roll of 0/null". The connective is prose (it inherits the muted
  // message treatment); only the NUMBER is set mono, honouring the box's rule that
  // mono is for roll totals and DC values.
  const rollValue = $derived(Number.isFinite(result?.rollValue) ? result.rollValue : null);
  const hasRoll = $derived(rollValue !== null);
</script>

{#if state}
  <div
    class="salvage-summary is-{state}"
    data-inventory-salvage-summary={state}
    role="status"
    aria-live="polite"
  >
    <p class="salvage-summary-outcome">
      <i
        class="fas"
        class:fa-circle-check={state === 'success'}
        class:fa-hourglass-half={state === 'waiting'}
        aria-hidden="true"
      ></i>
      <span>
        {state === 'success'
          ? localize('FABRICATE.App.Inventory.Salvage.OutcomeSuccess')
          : localize('FABRICATE.App.Inventory.Salvage.OutcomeWaiting')}
      </span>
    </p>
    {#if message}
      <p class="salvage-summary-message" data-inventory-salvage-message>
        {message}{#if hasRoll} {localize('FABRICATE.App.Inventory.Salvage.SummaryWithRoll')}
          <span class="salvage-summary-roll" data-inventory-salvage-roll>{rollValue}</span>{/if}
      </p>
    {/if}
    {#if awarded.length > 0}
      <ul class="salvage-summary-awarded" data-inventory-salvage-awarded>
        {#each awarded as entry, index (entry.name + ':' + index)}
          <li class="salvage-summary-award">
            <!-- CraftingThumb, not a raw <img>: missing art gets the house fallback
                 rather than a broken-image glyph. -->
            <CraftingThumb src={entry.img ?? ''} alt="" size={14} />
            <span>{entry.name}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  .salvage-summary {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
  }

  /* No success ramp here. The panel's ribbon is already a full-width --success-soft box
     directly below; tinting this one too stacks two green boxes and neither reads. The
     outcome line's own --success-text is the signal. */
  .salvage-summary.is-waiting {
    border-color: var(--fab-info-border);
    background: var(--fab-info-soft);
  }

  /* RollResultBox's head: a title beside its glyph, sentence case. */
  .salvage-summary-outcome {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--fab-text);
  }

  .salvage-summary.is-success .salvage-summary-outcome {
    color: var(--fab-success-text);
  }

  .salvage-summary.is-waiting .salvage-summary-outcome {
    color: var(--fab-info-text);
  }

  /* The engine returns a PROSE SENTENCE here, not a numeric readout, so it takes the
     house body treatment (RollResultBox's `.crafting-roll-message`) — not mono, not
     bold. Mono is for quantities, roll totals and DC values. */
  .salvage-summary-message {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  /* The rolled total reads as DATA, so it takes the box's mono numeric treatment (the
     same one RollResultBox gives a roll total) while the connective around it stays
     prose. Inline with the message so it reads as one sentence. */
  .salvage-summary-roll {
    font-family: var(--fab-font-mono);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    color: var(--fab-text);
  }

  .salvage-summary-awarded {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: 0;
  }

  .salvage-summary-award {
    /* Cap to the column so a long name ellipsizes instead of widening the pill past the
       300px inspector. */
    max-width: 100%;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    border: 1px solid var(--fab-border);
    border-radius: 999px;
    background: var(--fab-surface-raised);
    color: var(--fab-text);
    font-size: 11px;
    font-weight: 600;
  }

  /* Every pill is one line tall regardless of name length: the 14px thumb never varies,
     so the ONLY thing that changed a pill's height was a long name WRAPPING to a second
     line (measured: 30px vs 20px). Pin the name to a single ellipsized line so all pills
     share the thumb-driven 20px height. `min-width:0` lets the flex item shrink far
     enough for the ellipsis to engage. */
  .salvage-summary-award > span:last-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

</style>
