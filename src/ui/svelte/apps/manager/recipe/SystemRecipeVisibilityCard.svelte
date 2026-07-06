<!-- Svelte 5 runes mode -->
<!--
  System-level Recipe Visibility card. A standalone card (mirroring how
  ResolutionModeCard is a self-contained system-settings card) that lets a GM
  choose how recipes are exposed to players: Global (all visible), Player-specific
  (per-recipe restrictions authored in each recipe's editor), or Knowledge-based
  (item and/or learning gated). Teaser mode is intentionally out of scope here.

  Layout is stable as options change: the List mode card and the Knowledge-based
  card each span the full width, and the knowledge mode's variable inputs (item /
  learning sub-cards) are NESTED inside the Knowledge card in their own responsive
  3-column grid — so switching modes reflows only that nested grid, never the
  top-level cards. Sub-cards reuse the `manager-resolution-mode-card` frame.

  The card is CONTROLLED and live-applies each control: every handler passes ONLY
  its own field to `onSave(patch)`. The admin store's object-form
  `saveVisibilityConfig` merges every omitted field from the system's existing
  `recipeVisibility`, so partial patches are safe.

  Props:
   - recipeVisibility: the system's `{ listMode, knowledge: { mode, item, learn } }`.
   - showKnowledgeOptions: true when listMode === 'knowledge' (knowledge sub-cards).
   - onSave(patch): live-apply a single-field config patch to the store.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let {
    recipeVisibility = {},
    showKnowledgeOptions = false,
    onSave = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const listMode = $derived(recipeVisibility?.listMode || 'global');
  const knowledge = $derived(recipeVisibility?.knowledge || {});
  const knowledgeMode = $derived(knowledge?.mode || 'itemOrLearned');
  const limitUses = $derived(knowledge?.item?.limitUses === true);
  const maxUses = $derived(
    Number.isFinite(Number(knowledge?.item?.maxUses)) ? Number(knowledge.item.maxUses) : 1
  );
  const destroyWhenExhausted = $derived(knowledge?.item?.destroyWhenExhausted === true);
  const consumeOnLearn = $derived(knowledge?.learn?.consumeOnLearn !== false);
  const dragDropEnabled = $derived(knowledge?.learn?.dragDropEnabled !== false);
  // Recipe-item learn cap (issue 511): how many linked recipes a player may learn
  // from one recipe item. When on, `consumeOnLearn` is hidden (superseded by
  // `destroyWhenSpent`) and ignored by the runtime.
  const limitRecipes = $derived(knowledge?.learn?.limitRecipes === true);
  const maxRecipes = $derived(
    Number.isFinite(Number(knowledge?.learn?.maxRecipes)) ? Number(knowledge.learn.maxRecipes) : 1
  );
  const destroyWhenSpent = $derived(knowledge?.learn?.destroyWhenSpent === true);

  // The item sub-cards apply when the recipe item can gate visibility.
  const showItemOptions = $derived(knowledgeMode === 'item' || knowledgeMode === 'itemOrLearned');
  // The learn sub-cards apply when learning can gate visibility.
  const showLearnOptions = $derived(knowledgeMode === 'learned' || knowledgeMode === 'itemOrLearned');

  // Explanatory note shown under the List mode select — one per mode, so the
  // option labels themselves can stay terse (no parenthetical clarifiers).
  const listModeDescription = $derived(
    listMode === 'player'
      ? text(
          'FABRICATE.Admin.Manager.System.RecipeVisibility.PlayerNote',
          "Per-recipe visibility restrictions are configured in each recipe's editor. Restricted recipes are hidden from all players by default unless specific users are allowed."
        )
      : listMode === 'knowledge'
        ? text(
            'FABRICATE.Admin.Manager.System.RecipeVisibility.KnowledgeNote',
            'Players only see recipes they have unlocked — by holding the recipe item and/or having learnt it.'
          )
        : text(
            'FABRICATE.Admin.Manager.System.RecipeVisibility.GlobalNote',
            'Every recipe in this system is visible to all players.'
          )
  );

  function adjustMaxUses(delta) {
    onSave({ maxUses: Math.max(1, maxUses + delta) });
  }

  // Enabling limited uses must also commit a concrete cap. The store leaves
  // `maxUses` undefined when only `limitUses` is sent, and the runtime treats an
  // undefined cap as "unlimited" (RecipeVisibilityService), so the card would
  // otherwise display "1" while items behaved as uncapped. Persist the shown
  // default (>= 1) on enable; disabling clears the cap via the store cascade.
  function setLimitUses(next) {
    if (next) {
      onSave({ limitUses: true, maxUses: Math.max(1, maxUses) });
    } else {
      onSave({ limitUses: false });
    }
  }

  function adjustMaxRecipes(delta) {
    onSave({ maxRecipes: Math.max(1, maxRecipes + delta) });
  }

  // Enabling the learn cap commits a concrete `maxRecipes` (>= 1) alongside the
  // flag, mirroring the item Limited-uses toggle; disabling clears the cap via
  // the store cascade (and preserves the prior consumeOnLearn value).
  function setLimitRecipes(next) {
    if (next) {
      onSave({ limitRecipes: true, maxRecipes: Math.max(1, maxRecipes) });
    } else {
      onSave({ limitRecipes: false });
    }
  }
</script>

<!-- The On/Off pill itself. `onToggle(next)` lets the limit-uses toggle commit a
     cap alongside the flag while the rest pass a plain single-field patch. -->
{#snippet toggleButton(dataField, ariaKey, ariaFallback, on, onToggle, disabled)}
  <button
    type="button"
    class={`manager-status-toggle ${on ? 'is-on' : 'is-off'}${disabled ? ' is-disabled' : ''}`}
    aria-pressed={on}
    aria-label={text(ariaKey, ariaFallback)}
    disabled={disabled}
    {...{ [dataField]: true }}
    onclick={() => onToggle(!on)}
  >
    <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
    <span class="manager-status-toggle-label">{on
      ? text('FABRICATE.Admin.Manager.SystemEdit.FeatureOn', 'On')
      : text('FABRICATE.Admin.Manager.SystemEdit.FeatureOff', 'Off')}</span>
  </button>
{/snippet}

<!-- A standalone boolean-toggle sub-card (used by the learn options, which gate
     nothing further). The toggle is pinned to the top-right of the card — the
     same head layout as the Optional-features tiles — with the description below. -->
{#snippet toggleCard(dataField, labelKey, labelFallback, descKey, descFallback, on, onToggle)}
  <div class="manager-resolution-mode-card manager-recipe-visibility-subcard">
    <div class="manager-recipe-visibility-toggle-head">
      <span class="manager-resolution-mode-legend">{text(labelKey, labelFallback)}</span>
      {@render toggleButton(dataField, labelKey, labelFallback, on, onToggle, false)}
    </div>
    <p class="manager-recipe-visibility-subcard-desc">{text(descKey, descFallback)}</p>
  </div>
{/snippet}

<section class="manager-inspector-card manager-recipe-visibility-card" data-system-recipe-visibility>
  <div class="manager-inspector-title-row">
    <span class="manager-inspector-icon" aria-hidden="true">
      <i class="fas fa-eye"></i>
    </span>
    <div class="manager-inspector-copy">
      <p class="manager-kicker">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.Hint', 'Control which players can see recipes.')}</p>
      <h2 class="manager-inspector-name">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.Title', 'Recipe Visibility')}</h2>
    </div>
  </div>

  <!-- List mode: a subheading + select + per-mode note, inline in the parent card
       rather than its own bordered sub-card. -->
  <div class="manager-recipe-visibility-section">
    <span class="manager-recipe-visibility-subheading">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.ListModeLabel', 'List mode')}</span>
    <div class="manager-recipe-visibility-control">
      <select
        data-recipe-visibility-list-mode
        aria-label={text('FABRICATE.Admin.Manager.System.RecipeVisibility.ListModeLabel', 'List mode')}
        value={listMode}
        onchange={(event) => onSave({ listMode: event.target.value })}
      >
        <option value="global">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.Global', 'Global')}</option>
        <option value="player">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.PlayerSpecific', 'Player-specific')}</option>
        <option value="knowledge">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.KnowledgeBased', 'Knowledge-based')}</option>
      </select>
    </div>
    <!-- Per-mode explanatory text lives under the select and covers every mode,
         so the option labels stay terse. -->
    <p class="manager-recipe-visibility-subcard-desc manager-recipe-visibility-list-mode-note" data-recipe-visibility-list-mode-note>{listModeDescription}</p>
  </div>

  {#if showKnowledgeOptions}
    <!-- Knowledge-based: a subheading + mode select, inline in the parent card
         (a peer of List mode), with the option cards below. -->
    <div class="manager-recipe-visibility-section" data-recipe-visibility-knowledge>
      <span class="manager-recipe-visibility-subheading">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.KnowledgeBased', 'Knowledge-based')}</span>
      <p class="manager-recipe-visibility-subcard-desc">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.KnowledgeModeHint', 'How players gain access to a recipe.')}</p>
      <div class="manager-recipe-visibility-control">
        <select
          data-recipe-visibility-knowledge-mode
          aria-label={text('FABRICATE.Admin.Manager.System.RecipeVisibility.KnowledgeBased', 'Knowledge-based')}
          value={knowledgeMode}
          onchange={(event) => onSave({ knowledgeMode: event.target.value })}
        >
          <option value="item">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.KnowledgeByItem', 'By item')}</option>
          <option value="learned">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.KnowledgeByLearning', 'By learning')}</option>
          <option value="itemOrLearned">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.KnowledgeByEither', 'Item or learning')}</option>
        </select>
      </div>
    </div>

    {#if showItemOptions || showLearnOptions}
      <!-- The option cards share one equal-height grid (align-items: stretch). -->
      <div class="manager-recipe-visibility-grid">
        {#if showItemOptions}
          <!-- The Limited-uses card gates the Maximum uses + Delete exhausted inputs
               nested below it; those stay visible but faded + disabled until it is
               enabled, so the card never changes size. -->
          <div class="manager-resolution-mode-card manager-recipe-visibility-subcard manager-recipe-visibility-item-card">
            <span class="manager-resolution-mode-legend">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.ItemLimitUses', 'Limited uses of recipe items')}</span>
            <p class="manager-recipe-visibility-subcard-desc">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.ItemLimitUsesHint', 'Cap how many times a recipe item grants access.')}</p>
            <div class="manager-recipe-visibility-item-controls">
              <div class="manager-recipe-visibility-item-toggle-row">
                <div class="manager-recipe-visibility-item-cell">
                  <span class="manager-recipe-visibility-nested-label">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.ItemLimitUsesToggle', 'Enabled')}</span>
                  {@render toggleButton('data-recipe-visibility-limit-uses', 'FABRICATE.Admin.Manager.System.RecipeVisibility.ItemLimitUses', 'Limited uses of recipe items', limitUses, setLimitUses, false)}
                </div>
                <div class="manager-recipe-visibility-item-cell" class:is-disabled={!limitUses}>
                  <span class="manager-recipe-visibility-nested-label">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.ItemDestroyWhenExhausted', 'Delete when exhausted')}</span>
                  {@render toggleButton('data-recipe-visibility-destroy', 'FABRICATE.Admin.Manager.System.RecipeVisibility.ItemDestroyWhenExhausted', 'Delete when exhausted', destroyWhenExhausted, (next) => onSave({ destroyWhenExhausted: next }), !limitUses)}
                </div>
              </div>
              <div class="manager-recipe-visibility-item-cell" class:is-disabled={!limitUses} data-recipe-visibility-max-uses-row>
                <span class="manager-recipe-visibility-nested-label">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.ItemMaxUses', 'Maximum uses')}</span>
                <div class="manager-recipe-visibility-stepper" data-recipe-visibility-max-uses>
                  <button type="button" class="manager-icon-button" disabled={!limitUses} aria-label={text('FABRICATE.Admin.Manager.System.RecipeVisibility.MaxUsesDecrease', 'Decrease maximum uses')} onclick={() => adjustMaxUses(-1)}><i class="fas fa-minus" aria-hidden="true"></i></button>
                  <input type="number" min="1" step="1" value={maxUses} disabled={!limitUses} aria-label={text('FABRICATE.Admin.Manager.System.RecipeVisibility.ItemMaxUses', 'Maximum uses')} oninput={(event) => onSave({ maxUses: Math.max(1, Number(event.target.value || 1)) })} />
                  <button type="button" class="manager-icon-button" disabled={!limitUses} aria-label={text('FABRICATE.Admin.Manager.System.RecipeVisibility.MaxUsesIncrease', 'Increase maximum uses')} onclick={() => adjustMaxUses(1)}><i class="fas fa-plus" aria-hidden="true"></i></button>
                </div>
              </div>
            </div>
          </div>
        {/if}

        {#if showLearnOptions}
          <!-- Recipe learn limit (issue 511): built on the item Limited-uses card
               structure so the card never resizes — the Max-recipes stepper and
               Destroy-when-spent toggle stay visible but faded + disabled until
               the cap is enabled. It occupies the grid slot the ConsumeOnLearn
               tile vacates while the cap is on. -->
          <div class="manager-resolution-mode-card manager-recipe-visibility-subcard manager-recipe-visibility-item-card">
            <span class="manager-resolution-mode-legend">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.LearnLimitRecipes', 'Limited recipes learned per item')}</span>
            <p class="manager-recipe-visibility-subcard-desc">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.LearnLimitRecipesHint', 'Cap how many recipes a player can learn from one recipe item.')}</p>
            <div class="manager-recipe-visibility-item-controls">
              <div class="manager-recipe-visibility-item-toggle-row">
                <div class="manager-recipe-visibility-item-cell">
                  <span class="manager-recipe-visibility-nested-label">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.LearnLimitRecipesToggle', 'Enabled')}</span>
                  {@render toggleButton('data-recipe-visibility-limit-recipes', 'FABRICATE.Admin.Manager.System.RecipeVisibility.LearnLimitRecipes', 'Limited recipes learned per item', limitRecipes, setLimitRecipes, false)}
                </div>
                <div class="manager-recipe-visibility-item-cell" class:is-disabled={!limitRecipes}>
                  <span class="manager-recipe-visibility-nested-label">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.DestroyWhenSpent', 'Delete when spent')}</span>
                  {@render toggleButton('data-recipe-visibility-destroy-spent', 'FABRICATE.Admin.Manager.System.RecipeVisibility.DestroyWhenSpent', 'Delete when spent', destroyWhenSpent, (next) => onSave({ destroyWhenSpent: next }), !limitRecipes)}
                </div>
              </div>
              <div class="manager-recipe-visibility-item-cell" class:is-disabled={!limitRecipes} data-recipe-visibility-max-recipes-row>
                <span class="manager-recipe-visibility-nested-label">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.MaxRecipes', 'Maximum recipes')}</span>
                <div class="manager-recipe-visibility-stepper" data-recipe-visibility-max-recipes>
                  <button type="button" class="manager-icon-button" disabled={!limitRecipes} aria-label={text('FABRICATE.Admin.Manager.System.RecipeVisibility.MaxRecipesDecrease', 'Decrease maximum recipes')} onclick={() => adjustMaxRecipes(-1)}><i class="fas fa-minus" aria-hidden="true"></i></button>
                  <input type="number" min="1" step="1" value={maxRecipes} disabled={!limitRecipes} aria-label={text('FABRICATE.Admin.Manager.System.RecipeVisibility.MaxRecipes', 'Maximum recipes')} oninput={(event) => onSave({ maxRecipes: Math.max(1, Number(event.target.value || 1)) })} />
                  <button type="button" class="manager-icon-button" disabled={!limitRecipes} aria-label={text('FABRICATE.Admin.Manager.System.RecipeVisibility.MaxRecipesIncrease', 'Increase maximum recipes')} onclick={() => adjustMaxRecipes(1)}><i class="fas fa-plus" aria-hidden="true"></i></button>
                </div>
              </div>
            </div>
          </div>

          <!-- Consume-on-learn is incompatible with a multi-learn cap (it would
               delete the book on the first learn), so it is hidden while the cap
               is on — Destroy-when-spent replaces it. -->
          {#if !limitRecipes}
            {@render toggleCard('data-recipe-visibility-consume-on-learn', 'FABRICATE.Admin.Manager.System.RecipeVisibility.ConsumeOnLearn', 'Consume item on learn', 'FABRICATE.Admin.Manager.System.RecipeVisibility.ConsumeOnLearnHint', 'Delete the recipe item when a player learns it.', consumeOnLearn, (next) => onSave({ consumeOnLearn: next }))}
          {/if}

          {@render toggleCard('data-recipe-visibility-drag-drop', 'FABRICATE.Admin.Manager.System.RecipeVisibility.DragDropEnabled', 'Learn recipes from actor item drops', 'FABRICATE.Admin.Manager.System.RecipeVisibility.DragDropEnabledHint', 'Dropping the item on an actor learns the recipe.', dragDropEnabled, (next) => onSave({ dragDropEnabled: next }))}
        {/if}
      </div>
    {/if}
  {/if}
</section>
