<!-- Svelte 5 runes mode -->
<!--
  The Component Studio's COMPLICATIONS authoring section (issue 1286): what goes wrong when
  this component is produced as a stage of a progressive result.

  ## THE SECTION'S OWN VISIBILITY GATE

  It renders only when the SYSTEM resolves at least one activity progressively. A
  complication has no moment to fire in a system with no progressive resolution anywhere,
  and a card offering the GM a consequence that can never happen is worse than no card. The
  gate lives here rather than in `ComponentEditView` so there is ONE predicate, not a prop
  the host could forget to compute.

  ## THE SUB-LINE IS NOT THE PROTOTYPE'S

  The prototype says "what can go wrong when this component is gathered, salvaged, or
  crafted with", which is wrong for the shipped model twice over: a complication fires when
  this component is PRODUCED as a progressive stage — as a recipe result, a salvage yield or
  a gathering drop — and NOT when the component is itself salvaged or spent. That second
  case is real and is deferred to issue 1287, so the copy discloses it rather than letting a GM
  author a complication for a moment this build never reaches. The string also says nothing
  about player visibility of world data: `visibility: 'gmOnly'` is a DISCLOSURE guarantee,
  not a confidentiality one, and the place to state that limit is the spec and the field
  documentation, not a line of editor chrome that would read as a warning about this
  component.

  ## IDS ARE MINTED THROUGH AN INJECTED `random`

  Every sibling authoring section mints a client-side id with
  `typeof random === 'function' ? random() : Math.random().toString(36)...`. Copying that
  idiom would put a `Math.random()` literal in NEW code, which SonarCloud flags (S2245).
  This section takes the mint as a prop, falls back to `foundry.utils.randomID()` when the
  host passes none, and never reaches for `Math.random()` at all. The last-resort counter is
  for a context with neither — a mounted test, the View Lab — where determinism is a feature
  rather than a weakness.

  ## WHAT IT DOES NOT OWN

  The draft lives in `ComponentEditView`, which is what makes an edit here dirty the
  component and survive Save. This section is a controlled component: it never mutates the
  array it is given, it emits a whole new one, and the only state it keeps is which row is
  open and what a rejected macro drop should say.
