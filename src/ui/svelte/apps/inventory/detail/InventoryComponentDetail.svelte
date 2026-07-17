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

  let {
    item = null,
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

  const isEssence = $derived(item?.isEssenceSource === true);
  const isTool = $derived(item?.isTool === true);
  const description = $derived(String(item?.description ?? '').trim());
  // A read-only verdict decided builder-side, from a persisted `toolBroken` past fact
  // or a projected usage exhaustion. Nothing un-breaks a tool, so the banner states
  // that it is unusable and offers no action — and it does NOT gate salvage: recycling
  // a broken tool is the most useful thing left to do with it.
  const broken = $derived(item?.broken === true);
  const icon = $derived(
    typeof item?.icon === 'string' && item.icon.trim() !== '' ? item.icon : 'fas fa-mortar-pestle'
  );
  const tags = $derived(Array.isArray(item?.tags) ? item.tags.filter((tag) => String(tag ?? '').trim() !== '') : []);
  const essences = $derived(Array.isArray(item?.essences) ? item.essences : []);
  const sources = $derived(Array.isArray(item?.sources) ? item.sources : []);
  const usedBy = $derived(Array.isArray(item?.usedBy) ? item.usedBy : []);
  const requiredFor = $derived(Array.isArray(item?.requiredFor) ? item.requiredFor : []);
  const producedBy = $derived(Array.isArray(item?.producedBy) ? item.producedBy : []);
  const contributors = $derived(Array.isArray(item?.contributors) ? item.contributors : []);
  const tierLabel = $derived(
    item?.tier != null && item.tier !== '' ? localize('FABRICATE.App.Inventory.Detail.Tier', { tier: item.tier }) : null
  );
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
  const salvage = $derived(item?.salvage?.enabled === true ? item.salvage : null);
  const salvageable = $derived(salvage !== null);

  // Remaining owned quantity. Zero means the stack is depleted — the honest state
  // after salvaging the last copy, where the row has left the live listing and the
  // store holds a post-salvage snapshot carrying 0 (issue 675 defect). A depleted
  // component still keeps its ribbon (the player must see what they recovered) but
  // must never offer a way back to rolling an impossible salvage.
  const remaining = $derived(Number(item?.totalQuantity ?? 0));
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
  // Reset to Info only when the selected item's KEY actually changes — i.e. the
  // player picked a DIFFERENT component (whose Salvage panel is a different shape, or
  // which is not salvageable at all, leaving no tab bar and an orphaned panel).
  //
  // A salvage roll calls `load(true)`, which hands us a NEW item object with the SAME
  // key; keying the reset on the object reference (issue 675 defect) dropped the
  // player off Salvage onto Info the instant their roll resolved, while the success
  // ribbon sat on the Salvage tab they'd just been kicked out of. Tracking the
  // previous key keeps Salvage active across that same-key reload.
  //
  // Seeded to a sentinel rather than `item?.key` (which would only capture the initial
  // value and warn): the first effect run then "resets" to Info, which is a no-op
  // because `activeTab` already starts on Info.
  let prevItemKey;
  $effect(() => {
    const key = item?.key ?? null;
    if (key !== prevItemKey) {
      prevItemKey = key;
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
  img={item.img ?? ''}
  icon={isEssence ? icon : ''}
  name={item.name}
  total={totalLabel}
  chips={headerChips}
>
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
