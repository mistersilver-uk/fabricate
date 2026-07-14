<!-- Svelte 5 runes mode -->
<!--
  ResolutionModeCard is the shared radio-card used by every system-level
  resolution surface (recipe, salvage, gathering). It renders a <fieldset>/
  <legend>, an optional warning/hint note, and one `manager-resolution-option`
  row per option, each wrapping a real <input type="radio"> plus a name and
  description. The card reuses the global `manager-resolution-*` classes in
  styles/fabricate.css (including the load-bearing Foundry radio ::before/::after
  override and the :focus-visible ring) — it does NOT clone those rules.

  Options may be `disabled` (a modelled-but-unimplemented choice): the radio
  carries the real `disabled` attribute (so it leaves the tab order), the row
  gets an `is-disabled` modifier, and a visible "Coming soon" badge is shown.
  Clicking a disabled option never fires `onChange`.

  Props:
   - legendKey/legendFallback: card title (localized via `text`).
   - hintKey/hintFallback (optional): a note rendered above the options.
   - options[]: { value, labelKey, fallback, descKey, descFallback, disabled?,
     badgeKey?/badgeFallback? }.
   - selectedValue: the value of the checked radio (none checked when it matches
     no option's value — e.g. an honest "unset" state).
   - groupName: the radio `name` (one group per card).
   - dataAttr/optionDataAttr: hook attribute names for the fieldset / each row.
   - onChange(value): called with the selected option value on a real change.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    cardId = undefined,
    legendKey = '',
    legendFallback = '',
    hintKey = '',
    hintFallback = '',
    options = [],
    selectedValue = '',
    groupName = '',
    dataAttr = '',
    optionDataAttr = '',
    // 'config-card' opts into the icon-tile + 2-column card grid layout (with the
    // radio rendered as a dot and the legend visually hidden because the host
    // renders its own section heading). Any other value keeps the default compact
    // single-column rows used by the gathering resolution surface.
    variant = '',
    onChange = () => {}
  } = $props();

  const isConfigCard = $derived(variant === 'config-card');

  function text(key, fallback) {
    const value = localize(key);
    return value && value !== key ? value : fallback;
  }

  function handleChange(option, event) {
    if (option.disabled) return;
    onChange(event.currentTarget.value);
  }
</script>

<fieldset
  id={cardId}
  class={`manager-field is-wide manager-resolution-mode-card ${isConfigCard ? 'is-config-cards' : ''}`}
  {...{ [dataAttr]: true }}
>
  <legend class="manager-resolution-mode-legend">{text(legendKey, legendFallback)}</legend>
  {#if hintKey || hintFallback}
    <p class="manager-resolution-mode-note" role="note">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
      <span>{text(hintKey, hintFallback)}</span>
    </p>
  {/if}
  <div class="manager-resolution-mode-options">
    {#each options as option (option.value)}
      <label
        class={`manager-resolution-option ${option.value === selectedValue ? 'is-active' : ''} ${option.disabled ? 'is-disabled' : ''}`}
        {...{ [optionDataAttr]: option.value }}
      >
        <input
          type="radio"
          name={groupName}
          value={option.value}
          checked={option.value === selectedValue}
          disabled={option.disabled === true}
          onchange={(event) => handleChange(option, event)}
        />
        {#if isConfigCard && option.icon}
          <span class="manager-resolution-option-icon" aria-hidden="true"><i class={option.icon}></i></span>
        {/if}
        <span class="manager-resolution-option-body">
          <span class="manager-resolution-option-name">
            {text(option.labelKey, option.fallback)}
            {#if option.disabled}
              <span class="manager-resolution-option-badge">{text(option.badgeKey, option.badgeFallback)}</span>
            {/if}
          </span>
          <span class="manager-resolution-option-desc">{text(option.descKey, option.descFallback)}</span>
        </span>
      </label>
    {/each}
  </div>
</fieldset>