-->
<script>
  import Chip from '../Chip.svelte';
  import EmptyState from '../EmptyState.svelte';
  import ItemDropZone from '../ItemDropZone.svelte';
  import SearchablePopover from '../SearchablePopover.svelte';
  import SegmentedControl from '../SegmentedControl.svelte';
  import ComplicationEffectRow from '../ComplicationEffectRow.svelte';
  import ComplicationSummaryRow from '../ComplicationSummaryRow.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { resolveDropUuid } from '../../../util/dropUtils.js';
  import {
    MACRO_DROP_REJECTED_NOT_SCRIPT,
    evaluateMacroDrop,
    resolveMacroName,
  } from '../../../../../utils/macroReference.js';
  import {
    COMPLICATION_ACTIVITIES,
    DEFAULT_COMPLICATION_MATCH_MODE,
    DEFAULT_COMPLICATION_SEVERITY,
    DEFAULT_COMPLICATION_VISIBILITY,
  } from '../../../../../utils/componentComplications.js';
  import { complicationSummary } from '../../../../../utils/complicationSummary.js';
  import {
    PREREQUISITE_OPERATORS,
    isValuelessOperator,
  } from '../../../../../systems/characterPrerequisites.js';

  let {
    complications = [],
    // Whether the SYSTEM resolves each activity progressively. It is the section's gate and
    // the "· not progressive" annotation on each Applies-to chip: a complication may be
    // authored for an activity this system does not resolve progressively — it is stored,
    // and it will not fire — and saying so at authoring time is the whole point of the
    // annotation.
    activityProgressive = {},
    // The named triggers on the three progressive check blocks: `{ id, label, activity }`.
    // A trigger id names a trigger in exactly ONE activity's id space, so the option is
    // labelled by its OWNING activity or two identically-named triggers are indistinguishable.
    triggerOptions = [],
    // `viewState.selectedSystem.availableScriptMacros` — already `type === 'script'`-filtered
    // and name-sorted by the store. Deliberately not a new projection.
    macroOptions = [],
    saving = false,
    // The client-side id mint. See the header note on `Math.random()`.
    random = undefined,
    onChange = () => {},
  } = $props();

  let openId = $state('');
  let macroWarning = $state('');
  let macroNames = $state({});
  let localIdCounter = 0;

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  /** The activity vocabulary with its glyphs, in the prototype's own order. */
  const ACTIVITY_ICONS = Object.freeze({
    gathering: 'fas fa-seedling',
    salvage: 'fas fa-recycle',
    crafting: 'fas fa-hammer',
  });
  const ACTIVITY_ORDER = Object.freeze(['gathering', 'salvage', 'crafting']);

  const CONDITION_DEFS = Object.freeze([
    {
      key: 'stageMissed',
      icon: 'fas fa-xmark',
      tone: 'danger',
      title: [
        'FABRICATE.Admin.Manager.Component.Complications.Condition.StageMissed.Title',
        'The award is missed',
      ],
      detail: [
        'FABRICATE.Admin.Manager.Component.Complications.Condition.StageMissed.Detail',
        'The roll never reaches this stage, or stops before it — nothing is granted for it.',
      ],
    },
    {
      key: 'stagePartial',
      icon: 'fas fa-circle-half-stroke',
      tone: 'warning',
      title: [
        'FABRICATE.Admin.Manager.Component.Complications.Condition.StagePartial.Title',
        'The award is only partly covered',
      ],
      detail: [
        'FABRICATE.Admin.Manager.Component.Complications.Condition.StagePartial.Detail',
        'The roll covers some of this stage’s difficulty but not all of it. Only reachable where the system awards partial stages.',
      ],
    },
    {
      key: 'stageAwarded',
      icon: 'fas fa-check',
      tone: 'success',
      title: [
        'FABRICATE.Admin.Manager.Component.Complications.Condition.StageAwarded.Title',
        'The award is granted',
      ],
      detail: [
        'FABRICATE.Admin.Manager.Component.Complications.Condition.StageAwarded.Detail',
        'Fires on a clean stage — for consequences that come with the prize.',
      ],
    },
  ]);

  const anyProgressive = $derived(
    COMPLICATION_ACTIVITIES.some((activity) => activityProgressive?.[activity] === true)
  );

  // FULL key literals per activity rather than a composed `${BASE}.${activity}`:
  // `tests/ui-lang-keys-resolve.test.js` can only prove a key it can see written down, and a
  // composed one is a namespace base it admits without ever resolving the leaf.
  const ACTIVITY_LABELS = Object.freeze({
    gathering: ['FABRICATE.Admin.Manager.Component.Complications.Activity.gathering', 'Gathering'],
    salvage: ['FABRICATE.Admin.Manager.Component.Complications.Activity.salvage', 'Salvage'],
    crafting: ['FABRICATE.Admin.Manager.Component.Complications.Activity.crafting', 'Crafting'],
  });

  const SEVERITY_LABELS = Object.freeze({
    minor: ['FABRICATE.Admin.Manager.Component.Complications.Severity.minor', 'Minor'],
    major: ['FABRICATE.Admin.Manager.Component.Complications.Severity.major', 'Major'],
    severe: ['FABRICATE.Admin.Manager.Component.Complications.Severity.severe', 'Severe'],
  });

  function activityLabel(activity) {
    return text(...ACTIVITY_LABELS[activity]);
  }

  function severityLabel(severity) {
    const declared = SEVERITY_LABELS[severity];
    return declared ? text(...declared) : severity;
  }

  function isProgressive(activity) {
    return activityProgressive?.[activity] === true;
  }

  /** How many complications are enabled for one activity. */
  function countFor(activity) {
    return complications.filter((entry) => entry?.activities?.[activity] === true).length;
  }

  /**
   * A progressive activity pill's `title`, with the count the label suppresses.
   *
   * Three FULL key literals rather than one composed key with a `{count}` that also has to
   * carry the plural: `tests/ui-lang-keys-resolve.test.js` can only prove a key it can see
   * written down, and the manager's own plural idiom is a sibling `…One` key chosen by
   * `count === 1` (`ToolsBrowserView`, `ImportFolderMappingModal`).
   */
  function countTitle(label, count) {
    if (count === 0) {
      return text(
        'FABRICATE.Admin.Manager.Component.Complications.ActivityProgressive',
        '{activity} uses progressive resolution in this system.'
      ).replace('{activity}', label);
    }
    const key =
      count === 1
        ? 'FABRICATE.Admin.Manager.Component.Complications.ActivityProgressiveCountOne'
        : 'FABRICATE.Admin.Manager.Component.Complications.ActivityProgressiveCount';
    const fallback =
      count === 1
        ? '{activity} uses progressive resolution in this system — 1 complication.'
        : '{activity} uses progressive resolution in this system — {count} complications.';
    return text(key, fallback).replace('{activity}', label).replace('{count}', String(count));
  }

  const headerPills = $derived(
    ACTIVITY_ORDER.map((activity) => {
      const progressive = isProgressive(activity);
      const label = activityLabel(activity);
      const count = progressive ? countFor(activity) : 0;
      return {
        activity,
        icon: ACTIVITY_ICONS[activity],
        // A dimmed `muted` chip, NOT the shipped `is-disabled` tone: that one is joined to
        // the WARNING family, so "Salvage · n/a" would render amber and read as a hazard
        // the GM must act on rather than as a fact about the system.
        tone: progressive ? '' : 'muted',
        // A ZERO is SUPPRESSED, on the prototype's own rule
        // (`label + (on ? (n ? ' · ' + n : '') : ' · n/a')`): the pill's job on a
        // progressive activity is to say the activity resolves progressively, and
        // "Salvage · 0" spends a counter slot restating the empty state already drawn
        // below it. The count earns the suffix only once there is one.
        label: progressive
          ? count > 0
            ? text(
                'FABRICATE.Admin.Manager.Component.Complications.ActivityCount',
                '{activity} · {count}'
              )
                .replace('{activity}', label)
                .replace('{count}', String(count))
            : label
          : text(
              'FABRICATE.Admin.Manager.Component.Complications.ActivityNone',
              '{activity} · n/a'
            ).replace('{activity}', label),
        // The count the LABEL drops is not lost — the prototype's `title` keeps it
        // ("… — 2 complications"), which is where a number belongs once the pill itself
        // has stopped shouting it.
        title: progressive
          ? countTitle(label, count)
          : text(
              'FABRICATE.Admin.Manager.Component.Complications.ActivityNotProgressive',
              '{activity} does not use progressive resolution in this system, so a complication enabled for it is stored but never fires.'
            ).replace('{activity}', label),
      };
    })
  );

  /** The six NUMERIC comparators, filtered off the shared table rather than hand-listed. */
  const comparatorOptions = $derived(
    PREREQUISITE_OPERATORS.filter((operator) => !isValuelessOperator(operator.id))
  );

  const severityOptions = $derived([
    {
      value: 'minor',
      labelKey: 'FABRICATE.Admin.Manager.Component.Complications.Severity.minor',
      fallback: 'Minor',
      variant: 'info',
    },
    {
      value: 'major',
      labelKey: 'FABRICATE.Admin.Manager.Component.Complications.Severity.major',
      fallback: 'Major',
      variant: 'warning',
    },
    {
      value: 'severe',
      labelKey: 'FABRICATE.Admin.Manager.Component.Complications.Severity.severe',
      fallback: 'Severe',
      variant: 'danger',
    },
  ]);

  const matchOptions = $derived([
    {
      value: 'any',
      labelKey: 'FABRICATE.Admin.Manager.Component.Complications.Match.any',
      fallback: 'Any',
    },
    {
      value: 'all',
      labelKey: 'FABRICATE.Admin.Manager.Component.Complications.Match.all',
      fallback: 'All',
    },
  ]);

  const macroPickerOptions = $derived(
    (macroOptions || [])
      .filter((macro) => macro?.uuid)
      .map((macro) => ({
        id: macro.uuid,
        label: macro.name || macro.uuid,
        icon: 'fas fa-scroll',
        dataId: macro.uuid,
      }))
  );

  const triggerLabelById = $derived(
    new Map(
      (triggerOptions || [])
        .filter((option) => option?.id)
        .map((option) => [option.id, option.label || option.id])
    )
  );

  // Resolve the NAME of every linked macro that the picker's own list does not already
  // carry — a compendium macro, or one that has since been deleted. The picker list is
  // consulted first because it is synchronous and covers every world script macro; this
  // effect exists for the two cases it cannot answer, and `missing` is what paints the
  // broken-link treatment on the drop zone.
  $effect(() => {
    const linked = [
      ...new Set(
        complications
          .map((entry) => entry?.macroUuid)
          .filter((uuid) => uuid && !macroOptions.some((macro) => macro?.uuid === uuid))
      ),
    ];
    const resolved = {};
    const cancels = linked.map((uuid) =>
      resolveMacroName(uuid, (state) => {
        resolved[uuid] = state;
        // Assigned, never read: reading `macroNames` here would make this effect depend on
        // what it writes.
        macroNames = { ...resolved };
      })
    );
    return () => {
      for (const cancel of cancels) cancel();
    };
  });

  function macroDisplay(uuid) {
    if (!uuid) return { name: '', missing: false };
    const known = (macroOptions || []).find((macro) => macro?.uuid === uuid);
    if (known) return { name: known.name || uuid, missing: false };
    const resolved = macroNames[uuid];
    if (resolved) return { name: resolved.name || uuid, missing: resolved.missing === true };
    return { name: uuid, missing: false };
  }

  function summaryFor(complication) {
    return complicationSummary(complication, {
      translate: text,
      macroName: macroDisplay(complication.macroUuid).name,
      triggerName: triggerLabelById.get(complication?.when?.checkTrigger) || '',
    });
  }

  function activityGlyphsFor(complication) {
    return ACTIVITY_ORDER.filter((activity) => complication?.activities?.[activity] === true).map(
      (activity) => ({
        icon: ACTIVITY_ICONS[activity],
        title: activityLabel(activity),
        dim: !isProgressive(activity),
      })
    );
  }

  function mintId() {
    if (typeof random === 'function') return random();
    const foundryMint = globalThis.foundry?.utils?.randomID;
    if (typeof foundryMint === 'function') return foundryMint();
    localIdCounter += 1;
    return `complication-${localIdCounter}`;
  }

  function emit(next) {
    onChange(next);
  }

  function patch(id, mutate) {
    emit(complications.map((entry) => (entry.id === id ? mutate({ ...entry }) : entry)));
  }

  function addComplication() {
    const id = mintId();
    // Every default here is the MODEL's declared default, not the prototype's seed data:
    // two defaults for one field is exactly the drift `componentComplications.js` states
    // its vocabularies to prevent. The one authored choice is `stageMissed`, which is the
    // condition a GM reaching for a complication is nearly always after.
    const complication = {
      id,
      name: text('FABRICATE.Admin.Manager.Component.Complications.NewName', 'New complication'),
      description: '',
      severity: DEFAULT_COMPLICATION_SEVERITY,
      visibility: DEFAULT_COMPLICATION_VISIBILITY,
      activities: Object.fromEntries(
        COMPLICATION_ACTIVITIES.map((activity) => [activity, isProgressive(activity)])
      ),
      match: DEFAULT_COMPLICATION_MATCH_MODE,
      when: {
        stageAwarded: false,
        stagePartial: false,
        stageMissed: true,
        checkTrigger: null,
      },
      rollCondition: { enabled: false, expr: '1d20', cmp: 'eq', value: '1' },
      effectRoll: { enabled: false, expr: '1d6', label: '' },
    };
    openId = id;
    emit([...complications, complication]);
  }

  function removeComplication(id) {
    if (openId === id) openId = '';
    emit(complications.filter((entry) => entry.id !== id));
  }

  function toggleOpen(id) {
    openId = openId === id ? '' : id;
  }

  function setField(id, field, value) {
    patch(id, (entry) => ({ ...entry, [field]: value }));
  }

  function toggleActivity(id, activity) {
    patch(id, (entry) => ({
      ...entry,
      activities: { ...entry.activities, [activity]: entry.activities?.[activity] !== true },
    }));
  }

  function setWhen(id, key, value) {
    patch(id, (entry) => ({ ...entry, when: { ...entry.when, [key]: value } }));
  }

  function setNested(id, group, field, value) {
    patch(id, (entry) => ({ ...entry, [group]: { ...entry[group], [field]: value } }));
  }

  function setMacro(id, uuid) {
    macroWarning = '';
    patch(id, (entry) => {
      const next = { ...entry };
      // The key is DELETED rather than written empty: `macroUuid` is absent on a
      // complication that names no macro, and an empty string would round-trip as a
      // present-but-blank reference.
      if (uuid) next.macroUuid = uuid;
      else delete next.macroUuid;
      return next;
    });
  }

  // The `type !== 'script'` rejection, on `EssenceEditView`'s authority — it is the shipped
  // surface for this refusal and the prototype draws none. It cannot live in the drop
  // predicate: a payload's `type` is the DOCUMENT NAME (`'Macro'`), and the macro's own type
  // needs `await fromUuid`.
  async function handleMacroDrop(id, data) {
    macroWarning = '';
    const result = await evaluateMacroDrop(resolveDropUuid(data));
    if (result.accepted) {
      setMacro(id, result.uuid);
      return;
    }
    macroWarning =
      result.reason === MACRO_DROP_REJECTED_NOT_SCRIPT
        ? text(
            'FABRICATE.Admin.Manager.Component.Complications.Macro.NotScript',
            'That macro is not a script macro, so Fabricate cannot run it. Change its type to Script and drop it again.'
          )
        : text(
            'FABRICATE.Admin.Manager.Component.Complications.Macro.Unresolved',
            'That macro could not be found. Drop a macro from this world or an installed compendium.'
          );
  }
