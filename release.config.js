/**
 * Semantic Release configuration for Fabricate.
 *
 * Reads Conventional Commits and:
 *   - Determines version bump (major/minor/patch)
 *   - Injects the version into the BUILT dist/module.json (never the tracked one)
 *   - On a release/hotfix line, creates a DRAFTED GitHub Release with the module zip
 *
 * Branch model (three entries, see `branches` below):
 *   - `main`           → `-beta.N` prereleases for the private beta channel.
 *                        NO GitHub release object is ever created here — that is
 *                        what keeps the private beta channel private.
 *   - `release`        → stable versions, drafted GitHub release (private early-access).
 *   - `+([0-9]).+([0-9]).x` → a hotfix line cut from a public tag; stable patch
 *                        versions, drafted GitHub release.
 *
 * NOTE: `'maintenance'` is semantic-release's own branch TYPE for the
 * `N.N.x` glob — it is NOT Fabricate's vocabulary. In this project that line is
 * always a *hotfix line* (a fix cut from a published public version).
 *
 * The plugin set is chosen per branch, resolved ONCE at the default-export site
 * from `GITHUB_REF_NAME` (never at module scope): `@semantic-release/github` is
 * on an allowlist and is omitted entirely on `main` and loaded on `release` and
 * a hotfix line with `draftRelease: true`. A drafted release is not served from
 * `/releases/latest/` and is not anonymously downloadable, so early-access stays
 * private until the public promotion un-drafts it. NO branch ever yields
 * `draftRelease: false`.
 *
 * Commit types that trigger a release:
 *   feat   → minor bump (new feature)
 *   fix    → patch bump (bug fix)
 *   perf   → patch bump (performance)
 *   BREAKING CHANGE footer → major bump
 *
 * Commit types that do NOT trigger a release:
 *   docs, style, refactor, test, build, ci, chore
 */

/**
 * Branch TYPES that (in addition to the `main` prerelease line) receive a
 * drafted `@semantic-release/github` release. `main` is deliberately absent so
 * its beta builds never create a public GitHub release object.
 */
const GITHUB_RELEASE_BRANCH_TYPES = new Set(['release', 'maintenance']);

/**
 * `draftRelease: true` is a privacy mechanism, not a convenience: a drafted
 * release is invisible and is not served from `/releases/latest/`. It is a
 * literal constant so no branch can ever produce `draftRelease: false`, which
 * would defeat the private early-access model.
 */
const DRAFT_RELEASE = true;

/**
 * A hotfix line is matched by this glob; its semantic-release branch TYPE is
 * `'maintenance'`. The regex in `classifyBranch` MUST stay in lock-step with
 * this glob — `'1.x'` matches NEITHER (a hotfix line always names two numeric
 * components), which is why `classifyBranch('1.x')` throws.
 */
const MAINTENANCE_BRANCH_GLOB = '+([0-9]).+([0-9]).x';
const MAINTENANCE_NAME_PATTERN = /^\d+\.\d+\.x$/;

/**
 * Map a git branch NAME to semantic-release's branch TYPE.
 *
 * Pure: it reads no environment and has no side effects, so the throw can be
 * pinned directly (the default export cannot be relied on to throw — it depends
 * on `GITHUB_REF_NAME`).
 *
 * @param {string} name - a branch name (e.g. `main`, `release`, `1.4.x`)
 * @returns {'main' | 'release' | 'maintenance'}
 * @throws {Error} for any name that is not `main`, `release`, or an `N.N.x` line
 */
export function classifyBranch(name) {
  if (name === 'main') return 'main';
  if (name === 'release') return 'release';
  if (MAINTENANCE_NAME_PATTERN.test(name)) return 'maintenance';
  throw new Error(
    `Unknown release branch: ${JSON.stringify(name)} (expected 'main', 'release', or an N.N.x hotfix line)`
  );
}

const commitAnalyzer = [
  // 1. Analyse commits to determine version bump
  '@semantic-release/commit-analyzer',
  {
    preset: 'conventionalcommits',
    releaseRules: [
      { type: 'feat', release: 'minor' },
      { type: 'fix', release: 'patch' },
      { type: 'perf', release: 'patch' },
      { type: 'revert', release: 'patch' },
      // All other types (docs, style, refactor, test, chore, ci, build)
      // do not trigger a release unless there is a BREAKING CHANGE footer.
      { breaking: true, release: 'major' },
    ],
  },
];

const releaseNotesGenerator = [
  // 2. Generate release notes from Conventional Commits
  '@semantic-release/release-notes-generator',
  {
    preset: 'conventionalcommits',
    presetConfig: {
      types: [
        { type: 'feat', section: 'Features' },
        { type: 'fix', section: 'Bug Fixes' },
        { type: 'perf', section: 'Performance Improvements' },
        { type: 'revert', section: 'Reverts' },
        { type: 'docs', section: 'Documentation', hidden: false },
        { type: 'refactor', section: 'Code Refactoring', hidden: true },
        { type: 'test', section: 'Tests', hidden: true },
        { type: 'chore', section: 'Maintenance', hidden: true },
      ],
    },
  },
];

const execPlugin = [
  '@semantic-release/exec',
  {
    // Inject the new version into the BUILT dist/module.json only (--dist-version),
    // so a release build never mutates the tracked module.json working tree.
    prepareCmd: 'node scripts/release.js --dist-version ${nextRelease.version}',
    publishCmd: 'echo "Release asset: dist/fabricate-v${nextRelease.version}.zip"',
    // Emit the computed version/tag to the workflow so downstream jobs read them
    // from $GITHUB_OUTPUT instead of diffing `git tag --points-at HEAD`, whose
    // "multiple new tags" hard-fail becomes reachable once a forward-port leaves
    // two tags on one commit.
    successCmd:
      'echo "next_version=${nextRelease.version}" >> "$GITHUB_OUTPUT" && echo "next_tag=${nextRelease.gitTag}" >> "$GITHUB_OUTPUT"',
  },
];

function githubPlugin() {
  return [
    // Create a DRAFTED GitHub Release (release + hotfix lines only)
    '@semantic-release/github',
    {
      draftRelease: DRAFT_RELEASE,
      assets: [
        {
          path: 'dist/fabricate-v*.zip',
          label: 'Fabricate Module (zip)',
        },
        {
          path: 'dist/module.json',
          label: 'module.json (for Foundry installer URL)',
        },
      ],
      successComment: false,
      failComment: false,
    },
  ];
}

/**
 * Build the plugin list for a branch type. The `@semantic-release/github` plugin
 * is allowlisted to the release and hotfix lines; `main` never gets it.
 *
 * @param {'main' | 'release' | 'maintenance'} branchType
 * @returns {Array}
 */
function pluginsFor(branchType) {
  const plugins = [commitAnalyzer, releaseNotesGenerator, execPlugin];
  if (GITHUB_RELEASE_BRANCH_TYPES.has(branchType)) {
    plugins.push(githubPlugin());
  }
  return plugins;
}

export default {
  branches: [MAINTENANCE_BRANCH_GLOB, 'release', { name: 'main', prerelease: 'beta' }],

  // Resolve the branch type ONCE, here at the default-export site. An unset
  // GITHUB_REF_NAME (local dev, or a run that does not set it) falls back to
  // `main` — the safe default, which omits the github plugin so nothing can
  // accidentally publish a public release object off a non-CI checkout.
  plugins: pluginsFor(classifyBranch(process.env.GITHUB_REF_NAME || 'main')),
};
