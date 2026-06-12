<!-- Svelte 5 runes mode -->
<!--
  Searchable realm-override picker for a party row on the Travel > Parties tab.
  Thin wrapper over the generic SearchablePopover: builds the option list
  (leading "Auto" option to clear the override, then the system realms with a
  "(disabled)" trailing chip) and maps the chosen id back to the override value
  (empty string -> null to clear).
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import SearchablePopover from './SearchablePopover.svelte';

  let {
    value = '',
    realms = [],
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
    ...realms.map(realm => ({
      id: realm.id,
      label: realm.name,
      icon: 'fas fa-map-location-dot',
      trailing: realm.enabled ? '' : disabledSuffix
    }))
  ]);

  const selectedName = $derived(
    value
      ? (realms.find(realm => realm.id === value)?.name
        || text('FABRICATE.Admin.Manager.Travel.Parties.OverrideStale', 'Unknown realm'))
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
  triggerAriaLabel={text('FABRICATE.Admin.Manager.Travel.Parties.OverrideLabel', 'Current realm override')}
  dialogAriaLabel={text('FABRICATE.Admin.Manager.Travel.Parties.OverrideLabel', 'Current realm override')}
  searchPlaceholder={text('FABRICATE.Admin.Manager.Travel.Parties.OverrideSearchPlaceholder', 'Search realms...')}
  searchAriaLabel={text('FABRICATE.Admin.Manager.Travel.Parties.OverrideSearchLabel', 'Search realms')}
  emptyHint={text('FABRICATE.Admin.Manager.Travel.Parties.NoRealmMatches', 'No realms match your search.')}
  onChoose={(id) => onChoose(id || null)}
/>
