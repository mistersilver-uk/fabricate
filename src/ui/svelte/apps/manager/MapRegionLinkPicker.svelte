<!-- Svelte 5 runes mode -->
<!--
  Searchable picker for linking a Foundry Scene Region (a "map region") to a
  Fabricate gathering region on the Travel > Map Region Links tab. Thin wrapper
  over the generic SearchablePopover: builds the option list (leading "None"
  option to unlink, then the system regions with a "(disabled)" trailing chip)
  and maps the chosen id back to the link value (empty string -> null to clear).
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

  const noneLabel = $derived(text('FABRICATE.Admin.Manager.Travel.MapLinks.None', 'Not linked'));
  const disabledSuffix = $derived(text('FABRICATE.Admin.Manager.Travel.MapLinks.DisabledSuffix', '(disabled)'));

  const options = $derived([
    { id: '', label: noneLabel, icon: 'fas fa-link-slash' },
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
        || text('FABRICATE.Admin.Manager.Travel.MapLinks.Stale', 'Unknown region'))
      : noneLabel
  );
</script>

<SearchablePopover
  {value}
  {options}
  {disabled}
  pickerClass="manager-map-link-picker"
  triggerClass="manager-button manager-travel-picker-trigger manager-map-link-trigger"
  triggerIcon="fas fa-link"
  triggerLabel={selectedName}
  valueClass="manager-map-link-value"
  triggerAriaLabel={text('FABRICATE.Admin.Manager.Travel.MapLinks.LinkLabel', 'Linked Fabricate region')}
  dialogAriaLabel={text('FABRICATE.Admin.Manager.Travel.MapLinks.LinkLabel', 'Linked Fabricate region')}
  searchPlaceholder={text('FABRICATE.Admin.Manager.Travel.MapLinks.SearchPlaceholder', 'Search regions...')}
  searchAriaLabel={text('FABRICATE.Admin.Manager.Travel.MapLinks.SearchLabel', 'Search regions')}
  emptyHint={text('FABRICATE.Admin.Manager.Travel.MapLinks.NoMatches', 'No regions match your search.')}
  onChoose={(id) => onChoose(id || null)}
/>
