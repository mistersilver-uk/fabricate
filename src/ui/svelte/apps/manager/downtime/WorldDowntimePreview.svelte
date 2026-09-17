<script>
  import { downtimePreviewDefinition } from './worldDowntimePreviewProvider.js';
  import { localize } from '../../../util/foundryBridge.js';

  let { tabId = 'tracking', hidden = false } = $props();
  const preview = $derived(downtimePreviewDefinition(tabId));
  const copyBase = $derived(`FABRICATE.Admin.Manager.World.Downtime.Preview.${preview.key}`);
  // A board row carries THREE fields — the thing, what it is, where it stands — so it reads as a
  // record rather than a bare label.
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
      <!-- A STACK, not three siblings with margins: one `gap` plus one margin under the header,
           which is also what keeps the first row's box identical to the other two. -->
      <div class="downtime-board-rows">
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
      </div>
      <!-- The design leads this footnote with a Font Awesome PRO glyph that renders 0x0 in Free,
           which Foundry ships; `fa-wand-magic-sparkles` is the closest Free glyph. -->
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
  /*
    NO `min-height`. The panel's scroller is `.downtime-preview-scroll` in the host, which already
    scrolls whenever the preview outgrows its `minmax(0, 1fr)` row. A 720px floor added nothing but
    a screenful of empty surface to scroll at ordinary window heights.
  */
  .downtime-preview {
    container-type: inline-size;
    min-width: 0;
    padding: 18px 20px 24px;
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
    box-shadow: var(--fab-shadow-lg);
  }

  /* A centred stack against the board, with the design's 4px inner inset. */
  .downtime-hero-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    justify-content: center;
    padding: 2px 4px;
  }

  /*
    One shell and one colour pair; only SCALE is stated twice. No `text-transform`: the design
    uppercases exactly one label in CSS and ships every other all-caps string literally, so a
    transform here would shout a translation that had already shouted for itself.
  */
  .downtime-premium,
  .downtime-board-badge {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    border: 1px solid var(--fab-accent-border);
    border-radius: 999px;
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
    font-weight: 700;
  }

  .downtime-premium {
    gap: 7px;
    height: 20px;
    padding: 4px 9px;
    font-size: 8.5px;
    letter-spacing: 0.12em;
  }

  /*
    Explicit type: a bare `h2`/`h3`/`h4` states margins only and otherwise inherits Foundry's
    heading scale, 1.5x-2x the designed size. A `clamp(…, 3vw, …)` was worse — `vw` measures the
    BROWSER viewport, not the ApplicationV2 window, exactly as the container-query note below says.
  */
  h2 {
    margin: 13px 0 0;
    font-size: 27px;
    font-weight: 600;
    line-height: 1.12;
  }

  /* 12.5px x 1.65 is the design's 20.625px leading; sub-body copy restates its size or inherits 14px. */
  p {
    margin: 10px 0 0;
    color: var(--fab-text-muted);
    font-size: 12.5px;
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
    gap: 9px;
    padding: 0 16px;
    border: 1px solid var(--fab-accent-border);
    border-radius: 9px;
    background: var(--fab-accent);
    color: var(--fab-on-accent);
    font-size: 11.5px;
    font-weight: 700;
    text-decoration: none;
    box-shadow: var(--fab-shadow-sm);
  }

  .downtime-cta:focus-visible {
    outline: 2px solid var(--fab-text);
    outline-offset: 2px;
  }

  .downtime-cta-note {
    min-width: 0;
    flex: 1 1 180px;
    color: var(--fab-text-subtle);
    font-size: 10px;
    line-height: 1.45;
  }

  .downtime-preview-note {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 14px 0 0;
    color: var(--fab-text-subtle);
    font-size: 9.5px;
    font-weight: 500;
  }

  /* Coloured on the `<i>` itself: the preview note's eye is informational, not brand accent. */
  .downtime-preview-note i {
    color: var(--fab-info);
    font-size: 9px;
  }

  /*
    The board is the screen's one RECESSED surface, a well cut into the hero. The design paints it
    with a translucent ink its palette does not name, and `--fab-bg-0` composites within two levels
    of it, preserving the tonal order without inventing a token for one fill. The exact value is
    left red in the visual-parity run rather than papered over.
  */
  .downtime-board {
    align-self: center;
    padding: 13px;
    border: 1px solid var(--fab-border-strong);
    border-radius: 12px;
    background: var(--fab-bg-0);
  }

  .downtime-board header,
  .downtime-board-row {
    display: flex;
    align-items: center;
  }

  .downtime-board header {
    gap: 9px;
    padding-bottom: 10px;
  }

  .downtime-board-rows {
    display: flex;
    flex-direction: column;
    gap: 7px;
    margin-top: 10px;
  }

  .downtime-board-heading {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
  }

  .downtime-board-heading strong {
    overflow-wrap: anywhere;
    font-size: 12.5px;
    font-weight: 600;
  }

  .downtime-board-subtitle {
    color: var(--fab-text-subtle);
    font-size: 9.5px;
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

    /* The tile carries the colour and the glyph inherits it, so a tinted slot follows its row. */
    color: var(--fab-downtime-tint, var(--fab-accent));
    font-size: 12px;
  }

  .downtime-board-icon i,
  .downtime-feature-icon i {
    font-size: 0.75rem;
  }

  /*
    Assigned per item rather than per widget, so each is a tint NAME the slot chooses. They set a
    custom property, not `color`: both selectors are single-class, so two `color` declarations
    would race on source order.
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
    gap: 6px;
    height: 17px;
    margin-left: auto;
    padding: 3px 7px;
    font-size: 7.5px;
    letter-spacing: 0.08em;
  }

  .downtime-board-row {
    min-height: 48px;
    gap: 9px;
    padding: 9px;
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-2);
  }

  .downtime-board-row-icon {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    background: var(--fab-bg-0);
  }

  .downtime-board-row-icon i {
    font-size: 11px;
  }

  .downtime-board-row-copy {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
  }

  .downtime-board-row-primary {
    font-size: 10.5px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .downtime-board-row-secondary {
    color: var(--fab-text-subtle);
    font-size: 9px;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .downtime-board-row-value {
    flex: 0 0 auto;
    color: var(--fab-accent);
    font-family: var(--fab-font-mono);
    font-size: 9px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .downtime-board-note {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-top: 10px;
    padding: 8px 9px;
    border: 1px dashed var(--fab-border);
    border-radius: 8px;
    color: var(--fab-text-subtle);
    font-size: 9px;
    line-height: 1.4;
  }

  .downtime-benefits {
    margin-top: 17px;
  }

  .downtime-benefits-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    min-width: 0;
    margin-bottom: 9px;
    flex-wrap: wrap;
  }

  .downtime-benefits-heading {
    min-width: 0;
  }

  .downtime-benefits-note {
    min-width: 0;
    color: var(--fab-text-subtle);
    font-size: 9.5px;
    text-align: right;
  }

  /* Literally uppercase in `lang/`, as the design's own copy is — see the pill note above. */
  .downtime-kicker {
    margin: 0;
    color: var(--fab-text-subtle);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
  }

  .downtime-benefits h3 {
    margin: 3px 0 0;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.3;
  }

  .downtime-feature-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 9px;
  }

  article {
    padding: 13px;
    border: 1px solid var(--fab-border);
    border-radius: 11px;
    background: var(--fab-bg-2);
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
    margin: 10px 0 0;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.3;
  }

  article p {
    margin: 4px 0 0;
    font-size: 10px;
    line-height: 1.5;
  }

  /*
    ApplicationV2 windows resize inside Foundry's fixed browser viewport, so a breakpoint must follow
    this PANEL: a `vw` query measures the browser, not the window the GM sized.

    EACH THRESHOLD IS THE WIDTH AT WHICH ITS OWN BLOCK STOPS FITTING, and the two differ, so they
    get separate queries. One shared 1040px collapsed both far above either honest limit — a
    container query measures the CONTENT box, so an ordinary 1314px window gives this panel 1028px.

      - 940px is the feature grid's: four cards plus three 9px gutters need 4x228px, and 228px is
        the narrowest a card reads at with a 32px tile above 10px copy.
      - 720px is the hero's: the board column is pinned at its 260px minimum from 864px down, so
        below 720px the copy column is under 420px and the headline outgrows the board's height.
  */
  @container (max-width: 940px) {
    .downtime-feature-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container (max-width: 720px) {
    .downtime-hero {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @container (max-width: 640px) {
    .downtime-preview {
      padding: 10px;
    }

    .downtime-feature-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .downtime-cta {
      width: 100%;
    }

    .downtime-benefits-note {
      text-align: left;
    }
  }
</style>
