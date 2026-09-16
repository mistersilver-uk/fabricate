<!-- Svelte 5 runes mode -->
<!--
  KnownRecipesColumn — the left column of the Alchemy workbench: the recipes the
  discipline has REVEALED to this player. Reveal is broader than "learned by brew":
  per the system's visibility mode a recipe is revealed by a held book/scroll
  (item), by learning it (knowledge), by a GM access grant (Manual), or by
  discovering it through brewing — all project identically here. Non-revealed
  recipes are never named; only their count shows in the footer. The discipline
  block (system name + Switch) sits above the heading, a name search, recipe rows
  with a signature summary and a live-match badge, an onboarding zero-revealed
  empty state, a distinct filtered "no matches" state, and the non-revealed-count
  footer. A "Switch discipline" button appears only when more than one discipline
  exists. Prop-driven.
-->
<script>
  import Callout from '../manager/Callout.svelte';
  import EmptyState from '../manager/EmptyState.svelte';
  import Medallion from '../../components/Medallion.svelte';
  import { localize } from '../../util/foundryBridge.js';

  let {
    recipes = [],
    knownCount = 0,
    undiscoveredCount = 0,
    search = '',
    selectedRecipeId = null,
    matchedRecipeId = null,
    activeSystemName = '',
    canSwitch = false,
    onSearch = null,
    onSelect = null,
    onSwitch = null,
  } = $props();

  /** A short, safe signature summary for a revealed recipe (the discipline has revealed it to the player). */
  function sigSummary(recipe) {
    const set = recipe?.signatureSummary?.[0];
    if (!set) return '';
    const groups = Array.isArray(set.groups) ? set.groups : [];
    const parts = groups
      .map((group) => {
        const option = group?.options?.[0];
        if (!option) return null;
        const alt = group.options.length > 1 ? ' +' : '';
        return `${option.name}${alt} ×${option.quantity}`;
      })
      .filter(Boolean);
    if (set.essences?.length) {
      for (const essence of set.essences) parts.push(`${essence.name} ×${essence.quantity}`);
    }
    return parts.join(' · ');
  }

  function resultLabel(recipe) {
    if (!recipe?.result) return '';
    return localize('FABRICATE.App.Alchemy.Makes', {
      name: recipe.result.name,
      qty: recipe.result.quantity,
    });
  }
</script>

