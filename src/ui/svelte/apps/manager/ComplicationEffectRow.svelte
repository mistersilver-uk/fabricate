<!-- Svelte 5 runes mode -->
<!--
  ONE authoring row for a complication's conditions and effects (issue 1286): control ·
  glyph · title · detail, with a `children` slot for the input strip that is REVEALED once
  the row is on.

  ## Why this exists rather than a reuse

  The complications section renders this shape SIX times in one card — the four `when`
  clauses, the condition roll and the effect roll — differing only in the control type and
  whether the revealed strip has anything in it. Six hand-written copies is where that
  section's duplication actually is, and SonarCloud reads `.svelte` and fails new code above
  3%.

  Two shipped components are close and neither can carry it:

  - `ChecklistCardRow` is a DELIBERATE non-reuse. Its icon colour is hard-pinned to
    `--fab-mv2-accent` in the global sheet while each condition here has its own glyph
    colour; its detail line is MONO at 0.68rem while these details are proportional prose
    sentences; its root hardcodes `data-tool-prerequisite-row`; and it has no children slot
    for the revealed inputs at all.
  - `ToggleCard` has no `children` either, and "Tell the player" — the other switch in this
    section — is not a card but a 34px inline pill sharing a row with Name and Severity, so
    converting that would have re-skinned the row rather than the control.

  ## What it does NOT own

  String props are PRE-LOCALIZED by the caller, on the `ToggleCard` precedent: the caller
  owns the i18n keys and their fallbacks, which keeps this a presentational leaf with no
  `localize` import and no second copy of the `text(key, fallback)` idiom.

  Props:
   - control: `checkbox` (a `when` clause — the whole head is the label, so clicking the
     title toggles it), `switch` (an effect — the head is inert and the toggle is the
     control, matching every other switch in the manager), or `none` (a row whose ON-ness is
     not a flag at all: the macro row is enabled by whether a macro is LINKED, and a switch
     beside a drop zone that already says so would be a second control for one fact).
     `none` therefore has NO on-state: it never takes the enabled edge, and its `children`
     are always revealed, because a row with no flag cannot be off.
   - on: whether the row is enabled. The revealed `children` strip renders ONLY when it is,
     which is the prototype's rule and is also what keeps a disabled effect's inputs out of
     the tab order. Ignored when `control` is `none`, per above.
   - form: the row's GEOMETRY — `condition` (the default), `effect` or `pill`. See the
     note below.
   - onTone: what the ON state means — `neutral` (the default: chosen among peers) or
     `accent` (a deliberate, singular choice). See the note below.
   - tone: the glyph's colour family — `danger`, `warning`, `success`, `accent`, `info` or
     `subtle` (the default). Colour only; it never changes the row.
   - label: the control's accessible name, falling back to `title`.

  ## THREE GEOMETRIES, ONE PRIMITIVE (`form`)

  The prototype draws its condition rows and its effect rows to two different specs: a
  condition is `padding: 9px 11px`, radius 8, `align-items: flex-start`, and TRANSPARENT
  until it is checked; an effect is `padding: 11px 12px`, radius 9, `align-items: center`,
  and sits on `--bg1` whether it is on or not. They are not a rounding difference — an
  effect row is a standing affordance inside the "Then" card, while a condition is one
  item in a checklist, and the always-on fill is what says so. The right-hand switch also
  centres against a two-line copy block rather than hanging at its top.

  `pill` is the third: "Tell the player" is not a row at all in the prototype but a fixed
  34px inline control sharing a line with Name and Severity, sized to its own content
  (`width: max-content`) rather than filling the field it sits in. It is the reason `form`
  is a PROP rather than something derived from `control` — it is a `switch`, like the
  effect rows, and deriving would have drawn it as one. It also centres: a switch row with
  no `detail` is one line of copy against a 20px knob, so `flex-start` left the label
  riding high of the knob and the whole control hanging proud of the fields beside it.

  ## `onTone` — WHAT AN ON STATE MEANS

  `neutral` is "checked, like its peers": the strong edge and the raised fill, which is
  what a list of conditions wants — five rows in the same treatment, and the chosen ones
  legible as a set. `accent` is a SINGULAR choice the row exists to make, and the
  prototype paints exactly one row that way: "Tell the player" is `accent-border` on
  `accent-soft`. Under the neutral treatment it was indistinguishable from a ticked
  condition, so "the player will be told" stopped reading as a decision the GM made.
