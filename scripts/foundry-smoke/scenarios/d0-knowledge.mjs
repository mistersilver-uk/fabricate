/**
 * Phase D0's GM Knowledge surface section and its fixture, including the companion contract's
 * runtime proof, which runs last and on a throwaway actor of its own.
 */

import { runFixturedScreenshotSection } from '../../lib/smokeSectionFixture.js';
import { assertManagerLayoutStable, openManagerCraftingSection } from '../pageOps/managerViews.mjs';
import { assertNoScreenshotOverlays, setManagerWindowSize } from '../pageOps/pageLifecycle.mjs';

/** Seed the GM Knowledge surface's runtime fixture (issue 785). */
async function setupKnowledgeFixture(
  page,
  { systemId, recipeId, chipStatesActorId, partyPoolActorId }
) {
  return page.evaluate(
    async ({ systemId, recipeId, chipStatesActorId, partyPoolActorId }) => {
      const clone = (value) => foundry.utils.deepClone(value);
      const csm = game.fabricate.getCraftingSystemManager();
      const system = csm.getSystem(systemId);
      const recipe = game.fabricate.getRecipeManager().getRecipe(recipeId);
      const chipStatesActor = game.actors.get(chipStatesActorId);
      const partyPoolActor = game.actors.get(partyPoolActorId);
      // The grant-only access fixtures (issue 796) are the empty-inventory player
      // characters this surface needs. Sorted by name so the choice is deterministic.
      const grantOnlyActors = game.actors.contents
        .filter((actor) => actor.getFlag('fabricate', 'smokeSeedRole') === 'access-grant')
        .sort((a, b) => a.name.localeCompare(b.name, 'en'));
      const learnedOnlyActor = grantOnlyActors[0] || null;
      const untrackedActor = grantOnlyActors[1] || null;
      if (
        !system ||
        !recipe ||
        !chipStatesActor ||
        !partyPoolActor ||
        !learnedOnlyActor ||
        !untrackedActor
      ) {
        throw new Error(
          'Knowledge fixture requires the smoke system, its healing-potion recipe, both hero actors and two grant-only actors'
        );
      }

      const sourceType = game.items.find((item) => item.name === 'Tome of Brewing')?.type || 'loot';
      // Every img is a Foundry-core raster this harness already loads elsewhere, so the
      // console-error gate cannot trip on a missing asset.
      const plan = [
        {
          key: 'limited',
          name: 'Smoke Knowledge Primer',
          img: 'icons/sundries/books/book-tooled-eye-gold-red.webp',
          caps: { item: { limitUses: true, maxUses: 3, whenSpent: 'inert' } },
          usage: { timesUsed: 1 },
          holder: chipStatesActor,
        },
        {
          key: 'uncapped',
          name: 'Smoke Knowledge Endless Codex',
          img: 'icons/sundries/documents/blueprint-recipe-alchemical.webp',
          caps: { item: { limitUses: false } },
          usage: null,
          holder: chipStatesActor,
        },
        {
          key: 'inert',
          name: 'Smoke Knowledge Faded Grimoire',
          img: 'icons/sundries/books/book-worn-brown.webp',
          caps: { item: { limitUses: true, maxUses: 5, whenSpent: 'inert' } },
          usage: { timesUsed: 1, inert: true },
          holder: chipStatesActor,
        },
        {
          key: 'spent',
          name: 'Smoke Knowledge Spent Scroll',
          img: 'icons/sundries/scrolls/scroll-runed-brown.webp',
          caps: { item: { limitUses: true, maxUses: 2, whenSpent: 'inert' } },
          usage: { timesUsed: 2, inert: true },
          holder: chipStatesActor,
        },
        {
          key: 'partyPool',
          name: 'Smoke Knowledge Party Tome',
          img: 'icons/sundries/books/book-embossed-jewel-gold-green.webp',
          caps: {
            item: { limitUses: true, maxUses: 4, whenSpent: 'inert' },
            learn: { limitLearning: true, learnsAllowed: 2, learnScope: 'total' },
          },
          usage: { timesUsed: 1 },
          holder: partyPoolActor,
        },
      ];

      const sources = await Item.createDocuments(
        plan.map((entry) => ({ name: entry.name, type: sourceType, img: entry.img }))
      );
      const definitionIds = [];
      const ownedByKey = {};
      const createdItems = new Map();
      // PASS 1 — register the definitions and grant the owned copies while every definition's
      // `recipeIds` is still empty.
      for (const [index, entry] of plan.entries()) {
        const { item: definition } = await csm.addRecipeItemFromUuid(systemId, sources[index].uuid);
        await csm.updateRecipeItemDefinition(systemId, definition.id, { caps: entry.caps });
        definitionIds.push(definition.id);
        // The owned copy claims its definition through the durable per-system roles map
        // (`flags.fabricate.fabricate.roles.<systemId>.recipeItemDefinitionId`), which is tier 1 of
        // `matchRecipeItemDefinition` — the same identity a real drag-to-actor copy resolves through.
        const nested = { roles: { [systemId]: { recipeItemDefinitionId: definition.id } } };
        if (entry.usage) nested.recipeItemUsage = { ...entry.usage };
        const [owned] = await entry.holder.createEmbeddedDocuments('Item', [
          {
            name: entry.name,
            type: sourceType,
            img: entry.img,
            flags: { fabricate: { fabricate: nested } },
          },
        ]);
        if (!owned) throw new Error(`Knowledge fixture could not grant ${entry.name}`);
        ownedByKey[entry.key] = {
          actorId: entry.holder.id,
          itemId: owned.id,
          itemUuid: owned.uuid,
        };
        createdItems.set(entry.holder.id, [...(createdItems.get(entry.holder.id) || []), owned.id]);
      }

      // Fail HERE, with the cause named, if anything ever consumes a seeded copy again —
      // rather than several hundred lines later as an opaque row-count mismatch.
      for (const [key, granted] of Object.entries(ownedByKey)) {
        if (!game.actors.get(granted.actorId)?.items?.get(granted.itemId)) {
          throw new Error(
            `Knowledge fixture lost the ${key} copy during seeding — a createItem consumer (auto-learn consumeOnLearn) destroyed it`
          );
        }
      }

      // PASS 2 — link membership now that every copy exists. The Type pill and the
      // count in the type pill ("N Recipe Book") read truthfully from here on.
      for (const definitionId of definitionIds) {
        await csm.updateRecipeItemDefinition(systemId, definitionId, { recipeIds: [recipeId] });
      }

      const learnedTargets = [
        // Still-owned party-pool source → the D8 hazard band's precondition.
        { actor: partyPoolActor, sourceItemUuid: ownedByKey.partyPool.itemUuid },
        // A dangling source uuid: the copy this was learned from is gone, so the row
        // resolves rung 2 of the source ladder and frees no learn budget on erase.
        {
          actor: learnedOnlyActor,
          sourceItemUuid: `Actor.${learnedOnlyActor.id}.Item.${foundry.utils.randomID()}`,
        },
      ];
      // Snapshot the learned map of EVERY actor this section can touch, not only the two
      // it seeds, so any entry gained while the section runs is rolled back too.
      const learnedRestores = [
        chipStatesActor,
        partyPoolActor,
        learnedOnlyActor,
        untrackedActor,
      ].map((actor) => ({
        actorId: actor.id,
        learnedRecipes: clone(actor.getFlag('fabricate', 'fabricate.learnedRecipes') || null),
      }));
      for (const target of learnedTargets) {
        const current = target.actor.getFlag('fabricate', 'fabricate.learnedRecipes') || null;
        await target.actor.update({
          'flags.fabricate.fabricate.learnedRecipes': {
            ...current,
            [recipeId]: { learnedAt: Date.now(), sourceItemUuid: target.sourceItemUuid },
          },
        });
      }

      await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
      return {
        definitionIds,
        recipeId,
        // `deleteRecipeItemDefinition` nulls `recipeItemId` / `linkedRecipeItemUuid` on every recipe
        // the deleted definition claimed membership over.
        recipeLinks: {
          recipeItemId: recipe.recipeItemId ?? null,
          linkedRecipeItemUuid: recipe.linkedRecipeItemUuid ?? null,
        },
        sourceItemIds: sources.map((source) => source.id),
        createdItems: [...createdItems].map(([actorId, itemIds]) => ({ actorId, itemIds })),
        learnedRestores,
        ownedByKey,
        chipStatesActorId: chipStatesActor.id,
        partyPoolActorId: partyPoolActor.id,
        learnedOnlyActorId: learnedOnlyActor.id,
        untrackedActorId: untrackedActor.id,
      };
    },
    { systemId, recipeId, chipStatesActorId, partyPoolActorId }
  );
}

