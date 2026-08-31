<!-- Svelte 5 runes mode -->
<!--
  The world ESSENCE CATALOGUE (issue 1372, epic 1357). One definition per quality — name, icon,
  colour, description — and nothing about what an essence DOES, which is a per-system rule.

  It composes `EntityCatalogueShell` (issue 1380) and supplies what the shell leaves to a lane:
  the row meta run, the world-default card copy, the enabled roll-up card, and the inspector's
  pinned foot action.

  ── AN ESSENCE HAS NO SOURCE ITEM, AND THAT IS STRUCTURAL ─────────────────────────────────────
  `src/migration/worldScopeEntityGrouping.js` lifts exactly `name`, `icon`, `colorToken` and
  `description` for an essence, against a component's and a tool's `originItemUuid`,
  `registeredItemUuid` and `aliasItemUuids`. So this screen renders NO source badge, NO source
  column, NO source filter, NO source sort key and NO `<img>`: the identity is a Font Awesome
  GLYPH plus a colour token. The shell reads that from `scope.sourceLinked` and `scope.hasColorToken`
  rather than from a test of the entity type here, which is why nothing below mentions either.

  ── THE PER-SYSTEM INDICATOR HAS THREE STATES, AND THE ROW SHOWS NONE OF THEM ─────────────────
  Not a member / a member that is disabled / a member that is enabled. `enabled: false` KEEPS the
  membership record and its overrides, so "disabled" and "absent" are different authored states
  with different repairs — a toggle for one and an Add for the other.

  The ROW states only the ROLL-UP of those three, as the prototype's single pill (`Enabled`,
  `Disabled`, `11 on / 2 off`). The per-system detail is the INSPECTOR's, one named row per
  system with the controls that change it — see the pip-strip note in `<style>` for why the row's
  own dot strip is gone.

  ── NO PAGE TITLE ─────────────────────────────────────────────────────────────────────────────
  The manager shell's header already renders this screen's `<h1>` and its subtitle from
  `viewTitle`. `ScopedPlaceholderPage` records what a second one costs: the first frame of a world
  page showed the screen title twice and the subtitle three times.

  ── CREATE IS THE PAGE HEADER'S, AND THIS PAGE OWNS NONE OF IT ────────────────────────────────
  The prototype puts one `+ New essence` button in the header band, right-aligned on the line that
  carries the title and subtitle (`essences.png`). This page shipped it as a full-width band above
  the list carrying a label, a text input and the button — about 60px of chrome that read as a form
  a GM had to fill in before anything else on the screen was available.

  The header band belongs to `CraftingSystemManagerRoot.svelte`, which renders this screen's `<h1>`
  and subtitle, so the affordance moved there and nothing about it is left here. The id is still
  slugged by `mintEssenceId` — never `Math.random()`, which is a SonarCloud vulnerability, and
  never `foundry.utils.randomID()`, which a pure leaf cannot reach.

  Declared props are EXACTLY the four the bundle supplies plus the one static attribute the call
  site passes. `CraftingSystemManagerRoot.svelte` records why that matters: a name declared here
  that the site does not pass falls THROUGH to `{...essenceScopeProps}`, and every reader of it
  becomes a live subscriber to a bundle that is a new object on every world-corpus publish.

  Props:
   - scope / actions / systems: from `essenceScopeProps`.
   - onOpenEntry(entityId): into this essence's world entry editor.
   - onOpenSystemRules(entityId, systemId): from an inspector system row into THAT system's
     own essence rules. It is the shell's second gateway seam: selecting a crafting system and
     changing route are both the manager shell's, and no page can do either.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import InspectorActionButton from '../InspectorActionButton.svelte';
  import EntityCatalogueShell from './EntityCatalogueShell.svelte';
  import StatusPill from '../../../components/StatusPill.svelte';
  import {
    essenceColourCaption,
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
  } = $props();

  // The route hook, the glyph and the screen name, declared as constants rather than as props on
  // a shared placeholder body. `manager-contract.test.js` reads all four off this file to pair
  // the page against the title `viewTitle` renders for the same route — the SWAP DETECTOR, which
  // is the one thing nothing else can see: a page titled after its sibling renders perfectly and
  // publishes as a frame.
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

  // The inspected entry, resolved once. Three derivations read it — the card titles, the card
  // notes and the enabled roll-up — and each one walking `scope.entries` itself would make a
  // selection change three linear scans of the corpus instead of one.
  const inspectedEntry = $derived(
    (scope?.entries ?? []).find((candidate) => candidate.id === selectedId) ?? null
  );

  /**
   * The GLYPH each world-default card leads with, keyed by section.
   *
   * The row's own capability chips already use these two glyphs for these two meanings, so a wand
   * means "active effects" and `</>` means "macro" everywhere on this screen rather than only
   * where a chip happens to render.
   */
  const sectionIcons = Object.freeze({
    effectSource: 'fas fa-wand-magic-sparkles',
    macro: 'fas fa-code',
  });

  // ── THE CARD TITLES NAME THE VALUE, NOT THE SECTION ─────────────────────────────────────────
  // The prototype's world-default cards read `Effects from Ember Brand` and `Macro Ember Infusion`
  // (`essences.png`): the title IS what the default resolves to. A card titled `Effect source`
  // says which row it is and nothing about what a GM would be changing by opening it.
  const sectionTitles = $derived(titlesFor(inspectedEntry));

  // The per-section one-line summary the shell renders under each card. It is the INHERIT
  // ARITHMETIC — `7 of 13 systems inherit this default` — because the value has moved up into
  // the title and the count is what remains to be said.
  const sectionNotes = $derived(notesFor(inspectedEntry));

  // The prototype's THIRD card, which is not a world default at all: the membership `enabled`
  // roll-up. It has no section and no inherit count, so it cannot come from the section loop.
  const extraCards = $derived(enabledCardFor(inspectedEntry));

  /**
   * The world-default card TITLES for the inspected entry, keyed by section.
   *
   * @param {object|null} entry the projected world entry.
   * @returns {{[section: string]: string}}
   */
  function titlesFor(entry) {
    const defaults = entry?.defaults ?? null;
    const titles = {};
    for (const section of scope?.sections ?? []) {
      const name = essenceSectionValueName(defaults?.[section]);
      titles[section] = name ? sectionValuePhrase(section, name) : sectionUnsetPhrase(section);
    }
    return titles;
  }

  /**
   * `Effects from {name}` / `Macro {name}` — the prototype's two phrasings.
   *
   * An early-return chain rather than a nested ternary, which SonarCloud reports as S3358.
   *
   * @param {string} section
   * @param {string} name the resolved value's display name.
   * @returns {string}
   */
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
   * What a card says when its section has NO world default.
   *
   * IT IS NOT `No world default set` FOR BOTH. The two sections fail differently and a GM repairs
   * them differently: an unset effect source means nothing transfers, an unset macro means nothing
   * runs, and one sentence for both says neither.
   *
   * @param {string} section
   * @returns {string}
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

  /**
   * The world-default inherit line for the inspected entry, keyed by section.
   *
   * @param {object|null} entry
   * @returns {{[section: string]: string}}
   */
  function notesFor(entry) {
    const notes = {};
    for (const section of scope?.sections ?? []) {
      notes[section] = essenceInheritLine(entry, section, format);
    }
    return notes;
  }

  /**
   * The enabled roll-up card, or none when no system holds this essence.
   *
   * `0 of 0 systems have it enabled` under an entry no system uses is arithmetically true and
   * says nothing; the empty case is already stated by the inherit lines above it.
   *
   * @param {object|null} entry
   * @returns {Array<{id: string, icon: string, title: string, note: string}>}
   */
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
   * The ROLL-UP of one essence's per-system states, as the prototype's single row pill.
   *
   * Four outcomes, and the fourth is the one a pair of states cannot express: an essence that is
   * ON in some member systems and OFF in others. Collapsing that to either word tells a GM the
   * opposite of the truth for half its systems, so it renders as the split count instead.
   *
   * An EARLY-RETURN CHAIN rather than a nested ternary, which SonarCloud reports as S3358 in a
   * file it indexes.
   *
   * @param {{systems?: Array<{member?: boolean, enabled?: boolean}>}} entry
   * @returns {{tone: string, icon: string, label: string}}
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
  <!--
    ONE CHILD OF `<main>`, AND NOW ONE ROW.

    `.manager-main` is `display: grid` with a single `minmax(0, 1fr)` row for a full-width world
    route, so two children land in the same grid area and paint over each other. That is why this
    wrapper exists. It used to split into TWO rows because the page carried a create band above
    the shell; the create affordance is now the page header's, so the wrapper is one row again and
    the list starts at the top of the main column exactly as the prototype draws it
    (`essences.png`).
  -->
  <div class="manager-scoped-essence-page">
    <EntityCatalogueShell
      {scope}
      {actions}
      {systems}
      hookValue={PAGE_ID}
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
      bind:selectedId
      onSelect={(entityId) => (selectedId = entityId)}
      onOpenEntry={(entityId) => onOpenEntry(entityId)}
      onOpenSystemRules={(entityId, systemId) => onOpenSystemRules(entityId, systemId)}
      rowMeta={essenceRowMeta}
    />
  </div>
