<!-- Svelte 5 runes mode -->
<!--
  THE manager's labelled push-button (issue 1096).

  ── WHY IT EXISTS ─────────────────────────────────────────────────────────────────
  Before this component the manager's button was a CSS CONVENTION and nothing else:
  write `class="manager-button"`, then remember to add `is-primary`, `is-ghost` or
  `is-danger`. Nothing enforced the second half, and the Modifiers card is the proof
  that it drifts — `Add modifier` carried `is-primary` while `Delete modifier` and
  `Done` carried a BARE `manager-button`, so the destructive verb in that card was
  painted as a neutral one while the identical verb in the Tool Studio was painted
  as danger. A forgotten modifier class is invisible to lint, to `format:check` and
  to every source-contract test; it is only visible to someone looking at the screen.

  Making the role a REQUIRED-SHAPED PROP rather than a remembered class is the fix:
  `role` has a small closed set, an unrecognised value renders neutral rather than
  emitting an unstyled `is-*`, and a call site cannot express "danger" by accident or
  omit it silently — it either passes `role="danger"` or it is visibly neutral in the
  source.

  ── THE TOOL STUDIO IS THE AUTHORITY ──────────────────────────────────────────────
  The maintainer's ruling: `ToolEditView.svelte`'s header buttons define the correct
  rendering, and where another screen differs, THAT SCREEN CHANGES. Those buttons get
  their refined treatment from an ANCESTOR-CONTEXT rule —
  `.fabricate-manager .manager-tool-edit-actions .manager-button` (34px, `0 space-3`,
  `0.72rem`), plus the `.manager-header-actions .manager-button.is-primary` and
  `.manager-tool-edit-actions .manager-button.is-ghost` companions — which is
  precisely why the Modifiers card could not match them: it is not inside either
  ancestor, so it landed on the base control at the app's INHERITED body size. "The
  fonts differ from the tool studio's" is that missing `font-size`, exactly.

  Worth knowing when reading the sheet: `.manager-header-actions .manager-button`
  declares a 38px control, and the Tool Studio never renders it — its own
  `.manager-tool-edit-actions` block is later and more specific and pins 34px. The
  authority is what that cluster RENDERS, so 34px is what this primitive reproduces.

  So the primitive emits a SECOND class, `fab-manager-button`, and the global sheet
  re-declares the tool studio's values against it with no ancestor requirement. The
  tool studio's own buttons then carry both selectors with identical values, so
  converting them is a no-op on screen, while the Modifiers card is lifted onto the
  authority. Every value is COPIED from the header-actions block, never re-chosen: no
  new size, spacing or radius scale is introduced here.

  It deliberately has no scoped `<style>`. A scoped block would be a second source of
  truth for the same control and would begin to disagree with the global sheet — the
  exact failure this component exists to end. `InspectorActionButton` made the
  opposite choice for the opposite reason: it is a DIFFERENT treatment from
  `.manager-button`, so it owns its own tones.

  Consequence: this button is only styled inside `.fabricate-manager`. It is a manager
  primitive, not an app-agnostic one. `manager-layout.test.js` pins the equivalence in
  a real browser — it renders a tool studio button and a Modifiers card button of the
  same role and compares the COMPUTED `font-size`, `font-weight`, `padding`, `height`
  and `border-radius`, so a scoped rule landing on one screen and not the other reds
  the gate instead of shipping as drift.

  ── RELATIONSHIP TO `ArmedDangerButton` ───────────────────────────────────────────
  INDEPENDENT, not composed. `ArmedDangerButton` also renders
  `manager-button is-danger`, so composition looks tempting, but it is a different
  component with a different subject: it owns a two-state ARM/CONFIRM machine
  (`token`, `armed`, Escape/blur disarm, a label AND icon swap per state) and its
  danger role is a fixed invariant of that machine rather than a caller's choice.
  Routing it through this primitive would buy one shared line — the class string —
  while forcing this component to grow `class:is-armed`, a second label slot and a
  keydown/blur contract that no other call site wants. The honest statement is that
  `ArmedDangerButton` is a CONSUMER of the same CSS contract, not a consumer of this
  component, and the two are listed together in `ui-integration/spec.md` so a future
  sweep sees them as a pair.

  Props:
   - role: `'neutral'` (default — the bare `.manager-button`, which is a real and
     correct treatment for a secondary verb), `'primary'`, `'ghost'` or `'danger'`.
     Neutral is the default because it is what a bare `class="manager-button"`
     already renders, so converting an existing site is mechanical.
   - type: the native button type, defaulting to `'button'` — a manager button inside
     a `<form>`-adjacent card must never submit by accident.
   - disabled / onclick: forwarded.
   - children: the label snippet. Content is a snippet rather than a `label` string
     because the shipped call sites interleave an `<i>` glyph with localized text and
     some wrap the text in its own `<span>`.

  Every other attribute — `data-*` hooks, `aria-*`, `title`, `data-tooltip` — is
  forwarded through the rest spread, so a call site keeps its own selectors.
-->
<script>
  let {
    role = 'neutral',
    type = 'button',
    disabled = false,
    onclick = () => {},
    children = undefined,
    ...rest
  } = $props();

  // An unrecognised role renders the neutral treatment rather than emitting an unstyled
  // `is-*` class, so a typo shows up as the default button instead of silently doing
  // nothing. `neutral` is in no way absent from the set — it is the empty modifier.
  const ROLES = new Set(['primary', 'ghost', 'danger']);
  const classes = $derived(
    ['manager-button', 'fab-manager-button', ROLES.has(role) ? `is-${role}` : '']
      .filter(Boolean)
      .join(' ')
  );
</script>

<button {type} class={classes} {disabled} {onclick} {...rest}>{@render children?.()}</button>
