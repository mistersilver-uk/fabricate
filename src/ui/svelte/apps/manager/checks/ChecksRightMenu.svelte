<!-- Svelte 5 runes mode -->
<!--
  The Checks Studio's right rail. What it carries on an activity route, and the fact that the
  Validation route's rail is a different, shorter stack, are stated in
  `openspec/specs/ui-integration/spec.md` → "GM Checks Studio"; this file implements that.

  THE ACTIVATION CARD HAS NO HEADING, where every other section here is named by a flat kicker:
  the CARD is the statement — a switch, the words `Check is on`, and, when the mode locks it, a
  padlock and the sentence saying which mode requires it. An `ACTIVE` kicker above a card
  reading `On` said the same thing twice and read as a third section.

  STRUCTURE: FLAT HEADINGS, CARDS BENEATH. Every section is a `.manager-kicker` naming it,
  followed by the card it labels — the Tool Studio's inspector convention. No card wraps a
  section and no panel is a disclosure. The heading ROW is the prototype's inside that
  structure: a leading glyph, the kicker, and an optional right-aligned adjunct.

  THE DIGEST AND THE ALL-CHECKS LIST ARE ONE CARD OF COMPACT ROWS, not a stack of bordered
  cards. Each row is glyph, one line of text and a trailing chevron, and the chevron is an
  affordance: the row opens the section it describes through the same `onOpen` deep link the
  Validation issues use. A row stating an ABSENCE has nowhere to go, so it carries neither a
  chevron nor a target.

  RESPONSIVE BEHAVIOUR REUSES THE SHIPPED CONTAINER LADDER in `styles/fabricate.css` and
  introduces no new breakpoint. At ≤1120 the shipped rule already restacks `.manager-body` to
  one column with `grid-auto-rows: max-content` and hands scrolling to the body; the rail's own
  `overflow-y` / `max-height` are LEFT ALONE, because against a `max-content` track the bound
  resolves to the region's own content height and cannot clip. The real constraint is narrower
  than "do not self-scroll": do not defeat `grid-auto-rows: max-content`, and give no
  `.manager-body` child a DEFINITE height.
