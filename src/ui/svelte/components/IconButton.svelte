<!-- Svelte 5 runes mode -->
<!--
  THE manager's icon-only push-button (issue 1422).

  ── WHY IT EXISTS ─────────────────────────────────────────────────────────────────
  Before this component the manager's icon button was a CSS CONVENTION and nothing
  else: write `class="manager-icon-button"`, then remember `type="button"`, then
  remember that a control whose only content is a glyph has NO ACCESSIBLE NAME unless
  you also write `aria-label`. 82 sites across 37 components wrote that out by hand.

  The accessible name is what makes the convention worth ending, and it is a sharper
  problem here than on `ManagerButton.svelte`. A labelled button names itself: forget
  everything and it still reads as "Delete recipe" because the words are in the
  markup. An icon button that loses its `aria-label` announces itself as "button" and
  nothing else — it is unusable by a screen reader and IDENTICAL on screen, so no
  frame, no computed-style probe and no mounted assertion that resolves it by its
  `data-*` hook can see the defect. `design-system/spec.md:171-175` states the rule
  this component enforces structurally: WHEN a primitive renders a control whose only
  visible content is a glyph, THEN its accessible name is a required prop.

  All 82 converted sites already passed one. That is the point: the convention was
  being honoured, by 37 files, with nothing anywhere checking that it was — which is
  the state every convention in this repository's history was in immediately before it
  drifted. `tests/icon-button-source-contract.test.js` is the end-state gate.

  ── ONE HOST, AND THE CENSUS THAT ESTABLISHED IT ──────────────────────────────────
  Unlike `StatusToggle.svelte`, whose census found three element shapes and needed a
  closed `as` set, every one of the 82 sites is a `<button type="button">` — measured
  by walking each component's Svelte AST rather than by grep, so a multi-line
  attribute list cannot hide one. There is no host vocabulary here because there is no
  second host, and adding an `as` prop against a set of one would be inventing a seam
  for a variation the product does not contain.

  ── WHAT THIS COMPONENT DOES NOT OWN ──────────────────────────────────────────────
  No `role` prop, and that is a deliberate scope line rather than an oversight.
  `ManagerButton.svelte` makes the role a required-shaped prop because its modifier
  classes had DRIFTED — the Modifiers card painted a destructive verb as a neutral
  one. Nothing equivalent is measured here: the icon button's modifiers are a mix of
  roles (`is-danger`, `is-ghost`, `is-primary`) and STATES (`is-locked`,
  `is-roll-needed`), one site legitimately compounds two of them
  (`.manager-icon-button.is-ghost.is-danger` is its own declared treatment in the
  sheet), and a vocabulary that has to carry both kinds is a design decision, not a
  mechanical extraction. Folding it into an 82-site sweep whose entire acceptance bar
  is that no frame moves would put a real judgement call inside a change nobody can
  review for one. Every modifier therefore travels as a pass-through on `class`,
  exactly as it is written today, and the role question is left stated rather than
  answered — see the manifest row's `why`.

  It deliberately has no scoped `<style>`, for `ManagerButton.svelte`'s reason: the
  control is painted by `styles/fabricate.css` under `.fabricate-manager`
  (`fabricate.css:13767` for the shared base, `:13935` for the 34px box, `:13942` for
  the 28px pagination box), and a scoped block here would be a second source of truth
  for the same control and would begin to disagree with the sheet. The consequence is
  the same one the button carries: this is a MANAGER primitive, not an app-agnostic
  one, and dropped into `.fabricate-app` it renders as an unstyled control.

  That consequence is REACHED in the product and is not hypothetical.
  `components/Pagination.svelte` is area-agnostic and renders two of these, so six
  player-app components — the recipe browser, three gathering panels, the inventory
  grid and the journal history list — paint them through their own
  `:global(.manager-icon-button)` rules. Those rules are CORRECT and are not a defect
  to repair: they style what a child component renders, which is exactly what
  `:global` is for, and they are why the pagination arrows are visible outside the
  manager at all.

  It is also an IMPORT-FREE LEAF, exactly like `Stepper.svelte` and
  `StatusToggle.svelte`: props only, no `foundryBridge`, no util imports. Callers pass
  ALREADY-LOCALIZED strings. One util import inside a leaf propagates a required
  raw-module entry into every mount harness that compiles anything rendering it, and a
  missing entry HANGS that suite as `# cancelled` rather than failing it — and this
  leaf is rendered by 36 components.

  ── CLASS ORDER IS DELIBERATE ─────────────────────────────────────────────────────
  `manager-icon-button`, then the caller's extra. That is the order all 82 hand-rolled
  sites already wrote (`manager-icon-button is-danger manager-checks-trigger-remove`,
  `manager-icon-button manager-economy-actor-roll is-roll-needed`), so every converted
  site emits a byte-identical `class` attribute and the conversion is a no-op in the
  DOM as well as on screen. Class order changes no cascade; reproducing it is what
  makes an 82-site diff reviewable.

  Props:
   - ariaLabel: the pre-localized accessible name. REQUIRED by
     `design-system/spec.md:171-175` for an icon-only control, and emitted as
     `aria-label`. Dropped when empty rather than emitted blank, because
     `aria-label=""` is worse than none: it suppresses the fallback naming a screen
     reader would otherwise derive. Two shipped sites pass `label || undefined`
     deliberately, so the empty case is reachable and is not merely a typo.
   - disabled: forwarded to the `<button>`.
   - onclick: forwarded verbatim, so a call site keeps its `event.stopPropagation()`.
   - children: the glyph snippet — an `<i class="fas fa-…" aria-hidden="true">` at
     every shipped site. A snippet rather than an `icon` string because the sites
     interleave Font Awesome class sets this component has no vocabulary for, and
     inventing one would make the conversion a restyle.
   - class: an EXTRA class, appended to the primitive's own, never a replacement. It
     has to be a named prop rather than a rest key, because the rest spread lands
     after `class={classes}` and a `class` passed through it would REPLACE
     `manager-icon-button` outright — silently unstyling the control while every
     `data-*` selector in the tests kept resolving.

     Before writing a rule against it, read `ManagerButton.svelte`'s note on the same
     prop. A scoped `<style>` rule in the CALLING component stops reaching the element
     the moment that site converts, because Svelte stamps its `svelte-<hash>` onto the
     elements the component itself writes and a `class` handed to a child is forwarded
     verbatim. It fails two ways and only one of them is loud: PRUNED to an `(unused)`
     comment behind a `css_unused_selector` warning when no element the caller still
     writes carries the token, and EMITTED with the hash attached and silently
     matching nothing when one does. `essences/EssenceIdentityTab.svelte` and
     `GatheringEconomyView.svelte` shipped exactly this and carry the `:global(...)`
     repair, re-chained so the specificity is unchanged.
     `tests/components/manager-button-scoped-class-reach.test.js` is the mechanical
     guard, and it covers this primitive as well as `<ManagerButton>`.

  Every other attribute — `data-*` hooks, `aria-haspopup`, `aria-expanded`, `title`,
  `data-tooltip`, `onkeydown` — is forwarded through the rest spread onto the
  `<button>`, so a call site keeps its own selectors.

  ── ONE TRAP THE REST SPREAD CARRIES ──────────────────────────────────────────────
  A BARE `data-*` attribute on a COMPONENT tag is the boolean `true`, not the empty
  string it is on an element. `<button data-remove-trigger>` renders
  `data-remove-trigger=""`; `<IconButton data-remove-trigger>` spreads `true` and
  renders `data-remove-trigger="true"`. 17 of the converted attributes were written
  bare and every one of them is spelled `data-…=""` at its call site for that reason.
  Presence selectors resolve either way, which is precisely why this would not have
  been caught by the suites that use them.
