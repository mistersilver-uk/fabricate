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

  The sixth role, `warning`, is the proof that the class string is the wrong place to
  keep this knowledge even when a developer remembers to write one (issue 1118).
  `environment/CompositionList.svelte` renders ONE verb — same `onForceInclude`
  handler, same `data-action="force-include"`, same localization key — from two places,
  and one of them spells the modifier `is-warning`. The sheet declares
  `.manager-button.is-warning-action` and declares `.manager-button.is-warning`
  NOWHERE, so that site shipped with no warning treatment at all and the amber
  treatment shipped with no call site: a defect and a dead rule, from one typo, in a
  pair of buttons that are the same verb. That is why the role-to-class relation is a
  NAMED MAPPING below rather than an `is-${role}` template — the roles are a
  vocabulary, and the class each one emits is an implementation detail of the sheet
  that the vocabulary must not be forced to mirror.

  ── THE TOOL STUDIO IS THE AUTHORITY ──────────────────────────────────────────────
  The maintainer's ruling: `ToolEditView.svelte`'s header buttons define the correct
  rendering, and where another screen differs, THAT SCREEN CHANGES. Those buttons get
  their refined treatment from an ANCESTOR-CONTEXT rule —
  `.fabricate-manager .manager-tool-edit-actions .manager-button` (34px, `0 space-3`,
  `0.72rem`), plus the `.manager-header-actions .manager-button.is-primary`
  companion — which is precisely why the Modifiers card could not match them: it is
  not inside either ancestor, so it landed on the base control at the app's INHERITED
  body size. "The fonts differ from the tool studio's" is that missing `font-size`,
  exactly.

  Worth knowing when reading the sheet: `.manager-header-actions .manager-button`
  USED to declare a 38px control that the Tool Studio never rendered, because its own
  `.manager-tool-edit-actions` block stood later and pinned 34px. The authority is
  what that cluster RENDERS, so 34px is what this primitive reproduces, and the header
  rule's height is retired rather than arbitrated (issue 1118) — a real 4px repaint
  across the 27 buttons in an editor header's `<div>`. What that repaint does NOT do is
  align the button with the chip beside it: `styles/fabricate.css` loads at
  `layer(modules)` and `Chip.svelte`'s injected block does not, so the chip is
  Chip-owned at ~20px whatever the sheet says, and the two rules that claimed otherwise
  are retired as inert. An editor header is a 34px button beside a ~20px pill.

  The Tool Studio's own `.manager-tool-edit-actions .manager-button.is-ghost` companion
  is retired too, and for a sharper reason: at (0,4,0) and unqualified it beat
  `.manager-button:disabled` (0,3,0), so `ToolEditView`'s `disabled={saving}` Back
  button kept its switched-on colours for the whole of a save. The role's own
  `:not(:disabled)` companion in the sheet states the same three values, so the paint
  belongs to the role and the container keeps only its scale.

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
  `.manager-button`, so it owns its own tones. That invariant is why the anchor's
  `text-decoration: none` and the `is-full-width` rule live in `styles/fabricate.css`
  and not here, even though this component is what emits their classes.

  Consequence: this button is only styled inside `.fabricate-manager`. It is a manager
  primitive, not an app-agnostic one. `manager-layout.test.js` pins the equivalence in
  a real browser — it renders a tool studio button and a Modifiers card button of the
  same role and compares the COMPUTED `font-size`, `font-weight`, `padding`, `height`
  and `border-radius`, so a scoped rule landing on one screen and not the other reds
  the gate instead of shipping as drift. That harness READS `ROLE_CLASSES` and the
  `classes` array literal out of this file, so keep the mapping a named object
  declared outside the array and keep the array's own string literals to the two
  unconditional classes: an inline conditional there puts its tokens into every probe
  and the gate goes green while measuring markup this component never emits.

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
     correct treatment for a secondary verb), `'primary'`, `'ghost'`, `'danger'`,
     `'dashed'` or `'warning'`. Neutral is the default because it is what a bare
     `class="manager-button"` already renders, so converting an existing site is
     mechanical. The set is CLOSED: a per-site visual tweak is a pass-through class
     on `class`, never a seventh role — see `ui-integration/spec.md`.
   - tag: `'button'` (default) or `'a'`. Named `tag` because `Chip.svelte`, the same
     manager primitive family, already spells this capability that way; one meaning,
     one name. An unrecognised value renders a `<button>`.
   - href / target / rel: the anchor's own attributes, emitted only when an anchor is
     actually rendered.
   - type: the native button type, defaulting to `'button'` — a manager button inside
     a `<form>`-adjacent card must never submit by accident. Emitted only on a
     `<button>`; `type` on an anchor is invalid markup.
   - fullWidth: emits `is-full-width`. It is deliberately NOT a role. `dashed` used to
     pin `width: 100%` itself, which is a statement about the CONTAINER rather than
     about the verb, and it stacked a four-up wrapping row into four rows.
   - disabled / onclick: forwarded. `disabled` is not a valid attribute on an anchor,
     so it is ignored (and warned about) when an anchor is rendered.
   - children: the label snippet. Content is a snippet rather than a `label` string
     because the shipped call sites interleave an `<i>` glyph with localized text and
     some wrap the text in its own `<span>`.

  Every other attribute — `data-*` hooks, `aria-*`, `title`, `data-tooltip` — is
  forwarded through the rest spread, so a call site keeps its own selectors.
