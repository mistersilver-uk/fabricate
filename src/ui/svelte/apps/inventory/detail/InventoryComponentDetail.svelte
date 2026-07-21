<!-- Svelte 5 runes mode -->
<!--
  InventoryComponentDetail is the inspector body for an owned component or
  essence row. It renders inside the shared `InventoryDetailHeader` shell (which
  owns the scrolling column, the identity header and the shared body leaves — see
  that file), supplying its type/tier/tag chips as data, then the Info content in
  its canonical order —

    broken banner -> description -> essences -> sources -> used by -> produced by

  — plus, for a salvageable component, the `Info | Salvage` tab strip and the
  salvage panel.

  Extracted from the former double-duty `InventoryDetail.svelte` (issue 675),
  which now routes here. Each list paginates independently through the shared
  `InventoryDetailPager`.

  Prop-driven; navigation routes back through the store seams.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import CraftingThumb from '../../crafting/CraftingThumb.svelte';
  import InventoryDetailHeader from './InventoryDetailHeader.svelte';
  import InventoryDetailPager from './InventoryDetailPager.svelte';
  import InventorySalvagePanel from './InventorySalvagePanel.svelte';
  import InventorySystemSelector from './InventorySystemSelector.svelte';

  let {
    item = null,
    activeSystem = null,
    onSelectSystem = () => {},
    onOpenRecipe = null,
    salvaging = false,
    salvageResult = null,
    onSalvage = null,
    onResetSalvage = null,
    salvageStages = [],
    salvageAnnouncement = '',
    onReorderSalvageStage = () => {},
    onSalvageReorderSettled = () => {},
    salvageOrderIsCustom = false,
    onResetSalvageOrder = () => {}
  } = $props();

  // Each detail list (sources, used-by, required-for, produced-by, contributors)
  // paginates independently at this many rows.
  const PAGE_SIZE = 6;

  // A physical stack backing a component in more than one crafting system carries a
  // `systems[]` participation array (issue 766); the detail then scopes its WHOLE body to
  // the SELECTED participation. With one (or no) participation the surface is byte-identical
  // to before: `active` is null and every read falls back to the top-level card field.
  const systems = $derived(Array.isArray(item?.systems) ? item.systems : []);
  const multiSystem = $derived(systems.length > 1);
  const active = $derived(multiSystem ? activeSystem : null);

  const isEssence = $derived(item?.isEssenceSource === true);
  const isTool = $derived((active ? active.isTool : item?.isTool) === true);
  const description = $derived(String((active ? active.description : item?.description) ?? '').trim());
  // A read-only verdict decided builder-side, from a persisted `toolBroken` past fact
  // or a projected usage exhaustion. Nothing un-breaks a tool, so the banner states
  // that it is unusable and offers no action — and it does NOT gate salvage: recycling
  // a broken tool is the most useful thing left to do with it.
  const broken = $derived(item?.broken === true);
  const icon = $derived(
    typeof item?.icon === 'string' && item.icon.trim() !== '' ? item.icon : 'fas fa-mortar-pestle'
  );
  // Tags/essences/used-by/required-for/produced-by scope to the selected participation
  // (essences and their neighbours are GM-authored per system — the reported case: air
  // essence in one system, an elemental tag in the other). Sources/contributors are
  // physical facts of the stack, so they stay top-level.
  const scopedTags = $derived(active ? active.tags : item?.tags);
  const tags = $derived(
    Array.isArray(scopedTags) ? scopedTags.filter((tag) => String(tag ?? '').trim() !== '') : []
  );
  const essences = $derived(
    Array.isArray(active ? active.essences : item?.essences) ? (active ? active.essences : item.essences) : []
  );
  const sources = $derived(Array.isArray(item?.sources) ? item.sources : []);
  const usedBy = $derived(Array.isArray(active ? active.usedBy : item?.usedBy) ? (active ? active.usedBy : item.usedBy) : []);
  const requiredFor = $derived(
    Array.isArray(active ? active.requiredFor : item?.requiredFor) ? (active ? active.requiredFor : item.requiredFor) : []
  );
  const producedBy = $derived(
    Array.isArray(active ? active.producedBy : item?.producedBy) ? (active ? active.producedBy : item.producedBy) : []
  );
  const contributors = $derived(Array.isArray(item?.contributors) ? item.contributors : []);
  const scopedTier = $derived(active ? active.tier : item?.tier);
  const tierLabel = $derived(
    scopedTier != null && scopedTier !== '' ? localize('FABRICATE.App.Inventory.Detail.Tier', { tier: scopedTier }) : null
  );
  // Header identity re-derives from the SELECTED participation's component name/img — a GM
  // may know the same stack by a different name/icon in each system.
  const displayName = $derived(String((active ? active.name : item?.name) ?? ''));
  const displayImg = $derived((active ? active.img : item?.img) ?? '');
  const typeLabel = $derived(
    localize(
      isEssence
        ? 'FABRICATE.App.Inventory.Detail.TypeEssence'
        : 'FABRICATE.App.Inventory.Detail.TypeComponent'
    )
  );
  // The header's chip row, as data for the shared shell: the kind reads quiet, tier and
  // the GM's tags read neutral.
  const headerChips = $derived([
    { id: 'type', label: typeLabel, tone: 'quiet' },
    ...(tierLabel ? [{ id: 'tier', label: tierLabel }] : []),
    ...tags.map((tag) => ({ id: `tag:${tag}`, label: tag }))
  ]);

  // Per-section current page, keyed by section id, reset when the item changes.
  let pages = $state({});
  $effect(() => {
    void item?.key;
    pages = {};
  });
  function pageOf(list, key) {
    const count = Math.max(1, Math.ceil((list?.length ?? 0) / PAGE_SIZE));
    return Math.min(Math.max(0, pages[key] ?? 0), count - 1);
  }
  function sliceOf(list, key) {
    const start = pageOf(list, key) * PAGE_SIZE;
    return (Array.isArray(list) ? list : []).slice(start, start + PAGE_SIZE);
  }
  function setPage(key, value) {
    pages = { ...pages, [key]: Math.max(0, value) };
  }

  function hasImg(value) {
    return typeof value === 'string' && value.trim() !== '';
  }
  function roleLabel(role) {
    const key =
      role === 'tool' ? 'RoleTool' : role === 'essence' ? 'RoleEssence' : 'RoleIngredient';
    return localize(`FABRICATE.App.Inventory.Detail.${key}`);
  }
  function kindLabel(kind) {
    const key =
      kind === 'salvage' ? 'KindSalvage' : kind === 'gathering' ? 'KindGathering' : 'KindRecipe';
    return localize(`FABRICATE.App.Inventory.Detail.${key}`);
  }
  function openRecipe(recipeId) {
    if (recipeId) onOpenRecipe?.(recipeId);
  }

  // --- Info | Salvage ---------------------------------------------------------
  // The strip renders only when the row is salvageable — INCLUDING when the item is a
  // broken tool. Brokenness does not gate salvageability (the engine has no broken
  // check), and hiding the tab would read as "this isn't salvageable": wrong, and
  // unfixable by the player.
  const scopedSalvage = $derived(active ? active.salvage : item?.salvage);
  const salvage = $derived(scopedSalvage?.enabled === true ? scopedSalvage : null);
  const salvageable = $derived(salvage !== null);

  // Remaining owned quantity. Scoped to the SELECTED participation's OWN owned quantity,
  // NOT the card union (issue 766): a system-B salvage on a divergent-roles card can only
  // consume the documents B backs, so the depleted/"None remaining"/disabled-action basis
  // is B's stock. Zero means depleted — the honest state after salvaging the last copy,
  // where the row has left the live listing and the store holds a post-salvage snapshot
  // carrying 0 (issue 675 defect). A depleted participation still keeps its ribbon (the
  // player must see what they recovered) but must never offer a way back to rolling an
  // impossible salvage.
  const remaining = $derived(Number((active ? active.ownedQuantity : item?.totalQuantity) ?? 0));
  const depleted = $derived(remaining <= 0);
  // "N total" while stock remains; "None remaining" once depleted — a count of 0
  // would read as a stack that is somehow both present and empty.
  const totalLabel = $derived(
    depleted
      ? localize('FABRICATE.App.Inventory.Detail.TotalDepleted')
      : localize('FABRICATE.App.Inventory.Detail.Total', { count: remaining })
  );

  const TABS = [
    { id: 'info', icon: 'fas fa-circle-info', key: 'FABRICATE.App.Inventory.Detail.TabInfo' },
    { id: 'salvage', icon: 'fas fa-recycle', key: 'FABRICATE.App.Inventory.Detail.TabSalvage' }
  ];
  let activeTab = $state('info');
  // Tab routing is driven by two events, resolved in ONE effect so their ordering is
  // explicit rather than a race between two:
  //
  //  1. A newly-arrived salvage RESULT opens Salvage. This is the robust fix for the
  //     post-salvage bounce (issue 675 defect): rather than trying to PREVENT a reset
  //     (which assumed the component instance never remounts — an assumption that did
  //     not hold in the real Foundry flow, where the roll dialog can trigger a
  //     remount), we ACTIVELY open Salvage whenever a result appears. This survives a
  //     remount — on a fresh mount with a result already present it opens Salvage — AND
  //     a same-instance reload. It is gated on the result being NEW (a changed
  //     reference) so a player who manually clicks Info while the ribbon is up is not
  //     yanked back: a manual tab change does not touch `salvageResult`, so the effect
  //     never re-fires for it.
  //
  //  2. Otherwise, a changed item KEY resets to Info — the player picked a DIFFERENT
  //     component (whose Salvage panel is a different shape, or which is not salvageable
  //     at all). Selecting a new component also CLEARS `salvageResult` in the store, so
  //     branch 1 never mistakes the old ribbon for a new arrival on that switch.
  //
  // The result branch WINS when both fire in one pass: a resolved salvage hands us a new
  // item object (its key-change branch would otherwise reset to Info) but must land on
  // Salvage. Both `prev*` are seeded to `undefined` sentinels, so the first run treats a
  // pre-existing result as an arrival (the remount case) and an absent one as a plain
  // key-change reset to Info (a no-op, since `activeTab` already starts on Info).
  let prevItemKey;
  let prevSalvageResult;
  $effect(() => {
    const key = item?.key ?? null;
    const result = salvageResult;
    const keyChanged = key !== prevItemKey;
    const resultArrived = result != null && result !== prevSalvageResult;
    prevItemKey = key;
    prevSalvageResult = result;
    if (resultArrived && salvageable) {
      activeTab = 'salvage';
      return;
    }
    if (keyChanged) {
      activeTab = 'info';
    }
  });

  function onTabKeydown(event, index) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (index + delta + TABS.length) % TABS.length;
    activeTab = TABS[nextIndex].id;
    const buttons = event.currentTarget.parentElement?.querySelectorAll('[role="tab"]');
    buttons?.[nextIndex]?.focus();
  }