-->
<script>
  let {
    ariaLabel = '',
    disabled = false,
    onclick = () => {},
    children = undefined,
    // An EXTRA class, appended to the primitive's own — never a replacement for it. It has
    // to be a named prop rather than a rest key: the rest spread lands after `class={…}` in
    // the markup, so a `class` passed through it would REPLACE `manager-icon-button`
    // outright and silently unstyle the control while every `data-*` selector in the tests
    // kept resolving.
    class: extraClass = '',
    // OPTIONAL `$bindable` handle on the rendered `<button>` (issue 1477, default `null` so all
    // 36 existing callers are unaffected). `ActionMenu` needs it for two things a class cannot
    // give it: the element it MEASURES the portaled panel against, and the element focus returns
    // to when the menu closes. `Chip.svelte` carries the same prop for the same reason, which is
    // how `SearchablePopover` gets a handle on its own chip-shaped trigger.
    element = $bindable(null),
    ...rest
  } = $props();

  const classes = $derived(['manager-icon-button', extraClass].filter(Boolean).join(' '));

  // Emitted only when non-empty. `aria-label=""` is not a neutral no-op: it names the control
  // the empty string, which suppresses the fallback naming a screen reader would otherwise
  // derive and is therefore worse than passing nothing at all.
  const accessibleName = $derived(ariaLabel || undefined);
</script>

<button
  bind:this={element}
  type="button"
  class={classes}
  aria-label={accessibleName}
  {disabled}
  {onclick}
  {...rest}>{@render children?.()}</button
>
