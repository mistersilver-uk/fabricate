<!-- Svelte 5 runes mode -->
<!--
  The Checks Studio's right rail (issue 1096).

  On an ACTIVITY route it carries, in order: the documentation/quickstart pair, the
  activation toggle with its locked-mode hint, a "Preview as" actor and record selector, an
  outcome-preview slot, a per-outcome odds slot, and a "This check" digest whose status chip
  reads `OK` / `OFF` / a count pill.

  ## The activation card has NO heading

  Every other section here is named by a flat kicker; this one is not, because the prototype
  names it nothing. The CARD is the statement — a switch, the words `Check is on`, and (when
  the mode locks it) a padlock and the sentence saying which mode requires it. An `ACTIVE`
  kicker above a card reading `On` said the same thing twice and read as a third section
  (issue 1096, maintainer inspector comparison).

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

  The heading ROW is the prototype's, inside that structure: a leading glyph, the kicker,
  and an optional right-aligned adjunct — the odds panel's die domain, the digest's status
  chip. The two authorities do not collide here, because one owns where the heading sits and
  the other owns what it is made of.

  ## The digest and the all-checks list are ONE card of compact rows

  Not a stack of bordered cards. Each row is a 29px line — glyph, one line of text, trailing
  chevron — and the chevron is an affordance rather than decoration: the row opens the
  section (or the activity's check) it describes, through the same `onOpen` deep link the
  Validation issues use. A row that states an ABSENCE ("no roll formula yet", "resolves
  without a roll") has nowhere to go, so it carries neither a chevron nor a target.

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
    onOpen = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const isValidation = $derived(activeTab === 'validation');
  const activeOn = $derived(activation?.enabled === true);
  const onLabel = text('FABRICATE.Admin.Manager.Checks.Active.LockedOn', 'Check is on');
  const offLabel = text('FABRICATE.Admin.Manager.Checks.Active.LockedOff', 'Check is off');
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
  // ONE VOCABULARY, and it is the PROTOTYPE's (issue 1096, maintainer inspector comparison).
  // The reading was `On` / `Off` in both slots, which is the manager's own switch vocabulary
  // and not what the card it now lives in says; the prototype's card reads `Check is on`, so
  // both the live switch and the locked indicator read that. The point the earlier ruling
  // settled survives unchanged — the two slots must not speak differently — and `onLabel` /
  // `offLabel` are still the single source both read.
  const lockedReading = $derived(lockedOn ? onLabel : offLabel);
  const lockedLabel = $derived(
    `${lockedReading} — ${text('FABRICATE.Admin.Manager.Checks.Active.LockedSuffix', 'locked by the resolution mode')}`
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

  const hasFormula = $derived(Boolean(activeCheck?.rollFormula));
  const formulaFact = $derived(
    hasFormula
      ? `${text('FABRICATE.Admin.Manager.Checks.Digest.Formula', 'Formula')} · ${activeCheck.rollFormula}`
      : text('FABRICATE.Admin.Manager.Checks.Digest.NoFormula', 'No roll formula yet')
  );

  // The odds heading's right-aligned adjunct — the prototype's `all 20 faces`. It names the
  // DOMAIN the enumerator will walk, so it is derived from this check's own die rather than
  // stated: a `1d20` check enumerates twenty faces and a `2d6` one does not. Absent when the
  // formula names no die at all, because then there is no domain to name and a fixed "20"
  // would be a claim about a check that does not roll a d20.
  const oddsDomain = $derived.by(() => {
    const match = /(?:^|[^\w.])\d*d(\d+)/i.exec(activeCheck?.rollFormula ?? '');
    if (!match) return '';
    return text('FABRICATE.Admin.Manager.Checks.Odds.Faces', 'all {faces} faces').replace(
      '{faces}',
      match[1]
    );
  });

  /**
   * The digest's rows, as data.
   *
   * `target` is what the row's chevron opens; a row with none states an absence and is not a
   * target. Built as a list rather than four conditional blocks so the row treatment is
   * declared once and every row is provably the same shape.
   */
  const digestRows = $derived.by(() => {
    if (checkOff) {
      return [
        {
          id: 'off',
          icon: 'fas fa-ban',
          title: text(
            'FABRICATE.Admin.Manager.Checks.Digest.Off',
            'This activity resolves without a roll while the check is off.'
          ),
          target: null,
          tone: 'absent',
        },
      ];
    }
    const rows = [
      {
        id: 'formula',
        icon: 'fas fa-dice-d20',
        title: formulaFact,
        target: hasFormula ? [activeTab, 'roll'] : null,
        tone: hasFormula ? 'set' : 'absent',
      },
    ];
    if (typeof outcomeCount === 'number') {
      rows.push({
        id: 'outcomes',
        icon: 'fas fa-code-branch',
        title: text(
          'FABRICATE.Admin.Manager.Checks.Digest.Outcomes',
          '{count} outcome tiers, {success} count as success'
        )
          .replace('{count}', String(outcomeCount))
          .replace('{success}', String(successCount)),
        target: [activeTab, 'outcomes'],
        tone: 'set',
      });
    }
    if (typeof triggerCount === 'number') {
      rows.push({
        id: 'triggers',
        icon: 'fas fa-bolt',
        title: text(
          'FABRICATE.Admin.Manager.Checks.Digest.Triggers',
          '{count} triggers active'
        ).replace('{count}', String(triggerCount)),
        target: [activeTab, 'triggers'],
        tone: 'set',
      });
    }
    if (typeof modifierCount === 'number') {
      rows.push({
        id: 'modifiers',
        icon: 'fas fa-user-group',
        title: text(
          'FABRICATE.Admin.Manager.Checks.Digest.Modifiers',
          '{count} check modifiers apply'
        ).replace('{count}', String(modifierCount)),
        target: [activeTab, 'modifiers'],
        tone: 'set',
      });
    }
    return rows;
  });

  // The Validation rail's rows carry the SAME shape, so they render through the same row.
  // They open the activity's own check rather than a section of this one, and their glyph is
  // an activity mark rather than a report on something authored — so `tone` is not `set`.
  const allCheckRows = $derived(
    allChecks.map((row) => ({
      id: row.id,
      icon: row.icon,
      title: row.label,
      detail: row.detail,
      target: [row.id, 'roll'],
      tone: 'activity',
    }))
  );
</script>

<!--
  The heading row every section shares: the prototype's leading glyph and the Tool Studio's
  flat kicker. A caller that carries an adjunct (the odds domain, the digest's chip) renders
  it after this, inside the same row, where `margin-left: auto` puts it hard right.
-->
{#snippet railHead(icon, title)}
  <i class={`${icon} manager-checks-rail-head-icon`} aria-hidden="true"></i>
  <p class="manager-kicker">{title}</p>
{/snippet}

<!--
  One compact row of a rail list.

  `row.target` is `[activity, section]` or `null`; a row with no target states an absence, so
  it renders as a plain row with no chevron and nothing to press. `row.tone` is `set` when the
  glyph reports something the GM has authored (the prototype's green) and anything else when
  it does not.
-->
{#snippet railRow(row, hook)}
  {#if row.target}
    <button
      type="button"
      class={`manager-checks-rail-row ${row.tone === 'set' ? 'is-set' : ''} ${row.detail ? 'is-detailed' : ''}`}
      {...{ [hook]: row.id }}
      onclick={() => onOpen(row.target[0], row.target[1])}
    >
      {@render railRowBody(row)}
      <i class="fas fa-chevron-right manager-checks-rail-row-chevron" aria-hidden="true"></i>
    </button>
  {:else}
    <div
      class={`manager-checks-rail-row ${row.tone === 'set' ? 'is-set' : ''} ${row.detail ? 'is-detailed' : ''}`}
      {...{ [hook]: row.id }}
    >
      {@render railRowBody(row)}
    </div>
  {/if}
{/snippet}

{#snippet railRowBody(row)}
  <i class={row.icon} aria-hidden="true"></i>
  <span class="manager-checks-rail-row-body">
    <span class="manager-checks-rail-row-text">{row.title}</span>
    {#if row.detail}
      <span class="manager-checks-rail-row-detail">{row.detail}</span>
    {/if}
  </span>
{/snippet}

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
    <div class="manager-checks-rail-head">
      {@render railHead(
        'fas fa-layer-group',
        text('FABRICATE.Admin.Manager.Checks.Validation.AllChecks', 'All checks')
      )}
    </div>
    <section class="manager-inspector-card is-rail-list" data-checks-all-checks>
      {#each allCheckRows as row (row.id)}
        {@render railRow(row, 'data-checks-all-checks-row')}
      {/each}
    </section>
  {:else}
    {#if activation}
      <!-- NO KICKER. The card IS the section: the switch, the reading, and the sentence that
           says which mode locks it. See the header note. -->
      <section
        class={`manager-inspector-card manager-checks-active-card ${(showActiveToggle ? activeOn : lockedOn) ? 'is-on' : 'is-off'}`}
        data-checks-active={activeTab}
      >
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
      <div class="manager-checks-rail-head">
        {@render railHead(
          'fas fa-user',
          text('FABRICATE.Admin.Manager.Checks.PreviewAs.Title', 'Preview as')
        )}
      </div>
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
      <div class="manager-checks-rail-head">
        {@render railHead(
          'fas fa-flask-vial',
          text('FABRICATE.Admin.Manager.Checks.Simulator.Title', 'Outcome preview')
        )}
      </div>
      <section class="manager-inspector-card" data-checks-simulator>
        <p class="manager-muted">
          {text(
            'FABRICATE.Admin.Manager.Checks.Simulator.Hint',
            'Roll a test check to see exactly which outcome a record lands on and what it costs the character.'
          )}
        </p>
      </section>

      <div class="manager-checks-rail-head">
        {@render railHead(
          'fas fa-chart-column',
          text('FABRICATE.Admin.Manager.Checks.Odds.Title', 'Chance per outcome')
        )}
        {#if oddsDomain}
          <span class="manager-checks-rail-head-note" data-checks-odds-domain>{oddsDomain}</span>
        {/if}
      </div>
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
      {@render railHead(
        'fas fa-clipboard-check',
        text('FABRICATE.Admin.Manager.Checks.Digest.Title', 'This check')
      )}
      <Chip tone={digestStatus.tone}>{digestStatus.label}</Chip>
    </div>
    <section class="manager-inspector-card is-rail-list" data-checks-digest>
      {#each digestRows as row (row.id)}
        {@render railRow(row, 'data-checks-digest-row')}
      {/each}
    </section>
  {/if}
</aside>

<!--
  NO SCOPED BLOCK. Every rule this rail draws itself with is a MEASURED value compared against
  the prototype by `tests/components/checks-studio-parity.test.js`, and that gate reads
  `styles/fabricate.css` plus the scoped CSS of the primitives it names. Rules split between
  here and there would be measured only if this file were added to that list too — so the
  rail's rules all live in the sheet's Checks Studio parity block, next to the numbers they
  have to agree with (issue 1096).
-->
