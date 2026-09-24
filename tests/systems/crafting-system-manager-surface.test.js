/**
 * The `CraftingSystemManager` surface, frozen at `b904771fd` before issue 1923 moved any cluster:
 * every public method's name, arity, `async`-ness and parameter shape, and a subset of the private
 * members reached from outside the class. Recorded literally, never derived at run time.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CraftingSystemManager } from '../../src/systems/CraftingSystemManager.js';
import { parseModule } from '../helpers/moduleAst.js';

/** `name: [fn.length, isAsync, shape]`; each shape letter is one parameter's node type. */
const PUBLIC_SURFACE = Object.freeze({
  resolveScopedComponents: [1, false, 'i'],
  resolveScopedEssences: [1, false, 'i'],
  resolveScopedTools: [1, false, 'i'],
  initialize: [0, true, ''],
  save: [0, true, 'd'],
  reload: [0, false, ''],
  consumeReloadDelta: [0, false, ''],
  consumeReplicatedChangeScopes: [0, false, ''],
  revision: [0, false, 'd'],
  getSystems: [0, false, ''],
  getSystem: [1, false, 'i'],
  getRecipesForSystem: [1, false, 'i'],
  getComponentsForSystem: [1, false, 'i'],
  getEssenceDefinitions: [1, false, 'i'],
  getToolsForSystem: [1, false, 'i'],
  getEssenceDefinition: [2, false, 'ii'],
  getRecipeItemDefinitions: [1, false, 'i'],
  getRecipeItemDefinition: [2, false, 'ii'],
  getRecipesUsingRecipeItemDefinition: [2, false, 'ii'],
  getItems: [1, false, 'id'],
  createSystem: [0, true, 'd'],
  addRecipeItemFromUuid: [2, true, 'ii'],
  addToolFromUuid: [2, true, 'ii'],
  upsertTool: [1, true, 'idd'],
  deleteTool: [2, true, 'ii'],
  deleteRecipeItemDefinition: [2, true, 'ii'],
  updateRecipeItemDefinition: [2, true, 'iid'],
  updateSystem: [1, true, 'id'],
  deleteSystem: [1, true, 'i'],
  createItem: [1, true, 'id'],
  getRecipeItemDefinitionsContaining: [2, false, 'ii'],
  autoStampRecipeItemSources: [0, true, ''],
  autoStampComponentSources: [0, true, ''],
  autoStampToolSources: [0, true, ''],
  repairItemData: [0, true, 'd'],
  addItemFromUuid: [2, true, 'iid'],
  replaceItemSource: [3, true, 'iii'],
  addItemsFromPack: [2, true, 'ii'],
  refreshComponentMetadataForUpdatedItem: [1, true, 'id'],
  updateItem: [2, true, 'iid'],
  applyBulkEditToComponents: [2, true, 'iidd'],
  applyBulkEditToRecipes: [2, true, 'iid'],
  deleteRecipes: [2, true, 'iid'],
  deleteItem: [2, true, 'ii'],
  deleteComponents: [2, true, 'ii'],
  deleteEssence: [2, true, 'iid'],
  applyBulkEditToEssences: [2, true, 'iid'],
  deleteEssences: [2, true, 'iid'],
});

const PARAM_CODES = Object.freeze({
  Identifier: 'i',
  AssignmentPattern: 'd',
  ObjectPattern: 'o',
  RestElement: 'r',
});

