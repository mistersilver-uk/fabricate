/**
 * foundry-perf-run.mjs — the Foundry performance profile (issue 1073).
 *
 * Seeds a live Foundry world with one of issue 1071's scale fixtures, walks the paths the
 * performance programme is about, and writes a class-2 run record. It is the `--check=perf` arm of
 * the EXISTING harness: `scripts/foundry-test.mjs` still owns build, up, run and down, and this file
 * is only what runs against the booted container — exactly as `foundry-version-assert.mjs` is.
 *
 * WHAT IT MEASURES AND WHAT MAY BE BELIEVED. Every number is declared in
 * `scripts/lib/foundryPerfMeasurements.js` with its class. Counts are class 1 and may be asserted;
 * every millisecond and every heap byte is class 2, is written to a GITIGNORED record, is never
 * asserted, and is only ever compared as a ratio between two runs on one machine. Wall clock inside
 * a live Foundry is the least deterministic number in this programme and the report says so in its
 * own text.
 *
 * ORDER MATTERS, AND ONE ORDERING IS LOAD-BEARING. The world is seeded and THEN reloaded, so the
 * startup measurement is taken against the seeded corpus. Measuring startup before seeding would
 * report the cost of loading an empty world under a name that claims otherwise.
 *
 * SEEDING IS NOT MEASURED, AND IS NOT DONE THROUGH THE API. `createRecipe()` saves the whole corpus
 * per call; 10,000 of those is hours. The corpus goes in as two `game.settings.set` writes and one
 * batched `Actor.createDocuments`, and the payload is transferred to the page in chunks first
 * because a single 20 MB `page.evaluate` argument is its own kind of hazard. Chunk transfer happens
 * outside every timed region.
 *
 * Usage:
 *   npm run test:foundry:perf                      # up + this + down
 *   npm run test:foundry:perf -- --arm=v13         # the same profile on Foundry 13
 *   node scripts/foundry-perf-run.mjs --preflight  # preconditions only; starts nothing
 *   node scripts/foundry-perf-run.mjs              # against an already-running container
 *
 * Environment:
 *   FOUNDRY_PERF_FIXTURE       issue 1071 scale profile to seed (default `simple-corpus`)
 *   FOUNDRY_PERF_SEED          fixture seed (default: issue 1071's own default)
 *   FOUNDRY_PERF_INVENTORY     which point of a held-inventory series to seed (default 0)
 *   FOUNDRY_PERF_IMPORT_LIMIT  recipes the import scenario imports (default 200)
 *   FOUNDRY_PERF_TRACE=1       also export a Chrome DevTools trace
 *   FOUNDRY_PERF_SECOND_CLIENT=0  skip the cross-client propagation scenario
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import {
  acceptLicenseIfPresent,
  authenticateIfRequired,
  clearBlockingOverlays,
  createBootReporter,
  getPathname,
  joinWorldSession,
  launchWorld,
} from './lib/foundryBrowserBoot.js';
import {
  PERF_BRIDGE_KEY,
  installPerfBridge,
  summarizeLongTasks,
  summarizeStartupMeasures,
  traceFilename,
} from './lib/foundryPerfCapture.js';
import { reconcileResults } from './lib/foundryPerfMeasurements.js';
import {
  PREFLIGHT_EXIT_CODE,
  checkPerfPreconditions,
  formatPreflight,
  resolveEffectiveEnv,
} from './lib/foundryPerfPreflight.js';
import {
  PERF_RUN_DIR,
  PERF_TRACE_DIR,
  buildPerfRunRecord,
  perfRunFilename,
} from './lib/foundryPerfRecord.js';
import { PERF_SCENARIOS } from './lib/foundryPerfScenarios.js';
import {
  SCALE_FIXTURE_MODULE,
  buildFoundrySeed,
  loadHostEnvelopeModule,
  loadScaleFixtureModule,
  seedFidelityProbe,
} from './lib/foundryPerfSeed.js';
import { deriveRunIdentity, reconcileFoundryEndpoint } from './lib/foundryRunIdentity.js';
import { resolveSmokeArmFromEnv } from './lib/foundrySmokeArms.js';
import { TOUR_PROGRESS_STORAGE_KEY, withSuppressedTours } from './lib/foundryTourSuppression.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORLD_ID = 'fabricate-smoke-ci';
const ADMIN_KEY = process.env.FOUNDRY_ADMIN_KEY ?? 'fabricate-test-admin';
const ARM = resolveSmokeArmFromEnv();

/** Recipes per chunk when transferring the corpus into the page. Setup only; never timed. */
const SEED_CHUNK_SIZE = 500;

