<!--
  ONE BEHAVIOUR SECTION OF THE SYSTEM TOOL RULES EDITOR, AS A CARD, whose header states four
  things at once: what the section is, whether this system INHERITS the world Tool's answer or
  OVERRIDES it, what the world's answer is, and the switch that moves between the two. The screen
  shipped four bare headings with no inheritance affordance at all, while the rules LIST one route
  away already advertised `Inherits world defaults`. There are FOUR such sections across two tabs,
  so the card is a component and the two tabs are its callers.

  THE SWITCH IS THE SHARED `InheritRow`, NOT A SECOND ONE, rendered with `section` (one row),
  `stateChip={false}` (this card carries the state pill in its own title line) and `headings` (its
  default head is the section NAME, which this card's `<h3>` already says). Its layout inside this
  head lives in `styles/fabricate.css`, not here: Svelte stamps its hash only on elements a
  component itself writes, so a scoped rule could not reach `InheritRow`'s elements at all. That
  rule puts the row on `display: contents`, which is how the switch lands on the title line.

  INHERITING HIDES THE CONTROLS, AND THAT IS A TRUTH CLAIM. While a section inherits, the body is
  the world value, read only — not "the controls, disabled": `data-models/spec.md`
  `## CraftingSystem` requirement 36 keeps the IN-SYSTEM record authoritative, so a control a GM
  could still reach would let this system diverge from a default the pill claims it follows.

  THE LOCAL SWITCH IS NOT A NEW `inherited` SECTION. `InheritRow` renders exactly the sections the
  descriptor declares, and those names are the membership record's `inherit` KEYS. The per-system
  display label is an override with no such key — stored as a value or not stored at all — so
  adding it would mint an inherit flag the model does not hold and put a label row on the WORLD
  editors too. The card writes that switch itself, inside `InheritRow`'s OWN element tree so the
  head's `display: contents` grid rule places it identically, with ON meaning OVERRIDDEN.

  Props: section (also its `data-tool-rule-card` value); icon / title / subtitle, where `subtitle`
  is the line shown when the card carries NO inherit affordance; eyebrow, an uppercase micro-label
  ABOVE the title, which also puts the title into the design's sans rather than the display face;
  control, an OPTIONAL snippet on the header row, which a card that CAN inherit never passes,
  because that slot is already the inherit switch and two identical switches one line apart is the
  confusion this head was built to avoid; flush, which draws no box so a caller can stack sections
  inside ONE card; headingStyle, the CALLER's answer rather than a scope test in here;
  inheritable, `false` for a pre-migration Tool with no world half to inherit FROM; inherited;
  fact, what the section resolves to while inheriting; hint, the long sentence the design states
  once per tab; disabled; onToggle(section, nextInherit); children, rendered ONLY when overridden;
  localInherit, `null` for a real world-default SECTION and a boolean for the display-label card;
  and toggleLabel, ignored for a section card, which takes `InheritRow`'s own.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Chip from '../../../components/Chip.svelte';
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
    // Whether `World default: {value}` lower-cases what it interpolates: true for a rule, which
    // reads as a sentence, and false for a PROPER NOUN such as a Tool's actual name.
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
      <!-- `manager-kicker` rides the SAME `<h3>` rather than replacing it with a paragraph: the
           card's heading is a heading in both faces, and only its treatment differs. -->
      <h3 class={headingStyle === 'kicker' ? 'manager-kicker' : ''}>
        {#if icon}<i class={icon} aria-hidden="true"></i>{/if}{title}
      </h3>
      {#if inheritable}
        <!-- THE DESIGN'S OWN TWO FAMILIES: the info family while inheriting and the WARNING
             family once overridden. The list inspector one column over already reads that pair,
             so a `neutral` / `accent` pill here put one model in two colour vocabularies. -->
        <Chip
          tone={isInherited ? 'info' : 'warning'}
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
      <!-- BARE GLYPH, INFO TONE, and the contrast is the point: an accent-toned mark in a tile is
           a fact this system authored, where the cooler informational glyph with no tile is the
           mark for a value that came from somewhere else. AND IT IS THE `rule` DENSITY, the
           variant `IconFactRow` shipped for the two Tool rails: the default missed five of its
           six values, and the FILL by a rung, raising a well the design recesses. -->
      <IconFactRow
        icon="fas fa-globe"
        tone="info"
        density="rule"
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
  /* THE EYEBROW FACE. The head is a two-column grid in `styles/fabricate.css` whose rows are
     placed by rule rather than source order, so a third line has to re-place all of them from
     here, under a modifier class that leaves the eyebrow-less cards untouched. Every rule is
     anchored on two classes this component writes, which puts it at (0,4,0) against the sheet's
     (0,2,0) and (0,3,0), so none of it depends on injection order. Row 1 is the eyebrow, row 2 the
     title line, row 3 the descriptive line, and the head's one control spans all three. */
  /* AND ITS TYPE IS THE SHARED CLASS'S, NOT A THIRD COPY OF IT. This block used to restate the
     reference's eyebrow value, and so did two more sites, while `.manager-kicker` went on
     rendering something else everywhere nobody had patched — which put two eyebrows at two sizes
     on one screen. Leaving even one type declaration here would make the source fix UNREACHABLE
     rather than redundant: the sheet is imported at `layer(modules)` and this block is injected
     unlayered, which beats it at ANY specificity, silently. */
  .manager-tool-rule-card.has-eyebrow .manager-tool-rule-card-eyebrow {
    grid-column: 1;
    grid-row: 1;
    min-width: 0;
    margin: 0;
  }

  /* THE HEAD'S OWN RHYTHM: a step under the eyebrow and NOTHING between the title and the
     description, which the sheet's uniform row gap cannot say — so the has-eyebrow face zeroes
     that gap and the title states its own step. */
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

  /* THE TITLE IS THE SENTENCE AND THE EYEBROW IS THE WORD: not the serif display face the sheet
     gives a bare rule card, and not the uppercase kicker, which has moved to the line above. */
  .manager-tool-rule-card.has-eyebrow .manager-tool-rule-card-title h3 {
    color: var(--fab-text);
    font-family: var(--fab-font-sans);
    font-size: 0.82rem;
    font-weight: 600;
    letter-spacing: normal;
    text-transform: none;
  }

  /* THE FLUSH FACE: no box of its own, so the caller's single card is the only edge on the tab,
     and the horizontal inset is the containing card's once rather than each section's. */
  .manager-tool-rule-card.is-flush {
    border: 0;
    border-radius: 0;
    background: none;
  }

  .manager-tool-rule-card.is-flush .manager-tool-rule-card-head {
    padding: 0;
  }

  /* The head has no bottom padding in this face, so the body's top padding IS the header row's
     closing gap. */
  .manager-tool-rule-card.is-flush .manager-tool-rule-card-inherited,
  .manager-tool-rule-card.is-flush .manager-tool-rule-card-body {
    padding: var(--fab-space-2) 0 0;
  }
</style>
