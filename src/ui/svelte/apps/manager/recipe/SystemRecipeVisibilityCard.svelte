<!-- Svelte 5 runes mode -->
<!--
  System-level Recipe Visibility card. A standalone card (mirroring how
  ResolutionModeCard is a self-contained system-settings card) that lets a GM
  choose how recipes are exposed to players: Global (all visible), Player-specific
  (per-recipe restrictions authored in each recipe's editor), or Knowledge-based
  (item and/or learning gated). Teaser mode is intentionally out of scope here.

  This card carries the system-wide visibility STRATEGY only: list mode, knowledge
  mode, and whether dropping a recipe item on an actor learns its recipes. The
  per-recipe-item use/learn caps that used to nest here moved to the recipe item
  definitions (issue 511) and are authored per item on the Books & Scrolls page.

  The card is CONTROLLED and live-applies each control: every handler passes ONLY
  its own field to `onSave(patch)`. The admin store's object-form
  `saveVisibilityConfig` merges every omitted field from the system's existing
  `recipeVisibility`, so partial patches are safe.

  Props:
   - recipeVisibility: the system's `{ listMode, knowledge: { mode, learn: { dragDropEnabled } } }`.
   - showKnowledgeOptions: true when listMode === 'knowledge' (knowledge mode select).
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
  // Per-recipe-item use/learn caps moved to the recipe item definitions (issue
  // 511, edited on the Books & Scrolls per-item page); this card now carries only
  // the system-wide visibility STRATEGY: list mode, knowledge mode, and whether
  // dropping a recipe item on an actor learns its recipes.
  const dragDropEnabled = $derived(knowledge?.learn?.dragDropEnabled !== false);
  // The drag-drop learning toggle applies when learning can gate visibility.
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

    {#if showLearnOptions}
      <!-- Per-item use/learn caps are now authored per recipe item on Books &
           Scrolls; only the system-wide drag-drop learning switch remains here. -->
      <div class="manager-recipe-visibility-grid">
        {@render toggleCard('data-recipe-visibility-drag-drop', 'FABRICATE.Admin.Manager.System.RecipeVisibility.DragDropEnabled', 'Learn recipes from actor item drops', 'FABRICATE.Admin.Manager.System.RecipeVisibility.DragDropEnabledHint', 'Dropping the item on an actor learns the recipe.', dragDropEnabled, (next) => onSave({ dragDropEnabled: next }))}
      </div>
    {/if}
  {/if}
</section>
