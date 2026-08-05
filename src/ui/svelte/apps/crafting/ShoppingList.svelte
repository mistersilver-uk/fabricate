<!-- Svelte 5 runes mode -->
<!--
  ShoppingList is the default right-column body: an acquisition planner. It always
  shows three summary cards (planned recipes / missing components / unavailable
  tools), then either an empty state or three cards — the recipe queue (left-click a
  row to add one, right-click to remove one, × to drop it), the components still to
  acquire (missing ingredients + missing essences only), and the tools to acquire or
  repair. Fully-owned components never appear.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import CraftingEssenceThumb from './CraftingEssenceThumb.svelte';
  import CraftingThumb from './CraftingThumb.svelte';

  let {
    aggregate = null,
    entries = [],
    onIncrement = null,
    onDecrement = null,
    onRemove = null,
    onClear = null,
  } = $props();

  const queued = $derived(Array.isArray(entries) ? entries : []);
  const isEmpty = $derived(queued.length === 0);

  const ingredients = $derived(Array.isArray(aggregate?.ingredients) ? aggregate.ingredients : []);
  const essences = $derived(Array.isArray(aggregate?.essences) ? aggregate.essences : []);
  const tools = $derived(Array.isArray(aggregate?.tools) ? aggregate.tools : []);

  function displayName(value, fallback) {
    return typeof value === 'string' && value.trim() ? value : (fallback ?? '');
  }

  // Missing ingredient components + missing essences, folded into one acquire list.
  // Only shortfalls appear (satisfied entries drop out entirely).
  const acquireComponents = $derived([
    ...ingredients
      .filter((ing) => ing?.satisfied !== true)
      .map((ing) => ({
        key: `ing:${ing.componentId ?? ing.description ?? ing.name}`,
        name: displayName(ing.name, ing.description),
        img: ing.img ?? null,
        isEssence: ing.isEssence === true,
        icon: ing.icon ?? null,
        have: ing.have ?? 0,
        need: ing.totalNeed ?? 0,
      })),
    ...essences
      .filter((ess) => ess?.satisfied !== true)
      .map((ess) => ({
        key: `ess:${ess.type}`,
        name: displayName(ess.name, ess.type),
        icon: ess.icon ?? null,
        isEssence: true,
        have: ess.have ?? 0,
        need: ess.totalNeed ?? 0,
      })),
  ]);

  const acquireTools = $derived(
    tools
      .filter((tool) => tool?.available !== true)
      .map((tool) => ({
        key: `tool:${tool.componentId ?? tool.name}`,
        name: tool.name ?? '',
        img: tool.img ?? null,
        needsRepair: tool.needsRepair === true,
      }))
  );

  const plannedRecipes = $derived(queued.length);
  const missingComponentsCount = $derived(acquireComponents.length);
  const unavailableToolsCount = $derived(acquireTools.length);

  function ownedLabel(row) {
    return localize('FABRICATE.App.Crafting.Shopping.Owned', { have: row.have, need: row.need });
  }
  function onEntryContext(recipeId, event) {
    event.preventDefault();
    onDecrement?.(recipeId);
  }
  // No `stopPropagation`: the × is a SIBLING of the row's activation button, not a
  // descendant of it, so a click here was never on its way to the increment handler.
  // (It was, back when the whole `<li>` carried `onclick`.)
  function onEntryRemove(recipeId) {
    onRemove?.(recipeId);
  }
</script>

