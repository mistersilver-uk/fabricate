<!--
  A fieldset of radio cards for one choice among a few options, drawn as the library's
  `<OptionCards>`: one card per option with an optional chip, a title, a description line and an
  optional `optionBody` beneath them.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `layout` | `'row'` \| `'stacked'` | `'row'` | Chip beside the text, or chip over it. The caller states it (`stacked` on three or more tracks); it is never derived from `columns`, and a reflowed card keeps it. |
  | `configCards` | boolean | `true` | Stated at every call site, because the retired shim defaulted it to `false`. |

  Snippets:
  - `optionBody(option)` — read-only content beneath the card's head, at the text column; the
    radio stays the card's only control.

  Rest spread:
  - `{...rest}` lands on the `<Field>` fieldset root, written after `class`, and carries the
    group's hooks, `data-radio-card-group` among them; `class` is appended to the root's own.

  Invariants:
  - The face is the primitive's alone; the one caller rule naming its family is a margin, pinned
    by `searchable-popover-area-scope.test.js` and `option-cards-specimen-geometry.test.js`.
  - The chip is `Medallion` inside a wrapper that owns the disabled dim, because `Medallion`
    takes no rest props and no sheet rule names `.fab-medallion`.
  - `option.meta` is typed in this scoped block, which is unlayered, so the sheet cannot repaint it.
  - It declares no font floor: its root is also `Field`'s fieldset, whose (0,1,1) floor reaches
    every radio (`searchable-popover-area-scope.test.js`).
-->
<script>
  import Field from './Field.svelte';
  import Medallion from './Medallion.svelte';
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
    layout = 'row',
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
  class={`fabricate-option-cards is-wide manager-resolution-mode-card manager-radio-card-group${configCards ? ' is-config-cards' : ''}${legendVisible ? ' is-legend-visible' : ''}${layout === 'stacked' ? ' is-stacked' : ''}${extraClasses}`}
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
      {@const chosen = option.value === selectedValue}
      <label
        class="manager-resolution-option"
        class:is-active={chosen}
        class:is-disabled={disabled || option.disabled}
        data-radio-card-option={option.value}
        {...{ [optionDataAttr]: optionDataAttr ? option.value : undefined }}
      >
        <span class="manager-resolution-option-head">
          {#if configCards && option.icon}
            <span class="manager-resolution-option-icon" data-tool-choice-icon aria-hidden="true"
              ><Medallion
                icon={option.icon}
                size={30}
                glyph={12}
                variant="glyph-chip"
                tone={chosen ? 'accent' : ''}
                ink={chosen ? '' : 'neutral'}
              /></span
            >
          {/if}
          <span class="manager-resolution-option-text">
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
          </span>
          <input
            type="radio"
            name={groupName}
            value={option.value}
            checked={chosen}
            disabled={disabled || option.disabled}
            onchange={(event) => choose(option, event)}
          />
        </span>
        {#if optionBody}
          <div class="manager-resolution-option-body">{@render optionBody(option)}</div>
        {/if}
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
    font-weight: 500;
  }
</style>
