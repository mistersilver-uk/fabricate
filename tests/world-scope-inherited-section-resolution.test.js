/**
 * AN INHERITING SYSTEM FOLLOWS ITS WORLD DEFAULT (issue 1372, epic 1357).
 *
 * The maintainer ruling that retires `## CraftingSystem` requirement 36's blanket claim. Before
 * it, `unionScopedDefinitions` re-spread the whole in-system record LAST, so the membership
 * record's `inherit` map decided nothing at read time: a GM who marked a section `Inherited` and
 * then edited that world default changed nothing, while the system rules editor rendered
 * `Inheriting` with a `World default: …` line and the rules list rendered an `Inherits world
 * defaults` pill. The claim was true at the instant the switch was flipped and false the moment
 * the world default moved.
 *
 * WHAT THIS FILE PINS is the whole of the new rule and both halves of its compatibility answer,
 * because the two are inseparable: the switch has to decide, AND no existing world may move.
 *
 * THE SECTION-COVERAGE ARM IS BEHAVIOURAL, NOT A KEY-SET COMPARISON. `INHERITED_SECTION_WRITERS`
 * is module-private on purpose, so the guard drives every section each scope DECLARES and asserts
 * the merged row actually changed. A section added to a scope with no writer beside it would
 * silently stop inheriting - the exact defect this change removes - and a key-set assertion over
 * an exported table would pass the moment someone added the key without a working projection.
 *
 * MUTATION PROOF. Reverting `applyInheritedSections` to a no-op reddens every arm of `the inherit
 * switch decides which layer answers a section` and the coverage arm; deleting the `inherited`
 * guard inside it reddens `an OVERRIDING section still answers from the in-system record`;
 * changing its `value === undefined` guard to a truthiness test reddens the two `clears` arms.
 * Each was run and produced `not ok` before this file was committed.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildMembershipRecord,
  SCOPE_PAYLOAD_KEYS,
} from '../src/migration/migrateWorldScopeEntities.js';
import { COMPONENT_SECTIONS, resolveComponent } from '../src/systems/componentScope.js';
import { ESSENCE_SECTIONS, resolveEssence } from '../src/systems/essenceScope.js';
import { unionScopedDefinitions } from '../src/systems/scopedDefinitionStore.js';
import { resolveTool, TOOL_SECTIONS } from '../src/systems/toolScope.js';

const SYSTEM = 'sys-a';

/** One corpus in which a world entity, a world default and a membership record all exist. */
function corpusFor(entity, worldDefault, membership) {
  return {
    entities: [entity],
    defaults: worldDefault ? [worldDefault] : [],
    membership: membership ? [membership] : [],
  };
}

/** The union's answer for ONE in-system row against ONE world half. */
function unionOne({ entityType, resolve, legacy, entity, worldDefault, inherit, extras = {} }) {
  const membership = { entityId: legacy.id, systemId: SYSTEM, inherit, ...extras };
  return unionScopedDefinitions({
    corpus: corpusFor(entity, worldDefault, membership),
    systemId: SYSTEM,
    systemDefinitions: [legacy],
    resolve,
    entityType,
  })[0];
}