/** Undo everything `setupKnowledgeFixture` created (issue 785). */
async function restoreKnowledgeFixture(page, { systemId, fixture }) {
  if (!fixture) return;
  await page.evaluate(
    async ({ systemId, fixture }) => {
      const csm = game.fabricate.getCraftingSystemManager();
      for (const { actorId, itemIds } of fixture.createdItems || []) {
        const actor = game.actors.get(actorId);
        if (actor) await actor.deleteEmbeddedDocuments('Item', itemIds).catch(() => {});
      }
      for (const { actorId, learnedRecipes } of fixture.learnedRestores || []) {
        const actor = game.actors.get(actorId);
        if (!actor) continue;
        await actor.unsetFlag('fabricate', 'fabricate.learnedRecipes').catch(() => {});
        if (learnedRecipes && Object.keys(learnedRecipes).length > 0) {
          await actor.update({ 'flags.fabricate.fabricate.learnedRecipes': learnedRecipes });
        }
      }
      // Drop each fixture definition's membership BEFORE deleting it: with no
      // `recipeIds`, the delete finds no referencing recipe and never nulls the smoke
      // world's `recipeItemId` / `linkedRecipeItemUuid`.
      for (const definitionId of fixture.definitionIds || []) {
        await csm
          .updateRecipeItemDefinition(systemId, definitionId, { recipeIds: [] })
          .catch(() => {});
        await csm.deleteRecipeItemDefinition(systemId, definitionId).catch(() => {});
      }
      // Belt-and-braces repair on the exact fields that delete path would have nulled.
      const rm = game.fabricate.getRecipeManager();
      const recipe = rm?.getRecipe?.(fixture.recipeId);
      const links = fixture.recipeLinks || {};
      if (
        recipe &&
        ((recipe.recipeItemId ?? null) !== (links.recipeItemId ?? null) ||
          (recipe.linkedRecipeItemUuid ?? null) !== (links.linkedRecipeItemUuid ?? null))
      ) {
        recipe.recipeItemId = links.recipeItemId ?? null;
        recipe.linkedRecipeItemUuid = links.linkedRecipeItemUuid ?? null;
        await rm.save?.();
      }
      for (const itemId of fixture.sourceItemIds || []) {
        await game.items
          .get(itemId)
          ?.delete()
          .catch(() => {});
      }
      if (fixture.contractActorId) {
        await game.actors
          .get(fixture.contractActorId)
          ?.delete()
          .catch(() => {});
      }
      await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
    },
    { systemId, fixture }
  );
}

