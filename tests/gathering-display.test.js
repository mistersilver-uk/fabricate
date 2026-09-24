/** The gathering studio's pure presenters: images, drop-rate tiers, environment usage and copy. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_GATHERING_ENVIRONMENT_IMG,
  DEFAULT_GATHERING_TASK_IMG,
} from '../src/gatheringImageDefaults.js';
import {
  activeEnvironmentCount,
  environmentFacts,
  environmentImage,
  environmentSceneState,
  gatheringConditionLabel,
  gatheringDropCountValue,
  gatheringDropImage,
  gatheringDropName,
  gatheringDropRateTierClass,
  gatheringDropRateTierColor,
  gatheringEventReferencingEnvironments,
  gatheringModifierCardHint,
  gatheringModifierCardTitle,
  gatheringModifierDisplayValue,
  gatheringModifierValueClass,
  gatheringTaskAvailability,
  gatheringTaskImage,
  gatheringTaskReferencingEnvironments,
  hasEnvironmentImage,
  signedToOperatorValue,
  sortedDangerTags,
  truncateDescription,
} from '../src/ui/svelte/apps/manager/gatheringDisplay.js';

/** Echo the fallback, so an assertion reads the copy a caller would render untranslated. */
const text = (_key, fallback) => fallback;

describe('gathering images', () => {
  const sceneOptions = [{ uuid: 'Scene.a', img: 'scenes/a.webp', name: 'Glade' }];

  it('falls an environment back to the shared default, behind a linked scene and its own image', () => {
    assert.equal(environmentImage({}, sceneOptions), DEFAULT_GATHERING_ENVIRONMENT_IMG);
    assert.equal(environmentImage({ img: '  ' }, sceneOptions), DEFAULT_GATHERING_ENVIRONMENT_IMG);
    assert.equal(environmentImage({ img: 'own.webp' }, sceneOptions), 'own.webp');
    assert.equal(
      environmentImage({ img: 'own.webp', sceneUuid: 'Scene.a' }, sceneOptions),
      'scenes/a.webp',
      'a linked scene takes the place of the stored image'
    );
    assert.equal(
      environmentImage({ img: 'own.webp', sceneUuid: 'Scene.gone' }, sceneOptions),
      'own.webp',
      'an unresolved scene leaves the stored image in place'
    );
    assert.equal(hasEnvironmentImage({}, sceneOptions), false);
    assert.equal(hasEnvironmentImage({ sceneUuid: 'Scene.a' }, sceneOptions), true);
  });

  it('falls a task back to the shared default', () => {
    assert.equal(gatheringTaskImage({}), DEFAULT_GATHERING_TASK_IMG);
    assert.equal(gatheringTaskImage(null), DEFAULT_GATHERING_TASK_IMG);
    assert.equal(gatheringTaskImage({ img: 'task.webp' }), 'task.webp');
  });

  it('names and pictures a drop from its row before its managed item', () => {
    const items = [{ id: 'c1', name: 'Moonleaf', img: 'moonleaf.webp' }];
    assert.equal(gatheringDropName({ componentId: 'c1' }, items, text), 'Moonleaf');
    assert.equal(gatheringDropName({ name: 'Own', componentId: 'c1' }, items, text), 'Own');
    assert.equal(gatheringDropName({ componentId: 'c9' }, items, text), 'c9');
    assert.equal(gatheringDropName({}, items, text), 'Unresolved drop');
    assert.equal(gatheringDropImage({ componentId: 'c1' }, items), 'moonleaf.webp');
    assert.equal(gatheringDropImage({ componentId: 'c9' }, items), 'icons/svg/item-bag.svg');
  });
});

describe('drop-rate tiers', () => {
  // Each boundary and the value just below it, so a moved threshold is caught on either side.
  const BOUNDARIES = [
    [0, 'none'],
    [1, 'legendary'],
    [4, 'legendary'],
    [5, 'very-rare'],
    [14, 'very-rare'],
    [15, 'rare'],
    [34, 'rare'],
    [35, 'uncommon'],
    [69, 'uncommon'],
    [70, 'common'],
    [99, 'common'],
    [100, 'guaranteed'],
    [250, 'guaranteed'],
    [-5, 'none'],
  ];

  for (const [rate, tier] of BOUNDARIES) {
    it(`reads ${rate}% as ${tier}`, () => {
      assert.equal(gatheringDropRateTierClass(rate), `is-${tier}`);
      assert.equal(gatheringDropRateTierColor(rate), `var(--fab-drop-rate-${tier})`);
    });
  }

  it('reads an absent rate as 1%, so it takes the legendary tier', () => {
    assert.equal(gatheringDropRateTierClass(undefined), 'is-legendary');
    assert.equal(gatheringDropRateTierColor(null), 'var(--fab-drop-rate-legendary)');
  });

  it('clamps a drop count to 1..999', () => {
    assert.equal(gatheringDropCountValue({ quantity: 0 }), 1);
    assert.equal(gatheringDropCountValue({ quantity: 1200 }), 999);
    assert.equal(gatheringDropCountValue({ quantity: 'x' }), 1);
    assert.equal(gatheringDropCountValue({}), 1);
  });
});