</script>

{#if anyProgressive}
  <section
    class="manager-component-panel"
    data-component-edit-section="complications"
    data-complications-section
  >
    <div class="manager-task-card-heading">
      <div>
        <h3>
          <i class="fas fa-triangle-exclamation fab-complications-title-glyph" aria-hidden="true"
          ></i>{text('FABRICATE.Admin.Manager.Component.Complications.Title', 'Complications')}
        </h3>
        <p class="manager-muted fab-complications-hint">
          {text(
            'FABRICATE.Admin.Manager.Component.Complications.Hint',
            'What goes wrong when this component is produced as a stage of a progressive result — a progressive craft, salvage or gathering. A complication does not fire when this component is itself salvaged or spent.'
          )}
        </p>
      </div>
      <div class="fab-complications-pills manager-task-card-heading-control">
        {#each headerPills as pill (pill.activity)}
          <Chip
            tone={pill.tone}
            icon={pill.icon}
            title={pill.title}
            truncate
            data-complications-activity-pill={pill.activity}>{pill.label}</Chip
          >
        {/each}
      </div>
    </div>

    {#if complications.length === 0}
      <EmptyState
        inline
        icon="fas fa-feather"
        hint={text(
          'FABRICATE.Admin.Manager.Component.Complications.Empty',
          'Nothing goes wrong with this component yet. Add a complication to give a missed, partial or unlucky stage a consequence.'
        )}
        dataAttr="data-complications-empty"
      />
    {:else}
      <div class="fab-complications-list">
        {#each complications as complication (complication.id)}
          {@const open = openId === complication.id}
          <ComplicationSummaryRow
            variant="authoring"
            name={complication.name}
            severity={complication.severity}
            severityLabel={severityLabel(complication.severity)}
            visibility={complication.visibility}
            playerLabel={text(
              'FABRICATE.Admin.Manager.Component.Complications.PlayerPill',
              'Player'
            )}
            playerTitle={text(
              'FABRICATE.Admin.Manager.Component.Complications.PlayerPillTitle',
              'Shown to the player when it fires.'
            )}
            triggerSentence={summaryFor(complication)}
            activities={activityGlyphsFor(complication)}
            expanded={open}
            controls={`complication-detail-${complication.id}`}
            disclosureLabel={complication.name}
            disabled={saving}
            deleteLabel={text(
              'FABRICATE.Admin.Manager.Component.Complications.Remove',
              'Remove complication'
            )}
            dataAttr="data-complication"
            dataValue={complication.id}
            onToggle={() => toggleOpen(complication.id)}
            onDelete={() => removeComplication(complication.id)}
          >
            <div class="fab-complication-fields">
              <label class="fab-complication-field is-grow">
                <span class="manager-component-micro-label"
                  >{text('FABRICATE.Admin.Manager.Component.Complications.Name', 'Name')}</span
                >
                <input
                  class="manager-input"
                  type="text"
                  value={complication.name}
                  data-complication-name
                  placeholder={text(
                    'FABRICATE.Admin.Manager.Component.Complications.NamePlaceholder',
                    'What goes wrong'
                  )}
                  disabled={saving}
                  oninput={(event) => setField(complication.id, 'name', event.currentTarget.value)}
                />
              </label>
              <div class="fab-complication-field">
                <span class="manager-component-micro-label"
                  >{text(
                    'FABRICATE.Admin.Manager.Component.Complications.SeverityLabel',
                    'Severity'
                  )}</span
                >
                <SegmentedControl
                  options={severityOptions}
                  value={complication.severity}
                  groupName={`complication-severity-${complication.id}`}
                  ariaLabel={text(
                    'FABRICATE.Admin.Manager.Component.Complications.SeverityLabel',
                    'Severity'
                  )}
                  dataAttr="data-complication-severity"
                  optionDataAttr="data-complication-severity-option"
                  density="field"
                  onChange={(value) => setField(complication.id, 'severity', value)}
                />
              </div>
              <ComplicationEffectRow
                control="switch"
                form="pill"
                on={complication.visibility === 'visible'}
                onTone="accent"
                icon="fas fa-eye"
                tone={complication.visibility === 'visible' ? 'accent' : 'subtle'}
                title={text(
                  'FABRICATE.Admin.Manager.Component.Complications.TellPlayer',
                  'Tell the player'
                )}
                disabled={saving}
                dataAttr="data-complication-visibility"
                onToggle={(next) =>
                  setField(complication.id, 'visibility', next ? 'visible' : 'gmOnly')}
              />
            </div>

            <label class="fab-complication-field">
              <span class="manager-component-micro-label"
                >{text(
                  'FABRICATE.Admin.Manager.Component.Complications.Description',
                  'What happens'
                )}</span
              >
              <textarea
                class="manager-input"
                rows="2"
                value={complication.description}
                data-complication-description
                placeholder={text(
                  'FABRICATE.Admin.Manager.Component.Complications.DescriptionPlaceholder',
                  'Read-aloud or GM note for the moment it fires.'
                )}
                disabled={saving}
                oninput={(event) =>
                  setField(complication.id, 'description', event.currentTarget.value)}></textarea>
            </label>

            <div class="fab-complication-field">
              <span class="manager-component-micro-label"
                >{text(
                  'FABRICATE.Admin.Manager.Component.Complications.AppliesTo',
                  'Applies to'
                )}</span
              >
              <div class="fab-complication-activity-chips">
                {#each ACTIVITY_ORDER as activity (activity)}
                  {@const on = complication.activities?.[activity] === true}
                  {@const progressive = isProgressive(activity)}
                  <!-- The CHOSEN state and the NOT-PROGRESSIVE state are two independent
                       axes, exactly as the prototype composes them: its chip is
                       `background: on ? accent-soft : surface-soft` with
                       `opacity: prog ? 1 : .6` written OUTSIDE the `on` branch. Collapsing
                       them into one ternary inverts the warning — the case worth flagging
                       is an activity the GM HAS selected and the system will not resolve
                       progressively, and a single ternary paints exactly that case at full
                       accent strength while dimming the harmless unselected one. -->
                  <Chip
                    tag="button"
                    type="button"
                    tone={on ? 'accent' : ''}
                    class={progressive ? '' : 'is-not-progressive'}
                    icon={ACTIVITY_ICONS[activity]}
                    aria-pressed={on}
                    disabled={saving}
                    title={progressive
                      ? undefined
                      : text(
                          'FABRICATE.Admin.Manager.Component.Complications.ActivityNotProgressive',
                          '{activity} does not use progressive resolution in this system, so a complication enabled for it is stored but never fires.'
                        ).replace('{activity}', activityLabel(activity))}
                    data-complication-activity={activity}
                    onclick={() => toggleActivity(complication.id, activity)}
                    >{activityLabel(activity)}{#if !progressive}<span
                        class="fab-complication-activity-note"
                        >{text(
                          'FABRICATE.Admin.Manager.Component.Complications.NotProgressive',
                          '· not progressive'
                        )}</span
                      >{/if}</Chip
                  >
                {/each}
              </div>
            </div>

            <div class="fab-complication-card">
              <div class="fab-complication-card-heading">
                <span class="manager-component-micro-label"
                  >{text('FABRICATE.Admin.Manager.Component.Complications.When', 'When')}</span
                >
                <span class="fab-complication-card-hint"
                  >{complication.match === 'all'
                    ? text(
                        'FABRICATE.Admin.Manager.Component.Complications.MatchHintAll',
                        'every checked condition must be true'
                      )
                    : text(
                        'FABRICATE.Admin.Manager.Component.Complications.MatchHintAny',
                        'any checked condition is enough'
                      )}</span
                >
                <SegmentedControl
                  options={matchOptions}
                  value={complication.match}
                  groupName={`complication-match-${complication.id}`}
                  ariaLabel={text(
                    'FABRICATE.Admin.Manager.Component.Complications.MatchLabel',
                    'How the conditions combine'
                  )}
                  dataAttr="data-complication-match"
                  optionDataAttr="data-complication-match-option"
                  density="compact"
                  onChange={(value) => setField(complication.id, 'match', value)}
                />
              </div>
              <div class="fab-complication-rows">
                {#each CONDITION_DEFS as condition (condition.key)}
                  <ComplicationEffectRow
                    control="checkbox"
                    on={complication.when?.[condition.key] === true}
                    icon={condition.icon}
                    tone={condition.tone}
                    title={text(...condition.title)}
                    detail={text(...condition.detail)}
                    disabled={saving}
                    dataAttr="data-complication-condition"
                    dataValue={condition.key}
                    onToggle={(next) => setWhen(complication.id, condition.key, next)}
                  />
                {/each}

                <!-- The trigger clause is a TRIGGER ID, never a boolean: "any trigger fires
                     any complication" would silently give every already-authored breakage
                     trigger a fourth effect in every world that has one. -->
                <ComplicationEffectRow
                  control="checkbox"
                  on={Boolean(complication.when?.checkTrigger)}
                  icon="fas fa-bolt"
                  tone="accent"
                  title={text(
                    'FABRICATE.Admin.Manager.Component.Complications.Condition.CheckTrigger.Title',
                    'A named progressive check trigger fires'
                  )}
                  detail={text(
                    'FABRICATE.Admin.Manager.Component.Complications.Condition.CheckTrigger.Detail',
                    'Fires when the trigger you name matches the roll, whatever its own break-tools or outcome effects do.'
                  )}
                  disabled={saving || triggerOptions.length === 0}
                  dataAttr="data-complication-condition"
                  dataValue="checkTrigger"
                  onToggle={(next) =>
                    setWhen(
                      complication.id,
                      'checkTrigger',
                      next ? triggerOptions[0]?.id || null : null
                    )}
                >
                  <select
                    class="manager-input fab-complication-trigger-select"
                    value={complication.when?.checkTrigger || ''}
                    data-complication-trigger
                    aria-label={text(
                      'FABRICATE.Admin.Manager.Component.Complications.Condition.CheckTrigger.Select',
                      'Check trigger'
                    )}
                    disabled={saving}
                    onchange={(event) =>
                      setWhen(complication.id, 'checkTrigger', event.currentTarget.value || null)}
                  >
                    {#each triggerOptions as option (option.id)}
                      <option value={option.id}
                        >{option.label}{option.activity
                          ? ` · ${activityLabel(option.activity)}`
                          : ''}</option
                      >
                    {/each}
                    {#if complication.when?.checkTrigger && !triggerLabelById.has(complication.when.checkTrigger)}
                      <!-- An id that no longer resolves leaves the clause INERT rather than
                           becoming a validation error, so the authored value is kept and
                           named instead of being silently rewritten to another trigger. -->
                      <option value={complication.when.checkTrigger}
                        >{text(
                          'FABRICATE.Admin.Manager.Component.Complications.Condition.CheckTrigger.Unknown',
                          'Trigger no longer exists'
                        )}</option
                      >
                    {/if}
                  </select>
                </ComplicationEffectRow>

                <ComplicationEffectRow
                  control="checkbox"
                  on={complication.rollCondition?.enabled === true}
                  icon="fas fa-dice-d20"
                  tone="info"
                  title={text(
                    'FABRICATE.Admin.Manager.Component.Complications.RollCondition.Title',
                    'A dice expression resolves true'
                  )}
                  detail={text(
                    'FABRICATE.Admin.Manager.Component.Complications.RollCondition.Detail',
                    'Rolled against the character at the moment the result is decided.'
                  )}
                  disabled={saving}
                  dataAttr="data-complication-roll-condition"
                  onToggle={(next) => setNested(complication.id, 'rollCondition', 'enabled', next)}
                >
                  <input
                    class="manager-input fab-complication-expression"
                    type="text"
                    value={complication.rollCondition?.expr || ''}
                    data-complication-roll-condition-expr
                    placeholder="2d6 + @abilities.int.mod"
                    aria-label={text(
                      'FABRICATE.Admin.Manager.Component.Complications.RollCondition.Expression',
                      'Condition dice expression'
                    )}
                    disabled={saving}
                    oninput={(event) =>
                      setNested(
                        complication.id,
                        'rollCondition',
                        'expr',
                        event.currentTarget.value
                      )}
                  />
                  <!-- The SIX numeric comparators, filtered off the shared prerequisite
                       table by `isValuelessOperator` rather than hand-listed: a dice total
                       has no boolean or existence reading, and an `exists` offered against
                       a roll total is a complication that always fires. -->
                  <select
                    class="manager-input fab-complication-comparator"
                    value={complication.rollCondition?.cmp || ''}
                    data-complication-roll-condition-cmp
                    aria-label={text(
                      'FABRICATE.Admin.Manager.Component.Complications.RollCondition.Comparator',
                      'Comparison'
                    )}
                    disabled={saving}
                    onchange={(event) =>
                      setNested(complication.id, 'rollCondition', 'cmp', event.currentTarget.value)}
                  >
                    {#each comparatorOptions as operator (operator.id)}
                      <option value={operator.id}>{operator.symbol} · {operator.label}</option>
                    {/each}
                  </select>
                  <input
                    class="manager-input fab-complication-comparand"
                    type="text"
                    value={complication.rollCondition?.value ?? ''}
                    data-complication-roll-condition-value
                    aria-label={text(
                      'FABRICATE.Admin.Manager.Component.Complications.RollCondition.Value',
                      'Compare against'
                    )}
                    disabled={saving}
                    oninput={(event) =>
                      setNested(
                        complication.id,
                        'rollCondition',
                        'value',
                        event.currentTarget.value
                      )}
                  />
                </ComplicationEffectRow>
              </div>
            </div>

            <div class="fab-complication-card">
              <div class="fab-complication-card-heading">
                <span class="manager-component-micro-label"
                  >{text('FABRICATE.Admin.Manager.Component.Complications.Then', 'Then')}</span
                >
                <span class="fab-complication-card-hint"
                  >{text(
                    'FABRICATE.Admin.Manager.Component.Complications.ThenHint',
                    'both optional — leave them off and the complication is narration only'
                  )}</span
                >
              </div>
              <div class="fab-complication-rows">
                <ComplicationEffectRow
                  control="switch"
                  form="effect"
                  on={complication.effectRoll?.enabled === true}
                  icon="fas fa-dice-d6"
                  tone={complication.effectRoll?.enabled ? 'accent' : 'subtle'}
                  title={text(
                    'FABRICATE.Admin.Manager.Component.Complications.EffectRoll.Title',
                    'Roll a dice expression'
                  )}
                  detail={text(
                    'FABRICATE.Admin.Manager.Component.Complications.EffectRoll.Detail',
                    'Rolled and posted to chat when the complication fires.'
                  )}
                  disabled={saving}
                  dataAttr="data-complication-effect-roll"
                  onToggle={(next) => setNested(complication.id, 'effectRoll', 'enabled', next)}
                >
                  <input
                    class="manager-input fab-complication-expression is-short"
                    type="text"
                    value={complication.effectRoll?.expr || ''}
                    data-complication-effect-roll-expr
                    placeholder="1d6"
                    aria-label={text(
                      'FABRICATE.Admin.Manager.Component.Complications.EffectRoll.Expression',
                      'Effect dice expression'
                    )}
                    disabled={saving}
                    oninput={(event) =>
                      setNested(complication.id, 'effectRoll', 'expr', event.currentTarget.value)}
                  />
                  <input
                    class="manager-input fab-complication-expression"
                    type="text"
                    value={complication.effectRoll?.label || ''}
                    data-complication-effect-roll-label
                    placeholder={text(
                      'FABRICATE.Admin.Manager.Component.Complications.EffectRoll.LabelPlaceholder',
                      'Label for the roll — e.g. Shrapnel damage'
                    )}
                    aria-label={text(
                      'FABRICATE.Admin.Manager.Component.Complications.EffectRoll.Label',
                      'Effect roll label'
                    )}
                    disabled={saving}
                    oninput={(event) =>
                      setNested(complication.id, 'effectRoll', 'label', event.currentTarget.value)}
                  />
                </ComplicationEffectRow>

                <div class="fab-complication-macro" data-complication-macro>
                  <ComplicationEffectRow
                    control="none"
                    form="effect"
                    icon="fas fa-code"
                    tone={complication.macroUuid ? 'accent' : 'subtle'}
                    title={text(
                      'FABRICATE.Admin.Manager.Component.Complications.Macro.Title',
                      'Run a macro'
                    )}
                    detail={text(
                      'FABRICATE.Admin.Manager.Component.Complications.Macro.Detail',
                      'Receives the component, the character and the complication. It runs on a GM client.'
                    )}
                  >
                    <div class="fab-complication-macro-controls">
                      <!-- `ItemDropZone` has no click handler at all — only `use:dragDrop` —
                           and `SearchablePopover` owns its own trigger and portals to the
                           manager host. The prototype makes the dashed prompt ITSELF the
                           trigger; the recorded deviation is that the browse control is a
                           separate button beside the drop target rather than the target
                           becoming one. -->
                      <ItemDropZone
                        item={complication.macroUuid
                          ? { name: macroDisplay(complication.macroUuid).name }
                          : null}
                        documentType="Macro"
                        kind="complication-macro"
                        emptyIcon="fas fa-scroll"
                        state={macroDisplay(complication.macroUuid).missing ? 'missing' : 'linked'}
                        title={text(
                          'FABRICATE.Admin.Manager.Component.Complications.Macro.DropTitle',
                          'Drop a macro here'
                        )}
                        hint={complication.macroUuid
                          ? complication.macroUuid
                          : text(
                              'FABRICATE.Admin.Manager.Component.Complications.Macro.DropHint',
                              'Or browse this world’s script macros.'
                            )}
                        disabled={saving}
                        unlinkLabel={text(
                          'FABRICATE.Admin.Manager.Component.Complications.Macro.Unlink',
                          'Remove macro'
                        )}
                        onUnlink={() => setMacro(complication.id, '')}
                        onDrop={(data) => handleMacroDrop(complication.id, data)}
                      />
                      <SearchablePopover
                        options={macroPickerOptions}
                        value={complication.macroUuid || ''}
                        disabled={saving}
                        triggerClass="manager-button"
                        triggerIcon="fas fa-scroll"
                        triggerLabel={text(
                          'FABRICATE.Admin.Manager.Component.Complications.Macro.Browse',
                          'Browse macros'
                        )}
                        triggerData={{ 'data-complication-macro-browse': 'true' }}
                        triggerAriaLabel={text(
                          'FABRICATE.Admin.Manager.Component.Complications.Macro.Browse',
                          'Browse macros'
                        )}
                        dialogAriaLabel={text(
                          'FABRICATE.Admin.Manager.Component.Complications.Macro.Browse',
                          'Browse macros'
                        )}
                        searchPlaceholder={text(
                          'FABRICATE.Admin.Manager.Component.Complications.Macro.Search',
                          'Search macros...'
                        )}
                        searchAriaLabel={text(
                          'FABRICATE.Admin.Manager.Component.Complications.Macro.Search',
                          'Search macros...'
                        )}
                        emptyHint={text(
                          'FABRICATE.Admin.Manager.Component.Complications.Macro.None',
                          'No script macros in this world'
                        )}
                        onChoose={(uuid) => setMacro(complication.id, uuid)}
                      />
                    </div>
                  </ComplicationEffectRow>
                  {#if macroWarning}
                    <p class="manager-muted fab-complication-macro-warning" role="status">
                      {macroWarning}
                    </p>
                  {/if}
                </div>
              </div>
            </div>
          </ComplicationSummaryRow>
        {/each}
      </div>
    {/if}

    <button
      type="button"
      class="manager-button fab-complications-add"
      data-complications-add
      disabled={saving}
      onclick={addComplication}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Component.Complications.Add', 'Add complication')}</span>
    </button>
  </section>
{/if}

<style>
  /* Theme-ROOT tokens only, per `Chip.svelte`'s note: this section wears the manager's
     `manager-component-panel` shell, but every colour it states itself is a root token so a
     future read-only reuse outside `.fabricate-manager` does not silently lose them. */
  .fab-complications-title-glyph {
    margin-right: 7px;
    color: var(--fab-warning);
    font-size: 11px;
  }

  .fab-complications-pills {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: flex-end;
  }

  /* The hint's MEASURE, from the prototype (`max-width: 460px`). Without it the sentence
     runs the full width of the panel beside a right-aligned pill cluster, which at the
     Studio's widths is a ~110-character line — roughly double a readable measure, and the
     one thing a GM has to read before authoring anything here. */
  .fab-complications-hint {
    max-width: 460px;
  }

  /* NO vertical margin on either of these. The section root is `.manager-component-panel`,
     which is `display: grid; gap: var(--fab-space-3)` — a grid gap and an item margin ADD,
     so the 9px each of these used to carry rendered as 12 + 9 + 9 = 30px between the list
     and the Add control while the EMPTY state measured 12 + 9 = 21px: one section
     disagreeing with itself by 9px, and both two to three times the prototype's own 9px.
     The panel's gap is the only rhythm here, and it is the same rhythm every sibling panel
     in the Studio keeps. (The parity harness records no `margin` property, so nothing else
     would ever have caught this.) */
  .fab-complications-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .fab-complications-add {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: center;
    width: 100%;
    border-style: dashed;
  }

  .fab-complication-fields {
    display: flex;
    flex-wrap: wrap;
    gap: 11px;
    align-items: flex-end;
  }

  .fab-complication-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }

  .fab-complication-field.is-grow {
    flex: 1 1 200px;
  }

  .fab-complication-activity-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  /* The NOT-PROGRESSIVE axis, applied on top of whichever tone the chip's chosen-ness gave
     it. `opacity` is the prototype's own device and is the one property that composes with
     a tone instead of replacing it — a second `is-*` tone could not, because a chip has
     exactly one. `Chip.svelte` declares no `opacity`, so there is nothing here to lose a
     cascade fight with, and the child combinator off this scoped container is what bounds
     the `:global` to these three chips.

     The selector deliberately does not spell the chip's own base class. The hand-rolled-
     chip ratchet in `manager-layout.test.js` matches that class name ANYWHERE in a manager
     component file — comments included — and it has reached empty; a styling hook that
     wrote it would re-open a list whose whole value is that it can only shrink. */
  .fab-complication-activity-chips > :global(.is-not-progressive) {
    opacity: 0.6;
  }

  /* The annotation is its OWN run, not more of the chip's label: the prototype nests it as
     `font: 400 9px; color: subtle` beside a 600-weight 11px chip. Concatenated into the
     chip's text node it inherited the chip's weight and size, so "· not progressive" read
     as part of the activity's NAME rather than as a note about it. */
  .fab-complication-activity-note {
    margin-left: 2px;
    color: var(--fab-text-subtle);
    font-size: 9px;
    font-weight: 400;
  }

  /* The two grouped cards — When and Then — sit one step INSIDE the panel on the recessed
     surface, which is what separates "the conditions" from "the consequences" without a
     second heading level. */
  .fab-complication-card {
    padding: 12px;
    border: 1px solid var(--fab-border);
    border-radius: 10px;
    background: var(--fab-bg-0);
  }

  .fab-complication-card-heading {
    display: flex;
    gap: 9px;
    align-items: center;
    margin-bottom: 9px;
  }

  .fab-complication-card-hint {
    color: var(--fab-text-subtle);
    font-size: 9.5px;
  }

  /* The match control is pushed to the trailing edge of its heading rather than given a
     column, so the heading reads as one line however long the hint is. */
  .fab-complication-card-heading > :global(.manager-segmented) {
    margin-left: auto;
  }

  .fab-complication-rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .fab-complication-expression {
    flex: 1 1 180px;
    min-width: 0;
    font-family: var(--fab-font-mono);
    font-size: 11.5px;
  }

  .fab-complication-expression.is-short {
    flex: 0 0 130px;
  }

  .fab-complication-comparator {
    flex: 0 0 auto;
  }

  .fab-complication-comparand {
    flex: 0 0 72px;
    font-family: var(--fab-font-mono);
    text-align: center;
  }

  .fab-complication-trigger-select {
    flex: 1 1 220px;
    min-width: 0;
  }

  .fab-complication-macro-controls {
    display: flex;
    flex: 1 1 100%;
    gap: 9px;
    align-items: center;
  }

  .fab-complication-macro-controls > :global(.manager-item-drop-zone) {
    flex: 1 1 auto;
    min-width: 0;
  }

  .fab-complication-macro-warning {
    margin: 7px 0 0;
    color: var(--fab-warning-text);
    font-size: 10px;
  }
</style>
