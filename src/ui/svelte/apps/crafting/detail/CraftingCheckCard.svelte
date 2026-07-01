<!-- Svelte 5 runes mode -->
<!--
  CraftingCheckCard surfaces the recipe's crafting check (DC, roll formula, skill)
  with an optional-vs-mandatory pill. The pill reads "Required" when the engine will
  actually roll the check and a failure fails the craft (routed-by-check / progressive
  / alchemy always; routed-by-ingredients whenever a formula is authored; simple when a
  formula is authored AND checks are enabled) — otherwise "Optional". `usable` is true
  only when an authored roll formula exists.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let { check = null } = $props();

  const mandatory = $derived(check?.mandatory === true);
  const hasDc = $derived(check?.dc !== null && check?.dc !== undefined);
  const hasFormula = $derived(typeof check?.rollFormula === 'string' && check.rollFormula !== '');
  const hasSkill = $derived(typeof check?.skill === 'string' && check.skill !== '');
  // The formula couldn't be reduced to a number for the selected actor.
  const formulaError = $derived(check?.formulaResolved === false);
  // A resolved (substituted) formula to show in place of the raw @-placeholder form.
  const hasResolvedFormula = $derived(
    typeof check?.resolvedFormula === 'string' && check.resolvedFormula !== ''
  );
  // Prefer the resolved formula unless resolution errored (then keep the raw form,
  // which surfaces the unresolved placeholders alongside the error note).
  const shownFormula = $derived(
    !formulaError && hasResolvedFormula ? check.resolvedFormula : check?.rollFormula
  );
</script>

{#if check}
  <section
    class="crafting-check-card"
    class:is-mandatory={mandatory}
    class:is-unusable={check.usable !== true}
    class:is-formula-error={formulaError}
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
        <span
          class="crafting-check-fact crafting-check-formula"
          data-check-formula
          data-check-formula-resolved={hasResolvedFormula
            ? formulaError
              ? 'false'
              : 'true'
            : undefined}
        >
          <i class="fas fa-dice-d20" aria-hidden="true"></i>
          <code title={check.rollFormula}>{shownFormula}</code>
        </span>
      {/if}
    </div>
    {#if check.usable !== true}
      <p class="crafting-check-note">{localize('FABRICATE.App.Crafting.Check.NoFormula')}</p>
    {:else if formulaError}
      <p class="crafting-check-note crafting-check-error" data-check-formula-error>
        <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
        {localize('FABRICATE.App.Crafting.Check.FormulaUnresolved')}
      </p>
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

  /* An unresolvable formula for the selected actor reads as an error. */
  .crafting-check-card.is-formula-error {
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
  }

  .crafting-check-error {
    display: flex;
    align-items: center;
    gap: 6px;
    font-style: normal;
    color: var(--fab-danger-text);
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
