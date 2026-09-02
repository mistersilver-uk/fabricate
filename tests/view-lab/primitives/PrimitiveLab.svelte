<!--
  The Primitive Lab page.

  ── THE PAGE IS A PLAIN GRID, AND THAT IS A CONSTRAINT RATHER THAN A LAYOUT CHOICE ──────────────

  `styles/fabricate.css` carries 2821 `.fabricate-manager <descendant>` selectors against 25 for
  `.fabricate-app`. A plinth nested inside the manager-rooted harness would be painted by 2821 rules
  that never reach it in production, and where the two areas state the same property at the same
  specificity source order would decide — silently, with no error and nothing on screen to say the
  specimen is not being drawn the way the product draws it.

  So `.pl-page` is an unclassed grid, the harness window is one page-wide production-shaped subtree,
  and every plinth is a SIBLING of it. Three regions, in reading order:

    1. the harness window — rail, information architecture, knob panel, event log;
    2. the workbench — the driven specimen, then the same specimen in all seven themes, then any
       story matrix the row declares;
    3. the catalogue — every catalogued component on its own plinth, grouped by library section.

  ── EVERY PLINTH IS DRIVABLE, NOT JUST THE SELECTED ONE ─────────────────────────────────────────

  Knob values are keyed by component path rather than held for the selection, so a catalogue plinth
  is a live component and not a photograph of one: clicking a `Stepper` in the catalogue moves it,
  through the same `writes` path the workbench uses. The knob PANEL drives the selection because
  there is one panel; the specimens themselves are all real.

  ── AND THE CATALOGUE IS THE ONE REGION THAT NAMES WHAT IT DREW ─────────────────────────────────

  Region 3 renders exactly one plinth per catalogue row, so it is the only region that can carry a
  row's identity: it is the only one whose plinth count equals the catalogue's row count. Region 2's
  three call sites all draw the SELECTED row — driven, then once in each of the seven themes, then
  once per story cell — so an identity on any of them would publish one path from a dozen elements.
  `Plinth.svelte` states the invariant the smoke is decided on: exactly one element per catalogue
  path, page-wide.

  It is also why region 3 is unconditional. The rail's selection changes what region 2 repeats and
  nothing else, so the page mounts the whole catalogue on every load, with or without `?mount=all` —
  see `mount.js`, which owns that query.
-->
<script>
  import Chip from '../../../src/ui/svelte/apps/manager/Chip.svelte';

  import Fillers from './Fillers.svelte';
  import LabChrome from './LabChrome.svelte';
  import Plinth from './Plinth.svelte';
  import Specimen from './Specimen.svelte';
  import { LAB_THEMES } from './tokens.js';
  import {
    applyWriteBack,
    buildProps,
    defaultValues,
    expandMatrix,
    renderInvocation,
  } from './knobs.js';
  import { describeFiller } from './fillers.js';

  let { model, tokenTable, stateRules, onProgress = () => {} } = $props();

  const catalogued = $derived(
    model.groups.flatMap((group) => group.rows.filter((row) => row.kind === 'mounted' && row.entry))
  );

  let selectedPath = $state('');
  let valuesByPath = $state({});
  let events = $state([]);
  let plinth = $state({ width: 0, height: 460 });
  let settled = $state({});

  const selected = $derived(
    catalogued.find((row) => row.path === selectedPath) ?? catalogued[0] ?? null
  );
  const selectedValues = $derived(selected ? valuesFor(selected) : {});
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
    const mounted = [...new Set(outcomes.filter((entry) => entry.ok).map((entry) => entry.path))];
    const failed = outcomes.filter((entry) => !entry.ok);
    // `mounted` is deduplicated by PATH and `settled` counts INSTANCES, because the two answer
    // different questions: how many components this page can mount, and whether it has finished
    // mounting them. The selected specimen is rendered once on the workbench, once per theme and
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
          <Plinth
            root={selected.entry.root ?? 'manager'}
            width={plinth.width}
            height={plinth.height}
            label={`${selected.tag} — driven`}
            probe
          >
            {@render specimen(`work:${selected.path}`, selected, selectedValues, {})}
          </Plinth>

          <div class="pl-plinth-row">
            {#each LAB_THEMES as theme (theme.id)}
              <Plinth
                root={selected.entry.root ?? 'manager'}
                theme={theme.id}
                width={360}
                height={plinth.height}
                label={theme.label}
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
                    width={420}
                    height={plinth.height}
                    label={row.name}
                    specimen={row.path}
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
