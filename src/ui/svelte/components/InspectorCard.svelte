<!--
  THE manager's card shell — a `<section>` that renders its caller's children and nothing else.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `class` | class string | `''` | An EXTRA class, appended to the primitive's own, never a replacement. |
  | `children` | snippet | `undefined` | The card's contents. |

  Rest spread:
  - `{...rest}` lands on the `<section>`, written after `class={…}`.
  - `class` is a named prop, because a rest key would REPLACE `manager-inspector-card` outright
    and silently un-card the section while every `data-*` selector kept resolving.
  - A BARE `data-*` on a COMPONENT tag is the boolean `true`, not the `""` it is on an element:
    `<InspectorCard data-x>` renders `data-x="true"`. Presence selectors resolve either way, so
    call sites spell it `data-x=""`.

  Invariants:
  - This family declares NO font floor and NO focus pair, deliberately: the card owns no control
    of its own, and the design-system pair requirement forbids a primitive displacing an area's
    chrome for a control it does not own. Pinned by
    `tests/components/re-rooted-controls-host-independence.test.js`.
  - No `as` prop and no `variant` prop. All 80 converted sites are a `<section>`, and the three
    painted treatments are keyed on two different anchors — the card's own modifier class and
    the Checks rail ANCESTOR — so a closed variant set spanning both stays an open design
    ruling. Every modifier travels as a pass-through on `class`.
  - No scoped `<style>`: `styles/fabricate.css` owns the box, and a scoped block here would be a
    second source of truth for it.
  - IMPORT-FREE LEAF. One util import inside a leaf propagates a required raw-module entry into
    every mount harness that compiles anything rendering it, and a missing entry HANGS that suite
    as `# cancelled` rather than failing it.
  - A scoped rule in a CALLING component that targets a class handed to this primitive stops
    reaching the element, usually SILENTLY — see `ManagerButton.svelte`. Repair with
    `:global(…)` chained so its specificity is unchanged;
    `tests/components/manager-button-scoped-class-reach.test.js` is the mechanical guard.
-->
<script>
  let { children = undefined, class: extraClass = '', ...rest } = $props();

  const classes = $derived(
    ['fabricate-card', 'manager-inspector-card', extraClass].filter(Boolean).join(' ')
  );
</script>

<section class={classes} {...rest}>{@render children?.()}</section>
