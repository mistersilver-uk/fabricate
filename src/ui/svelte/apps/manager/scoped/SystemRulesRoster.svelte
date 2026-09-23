<!-- Svelte 5 runes mode -->
<!--
  THE `SYSTEM RULES n / m` PANEL: which crafting systems have rules for one entity, and the way
  into each one's (issue 1372). A component rather than a second copy, and every rule it needs
  travels with it — Svelte stamps its scope hash only on elements this file writes, so a rule
  left behind would compile to a selector matching nothing, silently. A MEMBER ROW IS A LINK and
  a NON-MEMBER ROW IS AN ADD, unless `systemRowAction: 'navigate'`, which the three world
  catalogues take because the create verb belongs on the system's own screen. `rows` is the
  projection's JOIN; `recessed` and `searchWell` are opt-in, because SIX screens compose this
  and an unconditional declaration repainted two other lanes' approved screens. `resetKey`
  identifies the SUBJECT, without which the panel keeps the previous entity's page and search.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Pagination from '../../../components/Pagination.svelte';
  import MembershipActions from './MembershipActions.svelte';
  import ManagerSearchField from '../../../components/ManagerSearchField.svelte';

  let {
    rows = [],
    memberCount = 0,
    rosterSize = 0,
    entityId = '',
    entityName = '',
    entityType = 'component',
    enableable = false,
    actions = null,
    onOpenSystemRules = null,
    systemRowAction = 'manage',
    // WHAT A ZERO-MEMBER ROSTER SAYS INSTEAD OF SIX DEAD `Rules ↗` LINKS. Opt-in and empty by
    // default, so the essence and tool catalogues render the roster they always did.
    rosterEmptyNote = '',
    // The card's two surface decisions, OFF by default. See the props block above.
    recessed = false,
    searchWell = false,
    armedToken = '',
    onArm = () => {},
    onDisarm = () => {},
    resetKey = '',
  } = $props();

  /** The panel's page size. Five rows, as the reference's pager states. */
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

  /** A system's display name with an ID FALLBACK; the roster coerces a missing name to `''`. */
  function systemLabel(row) {
    const named = typeof row?.systemName === 'string' ? row.systemName.trim() : '';
    return named || String(row?.systemId ?? '');
  }

  // The panel's own search, over the DISPLAY LABEL, so an unnamed roster is still searchable.
  const visibleRows = $derived(filterRows(rows, systemQuery));

  function filterRows(all, query) {
    const list = Array.isArray(all) ? all : [];
    const needle = query.trim().toLowerCase();
    if (needle === '') return list;
    return list.filter((row) => systemLabel(row).toLowerCase().includes(needle));
  }

  const pageCount = $derived(Math.max(1, Math.ceil(visibleRows.length / SYSTEM_PAGE_SIZE)));
  const pageIndex = $derived(Math.min(systemPageIndex, pageCount - 1));
  const pageRows = $derived(
    visibleRows.slice(pageIndex * SYSTEM_PAGE_SIZE, (pageIndex + 1) * SYSTEM_PAGE_SIZE)
  );

  /** Reset to page one: a search that shrinks the list leaves `Showing 11–5 of 3` otherwise. */
  function changeSystemQuery(value) {
    systemQuery = String(value ?? '');
    systemPageIndex = 0;
  }

  /**
   * The state one `(entity, system)` cell is in, as a MEASURABLE attribute: `absent` /
   * `disabled` / `enabled`, read from `member` FIRST, since a row answers `enabled: false` for
   * a non-member too.
   */
  function membershipState(row) {
    if (row?.member !== true) return 'absent';
    if (enableable !== true) return 'member';
    return row?.enabled === true ? 'enabled' : 'disabled';
  }

  // A NEW SUBJECT IS A NEW LIST.
  $effect(() => {
    void resetKey;
    systemQuery = '';
    systemPageIndex = 0;
  });
</script>

