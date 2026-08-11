<!-- Svelte 5 runes mode -->
<!--
  The Checks Studio's right rail (issue 1096).

  On an ACTIVITY route it carries, in order: the documentation/quickstart pair, the
  activation toggle with its locked-mode hint, a "Preview as" actor and record selector, an
  outcome-preview slot, a per-outcome odds slot, and a "This check" digest whose status chip
  reads `OK` / `OFF` / a count pill.

  The two preview slots render their PRE-ROLL copy only. issue 1097 fills them with the real
  simulator and the odds enumerator; the slots exist here because the rail's shape and its
  scroll behaviour are what this change is for, and a rail missing two of its six panels
  cannot be photographed as evidence of either.

  ## The Validation route's rail is NOT this stack

  It renders the documentation pair and the "All checks" summary ONLY — no activation
  toggle, no Preview-as, no simulator, no odds, no This-check digest — because none of them
  has a subject there. That is a real difference in what the screen is about, not an
  omission.

  ## Structure: FLAT HEADINGS, cards beneath

  Every section is a `.manager-kicker` naming it, followed by the card it labels — the Tool
  Studio's inspector convention (`ToolBehaviorPreview.svelte`), which the maintainer made
  the authority for this rail's structure (issue 1096). No card wraps a section, and no
  panel is a disclosure: the `OUTCOME PREVIEW` and `CHANCE PER OUTCOME` collapsibles and
  the `ABOUT CRAFTING CHECKS` explainer card that stood at the top are all gone, because
  the prototype has none of them.

  ## Responsive behaviour reuses the SHIPPED container ladder

  `styles/fabricate.css` declares `container-name: fabricate-manager` with blocks at
  1320 / 1120 / 960 / 900 / 831 / 680, and `.fabricate-manager .manager-inspector` already
  carries `overflow-y: auto; max-height: 100%`. This component introduces NO new breakpoint
  and does not touch either of those declarations:

  - **At ≤1120** the shipped rule already restacks `.manager-body` to one column with
    `grid-auto-rows: max-content` and hands scrolling to the body. The rail's own
    `overflow-y` / `max-height` are LEFT ALONE there: that block unsets neither, and against
    a `max-content` track the bound resolves to the region's own content height, so it
    cannot clip.

  The constraint this component is actually bound by is narrower than "do not self-scroll":
  do not defeat `grid-auto-rows: max-content`, and give no `.manager-body` child a DEFINITE
  height. That — zero-min-content children under implicit `auto` rows — is the measured
  issue-643 regression the comment above that block records.
