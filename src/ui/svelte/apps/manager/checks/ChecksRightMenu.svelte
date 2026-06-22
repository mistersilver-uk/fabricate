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

  let { activeTab = 'crafting' } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const DOCS_BASE = 'https://mistersilver-uk.github.io/fabricate';

  const MENUS = {
    crafting: {
      icon: 'fas fa-hammer',
      kicker: text('FABRICATE.Admin.Manager.Checks.Crafting.HelpKicker', 'Crafting checks'),
      title: text('FABRICATE.Admin.Manager.Checks.Crafting.HelpTitle', 'About crafting checks'),
      desc: text(
        'FABRICATE.Admin.Manager.Checks.Crafting.HelpDesc',
        'The crafting check is shaped by the system resolution mode. Progressive mode requires it; simple and routed modes make it optional.'
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
        'The salvage check is shaped by the salvage resolution mode. Progressive mode requires it; simple and routed modes make it optional.'
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
