<!--
  THE button for a right-hand inspector's action stack (issue 1036).
  `openspec/specs/ui-visual-style/spec.md`'s "Right-inspector actions" rule makes importing it the
  contract; only the ESSENCE inspector is converted so far.

  `tone`: `primary` is the ONE loud verb per rail, `danger` destroys a record, `warning` BREAKS A
  LINK rather than destroying one (`Unlink Source` is the shipped case), and an unknown value
  renders neutral. `label` arrives localized and `{...rest}` lands on the `<button>`. It is NOT
  `.manager-button`, because that class would put the global sheet's tones ahead of this
  primitive's own; it takes the area-agnostic `fab-` namespace and the Foundry `<button>` reset.
-->
<script>
  let {
    tone = 'neutral',
    icon = '',
    label = '',
    disabled = false,
    title = '',
    ariaLabel = '',
    onClick = () => {},
    ...rest
  } = $props();

  // An unrecognised tone renders the neutral treatment rather than an unstyled `is-*` class.
  const TONES = new Set(['primary', 'danger', 'warning']);
  const classes = $derived(
    ['fab-inspector-action', TONES.has(tone) ? `is-${tone}` : ''].filter(Boolean).join(' ')
  );
</script>

<button
  type="button"
  class={classes}
  {disabled}
  title={title || undefined}
  aria-label={ariaLabel || undefined}
  onclick={() => onClick()}
  {...rest}
>
  {#if icon}<i class={icon} aria-hidden="true"></i>{/if}<span class="fab-inspector-action-label"
    >{label}</span
  >
</button>

<style>
  /* The Tool Studio's header treatment, restated for a stacked rail; `appearance`, `height` and
     `font-family` are the Foundry `<button>` reset (CONTRIBUTING.md "Instance 1"). */
  .fab-inspector-action {
    appearance: none;
    -webkit-appearance: none;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-chip);
    width: 100%;
    min-width: 0;
    height: auto;

    /* 34px — the shared compact control height, a notch under the Tool Studio header's 38px. */
    min-height: 34px;
    padding: 0 var(--fab-space-3);
    border: 1px solid var(--fab-border);

    /* THE CORNER FOLLOWS THE HEIGHT (issue 1371, ruling M12a): the radius ladder in
       `openspec/specs/design-system/spec.md` gives 9 to a control of 34 to 38. `.is-primary`'s 36 is
       a retired rung, booked in `tests/components/control-height-known-literals.js`. */
    border-radius: 9px;
    color: var(--fab-text);

    /* NO FILL — THE NEUTRAL VERB SITS ON THE PANE (issue 1372, maintainer parity round 6): the rail
       is `--fab-bg-0`, so the old `--fab-bg-2` read as raised. The hover still washes to raised. */
    background: transparent;
    font-family: inherit;

    /* 0.72rem, the Tool Studio's header label size; the essence rail inherited the app body size. */
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
  }

  /* The label owns the clipping; the glyph must not be squeezed by a long verb. */
  .fab-inspector-action > i {
    flex: 0 0 auto;
  }

  .fab-inspector-action-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fab-inspector-action:not(:disabled):hover {
    border-color: var(--fab-border-strong);
    background: var(--fab-surface-raised);
  }

  /* PRIMARY is the ACCENT, not success. Two extra pixels so the loud verb leads its neighbours. */
  .fab-inspector-action.is-primary {
    min-height: 36px;
    border-color: var(--fab-accent-border);
    color: var(--fab-on-accent);
    background: var(--fab-accent);
  }

  .fab-inspector-action.is-primary:not(:disabled):hover {
    border-color: var(--fab-accent);
    background: var(--fab-accent-strong);
  }

  /* DANGER keeps the panel surface and speaks in danger text and edge, so it never out-shouts the
     primary. The absent fill is restated rather than inherited: a later tone edit would restore it. */
  .fab-inspector-action.is-danger {
    border-color: var(--fab-danger-border);
    color: var(--fab-danger-text);
    background: transparent;
  }

  .fab-inspector-action.is-danger:not(:disabled):hover {
    border-color: var(--fab-danger-border);
    color: var(--fab-danger-text);
    background: var(--fab-danger-soft);
  }

  /* WARNING is the amber `Unlink Source` wore: unlinking breaks a reference and deletes nothing. */
  .fab-inspector-action.is-warning {
    border-color: var(--fab-warning-border);
    color: var(--fab-warning-text);
    background: var(--fab-warning-soft);
  }

  .fab-inspector-action.is-warning:not(:disabled):hover {
    border-color: var(--fab-warning-border);
    color: var(--fab-warning-text);
    background: var(--fab-warning-soft);
  }

  .fab-inspector-action:disabled {
    border-color: var(--fab-border);
    color: var(--fab-text-muted);
    background: var(--fab-overlay-light-04);
    cursor: default;
    opacity: 0.62;
  }
</style>
