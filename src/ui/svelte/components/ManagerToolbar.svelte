<!--
  THE manager's filter bar — the `<section>` landmark a browse screen writes its search field and
  filter controls into. It renders its children and nothing else, and is an import-free leaf.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `ariaLabel` | localized string | `undefined` | The landmark's accessible name. Required in practice; see the invariants. |
  | `class` | class string | `''` | An EXTRA class, appended to the primitive's own, never a replacement. |
  | `children` | snippet | `undefined` | The bar's contents: rows, search field, filter controls. |

  Rest spread:
  - `{...rest}` lands on the `<section>`, carrying `data-*` hooks, `id` and the `tabindex="-1"` the
    manager root focuses; `ariaLabel` and `class` are named props written before it, per
    `openspec/specs/design-system/spec.md`, which also states how a bare `data-*` on a component tag
    is spelled.

  Invariants:
  - A `<section>` is a `region` landmark only while it has an accessible name, so every call site
    passes one; `tests/components/manager-filter-bar-source-contract.test.js` asserts it.
  - It declares no font floor and no focus pair, because it owns no control of its own; pinned by
    `tests/components/re-rooted-controls-host-independence.test.js`, which excludes its one
    app-rooted residue by count.
  - The row div and the filter control beside the search field are SLOTS, not markup this bar writes:
    `BulkSelectionToolbar.svelte` renders the row class itself, and the control is three different
    vocabularies across the shipped bars.
  - No `variant` prop and no scoped `<style>`: every modifier is a pass-through on `class`.
-->
<script>
  let { children = undefined, ariaLabel = undefined, class: extraClass = '', ...rest } = $props();

  const classes = $derived(
    ['fabricate-filter-bar', 'manager-toolbar', extraClass].filter(Boolean).join(' ')
  );
</script>

<section class={classes} aria-label={ariaLabel} {...rest}>{@render children?.()}</section>
