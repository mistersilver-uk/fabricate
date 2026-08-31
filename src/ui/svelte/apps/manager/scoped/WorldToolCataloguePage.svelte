<!-- Svelte 5 runes mode -->
<!--
  The world Tools Catalogue (issue 1373, epic 1357).

  IT COMPOSES `EntityCatalogueShell` AND BUILDS NO SECOND LIST. The list, its filters, its
  sort, its bulk selection and its inspector column are all the shell's; what this file owns
  is the tool-shaped configuration around them - the search text, the breakage sort, the row
  badges, the seeded-section panel - and the one control that is not part of any list.

  == THE WORLD BREAKAGE DEFAULT SITS ABOVE THE SHELL, NOT INSIDE IT ========================
  It is neither a row nor an entity: it is one value for every Tool in the world, and this is
  the ONLY surface at world scope that authors it. The shell takes no scope-level header
  snippet, so the card is a SIBLING of the shell inside this page's own `<main>` - a card and
  a list, not a second catalogue composition, and it defines no list, filter or inspector
  structure of its own.

  == THE TWO-TRACK LAYOUT IS SPANNED, NOT REDECLARED =======================================
  `styles/fabricate.css` gives every `.manager-main` `grid-template-rows: auto auto 1fr`, and
  that stylesheet is closed to this lane. A page with a card and a list would put the list in
  the second `auto` track and leave the `1fr` empty, which content-sizes the list inside an
  `overflow: hidden` main. Redeclaring the template from a Svelte-scoped block is a
  specificity TIE with the shipped rule and resolves on injection order, which nothing here
  controls. Spanning the list from row 2 to the end is a property no shipped rule sets, so it
  composes with the template instead of racing it.

  == AND THE OVERRIDE COUNT IS CONDITIONAL, WHICH IS A REPORTED GAP RATHER THAN A CHOICE ===
  The prototype's card states `{n} systems override it`, counting systems whose OWN authored
  token differs from the world's. That needs each crafting system's `toolBreakage` block, and
  the roster this page receives is `$viewState.systems` - a hand-built allowlist in
  `adminStore.js` that does not carry it, in a file `### GM World Scoped Entity Routes`
  requirement 7 closes to this lane. Reading an absent field answers `0` for every world,
  which reads as "nothing overrides it" and is a WRONG number rather than a missing one. So
  `breakModeOverridesKnown` gates the line: when the roster cannot answer, the card states
  nothing there rather than guessing.

  == THE THIRD SECTION HAS NO INHERIT COUNT, AND THE INSPECTOR SAYS SO ====================
  The shell renders one inherit count per `scope.sections`, which is `['breakage', 'onBreak']`.
  `repairRequirements` is deliberately absent from that list - it is SEEDED once when a tool
  joins a system and then diverges - so a shell iterating the counts drops it silently. This
  page's `inspectorBody` renders it explicitly, as a SEED with no count, because a count would
  claim a live parent the resolver does not honour.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Chip from '../Chip.svelte';
  import { toolBreakageSummary, toolOnBreakSummary } from '../tools/toolStudio.js';
  import EntityCatalogueShell from './EntityCatalogueShell.svelte';
  import {
    breakModeOverrideCount,
    breakModeOverridesKnown,
    toolBreakModeLabel,
    worldBreakModeOptions,
    worldToolSearchText,
    worldToolSorts,
  } from './worldToolStudio.js';

  let { scope = null, actions = null, systems = [], onOpenEntry = () => {} } = $props();

  // INITIALISED, and that is not optional: `EntityCatalogueShell` declares `selectedId` as a
  // bindable prop, and Svelte 5 THROWS `props_invalid_value` when a bindable prop has a setter
  // and the incoming value is `undefined`. `$state()` with no initialiser kills the mount.
  let selectedId = $state('');

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function format(key, fallback, replacements) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(replacements)) {
      result = result.replace(`{${token}}`, value);
    }
    return result;
  }

  /**
   * One world default read as a TOOL-SHAPED record, for the shipped summary helpers.
   *
   * The world default's sections carry the same field names an in-system record does -
   * `breakage.mode`, `onBreak.mode` - because they are the values a membership record
   * inherits verbatim. `checkBreakable` is a TOP-LEVEL tool field rather than part of the
   * `breakage` section, so it is read from the world default's own top level.
   *
   * @param {object|null} entry
   * @returns {{breakage: object|null, onBreak: object|null, checkBreakable: boolean}}
   */
  function worldDefaultTool(entry) {
    const defaults = entry?.defaults ?? {};
    return {
      breakage: defaults.breakage ?? null,
      onBreak: defaults.onBreak ?? null,
      checkBreakable: defaults.checkBreakable !== false,
    };
  }

  /**
   * The breakage badge one row wears.
   *
   * CALLED WITH THE WORLD'S OWN RESOLVED AUTHORITY, because a world catalogue row has no
   * system: what it can truthfully state is what the world default means under the world's
   * break mode. `toolBreakageSummary` is the shipped derivation and is not restated here.
   *
   * @param {object|null} entry
   * @returns {string}
   */
  function breakageLabel(entry) {
    const tool = worldDefaultTool(entry);
    const kind = toolBreakageSummary(tool, worldAuthority || 'toolSpecific');
    if (kind === 'immune') return text('FABRICATE.Admin.Manager.Tools.SummaryImmune', 'Immune');
    if (kind === 'breakable') {
      return text('FABRICATE.Admin.Manager.Tools.SummaryCheckDriven', 'Roll to break');
    }
    if (kind === 'breakageChance') {
      return format('FABRICATE.Admin.Manager.Tools.SummaryChanceValue', '{count}% break', {
        count: tool.breakage?.breakageChance ?? 0,
      });
    }
    if (kind === 'diceExpression') {
      return format('FABRICATE.Admin.Manager.Tools.SummaryDiceValue', '{formula} roll', {
        formula: tool.breakage?.formula || '-',
      });
    }
    const maxUses = Number(tool.breakage?.maxUses);
    if (Number.isInteger(maxUses) && maxUses > 0) {
      return format('FABRICATE.Admin.Manager.Tools.SummaryUseCount', '{count} uses', {
        count: maxUses,
      });
    }
    return text('FABRICATE.Admin.Manager.Tools.SummaryUnlimitedUses', 'Unlimited uses');
  }

  /**
   * The on-break badge one row wears.
   *
   * @param {object|null} entry
   * @returns {string}
   */
  function onBreakLabel(entry) {
    return {
      destroy: text('FABRICATE.Admin.Manager.Tools.OnBreakDestroys', 'Destroys'),
      flagBroken: text('FABRICATE.Admin.Manager.Tools.OnBreakMarksBroken', 'Marks broken'),
      replaceWith: text('FABRICATE.Admin.Manager.Tools.OnBreakReplaces', 'Replaces'),
    }[toolOnBreakSummary(worldDefaultTool(entry))];
  }

  /**
   * How many repair groups one tool's world default seeds.
   *
   * @param {object|null} entry
   * @returns {number}
   */
  function repairGroupCount(entry) {
    const groups = entry?.defaults?.repairRequirements;
    return Array.isArray(groups) ? groups.length : 0;
  }

  const worldAuthority = $derived(scope?.toolBreakage?.authority ?? '');
  const breakModeOptions = $derived(worldBreakModeOptions(worldAuthority, text));
  const overridesKnown = $derived(breakModeOverridesKnown(systems));
  const overrideCount = $derived(breakModeOverrideCount(systems, worldAuthority));

  const entries = $derived(Array.isArray(scope?.entries) ? scope.entries : []);
  const selectedEntry = $derived(entries.find((entry) => entry.id === selectedId) ?? null);

  const sorts = $derived(worldToolSorts(text, breakageLabel));

  // WHAT EACH WORLD DEFAULT RESOLVES TO, one line per section. Without it the shell's counts
  // read "Breakage - 3 inheriting" and never say what those three systems are inheriting, and
  // a row-count criterion passes green over every note empty.
  const sectionNotes = $derived(
    selectedEntry
      ? { breakage: breakageLabel(selectedEntry), onBreak: onBreakLabel(selectedEntry) }
      : {}
  );

  const catalogueTitle = $derived(
    text('FABRICATE.Admin.Manager.Scoped.ToolCatalogueTitle', 'Tools Catalogue')
  );
