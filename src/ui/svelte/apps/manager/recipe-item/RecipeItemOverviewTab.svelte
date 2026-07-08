<!-- Svelte 5 runes mode -->
<!--
  Overview tab of the recipe-item editor. A CONTROLLED, prop-driven view: it never
  mutates a store or model, it only emits callbacks the router merges into the draft.

  Contents:
   - A "Recipe item" link zone. FILLED = bordered chip with the linked item's icon,
     name, its UUID (mono), a Copy-UUID button and an Unlink button. EMPTY = a dashed
     DANGER drop zone ("Drop a game-world item here / or click to browse") that opens
     an ItemPickerModal fed from `worldItems`; dropping a Foundry item resolves it to
     a UUID via resolveDropData. Both link paths call `onLinkItem(uuid)`.
   - Name (read-only, from `linkedItem.name`, placeholder when unlinked) and
     Description (read-only, from the linked item) — the linked game-world item owns
     both, so they are never editable here.
   - An Enabled toggle → `onPatch({ enabled })`.

  Props:
   - recipeItem: `{ id, sourceItemUuid, img, enabled, caps }` draft (read-only here).
   - linkedItem: `{ uuid, name, img, type }|null` resolved game-world item.
   - worldItems: `[{ uuid, name, img, type }]` candidate items for the picker.
   - onPatch(patch): emit a partial recipe-item patch (here `{ enabled }`).
   - onLinkItem(uuid) / onUnlinkItem(): set / clear the linked game-world item.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { dragDrop } from '../../../actions/dragDrop.js';
  import { resolveDropData } from '../../../util/dropUtils.js';
  import ItemPickerModal from '../ItemPickerModal.svelte';

  let {
    recipeItem = null,
    linkedItem = null,
    worldItems = [],
    onPatch = () => {},
    onLinkItem = () => {},
    onUnlinkItem = () => {}
  } = $props();

  let pickerOpen = $state(false);
  let copied = $state(false);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const hasLink = $derived(Boolean(linkedItem?.uuid));
  const uuid = $derived(String(linkedItem?.uuid || recipeItem?.sourceItemUuid || ''));
  const itemName = $derived(String(linkedItem?.name || ''));
  const itemImg = $derived(String(linkedItem?.img || recipeItem?.img || ''));
  const itemType = $derived(String(linkedItem?.type || ''));
  const description = $derived(String(linkedItem?.description || ''));
  const enabled = $derived(recipeItem?.enabled !== false);

  // Dropping a persisted Foundry Item carries a resolvable UUID; an unpersisted drop
  // ({ type: 'Item' } with no uuid) is a silent no-op, matching RecipeItemInspector.
  function handleItemDrop(data) {
    const { uuid: droppedUuid, type } = resolveDropData(data);
    if (type !== 'Item' || !droppedUuid) return;
    onLinkItem(droppedUuid);
  }

  function openPicker() {
    pickerOpen = true;
  }

  function pickItem(pickedUuid) {
    if (pickedUuid) onLinkItem(pickedUuid);
  }

  async function copyUuid() {
    if (!uuid) return;
    try {
      await globalThis.navigator?.clipboard?.writeText?.(uuid);
      copied = true;
      globalThis.setTimeout?.(() => { copied = false; }, 1200);
    } catch {
      copied = false;
    }
  }

  function toggleEnabled() {
    onPatch({ enabled: !enabled });
  }
</script>

