<!-- Svelte 5 runes mode -->
<!--
  InventorySalvagePanel is the player's salvage surface (issue 675) — the first one
  Fabricate has ever had. It lives INLINE in the inspector; there is no modal.

  Structure: mode banner -> read-only roll summary (after resolution only) -> the
  per-mode body -> the one-shot footer.

  BODY DISPATCH IS ON THE PAIR `(mode, checkUsable)`, not a four-way taxonomy. A check
  is usable iff its mode's roll formula is authored, and that is the only gate the
  engine applies — so "no check" and "pass/fail" are one `simple` mode read at two
  usability states, while routed/progressive REQUIRE a formula and render the
  misconfigured body without one (the engine would abort such an attempt with a
  GM-config message and zero mutation).

  There is no "off" banner state: `off` is not a resolution mode. Salvageability is
  `features.salvage` + `component.salvage.enabled`, which is the condition for this
  panel existing at all.

  THE FOOTER IS ONE-SHOT FOR EVERY MODE. `promptCheckRoll` IS the roll step, so
  pressing it rolls and commits in a single gesture: no reroll, no separate confirm.
  Every value it presents is decided builder-side — this component never re-derives a
  mode, a DC, or a threshold, and never hardcodes a formula.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import SalvageMisconfiguredBody from './salvage/SalvageMisconfiguredBody.svelte';
  import SalvageProgressiveBody from './salvage/SalvageProgressiveBody.svelte';
  import SalvageRollSummary from './salvage/SalvageRollSummary.svelte';
  import SalvageRoutedBody from './salvage/SalvageRoutedBody.svelte';
  import SalvageSimpleBody from './salvage/SalvageSimpleBody.svelte';

  let {
    salvage = null,
    busy = false,
    result = null,
    onSalvage = null,
    onReset = null,
    stages = [],
    announcement = '',
    onReorder = () => {},
    onReorderSettled = () => {}
  } = $props();

  const mode = $derived(salvage?.mode ?? 'simple');
  const checkUsable = $derived(salvage?.checkUsable === true);
  const misconfigured = $derived(salvage?.misconfigured === true);
  // The ribbon is up: the attempt resolved and awarded. "Salvage again" resets.
  const committed = $derived(result?.state === 'success');
  // A time-gated run has STARTED and awarded nothing. No ribbon, and no "Salvage
  // again" — that would only re-enter the time gate.
  const waiting = $derived(result?.state === 'waiting');

  // Default TRUE — an absent key reads as permitted; only an explicit false pins the
  // GM's authored order. FROZEN once committed: the roll has already been spent down
  // the list, so the order is now a record of what happened rather than a choice.
  // Leaving the rows draggable under a success ribbon would invite the player to
  // "change" a resolved outcome.
  const canReorder = $derived(salvage?.allowPlayerResultReorder !== false && !committed);

  const BANNERS = {
    simple: { icon: 'fas fa-recycle', tone: 'info' },
    routed: { icon: 'fas fa-code-branch', tone: 'accent' },
    progressive: { icon: 'fas fa-arrow-down-long', tone: 'info' }
  };
  const banner = $derived(BANNERS[mode] ?? BANNERS.simple);
  const bannerTitle = $derived(
    localize(
      mode === 'routed'
        ? 'FABRICATE.App.Inventory.Salvage.BannerRoutedTitle'
        : mode === 'progressive'
          ? 'FABRICATE.App.Inventory.Salvage.BannerProgressiveTitle'
          : checkUsable
            ? 'FABRICATE.App.Inventory.Salvage.BannerSimpleTitle'
            : 'FABRICATE.App.Inventory.Salvage.BannerNoCheckTitle'
    )
  );
  const bannerRule = $derived(
    localize(
      mode === 'routed'
        ? 'FABRICATE.App.Inventory.Salvage.BannerRoutedRule'
        : mode === 'progressive'
          ? 'FABRICATE.App.Inventory.Salvage.BannerProgressiveRule'
          : checkUsable
            ? 'FABRICATE.App.Inventory.Salvage.BannerSimpleRule'
            : 'FABRICATE.App.Inventory.Salvage.BannerNoCheckRule'
    )
  );

  // "Salvage" with no usable check; "Salvage roll" with one — the label names the
  // gesture the player is about to make.
  const actionLabel = $derived(
    localize(
      checkUsable
        ? 'FABRICATE.App.Inventory.Salvage.ActionRoll'
        : 'FABRICATE.App.Inventory.Salvage.Action'
    )
  );
</script>

