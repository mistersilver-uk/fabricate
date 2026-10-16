<!--
  Membership of a set too large to render inline: a bounded token run, a `+N more` count and a
  dashed Add over `SearchablePopover`'s multi-select panel, which counts matched-of-total.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | id[] | `[]` | The committed members. |
  | `options` / `source(query)` | `[{ id, label, meta?, img?, data? }]` / async function | `[]` / `undefined` | The candidates, or a source answering the query with an array or `{ options, total }`; the tokens read their names from `options`, so a caller with a `source` passes the members there. An `img` key draws a square `Avatar`, initials when it is empty. |
  | `commit` | `'staged'` \| `'choose'` | `'staged'` | `staged` buffers the panel's choices and writes them on Apply; `choose` is the session form, writing each choice as it is made and drawing no token run, since a session control draws its working set itself. |
  | `maxTokens` | integer | `3` | Tokens drawn before the `+N more` button, which is named "and N more" and opens the panel. |
  | `label` / `ariaLabel` | localized strings | `''` | Exactly one names the token group and the panel; `label` also draws as the group's `Kicker`. |
  | `searchLabel` / `emptyLabel` | localized strings | `Common.SetPicker.Search` / `''` | The query field's placeholder and name, and the line a panel with no candidates shows. |
  | `addLabel` / `addProps` | localized string / attribute object | `Common.SetPicker.Add` / `{}` | The dashed Add's visible name, and hooks stamped on that button itself. |
  | `loading` / `error` | boolean / localized string | `false` / `''` | Forwarded to the panel, whose one status they feed; an error disables Apply. |
  | `trigger` | snippet `{ attributes, open }` | `undefined` | Replaces the dashed Add, forwarded to `SearchablePopover`'s own `trigger`. |

  Callbacks:
  - `onChange(next, { added, removed })` — required; the whole next membership and its difference
    from `value`, once per Apply in `staged` and once per choice in `choose`.

  Rest spread:
  - `{...rest}` lands on the root, written after `class={…}`.

  Invariants:
  - In `staged` nothing writes before Apply, and Apply writes only a change. The buffer is a
    change laid over the live `value`, so a member that changes under an open panel is kept, and
    the footer states what it will add and remove. Escape, an outside press and the trigger close
    the panel and discard the buffer, returning focus to whichever button opened it; Clear is never
    disabled — pinned by `tests/components/set-picker-mounted.test.js`.
-->
<script>
  import Avatar from './Avatar.svelte';
  import Button from './Button.svelte';
  import Chip from './Chip.svelte';
  import Kicker from './Kicker.svelte';
  import SearchablePopover from './SearchablePopover.svelte';
  import { localizeOr } from '../util/localizeOr.js';
  import { membershipChange, stagedMembership } from '../util/pickerOptionModel.js';

  let {
    value = [],
    options = [],
    source = undefined,
    commit = 'staged',
    onChange,
    maxTokens = 3,
    label = '',
    ariaLabel = '',
    searchLabel = '',
    emptyLabel = '',
    addLabel = '',
    addProps = {},
    loading = false,
    error = '',
    trigger = undefined,
    class: extraClass = '',
    ...rest
  } = $props();

  const labelId = $props.id();
  let open = $state(false);
  let staging = $state(null);
  let moreButton = $state(null);
  let openedFromMore = false;

  const staged = $derived(commit !== 'choose');
  const committed = $derived(Array.isArray(value) ? value : []);
  const chosen = $derived(staged && staging ? stagedMembership(committed, staging) : committed);
  const change = $derived(membershipChange(committed, chosen));
  const dirty = $derived(change.added.length + change.removed.length > 0);
  const tokenCap = $derived(Number.isInteger(maxTokens) && maxTokens >= 0 ? maxTokens : 3);
  const tokens = $derived(committed.slice(0, tokenCap));
  const hiddenCount = $derived(committed.length - tokens.length);
  const name = $derived(label || ariaLabel);

  function tokenLabel(id) {
    return options.find((option) => option.id === id)?.label ?? String(id);
  }

  function toggled(ids, id) {
    return ids.includes(id) ? ids.filter((member) => member !== id) : [...ids, id];
  }

  // Closing discards the buffer; a close the panel's own focus saw goes back to "+N more" when
  // that opened it, after the popover has returned focus to its trigger.
  function setOpen(next) {
    open = next;
    if (next) return;
    staging = null;
    if (openedFromMore && document.activeElement?.closest?.('.fabricate-set-picker-popover')) {
      setTimeout(() => moreButton?.focus());
    }
    openedFromMore = false;
  }

  // A press on "+N more" while the panel is open is a no-op: cancelling its pointerdown drops the
  // mousedown the panel's outside-press dismissal listens for, and the click then does nothing.
  function holdPanelOpen(event) {
    if (open) event.preventDefault();
  }

  function openFromMore() {
    if (open) return;
    openedFromMore = true;
    setOpen(true);
  }

  function select(id) {
    if (staged) {
      staging = membershipChange(committed, toggled(chosen, id));
      return;
    }
    const next = toggled(committed, id);
    onChange(next, membershipChange(committed, next));
  }

  function apply(close) {
    onChange([...chosen], change);
    close();
  }