/** The page-side slot the staged seed payload is assembled in before the two setting writes. */
const SEED_STAGING_SLOT = '__fabricatePerfSeed';

const FOUNDRY_URL = reconcileFoundryEndpoint({
  url: process.env.FOUNDRY_URL,
  hostPort: process.env.FOUNDRY_HOST_PORT,
  fallbackPort: deriveRunIdentity(ROOT).port,
}).url;

function log(message) {
  process.stdout.write(message);
}

/**
 * Gather the preflight facts, none of which starts or downloads anything.
 *
 * `docker image inspect` is a LOCAL store lookup and never reaches a registry, which is what makes
 * it usable in a check whose whole contract is "attempt no download".
 *
 * @returns {{ok: boolean, problems: Array<{id: string, what: string, fix: string}>}}
 */
function runPreflight() {
  const probe = (command, args) =>
    spawnSync(command, args, { stdio: 'ignore', windowsHide: true }).status === 0;

  // Read `.env.foundry` as a FALLBACK for the credentials, exactly as `foundry-test-up.mjs` does
  // when it forwards them to compose. Read, not applied: the preflight has no business mutating the
  // environment of the run it is checking.
  const envFile = join(ROOT, '.env.foundry');
  const envFilePresent = existsSync(envFile);
  const envFileContents = envFilePresent ? readFileSync(envFile, 'utf8') : null;

  return checkPerfPreconditions({
    env: resolveEffectiveEnv(process.env, envFileContents),
    dockerAvailable: probe('docker', ['version']),
    envFilePresent,
    imageCached: probe('docker', ['image', 'inspect', ARM.image]),
    image: ARM.image,
    fixturesPresent: existsSync(join(ROOT, SCALE_FIXTURE_MODULE)),
    fixtureModule: SCALE_FIXTURE_MODULE,
  });
}

/**
 * Bring a page to a joined, Fabricate-ready session for one user.
 *
 * @param {object} page
 * @param {string} userLabel
 */
async function bootToReadyWorld(page, userLabel) {
  const reporter = createBootReporter({ log });

  await page.goto(`${FOUNDRY_URL}/setup`, { waitUntil: 'networkidle', timeout: 120_000 });
  await acceptLicenseIfPresent(page, { reporter });
  await authenticateIfRequired(page, { adminKey: ADMIN_KEY, reporter });

  const path = getPathname(page.url());
  if (path !== '/join' && path !== '/game') {
    await page.waitForURL(/\/setup(?:\?.*)?$/, { timeout: 30_000 });
    await clearBlockingOverlays(page);
    await launchWorld(page, { worldId: WORLD_ID, foundryUrl: FOUNDRY_URL, reporter });
  }

  await joinWorldSession(page, { userLabel, reporter });
  await page.waitForFunction(() => typeof game !== 'undefined' && game.ready === true, null, {
    timeout: 120_000,
  });
  await clearBlockingOverlays(page);

  if (await activateFabricateIfNeeded(page)) {
    // Activation only takes effect on the next page load, so re-join and wait again.
    await page.reload({ waitUntil: 'load', timeout: 120_000 });
    await joinWorldSession(page, { userLabel, reporter });
    await page.waitForFunction(() => typeof game !== 'undefined' && game.ready === true, null, {
      timeout: 120_000,
    });
    await clearBlockingOverlays(page);
  }

  await page.waitForFunction(() => globalThis.game?.fabricate?.ready === true, null, {
    timeout: 180_000,
  });
}

/**
 * Enable the Fabricate module when the world has it installed but not active.
 *
 * WITHOUT THIS THE PERF PROFILE CANNOT BOOT A FRESH WORLD, and the failure is silent about its
 * cause: `scripts/foundry-setup-data.mjs` copies the built module into `Data/modules/fabricate/`
 * and the fixture world's `world.json` declares no `modules` array, so a freshly copied world has
 * the module INSTALLED and INACTIVE. `game.fabricate` is then never defined, and the wait above
 * times out after three minutes reporting only `page.waitForFunction: Timeout 180000ms exceeded` —
 * which reads as "Fabricate is slow to initialise", the opposite of what happened.
 *
 * `scripts/foundry-test-run.mjs` has carried this step since the smoke harness was written; the
 * perf profile (issue 1073) did not inherit it, so it only ever succeeded against a world some
 * earlier smoke run had already activated. Found and fixed by issue 1079, which needed the profile
 * to run.
 *
 * @param {object} page
 * @returns {Promise<boolean>} Whether activation was performed and a reload is required.
 */