const PRIVATE_SUBSET = Object.freeze([
  '_characterLibraryBasis',
  '_scopeBasis',
  '_assertGM',
  '_componentRoleFlagKey',
  '_toolRoleFlagKey',
  '_recipeItemRoleFlagKey',
  '_normalizeSystem',
  '_normalizeTool',
  '_normalizeToolPrerequisites',
  '_normalizeToolRequirement',
  '_normalizeToolBreakage',
  '_normalizeToolOnBreak',
  '_normalizeFeatures',
  '_normalizeVisibilityMode',
  '_normalizeRecipeVisibility',
  '_normalizeTeaserConfig',
  '_normalizeRequirements',
  '_normalizeCurrencyConfig',
  '_normalizeStringList',
  '_normalizeAlchemyConfig',
  '_normalizeFailureResultPolicy',
  '_normalizeCraftingCheck',
  '_normalizeCheckModifierSelection',
  '_normalizeSimpleCraftingCheck',
  '_normalizeProgressiveCraftingCheck',
  '_normalizeSimpleTier',
  '_convertDiceCritsToTriggers',
  '_normalizeRoutedCraftingCheck',
  '_normalizeRoutedOutcome',
  '_normalizeUnifiedTriggers',
  '_convertNatSteppingToTriggers',
  '_normalizeCheckBreakage',
  '_normalizeUnifiedTrigger',
  '_normalizeTierStep',
  '_normalizeSalvageCraftingCheck',
  '_normalizeGatheringCraftingCheck',
  '_normalizeEssenceDefinitions',
  '_normalizeEssenceDefinition',
  '_looksLikeDocumentUuid',
  '_toKey',
  '_normalizeEssenceQuantities',
  '_normalizeRecipeItemDefinitions',
  '_normalizeRecipeItemCaps',
  '_normalizeRecipeItemDefinition',
  '_labelFromUuid',
  '_normalizeComponentDescription',
  '_plainTextDescription',
  '_descriptionTextCandidate',
  '_sourceSnapshotCollaborators',
  '_extractSourceDescription',
  '_buildComponentSourceSnapshot',
  '_buildRecipeItemSourceSnapshot',
  '_buildToolSourceSnapshot',
  '_buildFallbackSourceReferences',
  '_normalizeComponent',
  '_salvageNormalizationContext',
  '_normalizeSalvage',
  '_normalizeToolIds',
  '_normalizeSalvageResult',
  '_normalizeSalvageResultGroup',
  '_normalizeTimeRequirement',
  '_normalizeCurrencyRequirement',
  '_advanceFactScopes',
  '_attributeChange',
  '_domainsForSystemEdit',
  '_migrateLegacyRecipeItems',
  '_seedMembershipFromLegacyScalars',
  '_migrateRecipesForModeChange',
  '_assertNoAlchemySignatureCollisions',
  '_cleanupSystemScopedState',
  '_notifySystemsChanged',
  '_resolveImportedComponentSourceData',
  '_getRecipeObjectsReferencingRecipeItemDefinition',
  '_assertUniqueComponentSources',
  '_assertUniqueComponentSourcesForSystem',
  '_sameSourceReferenceSet',
  '_sourceIdentityCollaborators',
  '_stampSourceIdentity',
  '_clearSourceFlag',
  '_findRecipeItemDefinitionForSource',
  '_deleteRecipeSet',
  '_deleteComponentSet',
  '_stripComponentsFromRecipes',
  '_reconcileAlchemySignaturesAfterDeletion',
  '_recipeReferencesComponent',
  '_stripEssenceFromSets',
  '_getResolutionModeService',
  '_getSalvageRunManager',
  '_disableInvalidSalvageConfigs',
  '_cleanupSalvageRunsForSystem',
  '_cleanupSalvageRunsForComponent',
  '_cleanupCraftingPreferences',
]);

function parameterShape(fn) {
  const { ast } = parseModule(`class Probe { ${fn.toString()} }`);
  const [method] = ast.body[0].body.body;
  return method.value.params.map((param) => PARAM_CODES[param.type] ?? '?').join('');
}

function isAsync(fn) {
  return Object.prototype.toString.call(fn) === '[object AsyncFunction]';
}

