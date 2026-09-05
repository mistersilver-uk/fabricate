<!-- Svelte 5 runes mode -->
<!--
  THE BAR THAT REPORTS WHAT JUST HAPPENED, OR WHAT IS WRONG RIGHT NOW (issue 1505).

  ── WHY IT EXISTS, AND HOW IT DIFFERS FROM `Callout` ──────────────────────────────
  `library.html:957` states the routing rule in four lines, and two of them are these
  two components: a CALLOUT is documentation — always true, stays put — while a NOTICE
  is state: it just happened, and it goes away. The two shipped surfaces converted here
  are both the second kind. The alchemy workbench reports the brew that just resolved,
  and the inventory bulk report heads a run that has just finished; neither sentence is
  true a moment before the player acted.

  ── THE API IS THE LIBRARY'S, NOT A NEW ONE ───────────────────────────────────────
  `library.html:958` states this component's API in full — `tone`, `title`, `detail`,
  `action {label, onClick}`, `dismissable`, `blocking` — so it is followed VERBATIM,
  including its spellings, rather than re-designed. Four recorded deviations follow.

  Geometry from `library.html:221-230`: r11, `var(--fab-space-3)` of padding and gap,
  a tone-paired `*-soft` fill over a `*-border` edge, a 13px leading glyph, a 12px/600
  title in the tone's own text colour and an 11px/1.55 detail in `--fab-text-muted`.
  At every tone the specimen declares, the glyph and the title carry the SAME
  `--fab-<tone>-text`, because `:226`, `:228` and `:230` set `.i` and `.ttl` in one
  rule. This component keeps that as one sentence rather than splitting it per tone.

  `tone` DEFAULTS to `danger`, which is the unmodified `.k-notice` at `library.html:221`
  — the tone the specimen paints before any modifier class is added — and an unknown
  tone falls back to it rather than rendering unstyled.

  `align-items: flex-start` is declared EXPLICITLY. `.k-notice` declares no
  `align-items` at all and renders top-aligned only because its glyph is a fixed 13px
  box with a 2px top margin, so attributing `flex-start` to the specimen would be
  wrong. It is stated here because the alchemy banner is `align-items: center` today
  and its conversion moves for this reason rather than by accident.

  ── THE FOUR RECORDED DEVIATIONS FROM `library.html:958` ──────────────────────────
  1. `tone` also accepts `accent`. `InventoryBulkReport.svelte` derives it for the
     destroy run and for the mixed outcome — two of its four states — over the comment
     that says why: "Mixed" is neither of the other two, so it takes the neutral accent
     rather than a third colour ramp invented for "some of each", and a completed
     destroy is what the player asked for rather than a success or a failure. Three
     published frames draw those states, so a union without `accent` would either lose
     them on conversion or repaint three photographed frames without saying so.
     The specimen declares no accent notice to copy, so its title AND its glyph take
     `--fab-accent-text` rather than `--fab-accent`: the two are distinct tokens in all
     seven palettes, and `styles/fabricate.css` records that inking an accent band with
     the accent itself measures 4.48:1 in `ironblood-forge`, under AA.
  2. `font-variant-numeric: tabular-nums` on the detail, which `.k-notice .det` omits
     and `.bulk-banner-summary` declares over a live count sentence for the stated
     reason "Tabular figures still keep the counts from jittering as the run resolves".
  3. `icon`, and it is load-bearing rather than a convenience. Both converted callers
     DERIVE a glyph per state — the workbench draws an hourglass while a timed brew is
     live and a cross when one fizzles, and the bulk report draws a trash can for a
     destroy and a balance scale for a mixed outcome — and two of those four bulk states
     resolve to the SAME tone, so no per-tone default can express them. Without the prop
     the conversion silently repaints six glyphs. A per-tone default is still supplied,
     for the caller that has nothing more specific to say.
  4. The hook props below, which `library.html:958` does not enumerate because the
     specimen has no test harness. They are attribute-only and carry no behaviour.

  ── WHAT IT DOES NOT TAKE ─────────────────────────────────────────────────────────
  No `class`, no `style` and no rest spread. A caller that needs LAYOUT keeps its own
  wrapper element and nests this inside it: `Workbench.svelte` is the conversion that
  exercises it, keeping `.alchemy-banner` stripped to the one `margin-bottom` that
  genuinely separates the banner from the Brew button beneath it.

  No English-defaulted label. `dismissLabel` defaults to the empty string and its
  binding is guarded (`aria-label={dismissLabel || undefined}`), because an empty
  `aria-label` SUPPRESSES an element's accessible name rather than falling back to its
  content. Every button this component emits carries `data-keyboard-focus="true"`, so
  Foundry's `KeyboardManager#hasFocus` sees the focus and Space does not pause the game
  behind the open application.

  It is an IMPORT-FREE LEAF — props only, no bridge, no util imports — for
  `InspectorCard.svelte`'s reason: one util import inside a leaf propagates a required
  raw-module entry into every mount harness that compiles anything rendering it, and a
  missing entry HANGS that suite (`# cancelled`) rather than failing it.

  Props:
   - tone: `'danger' | 'warning' | 'info' | 'success' | 'accent'`, defaulting to
     `danger`. It changes the edge, the fill, the glyph's ink and the title's ink.
     Never the geometry or the type scale — a tone that changed size would reintroduce
     exactly the drift this component removes.
   - title: the sentence that names what happened. Already localized by the caller.
   - detail: the optional second line, which says what to do next.
   - icon: optional Font Awesome classes; a per-tone default is used when it is unset.
   - action: `{ label, onClick }`, rendered as one button. The handler is called with
     the click event.
   - dismissable / dismissLabel: an opt-in dismiss control and its accessible name.
     Dismissal is this component's own state — the notice leaves the DOM.
   - blocking: `role="alert"` when true and `aria-live="polite"` otherwise, which is
     what announces a notice that appears without a focus change. The PAGE-LEVEL
     arbitration the design system requires — one blocking bar at a time, the rest
     stacking beneath it — belongs to the shared region that has not shipped yet, and
     this prop does not claim it.
   - dataAttr / dataValue: an optional test/screenshot hook on the root, e.g.
     `dataAttr="data-inventory-bulk-banner"`. Spread, so the attribute is genuinely
     ABSENT when unset rather than an empty one a selector would still match.
   - stateDataAttr / stateDataValue: a SECOND hook pair on the same root, because the
     alchemy banner carries two — `data-alchemy-banner` and, beside it,
     `data-alchemy-banner-status={bannerStatus}` naming the state it is reporting. One
     pair could not carry both, and a wrapper element invented to hold the second would
     be layout minted for a hook.

     Both `dataValue` and `stateDataValue` default to the EMPTY STRING and are passed
     through as written, so a hook written BARE on the element this replaces still
     renders `data-x=""` rather than the `data-x="true"` a bare attribute on a component
     tag produces. Presence selectors resolve either way, which is exactly why the
     difference would not have been caught.
