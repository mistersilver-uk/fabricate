<!-- Svelte 5 runes mode -->
<!--
  Right-hand context menu for the Checks view. Tab-aware, mirroring the
  gathering environment editor's right inspector. The Crafting, Salvage, and
  Gathering tabs each expose this menu; the Validation tab renders no menu (the
  parent simply does not mount this component there).

  Each check is a singleton shaped by the system's resolution mode, so the menu
  is a reference/help card explaining that coupling and linking to the relevant
  documentation pages.

  Both cards render on the manager's shared inspector contracts (issue 883). The
  Active card is a `.manager-inspector-card` under a `.manager-card-title`, like
  every other card in every other rail; the help card is the shared
  `ExplainerCard`. It used to be a hand-rolled `.manager-setup-card` — the format
  the numbered first-run "Set up X" procedures use — which gave this rail a card
  shell, an icon tile and a 0.98rem heading that no other inspector had. That card
  is the reason `ExplainerCard` now takes a LIST of links: this surface offers two
  ways out (its own docs page and the Quickstart) and the primitive only spoke of
  one.
-->
<script>
  import ExplainerCard from '../ExplainerCard.svelte';
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
  // The gathering check's active toggle is mode-aware and inverted from the
  // generic `optional` flag: d100 is the fixed roll (read-only note, no toggle),
  // while progressive/routed are editable checks that expose an Active toggle.
  const gatheringD100 = $derived(activeTab === 'gathering' && activation?.mode === 'd100');
  // Alchemy "No check" mode: the crafting check does not run at all. Distinct from a
  // MANDATORY check — hide the toggle AND show a "no check" hint, not the requiredHint.
  const craftingNone = $derived(activeTab === 'crafting' && activation?.none === true);
  const showActiveToggle = $derived(
    activeTab === 'gathering' ? !gatheringD100 : !craftingNone && activation?.optional === true
  );
  const requiredHint = $derived(
    craftingNone
      ? text(
          'FABRICATE.Admin.Manager.Checks.Active.AlchemyNoneHint',
          'This alchemy system resolves without a crafting check. Switch the alchemy check mode to Simple or Tiered under Recipe resolution to author one.'
        )
      : activeTab === 'gathering'
        ? text(
            'FABRICATE.Admin.Manager.Checks.Active.GatheringHint',
            'In d100 mode the gathering check is the fixed d100 roll and cannot be turned off here.'
          )
        : text(
            'FABRICATE.Admin.Manager.Checks.Active.RequiredHint',
            'The current resolution mode requires this check, so it cannot be turned off here.'
          )
  );

  const DOCS_BASE = 'https://mistersilver-uk.github.io/fabricate';

  // The Quickstart is the second way out of every one of these cards, so it is built once
  // rather than restated per tab.
  const quickstartLink = {
    href: `${DOCS_BASE}/quickstart`,
    label: text('FABRICATE.Admin.Manager.Checks.Quickstart', 'Quickstart'),
    icon: 'fas fa-circle-question'
  };

  // The description stays ONE explainer row rather than being split into a row per rule:
  // these are already-authored, already-translated sentences, and rewriting them into a
  // list would be a content change wearing a consistency change's clothes.
  const MENUS = {
    crafting: {
      icon: 'fas fa-hammer',
      title: text('FABRICATE.Admin.Manager.Checks.Crafting.HelpTitle', 'About crafting checks'),
      items: [
        {
          text: text(
            'FABRICATE.Admin.Manager.Checks.Crafting.HelpDesc',
            'The crafting check is shaped by the system resolution mode: simple authors a pass/fail check, routed authors outcome tiers, and progressive requires a check. Alchemy is driven by its check mode — none has no check, simple authors a mandatory pass/fail check, and tiered authors a mandatory routed check.'
          )
        }
      ],
      links: [
        {
          href: `${DOCS_BASE}/crafting-checks`,
          label: text('FABRICATE.Admin.Manager.Checks.Crafting.Docs', 'Crafting checks docs'),
          icon: 'fas fa-book-open'
        },
        quickstartLink
      ]
    },
    salvage: {
      icon: 'fas fa-recycle',
      title: text('FABRICATE.Admin.Manager.Checks.Salvage.HelpTitle', 'About salvage checks'),
      items: [
        {
          text: text(
            'FABRICATE.Admin.Manager.Checks.Salvage.HelpDesc',
            'The salvage check is shaped by the salvage resolution mode. Simple mode makes it optional; routed and progressive modes require it.'
          )
        }
      ],
      links: [
        {
          href: `${DOCS_BASE}/salvage`,
          label: text('FABRICATE.Admin.Manager.Checks.Salvage.Docs', 'Salvage docs'),
          icon: 'fas fa-book-open'
        },
        quickstartLink
      ]
    },
    gathering: {
      icon: 'fas fa-seedling',
      title: text('FABRICATE.Admin.Manager.Checks.Gathering.HelpTitle', 'About gathering checks'),
      items: [
        {
          text: text(
            'FABRICATE.Admin.Manager.Checks.Gathering.HelpDesc',
            'The gathering check is shaped by the task resolution mode. In d100 mode it is the fixed d100 roll; progressive and routed modes let you define it.'
          )
        }
      ],
      links: [
        {
          href: `${DOCS_BASE}/gathering-environments`,
          label: text('FABRICATE.Admin.Manager.Checks.Gathering.Docs', 'Gathering docs'),
          icon: 'fas fa-book-open'
        },
        quickstartLink
      ]
    }
  };

  const menu = $derived(MENUS[activeTab] || MENUS.crafting);
</script>

<aside class="manager-inspector manager-environment-inspector" aria-label={text('FABRICATE.Admin.Manager.Checks.Menu.Label', 'Checks context menu')}>
  {#if activation}
    <section class="manager-inspector-card" data-checks-active={activeTab}>
      <h3 class="manager-card-title">{activeTitle}</h3>
      {#if showActiveToggle}
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

  <ExplainerCard
    icon={menu.icon}
    title={menu.title}
    items={menu.items}
    links={menu.links}
    dataAttr="data-checks-help"
    dataValue={activeTab}
  />
</aside>