/** Every way `Class` departs from the frozen surface, as `kind: name` strings. */
function surfaceFailures(Class) {
  const proto = Class.prototype;
  const names = Object.getOwnPropertyNames(proto);
  const publicNames = names.filter((name) => name !== 'constructor' && !name.startsWith('_'));
  const failures = [];
  for (const name of Object.keys(PUBLIC_SURFACE)) {
    if (!publicNames.includes(name)) failures.push(`missing: ${name}`);
  }
  for (const name of publicNames) {
    if (!Object.hasOwn(PUBLIC_SURFACE, name)) failures.push(`unexpected: ${name}`);
  }
  for (const [name, [length, async, shape]] of Object.entries(PUBLIC_SURFACE)) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, name);
    if (!descriptor) continue;
    const fn = descriptor.value;
    if (typeof fn !== 'function' || descriptor.get || descriptor.set) {
      failures.push(`descriptor: ${name}`);
      continue;
    }
    if (fn.length !== length) failures.push(`length: ${name}`);
    if (isAsync(fn) !== async) failures.push(`async: ${name}`);
    if (parameterShape(fn) !== shape) failures.push(`params: ${name}`);
  }
  for (const name of PRIVATE_SUBSET) {
    if (typeof proto[name] !== 'function') failures.push(`private: ${name}`);
  }
  return failures;
}

/** A copy of the real prototype with one mutation applied, so each probe perturbs one fact. */
function mutatedClass(mutate) {
  class Fake {}
  const source = CraftingSystemManager.prototype;
  for (const name of Object.getOwnPropertyNames(source)) {
    if (name === 'constructor') continue;
    Object.defineProperty(Fake.prototype, name, Object.getOwnPropertyDescriptor(source, name));
  }
  mutate(Fake.prototype);
  return Fake;
}

const replacement = (name, holder) => Object.getOwnPropertyDescriptor(holder.prototype, name);

describe('the CraftingSystemManager surface', () => {
  it('pins 48 public and 92 private names', () => {
    assert.equal(Object.keys(PUBLIC_SURFACE).length, 48);
    assert.equal(new Set(PRIVATE_SUBSET).size, 92);
  });

  it('matches the frozen surface exactly', () => {
    assert.deepEqual(surfaceFailures(CraftingSystemManager), []);
  });

  it('reds on a removed public method', () => {
    const Fake = mutatedClass((proto) => delete proto.deleteTool);
    assert.deepEqual(surfaceFailures(Fake), ['missing: deleteTool']);
  });

  it('reds on a renamed public method', () => {
    const Fake = mutatedClass((proto) => {
      Object.defineProperty(proto, 'removeTool', Object.getOwnPropertyDescriptor(proto, 'deleteTool'));
      delete proto.deleteTool;
    });
    assert.deepEqual(surfaceFailures(Fake), ['missing: deleteTool', 'unexpected: removeTool']);
  });

  it('reds on a changed arity', () => {
    class Holder {
      getSystem() {}
    }
    const Fake = mutatedClass((proto) => {
      Object.defineProperty(proto, 'getSystem', replacement('getSystem', Holder));
    });
    assert.deepEqual(surfaceFailures(Fake), ['length: getSystem', 'params: getSystem']);
  });

  it('reds on a lost async', () => {
    class Holder {
      deleteTool(systemId, toolId) {
        return [systemId, toolId];
      }
    }
    const Fake = mutatedClass((proto) => {
      Object.defineProperty(proto, 'deleteTool', replacement('deleteTool', Holder));
    });
    assert.deepEqual(surfaceFailures(Fake), ['async: deleteTool']);
  });

  it('reds on a dropped trailing default parameter at an unchanged arity', () => {
    class Holder {
      async upsertTool(systemId, tool = {}) {
        return [systemId, tool];
      }
    }
    const Fake = mutatedClass((proto) => {
      Object.defineProperty(proto, 'upsertTool', replacement('upsertTool', Holder));
    });
    assert.deepEqual(surfaceFailures(Fake), ['params: upsertTool']);
  });

  it('reds on an accessor where a method stood', () => {
    const Fake = mutatedClass((proto) => {
      Object.defineProperty(proto, 'getSystems', { get: () => () => [], configurable: true });
    });
    assert.deepEqual(surfaceFailures(Fake), ['descriptor: getSystems']);
  });

  it('reds on a removed private member', () => {
    const Fake = mutatedClass((proto) => delete proto._deleteRecipeSet);
    assert.deepEqual(surfaceFailures(Fake), ['private: _deleteRecipeSet']);
  });
});
