<!-- Svelte 5 runes mode -->
<!--
  IN THE ROLL PROMPT: what a player may change before the dice are rolled, rendered once inside the
  Formula card. The situational-bonus offer is a display flag only; `allowsSituationalModifier`
  stays the runtime's authority gate. `extra` is the slot later prompt options extend.
-->
<script>
  import ToggleCard from '../../../components/ToggleCard.svelte';
  import { localize } from '../../../util/foundryBridge.js';

  let { offer = true, direction = 'over', extra = undefined, onChange = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

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
</script>

<div class="manager-checks-prompt-options" data-check-prompt-options>
  <p class="manager-checks-formula-kicker">
    {text('FABRICATE.Admin.Manager.Checks.Evaluation.PromptTitle', 'In the roll prompt')}
  </p>
  <p class="manager-checks-formula-rule">
    {text(
      'FABRICATE.Admin.Manager.Checks.Evaluation.PromptLead',
      'What the player can change before the dice are rolled.'
    )}
  </p>
  <ToggleCard
    icon="fas fa-plus-minus"
    {title}
    sub={hint}
    on={offered}
    toggleLabel={title}
    toggleAttr="data-check-offer-situational-bonus"
    onToggle={(next) => onChange(next)}
  />
  {@render extra?.()}
</div>

<style>
  .manager-checks-prompt-options {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }
</style>
