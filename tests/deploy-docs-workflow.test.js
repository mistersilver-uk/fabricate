// Source contract for .github/workflows/deploy-docs.yml (issue 1734): a pull request touching the
// docs builds the Jekyll site, strictly, and can never deploy it.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  children,
  entries,
  evaluate,
  key,
  parseJobs,
  section,
  unwrap,
} from './helpers/workflow-source.js';

const source = readFileSync(
  new URL('../.github/workflows/deploy-docs.yml', import.meta.url),
  'utf8'
);
const jobs = parseJobs(source);
const onSection = section(entries(source), 'on');

function triggerPaths(event) {
  const index = onSection.findIndex((entry) => entry.indent === 2 && key(entry.text) === event);
  assert.notEqual(index, -1, `deploy-docs.yml has no ${event} trigger`);
  const trigger = children(onSection, index);
  const pathsIndex = trigger.findIndex((entry) => key(entry.text) === 'paths');
  assert.notEqual(pathsIndex, -1, `the ${event} trigger is not scoped by paths`);
  return children(trigger, pathsIndex).map((entry) =>
    entry.text.replace(/^-\s+/, '').replaceAll(/^['"]|['"]$/g, '')
  );
}

const PULL_REQUEST = { github: { event_name: 'pull_request', ref: 'refs/pull/1/merge' } };
const PUSH_TO_MAIN = { github: { event_name: 'push', ref: 'refs/heads/main' } };

function runs(condition, context) {
  return condition === '' || Boolean(evaluate(unwrap(condition), context));
}

test('a pull request touching the docs or this workflow triggers the build', () => {
  const paths = triggerPaths('pull_request');
  assert.ok(paths.includes('docs/**'), 'the PR trigger must cover docs/**');
  assert.ok(
    paths.includes('.github/workflows/deploy-docs.yml'),
    'the PR trigger must cover itself'
  );
  assert.ok(!/pull_request_target/.test(source), 'pull_request_target would expose write tokens');
});

test('the build is strict about front matter on every trigger', () => {
  const build = jobs.build.steps.find((step) => /jekyll build/.test(step.run));
  assert.ok(build, 'the build job runs jekyll build');
  assert.match(build.run, /--strict_front_matter/);
  assert.equal(build.if, '', 'the build step must run on pull requests too');
});

test('a pull request never uploads or deploys the site', () => {
  const upload = jobs.build.steps.find((step) =>
    step.uses.startsWith('actions/upload-pages-artifact')
  );
  assert.ok(upload, 'the push build still uploads the Pages artifact');
  assert.equal(runs(upload.if, PULL_REQUEST), false, 'upload must be skipped on a PR');
  assert.equal(runs(upload.if, PUSH_TO_MAIN), true, 'upload must still run on a push to main');
  assert.equal(runs(jobs.deploy.if, PULL_REQUEST), false, 'deploy must be skipped on a PR');
  assert.equal(runs(jobs.deploy.if, PUSH_TO_MAIN), true, 'deploy must still run on a push to main');
});

test('the build job holds only read scope; write scope stays on the deploy job', () => {
  assert.deepEqual(jobs.build.permissions, { contents: 'read' });
  assert.equal(jobs.deploy.permissions.pages, 'write');
});
