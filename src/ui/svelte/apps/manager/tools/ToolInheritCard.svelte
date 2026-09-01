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
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Chip from '../Chip.svelte';
  import IconFactRow from '../IconFactRow.svelte';
  import InheritRow from '../scoped/InheritRow.svelte';

  let {
    section = '',
    icon = '',
    title = '',
    subtitle = '',
    inheritable = false,
    inherited = {},
    fact = null,
    hint = false,
    disabled = false,
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
  const isInherited = $derived(inheritable && inherited?.[section] !== false);
  const worldDefaultLine = $derived(
    formattedText(
      'FABRICATE.Admin.Manager.Tools.Editor.WorldDefaultValue',
      { value: String(fact?.value ?? '').toLocaleLowerCase() },
      'World default: {value}'
    )
  );
</script>

<section
  class="manager-tool-rule-card"
  class:is-inheriting={isInherited}
  data-tool-rule-card={section}
  data-tool-rule-state={inheritable ? (isInherited ? 'inheriting' : 'overridden') : 'local'}
>
  <div class="manager-tool-rule-card-head">
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
    {#if inheritable}
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
  </div>

  {#if isInherited}
    <div class="manager-tool-rule-card-inherited" data-tool-rule-inherited={section}>
      <IconFactRow
        icon="fas fa-globe"
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
