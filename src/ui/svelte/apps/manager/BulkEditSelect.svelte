<!-- Svelte 5 runes mode -->
<!--
  The manager's ONE bulk edit SELECT: the full-width control a bulk panel stages a
  single-valued axis with (issue 772, extracted for issue 1010, converted for issue 1504).

  It lives under `apps/manager/` rather than `apps/manager/components/` for the reason
  `BulkSelectionToolbar` records: `components/` holds area-agnostic leaves and this control
  is manager-scoped. The token half of that reason — that the placement keeps an
  area-scoped `--fab-manager-*` property in scope — has LAPSED, since a scoped `<style>`
  may not reach one from any directory. The placement's surviving consequence is the
  screenshot map: `VIEW_RECIPES` in `scripts/ui-pr-screenshot-evidence.mjs` enumerates this
  file BY NAME, because it sits outside both `apps/manager/components/` and
  `apps/manager/recipes/`.

  ── IT IS A `<Select>` NOW, AND ITS OPTIONS ARE DATA (issue 1504) ─────────────────────────
  This was a native `<select>`, so its option popup was drawn by the operating system. The
  whole reason its own rule insisted on an OPAQUE `--fab-bg-1` background was that a browser
  derives that popup's surface from the control's computed background, and a translucent tint
  opened light against every other dark manager dropdown. That reason is RESOLVED rather than
  overridden: the list is the app's own markup now, so no fill of this control's decides what
  colour a popup opens at, and the shared `form` rung's `--fab-surface-soft` is free to be
  the right answer on the closed control.

  The OPTIONS ARE STILL THE CALLER'S, and still for the reason this component has always
  given: the sentinel's meaning differs per studio and per axis, and a primitive that owned
  the list would have to own those semantics too. What changed is their FORM. `Select` takes
  an `options` array, and a snippet of arbitrary `<option>` elements cannot be turned into
  one without parsing rendered DOM — so the `children` prop is retired and each caller builds
  the array, sentinel first, exactly where it already decided what the sentinel means.

  This component's own `<style>` block is gone with the `<select>`: every declaration it
  carried is the `.fabricate-select*` family's now, in `styles/fabricate.css`. Two of them
  were recorded debt and leave with it — a retired 32px control height and an off-ladder 8px
  corner.

  Props:
   - value / disabled / ariaLabel: the control's state and its accessible name.
   - options: `[{ value, label, hint?, badge?, disabled?, disabledReason?, group? }]`.
   - showTick: FORWARDED rather than fixed, because the judgement is the LIST's and this
     component has three lists across two studios. The default is `Select`'s own `true`, so
     this wrapper adds no opinion of its own and every call site states its judgement: the two
     category axes drop the tick (the trigger already states the category), and the check-tier
     list keeps it (its list mixes two INSTRUCTIONS with named tiers, and the trigger's label
     alone cannot tell an instruction from a tier).
   - onChange(value): called with the newly selected value.

  Every other attribute — the `data-*` test and screenshot hooks in particular — is
  forwarded onto the TRIGGER through `Select`'s `triggerData`, which is what a caller
  queries and what a test, a capture step and the smoke all drive. It cannot ride `...rest`:
  that lands on the picker ROOT, a box around the control rather than the control.

  WRITE A BARE HOOK AS `data-x=""`, NOT `data-x`. On a COMPONENT the bare form is a prop set
  to `true`, and Svelte serializes `true` as `="true"` — so the rendered attribute stops
  matching a value-exact selector and stops being byte-identical to the same hook written on
  a plain element. Presence selectors would not notice, which is what makes it worth stating.
-->
<script>
  import Select from '../../components/Select.svelte';

  let {
    value = '',
    disabled = false,
    ariaLabel = '',
    options = [],
    showTick = true,
    onChange = () => {},
    ...rest
  } = $props();

  /**
   * The caller's rest attributes, routed to the TRIGGER rather than to the root.
   *
   * Both call sites pass their stable hook as a bare rest attribute — `data-recipe-bulk-category=""`,
   * `data-component-bulk-category=""` — and every driver of this control addresses that hook
   * expecting the control itself. `Select`'s `...rest` lands on the picker root, which is a
   * wrapper around the trigger, so a hook forwarded that way would still resolve and would
   * silently point one element too high: a click would hit the box instead of the button.
   */
  const triggerData = $derived({ ...rest });
</script>

<Select
  size="form"
  {value}
  {options}
  {showTick}
  {disabled}
  {triggerData}
  {ariaLabel}
  {onChange}
  class="fab-bulk-edit-select"
/>

<!-- THE CLASS ON THE ROOT IS LOAD-BEARING AND HAS ONE JOB. The deleted `<select>` rule carried
     `width: 100%`, because a bulk panel stages its axes in a 300px rail of full-width fields
     and a content-hugging button would read as a stray chip in a column of them. `Select` has
     no trigger-box prop by design, so the width is reached by a descendant rule from this
     class — `.fabricate-manager .fab-bulk-edit-select .fabricate-select-trigger` in
     `styles/fabricate.css`, beside the shipped `.fab-bulk-book-picker .fab-bulk-book-trigger`
     rule that does the same job for the book picker in the same rail. -->
