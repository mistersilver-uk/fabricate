<!-- Svelte 5 runes mode -->
<!--
  The selected-essence inspector (issue 1036), extracted from ~200 inlined lines in
  `CraftingSystemManagerRoot.svelte`. It is the last of the four library inspectors to
  become a component; `ComponentBrowserInspector`, `RecipeBrowserInspector` and
  `ToolBrowserInspector` were already extracted.

  It lives under `essences/` — the BROWSER's directory, which the screenshot evidence map
  globs for the essence views.

  ── WHAT IS RETAINED, AND WHY THE PROTOTYPE IS NOT AUTHORITY FOR ITS REMOVAL ──────
  The prototype depicts none of these, and each is a shipped affordance with no replacement:

   - the component-usage THUMB GRID, and its click-through to the component editor. It is
     the only route from "34 components carry this" to any one of them.
   - copy-source-UUID, unlink-source and the `EssenceSourceSelector` drop target, still
     gated on `features.effectTransfer` and moved here verbatim. `EssenceSourceSelector` is
     deliberately NOT `ItemDropZone`: an essence source is an in-system managed COMPONENT,
     not a document uuid.
   - the deletion-blocked note, which is the only explanation a GM gets for a refused
     delete.

  ── ON CRAFT IS `EssenceBehaviorPreview`, NOT A SECOND LIST ───────────────────────
  The editor's preview panel and this section answer the same question with the same three
  facts. Re-authoring them here is what one-implementation-per-meaning forbids, so this
  renders the same component with its identity header and live-update note suppressed.
-->
<script>
  import Chip from '../Chip.svelte';
  import EssenceBehaviorPreview from './EssenceBehaviorPreview.svelte';
  import EssenceSourceSelector from '../../../components/EssenceSourceSelector.svelte';
  import Medallion from '../../../components/Medallion.svelte';
  import StatusPill from '../../../components/StatusPill.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { managerColorTokenLabel } from '../../../util/managerColorTokens.js';
  import { resolveMacroName } from '../../../../../utils/macroReference.js';

  let {
    essence = null,
    showSourceUi = false,
    showPropertyMacroUi = false,
    managedItemOptions = [],
    sourceUuid = '',
    onEdit = () => {},
    onDuplicate = () => {},
    onDelete = () => {},
    onEditComponent = () => {},
    onCopySource = () => {},
    onUnlinkSource = () => {},
    onSourceDrop = () => {},
    onSourceSelect = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function format(key, fallback, data) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(data)) {
      result = result.replace(`{${token}}`, String(value));
    }
    return result;
  }

  const DESCRIPTION_LIMIT = 160;

  const disabled = $derived(essence?.enabled === false);
  const description = $derived(truncate(essence?.description));
  const colourName = $derived(
    essence?.colorToken ? managerColorTokenLabel(essence.colorToken, localize) : ''
  );
  const usageItems = $derived(
    Array.isArray(essence?.componentUsageItems) ? essence.componentUsageItems : []
  );

  // The macro's display NAME, resolved cancellably through the SAME leaf the editor uses.
  // Selecting another essence while a lookup is in flight is the ordinary case here, so the
  // `cancelled` latch is what stops a slow resolution of the previous essence's macro
  // landing on the newly selected one.
  let macroName = $state('');
  $effect(() => {
    const uuid = essence?.propertyMacroUuid || '';
    return resolveMacroName(uuid, ({ name: resolved }) => {
      macroName = resolved;
    });
  });

  function truncate(value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (trimmed.length <= DESCRIPTION_LIMIT) return trimmed;
    return `${trimmed.slice(0, DESCRIPTION_LIMIT).trimEnd()}…`;
  }

  function componentImage(item) {
    return item?.img || 'icons/svg/item-bag.svg';
  }
</script>

