<!--
  The harness's own window: rail, information architecture, knob panel and event log.

  ── ONE PAGE-WIDE PRODUCTION-SHAPED SUBTREE, AND EVERY PLINTH IS ITS SIBLING ────────────────────

  This is the only Fabricate root the harness draws for itself. It is production-shaped for the
  same four reasons a plinth is (see `Plinth.svelte`), and it is ONE container rather than a narrow
  rail beside a narrow knob panel: `@container fabricate-manager` fires at 1320px, 1120px and 680px
  and restyles the generic `.manager-header`, `.manager-body`, `.manager-rail`,
  `.manager-inspector` and `.manager-toolbar-primary` — every one of which this file emits. One
  wide container never fires them; two narrow ones fire them all, and the reference frame would be
  restyled while the specimens beside it were not.

  It is pinned to the `fabricate` theme and never repainted. That is what makes the seven-theme
  plinth row a comparison: something on the page has to hold still.

  ── THE RAIL IS THE FIRST OF FOUR SURFACES THE SHIPPED SET DOES NOT OWN ─────────────────────────

  `<NavSidebar>` / `<AppRail>` is UNBUILT, and `ManagerButton` is not a substitute: its six roles
  each name a VERB and it has no selected state, while a rail entry's whole job is to say "you are
  here". The rail existing as `pl-` markup in the lab's own chrome is this page's standing evidence
  that it is the highest-value unbuilt member — the harness could not be assembled from the set
  without it.
-->
<script>
  import Chip from '../../../src/ui/svelte/apps/manager/Chip.svelte';
  import CollapsibleGroupHeader from '../../../src/ui/svelte/components/CollapsibleGroupHeader.svelte';
  import Field from '../../../src/ui/svelte/components/Field.svelte';
  import InspectorCard from '../../../src/ui/svelte/components/InspectorCard.svelte';
  import Stepper from '../../../src/ui/svelte/components/Stepper.svelte';
  import { FABRICATE_THEME_ATTRIBUTE, FABRICATE_THEME_IDS } from '../../../src/ui/theme.js';

  import EventLog from './EventLog.svelte';
  import KnobPanel from './KnobPanel.svelte';
  import SectionList from './SectionList.svelte';
  import { SPEC_STATES } from './tokens.js';

  let {
    groups = [],
    counts,
    progress,
    selected = null,
    values = {},
    events = [],
    invocation = '',
    contextNote = '',
    plinthWidth = 0,
    plinthHeight = 460,
    selectedPath = '',
    tokenTable,
    stateRules = [],
    onSelect = () => {},
    onKnobChange = () => {},
    onPlinth = () => {},
  } = $props();

  let railOpen = $state({});

  /**
   * The detail strip's disclosures.
   *
   * COLLAPSED BY DEFAULT, apart from the note. The page's subject is the component and it was
   * below the fold: this column opened on a title, a chip row, a paragraph of prose, eight state
   * pills and a generated invocation block, all of it above anything drawn. Every one of those is
   * worth reading and none of them is worth reading FIRST, so they are one click away and the
   * stage is at the top of the page.
   *
   * `note` is the exception and opens, because it is the one thing here that was not merely below
   * the fold: `catalogue/README.md` documents the field, thirty-eight of the fifty-seven rows
   * carry one, and nothing on this page rendered it at all. Most of them explain why a control
   * cannot be driven or what a specimen is deliberately not showing — which is exactly what a
   * reader looking at the plinth above needs, and it was being written into a file nobody read.
   */
  let detailOpen = $state({ note: true, identity: false, invocation: false });

  /**
   * The rail lists what can be MOUNTED, which is a smaller set than the library names.
   *
   * A manifest row with no catalogue entry has a name, a section and a reason, and nothing that
   * says how to drive it — so it belongs in the information architecture beside every other row and
   * not in a navigation of specimens. A group with nothing mountable is therefore absent HERE and
   * present THERE, which is the honest split rather than a silent one.
   */
  const railGroups = $derived(
    groups
      .map((group) => ({
        ...group,
        entries: group.rows.filter((row) => row.kind === 'mounted' && row.entry),
      }))
      .filter((group) => group.entries.length > 0)
  );

  function isRailOpen(group) {
    return railOpen[group.id] ?? true;
  }

  function stateTone(declared) {
    if (declared === true) return 'positive';
    return typeof declared === 'string' ? 'muted' : 'neutral';
  }

  function stateTitle(state, declared) {
    if (declared === true) return `${state}: expressible from this component's own props`;
    if (typeof declared === 'string') return `${state}: ${declared}`;
    return `${state}: the catalogue row does not say`;
  }
</script>

<div
  class="application fabricate crafting-system-manager"
  style="height:660px"
  data-primitive-lab-plinth="manager"
  data-primitive-lab-chrome=""
  {...{ [FABRICATE_THEME_ATTRIBUTE]: FABRICATE_THEME_IDS.FABRICATE }}