/** The single place the real Foundry `ObjectField` flag merge is exercised (issue 785). */
async function assertKnowledgeInertSurvivesExpend(page, fixture) {
  const { actorId, itemId } = fixture.ownedByKey.inert;
  const expend = page.locator(`.fabricate-manager [data-knowledge-expend="${itemId}"]`).first();
  if (await expend.isDisabled()) {
    throw new Error(
      'The inert-but-not-spent copy must stay expendable — `canExpend` must not test `inert`'
    );
  }
  await expend.click();
  const readUsage = ({ actorId, itemId }) =>
    game.actors
      .get(actorId)
      ?.items?.get(itemId)
      ?.getFlag('fabricate', 'fabricate.recipeItemUsage') ?? null;
  await page.waitForFunction(
    ({ actorId, itemId }) => {
      const usage = game.actors
        .get(actorId)
        ?.items?.get(itemId)
        ?.getFlag('fabricate', 'fabricate.recipeItemUsage');
      return Number(usage?.timesUsed) === 2;
    },
    { actorId, itemId },
    { timeout: 10_000, polling: 'raf' }
  );
  const usage = await page.evaluate(readUsage, { actorId, itemId });
  if (usage?.inert !== true) {
    throw new Error(
      `The usage-only expend write dropped the sibling inert flag: ${JSON.stringify(usage)}`
    );
  }
}

