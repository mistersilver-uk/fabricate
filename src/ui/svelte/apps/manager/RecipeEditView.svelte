<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { DEFAULT_RECIPE_IMAGE } from '../../util/recipeImageIcons.js';
  import RecipeStepsCard from './RecipeStepsCard.svelte';

  let {
    recipe = null,
    saving = false,
    onBack = () => {},
    onSave = () => {},
    onDirtyChange = () => {},
    onDraftChange = () => {},
    onPickImagePath = null,
    linkedItemImage = '',
    currencyUnits = [],
    onAddStep = () => {},
    onReorderSteps = () => {},
    onUpdateStep = () => {},
    onDeleteStep = () => {}
  } = $props();

  // A recipe is multi-step when it carries an explicit steps array; the steps card
  // is shown only then (the right-inspector toggle controls entering/leaving the mode).
  const isMultiStep = $derived((recipe?.steps?.length ?? 0) >= 1);

  // When a recipe item is linked, the identity image mirrors the linked item's
  // image and the picker is locked — exactly like the environment editor locks
  // its image to a linked scene.
  const isRecipeItemLinked = $derived(Boolean(recipe?.recipeItemId));

  let draftId = $state('');
  let name = $state('');
  let description = $state('');
  let img = $state('');
  let enabled = $state(true);
  let lastRecipeId = $state(null);
  let lastDirty = $state(false);
  let lastDraftSignature = $state('');
  let saveFailed = $state(false);

  const validName = $derived(Boolean(name.trim()));
  const dirty = $derived(isDirty());
  const draftSummary = $derived(buildDraftSummary());
  const draftSignature = $derived([
    draftSummary.id,
    draftSummary.name,
    draftSummary.description,
    draftSummary.img,
    draftSummary.enabled ? 'on' : 'off',
    draftSummary.dirty ? 'dirty' : 'clean',
    draftSummary.validName ? 'valid' : 'invalid'
  ].join(''));

  $effect(() => {
    const nextRecipeId = recipe?.id || '__none__';
    if (nextRecipeId === lastRecipeId) return;
    draftId = recipe?.id || '';
    name = recipe?.name || '';
    description = recipe?.description || '';
    img = recipe?.img || '';
    enabled = recipe?.enabled !== false;
    saveFailed = false;
    lastRecipeId = nextRecipeId;
  });

  $effect(() => {
    if (dirty === lastDirty) return;
    lastDirty = dirty;
    onDirtyChange(dirty);
  });

  $effect(() => {
    if (draftSignature === lastDraftSignature) return;
    lastDraftSignature = draftSignature;
    onDraftChange(draftSummary);
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function recipeImage(value) {
    return value || DEFAULT_RECIPE_IMAGE;
  }

  function buildUpdates() {
    return {
      name: name.trim(),
      description,
      img,
      enabled
    };
  }

  function buildDraftSummary() {
    return {
      id: draftId || '',
      updates: buildUpdates(),
      name: name.trim(),
      description,
      img,
      enabled,
      dirty,
      validName
    };
  }

  function isDirty() {
    if (!recipe) return false;
    return name !== (recipe.name || '')
      || description !== (recipe.description || '')
      || img !== (recipe.img || '')
      || enabled !== (recipe.enabled !== false);
  }

  async function chooseImage() {
    if (typeof onPickImagePath !== 'function' || isRecipeItemLinked) return;
    const value = await onPickImagePath(img || DEFAULT_RECIPE_IMAGE);
    if (value) img = value;
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!validName || saving) return;
    saveFailed = false;
    let result = false;
    try {
      result = await onSave(draftId || null, buildUpdates());
    } catch (err) {
      result = false;
    }
    if (result === false) saveFailed = true;
  }
</script>

<main class="manager-main manager-recipe-edit-main" aria-label={text('FABRICATE.Admin.Manager.Recipe.EditTitle', 'Edit recipe')}>
  {#if recipe}
    <form id="manager-recipe-edit-form" onsubmit={handleSave}>
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
                onclick={chooseImage}
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
                onclick={() => { enabled = !enabled; }}
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
              <input id="manager-recipe-edit-name" data-recipe-field="name" type="text" value={name} oninput={(event) => name = event.currentTarget.value} disabled={saving} required />
            </label>
            <label class="manager-field" for="manager-recipe-edit-description">
              <span>{text('FABRICATE.Admin.Manager.Recipe.Description', 'Description')}</span>
              <textarea id="manager-recipe-edit-description" data-recipe-field="description" value={description} oninput={(event) => description = event.currentTarget.value} disabled={saving}></textarea>
            </label>
          </div>
        </div>
        {#if saveFailed}
          <p class="manager-muted manager-form-warning">{text('FABRICATE.Admin.Manager.Recipe.SaveFailed', 'Save failed. Check for duplicate or blank names and try again.')}</p>
        {/if}
      </section>
    </form>
    {#if isMultiStep}
      <RecipeStepsCard
        steps={recipe.steps || []}
        {currencyUnits}
        {onAddStep}
        {onReorderSteps}
        {onUpdateStep}
        {onDeleteStep}
      />
    {/if}
  {:else}
    <div class="manager-empty">
      <div>
        <i class="fas fa-scroll" aria-hidden="true"></i>
        <h3>{text('FABRICATE.Admin.Manager.Recipe.SelectRecipe', 'Select a recipe')}</h3>
        <p>{text('FABRICATE.Admin.Manager.Recipe.EditMissingHint', 'Pick a recipe from the browser to open its editor.')}</p>
      </div>
    </div>
  {/if}
</main>
