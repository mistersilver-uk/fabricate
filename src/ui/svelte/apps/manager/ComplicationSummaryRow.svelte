<!--
  One summary row for a complication (issue 1286): severity tile, name, one body line, an optional
  Player pill, the severity pill and the activity glyph run, plus — in the authoring variant only —
  a disclosure and a delete control. String props are PRE-LOCALIZED by the caller, on the
  `ToggleCard` precedent, so this stays a presentational leaf with no `localize` import.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `variant` / `nameEmphasis` | `'authoring'` \| `'readonly-gm'` \| `'player'`, and `'display'` \| `'inline'` | `'authoring'`, `'display'` | the first selects slot content and pill treatment ONLY; the second is the NAME's type treatment, a placement fact not derivable from the variant |
  | `severity` / `severityLabel` / `visibility` | | `'gmOnly'` | the gravity axis and its localized word; the Player pill renders on the GM variants only |
  | `triggerSentence` / `description` | string | `''` | the TYPED body — GM variants render the generated TRIGGER SENTENCE and the player variant the authored DESCRIPTION. Never interchangeable, and a player must never see the trigger, so they are two props picked by variant rather than one `body` a call site could pass the wrong thing to. |
  | `activities` / `statusLabel` / `statusTone` / `eyebrow` / `bodyClamp` | | `[]`, `''`, `0` | the glyph run (`dim` marks one the system does not resolve progressively), the TENSE chip (a player row renders all three states and the GM variants none), the strip's `From {source}` line, and a clamp where 0 clips the body to ONE line and N > 0 wraps to N |
  | `expanded` / `controls` / `disclosureLabel` / `onToggle` / `onDelete` / `deleteLabel` | | | the authoring disclosure and delete control; an absent `onDelete` renders no button |

  Snippets:
  - `children` — the expanded editor body, rendered inside the row's card when open.

  Invariants:
  - ONE SCAFFOLD, not a copy per variant: there are six call sites, and three `{#if}` branches each
    restating the shell is intra-file duplication SonarCloud's detector reads in `.svelte`.
  - THE ROW IS A `<div>` and `RowDisclosure` is the sole trigger, with the delete control as its
    SIBLING: a whole-row `<button>` would nest buttons, which `createElement` accepts and no mounted
    test notices.
  - In the `player` variant the chips move INSIDE the copy column, onto the name's line, because a
    300px column cannot pay for the tile, the gap and a trailing chip run beside the prose.
-->
<script>
  import Chip from '../../components/Chip.svelte';
  import RowDisclosure from '../../components/RowDisclosure.svelte';
  import IconButton from '../../components/IconButton.svelte';

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

  // A NARRATIVE gravity axis, never shared with `systemValidation.js` or the notice channel.
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
  // Normalized here rather than trusted: the value reaches CSS through a custom property, so a
  // non-numeric one would emit an invalid declaration instead of falling back.
  const clampLines = $derived(
    Number.isFinite(Number(bodyClamp)) && Number(bodyClamp) > 0 ? Math.floor(Number(bodyClamp)) : 0
  );
  const hookAttributes = $derived(dataAttr ? { [dataAttr]: dataValue || true } : {});
</script>

<!-- ONE chip run in one of two places. The TENSE chip leads the severity chip, so a positional
     selector addresses either without naming a tone — which would encode the fact being measured. -->
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
      <!-- `title` carries the FULL string in BOTH treatments: unclamped the line ellipsises at
           roughly sixty characters, and clamped it ellipsises at `bodyClamp` lines. -->
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
        <IconButton
          class="is-ghost is-danger"
          data-complication-remove=""
          title={deleteLabel || undefined}
          ariaLabel={deleteLabel || undefined}
          {disabled}
          onclick={() => onDelete()}
        >
          <i class="fas fa-trash" aria-hidden="true"></i>
        </IconButton>
      {/if}
    {/if}
  </div>
  {#if isAuthoring && expanded && children}
    <div class="fab-complication-row-detail" id={controls || undefined}>{@render children()}</div>
  {/if}
</div>

<style>
  /* Theme-ROOT tokens only: the player variant renders under `.fabricate-app`, where an area-scoped
     property is out of scope. */
  /* The fill is the ramp step at the row's INDEX in the prototype, not the token whose value
     matches it: the two ramps are offset by a step in the middle, and re-mapping by value collapses
     this row and the cards inside it onto one flat fill. */
  .fab-complication-row {
    box-sizing: border-box;
    border: 1px solid var(--fab-border);
    border-radius: 11px;
    background: var(--fab-bg-1);
    overflow: hidden;
  }

  /* The OPEN border is the row's own SEVERITY border, as three rules rather than a `currentColor`
     trick, because the tile's colour is the severity INK and the edge its BORDER. Not
     `--fab-border-strong`, which the hover below paints; hover is scoped to COLLAPSED likewise. */
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

  /* The PLAYER row draws no shell: its container is already a band. `transparent` rather than
     `none` keeps the metrics identical to the GM strips'. */
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

  /* No padding of its own: the band or group card the player row sits in already carries the
     inset, and paying it twice costs a 300px column ~20px of prose width. */
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

  /* Everything the two emphases SHARE: they differ on face and size only. */
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

  /* A strip's name takes the host sans, inherited rather than named: there is no sans token. */
  .fab-complication-row-name.is-inline {
    font-size: 11.5px;
  }

  /* Stated AFTER the two emphases on purpose: `component-complications-section-mounted` reads this
     file's rules by `indexOf('<selector> {')`, so a selector ENDING in this one, placed above the
     base rule, would be the block that test measured. */
  .fab-complication-row.is-player .fab-complication-row-name {
    flex: 0 1 auto;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  /* Clipped to one line so the row height cannot move under a long authored sentence. The `title`
     above keeps the full string reachable. */
  .fab-complication-row-body {
    overflow: hidden;
    color: var(--fab-text-muted);
    font-size: 10.5px;
    line-height: 1.35;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* `bodyClamp`: WRAP, bounded, so the disclosure survives past sixty characters.
     `overflow-wrap: anywhere` so a single unbroken token cannot push the column wide. */
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

  /* An activity the SYSTEM does not resolve progressively: the complication is stored and will not
     fire, so the glyph recedes to the disabled ink rather than disappearing. */
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
