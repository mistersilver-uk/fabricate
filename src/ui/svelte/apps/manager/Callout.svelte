<!-- Svelte 5 runes mode -->
<!--
  THE STANDING STATEMENT: a leading semantic glyph beside a note that is always true, in a
  rounded strip. Use it for a permanent explanation of how a surface behaves, for a rule that
  holds whatever the reader does next, and for a conditional hazard — same function, same
  layout, ONE implementation.

  It exists because the two Knowledge tabs had drifted into two of them (issue 785). The
  Recipe items tab rendered `.manager-component-info-banner` (compact:
  `var(--fab-space-chip) var(--fab-space-2)` padding at `0.66rem`) and the Learned recipes
  tab rendered `.manager-warning-band .manager-knowledge-learned-band` (taller:
  `var(--fab-space-3)` padding at `0.7rem`/`500`/`1.45`) — the same strip at two sizes on
  adjacent tabs of one screen.

  ── WHAT A CALLOUT IS, AS AGAINST A NOTICE ────────────────────────────────────────────
  `library.html:957` states the routing rule in four lines, and the first two are the pair
  that is easy to confuse: a CALLOUT is documentation — always true, stays put — while a
  NOTICE is state, which just happened and goes away. `components/Notice.svelte` is the
  other one; a sentence that would be false a moment ago belongs there, not here.

  ── THE GEOMETRY IS THE SPECIMEN'S, AND THAT IS A CHANGE (issue 1505) ─────────────────
  `library.html:219-220` draws this control as r11 / `var(--fab-space-3)` /
  `--fab-surface-soft` / 1px `--fab-border` / 11.5px / 1.6 / `--fab-text-muted`, with a 13px
  `--fab-text-subtle` glyph at a 2px top margin — and its caption states the tone rule:
  "Reach for the info tint only when the note is about live state." This component used to
  be r8, info-tinted BY DEFAULT, `--fab-text`, 0.7rem / 500 / 1.45, centred, with a
  `--fab-info` glyph, and its own docblock defended that as "the taller treatment, which is
  the one already approved visually". Both halves of that sentence are now false, and the
  evidence was already in the tree: the Checks studio carried a caller override
  (`styles/fabricate.css`, deleted with this change) whose own comment said "the prototype
  draws this one quietly — the surface fill and the ordinary border, with the glyph carrying
  the only colour". That override WAS the specimen on every property that decides the tone
  model. So the quiet treatment becomes the default and `tone="info"` becomes opt-in.

  There is deliberately NO `quiet` prop. A second geometry is the drift this component
  exists to remove; what changed is which one of the two is the default.

  `font-weight: 400` is DECLARED even though `library.html:219` declares none. The specimen
  sits in a page whose body weight is already normal, while this renders inside hosts that
  set their own — a card head, a section title's sibling — so the weight has to be stated
  for the type to be the specimen's rather than the host's.

  `align-items: flex-start` is likewise declared EXPLICITLY. `.k-callout` declares no
  alignment at all and renders top-aligned only because its glyph is a fixed 13px box, so
  attributing `flex-start` to the specimen would be wrong.

  ── TONE ──────────────────────────────────────────────────────────────────────────────
  Tone is a real distinction, not decoration, and the specimen states when to spend it:
  `neutral` is the resting treatment for a note that is simply true; `info` is for a note
  about LIVE state; `warning` is a conditional hazard the reader can still avoid; `accent`,
  `success` and `danger` name a mode, a settled good outcome and a settled bad one. A screen
  that paints its permanent hint in `warning` too has spent the colour that was supposed to
  make the hazard stand out.

  A tone changes the edge, the fill, the GLYPH's ink and the TITLE's ink. Never the padding,
  the geometry or the type scale. At every tinted tone the glyph and the title take the same
  `--fab-<tone>-text`, mirroring `.k-notice`, which sets `.i` and `.ttl` in one rule at
  `library.html:226`, `:228` and `:230` — and at `accent`, which the specimen does not
  declare, that ink is `--fab-accent-text` rather than `--fab-accent`, because inking an
  accent band with the accent itself measures 4.48:1 in `ironblood-forge`, under AA.

  ── TITLE AND ACTIONS ─────────────────────────────────────────────────────────────────
  `library.html:219-220` draws no title element, so the title borrows the NOTICE title's
  treatment whole rather than half of it: 12px / 600 (`library.html:223`), painted
  `--fab-text` at `neutral` and the tone's own ink at every tinted tone, over the specimen's
  11.5px / 1.6 body. With a title present the body also takes `.k-notice .det`'s own 2px top
  margin (`library.html:224`), so a title and its body are a pair rather than one run.

  The tone-bound title is the surviving REASON from the inventory salvage banner, which stated
  it beside its own three per-tone rules and hands it here on conversion: the title takes its
  TONE's text colour, not a flat one, because a tinted box whose headline is the same grey in
  every state throws the ramp away.

  Rooting follows the content: a `<p>` for the plain form, and a `<div role="note">` when a
  title or an action is present, because a `<p>` cannot legally contain them.

  Its CSS lives in this scoped `<style>`, not `styles/fabricate.css`, so `VIEW_RECIPES` in
  `scripts/ui-pr-screenshot-evidence.mjs` maps a change here to the views that actually
  render it instead of matching the broad `theme-or-global-ui` recipe.

  Props:
   - tone: `'neutral'` (default) | `'info'` | `'accent'` | `'warning'` | `'success'` |
     `'danger'`. An unknown tone falls back to `neutral` rather than rendering unstyled.
   - title: the optional headline above the sentence.
   - text: the sentence. One idea per strip.
   - icon: Font Awesome classes; defaults per tone.
   - actions: an optional snippet of controls rendered inside the strip, so a note and the
     one control that answers it are one object rather than two siblings a wrapper has to
     hold together.
   - dataAttr / dataValue: an optional test/screenshot hook, e.g.
     `dataAttr="data-knowledge-learned-banner"`.