/** The three entity types, with a section-authoring fixture per declared section. */
const SCOPES = Object.freeze([
  {
    entityType: 'components',
    resolve: resolveComponent,
    sections: COMPONENT_SECTIONS,
    entity: { id: 'iron', name: 'Iron' },
    // `essences` joined `category` at issue 1371 r18-store (M31), and it is read on the SHIPPED
    // field name: the in-system `Component.essences` map is exactly what the section is spelled
    // over, so its writer is an assignment, as `category`'s is.
    legacy: { id: 'iron', name: 'Iron', category: 'system-metal', essences: { iron: 2 } },
    worldValue: { category: 'world-metal', essences: { fire: 3 } },
    // What a row must READ once the section is inherited, keyed by section.
    reads: { category: (row) => row.category, essences: (row) => row.essences?.fire ?? row.essences?.iron },
    expected: { category: 'world-metal', essences: 3 },
    original: { category: 'system-metal', essences: 2 },
  },
  {
    entityType: 'essences',
    resolve: resolveEssence,
    sections: ESSENCE_SECTIONS,
    entity: { id: 'fire', name: 'Fire' },
    legacy: {
      id: 'fire',
      name: 'Fire',
      propertyMacroUuid: 'Macro.system',
      sourceComponentId: 'system-comp',
      sourceItemUuid: 'Item.system',
      associatedSystemItemId: 'system-comp',
    },
    worldValue: {
      effectSource: { sourceComponentId: 'world-comp', sourceItemUuid: 'Item.world' },
      macro: 'Macro.world',
    },
    reads: {
      effectSource: (row) => row.sourceComponentId,
      macro: (row) => row.propertyMacroUuid,
    },
    expected: { effectSource: 'world-comp', macro: 'Macro.world' },
    original: { effectSource: 'system-comp', macro: 'Macro.system' },
  },
  {
    entityType: 'tools',
    resolve: resolveTool,
    sections: TOOL_SECTIONS,
    entity: { id: 'hammer', name: 'Hammer' },
    legacy: {
      id: 'hammer',
      name: 'Hammer',
      componentId: 'anvil',
      breakage: { mode: 'system' },
      onBreak: { action: 'system' },
      // `prerequisites` and `bonus` are the two sections issue 1373 added to `TOOL_SECTIONS`,
      // and they are READ HERE ON THE SHIPPED FIELD NAMES: a normalized `Tool` carries them
      // under exactly the section name, which `toolCheckBonus.js` reads as
      // `tool.prerequisites.gateMode` and `tool.bonus.expression`. That coincidence is the
      // reason this arm exists rather than a key-set comparison — a writer guessed from the
      // section name is correct for these two and wrong for the essence's two, so only driving
      // the read can tell the two cases apart.
      prerequisites: { enabled: true, ids: ['system-prereq'], gateMode: 'bonus' },
      bonus: { enabled: true, expression: '1d4' },
    },
    worldValue: {
      breakage: { mode: 'world' },
      onBreak: { action: 'world' },
      prerequisites: { enabled: true, ids: ['world-prereq'], gateMode: 'usability' },
      bonus: { enabled: true, expression: '2d6' },
    },
    reads: {
      breakage: (row) => row.breakage?.mode,
      onBreak: (row) => row.onBreak?.action,
      prerequisites: (row) => row.prerequisites?.gateMode,
      bonus: (row) => row.bonus?.expression,
    },
    expected: {
      breakage: 'world',
      onBreak: 'world',
      prerequisites: 'usability',
      bonus: '2d6',
    },
    original: {
      breakage: 'system',
      onBreak: 'system',
      prerequisites: 'bonus',
      bonus: '1d4',
    },
  },
]);

describe('the inherit switch decides which layer answers a section', () => {
  for (const scope of SCOPES) {
    for (const section of scope.sections) {
      it(`a ${scope.entityType} row INHERITING ${section} reads the world default`, () => {
        const row = unionOne({
          entityType: scope.entityType,
          resolve: scope.resolve,
          legacy: scope.legacy,
          entity: scope.entity,
          worldDefault: { id: scope.legacy.id, ...scope.worldValue },
          inherit: Object.fromEntries(scope.sections.map((name) => [name, true])),
        });
        assert.equal(
          scope.reads[section](row),
          scope.expected[section],
          `${section} must resolve to the world default, on the SHIPPED field name`
        );
      });

      it(`a ${scope.entityType} row OVERRIDING ${section} still answers from the in-system record`, () => {
        // THE HALF THAT PROTECTS EVERY GM EDIT. No shipped editor writes a membership section
        // block, and the migration froze it at `1.30.0`, so an overriding section that answered
        // from the membership record would revert every post-migration edit on the next read.
        const row = unionOne({
          entityType: scope.entityType,
          resolve: scope.resolve,
          legacy: scope.legacy,
          entity: scope.entity,
          worldDefault: { id: scope.legacy.id, ...scope.worldValue },
          inherit: Object.fromEntries(scope.sections.map((name) => [name, false])),
        });
        assert.equal(scope.reads[section](row), scope.original[section]);
      });
    }
  }

  it('an `inherit` map that OMITS a section inherits it, matching isSectionInherited', () => {
    // The state `worldScopeActions.addToSystem` creates a record in: `inherit: {}`.
    const row = unionOne({
      entityType: 'essences',
      resolve: resolveEssence,
      legacy: { id: 'fire', name: 'Fire', propertyMacroUuid: 'Macro.system' },
      entity: { id: 'fire', name: 'Fire' },
      worldDefault: { id: 'fire', macro: 'Macro.world' },
      inherit: {},
    });
    assert.equal(row.propertyMacroUuid, 'Macro.world');
  });

  it('an inheriting section with NO world default leaves the in-system value standing', () => {
    // `The world default is unset, so this section resolves to nothing` is what the screen says,
    // and an absent world default must not blank a system that has its own value: absence at
    // world scope is the world saying nothing, never the world saying "none".
    const row = unionOne({
      entityType: 'essences',
      resolve: resolveEssence,
      legacy: { id: 'fire', name: 'Fire', propertyMacroUuid: 'Macro.system' },
      entity: { id: 'fire', name: 'Fire' },
      worldDefault: { id: 'fire' },
      inherit: { macro: true, effectSource: true },
    });
    assert.equal(row.propertyMacroUuid, 'Macro.system');
  });
});

