<!-- Svelte 5 runes mode -->
<!--
  A labelled status card carrying an on/off switch: icon · title + sub-line · toggle.

  LOCATION IS DELIBERATE (issue 651). This lives under `apps/manager/`, NOT under
  `components/`, because it is NOT theme-agnostic: it wears `manager-recipe-status-card`
  classes that are styled only under `.fabricate-manager`. Dropped into `.fabricate-app`
  it renders as an unstyled div. Its siblings in `components/` (Stepper, StatusPill) carry
  no such coupling; both of this card's call sites are manager surfaces, so the coupling is
  accepted and the file is located where it cannot mislead.

  The markup is a BYTE-FAITHFUL extraction of `RecipeOverviewTab`'s Enabled/Locked status
  cards (same element tree, same class names, same aria shape) so that retrofitting those
  two cards onto this component (issue 658) is a no-op DOM diff. If you change the
  structure here, that retrofit stops being a no-op and this becomes a third source of
  truth rather than the second being retired. `aria-pressed` on a plain `<button>` is the
  house pattern — the repo uses no `role="switch"` anywhere; do not introduce one here.

  String props are PRE-LOCALIZED by the caller (no `localize` import): the caller owns the
  i18n keys and their fallbacks, which keeps this component a presentational leaf.
-->
<script>
  let {
    // Visual variant appended to the card class (e.g. 'is-info'), toning it when on.
    variant = '',
    icon = 'fas fa-circle',
    title = '',
    sub = '',
    on = false,
    disabled = false,
    // Pre-localized accessible name for the switch; falls back to the visible title.
    toggleLabel = '',
    // Pre-localized tooltip for the SWITCH (not the card). Named `toggleTitle` because
    // `title` above is already the card heading. This exists for the Overview Enabled
    // card, whose conditional tooltip is the ONLY explanation a GM gets for why the
    // switch is disabled when validation blocks enabling — without a prop for it, the
    // issue-658 retrofit would have to drop a real affordance on a disabled control.
    // Emitted as `|| undefined` to reproduce that card's existing undefined branch: an
    // empty string would render a present-but-blank tooltip.
    toggleTitle = '',
    // Test/automation hook, mirroring the Overview cards' `data-recipe-section`.
    section = '',
    field = '',
    // Attribute hook for the sub-line, mirroring the Overview Locked card's
    // `data-recipe-locked-state`. Without it the retrofit hits the same wall on the
    // second card that `toggleTitle` clears on the first.
    subAttr = '',
    onToggle = () => {}
  } = $props();
</script>

<div
  class={`manager-recipe-status-card ${variant} ${on ? 'is-on' : 'is-off'}`}
  data-recipe-section={section || undefined}
>
  <span class="manager-recipe-status-icon" aria-hidden="true"><i class={icon}></i></span>
  <div class="manager-recipe-status-copy">
    <p class="manager-recipe-status-title">{title}</p>
    <!-- `''` not `true`: a bare attribute renders `=""`, which is the byte the Overview
         cards emit today. Every consumer form is insensitive, but the issue 658 retrofit
         is a no-op DOM diff only if this matches exactly. -->
    <p class="manager-recipe-status-sub manager-muted" {...(subAttr ? { [subAttr]: '' } : {})}>
      {sub}
    </p>
  </div>
  <button
    type="button"
    class={`manager-status-toggle ${on ? 'is-on' : 'is-off'}`}
    data-recipe-field={field || undefined}
    aria-pressed={on}
    aria-label={toggleLabel || title}
    title={toggleTitle || undefined}
    {disabled}
    onclick={() => onToggle(!on)}
  >
    <span class="manager-status-toggle-track" aria-hidden="true"
      ><span class="manager-status-toggle-knob"></span></span
    >
  </button>
</div>
