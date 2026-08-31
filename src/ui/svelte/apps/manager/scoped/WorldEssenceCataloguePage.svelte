<!-- Svelte 5 runes mode -->
<!--
  The world ESSENCE CATALOGUE (issue 1372, epic 1357). One definition per quality — name, icon,
  colour, description — and nothing about what an essence DOES, which is a per-system rule.

  It composes `EntityCatalogueShell` (issue 1380) and supplies the three things the shell leaves
  to a lane: the row meta run, the inspector body below the shell's own two regions, and the
  create affordance.

  ── AN ESSENCE HAS NO SOURCE ITEM, AND THAT IS STRUCTURAL ─────────────────────────────────────
  `src/migration/worldScopeEntityGrouping.js` lifts exactly `name`, `icon`, `colorToken` and
  `description` for an essence, against a component's and a tool's `originItemUuid`,
  `registeredItemUuid` and `aliasItemUuids`. So this screen renders NO source badge, NO source
  column, NO source filter, NO source sort key and NO `<img>`: the identity is a Font Awesome
  GLYPH plus a colour token. The shell reads that from `scope.sourceLinked` and `scope.hasColorToken`
  rather than from a test of the entity type here, which is why nothing below mentions either.

  ── THE PER-SYSTEM INDICATOR HAS THREE STATES, NOT TWO ────────────────────────────────────────
  Not a member / a member that is disabled / a member that is enabled. `enabled: false` KEEPS the
  membership record and its overrides, so "disabled" and "absent" are different authored states
  with different repairs — a toggle for one and an Add for the other. `essenceScoped.js` names the
  three once and this screen reads them from there.

  ── NO PAGE TITLE ─────────────────────────────────────────────────────────────────────────────
  The manager shell's header already renders this screen's `<h1>` and its subtitle from
  `viewTitle`. `ScopedPlaceholderPage` records what a second one costs: the first frame of a world
  page showed the screen title twice and the subtitle three times.

  ── CREATE TAKES A NAME, AND NOTHING ELSE ─────────────────────────────────────────────────────
  A component or a tool world entity is created by LINKING an Item; an essence is created from
  nothing, so there is no drop target to presuppose and the header carries a name field and a
  button. The id is slugged from the name by `mintEssenceId` — never `Math.random()`, which is a
  SonarCloud vulnerability, and never `foundry.utils.randomID()`, which a pure leaf cannot reach.

  Declared props are EXACTLY the four the bundle supplies plus the one static attribute the call
  site passes. `CraftingSystemManagerRoot.svelte` records why that matters: a name declared here
  that the site does not pass falls THROUGH to `{...essenceScopeProps}`, and every reader of it
  becomes a live subscriber to a bundle that is a new object on every world-corpus publish.

  Props:
   - scope / actions / systems: from `essenceScopeProps`.
   - onOpenEntry(entityId): into this essence's world entry editor.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import EntityCatalogueShell from './EntityCatalogueShell.svelte';
  import StatusPill from '../../../components/StatusPill.svelte';
  import {
    essenceInheritLine,
    essenceSectionValueName,
    essenceSystemState,
    mintEssenceId,
  } from './essenceScoped.js';

  let { scope = null, actions = null, systems = [], onOpenEntry = () => {} } = $props();

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

  let draftName = $state('');
  let selectedId = $state('');
  let creating = $state(false);

  const title = $derived(text(TITLE_KEY, TITLE_FALLBACK));
  const entities = $derived(Array.isArray(scope?.entities) ? scope.entities : []);
  const canCreate = $derived(draftName.trim() !== '' && !creating);

  // The per-section one-line summary the shell renders under each inherit count. Without it a
  // count reads "Effect source · 3 inheriting" and never says WHAT three systems are inheriting.
  const sectionNotes = $derived(noteFor(entities.find((entity) => entity.id === selectedId)));

  /**
   * The world-default summary for the inspected entry, keyed by section.
   *
   * @param {object|undefined} entity
   * @returns {{[section: string]: string}}
   */
  function noteFor(entity) {
    const entry = (scope?.entries ?? []).find((candidate) => candidate.id === entity?.id) ?? null;
    const defaults = entry?.defaults ?? null;
    const notes = {};
    for (const section of scope?.sections ?? []) {
      const name = essenceSectionValueName(defaults?.[section]);
      notes[section] = name
        ? format('FABRICATE.Admin.Manager.Scoped.Essence.DefaultIs', 'World default: {name}', {
            name,
          })
        : text('FABRICATE.Admin.Manager.Scoped.Essence.DefaultUnset', 'No world default set');
    }
    return notes;
  }

  function systemLabel(row) {
    const named = typeof row?.systemName === 'string' ? row.systemName.trim() : '';
    return named || String(row?.systemId ?? '');
  }

  /**
   * One state's glyph. An early-return chain rather than a nested ternary, which SonarCloud
   * reports as S3358 in a file it indexes.
   *
   * @param {string} state one of `ESSENCE_SYSTEM_STATES`.
   * @returns {string}
   */
  function stateIcon(state) {
    if (state === 'absent') return 'fas fa-circle-minus';
    if (state === 'disabled') return 'fas fa-circle-pause';
    return 'fas fa-circle-check';
  }

  const stateLabels = $derived({
    absent: text('FABRICATE.Admin.Manager.Scoped.Essence.StateAbsent', 'Not in this system'),
    disabled: text('FABRICATE.Admin.Manager.Scoped.Essence.StateDisabled', 'Disabled here'),
    enabled: text('FABRICATE.Admin.Manager.Scoped.Essence.StateEnabled', 'Enabled here'),
  });

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

  async function createEssence() {
    const name = draftName.trim();
    if (!name || creating) return;
    creating = true;
    try {
      const id = mintEssenceId(name, entities);
      const created = await actions?.createEntity?.({
        id,
        name,
        icon: PAGE_ICON,
        colorToken: '',
        description: '',
      });
      if (created !== false) draftName = '';
    } finally {
      creating = false;
    }
  }
