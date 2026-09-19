/**
 * The issue-#489 craft-execution and full-profile gather assertions phase E runs after the craft.
 */

export async function runCraftExecutionAsserts(page, fixtures, crafterId) {
  return await page.evaluate(async ({ fixtures, crafterId }) => {
    const steps = [];
    const record = (step, passed, error) => steps.push({ step, passed, ...(error ? { error } : {}) });

    const engine = game.fabricate.getCraftingEngine();
    const rm = game.fabricate.getRecipeManager();
    const crafter = game.actors.get(crafterId);

    const countByName = (name) => crafter.items.contents
      .filter((i) => i.name === name)
      .reduce((sum, i) => sum + (Number(i.system?.quantity) || 1), 0);
    const toolItem = (name) => crafter.items.contents.find((i) => i.name === name) || null;
    // Mirror src/gatheringToolRuntime.js isToolBroken so the assertion reads the
    // flag through the same defensive accessors the runtime writes/reads it with.
    const isBroken = (item) =>
      item?.getFlag?.('fabricate', 'toolBroken') === true
      || item?.getFlag?.('fabricate', 'fabricate.toolBroken') === true
      || foundry.utils.getProperty(item, 'flags.fabricate.toolBroken') === true
      || foundry.utils.getProperty(item, 'flags.fabricate.fabricate.toolBroken') === true;

    // ── simple craft ────────────────────────────────────────────────────────
    try {
      const before = countByName('Smoke Crate');
      const recipe = rm.getRecipe(fixtures.simple.simpleRecipeId);
      const result = await game.fabricate.craft(crafter, recipe, { componentSourceActors: [crafter] });
      const after = countByName('Smoke Crate');
      if (!result.success) throw new Error(`craft failed: ${result.message}`);
      if (after !== before + 1) throw new Error(`Smoke Crate inventory ${before} -> ${after}, expected +1`);
      record('exec-craft-simple', true);
    } catch (err) {
      record('exec-craft-simple', false, err.message);
    }

    // ── routedByCheck multi-group (Masterwork produced, Standard NOT) ────────
    try {
      const masterBefore = countByName('Smoke Masterwork Blade');
      const standardBefore = countByName('Smoke Standard Blade');
      const recipe = rm.getRecipe(fixtures.checkRouted.recipeId);
      const result = await game.fabricate.craft(crafter, recipe, { componentSourceActors: [crafter] });
      const masterAfter = countByName('Smoke Masterwork Blade');
      const standardAfter = countByName('Smoke Standard Blade');
      if (!result.success) throw new Error(`craft failed: ${result.message}`);
      if (masterAfter !== masterBefore + 1) {
        throw new Error(`Masterwork Blade ${masterBefore} -> ${masterAfter}, expected +1 (selected tier group)`);
      }
      if (standardAfter !== standardBefore) {
        throw new Error(`Standard Blade ${standardBefore} -> ${standardAfter}, expected unchanged (unselected tier group)`);
      }
      record('exec-craft-routed-by-check', true);
    } catch (err) {
      record('exec-craft-routed-by-check', false, err.message);
    }

    // The chosen set (set B) maps to the Amulet group, which is resultGroups[1] — NOT the first
    // group — so this fails against an "always emit resultGroups[0]" bug, proving set→group routing
    // selects a non-index-0 group.
    try {
      const ringBefore = countByName('Smoke Ring');
      const amuletBefore = countByName('Smoke Amulet');
      const recipe = rm.getRecipe(fixtures.ingredientRouted.recipeId);
      const result = await game.fabricate.craft(crafter, recipe, {
        componentSourceActors: [crafter],
        ingredientSetId: fixtures.ingredientRouted.chosenSetId
      });
      const ringAfter = countByName('Smoke Ring');
      const amuletAfter = countByName('Smoke Amulet');
      if (!result.success) throw new Error(`craft failed: ${result.message}`);
      if (amuletAfter !== amuletBefore + 1) {
        throw new Error(`Smoke Amulet ${amuletBefore} -> ${amuletAfter}, expected +1 (chosen set's non-first group)`);
      }
      if (ringAfter !== ringBefore) {
        throw new Error(`Smoke Ring ${ringBefore} -> ${ringAfter}, expected unchanged (other set's group / resultGroups[0])`);
      }
      record('exec-craft-routed-by-ingredients', true);
    } catch (err) {
      record('exec-craft-routed-by-ingredients', false, err.message);
    }

    // ── progressive (single deterministic advance awards the result) ─────────
    try {
      const before = countByName('Smoke Brick');
      const recipe = rm.getRecipe(fixtures.progressive.recipeId);
      const result = await game.fabricate.craft(crafter, recipe, { componentSourceActors: [crafter] });
      const after = countByName('Smoke Brick');
      if (!result.success) throw new Error(`craft failed: ${result.message}`);
      if (after !== before + 1) throw new Error(`Smoke Brick ${before} -> ${after}, expected +1`);
      record('exec-craft-progressive', true);
    } catch (err) {
      record('exec-craft-progressive', false, err.message);
    }

    // ── breakageChance tool break (flagBroken + " (broken)" suffix) ──────────
    try {
      const recipe = rm.getRecipe(fixtures.simple.breakageRecipeId);
      const result = await game.fabricate.craft(crafter, recipe, { componentSourceActors: [crafter] });
      if (!result.success) throw new Error(`craft failed: ${result.message}`);
      const mallet = toolItem('Smoke Mallet (broken)') || toolItem('Smoke Mallet');
      if (!mallet) throw new Error('Smoke Mallet tool item not found after craft');
      if (!isBroken(mallet)) {
        throw new Error('Smoke Mallet toolBroken flag not set after breakageChance craft');
      }
      if (!mallet.name.endsWith(' (broken)')) {
        throw new Error(`Smoke Mallet name "${mallet.name}" missing " (broken)" suffix`);
      }
      record('exec-tool-breakage-chance', true);
    } catch (err) {
      record('exec-tool-breakage-chance', false, err.message);
    }

    // MaxUses is 2: craft twice. The first (post-increment timesUsed 1 < 2) must NOT break; the
    // second (timesUsed 2 >= 2) crosses the threshold and breaks.
    try {
      const recipe = rm.getRecipe(fixtures.simple.limitedUsesRecipeId);
      const first = await game.fabricate.craft(crafter, recipe, { componentSourceActors: [crafter] });
      if (!first.success) throw new Error(`first craft failed: ${first.message}`);
      const chiselAfterFirst = toolItem('Smoke Chisel (broken)') || toolItem('Smoke Chisel');
      if (!chiselAfterFirst) throw new Error('Smoke Chisel tool item not found after first craft');
      if (isBroken(chiselAfterFirst)) {
        throw new Error('Smoke Chisel broke before reaching maxUses (sub-threshold craft)');
      }
      const second = await game.fabricate.craft(crafter, recipe, { componentSourceActors: [crafter] });
      if (!second.success) throw new Error(`second craft failed: ${second.message}`);
      const chisel = toolItem('Smoke Chisel (broken)') || toolItem('Smoke Chisel');
      if (!chisel) throw new Error('Smoke Chisel tool item not found after second craft');
      if (!isBroken(chisel)) {
        throw new Error('Smoke Chisel toolBroken flag not set at maxUses threshold craft');
      }
      if (!chisel.name.endsWith(' (broken)')) {
        throw new Error(`Smoke Chisel name "${chisel.name}" missing " (broken)" suffix`);
      }
      record('exec-tool-breakage-limited-uses', true);
    } catch (err) {
      record('exec-tool-breakage-limited-uses', false, err.message);
    }

    // ── negative tool-gating (required tool absent → success:false) ──────────
    try {
      const recipe = rm.getRecipe(fixtures.simple.negativeToolRecipeId);
      const bracketBefore = countByName('Smoke Bracket');
      const result = await game.fabricate.craft(crafter, recipe, { componentSourceActors: [crafter] });
      const bracketAfter = countByName('Smoke Bracket');
      if (result.success !== false) throw new Error('craft succeeded but the required tool is absent');
      if (!/tool/i.test(result.message || '')) {
        throw new Error(`failure message "${result.message}" is not a tool-gating reason`);
      }
      if (bracketAfter !== bracketBefore) {
        throw new Error(`Smoke Bracket ${bracketBefore} -> ${bracketAfter}, expected no product on gated craft`);
      }
      record('exec-negative-tool-gating', true);
    } catch (err) {
      record('exec-negative-tool-gating', false, err.message);
    }

    // ── salvage (results non-null + result component lands in inventory) ─────
    try {
      const shardBefore = countByName('Smoke Shard');
      const result = await engine.salvage(
        crafter.uuid,
        fixtures.simple.systemId,
        fixtures.simple.relicComponentId,
        { skipTimeGate: true }
      );
      const shardAfter = countByName('Smoke Shard');
      if (!result.success) throw new Error(`salvage failed: ${result.message}`);
      if (result.results == null) throw new Error('salvage results is null (expected non-null)');
      if (shardAfter <= shardBefore) {
        throw new Error(`Smoke Shard ${shardBefore} -> ${shardAfter}, expected increase from salvage`);
      }
      record('exec-salvage-run', true);
    } catch (err) {
      record('exec-salvage-run', false, err.message);
    }

    // ── guaranteed-success gather (inventory increase via startGatheringAttempt) ─
    try {
      await game.fabricate.setSelectedGatheringActorId(crafterId);
      const before = countByName('Mystic Herb');
      const result = await game.fabricate.startGatheringAttempt({
        rememberedActorId: crafterId,
        environmentId: fixtures.gather.environmentId,
        taskId: fixtures.gather.taskId
      });
      const after = countByName('Mystic Herb');
      if (result?.accepted !== true) {
        const reason = result?.blockedReasons?.[0]?.code || result?.blockedReasons?.[0] || 'unknown';
        throw new Error(`gather not accepted (state=${result?.state}, blocked=${JSON.stringify(reason)})`);
      }
      if (after <= before) {
        throw new Error(`Mystic Herb ${before} -> ${after}, expected increase from guaranteed-success gather`);
      }
      record('exec-gather-inventory-delta', true);
    } catch (err) {
      record('exec-gather-inventory-delta', false, err.message);
    }

    return steps;
  }, { fixtures, crafterId });
}