<section class="manager-inspector-card" data-essence-browser-inspector>
  <div class="manager-inspector-title-row is-hero-large">
    <!-- The tile carries the essence's own colour here too, so the inspector and the row
         cannot disagree about what colour an essence is. -->
    <Medallion
      icon={essence.icon || 'fas fa-mortar-pestle'}
      tint={essence.colorToken || ''}
      size={52}
    />
    <div class="manager-inspector-copy">
      <p class="manager-kicker">
        {text('FABRICATE.Admin.Manager.Essence.Selected', 'Selected essence')}
      </p>
      <h2 class="manager-inspector-name" title={essence.name}>{essence.name}</h2>
      <div class="manager-chip-row">
        {#if colourName}
          <Chip tone="neutral" swatch={essence.colorToken} data-essence-colour={essence.colorToken}
            >{colourName}</Chip
          >
        {/if}
        <StatusPill
          tone={disabled ? 'neutral' : 'positive'}
          icon={disabled ? 'fas fa-circle-pause' : 'fas fa-circle-check'}
          label={disabled
            ? text('FABRICATE.Admin.Manager.Essence.Status.Disabled', 'Disabled')
            : text('FABRICATE.Admin.Manager.Essence.Status.Enabled', 'Enabled')}
        />
        {#if essence.deleteBlocked}
          <Chip tone="warning"
            >{text('FABRICATE.Admin.Manager.Essence.DeleteBlockedShort', 'In use')}</Chip
          >
        {/if}
      </div>
    </div>
  </div>
  <p class="manager-muted">
    {description ||
      text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}
  </p>
</section>

<!-- Two stats, two different questions. Components CARRY the essence, which is what blocks
     a delete; recipes REQUIRE it, which is what a delete rewrites. Neither number is
     derivable from the other. -->
<section class="manager-inspector-card" data-essence-section="stats">
  <div class="manager-essence-stat-grid">
    <div class="manager-essence-stat" data-essence-stat="components">
      <strong>{essence.componentUsageCount || 0}</strong>
      <span>{text('FABRICATE.Admin.Manager.Essence.StatComponents', 'Components')}</span>
    </div>
    <div class="manager-essence-stat" data-essence-stat="recipes">
      <strong>{essence.recipeUsageCount || 0}</strong>
      <span>{text('FABRICATE.Admin.Manager.Essence.StatRecipes', 'Recipes require it')}</span>
    </div>
  </div>
</section>

<section class="manager-inspector-card" data-essence-section="oncraft">
  <h3 class="manager-card-title">
    {text('FABRICATE.Admin.Manager.Essence.Tabs.OnCraft', 'On craft')}
  </h3>
  <EssenceBehaviorPreview
    {essence}
    effectTransferEnabled={showSourceUi}
    propertyMacrosEnabled={showPropertyMacroUi}
    sourceName={essence.associatedItem?.name || essence.sourceName || ''}
    {macroName}
    showIdentity={false}
    showLiveNote={false}
  />
</section>

{#if showSourceUi}
  <section class="manager-inspector-card" data-essence-section="source">
    <div class="manager-edit-card-heading">
      <h3 class="manager-card-title">
        {text('FABRICATE.Admin.Manager.Essence.Source', 'Source')}
      </h3>
    </div>
    {#if essence.associatedItem}
      <div class="manager-essence-source-summary manager-essence-inspector-source-summary">
        <img
          class="manager-essence-source-thumb"
          src={essence.associatedItem.img || 'icons/svg/item-bag.svg'}
          alt=""
        />
        <div class="manager-essence-source-copy">
          <strong>{essence.associatedItem.name || essence.sourceName}</strong>
        </div>
      </div>
      <div class="manager-essence-inspector-source-actions">
        <button
          type="button"
          class="manager-button"
          data-essence-action="copy-source"
          title={sourceUuid ||
            text(
              'FABRICATE.Admin.Manager.Essence.SourceNoUuid',
              'This component has no source item UUID.'
            )}
          disabled={!sourceUuid}
          onclick={() => onCopySource()}
        >
          <i class="fas fa-copy" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Essence.CopySource', 'Copy source UUID')}</span>
        </button>
        <button
          type="button"
          class="manager-button is-warning-action"
          data-essence-action="unlink-source"
          onclick={() => onUnlinkSource()}
        >
          <i class="fas fa-unlink" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Essence.UnlinkSource', 'Unlink Source')}</span>
        </button>
      </div>
    {:else}
      <div class="manager-essence-source-drop-zone manager-essence-inspector-source-drop-zone">
        <EssenceSourceSelector
          value={null}
          items={managedItemOptions}
          onDrop={onSourceDrop}
          onSelect={onSourceSelect}
          onClear={() => onSourceSelect(null)}
        />
      </div>
    {/if}
  </section>
{/if}

<section class="manager-inspector-card" data-essence-section="usage">
  <h3 class="manager-card-title">
    {text('FABRICATE.Admin.Manager.Essence.Usage', 'Usage')}
  </h3>
  <div class="manager-requirements-list">
    <div class="manager-requirement-row">
      <span>{text('FABRICATE.Admin.Manager.Essence.Usage', 'Usage')}</span>
      <strong
        >{format('FABRICATE.Admin.Manager.Essence.ComponentUsageCount', '{count} components', {
          count: essence.componentUsageCount || 0,
        })}</strong
      >
    </div>
  </div>
  {#if usageItems.length > 0}
    <div
      class="manager-essence-usage-grid"
      aria-label={text(
        'FABRICATE.Admin.Manager.Essence.ComponentUsageGrid',
        'Components using this essence'
      )}
    >
      {#each usageItems as component (component.id)}
        <button
          type="button"
          class="manager-essence-usage-item"
          title={component.name}
          aria-label={format('FABRICATE.Admin.Manager.Component.EditNamed', 'Edit {name}', {
            name: component.name,
          })}
          onclick={() => onEditComponent(component.id)}
        >
          <img src={componentImage(component)} alt="" />
        </button>
      {/each}
    </div>
  {/if}
</section>

<section class="manager-inspector-card" data-essence-section="actions">
  <div class="manager-essence-inspector-actions">
    <button
      type="button"
      class="manager-button"
      data-essence-action="duplicate"
      onclick={() => onDuplicate(essence.id)}
    >
      <i class="fas fa-clone" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Essence.Duplicate', 'Duplicate essence')}</span>
    </button>
    <button
      type="button"
      class="manager-button is-primary"
      data-essence-action="edit"
      onclick={() => onEdit(essence.id)}
    >
      <i class="fas fa-pen" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Essence.Edit', 'Edit essence')}</span>
    </button>
    <!-- The SINGLE delete keeps the `confirmDialog` the store already owns. The two-step
         ARM is the BULK panel's, per the maintainer's decision for that action alone;
         wearing both idioms on one screen for one verb would teach the GM neither. The
         control is `disabled` only as a courtesy — `store.deleteEssence` re-checks the
         in-use refusal against the system, because `deleteBlocked` is a UI-only card
         field and the guard it stands for is a data-loss guard. -->
    <button
      type="button"
      class="manager-button is-danger"
      data-essence-action="delete"
      disabled={essence.deleteBlocked === true}
      aria-label={format('FABRICATE.Admin.Manager.Essence.DeleteNamed', 'Delete {name}', {
        name: essence.name,
      })}
      onclick={() => onDelete(essence.id)}
    >
      <i class="fas fa-trash" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Essence.Delete', 'Delete essence')}</span>
    </button>
  </div>
  {#if essence.deleteBlocked}
    <p class="manager-muted manager-essence-delete-note" data-essence-delete-blocked>
      <i class="fas fa-lock" aria-hidden="true"></i>
      {format(
        'FABRICATE.Admin.Manager.Essence.UsageBlockedNamed',
        'In use by {count} components. Remove it from those components before deleting the definition.',
        { count: essence.componentUsageCount || 0 }
      )}
    </p>
  {:else if essence.deleteRewritesRecipes}
    <p class="manager-muted manager-essence-delete-note" data-essence-delete-rewrites>
      <i class="fas fa-circle-info" aria-hidden="true"></i>
      {format(
        'FABRICATE.Admin.Manager.Essence.DeleteRewritesRecipes',
        'Deleting this essence rewrites {count} recipes that require it.',
        { count: essence.recipeUsageCount || 0 }
      )}
    </p>
  {/if}
</section>

<style>
  .manager-essence-stat-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--fab-space-2);
  }

  .manager-essence-stat {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-mv2-border);
    border-radius: 8px;
    background: var(--fab-overlay-light-03);
  }

  .manager-essence-stat strong {
    font-size: 1.25rem;
    line-height: 1;
  }

  .manager-essence-stat span {
    color: var(--fab-text-muted);
    font-size: 0.66rem;
  }

  .manager-essence-inspector-actions {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .manager-essence-delete-note {
    display: flex;
    align-items: flex-start;
    gap: var(--fab-space-2);
    margin-top: var(--fab-space-3);
    font-size: 0.7rem;
  }
</style>
