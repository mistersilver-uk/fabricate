<!--
  The line naming what routes into a set: each effective source as a chip, each source still on disk
  that does not route as a struck one, a warning the caller raises when nothing reaches the set, and
  an Assign picker over every source the scope offers (library §12 "Routed by ingredients").

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `label` | localized string | `Common.RouteSources.ProducedBy` | The line's visible name, which also names its group. |
  | `sources` | `[{ id, label, removable, hint?, nonRouting? }]` | `[]` | The effective sources, then the `nonRouting` ones; `hint` is a word drawn after a source's name, such as "default". |
  | `candidates` / `assigned` | `[{ id, label, routedTo? }]` / id[] | `[]` | Assign's options, each with the set it routes to today, and the ids it marks chosen. |
  | `implicitLabel` | localized string | `''` | A reserved role's words; while set they replace the chips and Assign. |
  | `unreachable` | boolean | `false` | Draws the warning badge, from the same flag as the card's warning edge, so the two agree. |
  | `unreachableLabel` / `emptyLabel` / `assignLabel` | localized strings | `Common.RouteSources.*` | The badge, the hint that replaces Assign with no candidate, and Assign's accessible name, which starts with its visible word "Assign". |
  | `assignNote` / `disabled` | localized string / boolean | `''` / `false` | A line atop Assign's panel; and an inert line. |

  Callbacks:
  - `onAssign(id)` — a candidate chosen that is not in `assigned`.
  - `onRemove(id)` — a chip's remove control, or a candidate chosen that is in `assigned`.

  Invariants:
  - The line is a `role="group"` named by its label that carries the `tabindex="-1"` hook
    `data-route-sources-line` in every state, beside a visually hidden polite summary of its
    effective sources — pinned by `tests/components/route-sources-mounted.test.js`.
  - Assign is a raw 22px button, because `Button` publishes only the 34 and 38 rungs; it carries
    `data-chip-remove-fallback`, so a removed chip's focus lands on it, and with no Assign the line
    carries it.
-->
<script>
  import Chip from './Chip.svelte';
  import SearchablePopover from './SearchablePopover.svelte';
  import { localizeOr } from '../util/localizeOr.js';

  let {
    label = '',
    sources = [],
    candidates = [],
    assigned = [],
    implicitLabel = '',
    unreachable = false,
    unreachableLabel = '',
    emptyLabel = '',
    assignLabel = '',
    assignNote = '',
    disabled = false,
    onAssign = () => {},
    onRemove = () => {},
  } = $props();

  const labelId = $props.id();

  const lineLabel = $derived(
    label || localizeOr('FABRICATE.Common.RouteSources.ProducedBy', 'Produced by')
  );
  const unreachableText = $derived(
    unreachableLabel ||
      localizeOr('FABRICATE.Common.RouteSources.Unreachable', 'Nothing — unreachable')
  );
  const emptyText = $derived(
    emptyLabel || localizeOr('FABRICATE.Common.RouteSources.Empty', 'Add an ingredient set first.')
  );
  const assignText = $derived(localizeOr('FABRICATE.Common.RouteSources.Assign', 'Assign'));
  const assignName = $derived(assignLabel || assignText);
  const separator = $derived(localizeOr('FABRICATE.Common.RouteSources.Separator', ', '));
  const notRouting = $derived(
    localizeOr('FABRICATE.Common.RouteSources.NotRouting', 'does not route')
  );

  const listed = $derived(Array.isArray(sources) ? sources : []);
  const effective = $derived(listed.filter((source) => !source.nonRouting));
  const struck = $derived(listed.filter((source) => source.nonRouting));
  const chosen = $derived(Array.isArray(assigned) ? assigned : []);
  const options = $derived(
    (Array.isArray(candidates) ? candidates : []).map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      meta: candidate.routedTo
        ? localizeOr('FABRICATE.Common.RouteSources.RoutedTo', 'now → {name}', {
            name: candidate.routedTo,
          })
        : undefined,
    }))
  );
  const summary = $derived(
    localizeOr('FABRICATE.Common.RouteSources.Summary', '{label} {sources}', {
      label: lineLabel,
      sources:
        implicitLabel ||
        (effective.length > 0
          ? effective.map((source) => source.label).join(separator)
          : unreachable
            ? unreachableText
            : ''),
    })
  );

  const removeLabelFor = (source) =>
    localizeOr('FABRICATE.Common.RouteSources.Remove', 'Remove {name}', { name: source.label });

  function select(id) {
    if (chosen.includes(id)) onRemove(id);
    else onAssign(id);
  }