/**
 * Full-profile-only gather assertions for issue #489: the seeded 0%-drop ("empty") gather, the
 * scene-blocked gather, and the hazardous "Bramble Snare" event firing.
 */
export async function runFullProfileGatherAsserts(page, craftingSetup, gatherFixture, crafterId) {
  return await page.evaluate(async ({ arcaneSystemId, hazardEnvironmentId, hazardTaskId, crafterId }) => {
    const steps = [];
    const record = (step, passed, error) => steps.push({ step, passed, ...(error ? { error } : {}) });
    const crafter = game.actors.get(crafterId);
    await game.fabricate.setSelectedGatheringActorId(crafterId);
    const countByName = (name) => crafter.items.contents
      .filter((i) => i.name === name)
      .reduce((sum, i) => sum + (Number(i.system?.quantity) || 1), 0);

    const environmentStore = game.fabricate.getGatheringEnvironmentStore();
    const envByName = (name) =>
      (environmentStore.list?.() || []).find((env) => env?.name === name) || null;

    // ── 0%-drop ("empty") gather: accepted, but no items awarded ─────────────
    try {
      const witheredEnv = envByName('Withered Patch');
      if (!witheredEnv) throw new Error('Withered Patch environment not seeded (full profile)');
      const before = countByName('Mystic Herb');
      const result = await game.fabricate.startGatheringAttempt({
        rememberedActorId: crafterId,
        environmentId: witheredEnv.id,
        taskId: 'smoke-withered-search'
      });
      const after = countByName('Mystic Herb');
      if (result?.accepted !== true) {
        throw new Error(`empty gather not accepted (state=${result?.state})`);
      }
      const created = Array.isArray(result.createdResults) ? result.createdResults : [];
      if (created.length !== 0 || after !== before) {
        throw new Error(`0%-drop gather awarded items (createdResults=${created.length}, inv ${before}->${after})`);
      }
      record('exec-gather-empty', true);
    } catch (err) {
      record('exec-gather-empty', false, err.message);
    }

    // ── scene-blocked gather: not accepted, scene-block reason ───────────────
    try {
      const sunkenEnv = envByName('Sunken Ruins');
      if (!sunkenEnv) throw new Error('Sunken Ruins environment not seeded (full profile)');
      const result = await game.fabricate.startGatheringAttempt({
        rememberedActorId: crafterId,
        environmentId: sunkenEnv.id,
        taskId: 'smoke-sunken-survey'
      });
      if (result?.accepted === true) throw new Error('scene-blocked gather was accepted');
      const reasons = JSON.stringify(result?.blockedReasons || []);
      if (!/SCENE/i.test(reasons)) {
        throw new Error(`scene-blocked gather reason not scene-related: ${reasons}`);
      }
      record('exec-gather-scene-blocked', true);
    } catch (err) {
      record('exec-gather-scene-blocked', false, err.message);
    }

    // ── hazardous "Bramble Snare" event fires (deterministic dropRate) ───────
    try {
      // Force the seeded hazardous event to fire deterministically: raise its dropRate to 100 for
      // this assertion (restored afterwards) so the d100 event throw always lands.
      const config = foundry.utils.deepClone(game.settings.get('fabricate', 'gatheringConfig') || {});
      const systemConfig = config.systems?.[arcaneSystemId] || {};
      const events = Array.isArray(systemConfig.events) ? systemConfig.events : [];
      const brambleIndex = events.findIndex((event) => event?.id === 'smoke-bramble-event');
      if (brambleIndex < 0) throw new Error('smoke-bramble-event not seeded (full profile)');
      const originalDropRate = events[brambleIndex].dropRate;
      events[brambleIndex] = { ...events[brambleIndex], dropRate: 100 };
      config.systems[arcaneSystemId] = { ...systemConfig, events };
      await game.settings.set('fabricate', 'gatheringConfig', config);
      try {
        const result = await game.fabricate.startGatheringAttempt({
          rememberedActorId: crafterId,
          environmentId: hazardEnvironmentId,
          taskId: hazardTaskId
        });
        if (result?.accepted !== true) throw new Error(`hazard gather not accepted (state=${result?.state})`);
        const firedEvents = result?.checkResult?.events || [];
        const fired = firedEvents.some((event) => event?.id === 'smoke-bramble-event')
          || JSON.stringify(firedEvents).includes('Bramble Snare');
        if (!fired) {
          throw new Error(`Bramble Snare did not fire (events=${JSON.stringify(firedEvents)})`);
        }
        record('exec-gather-hazard-event', true);
      } finally {
        const restore = foundry.utils.deepClone(game.settings.get('fabricate', 'gatheringConfig') || {});
        const restoreSystem = restore.systems?.[arcaneSystemId] || {};
        const restoreEvents = Array.isArray(restoreSystem.events) ? restoreSystem.events : [];
        const idx = restoreEvents.findIndex((event) => event?.id === 'smoke-bramble-event');
        if (idx >= 0) {
          restoreEvents[idx] = { ...restoreEvents[idx], dropRate: originalDropRate };
          restore.systems[arcaneSystemId] = { ...restoreSystem, events: restoreEvents };
          await game.settings.set('fabricate', 'gatheringConfig', restore);
        }
      }
    } catch (err) {
      record('exec-gather-hazard-event', false, err.message);
    }

    return steps;
  }, {
    arcaneSystemId: craftingSetup.systemId,
    hazardEnvironmentId: gatherFixture.environmentId,
    hazardTaskId: gatherFixture.taskId,
    crafterId
  });
}
