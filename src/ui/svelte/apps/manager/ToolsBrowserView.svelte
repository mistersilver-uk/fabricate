<!-- Svelte 5 runes mode -->
<script>
  import Chip from './Chip.svelte';
  import EmptyState from './EmptyState.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import ItemDropZone from './ItemDropZone.svelte';
  import { filterTools, projectToolRow } from './tools/toolStudio.js';
  import {
    breakModeSourcePill,
    INHERIT_BREAK_MODE,
    systemBreakModeOptions,
  } from './scoped/worldToolStudio.js';

  let {
    tools = [],
    selectedToolId = '',
    managedItemOptions = [],
    breakageAuthority = 'toolSpecific',
    // THE WORLD SCOPE'S OWN PROJECTION and the AUTHORING LAYER of the resolved token above
    // (issue 1373). Both are already passed by the call site, which is what makes the
    // tri-state buildable without reopening a gateway file: `CraftingSystemManagerRoot`
    // spreads the tool bundle FIRST and restates `breakageAuthority` / `breakageSource`
    // after, so declaring exactly what the site passes keeps the lookup off the spread.
    //
    // Declaring a name the site does NOT pass would make every reader of it a live
    // subscriber to the whole bundle, which the root's own note records; both of these are
    // passed, so neither does.
    scope = null,
    breakageSource = 'default',
    onSelectTool = () => {},
    onEditTool = () => {},
    onCreateToolDrop = () => {},
    onToggleToolEnabled = () => {},
    onSetBreakageAuthority = () => {},
  } = $props();

  let searchTerm = $state('');
  let pageIndex = $state(0);
  let pageSize = $state(8);
  let autoSelectedToolId = $state('');

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // PROJECTED TO A SCALAR IMMEDIATELY, and that is a cost decision rather than a style one.
  // `scope` is a NEW OBJECT on every world-corpus publish, so reading it inside a reactive
  // scope would re-render this whole view on every world-scope edit. One derivation bounds
  // that to a string comparison; world-corpus publishes are GM-edit-driven, not per-frame.
  //
  // `worldScopeProjection` attaches `toolBreakage` ONLY when the corpus holds one, so `''`
  // means the world authored nothing - which is a different label and a different pill from
  // an authored `toolSpecific`, and is why this is read rather than inferred from the
  // resolved token.
  const worldAuthority = $derived(scope?.toolBreakage?.authority ?? '');

  const authoritySegments = $derived(
    systemBreakModeOptions({
      worldAuthority,
      systemAuthority: breakageAuthority,
      source: breakageSource,
      text,
    })
  );

  const authorityPill = $derived(breakModeSourcePill(breakageSource, text));

  const filteredTools = $derived(filterTools(tools, searchTerm, managedItemOptions));
  const pagedTools = $derived(
    filteredTools.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
  );

  $effect(() => {
    if (pageIndex > 0 && pageIndex * pageSize >= filteredTools.length) pageIndex = 0;
  });

  $effect(() => {
    if (tools.some((tool) => tool.id === selectedToolId)) {
      autoSelectedToolId = '';
      return;
    }
    const firstToolId = tools[0]?.id || '';
    if (!firstToolId || autoSelectedToolId === firstToolId) return;
    autoSelectedToolId = firstToolId;
    onSelectTool(firstToolId);
  });

  function chooseTool(tool) {
    onSelectTool(tool.id);
  }

  function countLabel(count) {
    return text(
      count === 1
        ? 'FABRICATE.Admin.Manager.Tools.ResultCountOne'
        : 'FABRICATE.Admin.Manager.Tools.ResultCount',
      count === 1 ? '{count} tool' : '{count} tools'
    ).replace('{count}', String(count));
  }

  function breakageLabel(tool, kind) {
    if (kind === 'immune') return text('FABRICATE.Admin.Manager.Tools.SummaryImmune', 'Immune');
    if (kind === 'breakable')
      return text('FABRICATE.Admin.Manager.Tools.SummaryCheckDriven', 'Roll to break');
    if (kind === 'breakageChance') {
      return text('FABRICATE.Admin.Manager.Tools.SummaryChanceValue', '{count}% break').replace(
        '{count}',
        String(tool?.breakage?.breakageChance ?? 0)
      );
    }
    if (kind === 'diceExpression') {
      return text('FABRICATE.Admin.Manager.Tools.SummaryDiceValue', '{formula} roll').replace(
        '{formula}',
        String(tool?.breakage?.formula || '—')
      );
    }
    const maxUses = Number(tool?.breakage?.maxUses);
    if (Number.isInteger(maxUses) && maxUses > 0) {
      return text('FABRICATE.Admin.Manager.Tools.SummaryUseCount', '{count} uses').replace(
        '{count}',
        String(maxUses)
      );
    }
    return text('FABRICATE.Admin.Manager.Tools.SummaryUnlimitedUses', 'Unlimited uses');
  }

  function onBreakLabel(kind) {
    return {
      destroy: text('FABRICATE.Admin.Manager.Tools.OnBreakDestroys', 'Destroys'),
      flagBroken: text('FABRICATE.Admin.Manager.Tools.OnBreakMarksBroken', 'Marks broken'),
      replaceWith: text('FABRICATE.Admin.Manager.Tools.OnBreakReplaces', 'Replaces'),
    }[kind];
  }

  function authorityCaption() {
    const key =
      breakageAuthority === 'checkDriven'
        ? 'FABRICATE.Admin.Manager.Tools.AuthorityCheckDrivenCaption'
        : 'FABRICATE.Admin.Manager.Tools.AuthorityToolSpecificCaption';
    const fallback =
      breakageAuthority === 'checkDriven'
        ? 'The active check decides breakage · applies to all {count}'
        : 'Each Tool tracks its own breakage · applies to all {count}';
    return text(key, fallback).replace('{count}', countLabel(tools.length));
  }
