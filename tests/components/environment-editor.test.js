/**
 * The environment editor's structure contract (issue 1697 retired this file's source-text pins).
 * Every claim about a `src/` file is a row of the shared table; the `lang/en.json` catalogue
 * assertions below are not pins and stay as they are.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  evaluateEnvironmentReadiness,
  blocksEnable,
} from '../../src/ui/svelte/apps/manager/environment/environmentReadiness.js';
import { describeValidationHostContract } from '../helpers/validationAddressContracts.js';
import { literalStrings } from '../helpers/moduleAst.js';
import { componentAstEntriesIn, componentAstOf } from '../helpers/parsedSource.js';
import {
  declaredConstantValue,
  defineStructureContract,
  propertyAst,
  staticTextCalls,
} from '../helpers/structureContract.js';
import { repoRoot } from '../helpers/sourceScan.js';

const MANAGER = 'src/ui/svelte/apps/manager';
const ENV_DIR = `${MANAGER}/environment`;
const SHELL = `${MANAGER}/EnvironmentEditView.svelte`;
const MANAGER_ROOT = `${MANAGER}/CraftingSystemManagerRoot.svelte`;
const LIST = `${ENV_DIR}/CompositionList.svelte`;
const MODE_CONTROL = `${ENV_DIR}/CompositionModeControl.svelte`;
const INSPECTOR = `${ENV_DIR}/RecordInspector.svelte`;
const TABS = `${ENV_DIR}/EnvironmentEditorTabs.svelte`;
const EVIDENCE = `${ENV_DIR}/MatchingEvidenceChips.svelte`;
const TASKS_TAB = `${ENV_DIR}/EnvironmentTasksTab.svelte`;
const EVENTS_TAB = `${ENV_DIR}/EnvironmentEventsTab.svelte`;
const VALIDATION = `${ENV_DIR}/EnvironmentValidationTab.svelte`;
const OVERVIEW = `${ENV_DIR}/EnvironmentOverviewTab.svelte`;
const SUMMARY_INSPECTOR = `${ENV_DIR}/EnvironmentSummaryInspector.svelte`;
const RIGHT_INSPECTOR = `${ENV_DIR}/EnvironmentRightInspector.svelte`;
// The tab strip is a caller of the promoted `EditorTabs` primitive since issue 1362.
const EDITOR_TABS = 'src/ui/svelte/components/EditorTabs.svelte';
const SHELL_VOCABULARY = '../../../../systems/gatheringComposition.js';
const LIST_VOCABULARY = '../../../../../systems/gatheringComposition.js';

const lang = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'));

function catalogValue(key) {
  return key.split('.').reduce((node, part) => node?.[part], lang);
}

const VALIDATION_KEY_STEM = 'FABRICATE.Admin.Manager.EnvironmentEditor.Validation.';

/** The `[key, fallback]` pair one record-issue label states, as the source spells it. */
function recordIssueLabel(issueId, kind) {
  const table = declaredConstantValue(VALIDATION, 'RECORD_ISSUE_LABELS');
  return literalStrings(propertyAst(propertyAst(table, issueId), kind));
}

