<!-- Svelte 5 runes mode -->
<!--
  THE editor validation surface: an aggregate header (status medallion + count tiles) over a
  grouped, bordered, tagged row stack. Every validation surface in the manager that draws this
  shape renders through this component (issue 1444 closed the set), so the `manager-recipe-val-*`
  and `manager-recipe-rail-*` families in `styles/fabricate.css` have exactly one writer.

  ── THE HOST HOOKS, AND WHY THEY ARE ONE BAG ─────────────────────────────────────────────────
  Each converted site already had its OWN `data-*` names on the four chrome elements — a tab
  panel hook on the root, a section hook on the summary row, and its own spellings for the
  summary and counts hooks — and several are read by mounted suites and by the smoke harness, so
  they are contract rather than decoration. They arrive through ONE `hookAttrs` bag keyed by
  REGION, spread the same way `dataAttrs` is spread for a group or a row: four sibling props
  would be four places a reader has to look to see whether a site's hooks survived a conversion,
  and the hooks are one decision per call site.

  The regions are a CLOSED set — `root`, `summaryRow`, `summary`, `counts` — and a typo in a key
  is silent here, because an absent key spreads nothing. That is issue 1116's defect class, so it
  is guarded rather than trusted: `tests/components/editor-validation-surface-source-contract.js`
  reads the region names out of THIS file's own `hooksFor('…')` call sites and refuses a call
  site naming anything else. `countAttrs` is the same shape keyed by COUNT rather than by region,
  and is guarded against {@link COUNT_ORDER} the same way.

  Every hook the primitive itself emits — `data-editor-validation-surface`, `-summary`, `-counts`,
  `-count` — is emitted ALONGSIDE a site's own, never instead of it. Nothing that already reads
  either name has to learn the other.

  Props:
   - title / intro: the tab heading and its one-line explanation.
   - summary: `{ status, icon, title, sub }`. `status` is the site's own domain word and reaches
     the DOM verbatim on the site's own summary hook; the CLASS it resolves to is one of this
     surface's three — `is-pass`, `is-warn`, `is-block` — through {@link SUMMARY_STATUS_ALIASES}.
     It used to be interpolated raw, on the claim that the sheet painted both vocabularies; see
     that constant for what the sheet actually painted and what a GM saw instead.
   - counts / countLabels: the count tiles. See {@link COUNT_ORDER} for which tiles are drawn.
   - groups: `{ id, icon, label, rows, dataAttrs? }[]`; each row is
     `{ id, status, title, detail?, target?, dataAttrs? }`.
   - statusLabels: the per-status pill word, localized by the caller.
   - rowDataAttr: one attribute name, carrying the row id, put on every row.
   - viewDataAttr / viewLabel: the same idea for the row's View button, plus its label. Both are
     supplied by ONE caller today (`recipe/RecipeValidationTab`), which is the only site whose
     rows carry both a deep-link target and a localized verb; the other View-rendering caller
     takes the defaults. They are named props rather than row data because neither varies by row.
   - class: an EXTRA class appended to this surface's own, never a replacement — the idiom
     `ManagerButton`, `Field` and `Chip` already use. It exists so a site whose root carried its
     own classes keeps them, so no shipped rule stops matching.