</main>

<!--
  The row's meta run: the three prototype stats, the membership roll-up, and the three-state
  per-system strip.

  ── THE IDENTITY GLYPH IS NOT DRAWN HERE, AND THAT IS A CORRECTION ────────────────────────────
  It was. The row rendered a SECOND tinted glyph in the meta run beside the stats, on the reading
  that the frame's medallion is a shared thumbnail and this screen needed its own hook to prove an
  essence identity is a glyph rather than an image. Both halves of that were wrong. The medallion
  reads `entry.icon` and `entry.colorToken` and publishes `data-medallion="glyph"` and
  `data-medallion-tint` itself, so the proof was already on the screen — and the extra glyph landed
  immediately left of the Components stat, where it read as a stat icon rather than as the row's
  identity. The prototype's row carries ONE chip (`proto:3172`); this one carried two.

  The criterion-4 assertion and the capture case's `expectContained` both moved onto
  `[data-scoped-list-row] [data-medallion="glyph"]`, which is a STRICTER measurement of the same
  claim: it is the element a GM actually sees, not a hook rendered beside it.
-->
{#snippet essenceRowMeta(entry)}
  <!--
    THE PROTOTYPE'S THREE ROW STATS: components, recipes, and systems as `{n}/{total}` — a right
    aligned value over a tracked micro-label, at `min-width: 3.25rem` so three of them form a
    column across the list rather than shuffling with each row's digits.

    The two USAGE counts are world-wide, across every crafting system, and they are read from
    `entry.componentCount` / `entry.recipeCount` — published by the world-scope projection. They
    fall back to `0` rather than being hidden when absent: a stat that vanishes changes the row's
    geometry, and a row that is a different shape depending on whether a count arrived is worse
    than one that says zero.
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
    <StatusPill tone={rollup.tone} icon={rollup.icon} label={rollup.label} />
  </span>
{/snippet}

<!--
  THE COLOUR CAPTION under the inspected name: the token's display name and the value this theme
  resolves it to. See `essenceColourCaption` for why the hex is READ from the cascade rather than
  written into the source, and why it is read at the theme root.
-->
{#snippet essenceInspectorCaption(entry)}
  {essenceColourCaption(entry?.entity?.colorToken)}
{/snippet}

<!--
  THE INSPECTOR'S ONE PRIMARY ACTION, PINNED TO ITS FOOT.

  The prototype ends the panel with a full-width `Open definition` button below a divider
  (`essences.png`). It shipped as a default-role button INSIDE the scrolling body, under the
  world-default readouts, which put the panel's only navigation below a system list of arbitrary
  length — reachable in the lab's six-system corpus and not in a world with thirty.

  ── IT IS AN `InspectorActionButton`, NOT A `ManagerButton`, AND THAT IS THE COLOUR FIX ────────
  The prototype paints it the peach ACCENT. `ManagerButton role="primary"` emits
  `.manager-button.is-primary`, which `styles/fabricate.css` declares as the SUCCESS family — the
  green Save treatment — and that stylesheet is closed to this lane, so no prop on that primitive
  can reach the accent.

  `InspectorActionButton` is the shipped answer and it was extracted for exactly this: its own
  header records that "the design's primary is the accent", that the recipe and component
  inspectors already paint their Edit in it, and that "the essence rail's green Edit was the odd
  one". This panel's `Open definition` is that same control — the one loud verb at the foot of an
  inspector rail — so it takes the same primitive and the same `tone="primary"` rather than a new
  role class in a sheet this lane may not open.
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
  /* STATIC class names, so Svelte can prove each selector is used and `lint:svelte:warnings`
     stays at zero. `styles/fabricate.css` is closed to this lane by `### GM World Scoped Entity
     Routes` requirement 7, so every rule this screen owns lives here. */
  .manager-scoped-essence-page {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
  }

  /* THE STAT COLUMN. A fixed `min-width` on each cell is what turns three per-row numbers into
     three readable columns down the list; without it a row with a three-digit component count is
     wider than its neighbours and the labels stop lining up. `tabular-nums` holds the digits on
     one advance so the same is true within a cell. */
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

  /*
     THE PER-SYSTEM PIP STRIP IS DELETED, AND THAT IS A CORRECTION.

     The row drew one coloured dot per crafting system — six of them in the lab corpus, about 90px
     of a 1280px row — and the prototype's row draws NONE (`essences.png`). Compared as markup that
     read as extra information for free; compared as images it is the widest thing in the row after
     the identity block, and it is what squeezed the description into an ellipsis two words in.

     Nothing is lost, because nothing on the strip was legible anyway: a dot's system and state
     were reachable only through a `title` a GM has to hover one of six identical circles to read.
     The same three states are now stated in WORDS in the inspector, one row per system, with the
     Add / enable / Remove controls that act on them — which is where the prototype puts them and
     where a GM can do something about what they say.
  */
  .manager-scoped-essence-rollup {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
  }
</style>