async function activateFabricateIfNeeded(page) {
  const active = await page.evaluate(
    () => globalThis.game?.modules?.get('fabricate')?.active === true
  );
  if (active) return false;

  log('Fabricate module is installed but not active. Activating...\n');
  await page.evaluate(async () => {
    const configuration = game.settings.get('core', 'moduleConfiguration') ?? {};
    configuration.fabricate = true;
    await game.settings.set('core', 'moduleConfiguration', configuration);
  });
  return true;
}

/**
 * Move a large array into the page in bounded chunks.
 *
 * Playwright serializes an `evaluate` argument through CDP in one message; a 20 MB corpus in one
 * argument is a hazard with no upside, and chunking costs nothing because none of this is timed.
 *
 * @param {object} page
 * @param {string} slot
 * @param {unknown[]} values
 */
async function transferInChunks(page, slot, values) {
  await page.evaluate(
    ({ staging, key }) => {
      const staged = Reflect.get(globalThis, staging) ?? {};
      staged[key] = [];
      Reflect.set(globalThis, staging, staged);
    },
    { staging: SEED_STAGING_SLOT, key: slot }
  );

  for (let offset = 0; offset < values.length; offset += SEED_CHUNK_SIZE) {
    await page.evaluate(
      ({ staging, key, chunk }) => {
        Reflect.get(globalThis, staging)[key].push(...chunk);
      },
      {
        staging: SEED_STAGING_SLOT,
        key: slot,
        chunk: values.slice(offset, offset + SEED_CHUNK_SIZE),
      }
    );
  }
}

/**
 * Write the seeded corpus into the world: two setting writes, one batched actor create.
 *
 * Returns the write counts it actually performed, so "bounded" is observed rather than asserted from
 * the outside.
 *
 * @param {object} page
 * @param {object} seed
 */
async function applySeed(page, seed) {
  await transferInChunks(page, 'craftingSystems', seed.settings[0].value);
  await transferInChunks(page, 'recipes', seed.settings[1].value);
  await transferInChunks(page, 'actors', seed.actors);

  return page.evaluate(
    async ({ namespace, systemsKey, recipesKey, systemId, staging, actorNames }) => {
      const staged = Reflect.get(globalThis, staging);
      const writes = { settingWrites: 0, actorCreateCalls: 0 };

      await game.settings.set(namespace, systemsKey, staged.craftingSystems);
      writes.settingWrites += 1;
      await game.settings.set(namespace, recipesKey, staged.recipes);
      writes.settingWrites += 1;

      if (staged.actors.length > 0) {
        // `globalThis.Actor`: the document class is a page global, not one this harness's lint
        // environment declares, and one batched create is the whole actor-side write budget.
        await globalThis.Actor.createDocuments(staged.actors);
        writes.actorCreateCalls += 1;
      }

      // The fidelity census, taken against the CREATED documents. `_stats.compendiumSource` is
      // core-managed and a create call may ignore a supplied value; if it does, every `sourceRef`
      // stack silently became an `unmatched` one and the run would report a mix it does not have.
      // Selected by the EXACT names the seed asked for, not by a name prefix: a prefix is a
      // second, unstated contract with the fixture generator, and a generator that renamed its
      // actors would silently census zero and report a total fidelity failure that was not one.
      const wanted = new Set(actorNames);
      const seededActors = game.actors.filter((actor) => wanted.has(actor.name));
      let stacks = 0;
      let durable = 0;
      let sourceRef = 0;
      for (const actor of seededActors) {
        for (const item of actor.items) {
          stacks += 1;
          if (item.getFlag('fabricate', 'roles')?.[systemId]?.componentId) durable += 1;
          else if (item._stats?.compendiumSource) sourceRef += 1;
        }
      }

      Reflect.set(globalThis, staging, null);
      return { writes, fidelity: { actors: seededActors.length, stacks, durable, sourceRef } };
    },
    {
      namespace: seed.settings[0].namespace,
      systemsKey: seed.settings[0].key,
      recipesKey: seed.settings[1].key,
      systemId: seed.invariant.systemId,
      staging: SEED_STAGING_SLOT,
      actorNames: seed.actors.map((actor) => actor.name),
    }
  );
}

/**
 * Read the startup attribution and readiness timings the reloaded page recorded.
 *
 * @param {object} page
 */
