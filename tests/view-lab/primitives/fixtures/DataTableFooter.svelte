<!--
  A table under its footer, as a caller keys it: rows by their `id`, and the footer snippet the row
  supplies. The table's own rows draw each column's value, so no cell snippet is wired.
-->
<script>
  let { component: Specimen, props = {}, footer } = $props();

  const rowKey = (row) => row.id;
</script>

<Specimen {...props} {rowKey} {footer} />
