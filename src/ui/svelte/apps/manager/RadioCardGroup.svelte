<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    cardId = undefined,
    legend = '',
    legendKey = '',
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

<fieldset
  id={cardId}
  class="manager-field is-wide manager-resolution-mode-card manager-radio-card-group"
  class:is-config-cards={configCards}
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
</fieldset>