async function readStartupObservations(page) {
  const observed = await page.evaluate(() => {
    const measures = performance
      .getEntriesByType('measure')
      .filter((entry) => entry.name.startsWith('fabricate:'))
      .map((entry) => ({ name: entry.name, duration: entry.duration }));
    const navigation = performance.getEntriesByType('navigation')[0] ?? null;
    return {
      measures,
      domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? null,
      loadEventMs: navigation?.loadEventEnd ?? null,
      // Not a substitute for the marks: this is "how long after navigation did Fabricate report
      // ready", which includes everything Foundry and the game system did first.
      fabricateReadyMs: performance.now(),
      corpus: {
        recipes: game.fabricate.getRecipeManager().getRecipes().length,
        systems: game.fabricate.getCraftingSystemManager().getSystems().length,
      },
    };
  });

  return {
    startupMeasures: summarizeStartupMeasures(observed.measures),
    readiness: {
      domContentLoadedMs: observed.domContentLoadedMs,
      loadEventMs: observed.loadEventMs,
      fabricateReadyMs: observed.fabricateReadyMs,
    },
    corpus: observed.corpus,
  };
}

/**
 * Re-join the world after a reload and wait for Fabricate to report ready.
 *
 * @param {object} page
 * @param {string} userLabel
 */
async function rejoinAfterReload(page, userLabel) {
  await page.reload({ waitUntil: 'load', timeout: 120_000 });
  await joinWorldSession(page, { userLabel, reporter: createBootReporter({ log }) });
  await page.waitForFunction(() => globalThis.game?.fabricate?.ready === true, null, {
    timeout: 300_000,
  });
}

/**
 * Read the page-side bridge's long-task and heap samples into two measurement results.
 *
 * @param {object} page
 * @returns {Promise<Record<string, object>>}
 */
async function readBridgeSummaries(page) {
  const bridge = await page.evaluate(
    (key) => ({
      longTasks: globalThis[key]?.longTasks ?? [],
      heapSamples: globalThis[key]?.heapSamples ?? [],
      supported: globalThis[key]?.supported ?? { longTask: false, heap: false },
    }),
    PERF_BRIDGE_KEY
  );
  return {
    'long-tasks': {
      timing: { samplesMs: [], ...summarizeLongTasks(bridge.longTasks) },
      invariant: { longTaskApiSupported: bridge.supported.longTask },
    },
    'heap-samples': {
      timing: { samplesMs: [], samples: bridge.heapSamples },
      invariant: { heapApiSupported: bridge.supported.heap },
    },
  };
}

/**
 * Start a Chrome DevTools trace. Returns a stop function, or `null` when tracing is unavailable.
 *
 * Failure here NEVER fails the run: a trace is a diagnostic aid, and losing one is not a reason to
 * lose an entire measurement walk that costs a container boot to reproduce.
 *
 * @param {object} context
 * @param {object} page
 */
async function startChromeTrace(context, page) {
  try {
    const client = await context.newCDPSession(page);
    await client.send('Tracing.start', {
      transferMode: 'ReturnAsStream',
      categories:
        'devtools.timeline,v8.execute,blink.user_timing,disabled-by-default-v8.cpu_profiler',
    });
    return async () => {
      const complete = new Promise((resolve) => client.once('Tracing.tracingComplete', resolve));
      await client.send('Tracing.end');
      const { stream } = await complete;
      let payload = '';
      for (;;) {
        const chunk = await client.send('IO.read', { handle: stream });
        payload += chunk.data;
        if (chunk.eof) break;
      }
      await client.send('IO.close', { handle: stream });
      return payload;
    };
  } catch (error) {
    log(`Chrome trace unavailable (${error.message}); continuing without one.\n`);
    return null;
  }
}

/**
 * Walk every scenario, isolating failures so one broken step cannot cost the rest of the run.
 *
 * @param {object} context
 * @returns {Promise<Record<string, object>>}
 */
async function walkScenarios(context) {
  const results = {};
  for (const scenario of PERF_SCENARIOS) {
    if (scenario.deferredToRunner) continue;
    log(`  ${scenario.id}\n`);
    try {
      results[scenario.measurementId] = await scenario.run(context);
    } catch (error) {
      // Recorded as a failed measurement rather than thrown: the walk is expensive and the
      // remaining scenarios are independent of this one.
      results[scenario.measurementId] = { unavailable: `scenario failed: ${error.message}` };
    }
  }
  return results;
}

