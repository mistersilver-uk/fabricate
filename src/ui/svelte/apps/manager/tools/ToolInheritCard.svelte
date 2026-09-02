<!-- Svelte 5 runes mode -->
<!--
  ONE BEHAVIOUR SECTION OF THE SYSTEM TOOL RULES EDITOR, AS A CARD (issue 1373).

  == WHY THIS COMPONENT EXISTS AT ALL ========================================================
  The design draws every behaviour section of this editor as a bordered, filled card whose
  header states four things at once: what the section is, whether this system INHERITS the
  world Tool's answer or OVERRIDES it, what the world's answer actually is, and the switch that
  moves between the two. The screen shipped four bare headings on the page background with the
  controls loose beneath them and no inheritance affordance anywhere — a screen that could not
  express the model it sits on, while the rules LIST one route away already advertised
  `Inherits world defaults` and `What it would inherit here`.

  There are FOUR such sections (`breakage`, `onBreak`, `prerequisites`, `bonus`), across two
  tabs. Four copies of this markup is the `.svelte` duplication a reviewer catches and the
  Sonar gate does not, so the card is a component and the two tabs are its callers.

  == THE SWITCH IS THE SHARED `InheritRow`, NOT A SECOND ONE =================================
  `scoped/InheritRow` is the shipped inherit control for all six scoped-entity editors. It is
  rendered here with `section` (one row, not the whole set), `stateChip={false}` (this card
  carries the state pill in its own title line, and two pills a line apart saying the same
  thing is the duplication that flag exists to avoid) and `headings` (its default head is the
  section NAME, which this card's own `<h3>` already says; the head states the world default
  instead). Those are the essence rules editor's own three props, used the same way.

  Its layout inside this head is done in `styles/fabricate.css`, not here: Svelte stamps its
  scoping hash only on the elements a component itself writes, so a scoped rule in this file
  could not reach `InheritRow`'s `.manager-scoped-inherit-*` elements at all. The rule there
  puts the row on `display: contents` so its three children become grid items of this head —
  which is how the switch lands on the title line rather than under it.

  == INHERITING HIDES THE CONTROLS, AND THAT IS A TRUTH CLAIM ================================
  While a section inherits, the body is the world value, read only. It is not "the controls,
  disabled": `## CraftingSystem` requirement 36 keeps the IN-SYSTEM record authoritative, so a
  control a GM could still reach would let this system diverge from a world default the pill is
  simultaneously claiming it follows. The editor's own toggle handler keeps the in-system record
  equal to the world value for as long as the switch is on, so the claim stays true.

  Props:
   - section: the world-default section this card governs. Also its `data-tool-rule-card` value.
   - icon / title / subtitle: the card's own heading. `subtitle` is the descriptive line shown
     when the card carries NO inherit affordance; an inheritable card states the world default
     there instead, through `InheritRow`'s head.
   - eyebrow: an uppercase micro-label ABOVE the title (issue 1373, maintainer round 2). The
     design heads each Requirements section with a short WORD over a sentence-case TITLE -
     `Prerequisites` over `Character prerequisites` (`proto:2324`), `Bonus` over `Bonus to the
     check` (`proto:2350`), and the same anatomy again at system scope (`proto:2860`,
     `proto:2886`). Ours had the two inverted: the sentence, uppercased, as the only heading.
     Supplying an eyebrow also puts the title into the design's `600 13px` sans rather than the
     display face, because the uppercase kicker treatment now belongs to the line above it.
     Empty by default, so the Breakage tab's four cards are unchanged.
   - control: an OPTIONAL snippet rendered on the header row, at its right edge. The design puts
     each section's own enable switch there rather than on a second heading row inside the body
     (`proto:2325`, `proto:2351`). A card that CAN inherit already spends that slot on the
     inherit switch - a different question, and two identical switches one line apart is the
     confusion this card's head was built to avoid - so its caller keeps the enable switch as
     the first row of the body and passes no `control`. See `ToolRequirementsTab`.
   - flush: draw no border, no radius, no fill and no horizontal padding, so a caller can stack
     several sections inside ONE card with a rule between them. The design draws the whole
     Requirements tab as a single `padding: 15px` card whose two sections are separated by
     `margin-top: 15px; padding-top: 14px; border-top: 1px solid var(--border)` (`proto:2322`,
     `proto:2349`); a card per section put three nested edges where the design draws one.
   - headingStyle: `'title'` — the system rules editor's sentence-case bold, and the default —
     or `'kicker'`, the uppercase micro-label the WORLD entry sets every card heading in.
     The two design frames genuinely differ here, and mounting this card unchanged put two
     heading idioms on one world screen (issue 1373). It is the CALLER's answer rather than a
     scope test in here, on the same argument as `ToolBehaviorPreview`'s copy overrides.
   - inheritable: whether this `(tool, system)` pair has a world membership record to inherit
     through. `false` for a pre-migration in-system Tool with no world half, which has nothing
     to inherit FROM — the card then renders its controls with no switch and no pill, exactly
     as the screen did before.
   - inherited: the membership record's `inherit` map, passed straight through.
   - fact: what the section resolves to while inheriting — `{icon, title, subtitle, value}`.
   - hint: whether the inset row carries the long "Flip the switch" sentence. The design states
     it once per tab, on the first inheriting card, and states the short form on the rest.
   - disabled: while the editor is saving.
   - onToggle(section, nextInherit): the switch.
   - children: the section's controls, rendered ONLY when the section is overridden.
   - localInherit: `null` for a real world-default SECTION, which resolves its state through
     `inherited` and renders the shared `InheritRow`. A boolean for a card whose overridable
     fact is NOT in the membership record's `inherit` map — today exactly one, the per-system
     DISPLAY LABEL, whose "inheriting" state is simply that no override is stored. See the
     paragraph below.
   - toggleLabel: the accessible name of the local switch. Ignored for a section card, which
     takes `InheritRow`'s own.

  == THE LOCAL SWITCH, AND WHY IT IS NOT A NEW `inherited` SECTION ============================
  `InheritRow` renders exactly the sections `scopedStudio`'s descriptor declares for the entity
  type, and it is right to: those names are the membership record's `inherit` KEYS, read by the
  resolver. The per-system display label is an override with no such key — it is stored as a
  value or not stored at all — so adding `label` to that descriptor would mint an inherit flag
  the model does not hold and would put a label row on the WORLD scoped editors too.

  The card therefore writes the switch itself, in `InheritRow`'s OWN element tree
  (`.manager-scoped-inherit-row` > `.manager-scoped-inherit-head` > `.manager-scoped-inherit-label`
  plus a bare `StatusToggle`) so the head's `display: contents` grid rule in
  `styles/fabricate.css` places it identically. Same idiom, same pixels, same polarity — ON is
  OVERRIDDEN — without a second inherit vocabulary underneath it.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Chip from '../Chip.svelte';
  import IconFactRow from '../IconFactRow.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import InheritRow from '../scoped/InheritRow.svelte';

  let {
    section = '',
    icon = '',
    title = '',
    subtitle = '',
    eyebrow = '',
    flush = false,
    control = undefined,
    inheritable = false,
    inherited = {},
    fact = null,
    hint = false,
    disabled = false,
    localInherit = null,
    toggleLabel = '',
    // Whether `World default: {value}` lower-cases the value it interpolates. True for a rule
    // ("World default: unlimited uses"), which reads as a sentence; false for a card whose
    // world value is a PROPER NOUN — the display-label card states a Tool's actual name, and
    // "World default: anvil" is a different word from the one on the world record.
    lowercaseFact = true,
    headingStyle = 'title',
    onToggle = () => {},
    children,
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

  // An ABSENT key reads as inheriting, matching `isSectionInherited` and `scopedInheritRows`.
  // A card with no world membership record is never inheriting: there is no parent.
  const isLocal = $derived(localInherit !== null);
  const isInherited = $derived(
    inheritable && (isLocal ? localInherit === true : inherited?.[section] !== false)
  );
  const worldDefaultLine = $derived(
    formattedText(
      'FABRICATE.Admin.Manager.Tools.Editor.WorldDefaultValue',
      {
        value: lowercaseFact
          ? String(fact?.value ?? '').toLocaleLowerCase()
          : String(fact?.value ?? ''),
      },
      'World default: {value}'
    )
  );
</script>

<section
  class="manager-tool-rule-card"
  class:is-inheriting={isInherited}
  class:is-flush={flush}
  class:has-eyebrow={Boolean(eyebrow)}
  data-tool-rule-card={section}
  data-tool-rule-state={inheritable ? (isInherited ? 'inheriting' : 'overridden') : 'local'}
>
  <div class="manager-tool-rule-card-head">
    {#if eyebrow}
      <p class="manager-kicker manager-tool-rule-card-eyebrow" data-tool-rule-eyebrow={section}>
        {eyebrow}
      </p>
    {/if}
    <div class="manager-tool-rule-card-title">
      <!-- `manager-kicker` is the shipped uppercase micro-label class and rides the SAME `<h3>`
           rather than replacing it with a paragraph: the card's heading is a heading in both
           faces, and only its treatment differs. -->
      <h3 class={headingStyle === 'kicker' ? 'manager-kicker' : ''}>
        {#if icon}<i class={icon} aria-hidden="true"></i>{/if}{title}
      </h3>
      {#if inheritable}
        <Chip
          tone={isInherited ? 'neutral' : 'accent'}
          data-tool-rule-chip={isInherited ? 'inheriting' : 'overridden'}
          >{isInherited
            ? text('FABRICATE.Admin.Manager.Tools.Editor.Inheriting', 'Inheriting')
            : text('FABRICATE.Admin.Manager.Tools.Editor.Overriding', 'Overridden')}</Chip
        >
      {/if}
    </div>
    {#if inheritable && isLocal}
      <div class="manager-scoped-inherit-row" data-scoped-inherit-row={section}>
        <div class="manager-scoped-inherit-head">
          <span class="manager-scoped-inherit-label">{worldDefaultLine}</span>
        </div>
        <StatusToggle
          on={!isInherited}
          ariaLabel={toggleLabel}
          title={toggleLabel}
          {disabled}
          data-scoped-inherit-toggle={section}
          onclick={() => onToggle(section, !isInherited)}
        />
      </div>
    {:else if inheritable}
      <InheritRow
        entityType="tool"
        {section}
        stateChip={false}
        {inherited}
        headings={{ [section]: worldDefaultLine }}
        {disabled}
        {onToggle}
      />
    {:else if subtitle}
      <p class="manager-tool-rule-card-sub">{subtitle}</p>
    {/if}
    {@render control?.()}
  </div>

  {#if isInherited}
    <div class="manager-tool-rule-card-inherited" data-tool-rule-inherited={section}>
      <!-- BARE GLYPH, INFO TONE. The rail's rule rows one column over draw a bordered tile in
           the ACCENT hue, and that contrast is the point: an accent-toned mark in a tile is a
           fact this system authored, while the cooler informational globe with no tile is the
           reference's mark for a value that came from somewhere else. Ours drew a tan globe,
           the same hue as the value beside it (issue 1373). -->
      <IconFactRow
        icon="fas fa-globe"
        tone="info"
        title={fact?.title || ''}
        subtitle={hint
          ? text(
              'FABRICATE.Admin.Manager.Tools.Editor.FollowingWorldHint',
              'Following the world Tool. Flip the switch to set this system’s own.'
            )
          : text(
              'FABRICATE.Admin.Manager.Tools.Editor.FollowingWorld',
              'Following the world Tool.'
            )}
      />
    </div>
  {:else}
    <div class="manager-tool-rule-card-body">
      {@render children?.()}
    </div>
  {/if}
</section>

<style>
  /* -- THE EYEBROW FACE (issue 1373, maintainer round 2, E3) ------------------------------
     The head is a two-column grid in `styles/fabricate.css`, and its rows are placed there by
     rule rather than by source order. Adding a third line therefore has to re-place all of them
     from here, under a modifier class so the four Breakage cards - which pass no eyebrow - are
     untouched. Every rule below is anchored on two classes this component writes, which puts it
     at (0,4,0) against the sheet's (0,2,0) and (0,3,0), so none of it depends on injection
     order. `:global()` marks the elements `InheritRow` and `StatusToggle` write.

     Row 1 is the eyebrow, row 2 the title line, row 3 the descriptive line - the subtitle at
     world scope, `InheritRow`'s `World default:` head at system scope. The head's one control
     spans all three, which is where the design centres it (`proto:2323`). */
  /* -- AND ITS TYPE, WHICH `.manager-kicker` GETS WRONG FOR THIS HEAD (round 5) -----------
     `proto:2324` states every section eyebrow on this tab as `font: 700 8.5px var(--sans);
     letter-spacing: .11em; text-transform: uppercase; color: var(--subtle)`, and `proto:2860`
     states the system twin identically. The shared `.manager-kicker` is `0.72rem` — 11.52px,
     35% over — with NO tracking at all and the MUTED ink, so both section heads read as small
     headings rather than as the quiet rules they are.

     NARROWED HERE, never on the shared class, which has callers on every other manager screen
     whose own reference frames measured them. `ToolBrowserInspector.svelte` already does exactly
     this for the Tool inspector rail and `styles/fabricate.css:3316` for the Checks rail; this is
     the third site, stating the reference's own figures rather than borrowing another rail's.

     The cascade happens to favour a scoped rule here — the sheet is imported at `layer(modules)`
     and this block is injected unlayered, so it wins whatever the specificity — but the rule is
     anchored on two classes this component writes anyway, which is (0,3,0) against the sheet's
     (0,2,0). `tests/components/manager-layout.test.js` reads the COMPILED scoped CSS. */
  .manager-tool-rule-card.has-eyebrow .manager-tool-rule-card-eyebrow {
    grid-column: 1;
    grid-row: 1;
    min-width: 0;
    margin: 0;
    color: var(--fab-text-subtle);
    font-size: 8.5px;
    letter-spacing: 0.11em;
  }

  /* THE HEAD'S OWN RHYTHM (round 5). `proto:2323` gives the header row `gap: 11px` — the sheet's
     `--fab-space-3` column gap already — and `proto:2324` puts `margin-top: 3px` under the
     eyebrow and NOTHING between the title and the description. The sheet's uniform 2px row gap
     cannot say that, so the has-eyebrow face zeroes it and the title states its own step: 3px
     rounds to the 4px scale's `--fab-space-1`, which is the nearest rung. */
  .manager-tool-rule-card.has-eyebrow .manager-tool-rule-card-head {
    row-gap: 0;
  }

  .manager-tool-rule-card.has-eyebrow .manager-tool-rule-card-title {
    grid-row: 2;
    margin-top: var(--fab-space-1);
  }

  .manager-tool-rule-card.has-eyebrow .manager-tool-rule-card-sub {
    grid-row: 3;
  }

  .manager-tool-rule-card.has-eyebrow
    .manager-tool-rule-card-head
    :global(.manager-scoped-inherit-head) {
    grid-row: 3;
  }

  .manager-tool-rule-card.has-eyebrow .manager-tool-rule-card-head :global(.manager-status-toggle) {
    grid-row: 1 / -1;
  }

  /* THE TITLE IS THE SENTENCE AND THE EYEBROW IS THE WORD. `proto:2324` sets the title at
     `600 13px var(--sans); color: var(--text)`, which is 0.82rem against the 16px root - not
     the serif display face the sheet gives a bare rule card, and not the uppercase kicker the
     world entry gives one, because the kicker treatment has moved to the line above. */
  .manager-tool-rule-card.has-eyebrow .manager-tool-rule-card-title h3 {
    color: var(--fab-text);
    font-family: var(--fab-font-sans);
    font-size: 0.82rem;
    font-weight: 600;
    letter-spacing: normal;
    text-transform: none;
  }

  /* -- THE FLUSH FACE ---------------------------------------------------------------------
     No box of its own, so the caller's single card is the only edge on the tab. The head and
     body keep their VERTICAL rhythm and lose their horizontal inset, which the containing card
     supplies once instead of once per section. */
  .manager-tool-rule-card.is-flush {
    border: 0;
    border-radius: 0;
    background: none;
  }

  .manager-tool-rule-card.is-flush .manager-tool-rule-card-head {
    padding: 0;
  }

  /* `proto:2323` closes the header row with `margin-bottom: 9px`, which is the 4px scale's
     `--fab-space-2`. The head has no bottom padding in this face, so the body's top padding IS
     that gap, and it was `--fab-space-3` — a third over the reference on both sections. */
  .manager-tool-rule-card.is-flush .manager-tool-rule-card-inherited,
  .manager-tool-rule-card.is-flush .manager-tool-rule-card-body {
    padding: var(--fab-space-2) 0 0;
  }
</style>
