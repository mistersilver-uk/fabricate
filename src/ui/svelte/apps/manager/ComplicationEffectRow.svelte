<!--
  One authoring row for a complication's conditions and effects (issue 1286): control, glyph, title,
  detail, with a `children` slot for the input strip REVEALED once the row is on. The complications
  section renders this shape six times in one card, and SonarCloud reads `.svelte` and fails new
  code above 3% duplication. String props are PRE-LOCALIZED, on the `ToggleCard` precedent.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `control` | `'checkbox'` \| `'switch'` \| `'none'` | `'checkbox'` | `checkbox` makes the whole head the label; `switch` leaves the head inert; `none` is a row whose ON-ness is not a flag at all, so it never takes the enabled edge and its `children` are always revealed |
  | `on` | boolean | `false` | the revealed `children` render ONLY when true, which keeps a disabled effect's inputs out of the tab order. Ignored under `control="none"` |
  | `form` | `'condition'` \| `'effect'` \| `'pill'` | `'condition'` | the row's GEOMETRY: a condition is one item in a checklist and is transparent until checked; an effect is a standing affordance inside the "Then" card and keeps its fill; `pill` is a fixed-height inline control sized to its own content. A PROP rather than derived from `control`, because `pill` is a `switch` and deriving would draw it as an effect row. |
  | `onTone` / `tone` / `label` | | `'neutral'` / `'subtle'` / `''` | what the ON state MEANS, the glyph's colour family (colour only), and the control's accessible name, falling back to `title` |
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
    // A trailing action for the HEAD, where a `switch` would sit; not enforced as exclusive.
    headAction = undefined,
  } = $props();

  // Declared tones only, so a typo renders the default glyph rather than an unstyled class.
  const TONES = new Set(['danger', 'warning', 'success', 'accent', 'info', 'subtle']);
  const toneClass = $derived(TONES.has(tone) ? `is-tone-${tone}` : 'is-tone-subtle');
  const hookAttributes = $derived(dataAttr ? { [dataAttr]: dataValue || true } : {});
  const accessibleName = $derived(label || title);
  // Two derivations: PAINTED as enabled and children reachable differ for a `none` row.
  const enabled = $derived(control !== 'none' && on === true);
  const revealed = $derived(control === 'none' || on === true);
  // Declared geometries only: an unknown `form` falls back to the condition shape.
  const FORMS = new Set(['condition', 'effect', 'pill']);
  const formClass = $derived(FORMS.has(form) ? `is-form-${form}` : 'is-form-condition');
  const onToneClass = $derived(onTone === 'accent' ? 'is-on-accent' : 'is-on-neutral');
</script>

<!-- The head's CONTENT is written once: a `<label>` is right for a checkbox, wrong for a switch. -->
{#snippet headContent()}
  {#if control === 'checkbox'}
    <!-- `wrapper="contents"`: this head is already the `<label>`, and nesting is invalid HTML. -->
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
  /* Theme-ROOT tokens only, so the row stays legible if a player-side surface adopts it. */
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

  /* An EFFECT keeps its raised fill on or off, and its head centres — see the header.

     The fill is the ramp step at this row's INDEX in the prototype rather than the token that
     matches its value; `ComponentComplicationsSection`'s `.fab-complication-card` note records
     why a by-value re-map flattens the section instead of deepening it. */
  .fab-complication-effect.is-form-effect {
    padding: 11px 12px;
    border-radius: 9px;
    background: var(--fab-bg-1);
  }

  /* A PILL. The explicit `height` keeps it flush with the 34px inputs on its line. */
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

  /* Both roomier forms centre their head; only the EFFECT widens its gap, since on a pill that
     pixel comes off the control's own width. */
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

  /* The head's trailing action. `margin-left: auto` is NOT needed: the copy is `flex: 1 1 auto`. */
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

  /* …but ONLY where that column exists: an effect row's control is the switch on the FAR side, so
     the indent put the strip under nothing. */
  .fab-complication-effect.is-form-effect .fab-complication-effect-reveal {
    margin-left: 0;
  }
</style>
