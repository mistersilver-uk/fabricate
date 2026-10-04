<!-- Svelte 5 runes mode -->
<!--
  CraftingCheckCard states the recipe's crafting check as an info strip: the DC, or a roll-under or
  character-value target and its source, or a count's successes needed, the skill and the roll
  formula, under a badge. The badge reads "Required" when the engine will actually roll the check
  and a failure fails the craft (routed-by-check / progressive; routed-by-ingredients whenever a
  formula is authored; simple and alchemy when a formula is authored AND checks are enabled) —
  otherwise "Optional". `usable` is true only when an authored roll formula exists. A target or
  formula the selected character cannot reduce to a number is a danger notice after the strip.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import InfoStrip from '../../../components/InfoStrip.svelte';
  import Notice from '../../../components/Notice.svelte';

  let { check = null } = $props();

  const mandatory = $derived(check?.mandatory === true);
  const hasDc = $derived(check?.dc !== null && check?.dc !== undefined);
  // A count check's successes needed, beside its pool line and never a DC (issue 2006).
  const needed = $derived(Number.isInteger(check?.successesNeeded) ? check.successesNeeded : null);
  const hasFormula = $derived(typeof check?.rollFormula === 'string' && check.rollFormula !== '');
  // A summed target other than a fixed DC to meet or beat (issue 2005), or why it cannot be read.
  const target = $derived(check?.target ?? null);
  const hasSkill = $derived(typeof check?.skill === 'string' && check.skill !== '');
  // The formula couldn't be reduced to a number for the selected actor.
  const formulaError = $derived(check?.formulaResolved === false);
  // A resolved (substituted) formula to show in place of the raw @-placeholder form.
  const hasResolvedFormula = $derived(
    typeof check?.resolvedFormula === 'string' && check.resolvedFormula !== ''
  );
  // Prefer the resolved formula unless resolution errored (then keep the raw form,
  // which surfaces the unresolved placeholders alongside the error notice).
  const shownFormula = $derived(
    !formulaError && hasResolvedFormula ? check.resolvedFormula : check?.rollFormula
  );
  const badge = $derived({
    label: mandatory
      ? localize('FABRICATE.App.Crafting.Check.Mandatory')
      : localize('FABRICATE.App.Crafting.Check.Optional'),
    tone: mandatory ? 'info' : 'neutral',
  });
  const facts = $derived(check ? checkFacts() : []);

  function checkFacts() {
    const list = [];
    if (hasDc) {
      const value = localize('FABRICATE.App.Crafting.Check.DcLabel', { dc: check.dc });
      list.push({ icon: 'fas fa-bullseye', value, props: { 'data-check-dc': '' } });
    }
    if (needed !== null) list.push(neededFact());
    if (target?.text) {
      const props = { 'data-check-target': target.direction };
      list.push({ icon: 'fas fa-bullseye', value: target.text, props });
      if (target.source) {
        const sourceProps = { 'data-check-target-source': '' };
        list.push({ icon: 'fas fa-calculator', value: target.source, props: sourceProps });
      }
    }
    if (hasSkill) {
      const props = { 'data-check-skill': '' };
      list.push({ icon: 'fas fa-graduation-cap', value: check.skill, props });
    }
    if (hasFormula) list.push(formulaFact());
    return list;
  }

  function neededFact() {
    const value =
      needed === 1
        ? localize('FABRICATE.App.RollPrompt.CountNeededOne')
        : localize('FABRICATE.App.RollPrompt.CountNeeded', { count: needed });
    return { icon: 'fas fa-bullseye', value, props: { 'data-check-successes-needed': needed } };
  }

  function formulaFact() {
    const resolved = formulaError ? 'false' : 'true';
    const props = {
      'data-check-formula': '',
      'data-check-formula-resolved': hasResolvedFormula ? resolved : undefined,
      title: check.rollFormula,
    };
    return { icon: 'fas fa-dice-d20', value: shownFormula, props };
  }
</script>

{#if check}
  <section
    class="crafting-check-card"
    data-recipe-section="check"
    data-check-mandatory={mandatory ? 'true' : 'false'}
    data-check-usable={check.usable === true ? 'true' : 'false'}
  >
    <InfoStrip label={localize('FABRICATE.App.Crafting.Check.Title')} {badge} {facts} />
    {#if target?.unresolved}
      <Notice tone="danger" title={target.unresolved} data-check-target-unresolved="" />
    {/if}
    {#if check.usable !== true}
      <p class="crafting-check-note">{localize('FABRICATE.App.Crafting.Check.NoFormula')}</p>
    {:else if formulaError}
      <Notice
        tone="danger"
        title={localize('FABRICATE.App.Crafting.Check.FormulaUnresolved')}
        data-check-formula-error=""
      />
    {/if}
  </section>
{/if}

<style>
  .crafting-check-card {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .crafting-check-note {
    margin: 0;
    font-size: 11px;
    font-style: italic;
    color: var(--fab-text-muted);
  }
</style>
