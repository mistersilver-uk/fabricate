<!-- Svelte 5 runes mode -->
<!--
  Workbench — the center column of the Alchemy tab: the working bench, the
  five-mode status pill, the Produces panel, and the full-width Brew button with a
  last-brew banner. Self-contained + prop-driven: it derives the status/Brew copy
  from `mode` + `targetName` so it can be mounted in isolation and asserts the
  mode -> status-pill + Brew-disabled binding.

  Interactions: it is BOTH a drop target (drag a component in, dashed dragover cue)
  and hosts tap-added chips; each chip's `x` is a real focusable button and a
  right-click removes it. The status pill is `aria-live="polite"`; the drop zone
  has an accessible name/role plus a non-color dragover cue (the dashed border
  thickens). The ready-state `brewpulse` animation honors prefers-reduced-motion.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    benchChips = [],
    benchEmpty = true,
    signatureText = '',
    mode = 'empty',
    targetName = '',
    result = null,
    missing = [],
    brewEnabled = false,
    brewInFlight = false,
    lastBrew = null,
    onClear = null,
    onRemoveOne = null,
    onBrew = null,
    onDrop = null
  } = $props();

  let dragOver = $state(false);

  const STATUS_KEYS = {
    empty: 'FABRICATE.App.Alchemy.Status.Empty',
    assembling: 'FABRICATE.App.Alchemy.Status.Assembling',
    ready: 'FABRICATE.App.Alchemy.Status.Ready',
    untried: 'FABRICATE.App.Alchemy.Status.Untried',
    'no-reaction': 'FABRICATE.App.Alchemy.Status.NoReaction'
  };
  const STATUS_ICONS = {
    empty: 'fa-circle-info',
    assembling: 'fa-layer-group',
    ready: 'fa-circle-check',
    untried: 'fa-wand-sparkles',
    'no-reaction': 'fa-ban'
  };

  const statusText = $derived(
    localize(STATUS_KEYS[mode] ?? STATUS_KEYS.empty, { name: targetName })
  );
  const statusIcon = $derived(STATUS_ICONS[mode] ?? STATUS_ICONS.empty);

  const brewLabel = $derived.by(() => {
    if (mode === 'ready')
      return localize('FABRICATE.App.Alchemy.BrewAction.Ready', { name: targetName });
    if (mode === 'untried') return localize('FABRICATE.App.Alchemy.BrewAction.Experiment');
    if (mode === 'no-reaction')
      return localize('FABRICATE.App.Alchemy.BrewAction.ExperimentAnyway');
    if (mode === 'assembling') return localize('FABRICATE.App.Alchemy.BrewAction.AddMissing');
    return localize('FABRICATE.App.Alchemy.BrewAction.Default');
  });
  const brewIcon = $derived.by(() => {
    if (mode === 'ready') return 'fa-mortar-pestle';
    if (mode === 'untried') return 'fa-wand-sparkles';
    if (mode === 'no-reaction') return 'fa-flask';
    if (mode === 'assembling') return 'fa-lock';
    return 'fa-mortar-pestle';
  });

  const showResult = $derived((mode === 'ready' || mode === 'assembling') && result);
  const showUnknown = $derived(mode === 'untried');
  const showMissing = $derived(mode === 'assembling' && missing.length > 0);

  // Brew status enum → banner tone + icon. `produced-on-failure` is a distinct
  // WARNING state (a failed Simple brew that still yielded the failure result set),
  // never success-green; a discovery composes with it.
  const bannerStatus = $derived(lastBrew?.status ?? null);
  const bannerTone = $derived.by(() => {
    if (bannerStatus === 'success' || bannerStatus === 'tiered-tier') return 'is-success';
    if (bannerStatus === 'produced-on-failure') return 'is-warning';
    return 'is-danger';
  });
  const bannerIcon = $derived.by(() => {
    if (bannerStatus === 'success' || bannerStatus === 'tiered-tier') return 'fa-circle-check';
    if (bannerStatus === 'produced-on-failure') return 'fa-triangle-exclamation';
    return 'fa-circle-xmark';
  });

  const bannerText = $derived.by(() => {
    if (!lastBrew) return '';
    if (bannerStatus === 'produced-on-failure') {
      return lastBrew.discovered
        ? localize('FABRICATE.App.Alchemy.Banner.DiscoveredOnFailure', { name: lastBrew.discovered })
        : localize('FABRICATE.App.Alchemy.Banner.ProducedOnFailure');
    }
    if (bannerStatus === 'success' || bannerStatus === 'tiered-tier') {
      if (lastBrew.discovered) {
        return localize('FABRICATE.App.Alchemy.Banner.Discovered', { name: lastBrew.discovered });
      }
      if (bannerStatus === 'tiered-tier') {
        return lastBrew.message || localize('FABRICATE.App.Alchemy.Banner.TieredTier');
      }
      return lastBrew.message || localize('FABRICATE.App.Alchemy.Banner.Brewed');
    }
    return lastBrew.message || localize('FABRICATE.App.Alchemy.Banner.Fizzled');
  });

  function handleDrop(event) {
    event.preventDefault();
    dragOver = false;
    const componentId = event.dataTransfer?.getData('text/plain');
    if (componentId) onDrop?.(componentId);
  }
