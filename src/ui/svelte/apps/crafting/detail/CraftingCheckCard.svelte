<!-- Svelte 5 runes mode -->
<!--
  CraftingCheckCard surfaces the recipe's crafting check (DC, roll formula, skill)
  with an optional-vs-mandatory pill. It renders for every mode that configures a
  check; a mandatory check (routed-by-check / progressive / alchemy) reads as
  required, an optional one (simple / routed-by-ingredients) reads as a bonus.
  `usable` is true only when an authored roll formula exists.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let { check = null } = $props();

  const mandatory = $derived(check?.mandatory === true);
  const hasDc = $derived(check?.dc !== null && check?.dc !== undefined);
  const hasFormula = $derived(typeof check?.rollFormula === 'string' && check.rollFormula !== '');
  const hasSkill = $derived(typeof check?.skill === 'string' && check.skill !== '');
</script>

{#if check}
  <section
    class="crafting-check-card"
    class:is-mandatory={mandatory}
    class:is-unusable={check.usable !== true}
    data-recipe-section="check"
    data-check-mandatory={mandatory ? 'true' : 'false'}
    data-check-usable={check.usable === true ? 'true' : 'false'}
  >
    <header class="crafting-check-head">
      <p class="crafting-detail-section-title">
        {localize('FABRICATE.App.Crafting.Check.Title')}
      </p>
      <span class="crafting-check-pill" class:is-mandatory={mandatory}>
        {mandatory
          ? localize('FABRICATE.App.Crafting.Check.Mandatory')
          : localize('FABRICATE.App.Crafting.Check.Optional')}
      </span>
    </header>
    <div class="crafting-check-facts">
      {#if hasDc}
        <span class="crafting-check-fact" data-check-dc>
          <i class="fas fa-bullseye" aria-hidden="true"></i>
          {localize('FABRICATE.App.Crafting.Check.DcLabel', { dc: check.dc })}
        </span>
      {/if}
      {#if hasSkill}
        <span class="crafting-check-fact" data-check-skill>
          <i class="fas fa-graduation-cap" aria-hidden="true"></i>
          {check.skill}
        </span>
      {/if}
      {#if hasFormula}
        <span class="crafting-check-fact crafting-check-formula" data-check-formula>
          <i class="fas fa-dice-d20" aria-hidden="true"></i>
          <code>{check.rollFormula}</code>
        </span>
      {/if}
    </div>
    {#if check.usable !== true}
      <p class="crafting-check-note">{localize('FABRICATE.App.Crafting.Check.NoFormula')}</p>
    {/if}
  </section>
{/if}

<style>
  .crafting-check-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
  }

  .crafting-check-card.is-mandatory {
    border-color: var(--fab-info-border);
    background: var(--fab-info-soft);
  }

  .crafting-check-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .crafting-check-pill {
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    border: 1px solid var(--fab-border);
    background: var(--fab-surface-raised);
    color: var(--fab-text-muted);
  }

  .crafting-check-pill.is-mandatory {
    color: var(--fab-info-text);
    border-color: var(--fab-info-border);
    background: var(--fab-info-soft);
  }

  .crafting-check-facts {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    font-size: 12px;
    color: var(--fab-text);
  }

  .crafting-check-fact {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .crafting-check-fact i {
    font-size: 11px;
    color: var(--fab-text-muted);
  }

  .crafting-check-formula code {
    font-family: var(--fab-font-mono, monospace);
    font-size: 12px;
  }

  .crafting-check-note {
    margin: 0;
    font-size: 11px;
    font-style: italic;
    color: var(--fab-text-muted);
  }

  .crafting-detail-section-title {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--fab-text-muted);
  }
</style>
