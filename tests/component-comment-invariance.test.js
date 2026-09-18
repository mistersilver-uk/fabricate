/**
 * A COMMENT-ONLY EDIT TO `src/ui/svelte/components/` CHANGES NO EXECUTABLE CONSTRUCT (issue 1678).
 * Epic 1656 rewrites the headers of 37 components at once.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

// `prettier/index.mjs`, not `prettier`: `npm test` runs with `--conditions=browser`, which
// resolves the bare specifier to the standalone bundle — no `resolveConfig`, and every parser
// must be handed in explicitly. The Node entry is what `format:check` itself runs.
import { format, resolveConfig } from 'prettier/index.mjs';
import { parse } from 'svelte/compiler';

const COMPONENT_DIR = 'src/ui/svelte/components';
const repoRoot = resolve(import.meta.dirname, '..');

/** 52 components live here today; a walk that stopped recursing or filtering reads far below it. */
const CORPUS_FLOOR = 30;

/** Keys that carry position, formatting or comments rather than meaning. */
const DROPPED_KEYS = Object.freeze(
  new Set([
    'start',
    'end',
    'loc',
    'range',
    'raw',
    'trailing',
    'parent',
    'comments',
    'leadingComments',
    'trailingComments',
  ])
);

const parseComponent = (source) => parse(source, { modern: true });

/**
 * Every comment's `[from, to)` offsets, from three places because the compiler reports them three
 * ways: `ast.comments` holds the `<script>` comments, the fragment holds markup `Comment` nodes,
 * and the CSS parser models no comment at all, so the `<style>` block is matched textually inside
 * its own range.
 */
function commentRanges(source, ast) {
  const ranges = ast.comments.map((comment) => [comment.start, comment.end]);
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node.type === 'Comment') {
      ranges.push([node.start, node.end]);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'parent' || key === 'loc') continue;
      walk(value);
    }
  };
  walk(ast.fragment);
  if (ast.css) {
    const { start, end } = ast.css.content;
    for (const match of source.slice(start, end).matchAll(/\/\*[\s\S]*?\*\//g)) {
      ranges.push([start + match.index, start + match.index + match[0].length]);
    }
  }
  return ranges.sort((left, right) => left[0] - right[0]);
}

/** The source with 100% of its comments removed and nothing else touched. */
function stripComments(source) {
  const ranges = commentRanges(source, parseComponent(source));
  let out = '';
  let cursor = 0;
  for (const [from, to] of ranges) {
    if (from < cursor) continue;
    out += source.slice(cursor, from);
    cursor = to;
  }
  return out + source.slice(cursor);
}

/**
 * The AST with everything a comment edit or a reformat may legitimately move taken out: position
 * keys, comment nodes, whitespace-only text, the whitespace INSIDE surviving text, and the raw
 * `<style>` source string. Keys are emitted in sorted order so `JSON.stringify` is canonical.
 */
function project(node) {
  if (Array.isArray(node)) {
    return node
      .filter((child) => !(child?.type === 'Comment'))
      .filter((child) => !(child?.type === 'Text' && String(child.data ?? '').trim() === ''))
      .map((child) => project(child));
  }
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const key of Object.keys(node).sort()) {
    if (DROPPED_KEYS.has(key)) continue;
    if (node.type === 'StyleSheet' && key === 'content') {
      out[key] = { children: project(node[key].children ?? null) };
      continue;
    }
    const value = node[key];
    out[key] =
      node.type === 'Text' && key === 'data'
        ? String(value).replaceAll(/\s+/gu, ' ')
        : project(value);
  }
  return out;
}

const projectionOf = (source) => JSON.stringify(project(parseComponent(source)));

const prettierOptions = await resolveConfig(join(repoRoot, COMPONENT_DIR));
const reformat = (source) => format(source, { ...prettierOptions, parser: 'svelte' });

const components = readdirSync(join(repoRoot, COMPONENT_DIR))
  .filter((name) => name.endsWith('.svelte'))
  .map((name) => `${COMPONENT_DIR}/${name}`);