-->
<script>
  let {
    tone = 'neutral',
    title = '',
    text = '',
    icon = '',
    actions = undefined,
    dataAttr = '',
    dataValue = '',
  } = $props();

  /** The measured tone set: the specimen's neutral plus the five a caller in the tree derives. */
  const TONES = new Set(['neutral', 'info', 'accent', 'warning', 'success', 'danger']);

  const DEFAULT_ICONS = {
    neutral: 'fas fa-circle-info',
    info: 'fas fa-circle-info',
    accent: 'fas fa-circle-info',
    warning: 'fas fa-triangle-exclamation',
    success: 'fas fa-circle-check',
    danger: 'fas fa-circle-exclamation',
  };

  // An unknown tone falls back to `neutral` rather than rendering an unstyled strip.
  const resolvedTone = $derived(TONES.has(tone) ? tone : 'neutral');
  const resolvedIcon = $derived(icon || DEFAULT_ICONS[resolvedTone]);

  // A `<p>` cannot legally contain a heading-shaped child or a button, so the root follows
  // the content rather than being one element that is sometimes invalid.
  const structured = $derived(Boolean(title) || Boolean(actions));

  // Spread so the hook is genuinely absent when unset, rather than an empty attribute a
  // selector would still match.
  const hookAttributes = $derived(dataAttr ? { [dataAttr]: dataValue || true } : {});
</script>

<svelte:element
  this={structured ? 'div' : 'p'}
  role={structured ? 'note' : undefined}
  class="manager-callout"
  class:is-info={resolvedTone === 'info'}
  class:is-accent={resolvedTone === 'accent'}
  class:is-warning={resolvedTone === 'warning'}
  class:is-success={resolvedTone === 'success'}
  class:is-danger={resolvedTone === 'danger'}
  data-callout-tone={resolvedTone}
  {...hookAttributes}
