<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';

  let { title, hint, enabled = false, onToggle, showToggle = true, children } = $props();
</script>

<section class="feature-card">
  <div class="feature-card-header">
    <div>
      <h4>{title}</h4>
      <p class="hint">{hint}</p>
    </div>
    {#if showToggle}
      <label class="checkbox-label">
        <input type="checkbox" checked={enabled} onchange={(e) => onToggle(e.target.checked)} />
        {localize('FABRICATE.Admin.Features.Enable')}
      </label>
    {/if}
  </div>
  {#if enabled || !showToggle}
    <div class="feature-card-content">
      {@render children?.()}
    </div>
  {/if}
</section>
