<!-- Svelte 5 runes mode -->
<!--
  The shared vocabulary shell both Tags & Categories screens render (issue 1915): the failure
  status line, the 2-up category grid and the full-width band beneath it.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `statusMessage` | string | `''` | empty until the screen has a failure to announce |

  Snippets:
  - `grid` — the 2-up band; the caller renders one `VocabularyShellPanel` per grid panel.
  - `full` — the full-width band beneath it, same per-panel component.

  Rest spread:
  - `{...rest}` lands on the shell root, written after `class`, so a caller may hook the root
    without replacing its class.

  Invariants:
  - This is `<main>`'s ONE element child on both routes, and this block declares none of the
    route rule's `padding`, `overflow` or `grid-template-*`: an unlayered scoped rule beats the
    `@layer modules` sheet at any specificity, so declaring one here silently replaces it.
  - The status line is rendered at MOUNT and filled later, because a live region inserted
    together with its content is not reliably announced.
  - Pinned by `tests/components/world-vocabulary-control-row-cascade.test.js`.
-->
<script>
  let { statusMessage = '', grid, full, ...rest } = $props();
</script>

<div class="manager-vocabulary-shell" {...rest}>
  <!-- ALWAYS RENDERED, EMPTY UNTIL IT HAS SOMETHING TO SAY. `role="alert"` rather than
       `status`: a deletion the GM asked for and did not get is an interruption. -->
  <p
    class="manager-vocabulary-shell-status"
    role="alert"
    aria-live="assertive"
    data-vocabulary-status
  >
    {statusMessage}
  </p>
  <div class="manager-vocabulary-shell-grid">
    {@render grid?.()}
  </div>
  {@render full?.()}
</div>

<style>
  /* THE ONE CHILD OF `<main>`. It declares no `padding`, `overflow` or `grid-template-*`: those
     belong to the route rule, and an unlayered scoped block here would silently replace one. */
  .manager-vocabulary-shell {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-4);
    min-width: 0;
    min-height: 0;
  }

  /* THE 2-UP CATEGORY GRID: two columns of about 506px at 1280px, clearing the 340px card track.
     `align-items: start` because the two category vocabularies are rarely the same length, and a
     stretched pair draws one card padded out to its taller neighbour's last row. */
  .manager-vocabulary-shell-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--fab-space-4);
    align-items: start;
    min-width: 0;
  }

  /* THE COLLAPSE, AT THE MANAGER'S OWN SHIPPED RUNG; below it a clipped delete button is the failure. */
  @container fabricate-manager (max-width: 1120px) {
    .manager-vocabulary-shell-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* The failure line for a deletion that did not land, rendered at MOUNT and filled later: a live
     region inserted with its content is not reliably announced. */
  .manager-vocabulary-shell-status {
    margin: 0;
    color: var(--fab-danger-text);
    font-size: 0.72rem;
  }

  /* An empty region still earns the column's gap, so the gap is cancelled rather than the element
     hidden — `display: none` would take it out of the accessibility tree. */
  .manager-vocabulary-shell-status:empty {
    /* AN EMPTY LIVE REGION MUST COST NOTHING, and three declarations are needed: `:empty` cancels
       the GAP, `height: 0` collapses the line box, and `min-height: 0` opts out of core's own
       `p:empty { min-height: 1rem }`, which clamps the USED height upwards. Measured at 16px. */
    height: 0;
    min-height: 0;
    overflow: hidden;
    margin-block-end: calc(-1 * var(--fab-space-4));
  }
</style>