/** Drive the GM Knowledge surface and capture its evidence frames (issue 785). */
async function exerciseKnowledgeSurface(ctx, { fixture }) {
  const { page, screenshot } = ctx;
  const selectKnowledgeCharacter = async (actorId) => {
    await page.locator(`.fabricate-manager [data-knowledge-actor="${actorId}"]`).first().click();
    await page
      .locator(`.fabricate-manager [data-knowledge-actor="${actorId}"][aria-pressed="true"]`)
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });
  };
  const openKnowledgeTab = async (tabId) => {
    await page.locator(`.fabricate-manager [data-knowledge-tab="${tabId}"]`).first().click();
    await page
      .locator(`.fabricate-manager [data-knowledge-panel="${tabId}"]`)
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });
  };

  await setManagerWindowSize(page, { width: 1280, height: 900 });
  await openManagerCraftingSection(page, 'knowledge', 'knowledge');
  await page
    .locator('.fabricate-manager[data-manager-view="knowledge"]')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  await page
    .locator('.fabricate-manager [data-knowledge-view]')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  // The dimmed "Nothing tracked" roster row proves the roster spans every player
  // character, not only the ones carrying state. It is in the roster column, so it
  // rides along in every frame below.
  await page
    .locator(
      `.fabricate-manager [data-knowledge-actor="${fixture.untrackedActorId}"] [data-knowledge-untracked]`
    )
    .first()
    .waitFor({ state: 'visible', timeout: 5000 });

  // (1) Owned copies — the whole chip vocabulary in one list, beside the detail
  // header's two reset grains.
  await selectKnowledgeCharacter(fixture.chipStatesActorId);
  await openKnowledgeTab('recipeItems');
  await page
    .locator('.fabricate-manager .manager-knowledge-copy-row')
    .first()
    .waitFor({ state: 'visible', timeout: 5000 });
  const copyRowCount = await page.locator('.fabricate-manager .manager-knowledge-copy-row').count();
  if (copyRowCount !== 4) {
    throw new Error(
      `Knowledge chip-state character must hold exactly 4 owned copies; found ${copyRowCount}`
    );
  }
  for (const [key, usesChip, expectInert] of [
    ['limited', 'remaining', false],
    ['uncapped', 'unlimited', false],
    ['inert', 'remaining', true],
    ['spent', 'spent', true],
  ]) {
    const row = page
      .locator(`.fabricate-manager [data-knowledge-copy="${fixture.ownedByKey[key].itemId}"]`)
      .first();
    await row
      .locator(`[data-knowledge-uses-chip="${usesChip}"]`)
      .waitFor({ state: 'visible', timeout: 5000 });
    const inertChips = await row.locator('[data-knowledge-inert]').count();
    if (inertChips > 0 !== expectInert) {
      throw new Error(
        `Knowledge ${key} copy rendered ${inertChips} Inert chip(s); expected ${expectInert ? 'one' : 'none'}`
      );
    }
  }
  // An uncapped book writes nothing and a spent one has no charge left, so both
  // disable Expend — a disabled control, never a silent no-op.
  for (const key of ['uncapped', 'spent']) {
    const expend = page
      .locator(`.fabricate-manager [data-knowledge-expend="${fixture.ownedByKey[key].itemId}"]`)
      .first();
    if (!(await expend.isDisabled())) {
      throw new Error(`Expend must be disabled on the ${key} recipe item copy`);
    }
  }
  await assertManagerLayoutStable(page, 'knowledge normal');
  await assertNoScreenshotOverlays(page);
  await screenshot(page, 'manager-knowledge-owned-copies');

  await assertKnowledgeInertSurvivesExpend(page, fixture);

  // (2) A tab's dashed empty state: the learned-only character carries knowledge but
  // no owned copies at all.
  await selectKnowledgeCharacter(fixture.learnedOnlyActorId);
  await openKnowledgeTab('recipeItems');
  await page
    .locator('.fabricate-manager [data-knowledge-items-empty]')
    .first()
    .waitFor({ state: 'visible', timeout: 5000 });
  await assertNoScreenshotOverlays(page);
  await screenshot(page, 'manager-knowledge-empty-tab');

  // (3) Learned recipes — the lost-copy source rung, and the icon-led no-refund clause that states
  // D7's prohibition positively.
  await openKnowledgeTab('learnedRecipes');
  await page
    .locator('.fabricate-manager [data-knowledge-source="lostCopy"]')
    .first()
    .waitFor({ state: 'visible', timeout: 5000 });
  await page
    .locator(
      '.fabricate-manager [data-knowledge-source="lostCopy"] [data-knowledge-no-refund="notOwned"]'
    )
    .first()
    .waitFor({ state: 'visible', timeout: 5000 });
  await assertNoScreenshotOverlays(page);
  await screenshot(page, 'manager-knowledge-learned-lost-copy');

  // (4) The D8 ordering-hazard band, raised only for a character holding a
  // `total`-scope copy that is the source of a still-learned entry.
  await selectKnowledgeCharacter(fixture.partyPoolActorId);
  await openKnowledgeTab('recipeItems');
  await page
    .locator('.fabricate-manager [data-knowledge-party-pool-warning]')
    .first()
    .waitFor({ state: 'visible', timeout: 5000 });
  await assertManagerLayoutStable(page, 'knowledge normal');
  await assertNoScreenshotOverlays(page);
  await screenshot(page, 'manager-knowledge-party-pool-warning');

  // (5) Delete armed to "Confirm?" WITH un-armed sibling rows in the same frame —
  // the contrast is the evidence, since only one armed token exists at a time.
  await selectKnowledgeCharacter(fixture.chipStatesActorId);
  await openKnowledgeTab('recipeItems');
  const armToken = `delete:${fixture.ownedByKey.limited.itemId}`;
  await page.locator(`.fabricate-manager [data-arm-token="${armToken}"]`).first().click();
  await page
    .locator(`.fabricate-manager [data-arm-token="${armToken}"][data-armed="true"]`)
    .first()
    .waitFor({ state: 'visible', timeout: 5000 });
  const unarmedSiblings = await page
    .locator('.fabricate-manager .manager-knowledge-copy-row [data-armed="false"]')
    .count();
  if (unarmedSiblings < 1) {
    throw new Error('The armed Delete frame must show at least one un-armed sibling row');
  }
  await assertManagerLayoutStable(page, 'knowledge normal');
  await assertNoScreenshotOverlays(page);
  await screenshot(page, 'manager-knowledge-delete-armed');

  // (6) ~880px — deliberately above the 831px single-column collapse.
  await selectKnowledgeCharacter(fixture.chipStatesActorId);
  await page
    .locator(`.fabricate-manager [data-arm-token="${armToken}"][data-armed="false"]`)
    .first()
    .waitFor({ state: 'visible', timeout: 5000 });
  await setManagerWindowSize(page, { width: 880, height: 900 });
  await page.waitForTimeout(300);
  await assertManagerLayoutStable(page, 'knowledge narrow');
  await assertNoScreenshotOverlays(page);
  await screenshot(page, 'manager-knowledge-narrow');
  await setManagerWindowSize(page, { width: 1280, height: 900 });
}

