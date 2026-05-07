<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';
  import { dismissOnOutsideClick } from '../actions/dismissOnOutsideClick.js';

  const DEFAULT_ACTOR_IMAGE = 'icons/svg/mystery-man.svg';

  let {
    availableActors = [],
    ownedActors = [],
    onSelectActor,
    onToggleSource
  } = $props();

  let openMenu = $state(null);
  let actorSearch = $state('');
  let sourceSearch = $state('');

  const selectedCraftingActor = $derived(
    availableActors.find((actor) => actor.selected) || null
  );
  const selectedSourceActors = $derived(
    ownedActors.filter((actor) => actor.selected)
  );
  const filteredCraftingActors = $derived(
    filterActors(availableActors, actorSearch)
  );
  const filteredSourceActors = $derived(
    filterActors(ownedActors, sourceSearch)
  );

  function filterActors(actors, term) {
    const needle = String(term || '').trim().toLowerCase();
    if (!needle) return actors;
    return actors.filter((actor) => actor.name.toLowerCase().includes(needle));
  }

  function imageFor(actor) {
    return actor?.img || DEFAULT_ACTOR_IMAGE;
  }

  function closeMenus() {
    openMenu = null;
  }

  function toggleMenu(menu) {
    openMenu = openMenu === menu ? null : menu;
    if (menu === 'actor') actorSearch = '';
    if (menu === 'sources') sourceSearch = '';
  }

  function selectCraftingActor(actorId) {
    onSelectActor?.(actorId);
    closeMenus();
  }

  function toggleSource(actorId, checked) {
    onToggleSource?.(actorId, checked);
  }

  function removeSource(event, actor) {
    event.preventDefault();
    if (actor?.locked) return;
    onToggleSource?.(actor.id, false);
  }
</script>

