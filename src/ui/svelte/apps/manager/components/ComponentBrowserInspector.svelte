<!-- Svelte 5 runes mode -->
<!--
  The component LIBRARY's inspector (issue 676, brief §3a) — the delta task that was
  never built. Its absence is why the row carried three action icons: with nowhere else
  for Copy source UUID and Delete to live, they were stamped onto every row.

  It is the sibling of `recipes/RecipeBrowserInspector.svelte` and mirrors it
  deliberately, down to the placement rules, which are load-bearing:
   - it lives under `apps/manager/components/` (the BROWSER's dir), NOT `component/`,
     which the screenshot evidence map globs for the EDITOR's frames;
   - it is named ComponentBrowserInspector, not ComponentInspector, so it cannot be
     confused with the editor's own surfaces.

  It renders into the shell's existing `.manager-inspector` column — this component does
  NOT own a grid, so it cannot introduce a nested second inspector.

  Contents (brief §3a): a "SELECTED COMPONENT" eyebrow, the icon + name + linked badge,
  the description, a 2-up stat grid (Tags / Essences), the Tags list, the essence
  CONTRIBUTION list, then Edit (accent) and Unlink (danger). Copy source UUID and Delete
  are hosted here too — rehomed off the row.

  It replaces four stacked `.manager-inspector-card`s (hero + Tags + Essences + Source),
  each a bordered card under its own `<h3>`: cards inside a panel inside a window. As in
  the Recipe Studio, sections are uppercase micro-labels on the panel background and only
  the things that ARE objects (the stat tiles, the contribution rows) keep a box.

  Strings are localized here; the CALLER resolves nothing but the actions.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Medallion from '../../../components/Medallion.svelte';
  import StatusPill from '../../../components/StatusPill.svelte';
  import { getComponentCategoryLabel } from '../../../../../utils/componentCategories.js';

  let {
    selectedComponent = null,
    showTags = false,
    showEssences = false,
    onEdit = () => {},
    onCopySourceUuid = () => {},
    onUnlink = () => {},
    onDelete = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const tags = $derived(Array.isArray(selectedComponent?.tags) ? selectedComponent.tags : []);
  const essences = $derived(
    Array.isArray(selectedComponent?.essences) ? selectedComponent.essences : []
  );
  const hasRegisteredItemUuid = $derived(Boolean(selectedComponent?.hasRegisteredItemUuid));
  const sourceMissing = $derived(Boolean(selectedComponent?.sourceMissing));
  const registeredItemUuid = $derived(String(selectedComponent?.registeredItemUuidDisplay || ''));

  // The linked badge. THREE states, not two: linked, linked-but-unresolved, and never
  // linked. An unresolved stored source is the warning — the component still claims a
  // source item that no longer exists, which is the thing the GM has to act on.
  const linkedPill = $derived(
    !hasRegisteredItemUuid
      ? {
          tone: 'subtle',
          icon: 'fas fa-link-slash',
          label: text('FABRICATE.Admin.Manager.Component.UnlinkedBadge', 'Not linked')
        }
      : sourceMissing
        ? {
            tone: 'warning',
            icon: 'fas fa-triangle-exclamation',
            label: text('FABRICATE.Admin.Manager.Component.SourceOriginMissing', 'Missing')
          }
        : {
            tone: 'accent',
            icon: 'fas fa-link',
            label: text('FABRICATE.Admin.Manager.Component.LinkedBadge', 'Linked')
          }
  );

  // Two tiles, not four: a component has two authored many-valued facets, and inventing
  // filler tiles to reach a 2x2 would restate the row the GM just clicked.
  const stats = $derived(
    selectedComponent
      ? [
          {
            id: 'tags',
            value: tags.length,
            label: text('FABRICATE.Admin.Manager.Component.Tags', 'Tags')
          },
          {
            id: 'essences',
            value: essences.length,
            label: text('FABRICATE.Admin.Manager.Component.Essences', 'Essences')
          }
        ]
      : []
  );

  function essenceName(essence) {
    return essence?.name || essence?.id || text('FABRICATE.Admin.Manager.Recipe.UnknownEssence', 'Unknown essence');
  }
</script>

{#if selectedComponent}
  <section class="manager-component-browser-inspector" data-component-inspector>
    <p class="manager-component-browser-inspector-label">{text('FABRICATE.Admin.Manager.Component.Selected', 'Selected component')}</p>

    <div class="manager-component-browser-inspector-hero">
      <Medallion src={selectedComponent.img} icon="fas fa-cube" size={52} />
      <div class="manager-component-browser-inspector-identity">
        <h2 class="manager-inspector-name" title={selectedComponent.name}>{selectedComponent.name}</h2>
        <div class="manager-chip-row">
          <span class="manager-chip" data-component-category>
            {getComponentCategoryLabel(selectedComponent.category, localize)}
          </span>
          <StatusPill tone={linkedPill.tone} icon={linkedPill.icon} label={linkedPill.label} />
        </div>
      </div>
    </div>

    <!-- The description, whole. It used to be cut at 160 characters, in the one panel
         with the room to show it. -->
    <p class="manager-component-browser-inspector-flavour">
      {selectedComponent.description || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}
    </p>

    <div class="manager-component-stat-grid">
      {#each stats as stat (stat.id)}
        <div class="manager-component-stat" data-component-fact={stat.id}>
          <strong class="manager-component-stat-value">{stat.value}</strong>
          <span class="manager-component-stat-label">{stat.label}</span>
        </div>
      {/each}
    </div>

    {#if showTags}
      <p class="manager-component-browser-inspector-label">{text('FABRICATE.Admin.Manager.Component.Tags', 'Tags')}</p>
      {#if tags.length === 0}
        <p class="manager-muted" data-component-tags-empty>{text('FABRICATE.Admin.Manager.Component.NoTags', 'No tags')}</p>
      {:else}
        <!-- The SAME pill vehicle and purple mapping the editor's tag pills use, minus
             the remove button: one concept, one treatment across the two routes. -->
        <div class="manager-chip-row" data-component-tag-list>
          {#each tags as tag (tag)}
            <span class="manager-availability-pill is-tag" data-component-tag={tag}>
              <i class="fas fa-tag" aria-hidden="true"></i>
              <span>{tag}</span>
            </span>
          {/each}
        </div>
      {/if}
    {/if}

    {#if showEssences}
      <p class="manager-component-browser-inspector-label">{text('FABRICATE.Admin.Manager.Component.EssenceContributions', 'Essence contributions')}</p>
      {#if essences.length === 0}
        <p class="manager-muted" data-component-essences-empty>{text('FABRICATE.Admin.Manager.Component.NoEssences', 'No essences')}</p>
      {:else}
        <!-- The CONTRIBUTION list: icon + name + the mono quantity this component
             contributes, mirroring the recipe inspector's flow rows. The compact
             icon-and-number chips the row uses answer "does it have essences?"; this
             panel answers "how much of what?", which needs the names. -->
        <div class="manager-component-flow-list">
          {#each essences as essence (essence.id)}
            <div class="manager-component-flow-row" data-component-essence={essence.id}>
              <span class="manager-component-flow-icon" aria-hidden="true">
                <i class={essence.icon || 'fas fa-mortar-pestle'}></i>
              </span>
              <span class="manager-component-flow-name">{essenceName(essence)}</span>
              <span class="manager-component-flow-qty">×{essence.quantity}</span>
            </div>
          {/each}
        </div>
      {/if}
    {/if}

    {#if sourceMissing}
      <p class="environment-stale-warning" data-component-source-missing>{text('FABRICATE.Admin.Manager.Component.SourceMissingHint', 'The stored source no longer resolves. Replace the component source or verify the original compendium/world item still exists.')}</p>
    {/if}

    <!--
      The point of the inspector: full-width buttons. Edit is the accent primary and the
      loudest thing on the panel. Copy source UUID and Unlink are dark secondaries, both
      gated on there BEING a stored source. Delete is a dark button with danger-red text
      and a danger-tinted border — not a text link, so a GM never fires it by reflex.

      Unlink and Delete are different acts and both are offered: unlink breaks the item
      linkage and keeps the component; delete removes the component from the system.
    -->
    <div class="manager-component-browser-inspector-actions">
      <button type="button" class="manager-button manager-component-browser-inspector-edit" data-component-action="edit" onclick={() => onEdit()}>
        <i class="fas fa-pen" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Component.Edit', 'Edit component')}</span>
      </button>
      {#if hasRegisteredItemUuid}
        <button
          type="button"
          class="manager-button manager-component-browser-inspector-copy"
          data-component-action="copy-source"
          title={registeredItemUuid}
          onclick={() => onCopySourceUuid(registeredItemUuid)}
        >
          <i class="fas fa-copy" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Component.CopySource', 'Copy source UUID')}</span>
        </button>
        <button
          type="button"
          class="manager-button manager-component-browser-inspector-unlink"
          data-component-action="unlink"
          onclick={() => onUnlink(selectedComponent.id)}
        >
          <i class="fas fa-link-slash" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Component.UnlinkAction', 'Unlink component')}</span>
        </button>
      {/if}
      <button type="button" class="manager-button manager-component-browser-inspector-delete" data-component-action="delete" onclick={() => onDelete(selectedComponent.id)}>
        <i class="fas fa-trash" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Component.Delete', 'Delete component')}</span>
      </button>
    </div>
  </section>
{/if}
