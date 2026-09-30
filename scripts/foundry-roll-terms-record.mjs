/**
 * Record `new Roll(formula, data).terms` for the keep-transform corpus from the booted smoke
 * Foundry (issue #2007), into `tests/fixtures/recorded-roll-terms/foundry-<version>.json`. Run it
 * through `node scripts/foundry-test.mjs --check=roll-terms [--arm=v13]`.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { format, resolveConfig } from 'prettier';

import { bootToReadyWorld, suppressTours } from './lib/foundryReadyWorld.js';
import { deriveRunIdentity, reconcileFoundryEndpoint } from './lib/foundryRunIdentity.js';
import { resolveSmokeArmFromEnv } from './lib/foundrySmokeArms.js';
import {
  describeRecordedTerm,
  ROLL_TERMS_CORPUS,
  ROLL_TERMS_DATA,
  ROLL_TERMS_PROBES,
  rollTermsKey,
} from './lib/rollTermsCorpus.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'tests', 'fixtures', 'recorded-roll-terms');
const ARM = resolveSmokeArmFromEnv();
const FOUNDRY_URL = reconcileFoundryEndpoint({
  url: process.env.FOUNDRY_URL,
  hostPort: process.env.FOUNDRY_HOST_PORT,
  fallbackPort: deriveRunIdentity(ROOT).port,
}).url;

const log = (message) => process.stdout.write(message);

/** Runs in the page: parse every corpus entry and run every transform probe. */
function recordInPage({ corpus, probes, dataSets }) {
  const { Roll } = foundry.dice;
  const { DiceTerm } = foundry.dice.terms;
  // The describer is shared with Node, installed on the page as a script tag before this runs.
  const describe = globalThis.__fabricateDescribeRecordedTerm;
  const termsOf = (roll) => roll.terms.map((term) => describe(term, { Roll, DiceTerm }));

  const entries = corpus.map(({ formula, data }) => {
    try {
      const roll = new Roll(formula, dataSets[data]);
      return {
        formula,
        data,
        threw: false,
        _formula: roll._formula,
        rollFormula: roll.formula,
        terms: termsOf(roll),
      };
    } catch (error) {
      return { formula, data, threw: true, error: error?.constructor?.name ?? 'Error' };
    }
  });

  const probeResults = probes.map(({ formula, data, index, extraDice, keep }) => {
    const roll = new Roll(formula, dataSets[data]);
    const term = roll.terms[index];
    const original = term._number;
    term.number = original + extraDice;
    term.modifiers.push(`${keep}${original}`);
    const stale = { _formula: roll._formula, rollFormula: roll.formula };
    roll.resetFormula();
    const json = roll.toJSON();
    return {
      formula,
      data,
      index,
      extraDice,
      keep,
      beforeReset: stale,
      afterReset: {
        _formula: roll._formula,
        rollFormula: roll.formula,
        toJSONFormula: json.formula,
        fromDataFormula: Roll.fromData(JSON.parse(JSON.stringify(json)))._formula,
        cloneFormula: roll.clone()._formula,
        terms: termsOf(roll),
      },
    };
  });

  return {
    version: game.version,
    generation: game.release.generation,
    system: `${game.system.id} ${game.system.version}`,
    dieClass: CONFIG.Dice.terms.d.name,
    entries,
    probeResults,
  };
}

async function main() {
  log(
    `Recording Roll terms on the ${ARM.id} arm (Foundry ${ARM.foundryVersion}) at ${FOUNDRY_URL}\n`
  );
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await suppressTours(context);
  const page = await context.newPage();
  try {
    await bootToReadyWorld(page, {
      foundryUrl: FOUNDRY_URL,
      worldId: 'fabricate-smoke-ci',
      adminKey: process.env.FOUNDRY_ADMIN_KEY ?? 'fabricate-test-admin',
      log,
    });
    await page.addScriptTag({
      content: `globalThis.__fabricateDescribeRecordedTerm = ${describeRecordedTerm.toString()};`,
    });
    const recorded = await page.evaluate(recordInPage, {
      corpus: ROLL_TERMS_CORPUS,
      probes: ROLL_TERMS_PROBES,
      dataSets: ROLL_TERMS_DATA,
    });
    if (recorded.version !== ARM.foundryVersion) {
      throw new Error(
        `expected Foundry ${ARM.foundryVersion}, the page reports ${recorded.version}`
      );
    }
    const document = {
      foundryVersion: recorded.version,
      generation: recorded.generation,
      system: recorded.system,
      dieClass: recorded.dieClass,
      data: ROLL_TERMS_DATA,
      entries: Object.fromEntries(recorded.entries.map((entry) => [rollTermsKey(entry), entry])),
      probes: recorded.probeResults,
    };
    await mkdir(OUT_DIR, { recursive: true });
    const file = join(OUT_DIR, `foundry-${recorded.version}.json`);
    // Written as `npm run format` would leave it, so a fresh recording passes `format:check`.
    const style = await resolveConfig(file);
    await writeFile(
      file,
      await format(JSON.stringify(document, null, 2), { ...style, filepath: file })
    );
    log(
      `Recorded ${recorded.entries.length} formulas and ${recorded.probeResults.length} probes to ${file}\n`
    );
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

await main();