describe('environment editor localization', () => {
  it('defines the EnvironmentEditor namespace in en.json for the keys the editor uses', () => {
    const editor = lang.FABRICATE.Admin.Manager.EnvironmentEditor;
    assert.ok(editor, 'EnvironmentEditor namespace should exist');
    const checks = [
      ['Overview', 'RealmsHint'],
      ['Overview', 'BiomesHint'],
      ['Overview', 'DangerHint'],
      ['Composition', 'Automatic'],
      ['Composition', 'IncludedByMatch'],
      ['Inspector', 'TaskEnvironmentMatching'],
      ['Inspector', 'Overrides'],
      ['Validation', 'Readiness'],
      ['Evidence', 'Biome'],
      ['Tabs', 'Tasks'],
      ['Runtime', 'Available'],
    ];
    for (const [group, key] of checks) {
      assert.equal(
        typeof editor[group]?.[key],
        'string',
        `EnvironmentEditor.${group}.${key} should be a localized string`
      );
      assert.ok(
        editor[group][key].length > 0,
        `EnvironmentEditor.${group}.${key} should not be empty`
      );
    }
    assert.equal(editor.Events.DangerTag.deadly, 'Deadly');
    // The severity words are gone, and pinned absent rather than merely unread (issue 1517).
    assert.equal(editor.Validation.Severity, undefined, 'the severity chip words are retired');
    const shared = lang.FABRICATE.Admin.Manager.Validation;
    assert.equal(shared.CountBlocking, 'Blocking');
    assert.equal(shared.CountWarnings, 'Warnings');
  });

  it('defines the new force-include and non-matching EnvironmentEditor copy', () => {
    const editor = lang.FABRICATE.Admin.Manager.EnvironmentEditor;
    const expected = [
      ['Composition.NonMatching', 'Non-matching'],
      ['Composition.NoNonMatchingTasks', 'No non-matching or disabled tasks.'],
      ['Composition.NoNonMatchingEvents', 'No non-matching or disabled events.'],
      ['Composition.AvailableToAdd', 'Available to add'],
      ['Composition.NoAvailableTasksToAdd', 'No matching or non-matching tasks to add.'],
      ['Composition.NoAvailableEventsToAdd', 'No matching or non-matching events to add.'],
      ['Composition.ForceAdd', 'Force add'],
      ['Composition.LibraryDisabledNote', 'Enable in library first'],
      ['Composition.ForceIncluded', 'Force included'],
      ['Composition.OverrideOn', 'On'],
      ['Composition.OverrideOff', 'Off'],
      ['Composition.OverrideOnTitle', 'Drop rate adjustment on'],
      ['Composition.OverrideOffTitle', 'Drop rate adjustment off'],
      ['Composition.WeightPercentage', 'Selection share'],
      ['Composition.ColEvent', 'Event'],
      ['Composition.QuickRemove', 'Remove'],
      ['Composition.Remove', 'Remove from environment'],
      // BOTH modes are pinned (issue #1315).
      [
        'Composition.ManualHint',
        'Only the tasks and events you add are available, whether or not they match this environment.',
      ],
      [
        'Composition.AutomaticHint',
        'All matching enabled tasks and events are available; exclude any of them here, or force add a non-matching one.',
      ],
      [
        'Inspector.OverridesHintTask',
        'Drop-rate adjustments apply only in this environment and do not modify the reusable source task.',
      ],
      [
        'Inspector.OverridesHintEvent',
        'Drop-rate adjustments apply only in this environment and do not modify the reusable source event.',
      ],
      ['Inspector.DropRateAdjustment', 'Drop-rate adjustment'],
      ['Inspector.DropRateAdjustmentRange', 'Drop-rate adjustment (-100% to +100%)'],
      ['Inspector.ApplyDropRateAdjustmentsOn', 'On'],
      ['Inspector.ApplyDropRateAdjustmentsOff', 'Off'],
      ['Inspector.BaseChanceModifiers', 'Base chance modifiers'],
      ['Inspector.BaseChanceModifier', 'Base chance modifier'],
      ['Inspector.BaseRate', 'Base'],
      ['Inspector.EffectiveRate', 'Effective'],
      ['Inspector.ClearAdjustment', 'Clear'],
      [
        'Tasks.ManualIntro',
        'Only tasks you add are available to players, whether or not they match this environment.',
      ],
      [
        'Tasks.AutomaticIntro',
        'All matching enabled library tasks are available. Exclude any of them here, or force add a non-matching task.',
      ],
      [
        'Events.ManualIntro',
        'Only events you add apply here, whether or not they match this environment.',
      ],
      [
        'Events.AutomaticIntro',
        'All matching enabled library events apply here. Exclude any of them here, or force add a non-matching event.',
      ],
    ];

    for (const [path, value] of expected) {
      assert.equal(
        path.split('.').reduce((node, part) => node?.[part], editor),
        value,
        `EnvironmentEditor.${path}`
      );
    }

    // The mutation-proof half of the pair above.
    for (const path of ['Composition.ManualHint', 'Tasks.ManualIntro', 'Events.ManualIntro']) {
      const value = path.split('.').reduce((node, part) => node?.[part], editor);
      assert.ok(
        !/force/i.test(value),
        `EnvironmentEditor.${path} must not offer a force add: manual mode has no filter to override (${value})`
      );
    }
    for (const path of [
      'Composition.AutomaticHint',
      'Tasks.AutomaticIntro',
      'Events.AutomaticIntro',
    ]) {
      const value = path.split('.').reduce((node, part) => node?.[part], editor);
      assert.ok(
        /force add/i.test(value),
        `EnvironmentEditor.${path} must name the force add, which is an automatic-mode override (${value})`
      );
    }

    // Region is no longer a composition axis.
    assert.equal(editor.Validation.CheckRegion, undefined, 'CheckRegion label should be removed');
  });

  it('keeps static EnvironmentEditor localization fallbacks aligned with en.json', () => {
    const failures = [];
    const editorComponents = [[SHELL, componentAstOf(SHELL)], ...componentAstEntriesIn(ENV_DIR)];
    for (const [file, component] of editorComponents) {
      for (const { key, fallback } of staticTextCalls(component)) {
        if (!key.startsWith('FABRICATE.Admin.Manager.EnvironmentEditor.')) continue;
        const value = catalogValue(key);
        if (typeof value !== 'string') failures.push(`${file}: missing ${key}`);
        else if (value !== fallback) {
          failures.push(`${file}: ${key} fallback "${fallback}" does not match en.json "${value}"`);
        }
      }
    }
    assert.deepEqual(failures, []);
  });

  it('keeps dynamic EnvironmentEditor validation fallbacks aligned with en.json', () => {
    // The dynamic half: a table of `[key, fallback]` pairs a template literal completes at call
    // time, so the catalogue comparison the static sweep above makes has to be made per row.
    for (const [issueId, kind] of [
      ['staleIncluded', 'task'],
      ['staleIncluded', 'event'],
      ['taskNoDescription', 'task'],
    ]) {
      const [key, fallback] = recordIssueLabel(issueId, kind);
      assert.equal(
        catalogValue(`${VALIDATION_KEY_STEM}${key}`),
        fallback,
        `${issueId}.${kind} states a fallback the English catalog does not carry`
      );
    }
  });

  defineStructureContract(
    'the validation tab keeps no region readiness check or its dynamic fallback',
    VALIDATION,
    { namesNo: ['hasRegion'], spellsNo: ['CheckRegion', 'hasRegion'] }
  );

  defineStructureContract(
    'the manual mode hint states the manual sentence, and the automatic one the automatic',
    { file: MODE_CONTROL, constant: 'OPTIONS', record: ['value', 'manual'] },
    {
      property: [
        ['descKey', 'ManualHint'],
        [
          'descFallback',
          'Only the tasks and events you add are available, whether or not they match this environment.',
        ],
      ],
    }
  );

  defineStructureContract(
    'and the automatic record carries the automatic hint, so the two cannot be swapped',
    { file: MODE_CONTROL, constant: 'OPTIONS', record: ['value', 'automatic'] },
    {
      property: [
        ['descKey', 'AutomaticHint'],
        [
          'descFallback',
          'All matching enabled tasks and events are available; exclude any of them here, or force add a non-matching one.',
        ],
      ],
    }
  );

  defineStructureContract(
    'validation issue record names are injected into a sentence template, not bracketed',
    { file: VALIDATION, fn: 'issueTitle' },
    {
      names: ['RECORD_ISSUE_LABELS'],
      calls: ['replace'],
      callsLiteral: [['replace', '{name}']],
      reads: ['issue.recordName'],
    }
  );

  defineStructureContract(
    'no editor component falls back on the legacy Environment.* editor key prefixes',
    [SHELL, LIST, INSPECTOR, TABS, EVIDENCE, TASKS_TAB, OVERVIEW, SUMMARY_INSPECTOR],
    {
      spellsNo: [
        'FABRICATE.Admin.Manager.Environment.Overview',
        'FABRICATE.Admin.Manager.Environment.Composition',
        'FABRICATE.Admin.Manager.Environment.Evidence',
        'FABRICATE.Admin.Manager.Environment.Diagnostics',
        'FABRICATE.Admin.Manager.Environment.Tabs',
        'FABRICATE.Admin.Manager.Environment.Runtime',
        'FABRICATE.Admin.Manager.Environment.Inspector',
        'FABRICATE.Admin.Manager.Environment.Validation',
      ],
    }
  );
});

