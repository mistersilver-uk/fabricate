<!--
  The time-of-day bar's call site (issue 2431): the strip over one day rotated to start at the first
  period's start, its hours, divider names and add names handed in by the row.
-->
<script>
  let {
    component: Specimen,
    props = {},
    hours = {},
    boundaryLabels = {},
    addLabels = {},
  } = $props();

  const formatValue = (value) => hours[value] ?? String(value);
  const boundaryLabel = (_band, next) => boundaryLabels[next?.id];
  const addLabel = (band) => addLabels[band?.id];

  function ignore() {}
</script>

<Specimen
  {...props}
  {formatValue}
  {boundaryLabel}
  {addLabel}
  onChange={ignore}
  onMarkerChange={ignore}
  onAdd={ignore}
/>
