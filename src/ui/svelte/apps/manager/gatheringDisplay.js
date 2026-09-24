/**
 * The gathering studio's pure presenters: names, images, labels, facts, drop-rate tiers and the
 * signed condition-modifier value. Copy takes the shell's `text`, and every state a presenter
 * reads is an argument, so the gathering route model binds them to the selected system.
 */
import {
  DEFAULT_GATHERING_ENVIRONMENT_IMG,
  DEFAULT_GATHERING_TASK_IMG,
} from '../../../../gatheringImageDefaults.js';
import { activeEnvironmentsForRecord } from '../../../../systems/gatheringComposition.js';
import { dropRateTierClass, dropRateTierColor } from '../../util/dropRateTier.js';

const INSPECTOR_DESCRIPTION_LIMIT = 160;

const DANGER_LEVEL_ORDER = ['safe', 'unsafe', 'hazardous', 'dangerous', 'deadly', 'extreme'];

const FALLBACK_DROP_IMG = 'icons/svg/item-bag.svg';

export function gatheringModifierSignedValue(modifier) {
  return (modifier?.operator === '-' ? -1 : 1) * Math.abs(Math.trunc(Number(modifier?.value || 0)));
}

export function gatheringModifierValueClass(modifier) {
  const signed = gatheringModifierSignedValue(modifier);
  if (signed > 0) return 'is-positive';
  if (signed < 0) return 'is-negative';
  return 'is-zero';
}

export function gatheringModifierDisplayValue(modifier) {
  const value = Math.abs(Math.trunc(Number(modifier?.value || 0)));
  if (modifier?.operator === '-') return value > 0 ? `-${value}` : '-';
  return value > 0 ? `+${value}` : '0';
}

export function signedToOperatorValue(raw) {
  const text = String(raw ?? '');
  const negative = text.trim().startsWith('-');
  const digits = text.replaceAll(/[^0-9]/g, '');
  const value = digits === '' ? 0 : Math.abs(Math.trunc(Number(digits)));
  return { operator: negative ? '-' : '+', value };
}

export function truncateDescription(description) {
  if (typeof description !== 'string') return '';
  const trimmed = description.trim();
  if (trimmed.length <= INSPECTOR_DESCRIPTION_LIMIT) return trimmed;
  return `${trimmed.slice(0, INSPECTOR_DESCRIPTION_LIMIT).trimEnd()}…`;
}

export function environmentName(environment, text) {
  const explicitName = typeof environment?.name === 'string' ? environment.name.trim() : '';
  if (explicitName) return explicitName;
  return text('FABRICATE.Admin.Environments.NewDraftTitle', 'New Gathering Environment');
}

function linkedSceneForEnvironment(environment, sceneOptions) {
  const sceneUuid = environment?.sceneUuid || '';
  if (!sceneUuid) return null;
  return (sceneOptions || []).find((scene) => scene.uuid === sceneUuid) || null;
}

export function environmentSceneImage(environment, sceneOptions) {
  const linkedScene = linkedSceneForEnvironment(environment, sceneOptions);
  return linkedScene?.img || linkedScene?.thumbnail || linkedScene?.thumb || '';
}

export function environmentImage(environment, sceneOptions) {
  // A linked scene's thumbnail takes the place of the environment's own image; the stored
  // `img` is kept as a fallback for when the scene is unlinked.
  const sceneImage = environmentSceneImage(environment, sceneOptions);
  if (sceneImage) return sceneImage;
  return String(environment?.img || '').trim() || DEFAULT_GATHERING_ENVIRONMENT_IMG;
}

export function hasEnvironmentImage(environment, sceneOptions) {
  return Boolean(
    environmentSceneImage(environment, sceneOptions) || String(environment?.img || '').trim()
  );
}

export function environmentSelectionModeLabel(environment, text) {
  return environment?.selectionMode === 'blind'
    ? text('FABRICATE.Admin.Environments.SelectionBlind', 'Blind')
    : text('FABRICATE.Admin.Environments.SelectionTargeted', 'Targeted');
}

export function environmentStatusLabel(environment, text) {
  return environment?.enabled === false
    ? text('FABRICATE.Admin.Manager.StatusDisabled', 'Disabled')
    : text('FABRICATE.Admin.Manager.StatusActive', 'Active');
}

export function environmentSceneState(environment, sceneOptions, text) {
  if (!environment?.sceneUuid) {
    return {
      id: 'none',
      label: text('FABRICATE.Admin.Manager.Environment.SceneNone', 'No scene'),
      tone: 'disabled',
    };
  }
  const scene = linkedSceneForEnvironment(environment, sceneOptions);
  if (!scene) {
    return {
      id: 'missing',
      label: text('FABRICATE.Admin.Manager.Environment.SceneMissing', 'Scene unresolved'),
      tone: 'warning',
    };
  }
  return {
    id: 'linked',
    label: text('FABRICATE.Admin.Manager.Environment.SceneLinked', 'Linked scene'),
    name: scene.name || environment.sceneUuid,
    tone: 'active',
  };
}

