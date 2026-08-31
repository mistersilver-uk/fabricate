<!-- Svelte 5 runes mode -->
<!--
  The SYSTEM-SCOPE rules list shell (issue 1380, epic 1357): one component behind the component,
  essence and tool rules lists, entity-agnostic across all three.

  It composes the same `EntityListInspectorFrame` the world catalogues do, and the difference
  between the two shells is ONE thing, which is a decision rather than an oversight:

  ── IT DRAWS NO INSPECTOR ─────────────────────────────────────────────────────────────────────
  The `components`, `essences` and `tools` routes are ABSENT from the manager's full-width
  classification, so their shared 300px `.manager-inspector` aside is live — and it is not empty:
  the root renders the studio's browser inspector into it. A second inspector column inside
  `<main>`, immediately left of a live one, is a GM-visible defect, and neither of the two files
  that could reconcile them may be opened by the lanes this shell exists for. So the inspected
  entry's detail stays in the shared aside, whose contents are the root's existing inspector, and
  this shell supplies no `inspectorBody` — which is exactly how the frame decides not to draw the
  region at all.

  ── CONSEQUENTLY IT RENDERS NO `MembershipActions` EITHER ─────────────────────────────────────
  The action cluster belongs beside the entry it addresses, and here that is the aside. What this
  shell KEEPS is the invariant rather than the control: `armedToken` is bindable and the frame
  clears it on any selection, filter, sort or page change, so the owner's single-armed-token rule
  holds across the boundary — without which a Remove armed against one row survives a search and
  is confirmed against a different one on the way back.

  ── WHAT IT ADDS: THE INHERIT ROWS, WITH THEIR NOTES ──────────────────────────────────────────
  A rules list IS the per-section inherit state for THIS system, so each row carries the shipped
  `InheritRow` for the entity's row in `entry.systems`. The switches write through
  `actions.setSectionInherited`, which delegates to `setSectionInheritance` — it SEEDS the local
  block when a switch goes off and RETAINS a dormant override when it goes back on, which is why
  the copy says "fall back" and there is no confirmation.

  `sectionNotes` is threaded through because `InheritRow` never reads a section VALUE: without a
  note a row says "Effect source · Inherited" and never says what is being inherited, and a
  row-count assertion passes green over every note empty.

  ── THE NAME MAY NOT START WITH `World`, AND IT CARRIES NO ROUTE HOOK ─────────────────────────
  Same two gates as the catalogue shell. The hook arrives as `hookValue` and lands on
  `data-scoped-rules-list`.

  Props:
   - scope / actions / systems: as the catalogue shell, plus `setSectionInherited`.
   - systemId / systemName: the system these rules belong to; the row set is resolved against it.
   - hookValue / title / subtitle / icon / emptyTitle / emptyHint: as the catalogue shell.
   - filters / sorts / searchOf / sectionNotes / selectedId / onSelect: as the catalogue shell.
   - onOpenEditor(entityId): the row's pen, into this system's editor for that entity.
   - onOpenWorldEntry(entityId): out to the WORLD entry, because the world default is the thing a
     GM is deciding whether to override and it is one route away.
   - rowMeta / bulk: the lane's two snippets. There is no `inspectorBody`.
   - armedToken: BINDABLE, for the reason above.
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
    selectedId = '',
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

  // The system's own name, with an ID FALLBACK, so the pen says which system it edits in.
  // `projectSystems` coerces a missing name to `''`, so an unguarded read prints nothing.
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
    {selectedId}
    {onSelect}
    bind:armedToken
    rowMeta={rulesRowMeta}
  />
</div>

<!--
  The rules row's meta run WRAPS the lane's, rather than the frame taking a second meta slot: the
  inherit rows are this shell's and the badges after them are the lane's, and one snippet keeps
  the frame's parameter list the same for both shells.
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
  /* STATIC class names, so `lint:svelte:warnings` stays at zero. See the twin note in
     `EntityCatalogueShell`. */
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
