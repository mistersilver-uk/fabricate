<!-- Svelte 5 runes mode -->
<!--
  The SYSTEM-SCOPE rules list shell (issue 1380, epic 1357): one entity-agnostic component behind
  the component, essence and tool rules lists, composing the same `EntityListInspectorFrame` the
  world catalogues do. One thing differs, by decision:

  IT DRAWS NO INSPECTOR. These routes are absent from the full-width classification, so the shared
  300px aside is live and already holds the studio's browser inspector; a second inspector column
  beside a live one is a GM-visible defect, and supplying no `inspectorBody` is how the frame
  decides not to draw one. It renders no `MembershipActions` either, but KEEPS the invariant: the
  frame clears `armedToken` on any selection, filter, sort or page change.

  WHAT IT ADDS is the inherit rows: each carries `InheritRow` for the entity's row in
  `entry.systems`, writing through `actions.setSectionInherited`, with `sectionNotes` threaded
  through because `InheritRow` never reads a section VALUE. The name may not start with `World`.
  `selectedId` and `armedToken` are BINDABLE and must be initialised by the owner.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import EntityListInspectorFrame from './EntityListInspectorFrame.svelte';
  import InheritRow from './InheritRow.svelte';

  let {
    scope = null,
    actions = null,
    systems = [],
    systemId = '',
    systemName = '',
    hookValue = '',
    title = '',
    subtitle = '',
    icon = 'fas fa-cubes-stacked',
    filters = [],
    sorts = [],
    searchOf = undefined,
    sectionNotes = {},
    // The list's lifted view-state (issue 1438), OWNED by the manager root: opening an entry
    // unmounts this shell, so a slot held here would be destroyed by the trip it exists to survive.
    browserState = $bindable(null),
    selectedId = $bindable(''),
    onSelect = () => {},
    onOpenEditor = () => {},
    onOpenWorldEntry = () => {},
    rowMeta = undefined,
    bulk = undefined,
    emptyTitle = '',
    emptyHint = '',
    armedToken = $bindable(''),
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function format(key, fallback, replacements) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(replacements)) {
      result = result.replace(`{${token}}`, value);
    }
    return result;
  }

  // The system's own name, with an ID FALLBACK: `projectSystems` coerces a missing name to `''`.
  const system = $derived(String(systemName || systemId || ''));

  const rowActions = $derived([
    {
      id: 'open-editor',
      icon: 'fas fa-pen',
      label: format('FABRICATE.Admin.Manager.Scoped.List.OpenEditor', 'Edit in {system}', {
        system,
      }),
      run: (entry) => onOpenEditor(entry.id),
    },
    {
      id: 'open-world-entry',
      icon: 'fas fa-globe',
      label: text('FABRICATE.Admin.Manager.Scoped.List.OpenWorldEntry', 'Open the world entry'),
      run: (entry) => onOpenWorldEntry(entry.id),
    },
  ]);
</script>

<div
  class="manager-scoped-rules"
  data-scoped-rules-list={hookValue}
  data-scoped-rules-system={systemId}
>
  <EntityListInspectorFrame
    {scope}
    {systems}
    {systemId}
    {title}
    {subtitle}
    {icon}
    {emptyTitle}
    {emptyHint}
    {filters}
    {sorts}
    {searchOf}
    {rowActions}
    {bulk}
    bind:browserState
    bind:selectedId
    {onSelect}
    bind:armedToken
    rowMeta={rulesRowMeta}
  />
</div>

<!--
  The rules row's meta run WRAPS the lane's rather than the frame taking a second meta slot, so
  the frame's parameter list is the same for both shells.
-->
{#snippet rulesRowMeta(entry, ctx)}
  <div class="manager-scoped-rules-inherit">
    <InheritRow
      entityType={scope?.entityType ?? 'component'}
      inherited={ctx.systemRow?.inherited ?? {}}
      notes={sectionNotes}
      disabled={ctx.member !== true}
      onToggle={(section, next) =>
        actions?.setSectionInherited?.(entry.id, systemId, section, next)}
    />
  </div>
  {#if rowMeta}{@render rowMeta(entry, ctx)}{/if}
{/snippet}

<style>
  /* STATIC class names, so `lint:svelte:warnings` stays at zero; see `EntityCatalogueShell`. */
  .manager-scoped-rules {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
  }

  .manager-scoped-rules-inherit {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    min-width: 0;
  }
</style>
