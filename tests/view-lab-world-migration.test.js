/**
 * The lab world is not the world the lab renders: it is MIGRATED first, and the frames photograph
 * the result.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { MigrationRunner } from '../src/migration/MigrationRunner.js';
import { buildWorldScopeEntityNotice } from '../src/systems/worldScopeEntityNotice.js';
import {
  policyDefersSelection,
  resolveMaxModifierPicks,
} from '../src/systems/checkModifierResolver.js';
import { resolveComponentScope } from '../src/systems/componentScope.js';
import { composeStartupPassList } from '../src/systems/startupPassComposition.js';
import { buildLabContent, LAB_SYSTEM_IDS } from './view-lab/world/labContent.js';

/**
 * Run the real startup migration pass over the lab fixtures, exactly as a lab build does.
 *
 * @returns {Promise<{ before: object, after: object, summary: object }>} The seeded and migrated
 * worlds, plus the runner summary carrying the transient world-scope report.
 */
async function migrateLabWorld() {
  const content = buildLabContent();
  const before = {
    recipes: structuredClone(content.recipes),
    craftingSystems: structuredClone(content.systems),
    gatheringConfig: structuredClone(content.gatheringConfig),
    gatheringEnvironments: structuredClone(content.environments),
    gatheringParties: [],
  };
  const store = new Map(Object.entries(structuredClone(before)));
  const runner = new MigrationRunner({
    getSetting: (key) => store.get(key),
    setSetting: (key, value) => store.set(key, value),
    moduleVersion: '0.0.0',
  });
  const summary = await runner.run();
  assert.equal(summary.aborted, false, 'the lab world must not abort the migration pass');
  assert.ok(summary.ran > 0, 'no migration ran, so this file is asserting against nothing');
  return { before, after: Object.fromEntries(store), summary };
}

const labSystem = (systems, id) => systems.find((system) => system.id === id);

test('the startup migration pass does not rewrite any lab system’s crafting check', async () => {
  const { before, after } = await migrateLabWorld();

  // ONE EXEMPTION, and it is the point of a migration rather than an accident (issue 1095, C13).
  const withoutRelocatedCatalogue = (check) => {
    if (!check || typeof check !== 'object') return check;
    const { checkModifiers, ...rest } = check;
    return rest;
  };

  const rewritten = [];
  for (const seeded of before.craftingSystems) {
    const migrated = labSystem(after.craftingSystems, seeded.id);
    if (
      JSON.stringify(withoutRelocatedCatalogue(seeded.craftingCheck)) !==
      JSON.stringify(withoutRelocatedCatalogue(migrated?.craftingCheck))
    ) {
      rewritten.push(
        `${seeded.id}:\n    authored: ${JSON.stringify(seeded.craftingCheck?.checkModifiers ? { ...seeded.craftingCheck, checkModifiers: '…' } : seeded.craftingCheck)}` +
          `\n    rendered: ${JSON.stringify(migrated?.craftingCheck?.checkModifiers ? { ...migrated.craftingCheck, checkModifiers: '…' } : migrated?.craftingCheck)}`
      );
    }
  }

  assert.deepEqual(
    rewritten,
    [],
    'a migration rewrote a check block the lab world authors, so the frames photograph the ' +
      'migrated value and not the authored one. Author the post-migration shape in ' +
      '`labContent.js` (an authored value wins over every conditional stamp) rather than ' +
      'relying on an absence the pass fills in:\n  ' +
      rewritten.join('\n  ')
  );
});