describe('an inherited section is answered WHOLE, never per field', () => {
  it('an authored world `effectSource: {}` CLEARS an inheriting system’s three source fields', () => {
    const row = unionOne({
      entityType: 'essences',
      resolve: resolveEssence,
      legacy: {
        id: 'fire',
        sourceComponentId: 'system-comp',
        sourceItemUuid: 'Item.system',
        associatedSystemItemId: 'system-comp',
      },
      entity: { id: 'fire' },
      worldDefault: { id: 'fire', effectSource: {} },
      inherit: { effectSource: true, macro: true },
    });
    assert.equal(row.sourceComponentId, null, 'no source at world scope means NO source here');
    assert.equal(row.sourceItemUuid, null);
    assert.equal(row.associatedSystemItemId, null);
  });

  it('a world block that authors ONE source field nulls the other two', () => {
    // Per SECTION, never per field: a half-populated world block is the whole answer, and the
    // system's own `sourceItemUuid` must not survive beside a world `sourceComponentId` naming a
    // different Item.
    const row = unionOne({
      entityType: 'essences',
      resolve: resolveEssence,
      legacy: { id: 'fire', sourceComponentId: 'system-comp', sourceItemUuid: 'Item.system' },
      entity: { id: 'fire' },
      worldDefault: { id: 'fire', effectSource: { sourceComponentId: 'world-comp' } },
      inherit: { effectSource: true },
    });
    assert.equal(row.sourceComponentId, 'world-comp');
    assert.equal(row.sourceItemUuid, null);
  });

  it('an authored world `macro: null` UNLINKS an inheriting system’s macro', () => {
    // `null` is authored and `undefined` is absent. `_patchedEssenceDefinition` writes
    // `propertyMacroUuid: null` to unlink, so `null` is the shipped spelling of "no macro".
    const row = unionOne({
      entityType: 'essences',
      resolve: resolveEssence,
      legacy: { id: 'fire', propertyMacroUuid: 'Macro.system' },
      entity: { id: 'fire' },
      worldDefault: { id: 'fire', macro: null },
      inherit: { macro: true },
    });
    assert.equal(row.propertyMacroUuid, null);
  });
});

