/** Phase D0's components and checks section. It re-enters by an absolute Components nav click, so it does not depend on the recipes section, and restores every fixture it touches inline. */

import { railSelector } from '../../lib/managerRailEntries.js';
import {
  COMPONENT_BULK_EDIT_STUDIO,
  assertManagerLayoutStable,
  captureBulkEditFrame,
  captureGroupedContinuationFrame,
  captureStableManagerView,
  openChecksActivity,
  openChecksSection,
  returnToSystemLibrary,
} from '../pageOps/managerViews.mjs';
import {
  assertNoScreenshotOverlays,
  selectSmokeSystemInManager,
  setManagerWindowSize,
  softClick,
} from '../pageOps/pageLifecycle.mjs';

export default {
  id: 'components-checks',
  phase: 'phase-D0',
  section: 'components-checks',
  publishes: [],
  consumes: ['craftingSetup', 'executionFixtures'],
  async run(ctx) {
    const { page, results, screenshot } = ctx;
    const { craftingSetup, executionFixtures } = ctx.shared;
    await setManagerWindowSize(page, { width: 1280, height: 820 });
    // Required sections establish their own scope. Optional recipe captures
    // above may have visited another system and intentionally own their cleanup.
    await returnToSystemLibrary(page);
    await selectSmokeSystemInManager(page, craftingSetup.systemId);
    await page.locator(railSelector('manager-nav-component-rules')).click();
    await page
      .locator('.fabricate-manager[data-manager-view="components"]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(500);
    if ((await page.locator('.fabricate-manager .manager-component-drop-zone').count()) === 0) {
      throw new Error('Manager components browser did not show the drop-to-add affordance.');
    }
    await captureStableManagerView(ctx, {
      layout: 'components normal',
      label: 'manager-components-normal',
    });
    process.stdout.write('  D0: components normal screenshotted\n');

    // Issue 772 — the components browser's bulk edit rail panel, in two of its three frames
    // (one frame cannot carry all four of the panel's sections).
    await captureBulkEditFrame(ctx, {
      studio: COMPONENT_BULK_EDIT_STUDIO,
      stepName: 'components-bulk-edit',
      label: 'manager-components-bulk-edit',
      stage: async (bulkPanel) => {
        // The category is an inline inset ROW since issue 1371 r16-list (M23): the first row
        // stages a category whatever vocabulary this world has authored.
        await bulkPanel.locator('[data-component-bulk-category-option]').first().click();
        await bulkPanel
          .locator('[data-component-bulk-option-state="on"]')
          .first()
          .waitFor({ state: 'visible', timeout: 5000 });

        // The tag chips cycle none → add → remove → none, so one click stages an addition and two
        // stage a removal. Both tri-states are in the frame because the tri-state IS the feature.
        const tagChips = bulkPanel.locator('[data-bulk-tag]');
        if ((await tagChips.count()) < 2) {
          throw new Error('Bulk edit panel rendered fewer than two item-tag chips to cycle.');
        }
        await tagChips.nth(0).click();
        await tagChips.nth(1).click();
        await tagChips.nth(1).click();
        for (const state of ['add', 'remove']) {
          await bulkPanel
            .locator(`[data-bulk-tag][data-bulk-tag-state="${state}"]`)
            .first()
            .waitFor({ state: 'visible', timeout: 5000 });
        }

        // One essence increment on an inset ROW (issue 1371 r16-list, M24), which also arms
        // the essence axis (its staged chip flips to "Will overwrite", every row reads the
        // number it will be written, and the destructive-overwrite warning resolves).
        await bulkPanel
          .locator(
            '[data-component-bulk-essences] [data-component-edit-essence] [data-stepper-increment]'
          )
          .first()
          .click();
        await bulkPanel
          .locator('[data-component-bulk-essences] [data-component-essence-active="true"]')
          .first()
          .waitFor({ state: 'visible', timeout: 5000 });

        // Apply must be live with three axes staged — but it is never clicked: this
        // capture writes nothing.
        if (await bulkPanel.locator('[data-component-bulk-apply]').first().isDisabled()) {
          throw new Error(
            'Bulk edit Apply stayed inert after category, tags and essences were staged.'
          );
        }
      },
    });
    await captureBulkEditFrame(ctx, {
      studio: COMPONENT_BULK_EDIT_STUDIO,
      stepName: 'components-bulk-edit-unstaged',
      label: 'manager-components-bulk-edit-unstaged',
      stage: async (bulkPanel) => {
        // Nothing is staged here, deliberately — the assertions are the state.
        if (!(await bulkPanel.locator('[data-component-bulk-apply]').first().isDisabled())) {
          throw new Error('Bulk edit Apply was live on a pristine draft with nothing staged.');
        }
        await bulkPanel
          .locator('[data-component-bulk-essences-staged="false"]')
          .first()
          .waitFor({ state: 'visible', timeout: 5000 });
        // The essence inset renders in BOTH states, so this frame still carries its rows
        // — reading `—` while unstaged — and what differs is the chip above it and the
        // inert Apply (issue 1371 r16-list, M24).
        await bulkPanel
          .locator('[data-component-bulk-essences]')
          .first()
          .waitFor({ state: 'visible', timeout: 5000 });
      },
    });

    // --------------------------------------------------------------------- Issue 800 —
    // write-time resolution of source descriptions, in three frames.
    const enricher800 = await page.evaluate(async (sysId) => {
      const csm = game.fabricate.getCraftingSystemManager();
      const system = csm.getSystem(sysId);
      const component = system?.components?.find((c) => c.name === 'Mystic Herb');
      if (!component) {
        throw new Error('issue 800: Mystic Herb component not found for the enricher fixture');
      }

      // Two REAL dnd5e items to reference, so resolution produces genuine document
      // names rather than anything this fixture could have supplied itself.
      const referencePack = game.packs.get('dnd5e.items');
      if (!referencePack) throw new Error('issue 800: dnd5e.items pack not found');
      const index = await referencePack.getIndex();
      const entries = [...index]
        .filter((entry) => entry?._id && entry.name)
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      if (entries.length < 2) throw new Error('issue 800: dnd5e.items index too small');
      const [first, second] = entries;

      // The label-less reference is the headline case (it resolves to the document's real name).
      const GATED_SECRET = 'GM-ONLY-SECRET-800';
      const rawFor = (label) =>
        `${label}: @UUID[Compendium.dnd5e.items.Item.${first._id}], ` +
        `@UUID[Compendium.dnd5e.items.Item.${second._id}]{${second.name}}, ` +
        '@UUID[Compendium.dnd5e.items.Item.doesnotexist0000]. ' +
        `<span data-visibility="gm">${GATED_SECRET}</span> ` +
        'Burns for [[/r 1d4]]{1d4 rounds} dealing [[2d6]] fire damage.';

      // A world compendium we own, holding both source items, LOCKED afterwards.
      const CompendiumCollectionClass =
        foundry.documents?.collections?.CompendiumCollection ?? globalThis.CompendiumCollection;
      const packName = 'fabricate-smoke-800';
      let sourcePack = game.packs.get(`world.${packName}`);
      if (!sourcePack) {
        sourcePack = await CompendiumCollectionClass.createCompendium({
          label: 'Fabricate Smoke 800',
          type: 'Item',
          name: packName,
        });
      }
      await sourcePack.configure({ locked: false });
      const existingDocs = await sourcePack.getDocuments();
      const ensureDoc = async (name, raw) => {
        const found = existingDocs.find((doc) => doc.name === name);
        if (found) {
          await found.update({ 'system.description.value': raw });
          return found;
        }
        const [created] = await Item.createDocuments(
          [{ name, type: 'loot', system: { description: { value: raw } } }],
          { pack: sourcePack.collection }
        );
        return created;
      };
      // Bound to Mystic Herb (frames 1 + 2).
      const boundDoc = await ensureDoc('Smoke Supplies', rawFor('Craft'));
      // Deliberately NOT bound to any component (frame 3).
      const unboundDoc = await ensureDoc('Smoke Reagents', rawFor('Contains'));
      await sourcePack.configure({ locked: true });
      if (!game.packs.get(`world.${packName}`)?.locked) {
        throw new Error('issue 800: the fixture pack must be LOCKED — that is the case under test');
      }

      // Snapshot what we are about to mutate so the fixture can be restored: every
      // later manager/crafting/gathering frame shares this component.
      const restore800 = {
        componentId: component.id,
        registeredItemUuid: component.registeredItemUuid,
        originItemUuid: component.originItemUuid,
        aliasItemUuids: [...(component.aliasItemUuids ?? [])],
        name: component.name,
        img: component.img,
        description: component.description,
      };
      // eslint-disable-next-line unicorn/no-global-object-property-assignment -- a page handle the walk re-assigns and deletes; defineProperty would freeze it.
      globalThis.__fabricateSmoke800Restore = restore800;

      // Point the component at the locked source and seed the RAW stored text,
      // which is exactly the state a world upgraded from an earlier version is in.
      component.registeredItemUuid = boundDoc.uuid;
      component.originItemUuid = boundDoc.uuid;
      component.aliasItemUuids = [];
      component.description = rawFor('Craft');
      await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
      return {
        componentId: component.id,
        unboundSourceUuid: unboundDoc.uuid,
        firstName: first.name,
        secondName: second.name,
        gatedSecret: GATED_SECRET,
      };
    }, craftingSetup.systemId);

    const inspectorFlavour = () =>
      page
        .locator(
          '.fabricate-manager [data-component-inspector] .manager-component-browser-inspector-flavour'
        )
        .first();
    const componentSearch = () =>
      page.getByRole('searchbox', { name: 'Search components' }).first();
    const selectComponent = async (componentId) => {
      const componentName = await page.evaluate(
        ({ systemId, id }) =>
          game.fabricate
            .getCraftingSystemManager()
            .getSystem(systemId)
            ?.components?.find((component) => component?.id === id)?.name ?? null,
        { systemId: craftingSetup.systemId, id: componentId }
      );
      if (!componentName) {
        throw new Error(`issue 800: component ${componentId} is absent from the owning system`);
      }
      // Components are paginated. Search by resolved identity before clicking
      // so a newly ingested component cannot be hidden on another page.
      await componentSearch().fill(componentName);
      const identity = page
        .locator(
          `.fabricate-manager .manager-component-row[data-component-id="${componentId}"] .manager-component-identity`
        )
        .first();
      await identity.waitFor({ state: 'visible', timeout: 5000 });
      await identity.click();
      await inspectorFlavour().waitFor({ state: 'visible', timeout: 5000 });
      return ((await inspectorFlavour().textContent()) ?? '').trim();
    };
    const assertResolved = (text, frame) => {
      if (/@[A-Za-z]+\[|&[A-Za-z]+\[/.test(text)) {
        throw new Error(`issue 800 (${frame}): raw directive text survived: ${text}`);
      }
      for (const expected of [enricher800.firstName, enricher800.secondName, '1d4 rounds', '2d6']) {
        if (!text.includes(expected)) {
          throw new Error(`issue 800 (${frame}): expected "${expected}" in: ${text}`);
        }
      }
      if (text.includes('Unknown')) {
        throw new Error(`issue 800 (${frame}): the broken-reference placeholder leaked: ${text}`);
      }
      // The privacy scrub, exercised against a REAL Foundry render rather than only
      // against happy-dom fixtures. This is the highest-consequence assertion here.
      if (text.includes(enricher800.gatedSecret)) {
        throw new Error(
          `issue 800 (${frame}): GM-gated content reached a stored, player-visible description: ${text}`
        );
      }
      if (/[,;:]\s*\./.test(text)) {
        throw new Error(
          `issue 800 (${frame}): a separator was left stranded against a full stop: ${text}`
        );
      }
    };

    // Frame 1 — BEFORE. The un-repaired world, raw directives visible.
    const beforeText = await selectComponent(enricher800.componentId);
    if (!beforeText.includes('@UUID[')) {
      throw new Error(`issue 800 (before): expected the un-repaired raw text, got: ${beforeText}`);
    }
    await assertNoScreenshotOverlays(page);
    await screenshot(page, 'manager-components-description-before');
    process.stdout.write('  D0: components description BEFORE screenshotted\n');

    // Frame 2 — AFTER the GM Repair Item Data action, which reaches the locked pack.
    await page.evaluate(async () => {
      const summary = await game.fabricate.getCraftingSystemManager().repairItemData();
      if (!(summary?.descriptions?.refreshed > 0)) {
        throw new Error(
          `issue 800: repair refreshed no descriptions: ${JSON.stringify(summary?.descriptions)}`
        );
      }
      await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
    });
    const repairedText = await selectComponent(enricher800.componentId);
    assertResolved(repairedText, 'after repair');
    await assertNoScreenshotOverlays(page);
    await screenshot(page, 'manager-components-description-repaired');
    process.stdout.write('  D0: components description AFTER-REPAIR screenshotted\n');

    // Frame 3 — AFTER ingestion. Registering the UNBOUND locked-pack item drives the
    // async write path (`_buildComponentSourceSnapshot`) and must create, not upsert.
    const ingestedComponentId = await page.evaluate(
      async ({ sysId, sourceUuid }) => {
        const result = await game.fabricate
          .getCraftingSystemManager()
          .addItemFromUuid(sysId, sourceUuid);
        if (result?.action !== 'added') {
          throw new Error(
            `issue 800: expected ingestion to CREATE a component, got action="${result?.action}" — the fixture source must not already be bound to one`
          );
        }
        await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
        return result?.item?.id ?? null;
      },
      { sysId: craftingSetup.systemId, sourceUuid: enricher800.unboundSourceUuid }
    );
    if (!ingestedComponentId || ingestedComponentId === enricher800.componentId) {
      throw new Error('issue 800: ingestion did not yield a distinct new component id');
    }
    const ingestedText = await selectComponent(ingestedComponentId);
    assertResolved(ingestedText, 'after ingestion');
    await assertNoScreenshotOverlays(page);
    await screenshot(page, 'manager-components-description-ingested');
    process.stdout.write('  D0: components description AFTER-INGESTION screenshotted\n');

    // Restore the fixture.
    await page.evaluate(
      async ({ sysId, ingestedId }) => {
        const csm = game.fabricate.getCraftingSystemManager();
        await csm.deleteItem(sysId, ingestedId);
        const restore = globalThis.__fabricateSmoke800Restore;
        const component = csm
          .getSystem(sysId)
          ?.components?.find((c) => c.id === restore?.componentId);
        if (restore && component) {
          Object.assign(component, {
            registeredItemUuid: restore.registeredItemUuid,
            originItemUuid: restore.originItemUuid,
            aliasItemUuids: restore.aliasItemUuids,
            name: restore.name,
            img: restore.img,
            description: restore.description,
          });
          await csm.save();
        }
        delete globalThis.__fabricateSmoke800Restore;
        await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
      },
      { sysId: craftingSetup.systemId, ingestedId: ingestedComponentId }
    );
    await componentSearch().fill('Mystic Herb');
    await page
      .locator('.fabricate-manager .manager-component-row:has-text("Mystic Herb")')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });
    process.stdout.write('  D0: components description fixture restored\n');

    // Components → open the editor so the identity card (central column) and the
    // linked-source inspector (right context panel) are captured (#398).
    await componentSearch().fill('Iron Ore');
    await page
      .locator(
        '.fabricate-manager .manager-component-row:has-text("Iron Ore") button:has(i.fa-pen)'
      )
      .first()
      .click();
    await page
      .locator('.fabricate-manager[data-manager-view="component-edit"]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });
    await page
      .locator('.fabricate-manager [data-component-edit-section="identity"]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });
    await page
      .locator('.fabricate-manager [data-component-edit-section="source"]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });
    await assertManagerLayoutStable(page, 'component edit normal');
    await assertNoScreenshotOverlays(page);
    await screenshot(page, 'manager-component-edit-normal');
    process.stdout.write('  D0: component edit normal screenshotted\n');

    // Component editor → salvage authoring section (per-component result groups, routed outcome
    // routing, and DC override).
    const salvageSection = page
      .locator('.fabricate-manager [data-component-edit-section="salvage"]')
      .first();
    await salvageSection.waitFor({ state: 'visible', timeout: 5000 });
    await page
      .locator('.fabricate-manager [data-salvage-routing]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });
    await salvageSection.scrollIntoViewIfNeeded();
    await assertNoScreenshotOverlays(page);
    await screenshot(page, 'manager-component-edit-salvage');
    process.stdout.write('  D0: component edit salvage screenshotted\n');

    // Return to the components browser for the remaining navigation.
    await page.locator(railSelector('manager-nav-component-rules')).click();
    await page
      .locator('.fabricate-manager[data-manager-view="components"]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });
    await componentSearch().fill('Iron Sword');

    // The off salvage body (issue 676, AC4).
    await page
      .locator(
        '.fabricate-manager .manager-component-row:has-text("Iron Sword") button:has(i.fa-pen)'
      )
      .first()
      .click();
    await page
      .locator('.fabricate-manager[data-manager-view="component-edit"]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });
    const offSalvageSection = page
      .locator('.fabricate-manager [data-component-edit-section="salvage"]')
      .first();
    await offSalvageSection.waitFor({ state: 'visible', timeout: 5000 });
    await page
      .locator('.fabricate-manager [data-salvage-disabled-notice]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });
    await offSalvageSection.scrollIntoViewIfNeeded();
    await assertNoScreenshotOverlays(page);
    await screenshot(page, 'manager-component-edit-salvage-off');
    process.stdout.write('  D0: component edit salvage (off) screenshotted\n');

    await page.locator(railSelector('manager-nav-component-rules')).click();
    await page
      .locator('.fabricate-manager[data-manager-view="components"]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });

    // Issue 764: the Simple-mode salvage editor at its one-success-group cap. The two frames
    // above are the routed Arcane Forge salvage editor (multi-group + routing).
    await softClick(page.locator('.fabricate-manager .manager-scope-return'));
    await selectSmokeSystemInManager(page, executionFixtures.simple.systemId);
    await page.locator(railSelector('manager-nav-component-rules')).click();
    await page
      .locator('.fabricate-manager[data-manager-view="components"]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });
    await componentSearch().fill('Smoke Relic');
    await page
      .locator(
        '.fabricate-manager .manager-component-row:has-text("Smoke Relic") button:has(i.fa-pen)'
      )
      .first()
      .click();
    await page
      .locator('.fabricate-manager[data-manager-view="component-edit"]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });
    const simpleSalvageSection = page
      .locator('.fabricate-manager [data-component-edit-section="salvage"]')
      .first();
    await simpleSalvageSection.waitFor({ state: 'visible', timeout: 5000 });
    await page
      .locator('.fabricate-manager [data-salvage-simple-hint]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });
    await simpleSalvageSection.scrollIntoViewIfNeeded();
    await assertNoScreenshotOverlays(page);
    await screenshot(page, 'manager-component-edit-salvage-simple');
    process.stdout.write('  D0: component edit salvage (simple cap) screenshotted\n');

    // Return to the Arcane Forge system so the remaining Phase D0 captures run against
    // the fully-seeded routed system they expect.
    await softClick(page.locator('.fabricate-manager .manager-scope-return'));
    await selectSmokeSystemInManager(page, craftingSetup.systemId);
    await page.locator(railSelector('manager-nav-component-rules')).click();
    await page
      .locator('.fabricate-manager[data-manager-view="components"]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });

    // Checks → Gathering check editor (#437).
    const prevGatheringMode = await page.evaluate(async (sysId) => {
      const economy = game.fabricate.getGatheringEconomy?.({ systemId: sysId }) || {};
      const prev = economy.resolutionMode || 'd100';
      await game.fabricate.setGatheringEconomy?.({
        systemId: sysId,
        economy: { ...economy, resolutionMode: 'routed' },
      });
      return prev;
    }, craftingSetup.systemId);
    await page.evaluate(async () => {
      await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
    });
    // `roll` NAMED rather than taken by default (issue 1096): it is the route's landing
    // section and the one the View Lab case for this same label publishes, and naming it
    // keeps the frame the same picture whatever an earlier checks visit selected.
    await openChecksActivity(page, 'gathering', 'roll');
    await page
      .locator('.fabricate-manager [data-checks-panel="gathering"] [data-crafting-check-editor]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });
    await assertManagerLayoutStable(page, 'checks gathering editor');
    await assertNoScreenshotOverlays(page);
    await screenshot(page, 'manager-checks-gathering');
    process.stdout.write('  D0: checks gathering editor screenshotted\n');
    await page.evaluate(
      async (args) => {
        const economy = game.fabricate.getGatheringEconomy?.({ systemId: args.sysId }) || {};
        await game.fabricate.setGatheringEconomy?.({
          systemId: args.sysId,
          economy: { ...economy, resolutionMode: args.prev },
        });
      },
      { sysId: craftingSetup.systemId, prev: prevGatheringMode }
    );
    await page.evaluate(async () => {
      await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
    });

    // Checks → Validation route (#485): the per-check readiness checklist plus severity-grouped
    // issues for the in-play subsystem checks.
    await openChecksActivity(page, 'validation');
    await page
      .locator('.fabricate-manager [data-checks-panel="validation"]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });
    await page
      .locator('.fabricate-manager [data-checks-validation-section="crafting"]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });
    await assertManagerLayoutStable(page, 'checks validation tab');
    await assertNoScreenshotOverlays(page);
    await screenshot(page, 'manager-checks-validation');
    process.stdout.write('  D0: checks validation tab screenshotted\n');

    // Checks → Crafting route, at the failure-consumption controls (issue #752 — evidence for
    // #736's #712 half).
    try {
      // Land on `roll` first and assert the editor there, then move to the section that owns
      // the consumption card.
      await openChecksActivity(page, 'crafting', 'roll');
      const craftingCheckEditor = page
        .locator('.fabricate-manager [data-checks-panel="crafting"] [data-crafting-check-editor]')
        .first();
      await craftingCheckEditor.waitFor({ state: 'visible', timeout: 5000 });
      await openChecksSection(page, 'on-failure');
      // Issue 712's failure-consumption card is a SIBLING of the check editor
      // inside the crafting panel, so anchor on it directly when present and
      // fall back to the editor's last section on builds that predate it.
      const consumptionCard = page
        .locator('.fabricate-manager [data-checks-panel="crafting"] [data-failure-consumption]')
        .first();
      if ((await consumptionCard.count()) > 0) {
        await consumptionCard.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
      } else {
        await craftingCheckEditor
          .locator('section')
          .last()
          .scrollIntoViewIfNeeded({ timeout: 5000 })
          .catch(() => {});
      }
      await assertNoScreenshotOverlays(page);
      await screenshot(page, 'manager-checks-crafting-consumption');
      process.stdout.write('  D0: checks crafting consumption screenshotted\n');
      results.steps.push({ step: 'checks-crafting-consumption', passed: true });
    } catch (error) {
      results.steps.push({
        step: 'checks-crafting-consumption',
        passed: false,
        error: error.message,
      });
      process.stderr.write(`Checks crafting consumption capture failed: ${error.message}\n`);
    }

    // Checks → Crafting tab, scrolled to the check-modifier catalogue card (issue 770, re-aimed
    // by issue 1055).
    try {
      // The catalogue card is the crafting route's MODIFIERS section (issue 1096) — it
      // used to be the last card on the same scrolling page as the consumption policy,
      // which is why the frame above no longer leaves it merely below the fold.
      await openChecksSection(page, 'modifiers');
      const modifierCard = page
        .locator(
          '.fabricate-manager [data-checks-panel="crafting"] [data-crafting-modifier-catalogue]'
        )
        .first();
      await modifierCard.waitFor({ state: 'visible', timeout: 5000 });
      // Scroll to the pick-cap field, not the card top: the card authors both the four-option
      // combination rule and, under the two rules that defer the selection, the
      // `maxModifierPicks` cap (issue 1055).
      const maxPicksField = modifierCard.locator('[data-crafting-modifier-max-picks]').first();
      await maxPicksField.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
      await assertNoScreenshotOverlays(page);
      await screenshot(page, 'manager-checks-crafting-modifiers');
      process.stdout.write('  D0: checks crafting modifiers screenshotted\n');
      results.steps.push({ step: 'checks-crafting-modifiers', passed: true });
    } catch (error) {
      results.steps.push({
        step: 'checks-crafting-modifiers',
        passed: false,
        error: error.message,
      });
      process.stderr.write(`Checks crafting modifiers capture failed: ${error.message}\n`);
    }

    await page.locator(railSelector('manager-nav-component-rules')).click();
    await page
      .locator('.fabricate-manager[data-manager-view="components"]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });

    // Components → stacked. Earlier CI runs hung silently between this resize and the next
    // screenshot for ~13 minutes.
    await setManagerWindowSize(page, { width: 1000, height: 700 });
    process.stdout.write('  D0: components stacked resize complete\n');
    await assertManagerLayoutStable(page, 'components stacked');
    process.stdout.write('  D0: components stacked layout asserted\n');
    await assertNoScreenshotOverlays(page);
    await screenshot(page, 'manager-components-stacked');
    process.stdout.write('  D0: components stacked screenshotted\n');

    await setManagerWindowSize(page, { width: 1280, height: 820 });

    // Issue 801 — the grouped-category continuation frame for the component library.
    const openComponentsBrowser = async () => {
      await page.locator(railSelector('manager-nav-component-rules')).click();
      await page
        .locator('.fabricate-manager[data-manager-view="components"]')
        .first()
        .waitFor({ state: 'visible', timeout: 5000 });
    };
    await captureGroupedContinuationFrame(ctx, {
      stepName: 'components-grouped-continuation',
      failMessage: 'Components grouped continuation capture failed',
      layout: 'components grouped continuation',
      label: 'manager-components-grouped-continuation',
      groupCountSelector: '.fabricate-manager .manager-component-group .fab-group-count',
      openBrowser: openComponentsBrowser,
      settle: () => page.waitForTimeout(300),
      settleAfterReset: () => page.waitForTimeout(200),
      seed: () =>
        page.evaluate(async (sysId) => {
          const csm = game.fabricate.getCraftingSystemManager();
          const rawItemTypes = game.documentTypes?.Item ?? game.system?.documentTypes?.Item ?? [];
          const itemTypes = [...rawItemTypes];
          const itemType = itemTypes.includes('loot') ? 'loot' : itemTypes[0] || 'loot';
          const specs = Array.from({ length: 14 }, (_, index) => ({
            name: `Continuation Reagent ${String(index + 1).padStart(2, '0')}`,
            type: itemType,
            img: 'icons/commodities/materials/bowl-powder-teal.webp',
          }));
          const items = await Item.createDocuments(specs);
          const componentIds = [];
          for (const item of items) {
            const result = await csm.addItemFromUuid(sysId, item.uuid);
            await csm.updateItem(sysId, result.item.id, { category: 'Aaa Continuation' });
            componentIds.push(result.item.id);
          }
          await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
          return { componentIds, itemIds: items.map((item) => item.id) };
        }, craftingSetup.systemId),
      hasSeed: (handle) => handle.componentIds.length > 0 || handle.itemIds.length > 0,
      cleanup: (handle) =>
        page.evaluate(
          async ({ sysId, componentIds, itemIds }) => {
            const csm = game.fabricate.getCraftingSystemManager();
            for (const id of componentIds) {
              await csm.deleteItem(sysId, id).catch(() => {});
            }
            const items = itemIds.map((id) => game.items.get(id)).filter(Boolean);
            if (items.length > 0) {
              await Item.deleteDocuments(items.map((item) => item.id)).catch(() => {});
            }
            await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
          },
          {
            sysId: craftingSetup.systemId,
            componentIds: handle.componentIds,
            itemIds: handle.itemIds,
          }
        ),
    });
  },
};