<div class="salvage-panel" data-inventory-salvage-panel={mode}>
  <p class="salvage-banner is-{banner.tone}" data-inventory-salvage-banner={mode}>
    <i class={banner.icon} aria-hidden="true"></i>
    <span class="salvage-banner-text">
      <span class="salvage-banner-title">{bannerTitle}</span>
      <span class="salvage-banner-rule">{bannerRule}</span>
    </span>
  </p>

  <!-- Read-only, and only AFTER resolution. There is no pre-roll dice box: the prompt
       is the roll step. -->
  <SalvageRollSummary {result} />

  <!-- Every body takes `result`: once the roll has resolved, the body must reconcile
       itself with it rather than keep asserting its pre-roll plan. A stage row still
       chipped "Awaiting roll" directly beneath a success ribbon is a contradiction the
       player has to resolve for us. -->
  {#if misconfigured}
    <SalvageMisconfiguredBody {mode} />
  {:else if mode === 'progressive'}
    <SalvageProgressiveBody
      {stages}
      {canReorder}
      {announcement}
      {onReorder}
      {onReorderSettled}
      {result}
    />
  {:else if mode === 'routed'}
    <SalvageRoutedBody {salvage} {result} />
  {:else}
    <SalvageSimpleBody {salvage} />
  {/if}

  <div class="salvage-footer">
    {#if committed}
      <p class="salvage-ribbon" data-inventory-salvage-ribbon role="status">
        <i class="fas fa-circle-check" aria-hidden="true"></i>
        <span>{localize('FABRICATE.App.Inventory.Salvage.Ribbon')}</span>
      </p>
      <button
        type="button"
        class="salvage-again"
        data-inventory-salvage-again
        onclick={() => onReset?.()}
      >
        <i class="fas fa-rotate-right" aria-hidden="true"></i>
        <span>{localize('FABRICATE.App.Inventory.Salvage.Again')}</span>
      </button>
    {:else}
      <button
        type="button"
        class="salvage-action"
        data-inventory-salvage-action
        disabled={busy || misconfigured || waiting}
        aria-busy={busy}
        onclick={() => onSalvage?.()}
      >
        <i
          class="fas"
          class:fa-spinner={busy}
          class:fa-spin={busy}
          class:fa-recycle={!busy}
          aria-hidden="true"
        ></i>
        <span>{actionLabel}</span>
      </button>
    {/if}
  </div>
</div>

<style>
  .salvage-panel {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
  }

  .salvage-banner {
    display: flex;
    align-items: flex-start;
    gap: var(--fab-space-2);
    margin: 0;
    padding: 10px;
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-surface-soft);
  }

  .salvage-banner.is-info {
    border-color: var(--fab-info-border);
    background: var(--fab-info-soft);
    color: var(--fab-info);
  }

  .salvage-banner.is-accent {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
  }

  .salvage-banner-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .salvage-banner-title {
    font-size: 11.5px;
    font-weight: 700;
    color: var(--fab-text);
  }

  .salvage-banner-rule {
    font-size: 11px;
    font-weight: 400;
    line-height: 1.5;
    color: var(--fab-text-muted);
  }

  .salvage-footer {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  /* Foundry's global `.app button` pins a fixed height and centers content; a button
     that sets only min-height gets CROPPED — its content spills past the border.
     Reset the inherited box (the EnvironmentCard pattern). Mounted tests cannot see
     this class of bug; it reproduces only in real Foundry. */
  .salvage-action,
  .salvage-again {
    box-sizing: border-box;
    appearance: none;
    -webkit-appearance: none;
    height: auto;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-2);
    width: 100%;
    font: inherit;
    line-height: 1;
    cursor: pointer;
  }

  .salvage-action {
    min-height: 44px;
    padding: 12px 16px;
    border: 1px solid var(--fab-accent-border);
    border-radius: 9px;
    background: var(--fab-accent);
    color: var(--fab-on-accent);
    font-size: 13px;
    font-weight: 700;
  }

  .salvage-action:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  .salvage-action:focus-visible,
  .salvage-again:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .salvage-action:disabled {
    opacity: 0.5;
    cursor: default;
    filter: none;
  }

  .salvage-again {
    min-height: 32px;
    padding: 6px 12px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    color: var(--fab-text-muted);
    font-size: 11.5px;
    font-weight: 600;
  }

  .salvage-again:hover {
    background: var(--fab-surface-raised);
    color: var(--fab-text);
  }

  .salvage-ribbon {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-2);
    box-sizing: border-box;
    margin: 0;
    min-height: 44px;
    padding: 12px 16px;
    border: 1px solid var(--fab-success-border);
    border-radius: 9px;
    background: var(--fab-success-soft);
    color: var(--fab-success-text);
    font-size: 12.5px;
    font-weight: 700;
    text-align: center;
  }
</style>