-->
<script>
  import Chip from './Chip.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';

  let {
    title = 'Validation',
    intro = '',
    summary = {},
    counts = { passing: 0, warnings: 0, blocking: 0 },
    countLabels = { passing: 'Passing', warnings: 'Warnings', blocking: 'Blocking' },
    groups = [],
    statusLabels = { pass: 'PASS', warn: 'WARNING', block: 'BLOCKS ENABLE' },
    rowDataAttr = '',
    viewDataAttr = '',
    viewLabel = 'View',
    hookAttrs = {},
    countAttrs = {},
    class: extraClass = '',
    onSelectIssue = () => {},
  } = $props();

  const statusIcons = {
    pass: 'fas fa-circle-check',
    warn: 'fas fa-triangle-exclamation',
    block: 'fas fa-circle-exclamation',
  };

  /**
   * THE SUMMARY'S ONE STATUS VOCABULARY, and the aliases the call sites reached this surface
   * with (issue 1373).
   *
   * The doc above used to say `status` "is the site's own vocabulary (`pass` for the Checks
   * studio, `clear|warning|blocked` for the recipe editors), because the sheet paints both".
   * The sheet did not paint both. It painted `is-clear`, `is-warning` and `is-blocked`, the
   * minority spelling, plus one route-scoped `is-pass` for the Checks Studio — while FOUR of
   * the six call sites spell it `pass`/`warn`/`block`, the same three words this surface's own
   * `statusIcons`, `statusLabels` and every ROW already use. So on the Tool editor's Validation
   * tab, at both scopes, a blocked record and a clean one rendered the same neutral card: the
   * one thing a GM opens that tab to learn was the one thing it did not say.
   *
   * NORMALISED HERE rather than by rewriting six call sites to one word list. `status` is the
   * caller's domain word — it is also what the site's own `data-*-validation-summary` hook
   * carries, which suites and the smoke harness read — and translating a domain word into this
   * surface's presentation class is this surface's job. The tile row two blocks down already
   * does exactly this for `warnings` -> `is-warning`. Doing it at the boundary also closes the
   * class of defect rather than this instance of it: a seventh caller cannot invent a spelling
   * the sheet has no rule for, because there are only three classes this can emit.
   *
   * `pass` is the fallback for an unknown or absent word, which is the behaviour the template
   * already had, and `tests/components/manager-layout.test.js` pins the emitted set against the
   * sheet's own rules in both directions so the two cannot drift apart again.
   */
  const SUMMARY_STATUSES = ['pass', 'warn', 'block'];
  const SUMMARY_STATUS_ALIASES = { clear: 'pass', warning: 'warn', blocked: 'block' };

  const summaryStatusClass = $derived.by(() => {
    const stated = summary?.status;
    const resolved = SUMMARY_STATUS_ALIASES[stated] ?? stated;
    return SUMMARY_STATUSES.includes(resolved) ? resolved : 'pass';
  });

  /**
   * The count vocabulary, closed and ORDERED here rather than taken from the caller.
   *
   * A site draws the tiles it REPORTS: the rail renders this list filtered to the keys present
   * in `counts`, so `recipe-item/RecipeItemValidationTab` — whose checks are strictly two-state,
   * a check passes or it blocks — passes `{ passing, blocking }` and gets a two-tile rail with
   * no Warnings tile, while the three-state sites pass all three and get all three.
   *
   * Filtered rather than made a caller-supplied list, because the two halves of the question are
   * different: WHICH counts exist and in what order is a property of this surface's vocabulary
   * and a caller must not be able to invent or reorder one, whereas WHICH of them a given site
   * can answer is a property of that site's own check set. Key presence already carries the
   * second, so a `countOrder` prop would be a second way to say something `counts` says.
   */
  const COUNT_ORDER = ['passing', 'warnings', 'blocking'];

  const shownCounts = $derived(COUNT_ORDER.filter((count) => count in (counts ?? {})));

  const rootClass = $derived(
    ['manager-recipe-tab', 'manager-recipe-validation', 'manager-editor-validation-surface']
      .concat(extraClass || [])
      .join(' ')
  );

  // A group or a row may carry its OWN extra attributes through `dataAttrs` (issue 1096).
  // `rowDataAttr` says "put this one attribute, holding the row id, on every row" and is
  // right for a studio whose rows are homogeneous; the Checks Studio's are not — a check
  // TICK and an ISSUE are two kinds of row that existing selectors, the smoke harness and
  // four suites already tell apart by attribute. Spread so an absent bag adds nothing
  // rather than an empty attribute a selector would still match.
  const attributesOf = (source) =>
    source && typeof source === 'object' && source.dataAttrs ? source.dataAttrs : {};

  /** The chrome hooks for one named region; an unsupplied region spreads nothing. */
  const hooksFor = (region) => hookAttrs?.[region] ?? {};

  /** One count tile's own hooks; an unsupplied count spreads nothing. */
  const hooksForCount = (count) => countAttrs?.[count] ?? {};

  /**
   * One optionally-named attribute, as a spreadable bag.
   *
   * An empty name yields NO key rather than the key `''`: spreading `{ '': undefined }` reaches
   * `removeAttribute('')` on every render of every row, which happens to be inert and is not
   * something to keep relying on.
   *
   * @param {string} name
   * @param {unknown} value
   * @returns {object}
   */
  const namedAttr = (name, value) => (name ? { [name]: value } : {});
</script>

<!--
  `data-editor-validation-surface=""` and `data-editor-validation-counts=""` are written with an
  EXPLICIT empty value, not as bare attributes. Both elements now carry a spread, and Svelte
  collects every attribute on a spread element into one object — where a bare attribute is
  boolean `true` and `set_attribute` writes the string `"true"`. Both hooks rendered `=""` before
  the spreads arrived, every consumer resolves them by presence either way, and a silent
  `[data-x=""]` flip is exactly what
  `tests/helpers/primitiveAdoptionContract.js`'s valueless-attribute clause exists to refuse.
-->

<section class={rootClass} data-editor-validation-surface="" {...hooksFor('root')}>
  <!-- THE IN-PANE HEADING IS OPTIONAL (issue 1373). A tab reached through a labelled tab strip
       inside a titled editor is already named three times over, and the Tool rules editor's
       reference draws no heading on any of its three tabs. Every caller that passes a `title`
       renders exactly what it rendered before; a caller that passes neither gets the surface
       with no head block at all, rather than an empty `<h2>` holding open a row of space. -->
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
        {#each group.rows as row, index (`${group.id}-${row.id || index}`)}
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
            {#if row.target}
              <ManagerButton
                role="ghost"
                class="manager-recipe-val-view"
                {...namedAttr(viewDataAttr, row.target)}
                onclick={() => onSelectIssue(row.target)}>{viewLabel}</ManagerButton
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
