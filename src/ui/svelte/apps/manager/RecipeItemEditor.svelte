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
  import { prerequisitePreview } from '../../../../systems/characterPrerequisites.js';
  import { buildRecipeItemPreviewRow } from '../../util/recipeItemPreviewRow.js';
  // The "How players see it" rail renders the REAL player book detail (fed a synthetic
  // row) so it can never drift from what players actually see. InventoryDetail pulls in
  // its own `recipeItemAccessBadge`, keeping the access badge in lockstep by construction.
  import InventoryDetail from '../inventory/InventoryDetail.svelte';
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
    // System-owned character prerequisite library (issue 544), forwarded to the
    // Limits tab's "Character prerequisites to learn" picker.
    characterPrerequisites = [],
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

  // Learning requirements (issue 544): read-only chips mirroring the two learning
  // gates authored on the Limits tab, surfaced in both the "How players see it"
  // preview card and the Effective-rules list. Both are toggle-gated, so they only
  // populate when `limitLearning` is on — matching runtime enforcement.

  // Required Knowledge → recipe name chips. Defensive over the array-or-legacy-single
  // shape; a name falls back to the id when the recipe can't be resolved.
  const requiredKnowledgeChips = $derived.by(() => {
    if (!limitLearning) return [];
    const ids = Array.isArray(learnCaps.prerequisiteIds)
      ? learnCaps.prerequisiteIds
      : learnCaps.prerequisite
        ? [learnCaps.prerequisite]
        : [];
    if (ids.length === 0) return [];
    const byId = new Map(
      [...(linkedRecipes || []), ...(availableRecipes || [])].map((recipe) => [
        String(recipe?.id),
        recipe,
      ])
    );
    return ids.map((id) => {
      const key = String(id);
      const match = byId.get(key);
      return { id: key, name: match ? String(match.name || key) : key, icon: 'fas fa-scroll' };
    });
  });

  // Learning prerequisites → character-prerequisite chips carrying each prereq's own
  // icon plus a human-readable `preview` (@path op value). Ids that no longer resolve
  // to a definition are dropped (fail-open, matching runtime).
  const learningPrerequisiteChips = $derived.by(() => {
    if (!limitLearning) return [];
    const ids = Array.isArray(learnCaps.characterPrerequisiteIds)
      ? learnCaps.characterPrerequisiteIds
      : [];
    if (ids.length === 0) return [];
    const byId = new Map((characterPrerequisites || []).map((p) => [String(p.id), p]));
    return ids
      .map((id) => byId.get(String(id)))
      .filter(Boolean)
      .map((p) => ({
        id: String(p.id),
        name: String(p.name || p.id),
        icon: p.icon || 'fas fa-user-check',
        preview: prerequisitePreview(p),
      }));
  });

  // "Satisfied?" experiment toggle (issue 544): a GM-only, NON-persisted map of
  // requirementId → boolean driving the embedded preview's synthetic met/unmet state.
  // Unset defaults to `true` (satisfied), so the preview opens on the normal/unlocked
  // player view; the GM flips a requirement off to preview its gated state.
  let satisfiedById = $state({});
  const satisfied = (id) => satisfiedById[id] !== false;
  function toggleSatisfied(id) {
    satisfiedById = { ...satisfiedById, [id]: !satisfied(id) };
  }

  // ONE requirement source, reusing the already-resolved (and limitLearning-gated)
  // chip deriveds, stamped with the current toggle state.
  const previewRequirements = $derived([
    ...requiredKnowledgeChips.map((chip) => ({
      id: chip.id,
      kind: 'knowledge',
      name: chip.name,
      icon: chip.icon,
      met: satisfied(chip.id),
    })),
    ...learningPrerequisiteChips.map((chip) => ({
      id: chip.id,
      kind: 'character',
      name: chip.name,
      icon: chip.icon,
      met: satisfied(chip.id),
    })),
  ]);

  // The synthetic book row fed to the REAL player `InventoryDetail` component so the
  // "How players see it" preview can never drift from the actual player UI.
  const previewRow = $derived(
    buildRecipeItemPreviewRow({
      key: `recipeitem:preview:${recipeItem?.id ?? 'draft'}`,
      name: itemName,
      img: linkedItem?.img,
      description: linkedItem?.description,
      mode: visibilityMode,
      caps: recipeItem?.caps,
      recipes: (linkedRecipes || []).map((recipe) => ({
        id: recipe?.id,
        name: recipe?.name,
        description: '',
        img: recipe?.img,
      })),
      requirements: previewRequirements,
    })
  );

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
      // Required Knowledge / Learning prerequisites become one "Needs: <name>" row each
      // (only when Limited learning is on — matching runtime toggle-gating).
      // Each "Needs: <name>" row carries the requirement `id`/`kind` so the markup can
      // render a GM-only "Satisfied?" toggle that drives the embedded preview. The
      // use/learn-cap rows above carry no `id` and get no toggle.
      const needsTitle = (name) => text('FABRICATE.Admin.Manager.RecipeItem.Rules.NeedsKnowledge', 'Needs: {name}').replace('{name}', name);
      for (const chip of requiredKnowledgeChips) {
        rules.push({ id: chip.id, kind: 'knowledge', icon: 'fas fa-scroll', tone: 'muted', title: needsTitle(chip.name), sub: text('FABRICATE.Admin.Manager.RecipeItem.Rules.NeedsKnowledgeSub', 'Must already be known') });
      }
      for (const chip of learningPrerequisiteChips) {
        rules.push({ id: chip.id, kind: 'character', icon: chip.icon, tone: 'muted', title: needsTitle(chip.name), sub: chip.preview || text('FABRICATE.Admin.Manager.RecipeItem.Rules.NeedsPrereqSub', 'Character requirement') });
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
              {characterPrerequisites}
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
          <!-- The REAL player book detail, fed a synthetic row — so it can never drift.
               No callbacks are passed, so it's a read-only preview. -->
          <div class="manager-recipe-item-live-preview" data-recipe-item-preview>
            <InventoryDetail item={previewRow} learningRecipeId={null} />
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
                {#if rule.id}
                  <button
                    type="button"
                    class={`manager-status-toggle manager-recipe-item-satisfied-toggle ${satisfied(rule.id) ? 'is-on' : 'is-off'}`}
                    data-recipe-item-satisfied-toggle={rule.id}
                    aria-pressed={satisfied(rule.id)}
                    aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Rules.Satisfied', 'Satisfied?')}
                    title={text('FABRICATE.Admin.Manager.RecipeItem.Rules.Satisfied', 'Satisfied?')}
                    onclick={() => toggleSatisfied(rule.id)}
                  >
                    <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
                    <span class="manager-status-toggle-label">{satisfied(rule.id)
                      ? text('FABRICATE.Admin.Manager.StatusOn', 'On')
                      : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}</span>
                  </button>
                {/if}
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

  /* The "How players see it" rail embeds the REAL player `InventoryDetail` component
     (issue 544), which sets `height: 100%`; bound it and let it scroll so the full
     player UI (badge, description, "Needs:" chips, recipe list + search + pager)
     renders inside the ~320px rail instead of collapsing. */
  .manager-recipe-item-live-preview {
    max-height: 460px;
    overflow: auto;
    border: 1px solid var(--fab-border);
    border-radius: 11px;
    background: var(--fab-bg-1);
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
    /* A deep dotted prerequisite path (@a.b.c.d ≥ N) must break, not overflow. */
    overflow-wrap: anywhere;
  }

  /* GM-only "Satisfied?" experiment toggle, right-aligned in a "Needs:" rule row. */
  .manager-recipe-item-satisfied-toggle {
    flex: 0 0 auto;
    margin-left: auto;
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
