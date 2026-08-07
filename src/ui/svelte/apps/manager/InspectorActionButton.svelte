<!-- Svelte 5 runes mode -->
<!--
  THE button for a right-hand inspector's actions (issue 1036).

  ── POINT OF ARRIVAL ──────────────────────────────────────────────────────────────
  Every GM studio ends in the same place: a right-hand rail whose last card is a stack of
  verbs for the selected entity — Duplicate, Edit, Delete, Copy source UUID, Unlink. Before
  this component there were THREE renderings of that one meaning:

   1. `.manager-recipe-browser-inspector-*` — 36/38px, `0.78rem`, accent primary, danger
      delete, declared in `styles/fabricate.css`.
   2. `.manager-component-browser-inspector-*` — the same block, joined into the same
      selector lists, so a change to one silently re-typed the other.
   3. the essence inspector's bare `.manager-button` / `.is-primary` / `.is-danger`, which
      inherited the manager's 34px control at the app's body size — visibly chunkier text
      than either — and painted its primary in the SUCCESS family, so `Edit essence`
      rendered green where the design's primary is the accent.

  The maintainer's ruling is that the Tool Studio's editor header buttons are the refined
  treatment and the one every right inspector should arrive at, so this component takes THAT
  as its base: `0.72rem` label, 700 weight, the compact control height, a 6px radius, and
  icon-before-label with the chip gap. It is the same scale the Tool Studio's
  `← Back to tools` / `Delete` / `Save tool` render at
  (`.fabricate-manager .manager-header-actions .manager-button`, `min-height: 38px`,
  `font-size: 0.72rem`), re-expressed for a full-width stacked rail rather than a
  right-aligned toolbar.

  The NEXT studio's inspector must import this rather than hand-rolling a fourth variant.
  `openspec/specs/ui-integration/spec.md` states that as a contract; this comment states the
  reason it exists at all.

  ── WHAT IS DEFERRED, AND WHY IT IS NOT A LICENCE ─────────────────────────────────
  Only the ESSENCE inspector is converted in this change. The recipe, component, Tool Studio
  and Tags inspectors still render their own treatments and are listed for a follow-up: a
  sweep re-photographs four more studios, and folding that into a change whose subject is the
  essence rail would make a frame regression ambiguous between the two. A primitive that
  coexists with unconverted duplicates has added a variant rather than removed one, so the
  deferral is recorded rather than assumed.

  ── IT IS NOT `.manager-button` ───────────────────────────────────────────────────
  Deliberately. `.fabricate-manager .manager-button.is-primary` is three classes; a scoped
  Svelte rule compiles to two (`.fab-inspector-action.is-primary.svelte-<hash>` still selects
  on two of ITS OWN classes plus the hash, but the global rule would win the tone), so
  reusing that class and those modifier names would put the primitive's own tones behind the
  global sheet's. The `fab-` namespace is the repo's convention for an area-agnostic shared
  primitive (`fab-medallion`, `fab-status-pill`, `fab-selection-check`) and it collides with
  nothing in the global sheet.

  Because it is not `.manager-button`, it must carry the Foundry `<button>` reset itself —
  Foundry pins a fixed `height` and its own `font-family` on every button. Those declarations
  are in the scoped block below, exactly as `Chip.svelte` carries them for its own
  button-tagged variant. Foundry's rules are inside `@layer`, so this unlayered block beats
  them at any specificity.

  Every token it reads is declared in `:root` or in all seven theme blocks — never a
  `--fab-mv2-*` manager alias — so the component stays usable outside `.fabricate-manager`.

  Props:
   - tone: `'neutral'` (default), `'primary'` (accent fill — the ONE loud verb per rail),
     `'danger'` (danger text on the panel surface; destructive, never louder than primary) or
     `'warning'` (amber; a verb that BREAKS A LINK rather than destroying a record — the
     essence inspector's `Unlink Source` is the shipped example and it carried the amber
     `.manager-button.is-warning-action` treatment before this extraction, so dropping the
     tone would have re-typed a live control into the destructive family).
   - icon: Font Awesome classes for the leading glyph.
   - label: the localized button text. Strings arrive pre-localized; this is a leaf.
   - disabled / title / ariaLabel: forwarded.
   - onClick: the verb.

  Every other attribute — `data-*` hooks especially — is forwarded through the rest spread,
  so a call site keeps its own selectors.
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

  // An unrecognised tone renders the neutral treatment rather than emitting an unstyled
  // `is-*` class, so a typo shows up as the default button instead of silently doing nothing.
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
  /* The Tool Studio's header treatment, re-expressed for a stacked rail. The `appearance`,
     `height` and `font-family` declarations are the Foundry `<button>` reset — see the
     header and CONTRIBUTING.md "Instance 1 — button layout". */
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

    /* 34px — the shared compact control height, and a notch under the Tool Studio header's
       38px because a rail button is not a toolbar button. */
    min-height: 34px;
    padding: 0 var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    color: var(--fab-text);
    background: var(--fab-bg-2);
    font-family: inherit;

    /* 0.72rem (~11.5px), the Tool Studio's header label size. The essence rail rendered
       these at the app's inherited body size, which is what "chunky with large text" was. */
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

  /* PRIMARY is the ACCENT, not success. The design system states it plainly — "Primary =
     accent + on-accent text · Confirm = success" — and the recipe and component inspectors
     already paint their Edit in the accent. The essence rail's green Edit was the odd one
     out and this is where that is fixed. Two extra pixels of height so the loud verb leads
     its neighbours without a second size for the same control. */
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

  /* DANGER keeps the panel surface and speaks in danger text and a danger-tinted edge, so a
     destructive verb reads as destructive without ever out-shouting the primary. */
  .fab-inspector-action.is-danger {
    border-color: var(--fab-danger-border);
    color: var(--fab-danger-text);
    background: var(--fab-bg-2);
  }

  .fab-inspector-action.is-danger:not(:disabled):hover {
    border-color: var(--fab-danger-border);
    color: var(--fab-danger-text);
    background: var(--fab-danger-soft);
  }

  /* WARNING is the amber the shipped `Unlink Source` wore. Unlinking a source breaks a
     reference; it deletes nothing, so it is not danger. Same values as
     `.manager-button.is-warning-action`, carried across rather than reinterpreted. */
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
