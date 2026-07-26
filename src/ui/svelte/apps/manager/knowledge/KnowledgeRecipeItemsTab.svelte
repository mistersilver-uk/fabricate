<!-- Svelte 5 runes mode -->
<!--
  The Recipe items tab of the Knowledge surface (issue 785): the owned copies the
  selected character carries of THIS system's recipe items.

  Disclosure placement is one idea per strip, not a banner stack. This tab carries
  exactly two: a permanent info banner explaining that the surface edits play
  state and never definitions, and a CONDITIONAL warning band for the D8 ordering
  hazard — raised only when the character owns a `total`-scope (party-pool) copy
  that is the source of a still-learned entry, because the budget refund resolves
  the pool key through a still-owned source copy. Erase→Delete reclaims the slot;
  Delete→Erase never can, and the world pool is permanently short one learn.

  Props:
   - copies: projected owned-copy rows.
   - hasPartyPoolHazard: whether to raise the D8 band.
   - armedToken, onExpend, onDelete, onArm, onDisarm.
-->
<script>
  import EmptyState from '../EmptyState.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import KnowledgeOwnedCopyRow from './KnowledgeOwnedCopyRow.svelte';

  let {
    copies = [],
    hasPartyPoolHazard = false,
    armedToken = '',
    onExpend = () => {},
    onDelete = () => {},
    onArm = () => {},
    onDisarm = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
</script>

<div class="manager-knowledge-tab-body">
  <p class="manager-component-info-banner" data-knowledge-items-banner>
    <i class="fas fa-circle-info" aria-hidden="true"></i>
    <span>{text(
      'FABRICATE.Admin.Manager.Knowledge.RecipeItemsBanner',
      'Expending a use spends one charge as if the character read the item. Deleting removes the copy from their pack entirely.'
    )}</span>
  </p>

  {#if hasPartyPoolHazard}
    <p class="manager-warning-band" data-knowledge-party-pool-warning>
      <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
      <span>{text(
        'FABRICATE.Admin.Manager.Knowledge.PartyPoolWarning',
        'This character holds a party-pool copy. Erase the memory before deleting the copy — deleting the copy first strands its party-pool slot permanently.'
      )}</span>
    </p>
  {/if}

  {#if copies.length === 0}
    <EmptyState
      dataAttr="data-knowledge-items-empty"
      icon="fas fa-boxes-stacked"
      title={text('FABRICATE.Admin.Manager.Knowledge.ItemsEmptyTitle', 'No owned copies')}
      hint={text(
        'FABRICATE.Admin.Manager.Knowledge.ItemsEmptyHint',
        "This character carries none of this system's recipe items."
      )}
    />
  {:else}
    <ul class="manager-knowledge-row-list" role="list">
      {#each copies as copy (copy.itemId)}
        <KnowledgeOwnedCopyRow {copy} {armedToken} {onExpend} {onDelete} {onArm} {onDisarm} />
      {/each}
    </ul>
  {/if}
</div>
