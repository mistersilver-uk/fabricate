/*
 * Manually revert one world from per-record crafting-definition storage back to whole-array
 * storage. Paste this whole file into the browser console of the world, logged in as the
 * primary GM, with Fabricate active.
 *
 * WHY THIS EXISTS
 * ---------------
 * Per-record storage (issue 1080, ADR 0001) was measured against a live client by issue 1255,
 * lost on connect payload at every corpus size, and was reverted by ADR 0003. It never reached
 * a public release, so the only worlds that ever converted are development worlds. This script
 * is the whole migration story for them: one operator, one paste, no shipped revert build and
 * no release tail.
 *
 * WHAT IT DOES
 * ------------
 * Nothing new. It drives the reverse conversion Fabricate already ships
 * (`runReverseRecipeStorageConversion` / `runReverseComponentStorageConversion`) by writing the
 * two storage TARGET settings, exactly as a GM would from the settings menu, and then awaiting
 * the reconciler directly instead of relying on the debounced hook. Every guard, refusal and
 * crash-recovery path in that conversion still applies; this file adds a census and a verdict
 * around it and no new write path of its own.
 *
 * The conversion is a four-step transaction per entity class: layout becomes `unsettled`, the
 * whole-array key is written from the per-record documents, the layout becomes `singleArray`,
 * and only then are the per-record documents reclaimed. An interrupted run resumes on the next
 * boot. That is the shipped behaviour and this script does not shortcut it.
 *
 * SAFETY
 * ------
 * - Read the BEFORE census it prints. If the recipe or component counts are not what you expect
 *   for this world, stop and do not continue; something else is wrong and the conversion is not
 *   the thing to reach for.
 * - Take a world backup first. This rewrites the corpus keys and then deletes documents.
 * - Run it in ONE client. It refuses unless you are the primary GM, because two clients
 *   converting one corpus concurrently is last-writer-wins over a half-moved corpus.
 * - It is idempotent. On an already-whole-array world it reports `already-single-array` and
 *   writes nothing.
 */

/*
 * eslint-disable-next-line unicorn/prefer-top-level-await -- the wrapper is not here for the
 * await. Every refusal below is an early `return`, and `return` is a syntax error at the top
 * level of a pasted console snippet, so a bare top-level form would have to nest the whole
 * script inside its own guards. The IIFE is what keeps the refusals flat and readable.
 */
