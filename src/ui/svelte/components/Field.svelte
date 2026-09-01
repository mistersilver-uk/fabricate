<!-- Svelte 5 runes mode -->
<!--
  THE manager's labelled form field — the `.manager-field` column (issue 1428).

  ── WHY IT EXISTS ─────────────────────────────────────────────────────────────────
  `.manager-field` was a CSS CONVENTION and nothing else: write
  `class="manager-field"`, then remember which HOST element the field is supposed to
  be. The sheet declares the box once —
  `styles/fabricate.css:10523`, `display: flex; flex-direction: column;
  gap: var(--fab-space-chip); font-size: 0.82rem; font-weight: 700` — and 88 sites
  across 24 components re-typed the class onto an element each of them chose for
  itself.

  ── THE HOST IS THE WHOLE POINT, WHICH IS WHY IT IS A REQUIRED-SHAPED PROP ────────
  Measured on the tree this extraction started from, those 88 sites used THREE hosts:
  56 `<label>`, 31 `<div>` and 1 `<fieldset>`. That is not a styling variant. A
  `<label>` field WRAPS its control and gives it its accessible name, so a screen
  reader announces "Maximum stamina, edit text" on a control that carries no `id`,
  no `for` and no `aria-label` of its own. A `<div>` field does not, and 31 sites
  rely on that: they hold two controls, or none, or a control that is already named
  by something else, and wrapping any of them in a `<label>` would hand the label
  text to whichever labelable descendant happens to come first.

  So `as` is a CLOSED SET with no correct default — exactly the shape `ManagerButton`
  gave `tag` and for the same reason: a per-site decision that is invisible in the
  rendered pixels and load-bearing in the announcement must be written at the call
  site, not remembered. `tests/components/field-source-contract.test.js` requires a
  literal `as` on every `<Field>` in `src/`, so the fallback below is unreachable from
  the product.

  ── WHY THE FALLBACK IS `div` AND NOT `label` ─────────────────────────────────────
  `label` is the majority host, so it is the tempting default, and it is the wrong
  one. A missing `as` that renders a `<div>` LOSES an implicit association: the
  control keeps whatever name it already had and the field reads as unlabelled. A
  missing `as` that rendered a `<label>` would INVENT one: the wrapped control is
  announced under text that belongs to a different control, the field gains
  click-to-focus behaviour that moves focus somewhere unexpected, and nothing about
  either is visible on screen. A `<div>` is the box with no contract; `label` and
  `fieldset` both carry behaviour, so neither may be reached by omission. The
  fallback also `console.warn`s, so it is loud in a dev console as well as red in
  the gate.

  ── THE `fieldset` MEMBER HAS ONE CALLER, AND IT IS NOT A `div` IN DISGUISE ───────
  `apps/manager/RadioCardGroup.svelte` is the single `<fieldset>` site. It is a
  genuine grouped-control case on three independent counts, each of which a `<div>`
  would silently drop: it renders a `<legend>`, which is only valid as a fieldset's
  first child and is what names the group; it holds a radio group — several `<input
  type="radio">` sharing one `name` — which is the exact construct `fieldset`/`legend`
  exists to announce; and it forwards a `disabled` attribute, which on a `<fieldset>`
  disables every descendant form control and on a `<div>` does nothing at all. It is
  a member of the set rather than an allowlisted exception because the alternative is
  a hole in the source-contract gate for the one host whose behaviour is hardest to
  reproduce by hand.

  ── MOVING A CLASS ONTO THIS COMPONENT CAN KILL A SCOPED RULE ────────────────────
  Same trap `ManagerButton.svelte` documents at length, and it bit three files here.
  Svelte stamps a component's `svelte-<hash>` onto the elements THAT component
  writes; a `class` handed to a child is forwarded verbatim, so a scoped
  `.manager-task-dc-field { … }` in the caller compiles to
  `.manager-task-dc-field.svelte-<hash>` and matches nothing the moment that class
  moves onto a `<Field>`. It fails two ways and only one of them warns, and WHICH way is a
  property of the whole caller rather than of the class you moved: measured on svelte 5.56.3,
  the rule is emitted-with-hash and SILENT whenever that file also holds a REGULAR element
  carrying a spread (`<li {...hook}>`) or a `class` whose value is an expression (`class={o.icon}`,
  template literals included). A spread or dynamic class on a COMPONENT tag, a `class:` directive
  and a static class all prune-and-warn instead. Expression-valued classes are common here, so
  assume the silent mode and grep the caller's own `<style>` rather than trusting
  `lint:svelte:warnings`. The repair is `:global(.manager-field.the-other-class)`, chained so the
  compound keeps the (0,2,0) the scoped form had — the bare `:global(.the-other-class)` reaches
  the element and smuggles a cascade change in as a repair. A DESCENDANT selector must be wrapped
  WHOLE: `:global(ancestor) .child` leaves `.child` as the only scoped compound, so the hash is
  emitted bare and the rule silently goes (0,3,0) to (0,4,0).
  `tests/components/manager-button-scoped-class-reach.test.js` is the mechanical guard; its
  `PRIMITIVES` registry carries the `Field` row.

  It deliberately has no scoped `<style>`, for the reason `ManagerButton` states: the
  global sheet owns `.manager-field` and its ~30 descendant rules, and a scoped block
  here would be a second source of truth for the same box.

  Props:
   - as: `'label'`, `'div'` or `'fieldset'`. REQUIRED-SHAPED — see above. An
     unrecognised or missing value renders a `<div>` and warns.
   - class: an EXTRA class, appended to `manager-field` — never a replacement. It is a
     named prop rather than a rest key because the rest spread lands after
     `class={classes}` in the markup, so a `class` arriving through it would REPLACE
     `manager-field` outright and silently unstyle the field while every `data-*`
     selector kept resolving.
   - children: the field's content — conventionally a `<span>` caption followed by the
     control, which is the shape `.fabricate-manager .manager-field > span` and the
     blanket `.manager-field select|input|textarea` rules in `styles/fabricate.css`
     are written against.

  Every other attribute — `data-*` hooks, `id`, `aria-*`, `title`, `disabled` on the
  fieldset — is forwarded through the rest spread, so a call site keeps its own
  selectors.
-->
<script>
  let {
    as = undefined,
    // An EXTRA class, appended to the primitive's own — never a replacement for it.
    class: extraClass = '',
    children = undefined,
    ...rest
  } = $props();

  // The closed host set. `Set` rather than an array so the membership test is not a
  // linear scan that a fourth member would quietly make wrong, and declared outside the
  // component instance so `field-source-contract.test.js` can read the literal.
  const HOSTS = new Set(['label', 'div', 'fieldset']);

  // `div` is the fallback, deliberately, and the docblock above records why: it is the
  // only member of the set that carries no behaviour, so it is the only one that may be
  // reached by omission.
  const FALLBACK_HOST = 'div';

  const host = $derived(HOSTS.has(as) ? as : FALLBACK_HOST);
  const classes = $derived(['manager-field', extraClass].filter(Boolean).join(' '));

  $effect(() => {
    if (HOSTS.has(as)) return;
    console.warn(
      `Fabricate | Field: \`as\` must be one of ${[...HOSTS].join(', ')}; got ${JSON.stringify(as)}. ` +
        `Rendered a <${FALLBACK_HOST}>, so any control inside it is no longer named by this field.`
    );
  });
</script>

<svelte:element this={host} class={classes} {...rest}>{@render children?.()}</svelte:element>
