<!-- Svelte 5 runes mode -->
<!--
  The world ESSENCE CATALOGUE (issue 1372, epic 1357): one definition per quality — name, icon,
  colour, description — and nothing about what an essence DOES, which is a per-system rule. It
  composes `EntityCatalogueShell` and supplies the row meta run, the world-default card copy, the
  enabled roll-up card and the inspector's pinned foot action.
  AN ESSENCE HAS NO SOURCE ITEM, and that is structural; the shell reads it from
  `scope.sourceLinked` and `scope.hasColorToken`, never from a test of the entity type here. The
  per-system indicator has THREE states and the ROW states only their ROLL-UP. Declared props are
  EXACTLY the five the call site passes: a name declared here that it does not pass falls through
  to the bundle spread and subscribes every reader to an object new on every publish.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { statusChipTone } from '../../../util/statusChipTone.js';
  import InspectorActionButton from '../InspectorActionButton.svelte';
  import EntityCatalogueShell from './EntityCatalogueShell.svelte';
  import Chip from '../../../components/Chip.svelte';
  import {
    essenceColourCaption,
    essenceEffectSourceReferent,
    essenceInheritLine,
    essenceSectionValueName,
    essenceShortValueName,
  } from './essenceScoped.js';

  let {
    scope = null,
    actions = null,
    systems = [],
    onOpenEntry = () => {},
    onOpenSystemRules = () => {},
    // The list's lifted view-state (issue 1438), owned by the manager root, which unmounts this page.
    browserState = $bindable(null),
  } = $props();

  // The route hook, glyph and screen name as constants; `manager-contract.test.js` pairs them
  // against `viewTitle`'s own title, which is the SWAP DETECTOR nothing else can see.
  const PAGE_ID = 'world-essences';
  const PAGE_ICON = 'fas fa-flask-vial';
  const TITLE_KEY = 'FABRICATE.Admin.Manager.Scoped.EssenceCatalogueTitle';
  const TITLE_FALLBACK = 'Essence Catalogue';

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function format(key, fallback, replacements) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(replacements ?? {})) {
      result = result.replaceAll(`{${token}}`, String(value));
    }
    return result;
  }

  let selectedId = $state('');

  const title = $derived(text(TITLE_KEY, TITLE_FALLBACK));

  // The inspected entry, resolved ONCE: three derivations read it, and three corpus walks would
  // make one selection change three linear scans.
  const inspectedEntry = $derived(
    (scope?.entries ?? []).find((candidate) => candidate.id === selectedId) ?? null
  );

  /** The glyph each world-default card leads with; the row's chips use these two meanings too. */
  const sectionIcons = Object.freeze({
    effectSource: 'fas fa-wand-magic-sparkles',
    macro: 'fas fa-code',
  });

  // The per-section summary under each card: the INHERIT ARITHMETIC, the value having moved up.
  const sectionTitles = $derived(titlesFor(inspectedEntry));

  // The per-section summary under each card: the INHERIT ARITHMETIC, since the value has moved
  // up into the title and the count is what remains to be said.
  const sectionNotes = $derived(notesFor(inspectedEntry));

  // The prototype's THIRD card, which is no world default: the membership `enabled` roll-up.
  const extraCards = $derived(enabledCardFor(inspectedEntry));

  /** The world-default card TITLES for the inspected entry, keyed by section. */
  function titlesFor(entry) {
    const defaults = entry?.defaults ?? null;
    const titles = {};
    for (const section of scope?.sections ?? []) {
      // `effectSource` GOES THROUGH ITS OWN READER: it is the one section stored as a BLOCK, so
      // the generic reader answered `''` over a default the inherit line was already counting.
      const name =
        section === 'effectSource'
          ? essenceEffectSourceReferent(defaults?.effectSource)
          : essenceSectionValueName(defaults?.[section]);
      titles[section] = name ? sectionValuePhrase(section, name) : sectionUnsetPhrase(section);
    }
    return titles;
  }

  /** `Effects from {name}` / `Macro {name}`; an early-return chain, not a nested ternary (S3358). */
  function sectionValuePhrase(section, name) {
    if (section === 'effectSource') {
      return format('FABRICATE.Admin.Manager.Scoped.Essence.CardEffects', 'Effects from {name}', {
        name: essenceShortValueName(name),
      });
    }
    if (section === 'macro') {
      return format('FABRICATE.Admin.Manager.Scoped.Essence.CardMacro', 'Macro {name}', {
        name: essenceShortValueName(name),
      });
    }
    return name;
  }

  /**
   * What a card says when its section has NO world default. NOT one sentence for both: an unset
   * effect source means nothing transfers and an unset macro means nothing runs.
   */
  function sectionUnsetPhrase(section) {
    if (section === 'effectSource') {
      return text(
        'FABRICATE.Admin.Manager.Scoped.Essence.CardEffectsUnset',
        'No default effect source'
      );
    }
    if (section === 'macro') {
      return text('FABRICATE.Admin.Manager.Scoped.Essence.CardMacroUnset', 'No default macro');
    }
    return text('FABRICATE.Admin.Manager.Scoped.Essence.DefaultUnset', 'No world default set');
  }

  /** The world-default inherit line for the inspected entry, keyed by section. */
  function notesFor(entry) {
    const notes = {};
    for (const section of scope?.sections ?? []) {
      notes[section] = essenceInheritLine(entry, section, format);
    }
    return notes;
  }

  /** The enabled roll-up card, or none: `0 of 0 systems have it enabled` is true and says nothing. */
  function enabledCardFor(entry) {
    const members = (entry?.systems ?? []).filter((row) => row.member === true);
    if (members.length === 0) return [];
    const on = members.filter((row) => row.enabled === true).length;
    return [
      {
        id: 'enabled',
        icon: 'fas fa-layer-group',
        title: format(
          'FABRICATE.Admin.Manager.Scoped.Essence.CardEnabled',
          '{on} of {members} systems have it enabled',
          { on, members: members.length }
        ),
        note: text(
          'FABRICATE.Admin.Manager.Scoped.Essence.CardEnabledHint',
          'Disabled rules still match ingredients, but run nothing on craft.'
        ),
      },
    ];
  }

  /**
   * The ROLL-UP of one essence's per-system states, as the prototype's single row pill. The
   * fourth outcome — ON in some member systems and OFF in others — renders as the split count,
   * because either word would describe it backwards for half of them. Early returns, not S3358.
   */
  function rollupState(entry) {
    const members = (entry?.systems ?? []).filter((row) => row.member === true);
    const on = members.filter((row) => row.enabled === true).length;
    if (members.length === 0) {
      return {
        tone: 'subtle',
        icon: 'fas fa-circle-minus',
        label: text('FABRICATE.Admin.Manager.Scoped.Essence.RollupUnused', 'Unused'),
      };
    }
    if (on === members.length) {
      return {
        tone: 'success',
        icon: 'fas fa-circle-check',
        label: text('FABRICATE.Admin.Manager.Scoped.Essence.RollupEnabled', 'Enabled'),
      };
    }
    if (on === 0) {
      return {
        tone: 'subtle',
        icon: 'fas fa-circle-pause',
        label: text('FABRICATE.Admin.Manager.Scoped.Essence.RollupDisabled', 'Disabled'),
      };
    }
    return {
      tone: 'warning',
      icon: 'fas fa-circle-half-stroke',
      label: format('FABRICATE.Admin.Manager.Scoped.Essence.RollupSplit', '{on} on / {off} off', {
        on,
        off: members.length - on,
      }),
    };
  }
