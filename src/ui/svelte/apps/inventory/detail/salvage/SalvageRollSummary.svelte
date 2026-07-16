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
-->
<script>
  import { localize } from '../../../../util/foundryBridge.js';

  let { result = null } = $props();

  const state = $derived(result?.state ?? null);
  const message = $derived(String(result?.message ?? '').trim());
  const awarded = $derived(Array.isArray(result?.awarded) ? result.awarded : []);
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
      <p class="salvage-summary-message" data-inventory-salvage-message>{message}</p>
    {/if}
    {#if awarded.length > 0}
      <ul class="salvage-summary-awarded" data-inventory-salvage-awarded>
        {#each awarded as entry, index (entry.name + ':' + index)}
          <li class="salvage-summary-award">
            {#if entry.img}
              <img src={entry.img} alt="" draggable="false" />
            {/if}
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
    padding: 10px;
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-surface-soft);
  }

  .salvage-summary.is-success {
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
  }

  .salvage-summary.is-waiting {
    border-color: var(--fab-info-border);
    background: var(--fab-info-soft);
  }

  .salvage-summary-outcome {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: 10.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--fab-text);
  }

  .salvage-summary.is-success .salvage-summary-outcome {
    color: var(--fab-success-text);
  }

  .salvage-summary.is-waiting .salvage-summary-outcome {
    color: var(--fab-info-text);
  }

  /* The engine's message reads as data (it carries counts / remaining seconds). */
  .salvage-summary-message {
    margin: 0;
    font-family: var(--fab-font-mono);
    font-size: 12.5px;
    font-weight: 700;
    color: var(--fab-text-secondary);
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

  .salvage-summary-award img {
    width: 14px;
    height: 14px;
    border: 0;
    border-radius: 3px;
    object-fit: cover;
  }
</style>
