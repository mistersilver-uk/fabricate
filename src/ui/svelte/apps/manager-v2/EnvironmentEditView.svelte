<!-- Svelte 5 runes mode -->
<!--
  Placeholder for the environment editor.

  The previous editor is being redesigned. This shell keeps the
  `manager-v2-environment-edit-view` root and the `manager-v2-environment-details-band`
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

<form class="manager-v2-environment-edit-view is-placeholder" onsubmit={(event) => { event.preventDefault(); }}>
  <section class="manager-v2-environment-details-band" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.DetailsBand', 'Environment workspace')}>
    <div class="manager-v2-environment-details-band-row">
      <h2 class="manager-v2-card-title">{environmentName()}</h2>
      {#if isNew}
        <span class="manager-v2-status-pill is-neutral">{text('FABRICATE.Admin.Environments.DraftStatus', 'Draft')}</span>
      {/if}
    </div>
  </section>

  <section class="manager-v2-environment-placeholder-card" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.PlaceholderLabel', 'Environment editor placeholder')}>
    <div class="manager-v2-environment-placeholder-body">
      <i class="fas fa-screwdriver-wrench manager-v2-environment-placeholder-icon" aria-hidden="true"></i>
      <h3>{text('FABRICATE.Admin.ManagerV2.Environment.PlaceholderTitle', 'Environment editor under redesign')}</h3>
      <p class="manager-v2-muted">
        {text('FABRICATE.Admin.ManagerV2.Environment.PlaceholderBody', 'This screen is being rebuilt. Gathering tasks can be authored from the standalone task editor in the meantime.')}
      </p>
      <button type="button" class="manager-v2-button" onclick={() => onCancelEnvironment?.()}>
        <i class="fas fa-arrow-left" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.ManagerV2.Environment.PlaceholderReturn', 'Return to environments')}</span>
      </button>
    </div>
  </section>
</form>

<style>
  .manager-v2-environment-edit-view.is-placeholder {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .manager-v2-environment-placeholder-card {
    border: 1px solid var(--fab-border);
    border-radius: 0.5rem;
    padding: 2rem;
    background: var(--fab-card-bg);
  }

  .manager-v2-environment-placeholder-body {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
    max-width: 48rem;
  }

  .manager-v2-environment-placeholder-icon {
    font-size: 1.5rem;
    opacity: 0.7;
  }

  .manager-v2-environment-placeholder-body h3 {
    margin: 0;
  }
</style>
