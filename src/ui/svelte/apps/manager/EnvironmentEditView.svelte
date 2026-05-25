<!-- Svelte 5 runes mode -->
<!--
  Placeholder for the environment editor.

  The previous editor is being redesigned. This shell keeps the
  `manager-environment-edit-view` root and the `manager-environment-details-band`
  title hook so navigation through the `environment-edit` route and existing
  parent layout remain intact, but no inline task / catalyst / tool authoring
  is exposed here. Reusable authoring lives in the standalone gathering task
  editor (route `gathering-task-edit`).
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    environmentDraft = null,
    isNew = false,
    onCancelEnvironment = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function environmentName() {
    const explicitName = typeof environmentDraft?.name === 'string' ? environmentDraft.name.trim() : '';
    if (explicitName) return explicitName;
    return text('FABRICATE.Admin.Environments.NewDraftTitle', 'New Gathering Environment');
  }
</script>

<form class="manager-environment-edit-view is-placeholder" onsubmit={(event) => { event.preventDefault(); }}>
  <section class="manager-environment-details-band" aria-label={text('FABRICATE.Admin.Manager.Environment.DetailsBand', 'Environment workspace')}>
    <div class="manager-environment-details-band-row">
      <h2 class="manager-card-title">{environmentName()}</h2>
      {#if isNew}
        <span class="manager-status-pill is-neutral">{text('FABRICATE.Admin.Environments.DraftStatus', 'Draft')}</span>
      {/if}
    </div>
  </section>

  <section class="manager-environment-placeholder-card" aria-label={text('FABRICATE.Admin.Manager.Environment.PlaceholderLabel', 'Environment editor placeholder')}>
    <div class="manager-environment-placeholder-body">
      <i class="fas fa-screwdriver-wrench manager-environment-placeholder-icon" aria-hidden="true"></i>
      <h3>{text('FABRICATE.Admin.Manager.Environment.PlaceholderTitle', 'Environment editor under redesign')}</h3>
      <p class="manager-muted">
        {text('FABRICATE.Admin.Manager.Environment.PlaceholderBody', 'This screen is being rebuilt. Gathering tasks can be authored from the standalone task editor in the meantime.')}
      </p>
      <button type="button" class="manager-button" onclick={() => onCancelEnvironment?.()}>
        <i class="fas fa-arrow-left" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Environment.PlaceholderReturn', 'Return to environments')}</span>
      </button>
    </div>
  </section>
</form>

<style>
  .manager-environment-edit-view.is-placeholder {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .manager-environment-placeholder-card {
    border: 1px solid var(--fab-border);
    border-radius: 0.5rem;
    padding: 2rem;
    background: var(--fab-card-bg);
  }

  .manager-environment-placeholder-body {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
    max-width: 48rem;
  }

  .manager-environment-placeholder-icon {
    font-size: 1.5rem;
    opacity: 0.7;
  }

  .manager-environment-placeholder-body h3 {
    margin: 0;
  }
</style>