/** Create the throwaway actor the companion-contract step grants onto (issue 1289). */
async function createCompanionContractActor(page) {
  return page.evaluate(async () => {
    const types = [...(game.documentTypes?.Actor || [])];
    const type = types.includes('character') ? 'character' : types[0];
    if (!type) throw new Error('Companion contract step found no creatable Actor type');
    const actor = await Actor.create({ name: 'Smoke Companion Contract Target', type });
    if (!actor?.id) throw new Error('Companion contract step could not create its throwaway actor');
    return actor.id;
  });
}

/** Prove `game.fabricate.api.COMPANION` in a real world (issue 1289, criterion 17). */
async function verifyCompanionContract(page, { systemId, recipeId, fixture }) {
  return page.evaluate(
    async ({ systemId, recipeId, fixture }) => {
      const actorId = fixture.contractActorId;
      const GRANTED_BY = 'Foundry smoke: companion contract';
      const readFlag = (document, key) =>
        document?.getFlag('fabricate', `fabricate.${key}`) ?? null;

      // Everything this step is committed NOT to touch, in one string.
      const snapshot = () =>
        JSON.stringify({
          actors: [
            fixture.chipStatesActorId,
            fixture.partyPoolActorId,
            fixture.learnedOnlyActorId,
            fixture.untrackedActorId,
          ].map((id) => {
            const actor = game.actors.get(id);
            return {
              id,
              learnedRecipes: readFlag(actor, 'learnedRecipes'),
              discoveryProgress: readFlag(actor, 'discoveryProgress'),
            };
          }),
          learnCounts: Object.entries(fixture.ownedByKey || {}).map(([key, owned]) => {
            const item = game.actors.get(owned.actorId)?.items?.get(owned.itemId);
            return [key, readFlag(item, 'recipeItemLearning'), readFlag(item, 'recipeItemUsage')];
          }),
          // The `total`-scope party budget is a WORLD setting, so a stray decrement would leak
          // out of this section entirely.
          partyLearnPool: game.settings.settings?.has?.('fabricate.recipeItemPartyLearnPool')
            ? game.settings.get('fabricate', 'recipeItemPartyLearnPool')
            : null,
        });
      const before = snapshot();

      const contract = game.fabricate?.api?.COMPANION;
      if (!contract)
        throw new Error('game.fabricate.api.COMPANION is not published on the live global');
      if (typeof contract.schemaVersion !== 'number') {
        throw new TypeError(
          `COMPANION.schemaVersion is ${typeof contract.schemaVersion}, expected a number`
        );
      }
      if (!Object.isFrozen(contract)) throw new Error('COMPANION is published unfrozen');

      // Resolve THROUGH the declared host and path rather than assuming a facade function:
      // two of the eight rows are not one.
      const hosts = {
        contract,
        facade: game.fabricate,
        craftingEngine: game.fabricate.getCraftingEngine(),
      };
      for (const member of contract.members) {
        const host = hosts[member.host];
        if (!host)
          throw new Error(
            `COMPANION member ${member.name} declares unresolvable host ${member.host}`
          );
        const resolved = host[member.path];
        const expected = member.kind === 'value' ? 'number' : 'function';
        if (typeof resolved !== expected) {
          throw new TypeError(
            `COMPANION member ${member.name} resolved to ${typeof resolved} through ${member.host}.${member.path}; expected ${expected}`
          );
        }
      }

      // Fail here, naming the cause, if an earlier phase ever moves the smoke system off its
      // `knowledge` default — otherwise the grant below refuses and reads as a product defect.
      const system = game.fabricate.getCraftingSystemManager().getSystem(systemId);
      if (
        game.fabricate.getRecipeVisibilityService().isLearnedKnowledgeObservable(system) !== true
      ) {
        throw new Error(
          `Companion contract step needs an observable system; ${systemId} is not one`
        );
      }

      const granted = await game.fabricate.grantRecipeKnowledge({
        actorId,
        recipeId,
        grantedBy: GRANTED_BY,
      });
      if (granted?.success !== true || granted?.outcome !== 'granted') {
        throw new Error(`Grant against a real actor answered ${JSON.stringify(granted)}`);
      }

      const entry = readFlag(game.actors.get(actorId), 'learnedRecipes')?.[recipeId];
      if (
        !entry ||
        entry.granted !== true ||
        entry.grantedBy !== GRANTED_BY ||
        entry.sourceItemUuid !== null ||
        !Number.isFinite(Number(entry.learnedAt))
      ) {
        throw new Error(
          `The granted entry did not persist as four scalars: ${JSON.stringify(entry)}`
        );
      }

      const repeat = await game.fabricate.grantRecipeKnowledge({
        actorId,
        recipeId,
        grantedBy: GRANTED_BY,
      });
      if (repeat?.success !== true || repeat?.outcome !== 'alreadyKnown') {
        throw new Error(`A repeat grant answered ${JSON.stringify(repeat)}; expected alreadyKnown`);
      }

      const after = snapshot();
      if (before !== after) {
        throw new Error(
          `The companion contract step changed fixture state it does not own.\nbefore: ${before}\nafter:  ${after}`
        );
      }
      return {
        schemaVersion: contract.schemaVersion,
        memberCount: contract.members.length,
        grantedOutcome: granted.outcome,
        repeatOutcome: repeat.outcome,
      };
    },
    { systemId, recipeId, fixture }
  );
}