</script>

<main
  class="manager-main manager-tools-main"
  aria-label={text('FABRICATE.Admin.Manager.Tools.Title', 'Tools')}
  data-tool-library
>
  <div class="manager-tools-main-content">
    <section
      class="manager-inspector-card manager-tools-authority-card"
      data-manager-tools-authority
    >
      <div class="manager-tools-authority-heading">
        <span><i class="fas fa-sliders" aria-hidden="true"></i></span>
        <!--
          THE PILL SITS INSIDE THE TITLE CELL, not beside the `ALL TOOLS` chip, and that is a
          layout constraint rather than a preference. `styles/fabricate.css` gives this heading
          `grid-template-columns: 20px minmax(0, 1fr) max-content` and is closed to this lane,
          so a FOURTH child would flow into an implicit second row under the glyph. Nesting it
          in the `1fr` cell keeps the heading at three children and lets the pill wrap under a
          long title instead of forcing a row.
        -->
        <div class="manager-tools-authority-title">
          <strong>{text('FABRICATE.Admin.Manager.Tools.AuthorityKicker', 'System breakage')}</strong
          >
          <Chip tone={authorityPill.tone} data-tool-authority-pill={authorityPill.state}
            >{authorityPill.label}</Chip
          >
        </div>
        <Chip tone="neutral">{text('FABRICATE.Admin.Manager.Tools.AllTools', 'ALL TOOLS')}</Chip>
      </div>
      <!--
        THREE SEGMENTS, SELECTED ON THE AUTHORED LAYER (issue 1373). `selected` comes from
        `breakageSource`, never from `breakageAuthority === value`: the resolved token cannot
        tell "this system chose it" from "this system inherited it", so a two-state control
        drew the inherited value as current and MINTED a per-system override the moment a GM
        clicked the segment already highlighted - an override nothing could then clear.
      -->
      <div
        class="manager-tools-authority-segments"
        role="radiogroup"
        aria-label={text('FABRICATE.Admin.Manager.Tools.AuthorityTitle', 'Tool breakage source')}
      >
        {#each authoritySegments as segment (segment.value)}
          <label class:is-selected={segment.selected} data-tool-authority-segment={segment.value}>
            <input
              type="radio"
              name="tool-breakage-authority"
              value={segment.value}
              checked={segment.selected}
              onchange={() =>
                onSetBreakageAuthority(segment.value === INHERIT_BREAK_MODE ? null : segment.value)}
            />
            <span class="manager-tools-authority-option">
              <i class={segment.icon} aria-hidden="true"></i>
              <span>{segment.label}</span>
            </span>
          </label>
        {/each}
      </div>
      <small class="manager-tools-authority-caption">{authorityCaption()}</small>
    </section>

    <section class="manager-tools-library-card" data-manager-tools-search>
      <label class="manager-search">
        <i class="fas fa-search" aria-hidden="true"></i>
        <input
          type="search"
          value={searchTerm}
          oninput={(event) => {
            searchTerm = event.currentTarget.value;
            pageIndex = 0;
          }}
          placeholder={text('FABRICATE.Admin.Manager.Tools.Search', 'Search Tools')}
          aria-label={text('FABRICATE.Admin.Manager.Tools.Search', 'Search Tools')}
        />
      </label>
    </section>

    <ItemDropZone
      kind="tool-create"
      title={text(
        'FABRICATE.Admin.Manager.Tools.CreateDropTitle',
        'Drag an Item here to make it a Tool'
      )}
      hint={text(
        'FABRICATE.Admin.Manager.Tools.CreateDropHint',
        'Drop an Item from the Items directory or a compendium.'
      )}
      onDrop={onCreateToolDrop}
    />

    <section class="manager-tools-library-card" data-manager-tools-browser>
      <p class="manager-tools-result-summary" data-tool-result-count>
        {countLabel(filteredTools.length)}
      </p>
      <div class="manager-tools-library-scroll" data-tool-library-scroll>
        {#if tools.length === 0}
          <EmptyState
            icon="fas fa-screwdriver-wrench"
            title={text('FABRICATE.Admin.Manager.Tools.EmptyTitle', 'No Tools yet')}
            hint={text(
              'FABRICATE.Admin.Manager.Tools.EmptyHintDrop',
              'Create an unlinked Tool or drop an Item above.'
            )}
            dataAttr="data-tool-library-empty"
          />
        {:else if filteredTools.length === 0}
          <EmptyState
            icon="fas fa-search"
            title={text('FABRICATE.Admin.Manager.Tools.EmptySearch', 'No Tools match your search')}
            dataAttr="data-tool-library-filtered-empty"
          />
        {:else}
          <div class="manager-tools-library-list" role="list">
            {#each pagedTools as tool (tool.id)}
              {@const row = projectToolRow(tool, managedItemOptions, breakageAuthority)}
              <article
                class="manager-tools-row"
                class:is-selected={selectedToolId === tool.id}
                data-manager-tool-id={tool.id}
                role="listitem"
              >
                <button
                  type="button"
                  class="manager-tools-select-target"
                  aria-pressed={selectedToolId === tool.id}
                  onclick={() => chooseTool(tool)}
                >
                  <img src={row.img} alt="" />
                  <span class="manager-tools-library-copy">
                    <strong title={row.name}>{row.name}</strong>
                    <small
                      >{row.description ||
                        text(
                          'FABRICATE.Admin.Manager.NoDescriptionAdded',
                          'No description has been added.'
                        )}</small
                    >
                    <span class="manager-tools-library-chips">
                      <Chip
                        tone={row.validation.valid ? 'positive' : 'danger'}
                        class={`manager-tools-validation-chip ${row.validation.valid ? 'is-ready' : ''}`}
                        icon={row.validation.valid
                          ? 'fas fa-circle-check'
                          : 'fas fa-circle-exclamation'}
                        data-tool-validation-status={row.validation.valid
                          ? 'ready'
                          : 'needs-attention'}
                      >
                        {row.validation.valid
                          ? text('FABRICATE.Admin.Manager.Tools.ValidationReady', 'Ready')
                          : text(
                              'FABRICATE.Admin.Manager.Tools.ValidationNeedsAttention',
                              'Needs attention'
                            )}
                      </Chip>
                      <Chip tone="neutral">{breakageLabel(tool, row.breakage)}</Chip>
                      <Chip tone="neutral">{onBreakLabel(row.onBreak)}</Chip>
                    </span>
                  </span>
                </button>
                <div class="manager-tools-library-actions">
                  <button
                    type="button"
                    class={`manager-tools-enabled-toggle ${row.enabled ? 'is-on' : ''}`}
                    aria-pressed={row.enabled}
                    aria-label={row.enabled
                      ? text('FABRICATE.Admin.Manager.Tools.Disable', 'Disable Tool')
                      : text('FABRICATE.Admin.Manager.Tools.Enable', 'Enable Tool')}
                    onclick={() => onToggleToolEnabled(tool.id, !row.enabled)}
                  >
                    <span aria-hidden="true"><span></span></span>
                  </button>
                  <button
                    type="button"
                    class="manager-icon-button"
                    aria-label={text('FABRICATE.Admin.Manager.Tools.Edit', 'Edit Tool')}
                    title={text('FABRICATE.Admin.Manager.Tools.Edit', 'Edit Tool')}
                    onclick={() => onEditTool(tool.id)}
                    ><i class="fas fa-pen" aria-hidden="true"></i></button
                  >
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </div>
    </section>
  </div>
  {#if tools.length > 0}
    <div class="manager-tools-browser-pagination" data-tool-browser-pagination>
      <Pagination
        totalCount={filteredTools.length}
        {pageSize}
        {pageIndex}
        pageSizeOptions={[8, 16, 24]}
        persistent
        onPageChange={(next) => {
          pageIndex = next;
        }}
        onPageSizeChange={(next) => {
          pageSize = next;
          pageIndex = 0;
        }}
      />
    </div>
  {/if}
</main>

<style>
  /* The title cell holds the heading word AND the authoring-source pill (issue 1373). STATIC
     class name, so Svelte can prove the selector is used and `lint:svelte:warnings` stays at
     zero.

     The PILL'S OWN SIZING is not authored here: the host sheet's descendant rule under
     `.manager-tools-authority-heading` still reaches it one level deeper, which is why it
     stays the smaller 18px/0.56rem treatment its sibling wears.

     The token that rule selects on is deliberately not written out. `manager-layout.test.js`
     ratchets the hand-rolled-chip migration by matching that token ANYWHERE in a manager
     `.svelte` file, comment prose included - which is a decision it records, because one site
     passes the classes to a child as a string prop and an attribute-shaped scan missed it. */
  .manager-tools-authority-title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-chip);
    min-width: 0;
  }
</style>
