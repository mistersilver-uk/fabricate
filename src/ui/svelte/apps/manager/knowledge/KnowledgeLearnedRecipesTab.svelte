<!--
  The Learned recipes tab. Its single banner states the general rule WITHOUT promising slot recovery
  — the per-row truth is the no-refund clause each affected row carries on its source line. The
  erase-vs-reset `discoveryProgress` asymmetry is disclosed in the reset dialog instead, since it is
  only actionable once the GM picks a grain.

  Props: learnedRecipes, armedToken, onErase, onArm, onDisarm.
-->
<script>
  import Callout from '../../../components/Callout.svelte';
  import EmptyState from '../../../components/EmptyState.svelte';
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
  <!-- NEUTRAL, per `openspec/specs/ui-visual-style/spec.md` → "Standing statements": it is true
       before the GM selects anything, and nothing is at risk until a row is armed. -->
  <Callout
    tone="neutral"
    text={text(
      'FABRICATE.Admin.Manager.Knowledge.LearnedBanner',
      'Erasing a memory removes the recipe from this character. It frees a learn slot only when the copy it was learned from is still owned.'
    )}
    dataAttr="data-knowledge-learned-banner"
  />

  {#if learnedRecipes.length === 0}
    <EmptyState
      dataAttr="data-knowledge-learned-empty"
      icon="fas fa-graduation-cap"
      title={text('FABRICATE.Admin.Manager.Knowledge.LearnedEmptyTitle', 'Nothing learned yet')}
      hint={text(
        'FABRICATE.Admin.Manager.Knowledge.LearnedEmptyHint',
        'This character has not learned any recipe in this crafting system.'
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
