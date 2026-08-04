/**
 * Shared workflow-source primitives for the source-contract tests over `.github/workflows/**`.
 *
 * These walkers and the `if:`-expression tokenizer/evaluator were originally inlined in
 * `tests/ci-workflow-semantics.test.js`. `tests/forward-port-workflow.test.js` needs the same
 * primitives, and `sonar.cpd.exclusions` is inert under SonarCloud Automatic Analysis while
 * `tests/**` duplication counts against the new-code gate — so re-inlining them would fail the
 * quality gate on otherwise correct code. They live here once and both test files import them.
 *
 * This file is deliberately NOT a test file and is NOT collected: `npm test`'s glob lists the
 * top-level `tests/*.test.js` plus a fixed set of subdirectories, and `tests/helpers/` is not among
 * them.
 *
 * This is a pragmatic, indentation-driven reader, not a YAML parser. It exists so an assertion can
 * be made against workflow STRUCTURE (a step's `if:`, its `env:` map, its shell body) rather than
 * against a substring of the file, because a substring match passes for code that is wrong in the
 * exact ways these contracts are supposed to catch.
 *
 * ── KNOWN GAP IN `evaluate`: NO FUNCTION CALLS, NO NUMERIC LITERALS ─────────────────────────────
 * The expression grammar covers paths, single-quoted string literals, `!`, `==`, `!=`, `&&`, `||`
 * and parentheses. It does NOT implement the GitHub Actions FUNCTIONS — `always()`, `success()`,
 * `failure()`, `cancelled()`, `contains()`, `startsWith()`, `format()` — and it does NOT accept
 * numeric literals. Both cases THROW rather than mis-evaluating: a call tokenizes as a path
 * followed by unconsumed `(`/`)` tokens and trips the trailing-token assertion, and a number
 * matches no alternation branch and trips `unsupported workflow expression near:`.
 *
 * A consumer that needs to evaluate a job `if:` containing `always()` must substitute it first
 * (`raw.replaceAll('always()', "'x' == 'x'")` models its unconditional truth exactly). Do NOT fall
 * back to substring-matching the gate instead: `&&` -> `||` and `!=` -> `==` both survive every
 * substring check, and those are precisely the mutations these contracts exist to kill.
 */

import assert from 'node:assert/strict';

/**
 * Split a workflow into non-blank, non-comment lines carrying their indentation and source line.
 *
 * Comments are filtered because the structural readers below index sections by indentation, and a
 * comment at a mapping's own indent would otherwise be read as a key. (`runBody` deliberately reads
 * the raw source instead, because a `#` line inside a shell block is body content, not a comment.)
 *
 * @param {string} source The workflow file's contents.
 * @returns {{indent: number, text: string, line: number}[]} One entry per meaningful line.
 */
export function entries(source) {
  return source
    .split(/\r?\n/)
    .map((line, index) => ({
      indent: line.length - line.trimStart().length,
      text: line.trim(),
      line: index,
    }))
    .filter((entry) => entry.text && !entry.text.startsWith('#'));
}

/**
 * The mapping key of an entry's text, or `''` when it carries no `:`.
 * @param {string} text The trimmed line.
 * @returns {string} The key.
 */
export function key(text) {
  const separator = text.indexOf(':');
  return separator < 0 ? '' : text.slice(0, separator);
}

/**
 * The single-line scalar value of an entry's text.
 * @param {string} text The trimmed line.
 * @returns {string} The value, trimmed.
 */
export function value(text) {
  return text.slice(text.indexOf(':') + 1).trim();
}

/**
 * The entries nested under `all[parentIndex]`, i.e. every following entry indented deeper than it.
 * @param {{indent: number}[]} all The entry list.
 * @param {number} parentIndex The parent's index in that list.
 * @returns {{indent: number, text: string, line: number}[]} The nested entries.
 */
