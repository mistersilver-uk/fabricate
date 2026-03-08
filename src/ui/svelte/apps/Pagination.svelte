<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';

  let {
    showPagination = false,
    startIndex = 0,
    endIndex = 0,
    totalRecipes = 0
  } = $props();
</script>

{#if showPagination}
<footer class="fabricate-footer">
  <span class="pagination">
    {localize('FABRICATE.Pagination.Showing')
      .replace('{start}', startIndex)
      .replace('{end}', endIndex)
      .replace('{total}', totalRecipes)}
  </span>
</footer>
{/if}