</script>

{#snippet noteHeader()}
  <p class="fabricate-route-sources-note" data-route-sources-note>{assignNote}</p>
{/snippet}

<div
  class="fabricate-route-sources"
  role="group"
  aria-labelledby={labelId}
  tabindex="-1"
  data-keyboard-focus="true"
  data-route-sources-line
  data-chip-remove-fallback={options.length === 0 ? '' : undefined}
>
  <span class="fabricate-route-sources-label" id={labelId}>{lineLabel}</span>
  {#if implicitLabel}
    <span class="fabricate-route-sources-implicit" data-route-sources-implicit>{implicitLabel}</span
    >
  {:else}
    {#if unreachable}
      <Chip tone="warning" density="row" data-route-sources-unreachable="">{unreachableText}</Chip>
    {/if}
    {#each effective as source, index (source.id ?? `effective-${index}`)}
      <Chip
        tone="positive"
        density="row"
        icon="fas fa-check"
        truncate
        title={source.hint ? `${source.label}${separator}${source.hint}` : source.label}
        removable={Boolean(source.removable)}
        removeLabel={removeLabelFor(source)}
        onRemove={() => onRemove(source.id)}
        {disabled}
        data-route-sources-chip={source.id}
        >{source.label}{#if source.hint}<span class="visually-hidden">{separator}</span><span
            class="fabricate-route-sources-hint">{source.hint}</span
          >{/if}</Chip
      >
    {/each}
    {#each struck as source, index (source.id ?? `struck-${index}`)}
      <Chip
        tone="neutral"
        density="row"
        struck
        truncate
        title={`${source.label}${separator}${notRouting}`}
        removable={Boolean(source.removable)}
        removeLabel={removeLabelFor(source)}
        onRemove={() => onRemove(source.id)}
        {disabled}
        data-route-sources-chip={source.id}
        data-route-sources-struck=""
        >{source.label}<span class="visually-hidden">{separator}{notRouting}</span></Chip
      >
    {/each}
    {#if options.length === 0}
      <span class="fabricate-route-sources-empty" data-route-sources-hint>{emptyText}</span>
    {:else}
      <SearchablePopover
        multiple
        value={chosen}
        {options}
        {disabled}
        panelLabel={assignName}
        searchLabel={localizeOr('FABRICATE.Common.RouteSources.Search', 'Search…')}
        searchPlaceholder={localizeOr('FABRICATE.Common.RouteSources.Search', 'Search…')}
        popoverClass="fabricate-route-sources-popover"
        header={assignNote ? noteHeader : undefined}
        onSelect={select}
      >
        {#snippet trigger({ attributes })}
          <!-- ratchet-exempt(design-system): library §12 "Routed by ingredients" draws Assign as a dashed 22px button, a rung Button does not publish -->
          <button
            type="button"
            class="fabricate-route-sources-assign fab-hit-area"
            data-route-sources-assign
            data-chip-remove-fallback
            data-keyboard-focus="true"
            aria-label={assignName}
            {disabled}
            {...attributes}><i class="fas fa-plus" aria-hidden="true"></i>{assignText}</button
          >
        {/snippet}
      </SearchablePopover>
    {/if}
  {/if}
  <span class="visually-hidden" aria-live="polite" data-route-sources-summary>{summary}</span>
</div>