>
  <i class={resolvedIcon} aria-hidden="true"></i>
  <span class="manager-callout-body">
    {#if title}<span class="manager-callout-title">{title}</span>{/if}
    <span class="manager-callout-text">{text}</span>
  </span>
  {#if actions}<span class="manager-callout-actions">{@render actions()}</span>{/if}
</svelte:element>

<style>
  /* Theme-root tokens ONLY. NO scoped `<style>` may reference `--fab-manager-*`, or any other
     custom property `styles/fabricate.css` declares inside `.fabricate-manager`, from ANY
     directory — a component is placed in a directory, not in a DOM subtree, so its scoped CSS
     cannot guarantee where its host renders, and `tests/token-generation-gate.test.js` reds the
     reference wherever it is written. Outside the manager —
     `.fabricate-app`, `.fabricate-admin`, `.fabricate-interactables-manager` — such a
     property is not in scope, the declaration becomes invalid at computed-value time and
     the colour silently falls back to inheritance. Nothing fails; it just looks wrong, and
     the trigger is exactly the reuse this primitive exists to enable. Every token below is
     declared in `:root` or in all seven `.fabricate[data-fabricate-theme="…"]` blocks,
     which every Fabricate surface carries. */
  /* The specimen's geometry and type, which is the QUIET treatment: the surface fill and the
     ordinary border, with the tint reserved for the tones that earn it. */
  .manager-callout {
    /* See the EmptyState note: area-agnostic, so the padding model is declared, not
       inherited from `.fabricate-manager * { box-sizing }`. */
    box-sizing: border-box;
    display: flex;
    /* DECLARED, not inherited from the specimen — see the header. */
    align-items: flex-start;
    gap: var(--fab-space-3);
    min-width: 0;
    margin: 0;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 11px;
    color: var(--fab-text-muted);
    background: var(--fab-surface-soft);
    font-size: 11.5px;
    font-weight: 400;
    line-height: 1.6;
  }

  /* `.k-callout .i`'s fixed 13px box, so a wide glyph cannot widen the leading column and
     shift the sentence with it. `var(--fab-space-2xs)` is the specimen's 2px, tokenized. */
  .manager-callout > i {
    flex: none;
    width: 13px;
    margin-top: var(--fab-space-2xs);
    color: var(--fab-text-subtle);
    font-size: 13px;
    line-height: 1;
    text-align: center;
  }

  .manager-callout-body {
    flex: 1;
    min-width: 0;
  }

  /* `.k-notice .ttl`'s own metrics — see the header for why the title borrows them whole. */
  .manager-callout-title {
    display: block;
    color: var(--fab-text);
    font-size: 12px;
    font-weight: 600;
  }

  .manager-callout-text {
    display: block;
  }

  /* `.k-notice .det`'s 2px, and only where there is a title for the body to sit under. */
  .manager-callout-title + .manager-callout-text {
    margin-top: var(--fab-space-2xs);
  }

  .manager-callout-actions {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-2);
  }

  /* Each tinted tone repaints the edge, the fill, the glyph and the title — and nothing else.
     The body stays `--fab-text-muted` at every tone, as the specimen has it. */
  .manager-callout.is-info {
    border-color: var(--fab-info-border);
    background: var(--fab-info-soft);
  }

  .manager-callout.is-info > i,
  .manager-callout.is-info .manager-callout-title {
    color: var(--fab-info-text);
  }

  /* `--fab-accent-text`, not `--fab-accent` — see the header for the contrast measurement. */
  .manager-callout.is-accent {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
  }

  .manager-callout.is-accent > i,
  .manager-callout.is-accent .manager-callout-title {
    color: var(--fab-accent-text);
  }

  .manager-callout.is-warning {
    border-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }

  .manager-callout.is-warning > i,
  .manager-callout.is-warning .manager-callout-title {
    color: var(--fab-warning-text);
  }

  .manager-callout.is-success {
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
  }

  .manager-callout.is-success > i,
  .manager-callout.is-success .manager-callout-title {
    color: var(--fab-success-text);
  }

  .manager-callout.is-danger {
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
  }

  .manager-callout.is-danger > i,
  .manager-callout.is-danger .manager-callout-title {
    color: var(--fab-danger-text);
  }
</style>
