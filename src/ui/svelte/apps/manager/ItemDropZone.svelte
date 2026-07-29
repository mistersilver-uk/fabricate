<!-- Svelte 5 runes mode -->
<script>
  import { dragDrop } from '../../actions/dragDrop.js';

  let {
    item = null,
    title = '',
    hint = '',
    emptyIcon = 'fas fa-arrow-down-to-bracket',
    kind = '',
    disabled = false,
    copyLabel = '',
    unlinkLabel = '',
    onDrop = () => {},
    onCopy = null,
    onUnlink = null,
  } = $props();

  function handleDrop(data) {
    if (data?.type !== 'Item' || typeof data.uuid !== 'string' || !data.uuid.trim()) return;
    onDrop(data);
  }
</script>

<div
  class="manager-item-drop-zone"
  class:is-linked={Boolean(item)}
  class:is-disabled={disabled}
  data-manager-item-drop-zone
  data-item-drop-zone={kind || undefined}
  data-tool-source-card={kind === 'tool-source' ? true : undefined}
  data-tool-create-card={kind === 'tool-create' ? true : undefined}
  data-tool-create-drop-prompt={kind === 'tool-create' ? true : undefined}
  data-tool-source-layout={kind === 'tool-source' ? 'compact' : undefined}
  data-recipe-item-link={kind === 'recipe-item' && item ? true : undefined}
  data-recipe-item-dropzone={kind === 'recipe-item' && !item ? true : undefined}
  use:dragDrop={{ onDrop: handleDrop, activeClass: 'is-drop-active', disabled }}
>
  <span class="manager-item-drop-zone-icon" aria-hidden="true">
    {#if item?.img}<img src={item.img} alt="" />{:else}<i class={emptyIcon}></i>{/if}
  </span>
  <span class="manager-item-drop-zone-copy">
    <strong>{item?.name || title}</strong>
    {#if hint}<small data-tool-source-drop-hint={kind === 'tool-source' ? true : undefined}
        >{hint}</small
      >{/if}
  </span>
  {#if item && (onCopy || onUnlink)}
    <span class="manager-item-drop-zone-actions">
      {#if onCopy}
        <button
          type="button"
          class="manager-icon-button"
          aria-label={copyLabel}
          title={copyLabel}
          data-tool-source-copy-uuid={kind === 'tool-source' ? true : undefined}
          data-recipe-item-copy-uuid={kind === 'recipe-item' ? true : undefined}
          onclick={() => onCopy(item)}
        >
          <i class="fas fa-copy" aria-hidden="true"></i>
        </button>
      {/if}
      {#if onUnlink}
        <button
          type="button"
          class="manager-icon-button is-danger"
          aria-label={unlinkLabel}
          title={unlinkLabel}
          data-tool-source-unlink={kind === 'tool-source' ? true : undefined}
          data-recipe-item-unlink={kind === 'recipe-item' ? true : undefined}
          onclick={onUnlink}
        >
          <i class="fas fa-link-slash" aria-hidden="true"></i>
        </button>
      {/if}
    </span>
  {/if}
</div>
