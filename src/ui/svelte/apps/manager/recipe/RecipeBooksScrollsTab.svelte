<!-- Svelte 5 runes mode -->
<!--
  Books & Scrolls tab: the books and scrolls that teach this recipe. Rehomed out of the deleted
  RecipeContextRail, whose "Appears in" section was the only surface answering "which books teach
  THIS recipe" — the Books & Scrolls screen is organised the other way round — and the only
  consumer of `onRemoveRecipeItem` in `src/`.

  GATED on `visibilityEffect.showBooksScrolls`, from the system's canonical `visibilityMode`; the
  gate lives in `RecipeEditorTabs`, so the tab BUTTON disappears with the panel.

  A SUMMARY, not an editor: a recipe is ADDED to a book from the book's own editor, so there is
  deliberately no drop zone and no "Link another" — that would be a second authoring path for one
  many-to-many. A row can still be REMOVED, which edits THIS recipe's membership. There is no
  book/scroll `kind`, so no kind chip is rendered.
-->
<script>
  import EmptyState from '../EmptyState.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { DEFAULT_RECIPE_IMAGE } from '../../../util/recipeImageIcons.js';
  import IconButton from '../../../components/IconButton.svelte';

  let {
    recipe = null,
    recipeItemDefinitions = [],
    onRemoveRecipeItem = () => {},
    onOpenItem = () => {},
    onOpenBooksScrolls = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const linkedDefinitionIds = $derived(
    Array.isArray(recipe?.recipeItemIds) && recipe.recipeItemIds.length > 0
      ? recipe.recipeItemIds.map((id) => String(id))
      : recipe?.recipeItemId
        ? [String(recipe.recipeItemId)]
        : []
  );

  const linkedDefinitions = $derived(
    linkedDefinitionIds
      .map((id) => (recipeItemDefinitions || []).find((def) => String(def.id) === id) || null)
      .filter(Boolean)
  );

  // Each book's underlying item document, for a live thumb, name and missing-state.
  let resolvedByDefId = $state({});
  $effect(() => {
    void recipe?.id;
    const defs = linkedDefinitions;
    if (typeof globalThis.fromUuid !== 'function') {
      const next = {};
      for (const def of defs) {
        const uuid = String(def?.originItemUuid || '');
        if (!uuid) next[def.id] = { name: '', img: '', missing: true };
      }
      resolvedByDefId = next;
      return;
    }
    let cancelled = false;
    Promise.all(
      defs.map(async (def) => {
        const uuid = String(def?.originItemUuid || '');
        if (!uuid) return [def.id, { name: '', img: '', missing: true }];
        try {
          const doc = await Promise.resolve(globalThis.fromUuid(uuid));
          if (!doc) return [def.id, { name: '', img: '', missing: true }];
          return [
            def.id,
            { name: String(doc.name || ''), img: String(doc.img || ''), missing: false },
          ];
        } catch {
          return [def.id, { name: '', img: '', missing: true }];
        }
      })
    ).then((entries) => {
      if (!cancelled) resolvedByDefId = Object.fromEntries(entries);
    });
    return () => {
      cancelled = true;
    };
  });

  function definitionName(def) {
    return resolvedByDefId[def.id]?.name || def?.name || String(def?.originItemUuid || '');
  }
  function definitionImg(def) {
    return resolvedByDefId[def.id]?.img || def?.img || DEFAULT_RECIPE_IMAGE;
  }
  function definitionMissing(def) {
    return resolvedByDefId[def.id]?.missing === true;
  }
  function unlinkDefinition(def) {
    if (def?.id) onRemoveRecipeItem(def.id);
  }
  function openItem(def) {
    const uuid = String(def?.originItemUuid || '');
    if (uuid) onOpenItem(uuid);
  }
</script>

<section
  class="manager-recipe-tab manager-recipe-books-tab"
  data-recipe-tab="books-scrolls"
  aria-label={text('FABRICATE.Admin.Manager.Recipe.Tabs.BooksScrolls', 'Books & Scrolls')}
>
  <div class="manager-recipe-tab-intro">
    <h2 class="manager-recipe-tab-title">
      {text('FABRICATE.Admin.Manager.Recipe.BooksScrollsTab.Title', 'Appears in')}
    </h2>
    <p class="manager-muted">
      {text(
        'FABRICATE.Admin.Manager.Recipe.BooksScrollsTab.Intro',
        'The books and scrolls that teach this recipe. A recipe is added to a book from the book’s own editor.'
      )}
    </p>
  </div>

  <div class="manager-recipe-books-body" data-recipe-section="recipe-item">
    {#if linkedDefinitions.length > 0}
      <ul
        class="manager-recipe-item-links"
        data-recipe-item-links
        aria-label={text('FABRICATE.Admin.Manager.Recipe.RecipeItemLinks', 'Linked recipe items')}
      >
        {#each linkedDefinitions as def (def.id)}
          <li
            class="manager-recipe-book-link"
            data-recipe-item-linked
            data-recipe-item-link={def.id}
          >
            {#if definitionMissing(def)}
              <span class="manager-recipe-book-thumb is-placeholder" aria-hidden="true"
                ><i class="fas fa-suitcase"></i></span
              >
              <span class="manager-recipe-book-name manager-muted" data-recipe-item-missing
                >{text(
                  'FABRICATE.Admin.Manager.Recipe.RecipeItemMissing',
                  'Recipe item unresolved'
                )}</span
              >
            {:else}
              <img class="manager-recipe-book-thumb" src={definitionImg(def)} alt="" />
              <button
                type="button"
                class="manager-recipe-book-name is-link"
                onclick={() => openItem(def)}
                title={text('FABRICATE.Admin.Manager.Recipe.OpenItem', 'Open item')}
                >{definitionName(def)}</button
              >
            {/if}
            <IconButton
              class="is-danger"
              ariaLabel={text('FABRICATE.Admin.Manager.Recipe.UnlinkItem', 'Unlink recipe item')}
              title={text('FABRICATE.Admin.Manager.Recipe.UnlinkItem', 'Unlink recipe item')}
              onclick={() => unlinkDefinition(def)}
              ><i class="fas fa-link-slash" aria-hidden="true"></i></IconButton
            >
          </li>
        {/each}
      </ul>
    {:else}
      <!-- The shared no-state primitive at the sidebar/inline scale.
           `manager-recipe-tab-empty` keeps the full-width UNCAPPED container concern in the
           global sheet, where an ancestor-reached rule can live. -->
      <EmptyState
        compact
        icon="fas fa-book"
        title={text(
          'FABRICATE.Admin.Manager.Recipe.BooksScrollsTab.EmptyTitle',
          'Not in any book or scroll'
        )}
        hint={text(
          'FABRICATE.Admin.Manager.Recipe.BooksScrollsTab.AppearsInEmpty',
          'Not in any book or scroll yet.'
        )}
        contextClass="manager-recipe-tab-empty"
        dataAttr="data-recipe-item-empty"
      />
    {/if}

    <ManagerButton
      class="manager-recipe-tab-action"
      data-recipe-open-books
      onclick={() => onOpenBooksScrolls()}
    >
      <i class="fas fa-book" aria-hidden="true"></i>
      <span
        >{text(
          'FABRICATE.Admin.Manager.Recipe.BooksScrollsTab.OpenBooksScrolls',
          'Open Books & Scrolls'
        )}</span
      >
      <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
    </ManagerButton>
  </div>
</section>

<style>
  /* Reconciled with `.manager-recipe-access-body`: NO `align-items`, so the list stretches and
     the grid tiles across the panel — `flex-start` would collapse it to one content-width
     column. The "Open Books & Scrolls" action opts back out with its own `align-self`. */
  .manager-recipe-books-body {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* The book rows carry their OWN vocabulary. In the rail they borrowed the gathering
     environment editor's `manager-environment-scene-*` classes, and borrowing a neighbour's
     vocabulary is how a surface silently inherits that neighbour's ramp. */
  .manager-recipe-book-link {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
    padding: var(--fab-space-chip) var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 7px;
  }

  .manager-recipe-book-thumb {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    overflow: hidden;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    color: var(--fab-text-subtle);
    background: var(--fab-bg-3);
    font-size: 0.66rem;
    object-fit: cover;
  }

  /* A `<button>` styled as a name link needs Foundry's button chrome reset: core pins a fixed
     height and centres the content, cropping the name off the thumb's baseline. */
  .manager-recipe-book-name {
    display: block;
    flex: 1 1 auto;
    width: auto;
    height: auto;
    min-height: 0;
    margin: 0;
    padding: 0;
    overflow: hidden;
    border: 0;
    background: none;
    font-family: inherit;
    font-size: 0.78rem;
    line-height: 1.3;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-recipe-book-name.is-link {
    color: var(--fab-accent);
    cursor: pointer;
  }

  .manager-recipe-book-name.is-link:hover {
    text-decoration: underline;
  }

  /* Grid parity with `.manager-recipe-access-list`: a thumb, a name and an unlink is a short
     row, so the list tiles rather than stretching into one column. A FIXED three-column grid
     with `minmax(0, 1fr)`, so a long book name shrinks its card instead of overflowing, gives
     ~340px per card at the ~1040px editor panel; a lone card filling one of three columns is
     the accepted trade-off. Scoped under the `.manager-recipe-books-tab` ancestor for a
     deterministic (0,3,0) win over the shared `.fabricate-manager .manager-recipe-item-links`
     flex rule (0,2,0) on this same `<ul>`, which would otherwise collide at equal specificity
     and be decided by injection order. */
  .manager-recipe-books-tab .manager-recipe-item-links {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--fab-space-1);
  }

  /* The body already spaces the list from the action with its `gap`, so `margin: 0` here keeps
     the shared rule's bottom margin from doubling it. */
  .manager-recipe-item-links {
    margin: 0;
  }
</style>
