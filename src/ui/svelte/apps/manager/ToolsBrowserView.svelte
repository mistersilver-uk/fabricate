<!-- Svelte 5 runes mode -->
<script>
  import Chip from './Chip.svelte';
  import EmptyState from './EmptyState.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import ItemDropZone from './ItemDropZone.svelte';
  import { projectToolRow, toolSearchText } from './tools/toolStudio.js';
  import {
    breakModeSourcePill,
    INHERIT_BREAK_MODE,
    systemBreakModeOptions,
  } from './scoped/worldToolStudio.js';

  let {
    tools = [],
    selectedToolId = '',
    managedItemOptions = [],
    breakageAuthority = 'toolSpecific',
    // THE WORLD SCOPE'S OWN PROJECTION and the AUTHORING LAYER of the resolved token above
    // (issue 1373). Both are already passed by the call site, which is what makes the
    // tri-state buildable without reopening a gateway file: `CraftingSystemManagerRoot`
    // spreads the tool bundle FIRST and restates `breakageAuthority` / `breakageSource`
    // after, so declaring exactly what the site passes keeps the lookup off the spread.
    //
    // Declaring a name the site does NOT pass would make every reader of it a live
    // subscriber to the whole bundle, which the root's own note records; both of these are
    // passed, so neither does.
    scope = null,
    // THE WORLD TOOL WRITE FAMILY, for the one write this screen makes that its own system
    // cannot: adopting a world Tool that has no rules record here. Passed by the call site in
    // the same tool bundle as `scope`.
    actions = null,
    // THE CRAFTING SYSTEM THIS SCREEN IS SCOPED TO, and it is read rather than inferred.
    // `scope.entries[].systems[]` is the world projection's own JOIN, and picking this
    // system's row out of it is the only way a row can state whether it INHERITS the world
    // defaults or overrides one — the system's own tool record carries the resolved values
    // and cannot tell the two apart. The call site already passes it in the tool bundle.
    systemId = '',
    breakageSource = 'default',
    onSelectTool = () => {},
    onEditTool = () => {},
    // STILL DECLARED, and the drop zone it feeds is still on this screen. The prototype
    // creates a Tool from the WORLD catalogue instead, and moving it is not a layout move:
    // world-scope creation needs the dropped Item RESOLVED to a name, image and uuid, which
    // only `services.resolveToolSource` answers, and `worldScopeActions` deliberately reads
    // no Foundry global. Removing the zone before that action exists would delete the only
    // Tool-creation surface in the manager, so the inversion is reported rather than half-made.
    onCreateToolDrop = () => {},
    onToggleToolEnabled = () => {},
    onSetBreakageAuthority = () => {},
  } = $props();

  /**
   * The two INHERITED world-default sections, named once. `repairRequirements` is deliberately
   * absent: `worldToolStudio` records that it is SEEDED on adoption and then diverges, so it
   * has no inherit state a row could report.
   */
  const TOOL_WORLD_SECTIONS = [
    { id: 'breakage', key: 'FABRICATE.Admin.Manager.Tools.Breakage', label: 'Breakage' },
    { id: 'onBreak', key: 'FABRICATE.Admin.Manager.Tools.OnBreak', label: 'On break' },
  ];

  let searchTerm = $state('');
  let membershipFilter = $state('in');
  let sortKey = $state('name');
  let sortDirection = $state('asc');
  let pageIndex = $state(0);
  let pageSize = $state(8);
  let autoSelectedToolId = $state('');

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // PROJECTED TO A SCALAR IMMEDIATELY, and that is a cost decision rather than a style one.
  // `scope` is a NEW OBJECT on every world-corpus publish, so reading it inside a reactive
  // scope would re-render this whole view on every world-scope edit. One derivation bounds
  // that to a string comparison; world-corpus publishes are GM-edit-driven, not per-frame.
  //
  // `worldScopeProjection` attaches `toolBreakage` ONLY when the corpus holds one, so `''`
  // means the world authored nothing - which is a different label and a different pill from
  // an authored `toolSpecific`, and is why this is read rather than inferred from the
  // resolved token.
  const worldAuthority = $derived(scope?.toolBreakage?.authority ?? '');

  const authoritySegments = $derived(
    systemBreakModeOptions({
      worldAuthority,
      systemAuthority: breakageAuthority,
      source: breakageSource,
      text,
    })
  );

  const authorityPill = $derived(breakModeSourcePill(breakageSource, text));

  // THE WORLD PROJECTION'S PER-SYSTEM JOIN, indexed by world entity id. Read as a Map rather
  // than scanned per row: `scope` republishes a NEW object on every world-scope edit and a
  // `find` per row would walk the whole corpus once per Tool on every one of them.
  const worldRowsByToolId = $derived(
    new Map(
      (Array.isArray(scope?.entries) ? scope.entries : []).map((entry) => [
        String(entry?.id ?? ''),
        (Array.isArray(entry?.systems) ? entry.systems : []).find(
          (row) => row?.systemId === systemId
        ) ?? null,
      ])
    )
  );

  /**
   * What one row says about its relationship to the world defaults, or `null` when the world
   * corpus has no record of this Tool and there is therefore nothing to inherit FROM.
   *
   * `null` is a real answer rather than a fallback: a Tool that exists only in this system
   * inherits nothing, and writing "Inherits world defaults" over it would claim a parent that
   * does not exist. The screen states nothing there instead.
   *
   * @param {string} toolId
   * @returns {{state: string, label: string}|null}
   */
  function inheritState(toolId) {
    const row = worldRowsByToolId.get(String(toolId || ''));
    if (!row || row.member !== true) return null;
    const overridden = TOOL_WORLD_SECTIONS.filter(
      (section) => row.inherited?.[section.id] === false
    );
    if (overridden.length === 0) {
      return {
        state: 'inherited',
        label: text('FABRICATE.Admin.Manager.Tools.RowInheritsWorld', 'Inherits world defaults'),
      };
    }
    return {
      state: 'overridden',
      label: text('FABRICATE.Admin.Manager.Tools.RowOverrides', 'Overrides {sections}').replace(
        '{sections}',
        overridden.map((section) => text(section.key, section.label).toLocaleLowerCase()).join(', ')
      ),
    };
  }

  // ── THE THREE MEMBERSHIP FILTERS ────────────────────────────────────────────────────────
  // `all` is the one that changes what a row IS. Search and sort narrow a list of THIS
  // system's tools; `All world tools` widens it past them, to world records this system has
  // no rules for at all — which is the only route on this screen to a Tool a GM has not
  // adopted yet, and therefore the only thing the inspector's `Add … to …` button can act on.
  const systemToolIds = $derived(new Set(tools.map((tool) => String(tool?.id ?? ''))));
  const worldEntries = $derived(Array.isArray(scope?.entries) ? scope.entries : []);

  /**
   * The world records this system has NO tool for, projected to the same row shape a member
   * renders through. They are `member: false` and carry no breakage, enabled or validation
   * answer, because this system has authored none: everything a row states about behaviour is
   * a MEMBERSHIP fact, and inventing one from the world default would claim rules that do not
   * exist here.
   */
  const ghostRows = $derived(
    worldEntries
      .filter((entry) => !systemToolIds.has(String(entry?.id ?? '')))
      .map((entry) => ({
        id: String(entry?.id ?? ''),
        member: false,
        tool: null,
        name: entry?.entity?.name || String(entry?.id ?? ''),
        img: entry?.entity?.img || '',
        description: entry?.entity?.description || '',
        search: `${entry?.entity?.name ?? ''} ${entry?.entity?.description ?? ''}`.toLowerCase(),
      }))
  );

  const memberRows = $derived(
    tools.map((tool) => {
      const projected = projectToolRow(tool, managedItemOptions, breakageAuthority);
      return {
        id: projected.id,
        member: true,
        tool,
        name: projected.name,
        img: projected.img,
        description: projected.description,
        search: toolSearchText(tool, managedItemOptions),
        projected,
      };
    })
  );

  const membershipFilters = $derived([
    {
      id: 'in',
      label: text(
        'FABRICATE.Admin.Manager.Tools.FilterInSystem',
        'In this system ({count})'
      ).replace('{count}', String(memberRows.length)),
    },
    {
      id: 'all',
      label: text(
        'FABRICATE.Admin.Manager.Tools.FilterAllWorld',
        'All world tools ({count})'
      ).replace('{count}', String(memberRows.length + ghostRows.length)),
    },
    {
      id: 'over',
      label: text('FABRICATE.Admin.Manager.Tools.FilterOverriding', 'Overriding'),
    },
  ]);

  const filteredRows = $derived(
    (membershipFilter === 'all' ? [...memberRows, ...ghostRows] : memberRows)
      .filter((row) => membershipFilter !== 'over' || inheritState(row.id)?.state === 'overridden')
      .filter((row) => {
        const needle = searchTerm.trim().toLowerCase();
        return !needle || row.search.includes(needle);
      })
      .sort((left, right) => {
        const order =
          sortKey === 'state'
            ? Number(right.member) - Number(left.member) || left.name.localeCompare(right.name)
            : left.name.localeCompare(right.name);
        return sortDirection === 'desc' ? -order : order;
      })
  );

  // KEPT AS THE PAGER'S INPUT under its shipped name, because the Foundry smoke's
  // `assertToolLibraryPagination` phase pins this list's footer geometry.
  const filteredTools = $derived(filteredRows);
  const pagedTools = $derived(
    filteredTools.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
  );

  const resultCountText = $derived(
    text(
      'FABRICATE.Admin.Manager.Tools.ResultCountScoped',
      '{shown} shown · {member} of {world} in this system'
    )
      .replace('{shown}', String(filteredRows.length))
      .replace('{member}', String(memberRows.length))
      .replace('{world}', String(memberRows.length + ghostRows.length))
  );

  $effect(() => {
    if (pageIndex > 0 && pageIndex * pageSize >= filteredTools.length) pageIndex = 0;
  });

  $effect(() => {
    if (tools.some((tool) => tool.id === selectedToolId)) {
      autoSelectedToolId = '';
      return;
    }
    const firstToolId = tools[0]?.id || '';
    if (!firstToolId || autoSelectedToolId === firstToolId) return;
    autoSelectedToolId = firstToolId;
    onSelectTool(firstToolId);
  });

  /**
   * Select a row, IF it is one this screen's inspector can describe.
   *
   * A world Tool with no rules record here is listed so a GM can adopt it, but the inspector
   * beside the list is fed `selectedLibraryTool` - a lookup over THIS system's tools - so
   * selecting an unadopted row would empty the panel rather than describe the row. The
   * prototype's inspector answers that state with a `No rules here` pill, which needs the
   * membership flag and the system name at the inspector's call site; until it has them the
   * row's own `Add to system` button is the whole affordance.
   *
   * @param {{id: string, member: boolean}} entry
   * @returns {void}
   */
  function chooseTool(entry) {
    if (!entry.member) return;
    onSelectTool(entry.id);
  }

  function breakageLabel(tool, kind) {
    if (kind === 'immune') return text('FABRICATE.Admin.Manager.Tools.SummaryImmune', 'Immune');
    if (kind === 'breakable')
      return text('FABRICATE.Admin.Manager.Tools.SummaryCheckDriven', 'Roll to break');
    if (kind === 'breakageChance') {
      return text('FABRICATE.Admin.Manager.Tools.SummaryChanceValue', '{count}% break').replace(
        '{count}',
        String(tool?.breakage?.breakageChance ?? 0)
      );
    }
    if (kind === 'diceExpression') {
      return text('FABRICATE.Admin.Manager.Tools.SummaryDiceValue', '{formula} roll').replace(
        '{formula}',
        String(tool?.breakage?.formula || '—')
      );
    }
    const maxUses = Number(tool?.breakage?.maxUses);
    if (Number.isInteger(maxUses) && maxUses > 0) {
      return text('FABRICATE.Admin.Manager.Tools.SummaryUseCount', '{count} uses').replace(
        '{count}',
        String(maxUses)
      );
    }
    return text('FABRICATE.Admin.Manager.Tools.SummaryUnlimitedUses', 'Unlimited uses');
  }
