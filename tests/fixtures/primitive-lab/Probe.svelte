<!-- A component a synthetic lab row stands up: it draws its `label` and nothing else. -->
<script>
  let { label = '' } = $props();
</script>

<span class="pl-probe">{label}</span>
