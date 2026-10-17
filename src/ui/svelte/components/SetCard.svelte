<!--
  A set's card: the kicker and name that say which set it is, the line naming what routes into it,
  its rows, its adder and a note, with the set's own verbs behind one kebab (library §12).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `kicker` / `name` / `namePlaceholder` | localized strings | `''` | The micro-label over the name, the set's name, and the field's placeholder while it has none. |
  | `nameLabel` / `nameProps` | localized string / attribute object | none / `{}` | The name field's accessible name, which the caller must pass; and hooks spread first on the field, or on the static name in the reserved form. |
  | `renameOn` | `'change'` \| `'input'` | `'change'` | The event that emits `onRename`; under `'change'` an input event alone emits nothing. |
  | `variant` | `'default'` \| `'reserved'` \| `'bare'` | `'default'` | `reserved` draws a lock, a static name inked by `tone`, `sources` and a reserved-role chip, with no field and no kebab; `bare` draws only `children` and `adder`. |
  | `tone` | `''` \| `'warning'` \| `'success'` \| `'danger'` | `''` | `is-<tone>`: a warning or danger edge, and the static name's ink. |
  | `reservedLabel` | localized string | `Common.SetCard.ReservedRole` | The reserved-role chip's text. |
  | `actions` / `actionsLabel` | `[{ id, label, icon?, danger?, data? }]` / localized string | `[]` / `Common.SetCard.Actions` | The kebab's items, in `ActionMenu`'s shape, and the kebab's name; no kebab while `actions` is empty. |
  | `disabled` / `element` / `class` | boolean / bindable node / class string | `false` / `null` / `''` | Inerts the field and the kebab; the root node; an extra root class. |

  Snippets:
  - `meta` — in the head, after the name.
  - `sources` — under the head: what routes into the set.
  - `children`, `adder`, `note` — the rows, the adder after them, and a closing note.

  Callbacks:
  - `onRename(name)` — the edited name; returning `false` refuses it, and the field restores `name`.
  - `onAction(id)` — the chosen kebab item's id.

  Rest spread:
  - `{...rest}` lands on the root, written after `class={…}`.

  Invariants:
  - Before a `danger` action is emitted the card picks, inside its closest `[data-set-card-scope]`,
    the next card's name field, else the previous card's, else `[data-set-card-remove-fallback]`, and
    focuses it after the menu's `tick()` once the card has left the document — pinned by
    `tests/components/set-card-mounted.test.js`.
-->
<script>
  import { tick } from 'svelte';
  import ActionMenu from './ActionMenu.svelte';
  import Chip from './Chip.svelte';
  import Kicker from './Kicker.svelte';
  import { localizeOr } from '../util/localizeOr.js';

  let {
    kicker = '',
    name = '',
    namePlaceholder = '',
    nameLabel,
    nameProps = {},
    renameOn = 'change',
    onRename = undefined,
    variant = 'default',
    tone = '',
    reservedLabel = '',
    actions = [],
    actionsLabel = '',
    onAction = () => {},
    disabled = false,
    element = $bindable(null),
    meta = undefined,
    sources = undefined,
    children = undefined,
    adder = undefined,
    note = undefined,
    class: extraClass = '',
    ...rest
  } = $props();

  const TONES = new Set(['warning', 'success', 'danger']);

  const reserved = $derived(variant === 'reserved');
  const bare = $derived(variant === 'bare');
  const items = $derived(reserved || bare || !Array.isArray(actions) ? [] : actions);
  const actionsName = $derived(
    actionsLabel ||
      localizeOr('FABRICATE.Common.SetCard.Actions', 'Actions for {name}', {
        name: name || namePlaceholder,
      })
  );
  const reservedText = $derived(
    reservedLabel || localizeOr('FABRICATE.Common.SetCard.ReservedRole', 'reserved role')
  );

  function rename(event) {
    const field = event.currentTarget;
    if (onRename?.(field.value) === false) field.value = name;
  }

  const nameFieldOf = (card) => card?.querySelector('input.fabricate-set-card-name') ?? null;

  function removalDestination() {
    const scope = element?.closest('[data-set-card-scope]');
    if (!scope) return null;
    const cards = [...scope.querySelectorAll('.fabricate-set-card')].filter(
      (card) => card.closest('[data-set-card-scope]') === scope
    );
    const at = cards.indexOf(element);
    return (
      nameFieldOf(cards[at + 1]) ||
      nameFieldOf(cards[at - 1]) ||
      scope.querySelector('[data-set-card-remove-fallback]')
    );
  }

  function choose(id) {
    const card = element;
    const destination = items.find((item) => item.id === id)?.danger ? removalDestination() : null;
    onAction(id);
    if (!destination) return;
    tick().then(() => {
      if (destination.isConnected && !card?.isConnected) destination.focus();
    });
  }
</script>

<div
  bind:this={element}
  class={[
    'fabricate-set-card',
    reserved && 'is-reserved',
    bare && 'is-bare',
    TONES.has(tone) && `is-${tone}`,
    extraClass,
  ]}
  {...rest}
>
  {#if !bare}
    <div class="fabricate-set-card-head">
      {#if kicker}<Kicker as="span">{kicker}</Kicker>{/if}
      {#if reserved}
        <span {...nameProps} class="fabricate-set-card-name is-static"
          ><i class="fas fa-lock" aria-hidden="true"></i>{name}</span
        >
      {:else}
        <input
          {...nameProps}
          type="text"
          class="fabricate-set-card-name"
          value={name}
          placeholder={namePlaceholder || undefined}
          aria-label={nameLabel}
          {disabled}
          onchange={renameOn === 'change' ? rename : undefined}
          oninput={renameOn === 'input' ? rename : undefined}
        />
      {/if}
      {#if meta}<span class="fabricate-set-card-meta">{@render meta()}</span>{/if}
      {#if items.length > 0}
        <span class="fabricate-set-card-actions">
          <ActionMenu
            {items}
            ariaLabel={actionsName}
            {disabled}
            triggerProps={{ 'data-set-card-actions': '' }}
            onSelect={choose}
          />
        </span>
      {/if}
    </div>
    {#if sources}<div class="fabricate-set-card-sources">{@render sources()}</div>{/if}
    {#if reserved}
      <div class="fabricate-set-card-role">
        <Chip tone={tone === 'danger' ? 'danger' : ''} density="row" data-set-card-reserved=""
          >{reservedText}</Chip
        >
      </div>
    {/if}
  {/if}
  {#if children}<div class="fabricate-set-card-body">{@render children()}</div>{/if}
  {#if adder}<div class="fabricate-set-card-adder">{@render adder()}</div>{/if}
  {#if note && !bare}<div class="fabricate-set-card-note">{@render note()}</div>{/if}
</div>
