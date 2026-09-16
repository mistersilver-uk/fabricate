<!--
  THE editor validation surface: an aggregate header (status medallion + count tiles) over a grouped,
  bordered, tagged row stack. Every validation surface in the manager that draws this shape renders
  through this component, so the `manager-recipe-val-*` and `manager-recipe-rail-*` families in
  `styles/fabricate.css` have exactly one writer.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `title` / `intro` | strings | `'Validation'` / `''` | The tab heading and its explanation; passing neither renders no head block. |
  | `summary` | `{ status, icon, title, sub }` | `{}` | `status` is the site's own domain word and reaches the DOM verbatim on the site's summary hook; the CLASS it resolves to is one of this surface's three, through `SUMMARY_STATUS_ALIASES`. |
  | `counts` / `countLabels` | `{ passing, warnings, blocking }` | zeros / localized | A site draws the tiles it REPORTS: the rail renders `COUNT_ORDER` filtered to the keys present in `counts`. |
  | `groups` | `{ id, icon, label, rows, dataAttrs? }[]`, each row `{ id, status, title, detail?, target?, focusTarget?, recordId?, viewLabel?, dataAttrs? }` | `[]` | ROWS ARE RE-ORDERED — blocking first, within each group — so an authored sequence is a tiebreak rather than a guarantee. THE ROW ACTION IS A TWO-FIELD CONTRACT: `target` is the ROUTE, opaque here, and beside it ONE ADDRESS the row names for what it holds — `focusTarget`, the `data-validation-target` value the offending CONTROL carries, or `recordId`, a RECORD the route selects. Two names for one argument is the point: the producer says which kind it emitted. `target` could not simply become the control id — for one host it is a TAB id consumed by a whitelist and for another an `{ activity, section }` object. |
  | `statusLabels` / `rowDataAttr` / `viewDataAttr` | `{ pass, warn, block }` / attribute names | localized / `''` | The per-status pill word, one attribute carrying the row id on every row, and the same idea for the View button carrying the row's ROUTE. |
  | `viewLabel` | localization KEY | `FABRICATE.Admin.Manager.Validation.View` | The View button's visible verb; a row may override it with `row.viewLabel`, also a key, because one caller draws two different verbs down one list. |
  | `hookAttrs` / `countAttrs` | bags keyed by REGION / by COUNT | `{}` | The host's own `data-*` hooks, over a CLOSED region set — `root`, `summaryRow`, `summary`, `counts` — because the hooks are one decision per call site rather than four props to look at. A typo in a key is SILENT, so it is guarded: `tests/components/editor-validation-surface-source-contract.js` reads the region names out of THIS file's own `hooksFor('…')` call sites and refuses anything else, and guards `countAttrs` against `COUNT_ORDER` the same way. Every hook the primitive emits is emitted ALONGSIDE a site's own, never instead of it. |
  | `class` | class string | `''` | An EXTRA class, never a replacement. |

  Callbacks:
  - `onSelectIssue(target, address)` — the row's ROUTE and its one address, positionally, so both
    existing hosts keep their one-argument signatures.

  Invariants:
  - EVERY CALLER-FACING WORD DEFAULTS TO A LOCALIZATION KEY THIS SURFACE RESOLVES, NEVER TO ENGLISH,
    and EVERY KEY IS WRITTEN OUT IN FULL rather than composed from a shared prefix, because
    `tests/ui-lang-keys-resolve.test.js` resolves the complete literals it finds in `src/`.
  - THE ROW ACTION'S ACCESSIBLE NAME COMPOSES THE RESOLVED VERB, NOT THE WORD "View", which is a
    WCAG 2.5.3 obligation. `VIEW_NAMED_LABEL` is fed `{action}` from the SAME expression the visible
    child renders, so containment is true by construction, and `lang/en.json` owns the join.
  - THE SURFACE IS ROOTED AT `fabricate-validation`, written ahead of its own three classes, per
    `openspec/specs/design-system/spec.md`. THREE CLASSES ARE DELIBERATELY LEFT BEHIND —
    `manager-recipe-tab` on this root, `manager-recipe-tab-intro` and `manager-recipe-tab-title` on
    the head block — because six other recipe tabs write the first; in a bare host this surface
    paints its body and leaves its heading and the outer tab box unstyled.
