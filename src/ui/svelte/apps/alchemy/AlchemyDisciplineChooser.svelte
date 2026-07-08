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
    <h2 class="alchemy-chooser-heading" tabindex="-1" bind:this={heading}>
      {localize('FABRICATE.App.Alchemy.ChooseDiscipline')}
    </h2>
    <p class="alchemy-chooser-hint">{localize('FABRICATE.App.Alchemy.ChooseDisciplineHint')}</p>

    <div class="alchemy-chooser-grid">
      {#each systems as system (system.id)}
        <button
          type="button"
          class="alchemy-chooser-card"
          data-alchemy-chooser-card={system.id}
          onclick={() => onChoose?.(system.id)}
        >
          <span class="alchemy-chooser-card-icon">
            {#if system.img}
              <img src={system.img} alt="" />
            {:else}
              <i class="fas fa-flask" aria-hidden="true"></i>
            {/if}
          </span>
          <span class="alchemy-chooser-card-name">{system.name}</span>
          <span class="alchemy-chooser-card-count"
            >{localize('FABRICATE.App.Alchemy.SystemSummary', {
              known: system.knownCount,
              total: system.totalCount
            })}</span
          >
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
    padding: 40px 24px;
    background: var(--fab-surface);
    color: var(--fab-text);
  }

  .alchemy-chooser-inner {
    width: 100%;
    max-width: 760px;
  }

  .alchemy-chooser-heading {
    margin: 0;
    font-family: var(--font-primary);
    font-size: 22px;
    font-weight: 600;
    color: var(--fab-text);
    border: none;
    outline: none;
  }

  .alchemy-chooser-hint {
    margin: 6px 0 20px;
    font-size: 13px;
    color: var(--fab-text-muted);
  }

  .alchemy-chooser-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 14px;
  }

  .alchemy-chooser-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 18px;
    border-radius: 12px;
    border: 1px solid var(--fab-border);
    background: var(--fab-surface-soft);
    color: var(--fab-text);
    cursor: pointer;
    text-align: left;
  }

  .alchemy-chooser-card:hover {
    border-color: var(--fab-accent-border);
    background: var(--fab-surface-active);
  }

  .alchemy-chooser-card-icon {
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

  .alchemy-chooser-card-name {
    font-family: var(--font-primary);
    font-size: 16px;
    font-weight: 600;
  }

  .alchemy-chooser-card-count {
    font-family: var(--font-primary);
    font-size: 11px;
    color: var(--fab-text-subtle);
  }

  .alchemy-chooser-card-blurb {
    font-size: 12px;
    line-height: 1.45;
    color: var(--fab-text-muted);
  }

  .alchemy-chooser-card-enter {
    margin-top: 4px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-accent);
  }
</style>
