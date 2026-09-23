<!--
  One owned copy of a recipe item held by the selected character. Four load-bearing chip rules:

  - The uses chip has THREE states; `remaining === null` means UNLIMITED and never renders "0 left".
  - `inert` is an INDEPENDENT second chip, never folded in, so inert-but-not-spent is renderable.
  - Only `spent` disables Expend — `inert` does not gate the craft path, so refusing here would apply
    a gate the engine does not. An UNCAPPED copy disables it too: expending would write nothing.
  - The spent-row dim is scoped to the identity/meta column and MUST NOT reach the action cluster,
    where `.manager-button:disabled`'s own `opacity: 0.62` would composite it to ~0.38.

  Props: copy, armedToken (the surface's single armed token), onExpend, onDelete, onArm, onDisarm.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import Medallion from '../../../components/Medallion.svelte';
  import ArmedDangerButton from '../../../components/ArmedDangerButton.svelte';
  import Chip from '../../../components/Chip.svelte';
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

  // `recipeItemTypeFromRecipeCount` returns a diagnostic enum, not display copy, so the mapping to
  // keys happens HERE. The count rides the label ("3 Recipe Book") instead of a second chip, while
  // the projection keeps returning the bare enum so the Books & Scrolls type FILTER stays finite.
  function typeLabel(type, count) {
    if (type === 'Book') {
      return fill(text('FABRICATE.Admin.Manager.Knowledge.TypeRecipeBook', '{count} Recipe Book'), {
        count: Number(count) || 0,
      });
    }
    if (type === 'Scroll') return text('FABRICATE.Admin.Manager.Knowledge.TypeScroll', 'Scroll');
    return text('FABRICATE.Admin.Manager.Knowledge.TypeIncomplete', 'Incomplete');
  }

  // Static literals at the call site so `ui-lang-keys-resolve` and `lang-keys-no-orphans` see them.
  function matchTierLabel(tier) {
    if (tier === 'identity')
      return text('FABRICATE.Admin.Manager.Knowledge.MatchIdentity', 'Durable match');
    if (tier === 'uuid') return text('FABRICATE.Admin.Manager.Knowledge.MatchUuid', 'Source match');
    if (tier === 'compendium')
      return text('FABRICATE.Admin.Manager.Knowledge.MatchCompendium', 'Compendium match');
    if (tier === 'duplicate')
      return text('FABRICATE.Admin.Manager.Knowledge.MatchDuplicate', 'Copy-source match');
    return '';
  }

  // Only the ACTIONABLE tier earns a chip: `duplicate` is the tier bulk auto-learn already refuses.
  // The other three ride the row's title, rather than a fourth bare chip in the narrowest pane.
  function matchTierTitle(row) {
    const label = matchTierLabel(row.matchTier);
    if (!label) return '';
    return fill(
      text('FABRICATE.Admin.Manager.Knowledge.MatchTierTitle', 'Definition link: {tier}'),
      {
        tier: label,
      }
    );
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

  // A `Chip` tone name, without the `is-` prefix the raw class carried (issue 883).
  function usesChipTone(row) {
    if (row.usesChip === USES_CHIP_UNLIMITED) return 'info';
    if (row.usesChip === USES_CHIP_SPENT) return 'danger';
    return 'warning';
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
      <Medallion art={copy.img} icon="fas fa-book" size={44} alt="" />
      <span class="manager-knowledge-copy-copy">
        <!-- The prototype's rhythm — name, type, quantity — which leaves line 2 the state chips. -->
        <span class="manager-knowledge-copy-heading">
          <strong class="manager-knowledge-copy-name" title={copy.name}>{copy.name}</strong>
          <Chip data-knowledge-type={copy.type} data-knowledge-recipe-count={copy.recipeCount}
            >{typeLabel(copy.type, copy.recipeCount)}</Chip
          >
          {#if copy.quantity > 1}
            <Chip data-knowledge-quantity>
              {fill(text('FABRICATE.Admin.Manager.Knowledge.Quantity', '×{quantity}'), {
                quantity: copy.quantity,
              })}
            </Chip>
          {/if}
        </span>
        <span class="manager-knowledge-copy-chips">
          <Chip
            tone={usesChipTone(copy)}
            icon={usesChipIcon(copy)}
            data-knowledge-uses-chip={copy.usesChip}
          >
            <span>{usesChipLabel(copy)}</span>
          </Chip>
          {#if copy.inert}
            <Chip tone="danger" icon="fas fa-ban" data-knowledge-inert>
              <span>{text('FABRICATE.Admin.Manager.Knowledge.Inert', 'Inert')}</span>
            </Chip>
          {/if}
          {#if copy.matchTier === 'duplicate'}
            <Chip
              tone="warning"
              icon="fas fa-triangle-exclamation"
              data-knowledge-match-tier={copy.matchTier}
              title={duplicateMatchHint()}
              aria-label={duplicateMatchHint()}
            >
              <span>{matchTierLabel(copy.matchTier)}</span>
            </Chip>
          {/if}
        </span>
      </span>
    </span>

    <span
      class="manager-knowledge-row-actions"
      role="group"
      aria-label={text('FABRICATE.Admin.Manager.Knowledge.RowActions', 'Copy actions')}
    >
      <ManagerButton
        data-knowledge-expend={copy.itemId}
        disabled={!copy.canExpend}
        title={expendTitle(copy)}
        aria-label={expendTitle(copy)}
        onclick={() => onExpend(copy.itemId)}
      >
        <!-- NOT `fa-fire-flame-curved`: that is the uses chip's glyph, one element away. -->
        <i class="fas fa-fire" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Knowledge.Expend', 'Expend use')}</span>
      </ManagerButton>
      <ArmedDangerButton
        token={deleteToken}
        armed={armedToken === deleteToken}
        idleLabel={text('FABRICATE.Admin.Manager.Knowledge.Delete', 'Delete')}
        armedLabel={text('FABRICATE.Admin.Manager.Knowledge.DeleteConfirm', 'Confirm?')}
        idleIcon="fas fa-trash"
        idleAriaLabel={fill(
          text(
            'FABRICATE.Admin.Manager.Knowledge.DeleteLabel',
            'Delete {name} from this character'
          ),
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
