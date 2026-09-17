<!--
  World > Rules & Resources > Character prerequisites: the WORLD-scope pool of pass/fail conditions
  every crafting system's books, scrolls and tools gate on, authored in one place.

  A THIN shell around `system/CharacterPrerequisitesCard.svelte`, which was already a self-contained
  editor; the route changes only where the card hangs and who owns the announcement. The shell owns
  the polite live region for a completed reorder, because the announcement belongs to the ROUTE the
  GM is looking at and its twin on World > Modifiers is a different route entirely.
-->
<script>
  import CharacterPrerequisitesCard from '../system/CharacterPrerequisitesCard.svelte';
  import { reorderAnnouncementText } from '../../../util/listReorderAnnouncement.js';

  let {
    library = [],
    presetsSupported = false,
    onAdd = async () => null,
    onUpdate = async () => {},
    onDelete = async () => {},
    // (fromIndex, toIndex, name). Array order IS the persisted order, so no field is threaded.
    onReorder = async () => {},
    onSeedPresets = async () => {},
    // Cross-library copy: the RAW entry goes out and nothing else happens here. The destination
    // list is a sibling ROUTE, so the router owns the mapping, the add, the move and the announce.
    onCopyToModifier = () => {},
    // Opens a freshly-copied entry in edit mode; the nonce re-fires the effect for a repeat id.
    requestOpenId = '',
    requestOpenNonce = 0,
  } = $props();

  let reorderAnnouncement = $state('');
  async function handleReorder(fromIndex, toIndex, name) {
    await onReorder(fromIndex, toIndex, name);
    reorderAnnouncement = reorderAnnouncementText(name, toIndex + 1, library.length);
  }
</script>

<div class="manager-world-prerequisites" data-world-prerequisites-page>
  <div class="visually-hidden" role="status" aria-live="polite" data-list-reorder-announcement>
    {reorderAnnouncement}
  </div>
  <CharacterPrerequisitesCard
    {library}
    {presetsSupported}
    {onAdd}
    {onUpdate}
    {onDelete}
    {onSeedPresets}
    {onCopyToModifier}
    {requestOpenId}
    {requestOpenNonce}
    onReorder={handleReorder}
  />
</div>
