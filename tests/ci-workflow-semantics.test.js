import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function entries(source) {
  return source
    .split(/\r?\n/)
    .map((line) => ({
      indent: line.length - line.trimStart().length,
      text: line.trim(),
    }))
    .filter((entry) => entry.text && !entry.text.startsWith('#'));
}

function key(text) {
  const separator = text.indexOf(':');
  return separator < 0 ? '' : text.slice(0, separator);
}

function value(text) {
  return text.slice(text.indexOf(':') + 1).trim();
}

function children(all, parentIndex) {
  const parent = all[parentIndex];
  let end = all.length;
  for (let index = parentIndex + 1; index < all.length; index += 1) {
    if (all[index].indent <= parent.indent) {
      end = index;
      break;
    }
  }
  return all.slice(parentIndex + 1, end);
}

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

  const jobEntries = section('jobs');
  const jobs = {};
  for (let index = 0; index < jobEntries.length; index += 1) {
    const entry = jobEntries[index];
    if (entry.indent !== 2) continue;
    const condition = children(jobEntries, index).find(
      (item) => item.indent === 4 && key(item.text) === 'if'
    );
    jobs[key(entry.text)] = { if: condition ? value(condition.text) : '' };
  }
  return { types, group, jobs };
}

function tokenize(expression) {
  const result = [];
  let source = expression.trim();
  while (source) {
    const match = source.match(
      /^(?:\s+|(&&|\|\||==|!=|\(|\))|('(?:[^'\\]|\\.)*')|([A-Za-z_][A-Za-z0-9_.]*))/
    );
    assert.ok(match, `unsupported workflow expression near: ${source}`);
    source = source.slice(match[0].length);
    if (match[1]) result.push({ type: match[1], value: match[1] });
    if (match[2]) result.push({ type: 'literal', value: match[2].slice(1, -1) });
    if (match[3]) result.push({ type: 'path', value: match[3] });
  }
  return result;
}

function evaluate(expression, context) {
  const tokens = tokenize(expression);
  let position = 0;
  const take = (type) => tokens[position]?.type === type && tokens[position++];
  const primary = () => {
    if (take('(')) {
      const nested = or();
      assert.ok(take(')'), 'missing closing parenthesis');
      return nested;
    }
    const token = tokens[position++];
    assert.ok(token, 'missing expression value');
    if (token.type === 'literal') return token.value;
    assert.equal(token.type, 'path');
    return token.value.split('.').reduce((current, segment) => current?.[segment], context);
  };
  const equality = () => {
    let current = primary();
    while (tokens[position]?.type === '==' || tokens[position]?.type === '!=') {
      const operator = tokens[position++].type;
      const right = primary();
      current = operator === '==' ? current === right : current !== right;
    }
    return current;
  };
  const and = () => {
    let current = equality();
    while (take('&&')) {
      const right = equality();
      current = current && right;
    }
    return current;
  };
  const or = () => {
    let current = and();
    while (take('||')) {
      const right = and();
      current = current || right;
    }
    return current;
  };
  const result = or();
  assert.equal(position, tokens.length, 'unexpected trailing workflow expression tokens');
  return result;
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
