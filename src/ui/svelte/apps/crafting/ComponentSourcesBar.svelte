<!-- Svelte 5 runes mode -->
<!--
  ComponentSourcesBar is the Crafting tab's right-slot content in the shared
  ActorSelectTopBar. It shows the actors whose inventories the listing pulls
  ingredients from (services.craftingSources.sources) as a row of focusable avatar
  buttons, plus an edit/add popover (reusing .actor-bar-popover) listing every
  owned actor to toggle.

  A11y: each avatar is a <button> with an always-present aria-label (the actor
  name); the visible name reveals on :hover AND :focus-visible; removal uses a
  visible + keyboard "×" (shown on hover/focus) and right-click as an additive
  shortcut. The required (non-removable) crafting actor renders with a lock badge,
  aria-disabled, and an "always included" aria suffix, and exposes no "×".
-->
<script>
  import { dismissOnOutsideClick } from '../../actions/dismissOnOutsideClick.js';
  import { localize } from '../../util/foundryBridge.js';

  let { services = null } = $props();

  const store = $derived(services?.craftingSources ?? null);
  const sources = $derived(store?.sources ?? []);
  const available = $derived(store?.available ?? []);
  const selectedIds = $derived(new Set(store?.selectedSourceIds ?? []));

  let editorOpen = $state(false);
  let barRoot = $state(null);

  function hasImg(actor) {
    return typeof actor?.img === 'string' && actor.img.trim() !== '';
  }

  function ariaLabelFor(source) {
    return source.removable === false
      ? `${source.name} — ${localize('FABRICATE.App.Crafting.Sources.AlwaysIncluded')}`
      : source.name;
  }

  function removeSource(id, event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    store?.remove(id);
  }

  // Right-click a removable avatar as an additive removal shortcut.
  function onAvatarContext(source, event) {
    if (source.removable === false) return;
    event.preventDefault();
    store?.remove(source.id);
  }

  function toggleEditor() {
    editorOpen = !editorOpen;
  }
  function closeEditor() {
    editorOpen = false;
  }
  function toggleAvailable(id) {
    store?.toggle(id);
  }
</script>

<div
  bind:this={barRoot}
  class="crafting-sources-bar"
  data-crafting-sources
  use:dismissOnOutsideClick={{ enabled: editorOpen, onDismiss: closeEditor }}