// The positive half of the exemption above: the relocation the lab build exercises is asserted to
// have HAPPENED, end to end (issue 1095).
test('the startup migration pass MERGES both lab libraries into the world library', async () => {
  const { before, after } = await migrateLabWorld();
  const seeded = labSystem(before.craftingSystems, LAB_SYSTEM_IDS.HERBALISM);
  const migrated = labSystem(after.craftingSystems, LAB_SYSTEM_IDS.HERBALISM);

  assert.ok(
    Array.isArray(seeded?.craftingCheck?.checkModifiers) &&
      seeded.craftingCheck.checkModifiers.length > 0,
    'the fixture must go on authoring the catalogue at the PRE-1.22.0 location, or the lab ' +
      'build stops exercising the migration and this assertion proves nothing'
  );
  const seededGatheringConfig =
    before.gatheringConfig?.systems?.[LAB_SYSTEM_IDS.HERBALISM] ?? {};
  const seededGathering = seededGatheringConfig.characterModifiers ?? [];

  // NO COLLISION IN THE LAB WORLD, deliberately: the two libraries authored the same id for two
  // different expressions, which is precisely the duplication issue 1117 removes, and a fixture
  // that kept it would model the defect AND fire the one-time rename notice on every lab build.
  const seededIds = seeded.craftingCheck.checkModifiers.map((entry) => entry.id);
  assert.deepEqual(
    seededGathering.map((entry) => entry.id).filter((id) => seededIds.includes(id)),
    [],
    'the lab fixtures must author DISTINCT ids across the two libraries'
  );
  // The destination moved again in issue 1308: `1.23.0` still merges the two into ONE library, but
  // `1.28.0` then lifts that library off the crafting system into the `characterLibraries` world
  // setting, so the lab build now exercises THREE hops and the merged order is asserted where it
  // finally lands.
  assert.equal(migrated?.modifiers, undefined, 'the per-system copy is shed by 1.28.0');
  // Scoped to THIS system's ids, because the world library is a union across every lab system —
  // which is the whole point of the 1.28.0 move.
  const expected = [...seeded.craftingCheck.checkModifiers, ...seededGathering];
  const expectedIds = new Set(expected.map((entry) => entry.id));
  assert.deepEqual(
    (after.characterLibraries?.modifiers ?? []).filter((entry) => expectedIds.has(entry.id)),
    expected,
    'both libraries arrive in ONE world library, check entries first, entry for entry'
  );

  // The reference REWRITE that accompanies a re-key is proven in
  // `tests/migrate-unify-modifier-libraries.test.js`, against a world whose drop rows actually name
  // the colliding id.

  assert.equal(
    Object.hasOwn(migrated?.craftingCheck ?? {}, 'checkModifiers'),
    false,
    'and the old key is DELETED rather than duplicated — two locations for one library is ' +
      'how two surfaces come to disagree about which one is authoritative'
  );
  assert.equal(
    Object.hasOwn(migrated ?? {}, 'checkModifiers'),
    false,
    'as is the intermediate 1.22.0 location'
  );
  assert.equal(
    Object.hasOwn(
      after.gatheringConfig?.systems?.[LAB_SYSTEM_IDS.HERBALISM] ?? {},
      'characterModifiers'
    ),
    false,
    'and so is the gathering one'
  );
});

test('the lab’s check-modifier system still defers the selection with an unbounded pick cap', async () => {
  const { after } = await migrateLabWorld();
  const herbalism = labSystem(after.craftingSystems, LAB_SYSTEM_IDS.HERBALISM);
  const check = herbalism?.craftingCheck;

  assert.ok(
    policyDefersSelection(check?.defaultModifierPolicy),
    'the one lab system carrying a modifier catalogue must be on a SELECTING rule: the cap field ' +
      'renders under no other, so `manager-checks-crafting-modifiers` would have nothing to assert'
  );

  // The cap is what decides which CONTROL the roll prompt draws.
  const eligible = check?.defaultModifierIds?.length ?? 0;
  assert.ok(eligible >= 2, 'the engine suppresses a one-option choice, so the prompt needs two');
  assert.ok(
    resolveMaxModifierPicks(check) >= eligible,
    `the pick cap (${String(check?.maxModifierPicks)}) bounds the eligible set of ${eligible}, so ` +
      '`player-crafting-roll-prompt` photographs a narrower control than the case describes'
  );
});

/**
 * THE CAPTURE DRIVER'S WARNING TOLERANCE, held against the messages this world really emits. The
 * two entries the `1.30.0` migration made necessary are pinned here, and the messages are DERIVED
 * rather than copied.
 */
const DRIVER_PATH = resolve(import.meta.dirname, '../scripts/view-lab-screenshots.mjs');

const LANG = JSON.parse(readFileSync(resolve(import.meta.dirname, '../lang/en.json'), 'utf8'));

/**
 * The localizer `src/main.js` hands the notice builder: `format` when the clause takes data,
 * `localize` when it does not.
 *
 * @param {string} key Dotted `FABRICATE.…` key.
 * @param {object} [data] Clause data, when the clause takes any.
 * @returns {string|undefined} The localized string, or `undefined` when the key does not resolve.
 */
function localizeLang(key, data) {
  const template = key.split('.').reduce((node, part) => node?.[part], LANG);
  if (typeof template !== 'string') return undefined;
  if (!data) return template;
  return Object.entries(data).reduce(
    (text, [token, value]) => text.replaceAll(`{${token}}`, String(value)),
    template
  );
}

/**
 * The regex literals the capture driver declares, read out of its own source.
 *
 * @returns {RegExp[]} every declared pattern, in source order.
 */
