<!-- Svelte 5 runes mode -->
<!--
  THE `SYSTEM RULES n / m` PANEL: which crafting systems have rules for one entity, and the way
  into each one's (issue 1372, maintainer parity round 8).

  ── WHY IT IS A COMPONENT AND NOT A SECOND COPY ────────────────────────────────────────────────
  The reference draws this panel on BOTH essence screens — the world Essence Catalogue's inspector
  (`tmp/proto/essence-catalogue.png`, markup `proto:3290`-`3320`) and the system Essence Rules
  inspector (`tmp/proto/essence-rules.png`, markup `proto:1694`-`1716`) — with the same head, the
  same count, the same `Search systems` field, the same one-line rows and the same five-row pager.
  It shipped only on the catalogue, inlined into `EntityCatalogueShell`'s inspector snippet, so
  the system rules rail had no answer at all to "which other systems have rules for this essence".

  Adding it to the second screen by copying the snippet is what `scoped-shell-prop-contract.test.js`
  calls the 93-of-98 shape, and it is also what the SonarCloud duplication gate counts. So the
  panel is extracted verbatim — markup, styles and the pager's inspector-column metrics — and both
  screens compose it.

  ── EVERY RULE THIS PANEL NEEDS TRAVELS WITH IT ────────────────────────────────────────────────
  Svelte stamps its scope hash only on elements the component itself writes, so a rule left behind
  in `EntityCatalogueShell` addressing markup that moved here would compile to a selector matching
  nothing, silently and with no warning. The section, head, count, search, row, name, link and the
  three `:global()` pager overrides therefore all moved with the markup rather than being
  re-declared on either side.

  ── A MEMBER ROW IS A LINK; A NON-MEMBER ROW IS AN ADD ─────────────────────────────────────────
  The reference's row is `[System name]  [Rules ↗]`: this panel is where a GM finds out WHICH
  systems hold the entity and gets to each one's rules, and it is not where they edit those rules.
  A NON-MEMBER row keeps `MembershipActions`, because there is no rules screen to link to for a
  system that has no record: Add is the only verb it has, and it is not destructive.

  `onOpenSystemRules` is `null` by default, which falls every row back to the membership cluster —
  so a caller with nowhere to route to still gets a usable panel.

  ── `systemRowAction: 'navigate'` OVERRIDES THE PARAGRAPH ABOVE, AND THE TOOL CATALOGUE TAKES IT
  (issue 1373, maintainer ruling). The design's tool catalogue rows are `[System name] [Rules ↗]`
  and nothing else, member or not: this panel says WHICH systems hold the Tool and how to reach
  each one's rules, and the verb that creates a system's record belongs on that system's own Tool
  Rules screen — where its inspector already pins `Add {tool} to {system}`. A write action here
  put the create verb on the world catalogue, one scope away from the record it writes.

  The link is still meaningful for a NON-MEMBER under this mode: the rules list it opens is the
  system's whole Tool Rules screen, which is exactly where the adoption happens. `manage` stays
  the default, so the component and essence catalogues render exactly what they render today.

  Props:
   - rows: the entity's projected per-system rows, `{systemId, systemName, member, enabled}[]`.
     This is the projection's JOIN and has one row per roster entry; the narrowed `{id, name}`
     roster cannot answer `member` or `enabled` and is not what this takes.
   - memberCount / rosterSize: the numerator and denominator of the head count.
   - entityId / entityName / entityType / enableable: what `MembershipActions` needs to name and
     perform its writes.
   - actions: the entity type's write family — `addToSystem`, `removeFromSystem`, and `setEnabled`
     only when `enableable`.
   - onOpenSystemRules(entityId, systemId): the member row's `Rules ↗` deep link.
   - systemRowAction: `manage` (the default, described above) or `navigate`. See the paragraph
     immediately below for why the tool catalogue takes the second one.
   - armedToken / onArm / onDisarm: the shared arm latch, threaded through so one armed Remove at
     a time survives across the whole screen rather than per row.
   - resetKey: any value that identifies the SUBJECT. When it changes, the search term and the
     page index reset — without it the panel keeps the previous entity's page three and search
     term and shows an empty system list under a full inspector.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Pagination from '../../../components/Pagination.svelte';
  import MembershipActions from './MembershipActions.svelte';

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

  /**
   * A crafting system's display name, with an ID FALLBACK.
   *
   * The roster narrows a system to `{id, name}` and coerces a missing name to `''`, so a row
   * rendering `system.name` unguarded prints nothing where a system has no name and one rendering
   * `${system.name}` prints the literal `undefined`. Neither is an answer.
   *
   * @param {{systemId?: string, systemName?: string}} row
   * @returns {string}
   */
  function systemLabel(row) {
    const named = typeof row?.systemName === 'string' ? row.systemName.trim() : '';
    return named || String(row?.systemId ?? '');
  }

  // The panel's own search, over the DISPLAY LABEL — so a roster whose names never loaded is
  // still searchable by the ids on screen rather than by nothing at all.
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

  /**
   * Reset the list to its first page.
   *
   * A search that shrinks the list below the current page would otherwise leave the panel on an
   * empty page with a pager reading `Showing 11–5 of 3`.
   *
   * @param {unknown} value
   */
  function changeSystemQuery(value) {
    systemQuery = String(value ?? '');
    systemPageIndex = 0;
  }

  /**
   * The state one `(entity, system)` cell is in, as a machine-readable attribute.
   *
   * ── THREE STATES FOR AN ENABLEABLE TYPE, TWO FOR THE REST ────────────────────────────────
   * `absent` / `disabled` / `enabled`, read from `member` FIRST: a projected row omits `enabled`
   * for a type that has none and answers `false` for a non-member, so a test of `enabled` first
   * would paint every non-member as "disabled" — the one reading a GM cannot act on, since a
   * disabled member is re-enabled by a toggle and a non-member is not.
   *
   * The attribute exists because the state has to stay MEASURABLE: without it the three states
   * would be conveyed only by which controls `MembershipActions` happens to render.
   *
   * @param {{member?: boolean, enabled?: boolean}} row a projected system row.
   * @returns {string}
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

  <label class="manager-search manager-scoped-roster-search">
    <i class="fas fa-search" aria-hidden="true"></i>
    <input
      type="search"
      value={systemQuery}
      data-scoped-list-system-search
      placeholder={text('FABRICATE.Admin.Manager.Scoped.List.SearchSystems', 'Search systems…')}
      aria-label={text('FABRICATE.Admin.Manager.Scoped.List.SearchSystemsLabel', 'Search systems')}
      oninput={(event) => changeSystemQuery(event.currentTarget.value)}
    />
  </label>

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

  <!-- NO per-page selector: see `Pagination`'s own `showPageSize` note. The window is five rows
       because the reference's pager states five, and a size a GM cannot change is not a control
       they need offered. -->
  <Pagination
    persistent={true}
    showPageSize={false}
    totalCount={visibleRows.length}
    {pageIndex}
    pageSize={SYSTEM_PAGE_SIZE}
    onPageChange={(next) => (systemPageIndex = next)}
  />
</section>

<style>
  /* STATIC class names, so Svelte can prove each selector is used and `lint:svelte:warnings`
     stays at zero.

     THE PANEL'S VERTICAL BUDGET IS THE WHOLE REASON THIS IS TIGHT. A 900px window gives an
     inspector about 660px, and the reference fits an identity block, three cards, this head, a
     search field, FIVE system rows and a pager into it with the primary action pinned below. At
     the manager's default `--fab-space-2` rhythm that stack is roughly 680px and the pager falls
     below the fold — the one control that says there are more systems than the five on screen. */
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

  /* The `13 / 24` at the trailing edge of the head: members over roster. `tabular-nums` so the
     pair does not shuffle as a GM adds systems. */
  .manager-scoped-roster-count {
    flex: 0 0 auto;
    color: var(--fab-text-subtle);
    font-family: var(--fab-font-mono);
    font-size: 0.66rem;
    font-variant-numeric: tabular-nums;
  }

  /* The search field is the shipped `.manager-search`; only its own row sizing is stated here,
     because the global rule sizes it for a toolbar rather than for a 300px column. */
  .manager-scoped-roster-search {
    flex: 0 0 auto;
    width: 100%;
    min-width: 0;
  }

  .manager-scoped-roster-systems {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    margin: 0;
    padding: 0;
    list-style: none;
    min-width: 0;
  }

  /* ONE LINE PER SYSTEM: the name leads and its membership cluster trails, where a stacked row
     made a six-system list about 350px tall. */
  .manager-scoped-roster-system {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    justify-content: space-between;
    padding: 2px var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    /* NO FILL. The reference draws every card in the content area on the pane's own surface and
       separates them with a 1px border alone; a fill here put a fifth grey on a screen that has
       one. */
    background: transparent;
    min-width: 0;
  }

  /* THE `Rules ↗` LINK. A quiet bordered pill rather than a `ManagerButton`: it is a navigation
     affordance inside a list row, so it must not compete with the panel's one primary action at
     the foot, and the reference draws it as a small outlined link. It carries the manager's
     `<button>` reset assumptions locally because Foundry's host rule centres a button's content
     and pins a fixed height. */
  .manager-scoped-roster-system-link {
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

  .manager-scoped-roster-system-link:hover {
    border-color: var(--fab-accent);
    color: var(--fab-accent);
  }

  /* THE ROW IS ~36px, AND THE 34px CONTROL INSIDE IT IS WHY IT TAKES A RULE.
     `.manager-button` pins `min-height: 34px` for a page-level control; five of those plus the
     row's own padding is 290px of a panel that also has to hold cards, a search field and a
     pager, so only four rows of five fitted above the fold and the pager was never on screen.

     Scoped to this row, so no other `ArmedDangerButton` in the manager is retuned. */
  .manager-scoped-roster-system :global(.manager-button.is-danger) {
    min-height: 26px;
    padding: 0 var(--fab-space-2);
  }

  .manager-scoped-roster-system-name {
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
  .manager-scoped-roster-system > :global(.manager-scoped-membership-actions) {
    flex: 0 0 auto;
    flex-wrap: nowrap;
  }

  /* `Pagination` renders its own `<section>`, so the sizing has to be stated from this side of
     the boundary.

     THE THREE RULES BELOW ARE WHY THE ARROWS ARE ON SCREEN. The shipped bar is built for the foot
     of a full-width list: `gap: --fab-space-3`, `padding: --fab-space-2 --fab-space-3`, a 96px
     minimum on the page label and `flex-wrap: wrap`. In a 258px inspector column that wraps the
     nav onto a second line below the summary, and the second line fell under the panel's own
     scroll edge — so the frame published `Showing 1-5 of 6` with no way to reach row six, which
     is a pager that states there is more and then hides the only control that gets to it.

     `nowrap` plus the tighter metrics put the summary and the nav on one line at this width. */
  .manager-scoped-roster > :global(.manager-pagination) {
    flex: 0 0 auto;
    flex-wrap: nowrap;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2) 0 0;
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