-->
<script>
  let {
    role = 'neutral',
    tag = 'button',
    href = '',
    target = undefined,
    rel = undefined,
    type = 'button',
    fullWidth = false,
    disabled = false,
    onclick = () => {},
    children = undefined,
    // An EXTRA class, appended to the primitive's own — never a replacement for it. It has
    // to be a named prop rather than a rest key: the rest spread lands after `class={…}` in
    // the markup, so a `class` passed through it would REPLACE `manager-button
    // fab-manager-button is-<role>` outright and silently unstyle the button while every
    // `data-*` selector in the tests kept resolving.
    class: extraClass = '',
    ...rest
  } = $props();

  // The role vocabulary, and the class each role emits. An unrecognised role renders the
  // neutral treatment rather than emitting an unstyled `is-*`, so a typo shows up as the
  // default button instead of silently doing nothing. `neutral` is in no way absent from
  // the set — it is the EMPTY MODIFIER, which is why it has no entry here.
  //
  // `dashed` is the ADD action that sits at the foot of a list it appends to — the Checks
  // Studio's "Add outcome tier", the prototype's own treatment for every add-a-row verb. It
  // is a role rather than a per-screen class because the shape is a statement about the
  // verb (append to the list above me), not about one card: a dashed outline reads as an
  // empty slot waiting to be filled, which a solid button does not.
  //
  // `danger` and `warning` are NOT a strength ordering of one idea, and the mapping is the
  // place that is worth saying so, because the two words are close enough to be picked by
  // feel: `danger` is the DESTRUCTIVE verb — the action removes or unlinks a record —
  // while `warning` is the OVERRIDE verb — the action proceeds against a rule the system
  // has already flagged, and destroys nothing. A control that does both is `danger`.
  //
  // `warning` is also the one role whose class is not `is-${role}`. The sheet's amber
  // treatment is `.manager-button.is-warning-action`; `.manager-button.is-warning` is
  // declared nowhere, and a call site that guessed the obvious spelling is exactly the
  // defect this mapping exists to make impossible to repeat.
  const ROLE_CLASSES = {
    primary: 'is-primary',
    ghost: 'is-ghost',
    danger: 'is-danger',
    dashed: 'is-dashed',
    warning: 'is-warning-action',
  };

  // Hoisted out of the `classes` array for the same reason `ROLE_CLASSES` is: the parity
  // harness scrapes that array's string literals into its probes.
  const FULL_WIDTH_CLASS = 'is-full-width';

  const TAGS = new Set(['button', 'a']);

  // An anchor with no `href` is not focusable, has no implicit link role and does not
  // activate on Enter — it is a `<div>` that looks like a link. Several anchor call sites
  // take their `href` from caller data, so the empty case is reachable in the product and
  // not merely a typo: render the control that actually works instead.
  const resolvedTag = $derived(
    TAGS.has(tag) && !(tag === 'a' && !String(href ?? '').trim()) ? tag : 'button'
  );

  const roleClass = $derived(ROLE_CLASSES[role] ?? '');
  const classes = $derived(
    [
      'manager-button',
      'fab-manager-button',
      roleClass,
      fullWidth ? FULL_WIDTH_CLASS : '',
      extraClass,
    ]
      .filter(Boolean)
      .join(' ')
  );

  // A primitive that owns the anchor shape owns its safety default too, or the conversion
  // preserves the per-site inconsistency this component exists to end. An explicit `rel`
  // still wins — `noopener noreferrer` is a legitimate thing for a caller to want.
  const resolvedRel = $derived(rel ?? (target === '_blank' ? 'noreferrer' : undefined));

  // Built conditionally rather than let through the rest spread, because the two element
  // shapes have DISJOINT attribute sets: `type` and `disabled` are invalid on an anchor,
  // and `href`, `target` and `rel` are invalid on a button.
  const attributes = $derived(
    resolvedTag === 'a' ? { href, target, rel: resolvedRel } : { type, disabled }
  );

  $effect(() => {
    if (resolvedTag === 'a' && disabled) {
      console.warn(
        'Fabricate | ManagerButton: `disabled` is not a valid attribute on an anchor and was ignored. ' +
          'Render a <button> (drop `tag="a"`, or leave `href` empty) if the control needs a disabled state.'
      );
    }
  });
</script>

<svelte:element this={resolvedTag} class={classes} {...attributes} {onclick} {...rest}
  >{@render children?.()}</svelte:element
>
