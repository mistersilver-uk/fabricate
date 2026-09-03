<!--
  The Primitive Lab page.

  ── THE PAGE IS A PLAIN GRID, AND THAT IS A CONSTRAINT RATHER THAN A LAYOUT CHOICE ──────────────

  `styles/fabricate.css` carries 2821 `.fabricate-manager <descendant>` selectors against 25 for
  `.fabricate-app`. A plinth nested inside the manager-rooted harness would be painted by 2821 rules
  that never reach it in production, and where the two areas state the same property at the same
  specificity source order would decide — silently, with no error and nothing on screen to say the
  specimen is not being drawn the way the product draws it.

  So `.pl-page` is an unclassed grid, the harness window is one page-wide production-shaped subtree,
  and every plinth is a SIBLING of it. Four regions, in reading order:

    1. the stage — the selected primitive, in its screen recipe where the row declares one, at the
       top of the page and at the width it has where it ships;
    2. the harness window — rail, information architecture, the row's own prose and states behind
       disclosures, knob panel, event log;
    3. the comparison plinths — the same specimen in all seven themes, then any story matrix;
    4. the catalogue — every catalogued component on its own plinth, grouped by library section.

  THE ORDER IS THE MAINTAINER'S RULING and it is the substance of this arrangement rather than a
  preference: the component is the subject of the page and it was below the fold. Region 2 was
  region 1 and is 660px tall, and its main column opened on a title, a chip row, prose, eight state
  pills and a generated invocation before reaching anything drawn. So the stage moved above it and
  everything that is not the component moved behind a disclosure inside it.

  ── EVERY PLINTH IS DRIVABLE, NOT JUST THE SELECTED ONE ─────────────────────────────────────────

  Knob values are keyed by component path rather than held for the selection, so a catalogue plinth
  is a live component and not a photograph of one: clicking a `Stepper` in the catalogue moves it,
  through the same `writes` path the stage uses. The knob PANEL drives the selection because
  there is one panel; the specimens themselves are all real.

  ── AND THE CATALOGUE IS THE ONE REGION THAT NAMES WHAT IT DREW ─────────────────────────────────

  Region 4 renders exactly one plinth per catalogue row, so it is the only region that can carry a
  row's identity: it is the only one whose plinth count equals the catalogue's row count. Regions 1
  and 3 all draw the SELECTED row — staged, then once in each of the seven themes, then once per
  story cell — so an identity on any of them would publish one path from a dozen elements.
  `Plinth.svelte` states the invariant the smoke is decided on: exactly one element per catalogue
  path, page-wide.

  It is also why region 4 is unconditional. The rail's selection changes what regions 1 and 3 draw
  and nothing else, so the page mounts the whole catalogue on every load, with or without
  `?mount=all` — see `mount.js`, which owns that query.

  ── A CONTEXT SPECIMEN IS NOT A CATALOGUED ONE, AND THE COUNT MUST NOT SAY IT IS ────────────────

  The stage's context view mounts an ANCESTOR — `CheckDifficultyCard`, not `RadioCardGroup` — and
  `scripts/primitive-lab-smoke.mjs` compares the page's mounted SET against the catalogue's paths
  by identity. An ancestor reported through the same channel as a specimen would arrive there as
  `mounted but not catalogued`, which is exactly the failure that comparison exists to raise, over
  a page that is working correctly. So an ancestor settles with a NULL path: it still counts toward
  readiness, so the smoke waits for it and its console errors are caught, and it contributes
  nothing to the identity set.
