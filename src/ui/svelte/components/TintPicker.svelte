<!--
  The manager's colour palette and the library's `<TintPicker>` specimen, imported by six files: two
  open it as a popover (the gathering biome's edit palette through `anchor`, the new-biome one
  through `TintPickerButton.svelte`'s `trigger` snippet) and four essence surfaces render it inline.
  It takes already-localized strings, never keys.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `layout` | `'popover'` \| `'inline'` | `'popover'` | `inline` renders the strip instead of the panel. The popover is `SearchablePopover`'s grid form: four columns of square swatch tiles, the query and its count, and the key-hint row (issue 2459). |
  | `trigger` / `anchor` / `open` / `bounds` | snippet / element or resolver / bindable boolean / selector or resolver | `undefined` / `undefined` / `false` / the primitive's | Forwarded to `SearchablePopover` as they are, so a missing `anchor` is trigger mode. An `anchor` caller binds `open`; a `trigger` caller spreads `attributes` on its own button and names it. |
  | `allowCustom` | boolean | `false` | Whether free-hex entry is offered: the panel's caller footer, or below the strip. Only a caller whose stored model carries a `customColor` sibling (the gathering biome) passes true, because a free hex cannot be guaranteed legible across all seven themes. |
  | `allowNone` / `unset` | booleans | `false` | `allowNone` offers No colour: the strip's leading cell, or the panel's `footerAction`, which clears and closes. `unset` is true when the caller holds no authored colour: `normalizedToken` folds an absent value onto a preset, so without it the palette marks that preset selected for a model that has chosen nothing. |
  | `noneSelected` | boolean or `null` | `null` | Whether the strip's No-colour cell is marked. `null` derives it from `unset`; a bulk-edit stage passes `false` for "leave unchanged", which marks nothing at all. |
  | `onClear` | function or `null` | `null` | The No-colour handler, separate from `onChange` because the two are different instructions; a caller that does not pass it cannot offer No colour. |
  | `presetGridLabel` / `customHexLabel` / `noneLabel` | pre-localized strings | their English through `localizeOr` | The palette's name (the strip's `group`, the panel and its `listbox`), the hex field's caption and No colour's name (issue 2257). |

  Invariants:
  - No colour is offered only when `allowNone` is true and `onClear` is a function.
  - Every swatch's label is both its `aria-label` and its `title`. The palette is a shared
    constant, so the panel, its trigger and the inline strip cannot drift in order, membership or
    naming.
  - The strip's cells sit in a `group` and only the selected one is `aria-pressed="true"`; the
    panel's tiles are `option`s and only the selected one is `aria-selected="true"`. Either mark is
    the sheet's inset ring, never the focus outline (issues 2257 and 2459).
-->
<script>
  import { localize } from '../util/foundryBridge.js';
  import { localizeOr } from '../util/localizeOr.js';
  import {
    MANAGER_COLOR_TOKENS,
    managerColorTokenLabel,
    normalizeManagerColorToken,
    tintSwatchStyle,
  } from '../util/managerColorTokens.js';
  import SearchablePopover from './SearchablePopover.svelte';

  let {
    colorToken = 'sage',
    customColor = '',
    presetGridLabel = localizeOr('FABRICATE.Common.TintPicker.Presets', 'Colour presets'),
    customHexLabel = localizeOr('FABRICATE.Common.TintPicker.CustomHex', 'Custom hex'),
    noneLabel = localizeOr('FABRICATE.Common.TintPicker.None', 'No colour'),
    allowCustom = false,
    unset = false,
    layout = 'popover',
    allowNone = false,
    noneSelected = null,
    onClear = null,
    onChange = () => {},
    trigger = undefined,
    anchor = undefined,
    open = $bindable(false),
    bounds = undefined,
  } = $props();

  const searchText = localizeOr('FABRICATE.Common.TintPicker.Search', 'Search colours');

  const presets = $derived(
    MANAGER_COLOR_TOKENS.map((preset) => ({
      token: preset.token,
      label: managerColorTokenLabel(preset.token, localize),
    }))
  );

  const presetOptions = $derived(
    presets.map(({ token, label }) => ({
      id: token,
      label,
      data: { 'data-manager-color-token': token },
    }))
  );

  function normalizedToken(value) {
    return normalizeManagerColorToken(value);
  }

  const isPresetSelected = (token) => !unset && normalizedToken(colorToken) === token;

  function selectPreset(token) {
    onChange({ colorToken: token, customColor });
  }

  const showNoColour = $derived(allowNone === true && typeof onClear === 'function');
  const noColourSelected = $derived(typeof noneSelected === 'boolean' ? noneSelected : unset);

  function updateCustomColor(value) {
    onChange({ colorToken: normalizedToken(colorToken), customColor: value });
  }

  function clearAndClose({ close }) {
    onClear();
    close();
  }

  // The panel's rows for the whole-row floor, the list's ring-reach padding as height no pitch sees,
  // and the panel's natural height as the least it opens into, so a side short of it flips the panel.
  function measureTintPanel({ popover, list }) {
    const tile = list?.querySelector('[role="option"]');
    const rowHeight = tile?.getBoundingClientRect().height ?? 0;
    if (!popover || !rowHeight) return {};
    const styles = getComputedStyle(list);
    const rowGap = Number.parseFloat(styles.rowGap) || 0;
    const chromeHeight = popover.offsetHeight - list.offsetHeight;
    return {
      rowPitch: rowHeight + rowGap,
      rowGap,
      chromeHeight,
      listExtra:
        Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom) || 0,
      minUsableHeight: chromeHeight + list.scrollHeight,
    };
  }
