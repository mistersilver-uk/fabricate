/**
 * The lab world is not the world the lab renders: it is MIGRATED first, and the frames photograph
 * the result.
 *
 * `labWorld.js` seeds `game.settings` and then boots the real `fabricate.initialize()`, which runs
 * `MigrationRunner`. No lab fixture seeds `migrationVersion`, so `lastRunVersion` is `'0.0.0'` and
 * EVERY registered migration runs over these fixtures on EVERY lab build. A fixture value that a
 * migration rewrites is therefore not the value any frame shows, and nothing said so: the fixture
 * file states the intent, the case registry asserts against it, and the migration silently sits
 * between them.
 *
 * That is not hypothetical. `PROGRESSIVE_CHECK` authored `defaultModifierPolicy: 'playerPicks'`
 * with no `maxModifierPicks`, on the stated ground that absence is the UNLIMITED reading — which is
 * exactly the shape 1.20.0's `migrateMaxModifierPicks` exists to stamp `maxModifierPicks = 1` onto,
 * to preserve the single pick that rule used to mean. Two capture cases failed against a cap nobody
 * authored, and a third (`player-crafting-roll-prompt`) kept passing while publishing the historical
 * pick-one radio group under a case whose whole subject is the multi-pick control it replaced.
 *
 * These are cheap, pure checks over the same builder the lab boots from, and they run in `npm test`
 * — where a capture run needs harvested Foundry chrome and does not run on a fork PR at all.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MigrationRunner } from '../src/migration/MigrationRunner.js';
import {
  policyDefersSelection,
  resolveMaxModifierPicks,
} from '../src/systems/checkModifierResolver.js';
import { buildLabContent, LAB_SYSTEM_IDS } from './view-lab/world/labContent.js';

/**
 * Run the real startup migration pass over the lab fixtures, exactly as a lab build does.
 *
 * The runner is driven through its injected setting seams rather than through a Foundry shim: the
 * pass is pure over the five settings it reads, so an in-memory Map reproduces it faithfully and
 * without booting anything. `migrationVersion` is deliberately NOT seeded, because that is the fact
 * under test — seeding it here would make every assertion below vacuous.
 *
 * @returns {Promise<{ before: object, after: object }>} The seeded and migrated worlds.
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
  return { before, after: Object.fromEntries(store) };
}

const labSystem = (systems, id) => systems.find((system) => system.id === id);

test('the startup migration pass does not rewrite any lab system’s crafting check', async () => {
  const { before, after } = await migrateLabWorld();

  // ONE EXEMPTION, and it is the point of a migration rather than an accident (issue 1095,
  // C13). `1.22.0` LIFTS `craftingCheck.checkModifiers` to `system.checkModifiers` and
  // deletes the old key, and `labContent.js` deliberately goes on authoring it at the OLD
  // location — which is what makes every lab build a live exercise of that transform, and
  // what makes the frames show the state a GM upgrading will actually see. "Author the
  // post-migration shape" is the right instruction for a stamp that fills an absence; it is
  // the WRONG instruction for a relocation, because authoring the new location would leave
  // the migration unexercised. So the key is dropped from BOTH sides of the comparison and
  // the relocation is asserted positively below instead.
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

// The positive half of the exemption above: the relocation the lab build exercises is
// asserted to have HAPPENED, in both directions. Without this the exemption would merely
// stop looking at the one key `1.22.0` touches (issue 1095, C13).
test('the startup migration pass LIFTS the lab catalogue to the system level', async () => {
  const { before, after } = await migrateLabWorld();
  const seeded = labSystem(before.craftingSystems, LAB_SYSTEM_IDS.HERBALISM);
  const migrated = labSystem(after.craftingSystems, LAB_SYSTEM_IDS.HERBALISM);

  assert.ok(
    Array.isArray(seeded?.craftingCheck?.checkModifiers) &&
      seeded.craftingCheck.checkModifiers.length > 0,
    'the fixture must go on authoring the catalogue at the PRE-1.22.0 location, or the lab ' +
      'build stops exercising the migration and this assertion proves nothing'
  );
  assert.deepEqual(
    migrated?.checkModifiers,
    seeded.craftingCheck.checkModifiers,
    'the catalogue arrives at the system level, entry for entry'
  );
  assert.equal(
    Object.hasOwn(migrated?.craftingCheck ?? {}, 'checkModifiers'),
    false,
    'and the old key is DELETED rather than duplicated — two locations for one catalogue is ' +
      'how two surfaces come to disagree about which one is authoritative'
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

  // The cap is what decides which CONTROL the roll prompt draws. `buildCheckModifierChoice`
  // takes `Math.min(cap, options.length)`, and `renderModifierFieldset` draws a pick-one radio
  // group at 1 and a checkbox group legended "Pick up to N" above it — so a cap that has fallen
  // below the eligible-set size does not fail any selector, it silently publishes the other
  // control. Asserting the RELATION rather than a literal keeps this true if either count moves.
  const eligible = check?.defaultModifierIds?.length ?? 0;
  assert.ok(eligible >= 2, 'the engine suppresses a one-option choice, so the prompt needs two');
  assert.ok(
    resolveMaxModifierPicks(check) >= eligible,
    `the pick cap (${String(check?.maxModifierPicks)}) bounds the eligible set of ${eligible}, so ` +
      '`player-crafting-roll-prompt` photographs a narrower control than the case describes'
  );
});