-->
<script>
  import Chip from '../../../src/ui/svelte/apps/manager/Chip.svelte';

  import Fillers from './Fillers.svelte';
  import LabChrome from './LabChrome.svelte';
  import Plinth from './Plinth.svelte';
  import Specimen from './Specimen.svelte';
  import Stage from './Stage.svelte';
  import { LAB_THEMES } from './tokens.js';
  import {
    applyWriteBack,
    buildProps,
    defaultValues,
    expandMatrix,
    renderInvocation,
  } from './knobs.js';
  import { describeFiller } from './fillers.js';
  import { viewsFor } from './contexts.js';

  /**
   * The catalogue plinth's width when a row does not ask for one.
   *
   * A DEFAULT rather than the hard-coded number it replaces. 420px was written onto every one of
   * the fifty-seven plinths, and it is a plausible pane width for most of them and wrong for the
   * few that are a screen region: `CompositionList` draws a record column and a weight column, and
   * at 420px the record column resolved to 0px — a component that looked like it had lost its data.
   */
  const DEFAULT_CATALOGUE_WIDTH = 420;

  let { model, tokenTable, stateRules, onProgress = () => {} } = $props();

  const catalogued = $derived(
    model.groups.flatMap((group) => group.rows.filter((row) => row.kind === 'mounted' && row.entry))
  );

  let selectedPath = $state('');
  let valuesByPath = $state({});
  let events = $state([]);
  let plinth = $state({ width: 0, height: 460 });
  let settled = $state({});
  let viewByPath = $state({});
  let highlightReport = $state(null);

  /**
   * Each catalogued row's isolated specimen's rendered root class list, keyed on path.
   *
   * Published by the catalogue plinths and read by `contexts.js` to DERIVE a context's highlight
   * selector. It is a page-wide register rather than a per-row lookup because the two regions that
   * need it are not nested: the reading is taken in region 4 and used in region 1.
   */
  let rootClassesByPath = $state({});

  const selected = $derived(
    catalogued.find((row) => row.path === selectedPath) ?? catalogued[0] ?? null
  );
  const selectedValues = $derived(selected ? valuesFor(selected) : {});
  const views = $derived(
    selected ? viewsFor(selected.entry, rootClassesByPath[selected.path] ?? []) : []
  );
  const activeView = $derived(
    views.find((view) => view.id === viewByPath[selected?.path ?? '']) ?? views[0] ?? null
  );
  const stories = $derived(
    selected
      ? (selected.entry.stories ?? []).flatMap((story) =>
          expandMatrix(selected.entry, story, selectedValues).map((cell) => ({
            ...cell,
            title: story.title ?? '',
          }))
        )
      : []
  );

  /**
   * How many specimen instances this render plan contains.
   *
   * Computed from the plan rather than counted as instances register, because a count that grows
   * as components mount can equal itself at a moment when only some of them exist — and readiness
   * would then be published in the middle of the page building itself.
   */
  const expected = $derived(
    catalogued.length + (selected ? 1 + LAB_THEMES.length + stories.length : 0)
  );

  const progress = $derived.by(() => {
    const outcomes = Object.values(settled);
    // `entry.path` is NULL for a context ancestor, which is what keeps `CheckDifficultyCard` out of
    // a set the smoke compares against the catalogue by identity. See the header.
    const mounted = [
      ...new Set(outcomes.filter((entry) => entry.ok && entry.path).map((entry) => entry.path)),
    ];
    const failed = outcomes.filter((entry) => !entry.ok);
    // `mounted` is deduplicated by PATH and `settled` counts INSTANCES, because the two answer
    // different questions: how many components this page can mount, and whether it has finished
    // mounting them. The selected specimen is rendered once on the stage, once per theme and
    // once per story cell, so a single number would have to be wrong about one of them.
    return { mounted, failed, settled: outcomes.length, expected };
  });

  $effect(() => {
    onProgress(progress);
  });

  function valuesFor(row) {
    return valuesByPath[row.path] ?? defaultValues(row.entry);
  }

  function setValues(row, next) {
    valuesByPath = { ...valuesByPath, [row.path]: next };
  }

  function handleKnob(prop, value) {
    if (!selected) return;
    setValues(selected, { ...selectedValues, [prop]: value });
  }

  /**
   * Record a fired callback, and close the loop a real call site closes.
   *
   * Almost every interactive primitive here is CONTROLLED — it renders `value` and reports
   * `onChange` — so a specimen mounted with a fixed prop and a recorder is inert: you can click it,
   * the log fills up, and nothing moves. `applyWriteBack` is what makes the specimen behave like
   * the product rather than like a screenshot.
   */
  function handleEvent(row, fired, { writeBack = true } = {}) {
    events = [{ seq: events.length + 1, prop: fired.prop, args: fired.args }, ...events].slice(
      0,
      50
    );
    if (!writeBack) return;
    const next = applyWriteBack({
      entry: row.entry,
      values: valuesFor(row),
      prop: fired.prop,
      args: fired.args,
    });
    if (next) setValues(row, next);
  }

  function handleSettle(outcome) {
    settled = { ...settled, [outcome.instanceId]: outcome };
  }

  /**
   * Settle a context ancestor.
   *
   * Same channel as a specimen so readiness waits for it — a context that cannot mount must fail
   * the smoke rather than be quietly skipped — but with `path: null`, so it never joins the
   * identity set the smoke compares against the catalogue. See the header.
   */
  function handleAncestorSettle(outcome) {
    settled = { ...settled, [outcome.instanceId]: { ...outcome, path: null } };
  }

  function selectView(id) {
    if (!selected) return;
    viewByPath = { ...viewByPath, [selected.path]: id };
    highlightReport = null;
  }

  /**
   * Record one plinth's reading, and WRITE NOTHING WHEN IT HAS NOT CHANGED.
   *
   * The guard is load-bearing rather than a tidiness: `onRoot` and `onHighlight` are arrow
   * functions written in the markup, so every re-render of the plinth hands it a NEW callback
   * identity, and `Plinth.svelte`'s reader effect depends on that prop. An unconditional
   * `state = {...state, k: v}` therefore closes a cycle — publish, re-render, new arrow, effect
   * re-runs, publish — that spins forever at full speed on a page mounting fifty-seven components.
   * Comparing first makes the second pass a no-op, and the cycle stops there.
   */
  function recordRootClasses(path, tokens) {
    const current = rootClassesByPath[path];
    if (current?.length === tokens.length && current.every((token, i) => token === tokens[i])) {
      return;
    }
    rootClassesByPath = { ...rootClassesByPath, [path]: tokens };
  }

  function recordHighlight(report) {
    if (
      highlightReport?.selector === report.selector &&
      highlightReport?.matched === report.matched
    ) {
      return;
    }
    highlightReport = report;
  }