-->
<script>
  import Chip from './Chip.svelte';
  import ManagerButton from './ManagerButton.svelte';
  import { localize } from '../util/foundryBridge.js';

  let {
    title = 'Validation',
    intro = '',
    summary = {},
    counts = { passing: 0, warnings: 0, blocking: 0 },
    countLabels = {
      passing: localize('FABRICATE.Admin.Manager.Validation.CountPassing'),
      warnings: localize('FABRICATE.Admin.Manager.Validation.CountWarnings'),
      blocking: localize('FABRICATE.Admin.Manager.Validation.CountBlocking'),
    },
    groups = [],
    statusLabels = {
      pass: localize('FABRICATE.Admin.Manager.Validation.StatusPass'),
      warn: localize('FABRICATE.Admin.Manager.Validation.StatusWarn'),
      block: localize('FABRICATE.Admin.Manager.Validation.StatusBlock'),
    },
    rowDataAttr = '',
    viewDataAttr = '',
    viewLabel = 'FABRICATE.Admin.Manager.Validation.View',
    hookAttrs = {},
    countAttrs = {},
    class: extraClass = '',
    onSelectIssue = () => {},
  } = $props();

  const VIEW_NAMED_LABEL = 'FABRICATE.Admin.Manager.Validation.ViewNamed';

  const statusIcons = {
    pass: 'fas fa-circle-check',
    warn: 'fas fa-triangle-exclamation',
    block: 'fas fa-circle-exclamation',
  };

  const SUMMARY_STATUSES = ['pass', 'warn', 'block'];
  const SUMMARY_STATUS_ALIASES = { clear: 'pass', warning: 'warn', blocked: 'block' };

  const summaryStatusClass = $derived.by(() => {
    const stated = summary?.status;
    const resolved = SUMMARY_STATUS_ALIASES[stated] ?? stated;
    return SUMMARY_STATUSES.includes(resolved) ? resolved : 'pass';
  });

  const COUNT_ORDER = ['passing', 'warnings', 'blocking'];

  const shownCounts = $derived(COUNT_ORDER.filter((count) => count in (counts ?? {})));

  const classes = $derived(
    [
      'fabricate-validation',
      'manager-recipe-tab',
      'manager-recipe-validation',
      'manager-editor-validation-surface',
    ]
      .concat(extraClass || [])
      .join(' ')
  );

  const attributesOf = (source) =>
    source && typeof source === 'object' && source.dataAttrs ? source.dataAttrs : {};

  const hooksFor = (region) => hookAttrs?.[region] ?? {};

  const hooksForCount = (count) => countAttrs?.[count] ?? {};

  const namedAttr = (name, value) => (name ? { [name]: value } : {});

  const orderedRows = (rows) =>
    (Array.isArray(rows) ? rows : [])
      .map((row, authored) => ({ row, authored }))
      .sort(
        (left, right) => rowRank(left.row) - rowRank(right.row) || left.authored - right.authored
      )
      .map((entry) => entry.row);

  function rowRank(row) {
    return row?.status === 'block' ? 0 : 1;
  }

  function rowAddress(row) {
    return row?.focusTarget ?? row?.recordId;
  }
</script>

<section class={classes} data-editor-validation-surface="" {...hooksFor('root')}>
  {#if title || intro}
    <div class="manager-recipe-tab-intro">
      {#if title}<h2 class="manager-recipe-tab-title">{title}</h2>{/if}
      {#if intro}<p class="manager-muted">{intro}</p>{/if}
    </div>
  {/if}
  <section class="manager-recipe-validation-summary-row" {...hooksFor('summaryRow')}>
    <div
      class={`manager-recipe-rail-summary is-${summaryStatusClass}`}
      data-editor-validation-summary={summary.status || 'pass'}
      {...hooksFor('summary')}
    >
      <span class="manager-recipe-rail-summary-medallion" aria-hidden="true"
        ><i class={summary.icon || statusIcons[summary.status] || statusIcons.pass}></i></span
      >
      <span class="manager-recipe-rail-summary-copy">
        <span class="manager-recipe-rail-summary-title">{summary.title}</span>
        <span class="manager-recipe-rail-summary-sub manager-muted">{summary.sub}</span>
      </span>
    </div>
    <ul class="manager-recipe-rail-counts" data-editor-validation-counts="" {...hooksFor('counts')}>
      {#each shownCounts as count (count)}
        <li class={`manager-recipe-rail-count is-${count === 'warnings' ? 'warning' : count}`}>
          <i
            class={count === 'passing'
              ? 'fas fa-circle-check'
              : count === 'warnings'
                ? 'fas fa-triangle-exclamation'
                : 'fas fa-circle-xmark'}
            aria-hidden="true"
          ></i>
          <span class="manager-recipe-rail-count-label">{countLabels[count]}</span>
          <span
            class="manager-recipe-rail-count-value"
            data-editor-validation-count={count}
            {...hooksForCount(count)}>{counts[count] || 0}</span
          >
        </li>
      {/each}
    </ul>
  </section>
  {#each groups as group (group.id)}
    <div class="manager-recipe-val-group" data-validation-group={group.id} {...attributesOf(group)}>
      <p class="manager-recipe-val-group-label">
        <i class={group.icon} aria-hidden="true"></i><span>{group.label}</span>
      </p>
      <ul class="manager-recipe-val-rows">
        {#each orderedRows(group.rows) as row, index (`${group.id}-${row.id || index}`)}
          <li
            class={`manager-recipe-val-row is-${row.status}`}
            class:is-invalid={row.status === 'block'}
            data-check={row.id || undefined}
            {...namedAttr(rowDataAttr, row.id)}
            {...attributesOf(row)}
          >
            <i
              class={`manager-recipe-val-status ${statusIcons[row.status] || statusIcons.pass}`}
              aria-hidden="true"
            ></i>
            <div class="manager-recipe-val-copy">
              <span class="manager-recipe-val-title">{row.title}</span>
              {#if row.detail}<span class="manager-recipe-val-detail manager-muted"
                  >{row.detail}</span
                >{/if}
            </div>
            {#if row.target || rowAddress(row)}
              <ManagerButton
                role="ghost"
                class="manager-recipe-val-view"
                aria-label={localize(VIEW_NAMED_LABEL, {
                  action: localize(row.viewLabel ?? viewLabel),
                  subject: row.title,
                })}
                {...namedAttr(viewDataAttr, row.target)}
                onclick={() => onSelectIssue(row.target, rowAddress(row))}
                >{localize(row.viewLabel ?? viewLabel)}</ManagerButton
              >
            {/if}
            <Chip class={`manager-recipe-val-pill is-${row.status}`}
              >{statusLabels[row.status]}</Chip
            >
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</section>
