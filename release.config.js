/**
 * Semantic Release configuration for Fabricate.
 *
 * Reads Conventional Commits and:
 *   - Determines version bump (major/minor/patch)
 *   - Updates CHANGELOG.md
 *   - Updates version in module.json
 *   - Creates a GitHub Release with the built module zip as an asset
 *
 * Triggered by pushing to `main` from the release.yml workflow.
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

export default {
  branches: [{ name: 'main', prerelease: 'rc', channel: 'next' }],

  plugins: [
    // 1. Analyse commits to determine version bump
    [
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
          { breaking: true, release: 'major' }
        ]
      }
    ],

    // 2. Generate release notes from Conventional Commits
    [
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
            { type: 'chore', section: 'Maintenance', hidden: true }
          ]
        }
      }
    ],

    // 3. Update CHANGELOG.md
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md',
        changelogTitle: '# Changelog\n\nAll notable changes to Fabricate will be documented in this file.\n\nThe format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).'
      }
    ],

    // 4. Build the module and create a GitHub Release with the zip asset
    [
      '@semantic-release/exec',
      {
        // Inject the new version into module.json, then build + zip
        prepareCmd: 'node scripts/release.js --version ${nextRelease.version}',
        publishCmd: 'echo "Release asset: dist/fabricate-v${nextRelease.version}.zip"'
      }
    ],

    // 5. Commit updated CHANGELOG.md back to main
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md'],
        message: 'chore(release): ${nextRelease.version} [skip ci]'
      }
    ],

    // 6. Create GitHub Release
    [
      '@semantic-release/github',
      {
        assets: [
          {
            path: 'dist/fabricate-v*.zip',
            label: 'Fabricate Module (zip)'
          },
          {
            path: 'dist/module.json',
            label: 'module.json (for Foundry installer URL)'
          }
        ],
        successComment: false,
        failComment: false
      }
    ]
  ]
};
