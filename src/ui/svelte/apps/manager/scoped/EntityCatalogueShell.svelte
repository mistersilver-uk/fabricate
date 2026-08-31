<!-- Svelte 5 runes mode -->
<!--
  The WORLD-SCOPE catalogue shell (issue 1380, epic 1357): one component behind the Component,
  Essence and Tool catalogues, entity-agnostic across all three.

  It composes `EntityListInspectorFrame` and adds exactly what world scope owns:

   - an INSPECTOR COLUMN, because all seven world scoped routes are released to full width and
     the shell's shared 300px aside is suppressed on every one of them. Nothing else will draw
     one, so this shell does — at the same 300px, so a GM sees one inspector width across scopes;
   - the PER-SECTION INHERIT COUNTS, labelled through `scopedSectionLabel` so the five section
     names are read from ONE list rather than restated per screen. A ONE-SECTION entity renders
     its count inline with no group chrome: a header and a divider around a single number costs
     more vertical space than the number and says nothing it does not;
   - the PER-SYSTEM MEMBERSHIP ROWS, each carrying the shipped `MembershipActions` cluster. Those
     rows come from `entry.systems` — the projection's JOIN — and never from the `systems` prop,
     which is a narrowed `{id, name}` roster and cannot answer `member`, `inherited` or `enabled`.

  ── WHAT IS ENTITY-AGNOSTIC, AND WHAT THE LANE SUPPLIES ───────────────────────────────────────
  The boundary sits INSIDE the row and INSIDE the inspector. An identity cell means the same
  thing in all three catalogues and a badge run does not, so the frame owns the medallion, name
  and description and the lane owns the meta run through `rowMeta`. Likewise the inspector's
  identity header is the frame's and its body is `inspectorBody`.

  ── EVERY ENTITY-SHAPE DIFFERENCE IS A DESCRIPTOR ANSWER ──────────────────────────────────────
  `scope.sections`, `scope.enableable`, `scope.sourceLinked` and `scope.hasColorToken` are read
  from the projection. Nothing here tests `scope.entityType`, because the three types differ in
  THREE ways — source link, `img` versus `icon`, and `colorToken` — and a call-site test would
  have to know all three and stay right as a fourth appears.

  ── THE NAME MAY NOT START WITH `World` ───────────────────────────────────────────────────────
  `tests/components/manager-contract.test.js` filters this directory on that prefix and asserts
  exactly seven placeholder pages, so a `World…` name here would make the count eight.

  IT ALSO CARRIES NEITHER ROUTE-HOOK ATTRIBUTE, and the two names are deliberately not written out
  even in this comment. `tests/manager-scoped-prop-contract.test.js` builds its route→page map by
  matching those attribute NAMES literally against every file in this directory, comment text
  included, and a shell wearing one would claim a route a page already owns. The hook this shell
  does carry arrives as `hookValue` and lands on `data-scoped-list`, which is a third name nothing
  routes on.

  Props:
   - scope: the entity type's `worldScope` projection.
   - actions: that entity type's write family from `worldScopeActions` — `addToSystem`,
     `removeFromSystem`, `copyMembership`, and `setEnabled` only when `scope.enableable`.
   - systems: the crafting-system roster, for names only.
   - hookValue: the `data-scoped-list` value; the page still owns `<main>` and the route hook.
   - title / subtitle / icon / emptyTitle / emptyHint: pre-localized, from the lane.
   - filters / sorts / searchOf: the lane's extra list configuration.
   - sectionNotes: `{[section]: string}` — the one-line summary of what each world default
     resolves to. Without it a count reads "Category · 3" and never says WHAT three systems are
     inheriting, and a row-count criterion passes green over every note empty.
   - selectedId / onSelect(entityId): the inspected row.
   - onOpenEntry(entityId): the row's pen, into that entity's world entry editor.
   - rowMeta / inspectorBody / bulk: the lane's three snippets.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import EntityListInspectorFrame from './EntityListInspectorFrame.svelte';
  import MembershipActions from './MembershipActions.svelte';
  import { scopedSectionLabel } from './scopedStudio.js';

  let {
    scope = null,
    actions = null,
    systems = [],
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
    onOpenEntry = () => {},
    rowMeta = undefined,
    inspectorBody = undefined,
    bulk = undefined,
    emptyTitle = '',
    emptyHint = '',
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

  let armedToken = $state('');

  const sections = $derived(Array.isArray(scope?.sections) ? scope.sections : []);
  const rowActions = $derived([
    {
      id: 'open-entry',
      icon: 'fas fa-pen',
      label: text('FABRICATE.Admin.Manager.Scoped.List.OpenEntry', 'Open'),
      run: (entry) => onOpenEntry(entry.id),
    },
  ]);

  /**
   * A crafting system's display name, with an ID FALLBACK.
   *
   * `projectSystems` narrows the roster to `{id, name}` and coerces a missing name to `''`, so a
   * row rendering `system.name` unguarded prints nothing where a system has no name and a row
   * rendering `${system.name}` prints the literal `undefined`. Neither is an answer.
   *
   * @param {{systemId: string, systemName?: string}} row
   * @returns {string}
   */
  function systemLabel(row) {
    const named = typeof row?.systemName === 'string' ? row.systemName.trim() : '';
    return named || String(row?.systemId ?? '');
  }

  /**
   * Whether any OTHER system already holds this entity, which is the precondition for copy-from.
   *
   * @param {object} entry
   * @param {string} systemId
   * @returns {boolean}
   */
  function copyable(entry, systemId) {
    return (entry?.systems ?? []).some((row) => row.systemId !== systemId && row.member === true);
  }
</script>

<div class="manager-scoped-catalogue" data-scoped-list={hookValue}>
  <EntityListInspectorFrame
    {scope}
    {systems}
    {title}
    {subtitle}
    {icon}
    {emptyTitle}
    {emptyHint}
    {filters}
    {sorts}
    {searchOf}
    {rowActions}
    {rowMeta}
    {bulk}
    {selectedId}
    {onSelect}
    bind:armedToken
    inspectorBody={catalogueInspector}
  />
</div>

<!--
  The catalogue's inspector body WRAPS the lane's, rather than the frame taking a third snippet
  slot. That keeps the frame's contract literal — the inspector region renders when and only when
  an `inspectorBody` is supplied — while still letting a lane add its own panel below the two
  regions this shell owns.
-->
{#snippet catalogueInspector(entry, ctx)}
  {@const counts = entry?.inheritCounts ?? {}}
  <div class="manager-scoped-catalogue-facts">
    {#if sections.length > 1}
      <h3 class="manager-scoped-catalogue-facts-head">
        {text('FABRICATE.Admin.Manager.Scoped.List.InheritHead', 'Inheriting systems')}
      </h3>
    {/if}
    {#each sections as section (section)}
      <div class="manager-scoped-catalogue-fact" data-scoped-list-inherit-count={section}>
        <span class="manager-scoped-catalogue-fact-label">{scopedSectionLabel(section, text)}</span>
        <span class="manager-scoped-catalogue-fact-value">
          {format('FABRICATE.Admin.Manager.Scoped.List.InheritCount', '{count} inheriting', {
            count: Number(counts[section]) || 0,
          })}
        </span>
        {#if sectionNotes?.[section]}
          <p class="manager-muted" data-scoped-list-inherit-note={section}>
            {sectionNotes[section]}
          </p>
        {/if}
      </div>
    {/each}
  </div>

  <ul class="manager-scoped-catalogue-systems" role="list">
    {#each entry?.systems ?? [] as row (row.systemId)}
      <li class="manager-scoped-catalogue-system" data-scoped-list-system={row.systemId}>
        <span class="manager-scoped-catalogue-system-name">{systemLabel(row)}</span>
        <MembershipActions
          entityType={scope?.entityType ?? 'component'}
          entityId={entry?.id ?? ''}
          systemId={row.systemId}
          entityName={entry?.entity?.name ?? entry?.id ?? ''}
          systemName={systemLabel(row)}
          member={row.member === true}
          enabled={row.enabled === true}
          copyable={copyable(entry, row.systemId)}
          {armedToken}
          onArm={(token) => (armedToken = token)}
          onDisarm={() => (armedToken = '')}
          onAdd={() => actions?.addToSystem?.(entry.id, row.systemId)}
          onRemove={() => actions?.removeFromSystem?.(entry.id, row.systemId)}
          onCopyFrom={() => actions?.copyMembership?.(entry.id, row.systemId)}
          onToggleEnabled={(next) => actions?.setEnabled?.(entry.id, row.systemId, next)}
        />
      </li>
    {/each}
  </ul>

  {#if inspectorBody}{@render inspectorBody(entry, ctx)}{/if}
{/snippet}

<style>
  /* STATIC class names, so Svelte can prove each selector is used and `lint:svelte:warnings`
     stays at zero. The only rules that leave this file are the ones for markup this component
     does not own — the composed toolbar's row — which live in `styles/fabricate.css`. */
  .manager-scoped-catalogue {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
  }

  .manager-scoped-catalogue-facts {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-scoped-catalogue-facts-head {
    margin: 0;
    color: var(--fab-text-secondary);
    font-family: var(--fab-font-serif);
    font-size: 0.78rem;
    font-weight: 600;
  }

  .manager-scoped-catalogue-fact {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-chip);
    align-items: baseline;
    min-width: 0;
  }

  .manager-scoped-catalogue-fact-label {
    color: var(--fab-mv2-text);
    font-size: 0.72rem;
    font-weight: 600;
  }

  .manager-scoped-catalogue-fact-value {
    color: var(--fab-mv2-text-muted);
    font-size: 0.72rem;
  }

  .manager-scoped-catalogue-systems {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    margin: 0;
    padding: 0;
    list-style: none;
    min-width: 0;
  }

  .manager-scoped-catalogue-system {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  .manager-scoped-catalogue-system-name {
    color: var(--fab-mv2-text);
    font-size: 0.74rem;
    font-weight: 600;
    overflow-wrap: break-word;
  }
</style>
