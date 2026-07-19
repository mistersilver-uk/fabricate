<!-- Svelte 5 runes mode -->
<!--
  Books & Scrolls tab (issue 676): the books and scrolls that teach this recipe.
  Rehomed out of the deleted RecipeContextRail, whose "Appears in" section was the
  only surface answering "which books teach THIS recipe" — the Books & Scrolls screen
  is organised the other way round (pick a book, then see its recipes) — and the only
  consumer of `onRemoveRecipeItem` anywhere in `src/`.

  GATED on `visibilityEffect.showBooksScrolls` — the system's canonical
  `visibilityMode` through `craftingEffect(mode)`, exactly as the rail gated its
  section. The gate lives in RecipeEditorTabs so the tab BUTTON disappears with the
  panel.

  A SUMMARY, not an editor: a recipe is ADDED to a book from the book's own editor,
  so there is deliberately no drop zone and no "Link another" here — that would be a
  second authoring path for the same many-to-many. Each row can still be REMOVED,
  which is a removal from THIS recipe's membership rather than authoring a new one.

  The recipe<->recipe-item link is many-to-many: a recipe can be taught by several
  books. There is NO book/scroll `kind` — RecipeItemDefinition manages every recipe
  item regardless of Foundry item type, so no kind chip is rendered.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { DEFAULT_RECIPE_IMAGE } from '../../../util/recipeImageIcons.js';

  let {
    recipe = null,
    recipeItemDefinitions = [],
    onRemoveRecipeItem = () => {},
    onOpenItem = () => {},
    onOpenBooksScrolls = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const linkedDefinitionIds = $derived(
    Array.isArray(recipe?.recipeItemIds) && recipe.recipeItemIds.length > 0
      ? recipe.recipeItemIds.map((id) => String(id))
      : (recipe?.recipeItemId ? [String(recipe.recipeItemId)] : [])
  );

  const linkedDefinitions = $derived(
    linkedDefinitionIds
      .map((id) => (recipeItemDefinitions || []).find((def) => String(def.id) === id) || null)
      .filter(Boolean)
  );

  // Resolve each book's underlying item document for a live thumb/name + the
  // missing-state, keyed by definition id.
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
          return [def.id, { name: String(doc.name || ''), img: String(doc.img || ''), missing: false }];
        } catch {
          return [def.id, { name: '', img: '', missing: true }];
        }
      })
    ).then((entries) => {
      if (!cancelled) resolvedByDefId = Object.fromEntries(entries);
    });
    return () => { cancelled = true; };
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

<section class="manager-recipe-tab manager-recipe-books-tab" data-recipe-tab="books-scrolls" aria-label={text('FABRICATE.Admin.Manager.Recipe.Tabs.BooksScrolls', 'Books & Scrolls')}>
  <div class="manager-recipe-tab-intro">
    <h2 class="manager-recipe-tab-title">{text('FABRICATE.Admin.Manager.Recipe.BooksScrollsTab.Title', 'Appears in')}</h2>
    <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.BooksScrollsTab.Intro', 'The books and scrolls that teach this recipe. A recipe is added to a book from the book’s own editor.')}</p>
  </div>

  <div class="manager-recipe-books-body" data-recipe-section="recipe-item">
    {#if linkedDefinitions.length > 0}
      <ul class="manager-recipe-item-links" data-recipe-item-links aria-label={text('FABRICATE.Admin.Manager.Recipe.RecipeItemLinks', 'Linked recipe items')}>
        {#each linkedDefinitions as def (def.id)}
          <li
            class="manager-recipe-book-link"
            data-recipe-item-linked
            data-recipe-item-link={def.id}
          >
            {#if definitionMissing(def)}
              <span class="manager-recipe-book-thumb is-placeholder" aria-hidden="true"><i class="fas fa-suitcase"></i></span>
              <span class="manager-recipe-book-name manager-muted" data-recipe-item-missing>{text('FABRICATE.Admin.Manager.Recipe.RecipeItemMissing', 'Recipe item unresolved')}</span>
            {:else}
              <img class="manager-recipe-book-thumb" src={definitionImg(def)} alt="" />
              <button type="button" class="manager-recipe-book-name is-link" onclick={() => openItem(def)} title={text('FABRICATE.Admin.Manager.Recipe.OpenItem', 'Open item')}>{definitionName(def)}</button>
            {/if}
            <button
              type="button"
              class="manager-icon-button is-danger"
              aria-label={text('FABRICATE.Admin.Manager.Recipe.UnlinkItem', 'Unlink recipe item')}
              title={text('FABRICATE.Admin.Manager.Recipe.UnlinkItem', 'Unlink recipe item')}
              onclick={() => unlinkDefinition(def)}
            ><i class="fas fa-link-slash" aria-hidden="true"></i></button>
          </li>
        {/each}
      </ul>
    {:else}
      <!-- The tab's OWN empty primitive (`.manager-recipe-section-empty`), the one the
           Results/Ingredients tabs use — not the rail's medallion card, which was a
           300px-column surface. -->
      <div class="manager-recipe-section-empty" data-recipe-item-empty>
        <p class="manager-recipe-section-empty-title">{text('FABRICATE.Admin.Manager.Recipe.BooksScrollsTab.EmptyTitle', 'Not in any book or scroll')}</p>
        <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.BooksScrollsTab.AppearsInEmpty', 'Not in any book or scroll yet.')}</p>
      </div>
    {/if}

    <button type="button" class="manager-button manager-recipe-tab-action" data-recipe-open-books onclick={() => onOpenBooksScrolls()}>
      <i class="fas fa-book" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.BooksScrollsTab.OpenBooksScrolls', 'Open Books & Scrolls')}</span>
      <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
    </button>
  </div>
</section>

<style>
  .manager-recipe-books-body {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* The book rows carry their OWN vocabulary now. In the rail they borrowed the
     GATHERING environment editor's `manager-environment-scene-*` classes — a book is
     not a scene, and borrowing a neighbour's vocabulary is how a surface silently
     inherits that neighbour's ramp (issue 676's tag pills went amber exactly this way).
     Capped like the access list: a thumb + a name + an unlink is a short row. */
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

  /* A `<button>` styled as a name link needs Foundry's button chrome reset: core pins a
     fixed height and centres the content, which crops the name and pulls it off the
     thumb's baseline. */
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
    color: var(--fab-mv2-accent);
    cursor: pointer;
  }

  .manager-recipe-book-name.is-link:hover {
    text-decoration: underline;
  }

  .manager-recipe-tab-action {
    align-self: flex-start;
  }

  .manager-recipe-item-links,
  .manager-recipe-section-empty {
    width: 100%;
    max-width: 520px;
  }

  .manager-recipe-item-links {
    margin: 0;
  }
</style>
