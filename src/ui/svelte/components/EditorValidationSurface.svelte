<!--
  THE editor validation surface: an aggregate header (status medallion + count tiles) over a
  grouped, bordered, tagged row stack. Every validation surface in the manager that draws this
  shape renders through this component, so the `manager-recipe-val-*` and `manager-recipe-rail-*`
  families in `styles/fabricate.css` have exactly one writer.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `title` / `intro` | strings | `'Validation'` / `''` | The tab heading and its one-line explanation. Passing neither renders no head block at all. |
  | `summary` | `{ status, icon, title, sub }` | `{}` | `status` is the site's own domain word and reaches the DOM verbatim on the site's summary hook; the CLASS it resolves to is one of this surface's three, through `SUMMARY_STATUS_ALIASES`. |
  | `counts` / `countLabels` | `{ passing, warnings, blocking }` | zeros / localized | A site draws the tiles it REPORTS: the rail renders `COUNT_ORDER` filtered to the keys present in `counts`. |
  | `groups` | `{ id, icon, label, rows, dataAttrs? }[]`, each row `{ id, status, title, detail?, target?, focusTarget?, recordId?, viewLabel?, dataAttrs? }` | `[]` | ROWS ARE RE-ORDERED — blocking first, within each group — so an authored sequence is a tiebreak rather than a guarantee. THE ROW ACTION IS A TWO-FIELD CONTRACT: `target` is the ROUTE, opaque here, and beside it ONE ADDRESS the row names for what it holds — `focusTarget`, the `data-validation-target` value the offending CONTROL carries, or `recordId`, a RECORD the route selects. Two names for one argument is the point: a row addresses one destination, and the producer now says which kind it emitted where a reader of the row sees it. `target` could not simply become the control id — for one host it is a TAB id consumed by a whitelist and for another an `{ activity, section }` object, and a host that never resolves its route renders no destination for the focus move to land in. |
  | `statusLabels` | `{ pass, warn, block }` | localized | The per-status pill word. |
  | `rowDataAttr` / `viewDataAttr` | attribute names | `''` | One attribute carrying the row id on every row, and the same idea for the View button carrying the row's ROUTE. |
  | `viewLabel` | localization KEY | `FABRICATE.Admin.Manager.Validation.View` | The View button's visible verb. A row may override it with `row.viewLabel`, also a key, because one caller draws two different verbs down one list. |
  | `hookAttrs` / `countAttrs` | bags keyed by REGION / by COUNT | `{}` | The host's own `data-*` hooks, over a CLOSED region set — `root`, `summaryRow`, `summary`, `counts`. Four sibling props would be four places a reader has to look to see whether a site's hooks survived a conversion, and the hooks are one decision per call site. A typo in a key is SILENT, because an absent key spreads nothing, so it is guarded rather than trusted: `tests/components/editor-validation-surface-source-contract.js` reads the region names out of THIS file's own `hooksFor('…')` call sites and refuses anything else, and `countAttrs` is guarded against `COUNT_ORDER` the same way. Every hook the primitive itself emits is emitted ALONGSIDE a site's own, never instead of it. |
  | `class` | class string | `''` | An EXTRA class appended to this surface's own, never a replacement. |

  Callbacks:
  - `onSelectIssue(target, address)` — the row's ROUTE and its one address, positionally. Two
    positional arguments rather than one object, so both existing hosts keep their one-argument
    signatures.

  Invariants:
  - EVERY CALLER-FACING WORD DEFAULTS TO A LOCALIZATION KEY THIS SURFACE RESOLVES, NEVER TO
    ENGLISH: a raw string written into a `$props()` destructuring is a word `game.i18n` never sees.
    EVERY KEY IS WRITTEN OUT IN FULL, never composed from a shared prefix constant, because
    `tests/ui-lang-keys-resolve.test.js` resolves the complete literals it finds in `src/` and a
    `${base}.CountPassing` would leave it holding a namespace base it can only check for
    existence.
  - THE ROW ACTION'S ACCESSIBLE NAME COMPOSES THE RESOLVED VERB, NOT THE WORD "View", and that is
    a WCAG 2.5.3 obligation: a name hard-coding "View" beside a visible "View task" is a visible
    label the accessible name does not contain. `VIEW_NAMED_LABEL` is fed `{action}` from the SAME
    expression the visible child renders, so containment is true by construction, and
    `lang/en.json` owns the join.
  - THE SURFACE IS ROOTED AT `fabricate-validation`, written ahead of its own three classes, and
    every rule the two families own is anchored on that class rather than on `.fabricate-manager`,
    so the surface draws wherever it is mounted. THREE CLASSES ARE DELIBERATELY LEFT BEHIND —
    `manager-recipe-tab` on this root, `manager-recipe-tab-intro` and `manager-recipe-tab-title`
    on the head block — because six other recipe tabs write the first, so re-rooting their rules
    would un-style those six. In a bare host this surface paints its body and leaves its heading
    and the outer tab box unstyled.
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

  /**
   * The pattern the row action's ACCESSIBLE name is built from, as a localization key. Not a prop
   * and not a `$props()` default: the visible verb is already caller-overridable per row, and a
   * second knob would be a second place one accessible name lives. `{action}` is the row's own
   * RESOLVED verb — the same string the visible child renders — and `{subject}` is its title.
   */
  const VIEW_NAMED_LABEL = 'FABRICATE.Admin.Manager.Validation.ViewNamed';

  const statusIcons = {
    pass: 'fas fa-circle-check',
    warn: 'fas fa-triangle-exclamation',
    block: 'fas fa-circle-exclamation',
  };

  /**
   * THE SUMMARY'S ONE STATUS VOCABULARY, and the aliases the call sites reach it with. NORMALISED
   * HERE rather than by rewriting six call sites: `status` is the caller's domain word and is also
   * what the site's own summary hook carries, so translating it into this surface's presentation
   * class is this surface's job — and doing it at the boundary closes the CLASS of defect, because
   * there are only three classes this can emit. `pass` is the fallback for an unknown word, and
   * `tests/components/manager-layout.test.js` pins the emitted set against the sheet's own rules.
   */
  const SUMMARY_STATUSES = ['pass', 'warn', 'block'];
  const SUMMARY_STATUS_ALIASES = { clear: 'pass', warning: 'warn', blocked: 'block' };

  const summaryStatusClass = $derived.by(() => {
    const stated = summary?.status;
    const resolved = SUMMARY_STATUS_ALIASES[stated] ?? stated;
    return SUMMARY_STATUSES.includes(resolved) ? resolved : 'pass';
  });

  /**
   * The count vocabulary, closed and ORDERED here rather than taken from the caller: WHICH counts
   * exist and in what order is a property of this surface, while WHICH of them a site can answer
   * is a property of its own check set, which key presence already carries.
   */
  const COUNT_ORDER = ['passing', 'warnings', 'blocking'];

  const shownCounts = $derived(COUNT_ORDER.filter((count) => count in (counts ?? {})));

  /*
    THE SURFACE'S OWN CLASS LIST. The local MUST be named `classes` and the root class MUST sit
    FIRST: the area-scope gate's composed-class reader locates the region by the exact opener
    `const classes = $derived(` and takes the array's first literal as the namespace class. Under
    any other name it reports a named extractor failure, and under any other order it credits the
    wrong class.
  */
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

  // A group or a row may carry its OWN extra attributes: `rowDataAttr` is right for a studio
  // whose rows are homogeneous, and the Checks Studio's are not — a check TICK and an ISSUE are
  // two kinds of row that selectors, the smoke harness and four suites tell apart by attribute.
  // Spread, so an absent bag adds nothing rather than an empty attribute a selector would match.
  const attributesOf = (source) =>
    source && typeof source === 'object' && source.dataAttrs ? source.dataAttrs : {};

  const hooksFor = (region) => hookAttrs?.[region] ?? {};

  const hooksForCount = (count) => countAttrs?.[count] ?? {};

  /**
   * One optionally-named attribute, as a spreadable bag. An empty name yields NO key rather than
   * the key `''`, which would reach `removeAttribute('')` on every render of every row.
   *
   * @param {string} name
   * @param {unknown} value
   * @returns {object}
   */
  const namedAttr = (name, value) => (name ? { [name]: value } : {});

  /**
   * THE IN-GROUP ORDER: blocking rows first, everything else in the order its site authored.
   *
   * TWO RANKS RATHER THAN THREE, deliberately: `spec.md` asks that blocking issues sort above
   * warnings inside a group and says nothing about passing rows, and a third rank would sink one
   * tab's unsatisfied TICKS past its warning ISSUES, since both are `warn`. A `critical` issue is
   * not left alone — it maps to `block`, rank 0. STABLE by construction: the authored position is
   * the tiebreak, and a source array is never sorted in place.
   *
   * @param {Array<{status?: string}>|undefined} rows one group's rows, as the caller authored them
   * @returns {Array<{status?: string}>} the same rows, blocking ones first
   */
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

  /**
   * The one address a row carries beside its route, under whichever of the two names its
   * producer used. See the two-field contract in the header for why there are two names.
   *
   * @param {{focusTarget?: string, recordId?: string}} row
   * @returns {string|undefined}
   */
  function rowAddress(row) {
    return row?.focusTarget ?? row?.recordId;
  }
</script>

<!--
  `data-editor-validation-surface=""` and `data-editor-validation-counts=""` are written with an
  EXPLICIT empty value, not as bare attributes: both elements carry a spread, and Svelte collects
  every attribute on a spread element into one object where a bare attribute is boolean `true` and
  is written as the string `"true"`. Both hooks rendered `=""` before the spreads arrived, and a
  silent `[data-x=""]` flip is what `tests/helpers/primitiveAdoptionContract.js`'s
  valueless-attribute clause refuses.
-->

<section class={classes} data-editor-validation-surface="" {...hooksFor('root')}>
  <!-- THE IN-PANE HEADING IS OPTIONAL: a tab reached through a labelled tab strip inside a titled
       editor is already named three times over. A caller that passes neither gets the surface
       with no head block, rather than an empty `<h2>` holding open a row of space. -->
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