describe('the three NON-section keys are not switched by this rule', () => {
  it('`enabled` still answers from the in-system record, on an essence and on a tool', () => {
    // `enabled` has no inherit switch at any scope: `resolveScopedDefinition` emits it
    // UNCONDITIONALLY for an enableable scope, so a rule that read it here would hand every
    // GM-disabled essence and tool a frozen migration-time copy of its own flag.
    const essence = unionOne({
      entityType: 'essences',
      resolve: resolveEssence,
      legacy: { id: 'fire', enabled: false },
      entity: { id: 'fire' },
      worldDefault: { id: 'fire', macro: 'Macro.world' },
      inherit: { macro: true, effectSource: true },
      extras: { enabled: true },
    });
    assert.equal(essence.enabled, false, 'the GM-disabled in-system essence stays disabled');

    const tool = unionOne({
      entityType: 'tools',
      resolve: resolveTool,
      legacy: { id: 'hammer', enabled: false, label: 'kept' },
      entity: { id: 'hammer' },
      worldDefault: { id: 'hammer', breakage: { mode: 'world' } },
      inherit: { breakage: true, onBreak: true },
      extras: { enabled: true },
    });
    assert.equal(tool.enabled, false);
    assert.equal(tool.label, 'kept');
  });

  it('component `tags` are still additive, with no inherit switch to read', () => {
    const row = unionOne({
      entityType: 'components',
      resolve: resolveComponent,
      legacy: { id: 'iron', tags: ['forged'] },
      entity: { id: 'iron' },
      worldDefault: { id: 'iron', tags: ['world-tag'], category: 'world-metal' },
      inherit: { category: true },
    });
    assert.deepEqual(row.tags, ['forged'], 'the in-system tag list is untouched by this rule');
    assert.equal(row.category, 'world-metal', 'while the SECTION beside it does inherit');
  });

  it('tool `repairRequirements` is a SEED and never read back out of the world defaults', () => {
    const row = unionOne({
      entityType: 'tools',
      resolve: resolveTool,
      legacy: { id: 'hammer', repairRequirements: [{ id: 'system-group' }] },
      entity: { id: 'hammer' },
      worldDefault: { id: 'hammer', repairRequirements: [{ id: 'world-group' }] },
      inherit: { breakage: true, onBreak: true },
    });
    assert.deepEqual(row.repairRequirements, [{ id: 'system-group' }]);
  });
});

describe('no existing world moves, and both halves of that answer are pinned', () => {
  it('a MIGRATION-SHAPED membership record resolves every section to the in-system value', () => {
    // `buildMembershipRecord` is the migration's own builder, called here rather than
    // hand-shaped: it writes `OVERRIDING_INHERIT` - every section `false` - so every row on a
    // migrated world still answers from the in-system record whatever the world defaults say.
    // A change to that builder that started minting inheriting records reddens this.
    const legacy = {
      id: 'fire',
      name: 'Fire',
      propertyMacroUuid: 'Macro.system',
      sourceComponentId: 'system-comp',
      enabled: true,
    };
    const membership = buildMembershipRecord(legacy, 'essences', 'fire', SYSTEM);
    const row = unionScopedDefinitions({
      corpus: corpusFor(
        { id: 'fire', name: 'Fire' },
        { id: 'fire', macro: 'Macro.world', effectSource: { sourceComponentId: 'world-comp' } },
        membership
      ),
      systemId: SYSTEM,
      systemDefinitions: [legacy],
      resolve: resolveEssence,
      entityType: 'essences',
    })[0];
    assert.equal(row.propertyMacroUuid, 'Macro.system');
    assert.equal(row.sourceComponentId, 'system-comp');
    // Non-vacuity: the world default really did author both sections.
    assert.equal(row.macro, 'Macro.system', 'the resolved section reports the OVERRIDE');
  });

  it('a world that predates the membership record answers its in-system array BY REFERENCE', () => {
    const legacy = { id: 'fire', name: 'Fire', propertyMacroUuid: 'Macro.system' };
    const union = unionScopedDefinitions({
      // A world entity and a world default with NO membership record for this system: the state
      // every client is in before the `1.30.0` migration writes one for it.
      corpus: corpusFor({ id: 'fire', name: 'Fire' }, { id: 'fire', macro: 'Macro.world' }, null),
      systemId: SYSTEM,
      systemDefinitions: [legacy],
      resolve: resolveEssence,
      entityType: 'essences',
    });
    assert.equal(union[0], legacy, 'the row is the in-system record itself, not a merged copy');
  });

  it('the three scope payload keys are unchanged, so nothing re-keys a persisted setting', () => {
    assert.deepEqual(SCOPE_PAYLOAD_KEYS, {
      components: 'componentScope',
      essences: 'essenceScope',
      tools: 'toolScope',
    });
  });
});
