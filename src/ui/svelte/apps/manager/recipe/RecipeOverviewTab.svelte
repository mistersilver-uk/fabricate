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
  import RecipeDurationEditor from './RecipeDurationEditor.svelte';

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
    // True when an enable-blocking validation issue is present while the recipe is
    // OFF: the enable toggle is disabled so the GM cannot trigger the hard activation
    // failure (issue 549). The Validation tab lists the reasons.
    enableBlocked = false,
    onChooseImage = () => {},
    isMultiStep = false,
    checkTierOptions = [],
    // Success outcome tiers of a fixed-type routed check, ranked low→high. Non-empty
    // only for a routed+fixed system, so the "Minimum success tier" control below
    // auto-hides everywhere else.
    minSuccessTierOptions = [],
    // `recipe.locked` — persisted, engine-honoured (`guardCraftStart` refuses a
    // locked craft) and, until issue 643, written by NOTHING in the UI. Its write
    // path is never gated, unlike enable: a GM locks a recipe precisely while it is
    // unfinished.
    locked = false,
    onToggleLocked = () => {},
    onUpdateRecipe = () => {},
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
            disabled={saving || enableBlocked}
            title={enableBlocked ? text('FABRICATE.Admin.Manager.Recipe.EnableBlockedTooltip', 'Resolve the issues on the Validation tab before enabling this recipe.') : undefined}
            onclick={onToggleEnabled}
          >
            <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
            <span class="manager-status-toggle-label">{enabled ? text('FABRICATE.Admin.Manager.StatusOn', 'On') : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}</span>
          </button>
          <p class="manager-muted">{enableBlocked
            ? text('FABRICATE.Admin.Manager.Recipe.EnableBlockedHint', 'Resolve the issues on the Validation tab before enabling.')
            : enabled
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
        {#if checkTierOptions.length > 0}
          <label class="manager-field" data-recipe-check-tier>
            <span>{text('FABRICATE.Admin.Manager.Recipe.CheckTier', 'Check tier')}</span>
            <select
              data-recipe-field="checkTierId"
              value={recipe?.checkTierId || ''}
              onchange={(event) => onUpdateRecipe({ checkTierId: event.currentTarget.value || null })}
              disabled={saving}
            >
              <option value="">{text('FABRICATE.Admin.Manager.Recipe.CheckTierDefault', 'Default DC')}</option>
              {#each checkTierOptions as tier (tier.id)}
                <option value={tier.id}>{(tier.name || text('FABRICATE.Admin.Manager.Recipe.CheckTierUnnamed', 'Unnamed tier')) + ` (DC ${tier.dc})`}</option>
              {/each}
            </select>
          </label>
        {/if}
        {#if minSuccessTierOptions.length > 0}
          <label class="manager-field" data-recipe-min-success-tier>
            <span>{text('FABRICATE.Admin.Manager.Recipe.MinSuccessTier', 'Minimum success tier')}</span>
            <select
              data-recipe-field="minSuccessOutcomeId"
              value={recipe?.minSuccessOutcomeId || ''}
              onchange={(event) => onUpdateRecipe({ minSuccessOutcomeId: event.currentTarget.value || null })}
              disabled={saving}
              aria-describedby="manager-recipe-min-success-tier-hint"
            >
              <option value="">{text('FABRICATE.Admin.Manager.Recipe.MinSuccessTierNone', 'No override (use rolled tier)')}</option>
              {#each minSuccessTierOptions as tier (tier.id)}
                <option value={tier.id}>{tier.name || text('FABRICATE.Admin.Manager.Recipe.CheckTierUnnamed', 'Unnamed tier')}</option>
              {/each}
            </select>
          </label>
          <p id="manager-recipe-min-success-tier-hint" class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.MinSuccessTierHint', 'Fail the craft outright when the roll lands below this tier.')}</p>
        {/if}
      </div>
    </div>
    {#if saveFailed}
      <p class="manager-muted manager-form-warning">{text('FABRICATE.Admin.Manager.Recipe.SaveFailed', 'Save failed. Check for duplicate or blank names and try again.')}</p>
    {/if}
  </section>

  <!-- The Locked status card. "Locked" is OVERLOADED on this tab: it already means
       "the image picker is locked because a recipe item is linked"
       (data-recipe-item-locked-image). This is a DIFFERENT concept — the recipe stays
       visible to players, but only a GM can craft it — so it gets its own i18n keys
       and its hooks stay out of the `…-locked-image` naming family. -->
  <section class="manager-task-core-card" data-recipe-section="locked-status">
    <div class="manager-task-card-heading">
      <div>
        <h3>{text('FABRICATE.Admin.Manager.Recipe.Locked.Title', 'Locked')}</h3>
        <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.Locked.Hint', 'A locked recipe stays visible to players, but only a GM can craft it.')}</p>
      </div>
    </div>
    <div class="manager-task-core-status">
      <button
        type="button"
        class={`manager-status-toggle ${locked ? 'is-on' : 'is-off'}`}
        data-recipe-field="locked"
        aria-pressed={locked}
        aria-label={text('FABRICATE.Admin.Manager.Recipe.Locked.Toggle', 'Lock this recipe')}
        disabled={saving}
        onclick={() => onToggleLocked(!locked)}
      >
        <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
        <span class="manager-status-toggle-label">{locked ? text('FABRICATE.Admin.Manager.StatusOn', 'On') : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}</span>
      </button>
      <p class="manager-muted" data-recipe-locked-state>{locked
        ? text('FABRICATE.Admin.Manager.Recipe.Locked.OnHint', 'Players can see this recipe but cannot craft it.')
        : text('FABRICATE.Admin.Manager.Recipe.Locked.OffHint', 'Players who can see this recipe can craft it.')}</p>
    </div>
  </section>

  {#if isMultiStep}
    <RecipeStepsCard
      steps={recipe?.steps || []}
      {onAddStep}
      {onReorderSteps}
      {onUpdateStep}
      {onDeleteStep}
    />
  {:else}
    <section class="manager-task-core-card" data-recipe-section="duration">
      <div class="manager-task-card-heading">
        <div>
          <h3>{text('FABRICATE.Admin.Manager.Recipe.Duration', 'Duration')}</h3>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.DurationHint', 'How long this recipe takes to craft. Leave blank for an instant craft.')}</p>
        </div>
      </div>
      <RecipeDurationEditor
        timeRequirement={recipe?.timeRequirement || null}
        disabled={saving}
        onChange={(next) => onUpdateRecipe({ timeRequirement: next })}
      />
    </section>
  {/if}
</section>