>
  <section class="window-content">
    <div class="fabricate-manager">
      <div class="manager-header">
        <h2>Primitive Lab</h2>
        <div class="pl-row">
          <Chip icon="fas fa-cube" tone="accent">{counts.catalogued} catalogued</Chip>
          <Chip icon="fas fa-box-archive">{counts.shipped} shipped</Chip>
          <Chip icon="fas fa-drafting-compass" tone="muted">{counts.unbuilt} unbuilt</Chip>
          <Chip icon="fas fa-ban" tone="muted">{counts.ruledOut} ruled out</Chip>
          <Chip
            icon={progress.failed.length === 0
              ? 'fas fa-circle-check'
              : 'fas fa-circle-exclamation'}
            tone={progress.failed.length === 0 ? 'positive' : 'danger'}
            >{progress.mounted.length} mounted</Chip
          >
        </div>
      </div>

      <div class="pl-row">
        <Field as="div">
          <span>plinth width</span>
          <Stepper
            value={plinthWidth}
            min={0}
            max={1600}
            step={20}
            allowUnset={false}
            ariaLabel="Plinth width in pixels, zero for the natural width"
            decrementLabel="Narrower plinth"
            incrementLabel="Wider plinth"
            onChange={(next) => onPlinth({ width: next ?? 0, height: plinthHeight })}
          />
        </Field>
        <Field as="div">
          <span>plinth height</span>
          <Stepper
            value={plinthHeight}
            min={420}
            max={1200}
            step={20}
            allowUnset={false}
            ariaLabel="Plinth height in pixels"
            decrementLabel="Shorter plinth"
            incrementLabel="Taller plinth"
            onChange={(next) => onPlinth({ width: plinthWidth, height: next ?? 420 })}
          />
        </Field>
        <span
          >Height is a control because <code>.fabricate-manager</code> clips deliberately (issue 1286).
          The clip is not overridden here: a popover the product cuts off must be cut off in the lab too.</span
        >
      </div>

      <div class="manager-body">
        <div class="manager-rail">
          <!-- SURFACE 1 of 4: the specimen rail. `<NavSidebar>` / `<AppRail>` is UNBUILT. -->
          <div class="pl-rail" data-pl-surface="NavSidebar">
            {#each railGroups as group (group.id)}
              <CollapsibleGroupHeader
                name={`${group.num} · ${group.title}`}
                countText={`${group.entries.length}`}
                expanded={isRailOpen(group)}
                onToggle={() => (railOpen = { ...railOpen, [group.id]: !isRailOpen(group) })}
              />
              {#if isRailOpen(group)}
                {#each group.entries as row (row.path)}
                  <button
                    type="button"
                    class="pl-rail-entry"
                    aria-current={row.path === selectedPath}
                    onclick={() => onSelect(row.path)}
                  >
                    <i class="fas fa-cube" aria-hidden="true"></i>
                    <span class="pl-rail-entry-name">{row.name}</span>
                  </button>
                {/each}
              {/if}
            {/each}
          </div>
        </div>

        <div class="manager-main pl-chrome-column">
          {#if selected}
            {#if selected.entry.note || contextNote}
              <CollapsibleGroupHeader
                name="Note"
                countText=""
                expanded={detailOpen.note}
                onToggle={() => (detailOpen = { ...detailOpen, note: !detailOpen.note })}
              />
              {#if detailOpen.note}
                <InspectorCard>
                  {#if contextNote}
                    <!--
                      The ACTIVE context's own sentence, first, because it describes the thing
                      currently on the stage: which ancestor was chosen, and why that one. It is
                      not on the stage itself — a two-line paragraph above the plinth is the
                      prose-before-component arrangement this page was rearranged to end.
                    -->
                    <p>{contextNote}</p>
                  {/if}
                  {#if selected.entry.note}
                    <p>{selected.entry.note}</p>
                  {/if}
                </InspectorCard>
              {/if}
            {/if}

            <CollapsibleGroupHeader
              name="Identity, prose and states"
              countText={`${SPEC_STATES.length}`}
              expanded={detailOpen.identity}
              onToggle={() => (detailOpen = { ...detailOpen, identity: !detailOpen.identity })}
            />
            {#if detailOpen.identity}
              <InspectorCard>
                <h3>{selected.name}</h3>
                <div class="pl-row">
                  <Chip mono>{selected.tag}</Chip>
                  <Chip mono tone="muted" truncate>{selected.path}</Chip>
                  <Chip tone={selected.member ? 'accent' : 'muted'}
                    >{selected.member ? 'primitive' : 'below the caller bar'}</Chip
                  >
                  <Chip tone="neutral"
                    >{selected.entry.root === 'app' ? 'app root' : 'manager root'}</Chip
                  >
                </div>
                <p>{selected.why}</p>
                <div class="pl-row">
                  {#each SPEC_STATES as spec (spec.state)}
                    <Chip
                      mono
                      tone={stateTone(selected.entry.states?.[spec.state])}
                      title={stateTitle(spec.state, selected.entry.states?.[spec.state])}
                      >{spec.state}</Chip
                    >
                  {/each}
                </div>
              </InspectorCard>
            {/if}

            <CollapsibleGroupHeader
              name="Invocation"
              countText=""
              expanded={detailOpen.invocation}
              onToggle={() => (detailOpen = { ...detailOpen, invocation: !detailOpen.invocation })}
            />
            {#if detailOpen.invocation}
              <InspectorCard>
                <pre>{invocation}</pre>
              </InspectorCard>
            {/if}
          {/if}

          <SectionList
            {groups}
            {tokenTable}
            {stateRules}
            {selectedPath}
            onSelect={(path) => onSelect(path)}
          />
        </div>

        <div class="manager-inspector pl-chrome-column">
          {#if selected}
            <KnobPanel
              entry={selected.entry}
              {values}
              onChange={(prop, value) => onKnobChange(prop, value)}
            />
          {/if}
          <CollapsibleGroupHeader name="Events" countText={`${events.length}`} expanded />
          <EventLog {events} />
        </div>
      </div>
    </div>
  </section>
</div>
