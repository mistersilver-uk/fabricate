<script>
  import { downtimePreviewDefinition } from './worldDowntimePreviewProvider.js';
  import { localize } from '../../../util/foundryBridge.js';

  let { tabId = 'tracking', hidden = false } = $props();
  const preview = $derived(downtimePreviewDefinition(tabId));
  const copyBase = $derived(`FABRICATE.Admin.Manager.World.Downtime.Preview.${preview.key}`);
  // A board row carries THREE fields, not one: the thing, what it is, and where it stands.
  // The value column is the part that actually sells "this tracks real state for you", so a
  // row is a record here rather than a bare label.
  const previewRows = $derived(
    preview.rows.map((row, index) => ({
      icon: row.icon,
      tint: row.tint,
      primary: localize(`${copyBase}.Rows.${index + 1}.Primary`),
      secondary: localize(`${copyBase}.Rows.${index + 1}.Secondary`),
      value: localize(`${copyBase}.Rows.${index + 1}.Value`),
    }))
  );
  const cta = 'https://www.patreon.com/c/mistersilver';
</script>

<div
  class="downtime-preview"
  id={`world-downtime-panel-${tabId}`}
  role="tabpanel"
  tabindex="0"
  aria-labelledby={`world-downtime-tab-${tabId}`}
  {hidden}
  data-downtime-panel={tabId}
