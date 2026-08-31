<!-- Svelte 5 runes mode -->
<script>
  import Chip from '../Chip.svelte';
  import EmptyState from '../EmptyState.svelte';
  import IconFactRow from '../IconFactRow.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { projectToolBehaviorFacts, projectToolRow } from './toolStudio.js';

  // `onEdit` was already being PASSED by the call site and not declared here, so the panel
  // rendered no route into the rules editor at all. The prototype pins one to the foot of
  // this column; declaring the prop is what makes that button possible without reopening
  // `CraftingSystemManagerRoot`.
  let { tool = null, managedItems = [], authority = 'toolSpecific', onEdit = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
  function formattedText(key, data, fallback) {
    const template = localize(key);
    if (template && template !== key) return localize(key, data);
    return Object.entries(data).reduce(
      (copy, [name, value]) => copy.replace(`{${name}}`, String(value)),
      fallback
    );
  }

  const row = $derived(tool ? projectToolRow(tool, managedItems, authority) : null);
  const facts = $derived(projectToolBehaviorFacts(tool, authority, text, formattedText));

  function validationContext() {
    if (row.validation.errorCount === 1) {
      return text('FABRICATE.Admin.Manager.Tools.ValidationIssue', '1 issue');
    }
    return text('FABRICATE.Admin.Manager.Tools.ValidationIssues', '{count} issues').replace(
      '{count}',
      row.validation.errorCount
    );
  }
</script>

{#if row}
  <section
    class="manager-inspector-card manager-tool-browser-inspector"
    data-tool-browser-inspector
  >
    <div class="manager-tool-inspector-hero">
      <img src={row.img} alt="" />
      <div>
        <!-- `Selected tool`, not `Tool page`. The two tool screens had their kickers swapped:
             `Tool page` names the WORLD record and belongs on the world catalogue's inspector,
             while this panel is showing what one Tool resolves to INSIDE one crafting system. -->
        <p class="manager-kicker">
          {text('FABRICATE.Admin.Manager.Tools.InspectorKicker', 'Selected tool')}
        </p>
        <h2 title={row.name}>{row.name}</h2>
        <Chip
          tone={row.enabled ? 'positive' : 'neutral'}
          icon={row.enabled ? 'fas fa-circle-check' : 'fas fa-circle-pause'}
        >
          {row.enabled
            ? text('FABRICATE.Admin.Manager.Tools.InspectorEnabledHere', 'Enabled here')
            : text('FABRICATE.Admin.Manager.Tools.InspectorDisabledHere', 'Disabled here')}
        </Chip>
        {#if !row.validation.valid}
          <Chip
            tone="danger"
            icon="fas fa-circle-exclamation"
            data-tool-validation-status="needs-attention"
          >
            {text('FABRICATE.Admin.Manager.Tools.ValidationNeedsAttention', 'Needs attention')}
          </Chip>
        {/if}
      </div>
    </div>
    <p class="manager-muted" data-tool-inspector-description>
      {row.description ||
        text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}
    </p>
    {#if !row.validation.valid}
      <p class="manager-muted is-danger" data-tool-inspector-validation>
        <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
        {validationContext()}
      </p>
    {/if}
    <!--
      ONE GROUP, ONE KICKER. This used to be four separately-headed sections — `BREAKAGE`,
      `ON BREAK`, `PREREQUISITES`, `BONUS` — each over a single row that already states the
      same thing in bold. Four headings over four one-row lists is four times the vertical
      space for no information: `8% break / Tool-specific · tracked per copy` does not need a
      heading reading `Breakage` above it. The heading the panel does need is the one naming
      what the whole group is: the rules that apply HERE, in this crafting system, after
      inheritance and overrides are resolved.
    -->
    <p class="manager-kicker manager-tool-inspector-section-kicker">
      {text('FABRICATE.Admin.Manager.Tools.InspectorEffectiveRules', 'Effective rules here')}
    </p>
    <div class="manager-tool-inspector-rules">
      {#each facts as fact (fact.id)}
        <!-- The SAME row the editor's behavior preview renders, from the same
             `projectToolBehaviorFacts` projection — one component now, not a second
             geometry for one meaning (issue 881). -->
        <IconFactRow
          icon={fact.icon}
          title={fact.title}
          subtitle={fact.subtitle}
          dataAttr="data-tool-inspector-rule"
          dataValue={fact.id}
        />
      {/each}
    </div>
    <!-- PINNED TO THE FOOT of the column, which is where the prototype puts the panel's one
         primary action. `margin-top: auto` rather than a sticky footer, so a short panel does
         not float the button halfway up an empty column. -->
    <div class="manager-tool-inspector-foot">
      <ManagerButton
        role="primary"
        fullWidth
        data-tool-inspector-edit={row.id}
        onclick={() => onEdit(row.id)}
      >
        {text('FABRICATE.Admin.Manager.Tools.EditRules', 'Edit rules')}
      </ManagerButton>
    </div>
  </section>
{:else}
  <!-- The inspector's no-selection state is the shared primitive at the sidebar scale.
       It used to re-derive the panel by hand through
       `.manager-tool-browser-inspector.is-empty`, which cancelled the dashed panel
       (padding 0, border 0) and gave this ONE screen a 2rem glyph in a 46px tile and a
       1.2rem title — a per-screen exception to the tile/type scale the primitive exists
       to hold. `contextClass` keeps only the container concern: fill the inspector
       column. -->
  <EmptyState
    compact
    icon="fas fa-screwdriver-wrench"
    title={text('FABRICATE.Admin.Manager.Tools.SelectTitle', 'Select a Tool')}
    hint={text(
      'FABRICATE.Admin.Manager.Tools.SelectHint',
      'Choose a Tool to inspect its behavior.'
    )}
    contextClass="manager-tool-browser-inspector-empty"
    dataAttr="data-tool-browser-inspector-empty"
  />
{/if}

<style>
  /* The rules stack and the pinned action, authored here rather than in
     `styles/fabricate.css` so `VIEW_RECIPES` maps a change to the Tool views alone. The
     four-heading `.manager-tool-inspector-sections` grid this replaces is no longer
     rendered by anything. */
  .manager-tool-inspector-rules {
    display: grid;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* `margin-top: auto` on a WRAPPER rather than on the button: a class passed into a child
     component as a prop never receives this block's scoping attribute, so the selector would
     be pruned as unused and `lint:svelte:warnings` would fail on it. */
  .manager-tool-inspector-foot {
    margin-top: auto;
    min-width: 0;
  }
</style>
