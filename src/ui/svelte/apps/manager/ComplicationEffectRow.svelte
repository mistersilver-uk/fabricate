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
   - on: whether the row is enabled. The revealed `children` strip renders ONLY when it is,
     which is the prototype's rule and is also what keeps a disabled effect's inputs out of
     the tab order.
   - tone: the glyph's colour family — `danger`, `warning`, `success`, `accent`, `info` or
     `subtle` (the default). Colour only; it never changes the row.
   - label: the control's accessible name, falling back to `title`.
-->
<script>
  import SelectionCheckbox from '../../components/SelectionCheckbox.svelte';

  let {
    control = 'checkbox',
    on = false,
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
  class="fab-complication-effect"
  class:is-on={on}
  class:is-disabled={disabled}
  {...hookAttributes}
>
  {#if control === 'checkbox'}
    <label class="fab-complication-effect-head">{@render headContent()}</label>
  {:else}
    <div class="fab-complication-effect-head">{@render headContent()}</div>
  {/if}
  {#if on && children}
    <div class="fab-complication-effect-reveal">{@render children()}</div>
  {/if}
</div>

<style>
  /* Theme-ROOT tokens only: this row is rendered inside the manager today, but it carries
     no `--fab-mv2-*` alias so it stays legible if a player-side surface ever adopts it.
     `Chip.svelte` states the rule and the reason in full. */
  .fab-complication-effect {
    box-sizing: border-box;
    padding: 9px 11px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: none;
  }

  /* An enabled row lifts onto the raised surface and takes the stronger edge, so the set of
     chosen conditions reads at a glance without reading each control. */
  .fab-complication-effect.is-on {
    border-color: var(--fab-border-strong);
    background: var(--fab-bg-1);
  }

  .fab-complication-effect-head {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    margin: 0;
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
</style>