</script>

<main class="manager-main" data-scoped-page="world-tools" aria-label={catalogueTitle}>
  <section class="manager-inspector-card manager-world-tool-break-card" data-world-tool-break-mode>
    <div class="manager-world-tool-break-head">
      <i class="fas fa-sliders" aria-hidden="true"></i>
      <span class="manager-world-tool-break-title"
        >{text('FABRICATE.Admin.Manager.Tools.WorldAuthorityTitle', 'World breakage default')}</span
      >
      {#if overridesKnown}
        <span class="manager-world-tool-break-count" data-world-tool-break-overrides>
          {format(
            overrideCount === 1
              ? 'FABRICATE.Admin.Manager.Tools.WorldAuthorityOverrideOne'
              : 'FABRICATE.Admin.Manager.Tools.WorldAuthorityOverrideCount',
            overrideCount === 1 ? '{count} system overrides it' : '{count} systems override it',
            { count: overrideCount }
          )}
        </span>
      {/if}
    </div>
    <div
      class="manager-world-tool-break-segments"
      role="radiogroup"
      aria-label={text(
        'FABRICATE.Admin.Manager.Tools.WorldAuthorityTitle',
        'World breakage default'
      )}
    >
      {#each breakModeOptions as option (option.value)}
        <label class:is-selected={option.selected} data-world-tool-break-segment={option.value}>
          <input
            type="radio"
            name="world-tool-breakage-authority"
            value={option.value}
            checked={option.selected}
            onchange={() => actions?.setWorldToolBreakage?.(option.value)}
          />
          <span class="manager-world-tool-break-option">
            <i class={option.icon} aria-hidden="true"></i>
            <span>{option.label}</span>
          </span>
        </label>
      {/each}
    </div>
    <p class="manager-muted manager-world-tool-break-note">
      {format(
        'FABRICATE.Admin.Manager.Tools.WorldAuthorityNote',
        'Every crafting system uses {label} unless it overrides the break mode in its own Tool Rules.',
        { label: toolBreakModeLabel(worldAuthority, text) }
      )}
    </p>
  </section>

  <div class="manager-world-tool-catalogue-body">
    <EntityCatalogueShell
      {scope}
      {actions}
      {systems}
      hookValue="world-tools"
      title={catalogueTitle}
      subtitle={text(
        'FABRICATE.Admin.Manager.Scoped.ToolCatalogueSubtitle',
        'One Tool per game-world Item, shared by every system.'
      )}
      icon="fas fa-screwdriver-wrench"
      emptyTitle={text('FABRICATE.Admin.Manager.Tools.EmptyTitle', 'No Tools yet')}
      emptyHint={text(
        'FABRICATE.Admin.Manager.Scoped.ToolCatalogueEmptyHint',
        'Tools lifted to world scope appear here, each shared by every crafting system that adopts it.'
      )}
      {sorts}
      searchOf={worldToolSearchText}
      {sectionNotes}
      bind:selectedId
      {onOpenEntry}
      {rowMeta}
      {inspectorBody}
    />
  </div>
</main>

{#snippet rowMeta(entry)}
  <span class="manager-world-tool-row-badges" data-world-tool-row-badges={entry.id}>
    <Chip tone="neutral" data-world-tool-row-breakage>{breakageLabel(entry)}</Chip>
    <Chip tone="neutral" data-world-tool-row-onbreak>{onBreakLabel(entry)}</Chip>
  </span>
{/snippet}

{#snippet inspectorBody(entry)}
  <div class="manager-world-tool-seed" data-world-tool-repair-seed={entry.id}>
    <span class="manager-world-tool-seed-label"
      >{text(
        'FABRICATE.Admin.Manager.Scoped.Sections.RepairRequirements',
        'Repair materials'
      )}</span
    >
    <span class="manager-world-tool-seed-value">
      {format(
        repairGroupCount(entry) === 1
          ? 'FABRICATE.Admin.Manager.Tools.RepairGroupOne'
          : 'FABRICATE.Admin.Manager.Tools.RepairGroupCount',
        repairGroupCount(entry) === 1 ? '{count} group' : '{count} groups',
        { count: repairGroupCount(entry) }
      )}
    </span>
    <p class="manager-muted" data-world-tool-repair-seed-note>
      {text(
        'FABRICATE.Admin.Manager.Tools.RepairSeedNote',
        'Copied once when a system adopts this Tool, then edited there. Changing it here never reaches a system that already has it.'
      )}
    </p>
  </div>
{/snippet}

<style>
  /* STATIC class names, so Svelte can prove each selector is used and `lint:svelte:warnings`
     stays at zero. `styles/fabricate.css` is closed to this lane, so every rule this page
     needs is authored here - which is also the right home, because nothing else renders this
     markup. `.manager-main`, `.manager-inspector-card` and `.manager-muted` are shipped and
     reused rather than restated. */

  /* SPANNED, NOT REDECLARED. See the header: the shipped `.manager-main` template is
     `auto auto 1fr`, so a two-child page leaves the growing track empty and content-sizes its
     list. `grid-row` is set by no shipped rule, so this composes rather than ties. */
  .manager-world-tool-break-card {
    display: flex;
    flex-direction: column;
    grid-row: 1;
    gap: var(--fab-space-2);
    min-width: 0;
    padding: var(--fab-space-2) var(--fab-space-3);
  }

  .manager-world-tool-catalogue-body {
    display: grid;
    grid-row: 2 / -1;
    grid-template-rows: minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
  }

  .manager-world-tool-break-head {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-world-tool-break-head i {
    color: var(--fab-mv2-accent);
    font-size: 0.7rem;
  }

  .manager-world-tool-break-title {
    color: var(--fab-mv2-text);
    font-size: 0.75rem;
    font-weight: 600;
    overflow-wrap: break-word;
  }

  /* PUSHED to the trailing edge rather than absolutely positioned, so a long localized count
     wraps under the title instead of overlapping it. */
  .manager-world-tool-break-count {
    margin-left: auto;
    color: var(--fab-mv2-text-muted);
    font-size: 0.6rem;
    font-weight: 600;
    text-align: right;
  }

  /* The shipped segmented-control treatment, matched to `.manager-tools-authority-segments`
     so a GM sees one break-mode control across the two scopes. */
  /* WRAPS rather than shrinking. Three segments each carry a full label — the widest is
     `Inherit · Tool-specific (default)` — and the option inside is an `inline-flex` with no
     truncation, so a row that shrinks its segments below their content width pushes the text
     outside the card. The capture gate measures exactly that and reported the third segment
     clipped. Wrapping keeps every label whole at any card width; truncating would hide the
     value the segment exists to state. */
  .manager-world-tool-break-segments {
    display: flex;
    flex: 1 1 auto;
    flex-wrap: wrap;
    gap: var(--fab-space-2xs);
    padding: 3px;
    border: 1px solid var(--fab-mv2-border);
    border-radius: 9px;
    background: var(--fab-overlay-dark-08);
    min-width: 0;
  }

  .manager-world-tool-break-segments label {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: center;
    padding: 6px var(--fab-space-2);
    border-radius: 7px;
    cursor: pointer;
  }

  .manager-world-tool-break-segments label.is-selected {
    background: var(--fab-mv2-accent);
    color: var(--fab-on-accent);
  }

  .manager-world-tool-break-segments input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  .manager-world-tool-break-option {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-1);
    font-size: 0.72rem;
    font-weight: 600;
    line-height: 1.2;
  }

  .manager-world-tool-break-note {
    margin: 0;
    font-size: 0.62rem;
  }

  .manager-world-tool-row-badges {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  .manager-world-tool-seed {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-chip);
    align-items: baseline;
    min-width: 0;
  }

  .manager-world-tool-seed-label {
    color: var(--fab-mv2-text);
    font-size: 0.72rem;
    font-weight: 600;
  }

  .manager-world-tool-seed-value {
    color: var(--fab-mv2-text-muted);
    font-size: 0.72rem;
  }
</style>
