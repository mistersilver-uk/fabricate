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

  function glyphOf(entry) {
    const icon = entry?.entity?.icon;
    return typeof icon === 'string' && icon ? icon : PAGE_ICON;
  }

  function tintOf(entry) {
    const token = entry?.entity?.colorToken;
    return typeof token === 'string' && token.trim() ? token.trim() : '';
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
  The row's meta run: the identity GLYPH with its colour, the membership count, and the
  three-state per-system strip. The glyph is rendered HERE and not left to the frame's medallion
  because the medallion is the frame's identity thumbnail for all three entity types, and this is
  the hook that says an essence identity is a glyph rather than an image — the assertion that
  proves "no `<img>` anywhere on this screen" is a measurement rather than a sentence about a
  selector that matches nothing.
-->
{#snippet essenceRowMeta(entry)}
  <span
    class="manager-scoped-essence-glyph"
    data-scoped-essence-glyph={entry.id}
    data-scoped-essence-colour={tintOf(entry) || 'unset'}
  >
    <i class={glyphOf(entry)} aria-hidden="true"></i>
  </span>
  <span class="manager-scoped-essence-count" data-scoped-essence-membership-count={entry.id}>
    {format('FABRICATE.Admin.Manager.Scoped.Essence.MemberCount', 'In {count} systems', {
      count: Number(entry.membershipCount) || 0,
    })}
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
        <span class="manager-scoped-essence-state-name">{systemLabel(row)}</span>
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

  .manager-scoped-essence-glyph {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: var(--fab-v2-radius-control);
    color: var(--fab-accent);
  }

  .manager-scoped-essence-count {
    color: var(--fab-mv2-text-muted);
    font-size: 0.72rem;
  }

  .manager-scoped-essence-states {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  /* THREE STATES, THREE CHANNELS — colour, glyph and the visible system name with a title
     attribute. A state told by colour alone does not survive greyscale, and this strip is the
     only place a GM sees all three at once. */
  .manager-scoped-essence-state {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-chip);
    color: var(--fab-mv2-text-muted);
    font-size: 0.68rem;
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
