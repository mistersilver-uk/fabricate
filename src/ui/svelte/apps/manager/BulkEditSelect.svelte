<!-- Svelte 5 runes mode -->
<!--
  The manager's ONE bulk edit SELECT: the full-width, opaque-backgrounded `<select>` a bulk
  panel stages a single-valued axis with (issue 772, extracted for issue 1010).

  It lives under `apps/manager/` rather than `apps/manager/components/` for the reason
  `BulkSelectionToolbar` records: `components/` holds area-agnostic leaves, this control is
  manager-scoped, and staying here keeps `--fab-mv2-*` in scope so the extraction is a pure
  move rather than a re-tokenisation — which matters more here than anywhere else in the
  set, since the whole point of the rule below is a specific opaque manager background.

  The OPTIONS are the caller's, passed as `children`: the sentinel's meaning differs per
  studio and per axis, and a primitive that owned the list would have to own those
  semantics too.

  Props:
   - value / disabled / ariaLabel: the control's state and its accessible name.
   - onChange(value): called with the newly selected value.

  Every other attribute — the `data-*` test and screenshot hooks in particular — is
  forwarded through the rest spread onto the real `<select>`, which is what a caller
  queries and what a test drives.

  WRITE A BARE HOOK AS `data-x=""`, NOT `data-x`. On a COMPONENT the bare form is a prop set
  to `true`, and Svelte serializes `true` as `="true"` — so the rendered attribute stops
  matching a value-exact selector and stops being byte-identical to the same hook written on
  a plain element. Presence selectors would not notice, which is what makes it worth stating.
-->
<script>
  let {
    value = '',
    disabled = false,
    ariaLabel = '',
    onChange = () => {},
    children,
    ...rest
  } = $props();
</script>

<select
  class="fab-bulk-edit-select"
  {value}
  {disabled}
  aria-label={ariaLabel || undefined}
  onchange={(event) => onChange(event.currentTarget.value)}
  {...rest}
>
  {@render children?.()}
</select>

<style>
  /* Manager-scoped by PLACEMENT — this component lives under `apps/manager/`, so
     `--fab-mv2-*` (declared on `.fabricate-manager`) is in scope. Its appearance lives
     HERE rather than in `styles/fabricate.css` so `VIEW_RECIPES` in
     `scripts/ui-pr-screenshot-evidence.mjs` routes a change to the views that actually
     render it. Because it sits OUTSIDE both `apps/manager/components/` and
     `apps/manager/recipes/`, it is enumerated BY NAME in that map's browser match lists. */

  /*
    Full width, and wearing the Fabricate select treatment rather than Foundry core's
    default light chrome — the same treatment the toolbar's filter selects carry.

    The background MUST be opaque, and `--fab-mv2-bg` specifically (issue 772).

    A native `<select>`'s option popup is painted by the browser, which derives its surface
    from the control's own COMPUTED background. This rule originally used
    `--fab-surface-soft`, which is a 5%-alpha LIGHT tint (`styles/fabricate.css:192`) — it
    looks right on the closed control because it composites over the dark rail, but the
    popup has nothing to composite against, so it opened light while every other manager
    dropdown opened dark. `color-scheme: dark` does not rescue it: the author background
    wins. The toolbar filters and the pagination size select both use `--fab-mv2-bg`
    (`styles/fabricate.css:4255`, `:3436`) and open dark, which is the look to match.

    Those two siblings are deliberately NOT converted onto this component: both are
    `select` element rules matched through an ancestor, not markup a primitive renders, so
    converting them is a different change. Recorded so this primitive is not read as having
    removed a duplicate it has not.
  */
  .fab-bulk-edit-select {
    width: 100%;
    min-width: 0;
    height: 32px;
    padding: 0 var(--fab-space-2);
    border: 1px solid var(--fab-mv2-border-strong);
    border-radius: 8px;
    color: var(--fab-mv2-text);
    background: var(--fab-mv2-bg);
    font-family: inherit;
    font-size: 0.72rem;
    cursor: pointer;
  }

  .fab-bulk-edit-select:focus-visible {
    outline: 2px solid var(--fab-mv2-accent);
    outline-offset: 2px;
  }
</style>