</script>

{#snippet optionRow(option)}
  {#if Object.hasOwn(option, 'img')}
    <Avatar
      art={option.img?.trim?.() ? option.img : ''}
      name={option.label}
      alt=""
      shape="square"
      size={32}
    />
  {/if}
  {#if option.meta}
    <span class="fabricate-set-picker-option-lines">
      <span class="fabricate-set-picker-option-name">{option.label}</span>
      <span class="fabricate-set-picker-option-meta">{option.meta}</span>
    </span>
  {:else}
    <span class="fabricate-set-picker-option-name">{option.label}</span>
  {/if}
  {#if chosen.includes(option.id)}
    <i class="fas fa-check fabricate-set-picker-option-check" aria-hidden="true"></i>
  {/if}
{/snippet}

{#snippet stagedFooter({ close, failed })}
  <div class="fabricate-set-picker-footer" data-set-picker-footer>
    <span
      class="fabricate-set-picker-selected"
      role="status"
      data-set-picker-pending={dirty ? '' : undefined}
      >{dirty
        ? localizeOr('FABRICATE.Common.SetPicker.Pending', '{added} to add · {removed} to remove', {
            added: change.added.length,
            removed: change.removed.length,
          })
        : localizeOr('FABRICATE.Common.SetPicker.Selected', '{count} selected', {
            count: chosen.length,
          })}</span
    >
    <div class="fabricate-set-picker-actions">
      <Button
        role="ghost"
        data-set-picker-clear=""
        onclick={() => (staging = membershipChange(committed, []))}
        >{localizeOr('FABRICATE.Common.SetPicker.Clear', 'Clear all')}</Button
      >
      <Button
        role="primary"
        data-set-picker-apply=""
        disabled={failed || !dirty}
        onclick={() => apply(close)}
        >{localizeOr('FABRICATE.Common.SetPicker.Apply', 'Apply')}</Button
      >
    </div>
  </div>
{/snippet}

{#snippet panel()}
  <SearchablePopover
    bind:open={() => open, setOpen}
    multiple
    showFilteredCount
    {options}
    {source}
    {loading}
    {error}
    {trigger}
    value={chosen}
    triggerButton={{ role: 'dashed' }}
    triggerIcon="fas fa-plus"
    triggerLabel={addLabel || localizeOr('FABRICATE.Common.SetPicker.Add', 'Add')}
    triggerProps={addProps}
    showChevron={false}
    popoverClass="fabricate-set-picker-popover"
    optionClass="fabricate-set-picker-option"
    panelLabel={name}
    filteredCountTemplate={localizeOr('FABRICATE.Common.SetPicker.Count', '{matched} of {total}')}
    searchPlaceholder={searchLabel || localizeOr('FABRICATE.Common.SetPicker.Search', 'Search…')}
    searchLabel={searchLabel || localizeOr('FABRICATE.Common.SetPicker.Search', 'Search…')}
    emptyDetail={emptyLabel}
    option={optionRow}
    footer={staged ? stagedFooter : undefined}
    onSelect={select}
  />
{/snippet}

<div class={['fabricate-set-picker', extraClass]} {...rest}>
  {#if staged}
    {#if label}<span id={labelId}><Kicker as="span">{label}</Kicker></span>{/if}
    <div
      class="fabricate-set-picker-tokens"
      role="group"
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : ariaLabel || undefined}
    >
      {#each tokens as id (id)}
        <Chip density="row" truncate title={tokenLabel(id)} data-set-picker-token={id}
          >{tokenLabel(id)}</Chip
        >
      {/each}
      {#if hiddenCount > 0}
        <Chip
          tag="button"
          density="row"
          bind:element={moreButton}
          type="button"
          data-keyboard-focus="true"
          data-set-picker-more=""
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={localizeOr('FABRICATE.Common.SetPicker.MoreName', 'and {count} more', {
            count: hiddenCount,
          })}
          onpointerdown={holdPanelOpen}
          onclick={openFromMore}
          >{localizeOr('FABRICATE.Common.SetPicker.More', '+{count} more', {
            count: hiddenCount,
          })}</Chip
        >
      {/if}
      {@render panel()}
    </div>
  {:else}
    {@render panel()}
  {/if}
</div>

<style>
  .fabricate-set-picker {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
    min-width: 0;
  }

  .fabricate-set-picker-tokens {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-1);
    min-width: 0;
  }

  .fabricate-set-picker-option-lines {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .fabricate-set-picker-option-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .fabricate-set-picker-option-meta {
    overflow: hidden;
    color: var(--fab-text-subtle);
    font-size: 0.62rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fabricate-set-picker-option-check {
    flex: 0 0 auto;
    margin-left: auto;
    color: var(--fab-accent);
  }

  /* The actions wrap below the status as one unit when the pending line leaves them no room. */
  .fabricate-set-picker-footer {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--fab-space-2);
    padding-top: var(--fab-space-1);
    border-top: 1px solid var(--fab-border);
  }

  .fabricate-set-picker-selected {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--fab-text-muted);
    font-size: 11px;
  }

  .fabricate-set-picker-actions {
    display: flex;
    flex: 0 0 auto;
    gap: var(--fab-space-2);
  }
</style>
