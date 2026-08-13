/**
 * The Foundry perf profile's preconditions, checked BEFORE anything is started or downloaded
 * (issue 1073).
 *
 * ## Why a preflight, and why it refuses rather than fetches
 *
 * The felddy image activates a Foundry installation from account credentials AT CONTAINER BOOT and
 * downloads the Foundry build itself. So "just run it and see" is not a cheap probe: with the wrong
 * credentials it is a failed activation against a licence that binds to the container hostname, and
 * with no cached image it is a multi-hundred-megabyte pull started by a command the operator thought
 * was a test. Issue 1073 therefore requires that a missing image or missing credentials EXIT with
 * instructions and attempt no download. That is a refusal, and this module is where it is decided.
 *
 * Nothing here executes anything. Every observation — is the Docker CLI reachable, is the image
 * cached, do the fixtures exist — is passed IN, so the whole decision is a pure function over facts
 * and the runner owns the (small, boring) business of gathering them. That also makes every branch
 * reachable from a unit test, which matters: a preflight whose failure paths have never run is a
 * preflight that will produce a stack trace instead of an instruction on the day it fires.
 *
 * ## The messages are the deliverable
 *
 * Each problem carries `what` (the fact) and `fix` (the command or file that changes the fact). An
 * error that says only "Foundry image not found" sends the reader to a search engine; one that says
 * `docker pull felddy/foundryvtt:14.365` sends them to a prompt.
 */

/** Exit code the perf preflight uses for an unmet precondition — `foundry-test.mjs`'s "infra". */
export const PREFLIGHT_EXIT_CODE = 2;

/**
 * Parse a `KEY=VALUE` env file into a plain object.
 *
 * NON-MUTATING, unlike `scripts/foundry-test-up.mjs`'s equivalent, and that is the point rather than
 * a stylistic preference: `up` needs the credentials IN `process.env` because it forwards them to
 * compose, whereas the preflight only needs to know whether they exist. A preflight that wrote them
 * into the environment would be a check with a side effect on the run it is checking.
 *
 * The first version of this preflight did not read the file at all, and reported
 * `credentials-missing` on a worktree whose `.env.foundry` was sitting right there — in the same
 * breath as acknowledging that the file existed. An instruction that tells you to create a file you
 * already have is worse than no instruction.
 *
 * @param {string} raw
 * @returns {Record<string, string>}
 */
export function parseEnvFile(raw) {
  const parsed = {};
  for (const line of String(raw ?? '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    parsed[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return parsed;
}

/**
 * The environment the preflight judges: the real one, with the env file as a FALLBACK.
 *
 * The real environment wins, matching how `up` resolves the same values (it only fills a key that is
 * not already set), so the preflight can never pass on a credential the container will not receive.
 *
 * @param {Record<string, string|undefined>} env
 * @param {string|null} envFileContents `null` when the file does not exist.
 * @returns {Record<string, string|undefined>}
 */
export function resolveEffectiveEnv(env, envFileContents) {
  return { ...parseEnvFile(envFileContents ?? ''), ...env };
}

/**
 * Decide whether the perf profile may start.
 *
 * @param {object} facts
 * @param {Record<string, string|undefined>} facts.env The process environment.
 * @param {boolean} facts.dockerAvailable Whether the Docker CLI answered.
 * @param {boolean} facts.envFilePresent Whether `.env.foundry` exists.
 * @param {boolean} facts.imageCached Whether the resolved image is already in the local store.
 * @param {string} facts.image The image the selected arm resolves to.
 * @param {boolean} facts.fixturesPresent Whether issue 1071's scale fixtures are in this checkout.
 * @param {string} facts.fixtureModule The fixture module path, for the message.
 * @returns {{ok: boolean, problems: Array<{id: string, what: string, fix: string}>}}
 */
export function checkPerfPreconditions({
  env,
  dockerAvailable,
  envFilePresent,
  imageCached,
  image,
  fixturesPresent,
  fixtureModule,
}) {
  const problems = [];

  if (!dockerAvailable) {
    problems.push({
      id: 'docker-missing',
      what: 'The Docker CLI did not answer, so no Foundry container can be started.',
      fix: 'Install and start Docker Desktop (or the Docker daemon), then re-run.',
    });
  }

  const hasCredentials = Boolean(env?.FOUNDRY_USERNAME && env.FOUNDRY_PASSWORD);
  if (!hasCredentials) {
    problems.push({
      id: 'credentials-missing',
      what:
        'FOUNDRY_USERNAME and FOUNDRY_PASSWORD are not both set' +
        (envFilePresent
          ? ', and .env.foundry did not supply them.'
          : ', and .env.foundry does not exist.'),
      fix:
        'Create .env.foundry with FOUNDRY_USERNAME and FOUNDRY_PASSWORD (and FOUNDRY_LICENSE_KEY ' +
        'if your account needs an explicit key), or export them. A gitignored file does not come ' +
        'with `git worktree add`, so a fresh worktree needs its own copy.',
    });
  }

  if (dockerAvailable && !imageCached) {
    problems.push({
      id: 'image-missing',
      what: `The Foundry image ${image} is not in the local Docker image store.`,
      // The refusal, stated as such. This is the acceptance criterion.
      fix:
        `Run \`docker pull ${image}\` yourself. The perf profile will not pull it: an image pull ` +
        'is hundreds of megabytes and a container boot activates a licence against the container ' +
        'hostname, and neither should be a side effect of asking for a measurement.',
    });
  }

  if (!fixturesPresent) {
    problems.push({
      id: 'fixtures-missing',
      what: `Issue 1071's scale fixtures (${fixtureModule}) are not in this checkout.`,
      fix:
        'Land or rebase onto issue 1071. The perf profile seeds ITS fixtures on purpose, so the ' +
        'Foundry and headless layers measure the same corpus; a second generator here would make ' +
        'the two sets of numbers incomparable.',
    });
  }

  return { ok: problems.length === 0, problems };
}

/**
 * Render a preflight result as the text the operator sees.
 *
 * @param {{ok: boolean, problems: Array<{id: string, what: string, fix: string}>}} result
 * @returns {string}
 */
export function formatPreflight(result) {
  if (result.ok) return 'Foundry perf preflight: all preconditions met.\n';
  const lines = ['Foundry perf preflight FAILED. Nothing was started and nothing was downloaded.'];
  for (const problem of result.problems) {
    lines.push(`  [${problem.id}] ${problem.what}`, `      fix: ${problem.fix}`);
  }
  return `${lines.join('\n')}\n`;
}
