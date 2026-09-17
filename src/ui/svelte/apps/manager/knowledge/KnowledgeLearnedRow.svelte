<!--
  One recipe the selected character has learned. Learned entries are INDEPENDENT of currently-owned
  copies, so a row can name a source copy that no longer exists; the source line resolves through
  `knowledgeStudio.learnedRecipeSource`'s ladder. `sourceLineParts` carries ONE arm per kind, which
  is correctness, not style: on the "Learned from {source}" default a labelled grant would assert a
  book that does not exist and a label-less one would trail off after "Learned from ".

  The label is UNTRUSTED — `learnedRecipes` is a public flag — so it renders as its own text node
  BETWEEN the translated fragments. `String.prototype.replace` and Foundry's `Localization#format`
  both interpret `$&`, `` $` `` and `$'` in the REPLACEMENT, letting foreign text decide what the GM's
  audit line says; splitting on the placeholder cannot, and Svelte escapes each fragment.

  Props: learned (a projected row), armedToken, onErase(recipeId), onArm(token), onDisarm(token).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Medallion from '../../../components/Medallion.svelte';
  import ArmedDangerButton from '../../../components/ArmedDangerButton.svelte';
  import Chip from '../../../components/Chip.svelte';
  import { getRecipeCategoryLabel } from '../../../../../utils/recipeCategories.js';
  import {
    LEARNED_SOURCE_AUTO_LEARN,
    LEARNED_SOURCE_GRANTED,
    LEARNED_SOURCE_GRANTED_UNLABELLED,
    NO_REFUND_NOT_OWNED,
    NO_REFUND_NO_SOURCE,
    NO_REFUND_UNCAPPED,
  } from './knowledgeStudio.js';
  // Declared beside the contract that produces the entries, not restated: the orphan gate needs one
  // `src/**` reference, and a second copy would be a mirror with no guard.
  import { GRANTED_SOURCE_MESSAGE_KEYS } from '../../../../../systems/companionContract.js';

  let {
    learned = null,
    armedToken = '',
    onErase = () => {},
    onArm = () => {},
    onDisarm = () => {},
  } = $props();

  const eraseToken = $derived(`erase:${learned?.recipeId || ''}`);
  // Split ONCE per row: `{@const}` is legal only as a block's child, and these are read three times.
  const sourceParts = $derived(learned ? sourceLineParts(learned) : whole(''));

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // `split`/`join`, never `replace`, which interprets `$&`, `` $` ``, `$'` and `$1` in the
  // REPLACEMENT — a value carrying one would rewrite the sentence instead of appearing in it.
  function fill(value, data) {
    return Object.entries(data).reduce(
      (result, [name, replacement]) => result.split(`{${name}}`).join(String(replacement)),
      value
    );
  }

  // A sentence split around its one placeholder, so the value renders as its OWN text node. A
  // translation dropping the placeholder yields an empty `after` and the value is omitted.
  function around(template, placeholder, value) {
    const [before, ...rest] = template.split(placeholder);
    const after = rest.join(placeholder);
    return { before, value: rest.length > 0 ? value : '', after };
  }

  /** A line that carries no value of its own — one text node, nothing interpolated. */
  function whole(line) {
    return { before: line, value: '', after: '' };
  }

  // ONE arm per kind; the `LearnedFrom` default serves the three uuid-bearing rungs ONLY.
  function sourceLineParts(row) {
    if (row.sourceKind === LEARNED_SOURCE_AUTO_LEARN) {
      return whole(
        text('FABRICATE.Admin.Manager.Knowledge.LearnedByCrafting', 'Learned by crafting')
      );
    }
    if (row.sourceKind === LEARNED_SOURCE_GRANTED) {
      return around(
        text(GRANTED_SOURCE_MESSAGE_KEYS.labelled, 'Learned by grant: {grantedBy}'),
        '{grantedBy}',
        row.sourceName
      );
    }
    if (row.sourceKind === LEARNED_SOURCE_GRANTED_UNLABELLED) {
      return whole(text(GRANTED_SOURCE_MESSAGE_KEYS.unlabelled, 'Learned by grant'));
    }
    return around(
      text('FABRICATE.Admin.Manager.Knowledge.LearnedFrom', 'Learned from {source}'),
      '{source}',
      row.sourceName
    );
  }

  // Derived from the SAME kind the line is: a book glyph beside a line whose point is that no book
  // was involved contradicts what it decorates. `fa-hand-holding` is a Font Awesome FREE name and
  // deliberately not an award or trophy, which would re-narrow the grant to one caller.
  function sourceIcon(row) {
    const granted =
      row.sourceKind === LEARNED_SOURCE_GRANTED ||
      row.sourceKind === LEARNED_SOURCE_GRANTED_UNLABELLED;
    return granted ? 'fas fa-hand-holding' : 'fas fa-book';
  }

  // Appended to the source line rather than a second sub-label, and cause-specific rather than one
  // string: under `NO_REFUND_UNCAPPED` the copy is still owned, so "no owned copy to refund" would
  // be false. Keys are static literals so the lang gates see every leaf.
  function refundClause(row) {
    if (row.noRefundReason === NO_REFUND_NOT_OWNED) {
      return text('FABRICATE.Admin.Manager.Knowledge.NoRefundNotOwned', 'no owned copy to refund');
    }
    if (row.noRefundReason === NO_REFUND_UNCAPPED) {
      return text('FABRICATE.Admin.Manager.Knowledge.NoRefundUncapped', 'no learn limit to refund');
    }
    if (row.noRefundReason === NO_REFUND_NO_SOURCE) {
      return text('FABRICATE.Admin.Manager.Knowledge.NoRefundNoSource', 'no source copy to refund');
    }
    return '';
  }
</script>

{#if learned}
  <li class="manager-knowledge-learned-row" data-knowledge-learned={learned.recipeId}>
    <span class="manager-knowledge-copy-identity">
      <Medallion art={learned.img} icon="fas fa-scroll" size={38} alt="" />
      <span class="manager-knowledge-copy-copy">
        <span class="manager-knowledge-copy-heading">
          <strong class="manager-knowledge-copy-name" title={learned.name}>{learned.name}</strong>
          <Chip data-knowledge-category>
            {getRecipeCategoryLabel(learned.category, localize)}
          </Chip>
        </span>
        <small class="manager-knowledge-copy-meta" data-knowledge-source={learned.sourceKind}>
          <i class={sourceIcon(learned)} aria-hidden="true"></i>
          <span
            >{sourceParts.before}<span data-knowledge-source-name>{sourceParts.value}</span
            >{sourceParts.after}</span
          >
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
      aria-label={text(
        'FABRICATE.Admin.Manager.Knowledge.LearnedRowActions',
        'Learned recipe actions'
      )}
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
