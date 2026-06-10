<!-- Svelte 5 runes mode -->
<!--
  Searchable region-override picker for a party row on the Travel > Parties tab.
  Thin wrapper over the generic SearchablePopover: builds the option list
  (leading "Auto" option to clear the override, then the system regions with a
  "(disabled)" trailing chip) and maps the chosen id back to the override value
  (empty string -> null to clear).
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import SearchablePopover from './SearchablePopover.svelte';

  let {
    value = '',
    regions = [],
    disabled = false,
    onChoose = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const autoLabel = $derived(text('FABRICATE.Admin.Manager.Travel.Parties.OverrideAuto', 'Auto'));
  const disabledSuffix = $derived(text('FABRICATE.Admin.Manager.Travel.Parties.OverrideDisabledSuffix', '(disabled)'));

  const options = $derived([
    { id: '', label: autoLabel, icon: 'fas fa-wand-magic-sparkles' },
    ...regions.map(region => ({
      id: region.id,
      label: region.name,
      icon: 'fas fa-map-location-dot',
      trailing: region.enabled ? '' : disabledSuffix
    }))
  ]);

  const selectedName = $derived(
    value
      ? (regions.find(region => region.id === value)?.name
        || text('FABRICATE.Admin.Manager.Travel.Parties.OverrideStale', 'Unknown region'))
      : autoLabel
  );
</script>

<SearchablePopover
  {value}
  {options}
  {disabled}
  pickerClass="manager-travel-parties-override"
  triggerClass="manager-button manager-travel-picker-trigger manager-travel-parties-override-trigger"
  triggerIcon="fas fa-location-crosshairs"
  triggerLabel={selectedName}
  valueClass="manager-travel-parties-override-value"
  triggerAriaLabel={text('FABRICATE.Admin.Manager.Travel.Parties.OverrideLabel', 'Current region override')}
  dialogAriaLabel={text('FABRICATE.Admin.Manager.Travel.Parties.OverrideLabel', 'Current region override')}
  searchPlaceholder={text('FABRICATE.Admin.Manager.Travel.Parties.OverrideSearchPlaceholder', 'Search regions...')}
  searchAriaLabel={text('FABRICATE.Admin.Manager.Travel.Parties.OverrideSearchLabel', 'Search regions')}
  emptyHint={text('FABRICATE.Admin.Manager.Travel.Parties.NoRegionMatches', 'No regions match your search.')}
  onChoose={(id) => onChoose(id || null)}
/>
