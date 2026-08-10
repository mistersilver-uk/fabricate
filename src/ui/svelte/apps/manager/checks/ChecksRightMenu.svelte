<!-- Svelte 5 runes mode -->
<!--
  The Checks Studio's right rail (issue 1096).

  On an ACTIVITY route it carries, in order: the documentation/quickstart pair, the
  activation toggle with its locked-mode hint, a "Preview as" actor and record selector, an
  outcome-preview slot, a per-outcome odds slot, and a "This check" digest whose status chip
  reads `OK` / `OFF` / a count pill.

  The two preview slots render their PRE-ROLL copy only. issue 1097 fills them with the real
  simulator and the odds enumerator; the slots exist here because the rail's shape, its
  scroll behaviour and its collapse ladder are what this change is for, and a rail missing
  two of its six panels cannot be photographed as evidence of either.

  ## The Validation route's rail is NOT this stack

  It renders the documentation pair and the "All checks" summary ONLY — no activation
  toggle, no Preview-as, no simulator, no odds, no This-check digest — because none of them
  has a subject there. That is a real difference in what the screen is about, not an
  omission.

  ## Responsive behaviour reuses the SHIPPED container ladder

  `styles/fabricate.css` declares `container-name: fabricate-manager` with blocks at
  1320 / 1120 / 960 / 900 / 831 / 680, and `.fabricate-manager .manager-inspector` already
  carries `overflow-y: auto; max-height: 100%`. This component introduces NO new breakpoint
  and does not touch either of those declarations:

  - **At ≤1320** the odds and simulator panels become collapsed DISCLOSURES, headers and
    counts retained. The disclosure control is hidden above that width and the body is
    shown unconditionally, so the wide state is a plain panel and the narrow state is a
    real `aria-expanded` widget — one markup tree, no JavaScript measurement, and no
    second breakpoint value.
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
  import ExplainerCard from '../ExplainerCard.svelte';
  import IconFactRow from '../IconFactRow.svelte';
  import RowDisclosure from '../../../components/RowDisclosure.svelte';
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
    actorOptions = [],
    recordOptions = [],
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

  // The Quickstart is the second way out of every one of these cards, so it is built once
  // rather than restated per route.
  const quickstartLink = {
    href: `${DOCS_BASE}/quickstart`,
    label: text('FABRICATE.Admin.Manager.Checks.Quickstart', 'Quickstart'),
    icon: 'fas fa-circle-question',
  };

  // The description stays ONE explainer row rather than being split into a row per rule:
  // these are already-authored, already-translated sentences, and rewriting them into a
  // list would be a content change wearing a consistency change's clothes.
  const MENUS = {
    crafting: {
      icon: 'fas fa-hammer',
      title: text('FABRICATE.Admin.Manager.Checks.Crafting.HelpTitle', 'About crafting checks'),
      items: [
        {
          text: text(
            'FABRICATE.Admin.Manager.Checks.Crafting.HelpDesc',
            'The crafting check is shaped by the system resolution mode: simple authors a pass/fail check, routed authors outcome tiers, and progressive requires a check. Alchemy is driven by its check mode — none has no check, simple authors a mandatory pass/fail check, and tiered authors a mandatory routed check.'
          ),
        },
      ],
      links: [
        {
          href: `${DOCS_BASE}/crafting-checks`,
          label: text('FABRICATE.Admin.Manager.Checks.Crafting.Docs', 'Crafting checks docs'),
          icon: 'fas fa-book-open',
        },
        quickstartLink,
      ],
    },
    salvage: {
      icon: 'fas fa-recycle',
      title: text('FABRICATE.Admin.Manager.Checks.Salvage.HelpTitle', 'About salvage checks'),
      items: [
        {
          text: text(
            'FABRICATE.Admin.Manager.Checks.Salvage.HelpDesc',
            'The salvage check is shaped by the salvage resolution mode. Simple mode makes it optional; routed and progressive modes require it.'
          ),
        },
      ],
      links: [
        {
          href: `${DOCS_BASE}/salvage`,
          label: text('FABRICATE.Admin.Manager.Checks.Salvage.Docs', 'Salvage docs'),
          icon: 'fas fa-book-open',
        },
        quickstartLink,
      ],
    },
    gathering: {
      icon: 'fas fa-seedling',
      title: text('FABRICATE.Admin.Manager.Checks.Gathering.HelpTitle', 'About gathering checks'),
      items: [
        {
          text: text(
            'FABRICATE.Admin.Manager.Checks.Gathering.HelpDesc',
            'The gathering check is shaped by the task resolution mode. In d100 mode it is the fixed d100 roll; progressive and routed modes let you define it.'
          ),
        },
      ],
      links: [
        {
          href: `${DOCS_BASE}/gathering-environments`,
          label: text('FABRICATE.Admin.Manager.Checks.Gathering.Docs', 'Gathering docs'),
          icon: 'fas fa-book-open',
        },
        quickstartLink,
      ],
    },
    validation: {
      icon: 'fas fa-clipboard-check',
      title: text('FABRICATE.Admin.Manager.Checks.Validation.HelpTitle', 'About check validation'),
      items: [
        {
          text: text(
            'FABRICATE.Admin.Manager.Checks.Validation.HelpDesc',
            'Every activity check is evaluated against the same rules. A crafting system saves while incomplete, but it only enables once every blocking issue is cleared.'
          ),
        },
      ],
      links: [
        {
          href: `${DOCS_BASE}/crafting-checks`,
          label: text('FABRICATE.Admin.Manager.Checks.Crafting.Docs', 'Crafting checks docs'),
          icon: 'fas fa-book-open',
        },
        quickstartLink,
      ],
    },
  };

  const menu = $derived(MENUS[activeTab] || MENUS.crafting);

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

  let oddsExpanded = $state(false);
  let simulatorExpanded = $state(false);
