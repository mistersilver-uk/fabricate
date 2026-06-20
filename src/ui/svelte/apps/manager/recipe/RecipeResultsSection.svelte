<!-- Svelte 5 runes mode -->
<!--
  Result-groups section for a single recipe scope (recipe-level for single-step
  recipes, or one step for multi-step). This iteration is the empty-state shell:
  add appends an id-less placeholder group (the store assigns the id) rendered as
  a minimal row; the rich per-group editor comes later. `idPrefix` namespaces the
  `data-recipe-section` marker so single-step vs. per-step instances are
  distinguishable in tests.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let {
    resultGroups = [],
    onAddResultGroup = () => {},
    onRemoveResultGroup = () => {},
    idPrefix = ''
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
</script>

<section class="manager-task-core-card manager-recipe-section" data-recipe-section={`${idPrefix}results`}>
  <div class="manager-task-card-heading">
    <div>
      <h3>{text('FABRICATE.Admin.Manager.Recipe.ResultsSection', 'Results')}</h3>
    </div>
  </div>
  {#if (resultGroups || []).length === 0}
    <div class="manager-recipe-section-empty">
      <p class="manager-recipe-section-empty-title">{text('FABRICATE.Admin.Manager.Recipe.ResultsEmpty', 'No results yet')}</p>
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.ResultsEmptyHint', 'Add a group of items this recipe can produce.')}</p>
      <button type="button" class="manager-button" data-recipe-add="result-group" onclick={() => onAddResultGroup()}>
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.AddResultGroup', 'Add result group')}</span>
      </button>
    </div>
  {:else}
    <ul class="manager-recipe-req-rows">
      {#each resultGroups as group, index (group.id)}
        <li class="manager-recipe-req-row" data-recipe-req-id={group.id}>
          <span class="manager-recipe-req-label">{`${text('FABRICATE.Admin.Manager.Recipe.GroupLabel', 'Group')} ${index + 1}`}</span>
          <button
            type="button"
            class="manager-icon-button is-danger"
            data-recipe-remove="result-group"
            aria-label={text('FABRICATE.Admin.Manager.Recipe.RemoveResultGroup', 'Remove result group')}
            title={text('FABRICATE.Admin.Manager.Recipe.RemoveResultGroup', 'Remove result group')}
            onclick={() => onRemoveResultGroup(group.id)}
          ><i class="fas fa-trash" aria-hidden="true"></i></button>
        </li>
      {/each}
    </ul>
    <button type="button" class="manager-button" data-recipe-add="result-group" onclick={() => onAddResultGroup()}>
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.AddResultGroup', 'Add result group')}</span>
    </button>
  {/if}
</section>