-->
<script>
  import SelectionCheckbox from '../../components/SelectionCheckbox.svelte';

  let {
    control = 'checkbox',
    on = false,
    form = 'condition',
    onTone = 'neutral',
    icon = '',
    tone = 'subtle',
    title = '',
    detail = '',
    label = '',
    disabled = false,
    dataAttr = '',
    dataValue = '',
    onToggle = () => {},
    children = undefined,
  } = $props();

  // Declared tones only, so a typo renders the default glyph rather than an unstyled class.
  const TONES = new Set(['danger', 'warning', 'success', 'accent', 'info', 'subtle']);
  const toneClass = $derived(TONES.has(tone) ? `is-tone-${tone}` : 'is-tone-subtle');
  const hookAttributes = $derived(dataAttr ? { [dataAttr]: dataValue || true } : {});
  const accessibleName = $derived(label || title);
  // A `none` row has no flag, so `on` is not its state — see the props note. Kept as two
  // derivations rather than one because they answer different questions: whether the row
  // is PAINTED as enabled, and whether its children are reachable.
  const enabled = $derived(control !== 'none' && on === true);
  const revealed = $derived(control === 'none' || on === true);
  // Declared geometries only, on the same rule as `tone`: an unknown `form` falls back to
  // the condition shape rather than rendering an unstyled row.
  const FORMS = new Set(['condition', 'effect', 'pill']);
  const formClass = $derived(FORMS.has(form) ? `is-form-${form}` : 'is-form-condition');
  const onToneClass = $derived(onTone === 'accent' ? 'is-on-accent' : 'is-on-neutral');
</script>

