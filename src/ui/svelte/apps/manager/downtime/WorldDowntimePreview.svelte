<script>
  import { downtimePreviewDefinition } from './worldDowntimePreviewProvider.js';
  import { localize } from '../../../util/foundryBridge.js';

  let { tabId = 'tracking', hidden = false } = $props();
  const preview = $derived(downtimePreviewDefinition(tabId));
  const copyBase = $derived(`FABRICATE.Admin.Manager.World.Downtime.Preview.${preview.key}`);
  const previewRows = $derived(
    Array.from({ length: preview.rowCount }, (_, index) =>
      localize(`${copyBase}.Rows.${index + 1}`)
    )
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
      <a class="downtime-cta" href={cta} target="_blank" rel="noopener noreferrer">
        <i class="fas fa-crown" aria-hidden="true"></i>
        <span>{localize('FABRICATE.Admin.Manager.World.Downtime.Subscribe')}</span>
        <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
      </a>
      <p class="downtime-preview-note">
        <i class="fas fa-eye" aria-hidden="true"></i>
        {localize('FABRICATE.Admin.Manager.World.Downtime.PreviewNote')}
      </p>
    </div>
    <div class="downtime-board" aria-label={localize(`${copyBase}.PreviewTitle`)}>
      <header>
        <span class="downtime-board-icon" aria-hidden="true"><i class={preview.icon}></i></span
        ><strong>{localize(`${copyBase}.PreviewTitle`)}</strong><span
          ><i class="fas fa-lock" aria-hidden="true"></i>
          {localize('FABRICATE.Admin.Manager.World.Downtime.PreviewBadge')}</span
        >
      </header>
      {#each previewRows as row, index (row)}
        <div class="downtime-board-row">
          <span class="downtime-board-icon downtime-board-row-icon" aria-hidden="true"
            ><i
              class={index === 0
                ? preview.icon
                : index === 1
                  ? 'fas fa-hammer'
                  : 'fas fa-hand-pointer'}
            ></i></span
          >
          <span>{row}</span>
          <i class="fas fa-lock" aria-hidden="true"></i>
        </div>
      {/each}
    </div>
  </section>

  <section class="downtime-benefits">
    <p class="downtime-kicker">
      {localize('FABRICATE.Admin.Manager.World.Downtime.BenefitsKicker')}
    </p>
    <h3>{localize('FABRICATE.Admin.Manager.World.Downtime.BenefitsTitle')}</h3>
    <div class="downtime-feature-grid">
      {#each preview.featureIcons as icon, index (icon)}
        <article>
          <span class="downtime-feature-icon" aria-hidden="true"><i class={icon}></i></span>
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
  .downtime-board header > span:not(.downtime-board-icon) {
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

  h2 {
    margin: 16px 0 8px;
    font-size: clamp(1.65rem, 3vw, 2.35rem);
    line-height: 1.12;
  }

  p {
    color: var(--fab-text-muted);
    line-height: 1.65;
  }

  .downtime-cta {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 8px;
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

  .downtime-preview-note {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 0.82rem;
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

  .downtime-board-icon,
  .downtime-feature-icon {
    display: inline-grid;
    flex: 0 0 auto;
    width: 30px;
    height: 30px;
    place-items: center;
    border-radius: 8px;
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
    font-size: 12px;
  }

  .downtime-board-icon i,
  .downtime-feature-icon i {
    font-size: 0.75rem;
  }

  .downtime-board header > span:not(.downtime-board-icon) {
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

  .downtime-board-row > span:not(.downtime-board-icon) {
    flex: 1;
    min-width: 0;
    font-weight: 600;
  }

  .downtime-benefits {
    padding: 22px 0 4px;
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
  }
</style>
