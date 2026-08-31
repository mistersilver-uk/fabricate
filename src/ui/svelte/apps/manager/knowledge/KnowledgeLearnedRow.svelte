<!-- Svelte 5 runes mode -->
<!--
  One recipe the selected character has learned (issue 785). Learned entries are
  INDEPENDENT of currently-owned copies — the two lists are never coupled — so a
  row can name a source copy that no longer exists.

  The source line resolves through the projection's ladder: a still-owned copy's
  name, else the member recipe-item DEFINITION name (the rung that satisfies the
  survives-source-deletion requirement), else the trailing uuid segment, else — for a
  null source — a GM grant (with or without a label) or "Learned by crafting" for the
  auto-learn entries `learnRecipeOnCraft` writes.

  `sourceLineParts` carries ONE arm per kind, and that is a correctness rule rather
  than a style: with the granted kinds falling to the "Learned from {source}" default
  a labelled grant would read "Learned from <label>", asserting a book that does not
  exist, and a label-less grant would read "Learned from " with nothing after it.

  The label is UNTRUSTED — the `learnedRecipes` flag is public, so any module can
  write `grantedBy` — and it is therefore rendered as its own text node between the
  translated fragments, never substituted into them. `String.prototype.replace` and
  Foundry's `Localization#format` both interpret `$&`, `` $` `` and `$'` IN THE
  REPLACEMENT, so a label of `` $` `` renders the prefix twice and `$'` renders
  nothing: foreign text deciding what the GM's audit line says. Splitting on the
  placeholder cannot do that, and Svelte escapes each fragment.

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
  import Chip from '../Chip.svelte';
  import { getRecipeCategoryLabel } from '../../../../../utils/recipeCategories.js';
  import {
    LEARNED_SOURCE_AUTO_LEARN,
    LEARNED_SOURCE_GRANTED,
    LEARNED_SOURCE_GRANTED_UNLABELLED,
    NO_REFUND_NOT_OWNED,
    NO_REFUND_NO_SOURCE,
    NO_REFUND_UNCAPPED,
  } from './knowledgeStudio.js';
  // The two granted keys are declared beside the contract that produces the entries
  // they describe, not restated here: `lang/en.json`'s orphan gate needs one `src/**`
  // reference and a second copy of the strings would be a mirror with no guard.
  import { GRANTED_SOURCE_MESSAGE_KEYS } from '../../../../../systems/companionContract.js';

  let {
    learned = null,
    armedToken = '',
    onErase = () => {},
    onArm = () => {},
    onDisarm = () => {},
  } = $props();

  const eraseToken = $derived(`erase:${learned?.recipeId || ''}`);
  // Split ONCE per row rather than in the markup: `{@const}` is only legal as a
  // block's immediate child, and the fragments are read three times.
  const sourceParts = $derived(learned ? sourceLineParts(learned) : whole(''));

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // `split`/`join`, never `String.prototype.replace`: `replace` interprets `$&`,
  // `` $` ``, `$'` and `$1` in the REPLACEMENT, so a value containing one of them
  // rewrites the sentence instead of appearing in it. Nothing here interprets a
  // pattern, so a `$` is just a `$`.
  function fill(value, data) {
    return Object.entries(data).reduce(
      (result, [name, replacement]) => result.split(`{${name}}`).join(String(replacement)),
      value
    );
  }

  // A translated sentence split around its one placeholder, so the caller can render
  // the value as its OWN text node instead of substituting it into the sentence. A
  // translation that drops the placeholder yields an empty `after` and the value is
  // omitted rather than appended somewhere the translator did not put it.
  function around(template, placeholder, value) {
    const [before, ...rest] = template.split(placeholder);
    const after = rest.join(placeholder);
    return { before, value: rest.length > 0 ? value : '', after };
  }

  /** A line that carries no value of its own — one text node, nothing interpolated. */
  function whole(line) {
    return { before: line, value: '', after: '' };
  }

  // ONE arm per kind. The `LearnedFrom` default is the arm for the three uuid-bearing
  // rungs ONLY — see the header for what it renders when a granted kind reaches it.
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

  // The meta icon is derived from the SAME kind the line is, because a book glyph
  // beside a line whose whole point is that no book was involved contradicts the line
  // it decorates — and "grant" against "crafting" would otherwise be the only
  // difference between the two, at muted 0.62rem. `fa-hand-holding` is a Font Awesome
  // FREE name and is deliberately not an award, medal or trophy: the contract chose
  // COMPANION over AWARDS, and a reward glyph would re-narrow the grant to one caller.
  function sourceIcon(row) {
    const granted =
      row.sourceKind === LEARNED_SOURCE_GRANTED ||
      row.sourceKind === LEARNED_SOURCE_GRANTED_UNLABELLED;
    return granted ? 'fas fa-hand-holding' : 'fas fa-book-sparkles';
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
      <Medallion src={learned.img} icon="fas fa-scroll" size={38} alt="" />
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