/**
 * The player user the second client joins as.
 *
 * A FRESH WORLD HAS NO PLAYER. `scripts/foundry-setup-data.mjs` copies a world whose `world.json`
 * declares nothing but an id, a core version and a system, and Foundry creates exactly one
 * Gamemaster on first launch. The GM context holds that user, so a second context finds an empty
 * user select and reports `User select has no joinable options yet` — which reads as a boot flake
 * and is in fact a world that never had a second user.
 *
 * `scripts/foundry-test-run.mjs` creates its own player users for the same reason (`Fabricate
 * Gatherer`, `Fabricate Observer`); the perf profile (issue 1073) did not, so every cross-client
 * measurement it declares reported `unavailable` on a fresh world. Found and fixed by issue 1079,
 * whose `persistence-experiments` scenario needs a real receiver to read a delivered payload from.
 */
const PERF_PLAYER_NAME = 'Player1';

/**
 * Create the player user the propagation and persistence scenarios join as, if it is missing.
 *
 * @param {object} page A page already joined as Gamemaster.
 */
async function ensurePlayerUser(page) {
  const created = await page.evaluate(async (name) => {
    if (game.users.some((user) => user.name === name)) return false;
    await globalThis.User.createDocuments([{ name, role: CONST.USER_ROLES.PLAYER, password: '' }]);
    return true;
  }, PERF_PLAYER_NAME);
  if (created) log(`Created player user "${PERF_PLAYER_NAME}" for the cross-client scenarios.\n`);
}

/**
 * Join a second browser context as a player, for the propagation scenario.
 *
 * @param {object} browser
 */
async function joinSecondClient(browser) {
  if (process.env.FOUNDRY_PERF_SECOND_CLIENT === '0') return { context: null, page: null };
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await suppressTours(context);
    const page = await context.newPage();
    await bootToReadyWorld(page, PERF_PLAYER_NAME);
    return { context, page };
  } catch (error) {
    log(`Second client did not join (${error.message}); propagation will report unavailable.\n`);
    return { context: null, page: null };
  }
}

/**
 * Stop Foundry's New User Experience tours ever starting.
 *
 * @param {object} context
 */
async function suppressTours(context) {
  await context.addInitScript(
    ({ key, value }) => {
      try {
        globalThis.localStorage.setItem(key, value);
      } catch {
        // A boot must never depend on localStorage being writable.
      }
    },
    { key: TOUR_PROGRESS_STORAGE_KEY, value: JSON.stringify(withSuppressedTours(null)) }
  );
}

/**
 * Everything the run record's Foundry-side envelope needs.
 *
 * @param {object} page
 * @param {object} browser
 * @param {object} fixture
 */
async function captureFoundryEnvelope(page, browser, fixture) {
  const core = await page.evaluate(() => ({
    version: globalThis.game?.version ?? null,
    generation: globalThis.game?.release?.generation ?? null,
    system: `${globalThis.game?.system?.id ?? '?'}@${globalThis.game?.system?.version ?? '?'}`,
    moduleVersion: globalThis.game?.modules?.get('fabricate')?.version ?? null,
  }));
  return {
    arm: ARM.id,
    image: ARM.image,
    foundryVersion: core.version,
    foundryGeneration: core.generation,
    gameSystem: core.system,
    moduleVersion: core.moduleVersion,
    browserVersion: browser.version(),
    fixtureProfile: fixture.profile,
    fixtureSeed: fixture.seed,
    harnessVersion: fixture.harnessVersion,
  };
}