test('every component in the directory survives a 100% comment strip unchanged', async () => {
  assert.ok(
    components.length >= CORPUS_FLOOR,
    `only ${components.length} components found under ${COMPONENT_DIR}; retarget this walk`
  );

  const differs = [];
  for (const file of components) {
    const source = readFileSync(join(repoRoot, file), 'utf8');
    const stripped = stripComments(source);
    assert.ok(
      stripped.length < source.length,
      `${file} lost no bytes to the comment strip, so this file proves nothing about it`
    );
    if (projectionOf(stripped) !== projectionOf(source)) differs.push(file);
    else if (projectionOf(await reformat(stripped)) !== projectionOf(source)) differs.push(file);
  }

  assert.deepEqual(
    differs,
    [],
    'these components change an executable construct when their comments are removed and the ' +
      'result is reformatted, so a comment-only rewrite of them is not comment-only:\n  ' +
      differs.join('\n  ')
  );
});

/** A fixture the mutation table below perturbs. */
const FIXTURE = `<script>
  let {
    size = 34,
    tone = 'neutral',
    children = undefined,
    ...rest
  } = $props();

  const TONES = new Set(['secondary', 'subtle', 'muted']);
  const FALLBACK_TONE = 'secondary';
  const resolved = $derived(TONES.has(tone) ? tone : FALLBACK_TONE);
  const wide = $derived(size > 34);
</script>

<div class="fixture-root" class:is-wide={wide} data-tone={resolved} {...rest}>
  {@render children?.()}
</div>

<style>
  .fixture-root {
    height: 36px;
  }

  .fixture-root.is-wide {
    width: 100%;
  }
</style>
`;

/** Each entry replaces `from` with `to` exactly once; `''` is a deletion. */
const KILLED = Object.freeze([
  { what: 'a css declaration value', from: 'height: 36px', to: 'height: 40px' },
  { what: 'a css property name', from: 'height: 36px', to: 'min-height: 36px' },
  {
    what: 'a whole css rule',
    from: '\n\n  .fixture-root.is-wide {\n    width: 100%;\n  }',
    to: '',
  },
  { what: 'a JS literal', from: "FALLBACK_TONE = 'secondary'", to: "FALLBACK_TONE = 'quiet'" },
  { what: 'a Set member', from: "'subtle', 'muted'", to: "'subtle'" },
  { what: 'a condition', from: 'size > 34', to: 'size >= 34' },
  { what: 'a prop default', from: 'size = 34,', to: 'size = 38,' },
  { what: 'a markup class', from: 'class="fixture-root"', to: 'class="fixture-shell"' },
  { what: 'a class: directive', from: ' class:is-wide={wide}', to: '' },
  { what: 'the rest spread', from: ' {...rest}', to: '' },
  { what: 'the {@render} tag', from: '{@render children?.()}', to: '' },
]);

const SURVIVES = Object.freeze([
  { what: 'a blank line', from: '</script>', to: '\n</script>' },
  { what: 'a markup comment', from: '<div class', to: '<!-- a note -->\n<div class' },
  { what: 'a script comment', from: '  const TONES', to: '  // a note\n  const TONES' },
  { what: 'changed indentation', from: '  const TONES', to: '      const TONES' },
]);

/** Apply one substitution and prove it landed, so a pattern that matched nothing cannot pass. */
function mutate(entry) {
  const mutated = FIXTURE.replace(entry.from, entry.to);
  assert.notEqual(mutated, FIXTURE, `the "${entry.what}" mutation matched nothing in the fixture`);
  return mutated;
}

test('the projection kills every executable mutation of the fixture', () => {
  const survivors = KILLED.filter((entry) => projectionOf(mutate(entry)) === projectionOf(FIXTURE));
  assert.deepEqual(
    survivors.map((entry) => entry.what),
    [],
    'the projection cannot see these changes, so it would certify a rewrite that made one'
  );
});

test('the projection survives every comment-and-whitespace mutation of the fixture', () => {
  const killed = SURVIVES.filter((entry) => projectionOf(mutate(entry)) !== projectionOf(FIXTURE));
  assert.deepEqual(
    killed.map((entry) => entry.what),
    [],
    'the projection reads formatting as meaning, so it would red on an honest comment rewrite'
  );
});
