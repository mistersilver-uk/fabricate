import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// The workflow-source walkers and the `if:` tokenizer/evaluator this file used to inline now live
// in tests/helpers/workflow-source.js, shared with tests/forward-port-workflow.test.js (issue
// #1001). The extraction is behaviour-preserving, and the proof is that the `test(...)` body below
// is byte-identical to its pre-extraction form while `npm test` stays green: `parseJobs` still
// indexes jobs by indentation, so a walker that stopped filtering comments would give ci.yml a
// spurious job key and fail the `deepEqual` assertions loudly, and every `if:` in ci.yml is
// single-line while its only block scalars are `run:` bodies this file never reads.
import { children, entries, evaluate, key, parseJobs, value } from './helpers/workflow-source.js';

function parseWorkflow(source) {
  const all = entries(source);
  const section = (name) => {
    const index = all.findIndex((entry) => entry.indent === 0 && key(entry.text) === name);
    assert.notEqual(index, -1, `missing ${name} section`);
    return children(all, index);
  };

  const on = section('on');
  const pullRequestIndex = on.findIndex(
    (entry) => entry.indent === 2 && key(entry.text) === 'pull_request'
  );
  const pullRequest = children(on, pullRequestIndex);
  const types = value(pullRequest.find((entry) => key(entry.text) === 'types').text)
    .slice(1, -1)
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''));

  const concurrency = section('concurrency');
  const group = value(concurrency.find((entry) => key(entry.text) === 'group').text);

  return { types, group, jobs: parseJobs(source) };
}

function contextFor(action) {
  return {
    github: {
      event_name: 'pull_request',
      event: { action, pull_request: { number: 874 } },
      sha: 'abc1234',
    },
  };
}

function jobsFor(workflow, action) {
  const context = contextFor(action);
  return Object.entries(workflow.jobs)
    .filter(([, job]) => !job.if || evaluate(job.if, context))
    .map(([name]) => name)
    .sort();
}

function renderGroup(template, action) {
  const context = contextFor(action);
  return template.replace(/\$\{\{\s*(.*?)\s*\}\}/g, (_, expression) =>
    String(evaluate(expression, context))
  );
}

test('CI semantically isolates edited metadata runs and fully gates ready_for_review', () => {
  const workflow = parseWorkflow(readFileSync('.github/workflows/ci.yml', 'utf8'));

  assert.ok(workflow.types.includes('edited'));
  assert.ok(workflow.types.includes('ready_for_review'));
  assert.deepEqual(jobsFor(workflow, 'edited'), ['check-screenshots', 'lint-commits']);
  assert.deepEqual(jobsFor(workflow, 'ready_for_review'), [
    'check-screenshots',
    'lint',
    'lint-commits',
    'unit-tests',
    'validate-bindings',
  ]);

  const edited = renderGroup(workflow.group, 'edited');
  const ready = renderGroup(workflow.group, 'ready_for_review');
  assert.notEqual(edited, ready);
  assert.match(edited, /metadata/);
  assert.match(ready, /code/);
});
