<!-- Svelte 5 runes mode -->
<!--
  Recipe-item editor BODY. A fully CONTROLLED component: it holds no draft and no
  persistence — it renders the tab strip, the active tab panel, and a right rail, and
  emits callbacks the router (which owns the draft, header, sticky footer, breadcrumb,
  dirty state and save) merges and persists.

  Layout mirrors the Books & Scrolls prototype "Edit recipe item" screen: a tab bar
  (Overview / Contents / Limits / Validation), the active panel, and a right rail with
  a live "How players see it" preview card and an "Effective rules" list. Both rail
  sections recompute live from `recipeItem` + `visibilityMode` + `linkedRecipes`.

  Props:
   - recipeItem: `{ id, sourceItemUuid, img, enabled, caps: { item, learn } }` draft.
   - linkedItem: `{ uuid, name, img, type, description? }|null` resolved game-world item.
   - linkedRecipes: `[{ id, name, category, img? }]` recipes linked to this item.
   - availableRecipes: `[{ id, name, category, img? }]` recipes that can be linked.
   - worldItems: `[{ uuid, name, img, type }]` candidate items for the item picker.
   - visibilityMode: 'item' | 'knowledge' (drives the Limits card and the rail).
   - activeTab / onSelectTab(tabId): the router owns the active tab.
   - validation: optional `{ checks, criticalCount }`; when absent it is computed here.
   - onPatch(patch): partial recipe-item patch (deep-merged upstream).
   - onLinkItem(uuid) / onUnlinkItem(): set / clear the linked game-world item.
   - onLinkRecipe(recipeId) / onRemoveRecipe(recipeId): link / unlink a recipe.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { recipeItemAccessBadge } from '../../util/recipeItemAccessBadge.js';
  import RecipeItemEditorTabs from './recipe-item/RecipeItemEditorTabs.svelte';
  import RecipeItemOverviewTab from './recipe-item/RecipeItemOverviewTab.svelte';
  import RecipeItemContentsTab from './recipe-item/RecipeItemContentsTab.svelte';
  import RecipeItemLimitsTab from './recipe-item/RecipeItemLimitsTab.svelte';
  import RecipeItemValidationTab from './recipe-item/RecipeItemValidationTab.svelte';

  let {
    recipeItem = null,
    linkedItem = null,
    linkedRecipes = [],
    availableRecipes = [],
    worldItems = [],
    visibilityMode = 'item',
    activeTab = 'overview',
    validation = null,
    onSelectTab = () => {},
    onPatch = () => {},
    onLinkItem = () => {},
    onUnlinkItem = () => {},
    onLinkRecipe = () => {},
    onRemoveRecipe = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const modeItem = $derived(visibilityMode === 'item');
  const modeKnowledge = $derived(visibilityMode === 'knowledge');

  const itemCaps = $derived(recipeItem?.caps?.item || {});
  const learnCaps = $derived(recipeItem?.caps?.learn || {});
  const limitUses = $derived(itemCaps.limitUses === true);
  const maxUses = $derived(Number.isFinite(itemCaps.maxUses) ? itemCaps.maxUses : 1);
  const whenSpent = $derived(itemCaps.whenSpent === 'inert' ? 'inert' : 'destroyed');
  const limitLearning = $derived(learnCaps.limitLearning === true);
  const learnScope = $derived(
    ['perInstance', 'total'].includes(learnCaps.learnScope)
      ? learnCaps.learnScope
      : learnCaps.learningMode === 'party'
        ? 'total'
        : 'perInstance'
  );
  const learnsAllowed = $derived(
    Number.isFinite(learnCaps.learnsAllowed) && learnCaps.learnsAllowed > 0 ? learnCaps.learnsAllowed : 1
  );

  const recipeCount = $derived(Array.isArray(linkedRecipes) ? linkedRecipes.length : 0);
  const hasItem = $derived(Boolean(linkedItem?.uuid || recipeItem?.sourceItemUuid));

  const itemName = $derived(String(linkedItem?.name || '') || text('FABRICATE.Admin.Manager.RecipeItem.Overview.NamePlaceholder', 'Untitled recipe item'));
  const itemType = $derived(String(linkedItem?.type || ''));

  // ---- Validation (shared shape with the Validation tab) --------------------
  const computedChecks = $derived.by(() => {
    const checks = [
      { id: 'itemLinked', ok: hasItem },
      { id: 'recipeLinked', ok: recipeCount > 0 }
    ];
    if (modeItem) {
      checks.push({ id: 'usesValid', ok: !limitUses || maxUses >= 1 });
    }
    if (modeKnowledge) {
      checks.push({ id: 'learnsValid', ok: !limitLearning || learnsAllowed >= 1 });
    }
    return checks;
  });
  const checks = $derived(Array.isArray(validation?.checks) && validation.checks.length > 0 ? validation.checks : computedChecks);
  const criticalCount = $derived(checks.filter(check => !check.ok).length);
  const effectiveValidation = $derived({ checks, criticalCount });

  const badges = $derived({
    contents: recipeCount > 0 ? recipeCount : '',
    validation: criticalCount > 0
      ? [{ label: String(criticalCount), tone: 'danger' }]
      : [{ label: '✓', tone: 'success' }]
  });

  // ---- Right rail: preview + effective rules --------------------------------
  function learnShort() {
    if (!limitLearning) return text('FABRICATE.Admin.Manager.RecipeItem.Preview.LearnFreely', 'Learn freely');
    if (learnScope === 'total') {
      return text('FABRICATE.Admin.Manager.RecipeItem.Preview.LearnUpToTotal', 'Learn up to {n} total').replace('{n}', String(learnsAllowed));
    }
    return text('FABRICATE.Admin.Manager.RecipeItem.Preview.LearnUpToPerCopy', 'Learn up to {n} per copy').replace('{n}', String(learnsAllowed));
  }

  const prereqName = $derived.by(() => {
    const id = learnCaps.prerequisite ? String(learnCaps.prerequisite) : '';
    if (!id) return '';
    const match = [...(linkedRecipes || []), ...(availableRecipes || [])].find(recipe => String(recipe?.id) === id);
    return match ? String(match.name || id) : id;
  });

  // Preview badge via the shared helper so the GM "How players see it" preview and the
  // player Inventory book detail render IDENTICAL badges under every mode/cap combo.
  const gmBadgeText = (key, fallback, data) =>
    text(key, fallback).replace('{n}', String(data?.n ?? ''));
  const previewBadge = $derived(
    recipeItemAccessBadge(
      { mode: modeItem ? 'item' : 'knowledge', item: itemCaps, learn: learnCaps },
      gmBadgeText
    )
  );

  const readLabel = $derived.by(() => {
    if (recipeCount === 0) {
      return text('FABRICATE.Admin.Manager.RecipeItem.Preview.NoRecipes', 'No recipes to learn');
    }
    // Item mode: the held book grants CRAFTING access, so the CTA is craft-based, not
    // learn-based. The use cap is shown separately as the badge under the name.
    if (modeItem) {
      return text('FABRICATE.Admin.Manager.RecipeItem.Preview.CraftRecipes', 'Craft {n} recipes').replace('{n}', String(recipeCount));
    }
    // When a learning cap actually restricts (below the total), the reader picks up to
    // the cap; otherwise they can read & learn everything.
    if (limitLearning && learnsAllowed < recipeCount) {
      return text('FABRICATE.Admin.Manager.RecipeItem.Preview.ReadLearnUpTo', 'Read & learn up to {n} of {total}')
        .replace('{n}', String(learnsAllowed))
        .replace('{total}', String(recipeCount));
    }
    return text('FABRICATE.Admin.Manager.RecipeItem.Preview.ReadLearn', 'Read & learn {n} {noun}')
      .replace('{n}', String(recipeCount))
      .replace('{noun}', recipeCount === 1
        ? text('FABRICATE.Admin.Manager.RecipeItem.Preview.RecipeSingular', 'recipe')
        : text('FABRICATE.Admin.Manager.RecipeItem.Preview.RecipePlural', 'recipes'));
  });

  const effectiveRules = $derived.by(() => {
    const rules = [];
    if (modeItem) {
      rules.push(limitUses
        ? { icon: 'fas fa-fire-flame-curved', tone: 'warning', title: maxUses === 1 ? text('FABRICATE.Admin.Manager.RecipeItem.Rules.SingleUse', 'Single use') : text('FABRICATE.Admin.Manager.RecipeItem.Rules.NUsesPerCopy', '{n} uses per copy').replace('{n}', String(maxUses)), sub: whenSpent === 'destroyed' ? text('FABRICATE.Admin.Manager.RecipeItem.Rules.DestroyedWhenSpent', 'Destroyed when spent') : text('FABRICATE.Admin.Manager.RecipeItem.Rules.InertWhenSpent', 'Becomes inert when spent') }
        : { icon: 'fas fa-infinity', tone: 'info', title: text('FABRICATE.Admin.Manager.RecipeItem.Rules.UnlimitedUses', 'Unlimited uses'), sub: text('FABRICATE.Admin.Manager.RecipeItem.Rules.NeverConsumed', 'The item is never consumed') });
    }
    if (modeKnowledge) {
      rules.push(limitLearning
        ? { icon: 'fas fa-user-check', tone: 'accent', title: learnShort(), sub: text('FABRICATE.Admin.Manager.RecipeItem.Rules.AppliesEveryRecipe', 'Applies to every recipe') }
        : { icon: 'fas fa-book', tone: 'success', title: text('FABRICATE.Admin.Manager.RecipeItem.Preview.LearnFreely', 'Learn freely'), sub: text('FABRICATE.Admin.Manager.RecipeItem.Rules.NoCapLearning', 'No cap on learning') });
      if (prereqName) {
        rules.push({ icon: 'fas fa-hammer', tone: 'muted', title: text('FABRICATE.Admin.Manager.RecipeItem.Rules.NeedsPrereq', 'Needs {name}').replace('{name}', prereqName), sub: text('FABRICATE.Admin.Manager.RecipeItem.Rules.OthersCantLearn', 'Others can’t learn from it') });
      }
    }
    return rules;
  });
</script>

<main class="manager-main manager-recipe-item-editor-main" aria-label={text('FABRICATE.Admin.Manager.RecipeItem.EditTitle', 'Edit recipe item')}>
  {#if recipeItem}
    <div class="manager-recipe-item-editor" data-recipe-item-editor>
      <div class="manager-recipe-item-editor-body">
        <RecipeItemEditorTabs {activeTab} {badges} onSelect={onSelectTab} />

        <div
          class="manager-editor-tab-panel manager-recipe-item-editor-panel"
          role="tabpanel"
          id={`recipe-item-panel-${activeTab}`}
          aria-labelledby={`recipe-item-tab-${activeTab}`}
        >
          {#if activeTab === 'overview'}
            <RecipeItemOverviewTab
              {recipeItem}
              {linkedItem}
              {worldItems}
              {onPatch}
              {onLinkItem}
              {onUnlinkItem}
            />
          {:else if activeTab === 'contents'}
            <RecipeItemContentsTab
              {linkedRecipes}
              {availableRecipes}
              {onLinkRecipe}
              {onRemoveRecipe}
            />
          {:else if activeTab === 'limits'}
            <RecipeItemLimitsTab
              {recipeItem}
              {visibilityMode}
              {linkedRecipes}
              {availableRecipes}
              {onPatch}
            />
          {:else if activeTab === 'validation'}
            <RecipeItemValidationTab
              {recipeItem}
              {linkedItem}
              {visibilityMode}
              validation={effectiveValidation}
            />
          {/if}
        </div>
      </div>

      <aside class="manager-recipe-item-editor-rail" data-recipe-item-rail aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Rail.Label', 'Preview and effective rules')}>
        <div class="manager-recipe-item-rail-section">
          <span class="manager-recipe-item-rail-title">{text('FABRICATE.Admin.Manager.RecipeItem.Rail.HowPlayersSee', 'How players see it')}</span>
          <div class="manager-recipe-item-preview-card" data-recipe-item-preview>
            <div class="manager-recipe-item-preview-head">
              <span class="manager-recipe-item-preview-thumb" aria-hidden="true">
                {#if linkedItem?.img}<img src={linkedItem.img} alt="" />{:else}<i class="fas fa-book"></i>{/if}
              </span>
              <div class="manager-recipe-item-preview-copy">
                <span class="manager-recipe-item-preview-name" data-recipe-item-preview-name>{itemName}</span>
                <span class="manager-recipe-item-preview-meta">{itemType
                  ? text('FABRICATE.Admin.Manager.RecipeItem.Preview.MetaInPack', '{type} · in your pack').replace('{type}', itemType)
                  : text('FABRICATE.Admin.Manager.RecipeItem.Preview.MetaInPackNoType', 'In your pack')}</span>
              </div>
            </div>
            <div class="manager-recipe-item-preview-badges">
              <span class={`manager-recipe-item-preview-badge is-${previewBadge.tone}`} data-recipe-item-preview-badge data-badge-tone={previewBadge.tone}>
                <i class={previewBadge.icon} aria-hidden="true"></i>
                <span>{previewBadge.label}</span>
              </span>
            </div>
            <!-- Presentational only: a preview of the player's CTA, not an action here.
                 Rendered as a non-interactive element so it isn't a focusable dead button. -->
            <div class="manager-recipe-item-preview-cta" class:is-disabled={recipeCount === 0} data-recipe-item-preview-cta>
              <i class="fas fa-book-open" aria-hidden="true"></i>
              <span>{readLabel}</span>
            </div>
          </div>
        </div>

        <div class="manager-recipe-item-rail-section">
          <span class="manager-recipe-item-rail-title">{text('FABRICATE.Admin.Manager.RecipeItem.Rail.EffectiveRules', 'Effective rules')}</span>
          <div class="manager-recipe-item-rules-list" data-recipe-item-rules>
            {#each effectiveRules as rule, index (`${rule.title}-${index}`)}
              <div class="manager-recipe-item-rule-row" data-recipe-item-rule data-rule-tone={rule.tone}>
                <i class={`${rule.icon} manager-recipe-item-rule-icon is-${rule.tone}`} aria-hidden="true"></i>
                <div class="manager-recipe-item-rule-copy">
                  <span class="manager-recipe-item-rule-title">{rule.title}</span>
                  <span class="manager-recipe-item-rule-sub">{rule.sub}</span>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <div class="manager-recipe-item-rail-note">
          <i class="fas fa-circle-check" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.RecipeItem.Rail.LiveHint', 'This preview updates live as you change the controls on the left.')}</span>
        </div>
      </aside>
    </div>
  {:else}
    <div class="manager-empty">
      <div>
        <i class="fas fa-book" aria-hidden="true"></i>
        <h3>{text('FABRICATE.Admin.Manager.RecipeItem.SelectItem', 'Select a recipe item')}</h3>
        <p>{text('FABRICATE.Admin.Manager.RecipeItem.EditMissingHint', 'Pick a recipe item from Books & Scrolls to open its editor.')}</p>
      </div>
    </div>
  {/if}
</main>

<style>
  .manager-recipe-item-editor {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    grid-template-rows: minmax(0, 1fr);
    min-height: 0;
    height: 100%;
    gap: 0;
  }

  /* Stack the 320px preview rail below the editor body when the manager SHELL narrows
     (container query — a Foundry window resizes independently of the viewport), so the
     content column isn't squeezed near the minimum window width. */
  @container fabricate-manager (max-width: 900px) {
    .manager-recipe-item-editor {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr) auto;
    }

    .manager-recipe-item-editor-rail {
      border-left: 0;
      border-top: 1px solid var(--fab-border);
    }
  }

  .manager-recipe-item-editor-body {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    padding: var(--fab-space-4);
  }

  .manager-recipe-item-editor-panel {
    padding-top: var(--fab-space-2);
  }

  .manager-recipe-item-editor-rail {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-4);
    min-height: 0;
    overflow-y: auto;
    padding: var(--fab-space-4);
    background: var(--fab-bg-2);
    border-left: 1px solid var(--fab-border);
  }

  .manager-recipe-item-rail-section {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .manager-recipe-item-rail-title {
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--fab-text-subtle);
  }

  .manager-recipe-item-preview-card {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 11px;
    background: var(--fab-bg-1);
  }

  .manager-recipe-item-preview-head {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
  }

  .manager-recipe-item-preview-thumb {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    flex: 0 0 40px;
    border-radius: 9px;
    background: var(--fab-bg-3);
    color: var(--fab-text-secondary);
    overflow: hidden;
  }

  .manager-recipe-item-preview-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .manager-recipe-item-preview-copy {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    min-width: 0;
  }

  .manager-recipe-item-preview-name {
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--fab-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-recipe-item-preview-meta {
    font-size: 0.62rem;
    color: var(--fab-text-subtle);
  }

  .manager-recipe-item-preview-badges {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
  }

  .manager-recipe-item-preview-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-1);
    padding: var(--fab-space-2xs) var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 999px;
    font-size: 0.62rem;
    font-weight: 600;
  }

  .manager-recipe-item-preview-badge.is-warning {
    border-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
    color: var(--fab-warning-text);
  }

  .manager-recipe-item-preview-badge.is-info {
    border-color: var(--fab-info-border);
    background: var(--fab-info-soft);
    color: var(--fab-info-text);
  }

  .manager-recipe-item-preview-badge.is-success {
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
    color: var(--fab-success-text);
  }

  .manager-recipe-item-preview-cta {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-2);
    width: 100%;
    height: 36px;
    border: 1px solid var(--fab-accent-border);
    border-radius: 8px;
    background: var(--fab-accent);
    color: var(--fab-on-accent);
    font-weight: 700;
    font-size: 0.75rem;
    cursor: default;
  }

  .manager-recipe-item-preview-cta.is-disabled {
    opacity: 0.6;
  }


  .manager-recipe-item-rules-list {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .manager-recipe-item-rule-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-bg-1);
  }

  .manager-recipe-item-rule-icon {
    width: 14px;
    text-align: center;
  }

  .manager-recipe-item-rule-icon.is-warning {
    color: var(--fab-warning-text);
  }

  .manager-recipe-item-rule-icon.is-info {
    color: var(--fab-info-text);
  }

  .manager-recipe-item-rule-icon.is-success {
    color: var(--fab-success);
  }

  .manager-recipe-item-rule-icon.is-accent {
    color: var(--fab-accent);
  }

  .manager-recipe-item-rule-icon.is-muted {
    color: var(--fab-text-secondary);
  }

  .manager-recipe-item-rule-copy {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .manager-recipe-item-rule-title {
    font-weight: 600;
    font-size: 0.7rem;
    color: var(--fab-text);
  }

  .manager-recipe-item-rule-sub {
    font-size: 0.6rem;
    color: var(--fab-text-subtle);
  }

  .manager-recipe-item-rail-note {
    display: flex;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-surface-soft);
    font-size: 0.66rem;
    line-height: 1.5;
    color: var(--fab-text-muted);
  }

  .manager-recipe-item-rail-note > i {
    color: var(--fab-success);
    margin-top: 1px;
  }
</style>
