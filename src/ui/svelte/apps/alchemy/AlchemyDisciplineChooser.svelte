<!-- Svelte 5 runes mode -->
<!--
  AlchemyDisciplineChooser — shown when more than one enabled alchemy discipline
  exists. A card per discipline (icon, name, "N known . M total", blurb, Enter), each
  ListRow's card layout, the merged browse card (issue 1778): an action button with no
  pressed state, since choosing enters the discipline. On mount (i.e. when a Switch
  returns here) focus moves to the heading. "Discipline" is player-facing copy for
  an alchemy (crafting) system.
-->
<script>
  import ListRow from '../../components/ListRow.svelte';
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
      <h2
        class="alchemy-chooser-heading"
        tabindex="-1"
        data-keyboard-focus="true"
        bind:this={heading}
      >
        {localize('FABRICATE.App.Alchemy.ChooseDiscipline')}
      </h2>
      <p class="alchemy-chooser-hint">{localize('FABRICATE.App.Alchemy.ChooseDisciplineHint')}</p>
    </div>

    <div class="alchemy-chooser-grid">
      {#each systems as system (system.id)}
        {#snippet count()}
          <span class="alchemy-chooser-card-count">
            {localize('FABRICATE.App.Alchemy.SystemSummary', {
              known: system.knownCount,
              total: system.totalCount,
            })}
          </span>
        {/snippet}
        {#snippet blurbAndEnter()}
          {#if system.description}
            <span class="alchemy-chooser-card-blurb">{system.description}</span>
          {/if}
          <!-- The visible cue to what activating does; the button's role already says it. -->
          <span class="alchemy-chooser-card-enter" aria-hidden="true">
            {localize('FABRICATE.App.Alchemy.EnterDiscipline')}
            <i class="fas fa-arrow-right-long" aria-hidden="true"></i>
          </span>
        {/snippet}
        <ListRow
          name={system.name}
          art={system.img}
          icon="fas fa-flask"
          markSize={38}
          layout="card"
          truncateName
          nameClass="alchemy-chooser-card-name"
          onOpen={() => onChoose?.(system.id)}
          openProps={{
            class: 'alchemy-chooser-card',
            'data-alchemy-chooser-card': system.id,
            'aria-label': system.name,
          }}
          meta={count}
          children={blurbAndEnter}
        />
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
    padding: 64px 24px;
    background: var(--fab-surface);
    color: var(--fab-text);
    container: fabricate-alchemy-chooser / inline-size;
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

  @container fabricate-alchemy-chooser (max-width: 520px) {
    .alchemy-chooser-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* The card, its button, its hover and its ring are ListRow's card layout (issue 1778). */
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
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin-top: var(--fab-space-2);
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-accent);
  }

  :global(.alchemy-chooser-card:hover) .alchemy-chooser-card-enter i {
    transform: translateX(2px);
  }

  .alchemy-chooser-card-enter i {
    font-size: 10px;
    transition: transform 120ms ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .alchemy-chooser-card-enter i {
      transition: none;
    }
  }
</style>
