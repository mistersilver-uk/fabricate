<!--
  The Component Studio's COMPLICATIONS authoring section: what goes wrong when this component is
  produced as a stage of a progressive result.

  IT GATES ITSELF on the SYSTEM resolving at least one activity progressively — a complication has
  no moment to fire otherwise, and a card offering a consequence that can never happen is worse than
  no card. The gate lives here rather than in `ComponentEditView` so there is ONE predicate rather
  than a prop the host could forget to compute.

  THE SUB-LINE IS NOT THE PROTOTYPE'S, which is wrong for the shipped model twice over: a
  complication fires when this component is PRODUCED as a progressive stage, and not when the
  component is itself salvaged or spent. That second case is deferred, so the copy discloses it
  rather than letting a GM author for a moment this build never reaches. It says nothing about
  player visibility either: `visibility: 'gmOnly'` is a DISCLOSURE guarantee, not a confidentiality
  one, and the spec and the field documentation are where that limit belongs.

  IDS ARE MINTED THROUGH AN INJECTED `random`, falling back to `foundry.utils.randomID()`, because
  the sibling sections' idiom would put a `Math.random()` literal in new code that SonarCloud flags
  (S2245). The last-resort counter serves a context with neither, where determinism is a feature.

  The draft lives in `ComponentEditView`, which is what makes an edit here dirty the component and
  survive Save. This is a controlled component: it never mutates the array it is given, it emits a
  whole new one, and the only state it keeps is which row is open and what a rejected drop says.
