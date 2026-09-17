/**
 * The Foundry perf profile's preconditions, checked before anything is started or downloaded (issue
 * 1073).
 */

/** Exit code the perf preflight uses for an unmet precondition — `foundry-test.mjs`'s "infra". */
export const PREFLIGHT_EXIT_CODE = 2;

/** Parse a `KEY=VALUE` env file into a plain object. */
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

/** The environment the preflight judges: the real one, with the env file as a fallback. */
export function resolveEffectiveEnv(env, envFileContents) {
  return { ...parseEnvFile(envFileContents ?? ''), ...env };
}

/** Decide whether the perf profile may start. */
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

/** Render a preflight result as the text the operator sees. */
export function formatPreflight(result) {
  if (result.ok) return 'Foundry perf preflight: all preconditions met.\n';
  const lines = ['Foundry perf preflight FAILED. Nothing was started and nothing was downloaded.'];
  for (const problem of result.problems) {
    lines.push(`  [${problem.id}] ${problem.what}`, `      fix: ${problem.fix}`);
  }
  return `${lines.join('\n')}\n`;
}
