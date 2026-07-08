<!-- Svelte 5 runes mode -->
<!--
  The Settings "Effect on this system" panel. PURELY PRESENTATIONAL — it receives
  a resolved `effect` shape and a pre-computed `summary` string and renders four
  labelled rows, each with a status badge (design-system §5.3: icon + word, never
  colour alone), plus an info strip (§6.3) carrying the summary.

  It does NOT import any matrix / resolver module: whoever owns the crafting-effect
  matrix resolves the booleans and the summary and passes them in.

  The Access and Books & Scrolls sub-tabs read as Visible / Hidden; the Limited-use
  and Learning-limits controls read as Shown / Hidden.

  Props:
   - effect: { showAccess, showBooksScrolls, showLimitedUse, showLearningLimits }.
   - summary: a resolved human-readable string describing the current effect.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    effect = {},
    summary = ''
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // Each row pairs a label with an on/off word pair; Access rows read
  // "Visible/Hidden", control rows read "Shown/Hidden".
  const rows = $derived([
    {
      key: 'access',
      on: effect?.showAccess === true,
      label: text('FABRICATE.Admin.Manager.CraftingEffect.AccessSubTab', 'Access sub-tab'),
      onWord: text('FABRICATE.Admin.Manager.CraftingEffect.Visible', 'Visible'),
      offWord: text('FABRICATE.Admin.Manager.CraftingEffect.Hidden', 'Hidden')
    },
    {
      key: 'books-scrolls',
      on: effect?.showBooksScrolls === true,
      label: text('FABRICATE.Admin.Manager.CraftingEffect.BooksScrollsSubTab', 'Books & Scrolls sub-tab'),
      onWord: text('FABRICATE.Admin.Manager.CraftingEffect.Visible', 'Visible'),
      offWord: text('FABRICATE.Admin.Manager.CraftingEffect.Hidden', 'Hidden')
    },
    {
      key: 'limited-use',
      on: effect?.showLimitedUse === true,
      label: text('FABRICATE.Admin.Manager.CraftingEffect.LimitedUseControl', 'Limited use control'),
      onWord: text('FABRICATE.Admin.Manager.CraftingEffect.Shown', 'Shown'),
      offWord: text('FABRICATE.Admin.Manager.CraftingEffect.Hidden', 'Hidden')
    },
    {
      key: 'learning-limits',
      on: effect?.showLearningLimits === true,
      label: text('FABRICATE.Admin.Manager.CraftingEffect.LearningLimitsControl', 'Learning limits control'),
      onWord: text('FABRICATE.Admin.Manager.CraftingEffect.Shown', 'Shown'),
      offWord: text('FABRICATE.Admin.Manager.CraftingEffect.Hidden', 'Hidden')
    }
  ]);
</script>

<section class="manager-crafting-effect" data-crafting-effect aria-label={text('FABRICATE.Admin.Manager.CraftingEffect.Title', 'Effect on this system')}>
  <p class="manager-crafting-effect-kicker">{text('FABRICATE.Admin.Manager.CraftingEffect.Title', 'Effect on this system')}</p>

  <div class="manager-crafting-effect-rows">
    {#each rows as row (row.key)}
      <div class="manager-crafting-effect-row" data-crafting-effect-row={row.key}>
        <span class="manager-crafting-effect-label">{row.label}</span>
        <span
          class={`manager-crafting-effect-badge ${row.on ? 'is-on' : 'is-off'}`}
          data-crafting-effect-state={row.on ? 'on' : 'off'}
        >
          <i class={row.on ? 'fas fa-circle-check' : 'fas fa-circle-minus'} aria-hidden="true"></i>
          <span>{row.on ? row.onWord : row.offWord}</span>
        </span>
      </div>
    {/each}
  </div>

  <div class="manager-crafting-effect-info" data-crafting-effect-summary>
    <i class="fas fa-circle-info" aria-hidden="true"></i>
    <span>{summary}</span>
  </div>
</section>

<style>
  .manager-crafting-effect {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
  }

  .manager-crafting-effect-kicker {
    margin: 0;
    font-weight: 700;
    font-size: 0.62rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--fab-text-subtle);
  }

  .manager-crafting-effect-rows {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .manager-crafting-effect-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2) var(--fab-space-3);
    background: var(--fab-bg-1);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
  }

  .manager-crafting-effect-label {
    flex: 1;
    min-width: 0;
    font-weight: 500;
    font-size: 0.72rem;
    color: var(--fab-text-secondary);
  }

  .manager-crafting-effect-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-1);
    padding: var(--fab-space-2xs) var(--fab-space-2);
    border-radius: 999px;
    font-weight: 700;
    font-size: 0.6rem;
  }

  .manager-crafting-effect-badge > i {
    font-size: 0.56rem;
  }

  .manager-crafting-effect-badge.is-on {
    background: var(--fab-success-soft);
    border: 1px solid var(--fab-success-border);
    color: var(--fab-success-text);
  }

  .manager-crafting-effect-badge.is-off {
    background: var(--fab-surface-soft);
    border: 1px solid var(--fab-border);
    color: var(--fab-text-muted);
  }

  .manager-crafting-effect-info {
    display: flex;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
    background: var(--fab-info-soft);
    border: 1px solid var(--fab-info-border);
    border-radius: 10px;
  }

  .manager-crafting-effect-info > i {
    margin-top: 1px;
    color: var(--fab-info);
    font-size: 0.72rem;
  }

  .manager-crafting-effect-info > span {
    font-size: 0.68rem;
    line-height: 1.55;
    color: var(--fab-text-muted);
  }
</style>