</script>

<main class="manager-main" data-scoped-page="world-essences" aria-label={title}>
  <!--
    ONE CHILD OF `<main>`, WITH ITS OWN TWO-ROW GRID.

    `.manager-main` is `display: grid` with a single `minmax(0, 1fr)` row for a full-width world
    route, so TWO children land in the same grid area and paint over each other: measured in the
    View Lab, the create field's label sat under the shell's search box and the create button
    landed in the inspector column. `styles/fabricate.css` is closed to this lane by
    `### GM World Scoped Entity Routes` requirement 7, so the row split belongs here — and it
    belongs here anyway, because it is this page's composition rather than the route's.
  -->
  <div class="manager-scoped-essence-page">
    <!-- The CREATE affordance, and the only chrome this page owns above the shell. It is a name
         field rather than a bare button because `createEntity` takes an identity and refuses a
         duplicate id silently: a button that minted "New essence" twice would do nothing the
         second time and say nothing about why. -->
    <section class="manager-scoped-essence-create" data-scoped-essence-create>
      <label class="manager-scoped-essence-create-field">
        <span class="manager-scoped-essence-create-label">
          {text('FABRICATE.Admin.Manager.Scoped.Essence.NewName', 'New essence name')}
        </span>
        <input
          type="text"
          value={draftName}
          data-scoped-essence-new-name
          placeholder={text('FABRICATE.Admin.Manager.Scoped.Essence.NewPlaceholder', 'Ember')}
          oninput={(event) => (draftName = event.currentTarget.value)}
        />
      </label>
      <ManagerButton
        role="primary"
        disabled={!canCreate}
        data-scoped-essence-create-action
        onclick={createEssence}
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Scoped.Essence.New', 'New essence')}</span>
      </ManagerButton>
    </section>

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
        'Name one above to create it. Every crafting system that adopts it shares this definition.'
      )}
      {sectionNotes}
      bind:selectedId
      onSelect={(entityId) => (selectedId = entityId)}
      onOpenEntry={(entityId) => onOpenEntry(entityId)}
      rowMeta={essenceRowMeta}
      inspectorBody={essenceInspector}
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
  <span class="manager-scoped-essence-states" role="list">
    {#each entry.systems ?? [] as row (row.systemId)}
      {@const state = essenceSystemState(row)}
      <span
        role="listitem"
        class="manager-scoped-essence-state"
        data-scoped-system-state={state}
        data-scoped-system={row.systemId}
        title={`${systemLabel(row)} — ${stateLabels[state]}`}
      >
        <i class={stateIcon(state)} aria-hidden="true"></i>
      </span>
    {/each}
  </span>
{/snippet}

<!--
  The inspector body BELOW the shell's own inherit counts and membership rows: the world-default
  readouts and the deep link into the entry editor, which is where they are edited.
-->
{#snippet essenceInspector(entry)}
  <div class="manager-scoped-essence-defaults" data-scoped-essence-defaults={entry.id}>
    {#each scope?.sections ?? [] as section (section)}
      <p class="manager-muted" data-scoped-essence-default={section}>
        {essenceInheritLine(entry, section, format)}
      </p>
    {/each}
    <ManagerButton data-scoped-essence-open-entry onclick={() => onOpenEntry(entry.id)}>
      <i class="fas fa-pen" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Scoped.Essence.OpenEntry', 'Edit this definition')}</span
      >
    </ManagerButton>
  </div>
{/snippet}

<style>
  /* STATIC class names, so Svelte can prove each selector is used and `lint:svelte:warnings`
     stays at zero. `styles/fabricate.css` is closed to this lane by `### GM World Scoped Entity
     Routes` requirement 7, so every rule this screen owns lives here. */
  .manager-scoped-essence-page {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--fab-space-2);
    min-width: 0;
    min-height: 0;
  }

  .manager-scoped-essence-create {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
    align-items: flex-end;
    min-width: 0;
  }

  .manager-scoped-essence-create-field {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    min-width: 0;
    flex: 1 1 14rem;
  }

  .manager-scoped-essence-create-label {
    color: var(--fab-mv2-text);
    font-size: 0.72rem;
    font-weight: 600;
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

  .manager-scoped-essence-rollup {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
  }

  /*
     ONE PIP PER SYSTEM, not a list of system names.

     This shipped rendering every member system's full name inline. At six systems that wrapped
     to two lines and roughly tripled the row height, which is what the capture frame showed: a
     row of mostly empty space with a name list under it. The prototype's row carries COMPACT
     STATS instead — components, recipes, and systems as `{n}/{total}` — and puts the per-system
     detail in the inspector, which is exactly where this shell already renders membership rows.

     The state and the system are still on each pip as `data-scoped-system-state` and
     `data-scoped-system`, and the accessible name is still the full `system — state` pair in
     `title`, so nothing that could read the roster before has lost it.
  */
  .manager-scoped-essence-states {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-2xs);
    min-width: 0;
  }

  /* THREE STATES, THREE CHANNELS — colour, glyph and the visible system name with a title
     attribute. A state told by colour alone does not survive greyscale, and this strip is the
     only place a GM sees all three at once. */
  .manager-scoped-essence-state {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-chip);
    color: var(--fab-text-muted);
    font-size: 0.58rem;
  }

  .manager-scoped-essence-state[data-scoped-system-state='enabled'] {
    color: var(--fab-success);
  }

  .manager-scoped-essence-state[data-scoped-system-state='disabled'] {
    color: var(--fab-warning);
  }

  .manager-scoped-essence-state-name {
    overflow-wrap: break-word;
  }

  .manager-scoped-essence-defaults {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    min-width: 0;
  }
</style>
