<!-- Svelte 5 runes mode -->
<!--
  The page header's action group for the crafting family of routes: the recipe, component, essence
  and checks studios, in the order the shell's own ladder tested them (issue 1720).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `currentView` | the active route token | `''` | selects one branch; the caller renders this unit only for the crafting family |
  | `text` | the shell's localizer | — | `(key, fallback)` |

  Every other prop is one branch's own dirty, saving, validity or handler leg.

  Invariants:
  - Branch order is the shipped ladder's, pinned by `tests/manager-header-families.test.js`.
  - Each button role is a literal, because `manager-button-cascade-inventory.test.js` counts
    `role="primary"` and `role="ghost"` sites per file.
-->
<script>
  import Chip from '../../components/Chip.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import ComponentEditorHeader from './component/ComponentEditorHeader.svelte';

  let {
    text = () => '',
    currentView = '',
    isChecksRoute = false,
    createRecipe = () => {},
    selectedSystemId = '',
    recipeEditDirty = false,
    recipeEditSaving = false,
    recipeEditSaveLabel = () => '',
    canSaveRecipeEdit = false,
    selectedRecipeId = '',
    backToRecipesBrowse = () => {},
    deleteRecipeFromEdit = () => {},
    saveRecipeDraft = () => {},
    recipeItemDraft = null,
    recipeItemEditDirty = false,
    recipeItemEditSaving = false,
    recipeItemSaveFailed = false,
    canSaveRecipeItemEdit = false,
    backToBooksScrolls = () => {},
    deleteRecipeItemFromEdit = () => {},
    saveRecipeItemDraft = () => {},
    openComponentAddFromCatalogue = () => {},
    componentEditCombinedDirty = false,
    componentEditSaving = false,
    componentEditSaveLabel = () => '',
    canSaveComponentEdit = false,
    backToComponentsBrowse = () => {},
    checksDirty = false,
    checksSaving = false,
    saveChecks = () => {},
    essenceEditDirty = false,
    essenceEditSaving = false,
    essenceEditSaveLabel = () => '',
    canSaveEssenceEdit = false,
    cancelEssenceEdit = () => {},
  } = $props();
</script>

