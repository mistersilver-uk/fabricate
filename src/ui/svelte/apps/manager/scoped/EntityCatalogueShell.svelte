<!-- Svelte 5 runes mode -->
<!--
  The WORLD-SCOPE catalogue shell (issue 1380, epic 1357): one entity-agnostic component behind
  the Component, Essence and Tool catalogues. It composes `EntityListInspectorFrame` and adds an
  INSPECTOR COLUMN (every world route is full width, so the shared aside is suppressed), the
  PER-SECTION INHERIT COUNTS, and the PER-SYSTEM MEMBERSHIP ROWS — from `entry.systems`, the
  projection's JOIN, never from the narrowed `{id, name}` `systems` prop. Every entity-shape
  difference is a DESCRIPTOR answer; nothing tests `scope.entityType`.
  THE NAME MAY NOT START WITH `World`, and it carries NEITHER ROUTE-HOOK ATTRIBUTE — the two
  names are deliberately not written out even here, because `manager-scoped-prop-contract
  .test.js` matches them literally against every file in this directory, comment text included.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import EntityListInspectorFrame from './EntityListInspectorFrame.svelte';
  import SystemRulesRoster from './SystemRulesRoster.svelte';
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
    searchPlaceholder = '',
    sectionNotes = {},
    sectionTitles = {},
    sectionIcons = {},
    extraCards = [],
    inspectorKicker = '',
    inspectorCaption = undefined,
    inspectorFoot = undefined,
    countUnit = '',
    membershipFilter = true,
    // Threaded to the frame. OPT-IN, defaulting to the single toolbar row every catalogue renders.
    splitToolbar = false,
    // Threaded to the frame, both OPT-IN: a toolbar rung and a row tile's descriptor.
    toolbarLeadSize = '',
    rowMedallion = null,
    // Threaded to the frame and on to `BulkSelectionToolbar`; `'results'` is the shipped band.
    selectAllScope = 'results',
    selectAllLabel = '',
    onOpenSystemRules = null,
    // The list's lifted view-state (issue 1438), OWNED by the manager root: opening an entry
    // unmounts this shell, so a slot held here would be destroyed by the trip it must survive.
    browserState = $bindable(null),
    selectedId = $bindable(''),
    onSelect = () => {},
    // WHETHER THE FIRST SHOWN ROW IS INSPECTED ON OPEN (M14). Opt-in.
    autoSelectFirst = false,
    // WHETHER THE LIST COLUMN RUNS EDGE TO EDGE IN ITS PANE (M21). Opt-in.
    flushColumn = false,
    // WHETHER THE BULK DOCK REACHES THE INSPECTOR COLUMN'S EDGES (M24). Opt-in.
    flushBulkDock = false,
    onOpenEntry = () => {},
    rowMeta = undefined,
    // Threaded to the frame. All three are OPT-IN and default to what ships today.
    rowTrailing = undefined,
    rowSecondLine = 'description',
    // Both OPT-IN: a lane drawing its own source pill on the NAME LINE turns the frame's off.
    rowNameTrailing = undefined,
    rowSourceBadge = true,
    describeEntry = undefined,
    // Threaded to the frame. Both OPT-IN and default to what ships today.
    nameEntry = undefined,
    listLead = undefined,
    // `columnLead` puts a scope-wide card ABOVE the toolbar and INSIDE the list column.
    columnLead = undefined,
    // The resting inspector's copy; both default to what shipped.
    restingTitle = '',
    restingHint = '',
    // The ROW ACTION per entity: the shipped icon button, or a lane's named `Edit <noun>` button.
    openEntryLabel = '',
    // WHETHER THAT NAMED VERB IS DRAWN AS A LABELLED BUTTON, which `openEntryLabel` alone conflated.
    openEntryLabelled = null,
    // WHAT AN INSPECTOR SYSTEM ROW OFFERS; passed to `SystemRulesRoster`, which owns the row.
    systemRowAction = 'manage',
    // WHETHER THE INSPECTOR DRAWS THE `World defaults` CARD STACK; the COMPONENT catalogue opts out.
    showWorldDefaults = true,
    // WHERE THE LANE'S INSPECTOR BLOCKS SIT: `'trail'` (shipped) or `'lead'`.
    inspectorBodyPlacement = 'trail',
    // WHAT THE SYSTEM ROSTER SAYS WHEN NO SYSTEM HAS THE ENTITY. Threaded to `SystemRulesRoster`.
    rosterEmptyNote = '',
    // THE ROSTER'S TWO SURFACE DECISIONS, carried here because a page never composes the roster.
    rosterRecessed = false,
    rosterSearchWell = false,
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
  // The DENOMINATOR of the system-rules count: the world's systems, joined or not.
  const rosterSize = $derived(Array.isArray(systems) ? systems.length : 0);
  const rowActions = $derived([
    {
      id: 'open-entry',
      icon: 'fas fa-pen',
      // A LANE THAT NAMES THE VERB GETS THE LABELLED BUTTON; the pen states neither verb nor noun.
      labelled: openEntryLabelled === null ? Boolean(openEntryLabel) : openEntryLabelled === true,
      label: openEntryLabel || text('FABRICATE.Admin.Manager.Scoped.List.OpenEntry', 'Open'),
      run: (entry) => onOpenEntry(entry.id),
    },
  ]);

  /**
   * COPY-FROM IS SUPPRESSED IN THIS SHELL, AND THAT IS A DECISION. `copyMembership` needs a
   * SOURCE and DESTINATIONS, and a row here knows only its own id — the DESTINATION. Offering it
   * gives a two-argument call the store refuses silently, or a guess that writes the wrong
   * system's overrides; `scoped-shell-prop-contract.test.js` bans that form from this directory.
   */
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
    {searchPlaceholder}
    {rowActions}
    {rowMeta}
    {rowTrailing}
    {rowSecondLine}
    {rowNameTrailing}
    {rowSourceBadge}
    {describeEntry}
    {nameEntry}
    {listLead}
    {columnLead}
    {restingTitle}
    {restingHint}
    {bulk}
    {inspectorKicker}
    {inspectorCaption}
    {inspectorFoot}
    {countUnit}
    {membershipFilter}
    {splitToolbar}
    {toolbarLeadSize}
    {rowMedallion}
    {selectAllScope}
    {selectAllLabel}
    bind:browserState
    bind:selectedId
    {onSelect}
    {autoSelectFirst}
    {flushColumn}
    {flushBulkDock}
    bind:armedToken
    inspectorBody={catalogueInspector}
  />
