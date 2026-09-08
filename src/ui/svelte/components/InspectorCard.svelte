<!-- Svelte 5 runes mode -->
<!--
  THE manager's card shell (issue 1427).

  ── WHY IT EXISTS ─────────────────────────────────────────────────────────────────
  Before this component the manager's card was a CSS CONVENTION and nothing else:
  write `class="manager-inspector-card"` on a `<section>` and the sheet gives you the
  padding, the hairline border, the 8px radius, the surface fill and the stacked
  `gap` (`fabricate.css:13033` for the stack, `:13779` for the box). 80 sites across
  20 components wrote that out by hand.

  ── THE FAMILY IS ROOTED AT THE CLASS THIS COMPONENT EMITS (issue 1508) ───────────
  Those two rules and the Checks Studio's `.manager-checks-card` override (`:2501`)
  are written `.fabricate-card.manager-inspector-card…` rather than `.fabricate-manager
  .manager-inspector-card…`, so the shell paints wherever it is rendered instead of only
  inside the manager. `fabricate-card` is the FIRST literal of the class array below,
  and that position is a constraint rather than a style note:
  `tests/components/searchable-popover-area-scope.test.js` reads the composed region up
  to the first `]`, so a root moved off the head of the array is a root that gate
  reports as unemitted while every re-rooted rule keeps matching. The four remaining
  family rules name a caller's own container — the Checks rail's two and the essence and
  tool inspectors' per-view overrides — and stay application-rooted under the exemption
  `openspec/specs/design-system/spec.md` already grants for caller chrome.

  This family declares NO font floor and NO focus pair, and that is a positive decision
  rather than an omission. The card owns no control of its own — it renders its caller's
  children and nothing else — and the pair requirement forbids a primitive displacing an
  area's chrome for a control it does not own.
  `tests/components/re-rooted-controls-host-independence.test.js` carries the negative
  control that asserts neither half exists.

  It is the lowest-drama member of this programme and that is precisely the argument
  for it. There is no accessible name to forget and no `type="button"` to remember,
  so nothing here renders WRONG when the convention is missed — a card written as a
  bare `<section>` simply stops being a card, which is visible. What a hand-rolled
  convention costs instead is that no reader can enumerate the shell's callers, and
  a change to the shell has to be argued site by site. `library.html:1014` specifies
  ONE card primitive (`<Card>`) and one container level below it; 80 hand-written
  sites is what "one card" looked like without a component to be one.

  ── ONE HOST, AND THE CENSUS THAT ESTABLISHED IT ──────────────────────────────────
  Every one of the 80 sites is a `<section>`. That was measured by walking each
  component's Svelte AST rather than by grep, so a multi-line attribute list cannot
  hide one — three of the sites write `class` on its own line and one writes it as a
  template literal, and a line-based census reports the wrong host for all four.
  There is therefore no `as` prop: unlike `StatusToggle.svelte`, whose census found
  three element shapes, this one found a set of size one, and a polymorphism seam
  against a set of one is a seam for a variation the product does not contain.

  ── WHAT THIS COMPONENT DOES NOT OWN ──────────────────────────────────────────────
  No variant prop, and that is a deliberate scope line. The card has three painted
  treatments in the sheet and they are not one vocabulary: the base box;
  `.manager-checks-card` (radius 11, padding 0, `--fab-bg-2`; `fabricate.css:2501`),
  keyed on the card's own modifier class; and the Checks rail's box (`:3309`) and its
  `.is-rail-list` compaction (`:3448`), the first of which is keyed on an ANCESTOR
  (`.manager-checks-rail`) and reaches cards carrying no modifier at all. A fourth,
  `.is-sticky`, had no call site anywhere under `src/` — measured, not assumed — and
  was deleted from the sheet in issue 1498. A closed `variant` set spanning two
  different anchors is a design ruling; landing one inside an 80-site sweep whose
  entire acceptance bar is that no frame moves puts it exactly where nobody can
  review it. Every modifier therefore travels as a pass-through on `class`, spelled
  as it is spelled today, and the ruling is left open — see the manifest row's `why`
  and `ui-integration/spec.md`.

  It deliberately has no scoped `<style>`, for `ManagerButton.svelte`'s and
  `IconButton.svelte`'s reason: the shell is painted by `styles/fabricate.css`, and a
  scoped block here would be a second source of truth for the same box and would begin
  to disagree with the sheet.

  THE "IT RENDERS UNSTYLED OUTSIDE THE MANAGER" CLAUSE THAT STOOD HERE WAS FALSE, and it
  was already false when it was written (corrected in issue 1520). Issue 1508's second
  phase re-rooted this family at `fabricate-card`, the class `classes` below emits, so
  both rules that paint the shell — the flex column it shares with the rail blocks and its
  own padded, edged, filled box — are written `.fabricate-card.manager-inspector-card` and
  reach it wherever it renders. Measured over the whole sheet at issue 1520, not one rule
  of this family is written under a `.fabricate-manager` descendant chain and none sits
  inside the `@container fabricate-manager` block, so it has no residue either.

  The clause's second half is retired with it rather than merely re-dated: the Manage
  Interactables panel renders this shell as its promote card, inside a `.fabricate-app`
  frame, so the consequence is not "not reached today" — it is not a consequence.

  It is an IMPORT-FREE LEAF, exactly like `Stepper.svelte` and `IconButton.svelte`:
  props only, no `foundryBridge`, no util imports. Callers pass ALREADY-LOCALIZED
  strings, and there are none to pass — the card renders its caller's children and
  nothing of its own. One util import inside a leaf propagates a required raw-module
  entry into every mount harness that compiles anything rendering it, and a missing
  entry HANGS that suite as `# cancelled` rather than failing it. This leaf is
  rendered by 19 components and reached from most of the manager's mounted trees.

  ── CLASS ORDER IS DELIBERATE ─────────────────────────────────────────────────────
  The family ROOT, then `manager-inspector-card`, then the caller's extra. The last two
  are the order all 80 hand-rolled sites already wrote (`manager-inspector-card
  manager-checks-card`, `manager-inspector-card is-rail-list`), so a converted site
  emits what it emitted before with the root PREPENDED. Class order changes no cascade;
  reproducing it is what makes a 48-site diff reviewable.

  Props:
   - children: the card's contents. A snippet, because a card is a container and its
     body is whatever the caller writes — there is no fixed head/body vocabulary here
     to turn into named slots, and inventing one would make the conversion a rebuild.
   - class: an EXTRA class, appended to the primitive's own, never a replacement. It
     has to be a named prop rather than a rest key, because the rest spread lands
     after `class={classes}` and a `class` passed through it would REPLACE
     `manager-inspector-card` outright — silently un-carding the section while every
     `data-*` selector in the tests kept resolving.

     Before writing a rule against it, read `ManagerButton.svelte`'s note on the same
     prop. A scoped `<style>` rule in the CALLING component stops reaching the element
     the moment that site converts: Svelte stamps its `svelte-<hash>` onto the
     elements the component itself writes, and a `class` handed to a child is
     forwarded verbatim. Measured against Svelte 5.56.3 for this change, a class that
     lives ONLY on a component tag is PRUNED — every such rule raised
     `css_unused_selector` and `lint:svelte:warnings` failed on it. The silent half is
     narrower than the folklore: a rule survives, with the hash attached and matching
     nothing, only when the SAME token is also on an element the caller still writes.
     Three files carried such a rule before this conversion —
     `BulkDeleteCard.svelte`, `checks/CraftingModifierCatalogueCard.svelte` and
     `ItemPageInspector.svelte` — and each is repaired with a `:global(...)` chained
     so its specificity is unchanged.
     `tests/components/manager-button-scoped-class-reach.test.js` is the mechanical
     guard, and it covers this primitive as well as `<ManagerButton>`.

  Every other attribute — `data-*` hooks, `aria-label`, `id` — is forwarded through
  the rest spread onto the `<section>`, so a call site keeps its own selectors.

  ── ONE TRAP THE REST SPREAD CARRIES ──────────────────────────────────────────────
  A BARE `data-*` attribute on a COMPONENT tag is the boolean `true`, not the empty
  string it is on an element. `<section data-checks-odds>` renders
  `data-checks-odds=""`; `<InspectorCard data-checks-odds>` spreads `true` and renders
  `data-checks-odds="true"`. 27 of the converted attributes were written bare and
  every one of them is spelled `data-…=""` at its call site for that reason. Presence
  selectors resolve either way, which is precisely why this would not have been caught
  by the suites and smoke steps that use them.
-->
<script>
  let {
    children = undefined,
    // An EXTRA class, appended to the primitive's own — never a replacement for it. It has to
    // be a named prop rather than a rest key: the rest spread lands after `class={…}` in the
    // markup, so a `class` passed through it would REPLACE `manager-inspector-card` outright
    // and silently un-card the section while every `data-*` selector in the tests kept
    // resolving.
    class: extraClass = '',
    ...rest
  } = $props();

  const classes = $derived(
    ['fabricate-card', 'manager-inspector-card', extraClass].filter(Boolean).join(' ')
  );
</script>

<section class={classes} {...rest}>{@render children?.()}</section>
