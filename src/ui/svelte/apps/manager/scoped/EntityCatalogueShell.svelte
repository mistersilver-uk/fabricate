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
     `removeFromSystem`, and `setEnabled` only when `scope.enableable`. `copyMembership` is
     deliberately NOT called; see `copyable` below.
   - systems: the crafting-system roster, for names only.
   - hookValue: the `data-scoped-list` value; the page still owns `<main>` and the route hook.
   - title / subtitle / icon / emptyTitle / emptyHint: pre-localized, from the lane.
   - filters / sorts / searchOf: the lane's extra list configuration.
   - sectionNotes: `{[section]: string}` — the one-line summary of what each world default
     resolves to. Without it a count reads "Category · 3" and never says WHAT three systems are
     inheriting, and a row-count criterion passes green over every note empty.
   - sectionTitles: `{[section]: string}` — the card TITLE for each world-default section, which
     is the value the default resolves to stated as a phrase (`Effects from Ember Brand`), not the
     section's own name. The prototype's cards title themselves after their VALUE and put the
     inherit arithmetic underneath; a card titled `Effect source` states which row it is and
     nothing about what a GM would be changing.
   - sectionIcons: `{[section]: string}` — the leading glyph per card, from the lane's own
     vocabulary, so a wand means effects on this screen exactly as it does in the row.
   - extraCards: `{id, icon, title, note}[]` — cards the SECTIONS do not produce. An essence's
     enabled roll-up is one: it is a per-membership flag rather than a world default, so it has no
     section and no inherit count, and the prototype still draws it in the same stack.
   - inspectorKicker / inspectorCaption / inspectorFoot / countUnit / membershipFilter /
     selectAllLabel: threaded straight to the frame; see its own prop notes. `inspectorCaption`
     is the one that had to be ADDED after the fact: the essence catalogue passed it, this shell
     did not declare it, and a snippet a shell does not forward is dropped in SILENCE — the frame
     rendered its own name-only fallback and the caption looked merely unfinished rather than
     unwired.
   - rowTrailing / rowSecondLine / describeEntry / openEntryLabel / systemRowAction: the row and
     inspector parity switches, each opt-in and each defaulting to what shipped. See the frame's
     prop notes and the system row's own note for `systemRowAction`.
   - onOpenSystemRules(entityId, systemId): the inspector system row's `Rules ↗` deep link, into
     that system's own rules for this entity. `null` — the default — falls the row back to the
     membership cluster, so a lane whose shell has nowhere to route to still gets a usable row.
     See the row itself for why a MEMBER row prefers the link.
   - selectedId: the inspected row, BINDABLE and threaded straight through to the frame, which
     writes it on every row click. An owner that binds can never hold a different value from the
     list, which is what lets a refused navigation restore the selection it declined to leave.
     The state an owner binds must be INITIALISED — an uninitialised `$state()` throws
     `props_invalid_value` on mount; see the frame's own note.
   - onSelect(entityId): called after the write, for an owner that reacts without binding.
   - onOpenEntry(entityId): the row's pen, into that entity's world entry editor.
   - rowMeta / inspectorBody / bulk: the lane's three snippets.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Pagination from '../../../components/Pagination.svelte';
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
    selectAllLabel = '',
    onOpenSystemRules = null,
    selectedId = $bindable(''),
    onSelect = () => {},
    onOpenEntry = () => {},
    rowMeta = undefined,
    // Threaded straight to the frame; see its own prop notes. All four are OPT-IN and default to
    // exactly what the component and essence catalogues render today.
    rowTrailing = undefined,
    rowSecondLine = 'description',
    describeEntry = undefined,
    // The ROW ACTION the list offers per entity. `pen` is the shipped icon button; `labelled`
    // is the design's bordered `Edit <noun> ⧉`, which is also what our own system rules list
    // already draws — so the default is the compatible one and a lane opts into parity.
    openEntryLabel = '',
    // WHAT AN INSPECTOR SYSTEM ROW OFFERS. `manage` is the shipped pair — a `Rules ⧉` link for a
    // member and the membership cluster for a non-member. `navigate` is the design's tool
    // catalogue: EVERY row is a link, and the verb that creates a system's record lives on the
    // system's own screen rather than on the world catalogue.
    systemRowAction = 'manage',
    inspectorBody = undefined,
    bulk = undefined,
    emptyTitle = '',
    emptyHint = '',
  } = $props();

  /** The system-rules list's page size. Five rows, as the prototype's pager states. */
  const SYSTEM_PAGE_SIZE = 5;

  let systemQuery = $state('');
  let systemPageIndex = $state(0);

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
  // The DENOMINATOR of the system-rules count. `systems` is the crafting-system roster the frame
  // narrows to `{id, name}`; the entry's own `systems` array is the JOIN and has one row per
  // roster entry, so either would answer — this one because it is what the prototype's `/ 24`
  // counts, the world's systems, whether or not this essence has been joined to them.
  const rosterSize = $derived(Array.isArray(systems) ? systems.length : 0);
  const rowActions = $derived([
    {
      id: 'open-entry',
      icon: 'fas fa-pen',
      // A LANE THAT NAMES THE VERB GETS THE LABELLED BUTTON. The design's row action reads
      // `Edit tool ⧉`, and a bare pen states neither the verb nor the noun; the shipped `Open`
      // icon button stays the default so no other catalogue's row moves.
      labelled: Boolean(openEntryLabel),
      label: openEntryLabel || text('FABRICATE.Admin.Manager.Scoped.List.OpenEntry', 'Open'),
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
   * COPY-FROM IS SUPPRESSED IN THIS SHELL, AND THAT IS A DECISION RATHER THAN AN OMISSION.
   *
   * `copyMembership(entityId, fromSystemId, toSystemIds)` needs a SOURCE and a list of
   * DESTINATIONS. What a per-system row here knows is its own id, and — because
   * `MembershipActions` renders Copy only inside its `member` branch — that id is the
   * DESTINATION, the system that already has the entity. The source is whichever OTHER system
   * the GM meant, and nothing on this screen asks them.
   *
   * The label is `Copy from…`, with the ellipsis that promises a chooser, and this shell has
   * none. Offering the button anyway means one of two failures: a call missing its third
   * argument, which `copyMembership` refuses before it writes anything and reports nothing — a
   * button that silently does nothing on every click forever — or a guess at the source, which
   * writes the wrong system's overrides onto a record and is worse.
   *
   * A "sometimes correct" version is available and is also refused: when exactly one other
   * system holds the entity the source is unambiguous, and the control would then work on some
   * rows and not others with nothing on screen saying which.
   *
   * SO THE AFFORDANCE IS NOT RENDERED, and the chooser is 6a-ii's — the lane that owns this
   * screen's inspector body, where a source picker belongs. `tests/components/
   * scoped-shell-prop-contract.test.js` bans a two-argument `copyMembership` call from this
   * directory, so the lane that adds the picker cannot re-introduce the silent form.
   *
   * @returns {boolean} always `false`
   */
  function copyable() {
    return false;
  }

  /**
   * The state one `(entity, system)` cell is in, as a machine-readable attribute.
   *
   * ── THREE STATES FOR AN ENABLEABLE TYPE, TWO FOR THE REST ────────────────────────────────────
   * `absent` / `disabled` / `enabled`, read from `member` FIRST: `buildSystemRow` omits `enabled`
   * for a type that has none and answers `false` for a non-member, so a test of `enabled` first
   * would paint every non-member as "disabled" — the one reading a GM cannot act on, since a
   * disabled member is re-enabled by a toggle and a non-member is not. A non-enableable type
   * answers `member`, because "switched off" is not a state a component membership can be in.
   *
   * ── WHY IT IS DERIVED HERE AND NOT IMPORTED FROM `essenceScoped.js` ──────────────────────────
   * That leaf's `essenceSystemState` answers the same question for the essence family and is what
   * the essence screens read. This shell is entity-AGNOSTIC by contract — nothing in it tests
   * `scope.entityType` — so it cannot import an essence module, and its answer has a fourth value
   * the essence one does not need. `scope.enableable` is the descriptor's own flag, so the split
   * is between two answers to two questions rather than two copies of one.
   *
   * The attribute exists because the state has to stay MEASURABLE. It used to live on the row's
   * per-system pip strip, which the prototype does not draw and issue 1372 deleted; without this
   * the three states would be conveyed only by which controls `MembershipActions` happens to
   * render, and the delta's criterion 5 would have nothing to assert against.
   *
   * @param {{member?: boolean, enabled?: boolean}} row a projected system row.
   * @returns {string}
   */
  function membershipState(row) {
    if (row?.member !== true) return 'absent';
    if (scope?.enableable !== true) return 'member';
    return row?.enabled === true ? 'enabled' : 'disabled';
  }

  /**
   * The inspected entry's system rows, narrowed by the inspector's own search box.
   *
   * IT SEARCHES THE DISPLAY LABEL, which is `systemLabel`'s id fallback where a system has no
   * name — so a roster whose names never loaded is still searchable by the ids on screen rather
   * than by nothing at all.
   *
   * @param {object|null} entry
   * @returns {object[]}
   */
  function systemRowsOf(entry) {
    const rows = Array.isArray(entry?.systems) ? entry.systems : [];
    const needle = systemQuery.trim().toLowerCase();
    if (needle === '') return rows;
    return rows.filter((row) => systemLabel(row).toLowerCase().includes(needle));
  }

  /**
   * Reset the system list to its first page.
   *
   * A search that shrinks the list below the current page would otherwise leave the panel on an
   * empty page with a pager reading `Showing 11–5 of 3`, which is the same clamp defect
   * `EntityListInspectorFrame`'s header records against the main list.
   */
  function changeSystemQuery(value) {
    systemQuery = String(value ?? '');
    systemPageIndex = 0;
  }

  // A NEW SELECTION IS A NEW LIST. Without this the panel keeps the previous entry's page index
  // and search term, so clicking a six-system row after paging to page three of a thirteen-system
  // one shows an empty system list under a full inspector.
  $effect(() => {
    void selectedId;
    systemQuery = '';
    systemPageIndex = 0;
  });
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
    {describeEntry}
    {bulk}
    {inspectorKicker}
    {inspectorCaption}
    {inspectorFoot}
    {countUnit}
    {membershipFilter}
    {selectAllLabel}
    bind:selectedId
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
  {@const rows = systemRowsOf(entry)}
  {@const pageCount = Math.max(1, Math.ceil(rows.length / SYSTEM_PAGE_SIZE))}
  {@const pageIndex = Math.min(systemPageIndex, pageCount - 1)}
  {@const pageRows = rows.slice(pageIndex * SYSTEM_PAGE_SIZE, (pageIndex + 1) * SYSTEM_PAGE_SIZE)}

  <!--
    THE WORLD DEFAULTS ARE CARDS THAT NAME THEIR VALUE, not a label-and-count run.

    Each card is `[glyph] {what this default IS} / {how many systems take it}` (`essences.png`).
    What shipped was `Effect source · 0 inheriting` with the value on a third line below, which
    inverts the prototype's emphasis: the count is the footnote and the value is the fact. The
    inherit COUNT is still on the card and still hooked by `data-scoped-list-inherit-count`, so
    nothing that could read it before has lost it.
  -->
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
          <span class="manager-scoped-catalogue-card-note" data-scoped-list-inherit-note={section}>
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

  <!--
    THE SYSTEM LIST IS A SEARCHED, PAGED SECTION WITH A COUNT — because at a real world's roster
    it is otherwise the whole panel.

    The prototype heads it `SYSTEM RULES  13 / 24`, gives it a search field and pages it five at a
    time (`essences.png`). This shell rendered every system in the roster, unheaded and unpaged,
    each row a stacked name over an enable switch and a red Remove — measured at six lab systems
    that was about 350px of destructive controls between the world defaults and the panel's only
    navigation. The row is now ONE line, name leading and its actions trailing, which is the
    prototype's silhouette with this screen's function intact.
  -->
  <section class="manager-scoped-catalogue-section" data-scoped-list-systems>
    <div class="manager-scoped-catalogue-section-head">
      <p class="manager-kicker">
        {text('FABRICATE.Admin.Manager.Scoped.List.SystemRulesHead', 'System rules')}
      </p>
      <span class="manager-scoped-catalogue-section-count" data-scoped-list-system-count>
        {format('FABRICATE.Admin.Manager.Scoped.List.SystemRulesCount', '{members} / {total}', {
          members: Number(entry?.membershipCount) || 0,
          total: rosterSize,
        })}
      </span>
    </div>

    <label class="manager-search manager-scoped-catalogue-search">
      <i class="fas fa-search" aria-hidden="true"></i>
      <input
        type="search"
        value={systemQuery}
        data-scoped-list-system-search
        placeholder={text('FABRICATE.Admin.Manager.Scoped.List.SearchSystems', 'Search systems…')}
        aria-label={text(
          'FABRICATE.Admin.Manager.Scoped.List.SearchSystemsLabel',
          'Search systems'
        )}
        oninput={(event) => changeSystemQuery(event.currentTarget.value)}
      />
    </label>

    <ul class="manager-scoped-catalogue-systems" role="list">
      {#each pageRows as row (row.systemId)}
        <li
          class="manager-scoped-catalogue-system"
          data-scoped-list-system={row.systemId}
          data-scoped-system={row.systemId}
          data-scoped-system-state={membershipState(row)}
        >
          <span class="manager-scoped-catalogue-system-name">{systemLabel(row)}</span>
          <!--
            A MEMBER ROW IS A LINK; A NON-MEMBER ROW IS AN ADD.

            The prototype's system row is `[System name]  [Rules ↗]` (`essences.png`) — this panel
            is where a GM finds out WHICH systems hold the entity and gets to each one's rules, and
            it is not where they edit those rules. What shipped here was the full membership
            cluster: an enable switch and a red Remove on every row, which put a destructive delete
            on five rows of a navigation panel and made the row three lines tall.

            Enable and Remove are NOT lost. They are on the world ENTRY editor's per-system rules
            section, one click away through this panel's own `Open definition` foot action, which
            is the layer that owns them — and the entry editor states each row's inherit state
            beside them, which this 258px row never could.

            A NON-MEMBER row keeps `MembershipActions`, because there is no rules screen to link to
            for a system that has no record: Add is the only verb it has, and it is not
            destructive. That is also why the whole cluster is not simply deleted.

            ── `systemRowAction: 'navigate'` OVERRIDES THAT LAST PARAGRAPH, AND THE TOOL CATALOGUE
            TAKES IT (issue 1373, maintainer ruling). The design's tool catalogue rows are
            `[System name] [Rules ⧉]` and nothing else, member or not: this panel says WHICH
            systems hold the Tool and how to reach each one's rules, and the verb that creates a
            system's record belongs on that system's own Tool Rules screen — where its inspector
            already pins `Add {tool} to {system}`. A write action here put the create verb on the
            world catalogue, one scope away from the record it writes.

            The link is still meaningful for a NON-MEMBER under this mode: the rules list it opens
            is the system's whole Tool Rules screen, which is exactly where the adoption happens.
          -->
          {#if (row.member === true || systemRowAction === 'navigate') && onOpenSystemRules}
            <button
              type="button"
              class="manager-scoped-catalogue-system-link"
              data-scoped-list-system-rules={row.systemId}
              title={format(
                'FABRICATE.Admin.Manager.Scoped.List.OpenSystemRulesNamed',
                'Open {system} rules for {entity}',
                {
                  system: systemLabel(row),
                  entity: entry?.entity?.name ?? entry?.id ?? '',
                }
              )}
              onclick={() => onOpenSystemRules(entry.id, row.systemId)}
            >
              <span>{text('FABRICATE.Admin.Manager.Scoped.List.OpenSystemRules', 'Rules')}</span>
              <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
            </button>
          {:else}
            <MembershipActions
              entityType={scope?.entityType ?? 'component'}
              entityId={entry?.id ?? ''}
              systemId={row.systemId}
              entityName={entry?.entity?.name ?? entry?.id ?? ''}
              systemName={systemLabel(row)}
              member={row.member === true}
              enabled={row.enabled === true}
              copyable={copyable()}
              hint={false}
              compact={true}
              {armedToken}
              onArm={(token) => (armedToken = token)}
              onDisarm={() => (armedToken = '')}
              onAdd={() => actions?.addToSystem?.(entry.id, row.systemId)}
              onRemove={() => actions?.removeFromSystem?.(entry.id, row.systemId)}
              onToggleEnabled={(next) => actions?.setEnabled?.(entry.id, row.systemId, next)}
            />
          {/if}
        </li>
      {/each}
    </ul>

    <!-- NO per-page selector: see `Pagination`'s own `showPageSize` note. The window is five
         rows because the prototype's pager states five, and a size a GM cannot change is not a
         control they need offered. -->
    <Pagination
      persistent={true}
      showPageSize={false}
      totalCount={rows.length}
      {pageIndex}
      pageSize={SYSTEM_PAGE_SIZE}
      onPageChange={(next) => (systemPageIndex = next)}
    />
  </section>

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

  /* THE PANEL'S VERTICAL BUDGET IS THE WHOLE REASON THIS IS TIGHT.

     A 900px window gives the inspector about 660px, and the prototype fits an identity block,
     three world-default cards, a section head, a search field, FIVE system rows and a pager into
     it with the primary action pinned below (`essences.png`). At the manager's default
     `--fab-space-2` rhythm that stack is roughly 680px and the pager falls below the fold — the
     one control that says there are more systems than the five on screen. Every gap below is
     therefore stated rather than inherited. */
  .manager-scoped-catalogue-section {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  .manager-scoped-catalogue-section-head {
    display: flex;
    gap: var(--fab-space-2);
    align-items: baseline;
    justify-content: space-between;
    min-width: 0;
  }

  /* The `13 / 24` at the trailing edge of the section head: members over roster. `tabular-nums`
     so the pair does not shuffle as a GM adds systems. */
  .manager-scoped-catalogue-section-count {
    flex: 0 0 auto;
    color: var(--fab-text-subtle);
    font-family: var(--fab-font-mono);
    font-size: 0.66rem;
    font-variant-numeric: tabular-nums;
  }

  /* ONE WORLD DEFAULT, AS A CARD. Glyph, then a title that names the VALUE over a note that
     states the arithmetic — the prototype's `Effects from Ember Brand` / `7 of 13 systems inherit
     it` (`essences.png`). */
  .manager-scoped-catalogue-card {
    display: flex;
    gap: var(--fab-space-2);
    align-items: flex-start;
    padding: 6px var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    /* NO FILL. The prototype draws every card in the content area on the pane's own surface and
       separates them with a 1px border alone (issue 1372); a fill here put a fifth grey on a
       screen that has one. */
    background: transparent;
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
    /* The ONE lighter surface inside a card, and it is the prototype's: a glyph tile is a
       CONTROL-sized inset, so it takes the same rung the search field and the selects do. */
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

  /* The search field is the shipped `.manager-search`; only its own row sizing is stated here,
     because the global rule sizes it for a toolbar rather than for a 300px column. */
  .manager-scoped-catalogue-search {
    flex: 0 0 auto;
    width: 100%;
    min-width: 0;
  }

  .manager-scoped-catalogue-systems {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    margin: 0;
    padding: 0;
    list-style: none;
    min-width: 0;
  }

  /* ONE LINE PER SYSTEM: the name leads and its membership cluster trails, where the shipped row
     stacked the two and made a six-system list about 350px tall. */
  .manager-scoped-catalogue-system {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    justify-content: space-between;
    padding: 2px var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    /* NO FILL. The prototype draws every card in the content area on the pane's own surface and
       separates them with a 1px border alone (issue 1372); a fill here put a fifth grey on a
       screen that has one. */
    background: transparent;
    min-width: 0;
  }

  /* THE `Rules ↗` LINK. A quiet bordered pill rather than a `ManagerButton`: it is a navigation
     affordance inside a list row, so it must not compete with the panel's one primary action at
     the foot, and the prototype draws it as a small outlined link (`essences.png`). It carries
     the manager's `<button>` reset assumptions locally because Foundry's host rule centres a
     button's content and pins a fixed height. */
  .manager-scoped-catalogue-system-link {
    display: inline-flex;
    flex: 0 0 auto;
    gap: var(--fab-space-chip);
    align-items: center;
    justify-content: center;
    width: auto;
    height: 24px;
    min-height: 24px;
    padding: 0 var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 7px;
    background: transparent;
    color: var(--fab-text-muted);
    font-size: 0.62rem;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
  }

  .manager-scoped-catalogue-system-link:hover {
    border-color: var(--fab-accent);
    color: var(--fab-accent);
  }

  /* THE ROW IS ~36px, AND THE 34px CONTROL INSIDE IT IS WHY IT TAKES A RULE.
     `.manager-button` pins `min-height: 34px` for a page-level control; five of those plus the
     row's own padding is 290px of a panel that also has to hold three cards, a search field and a
     pager, so only four rows of five fitted above the fold and the pager was never on screen. The
     prototype's system rows are about 35px tall (`essences.png`), which is this control at 26px.

     Scoped to this row, so no other `ArmedDangerButton` in the manager is retuned. */
  .manager-scoped-catalogue-system :global(.manager-button.is-danger) {
    min-height: 26px;
    padding: 0 var(--fab-space-2);
  }

  .manager-scoped-catalogue-system-name {
    flex: 1 1 0;
    color: var(--fab-text);
    font-size: 0.7rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* THE CLUSTER KEEPS ITS WIDTH AND THE NAME GIVES WAY. `.manager-scoped-membership-actions` is
     `flex-wrap: wrap` in the host sheet, sized for a full-width editor row; dropped into a 258px
     inspector row it wrapped its own two controls onto separate lines and made every system row
     three lines tall. `flex: 0 0 auto` + `nowrap` fixes the cluster at its content width and the
     name — already `overflow: hidden` with an ellipsis — takes the remainder.

     `:global()` because the element belongs to `MembershipActions`, scoped under a local class so
     it reaches no other caller of that component. */
  .manager-scoped-catalogue-system > :global(.manager-scoped-membership-actions) {
    flex: 0 0 auto;
    flex-wrap: nowrap;
  }

  /* `Pagination` renders its own `<section>`, so the sizing has to be stated from this side of the
     boundary — the same reason the frame states it for the list's own pager.

     THE THREE RULES BELOW ARE WHY THE ARROWS ARE ON SCREEN. The shipped bar is built for the foot
     of a full-width list: `gap: --fab-space-3`, `padding: --fab-space-2 --fab-space-3`, a 96px
     minimum on the page label and `flex-wrap: wrap`. In a 258px inspector column that wraps the
     nav onto a second line below the summary, and the second line fell under the panel's own
     scroll edge — so the frame published `Showing 1-5 of 6` with no way to reach row six, which
     is a pager that states there is more and then hides the only control that gets to it.

     `nowrap` plus the tighter metrics put the summary and the nav on one line at this width. */
  .manager-scoped-catalogue-section > :global(.manager-pagination) {
    flex: 0 0 auto;
    flex-wrap: nowrap;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2) 0 0;
    font-size: 0.62rem;
  }

  .manager-scoped-catalogue-section :global(.manager-pagination-page) {
    min-width: 0;
    white-space: nowrap;
  }

  .manager-scoped-catalogue-section :global(.manager-pagination-nav .manager-icon-button) {
    width: 24px;
    height: 24px;
    min-height: 24px;
    flex: 0 0 24px;
  }
</style>
