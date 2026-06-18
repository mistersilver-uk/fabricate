<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { dragDrop } from '../../actions/dragDrop.js';
  import { resolveDropData } from '../../util/dropUtils.js';

  let {
    recipe = null,
    recipeItemDefinitions = [],
    knowledgeMode = 'itemOrLearned',
    saving = false,
    onBack = () => {},
    onSave = () => {},
    onDirtyChange = () => {},
    onDraftChange = () => {},
    onPickImagePath = null,
    onAddRecipeItem = () => {},
    onSetRecipeItem = () => {},
    onOpenItem = () => {},
    onCopyItemUuid = () => {}
  } = $props();

  const DEFAULT_RECIPE_IMAGE = 'icons/svg/item-bag.svg';

  let draftId = $state('');
  let name = $state('');
  let description = $state('');
  let img = $state('');
  let enabled = $state(true);
  let recipeItemId = $state('');
  let lastRecipeId = $state(null);
  let lastDirty = $state(false);
  let lastDraftSignature = $state('');
  let saveFailed = $state(false);

  // The recipe-item card is shown only when the system's knowledge mode
  // consumes an item; it is hidden (central column full-width) for 'learned'.
  const showLinkedItemCard = $derived(knowledgeMode === 'item' || knowledgeMode === 'itemOrLearned');

  const validName = $derived(Boolean(name.trim()));
  const dirty = $derived(isDirty());
  const draftSummary = $derived(buildDraftSummary());
  const draftSignature = $derived([
    draftSummary.id,
    draftSummary.name,
    draftSummary.description,
    draftSummary.img,
    draftSummary.enabled ? 'on' : 'off',
    draftSummary.recipeItemId,
    draftSummary.dirty ? 'dirty' : 'clean',
    draftSummary.validName ? 'valid' : 'invalid'
  ].join(''));

  // Resolve the linked recipe-item definition from the projected definitions.
  const linkedDefinition = $derived(recipeItemId
    ? (recipeItemDefinitions || []).find(def => def.id === recipeItemId) || null
    : null);
  const linkedSourceUuid = $derived(String(linkedDefinition?.sourceItemUuid || ''));

  // Resolve the underlying item document for "open" + missing-state, mirroring
  // EnvironmentSummaryInspector: a cancelled guard, re-resolved when the recipe
  // id / recipeItemId changes so the thumb never goes stale.
  let resolvedItemName = $state('');
  let resolvedItemImg = $state('');
  let resolvedItemMissing = $state(false);
  $effect(() => {
    const uuid = linkedSourceUuid;
    // Re-run when the recipe changes too, even if uuid is stable.
    void draftId;
    resolvedItemName = '';
    resolvedItemImg = '';
    resolvedItemMissing = false;
    if (!recipeItemId) return;
    if (!uuid || typeof globalThis.fromUuid !== 'function') {
      resolvedItemMissing = Boolean(recipeItemId && linkedDefinition && !uuid);
      return;
    }
    let cancelled = false;
    Promise.resolve(globalThis.fromUuid(uuid)).then(doc => {
      if (cancelled) return;
      if (!doc) {
        resolvedItemMissing = true;
        return;
      }
      resolvedItemName = String(doc.name || '');
      resolvedItemImg = String(doc.img || '');
    }).catch(() => {
      if (!cancelled) resolvedItemMissing = true;
    });
    return () => { cancelled = true; };
  });

  const linkedItemName = $derived(resolvedItemName || linkedDefinition?.name || linkedSourceUuid);
  const linkedItemImg = $derived(resolvedItemImg || linkedDefinition?.img || DEFAULT_RECIPE_IMAGE);

  $effect(() => {
    const nextRecipeId = recipe?.id || '__none__';
    if (nextRecipeId === lastRecipeId) return;
    draftId = recipe?.id || '';
    name = recipe?.name || '';
    description = recipe?.description || '';
    img = recipe?.img || '';
    enabled = recipe?.enabled !== false;
    recipeItemId = recipe?.recipeItemId || '';
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
      enabled,
      recipeItemId: recipeItemId || null
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
      recipeItemId,
      dirty,
      validName
    };
  }

  function isDirty() {
    if (!recipe) return false;
    return name !== (recipe.name || '')
      || description !== (recipe.description || '')
      || img !== (recipe.img || '')
      || enabled !== (recipe.enabled !== false)
      || recipeItemId !== (recipe.recipeItemId || '');
  }

  async function chooseImage() {
    if (typeof onPickImagePath !== 'function') return;
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

  // Drop a Foundry Item to link/replace it. Item-only: an unpersisted item drop
  // carries { type: 'Item' } with no uuid and is a no-op.
  async function handleItemDrop(data) {
    const { uuid, type } = resolveDropData(data);
    if (type !== 'Item' || !uuid) return;
    const result = await onAddRecipeItem(uuid);
    const linkedId = result?.item?.id;
    if (!linkedId) return;
    recipeItemId = linkedId;
    onSetRecipeItem(linkedId);
  }

  function unlinkItem() {
    recipeItemId = '';
    onSetRecipeItem(null);
  }

  function onLinkedItemMouseDown(event) {
    if (event.button !== 2) return;
    event.preventDefault();
    unlinkItem();
  }

  function openItem() {
    if (linkedSourceUuid) onOpenItem(linkedSourceUuid);
  }

  function copyItemUuid() {
    if (linkedSourceUuid) onCopyItemUuid(linkedSourceUuid);
  }
</script>

<main class="manager-main manager-recipe-edit-main" aria-label={text('FABRICATE.Admin.Manager.Recipe.EditTitle', 'Edit recipe')}>
  {#if recipe}
    <form
      id="manager-recipe-edit-form"
      class="manager-recipe-workspace"
      class:is-inspector-hidden={!showLinkedItemCard}
      onsubmit={handleSave}
    >
      <div class="manager-recipe-edit-panel">
        <section class="manager-task-core-card" data-recipe-section="identity">
          <div class="manager-task-card-heading">
            <div>
              <h3>{text('FABRICATE.Admin.Manager.Recipe.Identity', 'Identity')}</h3>
              <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.IdentityHint', 'Name the recipe, describe it, choose an image, and toggle whether it is active.')}</p>
            </div>
          </div>
          <div class="manager-task-core-grid">
            <div class="manager-task-media-column">
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
      </div>

      {#if showLinkedItemCard}
        <aside class="manager-recipe-inspector">
          <section class="manager-inspector-card" data-recipe-section="recipe-item">
            <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Recipe.RecipeItem', 'Recipe item')}</h3>
            {#if recipeItemId}
              <!-- Drop-to-replace and right-click-to-unlink are enhancements; the visible
                   Open/Unlink buttons inside provide the accessible path. -->
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
              <div
                class="manager-environment-scene-linked"
                data-recipe-item-linked
                role="group"
                aria-label={text('FABRICATE.Admin.Manager.Recipe.RecipeItem', 'Recipe item')}
                title={text('FABRICATE.Admin.Manager.Recipe.RecipeItemReplaceHint', 'Drop an item to replace it, or right-click to unlink.')}
                use:dragDrop={{ onDrop: handleItemDrop, activeClass: 'is-drop-active' }}
                oncontextmenu={(event) => { event.preventDefault(); unlinkItem(); }}
                onmousedown={onLinkedItemMouseDown}
              >
                {#if resolvedItemMissing}
                  <span class="manager-environment-scene-thumb is-placeholder" aria-hidden="true"><i class="fas fa-suitcase"></i></span>
                {:else}
                  <img class="manager-environment-scene-thumb" src={linkedItemImg} alt="" />
                {/if}
                {#if resolvedItemMissing}
                  <span class="manager-environment-scene-name manager-muted" data-recipe-item-missing>{text('FABRICATE.Admin.Manager.Recipe.RecipeItemMissing', 'Recipe item unresolved')}</span>
                {:else}
                  <button type="button" class="manager-environment-scene-name" onclick={(event) => { event.stopPropagation(); openItem(); }} title={text('FABRICATE.Admin.Manager.Recipe.OpenItem', 'Open item')}>{linkedItemName}</button>
                {/if}
                <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.Recipe.CopyItemUuid', 'Copy item UUID')} title={text('FABRICATE.Admin.Manager.Recipe.CopyItemUuid', 'Copy item UUID')} disabled={!linkedSourceUuid} onclick={(event) => { event.stopPropagation(); copyItemUuid(); }}><i class="fas fa-copy" aria-hidden="true"></i></button>
                <button type="button" class="manager-icon-button is-danger" aria-label={text('FABRICATE.Admin.Manager.Recipe.UnlinkItem', 'Unlink recipe item')} title={text('FABRICATE.Admin.Manager.Recipe.UnlinkItem', 'Unlink recipe item')} onclick={(event) => { event.stopPropagation(); unlinkItem(); }}><i class="fas fa-link-slash" aria-hidden="true"></i></button>
              </div>
            {:else}
              <div class="manager-environment-scene-dropzone" data-recipe-item-dropzone use:dragDrop={{ onDrop: handleItemDrop, activeClass: 'is-drop-active' }}>
                <i class="fas fa-box" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.Recipe.RecipeItemDropHint', 'Drag an item here to link it.')}</span>
              </div>
            {/if}
          </section>
        </aside>
      {/if}
    </form>
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
