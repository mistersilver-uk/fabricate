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
    depleted = false,
    result = null,
    onSalvage = null,
    onReset = null,
    stages = [],
    announcement = '',
    onReorder = () => {},
    onReorderSettled = () => {},
    canResetOrder = false,
    onResetOrder = () => {}
  } = $props();

  const mode = $derived(salvage?.mode ?? 'simple');
  const checkUsable = $derived(salvage?.checkUsable === true);
  const misconfigured = $derived(salvage?.misconfigured === true);
  // The builder's discriminator (issue 764): the misconfigured body dispatches on it, so
  // a Simple multi-group misconfig renders Simple-specific copy rather than routed copy.
  const misconfiguredReason = $derived(salvage?.misconfiguredReason ?? null);
  // The ribbon is up: the attempt resolved and awarded. "Salvage again" resets.
  const committed = $derived(result?.state === 'success');
  // Salvaging the last copy leaves nothing to break down again. The ribbon still
  // shows what was recovered, but the way back to rolling must be withheld — and the
  // pre-roll footer's action disabled — because there is no stock left to salvage
  // (issue 675 defect). `depleted` is the store's post-salvage remaining, threaded in.
  const canSalvageAgain = $derived(!depleted);
  // A time-gated run has STARTED and awarded nothing. No ribbon, and no "Salvage
  // again" — that would only re-enter the time gate.
  const waiting = $derived(result?.state === 'waiting');

  // Default TRUE — an absent key reads as permitted; only an explicit false pins the
  // GM's authored order. FROZEN once committed: the roll has already been spent down
  // the list, so the order is now a record of what happened rather than a choice.
  // Leaving the rows draggable under a success ribbon would invite the player to
  // "change" a resolved outcome.
  const gmPinned = $derived(salvage?.allowPlayerResultReorder === false);
  const canReorder = $derived(!gmPinned && !committed);

  // WHY the rows are fixed. Two DIFFERENT reasons collapse into that one boolean, and
  // the stage list cannot tell them apart — only this component knows. The GM reason
  // wins where it applies (it stays true whether or not a roll has since been spent);
  // otherwise a frozen list can only be frozen because this player's own roll ran down
  // it. Telling a player who ordered the list themselves that the GM set it is false.
  const fixedNoteKey = $derived(
    gmPinned
      ? 'FABRICATE.App.Crafting.Detail.StageOrderFixed'
      : 'FABRICATE.App.Inventory.Salvage.StageOrderSpent'
  );
  const fixedNoteFallback = $derived(
    gmPinned ? 'Order set by the GM' : 'Order spent — your roll ran down this list.'
  );

  // The banner reads the SAME pair the body dispatch does — `(mode, checkUsable)` — not
  // the mode alone. Keying it on `mode` made the no-check case blue, which is the one
  // case that promises the player something unconditional: it takes the success ramp.
  const banner = $derived(
    mode === 'routed'
      ? { icon: 'fas fa-code-branch', tone: 'accent' }
      : mode === 'progressive'
        ? // A NUMBERED list, not an arrow: this banner names the mode, and what makes the
          // mode is that the results are ORDERED. The arrow belongs to the flow banner
          // below, which is the one making a claim about direction.
          { icon: 'fas fa-list-ol', tone: 'info' }
        : checkUsable
          ? { icon: 'fas fa-dice-d20', tone: 'info' }
          : { icon: 'fas fa-recycle', tone: 'success' }
  );
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

  // The note explains what pressing the button COSTS, and that cost is not the same in
  // both states: with a usable check the button is the roll — it commits, once, with no
  // reroll, which is the surprise worth warning about. Without one there is nothing to
  // roll and nothing to lose. One note for both said neither.
  const footerNote = $derived(
    localize(
      checkUsable
        ? 'FABRICATE.App.Inventory.Salvage.FooterNoteRoll'
        : 'FABRICATE.App.Inventory.Salvage.FooterNote'
    )
  );
</script>