<section class="manager-scoped-roster" data-scoped-list-systems>
  <div class="manager-scoped-roster-head">
    <p class="manager-kicker">
      {text('FABRICATE.Admin.Manager.Scoped.List.SystemRulesHead', 'System rules')}
    </p>
    <span class="manager-scoped-roster-count" data-scoped-list-system-count>
      {format('FABRICATE.Admin.Manager.Scoped.List.SystemRulesCount', '{members} / {total}', {
        members: Number(memberCount) || 0,
        total: Number(rosterSize) || 0,
      })}
    </span>
  </div>

  <!--
    THE CARD (`proto:2022`): one bordered inset holding the search field, the roster and the
    pager, where three bare siblings shipped. Its recess is opt-in, for the head comment's reason.
  -->
  <div class="manager-scoped-roster-card" class:is-recessed={recessed}>
    <!-- NO ELLIPSIS ON THE PLACEHOLDER: the design's field reads `Search systems` (`proto:2025`). -->
    <ManagerSearchField
      class={searchWell
        ? 'manager-scoped-roster-search manager-scoped-roster-search-well'
        : 'manager-scoped-roster-search'}
      value={systemQuery}
      onInput={(next) => changeSystemQuery(next)}
      placeholder={text('FABRICATE.Admin.Manager.Scoped.List.SearchSystems', 'Search systems')}
      ariaLabel={text('FABRICATE.Admin.Manager.Scoped.List.SearchSystemsLabel', 'Search systems')}
      inputAttrs={{ 'data-scoped-list-system-search': '' }}
    />

    {#if rosterEmptyNote && memberCount === 0}
      <p class="manager-muted manager-scoped-roster-empty" data-scoped-roster-empty>
        {rosterEmptyNote}
      </p>
    {:else}
      <ul class="manager-scoped-roster-systems" role="list">
        {#each pageRows as row (row.systemId)}
          <li
            class="manager-scoped-roster-system"
            data-scoped-list-system={row.systemId}
            data-scoped-system={row.systemId}
            data-scoped-system-state={membershipState(row)}
          >
            <span class="manager-scoped-roster-system-name">{systemLabel(row)}</span>
            {#if (row.member === true || systemRowAction === 'navigate') && onOpenSystemRules}
              <button
                type="button"
                class="manager-scoped-roster-system-link"
                data-scoped-list-system-rules={row.systemId}
                title={format(
                  'FABRICATE.Admin.Manager.Scoped.List.OpenSystemRulesNamed',
                  'Open {system} rules for {entity}',
                  { system: systemLabel(row), entity: entityName || entityId }
                )}
                onclick={() => onOpenSystemRules(entityId, row.systemId)}
              >
                <span>{text('FABRICATE.Admin.Manager.Scoped.List.OpenSystemRules', 'Rules')}</span>
                <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
              </button>
            {:else}
              <MembershipActions
                {entityType}
                {entityId}
                systemId={row.systemId}
                {entityName}
                systemName={systemLabel(row)}
                member={row.member === true}
                enabled={row.enabled === true}
                copyable={false}
                hint={false}
                compact={true}
                {armedToken}
                onArm={(token) => onArm(token)}
                onDisarm={() => onDisarm()}
                onAdd={() => actions?.addToSystem?.(entityId, row.systemId)}
                onRemove={() => actions?.removeFromSystem?.(entityId, row.systemId)}
                onToggleEnabled={(next) => actions?.setEnabled?.(entityId, row.systemId, next)}
              />
            {/if}
          </li>
        {/each}
      </ul>

      <!-- NO per-page selector: the window is five rows because the reference's pager states five. -->
      <Pagination
        persistent={true}
        showPageSize={false}
        totalCount={visibleRows.length}
        {pageIndex}
        pageSize={SYSTEM_PAGE_SIZE}
        onPageChange={(next) => (systemPageIndex = next)}
      />
    {/if}
  </div>
</section>

<style>
  /* The zero-member sentence, in place of a roster of dead links (issue 1371, round 2). */
  .manager-scoped-roster-empty {
    margin: 0;
    font-size: 0.68rem;
    line-height: 1.5;
  }

  /* NO MEMBERSHIP MARKER ON A ROSTER ROW: the reference draws every row alike. */

  /* STATIC class names, so `lint:svelte:warnings` stays at zero. The panel's vertical budget is
     why this is tight: an inspector is about 660px and must hold five rows and a pager. */
  .manager-scoped-roster {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  .manager-scoped-roster-head {
    display: flex;
    gap: var(--fab-space-2);
    align-items: baseline;
    justify-content: space-between;
    min-width: 0;
  }

  /* The head's `13 / 24`, `tabular-nums` and ONE STOP BRIGHTER than the kicker (`proto:2021`). */
  .manager-scoped-roster-count {
    flex: 0 0 auto;
    color: var(--fab-text-secondary);
    font-family: var(--fab-font-mono);
    font-size: 10px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  /* THE CARD (`proto:2022`); its rhythm is stated because it is TIGHTER than the inspector's. */
  .manager-scoped-roster-card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
  }

  /* THE RECESS, OPT-IN: a SEPARATE RULE, so an unrecessed card states no fill and takes the pane's. */
  .manager-scoped-roster-card.is-recessed {
    background: var(--fab-bg-0);
  }

  /* Only the field's row sizing is stated here; the global rule sizes it for a toolbar. Chained
     `:global`, because the class travels to `ManagerSearchField`'s own `<label>`, and the chain
     keeps the specificity at (0,2,0), which is what the scoped form compiled to. */
  :global(.manager-search.manager-scoped-roster-search) {
    flex: 0 0 auto;
    width: 100%;
    min-width: 0;
    margin-bottom: var(--fab-space-2);
  }

  /* AND ITS FIELD IS THE CARD'S SIZE, NOT THE TOOLBAR'S: 28px, a published control-height rung. */
  :global(.manager-search.manager-scoped-roster-search input) {
    height: 28px;
    min-height: 28px;
  }

  /* AND IT IS A WELL WHERE A CALLER ASKS FOR ONE, SELECTED ON A SECOND CLASS rather than the one
     every caller passes — which is how round 4's well landed on two other lanes' catalogues. */
  :global(.manager-search.manager-scoped-roster-search-well input) {
    border: 1px solid var(--fab-border);
    border-radius: 7px;
    background: var(--fab-bg-1);
  }

  /* THE ROSTER HOLDS ITS HEIGHT AT FIVE ROWS (`proto:2027`), so the pager cannot walk the column. */
  .manager-scoped-roster-systems {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
    margin: 0;
    padding: 0;
    list-style: none;
    min-width: 0;
    min-height: 171px;
  }

  /* ONE LINE PER SYSTEM: a stacked row made a six-system list about 350px tall. */
  .manager-scoped-roster-system {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    justify-content: space-between;
    /* THE DESIGN'S ROW BOX (`proto:2029`); its 9px inline value SNAPS TO 8, because the published
       spacing scale is mandatory for padding. A recorded rung rather than a parity defect. */
    padding: var(--fab-space-chip) var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 7px;
    /* AND ITS FILL: this row is inside the inspector ASIDE, so `proto:2029`'s `--bg1` recess is
       reachable as `--fab-bg-0`. The card around it stays unfilled — `proto:2021` draws it a
       rung below the row, which this ramp cannot reach. */
    background: var(--fab-bg-0);
    min-width: 0;
  }

  /* A BARE ACCENT LINK, NOT A BORDERED PILL (`proto:2031`); the `<button>` reset stays. */
  .manager-scoped-roster-system-link {
    display: inline-flex;
    flex: 0 0 auto;
    gap: var(--fab-space-1);
    align-items: center;
    justify-content: center;
    width: auto;
    height: auto;
    min-height: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--fab-accent);
    font-size: 9.5px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
  }

  /* The trailing mark is the design's 8px glyph, so the arrow reads as a mark and not a word. */
  .manager-scoped-roster-system-link i {
    font-size: 8px;
  }

  .manager-scoped-roster-system-link:hover {
    color: var(--fab-accent-hover);
    text-decoration: underline;
  }

  .manager-scoped-roster-system-link:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  /* THE 34px CONTROL IS WHY THE ~36px ROW TAKES A RULE. Scoped, so no other danger button moves. */
  .manager-scoped-roster-system :global(.manager-button.is-danger) {
    min-height: 26px;
    padding: 0 var(--fab-space-2);
  }

  /* THE SYSTEM NAME IS A SERIF (`proto:2030`), as every other printed entity NAME in this app. */
  .manager-scoped-roster-system-name {
    flex: 1 1 0;
    color: var(--fab-text);
    font-family: var(--fab-font-serif);
    font-size: 11px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* THE CLUSTER KEEPS ITS WIDTH AND THE NAME GIVES WAY: the host sheet's `flex-wrap: wrap` made
     every 258px system row three lines tall. `:global()` under a local class, because the
     element belongs to `MembershipActions`. */
  .manager-scoped-roster-system > :global(.manager-scoped-membership-actions) {
    flex: 0 0 auto;
    flex-wrap: nowrap;
  }

  /* `Pagination` renders its own `<section>`, so the sizing is stated from this side: the shipped
     bar is built for a full-width list and in a 258px column it wrapped the nav below the scroll
     edge. THE ANCESTOR MOVED WITH THE MARKUP, which is why it is restated — Svelte prunes a
     scoped compound it can prove unused, but not one whose only failing part is `:global()`, so
     this would have compiled clean. The pager is a BORDERED ROW (`proto:2037`), and the `border`
     SHORTHAND is what removes the shipped `border-top`. */
  .manager-scoped-roster-card > :global(.manager-pagination) {
    flex: 0 0 auto;
    flex-wrap: nowrap;
    gap: var(--fab-space-2);
    margin-top: var(--fab-space-3);
    padding: var(--fab-space-chip) var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    /* AND ITS FILL (`proto:2037`): the pager is part of the card in the ASIDE, not in the pane. */
    background: var(--fab-bg-0);
    font-size: 0.62rem;
  }

  .manager-scoped-roster :global(.manager-pagination-page) {
    min-width: 0;
    white-space: nowrap;
  }

  .manager-scoped-roster :global(.manager-pagination-nav .manager-icon-button) {
    width: 24px;
    height: 24px;
    min-height: 24px;
    flex: 0 0 24px;
  }
</style>