export default {
  id: 'knowledge',
  phase: 'phase-D0',
  section: 'knowledge',
  publishes: [],
  consumes: ['cleanup', 'craftingSetup'],
  async run(ctx) {
    const { page, results } = ctx;
    const { cleanup, craftingSetup } = ctx.shared;
    const knowledgeResult = await runFixturedScreenshotSection({
      results,
      step: 'knowledge-surface-evidence',
      rethrow: false,
      setup: () =>
        setupKnowledgeFixture(page, {
          systemId: craftingSetup.systemId,
          recipeId: craftingSetup.healingPotionRecipeId,
          chipStatesActorId: cleanup.crafterId,
          partyPoolActorId: cleanup.travelMemberId,
        }),
      exercise: async (fixture) => {
        await exerciseKnowledgeSurface(ctx, { fixture });
        // The companion contract's runtime proof (issue 1289, criterion 17) runs LAST
        // and on a throwaway actor of its own, so it can neither disturb a frame above
        // nor the fixture characters those frames photograph.
        fixture.contractActorId = await createCompanionContractActor(page);
        await verifyCompanionContract(page, {
          systemId: craftingSetup.systemId,
          recipeId: craftingSetup.healingPotionRecipeId,
          fixture,
        });
      },
      restore: (fixture) =>
        restoreKnowledgeFixture(page, {
          systemId: craftingSetup.systemId,
          fixture,
        }),
    });
    if (!knowledgeResult.passed) {
      process.stderr.write(
        `Knowledge surface evidence failed: ${knowledgeResult.error?.message}\n`
      );
    }
  },
};
