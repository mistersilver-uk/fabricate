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
  import Callout from '../Callout.svelte';
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
  <!-- The permanent hint stays INFO on purpose. This tab also raises the conditional
       party-pool hazard below, and a yellow permanent hint beside a yellow conditional one
       spends the colour that is supposed to make the hazard stand out. -->
  <Callout
    text={text(
      'FABRICATE.Admin.Manager.Knowledge.RecipeItemsBanner',
      'Expending a use spends one charge as if the character read the item. Deleting removes the copy from their pack entirely.'
    )}
    dataAttr="data-knowledge-items-banner"
  />

  {#if hasPartyPoolHazard}
    <Callout
      tone="warning"
      text={text(
        'FABRICATE.Admin.Manager.Knowledge.PartyPoolWarning',
        'This character holds a party-pool copy. Erase the memory before deleting the copy — deleting the copy first strands its party-pool slot permanently.'
      )}
      dataAttr="data-knowledge-party-pool-warning"
    />
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