describe('environment usage', () => {
  const environments = [
    { id: 'e1', craftingSystemId: 'alchemy', enabledTaskIds: ['t1'], enabledEventIds: ['v1'] },
    { id: 'e2', craftingSystemId: 'alchemy', enabledTaskIds: ['t2'], enabledEventIds: ['t1'] },
    { id: 'e3', craftingSystemId: 'smithing', enabledTaskIds: ['t1'], enabledEventIds: ['v1'] },
  ];
  const ids = (list) => list.map((environment) => environment.id);

  it('reads a task’s environments from enabledTaskIds within the selected system', () => {
    assert.deepEqual(ids(gatheringTaskReferencingEnvironments({ id: 't1' }, environments, 'alchemy')), ['e1']);
    assert.deepEqual(gatheringTaskReferencingEnvironments({}, environments, 'alchemy'), []);
  });

  it('reads an event’s environments from enabledEventIds within the selected system', () => {
    assert.deepEqual(ids(gatheringEventReferencingEnvironments({ id: 'v1' }, environments, 'alchemy')), ['e1']);
    assert.deepEqual(ids(gatheringEventReferencingEnvironments({ id: 't1' }, environments, 'alchemy')), ['e2']);
  });

  it('counts an environment with no system as the unowned system’s', () => {
    const scoped = [
      { id: 'unowned', enabled: true },
      { id: 'owned', enabled: true, craftingSystemId: 'alchemy' },
      { id: 'off', enabled: false, craftingSystemId: 'alchemy' },
      { id: 'other', enabled: true, craftingSystemId: 'smithing' },
    ];
    const count = (unownedSystemId) =>
      activeEnvironmentCount({ id: 'r', enabled: true }, 'task', {
        environments: scoped,
        systemId: 'alchemy',
        unownedSystemId,
      });
    assert.equal(count('alchemy'), 2, 'owned by the selected system, it counts');
    assert.equal(count(''), 1, 'owned by no system, it does not');
  });
});

describe('gathering copy', () => {
  it('truncates a description past 160 characters', () => {
    const exact = 'a'.repeat(160);
    assert.equal(truncateDescription(`  ${exact}  `), exact);
    assert.equal(truncateDescription(`${'a'.repeat(159)} b`), `${'a'.repeat(159)}…`);
    assert.equal(truncateDescription('a'.repeat(161)), `${'a'.repeat(160)}…`);
    assert.equal(truncateDescription(null), '');
  });

  it('labels a condition from the system vocabulary or its condition values', () => {
    const config = {
      vocabularies: { biomes: { values: [{ id: 'forest', label: 'Moon Forest' }] } },
      conditions: { weather: { values: [{ id: 'rain', label: 'Storm Rain' }] } },
    };
    assert.equal(gatheringConditionLabel('biome', 'forest', config), 'Moon Forest');
    assert.equal(gatheringConditionLabel('biome', 'cave', config), 'cave');
    assert.equal(gatheringConditionLabel('weather', 'rain', config), 'Storm Rain');
    const label = (kind, id) => gatheringConditionLabel(kind, id, config);
    assert.equal(
      gatheringTaskAvailability({ timeOfDay: [], weather: ['rain'] }, label, text),
      'Any time, Storm Rain'
    );
  });

  it('states environment facts and the scene state in the shell’s copy', () => {
    const counts = { e1: { availableTaskCount: 3, availableEventCount: 2, requiredToolCount: 1 } };
    assert.deepEqual(
      environmentFacts({ id: 'e1', selectionMode: 'blind' }, counts, text).map((fact) => fact.value),
      [3, 2, 1, 'Blind']
    );
    assert.equal(environmentSceneState({}, [], text).id, 'none');
    assert.equal(environmentSceneState({ sceneUuid: 'Scene.x' }, [], text).id, 'missing');
  });

  // Titles differ by scope only for biomes; every hint differs by scope.
  const CARD_COPY = [
    ['task', 'biome', 'Tasks.BiomeModifiers', 'Tasks.BiomeModifiersHint'],
    ['task', 'weather', 'Tasks.WeatherModifiers', 'Tasks.WeatherModifiersHint'],
    ['task', 'timeOfDay', 'Tasks.TimeModifiers', 'Tasks.TimeModifiersHint'],
    ['event', 'biome', 'Events.BiomeModifiers', 'Events.BiomeModifiersHint'],
    ['event', 'weather', 'Tasks.WeatherModifiers', 'Events.WeatherModifiersHint'],
    ['event', 'timeOfDay', 'Tasks.TimeModifiers', 'Events.TimeModifiersHint'],
  ];
  for (const [scope, kind, title, hint] of CARD_COPY) {
    it(`titles and hints the ${scope} ${kind} modifier card`, () => {
      const key = (spelled) => spelled;
      const prefix = 'FABRICATE.Admin.Manager.Environment.';
      assert.equal(gatheringModifierCardTitle(kind, scope, key), `${prefix}${title}`);
      assert.equal(gatheringModifierCardHint(kind, scope, key), `${prefix}${hint}`);
    });
  }

  it('signs a condition modifier value and splits a signed entry back', () => {
    assert.equal(gatheringModifierValueClass({ operator: '-', value: 3 }), 'is-negative');
    assert.equal(gatheringModifierValueClass({ value: 0 }), 'is-zero');
    assert.equal(gatheringModifierDisplayValue({ operator: '-', value: 0 }), '-');
    assert.equal(gatheringModifierDisplayValue({ value: 12 }), '+12');
    assert.deepEqual(signedToOperatorValue(' -15%'), { operator: '-', value: 15 });
    assert.deepEqual(sortedDangerTags(['deadly', 'zzz', 'safe']), ['safe', 'deadly', 'zzz']);
  });
});