/* eslint-disable-next-line unicorn/prefer-top-level-await */
(async () => {
  /*
   * Foundry's globals are read off `globalThis` rather than referenced bare, so this file is
   * clean under the repo's ESLint config even though it is not in the lint gate's file list
   * (`eslint.config.js` documents why that list stays narrow). It is pasted into a console, not
   * imported, so it must not carry an import of its own either.
   */
  const { game, console: out } = globalThis;

  const NAMESPACE = 'fabricate';
  const SINGLE_ARRAY = 'singleArray';
  const KEYS = {
    recipeTarget: 'recipeStorageTarget',
    recipeLayout: 'recipeStorageLayout',
    componentTarget: 'componentStorageTarget',
    componentLayout: 'componentStorageLayout',
    recipes: 'recipes',
    craftingSystems: 'craftingSystems',
  };
  const RECORD_PREFIXES = {
    recipes: `${NAMESPACE}.recipe.`,
    components: `${NAMESPACE}.component.`,
  };

  const line = (message) => out.log(`Fabricate revert | ${message}`);

  const get = (key) => {
    try {
      return game.settings.get(NAMESPACE, key);
    } catch (error) {
      return { __unreadable: String(error?.message ?? error) };
    }
  };

  /*
   * The per-record keys are deliberately UNREGISTERED — registering N of them is O(N^2) through
   * `ClientSettings.register`'s linear scan — so they are invisible to `game.settings.get` and
   * must be counted as documents in the world Setting collection.
   */
  const countRecords = (prefix) => {
    const collection = globalThis.game?.settings?.storage?.get('world');
    if (!collection) return null;
    let count = 0;
    for (const document of collection) {
      if (String(document?.key ?? '').startsWith(prefix)) count += 1;
    }
    return count;
  };

  const census = (label) => {
    const report = {
      recipeLayout: get(KEYS.recipeLayout),
      recipeTarget: get(KEYS.recipeTarget),
      componentLayout: get(KEYS.componentLayout),
      componentTarget: get(KEYS.componentTarget),
      wholeArrayRecipes: Array.isArray(get(KEYS.recipes)) ? get(KEYS.recipes).length : null,
      wholeArraySystems: Array.isArray(get(KEYS.craftingSystems))
        ? get(KEYS.craftingSystems).length
        : null,
      perRecordRecipeDocuments: countRecords(RECORD_PREFIXES.recipes),
      perRecordComponentDocuments: countRecords(RECORD_PREFIXES.components),
      /*
       * The live managers, which is what the UI actually shows. This is the number that must not
       * change: the corpus is the same corpus whichever way it is stored, so a difference here
       * between BEFORE and AFTER is data loss and nothing else.
       */
      liveRecipes: game.fabricate?.getRecipeManager?.()?.getRecipes?.()?.length ?? null,
      liveSystems: game.fabricate?.craftingSystemManager?.getSystems?.()?.length ?? null,
    };
    out.log(`Fabricate revert | ${label}`);
    out.table(report);
    return report;
  };

  if (!game.user?.isGM) {
    line('REFUSED: you are not a GM. Nothing was written.');
    return;
  }
  if (game.users?.activeGM?.id !== game.user?.id) {
    line(
      'REFUSED: you are not the PRIMARY GM, and two clients converting one corpus concurrently ' +
        'is last-writer-wins over a half-moved corpus. Nothing was written.'
    );
    return;
  }
  if (!game.fabricate?._reconcileDefinitionStorage) {
    line('REFUSED: Fabricate is not initialised in this world. Nothing was written.');
    return;
  }

  const before = census('BEFORE');

  const alreadyReverted =
    before.recipeLayout === SINGLE_ARRAY &&
    before.componentLayout === SINGLE_ARRAY &&
    before.recipeTarget === SINGLE_ARRAY &&
    before.componentTarget === SINGLE_ARRAY;
  if (alreadyReverted) {
    line('already-single-array: both classes are already whole-array. Nothing was written.');
    if (before.perRecordRecipeDocuments || before.perRecordComponentDocuments) {
      line(
        `NOTE: ${before.perRecordRecipeDocuments} recipe and ` +
          `${before.perRecordComponentDocuments} component record document(s) are still present. ` +
          'Those are reclaimable debris from an earlier run, not live storage. Re-run this ' +
          'script after a reload to let the reconciler reclaim them.'
      );
    }
    return;
  }

  /*
   * Writing the TARGET is the request. The LAYOUT is the conversion's own bookkeeping and is
   * never written by hand: writing it directly would fabricate a `singleArray` layout over a
   * corpus that is still per-record, which is exactly the state the conversion refuses to enter.
   */
  line('Writing both storage targets to `singleArray`...');
  if (before.recipeTarget !== SINGLE_ARRAY) {
    await game.settings.set(NAMESPACE, KEYS.recipeTarget, SINGLE_ARRAY);
  }
  if (before.componentTarget !== SINGLE_ARRAY) {
    await game.settings.set(NAMESPACE, KEYS.componentTarget, SINGLE_ARRAY);
  }

  /*
   * The settings-change bridge fires the same reconciler, but it does so as an unawaited `void`
   * call, so awaiting it here is the difference between a verdict and a guess.
   */
  line('Running the reverse conversion. On a 10,000-record corpus this takes minutes.');
  line('DO NOT close this tab or shut the world down until it reports a verdict.');
  await game.fabricate._reconcileDefinitionStorage();

  const after = census('AFTER');

  const problems = [];
  if (after.recipeLayout !== SINGLE_ARRAY) {
    problems.push(`recipe layout reads \`${after.recipeLayout}\`, not \`${SINGLE_ARRAY}\``);
  }
  if (after.componentLayout !== SINGLE_ARRAY) {
    problems.push(`component layout reads \`${after.componentLayout}\`, not \`${SINGLE_ARRAY}\``);
  }
  if (after.perRecordRecipeDocuments) {
    problems.push(`${after.perRecordRecipeDocuments} per-record recipe document(s) survived`);
  }
  if (after.perRecordComponentDocuments) {
    problems.push(`${after.perRecordComponentDocuments} per-record component document(s) survived`);
  }
  if (before.liveRecipes !== null && after.liveRecipes !== before.liveRecipes) {
    problems.push(`live recipe count moved ${before.liveRecipes} -> ${after.liveRecipes}`);
  }
  if (before.liveSystems !== null && after.liveSystems !== before.liveSystems) {
    problems.push(`live crafting system count moved ${before.liveSystems} -> ${after.liveSystems}`);
  }

  if (problems.length === 0) {
    line(
      `DONE. Whole-array storage restored with ${after.liveRecipes} recipe(s) and ` +
        `${after.liveSystems} crafting system(s) intact. Reload the world to confirm.`
    );
    return;
  }

  /*
   * A layout still reading `unsettled` is the expected shape of an INTERRUPTED run, not of a
   * failed one: the conversion is resumable by design and the next boot finishes it. Surviving
   * record documents after a settled `singleArray` layout are debris, which the reconciler
   * reclaims on the next pass. Neither means the corpus is gone — check `liveRecipes` above,
   * because that is the line that would say so.
   */
  line('INCOMPLETE. Reload the world and run this script again to resume:');
  for (const problem of problems) line(`  - ${problem}`);
})();