>
  <section class="downtime-hero">
    <div class="downtime-hero-copy">
      <span class="downtime-premium"
        ><i class="fas fa-crown" aria-hidden="true"></i>
        {localize('FABRICATE.Admin.Manager.World.Downtime.Brand')}</span
      >
      <h2>{localize(`${copyBase}.Headline`)}</h2>
      <p>{localize(`${copyBase}.Description`)}</p>
      <div class="downtime-cta-row">
        <a class="downtime-cta" href={cta} target="_blank" rel="noopener noreferrer">
          <i class="fas fa-crown" aria-hidden="true"></i>
          <span>{localize('FABRICATE.Admin.Manager.World.Downtime.Subscribe')}</span>
          <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
        </a>
        <span class="downtime-cta-note" data-downtime-cta-note
          >{localize('FABRICATE.Admin.Manager.World.Downtime.SubscribeNote')}</span
        >
      </div>
      <p class="downtime-preview-note">
        <i class="fas fa-eye" aria-hidden="true"></i>
        {localize('FABRICATE.Admin.Manager.World.Downtime.PreviewNote')}
      </p>
    </div>
    <div class="downtime-board" aria-label={localize(`${copyBase}.PreviewTitle`)}>
      <header>
        <span class="downtime-board-icon" aria-hidden="true"><i class={preview.icon}></i></span>
        <span class="downtime-board-heading">
          <strong>{localize(`${copyBase}.PreviewTitle`)}</strong>
          <span class="downtime-board-subtitle" data-downtime-board-subtitle
            >{localize(`${copyBase}.PreviewSubtitle`)}</span
          >
        </span>
        <span class="downtime-board-badge"
          ><i class="fas fa-lock" aria-hidden="true"></i>
          {localize('FABRICATE.Admin.Manager.World.Downtime.PreviewBadge')}</span
        >
      </header>
      {#each previewRows as row (row.primary)}
        <div class="downtime-board-row" data-downtime-board-row={row.tint}>
          <span
            class={`downtime-board-icon downtime-board-row-icon is-tint-${row.tint}`}
            aria-hidden="true"><i class={row.icon}></i></span
          >
          <span class="downtime-board-row-copy">
            <span class="downtime-board-row-primary">{row.primary}</span>
            <span class="downtime-board-row-secondary">{row.secondary}</span>
          </span>
          <span class="downtime-board-row-value">{row.value}</span>
        </div>
      {/each}
      <!--
        The design leads this footnote with `fa-sparkles`, a Font Awesome PRO name that
        renders 0x0 in FA Free — the prototype itself draws nothing there, and Foundry
        ships Free too. `fa-wand-magic-sparkles` is the Free glyph closest to the intent.
      -->
      <p class="downtime-board-note" data-downtime-board-note>
        <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
        {localize('FABRICATE.Admin.Manager.World.Downtime.BoardNote')}
      </p>
    </div>
  </section>

  <section class="downtime-benefits">
    <div class="downtime-benefits-header">
      <div class="downtime-benefits-heading">
        <p class="downtime-kicker">
          {localize('FABRICATE.Admin.Manager.World.Downtime.BenefitsKicker')}
        </p>
        <h3>{localize('FABRICATE.Admin.Manager.World.Downtime.BenefitsTitle')}</h3>
      </div>
      <span class="downtime-benefits-note" data-downtime-benefits-note
        >{localize('FABRICATE.Admin.Manager.World.Downtime.BenefitsNote')}</span
      >
    </div>
    <div class="downtime-feature-grid">
      {#each preview.features as feature, index (feature.icon)}
        <article>
          <span class={`downtime-feature-icon is-tint-${feature.tint}`} aria-hidden="true"
            ><i class={feature.icon}></i></span
          >
          <h4>{localize(`${copyBase}.Features.${index + 1}.Title`)}</h4>
          <p>{localize(`${copyBase}.Features.${index + 1}.Description`)}</p>
        </article>
      {/each}
    </div>
  </section>
</div>

<style>
  .downtime-preview {
    container-type: inline-size;
    /* Keep the preview workspace independently scrollable at the Manager's supported
       short and narrow window sizes; the connected tab card stays reachable below it. */
    min-height: 720px;
    min-width: 0;
    padding: 18px;
    color: var(--fab-text);
  }

  .downtime-hero {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(260px, 0.65fr);
    gap: 18px;
    padding: 22px;
    border: 1px solid var(--fab-accent-border);
    border-radius: 14px;
    background: var(--fab-surface);
  }

  .downtime-premium,
  .downtime-board-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    width: fit-content;
    padding: 4px 9px;
    border: 1px solid var(--fab-accent-border);
    border-radius: 999px;
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  /*
    Explicit type, because a bare `h2`/`h3`/`h4` here states margins only and otherwise
    inherits Foundry core's heading scale, which draws these 1.5x-2x their designed size.
    The previous `clamp(1.65rem, 3vw, 2.35rem)` was worse than large: `vw` measures the
    BROWSER viewport, not the ApplicationV2 window, which is precisely what this file's
    container-query comment says a preview breakpoint must never do.
  */
  h2 {
    margin: 16px 0 8px;
    font-size: 1.7rem;
    font-weight: 600;
    line-height: 1.12;
  }

  p {
    color: var(--fab-text-muted);
    line-height: 1.65;
  }

  .downtime-cta-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
  }

  .downtime-cta {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 16px;
    border: 1px solid var(--fab-accent-border);
    border-radius: 9px;
    background: var(--fab-accent);
    color: var(--fab-on-accent);
    font-size: 11.5px;
    font-weight: 700;
    text-decoration: none;
  }

  .downtime-cta:focus-visible {
    outline: 2px solid var(--fab-text);
    outline-offset: 2px;
  }

  .downtime-cta-note {
    min-width: 0;
    flex: 1 1 180px;
    color: var(--fab-text-muted);
    font-size: 0.62rem;
    line-height: 1.4;
  }

  .downtime-preview-note {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 0.82rem;
  }

  /* One of the few glyphs the design colours on the `<i>` itself rather than through a
     wrapper: the preview note's eye is informational, not brand accent. */
  .downtime-preview-note i {
    color: var(--fab-info);
  }

  .downtime-board {
    align-self: center;
    padding: 14px;
    border: 1px solid var(--fab-border);
    border-radius: 12px;
    background: var(--fab-surface-soft);
  }

  .downtime-board header,
  .downtime-board-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .downtime-board header {
    margin-bottom: 10px;
  }

  .downtime-board-heading {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
  }

  .downtime-board-heading strong {
    overflow-wrap: anywhere;
    font-size: 0.78rem;
  }

  .downtime-board-subtitle {
    color: var(--fab-text-subtle);
    font-size: 0.6rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .downtime-board-icon,
  .downtime-feature-icon {
    display: inline-grid;
    flex: 0 0 auto;
    width: 30px;
    height: 30px;
    place-items: center;
    border-radius: 8px;
    background: var(--fab-accent-soft);

    /* The tile carries the colour and the glyph inherits it, so a tinted slot keeps
       following its own row instead of being frozen by a rule on the `<i>`. */
    color: var(--fab-downtime-tint, var(--fab-accent));
    font-size: 12px;
  }

  .downtime-board-icon i,
  .downtime-feature-icon i {
    font-size: 0.75rem;
  }

  /*
    The design assigns these per item in its data, not per widget, so each is a tint NAME
    the slot chooses rather than a selector that knows what it is decorating. They set a
    custom property instead of `color` on purpose: `.downtime-board-icon` and `.is-tint-*`
    are both single-class selectors, so two `color` declarations would race on source order.
  */
  .is-tint-accent {
    --fab-downtime-tint: var(--fab-accent);
  }

  .is-tint-info {
    --fab-downtime-tint: var(--fab-info);
  }

  .is-tint-vitality {
    --fab-downtime-tint: var(--fab-success);
  }

  .is-tint-warning {
    --fab-downtime-tint: var(--fab-warning);
  }

  .is-tint-tag {
    --fab-downtime-tint: var(--fab-tag-lavender);
  }

  .is-tint-ember {
    --fab-downtime-tint: var(--fab-tag-ember);
  }

  .downtime-board-badge {
    margin-left: auto;
    font-size: 0.58rem;
  }

  .downtime-board-row {
    min-height: 48px;
    margin-top: 7px;
    padding: 8px 10px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface);
  }

  .downtime-board-row-icon {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    background: var(--fab-bg-0);
    font-size: 11px;
  }

  .downtime-board-row-copy {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
  }

  .downtime-board-row-primary {
    font-size: 0.7rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .downtime-board-row-secondary {
    color: var(--fab-text-subtle);
    font-size: 0.6rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .downtime-board-row-value {
    flex: 0 0 auto;
    color: var(--fab-text);
    font-family: var(--fab-font-mono);
    font-size: 0.6rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .downtime-board-note {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    margin-top: 9px;
    padding: 8px 9px;
    border: 1px dashed var(--fab-border);
    border-radius: 8px;
    color: var(--fab-text-subtle);
    font-size: 0.6rem;
    line-height: 1.4;
  }

  .downtime-benefits {
    padding: 22px 0 4px;
  }

  .downtime-benefits-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    min-width: 0;
    flex-wrap: wrap;
  }

  .downtime-benefits-heading {
    min-width: 0;
  }

  .downtime-benefits-note {
    min-width: 0;
    color: var(--fab-text-subtle);
    font-size: 0.62rem;
    text-align: right;
  }

  .downtime-kicker {
    margin: 0;
    color: var(--fab-text-subtle);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .downtime-benefits h3 {
    margin: 5px 0 12px;
    font-size: 0.94rem;
    font-weight: 600;
    line-height: 1.3;
  }

  .downtime-feature-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 9px;
  }

  article {
    padding: 14px;
    border: 1px solid var(--fab-border);
    border-radius: 10px;
    background: var(--fab-surface-soft);
  }

  .downtime-feature-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--fab-bg-0);
    font-size: 13px;
  }

  .downtime-feature-icon i {
    font-size: 0.8125rem;
  }

  h4 {
    margin: 10px 0 4px;
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1.3;
  }

  article p {
    margin: 0;
    font-size: 0.82rem;
  }

  /* ApplicationV2 windows resize inside Foundry's fixed browser viewport, so
     preview breakpoints must follow this panel rather than `window.innerWidth`. */
  @container (max-width: 1040px) {
    .downtime-hero,
    .downtime-feature-grid {
      grid-template-columns: 1fr 1fr;
    }

    .downtime-hero-copy {
      grid-column: 1 / -1;
    }
  }

  @container (max-width: 640px) {
    .downtime-preview {
      padding: 10px;
    }

    .downtime-hero,
    .downtime-feature-grid {
      grid-template-columns: 1fr;
    }

    .downtime-cta {
      width: 100%;
    }

    .downtime-benefits-note {
      text-align: left;
    }
  }
</style>
