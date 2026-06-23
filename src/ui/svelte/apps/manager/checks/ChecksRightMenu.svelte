<!-- Svelte 5 runes mode -->
<!--
  Right-hand context menu for the Checks view. Tab-aware, mirroring the
  gathering environment editor's right inspector. The Crafting, Salvage, and
  Gathering tabs each expose this menu; the Validation tab renders no menu (the
  parent simply does not mount this component there).

  Each check is a singleton shaped by the system's resolution mode, so the menu
  is a reference/help card explaining that coupling and linking to the relevant
  documentation page — the same card format as the recipes "Set up recipes"
  card.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let { activeTab = 'crafting', activation = null, onToggleActive = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const activeOn = $derived(activation?.enabled === true);
  const activeTitle = text('FABRICATE.Admin.Manager.Checks.Active.Title', 'Active');
  const onLabel = text('FABRICATE.Admin.Manager.StatusOn', 'On');
  const offLabel = text('FABRICATE.Admin.Manager.StatusOff', 'Off');
  const optionalHint = text(
    'FABRICATE.Admin.Manager.Checks.Active.OptionalHint',
    'Turn this check on to require a roll for the activity, or off to resolve it without one.'
  );
  const requiredHint = $derived(
    activeTab === 'gathering'
      ? text(
          'FABRICATE.Admin.Manager.Checks.Active.GatheringHint',
          'Gathering checks are configured per task, not as one system-wide switch.'
        )
      : text(
          'FABRICATE.Admin.Manager.Checks.Active.RequiredHint',
          'The current resolution mode requires this check, so it cannot be turned off here.'
        )
  );

  const DOCS_BASE = 'https://mistersilver-uk.github.io/fabricate';

  const MENUS = {
    crafting: {
      icon: 'fas fa-hammer',
      kicker: text('FABRICATE.Admin.Manager.Checks.Crafting.HelpKicker', 'Crafting checks'),
      title: text('FABRICATE.Admin.Manager.Checks.Crafting.HelpTitle', 'About crafting checks'),
      desc: text(
        'FABRICATE.Admin.Manager.Checks.Crafting.HelpDesc',
        'The crafting check is shaped by the system resolution mode: simple and alchemy author a pass/fail check, routed authors outcome tiers, and progressive requires a check.'
      ),
      docsHref: `${DOCS_BASE}/crafting-checks`,
      docsLabel: text('FABRICATE.Admin.Manager.Checks.Crafting.Docs', 'Crafting checks docs')
    },
    salvage: {
      icon: 'fas fa-recycle',
      kicker: text('FABRICATE.Admin.Manager.Checks.Salvage.HelpKicker', 'Salvage checks'),
      title: text('FABRICATE.Admin.Manager.Checks.Salvage.HelpTitle', 'About salvage checks'),
      desc: text(
        'FABRICATE.Admin.Manager.Checks.Salvage.HelpDesc',
        'The salvage check is shaped by the salvage resolution mode. Simple mode makes it optional; routed and progressive modes require it.'
      ),
      docsHref: `${DOCS_BASE}/salvage`,
      docsLabel: text('FABRICATE.Admin.Manager.Checks.Salvage.Docs', 'Salvage docs')
    },
    gathering: {
      icon: 'fas fa-seedling',
      kicker: text('FABRICATE.Admin.Manager.Checks.Gathering.HelpKicker', 'Gathering checks'),
      title: text('FABRICATE.Admin.Manager.Checks.Gathering.HelpTitle', 'About gathering checks'),
      desc: text(
        'FABRICATE.Admin.Manager.Checks.Gathering.HelpDesc',
        'The gathering check is shaped by the task resolution mode. In d100 mode it is the fixed d100 roll; progressive and routed modes let you define it.'
      ),
      docsHref: `${DOCS_BASE}/gathering-environments`,
      docsLabel: text('FABRICATE.Admin.Manager.Checks.Gathering.Docs', 'Gathering docs')
    }
  };

  const menu = $derived(MENUS[activeTab] || MENUS.crafting);
  const quickstart = text('FABRICATE.Admin.Manager.Checks.Quickstart', 'Quickstart');
  const resources = text('FABRICATE.Admin.Manager.Checks.Resources', 'Check resources');
</script>

<aside class="manager-inspector manager-environment-inspector" aria-label={text('FABRICATE.Admin.Manager.Checks.Menu.Label', 'Checks context menu')}>
  {#if activation}
    <section class="manager-inspector-card" data-checks-active={activeTab}>
      <p class="manager-kicker">{activeTitle}</p>
      {#if activation.optional}
        <button
          type="button"
          class={`manager-status-toggle ${activeOn ? 'is-on' : 'is-off'}`}
          data-checks-active-toggle
          aria-pressed={activeOn}
          onclick={() => onToggleActive(!activeOn)}
        >
          <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
          <span class="manager-status-toggle-label">{activeOn ? onLabel : offLabel}</span>
        </button>
        <p class="manager-muted">{optionalHint}</p>
      {:else}
        <p class="manager-muted" data-checks-active-required>{requiredHint}</p>
      {/if}
    </section>
  {/if}

  <section class="manager-setup-card" data-checks-help={activeTab} aria-label={menu.title}>
    <div class="manager-setup-card-header">
      <i class={menu.icon} aria-hidden="true"></i>
      <div>
        <p class="manager-kicker">{menu.kicker}</p>
        <h3>{menu.title}</h3>
      </div>
    </div>
    <p class="manager-muted">{menu.desc}</p>
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
</aside>
