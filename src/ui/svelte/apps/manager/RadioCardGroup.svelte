<!-- Svelte 5 runes mode -->
<!--
  ── A RECORDED DEVIATION FROM THE PROTOTYPE, AND THE RULING THAT SETTLED IT ─────────────
  The GM Component Catalogue prototype draws its own radio card at `padding: 12px 13px;
  gap: 11px; border-radius: 11px`, with a 28px leading glyph tile and `600 11.5px` labels
  (`proto:2120` for the Tool breakage-mode trio and `proto:4596` for the shared `radioCard`
  helper every one of its groups is built from). This primitive does not match those numbers
  and is NOT going to be changed to.

  MAINTAINER RULING (issue 1373, round 2, plan ruling 4): control heights, radii and spacing
  stay on Fabricate's shipped scale; TYPE and COLOUR come from the prototype. So a per-4px
  difference in a card's padding or a 1px difference in its radius is a deliberate hold, not
  drift — and the primitive is not to be route-scoped to give one caller the prototype's
  geometry either, because a shipped primitive that varies by caller is the union of its
  callers.

  This note exists because the deviation is otherwise invisible: measured against the design's
  markup it looks exactly like a defect, has been reported as one, and would be rediscovered
  on every audit that reads the prototype rather than this file.

  ── `option.meta`: A SECOND DATUM ON THE NAME LINE (issue 1373, maintainer round 3) ─────
  The Tool Requirements bonus list draws one row per WORLD MODIFIER, and the design puts that
  entry's roll expression on the label's own line rather than beneath it: `proto:2363` writes
  the label at `600 11.5px var(--sans)` and, in the same flex row at `gap: 8px`, the expression
  at `600 10px var(--mono)` in `--subtle`. `option.description` is the wrong slot for it — that
  is the sentence line under the name, in the body face — so the primitive gains an OPTIONAL
  inline datum instead of a second component owning half of an option row.

  It is DEFAULT ABSENT, so all nine shipped callers render byte for byte as before, and it is
  typed here rather than in the sheet: `styles/fabricate.css` is imported at `layer(modules)`
  while a Svelte scoped block is injected unlayered, so a property this component declares in
  its own block cannot be overridden from that sheet at all. The rest of the row's appearance
  stays in the sheet, where it already lives, because none of it moves.
-->
<script>
  import Field from '../../components/Field.svelte';
  import { localize } from '../../util/foundryBridge.js';

  let {
    cardId = undefined,
    legend = '',
    legendKey = '',
    // Whether the fieldset's own `<legend>` is VISIBLE. The `is-config-cards` face hides every
    // legend, which is right for a group that already sits under a kicker naming it and wrong
    // for one that does not: the Tool Requirements gate-mode pair was the only group on its
    // screen with no visible heading at all (issue 1373). Opt-in and DEFAULT OFF, so every
    // shipped group renders unchanged, and it un-hides the group's own accessible name rather
    // than adding a second heading a screen reader would announce twice.
    legendVisible = false,
    hint = '',
    hintKey = '',
    options = [],
    selectedValue = '',
    groupName = '',
    columns = 2,
    disabled = false,
    dataGroup = '',
    dataAttr = '',
    optionDataAttr = '',
    configCards = true,
    onChange = () => {},
  } = $props();

  function text(key, fallback) {
    if (!key) return fallback;
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function choose(option, event) {
    if (disabled || option.disabled) return;
    onChange(event.currentTarget.value);
  }
</script>

<Field
  as="fieldset"
  id={cardId}
  class={`is-wide manager-resolution-mode-card manager-radio-card-group${configCards ? ' is-config-cards' : ''}${legendVisible ? ' is-legend-visible' : ''}`}
  {disabled}
  data-radio-card-group={dataGroup || undefined}
  {...{ [dataAttr]: dataAttr ? true : undefined }}
>
  <legend class="manager-resolution-mode-legend">{text(legendKey, legend)}</legend>
  {#if hintKey || hint}
    <p class="manager-resolution-mode-note" role="note">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
      <span>{text(hintKey, hint)}</span>
    </p>
  {/if}
  <div class="manager-resolution-mode-options" style={`--manager-radio-card-columns: ${columns}`}>
    {#each options as option (option.value)}
      <label
        class="manager-resolution-option"
        class:is-active={option.value === selectedValue}
        class:is-disabled={disabled || option.disabled}
        data-radio-card-option={option.value}
        {...{ [optionDataAttr]: optionDataAttr ? option.value : undefined }}
      >
        <input
          type="radio"
          name={groupName}
          value={option.value}
          checked={option.value === selectedValue}
          disabled={disabled || option.disabled}
          onchange={(event) => choose(option, event)}
        />
        {#if configCards && option.icon}
          <span class="manager-resolution-option-icon" data-tool-choice-icon aria-hidden="true"
            ><i class={option.icon}></i></span
          >
        {/if}
        <span class="manager-resolution-option-body">
          <span class="manager-resolution-option-name" data-tool-choice-title>
            {text(option.labelKey, option.label || option.fallback)}
            {#if option.meta}<code class="manager-resolution-option-meta" data-radio-card-meta
                >{option.meta}</code
              >{/if}
            {#if option.disabled && (option.badgeKey || option.badgeFallback)}
              <span class="manager-resolution-option-badge"
                >{text(option.badgeKey, option.badgeFallback)}</span
              >
            {/if}
          </span>
          {#if option.description || option.descFallback}
            <span class="manager-resolution-option-desc" data-tool-choice-description
              >{text(option.descKey, option.description || option.descFallback)}</span
            >
          {/if}
        </span>
      </label>
    {/each}
  </div>
</Field>

<style>
  /* THE INLINE SECOND DATUM (issue 1373, maintainer round 3). `proto:2363` draws it beside the
     label at `600 10px var(--mono)` in `--subtle`, `gap: 8px` — so the FACE, the weight and the
     colour are the design's exactly and only the size is ours, because the label it sits beside
     is the primitive's shipped `0.82rem` rather than the design's 11.5px and a 10px sibling
     would read smaller against it than the design draws. `0.72rem` is the size the Checks
     Studio's read-only row already types the SAME datum at
     (`.manager-modifier-readonly-expression`, 11.5px), so one datum has one type across the two
     screens that render it. `--fab-space-2` is the design's 8px gap, on the token.

     `background: none` because Foundry's core sheet fills a bare `<code>`. */
  .manager-resolution-option-meta {
    margin-left: var(--fab-space-2);
    background: none;
    color: var(--fab-text-subtle);
    font-family: var(--fab-font-mono);
    font-size: 0.72rem;
    font-weight: 600;
  }
</style>
