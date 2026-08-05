<!-- Svelte 5 runes mode -->
<!--
  The manager's ONE document drop target: a dashed empty prompt that becomes a linked card
  once the caller resolves a document, with optional copy-uuid and unlink actions.

  ── WHAT IT ACCEPTS (issue 1036) ────────────────────────────────────────────────
  `documentType` (default `'Item'`) is the Foundry DOCUMENT NAME the payload must carry, so
  the same primitive serves an Item card and a Macro card rather than growing a second
  drop-zone component per document type.

  The uuid guard reads `resolveDropUuid(data)` rather than `data.uuid`. A COMPENDIUM drag
  emits `{ pack, id }` and NO `uuid`, and this zone's own guard was therefore STRICTER than
  its own consumers, every one of which already calls `resolveDropUuid` in its `onDrop`:
  the zone rejected a compendium drop before the consumer that would have accepted it ever
  saw it. That is the common case for a module-shipped document, not an edge one.

  `onDrop` still receives the RAW drag data, which is the shipped contract — a consumer
  resolves it itself and several read `pack`/`id` for provenance.

  ── STATE ───────────────────────────────────────────────────────────────────────
  `state` paints the linked card: `'linked'` (default) or `'missing'` for a link whose
  document no longer resolves. A broken link is otherwise indistinguishable from a working
  one, which is the failure the essence browser's needs-attention filter exists to surface.

  `subline` is a SECOND sub-line under `hint`, for a card that carries both a uuid and a
  description. It renders only when supplied, so every existing call site is unchanged.
-->
<script>
  import { dragDrop } from '../../actions/dragDrop.js';
  import { resolveDropUuid } from '../../util/dropUtils.js';

  let {
    item = null,
    title = '',
    hint = '',
    subline = '',
    emptyIcon = 'fas fa-arrow-down-to-bracket',
    kind = '',
    documentType = 'Item',
    state = 'linked',
    disabled = false,
    copyLabel = '',
    unlinkLabel = '',
    onDrop = () => {},
    onCopy = null,
    onUnlink = null,
  } = $props();

  const isMissing = $derived(Boolean(item) && state === 'missing');

  function handleDrop(data) {
    if (data?.type !== documentType) return;
    // `resolveDropUuid` covers BOTH shipped drag shapes — `{ uuid }` from the world
    // sidebar and `{ pack, id }` from a compendium. The guard only decides whether the
    // payload names a document at all; `onDrop` still receives the raw data.
    const uuid = resolveDropUuid(data);
    if (typeof uuid !== 'string' || !uuid.trim()) return;
    onDrop(data);
  }
</script>

<div
  class="manager-item-drop-zone"
  class:is-linked={Boolean(item)}
  class:is-missing={isMissing}
  class:is-disabled={disabled}
  data-manager-item-drop-zone
  data-item-drop-zone={kind || undefined}
  data-item-drop-state={isMissing ? 'missing' : undefined}
  data-tool-source-card={kind === 'tool-source' ? true : undefined}
  data-tool-create-card={kind === 'tool-create' ? true : undefined}
  data-tool-create-drop-prompt={kind === 'tool-create' ? true : undefined}
  data-tool-source-layout={kind === 'tool-source' ? 'compact' : undefined}
  data-recipe-item-link={kind === 'recipe-item' && item ? true : undefined}
  data-recipe-item-dropzone={kind === 'recipe-item' && !item ? true : undefined}
  data-check-macro-dropzone={kind === 'check-macro' ? true : undefined}
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
    {#if subline}<small data-item-drop-zone-subline>{subline}</small>{/if}
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
          data-unlink-macro={kind === 'check-macro' ? true : undefined}
          onclick={onUnlink}
        >
          <i class="fas fa-link-slash" aria-hidden="true"></i>
        </button>
      {/if}
    </span>
  {/if}
</div>

<style>
  /* The MISSING treatment (issue 1036). The primitive had no such state: a link whose
     document has been deleted rendered exactly like a working one, so the only way to find
     one was to click it. Edge and foreground only, so it composes with whatever geometry
     the global sheet gives a given `kind` rather than restating it.

     Scoped rather than global on purpose: a global-sheet edit matches the broad
     `theme-or-global-ui` screenshot recipe and would demand a wide frame set for a
     one-state addition. Written at two classes so it beats the base
     `.fabricate-manager .manager-item-drop-zone` rule it overrides. */
  .manager-item-drop-zone.is-missing {
    border-color: var(--fab-danger-border);
    color: var(--fab-danger-text);
  }

  .manager-item-drop-zone.is-missing strong {
    color: var(--fab-danger-text);
  }
</style>
