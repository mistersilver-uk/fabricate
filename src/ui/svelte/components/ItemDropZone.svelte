<!--
  The manager's ONE document drop target: a dashed empty prompt that becomes a linked card once the
  caller resolves a document, with optional copy-uuid and unlink actions.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `documentType` | Foundry document name | `'Item'` | What the payload must carry, so the same primitive serves an Item card and a Macro card rather than growing a component per document type. |
  | `state` | `'linked'` \| `'missing'` | `'linked'` | `missing` paints a link whose document no longer resolves, which is otherwise indistinguishable from a working one. |
  | `address` / `subline` | strings | `''` | The resolved document's own address, a mono line directly UNDER the name and not a sub-line; and a SECOND sub-line under `hint`, for a card carrying both a uuid and a description. Each renders only when supplied. |
  | `compact` / `purpose` | boolean / string | `false` / `''` | A PROMPT, NEVER A SUMMARY (see the invariants); and WHAT THE ZONE IS FOR, as a per-site id on `data-item-drop-zone` rather than a branch selector. |
  | `hookAttrs` | bag keyed by region | `{}` | The test and styling hooks, over a CLOSED region set — `root`, `hint`, `copy`, `unlink` — each an object of attribute name to value. `{}` for an absent region, so a caller naming none renders byte-identically to one that passed no bag. A caller's bag need not be static: one shipped site's two hooks are two faces of ONE state. |
  | `unlinkAttr` / `onDrop(data)` | attribute name / function | `''` / no-op | ONE unlink attribute rather than a set, deliberately not folded into the bag, so a caller passing both gets both; and a handler receiving the RAW drag data, which is the shipped contract — several consumers read `pack`/`id` for provenance. |

  Invariants:
  - THE REGION SET IS CLOSED AND GUARDED AT THE SOURCE, because a bag keyed by name is otherwise
    SILENT about a name it does not recognise: a misspelled region spreads nothing and renders like
    a site that passed no hook at all. `item-drop-zone-source-contract.test.js` reads the names out
    of this file's own `hooksFor('…')` calls and refuses a call site naming anything else.
  - A HOOK'S VALUE IS NOT NORMALISED TO A BOOLEAN, and two shipped hooks are why: one is a STYLING
    hook the global sheet writes a real rule against — application-rooted and outside this
    primitive's family, so it is a named residue and a named exclusion from the host-independence
    set — and the other carries a STRING value rather than `true`.
  - THE DROP GUARD READS `resolveDropUuid(data)`, NOT `data.uuid`. A COMPENDIUM drag emits
    `{ pack, id }` and no `uuid`, so a `uuid`-only guard was STRICTER than every one of this zone's
    own consumers, each of which already resolves the payload itself.
  - `compact` SUPPRESSES THE IDENTITY BLOCK AND THE ACTIONS OUTRIGHT and renders exactly a glyph over
    a title over a note, whatever `item` holds. It is not a density knob: its two callers already
    show that document in full beside the target.
  - The root hook is written `=""` per the `data-*` spelling rule in
    `openspec/specs/design-system/spec.md`; one measured residue follows from the same spread, in
    that an element carrying one has its scope hash stamped defensively, so the hint `<small>`
    renders a `class` the compiled CSS never names.
-->
<script>
  import { dragDrop } from '../actions/dragDrop.js';
  import { resolveDropUuid } from '../util/dropUtils.js';
  import IconButton from './IconButton.svelte';

  let {
    item = null,
    title = '',
    hint = '',
    uuid = '',
    subline = '',
    emptyIcon = 'fas fa-download',
    compact = false,
    kind = '',
    documentType = 'Item',
    state = 'linked',
    disabled = false,
    copyLabel = '',
    unlinkLabel = '',
    unlinkAttr = '',
    hookAttrs = {},
    onDrop = () => {},
    onCopy = null,
    onUnlink = null,
  } = $props();

  const isMissing = $derived(Boolean(item) && state === 'missing');
  const unlinkAttrs = $derived(unlinkAttr ? { [unlinkAttr]: true } : {});
  const hooksFor = (region) => hookAttrs?.[region] ?? {};

  function handleDrop(data) {
    if (data?.type !== documentType) return;
    const uuid = resolveDropUuid(data);
    if (typeof uuid !== 'string' || !uuid.trim()) return;
    onDrop(data);
  }
</script>

<div
  class="fabricate-link-field manager-item-drop-zone"
  class:is-compact={compact}
  class:is-linked={Boolean(item) && !compact}
  class:is-missing={isMissing}
  class:is-disabled={disabled}
  data-manager-item-drop-zone=""
  data-item-drop-zone={kind || undefined}
  data-item-drop-state={isMissing ? 'missing' : undefined}
  {...hooksFor('root')}
  use:dragDrop={{ onDrop: handleDrop, activeClass: 'is-drop-active', disabled }}
>
  <span class="manager-item-drop-zone-icon" aria-hidden="true">
    {#if item?.img && !compact}<img src={item.img} alt="" />{:else}<i class={emptyIcon}></i>{/if}
  </span>
  <span class="manager-item-drop-zone-copy">
    <strong>{compact ? title : item?.name || title}</strong>
    {#if uuid && !compact}<code class="manager-item-drop-zone-uuid" data-item-drop-zone-uuid
        >{uuid}</code
      >{/if}
    {#if hint}<small {...hooksFor('hint')}>{hint}</small>{/if}
    {#if subline}<small data-item-drop-zone-subline>{subline}</small>{/if}
  </span>
  {#if item && !compact && (onCopy || onUnlink)}
    <span class="manager-item-drop-zone-actions">
      {#if onCopy}
        <IconButton
          ariaLabel={copyLabel}
          title={copyLabel}
          {...hooksFor('copy')}
          onclick={() => onCopy(item)}
        >
          <i class="fas fa-copy" aria-hidden="true"></i>
        </IconButton>
      {/if}
      {#if onUnlink}
        <IconButton
          class="is-danger"
          ariaLabel={unlinkLabel}
          title={unlinkLabel}
          {...hooksFor('unlink')}
          {...unlinkAttrs}
          onclick={onUnlink}
        >
          <i class="fas fa-link-slash" aria-hidden="true"></i>
        </IconButton>
      {/if}
    </span>
  {/if}
</div>

<style>
  .manager-item-drop-zone.is-missing {
    border-color: var(--fab-danger-border);
    color: var(--fab-danger-text);
  }

  .manager-item-drop-zone.is-missing strong {
    color: var(--fab-danger-text);
  }

  .manager-item-drop-zone-uuid {
    display: block;
    font-family: var(--fab-font-mono);
    font-size: 0.68rem;
    color: var(--fab-text-subtle);
    overflow-wrap: anywhere;
  }
</style>
