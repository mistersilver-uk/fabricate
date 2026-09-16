<!-- Svelte 5 runes mode -->
<!--
  One authoring row for a complication's conditions and effects (issue 1286): control, glyph,
  title, detail, with a `children` slot for the input strip that is REVEALED once the row is on.
  The complications section renders this shape six times in one card, and SonarCloud reads
  `.svelte` and fails new code above 3% duplication. String props are PRE-LOCALIZED by the caller,
  on the `ToggleCard` precedent.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `control` | `'checkbox' \| 'switch' \| 'none'` | `'checkbox'` | `checkbox` makes the whole head the label; `switch` leaves the head inert; `none` is a row whose ON-ness is not a flag at all |
  | `on` | boolean | `false` | the revealed `children` render ONLY when it is true, which keeps a disabled effect's inputs out of the tab order. Ignored under `control="none"` |
  | `form` | `'condition' \| 'effect' \| 'pill'` | `'condition'` | the row's GEOMETRY |
  | `onTone` | `'neutral' \| 'accent'` | `'neutral'` | what the ON state MEANS: chosen among peers, or a deliberate singular choice |
  | `tone` | `'danger' \| 'warning' \| 'success' \| 'accent' \| 'info' \| 'subtle'` | `'subtle'` | the glyph's colour family; colour only, it never changes the row |
  | `label` | string | `''` | the control's accessible name, falling back to `title` |

  Invariants:
  - THREE GEOMETRIES, ONE PRIMITIVE. A condition is one item in a checklist and is transparent
    until checked; an effect is a standing affordance inside the "Then" card and keeps its fill
    either way; `pill` is a fixed-height inline control sized to its own content. `form` is a PROP
    rather than derived from `control`, because `pill` is a `switch` and deriving would draw it as
    an effect row.
  - A `none` row never takes the enabled edge and its `children` are always revealed, because a
    row with no flag cannot be off.
-->
<script>
  import SelectionCheckbox from '../../components/SelectionCheckbox.svelte';
  import StatusToggle from '../../components/StatusToggle.svelte';

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
    // A trailing action for the HEAD, rendered where a `switch` control would sit. The macro
    // card's browse control uses it: that button acts on the whole card. Mutually exclusive with
    // `control="switch"` in practice but not enforced, because a future row may legitimately want
    // a switch and a link.
    headAction = undefined,
  } = $props();

  // Declared tones only, so a typo renders the default glyph rather than an unstyled class.
  const TONES = new Set(['danger', 'warning', 'success', 'accent', 'info', 'subtle']);
  const toneClass = $derived(TONES.has(tone) ? `is-tone-${tone}` : 'is-tone-subtle');
  const hookAttributes = $derived(dataAttr ? { [dataAttr]: dataValue || true } : {});
  const accessibleName = $derived(label || title);
  // A `none` row has no flag, so `on` is not its state. Kept as two derivations rather than one
  // because they answer different questions: whether the row is PAINTED as enabled, and whether
  // its children are reachable.
  const enabled = $derived(control !== 'none' && on === true);
  const revealed = $derived(control === 'none' || on === true);
  // Declared geometries only, on the same rule as `tone`: an unknown `form` falls back to
  // the condition shape rather than rendering an unstyled row.
  const FORMS = new Set(['condition', 'effect', 'pill']);
  const formClass = $derived(FORMS.has(form) ? `is-form-${form}` : 'is-form-condition');
  const onToneClass = $derived(onTone === 'accent' ? 'is-on-accent' : 'is-on-neutral');
</script>

<!-- The head's CONTENT is written once and rendered into whichever wrapper the control needs. A
     `<label>` is right for the checkbox and wrong for the switch (a `<button>` inside a label is an
     ambiguous click target), but restating the three children per branch would be the intra-file
     duplication this component exists to remove. -->
{#snippet headContent()}
  {#if control === 'checkbox'}
    <!-- `wrapper="contents"` because THIS row's head is already the `<label>`; nesting a second
         one is invalid HTML and an ambiguous click target. -->
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
         `role="switch"` anywhere and `StatusToggle` records that rule explicitly. -->
    <StatusToggle {on} ariaLabel={accessibleName} {disabled} onclick={() => onToggle(!on)} />
  {/if}
  {#if headAction}<span class="fab-complication-effect-head-action">{@render headAction()}</span
    >{/if}
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
  /* Theme-ROOT tokens only: this row renders inside the manager today but carries no area-scoped
     `--fab-manager-*` property, so it stays legible if a player-side surface ever adopts it.
     `Chip.svelte` states the rule in full. */
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

  /* An EFFECT: a standing affordance in the "Then" card, which is why it keeps its raised fill
     whether it is on or off. Its head centres — see the geometry note in the header.

     The fill is the ramp step at this row's INDEX in the prototype rather than the token that
     matches its value; `ComponentComplicationsSection`'s `.fab-complication-card` note records
     why a by-value re-map flattens the section instead of deepening it. */
  .fab-complication-effect.is-form-effect {
    padding: 11px 12px;
    border-radius: 9px;
    background: var(--fab-bg-1);
  }

  /* A PILL: a fixed-height inline control on a field row, sized to its content rather than to the
     field. The explicit `height`, rather than padding alone, is what keeps it flush with the 34px
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

  /* An enabled row takes the stronger edge, so the set of chosen conditions reads at a glance; a
     condition also lifts onto the raised surface, which an effect row already sits on. */
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

  /* Both roomier forms centre their head; only the EFFECT widens its gap. A pill is a
     fixed-height inline control where an extra pixel between the glyph and its label is a pixel
     off the control's own width, so `align-items` stays shared and `gap` does not. */
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

  /* The head's trailing action. `flex: 0 0 auto` so the copy column keeps the slack;
     `margin-left: auto` is NOT needed, because the copy above is `flex: 1 1 auto` and already
     pushes this to the edge. */
  .fab-complication-effect-head-action {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
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

  /* Proportional prose, NOT the mono expression cell the shared modifier row pins — these details
     are sentences, and a mono face at 0.68rem makes a sentence read as a value. */
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

  /* …but ONLY where that column exists. The indent aligns the strip with the head's copy past a
     leading checkbox, and an effect row has no checkbox: its control is the switch on the FAR
     side, so the indent put the strip under nothing. */
  .fab-complication-effect.is-form-effect .fab-complication-effect-reveal {
    margin-left: 0;
  }
</style>