</div>

<!-- The inspector body WRAPS the lane's, keeping the frame's "renders iff supplied" literal. -->
{#snippet catalogueInspector(entry, ctx)}
  {@const counts = entry?.inheritCounts ?? {}}

  <!--
    THE LANE'S OWN BLOCKS COME FIRST WHEN IT SAYS SO: shell-first is right for a panel that is an
    ADDITION and wrong for one the reference draws ABOVE the roster. The shell's own two regions
    keep their order relative to each other.
  -->
  {#if inspectorBody && inspectorBodyPlacement === 'lead'}
    {@render inspectorBody(entry, ctx)}
  {/if}

  <!--
    THE WORLD DEFAULTS ARE CARDS THAT NAME THEIR VALUE: the count is the footnote and the value
    is the fact. It is still hooked by `data-scoped-list-inherit-count`.
  -->
  {#if showWorldDefaults}
    <section class="manager-scoped-catalogue-section" data-scoped-list-defaults>
      <p class="manager-kicker">
        {text('FABRICATE.Admin.Manager.Scoped.List.DefaultsHead', 'World defaults')}
      </p>
      {#each sections as section (section)}
        <div class="manager-scoped-catalogue-card" data-scoped-list-inherit-count={section}>
          <span class="manager-scoped-catalogue-card-icon" aria-hidden="true">
            <i class={sectionIcons?.[section] || 'fas fa-sliders'}></i>
          </span>
          <span class="manager-scoped-catalogue-card-copy">
            <span class="manager-scoped-catalogue-card-title">
              {sectionTitles?.[section] || scopedSectionLabel(section, text)}
            </span>
            <span
              class="manager-scoped-catalogue-card-note"
              data-scoped-list-inherit-note={section}
            >
              {sectionNotes?.[section] ||
                format('FABRICATE.Admin.Manager.Scoped.List.InheritCount', '{count} inheriting', {
                  count: Number(counts[section]) || 0,
                })}
            </span>
          </span>
        </div>
      {/each}
      {#each extraCards as card (card.id)}
        <div class="manager-scoped-catalogue-card" data-scoped-list-extra-card={card.id}>
          <span class="manager-scoped-catalogue-card-icon" aria-hidden="true">
            <i class={card.icon || 'fas fa-sliders'}></i>
          </span>
          <span class="manager-scoped-catalogue-card-copy">
            <span class="manager-scoped-catalogue-card-title">{card.title}</span>
            {#if card.note}
              <span class="manager-scoped-catalogue-card-note">{card.note}</span>
            {/if}
          </span>
        </div>
      {/each}
    </section>
  {/if}

  <!-- THE SYSTEM LIST IS `SystemRulesRoster`, COMPOSED RATHER THAN INLINED (issue 1372). -->
  <SystemRulesRoster
    rows={Array.isArray(entry?.systems) ? entry.systems : []}
    memberCount={Number(entry?.membershipCount) || 0}
    {rosterSize}
    entityId={entry?.id ?? ''}
    entityName={entry?.entity?.name ?? entry?.id ?? ''}
    entityType={scope?.entityType ?? 'component'}
    enableable={scope?.enableable === true}
    {actions}
    {onOpenSystemRules}
    {systemRowAction}
    {rosterEmptyNote}
    recessed={rosterRecessed}
    searchWell={rosterSearchWell}
    {armedToken}
    onArm={(token) => (armedToken = token)}
    onDisarm={() => (armedToken = '')}
    resetKey={selectedId}
  />

  {#if inspectorBody && inspectorBodyPlacement !== 'lead'}
    {@render inspectorBody(entry, ctx)}
  {/if}
{/snippet}

<style>
  /* STATIC class names, so `lint:svelte:warnings` stays at zero. */
  .manager-scoped-catalogue {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
  }

  /* THE PANEL'S VERTICAL BUDGET IS WHY THIS IS TIGHT: about 660px for everything below. */
  .manager-scoped-catalogue-section {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  /* ONE WORLD DEFAULT, AS A CARD: a title naming the VALUE over a note stating the arithmetic. */
  .manager-scoped-catalogue-card {
    display: flex;
    gap: var(--fab-space-2);
    align-items: flex-start;
    padding: 6px var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    /* THE RECESS HAS SOMEWHERE TO GO, BECAUSE THIS IS NOT IN THE PANE but in the ASIDE. */
    background: var(--fab-bg-0);
    min-width: 0;
  }

  .manager-scoped-catalogue-card-icon {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 7px;
    /* The ONE lighter surface inside a card: a glyph tile is a CONTROL-sized inset. */
    background: var(--fab-bg-1);
    color: var(--fab-accent);
    font-size: 0.72rem;
  }

  .manager-scoped-catalogue-card-copy {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .manager-scoped-catalogue-card-title {
    color: var(--fab-text);
    font-size: 0.72rem;
    font-weight: 700;
    overflow-wrap: break-word;
  }

  .manager-scoped-catalogue-card-note {
    color: var(--fab-text-muted);
    font-size: 0.62rem;
    line-height: 1.35;
    overflow-wrap: break-word;
  }
</style>
