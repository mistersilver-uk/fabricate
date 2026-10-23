<!--
  A routing overview: every source as a row naming the set it produces, re-pointed in place through
  an inline select, with blocked and gap rows standing where a select would (library §12
  "<RoutingOverview>").

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `rows` | `[{ key, kind, blockedReason?, source, tone?, struck?, summary?, value?, options?, placeholder?, fallback?, shared?, hint?, blocked?, action?, readonly?, ariaDescribedBy?, triggerProps? }]` | `[]` | `kind` is `source`, `blocked` or `gap`; a source draws a select over `options` (`{ value, label }`), a blocked row its `blocked` words, and either other kind the `rowAction` snippet while `action` is set. `shared` above 1 marks the target shared. |
  | `label` | localized string | required | The list's accessible name. |
  | `connectorLabel` / `defaultLabel` / `sharedLabel` | localized strings | `Common.RoutingOverview.*` | "produces", the inherited-target marker, and the shared marker, whose `{count}` is the row's `shared`. |
  | `disabled` | boolean | `false` | Every select off. |

  Snippets:
  - `rowAction(row)` — fills a blocked or gap row's select slot while its `action` is set.
  - `note` — above the list, such as a scope's warning.
  - `actions` — below the list, such as the adders.

  Callbacks:
  - `onChange(key, value)` — a row's select chose `value`.

  Rest spread:
  - `{...rest}` lands on the root `div`, written after `class={…}`.
  - `class` is a named prop, because a rest key would replace it instead of extending it.

  Invariants:
  - The marker column is drawn on every select row while any row holds marker text, and on none
    otherwise, so each select starts at one x and an unmarked list leaves no empty gutter; a select
    is named by its badge and connector and described by the summary, the markers only when they
    hold text, and `ariaDescribedBy`; its tone hook is stamped only while it is neither read-only
    nor disabled — pinned by `tests/components/routing-overview-mounted.test.js`.
-->
<script>
  import Chip from './Chip.svelte';
  import Select from './Select.svelte';
  import { fill } from '../../../utils/fillPlaceholders.js';
  import { localizeOr } from '../util/localizeOr.js';

  let {
    rows = [],
    label,
    connectorLabel = '',
    defaultLabel = '',
    sharedLabel = '',
    disabled = false,
    onChange = () => {},
    rowAction = undefined,
    note = undefined,
    actions = undefined,
    class: extraClass = '',
    ...rest
  } = $props();

  const uid = $props.id();

  const connectorText = $derived(
    connectorLabel || localizeOr('FABRICATE.Common.RoutingOverview.Produces', 'produces')
  );
  const defaultText = $derived(
    defaultLabel || localizeOr('FABRICATE.Common.RoutingOverview.Default', 'default')
  );
  const sharedTemplate = $derived(
    sharedLabel || localizeOr('FABRICATE.Common.RoutingOverview.Shared', 'shared · {count}')
  );

  const listed = $derived(Array.isArray(rows) ? rows : []);

  /** The marker column's lines, in order: default, shared, then the row's own hint. */
  function markersOf(row) {
    const lines = [];
    if (row.fallback) lines.push(defaultText);
    if (row.shared > 1) lines.push(fill(sharedTemplate, { count: row.shared }));
    if (row.hint) lines.push(row.hint);
    return lines;
  }

  const marked = $derived(listed.some((row) => markersOf(row).length > 0));

  /** `success` for a chosen target, `warning` for none unless the row is danger, on a live select. */
  function toneOf(row) {
    if (row.readonly || disabled) return undefined;
    if (row.value) return 'success';
    return row.tone === 'danger' ? undefined : 'warning';
  }

  function describedByOf(row, index, markers) {
    const ids = [];
    if (row.summary) ids.push(`${uid}-${index}-summary`);
    if (markers.length > 0) ids.push(`${uid}-${index}-markers`);
    if (row.ariaDescribedBy) ids.push(row.ariaDescribedBy);
    return ids.join(' ');
  }
</script>

<div class={['fabricate-routing-overview', extraClass]} {...rest}>
  {#if note}{@render note()}{/if}
  <ul
    class="fabricate-routing-overview-list"
    aria-label={label}
    data-routing-overview-marked={marked ? '' : undefined}
  >
    {#each listed as row, index (row.key)}
      {@const markers = markersOf(row)}
      {@const isSource = row.kind === 'source'}
      <li
        class="fabricate-routing-overview-row"
        data-routing-overview-row={row.key}
        data-routing-overview-kind={row.kind}
        data-routing-overview-blocked={row.kind === 'blocked' ? row.blockedReason : undefined}
      >
        <Chip
          tone={row.tone || 'neutral'}
          density="row"
          struck={row.kind === 'blocked' || row.struck === true}
          truncate
          title={row.source}
          class="fabricate-routing-overview-source"
          id={`${uid}-${index}-source`}>{row.source}</Chip
        >
        <span
          class="fabricate-routing-overview-summary"
          id={`${uid}-${index}-summary`}
          title={row.summary || undefined}>{row.summary || ''}</span
        >
        <span class="fabricate-routing-overview-connector" id={`${uid}-${index}-connector`}
          >{isSource ? connectorText : ''}</span
        >
        {#if isSource || (row.action && rowAction)}
          <div class="fabricate-routing-overview-target">
            {#if isSource}
              <Select
                size="inline"
                class="fabricate-routing-overview-select"
                value={row.value ?? ''}
                options={Array.isArray(row.options) ? row.options : []}
                placeholder={row.placeholder || ''}
                readonly={row.readonly === true}
                {disabled}
                ariaLabelledBy={`${uid}-${index}-source ${uid}-${index}-connector`}
                ariaDescribedBy={describedByOf(row, index, markers)}
                triggerProps={{ ...row.triggerProps, 'data-routing-overview-tone': toneOf(row) }}
                onChange={(value) => onChange(row.key, value)}
              />
            {:else}
              {@render rowAction(row)}
            {/if}
          </div>
          {#if marked}
            <span class="fabricate-routing-overview-markers" id={`${uid}-${index}-markers`}>
              {#each markers as marker, markerIndex (markerIndex)}
                <span class="fabricate-routing-overview-marker">{marker}</span>
              {/each}
            </span>
          {/if}
        {:else}
          <span class="fabricate-routing-overview-blocked">{row.blocked || ''}</span>
        {/if}
      </li>
    {/each}
  </ul>
  {#if actions}
    <div class="fabricate-routing-overview-actions">{@render actions()}</div>
  {/if}
</div>
