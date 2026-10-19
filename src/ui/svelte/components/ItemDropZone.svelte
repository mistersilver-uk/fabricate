<!--
  The manager's one document drop field: a dashed empty prompt that becomes a linked card once the
  caller passes a `value`, with optional copy and unlink actions and, on a missing link, Relink.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | `{ uuid, name, img }` \| `null` | `null` | The linked document as the caller resolved it. `null`, or a value with neither `uuid` nor `name`, draws `empty`. |
  | `state` | `'linked'` \| `'missing'` \| `'empty'` | unset | `missing` paints a link whose document no longer resolves; only the caller resolves the document. Unset draws `linked` when there is a value. |
  | `title` / `hint` / `subline` / `emptyIcon` | strings | `''` / `''` / `''` / `'fas fa-download'` | The prompt that names an empty or compact zone, the line under the name, a second line under it, and the glyph. |
  | `showUuid` | boolean | `false` | Draws the uuid line under a linked name. `missing` and a value with no name draw it whatever is passed. |
  | `onCopy(value)` / `copyLabel` | function / string | `null` / `''` | The copy action, drawn only with a handler; it receives the current `value`. |
  | `onUnlink()` / `unlinkLabel` | function / string | `null` / `''` | The unlink action, drawn only with a handler. |
  | `onRelink()` / `relinkLabel` | function / string | `null` / `''` | Relink, a `<Button>` drawn only in `missing` and only with a handler; it stamps its own `data-item-drop-zone-relink`. |
  | `compact` | boolean | `false` | A prompt, never a summary (see the invariants). |
  | `disabled` | boolean | `false` | Dims the zone, disables its actions and refuses drops. |
  | `documentType` | Foundry document name | `'Item'` | The `type` a drag must carry, so one primitive serves an Item, a Macro and a Scene. |
  | `kind` | string | `''` | A per-site id on `data-item-drop-zone`, never a branch inside this file. |
  | `hookAttrs` | bag keyed by region | `{}` | Test and styling hooks over the closed region set `root`, `hint`, `copy`, `unlink`, each an object of attribute name to value. |
  | `unlinkDataAttr` | attribute name | `''` | One unlink attribute, kept out of the bag, so a caller passing both gets both. |
  | `onDrop(data)` | function | no-op | Receives the raw drag payload after the guard; the call site resolves it with `resolveDropUuid` or `resolveDropData`. |

  Invariants:
  - The region set is closed and guarded at the source, because a bag keyed by name is silent
    about a name it does not recognise — pinned by
    `tests/components/item-drop-zone-source-contract.test.js`, which reads the names out of this
    file's own `hooksFor('…')` calls and refuses a call site naming anything else.
  - A hook's value is not normalised to a boolean: one shipped hook is a styling hook the global
    sheet writes a rule against, and another carries a string value rather than `true`.
  - No call site passes the retired `item` or `uuid` — pinned by
    `tests/components/item-drop-zone-source-contract.test.js`.
  - The drop guard reads `resolveDropUuid(data)`, not `data.uuid`. On Foundry 13 and 14 every core
    document drag, world or compendium, carries `{ type, uuid }`; a pack drag carries
    `{ type: 'Compendium', collection }`, which the `data.type` match refuses. Reading through
    `resolveDropUuid` keeps the guard no stricter than its consumers, which also accept the
    legacy `{ pack, id }` shape a third-party drag source may build — pinned by
    `tests/components/recipe-item-overview-tab-mounted.test.js`.
  - A null `value`, a value with neither `uuid` nor `name`, or `state` `empty` draws `empty`,
    named by its title — pinned by `tests/components/link-field-faces-rendered.test.js`.
  - `compact` draws a glyph over a title over a note, whatever `value` and `state` hold: it never
    draws linked or missing, and draws no identity block and no actions. It is not a density knob:
    its one caller already shows that document in full beside the target — pinned by
    `tests/components/link-field-faces-rendered.test.js`.
  - A value with no name, one whose `name` is empty or equal to its `uuid`, draws no `<strong>`:
    its uuid line stands in the name's place and names the group — pinned by
    `tests/components/link-field-faces-rendered.test.js`.
  - The root hook is written `=""` per the `data-*` spelling rule in
    `openspec/specs/design-system/spec.md`, because the root carries a spread and a bare spelling
    renders `="true"` — pinned by `tests/components/item-drop-zone-source-contract.test.js`. The
    same spread stamps the hint `<small>` with a scope class the compiled CSS never names.
  - The root is a group named by its name line and, in `missing`, described by its hint and
    subline, so the state is announced as text as well as drawn in colour — pinned by
    `tests/components/link-field-faces-rendered.test.js`.
  - A missing chip draws the alert glyph, never the document's art or the caller's glyph, because
    a broken link must not look like a working one — pinned by
    `tests/components/link-field-faces-rendered.test.js`.