<header class="actor-crafting-header">
  <div
    class="actor-crafting-header__primary"
    use:dismissOnOutsideClick={{
      enabled: openMenu === 'actor',
      onDismiss: closeMenus
    }}
  >
    <button
      type="button"
      class="selected-crafting-actor"
      aria-haspopup="menu"
      aria-expanded={openMenu === 'actor'}
      aria-label={localize('FABRICATE.CraftingHeader.ChangeCraftingActor')}
      onclick={() => toggleMenu('actor')}
    >
      <img
        class="actor-crafting-header__avatar"
        src={imageFor(selectedCraftingActor)}
        alt=""
      />
      <span class="selected-crafting-actor__text">
        <span class="selected-crafting-actor__label">{localize('FABRICATE.ActorSelector.CraftWith')}</span>
        <span class="selected-crafting-actor__name">
          {selectedCraftingActor?.name || localize('FABRICATE.CraftingHeader.NoCraftingActor')}
        </span>
      </span>
      <i class="fas fa-chevron-down" aria-hidden="true"></i>
    </button>

    {#if openMenu === 'actor'}
      <div class="actor-menu" role="menu">
        <label class="actor-menu__search">
          <i class="fas fa-search" aria-hidden="true"></i>
          <input
            type="search"
            bind:value={actorSearch}
            placeholder={localize('FABRICATE.CraftingHeader.SearchActors')}
            aria-label={localize('FABRICATE.CraftingHeader.SearchActors')}
          />
        </label>
        <div class="actor-menu__list">
          {#if filteredCraftingActors.length > 0}
            {#each filteredCraftingActors as actor (actor.id)}
              <button
                type="button"
                class="actor-menu__row"
                class:active={actor.selected}
                role="menuitem"
                onclick={() => selectCraftingActor(actor.id)}
              >
                <img class="actor-menu__avatar" src={imageFor(actor)} alt="" />
                <span class="actor-menu__name">
                  {actor.name}{#if actor.isAssignedCharacter} {localize('FABRICATE.ActorSelector.AssignedMarker')}{/if}
                </span>
                {#if actor.selected}
                  <i class="fas fa-check" aria-hidden="true"></i>
                {/if}
              </button>
            {/each}
          {:else}
            <p class="actor-menu__empty">{localize('FABRICATE.CraftingHeader.NoActorsFound')}</p>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <div
    class="actor-crafting-header__sources"
    use:dismissOnOutsideClick={{
      enabled: openMenu === 'sources',
      onDismiss: closeMenus
    }}
  >
    <span class="component-sources-title">{localize('FABRICATE.CraftingHeader.ComponentSources')}</span>
    <div class="component-source-avatars" aria-label={localize('FABRICATE.CraftingHeader.ComponentSources')}>
      {#if selectedSourceActors.length > 0}
        {#each selectedSourceActors as actor (actor.id)}
          <button
            type="button"
            class="component-source-avatar"
            class:component-source-avatar--locked={actor.locked}
            aria-label={localize('FABRICATE.CraftingHeader.RemoveSource').replace('{name}', actor.name)}
            title={actor.name}
            oncontextmenu={(event) => removeSource(event, actor)}
          >
            <img src={imageFor(actor)} alt="" />
            <span class="component-source-avatar__name">{actor.name}</span>
          </button>
        {/each}
      {:else}
        <span class="component-source-avatars__empty">{localize('FABRICATE.CraftingHeader.NoSources')}</span>
      {/if}
    </div>

    <button
      type="button"
      class="component-sources-edit"
      aria-haspopup="menu"
      aria-expanded={openMenu === 'sources'}
      aria-label={localize('FABRICATE.CraftingHeader.EditComponentSources')}
      title={localize('FABRICATE.CraftingHeader.EditComponentSources')}
      onclick={() => toggleMenu('sources')}
    >
      <i class="fas fa-users-cog" aria-hidden="true"></i>
    </button>

    {#if openMenu === 'sources'}
      <div class="actor-menu actor-menu--sources" role="menu">
        <label class="actor-menu__search">
          <i class="fas fa-search" aria-hidden="true"></i>
          <input
            type="search"
            bind:value={sourceSearch}
            placeholder={localize('FABRICATE.CraftingHeader.SearchSources')}
            aria-label={localize('FABRICATE.CraftingHeader.SearchSources')}
          />
        </label>
        <div class="actor-menu__list">
          {#if filteredSourceActors.length > 0}
            {#each filteredSourceActors as actor (actor.id)}
              <button
                type="button"
                class="actor-menu__row"
                class:active={actor.selected}
                class:locked={actor.locked}
                role="menuitemcheckbox"
                aria-checked={actor.selected}
                disabled={actor.locked}
                title={actor.locked ? localize('FABRICATE.CraftingHeader.RequiredSource') : actor.name}
                onclick={() => toggleSource(actor.id, !actor.selected)}
              >
                <img class="actor-menu__avatar" src={imageFor(actor)} alt="" />
                <span class="actor-menu__name">{actor.name}</span>
                <i
                  class={actor.selected ? 'fas fa-check-square' : 'far fa-square'}
                  aria-hidden="true"
                ></i>
              </button>
            {/each}
          {:else}
            <p class="actor-menu__empty">{localize('FABRICATE.CraftingHeader.NoActorsFound')}</p>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</header>

<style>
  .actor-crafting-header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    min-height: 58px;
    padding: 8px 12px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.22);
    background: rgba(0, 0, 0, 0.08);
    position: relative;
    z-index: 5;
  }

  .actor-crafting-header__primary,
  .actor-crafting-header__sources {
    position: relative;
    min-width: 0;
  }

  .actor-crafting-header__primary {
    flex: 1 1 220px;
  }

  .actor-crafting-header__sources {
    flex: 1 1 300px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }

  .selected-crafting-actor {
    width: min(100%, 360px);
    min-height: 42px;
    display: inline-flex;
    align-items: center;
    gap: 9px;
    padding: 4px 9px 4px 5px;
    border: 1px solid rgba(0, 0, 0, 0.24);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.12);
    color: inherit;
    cursor: pointer;
    text-align: left;
  }

  .selected-crafting-actor:hover,
  .selected-crafting-actor:focus-visible,
  .component-sources-edit:hover,
  .component-sources-edit:focus-visible {
    background: rgba(255, 255, 255, 0.18);
    border-color: rgba(0, 0, 0, 0.38);
  }

  .actor-crafting-header__avatar,
  .actor-menu__avatar,
  .component-source-avatar img {
    object-fit: cover;
    background: rgba(0, 0, 0, 0.08);
  }

  .actor-crafting-header__avatar {
    width: 34px;
    height: 34px;
    border-radius: 6px;
    border: 1px solid rgba(0, 0, 0, 0.22);
    flex: 0 0 auto;
  }

  .selected-crafting-actor__text {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1 1 auto;
  }

  .selected-crafting-actor__label,
  .component-sources-title {
    font-size: 11px;
    line-height: 1.1;
    opacity: 0.72;
    white-space: nowrap;
  }

  .selected-crafting-actor__name {
    font-size: 14px;
    line-height: 1.15;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .component-sources-title {
    font-weight: 600;
  }

  .component-source-avatars {
    min-width: 44px;
    max-width: min(40vw, 320px);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
    overflow: visible;
    padding: 2px 0;
  }

  .component-source-avatar {
    position: relative;
    flex: 0 0 auto;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 1px solid rgba(0, 0, 0, 0.24);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.12);
    cursor: context-menu;
  }

  .component-source-avatar--locked {
    border-color: rgba(74, 144, 226, 0.72);
    box-shadow: 0 0 0 1px rgba(74, 144, 226, 0.28);
  }

  .component-source-avatar img {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 5px;
  }

  .component-source-avatar__name {
    position: absolute;
    left: 50%;
    top: calc(100% + 5px);
    transform: translateX(-50%);
    max-width: 180px;
    padding: 3px 6px;
    border-radius: 4px;
    background: rgba(20, 20, 20, 0.94);
    color: #fff;
    font-size: 11px;
    line-height: 1.2;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    z-index: 3;
  }

  .component-source-avatar:hover .component-source-avatar__name,
  .component-source-avatar:focus-visible .component-source-avatar__name {
    opacity: 1;
  }

  .component-source-avatars__empty {
    font-size: 12px;
    opacity: 0.68;
    white-space: nowrap;
  }

  .component-sources-edit {
    flex: 0 0 auto;
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid rgba(0, 0, 0, 0.24);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.12);
    color: inherit;
    cursor: pointer;
  }

  .actor-menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    width: min(320px, calc(100vw - 32px));
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid rgba(0, 0, 0, 0.24);
    border-radius: 6px;
    background: #2f3438;
    color: #f3f0ea;
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.35);
    z-index: 10;
  }

  .actor-menu--sources {
    left: auto;
    right: 0;
  }

  .actor-menu__search {
    position: relative;
    display: block;
  }

  .actor-menu__search i {
    position: absolute;
    left: 9px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 12px;
    opacity: 0.55;
    pointer-events: none;
  }

  .actor-menu__search input {
    width: 100%;
    height: 30px;
    padding: 5px 8px 5px 28px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 5px;
    background: rgba(0, 0, 0, 0.22);
    color: #f3f0ea;
    font-size: 13px;
  }

  .actor-menu__search input::placeholder {
    color: rgba(243, 240, 234, 0.62);
  }

  .actor-menu__list {
    max-height: 240px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .actor-menu__row {
    width: 100%;
    min-height: 38px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 7px 4px 4px;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .actor-menu__row:hover,
  .actor-menu__row:focus-visible,
  .actor-menu__row.active {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.18);
  }

  .actor-menu__row.locked,
  .actor-menu__row:disabled {
    cursor: default;
    opacity: 0.78;
  }

  .actor-menu__avatar {
    width: 28px;
    height: 28px;
    border-radius: 5px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    flex: 0 0 auto;
  }

  .actor-menu__name {
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .actor-menu__empty {
    margin: 6px 4px;
    font-size: 12px;
    opacity: 0.72;
  }

  @container actor-app (max-width: 620px) {
    .actor-crafting-header {
      align-items: stretch;
      flex-direction: column;
      gap: 8px;
    }

    .actor-crafting-header__primary,
    .actor-crafting-header__sources,
    .selected-crafting-actor {
      width: 100%;
    }

    .actor-crafting-header__sources {
      justify-content: flex-start;
    }

    .component-source-avatars {
      max-width: none;
      flex: 1 1 auto;
    }

    .actor-menu,
    .actor-menu--sources {
      left: 0;
      right: auto;
      width: 100%;
    }
  }
</style>
