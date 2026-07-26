<!-- Svelte 5 runes mode -->
<!--
  One owned copy of a recipe item held by the selected character (issue 785).

  Chip rules that are load-bearing, not cosmetic:

  - The uses chip has THREE states — unlimited (info · infinity · "Unlimited"),
    remaining (warning · flame · "{used} of {max} uses spent") and spent (danger ·
    ban · "Spent"). `remaining === null` means UNLIMITED and must never render
    "0 left".
  - `inert` is an INDEPENDENT second chip, never folded into the uses chip. That
    makes five renderable combinations, including inert-but-not-spent — the
    visible form of the known "nothing ever clears `inert`" gap.
  - Only `spent` disables Expend. `inert` does NOT gate it, because it does not
    gate the craft path either: an inert-but-not-spent copy still has charges the
    runtime will spend, so disabling the GM's button would apply a gate the engine
    does not. An UNCAPPED copy also disables it, because expending would write
    nothing — a disabled button, never a silent no-op.
  - The spent-row dim is scoped to the identity/meta column and MUST NOT reach the
    action cluster: `.manager-button:disabled` already carries `opacity: 0.62`, so
    a row-level dim would composite the disabled Expend button to ~0.38.

  Props:
   - copy: a projected owned-copy row from `knowledgeStudio.projectOwnedCopyRow`.
   - armedToken: the surface's single armed token (mutual exclusion lives there).
   - onExpend(itemId), onDelete(itemId), onArm(token), onDisarm(token).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Medallion from '../../../components/Medallion.svelte';
  import ArmedDangerButton from '../ArmedDangerButton.svelte';
  import { USES_CHIP_SPENT, USES_CHIP_UNLIMITED } from './knowledgeStudio.js';

  let {
    copy = null,
    armedToken = '',
    onExpend = () => {},
    onDelete = () => {},
    onArm = () => {},
    onDisarm = () => {},
  } = $props();

  const deleteToken = $derived(`delete:${copy?.itemId || ''}`);

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

  // The enum `recipeItemTypeFromRecipeCount` returns is hard-coded English by
  // design (it is a diagnostic enum, not display copy), so the mapping to keys
  // happens HERE rather than by minting a second localized type vocabulary.
  // A multi-recipe item carries its own count ("3 Recipe Book"), which is why the row
  // no longer renders a separate "N recipe(s) inside" chip — that stated the same
  // number twice. `recipeItemTypeFromRecipeCount` still returns the bare enum, because
  // the Books & Scrolls type FILTER builds its options from those values and would
  // otherwise grow one option per distinct count.
  function typeLabel(type, count) {
    if (type === 'Book') {
      return fill(text('FABRICATE.Admin.Manager.Knowledge.TypeRecipeBook', '{count} Recipe Book'), {
        count: Number(count) || 0,
      });
    }
    if (type === 'Scroll') return text('FABRICATE.Admin.Manager.Knowledge.TypeScroll', 'Scroll');
    return text('FABRICATE.Admin.Manager.Knowledge.TypeIncomplete', 'Incomplete');
  }

  // Every key is a static literal at its call site so `ui-lang-keys-resolve` and
  // `lang-keys-no-orphans` can both see the leaf.
  function matchTierLabel(tier) {
    if (tier === 'identity') return text('FABRICATE.Admin.Manager.Knowledge.MatchIdentity', 'Durable match');
    if (tier === 'uuid') return text('FABRICATE.Admin.Manager.Knowledge.MatchUuid', 'Source match');
    if (tier === 'compendium') return text('FABRICATE.Admin.Manager.Knowledge.MatchCompendium', 'Compendium match');
    if (tier === 'duplicate') return text('FABRICATE.Admin.Manager.Knowledge.MatchDuplicate', 'Copy-source match');
    return '';
  }

  // The match tier is GM DIAGNOSTIC info, so only the actionable tier earns a chip:
  // `duplicate` is the low-confidence provenance tier the bulk auto-learn gate already
  // refuses. The other three would put a fourth bare, unexplained chip on every row in
  // the pane that is narrowest exactly where the geometry guard measures, so they are
  // carried in the row's title instead.
  function matchTierTitle(row) {
    const label = matchTierLabel(row.matchTier);
    if (!label) return '';
    return fill(text('FABRICATE.Admin.Manager.Knowledge.MatchTierTitle', 'Definition link: {tier}'), {
      tier: label,
    });
  }

  function duplicateMatchHint() {
    return text(
      'FABRICATE.Admin.Manager.Knowledge.MatchDuplicateHint',
      'This copy is linked to its recipe item only by duplicate-source provenance, the weakest tier. Bulk auto-learn refuses that link.'
    );
  }

  function usesChipLabel(row) {
    if (row.usesChip === USES_CHIP_UNLIMITED) {
      return text('FABRICATE.Admin.Manager.Knowledge.UsesUnlimited', 'Unlimited');
    }
    if (row.usesChip === USES_CHIP_SPENT) {
      return text('FABRICATE.Admin.Manager.Knowledge.UsesSpent', 'Spent');
    }
    return fill(
      text('FABRICATE.Admin.Manager.Knowledge.UsesRemaining', '{used} of {max} uses spent'),
      { used: row.timesUsed ?? 0, max: row.maxUses ?? 0 }
    );
  }

  function usesChipTone(row) {
    if (row.usesChip === USES_CHIP_UNLIMITED) return 'is-info';
    if (row.usesChip === USES_CHIP_SPENT) return 'is-danger';
    return 'is-warning';
  }

  function usesChipIcon(row) {
    if (row.usesChip === USES_CHIP_UNLIMITED) return 'fas fa-infinity';
    if (row.usesChip === USES_CHIP_SPENT) return 'fas fa-ban';
    return 'fas fa-fire-flame-curved';
  }

  function expendTitle(row) {
    if (row.canExpend) {
      return fill(
        text('FABRICATE.Admin.Manager.Knowledge.ExpendLabel', 'Spend one use of {name}'),
        { name: row.name }
      );
    }
    if (row.spent) {
      return text('FABRICATE.Admin.Manager.Knowledge.ExpendSpent', 'This copy is already spent.');
    }
    return text(
      'FABRICATE.Admin.Manager.Knowledge.ExpendUncapped',
      'This copy has unlimited uses, so there is nothing to spend.'
    );
  }
