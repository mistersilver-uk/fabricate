<!-- Svelte 5 runes mode -->
<!--
  One recipe the selected character has learned (issue 785). Learned entries are
  INDEPENDENT of currently-owned copies — the two lists are never coupled — so a
  row can name a source copy that no longer exists.

  The source line resolves through the projection's ladder: a still-owned copy's
  name, else the member recipe-item DEFINITION name rendered
  "… (copy no longer owned)" (the rung that satisfies the survives-source-deletion
  requirement), else the trailing uuid segment, else "Learned by crafting" for the
  auto-learn entries `learnRecipeOnCraft` writes with a null source.

  `freesNoSlot` is stated POSITIVELY as a per-row sub-label rather than left to a
  banner promise the erase cannot keep: `_freeLearnBudgetForEntry` frees budget
  only when the source copy is still owned AND its definition carries a learn cap.

  Props:
   - learned: a projected row from `knowledgeStudio.projectLearnedRecipeRow`.
   - armedToken, onErase(recipeId), onArm(token), onDisarm(token).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Medallion from '../../../components/Medallion.svelte';
  import ArmedDangerButton from '../ArmedDangerButton.svelte';
  import { getRecipeCategoryLabel } from '../../../../../utils/recipeCategories.js';
  import { LEARNED_SOURCE_AUTO_LEARN, LEARNED_SOURCE_LOST_COPY } from './knowledgeStudio.js';

  let {
    learned = null,
    armedToken = '',
    onErase = () => {},
    onArm = () => {},
    onDisarm = () => {},
  } = $props();

  const eraseToken = $derived(`erase:${learned?.recipeId || ''}`);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function fill(value, data) {
    return Object.entries(data).reduce(
      (result, [name, replacement]) => result.replace(`{${name}}`, String(replacement)),
      value
    );
  }

  function sourceLine(row) {
    if (row.sourceKind === LEARNED_SOURCE_AUTO_LEARN) {
      return text('FABRICATE.Admin.Manager.Knowledge.LearnedByCrafting', 'Learned by crafting');
    }
    if (row.sourceKind === LEARNED_SOURCE_LOST_COPY) {
      return fill(
        text(
          'FABRICATE.Admin.Manager.Knowledge.LearnedFromLostCopy',
          'Learned from {source} (copy no longer owned)'
        ),
        { source: row.sourceName }
      );
    }
    return fill(text('FABRICATE.Admin.Manager.Knowledge.LearnedFrom', 'Learned from {source}'), {
      source: row.sourceName,
    });
  }
</script>

{#if learned}
  <li class="manager-knowledge-learned-row" data-knowledge-learned={learned.recipeId}>
    <span class="manager-knowledge-copy-identity">
      <Medallion src={learned.img} icon="fas fa-scroll" size={38} alt="" />
      <span class="manager-knowledge-copy-copy">
        <span class="manager-knowledge-copy-heading">
          <strong class="manager-knowledge-copy-name" title={learned.name}>{learned.name}</strong>
          <span class="manager-chip manager-knowledge-category-pill" data-knowledge-category>
            {getRecipeCategoryLabel(learned.category, localize)}
          </span>
        </span>
        <small class="manager-knowledge-copy-meta" data-knowledge-source={learned.sourceKind}>
          {sourceLine(learned)}
        </small>
        {#if learned.freesNoSlot}
          <small class="manager-knowledge-frees-no-slot" data-knowledge-frees-no-slot>
            <i class="fas fa-circle-info" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.Knowledge.FreesNoSlot', 'Frees no slot')}</span>
          </small>
        {/if}
      </span>
    </span>

    <span
      class="manager-knowledge-row-actions"
      role="group"
      aria-label={text('FABRICATE.Admin.Manager.Knowledge.LearnedRowActions', 'Learned recipe actions')}
    >
      <ArmedDangerButton
        token={eraseToken}
        armed={armedToken === eraseToken}
        idleLabel={text('FABRICATE.Admin.Manager.Knowledge.Erase', 'Erase memory')}
        armedLabel={text('FABRICATE.Admin.Manager.Knowledge.EraseConfirm', 'Confirm?')}
        idleIcon="fas fa-eraser"
        idleAriaLabel={fill(
          text(
            'FABRICATE.Admin.Manager.Knowledge.EraseLabel',
            "Erase {name} from this character's memory"
          ),
          { name: learned.name }
        )}
        armedAriaLabel={fill(
          text(
            'FABRICATE.Admin.Manager.Knowledge.EraseArmedLabel',
            'Confirm erasing {name}. The recipe is forgotten and cannot be undone.'
          ),
          { name: learned.name }
        )}
        {onArm}
        {onDisarm}
        onConfirm={() => onErase(learned.recipeId)}
      />
    </span>
  </li>
{/if}
