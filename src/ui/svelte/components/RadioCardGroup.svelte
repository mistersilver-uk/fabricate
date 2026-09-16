<!--
  A fieldset of radio CARDS for a closed mode set: one card per option, with an optional inline
  second datum and a sentence line beneath the name. Nine callers, all closed mode sets.

  Invariants:
  - A RECORDED DEVIATION FROM THE PROTOTYPE, WHICH IS NOT GOING TO BE CORRECTED. MAINTAINER RULING:
    control heights, radii and spacing stay on Fabricate's shipped scale, while TYPE and COLOUR
    come from the prototype — so a per-4px difference in a card's padding or a 1px difference in
    its radius is a deliberate HOLD, not drift, and the primitive is not to be route-scoped to give
    one caller the prototype's geometry either, because a shipped primitive that varies by caller
    is the union of its callers. Written down because the deviation is otherwise invisible: it
    looks exactly like a defect, has been reported as one, and would be rediscovered on every
    audit that reads the prototype rather than this file.
  - `option.meta` IS AN OPTIONAL INLINE DATUM ON THE NAME LINE, typed in this component's own
    scoped block rather than in the sheet: `styles/fabricate.css` is imported at `layer(modules)`
    while a scoped block is injected UNLAYERED, so a property declared here cannot be overridden
    from that sheet at all. The rest of the row's appearance stays in the sheet, because none of
    it moves. `option.description` is the wrong slot for the same datum — that is the sentence
    line under the name, in the body face.
  - `option.meta` HAS NO CALLER TODAY, AND IS LEFT IN PLACE DELIBERATELY rather than overlooked:
    the one caller it was added for was ruled off this primitive entirely. Deleting a shipped
    primitive's prop is a change to a shared surface with its own reviewers, and it is owed a
    follow-up that removes the prop, its markup branch and its rule together.
  - THIS FAMILY DECLARES NO FONT FLOOR OF ITS OWN, because the rendered fieldset carries TWO
    namespace roots on one element and `Field`'s own floor at (0,1,1) already reaches every radio
    in every host, so a second would restate the same property at the same rank. The two families
    are measurably DISJOINT — no selector names a class of one together with a class of the other
    — which is what keeps each root from reading as an application root to the other's area-scope
    entry. Both facts are asserted in `searchable-popover-area-scope.test.js`.
  - THE AREA-SCOPE ENTRY DELIBERATELY DECLARES NO `classProps`. A `classProps: ['class']` reader
    matches EVERY class attribute in this markup — twelve of them — against a floor of one. What
    that would have bought is bought instead by the mounted root-emission assertion in
    `tests/components/field-mounted.test.js`, which reads the RENDERED `className` off the
    fieldset.
  - `configCards` IS STATED EXPLICITLY AT EVERY CALL SITE, in both directions: the retired shim
    defaulted it to FALSE where this component defaults to TRUE, so a site that merely dropped the
    shim's `variant` would flip face. No alias prop is kept for any of that shim's renamed props.
-->
<script>
  import Field from './Field.svelte';
  import { localize } from '../util/foundryBridge.js';

  let {
    cardId = undefined,
    legend = '',
    legendKey = '',
    // Whether the fieldset's own `<legend>` is VISIBLE. The config-cards face hides every legend,
    // which is right for a group already sitting under a kicker naming it and wrong for one that
    // is not. Opt-in and DEFAULT OFF, and it un-hides the group's own accessible name rather than
    // adding a second heading a screen reader would announce twice.
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
    optionBody = null,
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
  class={`fabricate-option-cards is-wide manager-resolution-mode-card manager-radio-card-group${configCards ? ' is-config-cards' : ''}${legendVisible ? ' is-legend-visible' : ''}`}
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
        <div class="manager-resolution-option-body">
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
          {#if optionBody}{@render optionBody(option)}{/if}
        </div>
      </label>
    {/each}
  </div>
</Field>

<style>
  /* THE INLINE SECOND DATUM. The FACE, the weight and the colour are the design's exactly; only
     the SIZE is ours, because the label it sits beside is the primitive's shipped size rather
     than the design's and a 10px sibling would read smaller against it than the design draws.
     `0.72rem` is what the Checks Studio's read-only row already types the SAME datum at, so one
     datum has one type across the two screens that render it.

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
