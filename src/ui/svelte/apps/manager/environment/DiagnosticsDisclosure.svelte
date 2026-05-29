<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let { title = '', count = 0, children } = $props();

  let expanded = $state(false);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const heading = $derived(title || text('FABRICATE.Admin.Manager.EnvironmentEditor.Diagnostics.Title', 'Diagnostics'));
</script>

<section class="manager-environment-diagnostics" data-diagnostics-open={expanded}>
  <button
    type="button"
    class="manager-environment-diagnostics-toggle"
    aria-expanded={expanded}
    onclick={() => { expanded = !expanded; }}
  >
    <i class={`fas ${expanded ? 'fa-chevron-down' : 'fa-chevron-right'}`} aria-hidden="true"></i>
    <span class="manager-environment-diagnostics-title">{heading}</span>
    <span class="manager-chip is-neutral manager-environment-diagnostics-count">{count}</span>
  </button>
  {#if expanded}
    <div class="manager-environment-diagnostics-body">
      {@render children?.()}
    </div>
  {/if}
</section>
