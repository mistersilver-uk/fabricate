<!-- Svelte 5 runes mode -->
<!--
  System-level Recipe Visibility card. A standalone card (mirroring how
  ResolutionModeCard is a self-contained system-settings card) that lets a GM
  choose how recipes are exposed to players: Global (all visible), Player-specific
  (per-recipe restrictions authored in each recipe's editor), or Knowledge-based
  (item and/or learning gated). Teaser mode is intentionally out of scope here.

  Each control is its own sub-card (reusing the `manager-resolution-mode-card`
  frame) laid out in a responsive 3-column grid rather than one full-width stack.

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

  // The item sub-cards apply when the recipe item can gate visibility.
  const showItemOptions = $derived(knowledgeMode === 'item' || knowledgeMode === 'itemOrLearned');
  // The learn sub-cards apply when learning can gate visibility.
  const showLearnOptions = $derived(knowledgeMode === 'learned' || knowledgeMode === 'itemOrLearned');

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
</script>

<!-- The On/Off pill itself. `onToggle(next)` lets the limit-uses toggle commit a
     cap alongside the flag while the rest pass a plain single-field patch. -->
{#snippet toggleButton(dataField, ariaKey, ariaFallback, on, onToggle)}
  <button
    type="button"
    class={`manager-status-toggle ${on ? 'is-on' : 'is-off'}`}
    aria-pressed={on}
    aria-label={text(ariaKey, ariaFallback)}
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
     nothing further). -->
{#snippet toggleCard(dataField, labelKey, labelFallback, descKey, descFallback, on, onToggle)}
  <div class="manager-resolution-mode-card manager-recipe-visibility-subcard">
    <span class="manager-resolution-mode-legend">{text(labelKey, labelFallback)}</span>
    <p class="manager-recipe-visibility-subcard-desc">{text(descKey, descFallback)}</p>
    <div class="manager-recipe-visibility-control">
      {@render toggleButton(dataField, labelKey, labelFallback, on, onToggle)}
    </div>
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

  <div class="manager-recipe-visibility-grid">
    <div class="manager-resolution-mode-card manager-recipe-visibility-subcard">
      <span class="manager-resolution-mode-legend">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.ListModeLabel', 'List mode')}</span>
      <p class="manager-recipe-visibility-subcard-desc">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.ListModeHint', 'How recipes are exposed to players.')}</p>
      <div class="manager-recipe-visibility-control">
        <select
          data-recipe-visibility-list-mode
          aria-label={text('FABRICATE.Admin.Manager.System.RecipeVisibility.ListModeLabel', 'List mode')}
          value={listMode}
          onchange={(event) => onSave({ listMode: event.target.value })}
        >
          <option value="global">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.Global', 'Global (all recipes visible to all)')}</option>
          <option value="player">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.PlayerSpecific', 'Player-specific (per-recipe restrictions)')}</option>
          <option value="knowledge">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.KnowledgeBased', 'Knowledge-based (item or learning)')}</option>
        </select>
      </div>
    </div>

    {#if listMode === 'player'}
      <div class="manager-resolution-mode-card manager-recipe-visibility-subcard is-span-all" data-recipe-visibility-player-note>
        <span class="manager-resolution-mode-legend">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.PlayerSpecific', 'Player-specific (per-recipe restrictions)')}</span>
        <p class="manager-recipe-visibility-subcard-desc">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.PlayerNote', "Per-recipe visibility restrictions can be configured in each recipe's editor. Restricted recipes are hidden from all players by default unless specific users are allowed.")}</p>
      </div>
    {/if}

    {#if showKnowledgeOptions}
      <div class="manager-resolution-mode-card manager-recipe-visibility-subcard" data-recipe-visibility-knowledge>
        <span class="manager-resolution-mode-legend">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.KnowledgeBased', 'Knowledge-based (item or learning)')}</span>
        <p class="manager-recipe-visibility-subcard-desc">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.KnowledgeModeHint', 'How players gain access to a recipe.')}</p>
        <div class="manager-recipe-visibility-control">
          <select
            data-recipe-visibility-knowledge-mode
            aria-label={text('FABRICATE.Admin.Manager.System.RecipeVisibility.KnowledgeBased', 'Knowledge-based (item or learning)')}
            value={knowledgeMode}
            onchange={(event) => onSave({ knowledgeMode: event.target.value })}
          >
            <option value="item">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.KnowledgeByItem', 'By item (must have recipe item)')}</option>
            <option value="learned">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.KnowledgeByLearning', 'By learning (must have learnt recipe)')}</option>
            <option value="itemOrLearned">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.KnowledgeByEither', 'Item or learning (either method)')}</option>
          </select>
        </div>
      </div>

      {#if showItemOptions}
        <div class="manager-resolution-mode-card manager-recipe-visibility-subcard">
          <span class="manager-resolution-mode-legend">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.ItemLimitUses', 'Limited uses of recipe items')}</span>
          <p class="manager-recipe-visibility-subcard-desc">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.ItemLimitUsesHint', 'Cap how many times a recipe item grants access.')}</p>
          <div class="manager-recipe-visibility-control">
            {@render toggleButton('data-recipe-visibility-limit-uses', 'FABRICATE.Admin.Manager.System.RecipeVisibility.ItemLimitUses', 'Limited uses of recipe items', limitUses, setLimitUses)}
          </div>

          {#if limitUses}
            <div class="manager-recipe-visibility-nested">
              <div class="manager-recipe-visibility-nested-field" data-recipe-visibility-max-uses-row>
                <span class="manager-recipe-visibility-nested-label">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.ItemMaxUses', 'Maximum uses')}</span>
                <div class="manager-recipe-visibility-stepper" data-recipe-visibility-max-uses>
                  <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.System.RecipeVisibility.MaxUsesDecrease', 'Decrease maximum uses')} onclick={() => adjustMaxUses(-1)}><i class="fas fa-minus" aria-hidden="true"></i></button>
                  <input type="number" min="1" step="1" value={maxUses} aria-label={text('FABRICATE.Admin.Manager.System.RecipeVisibility.ItemMaxUses', 'Maximum uses')} oninput={(event) => onSave({ maxUses: Math.max(1, Number(event.target.value || 1)) })} />
                  <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.System.RecipeVisibility.MaxUsesIncrease', 'Increase maximum uses')} onclick={() => adjustMaxUses(1)}><i class="fas fa-plus" aria-hidden="true"></i></button>
                </div>
              </div>
              <div class="manager-recipe-visibility-nested-field">
                <span class="manager-recipe-visibility-nested-label">{text('FABRICATE.Admin.Manager.System.RecipeVisibility.ItemDestroyWhenExhausted', 'Delete exhausted recipe item')}</span>
                {@render toggleButton('data-recipe-visibility-destroy', 'FABRICATE.Admin.Manager.System.RecipeVisibility.ItemDestroyWhenExhausted', 'Delete exhausted recipe item', destroyWhenExhausted, (next) => onSave({ destroyWhenExhausted: next }))}
              </div>
            </div>
          {/if}
        </div>
      {/if}

      {#if showLearnOptions}
        {@render toggleCard('data-recipe-visibility-consume-on-learn', 'FABRICATE.Admin.Manager.System.RecipeVisibility.ConsumeOnLearn', 'Consume item on learn', 'FABRICATE.Admin.Manager.System.RecipeVisibility.ConsumeOnLearnHint', 'Delete the recipe item when a player learns it.', consumeOnLearn, (next) => onSave({ consumeOnLearn: next }))}

        {@render toggleCard('data-recipe-visibility-drag-drop', 'FABRICATE.Admin.Manager.System.RecipeVisibility.DragDropEnabled', 'Learn recipes from actor item drops', 'FABRICATE.Admin.Manager.System.RecipeVisibility.DragDropEnabledHint', 'Dropping the item on an actor learns the recipe.', dragDropEnabled, (next) => onSave({ dragDropEnabled: next }))}
      {/if}
    {/if}
  </div>
</section>
