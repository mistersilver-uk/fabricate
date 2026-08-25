<!-- Svelte 5 runes mode -->
<!--
  World > Rules & Resources > Character prerequisites.

  The prerequisite library is WORLD scope (issue 1308): one pool of pass/fail conditions that
  every crafting system's books, scrolls and tools gate on. This is the one place they are
  authored.

  The page is a THIN shell around `system/CharacterPrerequisitesCard.svelte` rather than a
  re-authoring of it (issue 1311). The card was already a self-contained editor on the System
  Settings tab; all this route changes is where it hangs and who owns the announcement it can
  no longer delegate to a page that renders both libraries at once.

  What the shell owns is the polite live region for a completed reorder. The card reports the
  move and this page announces it, because the announcement belongs to the ROUTE the GM is
  looking at, and its twin on World > Modifiers is a different route entirely.

  GM-only by construction: the whole crafting manager admin is GM-scoped.
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
    // Called with (fromIndex, toIndex, name). Array order IS the persisted order, so no new
    // field is threaded; this page announces the move once the store op resolves.
    onReorder = async () => {},
    onSeedPresets = async () => {},
    // Cross-library copy (issue 768, re-seated by issue 1311). The RAW entry goes out and
    // nothing else happens here: the destination list is a sibling ROUTE now, so completing
    // the copy is a navigation, which only the router above this page can perform. It owns
    // the mapping, the destination add, the route change and the announcement.
    onCopyToModifier = () => {},
    // The router requests opening a freshly-copied entry in edit mode; the nonce forces the
    // card's effect to re-fire even when the same id is requested twice.
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
