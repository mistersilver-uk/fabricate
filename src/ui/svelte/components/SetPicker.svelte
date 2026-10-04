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
  | `label` / `ariaLabel` | localized strings | `''` | Exactly one names the token group and the panel; `label` also draws as the group's kicker. |
  | `searchLabel` / `emptyLabel` | localized strings | `Common.SetPicker.Search` / `''` | The query field's placeholder and name, and the line a panel with no candidates shows. |
  | `loading` / `error` | boolean / localized string | `false` / `''` | Forwarded to the panel, which replaces its list with either; an error disables Apply. |
  | `trigger` | snippet `{ attributes, open }` | `undefined` | Replaces the dashed Add, forwarded to `SearchablePopover`'s own `trigger`. |

  Callbacks:
  - `onChange(next, { added, removed })` — required; the whole next membership and its difference
    from `value`, once per Apply in `staged` and once per choice in `choose`.

  Rest spread:
  - `{...rest}` lands on the root, written after `class={…}`.

  Invariants:
  - In `staged` nothing writes before Apply, and Apply writes only a change; Escape, an outside
    press and the trigger itself close the panel and DISCARD the buffer; Clear empties the buffer
    and is never disabled — pinned by `tests/components/set-picker-mounted.test.js`.
-->
<script>
  import Avatar from './Avatar.svelte';
  import Button from './Button.svelte';
  import Chip from './Chip.svelte';
  import SearchablePopover from './SearchablePopover.svelte';
  import { localizeOr } from '../util/localizeOr.js';
  import { membershipChange } from '../util/pickerOptionModel.js';

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
    loading = false,
    error = '',
    trigger = undefined,
    class: extraClass = '',
    ...rest
  } = $props();

  const labelId = $props.id();
  let open = $state(false);
  let buffer = $state(null);

  const staged = $derived(commit !== 'choose');
  const committed = $derived(Array.isArray(value) ? value : []);
  const chosen = $derived(staged && buffer ? buffer : committed);
  const change = $derived(membershipChange(committed, chosen));
  const dirty = $derived(change.added.length + change.removed.length > 0);
  const tokenCap = $derived(Number.isInteger(maxTokens) && maxTokens >= 0 ? maxTokens : 3);
  const tokens = $derived(committed.slice(0, tokenCap));
  const hiddenCount = $derived(committed.length - tokens.length);
  const name = $derived(label || ariaLabel);

  $effect(() => {
    if (!open) buffer = null;
  });

  function tokenLabel(id) {
    return options.find((option) => option.id === id)?.label ?? String(id);
  }

  function toggled(ids, id) {
    return ids.includes(id) ? ids.filter((member) => member !== id) : [...ids, id];
  }

  function select(id) {
    if (staged) {
      buffer = toggled(chosen, id);
      return;
    }
    const next = toggled(committed, id);
    onChange(next, membershipChange(committed, next));
  }

  function apply(close, failed) {
    if (failed || error || !dirty) return;
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
    <span class="fabricate-set-picker-selected" role="status"
      >{localizeOr('FABRICATE.Common.SetPicker.Selected', '{count} selected', {
        count: chosen.length,
      })}</span
    >
    <Button role="ghost" data-set-picker-clear="" onclick={() => (buffer = [])}
      >{localizeOr('FABRICATE.Common.SetPicker.Clear', 'Clear')}</Button
    >
    <Button
      role="primary"
      data-set-picker-apply=""
      disabled={failed || Boolean(error) || !dirty}
      onclick={() => apply(close, failed)}
      >{localizeOr('FABRICATE.Common.SetPicker.Apply', 'Apply')}</Button
    >
  </div>
{/snippet}

{#snippet panel()}
  <SearchablePopover
    bind:open
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
    triggerLabel={localizeOr('FABRICATE.Common.SetPicker.Add', 'Add')}
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
    {#if label}<span class="fabricate-set-picker-label" id={labelId}>{label}</span>{/if}
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
        <button
          type="button"
          class="fabricate-set-picker-more"
          data-keyboard-focus="true"
          data-set-picker-more
          aria-label={localizeOr('FABRICATE.Common.SetPicker.MoreName', 'and {count} more', {
            count: hiddenCount,
          })}
          onclick={() => (open = true)}
          >{localizeOr('FABRICATE.Common.SetPicker.More', '+{count} more', {
            count: hiddenCount,
          })}</button
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

  .fabricate-set-picker-label {
    color: var(--fab-text-subtle);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .fabricate-set-picker-tokens {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-1);
    min-width: 0;
  }

  .fabricate-set-picker-more {
    box-sizing: border-box;
    height: 22px;
    min-height: 22px;
    padding: 0 var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 999px;
    background: var(--fab-bg-2);
    color: var(--fab-text-secondary);
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
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

  .fabricate-set-picker-footer {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--fab-space-2);
    padding-top: var(--fab-space-1);
    border-top: 1px solid var(--fab-border);
  }

  .fabricate-set-picker-selected {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--fab-text-subtle);
    font-size: 11px;
  }
</style>
