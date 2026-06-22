<!-- Svelte 5 runes mode -->
<!--
  Right-hand context menu for the Checks view. Tab-aware, mirroring the
  gathering environment editor's right inspector. The Crafting, Salvage, and
  Gathering tabs each expose a menu; the Validation tab renders no menu (the
  parent simply does not mount this component there).

  While a check type has no checks, the menu shows a "Set up … checks" help card
  with a link to the relevant documentation page — the same format as the
  recipes "Set up recipes" card. Once at least one check of that type exists, the
  help card is replaced by a placeholder for the selected check's identity.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let { activeTab = 'crafting', count = 0 } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const DOCS_BASE = 'https://mistersilver-uk.github.io/fabricate';

  const MENUS = {
    crafting: {
      icon: 'fas fa-hammer',
      setupKicker: text('FABRICATE.Admin.Manager.Checks.Crafting.SetupKicker', 'Crafting checks setup'),
      setupTitle: text('FABRICATE.Admin.Manager.Checks.Crafting.SetupTitle', 'Set up crafting checks'),
      setupHint: text(
        'FABRICATE.Admin.Manager.Checks.Crafting.SetupHint',
        'Create the first crafting check to gate crafting attempts behind a roll.'
      ),
      steps: [
        text('FABRICATE.Admin.Manager.Checks.Crafting.SetupStep1', 'Create a check and give it a name and roll formula.'),
        text('FABRICATE.Admin.Manager.Checks.Crafting.SetupStep2', 'Set the difficulty and the success and failure outcomes.'),
        text('FABRICATE.Admin.Manager.Checks.Crafting.SetupStep3', 'Enable the check so it applies to crafting attempts.')
      ],
      docsHref: `${DOCS_BASE}/crafting-checks`,
      docsLabel: text('FABRICATE.Admin.Manager.Checks.Crafting.Docs', 'Crafting checks docs'),
      identityHint: text(
        'FABRICATE.Admin.Manager.Checks.Crafting.IdentityHint',
        'Identity details for the selected crafting check will appear here.'
      )
    },
    salvage: {
      icon: 'fas fa-recycle',
      setupKicker: text('FABRICATE.Admin.Manager.Checks.Salvage.SetupKicker', 'Salvage checks setup'),
      setupTitle: text('FABRICATE.Admin.Manager.Checks.Salvage.SetupTitle', 'Set up salvage checks'),
      setupHint: text(
        'FABRICATE.Admin.Manager.Checks.Salvage.SetupHint',
        'Create the first salvage check to gate salvage attempts behind a roll.'
      ),
      steps: [
        text('FABRICATE.Admin.Manager.Checks.Salvage.SetupStep1', 'Create a check and give it a name and roll formula.'),
        text('FABRICATE.Admin.Manager.Checks.Salvage.SetupStep2', 'Set the difficulty and the success and failure outcomes.'),
        text('FABRICATE.Admin.Manager.Checks.Salvage.SetupStep3', 'Enable the check so it applies to salvage attempts.')
      ],
      docsHref: `${DOCS_BASE}/salvage`,
      docsLabel: text('FABRICATE.Admin.Manager.Checks.Salvage.Docs', 'Salvage docs'),
      identityHint: text(
        'FABRICATE.Admin.Manager.Checks.Salvage.IdentityHint',
        'Identity details for the selected salvage check will appear here.'
      )
    },
    gathering: {
      icon: 'fas fa-seedling',
      setupKicker: text('FABRICATE.Admin.Manager.Checks.Gathering.SetupKicker', 'Gathering checks setup'),
      setupTitle: text('FABRICATE.Admin.Manager.Checks.Gathering.SetupTitle', 'Set up gathering checks'),
      setupHint: text(
        'FABRICATE.Admin.Manager.Checks.Gathering.SetupHint',
        'Create the first gathering check to gate gathering attempts behind a roll.'
      ),
      steps: [
        text('FABRICATE.Admin.Manager.Checks.Gathering.SetupStep1', 'Create a check and give it a name and roll formula.'),
        text('FABRICATE.Admin.Manager.Checks.Gathering.SetupStep2', 'Set the difficulty and the success and failure outcomes.'),
        text('FABRICATE.Admin.Manager.Checks.Gathering.SetupStep3', 'Enable the check so it applies to gathering attempts.')
      ],
      docsHref: `${DOCS_BASE}/gathering-environments`,
      docsLabel: text('FABRICATE.Admin.Manager.Checks.Gathering.Docs', 'Gathering docs'),
      identityHint: text(
        'FABRICATE.Admin.Manager.Checks.Gathering.IdentityHint',
        'Identity details for the selected gathering check will appear here.'
      )
    }
  };

  const menu = $derived(MENUS[activeTab] || MENUS.crafting);
  const hasChecks = $derived(count > 0);
  const quickstart = text('FABRICATE.Admin.Manager.Checks.Quickstart', 'Quickstart');
  const resources = text('FABRICATE.Admin.Manager.Checks.Resources', 'Check resources');
  const identityKicker = text('FABRICATE.Admin.Manager.Checks.IdentityKicker', 'Selected check');
  const identityTitle = text('FABRICATE.Admin.Manager.Checks.IdentityTitle', 'Check identity');
</script>

<aside class="manager-inspector manager-environment-inspector" aria-label={text('FABRICATE.Admin.Manager.Checks.Menu.Label', 'Checks context menu')}>
  {#if hasChecks}
    <section class="manager-inspector-card" data-checks-identity={activeTab}>
      <p class="manager-kicker">{identityKicker}</p>
      <h2 class="manager-inspector-name">{identityTitle}</h2>
      <p class="manager-muted">{menu.identityHint}</p>
    </section>
  {:else}
    <section class="manager-setup-card" data-checks-setup={activeTab} aria-label={menu.setupTitle}>
      <div class="manager-setup-card-header">
        <i class={menu.icon} aria-hidden="true"></i>
        <div>
          <p class="manager-kicker">{menu.setupKicker}</p>
          <h3>{menu.setupTitle}</h3>
        </div>
      </div>
      <p class="manager-muted">{menu.setupHint}</p>
      <ol class="manager-setup-list">
        {#each menu.steps as step (step)}
          <li>{step}</li>
        {/each}
      </ol>
      <div class="manager-setup-links" aria-label={resources}>
        <a class="manager-button" href={menu.docsHref} target="_blank" rel="noreferrer">
          <i class="fas fa-book-open" aria-hidden="true"></i>
          <span>{menu.docsLabel}</span>
        </a>
        <a class="manager-button" href={`${DOCS_BASE}/quickstart`} target="_blank" rel="noreferrer">
          <i class="fas fa-circle-question" aria-hidden="true"></i>
          <span>{quickstart}</span>
        </a>
      </div>
    </section>
  {/if}
</aside>