</script>

<main class="manager-main" data-scoped-page="world-essences" aria-label={title}>
  <!-- ONE CHILD OF `<main>`, AND NOW ONE ROW: `.manager-main` is a grid with a single
    `minmax(0, 1fr)` row, so two children land in the same area and paint over each other. -->
  <div class="manager-scoped-essence-page">
    <EntityCatalogueShell
      {scope}
      {actions}
      {systems}
      hookValue={PAGE_ID}
      bind:browserState
      {title}
      subtitle={text(
        'FABRICATE.Admin.Manager.Scoped.Essence.InspectorResting',
        'Choose an essence to see which systems hold it and what each one inherits.'
      )}
      icon={PAGE_ICON}
      emptyTitle={text(
        'FABRICATE.Admin.Manager.Scoped.Essence.EmptyTitle',
        'No world essences yet'
      )}
      emptyHint={text(
        'FABRICATE.Admin.Manager.Scoped.Essence.EmptyHint',
        'Create one from the page header. Every crafting system that adopts it shares this definition.'
      )}
      {sectionNotes}
      {sectionTitles}
      {sectionIcons}
      {extraCards}
      inspectorKicker={text(
        'FABRICATE.Admin.Manager.Scoped.Essence.InspectorKicker',
        'World definition'
      )}
      countUnit={text('FABRICATE.Admin.Manager.Scoped.Essence.CountUnit', 'essences')}
      membershipFilter={false}
      selectAllLabel={text('FABRICATE.Admin.Manager.Scoped.Essence.SelectAllShort', 'All')}
      searchPlaceholder={text(
        'FABRICATE.Admin.Manager.Scoped.Essence.SearchPlaceholder',
        'Search essences…'
      )}
      inspectorFoot={essenceInspectorFoot}
      inspectorCaption={essenceInspectorCaption}
      systemRowAction="navigate"
      bind:selectedId
      onSelect={(entityId) => (selectedId = entityId)}
      onOpenEntry={(entityId) => onOpenEntry(entityId)}
      onOpenSystemRules={(entityId, systemId) => onOpenSystemRules(entityId, systemId)}
      rowMeta={essenceRowMeta}
    />
  </div>