</script>

<InventoryDetailHeader
  detailKey={item.key}
  img={displayImg}
  icon={isEssence ? icon : ''}
  name={displayName}
  total={totalLabel}
  chips={headerChips}
>
  {#if multiSystem}
    <!-- FIRST in the header, before the Info|Salvage tablist: it re-scopes the WHOLE body
         (see InventorySystemSelector). Only present with >1 participation. -->
    <InventorySystemSelector
      systems={item.systems}
      selectedSystemId={active?.systemId ?? null}
      onSelect={onSelectSystem}
    />
  {/if}

  {#if salvageable}
    <!-- ARIA contract reproduced from the in-repo precedent, GatheringDetailTabs:
         role=tablist/tab, aria-selected, aria-controls, roving tabindex, Arrow-key
         navigation. No tab bar at all when the item is not salvageable. -->
    <div
      class="inventory-detail-tabs"
      role="tablist"
      aria-label={localize('FABRICATE.App.Inventory.Detail.TabsLabel')}
    >
      {#each TABS as tab, index (tab.id)}
        <button
          type="button"
          role="tab"
          id={`inventory-detail-tab-${tab.id}`}
          class="inventory-detail-tab"
          class:is-active={activeTab === tab.id}
          aria-selected={activeTab === tab.id}
          aria-controls={`inventory-detail-panel-${tab.id}`}
          tabindex={activeTab === tab.id ? 0 : -1}
          data-inventory-detail-tab={tab.id}
          onclick={() => (activeTab = tab.id)}
          onkeydown={(event) => onTabKeydown(event, index)}
        >
          <i class={tab.icon} aria-hidden="true"></i>
          <span>{localize(tab.key)}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if salvageable && activeTab === 'salvage'}
    <div
      class="inventory-detail-panel"
      id="inventory-detail-panel-salvage"
      role="tabpanel"
      aria-labelledby="inventory-detail-tab-salvage"
    >
      <InventorySalvagePanel
        {salvage}
        actingSystemName={multiSystem ? (active?.systemName ?? '') : ''}
        busy={salvaging}
        {depleted}
        result={salvageResult}
        {onSalvage}
        onReset={onResetSalvage}
        stages={salvageStages}
        announcement={salvageAnnouncement}
        onReorder={onReorderSalvageStage}
        onReorderSettled={onSalvageReorderSettled}
        canResetOrder={salvageOrderIsCustom}
        onResetOrder={onResetSalvageOrder}
      />
    </div>
  {:else}
  <div
    class="inventory-detail-panel"
    id="inventory-detail-panel-info"
    role={salvageable ? 'tabpanel' : undefined}
    aria-labelledby={salvageable ? 'inventory-detail-tab-info' : undefined}
  >
  {#if broken}
    <!-- Read-only: brokenness is a derived verdict, no engine method un-breaks a tool,
         and the only "Repair" string in the codebase is a shopping-list label that
         repairs nothing. So this states the cause and offers NO action. -->
    <p class="inventory-detail-broken-banner" data-inventory-broken-banner role="status">
      <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
      <span>{localize('FABRICATE.App.Inventory.Detail.BrokenBanner')}</span>
    </p>
  {/if}

  {#if description}
    <p class="inventory-detail-description" data-inventory-description>{description}</p>
  {/if}

  {#if essences.length > 0}
    <section class="inventory-detail-section">
      <p class="inventory-detail-section-title">{localize('FABRICATE.App.Inventory.Detail.EssenceContentTitle')}</p>
      <div class="inventory-detail-essences">
        {#each essences as essence (essence.id)}
          <span class="inventory-chip inventory-chip-essence">
            {#if essence.icon}<i class={essence.icon} aria-hidden="true"></i>{/if}
            <span>{essence.name}</span>
            <span class="inventory-chip-qty">×{essence.quantity}</span>
          </span>
        {/each}
      </div>
    </section>
  {/if}

  <section class="inventory-detail-section">
    <p class="inventory-detail-section-title">{localize('FABRICATE.App.Inventory.Detail.SourcesTitle')}</p>
    <ul class="inventory-detail-list">
      {#each sliceOf(sources, 'sources') as source (source.actorId)}
        <li class="inventory-detail-row">
          <span class="inventory-detail-portrait" aria-hidden="true">
            {#if hasImg(source.actorImg)}
              <img src={source.actorImg} alt="" />
            {:else}
              <i class="fas fa-user"></i>
            {/if}
          </span>
          <span class="inventory-detail-row-name">{source.actorName}</span>
          <span class="inventory-detail-row-qty" data-inventory-source-qty>×{source.quantity}</span>
        </li>
      {/each}
    </ul>
    <InventoryDetailPager
      list={sources}
      sectionKey="sources"
      page={pageOf(sources, 'sources')}
      pageSize={PAGE_SIZE}
      onPage={(value) => setPage('sources', value)}
    />
  </section>

  {#if isEssence}
    <section class="inventory-detail-section">
      <p class="inventory-detail-section-title">{localize('FABRICATE.App.Inventory.Detail.ContributingTitle')}</p>
      {#if contributors.length > 0}
        <ul class="inventory-detail-list">
          {#each sliceOf(contributors, 'contributors') as contributor (contributor.componentId)}
            <li class="inventory-detail-row" data-inventory-contributor={contributor.componentId}>
              <CraftingThumb src={contributor.img ?? ''} alt="" size={40} />
              <span class="inventory-detail-row-name">{contributor.name}</span>
              <span class="inventory-detail-row-qty">×{contributor.quantity}</span>
            </li>
          {/each}
        </ul>
        <InventoryDetailPager
          list={contributors}
          sectionKey="contributors"
          page={pageOf(contributors, 'contributors')}
          pageSize={PAGE_SIZE}
          onPage={(value) => setPage('contributors', value)}
        />
      {:else}
        <p class="inventory-detail-empty-note">{localize('FABRICATE.App.Inventory.Detail.ContributingEmpty')}</p>
      {/if}
    </section>
  {/if}

  <section class="inventory-detail-section">
    <p class="inventory-detail-section-title">{localize('FABRICATE.App.Inventory.Detail.UsedByTitle')}</p>
    {#if usedBy.length > 0}
      <ul class="inventory-detail-list">
        {#each sliceOf(usedBy, 'used') as use (use.recipeId + ':' + use.role)}
          <li>
            <button
              type="button"
              class="inventory-detail-recipe"
              data-inventory-used-by={use.recipeId}
              onclick={() => openRecipe(use.recipeId)}
            >
              <CraftingThumb src={use.recipeImg ?? ''} alt="" size={40} />
              <span class="inventory-detail-row-name">{use.recipeName}</span>
              <span class="inventory-chip inventory-chip-role">{roleLabel(use.role)}</span>
            </button>
          </li>
        {/each}
      </ul>
      <InventoryDetailPager
        list={usedBy}
        sectionKey="used"
        page={pageOf(usedBy, 'used')}
        pageSize={PAGE_SIZE}
        onPage={(value) => setPage('used', value)}
      />
    {:else}
      <p class="inventory-detail-empty-note">{localize('FABRICATE.App.Inventory.Detail.UsedByEmpty')}</p>
    {/if}
  </section>

  {#if isTool}
    <section class="inventory-detail-section" data-inventory-section="required">
      <p class="inventory-detail-section-title">{localize('FABRICATE.App.Inventory.Detail.RequiredForTitle')}</p>
      {#if requiredFor.length > 0}
        <ul class="inventory-detail-list">
          {#each sliceOf(requiredFor, 'required') as req, index (req.kind + ':' + (req.recipeId ?? req.name) + ':' + index)}
            <li>
              {#if req.kind === 'recipe' && req.recipeId}
                <button
                  type="button"
                  class="inventory-detail-recipe"
                  data-inventory-required-for={req.recipeId}
                  onclick={() => openRecipe(req.recipeId)}
                >
                  <CraftingThumb src={req.img ?? ''} alt="" size={40} />
                  <span class="inventory-detail-row-name">{req.name}</span>
                  <span class="inventory-chip inventory-chip-role">{kindLabel(req.kind)}</span>
                </button>
              {:else}
                <div class="inventory-detail-row" data-inventory-required-for-kind={req.kind}>
                  <CraftingThumb src={req.img ?? ''} alt="" size={40} />
                  <span class="inventory-detail-row-name">{req.name}</span>
                  <span class="inventory-chip inventory-chip-role">{kindLabel(req.kind)}</span>
                </div>
              {/if}
            </li>
          {/each}
        </ul>
        <InventoryDetailPager
          list={requiredFor}
          sectionKey="required"
          page={pageOf(requiredFor, 'required')}
          pageSize={PAGE_SIZE}
          onPage={(value) => setPage('required', value)}
        />
      {:else}
        <p class="inventory-detail-empty-note">{localize('FABRICATE.App.Inventory.Detail.RequiredForEmpty')}</p>
      {/if}
    </section>
  {/if}

  {#if !isEssence}
    <section class="inventory-detail-section">
      <p class="inventory-detail-section-title">{localize('FABRICATE.App.Inventory.Detail.ProducedByTitle')}</p>
      {#if producedBy.length > 0}
        <ul class="inventory-detail-list">
          {#each sliceOf(producedBy, 'produced') as producer, index (producer.kind + ':' + (producer.recipeId ?? producer.name) + ':' + index)}
            <li>
              {#if producer.kind === 'recipe' && producer.recipeId}
                <button
                  type="button"
                  class="inventory-detail-recipe"
                  data-inventory-produced-by={producer.recipeId}
                  onclick={() => openRecipe(producer.recipeId)}
                >
                  <CraftingThumb src={producer.img ?? ''} alt="" size={40} />
                  <span class="inventory-detail-row-name">{producer.name}</span>
                  <span class="inventory-chip inventory-chip-role">{kindLabel(producer.kind)}</span>
                </button>
              {:else}
                <div class="inventory-detail-row" data-inventory-produced-by-kind={producer.kind}>
                  <CraftingThumb src={producer.img ?? ''} alt="" size={40} />
                  <span class="inventory-detail-row-name">{producer.name}</span>
                  <span class="inventory-chip inventory-chip-role">{kindLabel(producer.kind)}</span>
                </div>
              {/if}
            </li>
          {/each}
        </ul>
        <InventoryDetailPager
          list={producedBy}
          sectionKey="produced"
          page={pageOf(producedBy, 'produced')}
          pageSize={PAGE_SIZE}
          onPage={(value) => setPage('produced', value)}
        />
      {:else}
        <p class="inventory-detail-empty-note">{localize('FABRICATE.App.Inventory.Detail.ProducedByEmpty')}</p>
      {/if}
    </section>
  {/if}
  </div>
  {/if}
</InventoryDetailHeader>

<style>
  /* Info | Salvage: the prototype's segmented control — a ruled, soft track carrying
     two rounded-rect segments, the active one filled with the accent. (The ARIA on top
     of it — tablist/roving tabindex/arrow keys — is ours; the prototype has none.) */
  .inventory-detail-tabs {
    box-sizing: border-box;
    flex: 0 0 auto;
    display: flex;
    align-items: stretch;
    gap: 4px;
    height: 38px;
    padding: 3px;
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-surface-soft);
  }

  /* Foundry's global `.app button` fixed height + centering would crop these; reset
     the inherited box (the EnvironmentCard pattern). */
  .inventory-detail-tab {
    box-sizing: border-box;
    appearance: none;
    -webkit-appearance: none;
    height: auto;
    margin: 0;
    flex: 1 1 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 30px;
    padding: 0 12px;
    border: none;
    border-radius: 7px;
    background: none;
    color: var(--fab-text-muted);
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
  }

  .inventory-detail-tab:hover {
    color: var(--fab-text);
  }

  .inventory-detail-tab.is-active {
    background: var(--fab-accent);
    color: var(--fab-on-accent);
    font-weight: 700;
  }

  .inventory-detail-tab:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: -2px;
  }

  /* The panel is a transparent pass-through: the sections keep the detail column's
     own rhythm rather than nesting inside a second box. */
  .inventory-detail-panel {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-4);
    min-height: 0;
  }

  .inventory-chip-qty {
    font-family: var(--fab-font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--fab-text);
  }

  .inventory-detail-description {
    margin: 0;
    flex-shrink: 0;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.5;
    color: var(--fab-text-muted);
  }

  /* Read-only broken banner: two signals (danger ramp + warning glyph), never colour
     alone, and no action — nothing repairs a tool. */
  .inventory-detail-broken-banner {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    flex-shrink: 0;
    margin: 0;
    padding: 8px 10px;
    border: 1px solid var(--fab-danger-border);
    border-radius: 8px;
    background: var(--fab-danger-soft);
    color: var(--fab-danger-text);
    font-size: 11.5px;
    font-weight: 400;
    line-height: 1.5;
  }

  .inventory-detail-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* Row height + padding mirror the Crafting browser's RecipeListRow so the
     thumbnail sits framed with vertical breathing room rather than edge-to-edge. */
  .inventory-detail-row,
  .inventory-detail-recipe {
    box-sizing: border-box;
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    padding: var(--fab-space-2);
    min-height: 56px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    color: var(--fab-text);
    text-align: left;
  }

  .inventory-detail-recipe {
    cursor: pointer;
  }

  .inventory-detail-recipe:hover {
    background: var(--fab-surface-raised);
    border-color: var(--fab-accent-border);
  }

  .inventory-detail-recipe:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .inventory-detail-portrait {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 6px;
    overflow: hidden;
    background: var(--fab-surface-raised);
    color: var(--fab-text-muted);
    font-size: 15px;
  }

  .inventory-detail-portrait img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .inventory-detail-row-qty {
    flex: 0 0 auto;
    font-family: var(--fab-font-mono);
    font-size: 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--fab-text);
  }

  .inventory-chip-role {
    flex: 0 0 auto;
  }

  .inventory-detail-essences {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .inventory-chip-essence i {
    font-size: 10px;
  }
</style>