</script>

<Fillers>
  {#snippet children(fillers)}
    {#snippet specimen(id, row, values, options)}
      <Specimen
        instanceId={id}
        path={row.path}
        props={buildProps({
          entry: row.entry,
          values,
          resolveSnippet: (filler) => fillers[filler],
          onEvent: (fired) => handleEvent(row, fired, options),
        })}
        onSettle={handleSettle}
      />
    {/snippet}

    <div class="pl-page">
      {#if selected && activeView}
        <!--
          REGION 1. The stage draws exactly ONE specimen instance whichever view is active — the
          primitive, or the ancestor that passes it real props — which is why `expected` counts one
          for it either way.
        -->
        <Stage
          row={selected}
          {views}
          activeId={activeView.id}
          height={plinth.height}
          isolatedWidth={plinth.width}
          {highlightReport}
          onSelectView={selectView}
          onHighlight={recordHighlight}
        >
          {#snippet children(view)}
            {#if view?.context}
              <Specimen
                instanceId={`stage:${view.id}:${selected.path}`}
                path={view.context.ancestor}
                props={view.context.props ?? {}}
                onSettle={handleAncestorSettle}
              />
            {:else}
              {@render specimen(`stage:isolated:${selected.path}`, selected, selectedValues, {})}
            {/if}
          {/snippet}
        </Stage>
      {/if}

      <LabChrome
        groups={model.groups}
        counts={model.counts}
        {progress}
        {selected}
        values={selectedValues}
        {events}
        invocation={selected
          ? renderInvocation(selected.entry, selectedValues, { describeFiller })
          : ''}
        contextNote={activeView?.context?.why ?? ''}
        plinthWidth={plinth.width}
        plinthHeight={plinth.height}
        selectedPath={selected?.path ?? ''}
        {tokenTable}
        {stateRules}
        onSelect={(path) => (selectedPath = path)}
        onKnobChange={handleKnob}
        onPlinth={(next) => (plinth = next)}
      />

      {#if selected}
        <div class="pl-workbench">
          <div class="pl-plinth-row">
            {#each LAB_THEMES as theme (theme.id)}
              <Plinth
                root={selected.entry.root ?? 'manager'}
                theme={theme.id}
                width={360}
                height={plinth.height}
                label={theme.label}
                fill={selected.entry.fill === true}
              >
                {@render specimen(
                  `theme:${theme.id}:${selected.path}`,
                  selected,
                  selectedValues,
                  {}
                )}
              </Plinth>
            {/each}
          </div>

          {#if stories.length > 0}
            <div class="pl-plinth-row">
              {#each stories as cell, index (cell.title + cell.label + index)}
                <Plinth
                  root={selected.entry.root ?? 'manager'}
                  width={360}
                  height={plinth.height}
                  label={`${cell.title}${cell.title && cell.label ? ' · ' : ''}${cell.label}`}
                  fill={selected.entry.fill === true}
                >
                  {@render specimen(`story:${index}:${selected.path}`, selected, cell.values, {
                    writeBack: false,
                  })}
                </Plinth>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <div class="pl-sections">
        {#each model.groups as group (group.id)}
          {@const rows = group.rows.filter((row) => row.kind === 'mounted' && row.entry)}
          {#if rows.length > 0}
            <div class="pl-stack">
              <span><Chip icon="fas fa-layer-group">{group.num} · {group.title}</Chip></span>
              <div class="pl-plinth-row">
                {#each rows as row (row.path)}
                  <!--
                    THE CANONICAL PLINTH FOR THIS ROW, and the only one that says so. `specimen` is
                    passed here and at no other `<Plinth>` on this page; see `Plinth.svelte`.
                  -->
                  <Plinth
                    root={row.entry.root ?? 'manager'}
                    width={row.entry.width ?? DEFAULT_CATALOGUE_WIDTH}
                    height={plinth.height}
                    label={row.name}
                    specimen={row.path}
                    fill={row.entry.fill === true}
                    onRoot={(tokens) => recordRootClasses(row.path, tokens)}
                  >
                    {@render specimen(`cat:${row.path}`, row, valuesFor(row), {})}
                  </Plinth>
                {/each}
              </div>
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {/snippet}
</Fillers>