-->
<script>
  import Chip from '../../../components/Chip.svelte';
  import EmptyState from '../../../components/EmptyState.svelte';
  import ItemDropZone from '../../../components/ItemDropZone.svelte';
  import SearchablePopover from '../../../components/SearchablePopover.svelte';
  import Select from '../../../components/Select.svelte';
  import SegmentedControl from '../../../components/SegmentedControl.svelte';
  import ComplicationEffectRow from '../ComplicationEffectRow.svelte';
  import ComplicationSummaryRow from '../ComplicationSummaryRow.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import { localize } from '../../../util/foundryBridge.js';
  import { resolveDropUuid } from '../../../util/dropUtils.js';
  import {
    MACRO_DROP_REJECTED_NOT_SCRIPT,
    evaluateMacroDrop,
    resolveMacroName,
  } from '../../../../model/macroReference.js';
  import {
    COMPLICATION_ACTIVITIES,
    DEFAULT_COMPLICATION_MATCH_MODE,
    DEFAULT_COMPLICATION_SEVERITY,
    DEFAULT_COMPLICATION_VISIBILITY,
  } from '../../../../../utils/componentComplications.js';
  import { complicationSummary } from '../../../../model/complicationSummary.js';
  import {
    PREREQUISITE_OPERATORS,
    isValuelessOperator,
  } from '../../../../../systems/characterPrerequisites.js';

  let {
    complications = [],
    // Whether the SYSTEM resolves each activity progressively: the section's gate, and the
    // "· not progressive" annotation on each Applies-to chip. A complication may be authored for
    // an activity this system does not resolve progressively — stored, and never fired.
    activityProgressive = {},
    // The named triggers on the three progressive check blocks. A trigger id lives in exactly ONE
    // activity's id space, so the option is labelled by its OWNER or two same-named ids collide.
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

  // FULL key literals per activity: `tests/ui-lang-keys-resolve.test.js` can only prove a key it
  // can see written down, and a composed one is a base it admits without resolving the leaf.
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
   * A progressive activity pill's `title`, with the count the label suppresses. Three FULL key
   * literals, for the lang-gate reason above, and the manager's plural idiom is a sibling `…One`
   * key chosen by `count === 1`.
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
        // A dimmed `muted` chip, NOT `is-disabled`: that tone is joined to the WARNING family, so
        // "Salvage · n/a" would read as a hazard rather than a fact about the system.
        tone: progressive ? '' : 'muted',
        // A ZERO is SUPPRESSED: the pill's job is to say the activity resolves progressively, and
        // "Salvage · 0" would restate the empty state already drawn below it.
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
        // The count the LABEL drops is kept in the `title`, where a number belongs once the pill
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
    PREREQUISITE_OPERATORS.filter((operator) => !isValuelessOperator(operator.id)).map(
      (operator) => ({ value: operator.id, label: `${operator.symbol} · ${operator.label}` })
    )
  );

  /**
   * Whether the trigger clause has nothing to offer THIS complication. An empty `triggerOptions`
   * means this system's progressive checks declare no named trigger, so the clause can never be
   * satisfied and offering it gives a GM a checkbox that opens an empty picker.
   *
   * IT IS NOT SIMPLY `triggerOptions.length === 0`. A complication that ALREADY names a trigger
   * keeps a persisted value, and muting the row would strand it behind a disabled control with no
   * way to clear it. So an authored `checkTrigger` stays live and operable whatever the vocabulary
   * holds — the picker's "Trigger no longer exists" option names the dangling id, and unchecking
   * clears it — and the unavailable treatment is for nothing authored AND nothing to author with.
   */
  function triggerClauseUnavailable(complication) {
    return triggerOptions.length === 0 && !complication?.when?.checkTrigger;
  }

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

  /** Named triggers, plus a DANGLING authored id, which keeps that clause inert rather than invalid. */
  function triggerOptionsFor(complication) {
    const named = triggerOptions.map((option) => ({
      value: option.id,
      label: option.activity ? `${option.label} · ${activityLabel(option.activity)}` : option.label,
    }));
    const authored = complication.when?.checkTrigger;
    if (!authored || triggerLabelById.has(authored)) return named;
    const label = text(
      'FABRICATE.Admin.Manager.Component.Complications.Condition.CheckTrigger.Unknown',
      'Trigger no longer exists'
    );
    return [...named, { value: authored, label }];
  }

  // Resolve the NAME of every linked macro the picker's own list does not carry — a compendium
  // macro, or a deleted one. The list is consulted first, being synchronous and covering every
  // world script macro; `missing` is what paints the broken-link treatment on the drop zone.
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
    // Every default is the MODEL's, not the prototype's seed data: two defaults for one field is
    // the drift `componentComplications.js` states its vocabularies to prevent. The one authored
    // choice is `stageMissed`, the condition a GM reaching for a complication is usually after.
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
      // DELETED rather than written empty: an empty string round-trips as a blank reference.
      if (uuid) next.macroUuid = uuid;
      else delete next.macroUuid;
      return next;
    });
  }

  // The `type !== 'script'` rejection, on `EssenceEditView`'s authority. It cannot live in the drop
  // predicate: a payload's `type` is the DOCUMENT NAME, and the macro's own type needs `fromUuid`.
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
                  <!-- The CHOSEN state and the NOT-PROGRESSIVE state are two INDEPENDENT axes.
                       Collapsing them into one ternary inverts the warning: the case worth flagging
                       is an activity the GM HAS selected and the system will not resolve
                       progressively, which a single ternary paints at full accent strength. -->
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

                <!-- The trigger clause is a TRIGGER ID, never a boolean: "any trigger fires any
                     complication" would give every authored breakage trigger a fourth effect.

                     UNAVAILABLE IS A STATE OF ITS OWN. With no named trigger in this system's
                     progressive checks the clause can never be satisfied, and it used to sit in the
                     tab order exactly like the four conditions above it. The treatment is the one
                     this panel already uses for an option a GM may see but cannot use — `opacity`
                     plus a `title` — because `opacity` composes with whatever tone the row wears
                     and a second `is-*` tone could not. Uninteractable is a REAL `disabled`, never
                     `pointer-events: none`, so the control leaves the tab order; and with the row
                     off, `ComplicationEffectRow` renders no children for the picker to be in. The
                     hint is a SIBLING, so the line explaining the state is not the dimmed one. -->
                <div
                  class="fab-complication-trigger"
                  class:is-unavailable={triggerClauseUnavailable(complication)}
                  data-complication-trigger-clause
                  title={triggerClauseUnavailable(complication)
                    ? text(
                        'FABRICATE.Admin.Manager.Component.Complications.Condition.CheckTrigger.None',
                        'This system’s progressive checks name no triggers yet — add one under Checks before a complication can wait on it.'
                      )
                    : undefined}
                >
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
                    disabled={saving || triggerClauseUnavailable(complication)}
                    dataAttr="data-complication-condition"
                    dataValue="checkTrigger"
                    onToggle={(next) =>
                      setWhen(
                        complication.id,
                        'checkTrigger',
                        next ? triggerOptions[0]?.id || null : null
                      )}
                  >
                    <Select
                      size="inline"
                      class="fab-complication-trigger-select"
                      value={complication.when?.checkTrigger || ''}
                      options={triggerOptionsFor(complication)}
                      ariaLabel={text(
                        'FABRICATE.Admin.Manager.Component.Complications.Condition.CheckTrigger.Select',
                        'Check trigger'
                      )}
                      disabled={saving}
                      triggerData={{ 'data-complication-trigger': '' }}
                      onChange={(next) => setWhen(complication.id, 'checkTrigger', next || null)}
                    />
                  </ComplicationEffectRow>
                  {#if triggerClauseUnavailable(complication)}
                    <p class="fab-complication-trigger-hint" data-complication-trigger-hint>
                      {text(
                        'FABRICATE.Admin.Manager.Component.Complications.Condition.CheckTrigger.None',
                        'This system’s progressive checks name no triggers yet — add one under Checks before a complication can wait on it.'
                      )}
                    </p>
                  {/if}
                </div>

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
                  <!-- ONE LINE, and it needs a row of its own. The reveal strip is a WRAPPING flex
                       strip, right for one control and for two and wrong here: under
                       `appearance: base-select` a comparator select resolves `width: auto` against
                       its containing block rather than to max-content, so it took the whole 898px
                       line and pushed the expression and comparand onto their own. The three fields
                       are ONE sentence — "2d6 + @int ≥ 12" — so they take a nowrap sub-row and the
                       comparator gets an explicit basis.

                       THERE IS NO NARROW BREAKPOINT, and that is a MEASUREMENT. Driven from a
                       1280px manager down to 600px the strip narrows to 534px and stops, because
                       the pane carries its own floor; the row's content floor is 260 + 156 + 104
                       plus two 7px gaps — the same 534px — with `min-width: 0` on every child, so
                       `scrollWidth - clientWidth === 0` throughout. A
                       `@container fabricate-manager (max-width: 680px)` rule was written and
                       removed: it fires where the row still has room and wrapped three fields onto
                       three lines, answering a squeeze that does not happen. -->
                  <div class="fab-complication-condition-row">
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
                    <!-- The SIX numeric comparators, filtered off the shared prerequisite table by
                         `isValuelessOperator`: an `exists` against a roll total always fires. -->
                    <Select
                      size="inline"
                      class="fab-complication-comparator"
                      value={complication.rollCondition?.cmp || ''}
                      options={comparatorOptions}
                      ariaLabel={text(
                        'FABRICATE.Admin.Manager.Component.Complications.RollCondition.Comparator',
                        'Comparison'
                      )}
                      disabled={saving}
                      triggerData={{ 'data-complication-roll-condition-cmp': '' }}
                      onChange={(next) => setNested(complication.id, 'rollCondition', 'cmp', next)}
                    />
                    <!-- A SIGNED INTEGER STEPPER, not a bare field. `min`/`max` stay at the
                         primitive's `null` so the field stays signed — a complication firing at a
                         modified `-1` is legitimate authoring, and any bound would be a rule this
                         section has no basis to invent.

                         `allowUnset` because absence is REAL in the persisted shape: without it a
                         fresh complication shows a comparand of `0` nobody typed. The commit maps
                         back through `String(next)` / `''`, because `componentComplications` stores
                         the comparand as text and the operator vocabulary is word tokens.

                         A `<div>` wrapper, not a `<label>`: per `Stepper.svelte`'s NAMING contract
                         a `<label>` binds to its first labelable descendant — the `−` button — so
                         clicking the caption would DECREMENT. The name arrives via `stepperLabels`. -->
                    <div class="fab-complication-comparand">
                      <Stepper
                        value={complication.rollCondition?.value ?? ''}
                        step={1}
                        allowUnset
                        fill
                        disabled={saving}
                        {...stepperLabels(
                          text(
                            'FABRICATE.Admin.Manager.Component.Complications.RollCondition.Value',
                            'Compare against'
                          )
                        )}
                        inputProps={{ 'data-complication-roll-condition-value': '' }}
                        onChange={(next) =>
                          setNested(
                            complication.id,
                            'rollCondition',
                            'value',
                            next === null ? '' : String(next)
                          )}
                      />
                    </div>
                  </div>
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
                  <!-- NOT `.fab-complication-expression`: this is the sentence a GM writes for the
                       chat card, and it borrowed that class for flex sizing and inherited the MONO
                       face with it. A label is prose; only the dice expression beside it is mono. -->
                  <input
                    class="manager-input fab-complication-effect-label"
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
                    <!-- The browse control acts on the WHOLE macro card, so it sits in the head. -->
                    {#snippet headAction()}
                      <SearchablePopover
                        options={macroPickerOptions}
                        value={complication.macroUuid || ''}
                        disabled={saving}
                        triggerClass="fabricate-button manager-button"
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
                    {/snippet}
                    <div class="fab-complication-macro-controls">
                      <!-- `ItemDropZone` has no click handler, only `use:dragDrop`, and
                           `SearchablePopover` owns its own trigger. The recorded deviation from the
                           prototype is that browse is a separate button beside the drop target. -->
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

    <!-- Dashed and fullWidth: the append-a-row verb, the same shape as `RecipeStepsCard`'s "Add a
         step". The bespoke scoped rule it replaced declared nothing the role and `fullWidth` do
         not already state, so it is retired rather than re-chained under `:global(...)`. -->
    <ManagerButton
      role="dashed"
      fullWidth
      data-complications-add
      disabled={saving}
      onclick={addComplication}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Component.Complications.Add', 'Add complication')}</span>
    </ManagerButton>
  </section>
{/if}

<style>
  /* Theme-ROOT tokens only, per `Chip.svelte`'s note, so a reuse outside `.fabricate-manager`
     does not silently lose them. */
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

  /* The hint's MEASURE. Without it the sentence runs the panel's full width — a ~110-character
     line, double a readable measure, on the one thing a GM must read before authoring. */
  .fab-complications-hint {
    max-width: 460px;
  }

  /* NO vertical margin on either. The section root is a grid, and a grid gap and an item margin
     ADD: the 9px these carried rendered as 30px between the list and the Add control while the
     EMPTY state measured 21px — one section disagreeing with itself. The panel's gap is the only
     rhythm here. (The parity harness records no `margin`, so nothing else would have caught it.) */
  .fab-complications-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
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

  /* The NOT-PROGRESSIVE axis, applied over whichever tone chosen-ness gave the chip. `opacity`
     composes with a tone instead of replacing it, where a second `is-*` tone could not, because a
     chip has exactly one; `Chip.svelte` declares none, so there is no cascade fight, and the child
     combinator off this scoped container bounds the `:global` to these three chips.

     The selector deliberately does not spell the chip's own base class: the hand-rolled-chip
     ratchet in `manager-layout.test.js` matches that name ANYWHERE in a manager component file,
     comments included, and it has reached empty. */
  .fab-complication-activity-chips > :global(.is-not-progressive) {
    opacity: 0.6;
  }

  /* Its OWN run, not more of the chip's label: concatenated into the chip's text node it
     inherited that weight and size, so "· not progressive" read as part of the activity's NAME. */
  .fab-complication-activity-note {
    margin-left: 2px;
    color: var(--fab-text-subtle);
    font-size: 9px;
    font-weight: 400;
  }

  /* The When and Then cards sit one step INSIDE the panel on the recessed surface, which
     separates the conditions from the consequences without a second heading level.

     THE RAMP STEP IS CHOSEN BY INDEX, NOT BY VALUE, and it is recorded because it is the call a
     reader is likeliest to want to re-make. The prototype's ramp is OFFSET by a step in the middle
     — its second step is byte-identical to `--fab-bg-0` and its first sits below every surface
     token any theme ships — so a by-value re-map would round this card up onto `--fab-bg-0`, which
     is where it also sends the ROW behind it, collapsing the two onto one flat fill.

     Index-aligned they do not collapse, and the STEP is what the eye reads rather than the
     absolute: panel → row → card reproduces the prototype's own three-step recession. Adding a
     darker raw colour was ruled out for the studio as a whole (see the mapping note in
     `styles/fabricate.css`): it would force a value into all seven themes to correct one step. */
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

  /* The effect roll's LABEL shares the expression's SIZING, being the elastic field on the same
     line, and not its face. Its own rule rather than an `is-*` modifier, because "an expression
     that is not in the expression face" is a contradiction a reader would resolve the wrong way.
     The face is inherited: this repository ships serif and mono tokens and no sans one. */
  .fab-complication-effect-label {
    flex: 1 1 180px;
    min-width: 0;
    font-size: 11.5px;
  }

  /* THE DICE-CONDITION SENTENCE, on one line. `nowrap` and `flex: 1 1 100%` together: the basis
     takes a whole line of the wrapping reveal strip and the nowrap keeps its three fields on it.
     `min-width: 0` on every child lets them shrink rather than overflow, since a flex item drops
     below its intrinsic width only once its automatic minimum size is released. */
  .fab-complication-condition-row {
    display: flex;
    flex: 1 1 100%;
    flex-wrap: nowrap;
    gap: 7px;
    align-items: center;
    min-width: 0;
  }

  /* THE COMPARATOR'S SLOT, on the picker ROOT since issue 1510, and the box the trigger takes of it.
     `:global` because the class rides a COMPONENT tag and the trigger is its grandchild, neither of
     which Svelte stamps a scoping hash on, so the scoped form matches nothing and dies silently. An
     EXPLICIT basis, not `0 0 auto`: the width is the six options' measure plus the glyph, and
     `flex-shrink: 1` gives ground first, because a truncated "at least" still reads and a truncated
     dice expression does not. `min-height` overrides the rung's 30: the row's fields share a 34. */
  .fab-complication-condition-row > :global(.fab-complication-comparator) {
    flex: 0 1 156px;
    min-width: 0;
  }

  .fab-complication-condition-row
    > :global(.fab-complication-comparator .fabricate-select-trigger) {
    width: 100%;
    min-height: 34px;
  }

  /* The comparand SLOT. The Stepper is `fill`, so it needs a slot with an intrinsic width to
     resolve `100%` against; `Stepper.svelte`'s own note records that dropping `fill` does not fix
     an unsized slot either. `--fab-stepper-fill-height` is how the primitive takes a SIZE from its
     layout context, which its CSS note permits, and the value is the height the expression input
     and the comparator beside it both stand at. */
  .fab-complication-comparand {
    --fab-stepper-fill-height: 34px;

    flex: 0 0 104px;
    min-width: 0;
  }

  /* The trigger clause's UNAVAILABLE state: the same `opacity` the Applies-to chips use a few
     rules up, because this panel has two "you may see it and cannot use it" states and they must
     read alike. The child combinator bounds the `:global` to this one row. Applied to the ROW, not
     the wrapper, so the hint explaining the state keeps full contrast. */
  .fab-complication-trigger.is-unavailable > :global(.fab-complication-effect) {
    opacity: 0.6;
  }

  /* Indented to the reveal strip's own inset, so it hangs under the row's copy rather than its
     checkbox. Subtle rather than the macro card's warning tone: nothing has gone wrong. */
  .fab-complication-trigger-hint {
    margin: 6px 0 0 24px;
    color: var(--fab-text-subtle);
    font-size: 9.5px;
    line-height: 1.45;
  }

  /* The trigger picker's SLOT and the trigger's width; `:global` for the reason above. */
  .fab-complication-trigger :global(.fab-complication-trigger-select) {
    flex: 1 1 220px;
    min-width: 0;
  }

  .fab-complication-trigger :global(.fab-complication-trigger-select .fabricate-select-trigger) {
    width: 100%;
  }

  .fab-complication-macro-controls {
    display: flex;
    flex: 1 1 100%;
    gap: 9px;
    align-items: center;
  }

  /* The browse trigger, in the macro card's HEAD. Its type is copied from the manager's existing
     compact in-header control, `.manager-salvage-stage-edit`, rather than invented, so the two read
     as one treatment: `manager-button`'s default is sized for a footer action and wrapped "Browse
     macros" onto two lines. `white-space: nowrap` is what fixes the wrap; the rest keeps it from
     looking like a different button once it no longer does. */
  .fab-complication-macro :global([data-complication-macro-browse]) {
    padding: 4px 9px;
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: normal;
    white-space: nowrap;
  }

  .fab-complication-macro :global([data-complication-macro-browse] i) {
    font-size: 0.72rem;
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
