import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateEnvironmentReadiness } from '../../src/ui/svelte/apps/manager/environment/environmentReadiness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const envDir = resolve(repoRoot, 'src/ui/svelte/apps/manager/environment');

function read(name) {
  return readFileSync(resolve(envDir, name), 'utf8');
}

function catalogValue(key) {
  return key.split('.').reduce((node, part) => node?.[part], lang);
}

function decodeStaticString(quote, body) {
  return Function(`return ${quote}${body}${quote};`)();
}

function staticTextCalls(source) {
  const pattern = /text\(\s*(["'])(FABRICATE(?:\\.|(?!\1).)*)\1\s*,\s*(["'])((?:\\.|(?!\3).)*)\3\s*\)/gs;
  return [...source.matchAll(pattern)].map(match => ({
    key: match[2],
    fallback: decodeStaticString(match[3], match[4])
  }));
}

const shellSource = readFileSync(resolve(repoRoot, 'src/ui/svelte/apps/manager/EnvironmentEditView.svelte'), 'utf8');
const listSource = read('CompositionList.svelte');
const modeControlSource = read('CompositionModeControl.svelte');
const inspectorSource = read('RecordInspector.svelte');
const tabsSource = read('EnvironmentEditorTabs.svelte');
const evidenceSource = read('MatchingEvidenceChips.svelte');
const tasksTabSource = read('EnvironmentTasksTab.svelte');
const validationSource = read('EnvironmentValidationTab.svelte');
const overviewSource = read('EnvironmentOverviewTab.svelte');
const summaryInspectorSource = read('EnvironmentSummaryInspector.svelte');
const rightInspectorSource = read('EnvironmentRightInspector.svelte');
const lang = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'));
const editorLocalizationSources = [
  ['EnvironmentEditView.svelte', shellSource],
  ...readdirSync(envDir)
    .filter(name => name.endsWith('.svelte'))
    .map(name => [name, read(name)])
];

describe('environment editor localization', () => {
  it('defines the EnvironmentEditor namespace in en.json for the keys the editor uses', () => {
    const editor = lang.FABRICATE.Admin.Manager.EnvironmentEditor;
    assert.ok(editor, 'EnvironmentEditor namespace should exist');
    const checks = [
      ['Overview', 'RegionHint'],
      ['Overview', 'BiomesHint'],
      ['Overview', 'DangerHint'],
      ['Composition', 'Automatic'],
      ['Composition', 'IncludedByMatch'],
      ['Inspector', 'LayerLibrary'],
      ['Inspector', 'Overrides'],
      ['Validation', 'Readiness'],
      ['Evidence', 'Biome'],
      ['Tabs', 'Tasks'],
      ['Runtime', 'Available']
    ];
    for (const [group, key] of checks) {
      assert.equal(typeof editor[group]?.[key], 'string', `EnvironmentEditor.${group}.${key} should be a localized string`);
      assert.ok(editor[group][key].length > 0, `EnvironmentEditor.${group}.${key} should not be empty`);
    }
    assert.equal(editor.Validation.Severity.critical, 'Critical');
    assert.equal(editor.Hazards.DangerTag.deadly, 'Deadly');
  });

  it('defines the new force-include and non-matching EnvironmentEditor copy', () => {
    const editor = lang.FABRICATE.Admin.Manager.EnvironmentEditor;
    const expected = [
      ['Composition.NonMatching', 'Non-matching'],
      ['Composition.NoNonMatching', 'No non-matching or disabled records.'],
      ['Composition.AvailableToAdd', 'Available to add'],
      ['Composition.NoAvailableToAdd', 'No matching or non-matching records to add.'],
      ['Composition.ForceAdd', 'Force add'],
      ['Composition.LibraryDisabledNote', 'Enable in library first'],
      ['Composition.ForceIncluded', 'Force included'],
      ['Composition.OverrideOn', 'On'],
      ['Composition.OverrideOff', 'Off'],
      ['Composition.OverrideOnTitle', 'Drop rate adjustment on'],
      ['Composition.OverrideOffTitle', 'Drop rate adjustment off'],
      ['Composition.WeightPercentage', 'Selection share'],
      ['Composition.ManualHint', 'Only explicitly included records are available; GMs can force add enabled non-matching records.'],
      ['Inspector.ExplainForceIncluded', 'Force-added by the GM despite not matching the environment context.'],
      ['Inspector.OverridesHint', 'Drop-rate adjustments apply only in this environment and do not modify the reusable source record.'],
      ['Inspector.DropRateAdjustment', 'Drop-rate adjustment'],
      ['Inspector.ClearAdjustment', 'Clear'],
      ['Tasks.ManualIntro', 'Only tasks you explicitly include are available to players. You can add matching tasks or force add non-matching tasks from Available to add.'],
      ['Hazards.ManualIntro', 'Only hazards you explicitly include apply here. You can also force add non-matching hazards from the Non-matching list.'],
      ['Validation.CheckRegion', 'Has a region or is set to "any region"']
    ];

    for (const [path, value] of expected) {
      assert.equal(path.split('.').reduce((node, part) => node?.[part], editor), value, `EnvironmentEditor.${path}`);
    }
  });

  it('keeps static EnvironmentEditor localization fallbacks aligned with en.json', () => {
    const failures = [];
    for (const [fileName, source] of editorLocalizationSources) {
      for (const { key, fallback } of staticTextCalls(source)) {
        if (!key.startsWith('FABRICATE.Admin.Manager.EnvironmentEditor.')) continue;
        const value = catalogValue(key);
        if (typeof value !== 'string') {
          failures.push(`${fileName}: missing ${key}`);
        } else if (value !== fallback) {
          failures.push(`${fileName}: ${key} fallback "${fallback}" does not match en.json "${value}"`);
        }
      }
    }
    assert.deepEqual(failures, []);
  });

  it('keeps dynamic EnvironmentEditor validation fallbacks aligned with en.json', () => {
    assert.ok(
      validationSource.includes('hasRegion: [\'CheckRegion\', \'Has a region or is set to "any region"\']'),
      'CheckRegion dynamic fallback should match the English catalog'
    );
    assert.ok(
      modeControlSource.includes("descFallback: 'Only explicitly included records are available; GMs can force add enabled non-matching records.'"),
      'ManualHint dynamic fallback should match the English catalog'
    );
  });

  it('no editor component falls back on the legacy Environment.* editor key prefixes', () => {
    for (const source of [shellSource, listSource, inspectorSource, tabsSource, evidenceSource, tasksTabSource, overviewSource, summaryInspectorSource]) {
      assert.ok(!/FABRICATE\.Admin\.Manager\.Environment\.(Overview|Composition|Evidence|Diagnostics|Tabs|Runtime|Inspector|Validation)\b/.test(source), 'editor sources should use the EnvironmentEditor namespace');
    }
  });
});

describe('environment composition editor structure', () => {
  it('shell composes tabs, workspace, and its own inspector (header lives in chrome)', () => {
    for (const snippet of [
      'EnvironmentEditorTabs',
      'EnvironmentOverviewTab',
      'EnvironmentTasksTab',
      'EnvironmentHazardsTab',
      'EnvironmentValidationTab',
      'EnvironmentRightInspector',
      'data-environment-editor',
      'manager-environment-workspace'
    ]) {
      assert.ok(shellSource.includes(snippet), `shell should reference ${snippet}`);
    }
    assert.ok(!shellSource.includes('EnvironmentEditorHeader'), 'header now lives in the shared chrome, not the editor body');
    assert.ok(/\{#if activeTab !== 'validation'\}\s*<EnvironmentRightInspector/.test(shellSource), 'right inspector renders on every tab except validation');
    assert.ok(shellSource.includes("class:is-inspector-hidden={activeTab === 'validation'}"), 'workspace collapses to one column on the validation tab');
    assert.ok(/<EnvironmentRightInspector[\s\S]*?\{activeTab\}/.test(shellSource), 'shell passes the active tab to the inspector');
  });

  it('renders Tasks/Hazards as a column-headed table', () => {
    assert.ok(listSource.includes('manager-environment-comp-head'), 'composition list renders a column header row');
    for (const col of ['ColTask', 'ColOverride', 'ColRuntime']) {
      assert.ok(listSource.includes(col), `composition table defines the ${col} column`);
    }
    assert.ok(listSource.includes('ColWeight'), 'composition table defines the blind-mode ColWeight column');
    assert.ok(!listSource.includes('ColEvidence'), 'composition table no longer renders an evidence column');
    assert.ok(!listSource.includes('MatchingEvidenceChips'), 'composition rows no longer embed evidence chips inline');
    assert.ok(listSource.includes('OverrideIndicator'), 'rows surface override state via the OverrideIndicator chip');
    assert.ok(listSource.includes('active={entry.hasDropRateAdjustment === true}'), 'override chips are driven by drop-rate adjustment state');
    assert.ok(!listSource.includes('compositionState={entry.compositionState}'), 'override chips are not driven by composition state');
    assert.ok(listSource.includes('manager-environment-comp-row'), 'composition list renders table rows');
    assert.ok(listSource.includes('dismissOnOutsideClick'), 'row overflow menu dismisses on outside click');
    assert.ok(listSource.includes('manager-environment-comp-menu'), 'rows expose an overflow action menu');
    assert.ok(listSource.includes("draggable={kind === 'hazard'}"), 'reorder (drag) is hazard-only; tasks are not reorderable');
    assert.ok(!tasksTabSource.includes('data-composition-mode-select'), 'composition mode is set globally on the overview tab, not per-tab');
  });

  it('overview leads with a task-editor-style identity hero and drops the runtime summary', () => {
    assert.ok(overviewSource.includes('manager-environment-overview-stack'), 'overview central panel is a vertical stack');
    assert.ok(overviewSource.includes('manager-task-core-card'), 'identity card reuses the task/hazard hero card');
    assert.ok(overviewSource.includes('manager-task-identity-fields'), 'identity card uses the shared identity fields layout');
    assert.ok(overviewSource.includes('manager-environment-overview-duo'), 'player-facing and composition cards sit in a 2-up row');
    assert.ok(!overviewSource.includes('runtime-summary'), 'runtime summary card is removed from the central panel');
    assert.ok(!overviewSource.includes('data-overview-section="scene"'), 'linked scene card moved out of the overview central panel');
    assert.ok(overviewSource.includes("'icons/environment/'"), 'image picker defaults to the core environment icons directory');
  });

  it('the runtime preview inspector carries the full runtime counts', () => {
    for (const fact of ['available-tasks', 'excluded-tasks', 'candidate-tasks', 'available-hazards', 'excluded-hazards', 'unavailable-included']) {
      assert.ok(summaryInspectorSource.includes(`data-runtime-fact="${fact}"`), `runtime preview includes the ${fact} fact`);
    }
  });

  it('exposes blind-mode configuration UI (weights, strategy, reveal override)', () => {
    assert.ok(listSource.includes('data-composition-weight'), 'composition list renders a per-task blind weight input');
    assert.ok(listSource.includes('data-composition-weight-percent'), 'composition list renders a calculated blind weight percentage');
    assert.ok(listSource.includes('formatWeightPercentage'), 'composition list calculates included-task selection shares');
    assert.ok(listSource.includes('includedWeightTotal'), 'weight percentages are based on included task weights');
    assert.ok(listSource.includes('showBlindWeights'), 'weight input is gated to blind task rows');
    assert.ok(tasksTabSource.includes('onWeightChange'), 'tasks tab wires per-task blind weight changes');
    assert.ok(overviewSource.includes('data-overview-section="blind"'), 'overview renders a blind behaviour card');
    assert.ok(overviewSource.includes('data-environment-field="blindStrategy"'), 'overview exposes a blind selection strategy control');
    assert.ok(overviewSource.includes('data-environment-field="revealPolicy"'), 'overview exposes a per-environment reveal override');
  });

  it('collapses task row actions into the overflow menu while preserving hazard row controls', () => {
    assert.ok(listSource.includes("{#if kind === 'task'}"), 'composition list branches task rows for compact action menus');
    assert.ok(listSource.includes('data-action="include" onclick={() => { onInclude'), 'task include action is available from a menu item');
    assert.ok(listSource.includes('data-action="force-include" onclick={() => { onForceInclude'), 'task force-add action is available from a menu item');
    assert.ok(listSource.includes('data-action="restore" onclick={() => { onRestore'), 'task restore action is available from a menu item');
    assert.ok(listSource.includes('data-action="exclude" onclick={() => { onExclude'), 'task exclude action remains available from a menu item');
    assert.ok(listSource.includes("{#if kind === 'hazard'}"), 'hazard rows keep their distinct action/reorder branch');
    assert.ok(listSource.includes("draggable={kind === 'hazard'}"), 'hazard drag reordering remains hazard-only');
  });

  it('the right inspector is tab-specific (summary on overview, record on tasks/hazards)', () => {
    assert.ok(rightInspectorSource.includes("activeTab === 'overview'"), 'inspector branches on the overview tab');
    assert.ok(rightInspectorSource.includes('EnvironmentSummaryInspector'), 'overview shows the environment summary');
    assert.ok(rightInspectorSource.includes('RecordInspector'), 'tasks/hazards show the selected record');
    assert.ok(rightInspectorSource.includes('selectedKind !== recordKind'), 'a record only shows for the active tab kind');
    assert.ok(rightInspectorSource.includes('data-record-inspector-empty'), 'tasks/hazards show a no-active-records message when none are available');
    assert.ok(rightInspectorSource.includes('NoActiveTasks') && rightInspectorSource.includes('NoActiveHazards'), 'empty state reads as "No active tasks/hazards"');
  });

  it('the shell auto-selects the first active record on the tasks/hazards tabs', () => {
    assert.ok(shellSource.includes("runtimeState === 'available'"), 'auto-select targets active (available) records');
    assert.ok(/\$effect\(\(\) => \{[\s\S]*?selectRecord\(kind, firstActive\.id\)/.test(shellSource), 'an effect auto-selects the first active record of the active tab kind');
  });

  it('the linked scene card lives in the inspector under the summary', () => {
    assert.ok(summaryInspectorSource.includes('data-environment-summary-scene'), 'inspector renders the relocated linked scene card');
    assert.ok(summaryInspectorSource.includes('manager-environment-scene-dropzone'), 'inspector scene card keeps the drop-to-link zone');
  });

  it('matching evidence supports table chips and inspector check rows', () => {
    assert.ok(evidenceSource.includes("variant === 'checks'"), 'evidence component branches on the checks variant');
    assert.ok(evidenceSource.includes('manager-environment-evidence-summary'), 'chip variant renders a value summary line');
    assert.ok(evidenceSource.includes('manager-environment-evidence-check'), 'checks variant renders check rows');
    assert.ok(inspectorSource.includes('variant="checks"'), 'inspector requests the checks evidence variant');
  });

  it('manual task mode renders one Available-to-add group instead of Excluded and Non-matching sections', () => {
    // The included section must never surface addable/non-matching records; those
    // belong to the task-only Available-to-add list in manual mode.
    assert.ok(listSource.includes("entry.compositionState === 'includedByMatch'"), 'included section keys off includedByMatch');
    assert.ok(listSource.includes("entry.compositionState === 'forceIncluded'"), 'included section also surfaces force-included records');
    assert.ok(listSource.includes("availableToAddMatching"), 'manual task mode has a matching available-to-add group');
    assert.ok(listSource.includes("availableToAddNonMatching"), 'manual task mode has a non-matching available-to-add group');
    assert.ok(listSource.includes("availableToAddLibraryDisabled"), 'manual task mode has a library-disabled available-to-add group');
    assert.ok(listSource.includes('const availableToAdd = $derived([...availableToAddMatching, ...availableToAddNonMatching, ...availableToAddLibraryDisabled])'), 'available-to-add orders matching records before non-matching and library-disabled records');
    assert.ok(listSource.includes('data-section="available-to-add"'), 'manual task mode renders an Available to add section');
    assert.ok(listSource.includes('Composition.AvailableToAdd'), 'Available to add section uses localized copy');
    assert.ok(listSource.includes('Composition.NoAvailableToAdd'), 'Available to add empty state uses localized copy');
    assert.ok(listSource.includes("entry.compositionState === 'excluded' && entry.matches === true && entry.libraryEnabled === true"), 'matching excluded task records stay discoverable in Available to add');
    assert.ok(listSource.includes("entry?.compositionState === 'excluded' && entry?.matches !== true"), 'non-matching excluded task records can be force-added again');
    assert.ok(listSource.includes("entry?.compositionState === 'excluded' && entry?.libraryEnabled !== true"), 'library-disabled excluded task records remain non-addable');
    assert.ok(listSource.includes("{#if kind === 'task' && mode === 'manual'}"), 'Available to add is gated to manual task mode');
    assert.ok(listSource.includes("{#if !(kind === 'task' && mode === 'manual')}"), 'Excluded and standalone Non-matching sections do not render in manual task mode');
    assert.ok(listSource.includes("{#if kind !== 'task' && mode === 'manual'}"), 'hazard manual mode keeps the existing Matching candidates section');
    assert.ok(listSource.includes("data-section=\"excluded\""), 'automatic task mode and hazards retain the Excluded section');
    assert.ok(listSource.includes("data-section=\"non-matching\""), 'automatic task mode and hazards retain the standalone Non-matching section');
    assert.ok(/nonMatching = \$derived\(records\.filter\(entry =>\s*entry\.compositionState === 'notMatching' \|\| entry\.compositionState === 'libraryDisabled'\)\)/.test(listSource), 'non-matching list collects notMatching and libraryDisabled');
    assert.ok(listSource.includes('<Pagination'), 'the standalone non-matching list is still paginated where it remains visible');
    assert.ok(!listSource.includes('DiagnosticsDisclosure'), 'the diagnostics disclosure is replaced by the non-matching list');
    assert.ok(listSource.includes('data-action="include"'), 'matching available-to-add rows expose an include action');
    assert.ok(listSource.includes('data-action="force-include"'), 'manual mode exposes a force-add action on non-matching rows');
    assert.ok(listSource.includes('LibraryDisabledNote'), 'library-disabled rows show an "enable in library first" note');
    assert.ok(listSource.includes('OpenSource'), 'available-to-add rows keep open-source in the overflow menu');
  });

  it('inspector renders the four-layer evaluation and active drop-rate adjustment overrides', () => {
    for (const layer of ['LayerLibrary', 'LayerMatching', 'LayerComposition', 'LayerRuntime']) {
      assert.ok(inspectorSource.includes(layer), `inspector should render the ${layer} row`);
    }
    assert.ok(inspectorSource.includes('MatchingEvidenceChips'), 'inspector should render match evidence');
    assert.ok(inspectorSource.includes('data-record-inspector-section="overrides"'), 'inspector should render the override section');
    assert.ok(inspectorSource.includes('DropRateAdjustment'), 'override section should edit drop-rate adjustments');
    assert.ok(inspectorSource.includes('setHazardAdjustment'), 'hazard adjustment edits should update the environment draft');
    assert.ok(inspectorSource.includes('setTaskDropAdjustment'), 'task drop-row adjustment edits should update the environment draft');
    assert.ok(!inspectorSource.includes('is-disabled-overrides'), 'override section should no longer be phase-1 disabled');
  });

  it('tabs are a keyboard-navigable tablist', () => {
    assert.ok(tabsSource.includes('role="tablist"'), 'tabs should be a tablist');
    assert.ok(tabsSource.includes('role="tab"'), 'each tab should have the tab role');
    assert.ok(tabsSource.includes("'ArrowRight'"), 'tabs should handle ArrowRight');
    assert.ok(tabsSource.includes("'ArrowLeft'"), 'tabs should handle ArrowLeft');
    assert.ok(tabsSource.includes('onkeydown='), 'tabs should wire a keydown handler');
    assert.ok(tabsSource.includes('aria-selected'), 'tabs should expose aria-selected');
  });
});

describe('evaluateEnvironmentReadiness', () => {
  const environment = { enabled: true, name: 'Mines', biomes: ['cave'], dangerTags: ['hazardous'], sceneUuid: '' };

  it('flags an active environment with no available tasks as critical', () => {
    const { checks, issues } = evaluateEnvironmentReadiness(environment, { counts: { availableTasks: 0 }, tasks: [], hazards: [] });
    assert.equal(checks.find(check => check.id === 'hasName').satisfied, true);
    assert.equal(checks.find(check => check.id === 'hasBiome').satisfied, true);
    assert.equal(checks.find(check => check.id === 'hasAvailableTask').satisfied, false);
    assert.ok(issues.some(issue => issue.id === 'noAvailableTasks' && issue.severity === 'critical'));
    assert.ok(issues.some(issue => issue.id === 'activeNoComposition' && issue.severity === 'critical'));
    assert.ok(issues.some(issue => issue.id === 'noScene' && issue.severity === 'warning'));
  });

  it('raises a critical issue for an included-but-unavailable record', () => {
    const composition = {
      counts: { availableTasks: 1, unavailableTasks: 1 },
      tasks: [{ id: 'stale', kind: 'task', compositionState: 'includedButUnavailable', record: { name: 'Stale Task' } }],
      hazards: []
    };
    const { issues, checks } = evaluateEnvironmentReadiness(environment, composition);
    const stale = issues.find(issue => issue.id === 'staleIncluded');
    assert.ok(stale, 'should flag stale included record');
    assert.equal(stale.recordId, 'stale');
    assert.equal(stale.recordName, 'Stale Task');
    assert.equal(checks.find(check => check.id === 'noStaleIncluded').satisfied, false);
  });

  it('reports informational issues for hidden and excluded records', () => {
    const composition = { counts: { availableTasks: 1, diagnosticTasks: 2, excludedTasks: 1 }, tasks: [], hazards: [] };
    const { issues } = evaluateEnvironmentReadiness(environment, composition);
    assert.ok(issues.some(issue => issue.id === 'hiddenNonMatching' && issue.severity === 'info'));
    assert.ok(issues.some(issue => issue.id === 'locallyExcluded' && issue.severity === 'info'));
  });
});
