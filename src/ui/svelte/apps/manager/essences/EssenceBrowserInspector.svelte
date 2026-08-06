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
   - the delete-impact note, which tells the GM in advance how far a delete's cascade
     reaches — how many components it strips the essence from and how many recipes it
     rewrites — because the delete is warned, not blocked.

  ── ON CRAFT IS `EssenceBehaviorPreview`, NOT A SECOND LIST ───────────────────────
  The editor's preview panel and this section answer the same question with the same three
  facts. Re-authoring them here is what one-implementation-per-meaning forbids, so this
  renders the same component with its identity header and live-update note suppressed.
-->
<script>
  import EssenceBehaviorPreview from './EssenceBehaviorPreview.svelte';
  import EssenceSourceSelector from '../../../components/EssenceSourceSelector.svelte';
  import InspectorActionButton from '../InspectorActionButton.svelte';
  import Medallion from '../../../components/Medallion.svelte';
  import StatusPill from '../../../components/StatusPill.svelte';
  import { localize } from '../../../util/foundryBridge.js';
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
      <!-- NO colour-name chip (issue 1036, maintainer round 2). The tinted medallion two
           columns left already carries the colour, and a display name per theme colour is
           upkeep with no reader. The palette caption in the EDITOR keeps its name, because
           there it labels the swatch the GM just picked rather than restating a tile. -->
      <div class="manager-chip-row">
        <StatusPill
          tone={disabled ? 'neutral' : 'positive'}
          icon={disabled ? 'fas fa-circle-pause' : 'fas fa-circle-check'}
          label={disabled
            ? text('FABRICATE.Admin.Manager.Essence.Status.Disabled', 'Disabled')
            : text('FABRICATE.Admin.Manager.Essence.Status.Enabled', 'Enabled')}
        />
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
  <!-- The SHIPPED two-stat grid, joined rather than re-authored: `.manager-essence-stat-*`
       is added to the `.manager-recipe-stat-*` / `.manager-component-stat-*` selector lists
       in `styles/fabricate.css`. This inspector is one click from those two, and a
       hand-rolled copy had already drifted on radius, background, value size and both
       halves of the typographic contract (serif + `tabular-nums`). -->
  <div class="manager-essence-stat-grid">
    <div class="manager-essence-stat" data-essence-stat="components">
      <strong class="manager-essence-stat-value">{essence.componentUsageCount || 0}</strong>
      <span class="manager-essence-stat-label"
        >{text('FABRICATE.Admin.Manager.Essence.StatComponents', 'Components')}</span
      >
    </div>
    <div class="manager-essence-stat" data-essence-stat="recipes">
      <strong class="manager-essence-stat-value">{essence.recipeUsageCount || 0}</strong>
      <span class="manager-essence-stat-label"
        >{text('FABRICATE.Admin.Manager.Essence.StatRecipes', 'Recipes require it')}</span
      >
    </div>
  </div>
</section>

<section class="manager-inspector-card" data-essence-section="oncraft">
  <div class="manager-edit-card-heading">
    <h3 class="manager-card-title">
      {text('FABRICATE.Admin.Manager.Essence.Tabs.OnCraft', 'On craft')}
    </h3>
  </div>
  <EssenceBehaviorPreview
    {essence}
    effectTransferEnabled={showSourceUi}
    propertyMacrosEnabled={showPropertyMacroUi}
    sourceName={essence.associatedItem?.name || essence.sourceName || ''}
    {macroName}
    showIdentity={false}
    showLiveNote={false}
    showEffectiveKicker={false}
  />
</section>

