/**
 * Rotate every tester path segment in one pass, across both repositories publishing into the
 * Fabricate S3 bucket (issue #1761).
 *
 * A tester group is one cohort holding one URL prefix, so its segment is one value shared by every
 * repository publishing into it. Rotation deletes nothing and republishes nothing: a superseded
 * prefix keeps serving its last manifest, so pair each run with the announcement carrying the new
 * URLs. Local-only and deliberately absent from `package.json`.
 *
 * Usage: node scripts/rotate-tester-secrets.mjs [--apply] [--group <name>] [--config <path>]
 *        [--premium-config <path> | --no-premium]
 */
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import { deriveS3Layout } from './release-s3.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_FABRICATE_CONFIG = join(ROOT, 'release.s3.config.json');
const DEFAULT_PREMIUM_CONFIG = resolve(ROOT, '..', 'fabricate-premium', 'release.config.json');
const DEFAULT_FABRICATE_REPO = 'mistersilver-uk/fabricate';
const DEFAULT_PREMIUM_REPO = 'mistersilver-uk/fabricate-premium';
const SEGMENT_BYTES = 16;

const HELP = `Rotate every tester path segment across both publishing repositories.

  --apply                   Write the secrets (default: dry run, writes nothing)
  --group <name>            Rotate only this tester group's secret
  --config <path>           This repository's release config
  --premium-config <path>   The premium repository's release config
  --no-premium              Inspect this repository alone (dry run only)
  -h, --help                Print this help
`;

/** Parse the command line. Default is a dry run; only the exact token `--apply` writes. */
export function parseArgs(args) {
  const options = {
    apply: false,
    group: null,
    premium: true,
    config: DEFAULT_FABRICATE_CONFIG,
    premiumConfig: DEFAULT_PREMIUM_CONFIG,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    const value = () => {
      if (!next || next.startsWith('--')) throw new Error(`${arg} requires a value`);
      i += 1;
      return next;
    };

    switch (arg) {
      case '--help':
      case '-h': {
        options.help = true;
        break;
      }
      case '--apply': {
        options.apply = true;
        break;
      }
      case '--no-premium': {
        options.premium = false;
        break;
      }
      case '--group': {
        options.group = value();
        break;
      }
      case '--config': {
        options.config = resolve(value());
        break;
      }
      case '--premium-config': {
        options.premiumConfig = resolve(value());
        break;
      }
      default: {
        throw new Error(`Unknown option: ${arg}`);
      }
    }
  }

  // Without the premium config every secret looks single-repository, which suppresses the collapse
  // warning and blinds the ambiguous-narrowing refusal exactly when they matter.
  if (options.apply && !options.premium) {
    throw new Error(
      '--no-premium cannot be combined with --apply: rotating this repository alone splits every ' +
        'shared cohort across two prefixes. Pass --premium-config <path> to apply; --no-premium ' +
        'is for dry-run inspection only.'
    );
  }

  return options;
}

/** A fresh unguessable path segment: 32 hex characters. */
export function newSegment() {
  return randomBytes(SEGMENT_BYTES).toString('hex');
}

const named = (value) => (typeof value === 'string' ? value.trim() : '');

/** Code-point order, because `Array#sort` without a comparator sorts as UTF-16 strings anyway. */
const byName = (a, b) => (a < b ? -1 : Number(a > b));

/**
 * Every `(group, secret, repository)` declaration in this repository's config, whose schema is one
 * `testerSecretEnv` per channel against an array of groups.
 * @returns {{group: string, secretEnv: string, repository: string, where: string}[]}
 */
function fabricateDeclarations(config, repository) {
  const declarations = [];
  for (const [channel, entry] of Object.entries(config?.channels ?? {})) {
    for (const group of entry?.testerGroups ?? []) {
      declarations.push({
        group: named(group),
        secretEnv: named(entry?.testerSecretEnv),
        repository,
        where: `${repository} channel "${channel}"`,
      });
    }
  }
  return declarations;
}

/**
 * The same, for the premium repository's schema: one `testerSecretEnv` per group. The asymmetry is
 * load-bearing — this repository publishes into exactly one early-access group.
 */
function premiumDeclarations(config, repository) {
  const declarations = [];
  for (const [channel, entry] of Object.entries(config?.channels ?? {})) {
    for (const [group, groupEntry] of Object.entries(entry?.testerGroups ?? {})) {
      declarations.push({
        group: named(group),
        secretEnv: named(groupEntry?.testerSecretEnv),
        repository,
        where: `${repository} channel "${channel}"`,
      });
    }
  }
  return declarations;
}

/** Refuse a declaration with no secret name. `''` matters: it survives `?? null`. */
function assertEverySecretIsNamed(declarations) {
  for (const declaration of declarations) {
    if (declaration.secretEnv) continue;
    throw new Error(
      `tester group "${declaration.group}" is declared by ${declaration.where} with no ` +
        '"testerSecretEnv". Its segment cannot be rotated, and a publish to it would write a ' +
        'guessable path.'
    );
  }
}

