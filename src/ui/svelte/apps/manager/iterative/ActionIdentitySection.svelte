<!-- Svelte 5 runes mode -->
<!--
  The Crafting Action editor's Identity card: its icon, label, a player-facing description and its
  categories, chosen from the ones the system's actions already use or created in place.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `draft` | the staged action | — | read for `icon`, `label`, `description` and `categories` |
  | `actions` | the library's Crafting Actions | `[]` | where the candidate categories come from |
  | `text` | the shell's localizer | — | `(key, fallback)` |
  | `edit(change)` | function | no-op | runs `change(draft)`, the only way this card writes |

  Invariants:
  - A blank description or icon drops its key, so a saved action carries no empty optional key.
  - Staged categories need Apply and then Save: the shared `SetPicker` buffers its choices.
-->
<script>
  import Field from '../../../components/Field.svelte';
  import IconPicker from '../../../components/IconPicker.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import SetPicker from '../../../components/SetPicker.svelte';
  import { arrayOrEmpty } from '../../../../../utils/scalars.js';
  import InlineVocabularyAdd from '../InlineVocabularyAdd.svelte';

  import { actionCategoryNames, describeCategoryInput } from './actionCategories.js';

  let { draft, actions = [], text = (_key, fallback) => fallback, edit = () => {} } = $props();

  const DEFAULT_ICON = 'fas fa-hand-back-fist';

  const categories = $derived(arrayOrEmpty(draft.categories));
  const names = $derived(actionCategoryNames(actions, categories));
  const options = $derived(names.map((name) => ({ id: name, label: name })));

  function setOptional(key, value) {
    edit((action) => {
      if (value.trim() === '') delete action[key];
      else action[key] = value;
    });
  }

  function addCategory(name) {
    edit((action) => {
      if (!arrayOrEmpty(action.categories).includes(name)) {
        action.categories = [...arrayOrEmpty(action.categories), name];
      }
    });
    return true;
  }
</script>

<InspectorCard data-iterative-section="identity">
  {#snippet title()}{text(
      'FABRICATE.Admin.Manager.Iterative.SectionIdentity',
      'Identity'
    )}{/snippet}
  <div class="manager-iterative-card-body">
    <div class="manager-iterative-identity-line">
      <Field as="div" data-iterative-action-icon="">
        <span>{text('FABRICATE.Admin.Manager.Iterative.IconField', 'Icon')}</span>
        <IconPicker
          value={draft.icon || DEFAULT_ICON}
          ariaLabel={text('FABRICATE.Admin.Manager.Iterative.IconPickerLabel', 'Action icon')}
          listLabel={text('FABRICATE.Admin.Manager.Iterative.IconPickerList', 'Action icon picker')}
          searchLabel={text('FABRICATE.Admin.Manager.Iterative.IconPickerSearch', 'Search icons')}
          searchPlaceholder={text(
            'FABRICATE.Admin.Manager.Iterative.IconPickerSearch',
            'Search icons'
          )}
          noMatchesText={text(
            'FABRICATE.Admin.Manager.Iterative.IconPickerNone',
            'No icons match that search.'
          )}
          onChange={(icon) => setOptional('icon', icon)}
        />
      </Field>
      <Field as="label" class="manager-iterative-identity-label">
        <span>{text('FABRICATE.Admin.Manager.Iterative.LabelField', 'Label')}</span>
        <input
          type="text"
          data-iterative-action-label
          value={draft.label ?? ''}
          oninput={(event) =>
            edit((action) => {
              action.label = event.currentTarget.value;
            })}
        />
      </Field>
    </div>
    <Field as="label">
      <span
        >{text(
          'FABRICATE.Admin.Manager.Iterative.ActionDescriptionField',
          'Description · shown to players'
        )}</span
      >
      <textarea
        rows="2"
        data-iterative-action-description
        value={draft.description ?? ''}
        oninput={(event) => setOptional('description', event.currentTarget.value)}></textarea>
    </Field>
    <div class="manager-iterative-categories" data-iterative-action-categories>
      <SetPicker
        value={categories}
        {options}
        label={text('FABRICATE.Admin.Manager.Iterative.CategoriesField', 'Categories')}
        addLabel={text('FABRICATE.Admin.Manager.Iterative.AddCategory', 'Category')}
        searchLabel={text(
          'FABRICATE.Admin.Manager.Iterative.CategoriesSearch',
          'Search categories'
        )}
        emptyLabel={text(
          'FABRICATE.Admin.Manager.Iterative.CategoriesPickerEmpty',
          'No categories yet. Create one below.'
        )}
        addProps={{ 'data-iterative-category-add': '' }}
        onChange={(next) =>
          edit((action) => {
            action.categories = next;
          })}
      />
      {#if categories.length === 0}
        <span class="manager-iterative-none" data-iterative-categories-none
          >{text('FABRICATE.Admin.Manager.Iterative.CategoriesNone', 'None.')}</span
        >
      {/if}
      <InlineVocabularyAdd
        inputId="iterative-action-new-category"
        inputLabel={text('FABRICATE.Admin.Manager.Iterative.NewCategory', 'New category')}
        inputPlaceholder={text(
          'FABRICATE.Admin.Manager.Iterative.NewCategoryPlaceholder',
          'e.g. Forging'
        )}
        addLabel={text('FABRICATE.Admin.Manager.Iterative.CreateCategory', 'Create category')}
        describeInput={(value) => describeCategoryInput(value, names, text)}
        successFeedback={() =>
          text('FABRICATE.Admin.Manager.Iterative.CategoryCreated', 'Category added.')}
        onAdd={addCategory}
      />
    </div>
  </div>
</InspectorCard>

<style>
  .manager-iterative-identity-line {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--fab-space-3);
  }

  .manager-iterative-identity-line :global(.manager-iterative-identity-label) {
    flex: 1 1 14rem;
    min-width: 0;
  }

  .manager-iterative-categories {
    display: grid;
    gap: var(--fab-space-2);
    min-width: 0;
  }
</style>