-->
<script>
  import { dragDrop } from '../actions/dragDrop.js';
  import { resolveDropUuid } from '../util/dropUtils.js';
  import Button from './Button.svelte';
  import IconButton from './IconButton.svelte';
  import Medallion from './Medallion.svelte';

  let {
    value = null,
    title = '',
    hint = '',
    subline = '',
    emptyIcon = 'fas fa-download',
    compact = false,
    kind = '',
    documentType = 'Item',
    state,
    showUuid = false,
    disabled = false,
    copyLabel = '',
    unlinkLabel = '',
    unlinkDataAttr = '',
    hookAttrs = {},
    onDrop = () => {},
    onCopy = null,
    onUnlink = null,
    onRelink = null,
    relinkLabel = '',
  } = $props();

  const face = $derived.by(() => {
    if (compact) return 'compact';
    if (state === 'empty' || (!value?.uuid && !value?.name)) return 'empty';
    return state === 'missing' ? 'missing' : 'linked';
  });
  const isMissing = $derived(face === 'missing');
  const isLinked = $derived(face === 'linked' || isMissing);
  // A name that is only the uuid is no name: the uuid line stands in its place.
  const named = $derived(Boolean(value?.name) && value.name !== value.uuid);
  const showUuidLine = $derived(
    isLinked && Boolean(value.uuid) && (isMissing || showUuid || !named)
  );
  const showRelink = $derived(isMissing && Boolean(onRelink));
  const unlinkAttrs = $derived(unlinkDataAttr ? { [unlinkDataAttr]: true } : {});
  const hooksFor = (region) => hookAttrs?.[region] ?? {};
  const nameId = $props.id();
  const hintId = $derived(hookAttrs?.hint?.id || `${nameId}-hint`);
  const sublineId = `${nameId}-subline`;
  const describedBy = $derived(
    isMissing
      ? [hint && hintId, subline && sublineId].filter(Boolean).join(' ') || undefined
      : undefined
  );

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
  class:is-linked={isLinked}
  class:is-missing={isMissing}
  class:is-disabled={disabled}
  data-manager-item-drop-zone=""
  data-item-drop-zone={kind || undefined}
  data-item-drop-state={isMissing ? 'missing' : undefined}
  role="group"
  aria-labelledby={nameId}
  aria-describedby={describedBy}
  {...hooksFor('root')}
  use:dragDrop={{ onDrop: handleDrop, activeClass: 'is-drop-active', disabled }}
>
  {#if isLinked}
    <Medallion
      size={38}
      variant="glyph-chip"
      alt=""
      art={isMissing ? '' : value.img || ''}
      icon={isMissing ? 'fas fa-triangle-exclamation' : emptyIcon}
      ink={isMissing ? 'danger' : ''}
    />
  {:else}
    <span class="manager-item-drop-zone-icon" aria-hidden="true"><i class={emptyIcon}></i></span>
  {/if}
  <span class="manager-item-drop-zone-copy">
    {#if !isLinked}<strong id={nameId}>{title}</strong>
    {:else if named}<strong id={nameId}>{value.name}</strong>{/if}
    {#if showUuidLine}<code
        class="manager-item-drop-zone-uuid"
        id={named ? undefined : nameId}
        data-item-drop-zone-uuid>{value.uuid}</code
      >{/if}
    {#if hint}<small id={isMissing ? hintId : undefined} {...hooksFor('hint')}>{hint}</small>{/if}
    {#if subline}<small id={isMissing ? sublineId : undefined} data-item-drop-zone-subline
        >{subline}</small
      >{/if}
  </span>
  {#if isLinked && (showRelink || onCopy || onUnlink)}
    <span class="manager-item-drop-zone-actions">
      {#if showRelink}
        <Button data-item-drop-zone-relink="" {disabled} onclick={() => onRelink()}
          >{relinkLabel}</Button
        >
      {/if}
      {#if onCopy}
        <IconButton
          ariaLabel={copyLabel}
          title={copyLabel}
          {disabled}
          {...hooksFor('copy')}
          onclick={() => onCopy(value)}
        >
          <i class="fas fa-copy" aria-hidden="true"></i>
        </IconButton>
      {/if}
      {#if onUnlink}
        <IconButton
          class="is-danger"
          ariaLabel={unlinkLabel}
          title={unlinkLabel}
          {disabled}
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
  /* A bold host's caption would otherwise reach the title as 900 and the mono uuid as 700. */
  .manager-item-drop-zone-copy {
    font-weight: 400;
  }

  .manager-item-drop-zone-uuid {
    display: block;
    font-family: var(--fab-font-mono);
    font-size: 10px;
    color: var(--fab-text-muted);
    /* Foundry's `code` pads, offsets and keeps one unbroken line, which ran the uuid beneath the actions. */
    padding: 0;
    margin: 0;
    white-space: normal;
    word-break: normal;
    overflow-wrap: anywhere;
  }

  .manager-item-drop-zone.is-missing .manager-item-drop-zone-uuid {
    color: var(--fab-text-secondary);
  }
</style>
