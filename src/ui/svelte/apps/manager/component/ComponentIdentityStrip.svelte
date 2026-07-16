<!-- Svelte 5 runes mode -->
<!--
  The component editor's identity strip (issue 676): the linked source item's image,
  name and description, plus its source actions. It REPLACES `ComponentSourceInspector`,
  which lived in the right rail decision 4 removed.

  ── SOURCE ACTIONS ARE NOT DRAFT EDITS ───────────────────────────────────────────
  The highest-risk thing in this change. Decision 4's rationale ("the body saves
  through the form; the rail sits outside it") invites unifying the two mental models
  by staging the source swap into the draft. THAT MUST NOT HAPPEN.

  `services.onReplaceSource` -> `CraftingSystemManager.replaceItemSource` is not a
  field write: it resolves the dropped uuid, validates the document is an Item, builds
  a source snapshot, runs a cross-component conflict check, rebuilds `aliasItemUuids`,
  RESTAMPS THE DURABLE ROLES MAP (`_clearSourceFlag` on the old uuid then
  `_stampSourceIdentity` on the new, keyed by `_componentRoleFlagKey(system.id)`), and
  then does an immediate committed `save()`.

  Stage that into the draft instead and `buildUpdates()` carries source fields through
  `updateItem`, which skips the restamping entirely: `flags.fabricate.roles[systemId].componentId`
  is left on the OLD item, component identity silently degrades to the raw-reference
  tier of `resolveComponentForItem`, NO TEST FAILS, and crafting goes subtly wrong
  later in a different surface with no trace back here.

  So: this component DELEGATES to the existing `services.on*` props exactly as the old
  inspector did. Source fields never enter `isDirty()`, `draftSignature` or
  `buildUpdates()`. Swap and unlink COMMIT IMMEDIATELY.

  Accepted residual: decision 4 cannot fully unify the two mental models. Swap/unlink
  still commit immediately while everything around them stages, and the rail's POSITION
  used to be the signal carrying that distinction. Removing the rail removes the signal,
  so the strip carries it in its own copy instead (the premise note, and immediate-action
  framing on the actions themselves).

  ── READ THE LIVE PROP, NEVER A SEEDED COPY ──────────────────────────────────────
  `ComponentEditView` re-seeds its drafts only when `componentKey` changes
  (`id|tagOptions.length|essenceOptions.length`). A source swap changes name/img/
  registeredItemUuid but NOT the id and not the option counts — so the key does NOT
  change. Seed name/icon/description into `$state` here and a SUCCESSFUL swap will not
  re-render: the GM sees the old item and concludes the drop failed. Everything below
  is `$derived` off the live prop.

  That same non-firing re-seed gate is what protects an unsaved tags draft from being
  clobbered by a swap.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { dragDrop } from '../../../actions/dragDrop.js';
  import SearchablePopover from '../SearchablePopover.svelte';

  let {
    component = null,
    saving = false,
    onReplaceSource = () => {},
    onUnlinkSource = () => {},
    onOpenSource = () => {},
    onCopySourceUuid = () => {}
  } = $props();

  // Source linkage is projected onto the component row by the admin store, so this
  // reads it directly — no async item resolution like the recipe item.
  const hasRegisteredItemUuid = $derived(Boolean(component?.hasRegisteredItemUuid));
  const sourceMissing = $derived(Boolean(component?.sourceMissing));
  const registeredItemUuid = $derived(String(component?.registeredItemUuidDisplay || ''));
  const sourceName = $derived(String(component?.name || '') || registeredItemUuid);

  // TWO negative states, not one. `sourceMissing` (the stored uuid no longer resolves)
  // and `hasRegisteredItemUuid === false` (never linked). The strip's whole premise —
  // "name, image & description follow the linked item" — is MEANINGLESS when unlinked,
  // and an all-inert overflow would be a dead affordance, so the unlinked state is
  // dropzone-forward with the premise note suppressed and no overflow at all.
  const unlinked = $derived(!hasRegisteredItemUuid);
  const showPremiseNote = $derived(hasRegisteredItemUuid && !sourceMissing);
  const showOverflow = $derived(hasRegisteredItemUuid);

  // ── THE DROP TARGET IS THE WHOLE STRIP ─────────────────────────────────────────
  // Only the inner zone used to react, so a GM dragging an item over the strip's
  // heading — the obvious place to aim, and most of the strip's area — got no feedback
  // at all and had to find the small inner box. `dragDrop` is therefore attached at
  // SECTION level and is the single drop handler: nesting a second one inside would
  // double-fire on the bubbling drop.
  //
  // `onActiveChange` (not just `activeClass`) because the swap is not purely a CSS
  // hover state: the icon and the copy change too, and those live in this component.
  let dropActive = $state(false);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // The overflow carries only UNLINK + COPY UUID — rare and destructive, which is what
  // a kebab is for. Open-sheet stays on the source NAME, where it is today and where
  // the prototype renders it: it is the common action, and burying it would trade a
  // real affordance for an unprecedented one.
  const overflowOptions = $derived([
    {
      id: 'copy-source',
      label: text('FABRICATE.Admin.Manager.Component.CopySource', 'Copy source UUID'),
      icon: 'fas fa-copy'
    },
    {
      id: 'unlink-source',
      label: text('FABRICATE.Admin.Manager.Component.SourceCard.Unlink', 'Unlink Source Item'),
      icon: 'fas fa-link-slash'
    }
  ]);

  // Commits immediately — the admin store validates the drop payload, mirroring the
  // recipe item drop zone.
  function handleSourceDrop(data) {
    if (!component?.id) return;
    onReplaceSource(component.id, data);
  }

  function unlinkSource() {
    if (!component?.id) return;
    onUnlinkSource(component.id);
  }

  function onLinkedSourceMouseDown(event) {
    if (event.button !== 2) return;
    event.preventDefault();
    unlinkSource();
  }

  function openSource() {
    if (registeredItemUuid) onOpenSource(registeredItemUuid);
  }

  function copySourceUuid() {
    if (registeredItemUuid) onCopySourceUuid(registeredItemUuid);
  }

  function chooseOverflow(id) {
    if (id === 'unlink-source') unlinkSource();
    if (id === 'copy-source') copySourceUuid();
  }