-->
<script>
  let {
    tone = 'danger',
    title = '',
    detail = '',
    icon = '',
    action = null,
    dismissable = false,
    dismissLabel = '',
    blocking = false,
    dataAttr = '',
    dataValue = '',
    stateDataAttr = '',
    stateDataValue = '',
  } = $props();

  /** The specimen's four tones plus the `accent` deviation the bulk report needs. */
  const TONES = new Set(['danger', 'warning', 'info', 'success', 'accent']);

  const DEFAULT_ICONS = {
    // The specimen draws the SAME alert glyph at `danger` and at `warning`
    // (`library.html:940-941`, `#i-alert` in both), so they share one default here.
    danger: 'fas fa-triangle-exclamation',
    warning: 'fas fa-triangle-exclamation',
    info: 'fas fa-circle-info',
    success: 'fas fa-circle-check',
    // The specimen declares no accent notice, so there is no glyph of its own to copy.
    // Both shipped accent states pass their own, which is what the `icon` prop is for.
    accent: 'fas fa-circle-info',
  };

  // An unknown tone falls back to `danger` rather than rendering unstyled — the
  // unmodified `.k-notice` is the danger one, so the fallback is the specimen's base.
  const resolvedTone = $derived(TONES.has(tone) ? tone : 'danger');
  const resolvedIcon = $derived(icon || DEFAULT_ICONS[resolvedTone]);

  // Dismissal is the component's own state: `library.html:958` declares `dismissable` as
  // a boolean and no caller to tell, so the notice simply leaves the DOM.
  let dismissed = $state(false);

  // Spread so each hook is genuinely absent when unset, rather than an empty attribute a
  // selector would still match.
  const hookAttributes = $derived({
    ...(dataAttr ? { [dataAttr]: dataValue } : {}),
    ...(stateDataAttr ? { [stateDataAttr]: stateDataValue } : {}),
  });
</script>

