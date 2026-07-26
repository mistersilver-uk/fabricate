<!-- Svelte 5 runes mode -->
<!--
  The Learned recipes tab of the Knowledge surface (issue 785).

  Its single banner states the general rule WITHOUT promising slot recovery: the
  per-row truth is the no-refund clause each affected row carries on its source line, which
  turns the prohibition into a positive statement. The erase-vs-reset
  `discoveryProgress` asymmetry is disclosed in the reset dialog instead — it is
  only actionable once the GM picks a grain — so no third strip lands here.

  Props:
   - learnedRecipes: projected learned rows.
   - armedToken, onErase, onArm, onDisarm.
-->
<script>
  import EmptyState from '../EmptyState.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import KnowledgeLearnedRow from './KnowledgeLearnedRow.svelte';

  let {
    learnedRecipes = [],
    armedToken = '',
    onErase = () => {},
    onArm = () => {},
    onDisarm = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
</script>

<div class="manager-knowledge-tab-body">
  <p class="manager-warning-band manager-knowledge-learned-band" data-knowledge-learned-banner>
    <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
    <span>{text(
      'FABRICATE.Admin.Manager.Knowledge.LearnedBanner',
      'Erasing a memory removes the recipe from this character. It frees a learn slot only when the copy it was learned from is still owned.'
    )}</span>
  </p>

  {#if learnedRecipes.length === 0}
    <EmptyState
      dataAttr="data-knowledge-learned-empty"
      icon="fas fa-graduation-cap"
      title={text('FABRICATE.Admin.Manager.Knowledge.LearnedEmptyTitle', 'Nothing learned yet')}
      hint={text(
        'FABRICATE.Admin.Manager.Knowledge.LearnedEmptyHint',
        "This character has not learned any recipe in this crafting system."
      )}
    />
  {:else}
    <ul class="manager-knowledge-row-list" role="list">
      {#each learnedRecipes as learned (learned.recipeId)}
        <KnowledgeLearnedRow {learned} {armedToken} {onErase} {onArm} {onDisarm} />
      {/each}
    </ul>
  {/if}
</div>
