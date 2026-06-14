/**
 * Unit coverage for the shared interactable SOURCE enumeration (issue 335) — the
 * single Tool + Gathering-Task catalogue the Interactable browser AND the
 * Manage-Interactables promote picker both read, so the two can never drift.
 *
 * The promote-picker "No sources in this system" regression came down to the
 * picker reading a divergent path; these tests pin that a system with a Tool
 * yields a NON-EMPTY tool source list through the shared enumeration, and that the
 * task path the browser already used keeps working.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  listSystemOptions,
  listSystemTools,
  listSystemComponents,
  getSystemComponent,
  listSystemTasks,
  resolveToolName,
  listToolSourceOptions,
  listTaskSourceOptions,
} from '../../src/ui/interactableSourceLibrary.js';

/** A deps bag over an in-memory system map + gathering config. */
function deps({ systems = {}, gatheringConfig = null } = {}) {
  return {
    getCraftingSystemManager: () => ({
      getSystems: () => Object.values(systems),
      getSystem: (id) => systems[id] ?? null,
    }),
    getGatheringConfig: () => gatheringConfig,
  };
}

const HERBALIST_SYSTEM = {
  id: 'sys-herb',
  name: 'Herbalism',
  tools: [
    { id: 'tool-sickle', label: 'Herbalist Sickle', componentId: 'comp-sickle' },
    { id: 'tool-unlabeled', label: '', componentId: 'comp-knife' },
  ],
  components: [
    { id: 'comp-sickle', name: 'Iron Sickle', img: 'icons/tools/sickle.webp' },
    { id: 'comp-knife', name: 'Bone Knife', img: 'icons/tools/knife.webp' },
  ],
};

describe('interactableSourceLibrary — system + tool + task enumeration', () => {
  it('lists crafting systems as { id, name } rows', () => {
    const options = listSystemOptions(deps({ systems: { [HERBALIST_SYSTEM.id]: HERBALIST_SYSTEM } }));
    assert.deepEqual(options, [{ id: 'sys-herb', name: 'Herbalism' }]);
  });

  it('returns the raw system-owned tool library for a system', () => {
    const tools = listSystemTools(deps({ systems: { [HERBALIST_SYSTEM.id]: HERBALIST_SYSTEM } }), 'sys-herb');
    assert.equal(tools.length, 2);
    assert.equal(tools[0].id, 'tool-sickle');
  });

  it('the PROMOTE picker yields a NON-EMPTY tool source list for a system with a Tool (the No-sources fix)', () => {
    const options = listToolSourceOptions(
      deps({ systems: { [HERBALIST_SYSTEM.id]: HERBALIST_SYSTEM } }),
      'sys-herb'
    );
    assert.equal(options.length, 2, 'both tools are offered as promote sources');
    assert.deepEqual(options[0], { id: 'tool-sickle', name: 'Herbalist Sickle' });
    // An unlabeled tool falls back to its managed component's name.
    assert.deepEqual(options[1], { id: 'tool-unlabeled', name: 'Bone Knife' });
  });

  it('resolveToolName prefers label, then component name, then id', () => {
    assert.equal(resolveToolName({ id: 't', label: 'My Tool' }, { name: 'Comp' }), 'My Tool');
    assert.equal(resolveToolName({ id: 't', label: '  ' }, { name: 'Comp' }), 'Comp');
    assert.equal(resolveToolName({ id: 't', label: '' }, null), 't');
  });

  it('getSystemComponent resolves { id, name, img } and tolerates a missing id', () => {
    const d = deps({ systems: { [HERBALIST_SYSTEM.id]: HERBALIST_SYSTEM } });
    assert.deepEqual(getSystemComponent(d, 'sys-herb', 'comp-sickle'), {
      id: 'comp-sickle',
      name: 'Iron Sickle',
      img: 'icons/tools/sickle.webp',
    });
    assert.equal(getSystemComponent(d, 'sys-herb', ''), null);
    assert.equal(getSystemComponent(d, 'sys-herb', 'missing'), null);
  });

  it('lists components for a system, empty when the system is unknown', () => {
    const d = deps({ systems: { [HERBALIST_SYSTEM.id]: HERBALIST_SYSTEM } });
    assert.equal(listSystemComponents(d, 'sys-herb').length, 2);
    assert.deepEqual(listSystemComponents(d, 'nope'), []);
  });

  it('reads gathering tasks from the persisted config and offers them as sources', () => {
    const d = deps({
      gatheringConfig: { systems: { 'sys-herb': { tasks: [{ id: 'task-forage', name: 'Forage' }, { id: 'task-noname' }] } } },
    });
    assert.equal(listSystemTasks(d, 'sys-herb').length, 2);
    const options = listTaskSourceOptions(d, 'sys-herb');
    assert.deepEqual(options, [
      { id: 'task-forage', name: 'Forage' },
      { id: 'task-noname', name: 'task-noname' },
    ]);
  });

  it('returns empty lists for a falsy systemId or a missing system / manager', () => {
    assert.deepEqual(listSystemTools(deps(), ''), []);
    assert.deepEqual(listToolSourceOptions(deps(), ''), []);
    assert.deepEqual(listTaskSourceOptions(deps(), ''), []);
    assert.deepEqual(listSystemTasks(deps(), 'x'), []);
    assert.deepEqual(listSystemOptions({}), []);
    assert.deepEqual(listSystemTools({}, 'sys-herb'), []);
  });

  it('filters out tools/tasks with no id from the picker options', () => {
    const d = deps({
      systems: { s: { id: 's', name: 'S', tools: [{ id: '', label: 'ghost' }], components: [] } },
      gatheringConfig: { systems: { s: { tasks: [{ id: '', name: 'ghost task' }] } } },
    });
    assert.deepEqual(listToolSourceOptions(d, 's'), []);
    assert.deepEqual(listTaskSourceOptions(d, 's'), []);
  });
});