>
  <span class="crafting-sources-label">{localize('FABRICATE.App.Crafting.Sources.Label')}</span>

  <div class="crafting-sources-avatars" role="group" aria-label={localize('FABRICATE.App.Crafting.Sources.Label')}>
    {#each sources as source (source.id)}
      <span class="crafting-source" data-source-id={source.id} data-source-removable={source.removable === false ? 'false' : 'true'}>
        <button
          type="button"
          class="crafting-source-avatar"
          class:is-required={source.removable === false}
          aria-label={ariaLabelFor(source)}
          aria-disabled={source.removable === false ? 'true' : null}
          title={source.name}
          oncontextmenu={(event) => onAvatarContext(source, event)}
        >
          <span class="crafting-source-portrait" aria-hidden="true">
            {#if hasImg(source)}
              <img src={source.img} alt="" />
            {:else}
              <i class="fas fa-user"></i>
            {/if}
          </span>
          {#if source.removable === false}
            <span class="crafting-source-lock" aria-hidden="true">
              <i class="fas fa-lock"></i>
            </span>
          {/if}
        </button>
        {#if source.removable !== false}
          <button
            type="button"
            class="crafting-source-remove"
            data-source-remove={source.id}
            aria-label={localize('FABRICATE.App.Crafting.Sources.Remove', { name: source.name })}
            title={localize('FABRICATE.App.Crafting.Sources.Remove', { name: source.name })}
            onclick={(event) => removeSource(source.id, event)}
          >
            <i class="fas fa-xmark" aria-hidden="true"></i>
          </button>
        {/if}
      </span>
    {/each}

    <button
      type="button"
      class="crafting-sources-add"
      data-crafting-sources-add
      aria-haspopup="dialog"
      aria-expanded={editorOpen}
      aria-label={localize('FABRICATE.App.Crafting.Sources.Edit')}
      title={localize('FABRICATE.App.Crafting.Sources.Edit')}
      onclick={toggleEditor}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
    </button>

    {#if editorOpen}
      <div
        class="crafting-sources-popover"
        role="dialog"
        aria-label={localize('FABRICATE.App.Crafting.Sources.Edit')}
      >
        <div class="crafting-source-options" role="listbox" aria-label={localize('FABRICATE.App.Crafting.Sources.Edit')}>
          {#each available as actor (actor.id)}
            <button
              type="button"
              class="crafting-source-option"
              class:is-selected={selectedIds.has(actor.id)}
              role="option"
              aria-selected={selectedIds.has(actor.id)}
              title={actor.name}
              onclick={() => toggleAvailable(actor.id)}
            >
              <span class="crafting-source-option-portrait" aria-hidden="true">
                {#if hasImg(actor)}
                  <img src={actor.img} alt="" />
                {:else}
                  <i class="fas fa-user"></i>
                {/if}
              </span>
              <span class="crafting-source-option-name">{actor.name}</span>
              {#if selectedIds.has(actor.id)}
                <i class="fas fa-check crafting-source-option-check" aria-hidden="true"></i>
              {/if}
            </button>
          {:else}
            <p class="crafting-sources-empty">{localize('FABRICATE.App.Crafting.Sources.Empty')}</p>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .crafting-sources-bar {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .crafting-sources-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-text-muted);
    white-space: nowrap;
  }

  .crafting-sources-avatars {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .crafting-source {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  /* The image dims on hover/focus so the centered remove "×" reads clearly over it.
     The name is exposed via the avatar's title tooltip + aria-label, not an inline
     label that would reflow the row. */
  .crafting-source:hover .crafting-source-portrait img,
  .crafting-source:focus-within .crafting-source-portrait img {
    filter: brightness(0.5);
  }

  .crafting-source-avatar {
    box-sizing: border-box;
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    min-height: 40px;
    padding: 0;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface);
    color: var(--fab-text-muted);
    cursor: pointer;
  }

  .crafting-source-avatar.is-required {
    border-color: var(--fab-accent);
    cursor: default;
  }

  .crafting-source-avatar:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .crafting-source-portrait {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    border-radius: inherit;
    overflow: hidden;
  }

  .crafting-source-portrait img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .crafting-source-lock {
    position: absolute;
    right: -4px;
    bottom: -4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 999px;
    background: var(--fab-accent);
    color: var(--fab-on-accent, var(--fab-surface));
    font-size: 8px;
  }

  /* The remove control is a centered overlay covering the avatar; on hover/focus a
     "×" appears over the (dimmed) image. Hidden otherwise so the row stays calm. */
  .crafting-source-remove {
    box-sizing: border-box;
    position: absolute;
    inset: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: var(--fab-overlay-dark-24);
    color: var(--fab-text);
    font-size: 15px;
    opacity: 0;
    cursor: pointer;
  }

  .crafting-source:hover .crafting-source-remove,
  .crafting-source:focus-within .crafting-source-remove,
  .crafting-source-remove:focus-visible {
    opacity: 1;
  }

  .crafting-source-remove:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .crafting-sources-add {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    min-height: 40px;
    padding: 0;
    border: 1px dashed var(--fab-border);
    border-radius: 8px;
    background: transparent;
    color: var(--fab-text-muted);
    cursor: pointer;
  }

  .crafting-sources-add:hover {
    background: var(--fab-surface-raised);
    color: var(--fab-text);
  }

  .crafting-sources-add:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  /* In-place popover listing every owned actor to toggle as a source. Mirrors the
     actor-bar popover visual treatment, scoped locally (the actor-bar's own
     popover styles are component-scoped and do not reach here). */
  .crafting-sources-popover {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    left: auto;
    z-index: 4000;
    display: flex;
    flex-direction: column;
    width: max-content;
    min-width: 220px;
    max-width: 320px;
    max-height: min(60vh, 420px);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface);
    box-shadow: var(--fab-shadow-lg);
    overflow: hidden;
  }

  .crafting-source-options {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px;
    overflow-y: auto;
  }

  .crafting-source-option {
    box-sizing: border-box;
    position: relative;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    height: auto;
    min-height: 44px;
    padding: 4px 8px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--fab-text);
    text-align: left;
    cursor: pointer;
  }

  .crafting-source-option:hover {
    background: var(--fab-surface-raised);
  }

  .crafting-source-option.is-selected {
    background: var(--fab-accent-soft);
    border-color: var(--fab-accent);
    color: var(--fab-accent);
  }

  .crafting-source-option:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .crafting-source-option-portrait {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    overflow: hidden;
    background: var(--fab-surface-raised);
    color: var(--fab-text-muted);
  }

  .crafting-source-option-portrait img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .crafting-source-option-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .crafting-source-option-check {
    flex: 0 0 auto;
    margin-left: auto;
    color: var(--fab-accent);
  }

  .crafting-sources-empty {
    margin: 0;
    padding: 8px;
    color: var(--fab-text-muted);
    font-size: 12px;
  }
</style>
