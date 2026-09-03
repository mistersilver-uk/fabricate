<!-- Svelte 5 runes mode -->
<script>
  import Chip from '../Chip.svelte';
  import EmptyState from '../EmptyState.svelte';
  import IconFactRow from '../IconFactRow.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';
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
    // THE PER-SECTION INHERIT TRUTH, which this panel could not state and the row beside it
    // already did (issue 1373). `inherited` is the membership record's own `inherit` map, read
    // by the root off the same world-projection join `ToolsBrowserView` reads for its
    // `Overrides breakage, prerequisites, check bonus` sentence.
    //
    // It is a SEPARATE prop from `tool`, and it has to be: the system's own Tool record carries
    // the RESOLVED values and cannot tell an inherited answer from an identical overridden one.
    // Without it the panel listed four rules with no marking at all, two of which read `No...`,
    // so a Tool overriding three sections was indistinguishable from one authoring nothing.
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
   * The four world-default sections, each with the state this system resolves it through.
   *
   * The section NAMES are `scopedStudio`'s tool descriptor's, restated here rather than
   * imported, for the reason `ToolsBrowserView` restates its own copy: this list is the
   * PRESENTATION order the design's `Inheritance` region reads in, and it is deliberately the
   * same four the row's sentence enumerates so the row and the panel cannot disagree about
   * which rules are the overrides.
   *
   * An ABSENT key reads as inheriting, matching `isSectionInherited` and `scopedInheritRows`.
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
  <InspectorCard
    class="manager-tool-browser-inspector"
    data-tool-browser-inspector=""
    data-tool-inspector-membership={row ? 'member' : 'absent'}
  >
    <!-- THE KICKER IS ITS OWN FULL-WIDTH LINE ABOVE THE BLOCK, which is where the design puts it
         and where the world catalogue's inspector already puts its own. It sat inside the copy
         column beside the medallion, so it read as a caption belonging to the name rather than as
         the panel's own head — and the two tool inspectors, a click apart, drew the same element
         two ways.

         `Selected tool`, not `Tool page`. The two screens had their kickers swapped: `Tool page`
         names the WORLD record and belongs on the world catalogue's inspector, while this panel
         is showing what one Tool resolves to INSIDE one crafting system. -->
    <p class="manager-kicker manager-tool-inspector-kicker" data-tool-inspector-kicker>
      {text('FABRICATE.Admin.Manager.Tools.InspectorKicker', 'Selected tool')}
    </p>
    <div class="manager-tool-inspector-hero">
      <img src={row?.img || unadopted?.entity?.img || ''} alt="" />
      <div>
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
          <!-- NEUTRAL, not `warning`. A world Tool this system has not adopted is an ordinary
               state with its own first-class row treatment and its own pinned CTA below; the
               reference tones this pill exactly as it tones a disabled one, and a warning
               tint here read as a defect in a Tool that has none (issue 1373). -->
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
          tile
          density="rule"
          dataAttr="data-tool-inspector-rule"
          dataValue={fact.id}
        />
      {/each}
    </div>
    <!--
      WHICH OF THOSE FOUR ARE THIS SYSTEM'S OWN (issue 1373).

      The rules above state what the Tool RESOLVES to here; they cannot state where each answer
      came from, because a section this system overrode to the world's own value resolves
      identically to one it inherits. The row one column to the left already claims `Overrides
      breakage, prerequisites, check bonus` — and the panel it opened listed four rules with no
      marking at all, so the claim was unverifiable on the screen that made it.

      A separate region rather than a pill on each rule row, which is where the reference puts
      it and is also the honest shape: `Inherited` qualifies the RULE, not the value, and a
      badge inside the value row reads as a property of the value.

      Members only. A Tool with no rules record here inherits nothing, and the rules above are
      already captioned `What it would inherit here`.
    -->
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
      <ManagerButton
        fullWidth
        data-tool-inspector-edit-world={subjectId}
        onclick={() => onEditWorldTool(subjectId)}
      >
        <i class="fas fa-globe" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Tools.EditWorldTool', 'Edit the world Tool')}</span>
      </ManagerButton>
    </div>
    <!--
      THE PANEL'S ONE TERMINAL ACTION, IN THE BAND THE DESIGN PINS IT TO (issue 1373).

      `proto:2578` is a footer OUTSIDE the scrolling column - `flex: 0 0 auto; padding: 13px
      17px; border-top: 1px solid var(--border)` - holding one primary button, and it is there
      for BOTH membership states: `proto:4896` labels it `Edit rules in {system}` for a member
      and `Add {tool} to {system}` for a Tool this system has no rules for. What shipped put the
      member's primary in the SCROLL FLOW, above the secondary, with no band and no rule; only
      the non-member's was pinned, and its band had neither the top border nor the full-bleed
      inset. So the panel's most important control moved position, emphasis and neighbours
      depending on which Tool was selected.

      `position: sticky` rather than a second flex track, because the aside itself is the
      scroller - see the note in the style block. The visual result is the design's: a band on
      the column's bottom edge, ruled off from the content that scrolls under it.

      THE MEMBER LABEL NAMES THE SYSTEM. `Edit rules` alone was ambiguous on the one screen
      where a Tool has rules in several systems at once and this panel is showing exactly one of
      them. It falls back to the bare verb when there is no system name to interpolate, which is
      what an isolated mount of this component has.
    -->
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
      'Choose a Tool to inspect its behaviour.'
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
  /* THE PANEL'S OWN HEAD, spanning the column above the medallion rather than sitting in the
     copy cell beside it.

     -- AND ITS TYPE IS THE SHARED CLASS'S (issue 1373) -----------------------------------
     `proto:2550`, `:2556` and `:2566` state every kicker in this panel identically:
     `font: 700 8.5px var(--sans); letter-spacing: .11em; text-transform: uppercase; color:
     var(--subtle)` - which is the reference's value for EVERY eyebrow it draws, not this
     rail's own. This block restated it while `.manager-kicker` went on rendering 11.52px
     untracked in the muted ink everywhere nobody had patched, so the rail measured correct
     and the screens one click away did not.

     The class carries the reference's type at the source now, and this block keeps only the
     LAYOUT the panel head needs: the margin the surrounding flow supplies instead, and the
     `min-width` a flex child needs before it is allowed to shrink.

     Restating the type here would have made that source fix unreachable rather than merely
     redundant: the sheet is imported at `layer(modules)` and this block is injected
     unlayered, so an unlayered declaration beats a layered one at ANY specificity, with no
     error and no failing test to say so. */
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

  /* The `Inheritance` region: one row per world-default section, the section name on the left
     and its state pill on the right. Deliberately a rung quieter than the rules above it - it
     qualifies them rather than adding a fifth. */
  .manager-tool-inspector-inheritance {
    display: grid;
    gap: var(--fab-space-1);
    min-width: 0;
  }

  /* `proto:2569-2571`: `gap: 9px; padding: 9px 11px; background: var(--bg1); border: 1px solid
     var(--border); border-radius: 9px`, with the state pill `flex: 0 0 auto` IMMEDIATELY AFTER
     the label rather than thrown to the far edge.

     `space-between` was the defect. In a 340px column it put ten or twelve characters of label
     against the left edge and a five-character pill against the right, with a hand's width of
     nothing between them, so four rows read as a table with a missing middle column instead of
     as four labelled facts.

     THE FILL IS A RUNG DOWN, NOT UP. The design's `--bg1` is our `--fab-bg-0` - the background
     ramp is shifted one rung between the two token sets - and the aside above it is
     `--fab-bg-1`, so the inset recesses. It had been painted the same value as its own
     container, which is the same inversion `IconFactRow`'s `rule` density corrects.

     9px and 11px have no step on the 4px spacing scale and take their nearest, 8 and 12. */
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

  /* `margin-top: auto` on a WRAPPER rather than on the button: a class passed into a child
     component as a prop never receives this block's scoping attribute, so the selector would
     be pruned as unused and `lint:svelte:warnings` would fail on it. */
  /* THE PANEL FILLS ITS COLUMN, which is what makes `margin-top: auto` below mean anything.
     Without it the card is content-height, the foot has no slack to be pushed into, and the
     pinned action sits wherever the cards happen to end - which is what a first render of this
     change showed. `.manager-inspector` is a flex column, so growing is all this needs.

     `:global()` is REQUIRED and is not a loosening. The card element is written by
     `InspectorCard` (issue 1427), not by this template, so this class reaches it through the
     primitive's `class` prop and never carries this block's scoping attribute; the scoped form
     compiles to a selector that matches nothing and the panel silently stops filling its
     column. Specificity is preserved exactly: `:global(.a)` is still (0,1,0), so the rule wins
     and loses against everything it did before. `EditorTabs.svelte` repairs the same hazard the
     same way. */
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

  /* `proto:2578`: `flex: 0 0 auto; padding: 13px 17px; border-top: 1px solid var(--border)`.

     STICKY RATHER THAN A SECOND FLEX TRACK, and that is a constraint rather than a preference.
     The design's aside is a two-track column - a scroller plus a footer - while ours is a
     single scrolling element with the panel inside it, and turning that inside out would mean
     re-homing the aside's overflow, its padding and the no-selection empty state that shares
     it. Sticky reaches the same rendered result from the shape we have: the band sits at the
     bottom of the column, ruled off, with the panel scrolling under it. `margin-top: auto`
     keeps it at the foot of a SHORT panel too, where there is nothing to scroll and a sticky
     offset alone would leave it floating under the last card.

     The negative side margins are the design's full-bleed band: they cancel the aside's own
     16px inset so the rule spans the column rather than stopping short of it, which is why
     that inset is stated as a scale token in `styles/fabricate.css` and repeated here as the
     same token rather than as a second raw number. 13px and 17px take the scale's nearest
     steps, 12 and 16. */
  /* THE INSET COMPENSATES FOR THE NEGATIVE MARGIN; IT DOES NOT CANCEL ITSELF.

     A sticky element is pinned by its MARGIN box, not its border box. `margin-bottom` here is
     negative so the band's border box can reach past the aside's own 16px inset and rule the
     column edge to edge - which pulls the margin box's bottom 16px ABOVE the painted one. With
     `bottom: 0` the browser therefore parked the margin box on the scrollport's bottom edge and
     left the band itself 16px short, so scrolled content went on rendering underneath it inside
     the aside. Measured, not reasoned: 16px of an inheritance row below the band, and a hit test
     two pixels above the column's bottom returning the aside rather than the band.

     The matching negative inset moves the constraint edge down by the same amount. Dropping the
     margin and keeping the inset is NOT the same repair and was measured too: without the
     negative margin the band cannot reach past its containing block's content edge at all, so a
     SHORT panel goes back to showing a strip of aside beneath it. Only this pair is flush in
     both cases, which is what the two band tests in
     `tests/components/tool-rules-list-parity.test.js` pin. */
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