-->
<script>
  import Field from '../../../components/Field.svelte';
  import { untrack } from 'svelte';
  import Chip from '../../../components/Chip.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import CheckOddsPanel from './CheckOddsPanel.svelte';
  import CheckOutcomePreview from './CheckOutcomePreview.svelte';
  import SearchablePopover from '../../../components/SearchablePopover.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import { NO_ACTOR_ID } from './checkPreview.js';
  import {
    formatPreviewDifficulties,
    parsePreviewDifficulties,
  } from '../../../../../systems/progressiveCheckSandbox.js';

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
    // The "Preview as" selection. The rail RENDERS it and reports changes; the ROUTE owns it,
    // because the Outcomes band strip is bound to the same record.
    previewActors = [],
    previewRecords = [],
    previewActorId = NO_ACTOR_ID,
    previewRecordId = '',
    previewActorSummary = '',
    // The progressive PREVIEW SANDBOX: a progressive check has no DC, so the record selector
    // has nothing to offer it and the ordered result difficulties take that slot.
    previewIsProgressive = false,
    previewDifficultiesText = '',
    preview = null,
    odds = null,
    onSelectPreviewActor = () => {},
    onSelectPreviewRecord = () => {},
    onEditPreviewDifficulties = () => {},
    onRollPreview = () => {},
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
  // The gathering active toggle is mode-aware and inverted from the generic `optional` flag:
  // d100 is the fixed roll with no toggle, and the other two expose one.
  const gatheringD100 = $derived(activeTab === 'gathering' && activation?.mode === 'd100');
  const showActiveToggle = $derived(
    activeTab === 'gathering' ? !gatheringD100 : activation?.optional === true
  );
  // THE LOCKED TOGGLE ALWAYS READS ON, with no exception, because every mode that hides the
  // switch runs its check (`openspec/specs/ui-integration/spec.md` → "GM Checks Studio").
  // Alchemy `checkMode: 'none'` is not one of them: it reports `optional: true` with
  // `enabled: false` and renders the LIVE switch in its off position, because a GM looking at a
  // check that is off needs the control that turns it back on.
  //
  // Reading this from the MODE rather than from `activation.enabled` is deliberate: a mandatory
  // check runs whatever the persisted flag says, so a locked OFF beside a check the engine rolls
  // would be a worse lie than no state. There is therefore no `lockedOn` flag and no off branch
  // behind it — a constant fed into a ternary is a condition with one reachable arm.
  //
  // ONE VOCABULARY, and `onLabel` is the single source both slots read, so the live switch and
  // the locked indicator can never speak differently.
  const lockedLabel = $derived(
    `${onLabel} — ${text('FABRICATE.Admin.Manager.Checks.Active.LockedSuffix', 'locked by the resolution mode')}`
  );
  const requiredHint = $derived(
    activeTab === 'gathering'
      ? text(
          'FABRICATE.Admin.Manager.Checks.Active.GatheringHint',
          'In d100 mode the gathering check is the fixed d100 roll and cannot be turned off here.'
        )
      : text(
          'FABRICATE.Admin.Manager.Checks.Active.RequiredHint',
          'The current resolution mode requires this check, so it cannot be turned off here.'
        )
  );

  // The "Preview as" option list. "No actor" LEADS, always, and is a real option rather than a
  // search's empty state: it is the selection under which the readout renders its
  // unresolved-roll-data warning, so it must be reachable from any filter — hence its own
  // `data-popover-option` handle rather than a lookup by localized label.
  const noActorLabel = text('FABRICATE.Admin.Manager.Checks.PreviewAs.NoActor', 'No actor');
  const previewActorLabel = text(
    'FABRICATE.Admin.Manager.Checks.PreviewAs.Actor',
    'Preview as actor'
  );
  const selectedPreviewActor = $derived(
    previewActorId === NO_ACTOR_ID
      ? null
      : (previewActors.find((actor) => actor.id === previewActorId) ?? null)
  );
  const previewActorOptions = $derived([
    {
      id: NO_ACTOR_ID,
      label: noActorLabel,
      icon: 'fas fa-user-slash',
      dataId: 'no-actor',
    },
    ...previewActors.map((actor) => ({
      id: actor.id,
      label: actor.name,
      icon: 'fas fa-user',
      img: actor.img || '',
      dataId: actor.id,
    })),
  ]);

  const DOCS_BASE = 'https://mistersilver-uk.github.io/fabricate';

  // The rail opens with a documentation / quickstart PAIR rather than an explainer card, which
  // pushed every panel with a subject below the fold.
  const DOCS_LINKS = {
    crafting: `${DOCS_BASE}/checks/crafting`,
    salvage: `${DOCS_BASE}/checks/salvage`,
    gathering: `${DOCS_BASE}/checks/gathering`,
    // Validation has no page of its own; the Checks root documents it.
    validation: `${DOCS_BASE}/checks/`,
  };
  const docsHref = $derived(DOCS_LINKS[activeTab] || DOCS_LINKS.crafting);
  const docsLabel = text('FABRICATE.Admin.Manager.Checks.Documentation', 'Documentation');
  const quickstartLabel = text('FABRICATE.Admin.Manager.Checks.Quickstart', 'Quickstart');

  // The digest's status chip. THREE states, not interchangeable: `OFF` is a GM's own choice and
  // says nothing about correctness, where `OK` claims the check is complete.
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

  // The odds heading's right-aligned adjunct names the DOMAIN the enumerator walks, so it is
  // DERIVED: a `1d20` check enumerates twenty faces and a `2d6` one does not.
  //
  // IT IS THE ENUMERATOR'S OWN NUMBER WHERE THERE IS ONE. The regex below reads the AUTHORED
  // formula, while the formula that is ROLLED may carry a check modifier's die on top of it, and
  // a heading claiming a domain the panel beneath refuses to chart is the exact failure the
  // histogram is guarded against. A supplied view-model answers for itself, including by
  // answering NOTHING when it abstains; the regex survives only for a rail mounted without one.
  const oddsDomain = $derived.by(() => {
    if (odds) {
      if (odds.enumerable !== true) return '';
      // TWO SENTENCES, because they are two different facts: one die has FACES, while a formula
      // carrying a rolling modifier on top of its own die has a joint SPACE, and calling 160
      // assignments "faces" would name a die with 160 sides that nothing rolls.
      const faces = Number(odds.faces);
      if (Number.isFinite(faces)) {
        return text('FABRICATE.Admin.Manager.Checks.Odds.Faces', 'all {faces} faces').replace(
          '{faces}',
          String(faces)
        );
      }
      const combinations = Number(odds.combinations);
      if (!Number.isFinite(combinations)) return '';
      return text(
        'FABRICATE.Admin.Manager.Checks.Odds.Combinations',
        'all {count} combinations'
      ).replace('{count}', String(combinations));
    }
    const match = /(?:^|[^\w.])\d*d(\d+)/i.exec(activeCheck?.rollFormula ?? '');
    if (!match) return '';
    return text('FABRICATE.Admin.Manager.Checks.Odds.Faces', 'all {faces} faces').replace(
      '{faces}',
      match[1]
    );
  });

  /**
   * The digest's rows, as data. `target` is what the row's chevron opens, and a row with none
   * states an absence. A list rather than four conditional blocks, so the row treatment is
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

  // The Validation rail's rows carry the SAME shape and render through the same row. They open
  // the activity's own check, and their glyph is an activity mark rather than a report on
  // something authored, so `tone` is not `set`.
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

  // THE SANDBOX ORDER FIELD HOLDS THE GM'S OWN TEXT. The stored datum is `number[]`, so echoing
  // the field back through it REWRITES what was typed — "4, " re-renders as "4" and the caret
  // jumps back on every separator. The field therefore keeps its raw text and reseeds from
  // upstream only when the two describe DIFFERENT ORDERS, so an order arriving from a route
  // change, a discarded draft or a reload still lands.
  //
  // Seeded through `untrack` and resynced by the effect, the shipped `PartyNameField` idiom —
  // but the guard is necessary here and is not there, because this field commits on every
  // keystroke rather than on blur, so its upstream value is NOT stable while typing.
  let sandboxText = $state(untrack(() => previewDifficultiesText));
  $effect(() => {
    const incoming = previewDifficultiesText;
    const localOrder = formatPreviewDifficulties(
      parsePreviewDifficulties(untrack(() => sandboxText))
    );
    if (localOrder === incoming) return;
    sandboxText = incoming;
  });

  function editSandbox(raw) {
    sandboxText = raw;
    onEditPreviewDifficulties(raw);
  }
</script>

<!--
  The heading row every section shares: a leading glyph and a flat kicker. A caller carrying an
  adjunct renders it after this, inside the same row, where `margin-left: auto` puts it right.
-->
{#snippet railHead(icon, title)}
  <i class={`${icon} manager-checks-rail-head-icon`} aria-hidden="true"></i>
  <p class="manager-kicker">{title}</p>
{/snippet}

<!--
  One compact row of a rail list. `row.target` is `[activity, section]` or `null`, and a row with
  no target states an absence, so it renders with no chevron and nothing to press. `row.tone` is
  `set` when the glyph reports something the GM has authored.
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
  <!-- The first row: two quiet links, side by side. -->
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
      href={`${DOCS_BASE}/help/quickstart`}
      target="_blank"
      rel="noreferrer"
      data-checks-quickstart-link
    >
      <i class="fas fa-circle-question" aria-hidden="true"></i><span>{quickstartLabel}</span>
    </a>
  </div>

  {#if isValidation}
    <!-- The Validation rail: the docs pair above, and this. Nothing else has a subject on a
         route that validates all three checks at once. -->
    <div class="manager-checks-rail-head">
      {@render railHead(
        'fas fa-layer-group',
        text('FABRICATE.Admin.Manager.Checks.Validation.AllChecks', 'All checks')
      )}
    </div>
    <InspectorCard class="is-rail-list" data-checks-all-checks="">
      {#each allCheckRows as row (row.id)}
        {@render railRow(row, 'data-checks-all-checks-row')}
      {/each}
    </InspectorCard>
  {:else}
    {#if activation}
      <!-- NO KICKER: the card IS the section — the switch, the reading, and the sentence saying
           which mode locks it. See the header. -->
      <InspectorCard
        class={`manager-checks-active-card ${showActiveToggle && !activeOn ? 'is-off' : 'is-on'}`}
        data-checks-active={activeTab}
      >
        {#if showActiveToggle}
          <StatusToggle
            on={activeOn}
            label={activeOn ? onLabel : offLabel}
            data-checks-active-toggle=""
            onclick={() => onToggleActive(!activeOn)}
          />
          <p class="manager-muted">{optionalHint}</p>
        {:else}
          <!-- A LOCKED toggle, not a bare sentence: removing the control removes the STATE with it, so
               a GM could not see whether the check was on at all, and "the mode requires this check"
               does not say which way the switch is set. It is an INDICATOR rather than a disabled
               control, announced as one labelled image rather than as a button. -->
          <StatusToggle
            as="indicator"
            on
            label={onLabel}
            ariaLabel={lockedLabel}
            data-checks-active-locked="on"
          >
            {#snippet trailing()}
              <i class="fas fa-lock manager-checks-active-lock" aria-hidden="true"></i>
            {/snippet}
          </StatusToggle>
          <p class="manager-muted" data-checks-active-required>{requiredHint}</p>
        {/if}
      </InspectorCard>
    {/if}

    {#if !checkOff}
      <!-- THE ACTOR LIST IS FILTERED to player characters and is SEARCHABLE. Authority is not the
           question a preview picker answers — the question is who a check is previewed AGAINST, and
           a crafting check is rolled by a character, where a real world's actor directory is mostly
           bestiary. Membership is `listPreviewActors`'s shared, GM-configurable player-character
           predicate, so this screen gets no narrower answer of its own.

           The control is the shipped `SearchablePopover`, which searches and renders each actor's own
           portrait, so a GM picks a face rather than reading a list.
           `data-checks-preview-actor` stays ON THE TRIGGER via `triggerData`, because a mounted suite
           and six View Lab cases address the control through it.

           "No actor" is an explicit option rather than an absence: under it every `@` key resolves to
           0 and the readout renders its unresolved warning instead of a plausible wrong total. -->
      <div class="manager-checks-rail-head">
        {@render railHead(
          'fas fa-user',
          text('FABRICATE.Admin.Manager.Checks.PreviewAs.Title', 'Preview as')
        )}
      </div>
      <InspectorCard data-checks-preview-as="">
        <SearchablePopover
          value={previewActorId}
          options={previewActorOptions}
          pickerClass="manager-checks-preview-actor"
          triggerClass="fabricate-button manager-button manager-travel-picker-trigger manager-checks-preview-actor-trigger"
          triggerData={{ 'data-checks-preview-actor': '' }}
          triggerIcon={selectedPreviewActor ? '' : 'fas fa-user-slash'}
          triggerImg={selectedPreviewActor?.img || ''}
          triggerLabel={selectedPreviewActor?.name || noActorLabel}
          triggerAriaLabel={previewActorLabel}
          dialogAriaLabel={previewActorLabel}
          searchPlaceholder={text(
            'FABRICATE.Admin.Manager.Checks.PreviewAs.ActorSearchPlaceholder',
            'Search characters...'
          )}
          searchAriaLabel={text(
            'FABRICATE.Admin.Manager.Checks.PreviewAs.ActorSearchLabel',
            'Search characters'
          )}
          emptyHint={text(
            'FABRICATE.Admin.Manager.Checks.PreviewAs.NoActorMatches',
            'No characters match your search.'
          )}
          onChoose={(id) => onSelectPreviewActor(id)}
        />
        {#if previewActorSummary}
          <p class="manager-muted" data-checks-preview-actor-summary>{previewActorSummary}</p>
        {/if}
        {#if previewIsProgressive}
          <!-- THE SANDBOX ORDER, in the slot the record selector cannot fill: a progressive check has
               no DC, so a record — whose whole contribution is a DC — has nothing to offer it, and what
               its histogram needs is an ORDERED list of result difficulties to spend the rolled value
               down. Scratch state for one experiment: persisted on the check so it survives a reload,
               read by no engine path, validated by no readiness rule and stripped by export. A
               nonsensical order is allowed on purpose. -->
          <Field as="label">
            <span
              >{text(
                'FABRICATE.Admin.Manager.Checks.PreviewAs.Difficulties',
                'Result difficulties'
              )}</span
            >
            <input
              type="text"
              inputmode="numeric"
              data-checks-preview-difficulties
              placeholder={text(
                'FABRICATE.Admin.Manager.Checks.PreviewAs.DifficultiesPlaceholder',
                'e.g. 6, 9, 14, 40'
              )}
              value={sandboxText}
              oninput={(event) => editSandbox(event.currentTarget.value)}
            />
          </Field>
          <p class="manager-muted" data-checks-preview-difficulties-hint>
            {text(
              'FABRICATE.Admin.Manager.Checks.PreviewAs.DifficultiesHint',
              'A try-it-out order for this check only. The roll is spent down it in the order you type, and nothing else reads these numbers.'
            )}
          </p>
        {:else}
          <Field as="label">
            <span class="visually-hidden"
              >{text(
                'FABRICATE.Admin.Manager.Checks.PreviewAs.Record',
                'Preview against record'
              )}</span
            >
            <select
              data-checks-preview-record
              value={previewRecordId}
              onchange={(event) => onSelectPreviewRecord(event.currentTarget.value)}
            >
              {#each previewRecords as record (record.id)}
                <option value={record.id}>{record.label}</option>
              {/each}
            </select>
          </Field>
        {/if}
      </InspectorCard>

      <div class="manager-checks-rail-head">
        {@render railHead(
          'fas fa-flask-vial',
          text('FABRICATE.Admin.Manager.Checks.Simulator.Title', 'Outcome preview')
        )}
      </div>
      <InspectorCard data-checks-simulator="">
        <CheckOutcomePreview {preview} onRoll={onRollPreview} />
      </InspectorCard>

      <div class="manager-checks-rail-head">
        {@render railHead(
          'fas fa-chart-column',
          text('FABRICATE.Admin.Manager.Checks.Odds.Title', 'Chance per outcome')
        )}
        {#if oddsDomain}
          <span class="manager-checks-rail-head-note" data-checks-odds-domain>{oddsDomain}</span>
        {/if}
      </div>
      <InspectorCard data-checks-odds="">
        <CheckOddsPanel {odds} />
      </InspectorCard>
    {/if}

    <div class="manager-checks-rail-head">
      {@render railHead(
        'fas fa-clipboard-check',
        text('FABRICATE.Admin.Manager.Checks.Digest.Title', 'This check')
      )}
      <Chip tone={digestStatus.tone}>{digestStatus.label}</Chip>
    </div>
    <InspectorCard class="is-rail-list" data-checks-digest="">
      {#each digestRows as row (row.id)}
        {@render railRow(row, 'data-checks-digest-row')}
      {/each}
    </InspectorCard>
  {/if}
</aside>

<!--
  NO SCOPED BLOCK. Every rule this rail draws itself with is a MEASURED value taken from the
  prototype, and they live together in the sheet's Checks Studio parity block, next to the
  numbers they have to agree with.

  THERE IS NO GATE BEHIND THEM. The live instrument is `scripts/visual-parity/`, which is
  dev-time only and never runs in CI — so a number changed here reds nothing, which is exactly
  how three type-scale values in this rail came to drift unnoticed. Measure by hand, and pin
  anything that must not move again in `tests/components/manager-layout.test.js`, which does run
  under `npm test`.
-->
