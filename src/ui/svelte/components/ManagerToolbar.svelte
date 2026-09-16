<!--
  THE manager's filter bar — the `<section>` landmark a browse screen writes its search field
  and filter controls into. It renders its children and nothing else.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `ariaLabel` | localized string | `undefined` | The landmark's accessible name. Required in practice. |
  | `class` | class string | `''` | An EXTRA class, appended to the primitive's own, never a replacement. |
  | `children` | snippet | `undefined` | The bar's contents: rows, search field, filter controls. |

  Rest spread:
  - `{...rest}` lands on the `<section>`, so a call site keeps its own `data-*` hooks, `id` and
    the `tabindex="-1"` the manager root focuses.
  - `ariaLabel` and `class` are named props, not rest keys. A `<section>` is a `region` landmark
    only while it has an accessible name; without one it drops out of the landmark list
    entirely, and passing it through the spread would leave that a convention.
    `tests/components/manager-filter-bar-source-contract.test.js` asserts every call site passes
    it. A `class` arriving through the spread would REPLACE `manager-toolbar` outright and
    silently un-bar the section while every `data-*` selector kept resolving.
  - A BARE `data-*` on a COMPONENT tag is the boolean `true`, not the `""` it is on an element:
    `<ManagerToolbar data-x>` renders `data-x="true"`. Presence selectors resolve either way, so
    call sites spell it `data-x=""`.

  Invariants:
  - This family declares NO font floor and NO focus pair, deliberately: the bar owns no control
    of its own, and the design-system pair requirement forbids a primitive displacing an area's
    chrome for a control it does not own. Pinned by
    `tests/components/re-rooted-controls-host-independence.test.js`.
  - THE ROW DIV IS NOT SWALLOWED and THE FILTER CONTROL IS NOT PICKED. The row class is a shared
    seam — `BulkSelectionToolbar.svelte` renders it in its own template, which is how "the
    selection bar replaces the filter bar in place" is built — and the control beside the search
    field is three different vocabularies across the shipped bars. A bar that rendered either
    would have to re-decide them, so it takes a slot instead.
  - No `variant` prop: the sheet's four further treatments are not one vocabulary, and one of
    them is sized from a SCOPED rule in `scoped/EntityListInspectorFrame.svelte` rather than
    from the sheet at all. Every modifier travels as a pass-through on `class`.
  - No scoped `<style>`: `styles/fabricate.css` owns the box, and a scoped block here would be a
    second source of truth for it.
  - IMPORT-FREE LEAF; callers pass an ALREADY-LOCALIZED `ariaLabel`. One util import inside a
    leaf propagates a required raw-module entry into every mount harness that compiles anything
    rendering it, and a missing entry HANGS that suite as `# cancelled` rather than failing it.
  - A scoped rule in a CALLING component that targets a class handed to this primitive stops
    reaching the element, usually SILENTLY — see `ManagerButton.svelte`. Repair with
    `:global(…)` chained so its specificity is unchanged;
    `tests/components/manager-button-scoped-class-reach.test.js` is the mechanical guard.
  - ONE family rule stays application-rooted, and the sheet records why beside it:
    `.fabricate-manager [data-scoped-page='world-vocabulary'] .manager-toolbar
    .manager-scoped-list-toolbar select`. Its family compound stands THIRD, behind an attribute
    ancestor that is not the application root, so neither re-rooting form exists for it.
-->
<script>
  let { children = undefined, ariaLabel = undefined, class: extraClass = '', ...rest } = $props();

  const classes = $derived(
    ['fabricate-filter-bar', 'manager-toolbar', extraClass].filter(Boolean).join(' ')
  );
</script>

<section class={classes} aria-label={ariaLabel} {...rest}>{@render children?.()}</section>