</main>

<!--
  The row's meta run: the three prototype stats, the membership roll-up, and the per-system strip.
  THE IDENTITY GLYPH IS NOT DRAWN HERE — the frame's medallion already publishes it, and a second
  one landed left of the Components stat, reading as a stat icon rather than as identity.
-->
{#snippet essenceRowMeta(entry)}
  <!--
    THE PROTOTYPE'S THREE ROW STATS, each a value over a micro-label at `min-width: 3.25rem`, so
    three form a column down the list. Both USAGE counts fall back to `0` rather than hiding.
  -->
  <span class="manager-scoped-essence-stats">
    <span class="manager-scoped-essence-stat" data-scoped-essence-stat="components">
      <span class="manager-scoped-essence-stat-value" data-scoped-essence-component-count={entry.id}
        >{Number(entry.componentCount) || 0}</span
      >
      <span class="manager-scoped-essence-stat-label"
        >{text('FABRICATE.Admin.Manager.Scoped.Essence.StatComponents', 'Components')}</span
      >
    </span>
    <span class="manager-scoped-essence-stat" data-scoped-essence-stat="recipes">
      <span class="manager-scoped-essence-stat-value" data-scoped-essence-recipe-count={entry.id}
        >{Number(entry.recipeCount) || 0}</span
      >
      <span class="manager-scoped-essence-stat-label"
        >{text('FABRICATE.Admin.Manager.Scoped.Essence.StatRecipes', 'Recipes')}</span
      >
    </span>
    <span class="manager-scoped-essence-stat" data-scoped-essence-stat="systems">
      <span
        class="manager-scoped-essence-stat-value"
        data-scoped-essence-membership-count={entry.id}
        title={format(
          'FABRICATE.Admin.Manager.Scoped.Essence.MemberCount',
          '{count} of {total} systems',
          { count: Number(entry.membershipCount) || 0, total: systems.length }
        )}>{Number(entry.membershipCount) || 0}/{systems.length}</span
      >
      <span class="manager-scoped-essence-stat-label"
        >{text('FABRICATE.Admin.Manager.Scoped.Essence.StatSystems', 'Systems')}</span
      >
    </span>
  </span>
  {@const rollup = rollupState(entry)}
  <span class="manager-scoped-essence-rollup" data-scoped-essence-rollup={entry.id}>
    <Chip tone={statusChipTone(rollup.tone)} icon={rollup.icon}>{rollup.label}</Chip>
  </span>
{/snippet}

<!-- THE COLOUR CAPTION under the inspected name; see `essenceColourCaption` for why the hex is
  READ from the cascade at the theme root rather than written into the source. -->
{#snippet essenceInspectorCaption(entry)}
  {essenceColourCaption(entry?.entity?.colorToken)}
{/snippet}

<!--
  THE INSPECTOR'S ONE PRIMARY ACTION, PINNED TO ITS FOOT rather than left below a system list of
  arbitrary length. An `InspectorActionButton`, NOT a `ManagerButton`: `role="primary"` emits the
  SUCCESS family, and the sheet declaring it is closed to this lane.
-->
{#snippet essenceInspectorFoot(entry)}
  <InspectorActionButton
    tone="primary"
    icon="fas fa-arrow-up-right-from-square"
    label={text('FABRICATE.Admin.Manager.Scoped.Essence.OpenEntry', 'Open definition')}
    data-scoped-essence-open-entry
    onClick={() => onOpenEntry(entry.id)}
  />
{/snippet}

<style>
  /* STATIC class names, so `lint:svelte:warnings` stays at zero. `styles/fabricate.css` is closed
     to this lane by `### GM World Scoped Entity Routes` requirement 7. */
  .manager-scoped-essence-page {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
  }

  /* THE STAT COLUMN: a fixed `min-width` per cell turns three per-row numbers into three readable
     columns down the list, and `tabular-nums` holds the digits on one advance within a cell. */
  .manager-scoped-essence-stats {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--fab-space-2);
  }

  .manager-scoped-essence-stat {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
    min-width: 2.6rem;
    text-align: right;
  }

  .manager-scoped-essence-stat-value {
    color: var(--fab-text-secondary);
    font-family: var(--fab-font-mono);
    font-size: 0.72rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .manager-scoped-essence-stat-label {
    color: var(--fab-text-subtle);
    font-size: 0.46rem;
    font-weight: 600;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  /* THE PER-SYSTEM PIP STRIP IS DELETED, AND THAT IS A CORRECTION: the prototype draws none, and
     it was what squeezed the description into an ellipsis two words in. Nothing is lost — a dot's
     state was reachable only through a `title`, and the inspector now states all three in words. */
  .manager-scoped-essence-rollup {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
  }
</style>