describe('environment multi-realm selector', () => {
  defineStructureContract(
    'replaces the single-region select with a toggle-gated includedRealmIds chip control',
    OVERVIEW,
    {
      // The legacy single-region `<select>` bound to `environment.region` is gone.
      attributesNo: [['data-environment-field', 'region']],
      attributes: [['data-environment-field', 'includedRealmIds']],
      writes: ['data-environment-realm-empty'],
      names: ['realmsEnabled', 'addRealm', 'removeRealm', 'realmOptions'],
      readsNo: ['environment.region'],
    }
  );

  defineStructureContract(
    'and both realm handlers write includedRealmIds rather than the retired region string',
    { file: OVERVIEW, fn: 'addRealm' },
    { calls: ['onUpdate'], keys: ['includedRealmIds'], keysNo: ['region'] }
  );

  defineStructureContract(
    'so a removal writes the same field',
    { file: OVERVIEW, fn: 'removeRealm' },
    { calls: ['onUpdate'], keys: ['includedRealmIds'], keysNo: ['region'] }
  );

  defineStructureContract(
    'the empty-state hint guards on there being no realm options at all',
    { file: OVERVIEW, constant: 'availableRealms' },
    { reads: ['realmOptions.filter'] }
  );

  it('the empty-state hint points at the world route realms are authored on', () => {
    const value = catalogValue('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.RealmsEmpty');
    assert.equal(typeof value, 'string');
    assert.ok(
      value.includes('World > Travel'),
      'empty-state hint names the world route realms are authored on'
    );
  });

  defineStructureContract(
    'sources realm options from GatheringRealm records, not the removed vocabulary',
    OVERVIEW,
    { names: ['realmRecords'], namesNo: ['gatheringVocabularyOptions'] }
  );

  defineStructureContract(
    'and the root threads the world realm records and the toggle gate into the editor',
    MANAGER_ROOT,
    {
      passesProps: [
        ['EnvironmentEditView', 'realmRecords'],
        ['EnvironmentEditView', 'realmsEnabled'],
        ['EnvironmentEditView', 'eventSelectionMode'],
      ],
    }
  );
});