<section class="manager-recipe-item-tab" data-recipe-item-tab="overview" aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Overview.Title', 'Overview')}>
  <div class="manager-recipe-item-field">
    <span class="manager-recipe-item-label">{text('FABRICATE.Admin.Manager.RecipeItem.Overview.LinkLabel', 'Recipe item')}</span>
    {#if hasLink}
      <!-- Drop-to-replace is an enhancement; the visible Copy/Unlink buttons are the
           accessible path. -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        class="manager-recipe-item-link"
        data-recipe-item-link
        role="group"
        aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Overview.LinkLabel', 'Recipe item')}
        use:dragDrop={{ onDrop: handleItemDrop, activeClass: 'is-drop-active' }}
      >
        <span class="manager-recipe-item-thumb" aria-hidden="true">
          {#if itemImg}<img src={itemImg} alt="" />{:else}<i class="fas fa-book"></i>{/if}
        </span>
        <span class="manager-recipe-item-link-copy">
          <span class="manager-recipe-item-link-name">{itemName || uuid}</span>
          <span class="manager-recipe-item-uuid" data-recipe-item-uuid>{uuid}</span>
        </span>
        <button
          type="button"
          class="manager-icon-button"
          data-recipe-item-copy-uuid
          aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Overview.CopyUuid', 'Copy UUID')}
          title={text('FABRICATE.Admin.Manager.RecipeItem.Overview.CopyUuid', 'Copy UUID')}
          onclick={copyUuid}
        >
          <i class={copied ? 'fas fa-check' : 'fas fa-copy'} aria-hidden="true"></i>
        </button>
        <button
          type="button"
          class="manager-icon-button is-danger"
          data-recipe-item-unlink
          aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Overview.Unlink', 'Unlink item')}
          title={text('FABRICATE.Admin.Manager.RecipeItem.Overview.Unlink', 'Unlink item')}
          onclick={() => onUnlinkItem()}
        >
          <i class="fas fa-link-slash" aria-hidden="true"></i>
        </button>
      </div>
    {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="manager-recipe-item-dropzone"
        data-recipe-item-dropzone
        role="button"
        tabindex="0"
        aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Overview.DropHint', 'Drop a game-world item here')}
        use:dragDrop={{ onDrop: handleItemDrop, activeClass: 'is-drop-active' }}
        onclick={openPicker}
        onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPicker(); } }}
      >
        <span class="manager-recipe-item-dropzone-icon" aria-hidden="true"><i class="fas fa-hand-pointer"></i></span>
        <span class="manager-recipe-item-dropzone-title">{text('FABRICATE.Admin.Manager.RecipeItem.Overview.DropHint', 'Drop a game-world item here')}</span>
        <span class="manager-recipe-item-dropzone-sub">{text('FABRICATE.Admin.Manager.RecipeItem.Overview.DropSub', 'or click to browse. The item sets this recipe item’s name and description.')}</span>
      </div>
    {/if}
  </div>

  <div class="manager-recipe-item-field">
    <span class="manager-recipe-item-label">
      {text('FABRICATE.Admin.Manager.RecipeItem.Overview.Name', 'Name')}
      <span class="manager-recipe-item-label-note">{text('FABRICATE.Admin.Manager.RecipeItem.Overview.FromLinkedItem', '· from linked item')}</span>
    </span>
    <div class={`manager-recipe-item-readonly is-name ${itemName ? '' : 'is-placeholder'}`} data-recipe-item-name>
      {itemName || text('FABRICATE.Admin.Manager.RecipeItem.Overview.NamePlaceholder', 'Untitled recipe item')}
    </div>
  </div>

  <div class="manager-recipe-item-field">
    <span class="manager-recipe-item-label">
      {text('FABRICATE.Admin.Manager.RecipeItem.Overview.Description', 'Description')}
      <span class="manager-recipe-item-label-note">{text('FABRICATE.Admin.Manager.RecipeItem.Overview.FromLinkedItem', '· from linked item')}</span>
    </span>
    <div class="manager-recipe-item-readonly is-description" data-recipe-item-description>
      {description || text('FABRICATE.Admin.Manager.RecipeItem.Overview.DescriptionEmpty', 'No description on the linked item.')}
    </div>
  </div>

  <div class="manager-recipe-item-enabled-row">
    <div class="manager-recipe-item-enabled-copy">
      <span class="manager-recipe-item-enabled-title">{text('FABRICATE.Admin.Manager.RecipeItem.Overview.Enabled', 'Enabled')}</span>
      <span class="manager-recipe-item-enabled-sub">{enabled
        ? text('FABRICATE.Admin.Manager.RecipeItem.Overview.EnabledOn', 'Players can find and use this item.')
        : text('FABRICATE.Admin.Manager.RecipeItem.Overview.EnabledOff', 'Hidden from players until re-enabled.')}</span>
    </div>
    <button
      type="button"
      class={`manager-status-toggle ${enabled ? 'is-on' : 'is-off'}`}
      data-recipe-item-enabled
      aria-pressed={enabled}
      aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Overview.ToggleEnabled', 'Toggle enabled')}
      onclick={toggleEnabled}
    >
      <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
      <span class="manager-status-toggle-label">{enabled
        ? text('FABRICATE.Admin.Manager.StatusOn', 'On')
        : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}</span>
    </button>
  </div>
