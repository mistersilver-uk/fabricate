<!-- Svelte 5 runes mode -->
<!--
  One recipe the selected character has learned (issue 785). Learned entries are
  INDEPENDENT of currently-owned copies — the two lists are never coupled — so a
  row can name a source copy that no longer exists.

  The source line resolves through the projection's ladder: a still-owned copy's
  name, else the member recipe-item DEFINITION name (the rung that satisfies the
  survives-source-deletion requirement), else the trailing uuid segment, else
  "Learned by crafting" for the auto-learn entries `learnRecipeOnCraft` writes with
  a null source.

  When the erase frees no budget, the reason is a trailing clause on that SAME line
  rather than a second sub-label. The old pair stated one fact twice — the source
  line's "(copy no longer owned)" was itself the cause of a separate "Frees no slot".
  The clause stays cause-specific because the three causes are not interchangeable:
  `_freeLearnBudgetForEntry` frees budget only when the source copy is still owned
  AND its definition carries a learn cap, so a row can be refund-less while its copy
  is present, and claiming "no owned copy" there would be false.

  Props:
   - learned: a projected row from `knowledgeStudio.projectLearnedRecipeRow`.
   - armedToken, onErase(recipeId), onArm(token), onDisarm(token).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Medallion from '../../../components/Medallion.svelte';
  import ArmedDangerButton from '../ArmedDangerButton.svelte';
  import { getRecipeCategoryLabel } from '../../../../../utils/recipeCategories.js';
  import {
    LEARNED_SOURCE_AUTO_LEARN,
    NO_REFUND_NOT_OWNED,
    NO_REFUND_NO_SOURCE,
    NO_REFUND_UNCAPPED,
  } from './knowledgeStudio.js';

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
    return fill(text('FABRICATE.Admin.Manager.Knowledge.LearnedFrom', 'Learned from {source}'), {
      source: row.sourceName,
    });
  }

  // The refund clause is appended to the source line rather than rendered as its own
  // sub-label, because the old pair restated one fact twice: "(copy no longer owned)"
  // WAS the cause of "Frees no slot".
  //
  // It stays cause-specific rather than collapsing to one string. Under
  // `NO_REFUND_UNCAPPED` the source copy is still owned — the row above names it — so
  // "no owned copy to refund" would be false there; the reason is that the book carries
  // no learn limit at all. Keys are static literals so the lang gates see every leaf.
  function refundClause(row) {
    if (row.noRefundReason === NO_REFUND_NOT_OWNED) {
      return text(
        'FABRICATE.Admin.Manager.Knowledge.NoRefundNotOwned',
        'no owned copy to refund'
      );
    }
    if (row.noRefundReason === NO_REFUND_UNCAPPED) {
      return text(
        'FABRICATE.Admin.Manager.Knowledge.NoRefundUncapped',
        'no learn limit to refund'
      );
    }
    if (row.noRefundReason === NO_REFUND_NO_SOURCE) {
      return text(
        'FABRICATE.Admin.Manager.Knowledge.NoRefundNoSource',
        'no source copy to refund'
      );
    }
    return '';
  }
</script>

{#if learned}
  <li class="manager-knowledge-learned-row" data-knowledge-learned={learned.recipeId}>
    <span class="manager-knowledge-copy-identity">
      <Medallion src={learned.img} icon="fas fa-scroll" size={38} alt="" />
      <span class="manager-knowledge-copy-copy">
        <span class="manager-knowledge-copy-heading">
          <strong class="manager-knowledge-copy-name" title={learned.name}>{learned.name}</strong>
          <span class="manager-chip" data-knowledge-category>
            {getRecipeCategoryLabel(learned.category, localize)}
          </span>
        </span>
        <small class="manager-knowledge-copy-meta" data-knowledge-source={learned.sourceKind}>
          <i class="fas fa-book-sparkles" aria-hidden="true"></i>
          <span>{sourceLine(learned)}</span>
          {#if learned.freesNoSlot}
            <span
              class="manager-knowledge-no-refund"
              data-knowledge-no-refund={learned.noRefundReason}
            >
              <i class="fas fa-circle-info" aria-hidden="true"></i>
              <span>{refundClause(learned)}</span>
            </span>
          {/if}
        </small>
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
