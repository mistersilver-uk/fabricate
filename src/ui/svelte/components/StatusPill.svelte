<!-- Svelte 5 runes mode -->
<!--
  The recipe-row / inspector states, as one pill:

   - `subtle`  — Disabled (a recipe the GM switched off), and the inspector's Off state.
   - `success` — the inspector's On state (a dot + the word, mirroring the row's switch).
   - `accent`  — Locked (visible to players, GM-only to craft).
   - `danger`  — Can't enable (an activation blocker: enabling would be refused).
   - `warning` — Incomplete (a persistable authoring shell, not yet craftable).
   - `info`    — In progress / not yet resolved: an outcome that is neither a
                 success nor a failure and needs no action from the player (the
                 bulk salvage report's time-gated "Started — finishes when time
                 passes" row, issue 859). ADDED, not repurposed: every existing
                 consumer computes its tone from a closed set that excludes
                 `info`, so no shipped pixel changes.

  These five — now six — are the WHOLE ramp. A new state belongs on one of them;
  adding a seventh means the state genuinely is not any of the six, which has not
  happened yet.

  Import-free leaf (design-system §7): props only — no foundryBridge, no model or
  util imports. The caller resolves the localized `label` and the Font Awesome
  `icon` class, so nothing here reaches for `game.i18n`.

  ── AN UNRECOGNISED TONE FALLS BACK; IT DOES NOT RENDER UNSTYLED (issue 1372) ─────

  Every tone rule below is a THREE-property block — colour, border-colour, fill — over a base
  that declares `border: 1px solid transparent` and no background at all. So a caller naming a
  tone this component does not have got a pill with no fill and no edge: a bare glyph and some
  small text, which reads as a deliberately quieter treatment rather than as a mistake. Four
  essence call sites shipped `neutral` and `positive` — neither is in the ramp — and the result
  was two visibly different status treatments one click apart on the same state, which survived
  three review rounds because nothing anywhere fails on it.

  `Chip` already settles this the same way for the same reason ("a typo shows up as the
  recessive default instead of as nothing at all"), so this is that rule applied to the second
  pill rather than a new idea. `data-status-pill` reports the RESOLVED tone, so a test can see
  the fallback happen.

  Props:
   - tone: 'subtle' | 'success' | 'accent' | 'danger' | 'warning' | 'info'; anything else
     resolves to 'subtle'.
   - emphasis: '' (the shipped pill), 'outlined' or 'bare' — see below; anything else resolves
     to ''.
   - icon: a Font Awesome class string (e.g. 'fas fa-lock'); omitted renders none.
   - label: the already-localized pill text.
   - title: optional hover text.

  ── THE OUTLINED EMPHASIS IS AN ATTRIBUTION PILL (issue 1371) ─────────────────────────

  `tone` says what STATE a thing is in. `emphasis` says how loudly the pill speaks, and it
  has exactly one value because the design draws exactly one quieter treatment: the
  attribution pill — `Linked Foundry item` on the world Component entry (`proto:834`), the
  badge that says a value came from somewhere else rather than that it is good or bad. The
  reference draws it as a hairline-edged MICRO pill: `padding: 2px 8px`, `font: 600 9px`,
  a `--fab-border` edge and the SECONDARY ink over `--fab-surface-raised`, with an 8px glyph.

  IT IS A PROP RATHER THAN A RE-TONE OR A HOST RULE, for two measured reasons:

  1. `subtle` is the only tone whose fill already matches — and it is also the Off pill on
     three other screens, so re-toning it in place would move surfaces this change has
     nothing to do with. The maintainer's standing rule for this repository is that a shared
     primitive which must behave differently at a second site takes per-site CONFIGURATION,
     never a fork and never an in-place restyle.
  2. `styles/fabricate.css` cannot state it at ANY specificity. `module.json` gives that
     sheet no explicit layer, so Foundry imports it at `layer(modules)`, while this
     component's `css: 'injected'` block lands in `document.head` UNLAYERED — and an
     unlayered author declaration beats every layered one however many classes the layered
     selector is written with. Measured, not reasoned: a parity lane wrote the rule at five
     compound selectors and the pill did not move; marking the same declaration `!important`
     (which reverses layer order) did move it. `!important` was refused, because it wins the
     same argument for every other caller of this pill. The `Chip` and `SegmentedControl`
     docblocks record the identical finding.

  THE EMPHASIS SUPERSEDES THE TONE'S EDGE AND INK, and keeps its FILL. That is deliberate:
  the attribution pill is one neutral face whatever state the thing beside it is in, and the
  three declarations are written after every tone rule so they win at equal specificity —
  the same construction, and the same rationale, as `Chip`'s `struck` variant. `subtle` is
  the tone it is drawn with; another tone composes, and keeps its own fill.

  ── THE BARE EMPHASIS IS THE SAME BADGE INSIDE A DENSE ROW (issue 1371) ────────────────

  `emphasis` names a FACE, and the two faces this pill draws differ in exactly one visible
  thing: their edge. `outlined` GAINS a hairline, because the entry page draws the
  attribution badge on a card with room around it. `bare` has NO edge at all, because the
  world Component catalogue draws the SAME KIND of badge — the source attribution beside a
  row's name (`proto:601`) — inside a list row eleven pixels tall in the gaps, where a
  hairline on every row reads as a grid.

  The reference states it as `gap:4px; padding:1px 7px; border-radius:999px; background:
  var(--surface-raised); font:600 9px var(--sans); color:var(--subtle)`, with a 7px glyph and
  no `border` property at all — so its computed edge is `0px none currentColor` where the
  shipped pill's is `1px solid transparent`. Those three computed values are three of the six
  parity lines this variant closes; the band and the type size are the other three.

  IT SUPERSEDES NEITHER THE FILL NOR THE INK, which is what separates it from `outlined`. The
  reference's row badge is `--surface-raised` under `--subtle`, and that IS the `subtle`
  tone this pill already declares, reached rather than restated: `border: 0` resets the edge
  COLOUR to `currentColor` in the same declaration, so the tone's own ink answers for it.
  The catalogue's unlinked row draws the same badge in `warning`, and it keeps every colour
  that tone states.

  ONE AXIS, TWO ALTERNATIVES: `outlined` and `bare` are not composable and no caller passes
  both, because `emphasis` resolves to a single value. A pill needing an edge asks for
  `outlined`; a pill needing none asks for `bare`.

  THE BAND IS THE DENSE UNIT PLUS THE HAIRLINE IT NO LONGER SPENDS. `--fab-space-chip` is
  6px and the edge this face drops was 1px, so `calc(var(--fab-space-chip) + 1px)` is the
  reference's 7px stated as a derivation rather than as a literal off the 4px scale — the
  band the pill keeps is unchanged, the pixel simply moves from the border box into the
  padding box.
-->
<script>
  let { tone = 'subtle', emphasis = '', icon = '', label = '', title = '' } = $props();

  /** The whole ramp, closed. @type {ReadonlySet<string>} */
  const TONES = new Set(['subtle', 'success', 'accent', 'danger', 'warning', 'info']);

  /**
   * The whole emphasis vocabulary, closed for the same reason `TONES` is: an unrecognised
   * value falls back to the shipped pill rather than emitting an `is-<anything>` class the
   * style block does not paint. `data-status-pill-emphasis` reports the RESOLVED value and
   * is OMITTED when there is none, so a default pill's DOM is byte-identical to what shipped.
   *
   * Two values, one axis: `outlined` gains a hairline edge, `bare` has none. They are
   * ALTERNATIVES and never compose — see the docblock above for the two references.
   *
   * @type {ReadonlySet<string>}
   */
  const EMPHASES = new Set(['outlined', 'bare']);

  const resolvedTone = $derived(TONES.has(tone) ? tone : 'subtle');
  const resolvedEmphasis = $derived(EMPHASES.has(emphasis) ? emphasis : '');
</script>

<span
  class={`fab-status-pill is-${resolvedTone}${resolvedEmphasis ? ` is-${resolvedEmphasis}` : ''}`}
  data-status-pill={resolvedTone}
  data-status-pill-emphasis={resolvedEmphasis || undefined}
  title={title || undefined}
>
  {#if icon}<i class={icon} aria-hidden="true"></i>{/if}
  <span class="fab-status-pill-label">{label}</span>
</span>

<style>
  .fab-status-pill {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-chip);
    padding: 1px var(--fab-space-1);
    border: 1px solid transparent;
    border-radius: 999px;
    font-size: 0.62rem;
    font-weight: 600;
    line-height: 1.5;
    white-space: nowrap;
  }

  .fab-status-pill i {
    font-size: 0.58rem;
  }

  .fab-status-pill.is-subtle {
    color: var(--fab-text-subtle);
    background: var(--fab-surface-raised);
  }

  .fab-status-pill.is-success {
    color: var(--fab-success-text);
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
  }

  /* The 6px status dot the inspector's On/Off pill leads with. */
  .fab-status-pill i.fa-circle {
    font-size: 0.36rem;
  }

  .fab-status-pill.is-accent {
    color: var(--fab-accent);
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
  }

  .fab-status-pill.is-danger {
    color: var(--fab-danger-text);
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
  }

  .fab-status-pill.is-warning {
    color: var(--fab-warning-text);
    border-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }

  .fab-status-pill.is-info {
    color: var(--fab-info-text);
    border-color: var(--fab-info-border);
    background: var(--fab-info-soft);
  }

  /* THE OUTLINED EMPHASIS (issue 1371). `proto:834` exactly: a 2x8 band, a `--fab-border`
     hairline, `600 9px` in the SECONDARY ink. `--fab-text-secondary` IS the reference's
     `--text2` — the two resolve to the same value in this theme, measured rather than matched by
     eye — so this is a token statement rather than an approximation, and the band lands on
     `--fab-space-2xs` and `--fab-space-2`, which are 2px and 8px exactly. No literal is spent
     here either, so the spacing ratchet is untouched.

     WRITTEN AFTER EVERY TONE RULE so its edge and ink win at equal specificity — both this and
     a tone rule are (0,2,0) — while the tone keeps the FILL it declares. That ordering is
     load-bearing rather than tidy: moved above `is-subtle` this block would paint nothing at
     all, and the pill would look like a tone that had simply been given the wrong colour. */
  .fab-status-pill.is-outlined {
    padding: var(--fab-space-2xs) var(--fab-space-2);
    border-color: var(--fab-border);
    color: var(--fab-text-secondary);
    font-size: 9px;
  }

  /* `:not(.fa-circle)` is load-bearing. The 6px status DOT above is `.fab-status-pill i.fa-circle`
     at (0,2,1) and is written EARLIER, so an unqualified `.fab-status-pill.is-outlined i` would
     tie it on specificity, win on order, and inflate the inspector's On/Off dot to a glyph the
     moment anyone composed the two. */
  .fab-status-pill.is-outlined i:not(.fa-circle) {
    font-size: 8px;
  }

  /* THE BARE EMPHASIS (issue 1371). `proto:601` exactly: `gap:4px; padding:1px 7px; font:600
     9px`, and NO `border` property, so the reference's computed edge is `0px none currentColor`
     against this pill's `1px solid transparent`.

     `border: 0` RATHER THAN `border-width: 0`, and the difference is the third of those three
     computed values. The shorthand resets `border-color` to its initial `currentColor`, so the
     edge takes the tone's own ink exactly as the reference's does; `border-width: 0` alone would
     leave the base rule's `transparent` sitting on a zero-width edge, which measures as a
     different computed colour for no reason a reader could see.

     THE FILL AND THE INK ARE THE TONE'S, untouched — which is the whole difference between this
     face and `is-outlined` above. `subtle` already declares the reference's `--surface-raised`
     under `--fab-text-subtle`, so this face is that tone REACHED rather than restated, and the
     catalogue's unlinked row keeps every colour `warning` states.

     WRITTEN AFTER EVERY TONE RULE, for `is-outlined`'s reason: at (0,2,0) this ties each tone
     rule, so `border: 0` wins on source order. It stands after `is-outlined` too, which is
     immaterial to the cascade — `emphasis` resolves to one value, so the two classes are never
     emitted together — and keeps the two faces in the order the docblock introduces them. */
  .fab-status-pill.is-bare {
    gap: var(--fab-space-1);
    padding: 1px calc(var(--fab-space-chip) + 1px);
    border: 0;
    font-size: 9px;
  }

  /* `:not(.fa-circle)` for the reason the outlined glyph rule states in full: the 6px status DOT
     is written earlier at the same (0,3,1), so an unqualified selector would tie it, win on
     order, and inflate the On/Off dot the moment anyone composed the two. */
  .fab-status-pill.is-bare i:not(.fa-circle) {
    font-size: 7px;
  }
</style>
