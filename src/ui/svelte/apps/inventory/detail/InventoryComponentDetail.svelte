<!-- Svelte 5 runes mode -->
<!--
  InventoryComponentDetail is the inspector body for an owned component or
  essence row. It renders inside the shared `InventoryDetailHeader` shell (which
  owns the scrolling column, the identity header and the shared body leaves — see
  that file), supplying its type/tier/tag chips as data, then the Info content in
  its canonical order —

    broken banner -> description -> essences -> sources -> used by -> produced by

  — plus, for a salvageable component, the `Info | Salvage` tab strip and the
  salvage panel, whose one-shot action is the header's primary while that tab is open.

  Extracted from the former double-duty `InventoryDetail.svelte` (issue 675),
  which now routes here. Each cross-reference list draws through `XrefList` and
  paginates independently through the shared `InventoryDetailPager`.

  Prop-driven; navigation routes back through the store seams.
-->
<script>
  import EditorTabs from '../../../components/EditorTabs.svelte';
  import Kicker from '../../../components/Kicker.svelte';
  import Notice from '../../../components/Notice.svelte';
  import EmptyState from '../../../components/EmptyState.svelte';
  import XrefList from '../../../components/XrefList.svelte';
  import { resolveCraftingArt } from '../../../util/craftingArtResolution.js';
  import { localize } from '../../../util/foundryBridge.js';
  import { essenceTintToken } from '../../../util/essenceTint.js';
  import { withRollPromptOrigin } from '../../../util/rollPromptOrigin.js';
  import InventoryDetailHeader from './InventoryDetailHeader.svelte';
  import InventoryDetailPager from './InventoryDetailPager.svelte';
  import InventorySalvagePanel from './InventorySalvagePanel.svelte';
  import InventorySystemSelector from './InventorySystemSelector.svelte';
  import { salvageAction } from './salvage/salvageAction.js';

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
    onResetSalvageOrder = () => {},
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
  const description = $derived(
    String((active ? active.description : item?.description) ?? '').trim()
  );
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
    Array.isArray(active ? active.essences : item?.essences)
      ? active
        ? active.essences
        : item.essences
      : []
  );
  const sources = $derived(Array.isArray(item?.sources) ? item.sources : []);
  const usedBy = $derived(
    Array.isArray(active ? active.usedBy : item?.usedBy)
      ? active
        ? active.usedBy
        : item.usedBy
      : []
  );
  const requiredFor = $derived(
    Array.isArray(active ? active.requiredFor : item?.requiredFor)
      ? active
        ? active.requiredFor
        : item.requiredFor
      : []
  );
  const producedBy = $derived(
    Array.isArray(active ? active.producedBy : item?.producedBy)
      ? active
        ? active.producedBy
        : item.producedBy
      : []
  );
  const contributors = $derived(Array.isArray(item?.contributors) ? item.contributors : []);
  const scopedTier = $derived(active ? active.tier : item?.tier);
  const tierLabel = $derived(
    scopedTier != null && scopedTier !== ''
      ? localize('FABRICATE.App.Inventory.Detail.Tier', { tier: scopedTier })
      : null
  );
  // Header identity re-derives from the SELECTED participation's component name/img — a GM
  // may know the same stack by a different name/icon in each system.
  const displayName = $derived(String((active ? active.name : item?.name) ?? ''));
  const displayImg = $derived((active ? active.img : item?.img) ?? '');
  // A card that backs NO component in any system is a tool-only card (issue 1119): it reads
  // as a Tool, and the affordances a tool never has in that role are omitted rather than
  // rendered empty.
  const isToolOnly = $derived(item?.isToolOnly === true);
  const typeLabel = $derived(
    localize(
      isEssence
        ? 'FABRICATE.App.Inventory.Detail.TypeEssence'
        : isToolOnly
          ? 'FABRICATE.App.Inventory.Detail.TypeTool'
          : 'FABRICATE.App.Inventory.Detail.TypeComponent'
    )
  );
  // The header's chip row, as data for the shared shell: the kind reads quiet, tier and
  // the GM's tags read neutral.
  const headerChips = $derived([
    { id: 'type', label: typeLabel, tone: 'quiet' },
    ...(tierLabel ? [{ id: 'tier', label: tierLabel }] : []),
    ...tags.map((tag) => ({ id: `tag:${tag}`, label: tag })),
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
  const openItem = (entry) => openRecipe(entry.recipeId);

  // The cross-reference rows of the current page of each list, as `XrefList` items.
  const sourceRows = $derived(
    sliceOf(sources, 'sources').map((source) => ({
      id: source.actorId,
      name: source.actorName,
      art: hasImg(source.actorImg) ? source.actorImg : '',
      icon: 'fas fa-user',
      quantity: `×${source.quantity}`,
      attrs: { 'data-inventory-source': source.actorId },
    }))
  );
  const contributorRows = $derived(
    sliceOf(contributors, 'contributors').map((contributor) => ({
      id: contributor.componentId,
      name: contributor.name,
      ...resolveCraftingArt(contributor.img ?? ''),
      quantity: `×${contributor.quantity}`,
      attrs: { 'data-inventory-contributor': contributor.componentId },
    }))
  );
  const usedByRows = $derived(
    sliceOf(usedBy, 'used').map((use) => ({
      id: `${use.recipeId}:${use.role}`,
      name: use.recipeName,
      ...resolveCraftingArt(use.recipeImg ?? ''),
      detail: roleLabel(use.role),
      recipeId: use.recipeId,
      attrs: { 'data-inventory-used-by': use.recipeId },
    }))
  );
  // A recipe entry opens its recipe; a salvage or gathering entry is no control.
  function kindRows(list, key, recipeHook, kindHook) {
    return sliceOf(list, key).map((entry, index) => {
      const opens = entry.kind === 'recipe' && Boolean(entry.recipeId);
      return {
        id: `${entry.kind}:${entry.recipeId ?? entry.name}:${index}`,
        name: entry.name,
        ...resolveCraftingArt(entry.img ?? ''),
        detail: kindLabel(entry.kind),
        recipeId: entry.recipeId,
        opens,
        attrs: opens ? { [recipeHook]: entry.recipeId } : { [kindHook]: entry.kind },
      };
    });
  }
  const requiredForRows = $derived(
    kindRows(
      requiredFor,
      'required',
      'data-inventory-required-for',
      'data-inventory-required-for-kind'
    )
  );
  const producedByRows = $derived(
    kindRows(
      producedBy,
      'produced',
      'data-inventory-produced-by',
      'data-inventory-produced-by-kind'
    )
  );

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
    {
      id: 'info',
      icon: 'fas fa-circle-info',
      labelKey: 'FABRICATE.App.Inventory.Detail.TabInfo',
      label: 'Info',
    },
    {
      id: 'salvage',
      icon: 'fas fa-recycle',
      labelKey: 'FABRICATE.App.Inventory.Detail.TabSalvage',
      label: 'Salvage',
    },
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

  // The pane's one primary: the one-shot salvage, in the header and only while Salvage is open.
  const action = $derived(
    salvageAction({ salvage, busy: salvaging, depleted, result: salvageResult })
  );
  const headerPrimary = $derived(
    salvageable && activeTab === 'salvage' && action.shown
      ? {
          primaryLabel: localize(action.labelKey),
          primaryIcon: salvaging ? 'fas fa-spinner fa-spin' : 'fas fa-recycle',
          primaryDisabled: action.disabled,
          primaryProps: {
            'data-inventory-salvage-action': '',
            'aria-busy': salvaging,
            'aria-describedby': action.toolBlocked ? 'salvage-footer-note' : undefined,
          },
          onclick: (event) => withRollPromptOrigin(event, () => onSalvage?.()),
        }
      : {}
  );
</script>

<InventoryDetailHeader
  detailKey={item.key}
  img={displayImg}
  icon={isEssence ? icon : ''}
  colorToken={isEssence ? item?.colorToken : ''}
  name={displayName}
  total={totalLabel}
  chips={headerChips}
  primary={headerPrimary}
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
    <!-- A real tablist, not a radiogroup: it switches between two views of one item and names
         the panel it shows, which `SegmentedControl` has no `aria-controls` to do. -->
    <EditorTabs
      tabs={TABS}
      {activeTab}
      onSelect={(tabId) => (activeTab = tabId)}
      ariaLabelKey="FABRICATE.App.Inventory.Detail.TabsLabel"
      idStem="inventory-detail"
      activePanelOnly
      tabDataAttr="data-inventory-detail-tab"
    />
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
        {depleted}
        result={salvageResult}
        toolBlocked={action.toolBlocked}
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
         repairs nothing. So this states the cause and offers NO action.

         THE SHARED `Notice`, NON-BLOCKING (issue 1514). The hand-rolled banner already carried
         `role="status"`, and a non-blocking notice is the only one of the two banner primitives
         that can keep it: `Callout` emits `role="note"` or nothing. The polite live region is
         KEPT rather than gained — `role="status"` already carries an implicit
         `aria-live="polite"` and `aria-atomic="true"`, so the attribute the primitive writes
         restates what the role on this strip has always implied. What would have been LOST is
         the announcement itself, which is what makes a banner appearing when a tool breaks
         mid-session announce itself. No `action` and no `dismissable`,
         so it still offers nothing to press. The wrapper below is the caller's and declares only
         the `flex-shrink: 0` the deleted rule did — the panel is a flex column, and a notice that
         may shrink is a notice whose sentence is squeezed. -->
        <div class="inventory-detail-broken-slot">
          <Notice
            tone="danger"
            title={localize('FABRICATE.App.Inventory.Detail.BrokenBanner')}
            data-inventory-broken-banner=""
          />
        </div>
      {/if}

      {#if description}
        <p class="inventory-detail-description" data-inventory-description>{description}</p>
      {/if}

      {#if essences.length > 0}
        <section class="inventory-detail-section">
          <Kicker>{localize('FABRICATE.App.Inventory.Detail.EssenceContentTitle')}</Kicker>
          <div class="inventory-detail-essences">
            {#each essences as essence (essence.id)}
              {@const tint = essenceTintToken(essence.colorToken)}
              <span
                class="inventory-chip inventory-chip-essence"
                class:has-tint={Boolean(tint)}
                style={tint ? `--fab-essence-tint:var(--fab-tag-${tint})` : undefined}
                data-essence-tint={tint || undefined}
              >
                {#if essence.icon}<i class={essence.icon} aria-hidden="true"></i>{/if}
                <span>{essence.name}</span>
                <span class="inventory-chip-qty">×{essence.quantity}</span>
              </span>
            {/each}
          </div>
        </section>
      {/if}

      <!-- No empty note: a listed row is built from held documents, so it has a source. -->
      {@render xrefSection(
        'sources',
        localize('FABRICATE.App.Inventory.Detail.SourcesTitle'),
        sources,
        sourceRows
      )}

      {#if isEssence}
        {@render xrefSection(
          'contributors',
          localize('FABRICATE.App.Inventory.Detail.ContributingTitle'),
          contributors,
          contributorRows,
          localize('FABRICATE.App.Inventory.Detail.ContributingEmpty')
        )}
      {/if}

      <!-- Omitted for a tool-only card: a tool is never consumed in that role, and
           "Not used by any known recipe" under a hammer six recipes require reads as a
           defect rather than as an empty state (issue 1119). -->
      {#if !isToolOnly}
        {@render xrefSection(
          'used',
          localize('FABRICATE.App.Inventory.Detail.UsedByTitle'),
          usedBy,
          usedByRows,
          localize('FABRICATE.App.Inventory.Detail.UsedByEmpty'),
          openItem
        )}
      {/if}

      {#if isTool}
        {@render xrefSection(
          'required',
          localize('FABRICATE.App.Inventory.Detail.RequiredForTitle'),
          requiredFor,
          requiredForRows,
          localize('FABRICATE.App.Inventory.Detail.RequiredForEmpty'),
          openItem
        )}
      {/if}

      <!-- Also omitted for a tool-only card: nothing produces a tool IN ITS TOOL ROLE. -->
      {#if !isEssence && !isToolOnly}
        {@render xrefSection(
          'produced',
          localize('FABRICATE.App.Inventory.Detail.ProducedByTitle'),
          producedBy,
          producedByRows,
          localize('FABRICATE.App.Inventory.Detail.ProducedByEmpty'),
          openItem
        )}
      {/if}
    </div>
  {/if}
</InventoryDetailHeader>

<!-- The page and pager key is the section id. The caller's empty note and pager sit after the
     list, at the section's own gap. -->
{#snippet xrefSection(section, label, list, items, emptyHint = '', onOpen = null)}
  <section class="inventory-detail-section" data-inventory-section={section}>
    <XrefList {label} {items} {onOpen} />
    {#if list.length > 0}
      <InventoryDetailPager
        {list}
        sectionKey={section}
        ariaLabel={label}
        page={pageOf(list, section)}
        pageSize={PAGE_SIZE}
        onPage={(value) => setPage(section, value)}
      />
    {:else if emptyHint}
      <EmptyState note hint={emptyHint} />
    {/if}
  </section>
{/snippet}

<style>
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

  /* THE SLOT ONLY. Every declaration that painted the broken banner — the danger edge, the
     danger fill, the danger ink, the glyph and the type — is what `Notice tone="danger"` draws,
     so the rule keeps the one thing that was the CALLER's: this panel is a flex column, and
     without `flex-shrink: 0` a long sentence is compressed rather than allowed to grow the
     scrolling column. */
  .inventory-detail-broken-slot {
    flex-shrink: 0;
  }

  .inventory-detail-essences {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-chip);
  }

  .inventory-chip-essence i {
    font-size: 10px;
  }

  /* Issue 1036: an essence chip on a carrying component wears THAT essence's colour, so the
     inspector answers "which essences are in this" by colour as well as by name — the same
     question the tinted tile answers one click away.

     All three of the chip's surfaces vary around the one base colour, which is the shape the
     `is-info` / `is-success` / `is-warning` tones above already take: a strong border, a
     faint wash, and full-strength text. Deriving them with `color-mix` rather than adding
     three tokens per palette colour is what keeps this to one declaration per surface for
     all fourteen colours, in every theme — the mix resolves against whatever the theme's
     `--fab-tag-*` currently is.

     `has-tint` gates the whole thing: an essence with no colour keeps the neutral chip it
     has today, byte for byte. */
  .inventory-chip-essence.has-tint {
    border-color: color-mix(in srgb, var(--fab-essence-tint) 45%, transparent);
    background: color-mix(in srgb, var(--fab-essence-tint) 14%, var(--fab-surface-raised));
    color: var(--fab-essence-tint);
  }

  /* The quantity keeps its quieter reading INSIDE a tinted chip: it is a number about the
     essence, not the essence's name, and at full strength it competed with it. */
  .inventory-chip-essence.has-tint .inventory-chip-qty {
    color: color-mix(in srgb, var(--fab-essence-tint) 72%, var(--fab-text-muted));
  }
</style>
