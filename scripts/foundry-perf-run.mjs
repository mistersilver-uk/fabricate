/** The Foundry performance profile (issue 1073). */

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

/** Gather the preflight facts, none of which starts or downloads anything. */
function runPreflight() {
  const probe = (command, args) =>
    spawnSync(command, args, { stdio: 'ignore', windowsHide: true }).status === 0;

  // Read `.env.foundry` as a fallback for the credentials, exactly as `foundry-test-up.mjs` does
  // when it forwards them to compose.
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

/** Bring a page to a joined, Fabricate-ready session for one user. */
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

/** Enable the Fabricate module when the world has it installed but not active. */
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

/** Move a large array into the page in bounded chunks. */
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

/** Write the seeded corpus into the world: two setting writes, one batched actor create. */
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

      // The fidelity census, taken against the created documents.
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

/** Read the startup attribution and readiness timings the reloaded page recorded. */
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

/** Re-join the world after a reload and wait for Fabricate to report ready. */
async function rejoinAfterReload(page, userLabel) {
  await page.reload({ waitUntil: 'load', timeout: 120_000 });
  await joinWorldSession(page, { userLabel, reporter: createBootReporter({ log }) });
  await page.waitForFunction(() => globalThis.game?.fabricate?.ready === true, null, {
    timeout: 300_000,
  });
}

/** Read the page-side bridge's long-task and heap samples into two measurement results. */
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

/** Walk every scenario, isolating failures so one broken step cannot cost the rest of the run. */
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

/** The player user the second client joins as. */
const PERF_PLAYER_NAME = 'Player1';

/** Create the player user the propagation and persistence scenarios join as, if it is missing. */
async function ensurePlayerUser(page) {
  const created = await page.evaluate(async (name) => {
    if (game.users.some((user) => user.name === name)) return false;
    await globalThis.User.createDocuments([{ name, role: CONST.USER_ROLES.PLAYER, password: '' }]);
    return true;
  }, PERF_PLAYER_NAME);
  if (created) log(`Created player user "${PERF_PLAYER_NAME}" for the cross-client scenarios.\n`);
}

/** Join a second browser context as a player, for the propagation scenario. */
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

/** Stop Foundry's New User Experience tours ever starting. */
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

/** Everything the run record's Foundry-side envelope needs. */
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