<!--
  THE ACTIONS SIT ABOVE `Source` AND `Usage`, not below them (issue 1036 fidelity pass).
  The prototype's rail is hero, stats, `On craft`, then the actions — the primary `Edit
  essence` is the loudest control on the panel and it is on screen. Ordered after two
  supplementary detail cards it fell past the fold at the 1280×820 capture size, so the
  rail's one loud thing was invisible in every frame of it. `Source` and `Usage` are
  reference, so they follow the verb rather than delaying it.
-->
<section class="manager-inspector-card" data-essence-section="actions">
  <!-- The three verbs render through `InspectorActionButton`, the extracted point-of-arrival
       button for every right inspector (issue 1036, maintainer round 2). What changes here
       is not only the size: the primary was `.manager-button.is-primary`, which is the
       SUCCESS family, so `Edit essence` painted green where the design's primary — and the
       recipe and component inspectors a click away — is the accent. -->
  <div class="manager-essence-inspector-actions">
    <InspectorActionButton
      icon="fas fa-clone"
      label={text('FABRICATE.Admin.Manager.Essence.Duplicate', 'Duplicate essence')}
      data-essence-action="duplicate"
      onClick={() => onDuplicate(essence.id)}
    />
    <InspectorActionButton
      tone="primary"
      icon="fas fa-pen"
      label={text('FABRICATE.Admin.Manager.Essence.Edit', 'Edit essence')}
      data-essence-action="edit"
      onClick={() => onEdit(essence.id)}
    />
    <!-- The SINGLE delete keeps the `confirmDialog` the store already owns. The two-step
         ARM is the BULK panel's, per the maintainer's decision for that action alone;
         wearing both idioms on one screen for one verb would teach the GM neither. The
         delete is WARNED, not BLOCKED (maintainer round): the control is never disabled by
         component usage, and `store.deleteEssence` states the cascade's impact counts in
         its confirm dialog rather than refusing. The impact note below previews the same
         counts on the panel. -->
    <InspectorActionButton
      tone="danger"
      icon="fas fa-trash"
      label={text('FABRICATE.Admin.Manager.Essence.Delete', 'Delete essence')}
      ariaLabel={format('FABRICATE.Admin.Manager.Essence.DeleteNamed', 'Delete {name}', {
        name: essence.name,
      })}
      data-essence-action="delete"
      onClick={() => onDelete(essence.id)}
    />
  </div>
  {#if essence.componentUsageCount > 0}
    <p class="manager-muted manager-essence-delete-note" data-essence-delete-impact>
      <i class="fas fa-circle-info" aria-hidden="true"></i>
      {format(
        'FABRICATE.Admin.Manager.Essence.DeleteImpact',
        'Deleting removes this essence from {components} components and rewrites {recipes} recipes.',
        {
          components: essence.componentUsageCount || 0,
          recipes: essence.recipeUsageCount || 0,
        }
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
      <!-- The SAME primitive as the three verbs above. These two are a pair in a two-column
           grid rather than a stack, but they are the same meaning in the same rail, and a
           rail that sized its source actions differently from its entity actions is the
           drift the extraction exists to remove. `warning` carries the amber the shipped
           `Unlink Source` wore: unlinking breaks a reference, it destroys nothing. -->
      <div class="manager-essence-inspector-source-actions">
        <InspectorActionButton
          icon="fas fa-copy"
          label={text('FABRICATE.Admin.Manager.Essence.CopySource', 'Copy source UUID')}
          title={sourceUuid ||
            text(
              'FABRICATE.Admin.Manager.Essence.SourceNoUuid',
              'This component has no source item UUID.'
            )}
          disabled={!sourceUuid}
          data-essence-action="copy-source"
          onClick={() => onCopySource()}
        />
        <InspectorActionButton
          tone="warning"
          icon="fas fa-unlink"
          label={text('FABRICATE.Admin.Manager.Essence.UnlinkSource', 'Unlink Source')}
          data-essence-action="unlink-source"
          onClick={() => onUnlinkSource()}
        />
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
  <div class="manager-edit-card-heading">
    <h3 class="manager-card-title">
      {text('FABRICATE.Admin.Manager.Essence.Usage', 'Usage')}
    </h3>
  </div>
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

<style>
  /* No stat-grid block here. The four rules this file used to declare are the shipped
     `.manager-recipe-stat-*` / `.manager-component-stat-*` rules with four visible
     divergences, so the classes joined those selector lists in `styles/fabricate.css`
     instead — one shape, one definition, and the essence inspector's numbers now match the
     recipe and component inspectors a click away. */

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
