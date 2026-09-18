<!--
  The Recipe items tab: the owned copies the selected character carries of THIS system's recipe
  items. One idea per strip, so exactly two — a permanent note that the surface edits play state and
  never definitions, and a CONDITIONAL band for the party-pool ordering hazard, raised only when the
  character owns a `total`-scope copy that still sources a learned entry. Erase→Delete reclaims that
  slot; Delete→Erase cannot, and the world pool is permanently short one learn.

  Props: copies, hasPartyPoolHazard, armedToken, onExpend, onDelete, onArm, onDisarm.
-->
<script>
  import Callout from '../../../components/Callout.svelte';
  import EmptyState from '../../../components/EmptyState.svelte';
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
  <!-- NEUTRAL, per `openspec/specs/ui-integration/spec.md` → "Standing statements": this tab also
       raises a conditional hazard below, and a loud permanent hint would spend its colour. -->
  <Callout
    tone="neutral"
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