async function main() {
  const preflight = runPreflight();
  log(formatPreflight(preflight));
  if (!preflight.ok) process.exit(PREFLIGHT_EXIT_CODE);
  if (process.argv.includes('--preflight')) return;

  const scale = await loadScaleFixtureModule();
  const fixtureProfile = process.env.FOUNDRY_PERF_FIXTURE ?? 'simple-corpus';
  const fixtureSeed = Number(process.env.FOUNDRY_PERF_SEED ?? scale.DEFAULT_SEED);
  log(`Building fixture "${fixtureProfile}" (seed ${fixtureSeed})...\n`);
  const fixture = scale.buildScaleFixture({ profile: fixtureProfile, seed: fixtureSeed });
  const seed = buildFoundrySeed(fixture, {
    inventoryPoint: Number(process.env.FOUNDRY_PERF_INVENTORY ?? 0),
  });
  if (seed.invariant.inventoryPoint !== null) {
    log(
      `Held-inventory series point ${seed.invariant.inventoryPoint} of ` +
        `${seed.invariant.inventorySeriesLength}: ${seed.invariant.requestedMix.stacks} stacks.
`
    );
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await suppressTours(context);
  await context.addInitScript(installPerfBridge, { key: PERF_BRIDGE_KEY });
  const page = await context.newPage();

  let record = null;
  let failure = null;
  let playerContext = null;

  try {
    await bootToReadyWorld(page, 'Gamemaster');
    await ensurePlayerUser(page);

    log(`Seeding ${seed.invariant.recipes} recipes / ${seed.invariant.components} components...\n`);
    const applied = await applySeed(page, seed);
    const fidelity = seedFidelityProbe(seed).describe(applied.fidelity);
    if (!fidelity.matches) {
      log(`Seed fidelity drift (the fixture is NOT what was requested):\n`);
      for (const line of fidelity.drift) log(`  ${line}\n`);
    }

    // Reload so startup is measured against the SEEDED world, not the empty one it booted into.
    log('Reloading to measure startup against the seeded corpus...\n');
    await rejoinAfterReload(page, 'Gamemaster');

    // Read after the reload above, before the second client joins, and before the trace starts.
    // All three matter, and the last one is easy to miss: `fabricateReadyMs` is a
    // `performance.now()` evaluated on this page when the read RUNS, so it goes on ticking through
    // anything done first. Reading after the reload is what makes it the SEEDED world's boot;
    // reading before the join keeps the second context's boot out of it; reading before
    // `startChromeTrace` keeps the CDP `Tracing.start` round trip out of it, which would otherwise
    // make a traced run and an untraced run disagree for a reason that has nothing to do with the
    // corpus. The trace is wanted around the WALK, and the walk is all still below.
    const startup = await readStartupObservations(page);

    const stopTrace =
      process.env.FOUNDRY_PERF_TRACE === '1' ? await startChromeTrace(context, page) : null;

    const player = await joinSecondClient(browser);
    playerContext = player.context;

    log('Walking the scenarios...\n');
    const results = {
      ...(await walkScenarios({
        page,
        playerPage: player.page,
        systemId: seed.invariant.systemId,
        importRecipeLimit: Number(process.env.FOUNDRY_PERF_IMPORT_LIMIT ?? 200),
        startupMeasures: startup.startupMeasures,
        readiness: startup.readiness,
        corpus: startup.corpus,
        log,
      })),
      ...(await readBridgeSummaries(page)),
    };

    // The host half of the envelope comes from issue 1071's `captureEnvelope` rather than a second
    // implementation here — commit, branch, dirty flag, Node/V8, OS, arch, CPU and memory are
    // already derived there, and a second copy would be a second thing to keep true.
    const { captureEnvelope } = await loadHostEnvelopeModule();
    const host = captureEnvelope({
      repoRoot: ROOT,
      fixtureProfile,
      fixtureSeed,
      harnessVersion: fixture.harnessVersion,
    });

    let trace = null;
    if (stopTrace) {
      const payload = await stopTrace().catch(() => null);
      if (payload) {
        const name = traceFilename({
          commit: host.commit,
          arm: ARM.id,
          fixtureProfile,
          capturedAt: host.capturedAt,
        });
        const traceDir = join(ROOT, ...PERF_TRACE_DIR);
        await mkdir(traceDir, { recursive: true });
        await writeFile(join(traceDir, name), payload);
        trace = { file: join(...PERF_TRACE_DIR, name), bytes: payload.length };
        log(`Chrome trace written to ${trace.file}\n`);
      }
    }

    record = buildPerfRunRecord({
      host,
      foundry: await captureFoundryEnvelope(page, browser, fixture),
      seed: { ...seed.invariant, applied: applied.writes, fidelity },
      reconciled: reconcileResults(results),
      trace,
    });
  } catch (error) {
    failure = error?.message ?? String(error);
  } finally {
    await playerContext?.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  if (failure) {
    process.stderr.write(`Foundry perf run failed: ${failure}\n`);
    process.exit(1);
  }

  const runDir = join(ROOT, ...PERF_RUN_DIR);
  await mkdir(runDir, { recursive: true });
  const file = join(runDir, perfRunFilename(record));
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`);

  log(`\nFoundry perf run recorded: ${file}\n`);
  if (record.missing.length > 0) {
    log(`Measurements that produced NOTHING: ${record.missing.join(', ')}\n`);
  }
  log('Every duration in that file is CLASS 2. Compare two runs on one machine; quote ratios.\n');
}

await main();