<!-- The head's CONTENT is written once and rendered into whichever wrapper the control
     needs. A `<label>` is right for the checkbox (the whole head becomes its click target)
     and wrong for the switch (a `<button>` inside a label is an ambiguous click target),
     but restating the three children per branch would be the intra-file duplication this
     component exists to remove. -->
{#snippet headContent()}
  {#if control === 'checkbox'}
    <!-- `wrapper="contents"` because THIS row's head is already the `<label>`; nesting a
         second one is invalid HTML and an ambiguous click target. -->
    <SelectionCheckbox
      wrapper="contents"
      size="sm"
      checked={on}
      {disabled}
      ariaLabel={accessibleName}
      onChange={(next) => onToggle(next)}
    />
  {/if}
  {#if icon}<i class="fab-complication-effect-glyph {icon} {toneClass}" aria-hidden="true"></i>{/if}
  <span class="fab-complication-effect-copy">
    <span class="fab-complication-effect-title">{title}</span>
    {#if detail}<span class="fab-complication-effect-detail">{detail}</span>{/if}
  </span>
  {#if control === 'switch'}
    <!-- `aria-pressed` on a plain button is the house switch pattern; the repo uses no
         `role="switch"` anywhere and `ToggleCard` records that rule explicitly. -->
    <button
      type="button"
      class={`manager-status-toggle ${on ? 'is-on' : 'is-off'}`}
      aria-pressed={on}
      aria-label={accessibleName}
      {disabled}
      onclick={() => onToggle(!on)}
    >
      <span class="manager-status-toggle-track" aria-hidden="true"
        ><span class="manager-status-toggle-knob"></span></span
      >
    </button>
  {/if}
{/snippet}

<div
  class="fab-complication-effect {formClass} {onToneClass}"
  class:is-on={enabled}
  class:is-disabled={disabled}
  {...hookAttributes}
>
  {#if control === 'checkbox'}
    <label class="fab-complication-effect-head">{@render headContent()}</label>
  {:else}
    <div class="fab-complication-effect-head">{@render headContent()}</div>
  {/if}
  {#if revealed && children}
    <div class="fab-complication-effect-reveal">{@render children()}</div>
  {/if}
</div>

<style>
  /* Theme-ROOT tokens only: this row is rendered inside the manager today, but it carries
     no `--fab-mv2-*` alias so it stays legible if a player-side surface ever adopts it.
     `Chip.svelte` states the rule and the reason in full. */
  .fab-complication-effect {
    box-sizing: border-box;
    border: 1px solid var(--fab-border);
  }

  /* A CONDITION: one item in a checklist. Transparent until it is checked, so the chosen
     ones read as a set against the card behind them. */
  .fab-complication-effect.is-form-condition {
    padding: 9px 11px;
    border-radius: 8px;
    background: none;
  }

  /* An EFFECT: a standing affordance in the "Then" card, which is why it keeps its raised
     fill whether it is on or off. Roomier and slightly rounder than a condition, and its
     head centres — see the geometry note in the header.

     The fill is the ramp step at this row's INDEX in the prototype rather than the token
     that matches its value; `ComponentComplicationsSection`'s `.fab-complication-card` note
     records why, and why a by-value re-map flattens the section instead of deepening it. */
  .fab-complication-effect.is-form-effect {
    padding: 11px 12px;
    border-radius: 9px;
    background: var(--fab-bg-1);
  }

  /* A PILL: a fixed-height inline control on a field row, not a row of its own. It is
     sized to its content rather than to the field, so it sits beside Name and Severity
     the way the prototype draws it instead of stretching across the remainder. The
     explicit `height` (rather than padding alone) is what keeps it flush with the 34px
     inputs it shares that line with. */
  .fab-complication-effect.is-form-pill {
    display: flex;
    align-items: center;
    width: max-content;
    height: 34px;
    padding: 0 12px;
    border-radius: 9px;
    background: var(--fab-bg-1);
  }

  /* An enabled row takes the stronger edge, so the set of chosen conditions reads at a
     glance without reading each control; a condition also lifts onto the raised surface,
     which an effect row is already sitting on. */
  .fab-complication-effect.is-on.is-on-neutral {
    border-color: var(--fab-border-strong);
  }

  .fab-complication-effect.is-form-condition.is-on {
    background: var(--fab-bg-1);
  }

  /* The ACCENT on-state — see the `onTone` note in the header. */
  .fab-complication-effect.is-on.is-on-accent {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
  }

  .fab-complication-effect-head {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    margin: 0;
  }

  /* Both roomier forms centre their head; only the EFFECT widens its gap. The pill's head
     gap is the base 10px in the prototype (the fixture records `columnGap: 10px` on
     `cs-visibility-row`) against the effect's 11px, and a pill is a fixed-height inline
     control where an extra pixel between the glyph and its label is a pixel off the
     control's own width. So `align-items` stays shared and `gap` does not. */
  .fab-complication-effect.is-form-effect .fab-complication-effect-head,
  .fab-complication-effect.is-form-pill .fab-complication-effect-head {
    align-items: center;
  }

  .fab-complication-effect.is-form-effect .fab-complication-effect-head {
    gap: 11px;
  }

  /* Only the checkbox form makes the whole head a click target; the switch form's head is
     inert and its button is the control. */
  label.fab-complication-effect-head {
    cursor: pointer;
  }

  .fab-complication-effect.is-disabled label.fab-complication-effect-head {
    cursor: default;
  }

  .fab-complication-effect-glyph {
    flex: 0 0 auto;
    width: 14px;
    margin-top: 1px;
    text-align: center;
    font-size: 11px;
  }

  .fab-complication-effect-glyph.is-tone-danger {
    color: var(--fab-danger);
  }

  .fab-complication-effect-glyph.is-tone-warning {
    color: var(--fab-warning);
  }

  .fab-complication-effect-glyph.is-tone-success {
    color: var(--fab-success);
  }

  .fab-complication-effect-glyph.is-tone-accent {
    color: var(--fab-accent);
  }

  .fab-complication-effect-glyph.is-tone-info {
    color: var(--fab-info);
  }

  .fab-complication-effect-glyph.is-tone-subtle {
    color: var(--fab-text-subtle);
  }

  .fab-complication-effect-copy {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .fab-complication-effect-title {
    color: var(--fab-text);
    font-size: 11.5px;
    font-weight: 600;
    line-height: 1.25;
  }

  /* Proportional prose, NOT the mono detail line `ChecklistCardRow` pins — these details
     are sentences ("Rolled against the character at the moment the result is decided"),
     and a mono face at 0.68rem makes a sentence read as a value. */
  .fab-complication-effect-detail {
    color: var(--fab-text-subtle);
    font-size: 9.5px;
    line-height: 1.45;
    overflow-wrap: break-word;
  }

  /* The revealed strip is indented under the control column so it reads as belonging to the
     row above it rather than as a sibling row of its own. */
  .fab-complication-effect-reveal {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    align-items: center;
    margin: 10px 0 0 24px;
  }

  /* …but ONLY where that column exists. The indent aligns the strip with the head's copy,
     past a leading checkbox — and an effect row has no checkbox: its control is the switch
     on the FAR side. So the 24px indented the strip under nothing, and the prototype draws
     the effect-roll reveal and the macro drop zone flush with the row's own padding. */
  .fab-complication-effect.is-form-effect .fab-complication-effect-reveal {
    margin-left: 0;
  }
</style>
