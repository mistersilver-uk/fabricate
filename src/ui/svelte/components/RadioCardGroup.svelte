<!--
  A fieldset of radio cards for one choice among a few options, drawn as the library's
  `<OptionCards>`: one card per option with an optional chip, a title, a description line and an
  optional `optionBody` beneath them.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | string | `''` | The chosen option's `value`. Not bindable: the caller owns it and moves it in `onChange`. |
  | `groupName` | string | `''` | The radios' shared `name`, unique per rendered group; required by contract. |
  | `legend` / `legendKey` | string | `''` | The fieldset's name, visually hidden unless `legendVisible`; one is required by contract. |
  | `options` | `{ value, label \| labelKey + fallback, description \| descKey + descFallback, icon }[]` | `[]` | One card per entry, keyed by a unique `value`. a label is required by contract, the description and `icon` are optional, and an option carries no disabled flag, reason or badge: `disabledOptions` owns those. |
  | `disabled` | boolean | `false` | Disables the whole group, which dims every card and fires no `onChange`. |
  | `disabledOptions` | `{ value, reason }[]` | `[]` | Each entry disables the option it names and draws its already-localized `reason` beneath the description; `reason` is required by contract and an empty one draws nothing. An entry naming no option is ignored. One entry per value: the first non-empty reason wins, and a later empty one does not erase an earlier one. |
  | `layout` | `'row'` \| `'stacked'` | `'row'` | Chip beside the text, or chip over it. The caller states it (`stacked` on three or more tracks); it is never derived from `columns`, and a reflowed card keeps it. |
  | `columns` | number | `2` | Tracks per row. The group reflows to one track when its `fabricate-option-host` (a card or panel that names itself, else the manager) is 620px wide or narrower. |

  Snippets:
  - `optionBody(option)` — read-only content beneath the card's head: at the text column in a row
    card that has a chip, at the card padding otherwise. The radio stays the card's only control.

  Callbacks:
  - `onChange(value)` — the chosen input's value string; required by contract, and never fired for
    a disabled option or group.

  Rest spread:
  - `{...rest}` lands on the `<Field>` fieldset root, written after `class`, and carries the
    group's hooks, `data-radio-card-group` among them; `class` is appended to the root's own.

  Invariants:
  - Each radio is named by its option's title and described by its description, its reason and
    its option body, whichever render (`field-mounted.test.js`).
  - The face is the primitive's alone; the one caller rule naming its family is a margin, pinned
    by `searchable-popover-area-scope.test.js` and `option-cards-specimen-geometry.test.js`.
  - The chip is `Medallion` inside a wrapper that owns the disabled dim, because `Medallion`
    takes no rest props and no sheet rule names `.fab-medallion`. At rest it is `ink="neutral"`,
    and a chosen card's is `tone="accent"`.
  - A disabled option, or a disabled group, dims each part to .45 and never the card; the reason
    is never dimmed.
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
    value = '',
    groupName = '',
    columns = 2,
    layout = 'row',
    disabled = false,
    disabledOptions = [],
    optionDataAttr = '',
    optionBody = null,
    onChange = () => {},
    class: extraClass = '',
    ...rest
  } = $props();

  const uid = $props.id();
  const extraClasses = $derived(extraClass ? ` ${extraClass}` : '');
  const reasons = $derived(
    new Map([
      ...disabledOptions.filter((entry) => !entry.reason).map((entry) => [entry.value, '']),
      ...disabledOptions
        .filter((entry) => entry.reason)
        .toReversed()
        .map((entry) => [entry.value, entry.reason]),
    ])
  );

  const isOff = (option) => disabled || reasons.has(option.value);
  const describedBy = (index, parts) =>
    parts
      .filter(([, renders]) => renders)
      .map(([part]) => `${uid}-${index}-${part}`)
      .join(' ') || undefined;

  function choose(option, event) {
    if (isOff(option)) return;
    onChange(event.currentTarget.value);
  }
</script>

<Field
  as="fieldset"
  id={cardId}
  class={`fabricate-option-cards is-wide manager-resolution-mode-card manager-radio-card-group${legendVisible ? ' is-legend-visible' : ''}${layout === 'stacked' ? ' is-stacked' : ''}${extraClasses}`}
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
    {#each options as option, index (option.value)}
      {@const chosen = option.value === value}
      {@const hasDesc = Boolean(option.description || option.descFallback)}
      {@const reason = reasons.get(option.value) || ''}
      <label
        class="manager-resolution-option"
        class:is-active={chosen}
        class:is-disabled={isOff(option)}
        data-radio-card-option={option.value}
        {...{ [optionDataAttr]: optionDataAttr ? option.value : undefined }}
      >
        <span class="manager-resolution-option-head">
          {#if option.icon}
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
            <span
              class="manager-resolution-option-name"
              id={`${uid}-${index}-title`}
              data-tool-choice-title
              >{localizeOr(option.labelKey, option.label || option.fallback)}</span
            >
            {#if hasDesc}
              <span
                class="manager-resolution-option-desc"
                id={`${uid}-${index}-desc`}
                data-tool-choice-description
                >{localizeOr(option.descKey, option.description || option.descFallback)}</span
              >
            {/if}
            {#if reason}
              <span
                class="manager-resolution-option-reason"
                id={`${uid}-${index}-reason`}
                data-radio-card-reason>{reason}</span
              >
            {/if}
          </span>
          <input
            type="radio"
            name={groupName}
            value={option.value}
            checked={chosen}
            disabled={isOff(option)}
            aria-labelledby={`${uid}-${index}-title`}
            aria-describedby={describedBy(index, [
              ['desc', hasDesc],
              ['reason', Boolean(reason)],
              ['body', Boolean(optionBody)],
            ])}
            onchange={(event) => choose(option, event)}
          />
        </span>
        {#if optionBody}
          <div class="manager-resolution-option-body" id={`${uid}-${index}-body`}>
            {@render optionBody(option)}
          </div>
        {/if}
      </label>
    {/each}
  </div>
</Field>