<section class="crafting-shopping" data-crafting-shopping>
  <header class="crafting-shopping-head">
    <p class="crafting-shopping-title">{localize('FABRICATE.App.Crafting.Shopping.Title')}</p>
    {#if !isEmpty}
      <button type="button" class="crafting-shopping-clear" onclick={() => onClear?.()}>
        {localize('FABRICATE.App.Crafting.Shopping.Clear')}
      </button>
    {/if}
  </header>

  <div class="crafting-shopping-summary" data-shopping-summary>
    <div class="crafting-shopping-summary-card" data-summary="recipes">
      <span class="crafting-shopping-summary-value">
        <i class="fas fa-scroll" aria-hidden="true"></i>
        <span class="crafting-shopping-summary-count">{plannedRecipes}</span>
      </span>
      <span class="crafting-shopping-summary-label"
        >{localize('FABRICATE.App.Crafting.Shopping.PlannedRecipes')}</span
      >
    </div>
    <div
      class="crafting-shopping-summary-card"
      class:is-alert={missingComponentsCount > 0}
      data-summary="components"
    >
      <span class="crafting-shopping-summary-value">
        <i class="fas fa-cubes" aria-hidden="true"></i>
        <span class="crafting-shopping-summary-count">{missingComponentsCount}</span>
      </span>
      <span class="crafting-shopping-summary-label"
        >{localize('FABRICATE.App.Crafting.Shopping.MissingComponents')}</span
      >
    </div>
    <div
      class="crafting-shopping-summary-card"
      class:is-alert={unavailableToolsCount > 0}
      data-summary="tools"
    >
      <span class="crafting-shopping-summary-value">
        <i class="fas fa-screwdriver-wrench" aria-hidden="true"></i>
        <span class="crafting-shopping-summary-count">{unavailableToolsCount}</span>
      </span>
      <span class="crafting-shopping-summary-label"
        >{localize('FABRICATE.App.Crafting.Shopping.UnavailableTools')}</span
      >
    </div>
  </div>

  {#if isEmpty}
    <p class="crafting-shopping-empty" data-crafting-shopping-empty>
      <i class="fas fa-cart-shopping" aria-hidden="true"></i>
      {localize('FABRICATE.App.Crafting.Shopping.Empty')}
    </p>
  {:else}
    <div class="crafting-shopping-scroll">
      <div class="crafting-shopping-card">
        <p class="crafting-shopping-card-title">
          {localize('FABRICATE.App.Crafting.Shopping.RecipesTitle')}
        </p>
        <ul class="crafting-shopping-queue">
          {#each queued as entry (entry.recipeId)}
            <!--
              The row stays a real `listitem` and nests a real `<button>` for the
              increment action. It is NOT itself a button: it already contains the
              remove `<button>`, and `<button>`'s content model forbids interactive
              descendants. That would not self-correct — Svelte builds the DOM with
              `createElement`/`appendChild` and never goes through the HTML parser, so
              the invalid nesting would ship rather than being implicitly closed.

              `oncontextmenu` stays on the `<li>` on purpose: right-clicking anywhere
              on the row — the × included — decrements, which is the behaviour the row
              has always had.
            -->
            <li
              class="crafting-shopping-entry"
              oncontextmenu={(event) => onEntryContext(entry.recipeId, event)}
            >
              <button
                type="button"
                class="crafting-shopping-entry-main"
                data-shopping-entry={entry.recipeId}
                title={entry.name}
                onclick={() => onIncrement?.(entry.recipeId)}
              >
                <CraftingThumb src={entry.img} alt="" size={28} />
                <span class="crafting-shopping-entry-name">{entry.name}</span>
                <span class="crafting-shopping-entry-qty">×{entry.quantity}</span>
              </button>
              <button
                type="button"
                class="crafting-shopping-remove"
                title={localize('FABRICATE.App.Crafting.Shopping.Remove')}
                aria-label={localize('FABRICATE.App.Crafting.Shopping.Remove')}
                onclick={() => onEntryRemove(entry.recipeId)}
              >
                <i class="fas fa-xmark" aria-hidden="true"></i>
              </button>
            </li>
          {/each}
        </ul>
      </div>

      {#if acquireComponents.length > 0}
        <div class="crafting-shopping-card" data-shopping-acquire-components>
          <p class="crafting-shopping-card-title">
            {localize('FABRICATE.App.Crafting.Shopping.AcquireComponents')}
          </p>
          <ul class="crafting-shopping-acquire">
            {#each acquireComponents as row (row.key)}
              <li class="crafting-shopping-acquire-row">
                {#if row.isEssence}
                  <CraftingEssenceThumb icon={row.icon} size={28} />
                {:else}
                  <CraftingThumb src={row.img} alt="" size={28} />
                {/if}
                <span class="crafting-shopping-acquire-name" title={row.name}>{row.name}</span>
                <span class="crafting-shopping-chip tone-danger">{ownedLabel(row)}</span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if acquireTools.length > 0}
        <div class="crafting-shopping-card" data-shopping-acquire-tools>
          <p class="crafting-shopping-card-title">
            {localize('FABRICATE.App.Crafting.Shopping.AcquireTools')}
          </p>
          <ul class="crafting-shopping-acquire">
            {#each acquireTools as tool (tool.key)}
              <li class="crafting-shopping-acquire-row">
                <CraftingThumb src={tool.img} alt="" size={28} />
                <span class="crafting-shopping-acquire-name" title={tool.name}>{tool.name}</span>
                <span
                  class={`crafting-shopping-chip ${tool.needsRepair ? 'tone-warning' : 'tone-danger'}`}
                  data-shopping-tool-mode={tool.needsRepair ? 'repair' : 'acquire'}
                >
                  <i
                    class={`fas ${tool.needsRepair ? 'fa-wrench' : 'fa-cart-plus'}`}
                    aria-hidden="true"
                  ></i>
                  {tool.needsRepair
                    ? localize('FABRICATE.App.Crafting.Shopping.Repair')
                    : localize('FABRICATE.App.Crafting.Shopping.Acquire')}
                </span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .crafting-shopping {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    height: 100%;
    min-height: 0;
    padding: var(--fab-space-4);
    box-sizing: border-box;
  }

  .crafting-shopping-head {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .crafting-shopping-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }

  .crafting-shopping-clear {
    box-sizing: border-box;
    height: auto;
    min-height: 28px;
    padding: 2px 10px;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface-soft);
    color: var(--fab-text-muted);
    font-size: 12px;
    cursor: pointer;
  }

  .crafting-shopping-clear:hover {
    background: var(--fab-surface-raised);
    color: var(--fab-text);
  }

  /* Three always-visible summary cards. */
  .crafting-shopping-summary {
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--fab-space-2);
  }

  .crafting-shopping-summary-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    text-align: center;
  }

  .crafting-shopping-summary-card.is-alert {
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
  }

  /* Icon + count share a line; the label sits beneath. */
  .crafting-shopping-summary-value {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .crafting-shopping-summary-card i {
    font-size: 14px;
    color: var(--fab-text-muted);
  }

  .crafting-shopping-summary-card.is-alert i {
    color: var(--fab-danger-text);
  }

  .crafting-shopping-summary-count {
    font-size: 18px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .crafting-shopping-summary-label {
    font-size: 10px;
    line-height: 1.2;
    color: var(--fab-text-muted);
  }

  .crafting-shopping-empty {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin: 0;
    padding: var(--fab-space-4);
    text-align: center;
    font-size: 13px;
    color: var(--fab-text-muted);
  }

  .crafting-shopping-empty i {
    font-size: 24px;
  }

  /* The card stack scrolls; the header + summary stay pinned above it. */
  .crafting-shopping-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    padding-right: 2px;
  }

  .crafting-shopping-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
  }

  .crafting-shopping-card-title {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--fab-text-muted);
  }

  .crafting-shopping-queue,
  .crafting-shopping-acquire {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* The row's own padding moved INSIDE the activation button, so the whole padded area
     stays clickable rather than shrinking the target by the 4px/6px band. The `×` is a
     SIBLING of that button, not a descendant, so the right edge is restored here —
     without it the `×` would sit flush against the row border. */
  .crafting-shopping-entry {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 6px 0 0;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface);
  }

  .crafting-shopping-entry:hover {
    background: var(--fab-surface-raised);
  }

  /* Both elements are in this template, so the compiler can see this `:has()` and keeps
     it — unlike a `:has()` reaching across a component boundary, which it prunes. */
  .crafting-shopping-entry:has(.crafting-shopping-entry-main:focus-visible) {
    outline: 2px solid var(--fab-accent);
    outline-offset: -2px;
  }

  /*
    The row's activation target. Foundry's `@layer elements.forms` paints every `<button>`
    with its own background, border, fixed `--button-size` height and an explicit 14px
    Signika face, so all of that is reset here. A scoped block is the right home for it:
    `css: 'injected'` emits these rules UNLAYERED, and an unlayered rule beats a layered
    one whatever the specificity. (The comment above `.manager-access-row` in
    `styles/fabricate.css` says a scoped override is unreliable against Foundry's `button`
    rule — issue 511. `button.manager-chip` in `Chip.svelte` is the shipped counter-example;
    moving this to the global sheet would also drag the whole theme screenshot scope in.)

    Named reasons for the non-obvious declarations:
     - `background`/`border` — Foundry paints BOTH, so unreset this draws a boxed button
       inside the row's own border and surface.
     - `flex: 1 1 auto; min-width: 0` — as a flex child of the `<li>`. Without it the
       button shrink-wraps, the `×` unpins from the right edge, and the name's ellipsis
       truncation stops working.
     - `text-align: left` — buttons carry the UA's `text-align: center`, which
       `appearance: none` does not clear; it would inherit into the flex-grown name.
     - the four font longhands — Foundry's `@layer reset` sets `font: inherit` on buttons,
       but `elements.forms` overrides it with an explicit 14px Signika and the later layer
       wins regardless of specificity. `.crafting-shopping-entry-qty` declares no
       `font-size`, so unreset the quantity would jump to 14px while the 13px name held,
       shifting the row baseline.
     - `height: auto` + `min-height` — the row needs ~36px (a 28px thumb plus padding)
       against Foundry's ~32px `--button-size` floor, which would otherwise clip it.
  */
  .crafting-shopping-entry-main {
    appearance: none;
    box-sizing: border-box;
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    height: auto;
    min-height: 36px;
    margin: 0;
    padding: 4px 6px;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    font-family: inherit;
    font-size: inherit;
    font-weight: inherit;
    line-height: inherit;
    cursor: pointer;
  }

  /* The ROW draws the ring (the `:has()` rule above). Without this the button ALSO
     matches `.fabricate-app button:focus-visible` in `styles/fabricate.css` and the row
     gets two concentric accent rings, the outer one painting over its border. Scoped,
     this is (0,3,0) and beats that area rule at (0,2,1) — which is held at single-class
     specificity for exactly this purpose. `.crafting-shopping-remove:focus-visible`
     below is the same pattern. The area rule's `:focus` half already covers the mouse
     case, so `:focus-visible` alone is enough. */
  .crafting-shopping-entry-main:focus-visible {
    outline: none;
  }

  .crafting-shopping-entry-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .crafting-shopping-entry-qty {
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: var(--fab-text-muted);
  }

  .crafting-shopping-remove {
    box-sizing: border-box;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    min-height: 26px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--fab-text-muted);
    cursor: pointer;
  }

  .crafting-shopping-remove:hover {
    background: var(--fab-surface-raised);
    color: var(--fab-text);
  }

  .crafting-shopping-remove:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 1px;
  }

  .crafting-shopping-acquire-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface);
  }

  .crafting-shopping-acquire-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .crafting-shopping-chip {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .crafting-shopping-chip i {
    font-size: 10px;
  }

  .crafting-shopping-chip.tone-danger {
    color: var(--fab-danger-text);
    border: 1px solid var(--fab-danger-border);
    background: var(--fab-danger-soft);
  }

  .crafting-shopping-chip.tone-warning {
    color: var(--fab-warning-text);
    border: 1px solid var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }
</style>