</script>

<main
  class="manager-main manager-tools-main"
  aria-label={text('FABRICATE.Admin.Manager.Tools.Title', 'Tools')}
  data-tool-library
>
  <div class="manager-tools-main-content">
    <section
      class="manager-inspector-card manager-tools-authority-card"
      data-manager-tools-authority
    >
      <div class="manager-tools-authority-heading">
        <span><i class="fas fa-sliders" aria-hidden="true"></i></span>
        <!--
          THE PILL SITS INSIDE THE TITLE CELL, not beside the `ALL TOOLS` chip, and that is a
          layout constraint rather than a preference. `styles/fabricate.css` gives this heading
          `grid-template-columns: 20px minmax(0, 1fr) max-content` and is closed to this lane,
          so a FOURTH child would flow into an implicit second row under the glyph. Nesting it
          in the `1fr` cell keeps the heading at three children and lets the pill wrap under a
          long title instead of forcing a row.
        -->
        <div class="manager-tools-authority-title">
          <strong>{text('FABRICATE.Admin.Manager.Tools.AuthorityKicker', 'Breakage mode')}</strong>
          <Chip tone={authorityPill.tone} data-tool-authority-pill={authorityPill.state}
            >{authorityPill.label}</Chip
          >
        </div>
      </div>
      <!--
        THREE SEGMENTS, SELECTED ON THE AUTHORED LAYER (issue 1373). `selected` comes from
        `breakageSource`, never from `breakageAuthority === value`: the resolved token cannot
        tell "this system chose it" from "this system inherited it", so a two-state control
        drew the inherited value as current and MINTED a per-system override the moment a GM
        clicked the segment already highlighted - an override nothing could then clear.
      -->
      <div
        class="manager-tools-authority-segments"
        role="radiogroup"
        aria-label={text('FABRICATE.Admin.Manager.Tools.AuthorityTitle', 'Tool breakage source')}
      >
        {#each authoritySegments as segment (segment.value)}
          <label class:is-selected={segment.selected} data-tool-authority-segment={segment.value}>
            <input
              type="radio"
              name="tool-breakage-authority"
              value={segment.value}
              checked={segment.selected}
              onchange={() =>
                onSetBreakageAuthority(segment.value === INHERIT_BREAK_MODE ? null : segment.value)}
            />
            <!-- NO GLYPH, and that is the prototype's own composition: the WORLD card leads
                 each segment with an icon, the system card does not. `systemBreakModeOptions`
                 emits no `icon` for the same reason. -->
            <span class="manager-tools-authority-option">{segment.label}</span>
          </label>
        {/each}
      </div>
    </section>

    <section class="manager-tools-library-card" data-manager-tools-search>
      <label class="manager-search">
        <i class="fas fa-search" aria-hidden="true"></i>
        <input
          type="search"
          value={searchTerm}
          oninput={(event) => {
            searchTerm = event.currentTarget.value;
            pageIndex = 0;
          }}
          placeholder={text('FABRICATE.Admin.Manager.Tools.Search', 'Search Tools')}
          aria-label={text('FABRICATE.Admin.Manager.Tools.Search', 'Search Tools')}
        />
      </label>
      <div
        class="manager-tools-membership-filter"
        role="radiogroup"
        aria-label={text(
          'FABRICATE.Admin.Manager.Tools.FilterLabel',
          'Which Tools this list shows'
        )}
        data-tool-membership-filter={membershipFilter}
      >
        {#each membershipFilters as option (option.id)}
          <label
            class:is-selected={membershipFilter === option.id}
            data-tool-membership-option={option.id}
          >
            <input
              type="radio"
              name="tool-membership-filter"
              value={option.id}
              checked={membershipFilter === option.id}
              onchange={() => {
                membershipFilter = option.id;
                pageIndex = 0;
              }}
            />
            <span>{option.label}</span>
          </label>
        {/each}
      </div>
    </section>

    <!--
      SORT AND THE RESULT COUNT ON ONE ROW, which is where the prototype puts them and is also
      the only place the count can say something useful: `3 tools` states the length of a list
      the GM is looking at, while `3 shown · 3 of 10 in this system` states the two numbers the
      membership filter above is switching between.
    -->
    <div class="manager-tools-sort-row" data-manager-tools-sort>
      <span class="manager-tools-sort-label"
        >{text('FABRICATE.Admin.Manager.Tools.SortBy', 'Sort by')}</span
      >
      <select
        class="manager-tools-sort-select"
        value={sortKey}
        aria-label={text('FABRICATE.Admin.Manager.Tools.SortBy', 'Sort by')}
        onchange={(event) => {
          sortKey = event.currentTarget.value;
          pageIndex = 0;
        }}
      >
        <option value="name">{text('FABRICATE.Admin.Manager.Tools.SortName', 'Name')}</option>
        <option value="state"
          >{text('FABRICATE.Admin.Manager.Tools.FilterInSystemShort', 'In this system')}</option
        >
      </select>
      <button
        type="button"
        class="manager-tools-sort-direction"
        data-tool-sort-direction={sortDirection}
        onclick={() => (sortDirection = sortDirection === 'asc' ? 'desc' : 'asc')}
      >
        <i
          class={sortDirection === 'asc' ? 'fas fa-arrow-down-a-z' : 'fas fa-arrow-up-a-z'}
          aria-hidden="true"
        ></i>
        <span
          >{sortDirection === 'asc'
            ? text('FABRICATE.Admin.Manager.Tools.SortAsc', 'Asc')
            : text('FABRICATE.Admin.Manager.Tools.SortDesc', 'Desc')}</span
        >
      </button>
      <span class="manager-tools-result-summary" data-tool-result-count>{resultCountText}</span>
    </div>

    <ItemDropZone
      kind="tool-create"
      title={text(
        'FABRICATE.Admin.Manager.Tools.CreateDropTitle',
        'Drag an Item here to make it a Tool'
      )}
      hint={text(
        'FABRICATE.Admin.Manager.Tools.CreateDropHint',
        'Drop an Item from the Items directory or a compendium.'
      )}
      onDrop={onCreateToolDrop}
    />

    <section class="manager-tools-library-card" data-manager-tools-browser>
      <div class="manager-tools-library-scroll" data-tool-library-scroll>
        {#if tools.length === 0}
          <EmptyState
            icon="fas fa-screwdriver-wrench"
            title={text('FABRICATE.Admin.Manager.Tools.EmptyTitle', 'No Tools yet')}
            hint={text(
              'FABRICATE.Admin.Manager.Tools.EmptyHintDrop',
              'Create an unlinked Tool or drop an Item above.'
            )}
            dataAttr="data-tool-library-empty"
          />
        {:else if filteredTools.length === 0}
          <EmptyState
            icon="fas fa-search"
            title={text('FABRICATE.Admin.Manager.Tools.EmptySearch', 'No Tools match your search')}
            dataAttr="data-tool-library-filtered-empty"
          />
        {:else}
          <div class="manager-tools-library-list" role="list">
            {#each pagedTools as entry (entry.id)}
              {@const row = entry.projected}
              {@const inherit = inheritState(entry.id)}
              <article
                class="manager-tools-row"
                class:is-selected={selectedToolId === entry.id}
                class:is-unadopted={!entry.member}
                data-manager-tool-id={entry.id}
                data-tool-row-member={entry.member ? 'member' : 'absent'}
                role="listitem"
              >
                <button
                  type="button"
                  class="manager-tools-select-target"
                  aria-pressed={selectedToolId === entry.id}
                  disabled={!entry.member}
                  onclick={() => chooseTool(entry)}
                >
                  <img src={entry.img} alt="" />
                  <span class="manager-tools-library-copy">
                    <strong title={entry.name}>{entry.name}</strong>
                    <small
                      >{entry.description ||
                        text(
                          'FABRICATE.Admin.Manager.NoDescriptionAdded',
                          'No description has been added.'
                        )}</small
                    >
                    <span class="manager-tools-library-chips">
                      {#if entry.member}
                        <Chip
                          tone={row.validation.valid ? 'positive' : 'danger'}
                          class={`manager-tools-validation-chip ${row.validation.valid ? 'is-ready' : ''}`}
                          icon={row.validation.valid
                            ? 'fas fa-circle-check'
                            : 'fas fa-circle-exclamation'}
                          data-tool-validation-status={row.validation.valid
                            ? 'ready'
                            : 'needs-attention'}
                        >
                          {row.validation.valid
                            ? text('FABRICATE.Admin.Manager.Tools.ValidationReady', 'Ready')
                            : text(
                                'FABRICATE.Admin.Manager.Tools.ValidationNeedsAttention',
                                'Needs attention'
                              )}
                        </Chip>
                        <!-- ONE BREAKAGE CHIP, not two. The prototype's system row carries
                             `[breakage] [Enabled|Disabled]`; the ON-BREAK action is a WORLD
                             default, stated on the world catalogue's row, and repeating it
                             here says nothing this screen decides. The enabled half of that
                             pair is the toggle in the action cluster rather than a second
                             chip beside it - see the note there. -->
                        <Chip tone="neutral">{breakageLabel(entry.tool, row.breakage)}</Chip>
                      {/if}
                      {#if inherit}
                        <span
                          class="manager-tools-row-inherit"
                          class:is-overridden={inherit.state === 'overridden'}
                          data-tool-row-inherit={inherit.state}>{inherit.label}</span
                        >
                      {:else if !entry.member}
                        <span class="manager-tools-row-inherit" data-tool-row-inherit="absent"
                          >{text(
                            'FABRICATE.Admin.Manager.Tools.RowNoRulesHere',
                            'No rules in this system'
                          )}</span
                        >
                      {/if}
                    </span>
                  </span>
                </button>
                <div class="manager-tools-library-actions">
                  {#if entry.member}
                    <!--
                      THE TOGGLE STAYS, AND THE PROTOTYPE'S `Enabled` PILL IS THEREFORE NOT
                      ALSO DRAWN. The prototype states the enabled flag as a read-only pill
                      because its own inspector footer is where membership is authored; that
                      footer needs `systemName` and the membership flag, neither of which this
                      screen's call site passes, so the pill would replace a working control
                      with a label and leave nothing able to set it. Drawing BOTH is worse
                      still: two controls over one field is the redundancy the prototype's
                      composition exists to avoid.
                      It is also the only surface the Foundry smoke's Tool Studio phase drives
                      `toggleToolEnabled` through, so removing it deletes proven coverage.
                    -->
                    <button
                      type="button"
                      class={`manager-tools-enabled-toggle ${row.enabled ? 'is-on' : ''}`}
                      aria-pressed={row.enabled}
                      aria-label={row.enabled
                        ? text('FABRICATE.Admin.Manager.Tools.Disable', 'Disable Tool')
                        : text('FABRICATE.Admin.Manager.Tools.Enable', 'Enable Tool')}
                      onclick={() => onToggleToolEnabled(entry.id, !row.enabled)}
                    >
                      <span aria-hidden="true"><span></span></span>
                    </button>
                  {/if}
                  {#if entry.member}
                    <!-- A LABELLED, BORDERED BUTTON rather than a bare pen: the row leads
                         somewhere named, and the prototype names it. The `data-tool-edit-rules`
                         hook is what the View Lab cases select on now that the pen is gone. -->
                    <button
                      type="button"
                      class="manager-tools-edit-rules"
                      data-tool-edit-rules={entry.id}
                      aria-label={text('FABRICATE.Admin.Manager.Tools.EditRules', 'Edit rules')}
                      title={text('FABRICATE.Admin.Manager.Tools.EditRules', 'Edit rules')}
                      onclick={() => onEditTool(entry.id)}
                    >
                      <span>{text('FABRICATE.Admin.Manager.Tools.EditRules', 'Edit rules')}</span>
                      <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
                    </button>
                  {:else}
                    <button
                      type="button"
                      class="manager-tools-edit-rules is-add"
                      data-tool-add-to-system={entry.id}
                      onclick={() => actions?.addToSystem?.(entry.id, systemId)}
                    >
                      <i class="fas fa-plus" aria-hidden="true"></i>
                      <span
                        >{text('FABRICATE.Admin.Manager.Tools.AddToSystem', 'Add to system')}</span
                      >
                    </button>
                  {/if}
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </div>
    </section>
  </div>
  {#if tools.length > 0}
    <div class="manager-tools-browser-pagination" data-tool-browser-pagination>
      <Pagination
        totalCount={filteredTools.length}
        {pageSize}
        {pageIndex}
        pageSizeOptions={[8, 16, 24]}
        persistent
        onPageChange={(next) => {
          pageIndex = next;
        }}
        onPageSizeChange={(next) => {
          pageSize = next;
          pageIndex = 0;
        }}
      />
    </div>
  {/if}
</main>

<style>
  /* The title cell holds the heading word AND the authoring-source pill (issue 1373). STATIC
     class name, so Svelte can prove the selector is used and `lint:svelte:warnings` stays at
     zero.

     The PILL'S OWN SIZING is not authored here: the host sheet's descendant rule under
     `.manager-tools-authority-heading` still reaches it one level deeper, which is why it
     stays the smaller 18px/0.56rem treatment its sibling wears.

     The token that rule selects on is deliberately not written out. `manager-layout.test.js`
     ratchets the hand-rolled-chip migration by matching that token ANYWHERE in a manager
     `.svelte` file, comment prose included - which is a decision it records, because one site
     passes the classes to a child as a string prop and an attribute-shaped scan missed it. */
  .manager-tools-authority-title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  /* ── THE TOOLBAR ────────────────────────────────────────────────────────────────────────
     Two rows, matching the prototype: search and the membership filter share the first, sort
     and the result count share the second. The rules live HERE rather than in
     `styles/fabricate.css` so `VIEW_RECIPES` maps a change to the tool views alone; the
     search field's own geometry is already stated in the global sheet under
     `[data-manager-tools-search]` and is reused rather than restated. */
  [data-manager-tools-search] {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-2);
  }

  [data-manager-tools-search] .manager-search {
    flex: 1 1 150px;
    min-width: 0;
  }

  .manager-tools-membership-filter {
    display: flex;
    flex: 0 1 auto;
    flex-wrap: wrap;
    gap: 3px;
    padding: 3px;
    border: 1px solid var(--fab-mv2-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    min-width: 0;
  }

  .manager-tools-membership-filter label {
    display: inline-flex;
    align-items: center;
    padding: 5px var(--fab-space-2);
    border-radius: 6px;
    color: var(--fab-mv2-text-muted);
    font-size: 0.66rem;
    font-weight: 600;
    line-height: 1.2;
    cursor: pointer;
  }

  .manager-tools-membership-filter label.is-selected {
    background: var(--fab-mv2-accent);
    color: var(--fab-on-accent);
  }

  /* The radio itself carries the state and the keyboard behaviour; the label paints it.
     Sized to 1px rather than `display: none` so it stays focusable. */
  .manager-tools-membership-filter input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  .manager-tools-sort-row {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-tools-sort-label {
    color: var(--fab-mv2-text-muted);
    font-size: 0.54rem;
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  /* `flex: 0 0 auto` AND an explicit `width`, because the manager sheet gives every `select`
     a full-row width: without both, the select took the whole sort row and pushed the
     direction toggle and the count onto lines of their own. This block is unlayered and the
     sheet's is layered, so it wins on cascade layer rather than on specificity. */
  .manager-tools-sort-select {
    flex: 0 0 auto;
    width: auto;
    height: 28px;
    min-width: 92px;
    max-width: 180px;
    padding: 0 var(--fab-space-2);
    border: 1px solid var(--fab-mv2-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    color: var(--fab-mv2-text-muted);
    font-size: 0.68rem;
  }

  /* `height: auto` and `min-height` rather than a bare `height`, and `justify-content:
     flex-start` — Foundry's global button rule centres content and pins a fixed height, which
     crops a two-child button like this one. See the CSS section of `CONTRIBUTING.md`. */
  .manager-tools-sort-direction,
  .manager-tools-edit-rules {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-1);
    width: auto;
    height: auto;
    min-height: 28px;
    padding: 0 var(--fab-space-2);
    border: 1px solid var(--fab-mv2-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    color: var(--fab-mv2-text-muted);
    font-size: 0.68rem;
    font-weight: 600;
    line-height: 1.2;
    white-space: nowrap;
    cursor: pointer;
  }

  .manager-tools-edit-rules {
    flex: 0 0 auto;
    min-height: 30px;
    padding: 0 var(--fab-space-3);
    border-color: var(--fab-mv2-border-strong);
    color: var(--fab-mv2-text);
    font-size: 0.66rem;
  }

  .manager-tools-edit-rules.is-add {
    border-style: dashed;
    background: transparent;
    color: var(--fab-mv2-text-muted);
  }

  .manager-tools-edit-rules i {
    font-size: 0.6rem;
  }

  .manager-tools-sort-row .manager-tools-result-summary {
    margin: 0 0 0 auto;
    color: var(--fab-mv2-text-muted);
    font-size: 0.66rem;
    text-align: right;
  }

  /* THE INHERIT STATE IS NOT A CHIP, deliberately. It is a sentence about where the values
     came from, not a badge naming one of them, and the prototype sets it as plain text beside
     the pills for exactly that reason. */
  .manager-tools-row-inherit {
    color: var(--fab-mv2-text-muted);
    font-size: 0.6rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .manager-tools-row-inherit.is-overridden {
    color: var(--fab-status-warning-text, var(--fab-mv2-accent));
  }

  /* A world Tool with no rules here is present but not adopted, and reads that way. */
  .manager-tools-row.is-unadopted {
    background: transparent;
    opacity: 0.72;
  }
</style>
