<!-- Svelte 5 runes mode -->
<!--
  ONE summary row for a complication (issue 1286): severity tile · name · one body line ·
  optional Player pill · severity pill · the activity glyph run, plus — in the authoring
  variant only — a disclosure and a delete control.

  ## ONE SCAFFOLD, not a copy per variant

  There are SIX call sites for this shape across the two PRs: the Component Studio's
  authoring row, the Component Studio's read-only salvage strip, the Recipe Studio's stage
  strip, the player's per-stage strip, the player's bulk row and the player's crafting
  strip. Three `{#if}` branches each restating the shell is intra-file duplication and
  SonarCloud's copy-paste detector reads `.svelte` — issue 1050 failed that gate at 5.3%
  with 93 of 98 duplicated lines inside ONE component — so `variant` selects slot content
  and pill treatment ONLY. The Recipe Studio strip's `From {source}` line is an `eyebrow`
  PROP for the same reason; it is not a fourth variant, because the two GM strips are
  otherwise structurally identical.

  ## THE BODY SLOT IS TYPED, and that is a disclosure control

  GM variants render the generated TRIGGER SENTENCE ("When the award is missed or 1d20 = 1
  · rolls 2d6"). The player variant renders the authored DESCRIPTION. The two are never
  interchangeable and a player must never be shown the trigger, so this component takes
  them as two separate props and picks by variant, rather than accepting one `body` string
  a call site could pass the wrong thing to. Typing the slot is what makes the wrong call
  unspellable at the call site instead of merely discouraged in a comment.

  ## THE ROW IS A `<div>` AND THE DISCLOSURE IS THE ONLY TRIGGER

  The prototype makes its summary row whole-row clickable AND puts a Remove control inside
  it. A whole-row `<button>` would therefore nest buttons — invalid DOM that
  `createElement` accepts and no mounted test notices. So the row stays a `<div>`,
  `RowDisclosure` (which renders a real `<button>` and documents that it must not nest) is
  the sole disclosure trigger, and the delete control is its SIBLING. `RowDisclosure`'s own
  docblock named this row as the site that would adopt it.

  String props are PRE-LOCALIZED by the caller, on the `ToggleCard` precedent, so this
  stays a presentational leaf with no `localize` import.

  Props:
   - variant: `authoring` (Component Studio), `readonly-gm` (both GM read-only strips) or
     `player`.
   - nameEmphasis: `display` (default) or `inline`, the NAME's type treatment.
     The prototypes draw the same row's name two ways and the difference is not derivable
     from `variant`: an ACCORDION row's name is the heading of a thing you are about to
     open, drawn in the serif display face at 12.5px, while a STRIP's name is one run of
     metadata on a row about something else, drawn in the host sans at 11.5px. A shared
     primitive that picked from `variant` would be hard-coding a treatment behind a
     semantic flag — the next consumer wanting a strip-shaped row with a display name, or
     an accordion with an inline one, would have no way to say so and would reach for a
     call-site override, which is the drift this prop exists to prevent. `display` is the
     default because it is what the one call site that existed first passes.
     (The two GM strips' prototypes disagree by half a pixel — the Component Studio's
     salvage strip draws 11px and the Recipe Studio's stage strip 11.5px. `inline` is one
     treatment at 11.5px rather than two: a second emphasis for half a pixel between two
     separately-drawn prototype documents would make this prop unusable for the reason it
     was added.)
   - severity / severityLabel: the `minor | major | severe` token and its localized word.
   - visibility: `gmOnly | visible`. The Player pill renders on the GM variants only — a
     player being told "you can see this" is noise, and on a GM screen it is the fact that
     matters most about the row.
   - triggerSentence / description: the typed body, above.
   - activities: `[{ icon, title, dim }]` — which activities the complication is enabled
     for, with `dim` for one the system does not resolve progressively.
   - statusLabel / statusTone: the TENSE chip and its `Chip` tone (issue 1286, PR 2).
     The player band says WHEN as well as WHAT — "This can go wrong" before a roll,
     "This happened" / "This didn't happen" after one — and the tense is deliberately
     NOT derivable from `variant`: a player row renders all three, and the GM variants
     render none. It is also deliberately not folded into the severity tile, which is
     one vocabulary across all six call sites: a tile recoloured by tense would make one
     control say two things, and a `severe` complication that has not fired would be
     indistinguishable from a `minor` one that has. The chip renders FIRST, before the
     severity chip, so a positional selector can address either without encoding tone.
   - bodyClamp: 0 (default) clips the body to ONE line with an ellipsis; N > 0 WRAPS it
     and clamps it to N lines. The default is the GM treatment and is right for it — a
     GM scanning trigger sentences they wrote needs the row height not to move — and it
     is wrong for the player, where the description IS the disclosure and an ellipsis at
     roughly sixty characters in a 300px column removes it. Like `nameEmphasis`, this is
     not derivable from `variant`: it is a width decision belonging to the column the row
     is placed in, and a call site that could not say so would reach for an override.
   - expanded / controls / disclosureLabel / onToggle: the authoring disclosure.
   - onDelete / deleteLabel: the authoring delete control. Absent renders no button.
   - children: the expanded editor body, rendered inside the row's card when open.

  ## WHERE THE CHIPS SIT IS A WIDTH DECISION, and the player's differs

  On a GM strip the chips are the LINE's trailing items, beside the copy column. In the
  player inspector — a 300px column — that leaves the copy roughly 120px of 298 once the
  border, the padding, the 30px severity tile and the gap are paid, against the 259 the
  prototype gives it. That is the same failure that made `stacked` necessary on the stage
  row itself. So in the `player` variant the chips move INSIDE the copy column, onto the
  name's line, where they share the column's full width and wrap under the name rather
  than competing with it. The chip markup is a snippet rendered in one of two places, not
  two copies: SonarCloud's copy-paste detector reads `.svelte`.
-->
<script>
  import Chip from './Chip.svelte';
  import RowDisclosure from '../../components/RowDisclosure.svelte';

  let {
    variant = 'authoring',
    nameEmphasis = 'display',
    name = '',
    severity = 'minor',
    severityLabel = '',
    visibility = 'gmOnly',
    playerLabel = '',
    playerTitle = '',
    triggerSentence = '',
    description = '',
    bodyClamp = 0,
    eyebrow = '',
    statusLabel = '',
    statusTone = 'neutral',
    activities = [],
    expanded = false,
    controls = '',
    disclosureLabel = '',
    onToggle = () => {},
    onDelete = null,
    deleteLabel = '',
    disabled = false,
    dataAttr = '',
    dataValue = '',
    children = undefined,
  } = $props();

  // Severity is a NARRATIVE gravity axis and is deliberately never routed through a helper
  // shared with `systemValidation.js`'s `critical|warning|info` or `main.js`'s `warn|info`
  // notice channel. The mapping is stated here, once, for the whole feature.
  const SEVERITIES = Object.freeze({
    minor: { tone: 'info', icon: 'fas fa-circle-exclamation' },
    major: { tone: 'warning', icon: 'fas fa-triangle-exclamation' },
    severe: { tone: 'danger', icon: 'fas fa-skull' },
  });

  const gravity = $derived(SEVERITIES[severity] || SEVERITIES.minor);
  const isAuthoring = $derived(variant === 'authoring');
  const isPlayer = $derived(variant === 'player');
  // The typed body. `isPlayer` decides, so no call site can hand the player the trigger.
  const body = $derived(isPlayer ? description : triggerSentence);
  const showPlayerPill = $derived(!isPlayer && visibility === 'visible' && Boolean(playerLabel));
  // Normalized here rather than trusted: the value reaches CSS through a custom property,
  // so a non-numeric one would emit an invalid declaration instead of falling back.
  const clampLines = $derived(
    Number.isFinite(Number(bodyClamp)) && Number(bodyClamp) > 0 ? Math.floor(Number(bodyClamp)) : 0
  );
  const hookAttributes = $derived(dataAttr ? { [dataAttr]: dataValue || true } : {});
</script>

<!-- ONE chip run, rendered in one of two places. The TENSE chip leads the severity chip so
     that a positional selector — the parity spec's `pi-strip-badge` (first) and
     `pi-bulk-row-severity` (last) — can address either without naming a tone, which would
     encode the very fact being measured. -->
{#snippet chips()}
  {#if showPlayerPill}
    <Chip tone="neutral" icon="fas fa-eye" title={playerTitle || undefined} truncate
      >{playerLabel}</Chip
    >
  {/if}
  {#if statusLabel}
    <Chip tone={statusTone} truncate>{statusLabel}</Chip>
  {/if}
  {#if severityLabel}
    <Chip tone={gravity.tone} truncate>{severityLabel}</Chip>
  {/if}
{/snippet}

<div
  class="fab-complication-row is-{variant} is-gravity-{gravity.tone}"
  class:is-expanded={expanded}
  data-complication-row={variant}
  {...hookAttributes}
>
  <div class="fab-complication-row-line">
    <span class="fab-complication-severity is-{gravity.tone}" aria-hidden="true"
      ><i class={gravity.icon}></i></span
    >
    <span class="fab-complication-row-copy">
      {#if eyebrow}<span class="fab-complication-row-eyebrow">{eyebrow}</span>{/if}
      <!-- `display: contents` on every variant but `player`, so the GM strips' copy column
           is the two children it has always been and no rule keyed on it moves. -->
      <span class="fab-complication-row-headline">
        <span class="fab-complication-row-name is-{nameEmphasis}">{name}</span>
        {#if isPlayer}{@render chips()}{/if}
      </span>
      <!-- `title` carries the FULL string in BOTH treatments: unclamped the line ellipsises
           at roughly sixty characters, and clamped it ellipsises at `bodyClamp` lines. -->
      <span
        class="fab-complication-row-body"
        class:is-clamped={clampLines > 0}
        style={clampLines > 0 ? `--fab-complication-body-lines:${clampLines}` : undefined}
        title={body}>{body}</span
      >
    </span>
    {#if !isPlayer}{@render chips()}{/if}
    {#if activities.length > 0}
      <span class="fab-complication-row-activities">
        {#each activities as activity (activity.icon)}
          <i
            class="{activity.icon} {activity.dim ? 'is-dim' : ''}"
            title={activity.title || undefined}
            aria-label={activity.title || undefined}
            role="img"
          ></i>
        {/each}
      </span>
    {/if}
    {#if isAuthoring}
      <RowDisclosure
        {expanded}
        {controls}
        {disabled}
        label={disclosureLabel || name}
        dataAttr="data-complication-disclosure"
        onToggle={() => onToggle(!expanded)}
      />
      {#if onDelete}
        <button
          type="button"
          class="manager-icon-button is-ghost is-danger"
          data-complication-remove
          title={deleteLabel || undefined}
          aria-label={deleteLabel || undefined}
          {disabled}
          onclick={() => onDelete()}
        >
          <i class="fas fa-trash" aria-hidden="true"></i>
        </button>
      {/if}
    {/if}
  </div>
  {#if isAuthoring && expanded && children}
    <div class="fab-complication-row-detail" id={controls || undefined}>{@render children()}</div>
  {/if}
</div>

<style>
  /* Theme-ROOT tokens only — no `--fab-mv2-*` alias — because the player variant of this
     row renders under `.fabricate-app`, where those manager aliases are not in scope and a
     declaration referencing one silently falls back to inheritance. `Chip.svelte` records
     the rule and the failure mode in full. */
  /* The fill is the ramp step at the row's INDEX in the prototype, not the token whose value
     matches the prototype's row. The two ramps are offset by a step in the middle, and
     `ComponentComplicationsSection`'s `.fab-complication-card` note records why re-mapping by
     value collapses this row and the When/Then cards inside it onto one flat fill. */
  .fab-complication-row {
    box-sizing: border-box;
    border: 1px solid var(--fab-border);
    border-radius: 11px;
    background: var(--fab-bg-1);
    overflow: hidden;
  }

  /* The OPEN border is the row's own SEVERITY border, which is the prototype's rule:
     `border: open ? sev.border : var(--border)`, with the three `sev.border` tokens the
     severity tile below already carries. It is stated as three rules rather than one
     `currentColor` trick because the tile's colour is the severity INK (`--fab-*`) and the
     row's edge is the severity BORDER (`--fab-*-border`) — two different tokens per family.

     It must not be `--fab-border-strong`: that is exactly what the hover below paints, so
     an open row and a merely-hovered collapsed row would draw the identical edge and the
     open one would be indistinguishable at rest.

     Hover is the shipped manager's, not the prototype's — the prototype declares no hover
     delta anywhere — and it is scoped to a COLLAPSED row for the same reason: an expanded
     row keeps its gravity edge under the pointer instead of losing it. */
  .fab-complication-row.is-authoring:not(.is-expanded):hover {
    border-color: var(--fab-border-strong);
  }

  .fab-complication-row.is-expanded.is-gravity-info {
    border-color: var(--fab-info-border);
  }

  .fab-complication-row.is-expanded.is-gravity-warning {
    border-color: var(--fab-warning-border);
  }

  .fab-complication-row.is-expanded.is-gravity-danger {
    border-color: var(--fab-danger-border);
  }

  /* The two READ-ONLY strips are a tucked band rather than a card: no fill of their own, a
     tighter line, and no disclosure or delete column. */
  .fab-complication-row.is-readonly-gm,
  .fab-complication-row.is-player {
    border-radius: 9px;
    background: none;
  }

  /* The PLAYER row draws no shell at all. It is the only variant whose container is itself
     a bordered, filled band (the stage row's full-bleed complication band, and the bulk
     block's group card), so the inherited 1px edge would draw a second box inside a box in
     a 300px column. `transparent` rather than `none` keeps the box metrics identical to
     the GM strips', so the two treatments differ in ink and in nothing else. */
  .fab-complication-row.is-player {
    border-color: transparent;
  }

  .fab-complication-row-line {
    display: flex;
    gap: 11px;
    align-items: center;
    padding: 11px 13px;
  }

  .fab-complication-row.is-readonly-gm .fab-complication-row-line {
    gap: 9px;
    padding: 7px 10px;
  }

  /* No padding of its own: the band or group card the player row sits in already carries
     the inset, and paying it twice costs a 300px column ~20px of prose width. */
  .fab-complication-row.is-player .fab-complication-row-line {
    gap: 9px;
    padding: 0;
    align-items: flex-start;
  }

  .fab-complication-severity {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    font-size: 11px;
  }

  .fab-complication-severity.is-info {
    border-color: var(--fab-info-border);
    color: var(--fab-info);
    background: var(--fab-info-soft);
  }

  .fab-complication-severity.is-warning {
    border-color: var(--fab-warning-border);
    color: var(--fab-warning);
    background: var(--fab-warning-soft);
  }

  .fab-complication-severity.is-danger {
    border-color: var(--fab-danger-border);
    color: var(--fab-danger);
    background: var(--fab-danger-soft);
  }

  .fab-complication-row-copy {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  /* Transparent on every variant but `player` — see the markup note. */
  .fab-complication-row-headline {
    display: contents;
  }

  /* The player's chips share the copy column's width with the name and WRAP beneath it,
     rather than taking their width off the prose. */
  .fab-complication-row.is-player .fab-complication-row-headline {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  .fab-complication-row-eyebrow {
    color: var(--fab-text-subtle);
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  /* Everything the two emphases SHARE. The axis they differ on is face and size; the ink,
     the weight and the leading are the name's, not the treatment's. */
  .fab-complication-row-name {
    color: var(--fab-text);
    font-weight: 600;
    line-height: 1.2;
  }

  /* The accordion's name: the heading of a row you are about to open. */
  .fab-complication-row-name.is-display {
    font-family: var(--fab-font-serif);
    font-size: 12.5px;
  }

  /* A strip's name: one run of metadata on a row about something else, so it takes the
     host sans — inherited rather than named, since this repository ships serif and mono
     tokens and no sans token, and Foundry's own `--font-primary` is the face every other
     unstyled run here already renders in. */
  .fab-complication-row-name.is-inline {
    font-size: 11.5px;
  }

  /* Stated AFTER the two emphases on purpose. `component-complications-section-mounted`
     reads this file's rules by `indexOf('<selector> {')`, so a selector ENDING in
     `.fab-complication-row-name {` placed above the base rule would be the block that
     test measured — and its "the base rule names no face and no size" assertion would
     pass against the wrong rule. It carries no face and no size itself: it is the
     player headline's flex behaviour and nothing else. */
  .fab-complication-row.is-player .fab-complication-row-name {
    flex: 0 1 auto;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  /* Clipped to one line so the row height cannot move under a long authored sentence. The
     `title` above is what keeps the full string reachable. */
  .fab-complication-row-body {
    overflow: hidden;
    color: var(--fab-text-muted);
    font-size: 10.5px;
    line-height: 1.35;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* `bodyClamp`: WRAP, bounded. The row height still cannot run away — it is clamped to a
     stated number of lines and ellipsised there — but the disclosure survives past sixty
     characters, which one-line clipping does not. `overflow-wrap: anywhere` so a single
     unbroken token cannot push the column wide, matching the stage row's own name rule. */
  .fab-complication-row-body.is-clamped {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--fab-complication-body-lines, 3);
    line-clamp: var(--fab-complication-body-lines, 3);
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .fab-complication-row-activities {
    display: flex;
    flex: 0 0 auto;
    gap: 7px;
    align-items: center;
    color: var(--fab-text-secondary);
    font-size: 10px;
  }

  /* An activity the SYSTEM does not resolve progressively: the complication is stored and
     will not fire, so the glyph recedes to the disabled ink rather than disappearing. */
  .fab-complication-row-activities > i.is-dim {
    color: var(--fab-text-disabled);
  }

  .fab-complication-row-detail {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 13px;
    border-top: 1px solid var(--fab-border);
  }
</style>
