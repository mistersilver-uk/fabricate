<!-- Svelte 5 runes mode -->
<!--
  Overview tab for the recipe editor: identity (name, description, image picker,
  enabled toggle) and — for multi-step recipes — the Steps card, the single surface
  where step order and identity (name/description) are set. Identity is fully
  controlled: values come from the staged `recipe` draft and edits emit
  `onUpdateRecipe(...)` patches; the enabled toggle is the immediate exception and
  emits `onToggleEnabled()`. A step's ingredients, results, and tools are authored
  on their own tabs.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { DEFAULT_RECIPE_IMAGE } from '../../../util/recipeImageIcons.js';
  import RecipeStepsCard from '../RecipeStepsCard.svelte';

  let {
    recipe = null,
    name = '',
    description = '',
    img = '',
    enabled = true,
    saving = false,
    saveFailed = false,
    isRecipeItemLinked = false,
    linkedItemImage = '',
    onPickImagePath = null,
    onNameInput = () => {},
    onDescriptionInput = () => {},
    onToggleEnabled = () => {},
    onChooseImage = () => {},
    isMultiStep = false,
    currencyUnits = [],
    onAddStep = () => {},
    onReorderSteps = () => {},
    onUpdateStep = () => {},
    onDeleteStep = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function recipeImage(value) {
    return value || DEFAULT_RECIPE_IMAGE;
  }
</script>

<section class="manager-recipe-tab manager-recipe-overview" data-recipe-tab="overview" aria-label={text('FABRICATE.Admin.Manager.Recipe.Tabs.Overview', 'Overview')}>
  <section class="manager-task-core-card" data-recipe-section="identity">
    <div class="manager-task-card-heading">
      <div>
        <h3>{text('FABRICATE.Admin.Manager.Recipe.Identity', 'Identity')}</h3>
        <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.IdentityHint', 'Name the recipe, describe it, choose an image, and toggle whether it is active.')}</p>
      </div>
    </div>
    <div class="manager-task-core-grid">
      <div class="manager-task-media-column">
        {#if isRecipeItemLinked}
          <span
            class="manager-task-image-picker is-recipe-item-linked"
            data-recipe-item-locked-image
            title={text('FABRICATE.Admin.Manager.Recipe.RecipeItemLockedImageTooltip', "This image comes from the linked recipe item and can't be edited. Unlink the recipe item to choose a custom image.")}
            aria-label={text('FABRICATE.Admin.Manager.Recipe.RecipeItemLockedImage', 'Image provided by the linked recipe item')}
          >
            <img src={linkedItemImage || recipeImage(img)} alt="" />
            <i class="fas fa-lock" aria-hidden="true"></i>
          </span>
        {:else}
          <button
            type="button"
            class="manager-task-image-picker"
            data-recipe-field="img"
            aria-label={text('FABRICATE.Admin.Manager.Recipe.ChooseImage', 'Choose recipe image')}
            onclick={onChooseImage}
            disabled={typeof onPickImagePath !== 'function' || saving}
          >
            <img src={recipeImage(img)} alt="" />
            <i class="fas fa-pen" aria-hidden="true"></i>
          </button>
        {/if}
        <div class="manager-task-core-status">
          <button
            type="button"
            class={`manager-status-toggle ${enabled ? 'is-on' : 'is-off'}`}
            data-recipe-field="enabled"
            aria-pressed={enabled}
            disabled={saving}
            onclick={onToggleEnabled}
          >
            <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
            <span class="manager-status-toggle-label">{enabled ? text('FABRICATE.Admin.Manager.StatusOn', 'On') : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}</span>
          </button>
          <p class="manager-muted">{enabled
            ? text('FABRICATE.Admin.Manager.Recipe.EnabledHint', 'Available to players while on.')
            : text('FABRICATE.Admin.Manager.Recipe.DisabledHint', 'Hidden from players while off.')}</p>
        </div>
      </div>
      <div class="manager-task-identity-fields">
        <label class="manager-field" for="manager-recipe-edit-name">
          <span>{text('FABRICATE.Admin.Manager.Recipe.Name', 'Name')}</span>
          <input id="manager-recipe-edit-name" data-recipe-field="name" type="text" value={name} oninput={(event) => onNameInput(event.currentTarget.value)} disabled={saving} required />
        </label>
        <label class="manager-field" for="manager-recipe-edit-description">
          <span>{text('FABRICATE.Admin.Manager.Recipe.Description', 'Description')}</span>
          <textarea id="manager-recipe-edit-description" data-recipe-field="description" value={description} oninput={(event) => onDescriptionInput(event.currentTarget.value)} disabled={saving}></textarea>
        </label>
      </div>
    </div>
    {#if saveFailed}
      <p class="manager-muted manager-form-warning">{text('FABRICATE.Admin.Manager.Recipe.SaveFailed', 'Save failed. Check for duplicate or blank names and try again.')}</p>
    {/if}
  </section>

  {#if isMultiStep}
    <RecipeStepsCard
      steps={recipe?.steps || []}
      {currencyUnits}
      {onAddStep}
      {onReorderSteps}
      {onUpdateStep}
      {onDeleteStep}
    />
  {/if}
</section>