function toleratedWarningPatterns() {
  const source = readFileSync(DRIVER_PATH, 'utf8');
  const start = source.indexOf('const TOLERATED_WARNINGS = [');
  assert.ok(
    start !== -1,
    '`scripts/view-lab-screenshots.mjs` no longer declares TOLERATED_WARNINGS'
  );
  const end = source.indexOf('\n];', start);
  assert.ok(end > start, 'the TOLERATED_WARNINGS declaration is no longer a closed array literal');
  const patterns = source
    .slice(start, end)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('/') && !line.startsWith('//') && line.endsWith(','))
    .map((line) => {
      const literal = line.slice(0, -1);
      const lastSlash = literal.lastIndexOf('/');
      assert.ok(lastSlash > 0, `not a regex literal: ${line}`);
      return new RegExp(literal.slice(1, lastSlash), literal.slice(lastSlash + 1));
    });
  assert.ok(
    patterns.length > 0,
    'no pattern was parsed out of TOLERATED_WARNINGS, so everything below would pass vacuously'
  );
  return patterns;
}

/**
 * The omission warning a lab build emits, from the REAL composition site.
 *
 * @param {object} after The migrated setting store.
 * @returns {string[]} every message the composition warned with.
 */
function labStartupOmissionWarnings(after) {
  const answered = async () => {};
  const inert = {
    cleanupInvalidRuns: answered,
    pruneInstantaneousActiveRuns: answered,
    cleanupLearnedRecipes: answered,
  };
  const warnings = [];
  composeStartupPassList({
    recipeManager: { getRecipes: () => [], getRecipe: () => null },
    craftingSystemManager: { getSystems: () => [] },
    craftingRunManager: inert,
    salvageRunManager: inert,
    recipeVisibilityService: inert,
    getSetting: (key) => after[key],
    setSetting: answered,
    resolveGatheringActor: () => null,
    isSelectableGatheringActor: () => false,
    warn: (message) => {
      warnings.push(message);
    },
  });
  return warnings;
}

test('the capture driver tolerates the two warnings a lab build really emits', async () => {
  const { after, summary } = await migrateLabWorld();
  const patterns = toleratedWarningPatterns();

  const notice = buildWorldScopeEntityNotice(summary.worldScopeEntityReport, localizeLang);
  // The severity is DERIVED — `warn` only when the pass produced a rename, a refusal or a flagged
  // reference — so this fixture reaches the gate at all because it produces one rename.
  assert.equal(
    notice.severity,
    'warn',
    'the world-scope notice no longer reaches the capture gate, so its entry in ' +
      '`TOLERATED_WARNINGS` is now dead and should be deleted rather than left standing'
  );
  const omissions = labStartupOmissionWarnings(after);
  assert.equal(
    omissions.length,
    1,
    'the lab world no longer withholds a startup pass, so the second entry in ' +
      '`TOLERATED_WARNINGS` is now dead and should be deleted rather than left standing'
  );

  // ONE pattern per message, not "at least one".
  for (const message of [notice.message, omissions[0]]) {
    const matched = patterns.filter((pattern) => pattern.test(message));
    assert.equal(
      matched.length,
      1,
      `exactly one tolerated pattern must match this warning, ${matched.length} did:\n  ` +
        `${message}\n  matched by: ${matched.map(String).join(', ') || 'nothing'}`
    );
  }
});

test('no tolerated pattern matches a warning the capture gate exists to catch', async () => {
  const { summary } = await migrateLabWorld();
  const patterns = toleratedWarningPatterns();
  const unlocalized = buildWorldScopeEntityNotice(summary.worldScopeEntityReport, () => undefined);

  const controls = [
    // Real product warnings, prefixed exactly as the driver sees them.
    'Fabricate | Ignoring invalid situational bonus',
    'Fabricate | Gathering hook failed: fabricate.gatheringComplete',
    // A routed notification, which is the channel the first tolerated entry travels on.
    'Fabricate | notification: Invalid file: the payload declares no crafting system',
    // THE SAME NOTICE WITH ITS STRING TABLE MISSING, derived rather than written: `localizeWith`
    // falls back to a literal when the key does not resolve.
    `Fabricate | notification: ${unlocalized.message}`,
    // A constructed near miss for the second entry, sharing its subject and its first two words and
    // differing exactly where the pattern anchors.
    'Fabricate | Startup cleanup FAILED: salvage runs threw and the world may be inconsistent',
  ];

  for (const control of controls) {
    const matched = patterns.filter((pattern) => pattern.test(control));
    assert.deepEqual(
      matched.map(String),
      [],
      'a tolerated pattern is broad enough to excuse a warning the gate exists to catch, so that ' +
        `warning would publish a frame instead of failing it:\n  ${control}`
    );
  }
});

// The two world-scope states the essence work is judged on, MEASURED after the migration rather
// than read off the fixture seeds (issue 1371 r20-store3). This block exists because a review round
// concluded the opposite from the seeds alone.

/**
 * The lab's THREE world-scope payloads through the same startup pass, seeded exactly as
 * `labWorld.js` seeds them.
 */
