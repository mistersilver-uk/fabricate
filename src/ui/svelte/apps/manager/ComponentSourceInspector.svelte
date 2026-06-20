<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { dragDrop } from '../../actions/dragDrop.js';

  let {
    component = null,
    onReplaceSource = () => {},
    onUnlinkSource = () => {},
    onOpenSource = () => {},
    onCopySourceUuid = () => {}
  } = $props();

  // Source linkage is projected onto the component row by the admin store, so the
  // inspector reads it directly — no async item resolution like the recipe item.
  const hasSourceUuid = $derived(Boolean(component?.hasSourceUuid));
  const sourceMissing = $derived(Boolean(component?.sourceMissing));
  const sourceUuid = $derived(String(component?.sourceUuidDisplay || ''));
  const sourceName = $derived(String(component?.name || '') || sourceUuid);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // Drop a Foundry Item to link/replace it. The admin store validates the drop
  // payload, mirroring the recipe item drop zone behaviour.
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
    if (sourceUuid) onOpenSource(sourceUuid);
  }

  function copySourceUuid() {
    if (sourceUuid) onCopySourceUuid(sourceUuid);
  }
</script>

<section class="manager-inspector-card" data-component-edit-section="source">
  <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Component.SourceCard.Title', 'Linked Source Item')}</h3>
  {#if hasSourceUuid}
    <!-- Drop-to-replace and right-click-to-unlink are enhancements; the visible
         Open/Unlink buttons inside provide the accessible path. -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="manager-environment-scene-linked"
      data-component-edit-action="replace-source"
      data-component-source-linked
      role="group"
      aria-label={text('FABRICATE.Admin.Manager.Component.SourceCard.Title', 'Linked Source Item')}
      title={text('FABRICATE.Admin.Manager.Component.SourceCard.ReplaceHint', 'Drop a Foundry item to replace it, or right-click to unlink.')}
      use:dragDrop={{ onDrop: handleSourceDrop, activeClass: 'is-drop-active' }}
      oncontextmenu={(event) => { event.preventDefault(); unlinkSource(); }}
      onmousedown={onLinkedSourceMouseDown}
    >
      {#if sourceMissing}
        <span class="manager-environment-scene-thumb is-placeholder" aria-hidden="true"><i class="fas fa-link-slash"></i></span>
      {:else if component?.img}
        <img class="manager-environment-scene-thumb" src={component.img} alt="" />
      {:else}
        <span class="manager-environment-scene-thumb is-placeholder" aria-hidden="true"><i class="fas fa-box-open"></i></span>
      {/if}
      {#if sourceMissing}
        <span class="manager-environment-scene-name manager-muted" data-component-source-unresolved>{text('FABRICATE.Admin.Manager.Component.SourceCard.MissingLabel', 'Source item unresolved')}</span>
      {:else}
        <button type="button" class="manager-environment-scene-name" data-component-edit-action="open-source" onclick={(event) => { event.stopPropagation(); openSource(); }} title={text('FABRICATE.Admin.Manager.Component.SourceCard.Open', 'Open Source Item')}>{sourceName}</button>
      {/if}
      <button type="button" class="manager-icon-button" data-component-edit-action="copy-source" aria-label={text('FABRICATE.Admin.Manager.Component.CopySource', 'Copy source UUID')} title={text('FABRICATE.Admin.Manager.Component.CopySource', 'Copy source UUID')} disabled={!sourceUuid} onclick={(event) => { event.stopPropagation(); copySourceUuid(); }}><i class="fas fa-copy" aria-hidden="true"></i></button>
      <button type="button" class="manager-icon-button is-danger" data-component-edit-action="unlink-source" aria-label={text('FABRICATE.Admin.Manager.Component.SourceCard.Unlink', 'Unlink Source Item')} title={text('FABRICATE.Admin.Manager.Component.SourceCard.Unlink', 'Unlink Source Item')} onclick={(event) => { event.stopPropagation(); unlinkSource(); }}><i class="fas fa-link-slash" aria-hidden="true"></i></button>
    </div>
    {#if sourceMissing}
      <p class="manager-muted" data-component-source-missing-hint>{text('FABRICATE.Admin.Manager.Component.SourceMissingHint', 'The stored source no longer resolves. Replace the component source or verify the original compendium/world item still exists.')}</p>
    {/if}
  {:else}
    <div class="manager-environment-scene-dropzone" data-component-edit-action="replace-source" data-component-source-dropzone use:dragDrop={{ onDrop: handleSourceDrop, activeClass: 'is-drop-active' }}>
      <i class="fas fa-box" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Component.SourceCard.NoSourceHint', 'Drop or replace a Foundry item to link this component to a source.')}</span>
    </div>
  {/if}
</section>