-->
<script>
  import Chip from '../Chip.svelte';
  import IconFactRow from '../IconFactRow.svelte';
  import { localize } from '../../../util/foundryBridge.js';

  let {
    activeTab = 'crafting',
    activation = null,
    checkOff = false,
    activeCheck = null,
    outcomeCount = null,
    triggerCount = null,
    modifierCount = null,
    issueCount = 0,
    allChecks = [],
    onToggleActive = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const isValidation = $derived(activeTab === 'validation');
  const activeOn = $derived(activation?.enabled === true);
  const activeTitle = text('FABRICATE.Admin.Manager.Checks.Active.Title', 'Active');
  const onLabel = text('FABRICATE.Admin.Manager.StatusOn', 'On');
  const offLabel = text('FABRICATE.Admin.Manager.StatusOff', 'Off');
  const optionalHint = text(
    'FABRICATE.Admin.Manager.Checks.Active.OptionalHint',
    'Turn this check on to require a roll for the activity, or off to resolve it without one.'
  );
  // The gathering check's active toggle is mode-aware and inverted from the
  // generic `optional` flag: d100 is the fixed roll (read-only note, no toggle),
  // while progressive/routed are editable checks that expose an Active toggle.
  const gatheringD100 = $derived(activeTab === 'gathering' && activation?.mode === 'd100');
  // Alchemy "No check" mode: the crafting check does not run at all. Distinct from a
  // MANDATORY check — hide the toggle AND show a "no check" hint, not the requiredHint.
  const craftingNone = $derived(activeTab === 'crafting' && activation?.none === true);
  const showActiveToggle = $derived(
    activeTab === 'gathering' ? !gatheringD100 : !craftingNone && activation?.optional === true
  );
  // What the LOCKED toggle reads. Every mode that hides the switch runs its check — routed
  // and progressive require one, and gathering `d100` IS the roll — with exactly one
  // exception: alchemy `checkMode: 'none'`, which rolls nothing at all. Deriving the reading
  // from that one exception rather than from `activation.enabled` is deliberate: a mandatory
  // check runs whatever the persisted `enabled` flag happens to say, and showing a locked OFF
  // beside a check the engine rolls would be a worse lie than showing no state at all.
  const lockedOn = $derived(!craftingNone);
  // THE SAME TWO WORDS THE LIVE SWITCH USES (issue 1096). This read `Check is on` / `Check is
  // off` while the switch one mode over read `On` / `Off` — two vocabularies for one state,
  // side by side in the same card slot, which reads as two different facts rather than one
  // fact in two modes. The padlock and the hint below carry the "locked" meaning visually and
  // in prose, and the `aria-label` still says it in words.
  const lockedReading = $derived(lockedOn ? onLabel : offLabel);
  const lockedLabel = $derived(
    `${lockedOn ? text('FABRICATE.Admin.Manager.Checks.Active.LockedOn', 'Check is on') : text('FABRICATE.Admin.Manager.Checks.Active.LockedOff', 'Check is off')} — ${text('FABRICATE.Admin.Manager.Checks.Active.LockedSuffix', 'locked by the resolution mode')}`
  );
  const requiredHint = $derived(
    craftingNone
      ? text(
          'FABRICATE.Admin.Manager.Checks.Active.AlchemyNoneHint',
          'This alchemy system resolves without a crafting check. Switch the alchemy check mode to Simple or Tiered under Recipe resolution to author one.'
        )
      : activeTab === 'gathering'
        ? text(
            'FABRICATE.Admin.Manager.Checks.Active.GatheringHint',
            'In d100 mode the gathering check is the fixed d100 roll and cannot be turned off here.'
          )
        : text(
            'FABRICATE.Admin.Manager.Checks.Active.RequiredHint',
            'The current resolution mode requires this check, so it cannot be turned off here.'
          )
  );

  const DOCS_BASE = 'https://mistersilver-uk.github.io/fabricate';

  // The prototype's rail opens with a documentation / quickstart PAIR, not an explainer
  // card. The `ABOUT CRAFTING CHECKS` card that used to stand here is gone (issue 1096
  // parity): the prototype has no such card, and it pushed every panel with a subject —
  // the activation switch, the preview, the digest — below the fold.
  const DOCS_LINKS = {
    crafting: `${DOCS_BASE}/crafting-checks`,
    salvage: `${DOCS_BASE}/salvage`,
    gathering: `${DOCS_BASE}/gathering-environments`,
    validation: `${DOCS_BASE}/crafting-checks`,
  };
  const docsHref = $derived(DOCS_LINKS[activeTab] || DOCS_LINKS.crafting);
  const docsLabel = text('FABRICATE.Admin.Manager.Checks.Documentation', 'Documentation');
  const quickstartLabel = text('FABRICATE.Admin.Manager.Checks.Quickstart', 'Quickstart');

  // The digest's status chip. THREE states, and they are not interchangeable: `OFF` is a
  // GM's own choice and says nothing about correctness, while `OK` is a claim that the
  // check is complete — so an off check must never read `OK`.
  const digestStatus = $derived.by(() => {
    if (checkOff)
      return { tone: 'neutral', label: text('FABRICATE.Admin.Manager.StatusOff', 'Off') };
    if (issueCount > 0) {
      return {
        tone: 'warning',
        label: String(issueCount),
      };
    }
    return { tone: 'positive', label: text('FABRICATE.Admin.Manager.Checks.Digest.Ok', 'OK') };
  });

  const successCount = $derived.by(() => {
    if (!activeCheck) return 0;
    const key = activeCheck.type === 'fixed' ? 'fixedOutcomes' : 'relativeOutcomes';
    const list = Array.isArray(activeCheck[key]) ? activeCheck[key] : [];
    return list.filter((outcome) => outcome?.success === true).length;
  });

  const formulaFact = $derived(
    activeCheck?.rollFormula
      ? `${text('FABRICATE.Admin.Manager.Checks.Digest.Formula', 'Formula')} · ${activeCheck.rollFormula}`
      : text('FABRICATE.Admin.Manager.Checks.Digest.NoFormula', 'No roll formula yet')
  );
</script>

<aside
  class="manager-inspector manager-environment-inspector manager-checks-rail"
  data-checks-rail={activeTab}
  aria-label={text('FABRICATE.Admin.Manager.Checks.Menu.Label', 'Checks context menu')}
>
  <!-- The prototype's own first row: two quiet links, side by side. -->
  <div class="manager-checks-rail-links" data-checks-help={activeTab}>
    <a
      class="manager-checks-rail-link"
      href={docsHref}
      target="_blank"
      rel="noreferrer"
      data-checks-docs-link
    >
      <i class="fas fa-book-open" aria-hidden="true"></i><span>{docsLabel}</span>
    </a>
    <a
      class="manager-checks-rail-link"
      href={`${DOCS_BASE}/quickstart`}
      target="_blank"
      rel="noreferrer"
      data-checks-quickstart-link
    >
      <i class="fas fa-circle-question" aria-hidden="true"></i><span>{quickstartLabel}</span>
    </a>
  </div>

  {#if isValidation}
    <!-- The Validation rail: the docs pair above, and this. Nothing else has a subject
         on a route that validates all three checks at once. -->
    <p class="manager-kicker">
      {text('FABRICATE.Admin.Manager.Checks.Validation.AllChecks', 'All checks')}
    </p>
    <section class="manager-inspector-card" data-checks-all-checks>
      {#each allChecks as row (row.id)}
        <IconFactRow
          icon={row.icon}
          dataAttr="data-checks-all-checks-row"
          dataValue={row.id}
          title={row.label}
          subtitle={row.detail}
        />
      {/each}
    </section>
  {:else}
    {#if activation}
      <!-- FLAT HEADING, CARD BENEATH — the Tool Studio's inspector convention, which is the
           assigned authority for the rail's STRUCTURE. Every section here reads the same
           way: an uppercase `.manager-kicker` naming the section, then the card it labels,
           never a card wrapping each section with a title inside it. -->
      <p class="manager-kicker">{activeTitle}</p>
      <section class="manager-inspector-card" data-checks-active={activeTab}>
        {#if showActiveToggle}
          <button
            type="button"
            class={`manager-status-toggle ${activeOn ? 'is-on' : 'is-off'}`}
            data-checks-active-toggle
            aria-pressed={activeOn}
            onclick={() => onToggleActive(!activeOn)}
          >
            <span class="manager-status-toggle-track" aria-hidden="true"
              ><span class="manager-status-toggle-knob"></span></span
            >
            <span class="manager-status-toggle-label">{activeOn ? onLabel : offLabel}</span>
          </button>
          <p class="manager-muted">{optionalHint}</p>
        {:else}
          <!-- A LOCKED toggle, not a bare sentence. Removing the control removed the STATE
               with it, so on a routed or progressive check a GM could not see whether the
               check was on at all — and "the mode requires this check" does not say which way
               the switch is set. The prototype's `crafting-roll` frame is the assigned
               authority for this control and shows exactly this: the track, the reading, and
               a padlock. It is an INDICATOR, not a disabled control: nothing here is
               actionable, so it is announced as one labelled image rather than as a button a
               GM might keep trying to press. -->
          <span
            class={`manager-status-toggle is-locked ${lockedOn ? 'is-on' : 'is-off'}`}
            data-checks-active-locked={lockedOn ? 'on' : 'off'}
            role="img"
            aria-label={lockedLabel}
          >
            <span class="manager-status-toggle-track" aria-hidden="true"
              ><span class="manager-status-toggle-knob"></span></span
            >
            <span class="manager-status-toggle-label">{lockedReading}</span>
            <i class="fas fa-lock manager-checks-active-lock" aria-hidden="true"></i>
          </span>
          <p class="manager-muted" data-checks-active-required>{requiredHint}</p>
        {/if}
      </section>
    {/if}

    {#if !checkOff}
      <!-- PRE-ROLL, like the two panels below it, and deliberately NOT two `<select>`s.
           The record selector's meaning is defined by the simulator that reads it (issue
           1097): what a "record" is, which ones are offered, and what the strip re-announces
           when one is chosen are all that change's decisions. Two enabled-looking selects
           reading "No actors" / "No records" invite a GM to make a choice nothing consumes,
           which is worse than a stated absence — so this panel says what it will do and
           offers no control until there is something behind it. -->
      <p class="manager-kicker">
        {text('FABRICATE.Admin.Manager.Checks.PreviewAs.Title', 'Preview as')}
      </p>
      <section class="manager-inspector-card" data-checks-preview-as>
        <p class="manager-muted">
          {text(
            'FABRICATE.Admin.Manager.Checks.PreviewAs.Hint',
            'Reading this check against an actor and record arrives with the outcome preview. Nothing chosen here will ever change the system.'
          )}
        </p>
      </section>

      <!-- NOT DISCLOSURES. These two panels were collapsible, and the prototype has no
           disclosure anywhere in this rail: a panel whose whole content is one sentence of
           pre-roll copy has nothing to collapse, and hiding it behind a control made the
           rail read as if two features were missing rather than pending (issue 1097). -->
      <p class="manager-kicker">
        {text('FABRICATE.Admin.Manager.Checks.Simulator.Title', 'Outcome preview')}
      </p>
      <section class="manager-inspector-card" data-checks-simulator>
        <p class="manager-muted">
          {text(
            'FABRICATE.Admin.Manager.Checks.Simulator.Hint',
            'Roll a test check to see exactly which outcome a record lands on and what it costs the character.'
          )}
        </p>
      </section>

      <p class="manager-kicker">
        {text('FABRICATE.Admin.Manager.Checks.Odds.Title', 'Chance per outcome')}
      </p>
      <section class="manager-inspector-card" data-checks-odds>
        <p class="manager-muted">
          {text(
            'FABRICATE.Admin.Manager.Checks.Odds.Hint',
            'Once this check has a formula and its outcome bands are set, the chance of landing on each one is listed here.'
          )}
        </p>
      </section>
    {/if}

    <div class="manager-checks-rail-head">
      <p class="manager-kicker">
        {text('FABRICATE.Admin.Manager.Checks.Digest.Title', 'This check')}
      </p>
      <Chip tone={digestStatus.tone}>{digestStatus.label}</Chip>
    </div>
    <section class="manager-inspector-card" data-checks-digest>
      {#if checkOff}
        <IconFactRow
          icon="fas fa-ban"
          dataAttr="data-checks-digest-row"
          dataValue="off"
          title={text(
            'FABRICATE.Admin.Manager.Checks.Digest.Off',
            'This activity resolves without a roll while the check is off.'
          )}
        />
      {:else}
        <IconFactRow
          icon="fas fa-dice-d20"
          dataAttr="data-checks-digest-row"
          dataValue="formula"
          title={formulaFact}
        />
        {#if typeof outcomeCount === 'number'}
          <IconFactRow
            icon="fas fa-code-branch"
            dataAttr="data-checks-digest-row"
            dataValue="outcomes"
            title={text(
              'FABRICATE.Admin.Manager.Checks.Digest.Outcomes',
              '{count} outcome tiers, {success} count as success'
            )
              .replace('{count}', String(outcomeCount))
              .replace('{success}', String(successCount))}
          />
        {/if}
        {#if typeof triggerCount === 'number'}
          <IconFactRow
            icon="fas fa-bolt"
            dataAttr="data-checks-digest-row"
            dataValue="triggers"
            title={text(
              'FABRICATE.Admin.Manager.Checks.Digest.Triggers',
              '{count} triggers active'
            ).replace('{count}', String(triggerCount))}
          />
        {/if}
        {#if typeof modifierCount === 'number'}
          <IconFactRow
            icon="fas fa-user-group"
            dataAttr="data-checks-digest-row"
            dataValue="modifiers"
            title={text(
              'FABRICATE.Admin.Manager.Checks.Digest.Modifiers',
              '{count} check modifiers apply'
            ).replace('{count}', String(modifierCount))}
          />
        {/if}
      {/if}
    </section>
  {/if}
</aside>

<style>
  .manager-checks-rail-head {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    justify-content: space-between;
    min-width: 0;
  }

  .manager-checks-rail-head > :global(.manager-kicker) {
    min-width: 0;
  }

  /* The documentation / quickstart pair the prototype opens the rail with. */
  .manager-checks-rail-links {
    display: flex;
    gap: var(--fab-space-2);
  }

  .manager-checks-rail-link {
    display: flex;
    flex: 1 1 0;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-width: 0;
    height: 30px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    color: var(--fab-text-muted);
    background: var(--fab-bg-1);
    font-size: 10.5px;
    font-weight: 600;
    text-decoration: none;
  }

  .manager-checks-rail-link:hover {
    border-color: var(--fab-accent-border);
    color: var(--fab-text);
  }

  /* The LOCKED reading of the activation switch. It reuses the shipped switch's own track
     and knob — same meaning, same drawing — and changes only what a non-interactive, full
     width indicator needs: the 78px control cap does not apply to a row that also carries a
     reading and a padlock. */
  .manager-status-toggle.is-locked {
    width: 100%;
    max-width: none;
    cursor: default;
  }

  .manager-checks-active-lock {
    margin-left: auto;
    color: var(--fab-text-muted);
    font-size: 0.72rem;
  }

  /* The 1320 disclosure ladder is gone with the disclosures themselves. The rail names no
     breakpoint of its own now; the manager container's own six still apply to it. */
</style>