{#if !dismissed}
  <div
    class="fab-notice is-{resolvedTone}"
    role={blocking ? 'alert' : undefined}
    aria-live={blocking ? undefined : 'polite'}
    data-notice-tone={resolvedTone}
    {...hookAttributes}
  >
    <i class={resolvedIcon} aria-hidden="true"></i>
    <div class="fab-notice-body">
      <div class="fab-notice-title">{title}</div>
      {#if detail}<div class="fab-notice-detail">{detail}</div>{/if}
    </div>
    {#if action}
      <button
        type="button"
        class="fab-notice-button"
        data-keyboard-focus="true"
        data-notice-action
        onclick={(event) => action.onClick?.(event)}>{action.label}</button
      >
    {/if}
    {#if dismissable}
      <button
        type="button"
        class="fab-notice-button is-dismiss"
        data-keyboard-focus="true"
        data-notice-dismiss
        aria-label={dismissLabel || undefined}
        onclick={() => (dismissed = true)}
      >
        <i class="fas fa-xmark" aria-hidden="true"></i>
      </button>
    {/if}
  </div>
{/if}

<style>
  /* Theme-root tokens ONLY. NO scoped `<style>` may reference `--fab-manager-*`, or any other
     custom property `styles/fabricate.css` declares inside `.fabricate-manager`, from ANY
     directory — a component is placed in a directory, not in a DOM subtree, so its scoped CSS
     cannot guarantee where its host renders, and `tests/token-generation-gate.test.js` reds the
     reference wherever it is written. Every token below is declared in `:root` and in all seven
     `.fabricate[data-fabricate-theme="…"]` blocks, which every Fabricate surface carries. */
  .fab-notice {
    /* See the Callout note: area-agnostic, so the padding model is declared rather than
       inherited from `.fabricate-manager * { box-sizing }`. */
    box-sizing: border-box;
    display: flex;
    /* DECLARED, not inherited from the specimen — see the header. */
    align-items: flex-start;
    gap: var(--fab-space-3);
    min-width: 0;
    /* The specimen declares no margin, and neither does this: separation from what sits
       beneath a notice is the caller's layout, not the notice's geometry. */
    margin: 0;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-danger-border);
    border-radius: 11px;
    background: var(--fab-danger-soft);
  }

  /* `.k-notice .i`'s fixed 13px box, so a wide glyph cannot widen the leading column and
     shift the title with it. `var(--fab-space-2xs)` is the specimen's 2px, tokenized. */
  .fab-notice > i {
    flex: none;
    width: 13px;
    margin-top: var(--fab-space-2xs);
    color: var(--fab-danger-text);
    font-size: 13px;
    line-height: 1;
    text-align: center;
  }

  .fab-notice-body {
    flex: 1;
    min-width: 0;
  }

  .fab-notice-title {
    color: var(--fab-danger-text);
    font-size: 12px;
    font-weight: 600;
  }

  /* Tabular figures over a live count sentence — see deviation 2 in the header. */
  .fab-notice-detail {
    margin-top: var(--fab-space-2xs);
    color: var(--fab-text-muted);
    font-size: 11px;
    font-weight: 400;
    line-height: 1.55;
    font-variant-numeric: tabular-nums;
  }

  /* `.k-btn` at the 28px the specimen's own notice buttons take (`library.html:940-942`),
     which is a live rung of the control-height ladder. */
  .fab-notice-button {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-chip);
    height: 28px;
    min-height: 28px;
    padding: 0 var(--fab-space-3);
    border: 1px solid transparent;
    border-radius: 7px;
    color: var(--fab-text-secondary);
    background: var(--fab-surface-soft);
    font-size: 12.5px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
  }

  .fab-notice-button:hover {
    color: var(--fab-text);
    background: var(--fab-surface-raised);
  }

  /* The dismiss control is the same button carrying one glyph, so it is square rather
     than padded for a word. */
  .fab-notice-button.is-dismiss {
    width: 28px;
    padding: 0;
  }

  /* Each tone paints the edge, the fill, the glyph and the title. Nothing else — the
     detail stays `--fab-text-muted` at every tone, as the specimen has it. */
  .fab-notice.is-warning {
    border-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }

  .fab-notice.is-warning > i,
  .fab-notice.is-warning .fab-notice-title {
    color: var(--fab-warning-text);
  }

  .fab-notice.is-info {
    border-color: var(--fab-info-border);
    background: var(--fab-info-soft);
  }

  .fab-notice.is-info > i,
  .fab-notice.is-info .fab-notice-title {
    color: var(--fab-info-text);
  }

  .fab-notice.is-success {
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
  }

  .fab-notice.is-success > i,
  .fab-notice.is-success .fab-notice-title {
    color: var(--fab-success-text);
  }

  /* `--fab-accent-text`, not `--fab-accent` — see deviation 1 in the header. */
  .fab-notice.is-accent {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
  }

  .fab-notice.is-accent > i,
  .fab-notice.is-accent .fab-notice-title {
    color: var(--fab-accent-text);
  }
</style>