</script>

{#snippet hexField()}
  <label class="manager-color-custom">
    <span>{customHexLabel}</span>
    <input
      value={customColor || ''}
      placeholder="hex"
      data-manager-custom-color
      oninput={(event) => updateCustomColor(event.currentTarget.value)}
    />
  </label>
{/snippet}

{#if layout === 'inline'}
  <span
    class="fabricate-color-picker-popover manager-color-picker-popover is-inline"
    data-manager-color-layout="inline"
  >
    <span class="manager-color-preset-grid" role="group" aria-label={presetGridLabel || undefined}>
      {#if showNoColour}
        <button
          type="button"
          class={`manager-color-preset manager-color-preset-none ${noColourSelected ? 'is-selected' : ''}`}
          aria-label={noneLabel}
          aria-pressed={noColourSelected ? 'true' : 'false'}
          title={noneLabel}
          data-manager-color-none
          onclick={() => onClear()}
        >
          <span class="manager-color-swatch manager-color-swatch-none" aria-hidden="true">
            <i class="fas fa-slash"></i>
          </span>
        </button>
      {/if}
      {#each presets as preset (preset.token)}
        <button
          type="button"
          class={`manager-color-preset ${isPresetSelected(preset.token) ? 'is-selected' : ''}`}
          aria-label={preset.label}
          aria-pressed={isPresetSelected(preset.token) ? 'true' : 'false'}
          title={preset.label}
          data-manager-color-token={preset.token}
          style={tintSwatchStyle(preset.token, '')}
          onclick={() => selectPreset(preset.token)}
        >
          <span class="manager-color-swatch" aria-hidden="true"></span>
        </button>
      {/each}
    </span>
    {#if allowCustom}{@render hexField()}{/if}
  </span>
{:else}
  <SearchablePopover
    {anchor}
    {trigger}
    bind:open
    {bounds}
    as="grid"
    columns={4}
    squareTiles
    keyHints
    showFilteredCount
    filteredCountTemplate={localizeOr('FABRICATE.Common.TintPicker.Count', '{matched} of {total}')}
    options={presetOptions}
    value={unset ? '' : normalizedToken(colorToken)}
    onSelect={selectPreset}
    panelLabel={presetGridLabel}
    searchLabel={searchText}
    searchPlaceholder={searchText}
    popoverClass="fabricate-color-picker-popover manager-color-picker-popover"
    footer={allowCustom ? hexField : undefined}
    footerAction={showNoColour ? { label: noneLabel, onActivate: clearAndClose } : null}
    measureListMetrics={measureTintPanel}
  >
    {#snippet option(preset)}
      <span class="manager-color-swatch" aria-hidden="true" style={tintSwatchStyle(preset.id, '')}
      ></span>
    {/snippet}
  </SearchablePopover>
{/if}

<style>
  .manager-color-picker-popover.is-inline {
    display: grid;
    gap: var(--fab-space-2);
    width: 100%;
  }

  .manager-color-picker-popover.is-inline .manager-color-preset-grid {
    grid-template-columns: repeat(auto-fit, minmax(44px, 1fr));
  }

  .manager-color-picker-popover.is-inline .manager-color-preset {
    aspect-ratio: auto;
    height: 28px;
    min-height: 28px;
  }

  .manager-color-swatch-none {
    color: var(--fab-text-muted);
    background: var(--fab-bg-3);
    font-size: 0.6rem;
  }
</style>
