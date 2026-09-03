<!--
  The stage: the selected primitive, at the top of the page, at the width it has where it ships.

  ── COMPONENT FIRST, AND THAT IS THE WHOLE POINT OF THIS REGION ─────────────────────────────────

  Measured on the page this replaces: the harness window came first at 660px, and its main column
  spent its own first two thirds on a title, a chip row, a paragraph of prose, eight state pills
  and a generated invocation block. The specimen began somewhere past 700px, which in a 1080px
  viewport means the reader scrolls to see the thing the page is about. Everything that is not the
  component now lives BELOW it, in the harness window, behind disclosures.

  ── AND IT OPENS ON THE SCREEN RECIPE, NOT ON THE PRIMITIVE ALONE ───────────────────────────────

  A `RadioCardGroup` by itself on a 420px plinth is a true photograph of a component and says
  nothing about the product, where it sits inside a `CheckDifficultyCard`, inside a checks editor,
  in a 1280px manager window. So a row that declares a `context` opens on it: the real ancestor is
  mounted, at the width that ancestor has at its call site, and it passes the primitive its own
  props — see `contexts.js` for why that is the only honest way to get real props onto a specimen.

  The isolated view is the LAST tab rather than the first. It is still there, because driving every
  knob and walking a component's states is the other half of what this page is for and a screen
  recipe is a bad place to do it.

  ── THE TAB STRIP IS `SegmentedControl`, WHICH IS THE SHIPPED CONTROL FOR IT ────────────────────

  Not `pl-` markup. `lab.css` allows the harness four surfaces the design system genuinely does not
  own and calls a fifth a defect, and a switch between two to four mutually exclusive views is
  precisely what `SegmentedControl` is for — the knob panel already routes a 2–4 option select to
  it on the spec's own rule. It carries its own scoped CSS and reads `--fab-*` from the theme root,
  which is why it paints correctly out here beside `Chip`, which the plinth label already uses.
-->
<script>
  import Chip from '../../../src/ui/svelte/apps/manager/Chip.svelte';
  import SegmentedControl from '../../../src/ui/svelte/apps/manager/SegmentedControl.svelte';

  import Plinth from './Plinth.svelte';
  import { describeHighlight } from './contexts.js';

  let {
    row,
    views = [],
    activeId = '',
    height = 460,
    isolatedWidth = 0,
    highlightReport = null,
    onSelectView = () => {},
    onHighlight = () => {},
    children,
  } = $props();

  const active = $derived(views.find((view) => view.id === activeId) ?? views[0] ?? null);
  const context = $derived(active?.context ?? null);
  const width = $derived(context ? (context.width ?? 0) : isolatedWidth);
</script>

<div class="pl-stage">
  <div class="pl-row">
    <Chip icon="fas fa-cube" tone="accent">{row.name}</Chip>
    <Chip mono>{row.tag}</Chip>
    {#if views.length > 1}
      <SegmentedControl
        options={views.map((view) => ({ value: view.id, fallback: view.label }))}
        value={active?.id ?? ''}
        groupName="pl-stage-view"
        ariaLabel="Which view of this primitive to draw"
        density="compact"
        onChange={(next) => onSelectView(next)}
      />
    {/if}
  </div>

  {#if context}
    <div class="pl-row">
      <Chip icon="fas fa-diagram-project" tone="info" title={context.why ?? ''}>in place</Chip>
      <Chip mono tone="muted" truncate>{context.ancestor}</Chip>
      <Chip mono>{width}px</Chip>
      {#if active.highlight}
        <Chip
          mono
          tone={highlightReport?.matched > 0 ? 'positive' : 'danger'}
          title={describeHighlight(active)}
          >{active.highlight} · {highlightReport?.matched ?? 0} matched</Chip
        >
      {:else}
        <Chip tone="warning" icon="fas fa-triangle-exclamation" title={describeHighlight(active)}
          >no highlight</Chip
        >
      {/if}
    </div>
  {/if}

  <Plinth
    root={context ? (context.root ?? row.entry.root ?? 'manager') : (row.entry.root ?? 'manager')}
    {width}
    {height}
    fill={context ? context.fill !== false : row.entry.fill === true}
    highlight={active?.highlight ?? ''}
    {onHighlight}
    probe
  >
    {@render children?.(active)}
  </Plinth>
</div>