</script>

<!-- BOTH `data-component-edit-section` hooks are preserved verbatim across the rebuild:
     `scripts/foundry-test-run.mjs` hard-waits on "identity" AND on "source", and the
     "source" wait aborts Phase D0 before EVERY downstream frame. A failing smoke step
     is never waivable, and none of this is visible to `npm test`.

     They were two separate cards (a body section and a rail inspector); the strip
     merges them, so the outer card keeps "identity" and the source-linkage block below
     keeps "source". -->
<section
  class="manager-task-core-card manager-component-identity-strip"
  data-component-edit-section="identity"
  data-component-identity-drop-active={dropActive}
  use:dragDrop={{
    onDrop: handleSourceDrop,
    activeClass: 'is-drop-active',
    onActiveChange: (active) => { dropActive = active; }
  }}
>
  <div class="manager-task-card-heading">
    <div>
      <h3>{text('FABRICATE.Admin.Manager.Component.Identity.Title', 'Identity')}</h3>
      {#if showPremiseNote}
        <p class="manager-muted" data-component-identity-premise>
          {text('FABRICATE.Admin.Manager.Component.Identity.SourceBackedHint', 'This component is backed by a Foundry item. Changes to its source item’s name, image, or description will be reflected here.')}
        </p>
      {:else if unlinked}
        <p class="manager-muted" data-component-identity-unlinked-hint>
          {text('FABRICATE.Admin.Manager.Component.Identity.UnlinkedHint', 'This component has no linked Foundry item, so it has no name, image or description to follow. Drop one below to link it.')}
        </p>
      {/if}
    </div>
    {#if showOverflow}
      <!-- SearchablePopover is the house action-menu vehicle and is PORTALED to the
           `.fabricate-manager` host, so it escapes the panel's `overflow: hidden`. A
           naive absolutely-positioned menu clips inside a scrolling column — which is
           exactly what decision 4's single-column editor creates. -->
      <SearchablePopover
        options={overflowOptions}
        showSearch={false}
        showChevron={false}
        disabled={saving}
        triggerClass="manager-icon-button manager-component-overflow-trigger"
        triggerIcon="fas fa-ellipsis-vertical"
        triggerTitle={text('FABRICATE.Admin.Manager.Component.SourceActions', 'Source actions')}
        triggerAriaLabel={text('FABRICATE.Admin.Manager.Component.SourceActions', 'Source actions')}
        popoverClass="manager-component-overflow-popover"
        onChoose={chooseOverflow}
      />
    {/if}
  </div>

  <div class="manager-component-source-block" data-component-edit-section="source">
  {#if hasRegisteredItemUuid}
    <!-- Drop-to-replace and right-click-to-unlink are ENHANCEMENTS; the overflow's
         Unlink and the name's Open provide the accessible path. -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="manager-environment-scene-linked manager-component-source-linked"
      data-component-edit-action="replace-source"
      data-component-source-linked
      role="group"
      aria-label={text('FABRICATE.Admin.Manager.Component.SourceCard.Title', 'Linked Source Item')}
      title={text('FABRICATE.Admin.Manager.Component.SourceCard.ReplaceHint', 'Drop a Foundry item to replace it, or right-click to unlink.')}
      oncontextmenu={(event) => { event.preventDefault(); unlinkSource(); }}
      onmousedown={onLinkedSourceMouseDown}
    >
      {#if dropActive}
        <!-- Under a drag the strip stops describing the CURRENT link and describes what
             releasing will do — the swap is destructive-ish (it restamps the roles map
             and commits immediately), so it says so before the drop, not after. -->
        <span class="manager-environment-scene-thumb is-placeholder" aria-hidden="true"><i class="fas fa-arrow-down-to-bracket"></i></span>
      {:else if sourceMissing}
        <span class="manager-environment-scene-thumb is-placeholder" aria-hidden="true"><i class="fas fa-link-slash"></i></span>
      {:else if component?.img}
        <img class="manager-environment-scene-thumb" src={component.img} alt="" />
      {:else}
        <span class="manager-environment-scene-thumb is-placeholder" aria-hidden="true"><i class="fas fa-box-open"></i></span>
      {/if}
      {#if dropActive}
        <span class="manager-environment-scene-name manager-muted" data-component-source-release>{text('FABRICATE.Admin.Manager.Component.SourceCard.ReleaseToSwap', 'Release to swap the linked item')}</span>
      {:else if sourceMissing}
        <span class="manager-environment-scene-name manager-muted" data-component-source-unresolved>{text('FABRICATE.Admin.Manager.Component.SourceCard.MissingLabel', 'Source item unresolved')}</span>
      {:else}
        <button
          type="button"
          class="manager-environment-scene-name"
          data-component-edit-action="open-source"
          onclick={(event) => { event.stopPropagation(); openSource(); }}
          title={text('FABRICATE.Admin.Manager.Component.SourceCard.Open', 'Open Source Item')}
        >{sourceName}</button>
      {/if}
    </div>
    {#if sourceMissing}
      <p class="manager-muted" data-component-source-missing-hint>{text('FABRICATE.Admin.Manager.Component.SourceMissingHint', 'The stored source no longer resolves. Replace the component source or verify the original compendium/world item still exists.')}</p>
    {/if}
  {:else}
    <!-- The unlinked state, dropzone-forward. -->
    <div
      class="manager-environment-scene-dropzone manager-component-source-drop-target"
      data-component-edit-action="replace-source"
      data-component-source-dropzone
    >
      <i class={dropActive ? 'fas fa-arrow-down-to-bracket' : 'fas fa-box'} aria-hidden="true"></i>
      <span>{dropActive
        ? text('FABRICATE.Admin.Manager.Component.SourceCard.ReleaseToSwap', 'Release to swap the linked item')
        : text('FABRICATE.Admin.Manager.Component.SourceCard.NoSourceHint', 'Drop or replace a Foundry item to link this component to a source.')}</span>
    </div>
  {/if}
  </div>

  <!-- The name/description the linked item provides, read from the LIVE prop. -->
  <div class="manager-component-identity-fields">
    <div class="manager-field manager-component-readonly-field">
      <span class="manager-component-readonly-label">
        <i class="fas fa-lock" aria-hidden="true" title={text('FABRICATE.Admin.Manager.Component.Identity.LockedFieldTooltip', "Provided by the linked Foundry item and can't be edited here.")}></i>
        <span>{text('FABRICATE.Admin.Manager.Component.Identity.NameLabel', 'Name')}</span>
      </span>
      <p class="manager-component-readonly-value" data-component-edit-field="name">{component?.name || '—'}</p>
    </div>

    <div class="manager-field manager-component-readonly-field">
      <span class="manager-component-readonly-label">
        <i class="fas fa-lock" aria-hidden="true" title={text('FABRICATE.Admin.Manager.Component.Identity.LockedFieldTooltip', "Provided by the linked Foundry item and can't be edited here.")}></i>
        <span>{text('FABRICATE.Admin.Manager.Component.Identity.DescriptionLabel', 'Description')}</span>
      </span>
      <p class="manager-component-readonly-value is-multiline" data-component-edit-field="description">{component?.description || '—'}</p>
    </div>
  </div>
</section>