</script>

<aside
  class="manager-inspector manager-environment-inspector manager-checks-rail"
  data-checks-rail={activeTab}
  aria-label={text('FABRICATE.Admin.Manager.Checks.Menu.Label', 'Checks context menu')}
>
  <ExplainerCard
    icon={menu.icon}
    title={menu.title}
    items={menu.items}
    links={menu.links}
    dataAttr="data-checks-help"
    dataValue={activeTab}
  />

  {#if isValidation}
    <!-- The Validation rail: the docs pair above, and this. Nothing else has a subject
         on a route that validates all three checks at once. -->
    <section class="manager-inspector-card" data-checks-all-checks>
      <h3 class="manager-card-title">
        {text('FABRICATE.Admin.Manager.Checks.Validation.AllChecks', 'All checks')}
      </h3>
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
      <section class="manager-inspector-card" data-checks-active={activeTab}>
        <h3 class="manager-card-title">{activeTitle}</h3>
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
          <p class="manager-muted" data-checks-active-required>{requiredHint}</p>
        {/if}
      </section>
    {/if}

    {#if !checkOff}
      <section class="manager-inspector-card" data-checks-preview-as>
        <h3 class="manager-card-title">
          {text('FABRICATE.Admin.Manager.Checks.PreviewAs.Title', 'Preview as')}
        </h3>
        <p class="manager-muted">
          {text(
            'FABRICATE.Admin.Manager.Checks.PreviewAs.Hint',
            'Choose an actor and a record to read this check against. Nothing here changes the system.'
          )}
        </p>
        <label class="manager-field">
          <span>{text('FABRICATE.Admin.Manager.Checks.PreviewAs.Actor', 'Actor')}</span>
          <select data-checks-preview-actor disabled={actorOptions.length === 0}>
            {#each actorOptions as option (option.id)}
              <option value={option.id}>{option.name}</option>
            {/each}
            {#if actorOptions.length === 0}
              <option value=""
                >{text('FABRICATE.Admin.Manager.Checks.PreviewAs.NoActors', 'No actors')}</option
              >
            {/if}
          </select>
        </label>
        <label class="manager-field">
          <span>{text('FABRICATE.Admin.Manager.Checks.PreviewAs.Record', 'Against')}</span>
          <select data-checks-preview-record disabled={recordOptions.length === 0}>
            {#each recordOptions as option (option.id)}
              <option value={option.id}>{option.name}</option>
            {/each}
            {#if recordOptions.length === 0}
              <option value=""
                >{text('FABRICATE.Admin.Manager.Checks.PreviewAs.NoRecords', 'No records')}</option
              >
            {/if}
          </select>
        </label>
      </section>

      <section class="manager-checks-rail-panel manager-inspector-card" data-checks-simulator>
        <div class="manager-checks-rail-head">
          <h3 class="manager-card-title">
            {text('FABRICATE.Admin.Manager.Checks.Simulator.Title', 'Outcome preview')}
          </h3>
          <span class="manager-checks-rail-disclosure">
            <RowDisclosure
              expanded={simulatorExpanded}
              controls="checks-rail-simulator-body"
              label={text('FABRICATE.Admin.Manager.Checks.Simulator.Title', 'Outcome preview')}
              dataAttr="data-checks-simulator-disclosure"
              onToggle={(next) => (simulatorExpanded = next)}
            />
          </span>
        </div>
        <div
          class="manager-checks-rail-body"
          class:is-collapsed={!simulatorExpanded}
          id="checks-rail-simulator-body"
        >
          <p class="manager-muted">
            {text(
              'FABRICATE.Admin.Manager.Checks.Simulator.Hint',
              'Roll a test check to see exactly which outcome a record lands on and what it costs the character.'
            )}
          </p>
        </div>
      </section>

      <section class="manager-checks-rail-panel manager-inspector-card" data-checks-odds>
        <div class="manager-checks-rail-head">
          <h3 class="manager-card-title">
            {text('FABRICATE.Admin.Manager.Checks.Odds.Title', 'Chance per outcome')}
          </h3>
          <span class="manager-checks-rail-disclosure">
            <RowDisclosure
              expanded={oddsExpanded}
              controls="checks-rail-odds-body"
              label={text('FABRICATE.Admin.Manager.Checks.Odds.Title', 'Chance per outcome')}
              dataAttr="data-checks-odds-disclosure"
              onToggle={(next) => (oddsExpanded = next)}
            />
          </span>
        </div>
        <div
          class="manager-checks-rail-body"
          class:is-collapsed={!oddsExpanded}
          id="checks-rail-odds-body"
        >
          <p class="manager-muted">
            {text(
              'FABRICATE.Admin.Manager.Checks.Odds.Hint',
              'Once this check has a formula and its outcome bands are set, the chance of landing on each one is listed here.'
            )}
          </p>
        </div>
      </section>
    {/if}

    <section class="manager-inspector-card" data-checks-digest>
      <div class="manager-checks-rail-head">
        <h3 class="manager-card-title">
          {text('FABRICATE.Admin.Manager.Checks.Digest.Title', 'This check')}
        </h3>
        <Chip tone={digestStatus.tone}>{digestStatus.label}</Chip>
      </div>
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

  .manager-checks-rail-head > :global(.manager-card-title) {
    min-width: 0;
  }

  /* Above the shipped 1320 breakpoint these two panels are plain panels: the body shows
     unconditionally and the disclosure control is removed from the tree entirely, so no
     `aria-expanded` is exposed for a region that is not actually collapsible there. This
     is the ONLY breakpoint this component names, and it is one of the six the manager
     container already declares. */
  .manager-checks-rail-body.is-collapsed {
    display: none;
  }

  @container fabricate-manager (min-width: 1321px) {
    .manager-checks-rail-disclosure {
      display: none;
    }

    .manager-checks-rail-body.is-collapsed {
      display: block;
    }
  }
</style>
