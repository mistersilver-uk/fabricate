<!-- Svelte 5 runes mode -->
<!--
  Overview tab of the recipe-item editor. A CONTROLLED, prop-driven view: it never
  mutates a store or model, it only emits callbacks the router merges into the draft.

  Contents:
   - A drag-only "Recipe item" link zone. Dropping a world or compendium Item links
     or replaces the source. The filled state also offers Copy UUID and Unlink.
   - Name (read-only, from `linkedItem.name`, placeholder when unlinked) and
     Description (read-only, from the linked item) — the linked game-world item owns
     both, so they are never editable here.
   - An Enabled toggle → `onPatch({ enabled })`.

  Props:
   - recipeItem: `{ id, originItemUuid, img, enabled, caps }` draft (read-only here).
   - linkedItem: `{ uuid, name, img, type }|null` resolved game-world item.
   - onPatch(patch): emit a partial recipe-item patch (here `{ enabled }`).
   - onLinkItem(uuid) / onUnlinkItem(): set / clear the linked game-world item.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { resolveDropUuid } from '../../../util/dropUtils.js';
  import ItemDropZone from '../ItemDropZone.svelte';

  let {
    recipeItem = null,
    linkedItem = null,
    onPatch = () => {},
    onLinkItem = () => {},
    onUnlinkItem = () => {}
  } = $props();

  let copied = $state(false);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const hasLink = $derived(Boolean(linkedItem?.uuid));
  const uuid = $derived(String(linkedItem?.uuid || recipeItem?.originItemUuid || ''));
  const itemName = $derived(String(linkedItem?.name || ''));
  const itemImg = $derived(String(linkedItem?.img || recipeItem?.img || ''));
  const description = $derived(String(linkedItem?.description || ''));
  const enabled = $derived(recipeItem?.enabled !== false);

  function handleItemDrop(data) {
    const droppedUuid = resolveDropUuid(data);
    if (!droppedUuid) return;
    onLinkItem(droppedUuid);
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
    <ItemDropZone
      item={hasLink ? { name: itemName || uuid, img: itemImg } : null}
      title={text('FABRICATE.Admin.Manager.RecipeItem.Overview.DropHint', 'Drop a game-world Item here')}
      hint={hasLink
        ? text('FABRICATE.Admin.Manager.RecipeItem.Overview.ReplaceHint', 'Drop another Item to replace the linked source.')
        : text('FABRICATE.Admin.Manager.RecipeItem.Overview.DropSub', 'The Item sets this recipe item’s name and description.')}
      kind="recipe-item"
      copyLabel={copied
        ? text('FABRICATE.Common.Copied', 'Copied')
        : text('FABRICATE.Admin.Manager.RecipeItem.Overview.CopyUuid', 'Copy UUID')}
      unlinkLabel={text('FABRICATE.Admin.Manager.RecipeItem.Overview.Unlink', 'Unlink item')}
      onDrop={handleItemDrop}
      onCopy={hasLink ? copyUuid : null}
      onUnlink={hasLink ? onUnlinkItem : null}
    />
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