/**
 * Refuse a group whose declarations disagree about the secret name. This is the enforcement point
 * for the cross-repository naming rule: one group, one secret name, everywhere.
 */
function assertGroupsAgree(declarations) {
  const byGroup = new Map();
  for (const declaration of declarations) {
    const seen = byGroup.get(declaration.group);
    if (!seen) {
      byGroup.set(declaration.group, declaration);
      continue;
    }
    if (seen.secretEnv === declaration.secretEnv) continue;
    throw new Error(
      `tester group "${declaration.group}" is declared under two different secret names: ` +
        `${seen.secretEnv} by ${seen.where}, ${declaration.secretEnv} by ${declaration.where}. ` +
        'One group is one cohort holding one URL prefix, so it must be declared under the same ' +
        'secret name in every repository publishing into it.'
    );
  }
}

/**
 * Narrow to one group, refusing when its secret also serves groups the caller did not name —
 * rotating it would silently migrate an unannounced cohort.
 */
function narrowToGroup(secrets, group) {
  const match = secrets.find((secret) => secret.groups.includes(group));
  if (!match) {
    const known = secrets.flatMap((secret) => secret.groups).sort(byName);
    throw new Error(
      `no tester group named "${group}" is declared in either config. Known groups: ` +
        `${known.join(', ')}.`
    );
  }

  const others = match.groups.filter((name) => name !== group);
  if (others.length > 0) {
    throw new Error(
      `tester group "${group}" shares ${match.name} with ${others.join(', ')}, so rotating it ` +
        'rotates those cohorts too. Re-run without --group to rotate them deliberately.'
    );
  }

  return [match];
}

/**
 * Derive the secret-to-writes mapping from both committed configs. Pure: no filesystem, no `gh`.
 * The rotation unit is the secret, not the group: this repository's schema resolves one segment per
 * channel and applies it to every group in the array, so a channel with two groups is a shared
 * secret by construction.
 * @returns {{secrets: {name: string, groups: string[], repositories: string[]}[],
 *   warnings: string[]}} The ordered plan.
 */
export function planRotation({
  fabricateConfig,
  premiumConfig,
  group = null,
  fabricateRepo = DEFAULT_FABRICATE_REPO,
  premiumRepo = DEFAULT_PREMIUM_REPO,
}) {
  const declarations = [
    ...fabricateDeclarations(fabricateConfig, fabricateRepo),
    ...premiumDeclarations(premiumConfig, premiumRepo),
  ];
  assertEverySecretIsNamed(declarations);
  assertGroupsAgree(declarations);

  const bySecret = new Map();
  for (const declaration of declarations) {
    if (!bySecret.has(declaration.secretEnv)) {
      bySecret.set(declaration.secretEnv, {
        name: declaration.secretEnv,
        groups: [],
        repositories: [],
      });
    }
    const secret = bySecret.get(declaration.secretEnv);
    if (!secret.groups.includes(declaration.group)) secret.groups.push(declaration.group);
    if (!secret.repositories.includes(declaration.repository)) {
      secret.repositories.push(declaration.repository);
    }
  }

  const all = [...bySecret.values()];
  const secrets = group ? narrowToGroup(all, named(group)) : all;

  // `gh` cannot read a secret's value back, so the report is the only place a collapse is visible.
  const warnings = secrets
    .filter((secret) => secret.repositories.length > 1)
    .map(
      (secret) =>
        `${secret.name} is written to ${secret.repositories.length} repositories. If they hold ` +
        'different segments today, this rotation collapses those prefixes into one and orphans ' +
        'whichever is not re-announced.'
    );

  return { secrets, warnings };
}

/** Every planned write, group-major: every repository for one secret before the next secret. */
const plannedWrites = (plan) =>
  plan.secrets.flatMap((secret) =>
    secret.repositories.map((repository) => ({
      secret: secret.name,
      repository,
      groups: secret.groups,
    }))
  );

const describeLanded = (landed) =>
  landed.length === 0
    ? 'No secret was written before this failure.'
    : `Already written, so these cohorts have moved:\n${landed
        .map((write) => `  - ${write.secret} -> ${write.repository}`)
        .join('\n')}`;

/** `testers/<group>/<segment>/<moduleId>/module.json`, via the publisher's own layout so it cannot drift. */
function testerPrefix(group, segment) {
  const { testerTargets } = deriveS3Layout({
    moduleId: '<moduleId>',
    channel: 'tester',
    version: '<version>',
    baseUrl: '',
    testerGroups: [group],
    testerSegment: segment,
  });
  return testerTargets[0].manifestKey;
}