export function children(all, parentIndex) {
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

/**
 * The top-level section of a workflow, by name.
 * @param {{indent: number, text: string}[]} all The entry list for a whole workflow.
 * @param {string} name The section name (`on`, `jobs`, `concurrency`, ...).
 * @returns {{indent: number, text: string, line: number}[]} The section's nested entries.
 */
export function section(all, name) {
  const index = all.findIndex((entry) => entry.indent === 0 && key(entry.text) === name);
  assert.notEqual(index, -1, `missing ${name} section`);
  return children(all, index);
}

/**
 * The value of an entry, FOLDING a YAML block scalar when the entry opens one.
 *
 * `promote-to-public.yml` job 4's `if:` is a folded block spanning five lines; the single-line
 * `value()` reader returns only the block indicator for it. `>`/`>-` join with a space (folded),
 * `|`/`|-` join with a newline (literal).
 *
 * KNOWN GAP: an explicit indentation indicator (`|2`, `>-2`) is not recognised, so this returns the
 * literal indicator string rather than the block. Nothing in this repository uses that form; add it
 * here rather than working around it at a call site.
 *
 * @param {{indent: number, text: string}[]} all The entry list containing the entry.
 * @param {number} index The entry's index in that list.
 * @returns {string} The scalar value.
 */
export function foldedValue(all, index) {
  const inline = value(all[index].text);
  if (!/^[|>][+-]?$/.test(inline)) return inline;
  const lines = children(all, index).map((entry) => entry.text);
  return inline.startsWith('>') ? lines.join(' ') : lines.join('\n');
}

/**
 * The SHELL BODY of a `run:` at a given raw source line, read from the raw source by indentation.
 *
 * Handles `run: |`, `run: |-`, `run: >`-style block openers and the single-line `run: <command>`
 * form. Reading the raw source matters twice over: a `#` line inside the body is content rather than
 * a comment, and the `githubactions:S7630` pre-check must see the body EXACTLY as the shell does, so
 * that a legitimate `${{ ... }}` in the step's `with:`, `env:`, or `if:` is not mistaken for one in
 * a shell line.
 *
 * @param {string} source The workflow file's contents.
 * @param {number} line The zero-based raw line index of the `run:` key.
 * @returns {string} The shell body.
 */
export function runBody(source, line) {
  const lines = source.split(/\r?\n/);
  const raw = lines[line];
  const indent = raw.length - raw.trimStart().length;
  const text = raw.trim().replace(/^-\s+/, '');
  const inline = value(text);
  if (!/^[|>][+-]?$/.test(inline)) return inline;

  const body = [];
  for (let index = line + 1; index < lines.length; index += 1) {
    const candidate = lines[index];
    if (candidate.trim() === '') {
      body.push('');
      continue;
    }
    if (candidate.length - candidate.trimStart().length <= indent) break;
    body.push(candidate);
  }
  while (body.length > 0 && body[body.length - 1] === '') body.pop();
  return body.join('\n');
}

/**
 * Every same-indent key of a mapping block, as a plain object of folded scalar values.
 * @param {{indent: number, text: string}[]} list The mapping's entries.
 * @returns {Record<string, string>} The mapping.
 */
export function scalars(list) {
  const indent = list.length > 0 ? list[0].indent : 0;
  const mapping = {};
  for (let index = 0; index < list.length; index += 1) {
    if (list[index].indent !== indent) continue;
    const name = key(list[index].text);
    if (name) mapping[name] = foldedValue(list, index);
  }
  return mapping;
}

/**
 * The entries nested under a named key of a mapping block, or `[]` when it has no such key.
 * @param {{indent: number, text: string}[]} list The mapping's entries.
 * @param {string} name The key.
 * @returns {{indent: number, text: string, line: number}[]} The nested entries.
 */
export function nestedEntries(list, name) {
  const indent = list.length > 0 ? list[0].indent : 0;
  const index = list.findIndex((entry) => entry.indent === indent && key(entry.text) === name);
  return index === -1 ? [] : children(list, index);
}

/**
 * Build one step from its entry group.
 * @param {{indent: number, text: string, line: number}[]} group The step's entries.
 * @param {string} source The workflow file's contents.
 * @returns {object} The step.
 */
function buildStep(group, source) {
  const indent = group[0].indent;
  const props = scalars(group);
  const runIndex = group.findIndex((entry) => entry.indent === indent && key(entry.text) === 'run');
  return {
    ...props,
    name: props.name ?? '',
    id: props.id ?? '',
    if: props.if ?? '',
    uses: props.uses ?? '',
    env: scalars(nestedEntries(group, 'env')),
    with: scalars(nestedEntries(group, 'with')),
    run: runIndex === -1 ? '' : runBody(source, group[runIndex].line),
  };
}

/**
 * Split a `steps:` block into one entry group per step, normalising each list item's `- ` prefix
 * away so the item's first key sits at the same indent as its siblings.
 * @param {{indent: number, text: string, line: number}[]} body The `steps:` block's entries.
 * @param {string} source The workflow file's contents.
 * @returns {object[]} The steps, in declaration order.
 */
function buildSteps(body, source) {
  if (body.length === 0) return [];
  const itemIndent = body[0].indent;
  const groups = [];
  let current = null;
  for (const entry of body) {
    if (entry.indent === itemIndent && entry.text.startsWith('- ')) {
      current = [{ indent: itemIndent + 2, text: entry.text.slice(2).trim(), line: entry.line }];
      groups.push(current);
      continue;
    }
    if (current) current.push(entry);
  }
  return groups.map((group) => buildStep(group, source));
}

/**
 * Every job of a workflow, indexed by name, with its `if:`, its `with:`/`secrets:`/`permissions:`
 * mappings, and its ordered `steps:`.
 *
 * Jobs are indexed BY INDENTATION (the indent-2 keys of the `jobs:` section), which is what makes
 * the comment filtering in `entries` load-bearing: a workflow carrying an indent-2 comment with a
 * `:` in it would otherwise acquire a spurious job.
 *
 * @param {string} source The workflow file's contents.
 * @returns {Record<string, object>} The jobs.
 */
export function parseJobs(source) {
  const all = entries(source);
  const jobEntries = section(all, 'jobs');
  const jobs = {};
  for (let index = 0; index < jobEntries.length; index += 1) {
    const entry = jobEntries[index];
    if (entry.indent !== 2) continue;
    const body = children(jobEntries, index);
    const props = scalars(body);
    const stepsBody = nestedEntries(body, 'steps');
    jobs[key(entry.text)] = {
      ...props,
      if: props.if ?? '',
      uses: props.uses ?? '',
      needs: props.needs ?? '',
      with: scalars(nestedEntries(body, 'with')),
      secrets: scalars(nestedEntries(body, 'secrets')),
      permissions: scalars(nestedEntries(body, 'permissions')),
      concurrency: scalars(nestedEntries(body, 'concurrency')),
      steps: buildSteps(stepsBody, source),
    };
  }
  return jobs;
}

/**
 * Strip a surrounding `${{ ... }}` wrapper from a workflow expression, if present.
 * @param {string} expression The raw `if:` value.
 * @returns {string} The bare expression.
 */
export function unwrap(expression) {
  const match = expression.trim().match(/^\$\{\{(.*)\}\}$/s);
  return (match ? match[1] : expression).trim();
}

/**
 * Tokenize a GitHub Actions expression.
 *
 * `!=` MUST precede the bare `!` in the alternation, or `a != b` tokenizes as a unary `!` followed
 * by an unmatched `=`.
 *
 * @param {string} expression The bare expression.
 * @returns {{type: string, value: string}[]} The tokens.
 */
export function tokenize(expression) {
  const result = [];
  let source = expression.trim();
  while (source) {
    const match = source.match(
      /^(?:\s+|(&&|\|\||==|!=|!|\(|\))|('(?:[^'\\]|\\.)*')|([A-Za-z_][A-Za-z0-9_.-]*))/
    );
    assert.ok(match, `unsupported workflow expression near: ${source}`);
    source = source.slice(match[0].length);
    if (match[1]) result.push({ type: match[1], value: match[1] });
    if (match[2]) result.push({ type: 'literal', value: match[2].slice(1, -1) });
    if (match[3]) result.push({ type: 'path', value: match[3] });
  }
  return result;
}

/**
 * Evaluate a GitHub Actions expression against a context object.
 *
 * Supports paths, single-quoted literals, `!`, `==`, `!=`, `&&`, `||` and parentheses ONLY. A
 * function call (`always()`, `success()`, `contains()`, ...) or a numeric literal THROWS — see the
 * file header for why that is deliberate and how to substitute `always()`.
 *
 * @param {string} expression The bare expression.
 * @param {object} context The evaluation context (`inputs`, `steps`, `github`, ...).
 * @returns {unknown} The result.
 */
export function evaluate(expression, context) {
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
  const unary = () => (take('!') ? !unary() : primary());
  const equality = () => {
    let current = unary();
    while (tokens[position]?.type === '==' || tokens[position]?.type === '!=') {
      const operator = tokens[position++].type;
      const right = unary();
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
