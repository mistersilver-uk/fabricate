<!-- A synthetic fixture that renders its component with the row's props, as every fixture must. -->
<script>
  let { component: Specimen, props = {} } = $props();
</script>

<Specimen {...props} />
