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
   - recipeItem: `{ id, originItemUuid, img, enabled, caps: { item, learn } }` draft.
   - linkedItem: `{ uuid, name, img, type, description? }|null` resolved game-world item.
   - linkedRecipes: `[{ id, name, category, img? }]` recipes linked to this item.
   - availableRecipes: `[{ id, name, category, img? }]` recipes that can be linked.
   - visibilityMode: 'item' | 'knowledge' (drives the Limits card and the rail).
   - activeTab / onSelectTab(tabId): the router owns the active tab.
   - validation: optional `{ checks, criticalCount }`; when absent it is computed here.
   - onPatch(patch): partial recipe-item patch (deep-merged upstream).
   - onLinkItem(uuid) / onUnlinkItem(): set / clear the linked game-world item.
   - onLinkRecipe(recipeId) / onRemoveRecipe(recipeId): link / unlink a recipe.
-->
<script>
  import EmptyState from './EmptyState.svelte';
  import StatusToggle from '../../components/StatusToggle.svelte';
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
  import { focusValidationTarget } from './validationFocus.js';

  let {
    recipeItem = null,
    linkedItem = null,
    linkedRecipes = [],
    availableRecipes = [],
    // System-owned character prerequisite library (issue 544), forwarded to the
    // Limits tab's "Character prerequisites to learn" picker.
    characterPrerequisites = [],
    visibilityMode = 'item',
    activeTab = 'overview',
    validation = null,
    onSelectTab = () => {},
    onPatch = () => {},
    onLinkItem = () => {},
    onUnlinkItem = () => {},
    onCopyItemUuid = () => {},
    onLinkRecipe = () => {},
    onRemoveRecipe = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // ── THE VALIDATION ROW ACTION (issue 1517) ──────────────────────────────────────────────
  // The three routes a validation row may address, written once so the guard below and the
  // announcement's own label lookup cannot disagree about which tabs are reachable. `validation`
  // is deliberately absent: it is the tab the action is taken FROM.
  const ISSUE_TABS = {
    overview: { key: 'FABRICATE.Admin.Manager.RecipeItem.Tabs.Overview', fallback: 'Overview' },
    contents: { key: 'FABRICATE.Admin.Manager.RecipeItem.Tabs.Contents', fallback: 'Contents' },
    limits: { key: 'FABRICATE.Admin.Manager.RecipeItem.Tabs.Limits', fallback: 'Limits' },
  };

  // This editor's own root, so `focusValidationTarget` resolves a `data-validation-target`
  // inside THIS editor rather than anywhere in the manager window.
  let editorRoot = $state(null);

  // WHAT THE LIVE REGION SAYS: the ACTION'S OUTCOME, not a count. Activating a row action
  // changes no tally, so a count-subjected region would recite an unchanged number at the
  // moment a GM most needs to know where they landed.
  let issueAnnouncement = $state('');

  /**
   * The focused control's own accessible name, read off the DOM. `aria-label` first, then the
   * `<label for>` that names it, then `title`. A destination with none of the three — the Item
   * drop zone, say — yields '' and the announcement names the route alone.
   *
   * @param {Element|null} element
   * @returns {string}
   */
  function accessibleNameOf(element) {
    if (!element) return '';
    const label = element.getAttribute('aria-label');
    if (label) return label.trim();
    const id = element.getAttribute('id');
    const labelling = id ? editorRoot?.querySelector(`label[for="${id}"]`) : null;
    if (labelling) return (labelling.textContent || '').trim();
    return (element.getAttribute('title') || '').trim();
  }

  /**
   * Deep-link from a validation issue: switch to the tab that hosts the gap, THEN move focus to
   * the offending control.
   *
   * THE ORDER IS THE MECHANISM, not a preference. The route is requested synchronously and
   * first — `onSelectTab` is the router's own state write, exactly as the tab strip's own click
   * is — so Svelte has flushed it and the destination panel exists by the time the helper's
   * `queueMicrotask` runs its query. And the announcement is derived FROM the element the helper
   * resolves, so it cannot be written before focus moved: there is nothing to write it from.
   *
   * @param {string} targetTab the ROUTE the row carries.
   * @param {string} [focusTarget] the CONTROL's `data-validation-target` value, if it named one.
   */
  async function selectIssue(targetTab, focusTarget) {
    const route = Object.hasOwn(ISSUE_TABS, targetTab) ? targetTab : null;
    if (route) onSelectTab(route);
    const focused = await focusValidationTarget(editorRoot, focusTarget);
    const routeLabel = route ? text(ISSUE_TABS[route].key, ISSUE_TABS[route].fallback) : '';
    const controlName = accessibleNameOf(focused);
    issueAnnouncement = controlName ? `${routeLabel} — ${controlName}` : routeLabel;
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
    Number.isFinite(learnCaps.learnsAllowed) && learnCaps.learnsAllowed > 0
      ? learnCaps.learnsAllowed
      : 1
  );

  const recipeCount = $derived(Array.isArray(linkedRecipes) ? linkedRecipes.length : 0);
  const hasItem = $derived(Boolean(linkedItem?.uuid || recipeItem?.originItemUuid));

  const itemName = $derived(
    String(linkedItem?.name || '') ||
      text('FABRICATE.Admin.Manager.RecipeItem.Overview.NamePlaceholder', 'Untitled recipe item')
  );

  // ---- Validation (shared shape with the Validation tab) --------------------
  const computedChecks = $derived.by(() => {
    const checks = [
      { id: 'itemLinked', ok: hasItem },
      { id: 'recipeLinked', ok: recipeCount > 0 },
    ];
    if (modeItem) {
      checks.push({ id: 'usesValid', ok: !limitUses || maxUses >= 1 });
    }
    if (modeKnowledge) {
      checks.push({ id: 'learnsValid', ok: !limitLearning || learnsAllowed >= 1 });
    }
    return checks;
  });
  const checks = $derived(
    Array.isArray(validation?.checks) && validation.checks.length > 0
      ? validation.checks
      : computedChecks
  );
  const criticalCount = $derived(checks.filter((check) => !check.ok).length);
  const effectiveValidation = $derived({ checks, criticalCount });

  const badges = $derived({
    contents: recipeCount > 0 ? recipeCount : '',
    validation:
      criticalCount > 0
        ? [{ label: String(criticalCount), tone: 'danger' }]
        : [{ label: '✓', tone: 'success' }],
  });

  // ---- Right rail: preview + effective rules --------------------------------
  function learnShort() {
    if (!limitLearning)
      return text('FABRICATE.Admin.Manager.RecipeItem.Preview.LearnFreely', 'Learn freely');
    if (learnScope === 'total') {
      return text(
        'FABRICATE.Admin.Manager.RecipeItem.Preview.LearnUpToTotal',
        'Learn up to {n} total'
      ).replace('{n}', String(learnsAllowed));
    }
    return text(
      'FABRICATE.Admin.Manager.RecipeItem.Preview.LearnUpToPerCopy',
      'Learn up to {n} per copy'
    ).replace('{n}', String(learnsAllowed));
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
      // The learning/knowledge glyph, kept in lockstep with the player builder's
      // knowledge requirement icon (InventoryListingBuilder._evaluateBookRequirements).
      return {
        id: key,
        name: match ? String(match.name || key) : key,
        icon: 'fas fa-graduation-cap',
      };
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
      rules.push(
        limitUses
          ? {
              icon: 'fas fa-fire-flame-curved',
              tone: 'warning',
              title:
                maxUses === 1
                  ? text('FABRICATE.Admin.Manager.RecipeItem.Rules.SingleUse', 'Single use')
                  : text(
                      'FABRICATE.Admin.Manager.RecipeItem.Rules.NUsesPerCopy',
                      '{n} uses per copy'
                    ).replace('{n}', String(maxUses)),
              sub:
                whenSpent === 'destroyed'
                  ? text(
                      'FABRICATE.Admin.Manager.RecipeItem.Rules.DestroyedWhenSpent',
                      'Destroyed when spent'
                    )
                  : text(
                      'FABRICATE.Admin.Manager.RecipeItem.Rules.InertWhenSpent',
                      'Becomes inert when spent'
                    ),
            }
          : {
              icon: 'fas fa-infinity',
              tone: 'info',
              title: text(
                'FABRICATE.Admin.Manager.RecipeItem.Rules.UnlimitedUses',
                'Unlimited uses'
              ),
              sub: text(
                'FABRICATE.Admin.Manager.RecipeItem.Rules.NeverConsumed',
                'The item is never consumed'
              ),
            }
      );
    }
    if (modeKnowledge) {
      rules.push(
        limitLearning
          ? {
              icon: 'fas fa-user-check',
              tone: 'accent',
              title: learnShort(),
              sub: text(
                'FABRICATE.Admin.Manager.RecipeItem.Rules.AppliesEveryRecipe',
                'Applies to every recipe'
              ),
            }
          : {
              icon: 'fas fa-book',
              tone: 'success',
              title: text('FABRICATE.Admin.Manager.RecipeItem.Preview.LearnFreely', 'Learn freely'),
              sub: text(
                'FABRICATE.Admin.Manager.RecipeItem.Rules.NoCapLearning',
                'No cap on learning'
              ),
            }
      );
      // Required Knowledge / Learning prerequisites become one "Needs: <name>" row each
      // (only when Limited learning is on — matching runtime toggle-gating).
      // Each "Needs: <name>" row carries the requirement `id`/`kind` so the markup can
      // render a GM-only "Satisfied?" toggle that drives the embedded preview. The
      // use/learn-cap rows above carry no `id` and get no toggle.
      const needsTitle = (name) =>
        text('FABRICATE.Admin.Manager.RecipeItem.Rules.NeedsKnowledge', 'Needs: {name}').replace(
          '{name}',
          name
        );
      for (const chip of requiredKnowledgeChips) {
        rules.push({
          id: chip.id,
          kind: 'knowledge',
          icon: chip.icon,
          tone: 'muted',
          title: needsTitle(chip.name),
          sub: text(
            'FABRICATE.Admin.Manager.RecipeItem.Rules.NeedsKnowledgeSub',
            'Must already be known'
          ),
        });
      }
      for (const chip of learningPrerequisiteChips) {
        rules.push({
          id: chip.id,
          kind: 'character',
          icon: chip.icon,
          tone: 'muted',
          title: needsTitle(chip.name),
          sub:
            chip.preview ||
            text(
              'FABRICATE.Admin.Manager.RecipeItem.Rules.NeedsPrereqSub',
              'Character requirement'
            ),
        });
      }
    }
    return rules;
  });