describe('environment composition editor structure', () => {
  defineStructureContract(
    'shell composes tabs, workspace, and its own inspector (header lives in chrome)',
    SHELL,
    {
      renders: [
        'EnvironmentEditorTabs',
        'EnvironmentOverviewTab',
        'EnvironmentTasksTab',
        'EnvironmentEventsTab',
        'EnvironmentValidationTab',
        'EnvironmentRightInspector',
      ],
      rendersNo: ['EnvironmentEditorHeader'],
      writes: ['data-environment-editor', 'is-inspector-hidden'],
      attributes: [['class', 'manager-environment-workspace']],
      passesProps: [['EnvironmentRightInspector', 'activeTab']],
    }
  );

  defineStructureContract(
    'a validation row action routes through one table rather than an inline ternary',
    { file: SHELL, constant: 'ISSUE_ROUTES', property: 'task' },
    { property: [['tab', 'tasks']] }
  );

  defineStructureContract(
    'so the event kind opens the Events tab from the same table',
    { file: SHELL, constant: 'ISSUE_ROUTES', property: 'event' },
    { property: [['tab', 'events']] }
  );

  defineStructureContract(
    'and the selector reads the route it looked up rather than branching again',
    { file: SHELL, fn: 'selectValidationRecord' },
    {
      reads: ['route.tab', 'route.key', 'route.fallback'],
      calls: ['selectRecord', 'announceValidationOutcome'],
    }
  );

  defineStructureContract('renders Tasks/Events as a column-headed table', LIST, {
    attributes: [
      ['class', 'manager-environment-comp-head'],
      ['role', 'button'],
    ],
    attributesNo: [['role', 'menu']],
    spells: ['ColTask', 'ColEvent', 'ColOverride', 'ColRuntime', 'ColWeight'],
    spellsNo: ['ColEvidence'],
    rendersNo: ['MatchingEvidenceChips'],
    renders: ['OverrideIndicator', 'ActionMenu'],
    passesProps: [['OverrideIndicator', 'active']],
    passesPropsNo: [['OverrideIndicator', 'compositionState']],
    reads: ['entry.hasDropRateAdjustment'],
    spellsExactly: ['manager-environment-comp-row '],
  });

  defineStructureContract(
    'event rank controls are gated by the highest-ranked system rule',
    { file: LIST, constant: 'showEventRankControls' },
    { names: ['kind', 'eventSelectionMode'], compares: ['event', 'highestRankedDrop'] }
  );

  defineStructureContract(
    'composition mode is set globally on the overview tab, not per-tab',
    TASKS_TAB,
    { writesNo: ['data-composition-mode-select'] }
  );

  defineStructureContract(
    'threads the system event selection rule into the events composition list',
    { file: MANAGER_ROOT, constant: 'selectedGatheringRules' },
    { names: ['eventSelectionMode'] }
  );

  defineStructureContract(
    'and the editor, the events tab and the list each default the rule defensively',
    [SHELL, EVENTS_TAB, LIST],
    { defaults: [['eventSelectionMode', 'allDrops']] }
  );

  defineStructureContract('the editor forwards the event rule to the events tab', SHELL, {
    passesProps: [['EnvironmentEventsTab', 'eventSelectionMode']],
  });

  defineStructureContract('and the events tab forwards it to the composition list', EVENTS_TAB, {
    passesProps: [['CompositionList', 'eventSelectionMode']],
  });

  defineStructureContract(
    'overview leads with a task-editor-style identity hero and drops the runtime summary',
    OVERVIEW,
    {
      attributes: [
        ['class', 'manager-environment-overview-stack'],
        ['class', 'manager-task-core-card'],
        ['class', 'manager-task-identity-fields'],
        ['class', 'manager-environment-overview-duo'],
      ],
      attributesNo: [['data-overview-section', 'scene']],
      spellsNo: ['runtime-summary'],
      declares: ['DEFAULT_ENVIRONMENT_IMAGE_DIR'],
      spellsExactly: ['icons/environment/'],
    }
  );

  defineStructureContract('the runtime preview inspector carries the full runtime counts', SUMMARY_INSPECTOR, {
    attributes: [
      ['data-runtime-fact', 'available-tasks'],
      ['data-runtime-fact', 'excluded-tasks'],
      ['data-runtime-fact', 'candidate-tasks'],
      ['data-runtime-fact', 'available-events'],
      ['data-runtime-fact', 'excluded-events'],
      ['data-runtime-fact', 'included-not-matching'],
      ['class', 'manager-fact-grid manager-environment-runtime-grid'],
    ],
    spellsNo: ['manager-fact-grid-inline'],
    spells: ['manager-fact-line', 'manager-fact-label'],
  });

  defineStructureContract(
    'exposes blind-mode per-task weight UI but no per-environment strategy or reveal controls',
    LIST,
    {
      spells: ['data-composition-weight'],
      writes: ['data-composition-weight-percent'],
      names: ['formatWeightPercentage', 'includedWeightTotal', 'showBlindWeights'],
    }
  );

  defineStructureContract('tasks tab wires per-task blind weight changes', TASKS_TAB, {
    passesProps: [['CompositionList', 'onWeightChange']],
  });

  defineStructureContract(
    'overview offers no per-environment blind behaviour card, strategy picker or reveal override',
    OVERVIEW,
    {
      attributesNo: [
        ['data-overview-section', 'blind'],
        ['data-environment-field', 'blindStrategy'],
        ['data-environment-field', 'revealPolicy'],
      ],
    }
  );

  defineStructureContract(
    'the manual Available to add menu offers a plain include and no force add at all',
    { file: LIST, fn: 'availableMenuItems' },
    { property: [['data-action', 'include']], propertyNo: [['data-action', 'force-include']] }
  );

  defineStructureContract(
    'the AUTOMATIC-mode Non-matching menu is where a task force-add lives (issue #1315)',
    { file: LIST, fn: 'nonMatchingMenuItems' },
    { property: [['data-action', 'force-include']], compares: ['notMatching', 'libraryDisabled'] }
  );

  defineStructureContract(
    'task restore remains available from the excluded menu',
    { file: LIST, fn: 'excludedMenuItems' },
    { property: [['data-action', 'restore']] }
  );

  defineStructureContract(
    'and remove/exclude from the included one',
    { file: LIST, fn: 'includedMenuItems' },
    { property: [['data-action', 'exclude']] }
  );

  defineStructureContract(
    'one dispatcher serves all four menus, and each verb reaches the prop it always did',
    { file: LIST, fn: 'runMenuAction' },
    {
      calls: ['onInclude', 'onForceInclude', 'onExclude', 'onRestore', 'onOpenSource', 'onReorder'],
      compares: ['include', 'force-include', 'exclude', 'restore', 'open-source'],
      callsWith: [
        ['onInclude', 'kind'],
        ['onForceInclude', 'entry'],
        ['onExclude', 'entry'],
        ['onRestore', 'entry'],
      ],
    }
  );

  defineStructureContract(
    'manual rows key off the plain include action, which never returns a force add',
    { file: LIST, fn: 'availableRowAction' },
    {
      spellsExactly: ['include', 'library-disabled'],
      spellsExactlyNo: ['force-include'],
      compares: ['candidate', 'notMatching', 'libraryDisabled'],
    }
  );

  defineStructureContract('manual included rows expose an icon-only quick remove', LIST, {
    attributes: [
      ['data-quick-action', 'exclude'],
      ['data-quick-action', 'include'],
    ],
    spells: [
      'manager-environment-comp-quick-action',
      'Composition.QuickRemove',
      'Composition.Remove',
    ],
  });

  defineStructureContract(
    'the right inspector is tab-specific (summary on overview, record on tasks/events)',
    RIGHT_INSPECTOR,
    {
      renders: ['EnvironmentSummaryInspector', 'RecordInspector', 'InspectorCard'],
      compares: ['overview', 'event'],
      names: ['selectedKind', 'recordKind', 'recordEntry'],
      writes: ['data-record-inspector-empty'],
      spells: ['NoActiveTasks', 'NoActiveEvents'],
    }
  );

  defineStructureContract(
    'selected record inspector omits source and composition action controls',
    INSPECTOR,
    {
      spellsNo: ['manager-environment-inspector-actions', 'manager-environment-open-source'],
      attributesNo: [
        ['data-record-inspector-section', 'source'],
        ['data-action', 'open-source'],
      ],
      namesNo: ['onInclude', 'onExclude', 'onRestore'],
    }
  );

  defineStructureContract(
    'and the right inspector accepts no source or composition callbacks either',
    RIGHT_INSPECTOR,
    {
      namesNo: [
        'onOpenSourceTask',
        'onOpenSourceEvent',
        'onIncludeRecord',
        'onExcludeRecord',
        'onRestoreRecord',
      ],
    }
  );

  defineStructureContract(
    'selected record inspector omits the standalone runtime-state and event-runtime cards',
    INSPECTOR,
    {
      renders: ['CompositionStatePill', 'RuntimeStatePill'],
      attributesNo: [
        ['data-record-inspector-section', 'runtime-state'],
        ['data-record-inspector-section', 'event-runtime'],
      ],
      writesNo: ['data-record-inspector-waiting-for'],
      spellsNo: ['manager-environment-layer-list'],
    }
  );

  const DELETED_INSPECTOR_KEYS = [
    'Inspector.RuntimeState',
    'Inspector.LayerLibrary',
    'Inspector.LayerMatching',
    'Inspector.LayerComposition',
    'Inspector.LayerRuntime',
    'Inspector.Enabled',
    'Inspector.Disabled',
    'Inspector.Matches',
    'Inspector.NoMatch',
    'Inspector.WaitingFor',
    'Inspector.ExplainAvailable',
    'Inspector.ExplainForceIncluded',
    'Inspector.ExplainConditionsBlocked',
    'Inspector.ExplainStale',
    'Inspector.ExplainExcluded',
    'Inspector.ExplainCandidate',
    'Inspector.ExplainNotMatching',
    'Inspector.ExplainLibraryDisabled',
    'Inspector.EventRuntime',
    'Inspector.ScopeEnvironment',
    'Inspector.Scope',
    'Inspector.EventExplanation',
  ];

  defineStructureContract(
    'and references none of the retired inspector strings',
    INSPECTOR,
    { spellsNo: DELETED_INSPECTOR_KEYS }
  );

  it('the retired inspector strings are gone from en.json, and EventChance stays', () => {
    for (const deleted of DELETED_INSPECTOR_KEYS) {
      assert.equal(
        catalogValue(`FABRICATE.Admin.Manager.EnvironmentEditor.${deleted}`),
        undefined,
        `EnvironmentEditor.${deleted} should be removed`
      );
    }
    assert.equal(
      catalogValue('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.EventChance'),
      'Event chance',
      'EnvironmentEditor.Inspector.EventChance should remain for event override controls'
    );
  });

  defineStructureContract(
    'the shell auto-selects the first active record on the tasks/events tabs',
    SHELL,
    { reads: ['entry.runtimeState'], compares: ['available'], calls: ['selectRecord'] }
  );

  defineStructureContract('the linked scene card lives in the inspector under the summary', SUMMARY_INSPECTOR, {
    writes: ['data-environment-summary-scene'],
    spells: ['manager-environment-scene-dropzone'],
  });

  defineStructureContract(
    'matching evidence supports compact chips and the inspector evidence table',
    EVIDENCE,
    {
      compares: ['checks'],
      spells: [
        'manager-environment-evidence-summary',
        'manager-environment-evidence-table',
        'manager-environment-evidence-dimension',
        'manager-environment-evidence-value-pill',
      ],
      writes: ['data-evidence-value-state'],
      spellsExactly: ['safe', 'unsafe', 'hazardous', 'dangerous', 'deadly', 'extreme'],
    }
  );

  defineStructureContract('the inspector requests the checks evidence variant', INSPECTOR, {
    passesValues: [['MatchingEvidenceChips', 'variant', 'checks']],
  });

  defineStructureContract(
    'overview danger selector uses configured danger options and preserves stale values',
    OVERVIEW,
    { names: ['dangerLevelOptions', 'renderedDangerOptions'] }
  );

  defineStructureContract(
    'and the stale current value is inserted into the rendered option list',
    { file: OVERVIEW, constant: 'renderedDangerOptions' },
    { names: ['dangerLevelOptions', 'dangerLevel'], calls: ['some', 'defaultDangerLabel'] }
  );

  defineStructureContract(
    'manual mode renders one Available-to-add group instead of Excluded and Non-matching sections',
    LIST,
    {
      imports: [LIST_VOCABULARY],
      names: ['ENVIRONMENT_INCLUDED_COMPOSITION_STATES'],
      attributes: [
        ['data-section', 'included'],
        ['data-section', 'available-to-add'],
        ['data-section', 'excluded'],
        ['data-section', 'non-matching'],
      ],
      spells: [
        'Composition.AvailableToAdd',
        'Composition.NoAvailableTasksToAdd',
        'Composition.NoAvailableEventsToAdd',
        'LibraryDisabledNote',
        'OpenSource',
      ],
      renders: ['Pagination'],
      rendersNo: ['DiagnosticsDisclosure'],
    }
  );

  defineStructureContract(
    'the included list is filtered through the shared four-state included vocabulary',
    { file: LIST, constant: 'included' },
    { reads: ['ENVIRONMENT_INCLUDED_COMPOSITION_STATES.has', 'entry.compositionState'] }
  );

  defineStructureContract(
    'available-to-add orders matching records before non-matching and library-disabled',
    { file: LIST, constant: 'availableToAdd' },
    {
      names: [
        'availableToAddMatching',
        'availableToAddNonMatching',
        'availableToAddLibraryDisabled',
      ],
    }
  );

  defineStructureContract(
    'and manual Available to add classifies nothing off the excluded state',
    { file: LIST, constant: 'availableToAddMatching' },
    { compares: ['candidate'], comparesNo: ['excluded'] }
  );

  defineStructureContract(
    'non-matching collects notMatching and libraryDisabled',
    { file: LIST, constant: 'nonMatching' },
    { compares: ['notMatching', 'libraryDisabled'], reads: ['entry.compositionState'] }
  );

  defineStructureContract(
    'inspector renders matching evidence and active drop-rate adjustment overrides',
    INSPECTOR,
    {
      renders: ['MatchingEvidenceChips'],
      attributes: [
        ['data-record-inspector-section', 'evidence'],
        ['data-record-inspector-section', 'overrides'],
      ],
      writes: [
        'data-task-drop-rate-adjustments-toggle',
        'data-event-drop-rate-adjustments-toggle',
        'data-drop-rate-adjustment-percent',
        'data-drop-rate-adjustment-base',
        'data-drop-rate-adjustment-effective',
      ],
      spells: [
        'DropRateAdjustment',
        'manager-environment-drop-adjustment-drop',
        'manager-environment-drop-adjustment-controls',
        'manager-environment-drop-adjustment-clear',
        'DropRateAdjustmentRange',
        'Inspector.BaseChanceModifier',
      ],
      attributesNo: [['class', 'manager-condition-modifier-value is-disabled-overrides']],
      names: [
        'taskDropRateAdjustmentsEnabled',
        'eventDropRateAdjustmentsEnabled',
        'onTaskAdjustmentInput',
        'onEventAdjustmentInput',
        'setEventAdjustment',
        'setTaskDropAdjustment',
        'adjustmentValueClass',
      ],
      spellsNo: ['is-disabled-overrides'],
    }
  );

  defineStructureContract(
    'the icon-only clear action keeps its accessible copy, as a named prop not a rest spread',
    INSPECTOR,
    {
      passesProps: [['IconButton', 'ariaLabel']],
      spells: ['Inspector.ClearAdjustment'],
    }
  );

  defineStructureContract('tabs are a keyboard-navigable tablist', EDITOR_TABS, {
    attributes: [
      ['role', 'tablist'],
      ['role', 'tab'],
    ],
    spellsExactly: ['ArrowRight', 'ArrowLeft'],
    writes: ['onkeydown', 'aria-selected'],
  });

  defineStructureContract(
    'the environment strip keeps its own DOM contract after the promotion',
    TABS,
    {
      passesValues: [
        ['EditorTabs', 'hookAttribute', 'data-environment-tab-button'],
        ['EditorTabs', 'idStem', 'environment'],
        ['EditorTabs', 'ariaLabelKey', 'FABRICATE.Admin.Manager.EnvironmentEditor.Tabs.Label'],
        ['EditorTabs', 'containerClass', 'manager-environment-tabs'],
        ['EditorTabs', 'buttonClass', 'manager-environment-tab-button'],
      ],
    }
  );

  defineStructureContract(
    'and the primitive still builds BOTH ids from this caller`s one stem',
    EDITOR_TABS,
    { names: ['buttonIdStem', 'panelIdStem', 'idStem'], spellsExactly: ['-tab', '-panel'] }
  );

  defineStructureContract(
    'tab badges count composition membership rather than runtime availability',
    { file: SHELL, constant: 'badges' },
    {
      names: ['taskCompositionCount', 'eventCompositionCount', 'validationBadges'],
      keys: ['tasks', 'events', 'validation'],
      readsNo: ['counts.availableTasks', 'counts.availableEvents'],
    }
  );

  defineStructureContract(
    'the Tasks badge derives from task composition records',
    { file: SHELL, constant: 'taskCompositionCount' },
    { calls: ['countIncludedRecords'], reads: ['composition.tasks'] }
  );

  defineStructureContract(
    'and the Events badge from event composition records',
    { file: SHELL, constant: 'eventCompositionCount' },
    { calls: ['countIncludedRecords'], reads: ['composition.events'] }
  );

  defineStructureContract(
    'the badge count keeps no second copy of the included vocabulary, and no "composed" name',
    SHELL,
    {
      imports: [SHELL_VOCABULARY],
      names: ['ENVIRONMENT_INCLUDED_COMPOSITION_STATES'],
      namesNo: ['INCLUDED_COMPOSITION_STATES', 'countComposedRecords'],
      readsNo: ['issue.severity'],
      spellsNo: ['BadgeError', 'BadgeWarning'],
    }
  );

  defineStructureContract(
    'and it filters composition records through that shared set',
    { file: SHELL, fn: 'countIncludedRecords' },
    { reads: ['ENVIRONMENT_INCLUDED_COMPOSITION_STATES.has', 'entry.compositionState'] }
  );

  defineStructureContract(
    'the validation badge reads the shared readiness accessor',
    { file: SHELL, constant: 'validationCounts' },
    { calls: ['countReadiness'], names: ['readiness'] }
  );

  defineStructureContract(
    'and renders one numeric badge per tone rather than severity words',
    { file: SHELL, constant: 'validationBadges' },
    {
      keys: ['label', 'tone'],
      property: [
        ['tone', 'danger'],
        ['tone', 'warning'],
      ],
      reads: ['validationCounts.blocking', 'validationCounts.warnings'],
      callsWith: [['String', 'validationCounts']],
    }
  );

  defineStructureContract('tabs accept multiple badges for a single tab', EDITOR_TABS, {
    reads: ['Array.isArray'],
    callsWith: [['isArray', 'value']],
    returnsFor: [['warning', 'warning']],
  });
});

