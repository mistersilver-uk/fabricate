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
 * two storage TARGET settings, exactly as a GM would from the settings menu. Every guard,
 * refusal and crash-recovery path in that conversion still applies; this file adds a census, a
 * wait, and a verdict, and no new write path of its own.
 *
 * The conversion is a four-step transaction per entity class: layout becomes `unsettled`, the
 * whole-array key is written from the per-record documents, the layout becomes `singleArray`,
 * and only then are the per-record documents reclaimed. An interrupted run resumes on the next
 * boot. That is the shipped behaviour and this script does not shortcut it.
 *
 * IT WAITS RATHER THAN DRIVING THE RECONCILER ITSELF, AND THAT IS DELIBERATE
 * --------------------------------------------------------------------------
 * Writing a storage target fires Foundry's `updateSetting` hook, which `settingChangeBridge.js`
 * turns into `fabricate.recipeStorageLayoutChanged`, which `main.js` turns into an UNAWAITED
 * `void fabricate._reconcileDefinitionStorage()`. So each target write already starts a
 * conversion on its own.
 *
 * An earlier draft of this script wrote both targets and then awaited its own
 * `_reconcileDefinitionStorage()` call, to get a definite answer instead of a guess. That was
 * wrong: the explicit call runs IN ADDITION TO the two the bridge fired, not instead of them,
 * and nothing in the reconciler is reentrant. Two overlapping reverse conversions of the same
 * class can have one delete documents the other is still reclaiming, and a losing call's
 * generic catch compensates the layout key back to the value IT captured at ITS start —
 * potentially undoing a `singleArray` the winning call had already, correctly, written. That is
 * the exact "world claims an arrangement its storage no longer matches" state the conversion
 * spends its module header guarding against, and this script would have been the first caller
 * to reliably produce it. A GM clicking through the settings UI does not, because real human
 * latency separates the two saves.
 *
 * So: one target at a time, then WAIT for that class to reach a settled `singleArray` with no
 * per-record documents left. The wait is what produces the verdict, and no second conversion is
 * ever started.
 *
 * SAFETY
 * ------
 * - Read the BEFORE census it prints. If the recipe or component counts are not what you expect
 *   for this world, stop and do not continue; something else is wrong and the conversion is not
 *   the thing to reach for.
 * - Take a world backup first. This rewrites the corpus keys and then deletes documents.
 * - Run it in ONE client, and do not touch the storage settings in another client while it
 *   runs. It refuses unless you are the primary GM, but that gate cannot stop a second GM
 *   changing a target from the settings menu mid-run.
 * - It is idempotent. On an already-whole-array world with nothing left to reclaim it reports
 *   `already-single-array` and writes nothing.
 */

/*
 * The wrapper is not here for the await. Every refusal below is an early `return`, and `return`
 * is a syntax error at the top level of a pasted console snippet, so a bare top-level form would
 * have to nest the whole script inside its own guards. The IIFE is what keeps the refusals flat.
 */