</script>

<main
  class="manager-main manager-recipe-item-editor-main"
  aria-label={text('FABRICATE.Admin.Manager.RecipeItem.EditTitle', 'Edit recipe item')}
  bind:this={editorRoot}
>
  <!--
    THE ROW ACTION'S LIVE REGION, and it is HOSTED HERE rather than in the validation surface
    for a reason that is not stylistic (issue 1517). Activating a row action changes `activeTab`
    to another value, which unmounts the whole validation panel — live region included — in the
    same update that was supposed to announce. So the element carrying `aria-live` is ALWAYS in
    the DOM, outside both the `{#if recipeItem}` guard and the `{#if activeTab}` chain below,
    with its own `{#if}` INSIDE it.

    `.visually-hidden` is `position: absolute`, so this element is out of flow and takes no track
    in the route's layout.

    It is addressed by a `data-` hook rather than a class, so it joins no pinned class family.
  -->
  <div class="visually-hidden" role="status" aria-live="polite" data-recipe-item-issue-announcement>
    {#if issueAnnouncement}{issueAnnouncement}{/if}
  </div>
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
              {onPatch}
              {onLinkItem}
              {onUnlinkItem}
              {onCopyItemUuid}
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
              onSelectIssue={selectIssue}
            />
          {/if}
        </div>
      </div>

      <aside
        class="manager-recipe-item-editor-rail"
        data-recipe-item-rail
        aria-label={text(
          'FABRICATE.Admin.Manager.RecipeItem.Rail.Label',
          'Preview and effective rules'
        )}
      >
        <div class="manager-recipe-item-rail-section">
          <span class="manager-recipe-item-rail-title"
            >{text(
              'FABRICATE.Admin.Manager.RecipeItem.Rail.HowPlayersSee',
              'How players see it'
            )}</span
          >
          <!-- The REAL player book detail, fed a synthetic row — so it can never drift.
               No callbacks are passed, so it's a read-only preview. -->
          <div class="manager-recipe-item-live-preview" data-recipe-item-preview>
            <InventoryDetail item={previewRow} learningRecipeId={null} />
          </div>
        </div>

        <div class="manager-recipe-item-rail-section">
          <span class="manager-recipe-item-rail-title"
            >{text(
              'FABRICATE.Admin.Manager.RecipeItem.Rail.EffectiveRules',
              'Effective rules'
            )}</span
          >
          <div class="manager-recipe-item-rules-list" data-recipe-item-rules>
            {#each effectiveRules as rule, index (`${rule.title}-${index}`)}
              <div
                class="manager-recipe-item-rule-row"
                data-recipe-item-rule
                data-rule-tone={rule.tone}
              >
                <i
                  class={`${rule.icon} manager-recipe-item-rule-icon is-${rule.tone}`}
                  aria-hidden="true"
                ></i>
                <div class="manager-recipe-item-rule-copy">
                  <span class="manager-recipe-item-rule-title">{rule.title}</span>
                  <span class="manager-recipe-item-rule-sub">{rule.sub}</span>
                </div>
                {#if rule.id}
                  <StatusToggle
                    on={satisfied(rule.id)}
                    label={satisfied(rule.id)
                      ? text('FABRICATE.Admin.Manager.StatusOn', 'On')
                      : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}
                    ariaLabel={text(
                      'FABRICATE.Admin.Manager.RecipeItem.Rules.Satisfied',
                      'Satisfied?'
                    )}
                    class="manager-recipe-item-satisfied-toggle"
                    data-recipe-item-satisfied-toggle={rule.id}
                    title={text('FABRICATE.Admin.Manager.RecipeItem.Rules.Satisfied', 'Satisfied?')}
                    onclick={() => toggleSatisfied(rule.id)}
                  />
                {/if}
              </div>
            {/each}
          </div>
        </div>

        <div class="manager-recipe-item-rail-note">
          <i class="fas fa-circle-check" aria-hidden="true"></i>
          <span
            >{text(
              'FABRICATE.Admin.Manager.RecipeItem.Rail.LiveHint',
              'This preview updates live as you change the controls on the left.'
            )}</span
          >
        </div>
      </aside>
    </div>
  {:else}
    <EmptyState
      icon="fas fa-book"
      title={text('FABRICATE.Admin.Manager.RecipeItem.SelectItem', 'Select a recipe item')}
      hint={text(
        'FABRICATE.Admin.Manager.RecipeItem.EditMissingHint',
        'Pick a recipe item from Books & Scrolls to open its editor.'
      )}
    />
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

  /* GM-only "Satisfied?" experiment toggle, right-aligned in a "Needs:" rule row.

     `:global(...)` is REQUIRED here, not decoration (issue 1040). The class now rides the
     `class` prop of a `<StatusToggle>`, and Svelte scopes a rule by stamping its
     `svelte-<hash>` onto the elements THIS component writes — never onto a child component's
     internals — so a scoped `.manager-recipe-item-satisfied-toggle` would be emitted with the
     hash appended and match nothing, silently un-right-aligning the switch.
     `ManagerButton.svelte` records the same trap and the same two repairs; this rule stays in
     this file rather than moving to `styles/fabricate.css` because it has exactly one call
     site, and it is CHAINED with the primitive's own class so it is not a bare global. */
  :global(.manager-status-toggle.manager-recipe-item-satisfied-toggle) {
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