/**
 * Report the plan and, under `--apply`, write it. One segment is generated per secret, never per
 * write: generating inside the repository loop would give each repository a different prefix and
 * split one cohort across two URLs, which every mapping-only assertion still calls correct.
 * @returns {Promise<{applied: boolean, writes: object[]}>} What was planned, or what landed.
 */
export async function runRotation({ plan, apply = false, deps = {} }) {
  const { runGh, newSegment: nextSegment = newSegment, log = console.log } = deps;
  const writes = plannedWrites(plan);

  log(apply ? 'Rotating tester path segments.' : 'DRY RUN — no secret will be written.');
  for (const secret of plan.secrets) {
    log(`  ${secret.name} -> ${secret.repositories.join(', ')}`);
    log(`    serves tester group(s): ${secret.groups.join(', ')}`);
  }
  for (const warning of plan.warnings) log(`  WARNING: ${warning}`);
  log(`${writes.length} repository write(s) across ${plan.secrets.length} secret(s).`);
  log(
    'Rotation deletes nothing and republishes nothing: every superseded prefix keeps serving its ' +
      'last manifest, so pair this with the announcement carrying the new URLs.'
  );

  if (!apply) {
    log('Nothing was written. Re-run with --apply to rotate.');
    return { applied: false, writes };
  }

  await assertGhIsReady(runGh);

  const landed = [];
  const prefixes = [];
  for (const secret of plan.secrets) {
    const segment = nextSegment();
    for (const repository of secret.repositories) {
      try {
        // Over stdin, never the argument list, which any process on the host can read.
        await runGh(['secret', 'set', secret.name, '--repo', repository], { input: segment });
      } catch (error) {
        throw new Error(
          `failed to write ${secret.name} to ${repository}: ${error.message}\n` +
            describeLanded(landed),
          { cause: error }
        );
      }
      landed.push({ secret: secret.name, repository, groups: secret.groups });
      log(`  wrote ${secret.name} -> ${repository}`);
    }
    for (const group of secret.groups) prefixes.push(`  ${group}: ${testerPrefix(group, segment)}`);
  }

  // `gh` cannot read a secret's value back, so this is the only record of where each cohort lives.
  log("New tester prefixes, beneath the bucket's base URL — announce these:");
  for (const prefix of prefixes) log(prefix);

  return { applied: true, writes: landed };
}

/** Refuse before the first write, so a missing credential cannot rotate one cohort and not the next. */
async function assertGhIsReady(runGh) {
  if (!runGh) throw new Error('--apply needs a `gh` runner');
  try {
    await runGh(['auth', 'status']);
  } catch (error) {
    throw new Error(
      `\`gh\` is absent or unauthenticated (${error.message}). Install the GitHub CLI and run ` +
        '`gh auth login` with access to both repositories before rotating.',
      { cause: error }
    );
  }
}

/** The real `gh`, invoked without a shell so no argument is re-interpreted. */
function ghRunner() {
  return (args, { input } = {}) =>
    new Promise((resolvePromise, rejectPromise) => {
      const child = execFile('gh', args, (error, stdout) =>
        error ? rejectPromise(error) : resolvePromise(stdout)
      );
      child.stdin.end(input ?? '');
    });
}

/** @returns {Promise<object|null>} The parsed config, or null when the path is not there. */
async function readJsonIfExists(path) {
  if (!path) return null;
  try {
    await access(path);
  } catch {
    return null;
  }
  return JSON.parse(await readFile(path, 'utf8'));
}

/** @returns {Promise<{applied: boolean, writes: object[]}|null>} The outcome, or null for `--help`. */
export async function main({ argv: args = argv.slice(2), deps = {} } = {}) {
  const options = parseArgs(args);
  const log = deps.log ?? console.log;
  if (options.help) {
    log(HELP);
    return null;
  }

  const fabricateConfig = await readJsonIfExists(options.config);
  if (!fabricateConfig) throw new Error(`could not read ${options.config}`);
  const premiumConfig = options.premium ? await readJsonIfExists(options.premiumConfig) : null;
  if (options.premium && !premiumConfig) {
    throw new Error(
      `could not read ${options.premiumConfig}. Check out the premium repository beside this one ` +
        'or pass --premium-config <path>: an apply needs both configs, because rotating one ' +
        'repository alone splits every shared cohort across two prefixes. --no-premium inspects ' +
        'this repository alone and is dry-run only.'
    );
  }

  const plan = planRotation({ fabricateConfig, premiumConfig, group: options.group });
  return runRotation({
    plan,
    apply: options.apply,
    deps: { runGh: deps.runGh ?? ghRunner(), newSegment: deps.newSegment, log },
  });
}

if (argv[1] && fileURLToPath(import.meta.url) === resolve(argv[1])) {
  try {
    await main();
  } catch (error) {
    console.error(`rotate-tester-secrets: ${error.message}`);
    exit(1);
  }
}
