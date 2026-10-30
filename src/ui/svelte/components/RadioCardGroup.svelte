<!--
  A fieldset of radio cards for one choice among a few options, drawn as the library's
  `<OptionCards>`: one card per option with an optional chip, a title and badge, a description
  line, an example line and an optional `optionBody` beneath them.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | string | `''` | The chosen option's `value`. Not bindable: the caller owns it and moves it in `onChange`. |
  | `groupName` | string | `''` | The radios' shared `name`, unique per rendered group; empty falls back to a name unique to the mount. |
  | `legend` | string | `''` | The fieldset's name, final display text, visually hidden unless `legendVisible`; required by contract. |
  | `hint` | string | `''` | Final display text drawn as a warning note under the legend; none when empty. |
  | `options` | `{ value, label, description?, example?, badge?, icon? }[]` | `[]` | One card per entry, keyed by a unique `value`; `label`, `description`, `example` and `badge.label` are final display text (`localizeOptions` resolves a keyed list). A label is required by contract, the rest are optional, and an option carries no disabled flag or reason: `disabledOptions` owns those. `example` is a third text line under the description. `badge` is `{ label, tone? }`, a chip beside the title whose `tone` is one of `BADGE_TONES` (any other draws `secondary`), and an empty or non-string `label` draws none. |
  | `disabled` | boolean | `false` | Disables the whole group, which dims every card and fires no `onChange`. |
  | `disabledOptions` | `{ value, reason }[]` | `[]` | Each entry disables the option it names and draws its already-localized `reason` beneath the description; `reason` is required by contract and an empty one draws nothing. An entry naming no option is ignored. One entry per value: the first non-empty reason wins, and a later empty one does not erase an earlier one. |
  | `layout` | `'row'` \| `'stacked'` | `'row'` | Chip beside the text, or chip over it. The caller states it (`stacked` on three or more tracks); it is never derived from `columns`, and a reflowed card keeps it. |
  | `columns` | positive integer | `2` | Tracks per row; any other value draws `2`, so no string reaches the `style` attribute. The group reflows to one track when its `fabricate-option-host` (a card or panel that names itself, else the manager) is 620px wide or narrower. |

  Snippets:
  - `optionBody(option)` — read-only content beneath the card's head: at the text column in a row
    card that has a chip, at the card padding otherwise. The radio stays the card's only control.

  Callbacks:
  - `onChange(value)` — the chosen input's value string; required by contract, and never fired for
    a disabled option or group. When it returns, or throws, every radio of this group is checked
    as `value` then says, so a change the caller declines leaves the previous radio checked.

  Rest spread:
  - `{...rest}` lands on the `<Field>` fieldset root, written after `class`, and carries the
    group's hooks, `data-radio-card-group` among them; `class` is appended to the root's own.

  Invariants:
  - Each radio is named by its option's title and described by its badge, description, example,
    reason and option body, whichever render, so the badge is announced once and never joins the
    name (`field-mounted.test.js`).
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
  import Chip from './Chip.svelte';
  import Field from './Field.svelte';
  import Medallion from './Medallion.svelte';

  // The Chip tones that clear 4.5:1 on the card's rest and chosen grounds in every palette.
  const BADGE_TONES = new Set(['positive', 'warning', 'info', 'danger', 'accent', 'secondary']);

  let {
    cardId = undefined,
    legend = '',
    legendVisible = false,
    hint = '',
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
  const name = $derived(groupName || `fabricate-option-cards-${uid}`);
  const trackCount = $derived(Number.isInteger(columns) && columns > 0 ? columns : 2);
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
  const badgeOf = (option) =>
    typeof option.badge?.label === 'string' && option.badge.label.trim()
      ? {
          label: option.badge.label,
          tone: BADGE_TONES.has(option.badge.tone) ? option.badge.tone : 'secondary',
        }
      : null;
  const describedBy = (index, parts) =>
    parts
      .filter(([, renders]) => renders)
      .map(([part]) => `${uid}-${index}-${part}`)
      .join(' ') || undefined;

  function choose(option, event) {
    const radios = event.currentTarget.closest('fieldset').querySelectorAll('input[type="radio"]');
    try {
      if (!isOff(option)) onChange(event.currentTarget.value);
    } finally {
      for (const radio of radios) radio.checked = radio.value === value;
    }
  }
</script>

<Field
  as="fieldset"
  id={cardId}
  class={`fabricate-option-cards is-wide manager-resolution-mode-card manager-radio-card-group${legendVisible ? ' is-legend-visible' : ''}${layout === 'stacked' ? ' is-stacked' : ''}${extraClasses}`}
  {disabled}
  {...rest}
>
  <legend class="manager-resolution-mode-legend">{legend}</legend>
  {#if hint}
    <p class="manager-resolution-mode-note" role="note">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
      <span>{hint}</span>
    </p>
  {/if}
  <div
    class="manager-resolution-mode-options"
    style={`--manager-radio-card-columns: ${trackCount}`}
  >
    {#each options as option, index (option.value)}
      {@const chosen = option.value === value}
      {@const hasDesc = Boolean(option.description)}
      {@const hasExample = Boolean(option.example)}
      {@const badge = badgeOf(option)}
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
            {#snippet title()}
              <span
                class="manager-resolution-option-name"
                id={`${uid}-${index}-title`}
                data-tool-choice-title>{option.label}</span
              >
            {/snippet}
            {#if badge}
              <span class="manager-resolution-option-line">
                {@render title()}
                <Chip
                  tone={badge.tone}
                  density="inspector"
                  class="manager-resolution-option-badge"
                  id={`${uid}-${index}-badge`}
                  data-radio-card-badge>{badge.label}</Chip
                >
              </span>
            {:else}
              {@render title()}
            {/if}
            {#if hasDesc}
              <span
                class="manager-resolution-option-desc"
                id={`${uid}-${index}-desc`}
                data-tool-choice-description>{option.description}</span
              >
            {/if}
            {#if hasExample}
              <span
                class="manager-resolution-option-example"
                id={`${uid}-${index}-example`}
                data-radio-card-example>{option.example}</span
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
            {name}
            value={option.value}
            checked={chosen}
            disabled={isOff(option)}
            aria-labelledby={`${uid}-${index}-title`}
            aria-describedby={describedBy(index, [
              ['badge', Boolean(badge)],
              ['desc', hasDesc],
              ['example', hasExample],
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