/** One of the three environment inspector counts, as the store computed it. */
function environmentStoredCount(taskCounts, environment, key) {
  const stored = taskCounts?.[String(environment?.id || '')]?.[key];
  return Number.isFinite(stored) ? stored : 0;
}

export function environmentFacts(environment, taskCounts, text) {
  if (!environment) return [];
  return [
    {
      id: 'tasks',
      label: text('FABRICATE.Admin.Environments.Tasks', 'Tasks'),
      value: environmentStoredCount(taskCounts, environment, 'availableTaskCount'),
    },
    {
      id: 'events',
      label: text('FABRICATE.Admin.Environments.Events', 'Events'),
      value: environmentStoredCount(taskCounts, environment, 'availableEventCount'),
    },
    {
      id: 'required-tools',
      label: text('FABRICATE.Admin.Environments.RequiredTools', 'Required tools'),
      value: environmentStoredCount(taskCounts, environment, 'requiredToolCount'),
    },
    {
      id: 'mode',
      label: text('FABRICATE.Admin.Environments.SelectionMode', 'Selection mode'),
      value: environmentSelectionModeLabel(environment, text),
    },
  ];
}

export function environmentDirtyFor(environment, viewState) {
  return (
    environment?.id &&
    viewState?.environmentDraft?.id === environment.id &&
    viewState?.environmentDraftDirty === true
  );
}

export function environmentInvalidFor(environment, viewState, validationCount) {
  return (
    environment?.id && viewState?.environmentDraft?.id === environment.id && validationCount > 0
  );
}

export function gatheringTaskName(task, text) {
  return String(
    task?.name ||
      text('FABRICATE.Admin.Manager.Environment.Tasks.UnnamedTask', 'Unnamed gathering task')
  ).trim();
}

export function gatheringTaskImage(task) {
  return task?.img || DEFAULT_GATHERING_TASK_IMG;
}

export function gatheringTaskDropRows(task) {
  return Array.isArray(task?.dropRows) ? task.dropRows : [];
}

function managedItem(managedItemOptions, componentId) {
  return (managedItemOptions || []).find(
    (option) => String(option.id || '') === String(componentId || '')
  );
}

export function gatheringDropName(row, managedItemOptions, text) {
  return (
    row?.name ||
    managedItem(managedItemOptions, row?.componentId)?.name ||
    row?.componentId ||
    row?.itemUuid ||
    text('FABRICATE.Admin.Manager.Environment.Tasks.UnresolvedDrop', 'Unresolved drop')
  );
}

export function gatheringDropImage(row, managedItemOptions) {
  return row?.img || managedItem(managedItemOptions, row?.componentId)?.img || FALLBACK_DROP_IMG;
}

/** A vocabulary's values in the selected system's gathering config, or none. */
export function gatheringVocabularyValues(systemConfig, kind) {
  const values = systemConfig?.vocabularies?.[kind]?.values;
  return Array.isArray(values) ? values : [];
}

function optionLabel(options, id) {
  const option = options.find((value) => String(value?.id || value) === String(id || ''));
  return String(option?.label || option?.id || id || '').trim();
}

export function gatheringConditionLabel(kind, id, systemConfig) {
  if (kind === 'biome') {
    return optionLabel(gatheringVocabularyValues(systemConfig, 'biomes'), id) || String(id || '');
  }
  const setting = systemConfig?.conditions?.[kind] || {};
  return optionLabel(Array.isArray(setting.values) ? setting.values : [], id);
}

export function gatheringModifierKindIcon(kind, conditionId, systemConfig) {
  if (kind === 'weather') return 'fas fa-cloud-sun';
  if (kind === 'timeOfDay') return 'fas fa-clock';
  const option = gatheringVocabularyValues(systemConfig, 'biomes').find(
    (value) => String(value?.id || value) === String(conditionId || '')
  );
  return String(option?.icon || '').trim() || 'fas fa-mountain-sun';
}

export function gatheringModifierCardTitle(kind, scope, text) {
  if (kind === 'biome') {
    return scope === 'event'
      ? text('FABRICATE.Admin.Manager.Environment.Events.BiomeModifiers', 'Biome modifiers')
      : text('FABRICATE.Admin.Manager.Environment.Tasks.BiomeModifiers', 'Biome modifiers');
  }
  if (kind === 'weather')
    return text('FABRICATE.Admin.Manager.Environment.Tasks.WeatherModifiers', 'Weather modifiers');
  return text('FABRICATE.Admin.Manager.Environment.Tasks.TimeModifiers', 'Time modifiers');
}