describe('evaluateEnvironmentReadiness', () => {
  const environment = {
    enabled: true,
    name: 'Mines',
    biomes: ['cave'],
    dangerTags: ['hazardous'],
    sceneUuid: '',
  };

  it('flags an active environment with no available tasks as critical', () => {
    const { checks, issues } = evaluateEnvironmentReadiness(environment, {
      counts: { availableTasks: 0 },
      tasks: [],
      events: [],
    });
    assert.equal(checks.find((check) => check.id === 'hasName').satisfied, true);
    assert.equal(checks.find((check) => check.id === 'hasBiome').satisfied, true);
    assert.equal(checks.find((check) => check.id === 'hasAvailableTask').satisfied, false);
    assert.ok(
      issues.some(
        (issue) =>
          issue.id === 'noAvailableTasks' &&
          issue.severity === 'critical' &&
          issue.blocks === 'enable'
      )
    );
    assert.ok(
      issues.some(
        (issue) =>
          issue.id === 'activeNoComposition' &&
          issue.severity === 'critical' &&
          issue.blocks === 'enable'
      )
    );
    assert.ok(issues.some((issue) => issue.id === 'noScene' && issue.severity === 'warning'));
    assert.equal(blocksEnable(issues), true);
  });

  it('treats a disabled draft with no available tasks as a non-blocking warning', () => {
    const disabled = {
      enabled: false,
      name: 'Mines',
      biomes: ['cave'],
      dangerTags: ['hazardous'],
      sceneUuid: '',
    };
    const { issues } = evaluateEnvironmentReadiness(disabled, {
      counts: { availableTasks: 0 },
      tasks: [],
      events: [],
    });
    // The disabled draft now saves fine.
    const noAvailable = issues.find((issue) => issue.id === 'noAvailableTasks');
    assert.ok(noAvailable, 'should still surface the no-available-tasks issue');
    assert.equal(noAvailable.severity, 'warning');
    assert.equal(noAvailable.blocks, 'enable');
    // activeNoComposition only fires for an active environment.
    assert.ok(!issues.some((issue) => issue.id === 'activeNoComposition'));
    // The single noAvailableTasks issue still blocks enabling.
    assert.equal(blocksEnable(issues), true);
  });

  it('does not block enabling when only advisory issues are present', () => {
    const composition = {
      counts: { availableTasks: 1, includedNotMatchingTasks: 1 },
      tasks: [
        {
          id: 'stale',
          kind: 'task',
          compositionState: 'includedNotMatching',
          record: { name: 'Picked Task' },
        },
      ],
      events: [],
    };
    const { issues } = evaluateEnvironmentReadiness(environment, composition);
    const stale = issues.find((issue) => issue.id === 'staleIncluded');
    // The not-matching note carries no blocks field and never did.
    assert.equal(stale.blocks, undefined);
    assert.equal(blocksEnable(issues), false);
  });

  it('raises an informational note for a picked record that does not match', () => {
    // `info`, not `critical` (issue #1315). Manual mode composes exactly the picked list with no
    // match filter, so a non-matching pick RUNS — it is a deliberate choice, not stale state, and
    // a critical error told the GM to undo what the product's own contract invites. The note
    // survives because the Included list would otherwise show it identically to a matching pick.
    const composition = {
      counts: { availableTasks: 1, includedNotMatchingTasks: 1 },
      tasks: [
        {
          id: 'stale',
          kind: 'task',
          compositionState: 'includedNotMatching',
          record: { name: 'Picked Task' },
        },
      ],
      events: [],
    };
    const { issues, checks } = evaluateEnvironmentReadiness(environment, composition);
    const stale = issues.find((issue) => issue.id === 'staleIncluded');
    assert.ok(stale, 'should flag the non-matching pick');
    assert.equal(stale.severity, 'info');
    assert.equal(stale.recordId, 'stale');
    assert.equal(stale.recordName, 'Picked Task');
    assert.equal(
      checks.find((check) => check.id === 'noStaleIncluded'),
      undefined,
      'a deliberate non-matching pick is a note, not an unmet readiness check'
    );
  });

  it('reports informational issues for locally excluded records', () => {
    const composition = {
      counts: { availableTasks: 1, diagnosticTasks: 2, excludedTasks: 1 },
      tasks: [
        {
          id: 'hidden-a',
          kind: 'task',
          compositionState: 'notMatching',
          record: { name: 'Forage Moonberries' },
        },
        {
          id: 'hidden-b',
          kind: 'task',
          compositionState: 'libraryDisabled',
          record: { name: 'Forage Brambles' },
        },
      ],
      events: [],
    };
    const { issues } = evaluateEnvironmentReadiness(environment, composition);
    assert.ok(
      !issues.some((issue) => issue.id === 'hiddenNonMatching'),
      'hidden non-matching records are surfaced in the Tasks/Events tabs, not as validation issues'
    );
    assert.ok(issues.some((issue) => issue.id === 'locallyExcluded' && issue.severity === 'info'));
  });
});

// THE SIXTH HOST OF THE VALIDATION ROW ACTION (issue 1517, docs round). This editor wired only
// half of it: `selectValidationRecord` selected the record and switched the tab, and stopped —
// no focus move, no live region, and a tab panel with no `tabindex`, so activating a row unmounted
// the View button that was pressed and dropped focus onto `<body>`, where Space pauses the game
// and the arrows pan the canvas behind the window.
describeValidationHostContract({
  title: 'EnvironmentEditView wires the row action in the order the mechanism needs',
  hostFile: 'EnvironmentEditView.svelte',
  tabComponent: 'EnvironmentValidationTab',
  tabProp: 'onSelectRecord',
  handler: 'selectValidationRecord',
  routeCall: 'activeTab = route.tab',
  regionMarker: 'data-environment-issue-announcement',
  regionOutsideNoun: 'tab chain',
  mustPrecede: [
    {
      marker: "{#if activeTab === 'overview'}",
      present: 'the tab chain must exist',
      order: 'the region sits outside the tab chain',
    },
  ],
});
