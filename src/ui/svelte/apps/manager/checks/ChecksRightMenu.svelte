<!-- Svelte 5 runes mode -->
<!--
  Right-hand context menu for the Checks view. Tab-aware, mirroring the
  gathering environment editor's right inspector. The Crafting, Salvage, and
  Gathering tabs each expose a menu; the Validation tab renders no menu (the
  parent simply does not mount this component there). Placeholder content for
  the first iteration.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let { activeTab = 'crafting' } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const MENUS = {
    crafting: {
      kicker: text('FABRICATE.Admin.Manager.Checks.Crafting.MenuKicker', 'Crafting checks'),
      title: text('FABRICATE.Admin.Manager.Checks.Crafting.MenuTitle', 'Crafting context'),
      hint: text(
        'FABRICATE.Admin.Manager.Checks.Crafting.MenuHint',
        'Context actions for crafting checks will live here.'
      )
    },
    salvage: {
      kicker: text('FABRICATE.Admin.Manager.Checks.Salvage.MenuKicker', 'Salvage checks'),
      title: text('FABRICATE.Admin.Manager.Checks.Salvage.MenuTitle', 'Salvage context'),
      hint: text(
        'FABRICATE.Admin.Manager.Checks.Salvage.MenuHint',
        'Context actions for salvage checks will live here.'
      )
    },
    gathering: {
      kicker: text('FABRICATE.Admin.Manager.Checks.Gathering.MenuKicker', 'Gathering checks'),
      title: text('FABRICATE.Admin.Manager.Checks.Gathering.MenuTitle', 'Gathering context'),
      hint: text(
        'FABRICATE.Admin.Manager.Checks.Gathering.MenuHint',
        'Context actions for gathering checks will live here.'
      )
    }
  };

  const menu = $derived(MENUS[activeTab] || MENUS.crafting);
</script>

<aside class="manager-inspector manager-environment-inspector" aria-label={text('FABRICATE.Admin.Manager.Checks.Menu.Label', 'Checks context menu')}>
  <section class="manager-inspector-card" data-checks-menu={activeTab}>
    <p class="manager-kicker">{menu.kicker}</p>
    <h2 class="manager-inspector-name">{menu.title}</h2>
    <p class="manager-muted">{menu.hint}</p>
  </section>
</aside>