async function migrateLabWorldScopes() {
  const content = buildLabContent();
  const store = new Map(
    Object.entries(
      structuredClone({
        recipes: content.recipes,
        craftingSystems: content.systems,
        gatheringConfig: content.gatheringConfig,
        gatheringEnvironments: content.environments,
        gatheringParties: [],
        componentScope: content.componentScope,
        // The literal `labWorld.js` puts: membership only, no entities and no defaults.
        essenceScope: {
          entities: [],
          defaults: {},
          membership: {
            [`aether|${LAB_SYSTEM_IDS.SMITHING}`]: {
              entityId: 'aether',
              systemId: LAB_SYSTEM_IDS.SMITHING,
              inherit: { effectSource: true, macro: false },
              enabled: false,
            },
          },
        },
        toolScope: content.toolScope,
        worldVocabulary: content.worldVocabulary,
      })
    )
  );
  const runner = new MigrationRunner({
    getSetting: (key) => store.get(key),
    setSetting: (key, value) => store.set(key, value),
    moduleVersion: '0.0.0',
  });
  const summary = await runner.run();
  assert.equal(summary.aborted, false, 'the lab world must not abort the migration pass');
  return {
    componentScope: store.get('componentScope'),
    essenceScope: store.get('essenceScope'),
    craftingSystems: store.get('craftingSystems'),
  };
}

test('every lab essence is WORLD-KNOWN after the pass, so the bulk Colour axis is withheld', async () => {
  // The panel withholds its `Colour` axis when ANY selected essence is `worldDefined`, which the
  // store stamps from `worldScope.essence.entries` — the published corpus, not the fixture seed.
  const { essenceScope } = await migrateLabWorldScopes();
  const worldKnown = new Set(essenceScope.entities.map((entity) => entity.id));

  assert.ok(worldKnown.size > 0, 'the `1.30.0` lift populated the world essence catalogue');
  for (const essenceId of ['mote', 'aether']) {
    assert.ok(
      worldKnown.has(essenceId),
      `\`${essenceId}\` is ticked by manager-essences-bulk-edit, so it must be world-known there`
    );
  }
});

test('the lab resolves an essence map for `sm-iron-ingot` that its OWN row does not carry', async () => {
  // The r19 overlay — the rules list and its inspector drawing what the system RESOLVES rather than
  // the persisted row — is invisible in a freshly migrated world, because `1.32.0` elects each
  // world map FROM a system's own row and marks that system inheriting only when the two are equal.
  const { componentScope, craftingSystems } = await migrateLabWorldScopes();
  const smithing = labSystem(craftingSystems, LAB_SYSTEM_IDS.SMITHING);
  const persisted = smithing.components.find((row) => row.id === 'sm-iron-ingot');
  const [resolved] = resolveComponentScope(
    {
      entities: componentScope.entities,
      defaults: Object.values(componentScope.defaults),
      membership: Object.values(componentScope.membership),
    },
    smithing.id,
    [persisted]
  );

  assert.deepEqual(persisted.essences, { earth: 2, fire: 1 }, 'the row the authoring accessor gives');
  assert.deepEqual(
    resolved.essences,
    { earth: 2, fire: 1, air: 1 },
    'and what the system actually resolves — a frame of the two agreeing proves nothing'
  );
  assert.equal(
    componentScope.membership[`sm-iron-ingot|${LAB_SYSTEM_IDS.SMITHING}`].inherit.essences,
    true,
    'the pre-decided switch survives the pass, which is what keeps the two unequal'
  );
});

test('and the divergence reaches NO essence demand this system makes', async () => {
  // `air` is the divergence precisely because no smithing recipe demands it: raising a pool a
  // recipe gates on would flip a player capture frame between "can craft" and "cannot".
  const { craftingSystems } = await migrateLabWorldScopes();
  const content = buildLabContent();
  const demanded = new Set();
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (const entry of node) walk(entry);
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (node.type === 'essence' && node.essenceId) demanded.add(node.essenceId);
    if (node.essences && typeof node.essences === 'object' && !Array.isArray(node.essences)) {
      for (const id of Object.keys(node.essences)) demanded.add(id);
    }
    for (const value of Object.values(node)) walk(value);
  };
  walk(
    content.recipes.filter((recipe) => recipe.craftingSystemId === LAB_SYSTEM_IDS.SMITHING)
  );

  assert.ok(demanded.size > 0, 'the walk found no essence demand at all, so this is vacuous');
  assert.ok(
    !demanded.has('air'),
    `smithing demands ${[...demanded].sort().join(', ')} — adding \`air\` moves no craftability`
  );
  assert.ok(
    labSystem(craftingSystems, LAB_SYSTEM_IDS.SMITHING).essenceDefinitions.some(
      (definition) => definition.id === 'air'
    ),
    'and the system does define it, so the tile has a name and an icon to draw'
  );
});