/* eslint-disable-next-line unicorn/prefer-top-level-await -- see the note directly above */
(async () => {
  /*
   * Foundry's globals are read off `globalThis` rather than referenced bare, because this file is
   * in the lint gate's file list — `tests/scripts-lint-gate-coverage.test.js` requires every
   * `scripts/` file to be either linted or recorded as debt, and bare `game` is `no-undef` there.
   * It is pasted into a console rather than imported, so it must not carry an import of its own.
   */
  const { game, console: out } = globalThis;

  const NAMESPACE = 'fabricate';
  const SINGLE_ARRAY = 'singleArray';
  const PER_RECORD = 'perRecord';
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

  /* A 10,000-record class takes minutes, not seconds. Raise this if your corpus is larger. */
  const WAIT_TIMEOUT_MS = 45 * 60 * 1000;
  const POLL_INTERVAL_MS = 2000;
  const PROGRESS_EVERY_MS = 30_000;

  const line = (message) => out.log(`Fabricate revert | ${message}`);
  const sleep = (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms));

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
   *
   * `PerRecordCraftingDefinitionRepository#refreshIndex` additionally skips any document with a
   * `user`, because a user-scoped key could in principle collide with the prefix. No such key is
   * registered today, so the omission here is inert; it is called out because this is a second,
   * independent answer to "what counts as a per-record document" and the two could drift.
   */
  const countRecords = (prefix) => {
    const collection = game?.settings?.storage?.get('world');
    if (!collection) return null;
    let count = 0;
    for (const document of collection) {
      if (String(document?.key ?? '').startsWith(prefix)) count += 1;
    }
    return count;
  };

  /* Components live nested inside each crafting system once the corpus is whole-array again. */
  const countNestedComponents = () => {
    const systems = get(KEYS.craftingSystems);
    if (!Array.isArray(systems)) return null;
    return systems.reduce((total, system) => total + (system?.components?.length ?? 0), 0);
  };

  const census = (label) => {
    const report = {
      recipeLayout: get(KEYS.recipeLayout),
      recipeTarget: get(KEYS.recipeTarget),
      componentLayout: get(KEYS.componentLayout),
      componentTarget: get(KEYS.componentTarget),
      /*
       * GROUND TRUTH. These are direct reads of the stored corpus keys, and they are what the
       * verdict is gated on. The live manager counts below are read from an in-memory map that
       * the settings bridge refreshes with an UNJOINED `void Promise.resolve(rebuild)`, so at
       * AFTER time they can still hold the pre-conversion snapshot. Gating on them would let a
       * conversion that wrote a truncated or empty legacy array report success, which is the
       * one failure this census exists to catch.
       */
      wholeArrayRecipes: Array.isArray(get(KEYS.recipes)) ? get(KEYS.recipes).length : null,
      wholeArraySystems: Array.isArray(get(KEYS.craftingSystems))
        ? get(KEYS.craftingSystems).length
        : null,
      wholeArrayComponents: countNestedComponents(),
      perRecordRecipeDocuments: countRecords(RECORD_PREFIXES.recipes),
      perRecordComponentDocuments: countRecords(RECORD_PREFIXES.components),
      /* Informational only, for the reason given above. Never gated on. */
      liveRecipes: game.fabricate?.getRecipeManager?.()?.getRecipes?.()?.length ?? null,
      liveSystems: game.fabricate?.craftingSystemManager?.getSystems?.()?.length ?? null,
    };
    out.log(`Fabricate revert | ${label}`);
    out.table(report);
    return report;
  };

  /* Settled means the layout says `singleArray` AND no per-record document is left behind. */
  const settled = (layoutKey, prefix) =>
    get(layoutKey) === SINGLE_ARRAY && countRecords(prefix) === 0;

  const waitFor = async (label, layoutKey, prefix) => {
    const deadline = Date.now() + WAIT_TIMEOUT_MS;
    let nextProgress = Date.now() + PROGRESS_EVERY_MS;
    while (!settled(layoutKey, prefix)) {
      if (Date.now() > deadline) return false;
      if (Date.now() >= nextProgress) {
        line(`  still converting ${label}: layout=${get(layoutKey)}, ${countRecords(prefix)} left`);
        nextProgress = Date.now() + PROGRESS_EVERY_MS;
      }
      await sleep(POLL_INTERVAL_MS);
    }
    return true;
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

  const recipesNeedWork = !settled(KEYS.recipeLayout, RECORD_PREFIXES.recipes);
  const componentsNeedWork = !settled(KEYS.componentLayout, RECORD_PREFIXES.components);
  if (!recipesNeedWork && !componentsNeedWork) {
    line('already-single-array: both classes are whole-array with nothing to reclaim.');
    return;
  }

  /*
   * Writing the TARGET is the request. The LAYOUT is the conversion's own bookkeeping and is
   * never written by hand: writing it directly would fabricate a `singleArray` layout over a
   * corpus that is still per-record, which is exactly the state the conversion refuses to enter.
   *
   * One class at a time, each waited out before the next is asked for, so only one conversion is
   * ever in flight.
   */
  line('DO NOT close this tab or shut the world down until this reports a verdict.');

  const timedOut = [];
  if (recipesNeedWork) {
    if (before.recipeTarget === SINGLE_ARRAY) {
      /*
       * The target already reads `singleArray`, so no write of ours will fire the bridge and no
       * conversion is running. This is the debris case, and it is the one place an explicit
       * reconciler call is safe: nothing is in flight to race it.
       */
      line('Recipe target is already `singleArray`; reconciling to reclaim what is left...');
      await game.fabricate._reconcileDefinitionStorage();
    } else {
      line('Requesting the recipe revert...');
      await game.settings.set(NAMESPACE, KEYS.recipeTarget, SINGLE_ARRAY);
    }
    if (!(await waitFor('recipes', KEYS.recipeLayout, RECORD_PREFIXES.recipes))) {
      timedOut.push('recipes');
    }
  }

  if (componentsNeedWork) {
    if (before.componentTarget === SINGLE_ARRAY) {
      line('Component target is already `singleArray`; reconciling to reclaim what is left...');
      await game.fabricate._reconcileDefinitionStorage();
    } else {
      line('Requesting the component revert...');
      await game.settings.set(NAMESPACE, KEYS.componentTarget, SINGLE_ARRAY);
    }
    if (!(await waitFor('components', KEYS.componentLayout, RECORD_PREFIXES.components))) {
      timedOut.push('components');
    }
  }

  const after = census('AFTER');

  /*
   * The verdict, entirely from the ground-truth columns.
   *
   * A reverse conversion moves N per-record documents into the whole-array key, so the count
   * that was in the documents BEFORE must be the count in the array AFTER. That is a real
   * content check: a conversion that flipped the layout, deleted every document and wrote an
   * empty array passes every structural check and fails this one.
   */
  const problems = [];
  const waitMinutes = Math.round(WAIT_TIMEOUT_MS / 60_000);
  problems.push(...timedOut.map((c) => `${c} did not settle within ${waitMinutes} minutes`));
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
  /*
   * The equality below only holds from a SETTLED `perRecord` start, where the documents are the
   * whole corpus and the legacy key is absent. From `unsettled` — an interrupted conversion in
   * either direction — the documents are a partial copy and the legacy key may still hold the
   * full corpus, so there is no single count that "should" come out. Asserting equality there
   * would fire on a healthy resume, so it is reported for the operator's eye instead.
   */
  const notes = [];
  if (before.recipeLayout === PER_RECORD) {
    if (after.wholeArrayRecipes !== before.perRecordRecipeDocuments) {
      problems.push(
        `CONTENT: ${before.perRecordRecipeDocuments} recipe document(s) went in, ` +
          `${after.wholeArrayRecipes} came out in the whole-array key`
      );
    }
  } else if (recipesNeedWork) {
    notes.push(
      `recipes started from \`${before.recipeLayout}\`, not \`${PER_RECORD}\`, so no exact count ` +
        `was expected: ${before.perRecordRecipeDocuments} document(s) and ` +
        `${before.wholeArrayRecipes} in the array before, ${after.wholeArrayRecipes} after`
    );
  }
  if (before.componentLayout === PER_RECORD) {
    if (after.wholeArrayComponents !== before.perRecordComponentDocuments) {
      problems.push(
        `CONTENT: ${before.perRecordComponentDocuments} component document(s) went in, ` +
          `${after.wholeArrayComponents} came out nested in the crafting systems`
      );
    }
  } else if (componentsNeedWork) {
    notes.push(
      `components started from \`${before.componentLayout}\`, not \`${PER_RECORD}\`, so no exact ` +
        `count was expected: ${before.perRecordComponentDocuments} document(s) and ` +
        `${before.wholeArrayComponents} nested before, ${after.wholeArrayComponents} after`
    );
  }
  if (after.wholeArraySystems !== before.wholeArraySystems) {
    problems.push(
      `CONTENT: crafting system count moved ${before.wholeArraySystems} -> ${after.wholeArraySystems}`
    );
  }

  for (const note of notes) line(`CHECK BY HAND: ${note}`);

  if (problems.length === 0) {
    line(
      `DONE. Whole-array storage restored with ${after.wholeArrayRecipes} recipe(s), ` +
        `${after.wholeArrayComponents} component(s) and ${after.wholeArraySystems} crafting ` +
        'system(s) in the stored corpus. Reload the world to confirm the UI agrees.'
    );
    return;
  }

  /*
   * A layout still reading `unsettled` is the expected shape of an INTERRUPTED run, not a failed
   * one: the conversion is resumable by design and re-running this script resumes it. A `CONTENT`
   * line is the serious one — that is the stored corpus disagreeing with what went into it, and
   * it is the reason to reach for the backup rather than to re-run.
   */
  line('INCOMPLETE. Re-run this script to resume. Problems found:');
  for (const problem of problems) line(`  - ${problem}`);
})();
