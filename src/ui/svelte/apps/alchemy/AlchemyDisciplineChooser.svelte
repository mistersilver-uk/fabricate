<!-- Svelte 5 runes mode -->
<!--
  AlchemyDisciplineChooser — shown when more than one enabled alchemy discipline
  exists. A card per discipline (icon, name, "N known . M total", blurb, Enter).
  Cards and the heading are real buttons/headings; on mount (i.e. when a Switch
  returns here) focus moves to the heading. "Discipline" is player-facing copy for
  an alchemy (crafting) system.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let { systems = [], onChoose = null } = $props();

  let heading = $state(null);

  // Move focus to the chooser heading whenever the chooser mounts (so a Switch
  // lands keyboard focus here, not on a stale control in the previous view).
  $effect(() => {
    heading?.focus?.();
  });
</script>

<div class="alchemy-chooser">
  <div class="alchemy-chooser-inner">
    <div class="alchemy-chooser-header">
      <span class="alchemy-chooser-mark" aria-hidden="true">
        <i class="fas fa-flask-vial"></i>
      </span>
      <h2 class="alchemy-chooser-heading" tabindex="-1" bind:this={heading}>
        {localize('FABRICATE.App.Alchemy.ChooseDiscipline')}
      </h2>
      <p class="alchemy-chooser-hint">{localize('FABRICATE.App.Alchemy.ChooseDisciplineHint')}</p>
    </div>

    <div class="alchemy-chooser-grid">
      {#each systems as system (system.id)}
        <button
          type="button"
          class="alchemy-chooser-card"
          data-alchemy-chooser-card={system.id}
          onclick={() => onChoose?.(system.id)}
        >
          <span class="alchemy-chooser-card-top">
            <span class="alchemy-chooser-card-icon">
              {#if system.img}
                <img src={system.img} alt="" />
              {:else}
                <i class="fas fa-flask" aria-hidden="true"></i>
              {/if}
            </span>
            <span class="alchemy-chooser-card-heading">
              <span class="alchemy-chooser-card-name">{system.name}</span>
              <span class="alchemy-chooser-card-count">
                {localize('FABRICATE.App.Alchemy.SystemSummary', {
                  known: system.knownCount,
                  total: system.totalCount
                })}
              </span>
            </span>
          </span>
          {#if system.description}
            <span class="alchemy-chooser-card-blurb">{system.description}</span>
          {/if}
          <span class="alchemy-chooser-card-enter">
            {localize('FABRICATE.App.Alchemy.EnterDiscipline')}
            <i class="fas fa-arrow-right-long" aria-hidden="true"></i>
          </span>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .alchemy-chooser {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    height: 100%;
    overflow-y: auto;
    padding: clamp(28px, 6vh, 64px) 24px;
    background: var(--fab-surface);
    color: var(--fab-text);
    container-type: inline-size;
  }

  .alchemy-chooser-inner {
    width: 100%;
    max-width: 720px;
  }

  /* Centered hero header: icon mark, heading, one-line intro. */
  .alchemy-chooser-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    margin-bottom: 28px;
  }

  .alchemy-chooser-mark {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    margin-bottom: 14px;
    border-radius: 14px;
    background: var(--fab-accent-soft);
    border: 1px solid var(--fab-accent-border);
    color: var(--fab-accent);
    font-size: 20px;
  }

  .alchemy-chooser-heading {
    margin: 0;
    font-family: var(--font-primary);
    font-size: 21px;
    font-weight: 600;
    line-height: 1.2;
    color: var(--fab-text);
    border: none;
    outline: none;
  }

  .alchemy-chooser-hint {
    margin: 8px 0 0;
    max-width: 42ch;
    font-size: 13px;
    line-height: 1.5;
    color: var(--fab-text-muted);
  }

  .alchemy-chooser-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  @container (max-width: 520px) {
    .alchemy-chooser-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .alchemy-chooser-card {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    min-height: 152px;
    padding: 18px;
    border-radius: 14px;
    border: 1px solid var(--fab-border);
    background: var(--fab-surface-soft);
    color: var(--fab-text);
    cursor: pointer;
    text-align: left;
    transition:
      border-color 120ms ease,
      background-color 120ms ease,
      transform 120ms ease,
      box-shadow 120ms ease;
  }

  .alchemy-chooser-card:hover {
    border-color: var(--fab-accent-border);
    background: var(--fab-surface-active);
    transform: translateY(-2px);
    box-shadow: var(--fab-shadow-md);
  }

  .alchemy-chooser-card:focus-visible {
    outline: none;
    border-color: var(--fab-accent-border);
    box-shadow: 0 0 0 2px var(--fab-accent-soft);
  }

  .alchemy-chooser-card-top {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .alchemy-chooser-card-icon {
    flex: 0 0 auto;
    width: 44px;
    height: 44px;
    border-radius: 11px;
    background: var(--fab-surface-raised);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--fab-accent);
    font-size: 18px;
    overflow: hidden;
  }

  .alchemy-chooser-card-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .alchemy-chooser-card-heading {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .alchemy-chooser-card-name {
    font-family: var(--font-primary);
    font-size: 16px;
    font-weight: 600;
    line-height: 1.2;
    color: var(--fab-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .alchemy-chooser-card-count {
    font-size: 11px;
    letter-spacing: 0.02em;
    color: var(--fab-text-subtle);
  }

  .alchemy-chooser-card-blurb {
    font-size: 12px;
    line-height: 1.5;
    color: var(--fab-text-muted);
    /* Clamp the blurb so cards keep a consistent height. */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .alchemy-chooser-card-enter {
    margin-top: auto;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-accent);
  }

  .alchemy-chooser-card:hover .alchemy-chooser-card-enter i {
    transform: translateX(2px);
  }

  .alchemy-chooser-card-enter i {
    font-size: 10px;
    transition: transform 120ms ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .alchemy-chooser-card,
    .alchemy-chooser-card-enter i {
      transition: none;
    }
    .alchemy-chooser-card:hover {
      transform: none;
    }
  }
</style>