</script>

<div class="alchemy-workbench">
  <div class="alchemy-workbench-head">
    <div class="alchemy-workbench-title">
      <i class="fas fa-mortar-pestle" aria-hidden="true"></i>
      <h2>{localize('FABRICATE.App.Alchemy.Workbench')}</h2>
    </div>
    <button
      type="button"
      class="alchemy-clear"
      data-alchemy-clear
      disabled={benchEmpty}
      onclick={() => onClear?.()}
    >
      <i class="fas fa-arrow-rotate-left" aria-hidden="true"></i>
      {localize('FABRICATE.App.Alchemy.Clear')}
    </button>
  </div>
  <p class="alchemy-workbench-intro">{localize('FABRICATE.App.Alchemy.WorkbenchIntro')}</p>

  <div
    class="alchemy-bench"
    class:is-dragover={dragOver}
    class:is-empty={benchEmpty}
    role="group"
    aria-label={localize('FABRICATE.App.Alchemy.DropZone')}
    data-alchemy-dropzone
    ondragover={(event) => {
      event.preventDefault();
      dragOver = true;
    }}
    ondragleave={() => (dragOver = false)}
    ondrop={handleDrop}
  >
    {#if benchEmpty}
      <div class="alchemy-bench-empty">
        <span class="alchemy-bench-empty-icon"><i class="fas fa-hand-pointer" aria-hidden="true"></i></span>
        <div class="alchemy-bench-empty-title">{localize('FABRICATE.App.Alchemy.BenchEmptyTitle')}</div>
        <div class="alchemy-bench-empty-hint">{localize('FABRICATE.App.Alchemy.BenchEmptyHint')}</div>
      </div>
    {:else}
      <div class="alchemy-bench-grid">
        {#each benchChips as chip (chip.componentId)}
          <div
            class="alchemy-chip"
            role="group"
            aria-label={chip.name}
            oncontextmenu={(event) => {
              event.preventDefault();
              onRemoveOne?.(chip.componentId);
            }}
          >
            <button
              type="button"
              class="alchemy-chip-remove"
              data-alchemy-chip-remove={chip.componentId}
              aria-label={localize('FABRICATE.App.Alchemy.RemoveComponent', { name: chip.name })}
              onclick={() => onRemoveOne?.(chip.componentId)}
            >
              <i class="fas fa-xmark" aria-hidden="true"></i>
            </button>
            <span class="alchemy-chip-icon">
              {#if chip.img}
                <img src={chip.img} alt="" />
              {:else}
                <i class="fas fa-flask" aria-hidden="true"></i>
              {/if}
            </span>
            <div class="alchemy-chip-name">{chip.name}</div>
            <span class="alchemy-chip-qty">×{chip.qty}</span>
          </div>
        {/each}
      </div>
      <div class="alchemy-signature">
        <span class="alchemy-signature-label">{localize('FABRICATE.App.Alchemy.Signature')}</span>
        <span class="alchemy-signature-text">{signatureText}</span>
      </div>
    {/if}
  </div>

  <div class="alchemy-status alchemy-status-{mode}" data-alchemy-status={mode} aria-live="polite">
    <i class="fas {statusIcon}" aria-hidden="true"></i>
    <span>{statusText}</span>
  </div>

  <div class="alchemy-produces-label">{localize('FABRICATE.App.Alchemy.Produces')}</div>
  {#if showResult}
    <div class="alchemy-result" class:is-ready={mode === 'ready'} data-alchemy-result>
      <span class="alchemy-result-icon">
        {#if result.img}
          <img src={result.img} alt="" />
        {:else}
          <i class="fas fa-flask" aria-hidden="true"></i>
        {/if}
      </span>
      <div class="alchemy-result-meta">
        <div class="alchemy-result-name">{result.name}</div>
      </div>
      <span class="alchemy-result-qty">×{result.quantity}</span>
    </div>
  {:else if showUnknown}
    <div class="alchemy-unknown" data-alchemy-unknown>
      <span class="alchemy-unknown-icon"><i class="fas fa-question" aria-hidden="true"></i></span>
      <div>
        <div class="alchemy-unknown-title">{localize('FABRICATE.App.Alchemy.UnknownReactionTitle')}</div>
        <div class="alchemy-unknown-desc">{localize('FABRICATE.App.Alchemy.UnknownReactionDesc')}</div>
      </div>
    </div>
  {/if}

  {#if showMissing}
    <div class="alchemy-missing" data-alchemy-missing>
      <div class="alchemy-missing-label">{localize('FABRICATE.App.Alchemy.StillNeeded')}</div>
      <div class="alchemy-missing-rows">
        {#each missing as row (row.componentId)}
          <span class="alchemy-missing-chip"
            >{localize('FABRICATE.App.Alchemy.MissingRow', { name: row.name, need: row.need })}</span
          >
        {/each}
      </div>
    </div>
  {/if}

  <div class="alchemy-brew-area">
    {#if lastBrew}
      <div
        class="alchemy-banner {bannerTone}"
        data-alchemy-banner
        data-alchemy-banner-status={bannerStatus}
      >
        <i class="fas {bannerIcon}" aria-hidden="true"></i>
        <span>{bannerText}</span>
      </div>
    {/if}
    <button
      type="button"
      class="alchemy-brew"
      class:is-ready={mode === 'ready'}
      data-alchemy-brew
      disabled={!brewEnabled || brewInFlight}
      onclick={() => onBrew?.()}
    >
      <i class="fas {brewInFlight ? 'fa-spinner fa-spin' : brewIcon}" aria-hidden="true"></i>
      {brewLabel}
    </button>
  </div>
</div>

<style>
  .alchemy-workbench {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    padding: 22px 24px;
    overflow-y: auto;
    background: var(--fab-surface);
    border: 1px solid var(--fab-border);
    border-radius: 10px;
    color: var(--fab-text);
  }

  .alchemy-workbench-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .alchemy-workbench-title {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .alchemy-workbench-title i {
    color: var(--fab-accent);
    font-size: 14px;
  }

  .alchemy-workbench-title h2 {
    margin: 0;
    font-family: var(--font-primary);
    font-size: 18px;
    font-weight: 600;
    color: var(--fab-text);
    border: none;
  }

  .alchemy-clear {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 12px;
    border-radius: 8px;
    border: 1px solid var(--fab-border);
    background: var(--fab-surface-soft);
    color: var(--fab-text-secondary);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .alchemy-clear:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .alchemy-workbench-intro {
    margin: 0 0 16px;
    font-size: 11.5px;
    color: var(--fab-text-muted);
  }

  .alchemy-bench {
    border: 1.5px dashed var(--fab-border-strong);
    border-radius: 14px;
    background: var(--fab-surface-soft);
    padding: 16px;
    margin-bottom: 14px;
  }

  .alchemy-bench.is-empty {
    padding: 40px 20px;
  }

  .alchemy-bench.is-dragover {
    border-width: 2.5px;
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
  }

  .alchemy-bench-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    text-align: center;
  }

  .alchemy-bench-empty-icon {
    width: 52px;
    height: 52px;
    border-radius: 13px;
    background: var(--fab-surface-raised);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--fab-text-subtle);
    font-size: 20px;
  }

  .alchemy-bench-empty-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--fab-text-secondary);
  }

  .alchemy-bench-empty-hint {
    font-size: 11px;
    line-height: 1.5;
    color: var(--fab-text-subtle);
    max-width: 320px;
  }

  .alchemy-bench-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 10px;
  }

  .alchemy-chip {
    position: relative;
    border: 1px solid var(--fab-accent-border);
    border-radius: 11px;
    background: var(--fab-surface);
    padding: 12px 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 7px;
  }

  .alchemy-chip-remove {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 20px;
    height: 20px;
    border-radius: 6px;
    background: var(--fab-surface-soft);
    border: 1px solid var(--fab-border);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--fab-danger-text);
    font-size: 9px;
    cursor: pointer;
  }

  .alchemy-chip-icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: var(--fab-surface-soft);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--fab-tag-peach);
    font-size: 16px;
    overflow: hidden;
  }

  .alchemy-chip-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .alchemy-chip-name {
    font-size: 11.5px;
    font-weight: 600;
    text-align: center;
    line-height: 1.2;
  }

  .alchemy-chip-qty {
    font-family: var(--font-primary);
    font-size: 11px;
    font-weight: 700;
    color: var(--fab-accent);
  }

  .alchemy-signature {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--fab-border);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .alchemy-signature-label {
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--fab-text-subtle);
    font-weight: 700;
  }

  .alchemy-signature-text {
    font-family: var(--font-primary);
    font-size: 11px;
    color: var(--fab-text-secondary);
  }

  .alchemy-status {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 600;
    border: 1px solid var(--fab-border);
    background: var(--fab-surface-soft);
    color: var(--fab-text-muted);
  }

  .alchemy-status-assembling {
    color: var(--fab-info-text);
    background: var(--fab-info-soft);
    border-color: var(--fab-info-border);
  }

  .alchemy-status-ready {
    color: var(--fab-success-text);
    background: var(--fab-success-soft);
    border-color: var(--fab-success-border);
  }

  .alchemy-status-untried {
    color: var(--fab-warning-text);
    background: var(--fab-warning-soft);
    border-color: var(--fab-warning-border);
  }

  .alchemy-status-no-reaction {
    color: var(--fab-danger-text);
    background: var(--fab-danger-soft);
    border-color: var(--fab-danger-border);
  }

  .alchemy-produces-label {
    font-size: 9.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--fab-text-subtle);
    font-weight: 700;
    margin: 18px 0 10px;
  }

  .alchemy-result {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 18px;
    border-radius: 12px;
    border: 1px solid var(--fab-accent-border);
    background: var(--fab-surface-soft);
  }

  .alchemy-result.is-ready {
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
  }

  .alchemy-result-icon {
    width: 46px;
    height: 46px;
    flex: 0 0 auto;
    border-radius: 11px;
    background: var(--fab-surface-raised);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--fab-tag-peach);
    font-size: 19px;
    overflow: hidden;
  }

  .alchemy-result-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .alchemy-result-meta {
    flex: 1 1 auto;
    min-width: 0;
  }

  .alchemy-result-name {
    font-family: var(--font-primary);
    font-size: 15px;
    font-weight: 600;
    color: var(--fab-text);
  }

  .alchemy-result-qty {
    font-family: var(--font-primary);
    font-size: 18px;
    font-weight: 700;
    color: var(--fab-accent);
    flex: 0 0 auto;
  }

  .alchemy-unknown {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 18px;
    border-radius: 12px;
    border: 1px solid var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }

  .alchemy-unknown-icon {
    width: 46px;
    height: 46px;
    flex: 0 0 auto;
    border-radius: 11px;
    background: var(--fab-surface-raised);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--fab-warning-text);
    font-size: 20px;
  }

  .alchemy-unknown-title {
    font-family: var(--font-primary);
    font-size: 15px;
    font-weight: 600;
    color: var(--fab-warning-text);
  }

  .alchemy-unknown-desc {
    font-size: 11px;
    line-height: 1.45;
    color: var(--fab-text-muted);
    margin-top: 2px;
  }

  .alchemy-missing {
    margin-top: 10px;
    padding: 11px 13px;
    border-radius: 10px;
    background: var(--fab-info-soft);
    border: 1px solid var(--fab-info-border);
  }

  .alchemy-missing-label {
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--fab-info);
    font-weight: 700;
    margin-bottom: 8px;
  }

  .alchemy-missing-rows {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .alchemy-missing-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    border-radius: 999px;
    background: var(--fab-surface);
    border: 1px solid var(--fab-border);
    font-size: 10px;
    font-weight: 600;
    color: var(--fab-text-secondary);
  }

  .alchemy-brew-area {
    margin-top: auto;
    padding-top: 18px;
  }

  .alchemy-banner {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-bottom: 12px;
    padding: 11px 13px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 600;
    background: var(--fab-danger-soft);
    border: 1px solid var(--fab-danger-border);
    color: var(--fab-danger-text);
  }

  .alchemy-banner.is-success {
    background: var(--fab-success-soft);
    border-color: var(--fab-success-border);
    color: var(--fab-success-text);
  }

  .alchemy-banner.is-warning {
    background: var(--fab-warning-soft);
    border-color: var(--fab-warning-border);
    color: var(--fab-warning-text);
  }

  .alchemy-brew {
    width: 100%;
    height: 52px;
    border-radius: 11px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    border: 1px solid var(--fab-accent-border);
    background: var(--fab-accent);
    color: var(--fab-on-accent);
  }

  .alchemy-brew:disabled {
    cursor: not-allowed;
    border-color: var(--fab-border);
    background: var(--fab-surface-soft);
    color: var(--fab-text-disabled);
  }

  .alchemy-brew.is-ready:not(:disabled) {
    animation: alchemy-brewpulse 2.2s ease-in-out infinite;
  }

  @keyframes alchemy-brewpulse {
    0%,
    100% {
      box-shadow: 0 0 0 0 transparent;
    }
    50% {
      box-shadow: 0 0 0 4px var(--fab-accent-soft);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .alchemy-brew.is-ready:not(:disabled) {
      animation: none;
    }
  }
</style>