{#if currentView === 'recipes'}
  <ManagerButton role="primary" onclick={createRecipe} disabled={!selectedSystemId}>
    <i class="fas fa-plus" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Recipe.Create', 'Create recipe')}</span>
  </ManagerButton>
{:else if currentView === 'recipe-edit'}
  {#if recipeEditDirty}
    <Chip
      tone="warning"
      truncate
      density="action"
      title={text('FABRICATE.Admin.Manager.Recipe.Dirty', 'Unsaved')}
      >{text('FABRICATE.Admin.Manager.Recipe.Dirty', 'Unsaved')}</Chip
    >
  {/if}
  <ManagerButton role="ghost" onclick={backToRecipesBrowse} disabled={recipeEditSaving}>
    <i class="fas fa-arrow-left" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Recipe.BackToBrowse', 'Back to recipes')}</span>
  </ManagerButton>
  <ManagerButton
    role="danger"
    onclick={deleteRecipeFromEdit}
    disabled={!selectedRecipeId || recipeEditSaving}
    title={text('FABRICATE.Admin.Manager.Recipe.Delete', 'Delete recipe')}
  >
    <i class="fas fa-trash" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Recipe.Delete', 'Delete recipe')}</span>
  </ManagerButton>
  <ManagerButton role="primary" onclick={saveRecipeDraft} disabled={!canSaveRecipeEdit}>
    <i class={recipeEditSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i>
    <span>{recipeEditSaveLabel()}</span>
  </ManagerButton>
{:else if currentView === 'recipe-item-edit'}
  {#if recipeItemEditDirty}
    <Chip
      tone="warning"
      truncate
      density="action"
      data-recipe-item-dirty
      title={text('FABRICATE.Admin.Manager.RecipeItem.Dirty', 'Unsaved')}
      >{text('FABRICATE.Admin.Manager.RecipeItem.Dirty', 'Unsaved')}</Chip
    >
  {/if}
  <ManagerButton
    role="ghost"
    data-recipe-item-back
    onclick={backToBooksScrolls}
    disabled={recipeItemEditSaving}
  >
    <i class="fas fa-arrow-left" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.RecipeItem.BackToBrowse', 'Back to Books & Scrolls')}</span
    >
  </ManagerButton>
  <ManagerButton
    role="danger"
    data-recipe-item-delete
    onclick={deleteRecipeItemFromEdit}
    disabled={!recipeItemDraft?.id || recipeItemEditSaving}
    title={text('FABRICATE.Admin.Manager.RecipeItem.Delete', 'Delete recipe item')}
  >
    <i class="fas fa-trash" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.RecipeItem.Delete', 'Delete recipe item')}</span>
  </ManagerButton>
  <ManagerButton
    role="primary"
    data-recipe-item-save
    onclick={saveRecipeItemDraft}
    disabled={!canSaveRecipeItemEdit}
  >
    <i class={recipeItemEditSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"
    ></i>
    <span>{text('FABRICATE.Admin.Manager.RecipeItem.Save', 'Save recipe item')}</span>
  </ManagerButton>
  <!-- An attempted-and-failed save is announced beside the control the GM just clicked
       (issue 919). -->
  {#if recipeItemSaveFailed}
    <p class="manager-header-save-error" role="alert" data-recipe-item-save-error>
      {text('FABRICATE.Admin.Manager.RecipeItem.SaveFailed', 'Save failed. Try again.')}
    </p>
  {/if}
{:else if currentView === 'components'}
  <!-- `+ Add from catalogue` (gap-list row 99, `proto:1046`). The control opens a picker and
       navigates nowhere — `proto:1046` binds `onAddFrom`, which at `proto:5545` sets
       `modal: 'addFrom'` — so the dead route token it once passed `openWorldScopedEntry` is
       absent from this file, comments included, which is what
       `component-world-scope-screens.test.js` asserts. `size="38"` is the rung the reference
       draws (`proto:1046`), taken as the shared opt-in rather than a local height. -->
  <ManagerButton
    role="primary"
    size="38"
    data-component-add-from-catalogue
    onclick={openComponentAddFromCatalogue}
    disabled={!selectedSystemId}
  >
    <i class="fas fa-plus" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Component.AddFromCatalogue', 'Add from catalogue')}</span>
  </ManagerButton>
{:else if currentView === 'knowledge'}
  <!-- The Knowledge surface's only actions are per-character, in the detail-pane header. -->
{:else if currentView === 'component-edit'}
  <ComponentEditorHeader
    dirty={componentEditCombinedDirty}
    saving={componentEditSaving}
    canSave={canSaveComponentEdit}
    formId="manager-component-edit-form"
    dirtyLabel={text('FABRICATE.Admin.Manager.Component.Dirty', 'Unsaved')}
    backLabel={text('FABRICATE.Admin.Manager.Component.Back', 'Back')}
    saveLabel={componentEditSaveLabel()}
    onBack={backToComponentsBrowse}
  />
{:else if currentView === 'tags'}
  <!-- no header actions for the tags view -->
{:else if isChecksRoute}
  {#if checksDirty}
    <Chip tone="warning" density="action"
      >{text('FABRICATE.Admin.Manager.Checks.Dirty', 'Unsaved')}</Chip
    >
  {/if}
  <ManagerButton
    role="primary"
    data-checks-save
    onclick={saveChecks}
    disabled={!checksDirty || checksSaving}
  >
    <i class={checksSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Checks.Save', 'Save checks')}</span>
  </ManagerButton>
{:else if currentView === 'essences'}
  <!-- No header action: the reference's Essence Rules header carries nothing on the right
       (`tmp/proto/essence-rules.png`, markup `proto:1523`-`1540`), because an essence is a
       world record and its only create is the Essence Catalogue's. A GM joins one to this
       system from that catalogue's inspector rows or from this list's own `All world essences`
       segment (issue 1372). -->
{:else if currentView === 'essence-edit'}
  <!-- The shared editor header (issue 1036), wearing this studio's own three data hooks. Its
       control inventory follows the shipped sibling rather than the prototype, because seven
       editors share it. -->
  <ComponentEditorHeader
    dirty={essenceEditDirty}
    saving={essenceEditSaving}
    canSave={canSaveEssenceEdit}
    formId="manager-essence-edit-form"
    dirtyAttr="data-essence-edit-dirty"
    backAttr="data-essence-edit-back"
    saveAttr="data-essence-edit-save"
    dirtyLabel={text('FABRICATE.Admin.Manager.Essence.Dirty', 'Unsaved')}
    backLabel={text('FABRICATE.Admin.Manager.Essence.Back', 'Back')}
    saveLabel={essenceEditSaveLabel()}
    onBack={cancelEssenceEdit}
  />
{/if}