export function gatheringModifierCardHint(kind, scope, text) {
  const event = scope === 'event';
  if (kind === 'biome') {
    return event
      ? text(
          'FABRICATE.Admin.Manager.Environment.Events.BiomeModifiersHint',
          "Adjust this event's chance based on the gathering environment's biomes."
        )
      : text(
          'FABRICATE.Admin.Manager.Environment.Tasks.BiomeModifiersHint',
          "Adjust this drop's chance based on the gathering environment's biomes."
        );
  }
  if (kind === 'weather') {
    return event
      ? text(
          'FABRICATE.Admin.Manager.Environment.Events.WeatherModifiersHint',
          "Adjust this event's chance based on the active weather condition."
        )
      : text(
          'FABRICATE.Admin.Manager.Environment.Tasks.WeatherModifiersHint',
          "Adjust this drop's chance based on the active weather condition."
        );
  }
  return event
    ? text(
        'FABRICATE.Admin.Manager.Environment.Events.TimeModifiersHint',
        "Adjust this event's chance based on the active time of day."
      )
    : text(
        'FABRICATE.Admin.Manager.Environment.Tasks.TimeModifiersHint',
        "Adjust this drop's chance based on the active time of day."
      );
}

function clampedInteger(raw, min, max) {
  const number = Math.trunc(Number(raw ?? 1));
  if (!Number.isFinite(number)) return 1;
  return Math.min(max, Math.max(min, number));
}

export function gatheringDropRateValue(row) {
  return clampedInteger(row?.dropRate, 0, 100);
}

export function gatheringDropCountValue(row) {
  return clampedInteger(row?.quantity, 1, 999);
}

// An absent rate reads as 1%, not 0%, so it takes the legendary tier rather than none.
export function gatheringDropRateTierClass(value) {
  return dropRateTierClass(gatheringDropRateValue({ dropRate: value }));
}

export function gatheringDropRateTierColor(value) {
  return dropRateTierColor(gatheringDropRateValue({ dropRate: value }));
}

function conditionList(task, kind, conditionLabel, anyText) {
  const values = Array.isArray(task?.[kind]) ? task[kind] : [];
  if (values.length === 0) return anyText;
  return values
    .map((id) => conditionLabel(kind, id))
    .filter(Boolean)
    .join(', ');
}

export function gatheringTaskAvailability(task, conditionLabel, text) {
  const times = conditionList(
    task,
    'timeOfDay',
    conditionLabel,
    text('FABRICATE.Admin.Manager.Environment.Tasks.AnyTime', 'Any time')
  );
  const weather = conditionList(
    task,
    'weather',
    conditionLabel,
    text('FABRICATE.Admin.Manager.Environment.Tasks.AnyWeather', 'Any weather')
  );
  return `${times}, ${weather}`;
}

export function sortedDangerTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [...tags].sort((a, b) => {
    const ai = DANGER_LEVEL_ORDER.indexOf(a);
    const bi = DANGER_LEVEL_ORDER.indexOf(b);
    const aRank = ai === -1 ? DANGER_LEVEL_ORDER.length : ai;
    const bRank = bi === -1 ? DANGER_LEVEL_ORDER.length : bi;
    if (aRank !== bRank) return aRank - bRank;
    return String(a).localeCompare(String(b));
  });
}

/** The selected system's environments whose `idsKey` list names the record. */
function referencingEnvironments(record, environments, systemId, idsKey) {
  if (!record?.id) return [];
  const recordId = String(record.id);
  return environments.filter((environment) => {
    if (String(environment?.craftingSystemId || '') !== String(systemId || '')) return false;
    const enabledIds = Array.isArray(environment?.[idsKey]) ? environment[idsKey].map(String) : [];
    return enabledIds.includes(recordId);
  });
}

export function gatheringTaskReferencingEnvironments(task, environments, systemId) {
  return referencingEnvironments(task, environments, systemId, 'enabledTaskIds');
}

export function gatheringEventReferencingEnvironments(event, environments, systemId) {
  return referencingEnvironments(event, environments, systemId, 'enabledEventIds');
}

/**
 * How many enabled environments of the selected system a library record is active in right now.
 * `unownedSystemId` is the system an environment with no `craftingSystemId` counts as: tasks
 * count such an environment as the selected system's, events count it as no system's.
 */
export function activeEnvironmentCount(record, kind, scope) {
  const { environments, systemId, unownedSystemId, conditionSettings } = scope;
  const scoped = environments.filter(
    (environment) =>
      environment?.enabled !== false &&
      String(environment?.craftingSystemId || unownedSystemId) === String(systemId || '')
  );
  return activeEnvironmentsForRecord(record, scoped, kind, { conditionSettings }).length;
}
