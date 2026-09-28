<!-- Svelte 5 runes mode -->
<!--
  `In the roll prompt`: what a player may change before the dice are rolled, rendered once inside
  the Formula card as a group named by its title. The situational-bonus offer is a display flag only; `allowsSituationalModifier`
  stays the runtime's authority gate. `extra` is the slot later prompt options extend.
-->
<script>
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import { localize } from '../../../util/foundryBridge.js';

  let { offer = true, direction = 'over', extra = undefined, onChange = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const uid = $props.id();
  const titleId = `${uid}-prompt-options-title`;
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

<div
  class="manager-checks-prompt-options"
  role="group"
  aria-labelledby={titleId}
  data-check-prompt-options
>
  <div class="manager-checks-prompt-options-head">
    <p class="manager-checks-prompt-options-title" id={titleId}>
      {text('FABRICATE.Admin.Manager.Checks.Evaluation.PromptTitle', 'In the roll prompt')}
    </p>
    <p class="manager-checks-prompt-options-hint">
      {text(
        'FABRICATE.Admin.Manager.Checks.Evaluation.PromptLead',
        'What the player can change before the dice are rolled.'
      )}
    </p>
  </div>
  <!-- A switch ROW inside the group rather than a nested card: the group is the one frame. -->
  <div class="manager-checks-prompt-options-row">
    <div class="manager-checks-prompt-options-copy">
      <p class="manager-checks-prompt-options-label">{title}</p>
      <p class="manager-checks-prompt-options-hint">{hint}</p>
    </div>
    <StatusToggle
      on={offered}
      ariaLabel={title}
      data-check-offer-situational-bonus=""
      onclick={() => onChange(!offered)}
    />
  </div>
  {@render extra?.()}
</div>

<style>
  .manager-checks-prompt-options {
    margin-top: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-1);
  }

  .manager-checks-prompt-options-head {
    padding: var(--fab-space-2) var(--fab-space-3) 0;
  }

  .manager-checks-prompt-options-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    padding: var(--fab-space-2) var(--fab-space-3);
  }

  .manager-checks-prompt-options-copy {
    flex: 1 1 auto;
    min-width: 0;
  }

  .manager-checks-prompt-options-title,
  .manager-checks-prompt-options-label {
    margin: 0;
    font-size: 11.5px;
  }

  .manager-checks-prompt-options-title {
    color: var(--fab-text);
    font-weight: 600;
  }

  .manager-checks-prompt-options-label {
    color: var(--fab-text-secondary);
    font-weight: 500;
  }

  .manager-checks-prompt-options-hint {
    margin: var(--fab-space-2xs) 0 0;
    color: var(--fab-text-subtle);
    font-size: 10px;
    line-height: 1.45;
  }
</style>