<div class="salvage-panel" data-inventory-salvage-panel={mode}>
  <!-- SUPPRESSED when misconfigured (issue 764). The banner derives a mode/usability
       tone — for a Simple no-check config that is the green "you'll recover this" ramp —
       which contradicts the misconfigured body sitting directly beneath it. The
       misconfigured body IS the banner in that state. -->
  {#if !misconfigured}
    <p class="salvage-banner is-{banner.tone}" data-inventory-salvage-banner={mode}>
      <i class={banner.icon} aria-hidden="true"></i>
      <span class="salvage-banner-text">
        <span class="salvage-banner-title">{bannerTitle}</span>
        <span class="salvage-banner-rule">{bannerRule}</span>
      </span>
    </p>
  {/if}

  <!-- Read-only, and only AFTER resolution. There is no pre-roll dice box: the prompt
       is the roll step. -->
  <SalvageRollSummary {result} />

  <!-- Every body takes `result`: once the roll has resolved, the body must reconcile
       itself with it rather than keep asserting its pre-roll plan. A stage row still
       chipped "Awaiting roll" directly beneath a success ribbon is a contradiction the
       player has to resolve for us. -->
  {#if misconfigured}
    <SalvageMisconfiguredBody {mode} reason={misconfiguredReason} />
  {:else if mode === 'progressive'}
    <SalvageProgressiveBody
      {stages}
      {canReorder}
      {announcement}
      {onReorder}
      {onReorderSettled}
      {result}
      {fixedNoteKey}
      {fixedNoteFallback}
      {canResetOrder}
      {onResetOrder}
    />
  {:else if mode === 'routed'}
    <SalvageRoutedBody {salvage} {result} />
  {:else}
    <SalvageSimpleBody {salvage} />
  {/if}

  {#if committed}
    <!-- ONE box. The reset is an inline text button INSIDE the ribbon, not a second
         full-width control stacked beneath it: "Salvage again" is a quiet way back, not
         a second call to action competing with the result it sits under. -->
    <p class="salvage-ribbon" data-inventory-salvage-ribbon role="status">
      <i class="fas fa-circle-check" aria-hidden="true"></i>
      <span class="salvage-ribbon-text">{localize('FABRICATE.App.Inventory.Salvage.Ribbon')}</span>
      {#if canSalvageAgain}
        <button
          type="button"
          class="salvage-again"
          data-inventory-salvage-again
          onclick={() => onReset?.()}
        >
          {localize('FABRICATE.App.Inventory.Salvage.Again')}
        </button>
      {:else}
        <!-- Nothing left to break down: state it plainly instead of inviting an
             impossible re-roll. -->
        <span class="salvage-depleted-note" data-inventory-salvage-depleted>
          {localize('FABRICATE.App.Inventory.Salvage.Depleted')}
        </span>
      {/if}
    </p>
  {:else}
    <!-- A ruled row, not a full-width slab: the note explains the gesture's cost on the
         left and the action sits right, at its own width. -->
    <div class="salvage-footer">
      <p class="salvage-footer-note" data-inventory-salvage-footer-note>
        {footerNote}
      </p>
      <button
        type="button"
        class="salvage-action"
        data-inventory-salvage-action
        disabled={busy || misconfigured || waiting || depleted}
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
    </div>
  {/if}
</div>

<style>
  .salvage-panel {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    /* Genuine breathing room beneath the footer/ribbon at the end of a long, scrolled
       result list. The scroll container (`.inventory-detail`) is a flex column with
       `overflow-y:auto`, and Chromium DROPS a flex-overflow container's own
       padding-bottom at the scroll end (measured: ~0px gap, not the 16px the padding
       implies) — so the roomy look of a short list collapses to a cramped footer once
       the list scrolls. Padding on THIS block is inside a normal flow box and is
       honoured, restoring ~24px below the last control (measured). Scoped here, not on
       the shared `.inventory-detail`, which also serves the Info and book panels. */
    padding-bottom: var(--fab-space-6);
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

  .salvage-banner.is-success {
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
    color: var(--fab-success-text);
  }

  .salvage-banner-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  /* The title takes its TONE's text colour, not a flat one: a tinted box whose headline
     is the same grey in every state throws the ramp away. */
  .salvage-banner-title {
    font-size: 11.5px;
    font-weight: 700;
  }

  .salvage-banner.is-info .salvage-banner-title {
    color: var(--fab-info-text);
  }

  .salvage-banner.is-accent .salvage-banner-title {
    color: var(--fab-accent);
  }

  .salvage-banner.is-success .salvage-banner-title {
    color: var(--fab-success-text);
  }

  .salvage-banner-rule {
    font-size: 11px;
    font-weight: 400;
    line-height: 1.5;
    color: var(--fab-text-muted);
  }

  /* The prototype's ruled action row: a note left, the action right. */
  .salvage-footer {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    gap: var(--fab-space-3);
    border-top: 1px solid var(--fab-border);
    padding-top: var(--fab-space-3);
  }

  .salvage-footer-note {
    margin: 0;
    min-width: 0;
    font-size: 10.5px;
    font-weight: 400;
    line-height: 1.4;
    color: var(--fab-text-subtle);
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
    font: inherit;
    line-height: 1;
    cursor: pointer;
  }

  /* CraftButton's spec — the house action primitive — rather than a fourth private one:
     radius 8, an --accent border, 600/14. It differs only where it must: this button
     sits in a row at its own width, so it is not the primitive's full-width 44px slab. */
  .salvage-action {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-2);
    min-height: 30px;
    padding: 6px 14px;
    border: 1px solid var(--fab-accent);
    border-radius: 8px;
    background: var(--fab-accent);
    color: var(--fab-on-accent);
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
  }

  .salvage-action:hover:not(:disabled) {
    filter: brightness(1.05);
  }

  .salvage-action:focus-visible,
  .salvage-again:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  /* CraftButton's disabled treatment, so a blocked salvage reads like a blocked craft. */
  .salvage-action:disabled {
    cursor: not-allowed;
    opacity: 0.55;
    border-color: var(--fab-border);
    background: var(--fab-surface-raised);
    color: var(--fab-text-muted);
    filter: none;
  }

  /* An inline text button inside the ribbon: no box of its own. */
  .salvage-again {
    flex: 0 0 auto;
    padding: 0;
    border: none;
    background: none;
    color: var(--fab-success-text);
    font-size: 11px;
    font-weight: 600;
    text-decoration: underline;
  }

  .salvage-again:hover {
    filter: brightness(1.1);
  }

  /* The depleted stand-in for "Salvage again": same slot, same weight, but a quiet
     statement rather than an actionable link — nothing remains to salvage. */
  .salvage-depleted-note {
    flex: 0 0 auto;
    font-size: 11px;
    font-weight: 600;
    font-style: italic;
    opacity: 0.85;
  }

  .salvage-ribbon {
    display: flex;
    align-items: center;
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
  }

  /* Takes the slack so the inline reset stays pinned right. */
  .salvage-ribbon-text {
    flex: 1 1 auto;
    min-width: 0;
  }
</style>