</script>

{#if copy}
  <li
    class="manager-knowledge-copy-row"
    class:is-spent={copy.spent}
    data-knowledge-copy={copy.itemId}
    title={matchTierTitle(copy)}
  >
    <span class="manager-knowledge-copy-identity">
      <Medallion src={copy.img} icon="fas fa-book" size={44} alt="" />
      <span class="manager-knowledge-copy-copy">
        <!-- Line 1 is the prototype's rhythm: name, type, quantity. Keeping the type
             pill here rather than in the chip row is what lets line 2 carry the whole
             state vocabulary and saves a line in the narrow band. -->
        <span class="manager-knowledge-copy-heading">
          <strong class="manager-knowledge-copy-name" title={copy.name}>{copy.name}</strong>
          <span class="manager-chip" data-knowledge-type={copy.type} data-knowledge-recipe-count={copy.recipeCount}
            >{typeLabel(copy.type, copy.recipeCount)}</span
          >
          {#if copy.quantity > 1}
            <span class="manager-chip" data-knowledge-quantity>
              {fill(text('FABRICATE.Admin.Manager.Knowledge.Quantity', '×{quantity}'), { quantity: copy.quantity })}
            </span>
          {/if}
        </span>
        <span class="manager-knowledge-copy-chips">
          <span
            class={`manager-chip ${usesChipTone(copy)}`}
            data-knowledge-uses-chip={copy.usesChip}
          >
            <i class={usesChipIcon(copy)} aria-hidden="true"></i>
            <span>{usesChipLabel(copy)}</span>
          </span>
          {#if copy.inert}
            <span class="manager-chip is-danger" data-knowledge-inert>
              <i class="fas fa-ban" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.Knowledge.Inert', 'Inert')}</span>
            </span>
          {/if}
          {#if copy.matchTier === 'duplicate'}
            <span
              class="manager-chip is-warning"
              data-knowledge-match-tier={copy.matchTier}
              title={duplicateMatchHint()}
              aria-label={duplicateMatchHint()}
            >
              <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
              <span>{matchTierLabel(copy.matchTier)}</span>
            </span>
          {/if}
        </span>
      </span>
    </span>

    <span
      class="manager-knowledge-row-actions"
      role="group"
      aria-label={text('FABRICATE.Admin.Manager.Knowledge.RowActions', 'Copy actions')}
    >
      <button
        type="button"
        class="manager-button"
        data-knowledge-expend={copy.itemId}
        disabled={!copy.canExpend}
        title={expendTitle(copy)}
        aria-label={expendTitle(copy)}
        onclick={() => onExpend(copy.itemId)}
      >
        <!-- Deliberately NOT `fa-fire-flame-curved`: that is the remaining-uses chip's
             glyph, and repeating it on the action beside it reads as the same thing. -->
        <i class="fas fa-fire" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Knowledge.Expend', 'Expend use')}</span>
      </button>
      <ArmedDangerButton
        token={deleteToken}
        armed={armedToken === deleteToken}
        idleLabel={text('FABRICATE.Admin.Manager.Knowledge.Delete', 'Delete')}
        armedLabel={text('FABRICATE.Admin.Manager.Knowledge.DeleteConfirm', 'Confirm?')}
        idleIcon="fas fa-trash"
        idleAriaLabel={fill(
          text('FABRICATE.Admin.Manager.Knowledge.DeleteLabel', 'Delete {name} from this character'),
          { name: copy.name }
        )}
        armedAriaLabel={fill(
          text(
            'FABRICATE.Admin.Manager.Knowledge.DeleteArmedLabel',
            'Confirm deleting {name}. This removes the whole document and cannot be undone.'
          ),
          { name: copy.name }
        )}
        {onArm}
        {onDisarm}
        onConfirm={() => onDelete(copy.itemId)}
      />
    </span>
  </li>
{/if}