</section>

<ItemPickerModal
  open={pickerOpen}
  items={worldItems}
  titleKey="FABRICATE.Admin.Manager.RecipeItem.Overview.PickerTitle"
  titleFallback="Link a game-world item"
  onPick={pickItem}
  onClose={() => { pickerOpen = false; }}
/>

<style>
  .manager-recipe-item-tab {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-4);
  }

  .manager-recipe-item-field {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .manager-recipe-item-label {
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--fab-text-subtle);
  }

  .manager-recipe-item-label-note {
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
    color: var(--fab-text-subtle);
  }

  .manager-recipe-item-link {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 11px;
    background: var(--fab-surface-soft);
  }

  .manager-recipe-item-link.is-drop-active {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
  }

  .manager-recipe-item-thumb {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    flex: 0 0 44px;
    border-radius: 9px;
    background: var(--fab-bg-3);
    color: var(--fab-text-secondary);
    overflow: hidden;
  }

  .manager-recipe-item-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .manager-recipe-item-link-copy {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    min-width: 0;
    flex: 1;
  }

  .manager-recipe-item-link-name {
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--fab-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-recipe-item-uuid {
    font-family: var(--fab-font-mono, monospace);
    font-size: 0.66rem;
    color: var(--fab-text-subtle);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-recipe-item-dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-5, 24px);
    border: 1.5px dashed var(--fab-danger-border);
    border-radius: 11px;
    background: var(--fab-danger-soft);
    text-align: center;
    cursor: pointer;
  }

  .manager-recipe-item-dropzone.is-drop-active {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
  }

  .manager-recipe-item-dropzone:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .manager-recipe-item-dropzone-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: var(--fab-bg-3);
    color: var(--fab-text-secondary);
  }

  .manager-recipe-item-dropzone-title {
    font-weight: 600;
    font-size: 0.8rem;
    color: var(--fab-text-secondary);
  }

  .manager-recipe-item-dropzone-sub {
    max-width: 290px;
    font-size: 0.68rem;
    line-height: 1.45;
    color: var(--fab-text-subtle);
  }

  .manager-recipe-item-readonly {
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-bg-2);
    color: var(--fab-text);
  }

  .manager-recipe-item-readonly.is-name {
    min-height: 40px;
    display: flex;
    align-items: center;
    font-weight: 600;
    font-size: 0.9rem;
  }

  .manager-recipe-item-readonly.is-description {
    font-size: 0.78rem;
    line-height: 1.5;
    color: var(--fab-text-muted);
  }

  .manager-recipe-item-readonly.is-placeholder {
    color: var(--fab-text-subtle);
    font-style: italic;
  }

  .manager-recipe-item-enabled-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-3);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 10px;
    background: var(--fab-surface-soft);
  }

  .manager-recipe-item-enabled-copy {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    min-width: 0;
  }

  .manager-recipe-item-enabled-title {
    font-weight: 600;
    font-size: 0.82rem;
    color: var(--fab-text);
  }

  .manager-recipe-item-enabled-sub {
    font-size: 0.68rem;
    color: var(--fab-text-subtle);
  }
</style>
