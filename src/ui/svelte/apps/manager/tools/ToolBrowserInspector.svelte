<script>
  import Chip from '../../../components/Chip.svelte';
  import EmptyState from '../../../components/EmptyState.svelte';
  import IconFactRow from '../IconFactRow.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { projectToolBehaviorFacts, projectToolRow } from './toolStudio.js';

  // `onEdit` was PASSED by the call site and not declared here, so the panel rendered no route
  // into the rules editor at all.
  let {
    tool = null,
    managedItems = [],
    authority = 'toolSpecific',
    onEdit = () => {},
    // THE TWO ACTIONS THE PANEL WAS MISSING needed the system's NAME and the Tool's MEMBERSHIP,
    // neither of which reached this component, so `Add {tool} to {system}` could name neither half
    // and had no way to know whether to render. `unadopted` is the world entry for a Tool this
    // system has NO rules record for — a separate prop, because `tool` is this system's own
    // library row and there is no such row for an unadopted Tool.
    systemName = '',
    unadopted = null,
    // THE PER-SECTION INHERIT TRUTH, which this panel could not state and the row beside it
    // already did: the membership record's own `inherit` map, off the same world-projection join
    // the row's `Overrides …` sentence reads. A SEPARATE prop from `tool`, necessarily, because
    // the system's Tool record carries the RESOLVED values and cannot tell an inherited answer
    // from an identical overridden one.
    inherited = {},
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
   * The four world-default sections with the state this system resolves each through. The section
   * NAMES are restated rather than imported, for the reason `ToolsBrowserView` restates its own
   * copy: this list is the PRESENTATION order the `Inheritance` region reads in, deliberately the
   * same four the row's sentence enumerates. An ABSENT key reads as inheriting.
   */
  const INHERIT_SECTIONS = [
    { id: 'breakage', key: 'FABRICATE.Admin.Manager.Tools.Breakage', label: 'Breakage' },
    { id: 'onBreak', key: 'FABRICATE.Admin.Manager.Tools.OnBreak', label: 'On break' },
    {
      id: 'prerequisites',
      key: 'FABRICATE.Admin.Manager.Scoped.Sections.Prerequisites',
      label: 'Prerequisites',
    },
    { id: 'bonus', key: 'FABRICATE.Admin.Manager.Scoped.Sections.Bonus', label: 'Check bonus' },
  ];

  const inheritRows = $derived(
    INHERIT_SECTIONS.map((section) => {
      const isInherited = inherited?.[section.id] !== false;
      return {
        id: section.id,
        label: text(section.key, section.label),
        inherited: isInherited,
        state: isInherited
          ? text('FABRICATE.Admin.Manager.Scoped.Inherit.StateInherited', 'Inherited')
          : text('FABRICATE.Admin.Manager.Scoped.Inherit.StateOverridden', 'Overridden'),
      };
    })
  );

  /**
   * The world record's own defaults as a TOOL-SHAPED record, for the unadopted panel: a system with
   * no rules record has no rules to state, so what the panel can honestly show is what it WOULD
   * inherit on adopting one, which is what the `No rules here` pill qualifies.
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
  <InspectorCard
    class="manager-tool-browser-inspector"
    data-tool-browser-inspector=""
    data-tool-inspector-membership={row ? 'member' : 'absent'}
  >
    <!-- THE KICKER IS ITS OWN FULL-WIDTH LINE ABOVE THE BLOCK, where the world catalogue's
         inspector already puts its own: inside the copy column it read as a caption belonging to
         the name. `Selected tool`, not `Tool page` — the two screens had their kickers swapped,
         and `Tool page` names the WORLD record. -->
    <p class="manager-kicker manager-tool-inspector-kicker" data-tool-inspector-kicker>
      {text('FABRICATE.Admin.Manager.Tools.InspectorKicker', 'Selected tool')}
    </p>
    <div class="manager-tool-inspector-hero">
      <img src={row?.img || unadopted?.entity?.img || ''} alt="" />
      <div>
        <h2 title={subjectName}>{subjectName}</h2>
        <!-- THE PILL STATES MEMBERSHIP FIRST: `Enabled here` over a Tool with no rules record
             would claim rules that do not exist, and only a member can be on or off. -->
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
          <!-- NEUTRAL, not `warning`: an unadopted world Tool is an ordinary state with its own
               row treatment and pinned CTA, and a warning tint read as a defect it has not. -->
          <Chip tone="neutral" icon="fas fa-circle-minus" data-tool-inspector-no-rules>
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
    <!-- ONE GROUP, ONE KICKER, where four separately-headed sections each sat over a single row
         already stating the same thing in bold. The heading the panel needs is the one naming what
         the whole group is: the rules that apply HERE, after inheritance and overrides. -->
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
        <!-- The SAME row the editor's behavior preview renders, from the same projection. -->
        <IconFactRow
          icon={fact.icon}
          title={fact.title}
          subtitle={fact.subtitle}
          tile
          density="rule"
          dataAttr="data-tool-inspector-rule"
          dataValue={fact.id}
        />
      {/each}
    </div>
    <!-- WHICH OF THOSE FOUR ARE THIS SYSTEM'S OWN. The rules above cannot state where each answer
         came from, because a section overridden to the world's own value resolves identically to
         one inherited, so the row's `Overrides …` claim was unverifiable on the screen it opened.
         A separate region rather than a per-row pill, because `Inherited` qualifies the RULE.
         Members only: a Tool with no rules record inherits nothing. -->
    {#if row}
      <p class="manager-kicker manager-tool-inspector-section-kicker">
        {text('FABRICATE.Admin.Manager.Tools.InspectorInheritance', 'Inheritance')}
      </p>
      <div class="manager-tool-inspector-inheritance" data-tool-inspector-inheritance>
        {#each inheritRows as section (section.id)}
          <div
            class="manager-tool-inspector-inherit-row"
            data-tool-inspector-inherit={section.id}
            data-tool-inspector-inherit-state={section.inherited ? 'inherited' : 'overridden'}
          >
            <span>{section.label}</span>
            <Chip tone={section.inherited ? 'info' : 'warning'}>{section.state}</Chip>
          </div>
        {/each}
      </div>
    {/if}
    <!-- TWO GROUPS, AND THE SPLIT IS THE DESIGN'S OWN: the first is a NAVIGATION out of this
         system entirely, to where identity and the world defaults are authored once, and the
         second is the one WRITE this panel makes and its terminal action. -->
    <div class="manager-tool-inspector-routes">
      <ManagerButton
        fullWidth
        data-tool-inspector-edit-world={subjectId}
        onclick={() => onEditWorldTool(subjectId)}
      >
        <i class="fas fa-globe" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Tools.EditWorldTool', 'Edit the world Tool')}</span>
      </ManagerButton>
    </div>
    <!-- THE PANEL'S ONE TERMINAL ACTION, IN THE BAND THE DESIGN PINS IT TO, for BOTH membership
         states: the member's primary sat in the SCROLL FLOW with no band while only the
         non-member's was pinned, so the most important control moved position, emphasis and
         neighbours with the selection. THE MEMBER LABEL NAMES THE SYSTEM, since `Edit rules` alone
         is ambiguous where a Tool has rules in several at once. -->
    <div class="manager-tool-inspector-foot">
      {#if row}
        <ManagerButton
          role="primary"
          fullWidth
          data-tool-inspector-edit={row.id}
          onclick={() => onEdit(row.id)}
        >
          {systemName
            ? formattedText(
                'FABRICATE.Admin.Manager.Tools.EditRulesInNamedSystem',
                { system: systemName },
                'Edit rules in {system}'
              )
            : text('FABRICATE.Admin.Manager.Tools.EditRules', 'Edit rules')}
        </ManagerButton>
      {:else}
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
      {/if}
    </div>
  </InspectorCard>
{:else}
  <!-- The no-selection state is the shared primitive at the sidebar scale, where a hand-rolled
       panel gave this ONE screen a per-screen exception to the tile and type scale the primitive
       exists to hold. `contextClass` keeps only the container concern. -->
  <EmptyState
    compact
    fill
    icon="fas fa-screwdriver-wrench"
    title={text('FABRICATE.Admin.Manager.Tools.SelectTitle', 'Select a Tool')}
    hint={text(
      'FABRICATE.Admin.Manager.Tools.SelectHint',
      'Choose a Tool to inspect its behaviour.'
    )}
    dataAttr="data-tool-browser-inspector-empty"
  />
{/if}

<style>
  /* The rules stack and the pinned action, authored here rather than in `styles/fabricate.css` so
     the screenshot evidence map routes a change to the Tool views alone. */
  /* THE PANEL'S OWN HEAD, spanning the column above the medallion. ITS TYPE IS THE SHARED CLASS'S:
     restating it here would make the source fix UNREACHABLE rather than redundant, because the
     sheet is imported at `layer(modules)` and this block is injected unlayered. */
  .manager-tool-inspector-kicker,
  .manager-tool-inspector-section-kicker {
    margin: 0;
    min-width: 0;
  }

  .manager-tool-inspector-rules {
    display: grid;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* The `Inheritance` region, deliberately a rung quieter than the rules above: it qualifies
     them rather than adding a fifth. */
  .manager-tool-inspector-inheritance {
    display: grid;
    gap: var(--fab-space-1);
    min-width: 0;
  }

  /* The state pill is `flex: 0 0 auto` IMMEDIATELY AFTER the label rather than thrown to the far
     edge: `space-between` put a short label and a short pill against opposite edges of a 340px
     column, so four rows read as a table with a missing middle column. THE FILL IS A RUNG DOWN,
     NOT UP — the background ramp is shifted one rung between the two token sets — so the inset
     recesses rather than matching its own container. */
  .manager-tool-inspector-inherit-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-0);
  }

  /* `proto:2570`: `font: 600 11.5px var(--sans)`. */
  .manager-tool-inspector-inherit-row > span {
    min-width: 0;
    color: var(--fab-text);
    font-size: 11.5px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* `margin-top: auto` on a WRAPPER rather than the button: a class passed into a child as a prop
     never carries this block's scoping attribute, so the selector would be pruned as unused and
     `lint:svelte:warnings` would fail on it. */
  /* THE PANEL FILLS ITS COLUMN, which is what makes `margin-top: auto` mean anything: without it
     the card is content-height and the pinned action sits wherever the cards happen to end.
     `:global()` is REQUIRED rather than a loosening, because `InspectorCard` writes the element
     and the scoped form matches nothing; `:global(.a)` is still (0,1,0), so nothing moves. */
  :global(.manager-tool-browser-inspector) {
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

  /* STICKY RATHER THAN A SECOND FLEX TRACK, a constraint rather than a preference: ours is a
     single scrolling element, and turning that inside out would re-home the aside's overflow, its
     padding and the shared no-selection state. `margin-top: auto` keeps the band at the foot of a
     SHORT panel, and the negative side margins are the full-bleed band. */
  /* THE INSET COMPENSATES FOR THE NEGATIVE MARGIN; IT DOES NOT CANCEL ITSELF. A sticky element is
     pinned by its MARGIN box, so the negative `margin-bottom` that lets the border box rule the
     column edge to edge pulls the margin box's bottom above the painted one — and with `bottom: 0`
     the browser parked it on the scrollport edge, leaving the band short and content rendering
     under it. Measured, not reasoned. Dropping the margin and keeping the inset is NOT the same
     repair: without it the band cannot reach past its containing block at all, so a SHORT panel
     shows a strip of aside. Only this pair is flush in both cases, which
     `tests/components/tool-rules-list-parity.test.js` pins. */
  .manager-tool-inspector-foot {
    position: sticky;
    bottom: calc(-1 * var(--fab-space-4));
    margin: auto calc(-1 * var(--fab-space-4)) calc(-1 * var(--fab-space-4));
    min-width: 0;
    padding: var(--fab-space-3) var(--fab-space-4);
    border-top: 1px solid var(--fab-border);
    background: var(--fab-bg-1);
  }
</style>
