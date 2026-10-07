<!--
  A fieldset of radio CARDS for one choice among a few options: one card per option, with an
  optional inline second datum, a sentence line beneath the name, and an optional `optionBody`.

  Rest spread:
  - `{...rest}` lands on the `<Field>` fieldset root, written after `class`, and carries the
    group's hooks, `data-radio-card-group` among them; `class` is appended to the root's own.

  Invariants:
  - A RECORDED DEVIATION FROM THE PROTOTYPE, WHICH IS NOT GOING TO BE CORRECTED. MAINTAINER RULING:
    control heights, radii and spacing stay on Fabricate's shipped scale, while TYPE and COLOUR come
    from the prototype — so a per-4px difference in a card's padding or a 1px difference in its
    radius is a deliberate HOLD, not drift, and the primitive is not to be route-scoped to give one
    caller the prototype's geometry either. Written down because the deviation looks exactly like a
    defect and would be rediscovered on every audit that reads the prototype rather than this file.
  - `option.meta` IS AN OPTIONAL INLINE DATUM ON THE NAME LINE, typed in this component's own scoped
    block rather than in the sheet, because a scoped block is injected UNLAYERED and so cannot be
    overridden from `styles/fabricate.css` at all. `option.description` is the wrong slot for the
    same datum — that is the sentence line under the name, in the body face.
  - `option.meta` HAS NO CALLER TODAY AND IS LEFT IN PLACE DELIBERATELY; removing it is owed a
    follow-up that takes the prop, its markup branch and its rule together.
  - THIS FAMILY DECLARES NO FONT FLOOR OF ITS OWN, because the rendered fieldset carries TWO
    namespace roots on one element and `Field`'s own floor at (0,1,1) already reaches every radio in
    every host, and the two families are measurably DISJOINT — the two-roots case
    `openspec/specs/design-system/spec.md` states, asserted in
    `searchable-popover-area-scope.test.js`. Its area-scope entry declares no `classProps`, because
    a `classProps: ['class']` reader would match twelve class attributes against a floor of one; the
    mounted root-emission assertion in `tests/components/field-mounted.test.js` buys that instead.
  - `configCards` IS STATED EXPLICITLY AT EVERY CALL SITE, because the retired shim defaulted it to
    FALSE where this component defaults to TRUE.
-->
<script>
  import Field from './Field.svelte';
  import { localizeOr } from '../util/localizeOr.js';

  let {
    cardId = undefined,
    legend = '',
    legendKey = '',
    legendVisible = false,
    hint = '',
    hintKey = '',
    options = [],
    selectedValue = '',
    groupName = '',
    columns = 2,
    disabled = false,
    optionDataAttr = '',
    configCards = true,
    optionBody = null,
    onChange = () => {},
    class: extraClass = '',
    ...rest
  } = $props();

  const extraClasses = $derived(extraClass ? ` ${extraClass}` : '');

  function choose(option, event) {
    if (disabled || option.disabled) return;
    onChange(event.currentTarget.value);
  }
</script>

<Field
  as="fieldset"
  id={cardId}
  class={`fabricate-option-cards is-wide manager-resolution-mode-card manager-radio-card-group${configCards ? ' is-config-cards' : ''}${legendVisible ? ' is-legend-visible' : ''}${extraClasses}`}
  {disabled}
  {...rest}
>
  <legend class="manager-resolution-mode-legend">{localizeOr(legendKey, legend)}</legend>
  {#if hintKey || hint}
    <p class="manager-resolution-mode-note" role="note">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
      <span>{localizeOr(hintKey, hint)}</span>
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
            {localizeOr(option.labelKey, option.label || option.fallback)}
            {#if option.meta}<code class="manager-resolution-option-meta" data-radio-card-meta
                >{option.meta}</code
              >{/if}
            {#if option.disabled && (option.badgeKey || option.badgeFallback)}
              <span class="manager-resolution-option-badge"
                >{localizeOr(option.badgeKey, option.badgeFallback)}</span
              >
            {/if}
          </span>
          {#if option.description || option.descFallback}
            <span class="manager-resolution-option-desc" data-tool-choice-description
              >{localizeOr(option.descKey, option.description || option.descFallback)}</span
            >
          {/if}
          {#if optionBody}{@render optionBody(option)}{/if}
        </div>
      </label>
    {/each}
  </div>
</Field>

<style>
  .manager-resolution-option-meta {
    margin-left: var(--fab-space-2);
    background: none;
    color: var(--fab-text-subtle);
    font-family: var(--fab-font-mono);
    font-size: 0.72rem;
    font-weight: 600;
  }
</style>
