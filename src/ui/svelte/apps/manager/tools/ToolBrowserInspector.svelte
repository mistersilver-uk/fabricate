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
  let {
    tool = null,
    managedItems = [],
    authority = 'toolSpecific',
    onEdit = () => {},
    // ── THE TWO ACTIONS THE PANEL WAS MISSING, AND WHAT THEY NEEDED ──────────────────────
    // Both were previously reported as blocked, and the block was real: neither the crafting
    // system's NAME nor the selected Tool's MEMBERSHIP was passed to this component, so
    // `Add {tool} to {system}` could name neither of its two halves and had no way to know
    // whether to render at all. The root passes both now.
    //
    // `unadopted` is the world entry for a Tool this system has NO rules record for. It is a
    // separate prop rather than a flag on `tool` because the two are read from different
    // corpora: `tool` is this system's own library row, and there is no such row for an
    // unadopted Tool - the panel would otherwise be empty for exactly the state the second
    // button exists to answer.
    systemName = '',
    unadopted = null,
    onEditWorldTool = () => {},
    onAddToSystem = () => {},
  } = $props();

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

  /**
   * The world record's own defaults read as a TOOL-SHAPED record, for the unadopted panel.
   *
   * A system with no rules record for a Tool has no rules to state, so what the panel can
   * honestly show is what this system WOULD inherit the moment it adopts one - which is
   * exactly what the `No rules here` pill above the cards qualifies. The two prerequisite and
   * bonus facts fall to their "none" wording because world scope authors neither.
   */
  const unadoptedTool = $derived(
    unadopted
      ? {
          id: unadopted.id,
          breakage: unadopted.defaults?.breakage ?? null,
          onBreak: unadopted.defaults?.onBreak ?? null,
          checkBreakable: unadopted.defaults?.checkBreakable !== false,
        }
      : null
  );

  const facts = $derived(
    projectToolBehaviorFacts(tool ?? unadoptedTool, authority, text, formattedText)
  );

  const subjectId = $derived(row?.id || String(unadopted?.id || ''));
  const subjectName = $derived(row?.name || unadopted?.entity?.name || String(unadopted?.id || ''));

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

{#if row || unadopted}
  <section
    class="manager-inspector-card manager-tool-browser-inspector"
    data-tool-browser-inspector
    data-tool-inspector-membership={row ? 'member' : 'absent'}
  >
    <div class="manager-tool-inspector-hero">
      <img src={row?.img || unadopted?.entity?.img || ''} alt="" />
      <div>
        <!-- `Selected tool`, not `Tool page`. The two tool screens had their kickers swapped:
             `Tool page` names the WORLD record and belongs on the world catalogue's inspector,
             while this panel is showing what one Tool resolves to INSIDE one crafting system. -->
        <p class="manager-kicker">
          {text('FABRICATE.Admin.Manager.Tools.InspectorKicker', 'Selected tool')}
        </p>
        <h2 title={subjectName}>{subjectName}</h2>
        <!-- THE PILL STATES MEMBERSHIP FIRST. `Enabled here` over a Tool this system has no
             rules record for would be a claim about rules that do not exist; the design says
             `No rules here` for exactly that state, and only a member can be on or off. -->
        {#if row}
          <Chip
            tone={row.enabled ? 'positive' : 'neutral'}
            icon={row.enabled ? 'fas fa-circle-check' : 'fas fa-circle-pause'}
          >
            {row.enabled
              ? text('FABRICATE.Admin.Manager.Tools.InspectorEnabledHere', 'Enabled here')
              : text('FABRICATE.Admin.Manager.Tools.InspectorDisabledHere', 'Disabled here')}
          </Chip>
        {:else}
          <Chip tone="warning" icon="fas fa-circle-minus" data-tool-inspector-no-rules>
            {text('FABRICATE.Admin.Manager.Tools.InspectorNoRulesHere', 'No rules here')}
          </Chip>
        {/if}
        {#if row && !row.validation.valid}
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
      {row?.description ||
        unadopted?.entity?.description ||
        text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}
    </p>
    {#if row && !row.validation.valid}
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
      {row
        ? text('FABRICATE.Admin.Manager.Tools.InspectorEffectiveRules', 'Effective rules here')
        : text(
            'FABRICATE.Admin.Manager.Tools.InspectorWorldDefaultsHere',
            'What it would inherit here'
          )}
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
    <!--
      TWO GROUPS, AND THE SPLIT IS THE DESIGN'S OWN, not a tidiness choice.

      The design's panel puts `Edit the world Tool` DIRECTLY UNDER the rules cards and pins
      `Add {tool} to {system}` to the very bottom of the column, with the gap between them. The
      two are not alike: the first is a NAVIGATION, out of this system entirely, to where
      identity, art, description and the world defaults are authored once; the second is the
      one WRITE this panel makes, and it is the terminal action of a panel whose whole message
      is that this system has no rules for the Tool yet.
    -->
    <div class="manager-tool-inspector-routes">
      {#if row}
        <ManagerButton
          role="primary"
          fullWidth
          data-tool-inspector-edit={row.id}
          onclick={() => onEdit(row.id)}
        >
          {text('FABRICATE.Admin.Manager.Tools.EditRules', 'Edit rules')}
        </ManagerButton>
      {/if}
      <ManagerButton
        fullWidth
        data-tool-inspector-edit-world={subjectId}
        onclick={() => onEditWorldTool(subjectId)}
      >
        <i class="fas fa-globe" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Tools.EditWorldTool', 'Edit the world Tool')}</span>
      </ManagerButton>
    </div>
    {#if !row}
      <!-- `margin-top: auto` rather than a sticky footer, so a short panel does not float the
           button halfway up an empty column. -->
      <div class="manager-tool-inspector-foot">
        <ManagerButton
          role="primary"
          fullWidth
          data-tool-inspector-add={subjectId}
          onclick={() => onAddToSystem(subjectId)}
        >
          {formattedText(
            'FABRICATE.Admin.Manager.Tools.AddToNamedSystem',
            { tool: subjectName, system: systemName },
            'Add {tool} to {system}'
          )}
        </ManagerButton>
      </div>
    {/if}
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
  /* THE PANEL FILLS ITS COLUMN, which is what makes `margin-top: auto` below mean anything.
     Without it the card is content-height, the foot has no slack to be pushed into, and the
     pinned action sits wherever the cards happen to end - which is what a first render of this
     change showed. `.manager-inspector` is a flex column, so growing is all this needs. */
  .manager-tool-browser-inspector {
    flex: 1 1 auto;
    min-height: 0;
  }

  /* The navigation pair, in the reading order the design gives them. `column-reverse` is
     deliberately NOT used: reversing the DOM would put the tab order out of step with the eye. */
  .manager-tool-inspector-routes {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-tool-inspector-foot {
    margin-top: auto;
    min-width: 0;
  }
</style>
