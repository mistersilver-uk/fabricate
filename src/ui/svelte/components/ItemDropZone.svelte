<!--
  The manager's ONE document drop target: a dashed empty prompt that becomes a linked card once the
  caller resolves a document, with optional copy-uuid and unlink actions.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `documentType` | Foundry document name | `'Item'` | What the payload must carry, so the same primitive serves an Item card and a Macro card rather than growing a component per document type. |
  | `state` | `'linked'` \| `'missing'` | `'linked'` | `missing` paints a link whose document no longer resolves. A broken link is otherwise indistinguishable from a working one. |
  | `address` | string | `''` | The resolved document's own address, a mono line directly UNDER the name. It is NOT a sub-line and does not displace one: the rule that a sub-line "never restates the raw uuid" is about the SUMMARY slot, which still instructs. |
  | `subline` | string | `''` | A SECOND sub-line under `hint`, for a card carrying both a uuid and a description. Renders only when supplied. |
  | `compact` | boolean | `false` | A PROMPT, NEVER A SUMMARY; see the invariants. |
  | `purpose` | string | `''` | WHAT THE ZONE IS FOR, as a per-site id on `data-item-drop-zone`. It is NO LONGER a branch selector: every attribute it used to switch on is a caller's own `hookAttrs` entry. |
  | `hookAttrs` | bag keyed by region | `{}` | The test and styling hooks, over a CLOSED region set — `root`, `hint`, `copy`, `unlink` — each an object of attribute name to value, spread onto that region. `{}` for an absent region, so a caller naming none renders byte-identically to one that passed no bag. A caller's bag is NOT necessarily static: one shipped site's two hooks are two faces of ONE state, so it derives its bag from its own link state, where a static object would render both attributes or neither. |
  | `unlinkAttr` | attribute name | `''` | ONE attribute rather than a set, and deliberately NOT folded into the bag: three callers pass it, and a caller passing both gets both. |
  | `onDrop(data)` | function | no-op | Receives the RAW drag data, which is the shipped contract — several consumers read `pack`/`id` for provenance. |

  Invariants:
  - THE REGION SET IS CLOSED AND GUARDED AT THE SOURCE, because a bag keyed by name is otherwise
    SILENT about a name it does not recognise: a misspelled region spreads nothing and renders
    exactly like a site that passed no hook at all.
    `item-drop-zone-source-contract.test.js` reads the names out of this file's own `hooksFor('…')`
    calls and refuses a call site naming anything else.
  - A HOOK'S VALUE IS NOT NORMALISED TO A BOOLEAN, and two shipped hooks are why. One is a STYLING
    hook the global sheet writes a real rule against, so dropping or renaming it narrows a shipped
    prompt VISIBLY — it is also application-rooted and outside this primitive's family, which
    leaves the family HOST-DEPENDENT for that one caller: a named residue and a named exclusion
    from the host-independence set. The other carries a STRING value rather than `true`.
  - THE DROP GUARD READS `resolveDropUuid(data)`, NOT `data.uuid`. A COMPENDIUM drag emits
    `{ pack, id }` and no `uuid`, so a `uuid`-only guard was STRICTER than every one of this
    zone's own consumers, each of which already resolves the payload itself — the zone rejected a
    compendium drop before the consumer that would have accepted it ever saw it, which is the
    common case for a module-shipped document rather than an edge one.
  - `compact` SUPPRESSES THE IDENTITY BLOCK AND THE ACTIONS OUTRIGHT and renders exactly a glyph
    over a title over a note, whatever `item` holds. It is not a density knob: its two callers
    already show that document in full beside the target, so the default form would draw the
    linked item a second time in the same card.
  - A BARE ATTRIBUTE ON AN ELEMENT THAT HAS GROWN A SPREAD ARRIVES AS BOOLEAN `true` and renders
    `="true"`, which is why this component's own root hook is written `=""`. The same mechanism
    leaves one measured residue: an element carrying a spread has its scope hash stamped
    defensively, so the hint `<small>` renders a `class` the compiled CSS never names.
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
  /**
   * One region's hooks, or `{}` — `EditorValidationSurface`'s own `hooksFor` verbatim, so one
   * source-contract shape guards both bags.
   *
   * @param {'root'|'hint'|'copy'|'unlink'} region One of the closed region set.
   * @returns {Record<string, unknown>} The attributes to spread onto that region.
   */
  const hooksFor = (region) => hookAttrs?.[region] ?? {};

  function handleDrop(data) {
    if (data?.type !== documentType) return;
    // `resolveDropUuid` covers BOTH shipped drag shapes. The guard only decides whether the
    // payload names a document at all; `onDrop` still receives the raw data.
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
  /* The MISSING treatment: a link whose document no longer resolves reads as a warning rather
     than as a working link, which is the failure a needs-attention filter exists to surface. */
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