<div class="alchemy-known">
  {#if activeSystemName || canSwitch}
    <div class="alchemy-known-system">
      <span class="alchemy-known-system-name">{activeSystemName}</span>
      {#if canSwitch}
        <button
          type="button"
          class="alchemy-switch"
          data-alchemy-switch
          onclick={() => onSwitch?.()}
        >
          <i class="fas fa-arrow-right-arrow-left" aria-hidden="true"></i>
          {localize('FABRICATE.App.Alchemy.SwitchDiscipline')}
        </button>
      {/if}
    </div>
  {/if}

  <div class="alchemy-known-head">
    <div class="alchemy-known-title">{localize('FABRICATE.App.Alchemy.KnownRecipes')}</div>
    <span class="alchemy-known-count">{knownCount}</span>
  </div>

  <label class="alchemy-known-search">
    <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
    <input
      type="text"
      value={search}
      placeholder={localize('FABRICATE.App.Alchemy.SearchKnown')}
      aria-label={localize('FABRICATE.App.Alchemy.SearchKnown')}
      oninput={(event) => onSearch?.(event.target.value)}
    />
  </label>

  {#if recipes.length === 0 && knownCount > 0}
    <!--
      The wrapper carries the grow, the panel carries everything else — the same split
      `.alchemy-inventory-empty` and `.gathering-env-empty` take, and for the same reason:
      `EmptyState` is padding-driven and its only documented fill escape puts the module
      stylesheet on this change's path (`EmptyState.svelte:53-55`).
    -->
    <div class="alchemy-known-empty">
      <!--
        `filtered` with the HINT alone, matching every shipped caller of the variant. The
        dropped "No matches" title is redundant against the sentence that stays, and its
        `lang/en.json` key goes with it so the orphan gate stays green.
      -->
      <EmptyState
        filtered
        hint={localize('FABRICATE.App.Alchemy.NoRecipeMatchesHint')}
        dataAttr="data-alchemy-known-no-matches"
        dataValue=""
      />
    </div>
  {:else if recipes.length === 0}
    <div class="alchemy-known-empty">
      <EmptyState
        icon="fas fa-flask-vial"
        title={localize('FABRICATE.App.Alchemy.ZeroKnownTitle')}
        hint={localize('FABRICATE.App.Alchemy.ZeroKnownHint')}
        dataAttr="data-alchemy-zero-known"
        dataValue=""
      />
    </div>
  {:else}
    <ul class="alchemy-known-list">
      {#each recipes as recipe (recipe.id)}
        <li>
          <button
            type="button"
            class="alchemy-recipe"
            class:is-selected={recipe.id === selectedRecipeId}
            class:is-match={recipe.id === matchedRecipeId}
            data-alchemy-recipe={recipe.id}
            onclick={() => onSelect?.(recipe.id)}
          >
            <span class="alchemy-recipe-top">
              <Medallion
                art={recipe.img}
                alt=""
                size={36}
                glyph={14}
                tint="peach"
                icon="fas fa-flask"
              />
              <span class="alchemy-recipe-meta">
                <span class="alchemy-recipe-name">{recipe.name}</span>
                <span class="alchemy-recipe-sig">{sigSummary(recipe)}</span>
              </span>
              {#if recipe.id === matchedRecipeId}
                <span class="alchemy-recipe-badge" aria-hidden="true"
                  ><i class="fas fa-wand-sparkles"></i></span
                >
              {/if}
            </span>
            {#if recipe.result}
              <span class="alchemy-recipe-result">
                <i class="fas fa-arrow-right-long" aria-hidden="true"></i>
                {resultLabel(recipe)}
              </span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <!--
    THE WELL IS THE PRIMITIVE'S, THE PLACEMENT IS THE CALLER'S (issue 1514). `Callout`
    declares `margin: 0` and forwards no class, and this well's own rule carried two
    properties that are the COLUMN's layout rather than the strip's geometry: `margin-top:
    12px` separating it from the list above, and `flex: 0 0 auto` stopping the column's
    flex from shrinking it. Both move to a wrapper; everything else the rule declared is
    what the primitive now draws.

    The count sentence becomes the `title` and the guidance the `text`, which is the split
    `Callout` already models (`.manager-callout-title` over `.manager-callout-text`). It
    used to be a `<b>` running inline into the sentence beside it, so the two sit on their
    own lines now — recorded as an accepted frame move, not discovered later.
  -->
  <div class="alchemy-known-footer-slot">
    <Callout
      tone="neutral"
      icon="fas fa-flask-vial"
      title={localize('FABRICATE.App.Alchemy.Undiscovered', { count: undiscoveredCount })}
      text={localize('FABRICATE.App.Alchemy.UndiscoveredHint')}
      dataAttr="data-alchemy-undiscovered"
      dataValue=""
    />
  </div>
</div>

<style>
  .alchemy-known {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    padding: 16px;
    background: var(--fab-surface-soft);
    border: 1px solid var(--fab-border);
    border-radius: 10px;
  }

  .alchemy-known-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .alchemy-known-title {
    font-family: var(--font-primary);
    font-size: 15px;
    font-weight: 600;
    color: var(--fab-text);
  }

  .alchemy-known-count {
    font-family: var(--font-primary);
    font-size: 11px;
    font-weight: 600;
    color: var(--fab-text-subtle);
  }

  .alchemy-known-system {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 12px;
  }

  .alchemy-known-system-name {
    max-width: 100%;
    font-size: 11px;
    font-weight: 600;
    color: var(--fab-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .alchemy-switch {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 8px;
    border: 1px solid var(--fab-border);
    background: var(--fab-surface);
    color: var(--fab-text-secondary);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .alchemy-switch:hover {
    background: var(--fab-surface-active);
  }

  .alchemy-known-search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 11px;
    height: 36px;
    background: var(--fab-surface);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    margin-bottom: 12px;
    color: var(--fab-text-subtle);
    flex: 0 0 auto;
  }

  .alchemy-known-search input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 0;
    color: var(--fab-text);
    font-size: 12.5px;
  }

  .alchemy-known-list {
    list-style: none;
    margin: 0;
    /* No negative horizontal margin here: `overflow-y: auto` coerces `overflow-x`
       to auto, which clips the first/last row's focus outline + border-radius at
       the top/bottom edge. Use padding + outline-offset room instead. */
    padding: 2px 4px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    min-height: 0;
    flex: 1 1 auto;
  }

  .alchemy-recipe {
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 9px;
    min-height: 56px;
    padding: 12px 13px;
    border-radius: 11px;
    border: 1px solid var(--fab-border);
    background: var(--fab-surface);
    color: var(--fab-text);
    cursor: pointer;
    text-align: left;
    /* Reset Foundry's global <button> styling (fixed height + line-height) so the
       card lays out like a plain auto-height flex column; otherwise the fixed
       height crops the box and the result row spills below the border. */
    appearance: none;
    -webkit-appearance: none;
    margin: 0;
    font: inherit;
    line-height: normal;
    height: auto;
    overflow: visible;
  }

  .alchemy-recipe.is-selected,
  .alchemy-recipe.is-match {
    border-color: var(--fab-accent-border);
    background: var(--fab-surface-active);
  }

  .alchemy-recipe:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .alchemy-recipe-top {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .alchemy-recipe-meta {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .alchemy-recipe-name {
    font-family: var(--font-primary);
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .alchemy-recipe-sig {
    font-size: 10px;
    color: var(--fab-text-subtle);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 1px;
  }

  .alchemy-recipe-badge {
    width: 22px;
    height: 22px;
    flex: 0 0 auto;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--fab-accent-soft);
    border: 1px solid var(--fab-accent-border);
    color: var(--fab-accent);
    font-size: 8px;
  }

  .alchemy-recipe-result {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-top: 9px;
    border-top: 1px solid var(--fab-border);
    font-size: 10.5px;
    font-weight: 600;
    color: var(--fab-text-secondary);
  }

  .alchemy-recipe-result i {
    color: var(--fab-accent);
    font-size: 9px;
  }

  /* THE WRAPPER ONLY: the grow and the centring the column needs. */
  .alchemy-known-empty {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  /* The two properties the deleted `.alchemy-known-footer` rule declared that were the
     COLUMN's layout rather than the strip's own geometry. See the markup comment. */
  .alchemy-known-footer-slot {
    flex: 0 0 auto;
    margin-top: 12px;
  }
</style>
