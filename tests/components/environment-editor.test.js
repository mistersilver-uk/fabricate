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
const managerRootSource = readFileSync(resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte'), 'utf8');
const listSource = read('CompositionList.svelte');
const modeControlSource = read('CompositionModeControl.svelte');
const inspectorSource = read('RecordInspector.svelte');
const tabsSource = read('EnvironmentEditorTabs.svelte');
const evidenceSource = read('MatchingEvidenceChips.svelte');
const tasksTabSource = read('EnvironmentTasksTab.svelte');
const hazardsTabSource = read('EnvironmentHazardsTab.svelte');
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
      ['Inspector', 'TaskEnvironmentMatching'],
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
      ['Composition.NoNonMatchingTasks', 'No non-matching or disabled tasks.'],
      ['Composition.NoNonMatchingHazards', 'No non-matching or disabled hazards.'],
      ['Composition.AvailableToAdd', 'Available to add'],
      ['Composition.NoAvailableTasksToAdd', 'No matching or non-matching tasks to add.'],
      ['Composition.NoAvailableHazardsToAdd', 'No matching or non-matching hazards to add.'],
      ['Composition.ForceAdd', 'Force add'],
      ['Composition.LibraryDisabledNote', 'Enable in library first'],
      ['Composition.ForceIncluded', 'Force included'],
      ['Composition.OverrideOn', 'On'],
      ['Composition.OverrideOff', 'Off'],
      ['Composition.OverrideOnTitle', 'Drop rate adjustment on'],
      ['Composition.OverrideOffTitle', 'Drop rate adjustment off'],
      ['Composition.WeightPercentage', 'Selection share'],
      ['Composition.ColHazard', 'Hazard'],
      ['Composition.QuickRemove', 'Remove'],
      ['Composition.Remove', 'Remove from environment'],
      ['Composition.ManualHint', 'Only explicitly included tasks and hazards are available; GMs can force add enabled non-matching tasks and hazards.'],
      ['Inspector.OverridesHintTask', 'Drop-rate adjustments apply only in this environment and do not modify the reusable source task.'],
      ['Inspector.OverridesHintHazard', 'Drop-rate adjustments apply only in this environment and do not modify the reusable source hazard.'],
      ['Inspector.DropRateAdjustment', 'Drop-rate adjustment'],
      ['Inspector.DropRateAdjustmentRange', 'Drop-rate adjustment (-100% to +100%)'],
      ['Inspector.ApplyDropRateAdjustmentsOn', 'On'],
      ['Inspector.ApplyDropRateAdjustmentsOff', 'Off'],
      ['Inspector.BaseChanceModifiers', 'Base chance modifiers'],
      ['Inspector.BaseChanceModifier', 'Base chance modifier'],
      ['Inspector.BaseRate', 'Base'],
      ['Inspector.EffectiveRate', 'Effective'],
      ['Inspector.ClearAdjustment', 'Clear'],
      ['Tasks.ManualIntro', 'Only tasks you explicitly include are available to players. You can add matching tasks or force add non-matching tasks.'],
      ['Hazards.ManualIntro', 'Only hazards you explicitly include apply here. You can add matching hazards or force add non-matching hazards.'],
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
    for (const snippet of [
      'task: [\'IssueStaleIncludedTask\', \'The task "{name}" no longer matches this environment.\']',
      'hazard: [\'IssueStaleIncludedHazard\', \'The hazard "{name}" no longer matches this environment.\']',
      'task: [\'IssueTaskNoDescriptionTask\', \'The task "{name}" has no player-facing description.\']'
    ]) {
      assert.ok(validationSource.includes(snippet), `${snippet} should match the English catalog`);
    }
    assert.ok(
      modeControlSource.includes("descFallback: 'Only explicitly included tasks and hazards are available; GMs can force add enabled non-matching tasks and hazards.'"),
      'ManualHint dynamic fallback should match the English catalog'
    );
  });

  it('formats validation issue record names as natural language instead of bracketed suffixes', () => {
    assert.ok(validationSource.includes('RECORD_ISSUE_LABELS'), 'validation tab should define per-record message templates');
    assert.ok(validationSource.includes(".replace('{name}', issue.recordName)"), 'record issue titles should inject the record name into a sentence template');
    assert.ok(!validationSource.includes('`${base} (${issue.recordName})`'), 'validation tab should not append record names in parentheses');
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
    assert.ok(shellSource.includes('function selectValidationRecord'), 'validation issue actions route through a tab-switching selector');
    assert.ok(shellSource.includes("activeTab = kind === 'hazard' ? 'hazards' : 'tasks'"), 'validation issue actions switch to the relevant Tasks/Hazards tab');
    assert.ok(shellSource.includes('onSelectRecord={selectValidationRecord}'), 'validation tab uses the tab-switching selector');
  });

  it('renders Tasks/Hazards as a column-headed table', () => {
    assert.ok(listSource.includes('manager-environment-comp-head'), 'composition list renders a column header row');
    for (const col of ['ColTask', 'ColHazard', 'ColOverride', 'ColRuntime']) {
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
    assert.ok(listSource.includes("const showHazardRankControls = $derived(kind === 'hazard' && hazardSelectionMode === 'highestRankedDrop')"), 'hazard rank controls are gated by the highest-ranked system rule');
    assert.ok(listSource.includes('draggable={showHazardRankControls ? true : undefined}'), 'reorder drag is enabled only when hazard rank controls are active');
    assert.ok(!tasksTabSource.includes('data-composition-mode-select'), 'composition mode is set globally on the overview tab, not per-tab');
  });

  it('threads the system hazard selection rule into the hazards composition list', () => {
    assert.ok(
      managerRootSource.includes('hazardSelectionMode={selectedGatheringRules.hazardSelectionMode}'),
      'manager root passes selectedGatheringRules.hazardSelectionMode into the environment editor'
    );
    assert.ok(shellSource.includes("hazardSelectionMode = 'allDrops'"), 'environment editor defaults the hazard rule defensively');
    assert.ok(shellSource.includes('{hazardSelectionMode}'), 'environment editor forwards the hazard rule to the hazards tab');
    assert.ok(hazardsTabSource.includes("hazardSelectionMode = 'allDrops'"), 'hazards tab defaults the hazard rule defensively');
    assert.ok(hazardsTabSource.includes('{hazardSelectionMode}'), 'hazards tab forwards the hazard rule to CompositionList');
    assert.ok(listSource.includes("hazardSelectionMode = 'allDrops'"), 'composition list defaults to the non-ranked all-drops mode');
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

  it('exposes blind-mode per-task weight UI but no per-environment strategy or reveal controls', () => {
    assert.ok(listSource.includes('data-composition-weight'), 'composition list renders a per-task blind weight input');
    assert.ok(listSource.includes('data-composition-weight-percent'), 'composition list renders a calculated blind weight percentage');
    assert.ok(listSource.includes('formatWeightPercentage'), 'composition list calculates included-task selection shares');
    assert.ok(listSource.includes('includedWeightTotal'), 'weight percentages are based on included task weights');
    assert.ok(listSource.includes('showBlindWeights'), 'weight input is gated to blind task rows');
    assert.ok(tasksTabSource.includes('onWeightChange'), 'tasks tab wires per-task blind weight changes');
    assert.ok(!overviewSource.includes('data-overview-section="blind"'), 'overview no longer renders a per-environment blind behaviour card');
    assert.ok(!overviewSource.includes('data-environment-field="blindStrategy"'), 'overview no longer offers a strategy picker');
    assert.ok(!overviewSource.includes('data-environment-field="revealPolicy"'), 'overview no longer offers a per-environment reveal override');
  });

  it('collapses task row actions into the overflow menu while preserving hazard row controls', () => {
    assert.ok(listSource.includes("{#if kind === 'task'}"), 'composition list branches task rows for compact action menus');
    assert.ok(listSource.includes('data-action="include" onclick={() => { onInclude'), 'task include action is available from a menu item');
    assert.ok(listSource.includes('data-action="force-include" onclick={() => { onForceInclude'), 'task force-add action is available from a menu item');
    assert.ok(listSource.includes('data-action="restore" onclick={() => { onRestore'), 'task restore action is available from a menu item');
    assert.ok(listSource.includes('data-action="exclude" onclick={() => { onExclude'), 'task remove/exclude action remains available from a menu item');
    assert.ok(listSource.includes('manager-environment-comp-quick-action'), 'manual task rows expose icon-only quick action buttons beside the menu');
    assert.ok(listSource.includes("data-quick-action=\"exclude\""), 'included manual task rows expose a quick remove action through the shared exclude handler');
    assert.ok(listSource.includes('Composition.QuickRemove'), 'manual included task quick action uses Remove copy');
    assert.ok(listSource.includes('Composition.Remove'), 'manual included task menu action uses Remove from environment copy');
    assert.ok(listSource.includes("data-quick-action=\"include\""), 'available matching task rows expose a quick add action');
    assert.ok(listSource.includes("data-quick-action=\"force-include\""), 'available non-matching task rows expose a quick force-add action');
    assert.ok(listSource.includes("{#if showHazardRankControls}"), 'ranked hazard rows keep their distinct action/reorder branch');
    assert.ok(listSource.includes('showHazardRankControls'), 'hazard drag reordering is tied to ranked hazard controls');
    assert.ok(!listSource.includes('{#if showHazardRankControls}<span class="manager-environment-comp-handle"></span>{/if}'), 'non-ranked hazard sections do not render blank handle placeholders');
  });

  it('the right inspector is tab-specific (summary on overview, record on tasks/hazards)', () => {
    assert.ok(rightInspectorSource.includes("activeTab === 'overview'"), 'inspector branches on the overview tab');
    assert.ok(rightInspectorSource.includes('EnvironmentSummaryInspector'), 'overview shows the environment summary');
    assert.ok(rightInspectorSource.includes('RecordInspector'), 'tasks/hazards show the selected record');
    assert.ok(rightInspectorSource.includes('selectedKind !== recordKind'), 'a record only shows for the active tab kind');
    assert.ok(rightInspectorSource.includes('data-record-inspector-empty'), 'tasks/hazards show a no-active-records message when none are available');
    assert.ok(rightInspectorSource.includes('NoActiveTasks') && rightInspectorSource.includes('NoActiveHazards'), 'empty state reads as "No active tasks/hazards"');
  });

  it('selected record inspector omits source and composition action controls', () => {
    assert.ok(!inspectorSource.includes('manager-environment-inspector-actions'), 'selected record inspector should not render an action strip below the record name');
    assert.ok(!inspectorSource.includes('manager-environment-open-source'), 'selected record inspector should not render an open-source CTA');
    assert.ok(!inspectorSource.includes('data-record-inspector-section="source"'), 'selected record inspector should not render a Source card');
    assert.ok(!inspectorSource.includes('data-action="open-source"'), 'selected record inspector should not render source action buttons');
    assert.ok(!inspectorSource.includes('onInclude'), 'selected record inspector should not accept include callbacks');
    assert.ok(!inspectorSource.includes('onExclude'), 'selected record inspector should not accept exclude callbacks');
    assert.ok(!inspectorSource.includes('onRestore'), 'selected record inspector should not accept restore callbacks');
    assert.ok(!rightInspectorSource.includes('onOpenSourceTask'), 'right inspector should not accept source task callbacks');
    assert.ok(!rightInspectorSource.includes('onOpenSourceHazard'), 'right inspector should not accept source hazard callbacks');
    assert.ok(!rightInspectorSource.includes('onIncludeRecord'), 'right inspector should not accept include callbacks');
    assert.ok(!rightInspectorSource.includes('onExcludeRecord'), 'right inspector should not accept exclude callbacks');
    assert.ok(!rightInspectorSource.includes('onRestoreRecord'), 'right inspector should not accept restore callbacks');
  });

  it('selected record inspector omits the standalone runtime-state and hazard-runtime cards', () => {
    assert.ok(inspectorSource.includes('CompositionStatePill'), 'selected record header should keep the composition pill');
    assert.ok(inspectorSource.includes('RuntimeStatePill'), 'selected record header should keep the runtime pill');
    assert.ok(!inspectorSource.includes('data-record-inspector-section="runtime-state"'), 'selected record inspector should not render a Runtime state card');
    assert.ok(!inspectorSource.includes('data-record-inspector-section="hazard-runtime"'), 'selected record inspector should not render a Hazard runtime card');
    assert.ok(!inspectorSource.includes('data-record-inspector-waiting-for'), 'selected record inspector should not render waiting-for details');
    assert.ok(!inspectorSource.includes('manager-environment-layer-list'), 'selected record inspector should not render layer rows');
    for (const deleted of [
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
      'Inspector.HazardRuntime',
      'Inspector.ScopeEnvironment',
      'Inspector.Scope',
      'Inspector.HazardExplanation'
    ]) {
      assert.equal(catalogValue(`FABRICATE.Admin.Manager.EnvironmentEditor.${deleted}`), undefined, `EnvironmentEditor.${deleted} should be removed`);
      assert.ok(!inspectorSource.includes(deleted), `inspector should not reference ${deleted}`);
    }
    assert.equal(
      catalogValue('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.HazardChance'),
      'Hazard chance',
      'EnvironmentEditor.Inspector.HazardChance should remain for hazard override controls'
    );
  });

  it('the shell auto-selects the first active record on the tasks/hazards tabs', () => {
    assert.ok(shellSource.includes("runtimeState === 'available'"), 'auto-select targets active (available) records');
    assert.ok(/\$effect\(\(\) => \{[\s\S]*?selectRecord\(kind, firstActive\.id\)/.test(shellSource), 'an effect auto-selects the first active record of the active tab kind');
  });

  it('the linked scene card lives in the inspector under the summary', () => {
    assert.ok(summaryInspectorSource.includes('data-environment-summary-scene'), 'inspector renders the relocated linked scene card');
    assert.ok(summaryInspectorSource.includes('manager-environment-scene-dropzone'), 'inspector scene card keeps the drop-to-link zone');
  });

  it('matching evidence supports compact chips and the inspector evidence table', () => {
    assert.ok(evidenceSource.includes("variant === 'checks'"), 'evidence component branches on the checks variant');
    assert.ok(evidenceSource.includes('manager-environment-evidence-summary'), 'chip variant renders a value summary line');
    assert.ok(evidenceSource.includes('manager-environment-evidence-table'), 'checks variant renders a table in the inspector');
    assert.ok(evidenceSource.includes('manager-environment-evidence-dimension'), 'inspector table renders the evidence dimension column');
    assert.ok(evidenceSource.includes('manager-environment-evidence-value-pill'), 'inspector table renders value pills');
    assert.ok(evidenceSource.includes('data-evidence-value-state={pill.state}'), 'inspector value pills expose matching state');
    assert.ok(evidenceSource.includes("if (variant === 'checks') return true"), 'inspector table renders all evidence dimensions');
    assert.ok(evidenceSource.includes("['safe', 'unsafe', 'hazardous', 'dangerous', 'deadly', 'extreme']"), 'danger evidence uses the canonical six-level scale');
    assert.ok(inspectorSource.includes('variant="checks"'), 'inspector requests the checks evidence variant');
  });

  it('overview danger selector uses configured danger options and preserves stale values', () => {
    assert.ok(overviewSource.includes('dangerLevelOptions'), 'overview derives danger options from configured values');
    assert.ok(overviewSource.includes('renderedDangerOptions'), 'overview inserts the current stale danger value into the rendered options');
    assert.ok(overviewSource.includes('{#each renderedDangerOptions as option (option.id)}'), 'danger select renders the derived option list');
  });

  it('manual mode renders one Available-to-add group instead of Excluded and Non-matching sections', () => {
    // The included section must never surface addable/non-matching records; those
    // belong to the Available-to-add list in manual mode.
    assert.ok(listSource.includes("entry.compositionState === 'includedByMatch'"), 'included section keys off includedByMatch');
    assert.ok(listSource.includes("entry.compositionState === 'forceIncluded'"), 'included section also surfaces force-included records');
    assert.ok(listSource.includes("availableToAddMatching"), 'manual mode has a matching available-to-add group');
    assert.ok(listSource.includes("availableToAddNonMatching"), 'manual mode has a non-matching available-to-add group');
    assert.ok(listSource.includes("availableToAddLibraryDisabled"), 'manual mode has a library-disabled available-to-add group');
    assert.ok(listSource.includes('const availableToAdd = $derived([...availableToAddMatching, ...availableToAddNonMatching, ...availableToAddLibraryDisabled])'), 'available-to-add orders matching records before non-matching and library-disabled records');
    assert.ok(listSource.includes('data-section="available-to-add"'), 'manual mode renders an Available to add section');
    assert.ok(listSource.includes('Composition.AvailableToAdd'), 'Available to add section uses localized copy');
    assert.ok(listSource.includes('Composition.NoAvailableTasksToAdd'), 'Available to add empty state uses localized copy for the tasks tab');
    assert.ok(listSource.includes('Composition.NoAvailableHazardsToAdd'), 'Available to add empty state uses localized copy for the hazards tab');
    assert.ok(!listSource.includes("entry.compositionState === 'excluded' && entry.matches === true && entry.libraryEnabled === true"), 'manual Available to add no longer treats excluded records as restorable');
    assert.ok(!listSource.includes("entry?.compositionState === 'excluded' && entry?.matches !== true"), 'manual Available to add no longer force-adds excluded records');
    assert.ok(!listSource.includes("entry?.compositionState === 'excluded' && entry?.libraryEnabled !== true"), 'manual Available to add no longer classifies excluded records');
    assert.ok(listSource.includes("{#if mode === 'manual'}"), 'Available to add is gated to manual mode');
    assert.ok(listSource.includes("{#if mode !== 'manual'}"), 'Excluded and standalone Non-matching sections do not render in manual mode');
    assert.ok(!listSource.includes("{#if kind !== 'task' && mode === 'manual'}"), 'hazard manual mode no longer keeps a separate Matching candidates section');
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

  it('inspector renders matching evidence and active drop-rate adjustment overrides', () => {
    assert.ok(inspectorSource.includes('MatchingEvidenceChips'), 'inspector should render match evidence');
    assert.ok(inspectorSource.includes('data-record-inspector-section="evidence"'), 'inspector should render the evidence section');
    assert.ok(inspectorSource.includes('variant="checks"'), 'inspector should render the detailed evidence table');
    assert.ok(inspectorSource.includes('data-record-inspector-section="overrides"'), 'inspector should render the override section');
    assert.ok(inspectorSource.includes('DropRateAdjustment'), 'override section should edit drop-rate adjustments');
    assert.ok(inspectorSource.includes('data-task-drop-rate-adjustments-toggle'), 'task overrides should expose an apply toggle');
    assert.ok(inspectorSource.includes('data-hazard-drop-rate-adjustments-toggle'), 'hazard overrides should expose an apply toggle');
    assert.ok(inspectorSource.includes('taskDropRateAdjustmentsEnabled'), 'task overrides should preserve a separate enabled state');
    assert.ok(inspectorSource.includes('hazardDropRateAdjustmentsEnabled'), 'hazard overrides should preserve a separate enabled state');
    assert.ok(inspectorSource.includes('data-drop-rate-adjustment-percent'), 'task override rows should use the custom percent input shell');
    assert.ok(inspectorSource.includes('type="text"'), 'task override rows should use text percentage input formatting');
    assert.ok(inspectorSource.includes('manager-environment-drop-adjustment-drop'), 'task override rows should render drop image/name above controls');
    assert.ok(inspectorSource.includes('manager-environment-drop-adjustment-controls'), 'task override rows should group base/input/effective/clear controls on one row');
    assert.ok(inspectorSource.includes('data-drop-rate-adjustment-base'), 'task override rows should expose base chance as its own control-row item');
    assert.ok(inspectorSource.includes('data-drop-rate-adjustment-effective'), 'task override rows should expose effective chance as its own control-row item');
    assert.ok(inspectorSource.includes('manager-environment-drop-adjustment-clear'), 'task override clear action should be an icon-only button');
    assert.ok(inspectorSource.includes('aria-label={text(\'FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.ClearAdjustment\', \'Clear\')}'), 'icon-only clear action should keep accessible copy');
    assert.ok(inspectorSource.includes('class={`manager-environment-drop-adjustment-row is-task-drop ${dropRateAdjustmentsEnabled ? \'\' : \'is-disabled\'} ${adjustmentValueClass(row.adjustment)}`}'), 'task override row card should carry positive/negative/zero state classes');
    assert.ok(inspectorSource.includes('class="manager-condition-modifier-value" data-drop-rate-adjustment-percent'), 'task override input shell should remain neutral while keeping the percent suffix');
    assert.ok(!inspectorSource.includes('class={`manager-condition-modifier-value ${adjustmentValueClass(row.adjustment)}`}'), 'task override input shell should not carry positive/negative/zero state classes');
    assert.ok(inspectorSource.includes('onTaskAdjustmentInput'), 'task override text input should preserve transient signed editing states');
    assert.ok(inspectorSource.includes('DropRateAdjustmentRange'), 'task override text input should expose its bounded range in accessible copy');
    assert.ok(!inspectorSource.includes('value={row.adjustment} aria-label={text(\'FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.DropRateAdjustment\', \'Drop-rate adjustment\')} onchange={(event) => setTaskDropAdjustment(row.id, event.currentTarget.value)}'), 'task override rows should no longer use the plain numeric adjustment input');
    assert.ok(inspectorSource.includes('Inspector.BaseChanceModifier'), 'hazard overrides should use the singular base-chance-modifier heading');
    assert.ok(inspectorSource.includes('setHazardAdjustment'), 'hazard adjustment edits should update the environment draft');
    assert.ok(inspectorSource.includes('onHazardAdjustmentInput'), 'hazard override text input should preserve transient signed editing states');
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

  it('tab badges count composition membership and split validation severities', () => {
    assert.ok(!shellSource.includes('tasks: counts.availableTasks || 0'), 'Tasks badge should not use runtime availableTasks');
    assert.ok(!shellSource.includes('hazards: counts.availableHazards || 0'), 'Hazards badge should not use runtime availableHazards');
    assert.ok(shellSource.includes('countComposedRecords(composition?.tasks)'), 'Tasks badge should derive from task composition records');
    assert.ok(shellSource.includes('countComposedRecords(composition?.hazards)'), 'Hazards badge should derive from hazard composition records');
    for (const state of ['includedByMatch', 'explicitlyIncluded', 'forceIncluded', 'includedButUnavailable']) {
      assert.ok(shellSource.includes(`'${state}'`), `composition badge count should include ${state}`);
    }
    const includedStateSet = shellSource.match(/const INCLUDED_COMPOSITION_STATES = new Set\(\[[\s\S]*?\]\);/)?.[0] || '';
    for (const state of ['excluded', 'candidate', 'notMatching', 'libraryDisabled']) {
      assert.ok(!includedStateSet.includes(`'${state}'`), `composition badge count should not include ${state}`);
    }
    assert.ok(shellSource.includes("issue.severity === 'critical'"), 'validation error badge should count critical issues');
    assert.ok(shellSource.includes("issue.severity === 'warning'"), 'validation warning badge should count warning issues');
    assert.ok(shellSource.includes("tone: 'danger'"), 'validation errors should use danger badge tone');
    assert.ok(shellSource.includes("tone: 'warning'"), 'validation warnings should use warning badge tone');
    assert.ok(shellSource.includes('label: String(errorCount)'), 'validation error badge should render only the numeric count');
    assert.ok(shellSource.includes('label: String(warningCount)'), 'validation warning badge should render only the numeric count');
    assert.ok(!shellSource.includes('BadgeError'), 'validation error badge should not use severity text');
    assert.ok(!shellSource.includes('BadgeWarning'), 'validation warning badge should not use severity text');
    assert.ok(shellSource.includes('validation: validationBadges'), 'validation badge prop should receive separate badge descriptors');
    assert.ok(tabsSource.includes('Array.isArray(value)'), 'tabs should accept multiple badges for a single tab');
    assert.ok(tabsSource.includes("if (tone === 'warning') return 'is-warning'"), 'tabs should render warning-toned badge chips');
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

  it('reports informational issues for locally excluded records', () => {
    const composition = {
      counts: { availableTasks: 1, diagnosticTasks: 2, excludedTasks: 1 },
      tasks: [
        { id: 'hidden-a', kind: 'task', compositionState: 'notMatching', record: { name: 'Forage Moonberries' } },
        { id: 'hidden-b', kind: 'task', compositionState: 'libraryDisabled', record: { name: 'Forage Brambles' } }
      ],
      hazards: []
    };
    const { issues } = evaluateEnvironmentReadiness(environment, composition);
    assert.ok(!issues.some(issue => issue.id === 'hiddenNonMatching'), 'hidden non-matching records are surfaced in the Tasks/Hazards tabs, not as validation issues');
    assert.ok(issues.some(issue => issue.id === 'locallyExcluded' && issue.severity === 'info'));
  });
});
